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

export async function initBrowsers(tracker, startUrl) {
    tracker.urlTracking = startUrl;
    
    tracker.wss = new WebSocketServer({ port: 8081 });
    tracker.wss.on("connection", () => console.log("📡 QueueScreen connected"));
    const { width, height } = await getScreenSize();
    const trackingWidth = Math.floor(width * 0.7);
    const queueWidth = Math.floor(width * 0.3);
    
    console.log(`🖥️ Screen: ${width}x${height}`);
    console.log(`📐 Tracking browser: ${trackingWidth}x${height} at (0, 0)`);
    console.log(`📐 Queue browser: ${queueWidth}x${height} at (${trackingWidth}, 0)`);
    
    console.log("🚀 Launching Real Browser (bypass bot detection)...");
    const { browser: trackingBrowser, page: initialPage } = await connect({
        headless: false,
        turnstile: false,
        fingerprint: true,
        tf: false,
        args: [
            `--window-size=${trackingWidth},${height}`,
            '--window-position=0,0',
            // '--no-first-run',
            // '--no-default-browser-check',
            // '--disable-blink-features=AutomationControlled',
            // '--disable-infobars',
            // '--disable-web-security',
            // '--disable-features=IsolateOrigins,site-per-process',
            // '--allow-running-insecure-content',
            // '--disable-site-isolation-trials'
        ],
        userDataDir: "./user_data",
        customConfig: {
            chromePath: ENV.CHROME_PATH
        },
        connectOption: {
            defaultViewport: null
        },
        disableXvfb: true
    });
    
    tracker.browser = trackingBrowser;
    tracker.page = initialPage;
    await tracker.page.setJavaScriptEnabled(true);
    await tracker.page.setBypassCSP(true);
    console.log("✅ Real Browser launched successfully!");
    tracker.queueBrowser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            `--window-size=${queueWidth},${height}`,
            `--window-position=${trackingWidth},0`,
            '--disable-font-subpixel-positioning',
            '--disable-features=FontAccess',
            '--font-render-hinting=none',
            '--disable-dev-shm-usage'
        ]
    });
    const queuePages = await tracker.queueBrowser.pages();
    tracker.queuePage = queuePages[0];
    await tracker.queuePage.setJavaScriptEnabled(true);
    await tracker.queuePage.setContent(QUEUE_BROWSER_HTML);
    
    const handlers = createQueuePageHandlers(tracker, width, height, trackingWidth, queueWidth);
    tracker._queueHandlers = handlers;
    
    await tracker.queuePage.exposeFunction("quitApp", handlers.quitApp);
    await tracker.queuePage.exposeFunction("saveEvents", handlers.saveEvents);
    await tracker.queuePage.exposeFunction("resizeQueueBrowser", handlers.resizeQueueBrowser);
    await tracker.queuePage.exposeFunction("openPanelEditor", handlers.openPanelEditor);
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
    await tracker.queuePage.exposeFunction("getClickEventsForPanel", handlers.getClickEventsForPanel);
    await tracker.queuePage.exposeFunction("manualCaptureAI", handlers.manualCaptureAI);
    await tracker.queuePage.exposeFunction("captureActions", handlers.captureActions);
    await tracker.queuePage.exposeFunction("manualCaptureAIScrolling", handlers.manualCaptureAIScrolling);
    await tracker.queuePage.exposeFunction("captureActionsScrolling", handlers.captureActionsScrolling);
    await tracker.queuePage.exposeFunction("selectPanel", handlers.selectPanel);
    await tracker.queuePage.exposeFunction("getPanelTree", handlers.getPanelTree);
    await tracker.queuePage.exposeFunction("getPanelEditorClass", handlers.getPanelEditorClass);
    await tracker.queuePage.exposeFunction("getParentPanelOfAction", handlers.getParentPanelOfAction);
    await tracker.queuePage.exposeFunction("broadcastToast", handlers.broadcastToast);
    await tracker.queuePage.exposeFunction("bringQueueBrowserToFront", handlers.bringQueueBrowserToFront);
    await tracker.queuePage.exposeFunction("hideTrackingBrowser", handlers.hideTrackingBrowser);
    await tracker.queuePage.exposeFunction("showTrackingBrowser", handlers.showTrackingBrowser);
    await tracker.queuePage.exposeFunction("resetDrawingFlag", handlers.resetDrawingFlag);
    await tracker.queuePage.exposeFunction("checkActionHasStep", handlers.checkActionHasStep);
    await tracker.queuePage.exposeFunction("importCookiesFromJson", handlers.importCookiesFromJson);

    await tracker.page.goto(startUrl);
    const websites = await fetchWebsiteList();
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(path.dirname(path.dirname(__filename)));
    const sessionsPath = path.join(__dirname, 'sessions');
    
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
