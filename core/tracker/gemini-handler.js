import { sleep } from '../utils/utils.js';
import { drawPanelBoundingBoxes, resizeBase64, cropBase64Image } from '../media/screenshot.js';
import { captureActionsFromDOM } from '../media/dom-capture.js';
import { setupTracking } from './browser-injector.js';

const GEMINI_TIMEOUT_MS = 30000;
const GEMINI_TIMEOUT_IMPORTANT_ACTIONS_MS = 300000; // 60s for detectImportantActions

/**
 * Check if error indicates Gemini billing/quota issues
 * @param {number} statusCode - HTTP status code
 * @param {string} errorText - Error response text
 * @returns {boolean} True if billing/quota error detected
 */
function isGeminiBillingError(statusCode, errorText) {
    // Check HTTP status codes that indicate billing/quota issues
    if (statusCode === 429 || statusCode === 403) {
        return true;
    }
    
    // Check error message for billing/quota keywords
    if (!errorText) return false;
    
    const lowerErrorText = errorText.toLowerCase();
    const billingKeywords = [
        'quota',
        'billing',
        'payment',
        'credit',
        'insufficient',
        'exceeded',
        'limit',
        'resource exhausted',
        'billing account',
        'payment method',
        'not available',
        'unavailable'
    ];
    
    return billingKeywords.some(keyword => lowerErrorText.includes(keyword));
}

async function fetchGeminiWithTimeout(url, options, timeoutMs = GEMINI_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function askGemini(tracker, screenshotB64) {
    if (!screenshotB64 || !tracker.geminiSession) return;

    const responseSchema = {
        type: "object",
        required: ["actions"],
        properties: {
            actions: {
                type: "array",
                items: {
                    type: "object",
                    required: ["action_name", "action_type", "action_content", "action_pos"],
                    properties: {
                        action_verb: { type: "string" },
                        action_type: { type: "string" },
                        action_name: { type: "string" },
                        action_content: { type: "string" },
                        action_pos: {
                            type: "object",
                            required: ["x", "y", "w", "h"],
                            properties: {
                                x: { type: "number" },
                                y: { type: "number" },
                                w: { type: "number" },
                                h: { type: "number" }
                            }
                        }
                    }
                }
            }
        }
    };

    const turns = [
        'Please use the following rules for interpreting the visual elements and generating bounding boxes:\n' +
        '\n' +
        '**Action Bounding Rules:**\n' +
        '1. For all actions, the bounding box must precisely follow the visual boundaries of the interactive element (e.g., "button", "input field", "dropdown menu", "draggable item")\n' +
        '2. Specifically for the Search Input, the bounding box must enclose the entire clickable area, including the magnifying glass icon and the input field itself.\n' +
        '\n' +
        '## Task: Analyze the Image and detect all single *actions** visible in the Image following logic below.\n' +
        '1. For each action:\n' +
        '   - Specify `action_verb` — choose one of the following verbs: ["click", "type", "dragdrop", "paste"].\n' +
        '   - Specify `action_type` — specify the element type, choosing from: ["button", "input field", "dropdown menu", "draggable item"]\n' +
        '   - Specify `action_name` — If a button, input field, dropdown menu, or draggable item has visible text in the UI, use the exact displayed text as its name (limit to a maximum of 3 words if longer). — If the action is represented only by an icon and has no visible text, name it "No Name"..\n' +
        '   - Specify `action_content` — visible content owned by the user.\n' +
        '   - Specify `action_pos` as a **2D bounding box** (x_min, y_min, width, height) corresponding to the action.\n' +
        '2. Following this example:\n' +
        '{\n' +
        '  "action_verb": "click",\n' +
        '  "action_type": "button",\n' +
        '  "action_name": "save",\n' +
        '  "action_content": "readme.txt"\n' +
        '}\n' +
        '\n' +
        '## Notes\n' +
        '- Normalized positions should be relative to the Image (0,0 top-left; 1000,1000 bottom-right).\n' +
        '- The **bounding boxes** of actions should be **accurately detected** based on their visible location in the Image.',
        {
            inlineData: {
                data: screenshotB64,
                mimeType: 'image/png',
            },
        },
    ];

    tracker.geminiSession.sendClientContent({
        turns: turns,
        responseSchema: responseSchema
    });
}

export async function askGeminiREST(tracker, screenshotB64) {
    if (!screenshotB64) return null;

    const { ENV } = await import('../config/env.js');

    const prompt =
        'Please use the following rules for interpreting the visual elements and generating bounding boxes:\n' +
        '\n' +
        '**Action Bounding Rules:**\n' +
        '1. For all actions, the bounding box must precisely follow the visual boundaries of the interactive element (e.g., "button", "input field", "dropdown menu", "draggable item")\n' +
        '2. Specifically for the Search Input, the bounding box must enclose the entire clickable area, including the magnifying glass icon and the input field itself.\n' +
        '\n' +
        '## Task: Analyze the Image and detect all single *actions** visible in the Image following logic below.\n' +
        '1. For each action:\n' +
        '   - Specify `action_verb` — choose one of the following verbs: ["click", "type", "dragdrop", "paste"].\n' +
        '   - Specify `action_type` — specify the element type, choosing from: ["button", "input field", "dropdown menu", "draggable item"]\n' +
        '   - Specify `action_name` — If a button, input field, dropdown menu, or draggable item has visible text in the UI, use the exact displayed text as its name (limit to a maximum of 3 words if longer). — If the action is represented only by an icon and has no visible text, name it "No Name"..\n' +
        '   - Specify `action_content` — visible content owned by the user.\n' +
        '   - Specify `action_pos` as a **2D bounding box** (x_min, y_min, width, height) corresponding to the action.\n' +
        '2. Following this example:\n' +
        '{\n' +
        '  "action_verb": "click",\n' +
        '  "action_type": "button",\n' +
        '  "action_name": "save",\n' +
        '  "action_content": "readme.txt"\n' +
        '}\n' +
        '\n' +
        '## Notes\n' +
        '- Normalized positions should be relative to the Image (0,0 top-left; 1000,1000 bottom-right).\n' +
        '- The **bounding boxes** of actions should be **accurately detected** based on their visible location in the Image.';

    const responseSchema = {
        type: "object",
        required: ["actions"],
        properties: {
            actions: {
                type: "array",
                items: {
                    type: "object",
                    required: ["action_name", "action_type", "action_content", "action_pos"],
                    properties: {
                        action_verb: { type: "string" },
                        action_type: { type: "string" },
                        action_name: { type: "string" },
                        action_content: { type: "string" },
                        action_pos: {
                            type: "object",
                            required: ["x", "y", "w", "h"],
                            properties: {
                                x: { type: "number" },
                                y: { type: "number" },
                                w: { type: "number" },
                                h: { type: "number" }
                            }
                        }
                    }
                }
            }
        }
    };

    const requestBody = {
        contents: [{
            parts: [
                { text: prompt },
                {
                    inline_data: {
                        mime_type: 'image/png',
                        data: screenshotB64
                    }
                }
            ]
        }],
        generation_config: {
            response_mime_type: 'application/json',
            response_schema: responseSchema
        }
    };

    try {
        const modelName = ENV.GEMINI_MODEL_REST || 'gemini-2.5-flash';
        const response = await fetchGeminiWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'x-goog-api-key': ENV.GEMINI_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error response:', errorText);
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('🔵 Gemini REST Response received');

        let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonText) {
            console.warn('No text in Gemini response');
            return null;
        }

        jsonText = jsonText.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```/, '')
            .replace(/```$/i, '');

        return jsonText;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`Gemini REST API timed out after ${GEMINI_TIMEOUT_MS / 1000}s`);
        } else {
            console.error('Gemini REST API failed:', err);
            // Check if error message contains billing/quota keywords
            const errorMessage = err.message || '';
            if (isGeminiBillingError(0, errorMessage)) {
                console.error('⚠️ Gemini billing/quota error detected in catch block');
                if (tracker && tracker._broadcast) {
                    await tracker._broadcast({ 
                        type: 'show_gemini_billing_error' 
                    });
                }
            }
        }
        return null;
    }
}

