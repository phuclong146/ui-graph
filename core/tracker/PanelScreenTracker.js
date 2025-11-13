import path from "path";
import {GoogleGenAI, Modality} from '@google/genai';
import { ENV } from "../config/env.js";
import { TrackingLogger } from "../data/logger.js";
import { AsyncQueue } from "./AsyncQueue.js";
import { initBrowsers } from "./browser-init.js";
import { setupNavigationListener, setupTracking } from "./browser-injector.js";
import { saveResults } from "./tracking.js";
import { detectScreenByGemini } from "./gemini-handler.js";
import { ClickManager } from "../data/ClickManager.js";
import { DataItemManager } from "../data/DataItemManager.js";
import { ParentPanelManager } from "../data/ParentPanelManager.js";
import { StepManager } from "../data/StepManager.js";
import { PanelLogManager } from "../data/PanelLogManager.js";

export class PanelScreenTracker {
    constructor() {
        this.urlTracking = null;
        this.nameTracking = null;
        this.browser = null;
        this.page = null;
        this.queueBrowser = null;
        this.queuePage = null;
        this.screenQueue = new AsyncQueue();
        this.wss = null;
        this._navigationListenerSetup = false;
        this.geminiClient = null;
        this.geminiSession = null;
        this.geminiMessageQueue = null;
        this.geminiAsking = false;
        this.currenPage = null;
        this.previousPage = null;
        this.logger = new TrackingLogger();
        this.sessionFolder = null;
        this.panelLogManager = null;
        this.selectedPanelId = null;
        this.panelRecorder = null;
        this.isRecordingPanel = false;
        this.recordingPanelId = null;
        this.panelRecordFolder = null;
        this.panelRecordingStartTime = null;
        this.clickManager = null;
        this.dataItemManager = null;
        this.parentPanelManager = null;
        this.stepManager = null;
    }
    
    async init({ startUrl = "about:blank" } = {}) {
        await initBrowsers(this, startUrl);

        console.log('DEBUG ENV.GEMINI_USE_REST:', ENV.GEMINI_USE_REST, typeof ENV.GEMINI_USE_REST);
        
        const useRest = ENV.GEMINI_USE_REST === 'true' || ENV.GEMINI_USE_REST === true;
        
        if (useRest) {
            console.log('🔵 Gemini REST API mode enabled');
        } else {
            this.geminiClient = new GoogleGenAI({
                vertexai: false,
                apiKey: ENV.GEMINI_API_KEY,
            });
            this.geminiMessageQueue = new AsyncQueue();
            this.geminiSession = await this.geminiClient.live.connect({
                model: ENV.GEMINI_MODEL,
                callbacks: {
                    onopen: () => {
                        console.debug('Gemini WebSocket connected');
                    },
                    onmessage: (message) => {
                        this.geminiMessageQueue.put(message);
                    },
                    onerror: (e) => {
                        console.debug('Gemini Error:', e.message);
                    },
                    onclose: (e) => {
                        console.debug('Gemini Close:', e.reason);
                        this.geminiMessageQueue.clear();
                    },
                },
                config: {responseModalities: [Modality.TEXT]},
            });
            console.log('🟣 Gemini WebSocket mode enabled');
        }

        detectScreenByGemini(this);

        console.log("✅ Tracker initialized");
    }

    async _broadcast(data) {
        if (!this.wss) return;
        const msg = JSON.stringify(data);
        this.wss.clients.forEach((c) => {
            if (c.readyState === 1) c.send(msg);
        });
    }

    async saveResults() {
        return await saveResults(this);
    }

