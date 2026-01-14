import { connect } from "puppeteer-real-browser";
import puppeteer from "puppeteer";
import { WebSocketServer } from "ws";
import { getScreenSize } from "../utils/utils.js";
import { fetchWebsiteList } from "../media/uploader.js";
import { injectWebsiteSelector } from "../../ui/injectWebsiteSelector.js";
import { ENV } from "../config/env.js";
import { QUEUE_BROWSER_HTML } from "./queue-browser-html.js";
import { createQueuePageHandlers } from "./queue-page-handlers.js";
import { promises as fsp } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// import { PuppeteerBlocker } from "@cliqz/adblocker-puppeteer";
// import fetch from "node-fetch";
import { join, dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to ensure Chrome is installed for Puppeteer
async function ensureChromeInstalled() {
    try {
        // Try to get the executable path - this will throw if Chrome is not installed
        const executablePath = puppeteer.executablePath();
        console.log(`✅ Chrome found at: ${executablePath}`);
        return executablePath;
    } catch (error) {
        console.log("⚠️ Chrome not found in Puppeteer cache, installing...");
        console.log("💡 Please wait while Chrome is being downloaded...");
        try {
            // Use child_process to run npx command
            const { execSync } = await import('child_process');
            console.log("📥 Installing Chrome via @puppeteer/browsers...");
            execSync('npx @puppeteer/browsers install chrome@latest', {
                stdio: 'inherit',
                cwd: process.cwd()
            });
            console.log("✅ Chrome installed successfully!");
            return puppeteer.executablePath();
        } catch (installError) {
            console.error("❌ Failed to install Chrome automatically");
            console.error("💡 Please run manually: npx @puppeteer/browsers install chrome@latest");
            throw new Error("Could not install Chrome. Please run: npx @puppeteer/browsers install chrome@latest");
        }
    }
}

// Helper function to check if Chrome path exists
async function checkChromePath(chromePath) {
    if (!chromePath) return null;
    try {
        await fsp.access(chromePath);
        return chromePath;
    } catch {
        return null;
    }
}

export async function initBrowsers(tracker, startUrl) {
    tracker.urlTracking = startUrl;

    tracker.wss = new WebSocketServer({ port: 8081 });
    tracker.wss.on("connection", () => console.log("📡 QueueScreen connected"));
    const { width, height } = await getScreenSize();
    const trackingWidth = Math.floor(width * 0.7);
    const queueWidth = Math.floor(width * 0.3);

    console.log(`🖥️ Screen: ${width}x${height}`);
    console.log(`📐 Queue browser: ${width}x${height} at (0, 0) - Maximized`);
    console.log(`📐 Tracking browser: ${trackingWidth}x${height} at (0, 0)`);

    // Initialize Queue Browser FIRST
    console.log("🚀 Launching Queue Browser...");
    const queueChromePath = await ensureChromeInstalled();
    
    try {
        tracker.queueBrowser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            executablePath: queueChromePath,
            args: [
                `--window-size=${width},${height}`,
                `--window-position=0,0`,
                '--disable-font-subpixel-positioning',
                '--disable-features=FontAccess',
                '--font-render-hinting=none',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-software-rasterizer'
            ]
        });
    } catch (queueError) {
        // If launch fails, try without explicit executablePath
        console.log("⚠️ Retrying queue browser launch without explicit path...");
        tracker.queueBrowser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
                `--window-size=${width},${height}`,
                `--window-position=0,0`,
                '--disable-font-subpixel-positioning',
                '--disable-features=FontAccess',
                '--font-render-hinting=none',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-software-rasterizer'
            ]
        });
    }
    const queuePages = await tracker.queueBrowser.pages();
    tracker.queuePage = queuePages[0];
    await tracker.queuePage.setJavaScriptEnabled(true);
    await tracker.queuePage.setContent(QUEUE_BROWSER_HTML);

    // Initialize Tracking Browser SECOND (will be on top)
    console.log("🚀 Launching Tracking Browser (bypass bot detection)...");
    
    // Check and use CHROME_PATH if provided and valid, otherwise use Puppeteer's Chrome
    let chromePathToUse = await checkChromePath(ENV.CHROME_PATH);
    if (!chromePathToUse) {
        console.log("📦 Using Puppeteer's bundled Chrome...");
        chromePathToUse = await ensureChromeInstalled();
    } else {
        console.log(`✅ Using Chrome from CHROME_PATH: ${chromePathToUse}`);
    }

    const { browser: trackingBrowser, page: initialPage } = await connect({
        headless: false,
        turnstile: false,
        fingerprint: true,
        tf: false,
        args: [
            `--window-size=${trackingWidth},${height}`,
            '--window-position=0,0',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer'
        ],
        userDataDir: "./user_data",
        customConfig: {
            chromePath: chromePathToUse
        },
        connectOption: {
            defaultViewport: null
        },
        disableXvfb: true
    });

    tracker.browser = trackingBrowser;
    tracker.page = initialPage;
    tracker.originalPage = initialPage; // Store original page
    await tracker.page.setJavaScriptEnabled(true);
    await tracker.page.setBypassCSP(true);

    // Listen for newly opened tabs
    trackingBrowser.on('targetcreated', async (target) => {
        try {
            const page = await target.page();
            if (page && page !== tracker.page) {
                // Wait a bit for the page to initialize
                await new Promise(resolve => setTimeout(resolve, 500));
                
                try {
                    const url = page.url();
                    console.log(`🆕 New tab opened: ${url}`);
                    
                    // Clean up old tabs (older than 1 minute)
                    const oneMinuteAgo = Date.now() - 60000;
                    tracker.newlyOpenedTabs = tracker.newlyOpenedTabs.filter(tab => tab.timestamp > oneMinuteAgo);
                    
                    tracker.newlyOpenedTabs.push({
                        page: page,
                        url: url,
                        target: target,
                        timestamp: Date.now()
                    });
                } catch (urlErr) {
                    // Page might not have URL yet, but still track it
                    console.log(`🆕 New tab opened (URL not available yet)`);
                    tracker.newlyOpenedTabs.push({
                        page: page,
                        url: null,
                        target: target,
                        timestamp: Date.now()
                    });
                }
            }
        } catch (err) {
            // Target might not have a page yet, ignore
            console.debug('Target created but no page available yet:', err.message);
        }
    });

    console.log("✅ Both browsers launched successfully!");

    // Now setup handlers (both browsers are ready)
    const handlers = createQueuePageHandlers(tracker, width, height, trackingWidth, queueWidth);
    tracker._queueHandlers = handlers;

    await tracker.queuePage.exposeFunction("quitApp", handlers.quitApp);
    await tracker.queuePage.exposeFunction("saveEvents", handlers.saveEvents);
    await tracker.queuePage.exposeFunction("resizeQueueBrowser", handlers.resizeQueueBrowser);
    
    // Maximize Queue Browser immediately after initialization
    try {
        await handlers.resizeQueueBrowser(true);
    } catch (err) {
        console.error('Failed to maximize queue browser on init:', err);
    }
    
    await tracker.queuePage.exposeFunction("openPanelEditor", handlers.openPanelEditor);
    await tracker.queuePage.exposeFunction("openPanelEditorForAction", handlers.openPanelEditorForAction);
    await tracker.queuePage.exposeFunction("savePanelEdits", handlers.savePanelEdits);
    await tracker.queuePage.exposeFunction("drawPanel", handlers.drawPanel);
    await tracker.queuePage.exposeFunction("saveCroppedPanel", handlers.saveCroppedPanel);
    await tracker.queuePage.exposeFunction("useBeforePanel", handlers.useBeforePanel);
    await tracker.queuePage.exposeFunction("resetPanel", handlers.resetPanel);
    await tracker.queuePage.exposeFunction("markAsDone", handlers.markAsDone);
    await tracker.queuePage.exposeFunction("deleteEvent", handlers.deleteEvent);
    await tracker.queuePage.exposeFunction("deleteClickEvent", handlers.deleteClickEvent);
    await tracker.queuePage.exposeFunction("clearAllClicksForAction", handlers.clearAllClicksForAction);
    await tracker.queuePage.exposeFunction("resetActionStep", handlers.resetActionStep);
    await tracker.queuePage.exposeFunction("renamePanel", handlers.renamePanel);
    await tracker.queuePage.exposeFunction("renameActionByAI", handlers.renameActionByAI);
    await tracker.queuePage.exposeFunction("getActionItem", async (actionId) => {
        return await tracker.dataItemManager.getItem(actionId);
    });
    await tracker.queuePage.exposeFunction("getClickEventsForPanel", handlers.getClickEventsForPanel);
    await tracker.queuePage.exposeFunction("manualCaptureAI", handlers.manualCaptureAI);
    await tracker.queuePage.exposeFunction("captureActions", handlers.captureActions);
    await tracker.queuePage.exposeFunction("manualCaptureAIScrolling", handlers.manualCaptureAIScrolling);
    await tracker.queuePage.exposeFunction("captureActionsScrolling", handlers.captureActionsScrolling);
    await tracker.queuePage.exposeFunction("drawPanelAndDetectActions", handlers.drawPanelAndDetectActions);
    await tracker.queuePage.exposeFunction("confirmPanelType", handlers.confirmPanelType);
    await tracker.queuePage.exposeFunction("cancelPanelType", handlers.cancelPanelType);
    await tracker.queuePage.exposeFunction("confirmPanelCrop", handlers.confirmPanelCrop);
    await tracker.queuePage.exposeFunction("detectPages", handlers.detectPages);
    await tracker.queuePage.exposeFunction("selectPanel", handlers.selectPanel);
    await tracker.queuePage.exposeFunction("getPanelTree", handlers.getPanelTree);
    await tracker.queuePage.exposeFunction("getPanelEditorClass", handlers.getPanelEditorClass);
    await tracker.queuePage.exposeFunction("getParentPanelOfAction", handlers.getParentPanelOfAction);
    await tracker.queuePage.exposeFunction("useSelectPanel", handlers.useSelectPanel);
    await tracker.queuePage.exposeFunction("getAllPanels", handlers.getAllPanels);
    await tracker.queuePage.exposeFunction("getPanelImage", handlers.getPanelImage);
    await tracker.queuePage.exposeFunction("broadcastToast", handlers.broadcastToast);
    await tracker.queuePage.exposeFunction("bringQueueBrowserToFront", handlers.bringQueueBrowserToFront);
    await tracker.queuePage.exposeFunction("hideTrackingBrowser", handlers.hideTrackingBrowser);
    await tracker.queuePage.exposeFunction("showTrackingBrowser", handlers.showTrackingBrowser);
    await tracker.queuePage.exposeFunction("resetDrawingFlag", handlers.resetDrawingFlag);
    await tracker.queuePage.exposeFunction("checkActionHasStep", handlers.checkActionHasStep);
    await tracker.queuePage.exposeFunction("importCookiesFromJson", handlers.importCookiesFromJson);
    await tracker.queuePage.exposeFunction("updatePanelImageAndCoordinates", handlers.updatePanelImageAndCoordinates);
    await tracker.queuePage.exposeFunction("createManualPage", handlers.createManualPage);
    await tracker.queuePage.exposeFunction("updateItemDetails", handlers.updateItemDetails);
    await tracker.queuePage.exposeFunction("getCheckpoints", handlers.getCheckpoints);
    await tracker.queuePage.exposeFunction("rollbackCheckpoint", handlers.rollbackCheckpoint);
    await tracker.queuePage.exposeFunction("checkForChanges", handlers.checkForChanges);
    await tracker.queuePage.exposeFunction("isMainScreenActive", handlers.isMainScreenActive);
    await tracker.queuePage.exposeFunction("isAnyOperationRunning", handlers.isAnyOperationRunning);
    await tracker.queuePage.exposeFunction("showSaveReminderDialog", handlers.showSaveReminderDialog);
    await tracker.queuePage.exposeFunction("handleSaveReminderResponse", handlers.handleSaveReminderResponse);

    await tracker.page.goto(startUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    const websites = await fetchWebsiteList();

    const __filename = fileURLToPath(import.meta.url);
    const sessionsPath = path.join(path.dirname(path.dirname(path.dirname(__filename))), 'sessions');

    let allSessions = [];
    try {
        const sessionFolders = await fsp.readdir(sessionsPath);
        for (const folder of sessionFolders) {
            const infoPath = path.join(sessionsPath, folder, 'info.json');
            try {
                const infoContent = await fsp.readFile(infoPath, 'utf8');
                const info = JSON.parse(infoContent);
                const timestamps = info.timestamps || [];
                const lastTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : Date.now();

                const date = new Date(lastTimestamp);
                const dd = String(date.getDate()).padStart(2, '0');
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const yyyy = date.getFullYear();
                const hh = String(date.getHours()).padStart(2, '0');
                const min = String(date.getMinutes()).padStart(2, '0');
                const ss = String(date.getSeconds()).padStart(2, '0');
                const formattedTime = `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;

                allSessions.push({
                    folder: path.join(sessionsPath, folder),
                    toolName: info.toolCode,
                    formattedTime: formattedTime
                });
            } catch (err) {
            }
        }
        allSessions.sort((a, b) => b.folder.localeCompare(a.folder));
    } catch (err) {
    }

    await injectWebsiteSelector(tracker.page, websites, allSessions);
    tracker.page.trackerInstance = tracker;
}