export async function handleTurn(tracker, timeoutMs = GEMINI_TIMEOUT_MS) {
    const startTime = Date.now();
    let turn = [];

    while (true) {
        const remainingMs = timeoutMs - (Date.now() - startTime);
        if (remainingMs <= 0) {
            tracker.geminiMessageQueue.clear();
            console.error(`Gemini WebSocket timed out after ${timeoutMs / 1000}s`);
            return null;
        }

        let message;
        try {
            message = await Promise.race([
                tracker.geminiMessageQueue.get(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Gemini WebSocket timeout')), remainingMs)
                )
            ]);
        } catch (err) {
            if (err.message === 'Gemini WebSocket timeout') {
                tracker.geminiMessageQueue.clear();
                console.error(`Gemini WebSocket timed out after ${timeoutMs / 1000}s`);
                return null;
            }
            throw err;
        }

        turn.push(message);
        if (message.serverContent?.turnComplete) {
            turn.sort((a, b) => {
                const ta = a.serverContent?.modelTurn?.timestamp ?? 0;
                const tb = b.serverContent?.modelTurn?.timestamp ?? 0;
                return ta - tb;
            });

            const allText = turn
                .flatMap(msg =>
                    (msg.serverContent?.modelTurn?.parts ?? [])
                        .map(p => p.text)
                        .filter(Boolean)
                )
                .join("").trim()
                .replace(/^```json\s*/i, '')
                .replace(/^```/, '')
                .replace(/```$/i, '');

            tracker.geminiMessageQueue.clear();

            let cleanJson = allText.replace(/^[\s\S]*?(\[\s*{)/, '$1');

            const lastBracket = cleanJson.lastIndexOf(']');
            if (lastBracket !== -1) {
                cleanJson = cleanJson.substring(0, lastBracket + 1);
            }

            return cleanJson;
        }
    }
}

export async function detectScreenByGemini(tracker) {
    while (tracker.browser) {
        const scr = await tracker.screenQueue.get();

        if (tracker.geminiAsking) {
            await sleep(500);
            await tracker.screenQueue.put(scr);
            continue;
        }

        if (scr.screenshot) {
            try {
                tracker.geminiAsking = true;

                const sharp = (await import('sharp')).default;
                const fullBuffer = Buffer.from(scr.screenshot, "base64");
                const fullMeta = await sharp(fullBuffer).metadata();

                const resizedForGemini = await resizeBase64(scr.screenshot, 640);

                const scaleX = fullMeta.width / 1000;
                const scaleY = fullMeta.height / 1000;

                const { ENV } = await import('../config/env.js');
                let geminiText;

                if (ENV.GEMINI_USE_REST === 'true' || ENV.GEMINI_USE_REST === true) {
                    console.log('🔵 Using Gemini REST API');
                    geminiText = await askGeminiREST(tracker, resizedForGemini);
                } else {
                    console.log('🟣 Using Gemini WebSocket API');
                    await askGemini(tracker, resizedForGemini);
                    geminiText = await handleTurn(tracker);
                }

                if (!geminiText) {
                    console.warn('Empty response from Gemini');
                    continue;
                }

                let geminiJson;
                try {
                    geminiJson = JSON.parse(geminiText);
                } catch (jsonErr) {
                    console.warn('Gemini returned non-JSON response:', geminiText.substring(0, 100));
                    continue;
                }

                let actionsArray = [];
                if (Array.isArray(geminiJson)) {
                    actionsArray = geminiJson;
                } else if (geminiJson.actions && Array.isArray(geminiJson.actions)) {
                    actionsArray = geminiJson.actions;
                }

                const normalizeActionName = (name) => {
                    if (!name) return 'Unnamed';
                    return name.trim().replace(/\s+/g, ' ');
                };

                actionsArray = actionsArray.map(action => {
                    const actionWithId = {
                        ...action,
                        action_id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        action_name: normalizeActionName(action.action_name),
                        action_type: action.action_type || 'button',
                        action_verb: action.action_verb || 'click',
                        action_content: action.action_content || null
                    };

                    if (Array.isArray(action.action_pos) && action.action_pos.length === 4) {
                        actionWithId.action_pos = {
                            x: action.action_pos[0],
                            y: action.action_pos[1],
                            w: action.action_pos[2],
                            h: action.action_pos[3]
                        };
                    }

                    return actionWithId;
                });

                const wrappedJson = [{
                    timestamp: Date.now(),
                    panel_title: "Screen",
                    panel_type: "Screen",
                    panel_pos: { x: 0, y: 0, w: 1000, h: 1000 },
                    actions: actionsArray
                }];

                const scaledGeminiJson = wrappedJson.map(panel => {
                    const scaledPanel = { ...panel };
                    if (panel.panel_pos) {
                        scaledPanel.panel_pos = {
                            x: Math.round(panel.panel_pos.x * scaleX),
                            y: Math.round(panel.panel_pos.y * scaleY),
                            w: Math.round(panel.panel_pos.w * scaleX),
                            h: Math.round(panel.panel_pos.h * scaleY),
                        };
                    }
                    if (Array.isArray(panel.actions)) {
                        scaledPanel.actions = panel.actions.map(action => {
                            const scaledAction = { ...action };
                            if (action.action_pos) {
                                scaledAction.action_pos = {
                                    x: Math.round(action.action_pos.x * scaleX),
                                    y: Math.round(action.action_pos.y * scaleY),
                                    w: Math.round(action.action_pos.w * scaleX),
                                    h: Math.round(action.action_pos.h * scaleY),
                                };
                            }
                            return scaledAction;
                        });
                    }
                    return scaledPanel;
                });

                console.log(`🤖 [GEMINI] Detected ${actionsArray.length} interactive elements`);

                if (scr.panel_id && tracker.dataItemManager && tracker.parentPanelManager) {
                    const actionsFromGemini = scaledGeminiJson[0]?.actions || [];

                    const panelItem = await tracker.dataItemManager.getItem(scr.panel_id);
                    let pageNumber = null;
                    let parentPanelId = null;
                    let existingActionIds = [];

                    if (panelItem && panelItem.item_category === 'PAGE') {
                        pageNumber = panelItem.metadata?.p || null;

                        const { promises: fsp } = await import('fs');
                        const path = await import('path');
                        const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
                        const content = await fsp.readFile(parentPath, 'utf8');
                        const allParents = content.trim().split('\n')
                            .filter(line => line.trim())
                            .map(line => JSON.parse(line));

                        for (const parentEntry of allParents) {
                            if (parentEntry.child_pages) {
                                const pageEntry = parentEntry.child_pages.find(pg => pg.page_id === scr.panel_id);
                                if (pageEntry) {
                                    parentPanelId = parentEntry.parent_panel;
                                    existingActionIds = pageEntry.child_actions || [];
                                    break;
                                }
                            }
                        }
                    } else {
                        const parentEntry = await tracker.parentPanelManager.getPanelEntry(scr.panel_id);
                        existingActionIds = parentEntry?.child_actions || [];
                    }

                    const existingActions = await Promise.all(
                        existingActionIds.map(id => tracker.dataItemManager.getItem(id))
                    );
                    const existingNames = existingActions.filter(Boolean).map(a => a.name);

                    const nameCountMap = new Map();
                    existingNames.forEach(name => {
                        nameCountMap.set(name, (nameCountMap.get(name) || 0) + 1);
                    });

                    for (const action of actionsFromGemini) {
                        let actionName = action.action_name;

                        if (nameCountMap.has(actionName)) {
                            const count = nameCountMap.get(actionName);
                            actionName = `${actionName} (${count + 1})`;
                            nameCountMap.set(action.action_name, count + 1);
                        } else {
                            nameCountMap.set(actionName, 0);
                        }

                        const actionItemId = await tracker.dataItemManager.createAction(
                            actionName,
                            action.action_type || 'button',
                            action.action_verb || 'click',
                            action.action_pos,
                            pageNumber
                        );

                        if (panelItem.item_category === 'PAGE' && parentPanelId) {
                            await tracker.parentPanelManager.addChildActionToPage(parentPanelId, scr.panel_id, actionItemId);
                        } else {
                            await tracker.parentPanelManager.addChildAction(scr.panel_id, actionItemId);
                        }
                    }

                    console.log(`✅ Created ${actionsFromGemini.length} actions in doing_item.jsonl`);

                    if (actionsFromGemini.length === 0 && panelItem.item_category === 'PAGE') {
                        await tracker._broadcast({
                            type: 'show_toast',
                            message: '⚠️ Gemini không tìm thấy action nào! Hãy Mark as Done nếu page này đã hoàn tất.'
                        });
                    }
                }

                const screenshotWithBoxes = await drawPanelBoundingBoxes(scr.screenshot, scaledGeminiJson, '#00aaff', 2);

                if (scr.panel_id) {
                    const detectedPage = {
                        type: 'panel_selected',
                        panel_id: scr.panel_id,
                        screenshot: screenshotWithBoxes,
                        gemini_result: scaledGeminiJson,
                        actions: scaledGeminiJson[0]?.actions || [],
                        gemini_detecting: false,
                        timestamp: scr.timestamp
                    };

                    if (Array.isArray(scaledGeminiJson[0]?.actions)) {
                        detectedPage.action_list = scaledGeminiJson[0].actions
                            .map(a => a.action_name)
                            .filter(Boolean)
                            .join(', ');
                    }

                    await tracker._broadcast(detectedPage);

                    if (tracker.panelLogManager) {
                        await tracker._broadcast({
                            type: 'tree_update',
                            data: await tracker.panelLogManager.buildTreeStructure()
                        });
                    }
                }
            } catch (err) {
                console.error("detectByGemini error:", err);
            } finally {
                tracker.geminiAsking = false;
            }
        }
    }
}

export async function detectScreenByDOM(tracker, panelId, fullPage = false, imageWidth = null, imageHeight = null, skipDrawingBoundingBox = false) {
    await tracker.ensureTrackerPage?.();
    if (!tracker.page || !panelId) return;
    await setupTracking(tracker);

    tracker.geminiAsking = true;

    try {
        console.log('🌐 DOM Capture started');

        const panelItem = await tracker.dataItemManager.getItem(panelId);
        if (!panelItem || !panelItem.image_base64) {
            console.error('Panel has no image');
            tracker.geminiAsking = false;
            return [];
        }

        const sharp = (await import('sharp')).default;

        if (!panelItem.image_base64 || typeof panelItem.image_base64 !== 'string') {
            console.error('❌ Invalid image_base64:', typeof panelItem.image_base64, panelItem.image_base64?.length);
            return [];
        }

        const imageBase64 = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);

        const fullBuffer = Buffer.from(imageBase64, "base64");
        const fullMeta = await sharp(fullBuffer).metadata();

        let displayImage = imageBase64;
        let scaleX, scaleY;
        let actionsToProcess = [];
        let parentPanelEntry = null;

        if (panelItem.item_category === 'PAGE') {
            const { promises: fsp } = await import('fs');
            const path = await import('path');
            const parentPath = path.default.join(tracker.sessionFolder, 'myparent_panel.jsonl');
            const content = await fsp.readFile(parentPath, 'utf8');
            const allParents = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            parentPanelEntry = allParents.find(p =>
                p.child_pages && p.child_pages.some(pg => pg.page_id === panelId)
            );

            console.log('📄 PAGE: Auto DOM detection disabled. User must detect via Gemini.');
            actionsToProcess = [];
        } else {
            const domActions = await captureActionsFromDOM(tracker.page, null, fullPage, imageWidth, imageHeight);
            console.log(`🎯 [DOM] Detected ${domActions.length} interactive elements`);

            scaleX = fullMeta.width / 1000;
            scaleY = fullMeta.height / 1000;

            const scaledDomActions = domActions.map(action => ({
                ...action,
                action_pos: {
                    x: Math.round(action.action_pos.x * scaleX),
                    y: Math.round(action.action_pos.y * scaleY),
                    w: Math.round(action.action_pos.w * scaleX),
                    h: Math.round(action.action_pos.h * scaleY)
                }
            }));

            actionsToProcess = scaledDomActions;

            await tracker.parentPanelManager.updateParentDom(panelId, scaledDomActions);
            console.log(`✅ Saved ${scaledDomActions.length} actions to parent_dom`);
        }

        const scaledDomActions = actionsToProcess;

        if (scaledDomActions.length === 0 && panelItem.item_category === 'PAGE') {
            await tracker._broadcast({
                type: 'show_toast',
                message: '⚠️ DOM không tìm thấy action nào! Hãy thử nút 🤖 Detect Action Backup.'
            });
        }

        if (tracker.dataItemManager && tracker.parentPanelManager) {
            let existingActionIds = [];

            if (panelItem.item_category === 'PAGE' && parentPanelEntry) {
                const pageEntry = parentPanelEntry.child_pages.find(pg => pg.page_id === panelId);
                existingActionIds = pageEntry?.child_actions || [];
            } else {
                const parentEntry = await tracker.parentPanelManager.getPanelEntry(panelId);
                existingActionIds = parentEntry?.child_actions || [];
            }

            const existingActions = await Promise.all(
                existingActionIds.map(id => tracker.dataItemManager.getItem(id))
            );
            const existingNames = existingActions.filter(Boolean).map(a => a.name);

            const nameCountMap = new Map();
            existingNames.forEach(name => {
                nameCountMap.set(name, (nameCountMap.get(name) || 0) + 1);
            });

            let pageNumber = null;
            if (panelItem.item_category === 'PAGE') {
                pageNumber = panelItem.metadata?.p || null;
            }

            for (const action of scaledDomActions) {
                let actionName = action.action_name;

                if (nameCountMap.has(actionName)) {
                    const count = nameCountMap.get(actionName);
                    actionName = `${actionName} (${count + 1})`;
                    nameCountMap.set(action.action_name, count + 1);
                } else {
                    nameCountMap.set(actionName, 0);
                }

                const actionItemId = await tracker.dataItemManager.createAction(
                    actionName,
                    action.action_type || 'button',
                    action.action_verb || 'click',
                    action.action_pos,
                    pageNumber
                );

                if (panelItem.item_category === 'PAGE' && parentPanelEntry) {
                    await tracker.parentPanelManager.addChildActionToPage(parentPanelEntry.parent_panel, panelId, actionItemId);
                } else {
                    await tracker.parentPanelManager.addChildAction(panelId, actionItemId);
                }
            }

            console.log(`✅ Created ${scaledDomActions.length} actions in doing_item.jsonl`);
        }

        const geminiResult = [{
            panel_title: panelItem.name,
            actions: scaledDomActions
        }];

        let screenshotToSend = displayImage;
        if (!skipDrawingBoundingBox) {
            screenshotToSend = await drawPanelBoundingBoxes(
                displayImage,
                geminiResult,
                '#00aaff',
                2
            );
        }

        const baseEvent = {
            type: 'panel_selected',
            panel_id: panelId,
            screenshot: screenshotToSend,
            gemini_detecting: false,
            timestamp: Date.now()
        };

        let broadcastEvent;
        if (skipDrawingBoundingBox && panelItem.metadata?.w && panelItem.metadata?.h) {
            broadcastEvent = {
                ...baseEvent,
                metadata: { w: panelItem.metadata.w, h: panelItem.metadata.h }
            };
        } else {
            broadcastEvent = {
                ...baseEvent,
                gemini_result: geminiResult,
                actions: scaledDomActions,
                action_list: scaledDomActions.map(a => a.action_name).filter(Boolean).join(', ')
            };
            if (panelItem.metadata) {
                broadcastEvent.metadata = panelItem.metadata;
            }
        }

        await tracker._broadcast(broadcastEvent);

        if (tracker.panelLogManager) {
            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });
        }

        return scaledDomActions;
    } catch (err) {
        console.error('detectScreenByDOM error:', err);
        return [];
    } finally {
        tracker.geminiAsking = false;
    }
}

/**
 * Detect panel type using Gemini (Solution 1: Use full screenshot to see backdrop)
 * @param {string} croppedScreenshotB64 - Cropped screenshot of the panel
 * @param {string} fullScreenshotB64 - Full page screenshot (optional, for better popup detection)
 * @param {object} cropArea - Crop area {x, y, w, h} (optional, when fullScreenshotB64 is provided)
 * @returns {Promise<string>} - Panel type: 'screen', 'popup', or 'newtab'
 */
export async function detectPanelTypeByGemini(croppedScreenshotB64, fullScreenshotB64 = null, cropArea = null, tracker = null) {
    if (!croppedScreenshotB64) return 'screen';

    const { ENV } = await import('../config/env.js');

    // Use full screenshot if provided (Solution 1: Better popup detection with backdrop)
    const screenshotToAnalyze = fullScreenshotB64 || croppedScreenshotB64;
    const useFullScreenshot = fullScreenshotB64 && cropArea;

    let prompt = 'Phân tích hình ảnh này để xác định loại panel:\n' +
        '\n';

    if (useFullScreenshot) {
        prompt += '**QUAN TRỌNG:** Hình ảnh này là toàn bộ trang web. Vùng panel cần phân tích nằm ở vị trí:\n' +
            `- X: ${cropArea.x}, Y: ${cropArea.y}, Width: ${cropArea.w}, Height: ${cropArea.h}\n` +
            '- Hãy tập trung vào vùng này và kiểm tra xem có backdrop tối (overlay) xung quanh vùng này không.\n\n';
    }

    prompt += '**Yêu cầu:**\n' +
        'Xác định panel này thuộc loại nào dựa trên đặc điểm visual:\n' +
        '\n' +
        '1. **screen**: Panel chiếm toàn bộ hoặc phần lớn màn hình, là giao diện chính của trang web/ứng dụng\n' +
        '   - Ví dụ: Trang chủ, trang danh sách sản phẩm, trang profile, dropdown menu đóng (chỉ có button/input, chưa mở danh sách)\n' +
        '   - Đặc điểm: Không có overlay, không có backdrop tối phía sau (khi xem full screenshot)\n' +
        '   - Kích thước: Thường chiếm >70% chiều rộng và chiều cao màn hình\n' +
        '   - QUAN TRỌNG: Dropdown menu ĐÓNG (chỉ có button/input, chưa hiển thị danh sách options) là "screen"\n' +
        '\n' +
        '2. **popup**: Panel là một modal/dialog/popup xuất hiện phía trên nội dung chính\n' +
        '   - Ví dụ: Dialog xác nhận, form đăng nhập popup, modal window, template selection popup, "Share Lovable" popup\n' +
        '   - Đặc điểm QUAN TRỌNG:\n' +
        '     * Có backdrop tối (overlay/dark background) phía sau và xung quanh panel (kiểm tra kỹ trong full screenshot)\n' +
        '     * HOẶC: Panel có dropdown đang MỞ (dropdown menu đang hiển thị danh sách options/items bên trong)\n' +
        '       - Nhận diện: Thấy danh sách các options/items hiển thị bên dưới button/input của dropdown\n' +
        '       - Ví dụ: Select box đang mở với danh sách lựa chọn, combobox đang mở, menu dropdown đang hiển thị items\n' +
        '     * Kích thước: Thường nhỏ hơn màn hình (<80% chiều rộng và chiều cao)\n' +
        '     * Vị trí: Thường ở giữa hoặc gần giữa màn hình\n' +
        '     * Có border/shadow rõ ràng, có thể có nút đóng (X)\n' +
        '   - QUYẾT ĐỊNH: Nếu THẤY backdrop tối xung quanh panel trong full screenshot → "popup"\n' +
        '   - QUYẾT ĐỊNH: Nếu panel có dropdown đang MỞ (có danh sách options đang hiển thị) → "popup"\n' +
        '   - QUYẾT ĐỊNH: Nếu KHÔNG có backdrop tối VÀ KHÔNG có dropdown đang mở → "screen"\n' +
        '\n' +
        '3. **newtab**: Panel mở trong tab mới của trình duyệt\n' +
        '   - Ví dụ: Trang mới mở từ link target="_blank"\n' +
        '   - Đặc điểm: Thường là toàn bộ trang web mới, không có backdrop\n' +
        '\n' +
        '**Lưu ý:**\n' +
        '- Nếu không chắc chắn, trả về "screen"\n';
    
    if (useFullScreenshot) {
        prompt += '- QUAN TRỌNG: Kiểm tra kỹ vùng xung quanh panel trong full screenshot để tìm backdrop tối\n';
    }
    
    prompt += '- Nhận diện popup nếu THẤY RÕ RÀNG backdrop tối (overlay) phía sau và xung quanh panel\n' +
        '- HOẶC nhận diện popup nếu panel có dropdown đang MỞ (có danh sách options/items đang hiển thị)\n' +
        '- Dropdown menu ĐÓNG (chỉ có button/input, chưa mở danh sách) là "screen"\n' +
        '- Chỉ trả về "newtab" nếu chắc chắn đây là trang mới trong tab mới\n';

    const responseSchema = {
        type: "object",
        required: ["panel_type"],
        properties: {
            panel_type: {
                type: "string",
                enum: ["screen", "popup", "newtab"]
            }
        }
    };

    try {
        const resizedForGemini = await resizeBase64(screenshotToAnalyze, 640);
        
        const requestBody = {
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inline_data: {
                            mime_type: 'image/png',
                            data: resizedForGemini
                        }
                    }
                ]
            }],
            generation_config: {
                response_mime_type: 'application/json',
                response_schema: responseSchema
            }
        };

        const modelName = ENV.GEMINI_MODEL_REST || 'gemini-2.5-flash';
        const response = await fetchGeminiWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'x-goog-api-key': ENV.GEMINI_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini Panel Type API error response:', errorText);
            
            // Check for billing/quota errors
            if (isGeminiBillingError(response.status, errorText)) {
                console.error('⚠️ Gemini billing/quota error detected');
                if (tracker && tracker._broadcast) {
                    await tracker._broadcast({ 
                        type: 'show_gemini_billing_error' 
                    });
                }
            }
            
            return 'screen'; // Default to screen on error
        }

        const data = await response.json();
        let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonText) {
            console.warn('No text in Gemini panel type response');
            return 'screen';
        }

        jsonText = jsonText.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```/, '')
            .replace(/```$/i, '');

        const result = JSON.parse(jsonText);
        const panelType = result.panel_type || 'screen';
        
        // Validate panel type
        if (['screen', 'popup', 'newtab'].includes(panelType)) {
            console.log(`🤖 [GEMINI] Detected panel type: ${panelType}`);
            return panelType;
        } else {
            console.warn(`⚠️ Invalid panel type from Gemini: ${panelType}, defaulting to screen`);
            return 'screen';
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`Gemini Panel Type API timed out after ${GEMINI_TIMEOUT_MS / 1000}s`);
        } else {
            console.error('Gemini Panel Type API failed:', err);
            // Check if error message contains billing/quota keywords
            const errorMessage = err.message || '';
            if (isGeminiBillingError(0, errorMessage)) {
                console.error('⚠️ Gemini billing/quota error detected in catch block');
                if (tracker && tracker._broadcast) {
                    await tracker._broadcast({ 
                        type: 'show_gemini_billing_error' 
                    });
                }
            }
        }
        return 'screen'; // Default to screen on error
    }
}

export async function askGeminiForActionRename(croppedImageB64, actionMetadata, tracker = null) {
    if (!croppedImageB64) return null;

    const { ENV } = await import('../config/env.js');

    const prompt =
        'Phân tích hình ảnh UI element này và metadata hiện tại để đề xuất thông tin chính xác:\n' +
        '\n' +
        '**Metadata hiện tại:**\n' +
        `- action_name: "${actionMetadata.action_name}"\n` +
        `- action_type: "${actionMetadata.action_type}"\n` +
        `- action_verb: "${actionMetadata.action_verb}"\n` +
        `- action_content: "${actionMetadata.action_content || ''}"\n` +
        '\n' +
        '**Yêu cầu:**\n' +
        '1. Phân tích hình ảnh để xác định:\n' +
        '   - Nếu metadata ĐÃ CHÍNH XÁC và RÕ RÀNG (tên mô tả đúng chức năng, type đúng, verb đúng): Trả lại Y NGUYÊN metadata hiện tại.\n' +
        '   - Nếu metadata CHƯA CHÍNH XÁC hoặc TÊN MƠ HỒ (như "a", "div", "button", "textarea", hoặc placeholder text dài): Đề xuất thông tin chính xác hơn.\n' +
        '\n' +
        '2. Quy tắc đặt tên `action_name` (BẮT BUỘC 2-4 từ, ngắn gọn, dễ hiểu):\n' +
        '   - KHÔNG dùng tên 1 từ đơn (VD: KHÔNG "Save", "Type", "button"...)\n' +
        '   - Phân tích element trong ảnh và chọn cấu trúc phù hợp:\n' +
        '\n' +
        '   **Loại Button:**\n' +
        '   - Cấu trúc: ĐỘNG TỪ + Button/đối tượng\n' +
        '   - VD: "Save Button", "Upload Video", "Close Dialog", "Delete File"\n' +
        '\n' +
        '   **Loại Input/Textarea:**\n' +
        '   - Cấu trúc: MỤC ĐÍCH + Input/Field/Prompt\n' +
        '   - VD: "Email Input", "Prompt Input", "Search Input", "Password Field"\n' +
        '\n' +
        '   **Loại Banner/Notification:**\n' +
        '   - Cấu trúc: LOẠI + Banner/Notification\n' +
        '   - VD: "Announcement Banner", "Notification Banner", "Success Alert", "Warning Banner"\n' +
        '   - Banner có nội dung "Veo 3.1 & Sora 2 are now live" → "Announcement Banner"\n' +
        '\n' +
        '   **Loại Icon:**\n' +
        '   - Cấu trúc: CHỨC NĂNG + Icon\n' +
        '   - VD: "Search Icon", "Close Icon", "Menu Icon", "Download Icon"\n' +
        '\n' +
        '   **Loại Logo/Image:**\n' +
        '   - Cấu trúc: TÊN BRAND/MÔ TẢ + Logo/Image\n' +
        '   - VD: "Invideo Logo", "Profile Image", "Brand Logo", "User Avatar"\n' +
        '\n' +
        '   **Loại Link/Text:**\n' +
        '   - Cấu trúc: MÔ TẢ + Link/Text\n' +
        '   - VD: "Terms Link", "Privacy Text", "Help Link"\n' +
        '\n' +
        '3. Các trường khác:\n' +
        '   - `action_type`: Chọn từ ["button", "input field", "dropdown menu", "draggable item", "textarea"]\n' +
        '   - `action_verb`: Chọn từ ["click", "type", "dragdrop", "paste"]\n' +
        '   - `action_content`: Nội dung placeholder hoặc text hiển thị (nếu có), để trống "" nếu không có\n' +
        '\n' +
        '**Ví dụ response tốt:**\n' +
        '{\n' +
        '  "action_name": "Type Video Prompt",\n' +
        '  "action_type": "textarea",\n' +
        '  "action_verb": "type",\n' +
        '  "action_content": "Type your idea and watch it come to life in minutes"\n' +
        '}';

    const responseSchema = {
        type: "object",
        required: ["action_name", "action_type", "action_verb"],
        properties: {
            action_name: { type: "string" },
            action_type: { type: "string" },
            action_verb: { type: "string" },
            action_content: { type: "string" }
        }
    };

    const requestBody = {
        contents: [{
            parts: [
                { text: prompt },
                {
                    inline_data: {
                        mime_type: 'image/png',
                        data: croppedImageB64
                    }
                }
            ]
        }],
        generation_config: {
            response_mime_type: 'application/json',
            response_schema: responseSchema
        }
    };

    try {
        const modelName = ENV.GEMINI_MODEL_REST || 'gemini-2.5-flash';
        const response = await fetchGeminiWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'x-goog-api-key': ENV.GEMINI_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error response:', errorText);
            
            // Check for billing/quota errors
            if (isGeminiBillingError(response.status, errorText)) {
                console.error('⚠️ Gemini billing/quota error detected in askGeminiForActionRename');
                if (tracker && tracker._broadcast) {
                    await tracker._broadcast({ 
                        type: 'show_gemini_billing_error' 
                    });
                }
            }
            
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('🤖 Gemini Rename Response received');

        let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonText) {
            console.warn('No text in Gemini rename response');
            return null;
        }

        jsonText = jsonText.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```/, '')
            .replace(/```$/i, '');

        const result = JSON.parse(jsonText);
        return result;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`Gemini Rename API timed out after ${GEMINI_TIMEOUT_MS / 1000}s`);
        } else {
            console.error('Gemini Rename API failed:', err);
            // Check if error message contains billing/quota keywords
            const errorMessage = err.message || '';
            if (isGeminiBillingError(0, errorMessage)) {
                console.error('⚠️ Gemini billing/quota error detected in catch block');
                if (tracker && tracker._broadcast) {
                    await tracker._broadcast({ 
                        type: 'show_gemini_billing_error' 
                    });
                }
            }
        }
        return null;
    }
}

/**
 * Detect action purpose using Gemini
 * @param {object} doingStepInfo - Step info object containing panel_before, action, panel_after details
 * @param {(string|null)[]} imageUrls - Array of 3 URLs in order: [panel_before_fullscreen, action_url, panel_after_fullscreen]; null/empty entries are skipped
 * @returns {Promise<object|null>} - {step_purpose, action_purpose, panel_after_name, reason} or null on error
 */
export async function detectActionPurpose(doingStepInfo, imageUrls) {
    if (!doingStepInfo) return null;

    const { ENV } = await import('../config/env.js');

    // Mark as Done: không có panel_after, chỉ dùng panel_before và action để nhận diện purpose
    const isMarkAsDone = (doingStepInfo.panel_after_name === 'None' || !doingStepInfo.panel_after_fullscreen);

    const prompt = isMarkAsDone
        ? `Bạn nhận được
DoingStepInfo: ${JSON.stringify(doingStepInfo, null, 2)}

Trường hợp "Mark as Done": không có màn hình sau thao tác (panel_after). Chỉ cần quan tâm:
+ panel_before: màn hình trước khi thao tác (ảnh 1 = panel_before_fullscreen).
+ action: thao tác người dùng (ảnh 2 = action). Mô tả action_name, action_type, action_verb.

Mục tiêu: Chỉ rõ mục đích của action dựa trên panel_before và action.

Nhiệm vụ:
Bước 1: Xem kỹ mô tả DoingStepInfo và các hình ảnh (chỉ có ảnh 1 = panel_before_fullscreen, ảnh 2 = action).
Bước 2: Mô tả ngắn gọn mục đích action trong step này để làm gì bằng tiếng Anh - tối đa 15 từ (step_purpose).
Bước 3: Tổng quát hóa mục đích action bằng tiếng Anh - tối đa 15 từ (action_purpose).

Kết quả trả về đúng định dạng JSON:
1. step_purpose: mục đích action trong step này để làm gì bằng tiếng Anh - tối đa 15 từ.
2. action_purpose: mục đích tổng quát của action bằng tiếng Anh - tối đa 15 từ.
3. panel_after_name: luôn trả về "None" (vì không có panel sau thao tác).
4. reason: giải thích rõ lý do bằng tiếng Việt.`
        : `Bạn nhận được
DoingStepInfo: ${JSON.stringify(doingStepInfo, null, 2)}

Định nghĩa DoingStepInfo: là thông tin mô tả lại một thao tác của người dùng trên website của ai_tool_name. Trong đó:
+ panel_before: là chỉ màn hình/popup/newtab trước khi thao tác.
+ panel_before_fullscreen: chứa link ảnh fullscreen của panel_before
+ action: là mô tả thao tác của người dùng, trong đó action_purpose mô tả mục đích tổng hợp của action. Ví dụ step1 purpose là export file ảnh, step2 purpose là export file video, action cùng là export thì action_purpose này sẽ ví dụ sẽ có mô tả là export tài nguyên (ảnh, video).
+ panel_after: là chỉ màn hình/popup/newtab sau khi thao tác.
+ panel_after_fullscreen: chứa link ảnh fullscreen của panel_after

Mục tiêu: Tôi cần chỉ rõ ràng mục đích của action để làm gì và chỉ rõ tên của panel_after.

Nhiệm vụ của bạn:
Bước 1: Hãy xem kỹ mô tả DoingStepInfo và các hình ảnh (theo thứ tự: ảnh 1 = panel_before_fullscreen, ảnh 2 = action, ảnh 3 = panel_after_fullscreen).
Bước 2: Mô tả ngắn gọn bắt buộc nêu rõ mục đích action của người dùng trong step này để làm gì bằng tiếng Anh - tối đa 15 từ. Gọi là step_purpose.
Bước 3: Mô tả ngắn gọn tên panel_after bằng tiếng Anh - tối đa 15 từ.

Kết quả trả về đúng định dạng JSON:
1. step_purpose: mục đích action của người dùng trong step này để làm gì bằng tiếng Anh - tối đa 15 từ.
2. action_purpose: mục đích tổng quát hóa của action này để làm gì bằng tiếng Anh - tối đa 15 từ.
4. panel_after_name: tên panel_after bằng tiếng Anh (xóa chữ "Panel" phía sau) - tối đa 15 từ.
5. reason: giải thích rõ lý do bằng tiếng Việt`;

    const responseSchema = {
        type: "object",
        required: ["step_purpose", "action_purpose", "panel_after_name", "reason"],
        properties: {
            step_purpose: { type: "string" },
            action_purpose: { type: "string" },
            panel_after_name: { type: "string" },
            reason: { type: "string" }
        }
    };

    // Build parts with text prompt and images
    const parts = [{ text: prompt }];
    
    // Fullscreen image max height: crop if taller to avoid Gemini limits
    const MAX_HEIGHT = 3240;

    // Labels so Gemini knows which image is which (order: panel_before, action, panel_after)
    const IMAGE_LABELS = ['panel_before_fullscreen', 'action', 'panel_after_fullscreen'];

    // Add images from URLs if available; crop fullscreen if height > MAX_HEIGHT
    if (imageUrls && Array.isArray(imageUrls)) {
        const sharp = (await import('sharp')).default;
        for (let i = 0; i < imageUrls.length; i++) {
            const url = imageUrls[i];
            if (!url || typeof url !== 'string') continue;
            const label = IMAGE_LABELS[i] ?? `image_${i + 1}`;
            // Add text part so Gemini knows which image is which
            parts.push({ text: `\n[Hình ảnh: ${label}]\n` });
            let base64 = null;
            let mimeTypeFromSource = 'image/jpeg';
            try {
                if (url.startsWith('data:')) {
                    const match = url.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        mimeTypeFromSource = match[1] || 'image/png';
                        base64 = match[2];
                    }
                } else if (url.startsWith('http')) {
                    const imageResponse = await fetch(url);
                    if (!imageResponse.ok) continue;
                    const imageBuffer = await imageResponse.arrayBuffer();
                    base64 = Buffer.from(imageBuffer).toString('base64');
                } else {
                    continue;
                }
                if (!base64) continue;
                let buf = Buffer.from(base64, 'base64');
                const metadata = await sharp(buf).metadata();
                const imageHeight = metadata.height || 0;
                const imageWidth = metadata.width || 0;
                let mimeType = mimeTypeFromSource;
                if (imageHeight > MAX_HEIGHT && imageWidth > 0) {
                    const croppedBase64 = await cropBase64Image(base64, {
                        x: 0,
                        y: 0,
                        w: imageWidth,
                        h: MAX_HEIGHT
                    });
                    if (croppedBase64) {
                        base64 = croppedBase64;
                        mimeType = 'image/png'; // cropBase64Image returns PNG
                    }
                }
                parts.push({
                    inline_data: {
                        mime_type: mimeType,
                        data: base64
                    }
                });
            } catch (err) {
                console.warn('detectActionPurpose: process image failed, using file_uri:', err?.message);
                parts.push({
                    file_data: {
                        mime_type: 'image/jpeg',
                        file_uri: url
                    }
                });
            }
        }
    }

    const requestBody = {
        contents: [{
            parts: parts
        }],
        generation_config: {
            response_mime_type: 'application/json',
            response_schema: responseSchema
        }
    };

    try {
        const modelName = ENV.GEMINI_MODEL_REST || 'gemini-2.5-flash';
        
        const response = await fetchGeminiWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'x-goog-api-key': ENV.GEMINI_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini DetectActionPurpose API error response:', errorText);
            
            // Check for billing/quota errors
            if (isGeminiBillingError(response.status, errorText)) {
                console.error('⚠️ Gemini billing/quota error detected');
                if (tracker && tracker._broadcast) {
                    await tracker._broadcast({ 
                        type: 'show_gemini_billing_error' 
                    });
                }
            }
            
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('🎯 Gemini DetectActionPurpose Response received');

        let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonText) {
            console.warn('No text in Gemini DetectActionPurpose response');
            return null;
        }

        jsonText = jsonText.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```/, '')
            .replace(/```$/i, '');

        const result = JSON.parse(jsonText);
        console.log('🎯 DetectActionPurpose result:', result);
        return result;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`Gemini DetectActionPurpose API timed out after ${GEMINI_TIMEOUT_MS / 1000}s`);
        } else {
            console.error('Gemini DetectActionPurpose API failed:', err);
            // Check if error message contains billing/quota keywords
            const errorMessage = err.message || '';
            if (isGeminiBillingError(0, errorMessage)) {
                console.error('⚠️ Gemini billing/quota error detected in catch block');
                // Note: tracker not available in this function context
            }
        }
        return null;
    }
}

/**
 * Detect important actions by matching them with modality_stacks using Gemini AI
 * @param {Object} tracker - The tracker instance
 * @param {string} panelImageUrl - Panel image URL or base64 string
 * @param {Array<{item_id: string, name: string}>} actions - List of actions with item_id and name
 * @param {Array} aiToolModalityStacks - List of modality_stacks from database
 * @returns {Promise<Array<{item_id: string, modality_stacks: string[]}>>} Array of actions with their modality_stacks
 */
export async function detectImportantActions(tracker, panelImageUrl, actions, aiToolModalityStacks) {
    if (!panelImageUrl || !actions || !Array.isArray(actions) || actions.length === 0) {
        console.warn('⚠️ detectImportantActions: Missing required parameters');
        return [];
    }

    if (!aiToolModalityStacks || !Array.isArray(aiToolModalityStacks) || aiToolModalityStacks.length === 0) {
        console.warn('⚠️ detectImportantActions: No modality_stacks provided, returning empty arrays');
        // Return empty modality_stacks for all actions
        return actions.map(action => ({ item_id: action.item_id, modality_stacks: [] }));
    }

    // Log input data for debugging
    console.log('🔍 detectImportantActions: Starting detection');
    console.log('📊 Input data summary:', {
        actionsCount: actions.length,
        modalityStacksCount: aiToolModalityStacks.length,
        panelImageUrlType: panelImageUrl.startsWith('http') ? 'URL' : 'base64',
        panelImageUrlLength: panelImageUrl.length
    });

    // Check for special characters in actions
    try {
        const actionsStr = JSON.stringify(actions);
        const hasSpecialChars = /[^\x20-\x7E\u00A0-\uFFFF]/.test(actionsStr);
        if (hasSpecialChars) {
            console.warn('⚠️ detectImportantActions: Special characters detected in actions data');
            // Log problematic characters
            const specialChars = actionsStr.match(/[^\x20-\x7E\u00A0-\uFFFF]/g);
            if (specialChars) {
                console.warn('⚠️ Special characters found:', Array.from(new Set(specialChars)).map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`));
            }
        }
        console.log('📝 Actions data (first 500 chars):', actionsStr.substring(0, 500));
    } catch (err) {
        console.error('❌ detectImportantActions: Error stringifying actions:', err);
    }

    // Check for special characters in aiToolModalityStacks
    try {
        const modalityStacksStr = JSON.stringify(aiToolModalityStacks);
        const hasSpecialChars = /[^\x20-\x7E\u00A0-\uFFFF]/.test(modalityStacksStr);
        if (hasSpecialChars) {
            console.warn('⚠️ detectImportantActions: Special characters detected in modality_stacks data');
            // Log problematic characters
            const specialChars = modalityStacksStr.match(/[^\x20-\x7E\u00A0-\uFFFF]/g);
            if (specialChars) {
                console.warn('⚠️ Special characters found:', Array.from(new Set(specialChars)).map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`));
            }
        }
        console.log('📝 Modality stacks data (first 500 chars):', modalityStacksStr.substring(0, 500));
        
        // Log each modality stack code and name for debugging
        aiToolModalityStacks.forEach((ms, idx) => {
            console.log(`📋 Modality stack [${idx}]:`, {
                code: ms.code,
                name: ms.name?.substring(0, 100),
                descriptionLength: ms.description?.length || 0,
                exampleLength: ms.example?.length || 0
            });
        });
    } catch (err) {
        console.error('❌ detectImportantActions: Error stringifying modality_stacks:', err);
    }

    const { ENV } = await import('../config/env.js');

    // Sanitize data before stringifying to avoid JSON issues
    const sanitizeForJSON = (obj) => {
        try {
            // Deep clone to avoid mutating original
            const cloned = JSON.parse(JSON.stringify(obj));
            return cloned;
        } catch (err) {
            console.warn('⚠️ Failed to sanitize data, using original:', err);
            return obj;
        }
    };

    // Sanitize actions and modality_stacks
    let sanitizedActions, sanitizedModalityStacks;
    try {
        sanitizedActions = sanitizeForJSON(actions);
        sanitizedModalityStacks = sanitizeForJSON(aiToolModalityStacks);
        console.log('✅ Data sanitized successfully');
    } catch (sanitizeErr) {
        console.error('❌ Failed to sanitize data:', sanitizeErr);
        sanitizedActions = actions;
        sanitizedModalityStacks = aiToolModalityStacks;
    }

    // Build prompt with sanitized data
    let actionsJsonStr, modalityStacksJsonStr;
    try {
        actionsJsonStr = JSON.stringify(sanitizedActions, null, 2);
        modalityStacksJsonStr = JSON.stringify(sanitizedModalityStacks, null, 2);
        console.log('✅ JSON stringified successfully', {
            actionsJsonLength: actionsJsonStr.length,
            modalityStacksJsonLength: modalityStacksJsonStr.length
        });
    } catch (stringifyErr) {
        console.error('❌ Failed to stringify data for prompt:', stringifyErr);
        // Fallback: use simplified format
        actionsJsonStr = JSON.stringify(sanitizedActions.map(a => ({ item_id: a.item_id, name: a.name || '' })));
        modalityStacksJsonStr = JSON.stringify(sanitizedModalityStacks.map(ms => ({
            code: ms.code || '',
            name: ms.name || '',
            description: (ms.description || '').substring(0, 200),
            example: (ms.example || '').substring(0, 200)
        })));
        console.warn('⚠️ Using simplified format due to stringify error');
    }

    const prompt = `Bạn nhận được:
1. Hình ảnh panel của một trang web
2. Danh sách các actions (nút, link, input...) trên panel này với format: ${actionsJsonStr}
3. Danh sách các modality_stacks (tính năng quan trọng) của AI tool với đầy đủ thông tin: ${modalityStacksJsonStr}

Định nghĩa:
- **Action**: Là một phần tử tương tác trên panel (button, link, input field, dropdown, etc.) được xác định bởi item_id và name
- **Modality Stack**: Là một tính năng quan trọng của AI tool được định nghĩa sẵn trong hệ thống. Mỗi modality_stack có:
  - code: mã định danh (PHẢI dùng chính xác code này trong kết quả)
  - name: tên tính năng
  - description: mô tả chi tiết chức năng
  - example: ví dụ sử dụng cụ thể
  - main_feature_reason: lý do tại sao đây là tính năng quan trọng

Mục tiêu:
Xác định xem mỗi action trên panel có liên quan đến modality_stack nào không. Một action có thể liên quan đến nhiều modality_stacks hoặc không liên quan đến modality_stack nào.

QUY TRÌNH PHÂN TÍCH (PHẢI LÀM ĐÚNG TỪNG BƯỚC):

BƯỚC 1: XÁC ĐỊNH TẤT CẢ ACTIONS TRÊN HÌNH
- Xem kỹ hình ảnh panel
- Tìm và xác định vị trí của TẤT CẢ actions trong danh sách được cung cấp
- Đảm bảo không bỏ sót action nào
- Ghi nhận vị trí, kích thước, và ngữ cảnh xung quanh mỗi action

BƯỚC 2: PHÂN TÍCH CHI TIẾT TỪNG ACTION
Đối với MỖI action trong danh sách, thực hiện:
  2.1. Đọc tên action (name) - đây là thông tin quan trọng nhất
  2.2. Quan sát vị trí của action trên panel:
      - Action nằm ở đâu? (header, sidebar, main content, footer, popup, etc.)
      - Action có icon hay text gì không?
      - Action có màu sắc, style đặc biệt gì không?
  2.3. Phân tích ngữ cảnh:
      - Text/label xung quanh action là gì?
      - Action nằm trong section/menu nào?
      - Có tooltip hoặc hint text nào không?
  2.4. Suy luận chức năng:
      - Dựa trên tên, vị trí, ngữ cảnh, action này có thể làm gì?
      - Action này có phải là tính năng chính hay phụ không?

BƯỚC 3: SO SÁNH VỚI MODALITY_STACKS
Đối với MỖI action, so sánh với TẤT CẢ modality_stacks trong danh sách:
  3.1. Đọc kỹ từng modality_stack:
      - Đọc code (để nhớ chính xác)
      - Đọc name (tên tính năng)
      - Đọc description (mô tả chi tiết chức năng)
      - Đọc example (ví dụ cụ thể về cách sử dụng)
      - Đọc main_feature_reason (lý do quan trọng)
  
  3.2. Kiểm tra matching criteria (PHẢI THỎA ÍT NHẤT 2/4):
      ✓ Tên action có khớp hoặc liên quan đến name/description của modality_stack không?
      ✓ Chức năng của action có khớp với description/example của modality_stack không?
      ✓ Ngữ cảnh của action có phù hợp với main_feature_reason không?
      ✓ Example của modality_stack có mô tả action tương tự không?
  
  3.3. Quyết định:
      - Nếu THỎA ít nhất 1/4 criteria → Đánh dấu action này liên quan đến modality_stack này
      - Nếu KHÔNG THỎA → KHÔNG đánh dấu
      - Nếu KHÔNG CHẮC CHẮN → KHÔNG đánh dấu (ưu tiên false negative hơn false positive)

BƯỚC 4: KIỂM TRA LẠI KẾT QUẢ
Trước khi trả về kết quả, kiểm tra:
  4.1. Đã xử lý TẤT CẢ actions trong danh sách chưa?
  4.2. Mỗi action có được gán đúng item_id chưa?
  4.3. Các code của modality_stacks có chính xác (không sai chính tả) không?
  4.4. Có action nào bị bỏ sót không?
  4.5. Có modality_stack nào bị gán nhầm không?

BƯỚC 5: TRẢ VỀ KẾT QUẢ
- Tạo mảng kết quả với TẤT CẢ actions trong danh sách
- Mỗi action phải có:
  - item_id: chính xác ID của action
  - modality_stacks: mảng các code (string) của modality_stacks liên quan
    + Nếu có liên quan: ["code1", "code2", ...]
    + Nếu không liên quan: [] (mảng rỗng)
  - reason: Lý do lựa chọn (string) - BẮT BUỘC viết bằng tiếng Việt, giải thích tại sao action này được gán các modality_stacks này
    + Nếu có modality_stacks: Giải thích rõ ràng lý do tại sao action này liên quan đến từng modality_stack (dựa trên matching criteria đã thỏa) - BẮT BUỘC bằng tiếng Việt
    + Nếu không có modality_stacks: Giải thích tại sao action này không liên quan đến bất kỳ modality_stack nào - BẮT BUỘC bằng tiếng Việt
    + Ví dụ: "Action này liên quan đến export_image vì tên action là 'Export Image' khớp với name của modality_stack và chức năng xuất file ảnh phù hợp với description"
- Đảm bảo số lượng items trong kết quả = số lượng actions trong input

QUY TẮC QUAN TRỌNG:
1. PHẢI xử lý TẤT CẢ actions - không được bỏ sót action nào
2. PHẢI dùng chính xác code của modality_stack (không tự tạo code mới)
3. CHỈ đánh dấu khi CHẮC CHẮN (thỏa ít nhất 2/4 matching criteria)
4. Nếu KHÔNG CHẮC CHẮN → trả về [] (mảng rỗng)
5. KHÔNG được bịa đặt hoặc đoán mò
6. Một action có thể có nhiều modality_stacks nếu thỏa nhiều criteria
7. Ưu tiên chính xác hơn đầy đủ (false negative tốt hơn false positive)
8. PHẢI cung cấp reason rõ ràng BẰNG TIẾNG VIỆT cho mỗi action, giải thích dựa trên matching criteria đã phân tích. KHÔNG được viết bằng tiếng Anh.

Kết quả trả về đúng định dạng JSON:
Một mảng các object, mỗi object có:
- item_id: ID của action (string) - PHẢI khớp với item_id trong input
- modality_stacks: Mảng các code (string) của modality_stacks mà action này liên quan. Nếu không có thì trả về mảng rỗng []
- reason: Lý do lựa chọn (string) - BẮT BUỘC viết bằng tiếng Việt, giải thích rõ ràng tại sao action này được gán các modality_stacks này hoặc tại sao không có modality_stacks. KHÔNG được viết bằng tiếng Anh.

LƯU Ý CUỐI CÙNG:
- Đảm bảo số lượng items trong kết quả = số lượng actions trong danh sách input
- Mỗi item_id trong kết quả phải tồn tại trong danh sách actions input
- Tất cả code trong modality_stacks phải tồn tại trong danh sách modality_stacks input
- Nếu không chắc chắn về bất kỳ action nào, hãy trả về [] cho action đó và giải thích lý do trong reason`;

    const responseSchema = {
        type: "array",
        items: {
            type: "object",
            required: ["item_id", "modality_stacks", "reason"],
            properties: {
                item_id: {
                    type: "string",
                    description: "ID của action"
                },
                modality_stacks: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "Danh sách code của modality_stacks mà action này liên quan. Nếu không có thì trả về mảng rỗng []"
                },
                reason: {
                    type: "string",
                    description: "Lý do lựa chọn - giải thích rõ ràng tại sao action này được gán các modality_stacks này hoặc tại sao không có modality_stacks. PHẢI viết bằng tiếng Việt."
                }
            }
        }
    };

    // Build parts with text prompt and image
    const parts = [{ text: prompt }];
    
    // Handle image input - check if it's URL or base64
    const isUrl = panelImageUrl.startsWith('http://') || panelImageUrl.startsWith('https://');
    
    // Log image URL info for debugging
    console.log('🖼️ Image input info:', {
        isUrl: isUrl,
        urlLength: panelImageUrl.length,
        urlPreview: isUrl ? panelImageUrl.substring(0, 100) : 'base64 data',
        urlType: isUrl ? 'file_uri' : 'inline_data'
    });
    
    // Process image: download if URL, then crop if too large, then resize
    let processedBase64 = null;
    const sharp = (await import('sharp')).default;
    const MAX_HEIGHT = 3240;
    
    try {
        if (isUrl) {
            // Validate URL format
            try {
                const urlObj = new URL(panelImageUrl);
                console.log('✅ Image URL is valid:', {
                    protocol: urlObj.protocol,
                    hostname: urlObj.hostname,
                    pathname: urlObj.pathname.substring(0, 50)
                });
            } catch (urlErr) {
                console.error('❌ Invalid image URL format:', urlErr);
                throw new Error(`Invalid image URL format: ${urlErr.message}`);
            }
            
            // Download image from URL
            console.log('📥 Downloading image from URL...');
            const imageResponse = await fetch(panelImageUrl);
            if (!imageResponse.ok) {
                throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
            }
            const imageBuffer = await imageResponse.arrayBuffer();
            const imageBase64 = Buffer.from(imageBuffer).toString('base64');
            processedBase64 = imageBase64;
            console.log('✅ Image downloaded successfully');
        } else {
            // Use base64 directly
            // Remove data URL prefix if present
            let base64Data = panelImageUrl;
            if (base64Data.includes(',')) {
                base64Data = base64Data.split(',')[1];
            }
            processedBase64 = base64Data;
        }
        
        // Get image metadata to check size
        const imageBuffer = Buffer.from(processedBase64, 'base64');
        const metadata = await sharp(imageBuffer).metadata();
        const imageWidth = metadata.width;
        const imageHeight = metadata.height;
        
        console.log('📐 Image dimensions:', {
            width: imageWidth,
            height: imageHeight,
            size: (imageBuffer.length / (1024 * 1024)).toFixed(2) + ' MB'
        });
        
        // Crop if height > MAX_HEIGHT
        if (imageHeight > MAX_HEIGHT) {
            console.log(`✂️ Image height (${imageHeight}) exceeds max (${MAX_HEIGHT}), cropping...`);
            try {
                const cropPos = {
                    x: 0,
                    y: 0,
                    w: imageWidth,
                    h: MAX_HEIGHT
                };
                const croppedBase64 = await cropBase64Image(processedBase64, cropPos);
                
                // Verify cropped result is valid
                if (croppedBase64 && croppedBase64 !== processedBase64) {
                    processedBase64 = croppedBase64;
                    console.log(`✅ Image cropped to height ${MAX_HEIGHT}`);
                    
                    // Verify cropped size
                    const croppedBuffer = Buffer.from(processedBase64, 'base64');
                    const croppedMetadata = await sharp(croppedBuffer).metadata();
                    console.log('📐 Cropped image dimensions:', {
                        width: croppedMetadata.width,
                        height: croppedMetadata.height,
                        size: (croppedBuffer.length / (1024 * 1024)).toFixed(2) + ' MB'
                    });
                } else {
                    console.warn('⚠️ Crop returned same image, skipping crop');
                }
            } catch (cropErr) {
                console.error('❌ Failed to crop image, continuing with original:', cropErr);
                // Continue with original image, resize will handle it
            }
        }
        
        // Resize image for Gemini (max width 640, maintain aspect ratio)
        const resizedBase64 = await resizeBase64(processedBase64, 640);
        
        // Verify final size
        const finalBuffer = Buffer.from(resizedBase64, 'base64');
        const finalMetadata = await sharp(finalBuffer).metadata();
        console.log('📐 Final image dimensions:', {
            width: finalMetadata.width,
            height: finalMetadata.height,
            size: (finalBuffer.length / (1024 * 1024)).toFixed(2) + ' MB'
        });
        
        // Use inline_data for processed base64
        parts.push({
            inline_data: {
                mime_type: 'image/png',
                data: resizedBase64
            }
        });
        
        console.log('✅ Image processed and added to request');
    } catch (imageErr) {
        console.error('❌ Failed to process image:', imageErr);
        // Fallback: try to use original URL if it was a URL
        if (isUrl) {
            console.warn('⚠️ Falling back to file_uri method');
            parts.push({
                file_data: {
                    mime_type: 'image/jpeg',
                    file_uri: panelImageUrl
                }
            });
        } else {
            // For base64, try to use original
            let base64Data = panelImageUrl;
            if (base64Data.includes(',')) {
                base64Data = base64Data.split(',')[1];
            }
            const resizedBase64 = await resizeBase64(base64Data, 640);
            parts.push({
                inline_data: {
                    mime_type: 'image/png',
                    data: resizedBase64
                }
            });
        }
    }

    const requestBody = {
        contents: [{
            parts: parts
        }],
        generation_config: {
            response_mime_type: 'application/json',
            response_schema: responseSchema
        }
    };

    try {
        // Log request body info before stringifying
        console.log('📦 Building request body...');
        console.log('📊 Request body structure:', {
            hasContents: !!requestBody.contents,
            contentsLength: requestBody.contents?.length || 0,
            hasParts: !!requestBody.contents?.[0]?.parts,
            partsCount: requestBody.contents?.[0]?.parts?.length || 0,
            hasTextPart: !!requestBody.contents?.[0]?.parts?.[0]?.text,
            textPartLength: requestBody.contents?.[0]?.parts?.[0]?.text?.length || 0,
            hasImagePart: !!requestBody.contents?.[0]?.parts?.[1],
            imagePartType: requestBody.contents?.[0]?.parts?.[1]?.file_data ? 'file_data' : 
                          requestBody.contents?.[0]?.parts?.[1]?.inline_data ? 'inline_data' : 'none'
        });

        // Try to stringify request body and check for issues
        let requestBodyStr;
        try {
            requestBodyStr = JSON.stringify(requestBody);
            console.log('✅ Request body stringified successfully');
            console.log('📏 Request body size:', {
                totalSize: requestBodyStr.length,
                totalSizeKB: (requestBodyStr.length / 1024).toFixed(2) + ' KB',
                totalSizeMB: (requestBodyStr.length / (1024 * 1024)).toFixed(2) + ' MB'
            });
            
            // Check for special characters in request body
            const hasSpecialChars = /[^\x20-\x7E\u00A0-\uFFFF]/.test(requestBodyStr);
            if (hasSpecialChars) {
                console.warn('⚠️ detectImportantActions: Special characters detected in request body');
                const specialChars = requestBodyStr.match(/[^\x20-\x7E\u00A0-\uFFFF]/g);
                if (specialChars) {
                    const uniqueChars = Array.from(new Set(specialChars));
                    console.warn('⚠️ Special characters in request body:', uniqueChars.map(c => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`));
                }
            }
            
            // Log first 1000 chars of request body for debugging
            console.log('📝 Request body preview (first 1000 chars):', requestBodyStr.substring(0, 1000));
        } catch (stringifyErr) {
            console.error('❌ detectImportantActions: Failed to stringify request body:', stringifyErr);
            console.error('❌ Stringify error details:', {
                message: stringifyErr.message,
                stack: stringifyErr.stack,
                name: stringifyErr.name
            });
            throw new Error(`Failed to stringify request body: ${stringifyErr.message}`);
        }

        // Use gemini-2.5-pro for this task (recommended for accuracy)
        const modelName = process.env.GEMINI_MODEL_IMPORTANT || 'gemini-2.5-flash';
        
        console.log('🚀 Sending request to Gemini API...', {
            model: modelName,
            url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
            requestBodySize: requestBodyStr.length
        });
        
        // Retry logic for 500 errors
        const maxRetries = 3;
        let lastError = null;
        let response = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                response = await fetchGeminiWithTimeout(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
                    {
                        method: 'POST',
                        headers: {
                            'x-goog-api-key': ENV.GEMINI_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        body: requestBodyStr
                    },
                    GEMINI_TIMEOUT_IMPORTANT_ACTIONS_MS
                );
                
                // If not 500 error, break retry loop
                if (response.status !== 500) {
                    break;
                }
                
                // If 500 error and not last attempt, retry
                if (attempt < maxRetries) {
                    const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                    console.warn(`⚠️ Got 500 error, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})...`);
                    await sleep(retryDelay);
                    continue;
                }
                
                // Last attempt with 500 error, break to handle it
                break;
            } catch (fetchErr) {
                lastError = fetchErr;
                // If timeout or network error and not last attempt, retry
                if (attempt < maxRetries && (fetchErr.name === 'AbortError' || fetchErr.message.includes('fetch'))) {
                    const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.warn(`⚠️ Request failed, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})...`, fetchErr.message);
                    await sleep(retryDelay);
                    continue;
                }
                // Re-throw if last attempt or non-retryable error
                throw fetchErr;
            }
        }
        
        // If we still have a 500 error after retries, log detailed info
        if (response && response.status === 500) {
            console.error('❌ Still getting 500 error after all retries');
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Gemini DetectImportantActions API error response:', {
                status: response.status,
                statusText: response.statusText,
                errorText: errorText,
                errorTextLength: errorText.length,
                errorTextPreview: errorText.substring(0, 1000)
            });
            
            // Log request details for debugging 500 errors
            if (response.status === 500) {
                console.error('❌ 500 Internal Server Error - Request details:', {
                    model: modelName,
                    requestBodySize: requestBodyStr.length,
                    actionsCount: actions.length,
                    modalityStacksCount: aiToolModalityStacks.length,
                    actionsPreview: actions.map(a => ({ item_id: a.item_id, name: a.name?.substring(0, 50) })),
                    modalityStacksCodes: aiToolModalityStacks.map(ms => ms.code),
                    imageUrlType: isUrl ? 'file_uri' : 'inline_data',
                    imageUrl: isUrl ? panelImageUrl.substring(0, 100) : 'base64 (hidden)',
                    promptLength: prompt.length,
                    partsCount: parts.length
                });
                
                // Log request body structure for debugging
                try {
                    const requestBodyParsed = JSON.parse(requestBodyStr);
                    console.error('❌ 500 Error - Request body structure:', {
                        hasContents: !!requestBodyParsed.contents,
                        contentsLength: requestBodyParsed.contents?.length || 0,
                        partsCount: requestBodyParsed.contents?.[0]?.parts?.length || 0,
                        textPartLength: requestBodyParsed.contents?.[0]?.parts?.[0]?.text?.length || 0,
                        imagePartType: requestBodyParsed.contents?.[0]?.parts?.[1]?.file_data ? 'file_data' : 
                                      requestBodyParsed.contents?.[0]?.parts?.[1]?.inline_data ? 'inline_data' : 'none',
                        imagePartFileUri: requestBodyParsed.contents?.[0]?.parts?.[1]?.file_data?.file_uri?.substring(0, 100) || 'N/A',
                        hasGenerationConfig: !!requestBodyParsed.generation_config
                    });
                } catch (parseErr) {
                    console.error('❌ Failed to parse request body for debugging:', parseErr);
                }
                
                // Try to identify problematic data
                try {
                    const actionsStr = JSON.stringify(actions);
                    const modalityStacksStr = JSON.stringify(aiToolModalityStacks);
                    console.error('❌ 500 Error - Data analysis:', {
                        actionsStringLength: actionsStr.length,
                        modalityStacksStringLength: modalityStacksStr.length,
                        actionsHasSpecialChars: /[^\x20-\x7E\u00A0-\uFFFF]/.test(actionsStr),
                        modalityStacksHasSpecialChars: /[^\x20-\x7E\u00A0-\uFFFF]/.test(modalityStacksStr),
                        actionsJsonValid: (() => {
                            try {
                                JSON.parse(actionsStr);
                                return true;
                            } catch { return false; }
                        })(),
                        modalityStacksJsonValid: (() => {
                            try {
                                JSON.parse(modalityStacksStr);
                                return true;
                            } catch { return false; }
                        })()
                    });
                } catch (analysisErr) {
                    console.error('❌ Failed to analyze data for 500 error:', analysisErr);
                }
            }
            
            // Check for billing/quota errors
            if (isGeminiBillingError(response.status, errorText)) {
                console.error('⚠️ Gemini billing/quota error detected');
                if (tracker && tracker._broadcast) {
                    await tracker._broadcast({ 
                        type: 'show_gemini_billing_error' 
                    });
                }
            }
            
            throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 500)}`);
        }

        const data = await response.json();

        let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!jsonText) {
            console.warn('⚠️ No text in Gemini DetectImportantActions response');
            // Return empty modality_stacks for all actions
            return actions.map(action => ({ 
                item_id: action.item_id, 
                modality_stacks: [],
                reason: 'Không có response từ Gemini'
            }));
        }

        jsonText = jsonText.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```/, '')
            .replace(/```$/i, '');

        let result;
        try {
            result = JSON.parse(jsonText);
            console.log('✅ Parsed JSON result:', JSON.stringify(result, null, 2));
        } catch (parseErr) {
            console.error('❌ Failed to parse JSON:', parseErr);
            return actions.map(action => ({ 
                item_id: action.item_id, 
                modality_stacks: [],
                reason: 'Lỗi khi parse JSON response'
            }));
        }
        
        // Validate and fix response
        if (!Array.isArray(result)) {
            console.warn('⚠️ DetectImportantActions: Response is not an array, returning empty arrays');
            return actions.map(action => ({ 
                item_id: action.item_id, 
                modality_stacks: [],
                reason: 'Response không đúng định dạng'
            }));
        }

        // Create a map for quick lookup
        const resultMap = new Map();
        result.forEach(item => {
            if (item.item_id && Array.isArray(item.modality_stacks)) {
                resultMap.set(item.item_id, {
                    modality_stacks: item.modality_stacks,
                    reason: item.reason || ''
                });
            }
        });

        // Ensure all actions are in the result, fill missing ones with []
        const finalResult = actions.map(action => {
            const resultItem = resultMap.get(action.item_id);
            const modalityStacks = resultItem?.modality_stacks || [];
            const reason = resultItem?.reason || 'Không có modality_stacks được phát hiện cho action này';
            return {
                item_id: action.item_id,
                modality_stacks: Array.isArray(modalityStacks) ? modalityStacks : [],
                reason: reason
            };
        });

        // Validate: check if all modality_stack codes exist in aiToolModalityStacks
        const validCodes = new Set(aiToolModalityStacks.map(ms => ms.code));
        
        const validatedResult = finalResult.map(item => ({
            item_id: item.item_id,
            modality_stacks: item.modality_stacks.filter(code => validCodes.has(code)),
            reason: item.reason
        }));

        // console.log('📊 Final validated result:', JSON.stringify(validatedResult, null, 2));
        
        return validatedResult;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`❌ Gemini DetectImportantActions API timed out after ${GEMINI_TIMEOUT_IMPORTANT_ACTIONS_MS / 1000}s`);
        } else {
            console.error('❌ Gemini DetectImportantActions API failed:', {
                name: err.name,
                message: err.message,
                stack: err.stack,
                errorType: err.constructor.name
            });
            
            // Log additional context for debugging
            console.error('❌ Error context:', {
                actionsCount: actions?.length || 0,
                modalityStacksCount: aiToolModalityStacks?.length || 0,
                panelImageUrlType: panelImageUrl?.startsWith('http') ? 'URL' : 'base64',
                panelImageUrlLength: panelImageUrl?.length || 0
            });
            
            // Check if error is related to JSON stringify
            if (err.message && (err.message.includes('stringify') || err.message.includes('JSON'))) {
                console.error('❌ JSON stringify error detected - checking data for problematic characters...');
                try {
                    const actionsStr = JSON.stringify(actions);
                    const modalityStacksStr = JSON.stringify(aiToolModalityStacks);
                    console.error('❌ Data that failed to stringify:', {
                        actionsLength: actionsStr.length,
                        modalityStacksLength: modalityStacksStr.length,
                        actionsPreview: actionsStr.substring(0, 500),
                        modalityStacksPreview: modalityStacksStr.substring(0, 500)
                    });
                } catch (stringifyErr) {
                    console.error('❌ Cannot stringify data for debugging:', stringifyErr);
                }
            }
            
            // Check if error message contains billing/quota keywords
            const errorMessage = err.message || '';
            if (isGeminiBillingError(0, errorMessage)) {
                console.error('⚠️ Gemini billing/quota error detected in catch block');
                if (tracker && tracker._broadcast) {
                    await tracker._broadcast({ 
                        type: 'show_gemini_billing_error' 
                    });
                }
            }
        }
        // Return empty modality_stacks for all actions on error
        return actions.map(action => ({ 
            item_id: action.item_id, 
            modality_stacks: [],
            reason: 'Lỗi khi detect modality_stacks'
        }));
    }
}

const GEMINI_TIMEOUT_MISSING_ACTIONS_MS = 300000; // 5 minutes for detectMissingActionsByAI

/**
 * Detect missing important actions on a panel by comparing existing actions with modality_stacks using Gemini AI
 * @param {string} panelImageUrl - Panel image URL or base64 string
 * @param {Object} panelInfo - { name, type, image_url }
 * @param {Array<{name: string, image_url: string, type: string, verb: string, purpose: string, modality_stacks: Array, modality_stacks_reason: string}>} actionInfoOfPanel - existing actions info
 * @param {Array} aiToolModalityStacks - List of modality_stacks from database
 * @returns {Promise<Array<{mising_action_name: string, mising_action_reason: string}>>} Array of missing actions
 */
export async function detectMissingActionsByAI(panelImageUrl, panelInfo, actionInfoOfPanel, aiToolModalityStacks) {
    if (!panelImageUrl) {
        console.warn('⚠️ detectMissingActionsByAI: Missing panelImageUrl');
        return [];
    }

    if (!aiToolModalityStacks || !Array.isArray(aiToolModalityStacks) || aiToolModalityStacks.length === 0) {
        console.warn('⚠️ detectMissingActionsByAI: No modality_stacks provided');
        return [];
    }

    console.log('🔍 detectMissingActionsByAI: Starting detection');
    console.log('📊 Input data summary:', {
        panelName: panelInfo?.name,
        panelType: panelInfo?.type,
        actionsCount: actionInfoOfPanel?.length || 0,
        modalityStacksCount: aiToolModalityStacks.length,
        panelImageUrlType: panelImageUrl.startsWith('http') ? 'URL' : 'base64'
    });

    const { ENV } = await import('../config/env.js');

    // Sanitize data
    const sanitizeForJSON = (obj) => {
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (err) {
            console.warn('⚠️ Failed to sanitize data, using original:', err);
            return obj;
        }
    };

    const sanitizedPanelInfo = sanitizeForJSON(panelInfo || {});
    const sanitizedActions = sanitizeForJSON(actionInfoOfPanel || []);
    const sanitizedModalityStacks = sanitizeForJSON(aiToolModalityStacks);

    let panelInfoJsonStr, actionsJsonStr, modalityStacksJsonStr;
    try {
        panelInfoJsonStr = JSON.stringify(sanitizedPanelInfo, null, 2);
        actionsJsonStr = JSON.stringify(sanitizedActions, null, 2);
        modalityStacksJsonStr = JSON.stringify(sanitizedModalityStacks, null, 2);
    } catch (stringifyErr) {
        console.error('❌ Failed to stringify data for prompt:', stringifyErr);
        panelInfoJsonStr = JSON.stringify({ name: panelInfo?.name || '', type: panelInfo?.type || '' });
        actionsJsonStr = JSON.stringify((actionInfoOfPanel || []).map(a => ({ name: a.name || '', type: a.type || '' })));
        modalityStacksJsonStr = JSON.stringify(aiToolModalityStacks.map(ms => ({ code: ms.code || '', name: ms.name || '', description: (ms.description || '').substring(0, 200) })));
    }

    const prompt = `Bạn nhận được:
1. Hình ảnh panel của một trang web
2. Thông tin panel: ${panelInfoJsonStr}
3. Danh sách các actions ĐÃ ĐƯỢC GHI NHẬN trong hệ thống (actionInfoOfPanel): ${actionsJsonStr}
   Mỗi action có: name, image_url (link ảnh của action), type, verb, purpose, modality_stacks (nếu có), modality_stacks_reason (nếu có)
4. Danh sách các modality_stacks (tính năng quan trọng) của AI tool: ${modalityStacksJsonStr}
   Mỗi modality_stack có: code, name, description, example, main_feature_reason

Định nghĩa:
- **Panel**: Là một màn hình/popup/newtab của trang web được xác định bởi name và type
- **Action**: Là một phần tử tương tác THỰC SỰ NHÌN THẤY ĐƯỢC trên panel (button, link, input field, dropdown, tab, menu item, icon button, toggle, etc.)
- **Modality Stack**: Là một tính năng quan trọng của AI tool được định nghĩa sẵn trong hệ thống
- **Important Action**: Là một action quan trọng nếu nó liên quan đến ít nhất một modality_stack. Một action được coi là liên quan đến modality_stack nếu THỎA ÍT NHẤT 1/4 tiêu chí sau:
  1. Tên action có khớp hoặc liên quan đến name/description của modality_stack
  2. Chức năng của action có khớp với description/example của modality_stack
  3. Ngữ cảnh của action có phù hợp với main_feature_reason của modality_stack
  4. Example của modality_stack có mô tả action tương tự

MỤC TIÊU:
Tìm các IMPORTANT ACTIONS mà:
- THỰC SỰ TỒN TẠI trên panel (NHÌN THẤY ĐƯỢC trong hình ảnh panel)
- NHƯNG CHƯA ĐƯỢC GHI NHẬN trong danh sách actionInfoOfPanel

QUAN TRỌNG: KHÔNG được bịa đặt hay tưởng tượng ra actions mới. CHỈ tìm actions mà bạn NHÌN THẤY RÕ RÀNG trong hình ảnh panel nhưng không có trong danh sách actionInfoOfPanel.

QUY TRÌNH PHÂN TÍCH (PHẢI LÀM ĐÚNG TỪNG BƯỚC):

BƯỚC 1: QUÉT TOÀN BỘ HÌNH ẢNH PANEL
- Xem kỹ hình ảnh panel để liệt kê TẤT CẢ các phần tử tương tác (interactive elements) NHÌN THẤY ĐƯỢC trên panel
- Bao gồm: buttons, links, input fields, dropdowns, tabs, menu items, icon buttons, toggles, checkboxes, sliders, etc.
- Ghi nhận tên/label/text của từng phần tử và vị trí của nó trên panel
- CHỈ liệt kê những gì bạn THỰC SỰ NHÌN THẤY trong ảnh, KHÔNG suy luận hay tưởng tượng

BƯỚC 2: ĐỐI CHIẾU VỚI actionInfoOfPanel
Với MỖI phần tử tương tác tìm thấy ở Bước 1, kiểm tra:
  2.1. Phần tử này đã có trong danh sách actionInfoOfPanel chưa?
      - So sánh tên/label với các name trong actionInfoOfPanel
      - So sánh vị trí/hình ảnh với các image_url trong actionInfoOfPanel
      - Nếu ĐÃ CÓ trong actionInfoOfPanel (trùng tên hoặc cùng chức năng) -> BỎ QUA, không cần xét tiếp
  2.2. Nếu phần tử CHƯA CÓ trong actionInfoOfPanel -> đánh dấu là "chưa ghi nhận"

BƯỚC 3: LỌC CÁC ACTIONS QUAN TRỌNG (IMPORTANT)
Với MỖI phần tử "chưa ghi nhận" từ Bước 2, kiểm tra:
  3.1. Phần tử này có liên quan đến ít nhất 1 modality_stack không? (theo 4 tiêu chí ở phần Định nghĩa)
  3.2. Nếu CÓ liên quan -> đây là MISSING IMPORTANT ACTION, thêm vào kết quả
  3.3. Nếu KHÔNG liên quan đến modality_stack nào -> BỎ QUA (action không quan trọng, không cần báo thiếu)

BƯỚC 4: KIỂM TRA LẠI KẾT QUẢ
Trước khi trả về, xác nhận lại với MỖI missing action:
  4.1. Action này có THỰC SỰ NHÌN THẤY trong hình ảnh panel không? (KHÔNG được bịa đặt)
  4.2. Action này CHẮC CHẮN chưa có trong actionInfoOfPanel? (kiểm tra lại lần nữa)
  4.3. Action này có thực sự liên quan đến modality_stack nào? (nêu rõ modality_stack nào)
  4.4. Có action nào bị trùng lặp không? (gộp lại nếu có)

BƯỚC 5: TRẢ VỀ KẾT QUẢ
- Mỗi missing action phải có:
  - mising_action_name: Tên/label của action NHÌN THẤY trên panel (string) - dùng đúng tên/text hiển thị trên giao diện
  - mising_action_reason: Lý do action này quan trọng (string) - viết bằng tiếng Việt, giải thích:
    + Action này nhìn thấy ở đâu trên panel (mô tả vị trí)
    + Action này liên quan đến modality_stack nào (nêu code và name)
    + Tại sao action này quan trọng

QUY TẮC QUAN TRỌNG:
1. CHỈ liệt kê actions mà bạn NHÌN THẤY TRỰC TIẾP trong hình ảnh panel
2. TUYỆT ĐỐI KHÔNG bịa đặt, suy luận, hay tưởng tượng ra actions không nhìn thấy trên giao diện
3. CHỈ liệt kê actions CHƯA CÓ trong actionInfoOfPanel
4. CHỈ liệt kê important actions (liên quan đến ít nhất 1 modality_stack)
5. Nếu KHÔNG CHẮC CHẮN action có tồn tại trên panel không -> KHÔNG liệt kê
6. Ưu tiên chính xác hơn đầy đủ (bỏ sót tốt hơn liệt kê sai)
7. Nếu không tìm thấy missing important action nào -> trả về mảng rỗng []
8. mising_action_name PHẢI dùng đúng tên/label hiển thị trên giao diện (không đặt tên mới)

Kết quả trả về đúng định dạng JSON:
Một mảng các object, mỗi object có:
- mising_action_name: Tên/label của action nhìn thấy trên panel nhưng chưa được ghi nhận (string)
- mising_action_reason: Lý do action này quan trọng, viết bằng tiếng Việt (string)

LƯU Ý CUỐI CÙNG:
- KHÔNG ĐƯỢC bịa đặt actions không nhìn thấy trên panel
- CHỈ trả về actions THỰC SỰ CÓ trên giao diện mà chưa có trong actionInfoOfPanel
- Nếu tất cả actions quan trọng trên panel đều đã có trong actionInfoOfPanel -> trả về mảng rỗng []`;

    const responseSchema = {
        type: "array",
        items: {
            type: "object",
            required: ["mising_action_name", "mising_action_reason"],
            properties: {
                mising_action_name: {
                    type: "string",
                    description: "Tên/label của action nhìn thấy trên panel nhưng chưa được ghi nhận trong actionInfoOfPanel"
                },
                mising_action_reason: {
                    type: "string",
                    description: "Lý do action này quan trọng (liên quan modality_stack nào) - viết bằng tiếng Việt"
                }
            }
        }
    };

    // Build parts with text prompt and image
    const parts = [{ text: prompt }];

    const isUrl = panelImageUrl.startsWith('http://') || panelImageUrl.startsWith('https://');

    // Process image: download if URL, then crop if too large, then resize
    let processedBase64 = null;
    const sharp = (await import('sharp')).default;
    const MAX_HEIGHT = 3240;

    try {
        if (isUrl) {
            console.log('📥 detectMissingActionsByAI: Downloading image from URL...');
            const imageResponse = await fetch(panelImageUrl);
            if (!imageResponse.ok) {
                throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
            }
            const imageBuffer = await imageResponse.arrayBuffer();
            processedBase64 = Buffer.from(imageBuffer).toString('base64');
            console.log('✅ Image downloaded successfully');
        } else {
            let base64Data = panelImageUrl;
            if (base64Data.includes(',')) {
                base64Data = base64Data.split(',')[1];
            }
            processedBase64 = base64Data;
        }

        // Get image metadata to check size
        const imageBuffer = Buffer.from(processedBase64, 'base64');
        const metadata = await sharp(imageBuffer).metadata();

        console.log('📐 detectMissingActionsByAI: Image dimensions:', {
            width: metadata.width,
            height: metadata.height,
            size: (imageBuffer.length / (1024 * 1024)).toFixed(2) + ' MB'
        });

        // Crop if height > MAX_HEIGHT
        if (metadata.height > MAX_HEIGHT) {
            console.log(`✂️ Image height (${metadata.height}) exceeds max (${MAX_HEIGHT}), cropping...`);
            try {
                const cropPos = { x: 0, y: 0, w: metadata.width, h: MAX_HEIGHT };
                const croppedBase64 = await cropBase64Image(processedBase64, cropPos);
                if (croppedBase64 && croppedBase64 !== processedBase64) {
                    processedBase64 = croppedBase64;
                    console.log(`✅ Image cropped to height ${MAX_HEIGHT}`);
                }
            } catch (cropErr) {
                console.error('❌ Failed to crop image, continuing with original:', cropErr);
            }
        }

        // Resize image for Gemini (max width 640)
        const resizedBase64 = await resizeBase64(processedBase64, 640);

        parts.push({
            inline_data: {
                mime_type: 'image/png',
                data: resizedBase64
            }
        });
        console.log('✅ detectMissingActionsByAI: Image processed and added to request');
    } catch (imageErr) {
        console.error('❌ detectMissingActionsByAI: Failed to process image:', imageErr);
        if (isUrl) {
            parts.push({
                file_data: {
                    mime_type: 'image/jpeg',
                    file_uri: panelImageUrl
                }
            });
        } else {
            let base64Data = panelImageUrl;
            if (base64Data.includes(',')) {
                base64Data = base64Data.split(',')[1];
            }
            const resizedBase64 = await resizeBase64(base64Data, 640);
            parts.push({
                inline_data: {
                    mime_type: 'image/png',
                    data: resizedBase64
                }
            });
        }
    }

    const requestBody = {
        contents: [{ parts: parts }],
        generation_config: {
            response_mime_type: 'application/json',
            response_schema: responseSchema
        }
    };

    try {
        const requestBodyStr = JSON.stringify(requestBody);
        console.log('📦 detectMissingActionsByAI: Request body size:', (requestBodyStr.length / 1024).toFixed(2) + ' KB');

        const modelName = process.env.GEMINI_MODEL_IMPORTANT || 'gemini-2.5-pro';
        console.log('🚀 detectMissingActionsByAI: Sending request to Gemini API...', { model: modelName });

        // Retry logic
        const maxRetries = 3;
        let response = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                response = await fetchGeminiWithTimeout(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
                    {
                        method: 'POST',
                        headers: {
                            'x-goog-api-key': ENV.GEMINI_API_KEY,
                            'Content-Type': 'application/json'
                        },
                        body: requestBodyStr
                    },
                    GEMINI_TIMEOUT_MISSING_ACTIONS_MS
                );

                if (response.status !== 500) break;
                if (attempt < maxRetries) {
                    const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.warn(`⚠️ detectMissingActionsByAI: Got 500 error, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})...`);
                    await sleep(retryDelay);
                    continue;
                }
                break;
            } catch (fetchErr) {
                if (attempt < maxRetries && (fetchErr.name === 'AbortError' || fetchErr.message.includes('fetch'))) {
                    const retryDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
                    console.warn(`⚠️ detectMissingActionsByAI: Request failed, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})...`);
                    await sleep(retryDelay);
                    continue;
                }
                throw fetchErr;
            }
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ detectMissingActionsByAI: Gemini API error:', {
                status: response.status,
                statusText: response.statusText,
                errorPreview: errorText.substring(0, 500)
            });
            if (isGeminiBillingError(response.status, errorText)) {
                console.error('❌ detectMissingActionsByAI: Billing/quota error detected');
            }
            return [];
        }

        const data = await response.json();

        // Extract text from response
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            console.warn('⚠️ detectMissingActionsByAI: Empty response from Gemini');
            return [];
        }

        console.log('📝 detectMissingActionsByAI: Raw response:', text.substring(0, 500));

        // Parse JSON response
        let result;
        try {
            result = JSON.parse(text);
        } catch (parseErr) {
            // Try to extract JSON from response text
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                console.error('❌ detectMissingActionsByAI: Failed to parse response JSON:', parseErr);
                return [];
            }
        }

        if (!Array.isArray(result)) {
            console.warn('⚠️ detectMissingActionsByAI: Response is not an array');
            return [];
        }

        // Validate and filter results
        const validResult = result.filter(item =>
            item &&
            typeof item === 'object' &&
            item.mising_action_name &&
            typeof item.mising_action_name === 'string' &&
            item.mising_action_name.trim()
        ).map(item => ({
            mising_action_name: item.mising_action_name.trim(),
            mising_action_reason: (item.mising_action_reason || '').trim()
        }));

        console.log(`✅ detectMissingActionsByAI: Found ${validResult.length} missing action(s)`);
        if (validResult.length > 0) {
            validResult.forEach((item, idx) => {
                console.log(`  📋 [${idx}] ${item.mising_action_name}: ${item.mising_action_reason.substring(0, 100)}...`);
            });
        }

        return validResult;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error(`❌ detectMissingActionsByAI: Gemini API timed out`);
        } else {
            console.error('❌ detectMissingActionsByAI: Error:', err);
        }
        return [];
    }
}

const GEMINI_TIMEOUT_VALIDATE_FULL_FLOW_MS = 60000;

/**
 * Validate Full Flow By AI: call Gemini to check end-to-end flow per modality_stack.
 * @param {Object} tracker - Tracker instance (for broadcast / ENV)
 * @param {Object} payload - { ai_tool_info, modality_stacks_info, first_step, full_steps }
 * @returns {Promise<{ modality_stack_routes: Array }>} Parsed result or null
 */
export async function validateFullFlowByAI(tracker, payload) {
    const { ai_tool_info, modality_stacks_info, first_step, full_steps } = payload || {};
    if (!modality_stacks_info || !Array.isArray(modality_stacks_info) || modality_stacks_info.length === 0) {
        return { modality_stack_routes: [] };
    }
    const prompt = `## 1. Nhiệm vụ