    async loadSession(sessionFolder) {
        try {
            console.log(`Loading session from: ${sessionFolder}`);
            
            const { promises: fsp } = await import('fs');
            const path = (await import('path')).default;
            
            const infoPath = path.join(sessionFolder, 'info.json');
            const infoContent = await fsp.readFile(infoPath, 'utf8');
            const info = JSON.parse(infoContent);
            
            this.sessionFolder = sessionFolder;
            this.urlTracking = info.website;
            this.myAiToolCode = info.toolCode;
            
            this.logger.sessionFolder = sessionFolder;
            
            const newTimestamp = Date.now();
            const timestamps = info.timestamps || [];
            timestamps.push(newTimestamp);
            
            await fsp.writeFile(infoPath, JSON.stringify({
                toolCode: info.toolCode,
                website: info.website,
                timestamps: timestamps
            }, null, 2), 'utf8');
            
            this.panelLogManager = new PanelLogManager(this.sessionFolder);
            
            this.clickManager = new ClickManager(this.sessionFolder);
            await this.clickManager.init();
            
            this.dataItemManager = new DataItemManager(this.sessionFolder);
            await this.dataItemManager.init();
            
            this.parentPanelManager = new ParentPanelManager(this.sessionFolder);
            await this.parentPanelManager.init();
            
            this.stepManager = new StepManager(this.sessionFolder);
            await this.stepManager.init();
            await this.stepManager.cleanupInvalidSteps();

            if (!this._navigationListenerSetup) {
                await setupNavigationListener(this);
                this._navigationListenerSetup = true;
            }

            await this.page.goto(info.website, { waitUntil: 'networkidle2', timeout: 60000 });
            this.currenPage = this.page.url();
            await setupTracking(this);

            const items = await this.dataItemManager.getAllItems();
            const panels = items.filter(item => item.item_category === 'PANEL');
            
            if (panels.length === 0) {
                console.log('📝 No panels found, creating root panel...');
                const rootPanelId = await this.dataItemManager.createPanel('After Login Panel', null);
                await this.parentPanelManager.createPanelEntry(rootPanelId);
                this.selectedPanelId = rootPanelId;
            } else {
                const rootPanel = panels[0];
                this.selectedPanelId = rootPanel.item_id;
            }

            await this._broadcast({ type: 'tree_update', data: await this.panelLogManager.buildTreeStructure() });
            
            console.log(`✅ Loaded session: ${info.toolCode} (Click 🔍 Detect Actions to start detection)`);
        } catch (error) {
            console.error('Load session error:', error);
            throw error;
        }
    }

    async startTracking(url, toolCode) {
        try {
            console.log(`Starting tracking on: ${url}`);
            
            this.urlTracking = url;
            this.myAiToolCode = toolCode;
            
            const trackingTimestamp = Date.now();
            this.sessionFolder = await this.logger.initLogFile(trackingTimestamp, toolCode, url);
            
            this.panelLogManager = new PanelLogManager(this.sessionFolder);
            
            this.clickManager = new ClickManager(this.sessionFolder);
            await this.clickManager.init();
            
            this.dataItemManager = new DataItemManager(this.sessionFolder);
            await this.dataItemManager.init();
            
            this.parentPanelManager = new ParentPanelManager(this.sessionFolder);
            await this.parentPanelManager.init();
            
            this.stepManager = new StepManager(this.sessionFolder);
            await this.stepManager.init();
            
            console.log(`✅ Validated tracking permission for website: ${url}`);

            if (!this._navigationListenerSetup) {
                await setupNavigationListener(this);
                this._navigationListenerSetup = true;
            }

            await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            this.currenPage = this.page.url();
            await setupTracking(this);

            if (!this.dataItemManager) throw new Error('DataItemManager not initialized');
            if (!this.parentPanelManager) throw new Error('ParentPanelManager not initialized');
            if (!this.panelLogManager) throw new Error('PanelLogManager not initialized');
            
            const rootPanelId = await this.dataItemManager.createPanel('After Login Panel', null);
            await this.parentPanelManager.createPanelEntry(rootPanelId);
            this.selectedPanelId = rootPanelId;
            await this._broadcast({ type: 'tree_update', data: await this.panelLogManager.buildTreeStructure() });
            
            console.log(`✅ Started tracking on: ${url} (Click 🔍 Detect Actions to start detection)`);
        } catch (error) {
            console.error('Tracking error:', error);
            throw error;
        }
    }

