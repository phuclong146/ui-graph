import { sleep } from '../utils/utils.js';
import { drawPanelBoundingBoxes, resizeBase64 } from '../media/screenshot.js';
import { captureActionsFromDOM } from '../media/dom-capture.js';

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
        const response = await fetch(
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
        console.error('Gemini REST API failed:', err);
        return null;
    }
}

export async function handleTurn(tracker) {
    let turn = [];
    while (true) {
        const message = await tracker.geminiMessageQueue.get();
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
                
                actionsArray = actionsArray.map(action => {
                    const actionWithId = {
                        ...action,
                        action_id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        action_name: action.action_name || 'Unnamed',
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
                            action.action_content || null,
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
        
        const fullBuffer = Buffer.from(panelItem.image_base64, "base64");
        const fullMeta = await sharp(fullBuffer).metadata();
        
        let displayImage = panelItem.image_base64;
        let scaleX, scaleY;
        let actionsToProcess = [];
        let parentPanelEntry = null;
        
        if (panelItem.crop_pos) {
            const { cropBase64Image } = await import('../media/screenshot.js');
            displayImage = await cropBase64Image(panelItem.image_base64, panelItem.crop_pos);
            
            const croppedBuffer = Buffer.from(displayImage, "base64");
            const croppedMeta = await sharp(croppedBuffer).metadata();
            
            scaleX = croppedMeta.width / panelItem.crop_pos.w;
            scaleY = croppedMeta.height / panelItem.crop_pos.h;
            
            const parentDom = await tracker.parentPanelManager.getParentDom(panelId);
            
            console.log(`📦 Loading ${parentDom.length} actions from parent_dom`);
            
            const filteredActions = parentDom.filter(action => {
                const pos = action.action_pos;
                const actionRight = pos.x + pos.w;
                const actionBottom = pos.y + pos.h;
                const cropRight = panelItem.crop_pos.x + panelItem.crop_pos.w;
                const cropBottom = panelItem.crop_pos.y + panelItem.crop_pos.h;
                
                return pos.x >= panelItem.crop_pos.x &&
                       pos.y >= panelItem.crop_pos.y &&
                       actionRight <= cropRight &&
                       actionBottom <= cropBottom;
            });
            
            console.log(`✂️ Filtered ${parentDom.length} → ${filteredActions.length} actions inside crop area`);
            
            const adjustedActions = filteredActions.map(action => ({
                ...action,
                action_pos: {
                    x: Math.round(action.action_pos.x - panelItem.crop_pos.x),
                    y: Math.round(action.action_pos.y - panelItem.crop_pos.y),
                    w: Math.round(action.action_pos.w),
                    h: Math.round(action.action_pos.h)
                }
            }));
            
            actionsToProcess = adjustedActions;
        } else if (panelItem.item_category === 'PAGE') {
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
                    action.action_content || null,
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
        const response = await fetch(
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
        console.error('Gemini Rename API failed:', err);
        return null;
    }
}

