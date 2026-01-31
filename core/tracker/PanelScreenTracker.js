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
import { ValidationManager } from "../data/ValidationManager.js";
import { initDbPool } from "../data/db-connection.js";

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
        this.panelRecordingParts = []; // Track video parts when switching tabs
        this.recordingOriginalPage = null; // Store original page before switching recording to new tab
        this.clickManager = null;
        this.dataItemManager = null;
        this.parentPanelManager = null;
        this.stepManager = null;
        this.validationManager = null;
        this.newlyOpenedTabs = []; // Track newly opened tabs
        this.originalPage = null; // Store original page before switching to new tab
        this.frozenScreenshot = null; // Store frozen screenshot for capturing dropdowns/popups
        this.frozenScreenshotMetadata = null; // Store metadata (dimensions, scroll position) of frozen screenshot
    }
    
    async init({ startUrl = "about:blank" } = {}) {
        await initDbPool();
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

    async _getAccountInfo() {
        try {
            const { promises: fsp } = await import('fs');
            const pathModule = (await import('path')).default;
            const { fileURLToPath } = await import('url');
            
            const __filename = fileURLToPath(import.meta.url);
            const projectRoot = pathModule.dirname(pathModule.dirname(pathModule.dirname(__filename)));
            const accountPath = pathModule.join(projectRoot, 'account.json');
            
            try {
                const content = await fsp.readFile(accountPath, 'utf8');
                const accountData = JSON.parse(content);
                
                if (accountData) {
                    // Generate collaborator_code if missing (for backward compatibility)
                    if (!accountData.collaborator_code && accountData.device_id) {
                        accountData.collaborator_code = `COLLAB_${accountData.device_id.toUpperCase()}`;
                        // Update account.json with collaborator_code
                        await fsp.writeFile(accountPath, JSON.stringify(accountData, null, 2), 'utf8');
                        console.log(`✅ Generated and saved collaborator_code: ${accountData.collaborator_code}`);
                    }
                    console.log(`✅ Loaded account info: ${accountData.name || 'No name'}, role: ${accountData.role || 'No role'}, collaborator_code: ${accountData.collaborator_code || 'N/A'}`);
                    return accountData;
                }
            } catch (readErr) {
                console.log('📝 No existing account.json, will prompt for new account');
            }
            
            // Generate new device info if no account exists
            const { randomUUID } = await import('crypto');
            const os = await import('os');
            
            const deviceId = randomUUID();
            const collaboratorCode = `COLLAB_${deviceId.toUpperCase()}`;
            
            const newAccount = {
                device_id: deviceId,
                collaborator_code: collaboratorCode,
                device_info: {
                    platform: os.platform(),
                    arch: os.arch(),
                    hostname: os.hostname(),
                    cpus: os.cpus().length,
                    totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)) + ' GB',
                    osType: os.type(),
                    osRelease: os.release(),
                    username: os.userInfo().username,
                    networkInterfaces: Object.entries(os.networkInterfaces())
                        .map(([name, interfaces]) => ({
                            name,
                            addresses: interfaces
                                .filter(iface => !iface.internal)
                                .map(iface => ({ family: iface.family, address: iface.address, mac: iface.mac }))
                        }))
                        .filter(iface => iface.addresses.length > 0)
                },
                name: null,
                role: null
            };
            
            return newAccount;
        } catch (err) {
            console.error('Failed to get account info:', err);
            return null;
        }
    }

    async saveResults() {
        return await saveResults(this);
    }

    /**
     * Load session data (managers, DB, tree) without using tracking browser. Broadcasts tree_update.
     * Call loadSessionAttachPage() after initTrackingBrowser to complete.
     */
    async loadSessionData(sessionFolder) {
        try {
            console.log(`Loading session data from: ${sessionFolder}`);
            
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
            
            // Preserve existing role or default to 'DRAW'
            const role = info.role || 'DRAW';
            const currentSessionId = timestamps.length > 0 ? timestamps[0] : null;
            
            // Check for active session conflict if role is DRAW
            if (role === 'DRAW' && currentSessionId) {
                try {
                    const { checkActiveSession, getActiveSessionInfo } = await import('../data/session-db.js');
                    const activeSession = await checkActiveSession(info.toolCode);
                    if (activeSession) {
                        // Check if it's the same session - convert both to string for comparison
                        const activeSessionId = String(activeSession.session_id || '');
                        const currentSessionIdStr = String(currentSessionId || '');
                        console.log(`🔍 [Session Check] Comparing session IDs - Active: ${activeSessionId}, Current: ${currentSessionIdStr}`);
                        
                        if (activeSessionId !== currentSessionIdStr) {
                            console.log('⚠️ Different active session found for ai_tool:', info.toolCode);
                            const activeSessionInfo = await getActiveSessionInfo(info.toolCode);
                            if (activeSessionInfo) {
                                await this._broadcast({
                                    type: 'show_session_conflict',
                                    sessionInfo: activeSessionInfo
                                });
                                throw new Error('Cannot open session: ai_tool is already being worked on by another user');
                            }
                        } else {
                            console.log('✅ Same session, allowing to open');
                        }
                    }
                } catch (err) {
                    if (err.message && err.message.includes('Cannot open session')) {
                        throw err; // Re-throw conflict error
                    }
                    console.error('❌ Failed to check active session:', err);
                    // Continue if check fails (don't block session opening on DB error)
                }
            }
            
            const updatedInfo = {
                toolCode: info.toolCode,
                website: info.website,
                timestamps: timestamps,
                role: role
            };
            
            await fsp.writeFile(infoPath, JSON.stringify(updatedInfo, null, 2), 'utf8');
            
            // Upsert session to DB
            try {
                const account = await this._getAccountInfo();
                const { upsertSessionToDb } = await import('../data/session-db.js');
                await upsertSessionToDb(updatedInfo, account);
            } catch (err) {
                console.error('Failed to upsert session to DB in loadSession:', err);
            }
            
            // Update bug info and load uigraph_validation from database if role is DRAW
            if (role === 'DRAW') {
                try {
                     const { DatabaseLoader } = await import('../data/DatabaseLoader.js');
                     const loader = new DatabaseLoader(this.sessionFolder, info.toolCode);
                     await loader.updateBugInfoInDoingItems();
                     // Load only uigraph_validation in upsert mode
                     await loader.loadFromDatabase('DRAW');
                     console.log(`✅ Loaded uigraph_validation from database for DRAW role`);
                } catch (err) {
                    console.error('❌ Failed to update bug info or load validation:', err);
                }
            }

            // Load full data from database if role is VALIDATE or ADMIN
            if (role === 'VALIDATE' || role === 'ADMIN') {
                try {
                    await this._broadcast({ 
                        type: 'show_loading', 
                        message: 'Đang tải dữ liệu từ database và tạo các file JSONL. Vui lòng đợi...' 
                    });
                    
                    const { DatabaseLoader } = await import('../data/DatabaseLoader.js');
                    const loader = new DatabaseLoader(this.sessionFolder, info.toolCode);
                    await loader.loadFromDatabase(role);
                    console.log(`✅ Loaded full data from database for ${role} role`);
                    
                    await this._broadcast({ type: 'hide_loading' });
                } catch (err) {
                    console.error('❌ Failed to load data from database:', err);
                    await this._broadcast({ type: 'hide_loading' });
                    // Continue with existing session data if DB load fails
                }
            }
            
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

            console.log(`[VALIDATION] Initializing ValidationManager in loadSession - sessionFolder: ${this.sessionFolder}, myAiToolCode: ${this.myAiToolCode}`);
            if (!this.myAiToolCode) {
                console.error(`[VALIDATION] ERROR: myAiToolCode is null/undefined when initializing ValidationManager in loadSession!`);
            }
            this.validationManager = new ValidationManager(this.sessionFolder, this.myAiToolCode);
            console.log(`[VALIDATION] ValidationManager initialized in loadSession: ${!!this.validationManager}, myAiToolCode: ${this.validationManager?.myAiToolCode}`);

            // Broadcast panel log so queue browser can show it before tracking browser is open
            await this._broadcast({ type: 'tree_update', data: await this.panelLogManager.buildTreeStructure() });

        } catch (error) {
            console.error('Load session data error:', error);
            throw error;
        }
    }

    /** Full load: loadSessionData + loadSessionAttachPage. Requires tracker.browser to exist. */
    async loadSession(sessionFolder) {
        await this.loadSessionData(sessionFolder);
        await this.loadSessionAttachPage();
    }

    /**
     * Attach tracking page to session: goto URL, setupTracking, set selectedPanelId, broadcast tree_update.
     * Requires tracker.browser and this.page to exist (call after initTrackingBrowser).
     */
    async loadSessionAttachPage() {
        try {
            if (!this.sessionFolder) {
                throw new Error('loadSessionAttachPage: no session loaded (call loadSessionData first)');
            }
            const { promises: fsp } = await import('fs');
            const path = (await import('path')).default;
            const infoPath = path.join(this.sessionFolder, 'info.json');
            const infoContent = await fsp.readFile(infoPath, 'utf8');
            const info = JSON.parse(infoContent);

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
            console.error('Load session attach page error:', error);
            throw error;
        }
    }

    async reloadSessionAfterRollback() {
        try {
            if (!this.sessionFolder) {
                console.warn('⚠️ No session folder to reload');
                return;
            }

            console.log(`Reloading session after rollback from: ${this.sessionFolder}`);

            // Reinitialize all managers with current session folder
            const { PanelLogManager } = await import('../data/PanelLogManager.js');
            const { ClickManager } = await import('../data/ClickManager.js');
            const { DataItemManager } = await import('../data/DataItemManager.js');
            const { ParentPanelManager } = await import('../data/ParentPanelManager.js');
            const { StepManager } = await import('../data/StepManager.js');

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

            // Reset checkpoint manager to reload from new data
            if (this.checkpointManager) {
                await this.checkpointManager.close();
                this.checkpointManager = null;
            }

            // Reload selected panel
            const items = await this.dataItemManager.getAllItems();
            const panels = items.filter(item => item.item_category === 'PANEL');
            
            if (panels.length > 0) {
                const rootPanel = panels[0];
                this.selectedPanelId = rootPanel.item_id;
            }

            // Broadcast tree update
            await this._broadcast({ 
                type: 'tree_update', 
                data: await this.panelLogManager.buildTreeStructure() 
            });

            // Broadcast panel selected to refresh UI
            if (this.selectedPanelId) {
                await this._broadcast({
                    type: 'panel_selected',
                    panel_id: this.selectedPanelId
                });
            }

            console.log('✅ Session reloaded after rollback');
        } catch (error) {
            console.error('Reload session after rollback error:', error);
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
            
            // Read account.role to check if we need to load data from database
            const { promises: fsp } = await import('fs');
            const path = (await import('path')).default;
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(path.dirname(path.dirname(__filename)));
            
            let accountRole = 'DRAW';
            try {
                const accountPath = path.join(__dirname, 'account.json');
                const accountContent = await fsp.readFile(accountPath, 'utf8');
                const accountData = JSON.parse(accountContent);
                if (accountData && accountData.role) {
                    accountRole = accountData.role;
                }
            } catch (err) {
                console.log('⚠️ Could not read account.json, using default role: DRAW');
            }
            
            // Check for active session conflict if role is DRAW
            if (accountRole === 'DRAW') {
                try {
                    const { checkActiveSession, getActiveSessionInfo } = await import('../data/session-db.js');
                    const activeSession = await checkActiveSession(toolCode);
                    if (activeSession) {
                        console.log('⚠️ Active session found for ai_tool:', toolCode);
                        const activeSessionInfo = await getActiveSessionInfo(toolCode);
                        if (activeSessionInfo) {
                            await this._broadcast({
                                type: 'show_session_conflict',
                                sessionInfo: activeSessionInfo
                            });
                            throw new Error('Cannot create session: ai_tool is already being worked on by another user');
                        }
                    }
                } catch (err) {
                    if (err.message && err.message.includes('Cannot create session')) {
                        throw err; // Re-throw conflict error
                    }
                    console.error('❌ Failed to check active session:', err);
                    // Continue if check fails (don't block session creation on DB error)
                }
            }
            
            // Upsert session to DB
            try {
                const account = await this._getAccountInfo();
                const info = {
                    toolCode: toolCode,
                    website: url,
                    timestamps: [trackingTimestamp],
                    role: accountRole
                };
                const { upsertSessionToDb } = await import('../data/session-db.js');
                await upsertSessionToDb(info, account);
            } catch (err) {
                console.error('Failed to upsert session to DB in startTracking:', err);
            }
            
            // Load data from database if role is VALIDATE or ADMIN (same source as VALIDATE)
            if (accountRole === 'VALIDATE' || accountRole === 'ADMIN') {
                try {
                    await this._broadcast({ 
                        type: 'show_loading', 
                        message: 'Đang tải dữ liệu từ database và tạo các file JSONL. Vui lòng đợi...' 
                    });
                    
                    const { DatabaseLoader } = await import('../data/DatabaseLoader.js');
                    const loader = new DatabaseLoader(this.sessionFolder, toolCode);
                    await loader.loadFromDatabase();
                    console.log(`✅ Loaded data from database for ${accountRole} role`);
                    
                    await this._broadcast({ type: 'hide_loading' });
                } catch (err) {
                    console.error('❌ Failed to load data from database:', err);
                    await this._broadcast({ type: 'hide_loading' });
                    // Continue with session creation even if DB load fails
                }
            }
            
            this.panelLogManager = new PanelLogManager(this.sessionFolder);
            
            this.clickManager = new ClickManager(this.sessionFolder);
            await this.clickManager.init();
            
            this.dataItemManager = new DataItemManager(this.sessionFolder);
            await this.dataItemManager.init();
            
            this.parentPanelManager = new ParentPanelManager(this.sessionFolder);
            await this.parentPanelManager.init();
            
            this.stepManager = new StepManager(this.sessionFolder);
            await this.stepManager.init();
            
            console.log(`[VALIDATION] Initializing ValidationManager - sessionFolder: ${this.sessionFolder}, myAiToolCode: ${this.myAiToolCode}`);
            if (!this.myAiToolCode) {
                console.error(`[VALIDATION] ERROR: myAiToolCode is null/undefined when initializing ValidationManager!`);
            }
            this.validationManager = new ValidationManager(this.sessionFolder, this.myAiToolCode);
            console.log(`[VALIDATION] ValidationManager initialized: ${!!this.validationManager}`);
            
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
                console.log(`[RECORD] ⏸️  Recording disabled (RECORD_PANEL=${ENV.RECORD_PANEL})`);
                return;
            }
            
            console.log(`[RECORD] 🔍 Checking recording status for panel: ${panelId}`);
            console.log(`[RECORD]    Current recording: ${this.isRecordingPanel ? 'YES' : 'NO'}`);
            console.log(`[RECORD]    Current recording ID: ${this.recordingPanelId || 'NONE'}`);
            
            if (this.isRecordingPanel && this.recordingPanelId !== panelId) {
                console.log(`[RECORD] ⚠️  Another recording in progress (${this.recordingPanelId}), cancelling...`);
                await this.cancelPanelRecording();
            }
            
            if (!this.panelRecordFolder) {
                const { promises: fsp } = await import('fs');
                this.panelRecordFolder = path.join(this.sessionFolder, 'panel_record');
                await fsp.mkdir(this.panelRecordFolder, { recursive: true });
                console.log(`[RECORD] 📁 Created recording folder: ${this.panelRecordFolder}`);
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
            
            console.log(`[RECORD] ⚙️  Video options:`, JSON.stringify(videoOptions, null, 2));
            
            this.panelRecorder = new PuppeteerScreenRecorder(this.page, videoOptions);
            const panelVideoPath = path.join(this.panelRecordFolder, `${panelId}.mp4`);
            
            console.log(`[RECORD] 🎬 Starting recording...`);
            console.log(`[RECORD]    Panel ID: ${panelId}`);
            console.log(`[RECORD]    Video path: ${panelVideoPath}`);
            
            await this.panelRecorder.start(panelVideoPath);
            this.isRecordingPanel = true;
            this.recordingPanelId = panelId;
            this.panelRecordingStartTime = Date.now();
            this.panelRecordingParts = []; // Reset parts array for new recording
            this.recordingOriginalPage = null; // Reset original page for new recording
            
            // Broadcast recording status to hide toasts on tracking browser
            await this._broadcast({ type: 'recording_status', isRecording: true });
            
            const startTimeStr = new Date(this.panelRecordingStartTime).toISOString();
            console.log(`[RECORD] ✅ Recording started successfully`);
            console.log(`[RECORD]    Start time: ${startTimeStr} (${this.panelRecordingStartTime})`);
            console.log(`[RECORD]    Status: isRecordingPanel=${this.isRecordingPanel}, recordingPanelId=${this.recordingPanelId}`);
        } catch (err) {
            console.error(`[RECORD] ❌ Failed to start panel recording for ${panelId}:`, err);
            console.error(`[RECORD]    Error details:`, err.message, err.stack);
            this.isRecordingPanel = false;
            this.recordingPanelId = null;
        }
    }
    
    async stopPanelRecording() {
        console.log(`[RECORD] 🛑 Stop recording requested`);
        console.log(`[RECORD]    Status check: isRecordingPanel=${this.isRecordingPanel}, hasRecorder=${!!this.panelRecorder}, recordingPanelId=${this.recordingPanelId || 'NONE'}`);
        
        if (!this.isRecordingPanel || !this.panelRecorder || !this.recordingPanelId) {
            console.log(`[RECORD] ⏭️  No active recording to stop`);
            return null;
        }
        
        try {
            const sessionStart = this.panelRecordingStartTime;
            const sessionEnd = Date.now();
            const panelId = this.recordingPanelId;
            const duration = sessionEnd - sessionStart;
            const durationSeconds = (duration / 1000).toFixed(2);
            
            console.log(`[RECORD] 📊 Recording info:`);
            console.log(`[RECORD]    Panel ID: ${panelId}`);
            console.log(`[RECORD]    Start time: ${new Date(sessionStart).toISOString()} (${sessionStart})`);
            console.log(`[RECORD]    End time: ${new Date(sessionEnd).toISOString()} (${sessionEnd})`);
            console.log(`[RECORD]    Duration: ${durationSeconds}s (${duration}ms)`);
            
            console.log(`[RECORD] ⏹️  Stopping recorder...`);
            await this.panelRecorder.stop();
            
            const videoPath = path.join(this.panelRecordFolder, `${panelId}.mp4`);
            console.log(`[RECORD]    Video path: ${videoPath}`);
            
            const { promises: fsp } = await import('fs');
            
            // Check if there are multiple parts to merge (from tab switching)
            if (this.panelRecordingParts && this.panelRecordingParts.length > 0) {
                console.log(`[RECORD] 🔗 Merging ${this.panelRecordingParts.length + 1} video parts...`);
                
                try {
                    // Add current video as the last part
                    const lastPartPath = path.join(this.panelRecordFolder, `${panelId}_part${this.panelRecordingParts.length + 1}.mp4`);
                    await fsp.rename(videoPath, lastPartPath);
                    this.panelRecordingParts.push(lastPartPath);
                    
                    // Merge all parts using ffmpeg
                    const { mergeVideoParts } = await import('../media/video-generator.js');
                    await mergeVideoParts(this.panelRecordingParts, videoPath);
                    console.log(`[RECORD] ✅ Merged ${this.panelRecordingParts.length} video parts into: ${videoPath}`);
                    
                    // Clean up part files
                    for (const partPath of this.panelRecordingParts) {
                        try {
                            await fsp.unlink(partPath);
                        } catch (unlinkErr) {
                            console.warn(`[RECORD] ⚠️  Could not delete part file ${partPath}: ${unlinkErr.message}`);
                        }
                    }
                } catch (mergeErr) {
                    console.error(`[RECORD] ❌ Failed to merge video parts:`, mergeErr);
                    // If merge fails, rename the last part back to original name
                    try {
                        const lastPartPath = this.panelRecordingParts[this.panelRecordingParts.length - 1];
                        await fsp.rename(lastPartPath, videoPath);
                    } catch (renameErr) {
                        console.error(`[RECORD] ❌ Failed to restore video:`, renameErr);
                    }
                }
                
                // Reset parts array
                this.panelRecordingParts = [];
            }
            
            // Check if file exists
            try {
                const stats = await fsp.stat(videoPath);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                console.log(`[RECORD]    File size: ${fileSizeMB} MB (${stats.size} bytes)`);
            } catch (statErr) {
                console.warn(`[RECORD] ⚠️  Could not get file stats: ${statErr.message}`);
            }
            
            // Restore original page if we switched to a new tab during recording
            if (this.recordingOriginalPage) {
                console.log(`[RECORD] 🔄 Restoring tracker.page to original page...`);
                this.page = this.recordingOriginalPage;
                this.recordingOriginalPage = null;
                console.log(`[RECORD] ✅ Restored to original page`);
            }
            
            this.panelRecorder = null;
            this.isRecordingPanel = false;
            this.recordingPanelId = null;
            this.panelRecordingStartTime = null;
            
            // Broadcast recording status to re-enable toasts on tracking browser
            await this._broadcast({ type: 'recording_status', isRecording: false });
            
            console.log(`[RECORD] ✅ Recording stopped successfully`);
            console.log(`[RECORD]    Status reset: isRecordingPanel=${this.isRecordingPanel}`);
            
            return { panelId, videoPath, sessionStart, sessionEnd };
        } catch (err) {
            console.error(`[RECORD] ❌ Failed to stop panel recording:`, err);
            console.error(`[RECORD]    Error details:`, err.message, err.stack);
            
            // Restore original page even on error
            if (this.recordingOriginalPage) {
                console.log(`[RECORD] 🔄 Restoring tracker.page to original page (error recovery)...`);
                this.page = this.recordingOriginalPage;
                this.recordingOriginalPage = null;
            }
            
            this.panelRecorder = null;
            this.isRecordingPanel = false;
            this.recordingPanelId = null;
            this.panelRecordingStartTime = null;
            this.panelRecordingParts = [];
            
            // Broadcast recording status to re-enable toasts on tracking browser (error case)
            await this._broadcast({ type: 'recording_status', isRecording: false });
            
            return null;
        }
    }
    
    async cancelPanelRecording() {
        console.log(`[RECORD] 🚫 Cancel recording requested`);
        console.log(`[RECORD]    Status check: isRecordingPanel=${this.isRecordingPanel}, hasRecorder=${!!this.panelRecorder}`);
        
        if (!this.isRecordingPanel || !this.panelRecorder) {
            console.log(`[RECORD] ⏭️  No active recording to cancel`);
            return;
        }
        
        try {
            const panelId = this.recordingPanelId;
            const sessionStart = this.panelRecordingStartTime;
            const cancelTime = Date.now();
            const duration = sessionStart ? cancelTime - sessionStart : 0;
            const durationSeconds = (duration / 1000).toFixed(2);
            
            console.log(`[RECORD] 📊 Cancelling recording:`);
            console.log(`[RECORD]    Panel ID: ${panelId || 'NONE'}`);
            if (sessionStart) {
                console.log(`[RECORD]    Was recording for: ${durationSeconds}s (${duration}ms)`);
            }
            
            console.log(`[RECORD] ⏹️  Stopping recorder...`);
            await this.panelRecorder.stop();
            
            const videoPath = path.join(this.panelRecordFolder, `${panelId}.mp4`);
            console.log(`[RECORD]    Video path to delete: ${videoPath}`);
            
            const { promises: fsp } = await import('fs');
            try {
                await fsp.unlink(videoPath);
                console.log(`[RECORD] 🗑️  Video file deleted successfully`);
            } catch (unlinkErr) {
                console.warn(`[RECORD] ⚠️  Could not delete video file: ${unlinkErr.message}`);
            }
            
            // Also delete any part files from tab switching
            if (this.panelRecordingParts && this.panelRecordingParts.length > 0) {
                console.log(`[RECORD] 🗑️  Deleting ${this.panelRecordingParts.length} part files...`);
                for (const partPath of this.panelRecordingParts) {
                    try {
                        await fsp.unlink(partPath);
                        console.log(`[RECORD]    Deleted: ${partPath}`);
                    } catch (unlinkErr) {
                        console.warn(`[RECORD] ⚠️  Could not delete part file ${partPath}: ${unlinkErr.message}`);
                    }
                }
            }
            
            console.log(`[RECORD] ✅ Recording cancelled successfully`);
        } catch (err) {
            console.error(`[RECORD] ❌ Failed to cancel panel recording:`, err);
            console.error(`[RECORD]    Error details:`, err.message, err.stack);
        } finally {
            // Restore original page if we switched to a new tab during recording
            if (this.recordingOriginalPage) {
                console.log(`[RECORD] 🔄 Restoring tracker.page to original page...`);
                this.page = this.recordingOriginalPage;
                this.recordingOriginalPage = null;
                console.log(`[RECORD] ✅ Restored to original page`);
            }
            
            this.panelRecorder = null;
            this.isRecordingPanel = false;
            this.recordingPanelId = null;
            this.panelRecordingParts = [];
            
            // Broadcast recording status to re-enable toasts on tracking browser
            await this._broadcast({ type: 'recording_status', isRecording: false });
            
            console.log(`[RECORD]    Status reset: isRecordingPanel=${this.isRecordingPanel}`);
        }
    }

    /**
     * Switch recording to a new page (e.g., when a new tab is opened)
     * This stops the current recording, saves it as a temp file, and starts a new recording on the new page.
     * The videos will be merged when stopPanelRecording is called.
     * @param {Object} newPage - The new Puppeteer page to record
     */
    async switchRecordingToPage(newPage) {
        console.log(`[RECORD] 🔄 Switch recording to new page requested`);
        console.log(`[RECORD]    Status check: isRecordingPanel=${this.isRecordingPanel}, hasRecorder=${!!this.panelRecorder}, recordingPanelId=${this.recordingPanelId || 'NONE'}`);
        
        if (!this.isRecordingPanel || !this.panelRecorder || !this.recordingPanelId) {
            console.log(`[RECORD] ⏭️  No active recording to switch`);
            return false;
        }
        
        if (!newPage) {
            console.log(`[RECORD] ⚠️  No new page provided`);
            return false;
        }
        
        try {
            const panelId = this.recordingPanelId;
            const sessionStart = this.panelRecordingStartTime;
            const switchTime = Date.now();
            const duration = switchTime - sessionStart;
            const durationSeconds = (duration / 1000).toFixed(2);
            
            console.log(`[RECORD] 📊 Switching recording:`);
            console.log(`[RECORD]    Panel ID: ${panelId}`);
            console.log(`[RECORD]    Recording duration so far: ${durationSeconds}s (${duration}ms)`);
            
            // Stop current recording
            console.log(`[RECORD] ⏹️  Stopping current recorder...`);
            await this.panelRecorder.stop();
            
            // Rename current video to temp (will merge later)
            const { promises: fsp } = await import('fs');
            const currentVideoPath = path.join(this.panelRecordFolder, `${panelId}.mp4`);
            const tempVideoPath = path.join(this.panelRecordFolder, `${panelId}_part1.mp4`);
            
            try {
                await fsp.rename(currentVideoPath, tempVideoPath);
                console.log(`[RECORD] 📁 Renamed video to temp: ${tempVideoPath}`);
                
                // Track part videos for merging later
                if (!this.panelRecordingParts) {
                    this.panelRecordingParts = [];
                }
                this.panelRecordingParts.push(tempVideoPath);
            } catch (renameErr) {
                console.warn(`[RECORD] ⚠️  Could not rename video file: ${renameErr.message}`);
            }
            
            // Save original page before switching (only if not already saved)
            if (!this.recordingOriginalPage) {
                this.recordingOriginalPage = this.page;
                console.log(`[RECORD] 📄 Saved original page for later restoration`);
            }
            
            // Update tracker.page to new page
            this.page = newPage;
            console.log(`[RECORD] 📄 Updated tracker.page to new page`);
            
            // Start new recording on new page
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
            
            this.panelRecorder = new PuppeteerScreenRecorder(newPage, videoOptions);
            const newVideoPath = path.join(this.panelRecordFolder, `${panelId}.mp4`);
            
            console.log(`[RECORD] 🎬 Starting new recording on new page...`);
            console.log(`[RECORD]    Video path: ${newVideoPath}`);
            
            await this.panelRecorder.start(newVideoPath);
            
            console.log(`[RECORD] ✅ Recording switched to new page successfully`);
            return true;
        } catch (err) {
            console.error(`[RECORD] ❌ Failed to switch recording to new page:`, err);
            console.error(`[RECORD]    Error details:`, err.message, err.stack);
            return false;
        }
    }

    /**
     * Freeze the current screenshot for later use when drawing panel.
     * This allows capturing dropdowns/popups before focus is lost.
     * @returns {Object} - Object containing success status and metadata
     */
    async freezeScreenshot() {
        try {
            if (!this.page || this.page.isClosed()) {
                console.log('❄️ Cannot freeze screenshot - page is not available');
                return { success: false, error: 'Page not available' };
            }

            console.log('❄️ Freezing current screenshot...');

            // Hide cursor highlight and any tracking overlays before capture
            await this.page.evaluate(() => {
                // Hide cursor highlight (yellow circle) - try multiple selectors
                const cursorSelectors = [
                    '#cursor-highlight',
                    '.cursor-highlight', 
                    '[data-cursor-highlight]',
                    '#puppeteer-cursor',
                    '.puppeteer-cursor',
                    '#ghost-cursor',
                    '.ghost-cursor'
                ];
                cursorSelectors.forEach(sel => {
                    const el = document.querySelector(sel);
                    if (el) el.style.display = 'none';
                });
                
                // Find and hide any fixed/absolute positioned yellow circles (cursor highlight)
                document.querySelectorAll('div, span').forEach(el => {
                    const style = window.getComputedStyle(el);
                    const isFixed = style.position === 'fixed' || style.position === 'absolute';
                    const isYellow = style.backgroundColor.includes('255, 255, 0') || 
                                     style.backgroundColor.includes('rgb(255, 255') ||
                                     style.borderColor?.includes('255, 255, 0') ||
                                     style.borderColor?.includes('yellow');
                    const isCircle = style.borderRadius === '50%' || parseInt(style.borderRadius) > 20;
                    const isSmall = el.offsetWidth < 100 && el.offsetHeight < 100;
                    
                    if (isFixed && (isYellow || isCircle) && isSmall) {
                        el.dataset.__hiddenByFreeze = 'true';
                        el.style.display = 'none';
                    }
                });
                
                // Hide any tracking toast
                const toast = document.getElementById('__tracking_toast');
                if (toast) toast.style.display = 'none';
                
                // Add style to hide cursor
                const style = document.createElement('style');
                style.id = '__freeze_screenshot_style';
                style.textContent = '* { cursor: none !important; }';
                document.head.appendChild(style);
            });

            // Capture scroll position
            const scrollPosition = await this.page.evaluate(() => ({
                x: window.scrollX || window.pageXOffset,
                y: window.scrollY || window.pageYOffset
            }));

            // Capture full-page scrolling screenshot (skipViewportRestore=true to get metadata object)
            const { captureScreenshot } = await import('../media/screenshot.js');
            const result = await captureScreenshot(this.page, "base64", true, true);
            
            // Restore viewport immediately after capture
            if (result.restoreViewport) {
                await result.restoreViewport();
            }
            
            // Restore cursor and hidden elements after capture
            await this.page.evaluate(() => {
                // Restore cursor highlight elements
                const cursorSelectors = [
                    '#cursor-highlight',
                    '.cursor-highlight', 
                    '[data-cursor-highlight]',
                    '#puppeteer-cursor',
                    '.puppeteer-cursor',
                    '#ghost-cursor',
                    '.ghost-cursor'
                ];
                cursorSelectors.forEach(sel => {
                    const el = document.querySelector(sel);
                    if (el) el.style.display = '';
                });
                
                // Restore elements hidden by freeze
                document.querySelectorAll('[data-__hiddenByFreeze="true"]').forEach(el => {
                    el.style.display = '';
                    delete el.dataset.__hiddenByFreeze;
                });
                
                // Restore tracking toast
                const toast = document.getElementById('__tracking_toast');
                if (toast) toast.style.display = '';
                
                // Remove temporary style
                const style = document.getElementById('__freeze_screenshot_style');
                if (style) style.remove();
            });
            
            this.frozenScreenshot = result.screenshot;
            this.frozenScreenshotMetadata = {
                imageWidth: result.imageWidth,
                imageHeight: result.imageHeight,
                scrollPosition,
                timestamp: Date.now()
            };

            console.log(`❄️ Screenshot frozen successfully: ${result.imageWidth}x${result.imageHeight}`);
            
            // Broadcast to show visual feedback
            await this._broadcast({ 
                type: 'show_toast', 
                message: '❄️ Screenshot frozen! Now click Draw Panel to use it.' 
            });

            return { 
                success: true, 
                imageWidth: result.imageWidth, 
                imageHeight: result.imageHeight 
            };
        } catch (err) {
            console.error('❄️ Failed to freeze screenshot:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Clear the frozen screenshot
     */
    clearFrozenScreenshot() {
        if (this.frozenScreenshot) {
            console.log('❄️ Frozen screenshot cleared');
            this.frozenScreenshot = null;
            this.frozenScreenshotMetadata = null;
        }
    }

    /**
     * Check if there is a frozen screenshot available
     * @returns {boolean}
     */
    hasFrozenScreenshot() {
        return !!this.frozenScreenshot;
    }

    /**
     * Safely close browser with error handling for Windows EPERM issues
     */
    async _safeCloseBrowser(browser, browserName = 'browser') {
        if (!browser) return;
        
        try {
            // Try to disconnect first to gracefully close connections
            if (browser.disconnect && typeof browser.disconnect === 'function') {
                browser.disconnect();
            }
            
            // Add a small delay to let processes finish
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Close the browser
            await browser.close();
            
            // Additional delay after close to let cleanup finish
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
            // EPERM/EBUSY on Windows are common when cleaning up Puppeteer temp profile
            const isHarmlessOnWindows = err.code === 'EPERM' ||
                                    err.code === 'EBUSY' ||
                                    err.errno === 1 ||
                                    (err.message && (err.message.includes('Permission denied') || err.message.includes('EPERM') || err.message.includes('EBUSY') || err.message.includes('resource busy or locked')));
            if (isHarmlessOnWindows) {
                console.warn(`⚠️ Warning when closing ${browserName} (harmless on Windows):`, err.message);
            } else {
                console.error(`❌ Failed to close ${browserName}:`, err.message || err);
            }
        }
    }

    async close() {
        try {
            if (this.panelRecorder) await this.cancelPanelRecording();
        } catch (err) {
            console.error('❌ Failed to cancel panel recording:', err);
        }
        
        // Clean up pollers before closing browsers
        if (this._keyboardPoller) {
            clearInterval(this._keyboardPoller);
            this._keyboardPoller = null;
        }
        if (this._clickPoller) {
            clearInterval(this._clickPoller);
            this._clickPoller = null;
        }
        
        // Small delay to let pollers finish their current iteration
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // ADMIN/VALIDATE: không mở tracking browser → không đóng browser để tránh EBUSY (queue browser temp profile lock trên Windows)
        let accountRole = 'DRAW';
        try {
            const accountInfo = await this._getAccountInfo();
            accountRole = accountInfo?.role || 'DRAW';
        } catch (_) {}
        const isAdminOrValidate = accountRole === 'ADMIN' || accountRole === 'VALIDATE';
        
        if (!isAdminOrValidate) {
            // DRAW: đóng cả tracking browser và queue browser
            await this._safeCloseBrowser(this.browser, 'tracking browser');
            await this._safeCloseBrowser(this.queueBrowser, 'queue browser');
        }
        // else: ADMIN/VALIDATE chỉ có queue browser, bỏ qua đóng để tránh EBUSY; process.exit(0) sẽ kết thúc tiến trình
        
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

        try {
            const { closeDbPool } = await import('../data/db-connection.js');
            await closeDbPool();
        } catch (err) {
            console.error('❌ Failed to close DB pool:', err);
        }

        console.log("🛑 Tracker closed.");
        process.exit(0);
    }
}