    async startPanelRecording(panelId) {
        try {
            const enable = ENV.RECORD_PANEL === 'true' || ENV.RECORD_PANEL === true;
            if (!enable) {
                return;
            }
            if (this.isRecordingPanel && this.recordingPanelId !== panelId) {
                await this.cancelPanelRecording();
            }
            
            if (!this.panelRecordFolder) {
                const { promises: fsp } = await import('fs');
                this.panelRecordFolder = path.join(this.sessionFolder, 'panel_record');
                await fsp.mkdir(this.panelRecordFolder, { recursive: true });
            }
            
            const { PuppeteerScreenRecorder } = await import('puppeteer-screen-recorder');
            
            const videoOptions = {
                followNewTab: false,
                fps: 1,
                videoFrame: {
                    width: 640,
                    height: 480,
                },
                followCursor: true,
                highlightStyle: 'highlight',
            };
            
            this.panelRecorder = new PuppeteerScreenRecorder(this.page, videoOptions);
            const panelVideoPath = path.join(this.panelRecordFolder, `${panelId}.mp4`);
            
            await this.panelRecorder.start(panelVideoPath);
            this.isRecordingPanel = true;
            this.recordingPanelId = panelId;
            this.panelRecordingStartTime = Date.now();
            console.log(`🎬 Start recording user action for this panel: ${panelId}`);
        } catch (err) {
            console.error('Failed to start panel recording:', err);
            this.isRecordingPanel = false;
            this.recordingPanelId = null;
        }
    }
    
    async stopPanelRecording() {
        if (!this.isRecordingPanel || !this.panelRecorder || !this.recordingPanelId) {
            return null;
        }
        
        try {
            const sessionStart = this.panelRecordingStartTime;
            const sessionEnd = Date.now();
            const panelId = this.recordingPanelId;
            
            await this.panelRecorder.stop();
            const videoPath = path.join(this.panelRecordFolder, `${panelId}.mp4`);
            
            this.panelRecorder = null;
            this.isRecordingPanel = false;
            this.recordingPanelId = null;
            this.panelRecordingStartTime = null;
            
            console.log(`✅ Record user action for this panel done! ${panelId}`);
            return { panelId, videoPath, sessionStart, sessionEnd };
        } catch (err) {
            console.error('Failed to stop panel recording:', err);
            this.panelRecorder = null;
            this.isRecordingPanel = false;
            this.recordingPanelId = null;
            this.panelRecordingStartTime = null;
            return null;
        }
    }
    
    async cancelPanelRecording() {
        if (!this.isRecordingPanel || !this.panelRecorder) {
            return;
        }
        
        try {
            await this.panelRecorder.stop();
            const panelId = this.recordingPanelId;
            const videoPath = path.join(this.panelRecordFolder, `${panelId}.mp4`);
            
            const { promises: fsp } = await import('fs');
            try {
                await fsp.unlink(videoPath);
                console.log(`🗑️ Cancelled panel recording: ${panelId}`);
            } catch (err) {
            }
        } catch (err) {
            console.error('Failed to cancel panel recording:', err);
        } finally {
            this.panelRecorder = null;
            this.isRecordingPanel = false;
            this.recordingPanelId = null;
        }
    }

    async close() {
        try {
            if (this.panelRecorder) await this.cancelPanelRecording();
        } catch (err) {
            console.error('❌ Failed to cancel panel recording:', err);
        }
        try {
            if (this.browser) await this.browser.close();
        } catch (err) {
            console.error('❌ Failed to close browser:', err);
        }
        try {
            if (this.queueBrowser) await this.queueBrowser.close();
        } catch (err) {
            console.error('❌ Failed to close queue browser:', err);
        }
        try {
            if (this.wss) this.wss.close();
        } catch (err) {
            console.error('❌ Failed to close WebSocket:', err);
        }
        try {
            if (this.geminiSession) this.geminiSession.close();
        } catch (err) {
            console.error('❌ Failed to close Gemini session:', err);
        }
        console.log("🛑 Tracker closed.");
        process.exit(0);
    }
}

