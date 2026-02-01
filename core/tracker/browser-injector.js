import { sleep } from '../utils/utils.js';
import { showTrackerCursorIndicator, ensureTrackerCursorIndicatorOnLoad } from './tracker-cursor-indicator.js';

export async function setupNavigationListener(tracker) {
    if (tracker._navigationListenerSetup) return;

    const cleanupPollers = () => {
        if (tracker._keyboardPoller) {
            clearInterval(tracker._keyboardPoller);
            tracker._keyboardPoller = null;
        }
        if (tracker._clickPoller) {
            clearInterval(tracker._clickPoller);
            tracker._clickPoller = null;
        }
    };

    tracker.page.on("load", async () => {
        try {
            cleanupPollers();
            await sleep(1000);
            await setupTracking(tracker);
        } catch (e) {
            console.error("re-inject failed:", e);
        }
        // Luôn re-inject vòng tròn vàng sau load (F5 hoặc link mới) vì DOM đã thay thế
        if (tracker.page && !tracker.page.isClosed()) {
            try {
                await showTrackerCursorIndicator(tracker.page);
            } catch (e) {
                const m = e.message || '';
                if (!m.includes('Target closed') && !m.includes('detached')) console.warn('Re-inject cursor indicator on load failed:', m);
            }
        }
    });

    tracker.page.on("framenavigated", async (frame) => {
        if (frame === tracker.page.mainFrame()) {
            const newUrl = frame.url();
            if (tracker.currenPage && tracker.currenPage !== newUrl) {
                tracker.previousPage = tracker.currenPage;
                tracker.currenPage = newUrl;
                try {
                    cleanupPollers();
                    await sleep(500);
                    await setupTracking(tracker);
                    console.log(`🔄 Page navigated to: ${newUrl}`);
                } catch (e) {
                    console.error('❌ Failed to re-inject on navigation:', e);
                }
            } else {
                tracker.currenPage = newUrl;
            }
            // Re-inject vòng tròn vàng sau mỗi lần frame navigated (F5 hoặc link mới)
            if (tracker.page && !tracker.page.isClosed()) {
                try {
                    await sleep(200);
                    await showTrackerCursorIndicator(tracker.page);
                } catch (e) {
                    const m = e.message || '';
                    if (!m.includes('Target closed') && !m.includes('detached')) console.warn('Re-inject cursor on framenavigated failed:', m);
                }
            }
        }
    });

    tracker._navigationListenerSetup = true;
}

/**
 * Gắn listener load/framenavigated lên page để sau F5 hoặc mở link mới vẫn re-inject vòng tròn vàng.
 * Gọi khi chuyển tracker.page sang tab mới (tab mới chưa có listener từ setupNavigationListener).
 */
export async function attachTrackerCursorIndicatorOnNavigate(tracker, page) {
    if (!page || page.isClosed()) return;
    try {
        await ensureTrackerCursorIndicatorOnLoad(page);
        page.on('load', async () => {
            try {
                if (tracker.page === page && !page.isClosed()) await showTrackerCursorIndicator(page);
            } catch (e) { /* ignore detached/closed */ }
        });
        page.on('framenavigated', async (frame) => {
            try {
                if (frame === page.mainFrame() && tracker.page === page && !page.isClosed()) {
                    await sleep(200);
                    await showTrackerCursorIndicator(page);
                }
            } catch (e) { /* ignore */ }
        });
    } catch (e) {
        if (!(e.message || '').includes('Target closed') && !(e.message || '').includes('detached')) {
            console.warn('attachTrackerCursorIndicatorOnNavigate failed:', e.message);
        }
    }
}

