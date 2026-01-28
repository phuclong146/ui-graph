import { sleep } from '../utils/utils.js';
import { drawPanelBoundingBoxes, resizeBase64 } from '../media/screenshot.js';
import { captureActionsFromDOM } from '../media/dom-capture.js';

const GEMINI_TIMEOUT_MS = 30000;
const GEMINI_TIMEOUT_IMPORTANT_ACTIONS_MS = 300000; // 60s for detectImportantActions

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
    if (!tracker.page || !panelId) return;

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
export async function detectPanelTypeByGemini(croppedScreenshotB64, fullScreenshotB64 = null, cropArea = null) {
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
        }
        return 'screen'; // Default to screen on error
    }
}

export async function askGeminiForActionRename(croppedImageB64, actionMetadata) {
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
        }
        return null;
    }
}

/**
 * Detect action purpose using Gemini
 * @param {object} doingStepInfo - Step info object containing panel_before, action, panel_after details
 * @param {string[]} imageUrls - Array of image URLs [panel_before_fullscreen, action_url, panel_after_fullscreen]
 * @returns {Promise<object|null>} - {step_purpose, action_purpose, panel_after_name, reason} or null on error
 */
export async function detectActionPurpose(doingStepInfo, imageUrls) {
    if (!doingStepInfo) return null;

    const { ENV } = await import('../config/env.js');

    const prompt = `Bạn nhận được
DoingStepInfo: ${JSON.stringify(doingStepInfo, null, 2)}

Định nghĩa DoingStepInfo: là thông tin mô tả lại một thao tác của người dùng trên website của ai_tool_name. Trong đó:
+ panel_before: là chỉ màn hình/popup/newtab trước khi thao tác.
+ panel_before_fullscreen: chứa link ảnh fullscreen của panel_before
+ action: là mô tả thao tác của người dùng, trong đó action_purpose mô tả mục đích tổng hợp của action. Ví dụ step1 purpose là export file ảnh, step2 purpose là export file video, action cùng là export thì action_purpose này sẽ ví dụ sẽ có mô tả là export tài nguyên (ảnh, video).
+ panel_after: là chỉ màn hình/popup/newtab sau khi thao tác.
+ panel_after_fullscreen: chứa link ảnh fullscreen của panel_after

Mục tiêu: Tôi cần chỉ rõ ràng mục đích của action để làm gì và chỉ rõ tên của panel_after.

Nhiệm vụ của bạn:
Bước 1: Hãy xem kỹ mô tả DoingStepInfo và các hình ảnh panel trước và sau khi action.
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
    
    // Add images from URLs if available
    if (imageUrls && Array.isArray(imageUrls)) {
        for (const url of imageUrls) {
            if (url && typeof url === 'string' && url.startsWith('http')) {
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

    const { ENV } = await import('../config/env.js');

    // Build prompt
    const prompt = `Bạn nhận được:
1. Hình ảnh panel của một trang web
2. Danh sách các actions (nút, link, input...) trên panel này với format: ${JSON.stringify(actions, null, 2)}
3. Danh sách các modality_stacks (tính năng quan trọng) của AI tool với đầy đủ thông tin: ${JSON.stringify(aiToolModalityStacks, null, 2)}

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
    
    if (isUrl) {
        // Use file_data for URL
        parts.push({
            file_data: {
                mime_type: 'image/jpeg',
                file_uri: panelImageUrl
            }
        });
    } else {
        // Use inline_data for base64
        // Remove data URL prefix if present
        let base64Data = panelImageUrl;
        if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
        }
        
        // Resize image for Gemini (similar to other functions)
        const resizedBase64 = await resizeBase64(base64Data, 640);
        
        parts.push({
            inline_data: {
                mime_type: 'image/png',
                data: resizedBase64
            }
        });
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
        // Use gemini-2.5-pro for this task (recommended for accuracy)
        const modelName = process.env.GEMINI_MODEL_IMPORTANT || 'gemini-2.5-flash';
        
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
            GEMINI_TIMEOUT_IMPORTANT_ACTIONS_MS
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini DetectImportantActions API error response:', errorText);
            throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
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
            console.error(`Gemini DetectImportantActions API timed out after ${GEMINI_TIMEOUT_IMPORTANT_ACTIONS_MS / 1000}s`);
        } else {
            console.error('Gemini DetectImportantActions API failed:', err);
        }
        // Return empty modality_stacks for all actions on error
        return actions.map(action => ({ 
            item_id: action.item_id, 
            modality_stacks: [],
            reason: 'Lỗi khi detect modality_stacks'
        }));
    }
}