Bạn là trợ lý phân tích luồng UI. Nhiệm vụ: với một **important action** (first_step) và toàn bộ **full_steps** của phiên, kiểm tra với từng **modality_stack** (tính năng end-to-end) xem đã có **luồng đầy đủ từ input đến output** hay chưa.

**Input:**
- **ai_tool_info**: thông tin tool (code, company, tool_name, version, description, domain, website).
- **modality_stacks_info**: danh sách modality stack (mỗi phần tử: code, name, description, example, main_feature_list, main_feature_reason).
- **first_step**: step gắn với important action đang validate — format: step_id, panel_before (name, image_url), action (name, image_url, type, verb, purpose), panel_after (name, image_url).
- **full_steps**: toàn bộ step trong phiên; mỗi step: step_id, panel_before.name, action (name, type, verb, step_purpose), panel_after.name.

**Output:** JSON với key \`modality_stack_routes\`: mảng, mỗi phần tử tương ứng một modality_stack, gồm đánh giá end-to-end, lý do, và danh sách routes.

## 2. Quy tắc logic (bắt buộc)

Với **từng** modality_stack trong \`modality_stacks_info\`:

**2.1** Chọn modality_stack hiện tại (code, name, description, example).

**2.2** Tìm tất cả step **liên quan** tới modality_stack đó — **Sequence_Full_End_To_End_Flow_Steps**. Một step được coi là liên quan nếu thuộc một trong hai nhóm sau:

- **Liên tiếp theo cầu nối:** step sau có \`panel_before\` trùng với \`panel_after\` của step trước (chuỗi panel_before → action → panel_after nối với nhau).

- **Liên quan ngữ cảnh (cùng flow):** step có liên quan về ngữ cảnh dù không liên tiếp nhau theo cầu nối. Tức là các step cùng thuộc một luồng nghiệp vụ (cùng flow) từ input đến output cuối, ví dụ: thao tác tạo/kích hoạt rồi sang bước xem/quản lý kết quả, dù không nối trực tiếp panel_after bước trước = panel_before bước sau.

  **Ví dụ:**
  - **Step A:** Từ \`panel_video_generate\` bấm nút "generation" → ra \`panel_generation\` (xong bước generate).
  - **Step B:** Từ \`panel_after_login\` bấm nút "asset" → ra \`panel_asset_management\` để xem kết quả generate.

  Hai step này **không** có cầu nối liên tiếp (panel_after của A ≠ panel_before của B), nhưng **có liên quan ngữ cảnh**: generate video xong thì vào asset để xem kết quả — luồng từ "làm xong bước tạo nội dung" đến "xem output cuối cùng". Khi phân tích flow cho modality_stack tương ứng, step A và step B vẫn được coi là thuộc cùng một flow và có thể nằm trong cùng route/đánh giá end-to-end.

Dùng cả **full_steps** và **first_step** (coi first_step là một step đặc biệt gắn important action) để xác định tập step liên quan.

**2.3** Sắp xếp và tạo **routes:** từ tập step trong Sequence_Full_End_To_End_Flow_Steps, xây dựng các **route** (đường đi) từ **điểm bắt đầu** (first_step / step đầu vào của flow) tới **điểm kết thúc** (step tạo ra output cuối của modality_stack). Nếu không có **điểm kết thúc** thì **route** từ **điểm bắt đầu** (first_step / step đầu vào của flow) tới step liên quan cuối cùng. Mỗi route là một danh sách step theo thứ tự. Nếu modality_stack có nhiều **route** thì BẮT BUỘC tạo đủ tất cả các route.
Định nghĩa **điểm kết thúc** là step tại đó tạo ra output cuối hoặc xem, tải được output cuối của modality_stack.
**2.4** Đánh giá **is_end_to_end_flow** cho modality_stack đó:
- **true:** Có ít nhất một route đi được **liên tục** từ input tới output của flow đầy đủ (không thiếu bước trung gian).
- **false:** Không có route nào đi được tới output, hoặc có tới output nhưng thiếu step trung gian.

**2.5** Viết **end_to_end_flow_reason** (bằng **tiếng Việt**):
- Nếu **is_end_to_end_flow = true:** giải thích ngắn gọn tại sao (ví dụ: có route từ panel X qua action Y tới panel Z, đủ các bước cho modality_stack).
- Nếu **is_end_to_end_flow = false:** giải thích rõ thiếu step nào (mô tả panel_before / action / panel_after hoặc step_id) hoặc tại sao không có route tới output.

## 3. Định dạng output JSON (bắt buộc)

Trả về đúng cấu trúc: \`modality_stack_routes\` là mảng; mỗi phần tử có \`modality_stack_code\`, \`is_end_to_end_flow\`, \`end_to_end_flow_reason\`, \`routes\`. Mỗi route là mảng các step; mỗi step có: \`step_id\`, \`panel_before_name\`, \`action_name\`, \`action_type\`, \`action_verb\`, \`step_purpose\`, \`panel_after_name\`. \`end_to_end_flow_reason\` luôn bằng tiếng Việt.

## 4. Yêu cầu nhất quán

- **Cùng một bộ input** thì output JSON phải **giống nhau** giữa các lần gọi (cùng số phần tử, cùng is_end_to_end_flow, cùng cấu trúc routes).
- Chỉ dựa vào dữ liệu đã cho; không bịa step hay panel không có trong first_step / full_steps.

---

DỮ LIỆU INPUT (dùng để phân tích):

ai_tool_info: ${JSON.stringify(ai_tool_info || {})}

modality_stacks_info: ${JSON.stringify(modality_stacks_info)}

first_step: ${JSON.stringify(first_step || {})}

full_steps: ${JSON.stringify(full_steps || [])}`;

    const responseSchema = {
        type: 'object',
        required: ['modality_stack_routes'],
        properties: {
            modality_stack_routes: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['modality_stack_code', 'is_end_to_end_flow', 'end_to_end_flow_reason', 'routes'],
                    properties: {
                        modality_stack_code: { type: 'string' },
                        is_end_to_end_flow: { type: 'boolean' },
                        end_to_end_flow_reason: { type: 'string' },
                        routes: {
                            type: 'array',
                            items: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    required: ['step_id', 'panel_before_name', 'action_name', 'action_type', 'action_verb', 'step_purpose', 'panel_after_name'],
                                    properties: {
                                        step_id: { type: 'string' },
                                        panel_before_name: { type: 'string' },
                                        action_name: { type: 'string' },
                                        action_type: { type: 'string' },
                                        action_verb: { type: 'string' },
                                        step_purpose: { type: 'string' },
                                        panel_after_name: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    try {
        const { ENV } = await import('../config/env.js');
        const requestBody = {
            contents: [{ parts: [{ text: prompt }] }],
            generation_config: {
                response_mime_type: 'application/json',
                response_schema: responseSchema
            }
        };
        const modelName = process.env.GEMINI_MODEL_IMPORTANT || 'gemini-2.5-pro';
        const response = await fetchGeminiWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'x-goog-api-key': ENV.GEMINI_API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            },
            GEMINI_TIMEOUT_VALIDATE_FULL_FLOW_MS
        );
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini validateFullFlowByAI error:', errorText);
            if (tracker && tracker._broadcast && isGeminiBillingError(response.status, errorText)) {
                await tracker._broadcast({ type: 'show_gemini_billing_error' });
            }
            return null;
        }
        const data = await response.json();
        let jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) return null;
        jsonText = jsonText.trim().replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/i, '');
        const result = JSON.parse(jsonText);
        return result;
    } catch (err) {
        console.error('validateFullFlowByAI failed:', err);
        if (tracker && tracker._broadcast && err.message && isGeminiBillingError(0, err.message)) {
            await tracker._broadcast({ type: 'show_gemini_billing_error' });
        }
        return null;
    }
}