export async function showReadyNotification(tracker) {
    try {
        await tracker.page.evaluate(() => {
            const existingNotif = document.getElementById('__tracker_ready_notif');
            if (existingNotif) existingNotif.remove();

            const notif = document.createElement('div');
            notif.id = '__tracker_ready_notif';
            notif.innerHTML = '✅ Ready to track';
            notif.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 16px;
                font-weight: 600;
                z-index: 999999;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                animation: slideInRight 0.3s ease-out, fadeOut 0.5s ease-in 0.5s forwards;
            `;

            const style = document.createElement('style');
            style.textContent = `
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes fadeOut {
                    to { opacity: 0; transform: translateX(20px); }
                }
            `;
            if (document.head) {
                document.head.appendChild(style);
            }
            if (document.body) {
                document.body.appendChild(notif);
                setTimeout(() => notif.remove(), 1000);
            }
        });
    } catch (err) {
        if (!err.message.includes('Execution context was destroyed')) {
            console.error('Failed to show ready notification:', err);
        }
    }
}

export async function setupTracking(tracker) {
    console.log('🔧 Setting up tracking...');

    const exposeIfNotExists = async (name, fn) => {
        try {
            await tracker.page.exposeFunction(name, fn);
        } catch (err) {
            if (!err.message.includes('already exists') &&
                !err.message.includes('Target closed') &&
                !err.message.includes('Execution context was destroyed')) {
                console.error(`Failed to expose ${name}:`, err);
            }
        }
    };

    await exposeIfNotExists("triggerCaptureGemini", async () => {
        await tracker._broadcast({ type: 'trigger_capture', mode: 'gemini' });
    });

    const handlers = tracker._queueHandlers;
    if (handlers) {
        await exposeIfNotExists("triggerDrawPanelNew", handlers.triggerDrawPanelNew);
        await exposeIfNotExists("triggerUseBeforePanel", handlers.triggerUseBeforePanel);
    }


    try {
        await tracker.page.evaluate(() => {
            if (!window.showTrackingToast) {
                window.showTrackingToast = (message) => {
                    const existingToast = document.getElementById('__tracking_toast');
                    if (existingToast) existingToast.remove();
                    const toast = document.createElement('div');
                    toast.id = '__tracking_toast';
                    toast.textContent = message;
                    toast.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: rgba(0, 0, 0, 0.85);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 6px;
                    font-size: 14px;
                    z-index: 999999;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    animation: slideIn 0.3s ease;
                    pointer-events: none;
                `;
                    const style = document.createElement('style');
                    style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                    if (document.head) document.head.appendChild(style);
                    const parentNode = document.body || document.documentElement;
                    if (parentNode) parentNode.appendChild(toast);
                    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3000);
                };
            }
            if (!window.__trackingWs || window.__trackingWs.readyState !== 1) {
                window.__trackingWs = new WebSocket('ws://localhost:8081');

                window.__trackingWs.onopen = () => {
                    if (!document.getElementById('__ws_notif_style')) {
                        const style = document.createElement('style');
                        style.id = '__ws_notif_style';
                        style.textContent = `
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(20px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes fadeOut {
                    to { opacity: 0; transform: translateX(20px); }
                }
            `;
                        document.head.appendChild(style);
                    }

                    const wsNotif = document.createElement('div');
                    wsNotif.style.cssText = `
                    position: fixed;
                    bottom: 70px;
                    right: 20px;
                    background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                    color: white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-family: system-ui, -apple-system, sans-serif;
                    font-size: 14px;
                    font-weight: 600;
                    z-index: 999999;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    animation: slideInRight 0.3s ease-out, fadeOut 0.5s ease-in 0.5s forwards;
                `;
                    wsNotif.textContent = '🟢 WS Connected';
                    document.body.appendChild(wsNotif);
                    setTimeout(() => wsNotif.remove(), 1000);
                };

                window.__trackingWs.onerror = (err) => { };

                window.__trackingWs.onclose = () => { };

                window.__trackingWs.onmessage = (msg) => {
                    try {
                        const evt = JSON.parse(msg.data);

                        if (evt.type === 'recording_status') {
                            // Track recording status to suppress toasts during recording
                            window.__isRecording = evt.isRecording;
                        } else if (evt.type === 'show_toast' && evt.message) {
                            // Don't show toast in tracking browser if target is 'queue' or if recording is in progress
                            if (evt.target !== 'queue' && window.showTrackingToast && !window.__isRecording) {
                                window.showTrackingToast(evt.message);
                            }
                        } else if (evt.type === 'panel_selected') {
                            if ('panel_id' in evt) {
                                window.__selectedItemId = evt.panel_id;
                                if (evt.panel_id == null) {
                                    window.__selectedItemCategory = null;
                                }
                            }
                            if ('item_category' in evt) {
                                window.__selectedItemCategory = evt.item_category;
                            }
                        }
                    } catch (err) { }
                };
            }

            // Không early return theo __trackingSetup: sau navigate/F5 window có thể reuse nên __trackingSetup
            // vẫn true nhưng document mới chưa có click handler → luôn đăng ký lại click handler.

            window.getClickedElementInfo = (element) => {
                if (!element) return null;

                const tag = element.tagName || 'unknown';
                const text = (element.textContent || '').trim().substring(0, 100);

                const elementName =
                    element.getAttribute('aria-label')?.trim() ||
                    element.placeholder?.trim() ||
                    element.value?.trim() ||
                    element.alt?.trim() ||
                    text ||
                    element.id?.trim() ||
                    tag.toLowerCase();

                return {
                    tag,
                    id: element.id || '',
                    classes: element.className || '',
                    text: text,
                    type: element.type || '',
                    href: element.href || '',
                    name: element.name || '',
                    ariaLabel: element.getAttribute('aria-label') || '',
                    elementName: elementName
                };
            };

            if (!window.showTrackingToast) {
                window.showTrackingToast = (message) => {
                    const existingToast = document.getElementById('__tracking_toast');
                    if (existingToast) existingToast.remove();

                    const toast = document.createElement('div');
                    toast.id = '__tracking_toast';
                    toast.textContent = message;
                    toast.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: rgba(0, 0, 0, 0.85);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 6px;
                    font-size: 14px;
                    z-index: 999999;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    animation: slideIn 0.3s ease;
                `;

                    const style = document.createElement('style');
                    style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                    if (document.head) {
                        document.head.appendChild(style);
                    }

                    const parentNode = document.body || document.documentElement;
                    if (parentNode) {
                        parentNode.appendChild(toast);
                    }

                    setTimeout(() => {
                        if (toast.parentNode) {
                            toast.remove();
                        }
                    }, 3000);
                };
            }

            if (!window.__keyboardQueue) {
                window.__keyboardQueue = [];
            }

            if (typeof window.__detectPagesInProgress === 'undefined') {
                window.__detectPagesInProgress = false;
            }

            if (typeof window.__detectPagesPending === 'undefined') {
                window.__detectPagesPending = false;
            }

            if (!window.__keydownListenerSetup) {
                document.addEventListener('keydown', async (e) => {
                    // F2 or Ctrl+` (backtick): Freeze screenshot (capture dropdown/popup state)
                    const isFreezeShortcut = e.key === 'F2' || ((e.ctrlKey || e.metaKey) && e.key === '`');
                    if (isFreezeShortcut) {
                        e.preventDefault();
                        if (window.__freezeScreenshotPending) {
                            if (window.showTrackingToast) window.showTrackingToast('⚠️ Đang xử lý, vui lòng đợi...');
                            return;
                        }
                        window.__freezeScreenshotPending = true;
                        // DON'T show toast here - it will be captured in screenshot!
                        // Add to keyboard queue for processing by Node.js poller
                        window.__keyboardQueue.push({ action: 'FREEZE_SCREENSHOT', timestamp: Date.now() });
                        return;
                    }
                    
                    // Ctrl+1: Draw Panel & Detect Actions
                    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
                        e.preventDefault();
                        if (window.__detectPagesInProgress || window.__detectPagesPending) {
                            if (window.showTrackingToast) window.showTrackingToast('⚠️ Đang xử lý, vui lòng đợi...');
                            return;
                        }
                        const selId = window.__selectedItemId || null;
                        const selCat = window.__selectedItemCategory || null;
                        if (!selId) {
                            if (window.showTrackingToast) window.showTrackingToast('⚠️ Vui lòng chọn panel trước!');
                            return;
                        }
                        if (selCat !== 'PANEL') {
                            if (window.showTrackingToast) window.showTrackingToast('⚠️ Chỉ PANEL mới có thể Draw Panel & Detect Actions!');
                            return;
                        }
                        window.__detectPagesPending = true;
                        window.__keyboardQueue.push({ action: 'DRAW_PANEL_AND_DETECT_ACTIONS', timestamp: Date.now() });
                    }
                }, { capture: true });

                window.__keydownListenerSetup = true;
            }

            window.__clickHandler = (e) => {
                if (!e.isTrusted) {
                    return;
                }

                const element = e.target;
                const elementInfo = window.getClickedElementInfo(element);

                const now = Date.now();
                const posKey = `${e.clientX}_${e.clientY}`;

                if (!window.__recentClicks) {
                    window.__recentClicks = new Map();
                }

                if (window.__recentClicks.has(posKey)) {
                    const lastTime = window.__recentClicks.get(posKey);
                    if (now - lastTime < 1000) {
                        return;
                    }
                }

                window.__recentClicks.set(posKey, now);
                setTimeout(() => window.__recentClicks.delete(posKey), 2000);

                const clickData = {
                    timestamp: now,
                    click_x: e.clientX,
                    click_y: e.clientY,
                    element_name: elementInfo?.elementName || 'Unknown',
                    element_tag: elementInfo?.tag || '',
                    url: window.location.href
                };

                if (!window.__clickQueue) {
                    window.__clickQueue = [];
                }
                window.__clickQueue.push(clickData);
            };

            document.removeEventListener('click', window.__clickHandler, { capture: true });
            document.addEventListener('click', window.__clickHandler, { capture: true });

            window.__trackingSetup = true;
        });
    } catch (err) {
        console.error('Failed to setup tracking injection:', err);
        return;
    }

    await showTrackerCursorIndicator(tracker.page);
    console.log('✅ Tracking setup completed! Ctrl/Cmd+1: Detect Pages ready.');

    if (!tracker._keyboardPoller) {
        tracker._keyboardPoller = setInterval(async () => {
            try {
                // Nếu không có tracker hợp lệ thì thử chỉ định tab đầu tiên của tracking browser làm tracker
                if (!tracker.page || tracker.page.isClosed()) {
                    await tracker.ensureTrackerPage?.();
                    if (!tracker.page || tracker.page.isClosed()) {
                        if (tracker._keyboardPoller) {
                            clearInterval(tracker._keyboardPoller);
                            tracker._keyboardPoller = null;
                        }
                        return;
                    }
                }

                const keyboardActions = await tracker.page.evaluate(() => {
                    if (!window.__keyboardQueue || window.__keyboardQueue.length === 0) {
                        return [];
                    }
                    const actions = [...window.__keyboardQueue];
                    window.__keyboardQueue = [];
                    return actions;
                });

                let inProgress = await tracker.page.evaluate(() => !!window.__detectPagesInProgress);
                let __detectHandled = false;
                for (const kb of keyboardActions) {
                    if (kb.action === 'DRAW_PANEL_AND_DETECT_ACTIONS') {
                        if (inProgress || __detectHandled) {
                            try {
                                await tracker.page.evaluate(() => { if (window.showTrackingToast) window.showTrackingToast('⚠️ Đang xử lý, vui lòng đợi...'); });
                            } catch { }
                            continue;
                        }
                        __detectHandled = true;
                        if (!tracker.selectedPanelId) {
                            try {
                                await tracker.page.evaluate(() => { window.__detectPagesPending = false; if (window.showTrackingToast) window.showTrackingToast('⚠️ Vui lòng chọn panel trước!'); });
                            } catch { }
                            await tracker._broadcast({ type: 'show_toast', message: '⚠️ Vui lòng chọn panel trước!' });
                            continue;
                        }
                        let selectedItem = null;
                        try {
                            selectedItem = await tracker.dataItemManager?.getItem?.(tracker.selectedPanelId);
                        } catch { }
                        if (!selectedItem || selectedItem.item_category !== 'PANEL') {
                            try {
                                await tracker.page.evaluate(() => { window.__detectPagesPending = false; if (window.showTrackingToast) window.showTrackingToast('⚠️ Chỉ PANEL mới có thể Draw Panel & Detect Actions!'); });
                            } catch { }
                            await tracker._broadcast({ type: 'show_toast', message: '⚠️ Chỉ PANEL mới có thể Draw Panel & Detect Actions!' });
                            continue;
                        }
                        if (tracker._queueHandlers?.drawPanelAndDetectActions) {
                            try {
                                await tracker.page.evaluate(() => { window.__detectPagesInProgress = true; window.__detectPagesPending = false; });
                                inProgress = true;
                            } catch { }
                            try {
                                await tracker._queueHandlers.drawPanelAndDetectActions();
                            } finally {
                                try {
                                    await tracker.page.evaluate(() => { window.__detectPagesInProgress = false; window.__detectPagesPending = false; });
                                    inProgress = false;
                                } catch { }
                            }
                        } else {
                            try {
                                await tracker.page.evaluate(() => { window.__detectPagesPending = false; });
                            } catch { }
                        }
                    }
                    
                    // Handle FREEZE_SCREENSHOT action
                    if (kb.action === 'FREEZE_SCREENSHOT') {
                        try {
                            const result = await tracker.freezeScreenshot();
                            if (result && result.success) {
                                await tracker.page.evaluate(() => {
                                    window.__freezeScreenshotPending = false;
                                    if (window.showTrackingToast) window.showTrackingToast('❄️ Screenshot frozen! Giờ bấm Ctrl+1 hoặc click Draw Panel.');
                                });
                            } else {
                                const errorMsg = result?.error || 'Unknown error';
                                console.error('Freeze screenshot failed:', errorMsg);
                                await tracker.page.evaluate((msg) => {
                                    window.__freezeScreenshotPending = false;
                                    if (window.showTrackingToast) window.showTrackingToast('❌ Không thể freeze screenshot: ' + msg);
                                }, errorMsg);
                            }
                        } catch (err) {
                            console.error('Freeze screenshot error:', err);
                            try {
                                await tracker.page.evaluate((msg) => {
                                    window.__freezeScreenshotPending = false;
                                    if (window.showTrackingToast) window.showTrackingToast('❌ Lỗi khi freeze screenshot: ' + msg);
                                }, err.message || String(err));
                            } catch { }
                        }
                    }
                }
            } catch (err) {
                // Check if it's a detached frame error or page closed error
                const isDetachedFrame = err.message && (
                    err.message.includes('detached Frame') ||
                    err.message.includes('Target closed') ||
                    err.message.includes('Execution context was destroyed') ||
                    err.message.includes('Session closed')
                );
                
                if (isDetachedFrame) {
                    // Page is closing, stop the poller silently
                    if (tracker._keyboardPoller) {
                        clearInterval(tracker._keyboardPoller);
                        tracker._keyboardPoller = null;
                    }
                    return;
                }
            }
        }, 30);
    }

    if (!tracker._clickPoller) {
        tracker._clickPoller = setInterval(async () => {
            try {
                // Nếu không có tracker hợp lệ thì thử chỉ định tab đầu tiên của tracking browser làm tracker
                if (!tracker.page || tracker.page.isClosed()) {
                    await tracker.ensureTrackerPage?.();
                    if (!tracker.page || tracker.page.isClosed()) {
                        if (tracker._clickPoller) {
                            clearInterval(tracker._clickPoller);
                            tracker._clickPoller = null;
                        }
                        return;
                    }
                }

                const clicks = await tracker.page.evaluate(() => {
                    if (!window.__clickQueue || window.__clickQueue.length === 0) {
                        return [];
                    }
                    const clicks = [...window.__clickQueue];
                    window.__clickQueue = [];
                    return clicks;
                });

                if (clicks.length > 0) {
                    console.log(`[CLICK] 🎯 Poller found ${clicks.length} click(s) in queue`);
                }

                for (const clickData of clicks) {
                    if (tracker.selectedPanelId && tracker.clickManager && tracker.dataItemManager) {
                        const selectedItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);

                        if (selectedItem && selectedItem.item_category === 'ACTION') {
                            console.log(`[CLICK] ✅ Processing click for ACTION ${tracker.selectedPanelId}`);
                            await tracker.clickManager.logClick(tracker.selectedPanelId, clickData);

                            await tracker._broadcast({
                                type: 'click_event',
                                action_item_id: tracker.selectedPanelId,
                                timestamp: clickData.timestamp,
                                click_x: clickData.click_x,
                                click_y: clickData.click_y,
                                element_name: clickData.element_name,
                                element_tag: clickData.element_tag
                            });
                            
                            console.log(`[CLICK] 📡 Broadcasted click event to queue browser`);
                        } else {
                            if (!tracker.selectedPanelId) {
                                console.log(`[CLICK] ⏭️  Skipping click - no selected panel`);
                            } else if (!selectedItem) {
                                console.log(`[CLICK] ⏭️  Skipping click - selected item not found: ${tracker.selectedPanelId}`);
                            } else {
                                console.log(`[CLICK] ⏭️  Skipping click - selected item is not ACTION (category: ${selectedItem.item_category})`);
                            }
                        }
                    } else {
                        if (!tracker.selectedPanelId) {
                            console.log(`[CLICK] ⏭️  Skipping click - no selected panel ID`);
                        } else if (!tracker.clickManager) {
                            console.log(`[CLICK] ⏭️  Skipping click - clickManager not initialized`);
                        } else if (!tracker.dataItemManager) {
                            console.log(`[CLICK] ⏭️  Skipping click - dataItemManager not initialized`);
                        }
                    }
                }
            } catch (err) {
                // Check if it's a detached frame error or page closed error
                const isDetachedFrame = err.message && (
                    err.message.includes('detached Frame') ||
                    err.message.includes('Target closed') ||
                    err.message.includes('Execution context was destroyed') ||
                    err.message.includes('Session closed')
                );
                
                if (isDetachedFrame) {
                    // Page is closing, stop the poller silently
                    if (tracker._clickPoller) {
                        clearInterval(tracker._clickPoller);
                        tracker._clickPoller = null;
                    }
                    return;
                }
                
                // Only log non-detached errors
                console.error(`[CLICK] ❌ Error in click poller:`, err);
            }
        }, 30);
    }

    await showReadyNotification(tracker);
    await sleep(2000);
}