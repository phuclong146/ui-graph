import { getPanelEditorClassCode } from './panel-editor-class.js';
import { promises as fsp } from 'fs';
import path from 'path';
import { suggestCropAreaForNewPanel } from './crop-suggestion-helpers.js';

export function createQueuePageHandlers(tracker, width, height, trackingWidth, queueWidth) {
    let lastLoadedPanelId = null;

    const getActionIdsForItem = async (itemId, itemCategory) => {
        if (itemCategory === 'PAGE') {
            const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
            const content = await fsp.readFile(parentPath, 'utf8');
            const allParents = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const parentPanelEntry = allParents.find(p =>
                p.child_pages && p.child_pages.some(pg => pg.page_id === itemId)
            );

            if (parentPanelEntry) {
                const childPage = parentPanelEntry.child_pages?.find(p => p.page_id === itemId);
                return childPage?.child_actions || [];
            }
            return [];
        } else {
            const parentEntry = await tracker.parentPanelManager.getPanelEntry(itemId);
            return parentEntry?.child_actions || [];
        }
    };

    const rebroadcastPageIfActionUpdated = async (actionId) => {
        if (!tracker.selectedPanelId) return;

        const selectedItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
        if (!selectedItem || selectedItem.item_category !== 'PAGE') return;

        const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
        const content = await fsp.readFile(parentPath, 'utf8');
        const allParents = content.trim().split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line));

        const parentPanelEntry = allParents.find(p =>
            p.child_pages && p.child_pages.some(pg => pg.page_id === tracker.selectedPanelId)
        );

        if (parentPanelEntry) {
            const childPage = parentPanelEntry.child_pages?.find(p => p.page_id === tracker.selectedPanelId);
            const actionIds = childPage?.child_actions || [];

            if (actionIds.includes(actionId)) {
                await selectPanelHandler(tracker.selectedPanelId);
            }
        }
    };

    const addActionToItem = async (itemId, itemCategory, actionId) => {
        if (itemCategory === 'PAGE') {
            const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
            const content = await fsp.readFile(parentPath, 'utf8');
            const allParents = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const parentPanelEntry = allParents.find(p =>
                p.child_pages && p.child_pages.some(pg => pg.page_id === itemId)
            );

            if (parentPanelEntry) {
                const childPage = parentPanelEntry.child_pages?.find(p => p.page_id === itemId);
                if (childPage) {
                    childPage.child_actions.push(actionId);

                    const index = allParents.findIndex(e => e.parent_panel === parentPanelEntry.parent_panel);
                    if (index !== -1) {
                        allParents[index] = parentPanelEntry;
                        await fsp.writeFile(parentPath, allParents.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
                    }
                }
            }
        } else {
            await tracker.parentPanelManager.addChildAction(itemId, actionId);
        }
    };

    /**
     * Tạo quan hệ parent-child giữa các panel dựa trên step
     * Tìm step có panel_after trùng với panelId, sau đó tạo quan hệ parent (panel_before) -> child (panel_after)
     * @param {string} panelId - ID của panel cần tìm step và tạo quan hệ
     */
    const createPanelRelationFromStep = async (panelId) => {
        try {
            const stepContent = await tracker.stepManager.getAllSteps();
            const relatedStep = stepContent.find(step => step.panel_after.item_id === panelId);
            
            if (relatedStep) {
                const panelBeforeId = relatedStep.panel_before.item_id;
                const panelAfterId = relatedStep.panel_after.item_id;
                
                if (panelBeforeId !== panelAfterId) {
                    console.log(`🔗 makeChild START: parent="${panelBeforeId}" child="${panelAfterId}"`);
                    await tracker.parentPanelManager.makeChild(panelBeforeId, panelAfterId);
                    console.log(`✅ makeChild DONE: Duplicate actions removed from parent panel`);
                } else {
                    console.log(`⏭️ Skip makeChild: parent and child are the same (${panelBeforeId})`);
                }
            } else {
                console.log(`⚠️ No step found with panel_after="${panelId}"`);
            }
        } catch (err) {
            console.error('Failed to create panel relation from step:', err);
        }
    };

    const removeActionFromItem = async (itemId, itemCategory, actionId) => {
        await tracker.dataItemManager.deleteItem(actionId);

        if (itemCategory === 'PAGE') {
            const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
            const content = await fsp.readFile(parentPath, 'utf8');
            const allParents = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const parentPanelEntry = allParents.find(p =>
                p.child_pages && p.child_pages.some(pg => pg.page_id === itemId)
            );

            if (parentPanelEntry) {
                const childPage = parentPanelEntry.child_pages?.find(p => p.page_id === itemId);
                if (childPage) {
                    childPage.child_actions = childPage.child_actions.filter(id => id !== actionId);

                    const index = allParents.findIndex(e => e.parent_panel === parentPanelEntry.parent_panel);
                    if (index !== -1) {
                        allParents[index] = parentPanelEntry;
                        await fsp.writeFile(parentPath, allParents.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
                    }
                }
            }
        } else {
            await tracker.parentPanelManager.removeChildAction(itemId, actionId);
        }
    };

    const quitAppHandler = async () => {
        await tracker.close();
    };

    let isSaving = false;
    const saveEventsHandler = async () => {
        if (isSaving) {
            console.warn('⚠️ Save already in progress or completed, skipping...');
            return;
        }

        if (tracker.dataItemManager) {
            const items = await tracker.dataItemManager.getAllItems();
            const panels = items.filter(i => i.item_category === 'PANEL');
            const incompletePanels = panels.filter(p => p.status !== 'completed');

            if (incompletePanels.length > 0) {
                const panelNames = incompletePanels.map(p => p.name).join(', ');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: `⚠️ Có ${incompletePanels.length} panel chưa completed. Vui lòng hoàn thành hết trước khi Save!`
                });
                console.warn(`⚠️ Cannot save: ${incompletePanels.length} panels not completed:`, panelNames);
                const validationError = new Error(`Validation failed: ${incompletePanels.length} panels not completed`);
                validationError.isValidationError = true;
                // throw validationError; // cho save khi đang làm chưa xong
            }
        }

        isSaving = true;

        try {
            await tracker.saveResults();
            await tracker._broadcast({
                type: 'show_toast',
                message: '✅ Save completed successfully! Bạn có thể tiếp tục làm việc.'
            });
            console.log('✅ Save completed successfully');
            isSaving = false; // Reset flag để có thể save lại
        } catch (err) {
            console.error('❌ Failed to save results:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: `❌ Lỗi khi save: ${err.message || 'Unknown error'}`
            });
            isSaving = false;
            throw err;
        }
    };

    const resizeQueueBrowserHandler = async (maximize) => {
        try {
            const session = await tracker.queuePage.target().createCDPSession();
            const { windowId } = await session.send('Browser.getWindowForTarget');
            
            if (maximize) {
                await session.send('Browser.setWindowBounds', {
                    windowId,
                    bounds: { left: 0, top: 0, width: width, height: height }
                });
            } else {
                await session.send('Browser.setWindowBounds', {
                    windowId,
                    bounds: { windowState: 'normal' }
                });
                await session.send('Browser.setWindowBounds', {
                    windowId,
                    bounds: { left: trackingWidth, top: 0, width: queueWidth, height: height }
                });
            }
            await session.detach();
        } catch (err) {
            console.error('Failed to resize queue browser:', err);
        }
    };

    const openPanelEditorHandler = async () => {
        try {
            if (!tracker.selectedPanelId || !tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('No panel selected or managers not initialized');
                return;
            }

            console.log(`Opening editor for panel: ${tracker.selectedPanelId}`);

            const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
            if (!panelItem || (panelItem.item_category !== 'PANEL' && panelItem.item_category !== 'PAGE')) {
                console.error('Selected item is not a PANEL or PAGE');
                return;
            }

            if (!panelItem.image_base64) {
                console.error(`Panel has no image. Status: ${panelItem.status}`);
                return;
            }

            const actionIds = await getActionIdsForItem(tracker.selectedPanelId, panelItem.item_category);
            const actions = [];
            for (const actionId of actionIds) {
                const actionItem = await tracker.dataItemManager.getItem(actionId);
                if (actionItem) {
                    const hasValidP = actionItem.metadata.local_pos.p != null;
                    const globalY = actionItem.metadata.global_pos.y;
                    const p = hasValidP ? actionItem.metadata.local_pos.p : Math.floor(globalY / 1080) + 1;
                    const localY = hasValidP ? actionItem.metadata.local_pos.y : globalY - (p - 1) * 1080;
                    
                    if (!hasValidP) {
                        await tracker.dataItemManager.updateItem(actionItem.item_id, {
                            metadata: {
                                local_pos: { p, x: actionItem.metadata.local_pos.x, y: localY, w: actionItem.metadata.local_pos.w, h: actionItem.metadata.local_pos.h },
                                global_pos: actionItem.metadata.global_pos
                            }
                        });
                    }
                    
                    actions.push({
                        action_id: actionItem.item_id,
                        action_name: actionItem.name,
                        action_type: actionItem.type,
                        action_verb: actionItem.verb,
                        action_content: actionItem.content,
                        action_pos: {
                            p: p,
                            x: actionItem.metadata.local_pos.x,
                            y: localY,
                            w: actionItem.metadata.local_pos.w,
                            h: actionItem.metadata.local_pos.h
                        }
                    });
                }
            }

            const geminiResult = [{
                panel_title: panelItem.name,
                actions: actions
            }];

            const editorImage = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);

            console.log(`Opening editor with ${actions.length} actions from doing_item.jsonl`);

            await tracker.queuePage.evaluate(async (data) => {
                eval(data.panelEditorClassCode);

                const editor = new PanelEditor(data.imageBase64, data.geminiResult, 'full', data.panelId);
                await editor.init();
            }, {
                geminiResult: geminiResult,
                imageBase64: editorImage,
                panelEditorClassCode: getPanelEditorClassCode(),
                panelId: tracker.selectedPanelId
            });

        } catch (err) {
            console.error('Failed to open panel editor:', err);
        }
    };

    const savePanelEditsHandler = async (updatedGeminiResult) => {
        try {
            const newActions = updatedGeminiResult[0]?.actions || [];

            console.log('Save Edit actions:');

            if (tracker.dataItemManager && tracker.parentPanelManager && tracker.selectedPanelId) {
                const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);

                if (panelItem && (panelItem.item_category === 'PANEL' || panelItem.item_category === 'PAGE') && Array.isArray(newActions)) {
                    const currentActionIds = await getActionIdsForItem(tracker.selectedPanelId, panelItem.item_category);

                    const currentActions = await Promise.all(
                        currentActionIds.map(id => tracker.dataItemManager.getItem(id))
                    );
                    const currentActionsFiltered = currentActions.filter(Boolean);

                    const currentActionsMap = new Map(currentActionsFiltered.map(a => [a.item_id, a]));
                    const newActionsMap = new Map(newActions.map(a => [a.action_id, a]));

                    const toAdd = newActions.filter(a => !a.action_id || !currentActionsMap.has(a.action_id));
                    const toDelete = currentActionsFiltered.filter(a => !newActionsMap.has(a.item_id));
                    const toUpdate = [];

                    let logIndex = 0;
                    for (const newAction of newActions) {
                        if (!newAction.action_id || !currentActionsMap.has(newAction.action_id)) {
                            console.log(`    [${logIndex}] "${newAction.action_name}" (${newAction.action_pos.x},${newAction.action_pos.y},${newAction.action_pos.w},${newAction.action_pos.h}) -> added`);
                        } else {
                            const existing = currentActionsMap.get(newAction.action_id);
                            const nameChanged = existing.name !== newAction.action_name;
                            const posChanged =
                                existing.metadata?.local_pos?.x !== newAction.action_pos.x ||
                                existing.metadata?.local_pos?.y !== newAction.action_pos.y ||
                                existing.metadata?.local_pos?.w !== newAction.action_pos.w ||
                                existing.metadata?.local_pos?.h !== newAction.action_pos.h;

                            if (nameChanged || posChanged) {
                                let changeDesc = [];
                                if (nameChanged) {
                                    changeDesc.push(`name: "${existing.name}" -> "${newAction.action_name}"`);
                                }
                                if (posChanged) {
                                    const oldPos = existing.metadata?.local_pos;
                                    changeDesc.push(`position: (${oldPos?.x},${oldPos?.y},${oldPos?.w},${oldPos?.h}) -> (${newAction.action_pos.x},${newAction.action_pos.y},${newAction.action_pos.w},${newAction.action_pos.h})`);
                                }
                                console.log(`    [${logIndex}] "${newAction.action_name}" -> ${changeDesc.join(', ')}`);

                                const pageNumber = existing.metadata?.local_pos?.p || 1;
                                const pageHeight = 1080;
                                const globalY = (pageNumber - 1) * pageHeight + newAction.action_pos.y;

                                toUpdate.push({
                                    itemId: existing.item_id,
                                    newData: {
                                        name: newAction.action_name,
                                        metadata: {
                                            local_pos: {
                                                p: pageNumber,
                                                x: newAction.action_pos.x,
                                                y: newAction.action_pos.y,
                                                w: newAction.action_pos.w,
                                                h: newAction.action_pos.h
                                            },
                                            global_pos: {
                                                x: newAction.action_pos.x,
                                                y: globalY,
                                                w: newAction.action_pos.w,
                                                h: newAction.action_pos.h
                                            }
                                        }
                                    }
                                });
                            } else {
                                console.log(`    [${logIndex}] "${newAction.action_name}" (${newAction.action_pos.x},${newAction.action_pos.y},${newAction.action_pos.w},${newAction.action_pos.h}) -> no changes`);
                            }
                        }
                        logIndex++;
                    }

                    for (const actionItem of toDelete) {
                        const pos = actionItem.metadata?.local_pos;
                        console.log(`    [DELETED] "${actionItem.name}" (${pos?.x},${pos?.y},${pos?.w},${pos?.h}) -> deleted`);
                    }

                    console.log(`AFTER SAVE: Panel ${tracker.selectedPanelId}`);
                    newActions.forEach((action, i) => {
                        console.log(`    [${i}] "${action.action_name}" (${action.action_pos.x},${action.action_pos.y},${action.action_pos.w},${action.action_pos.h})`);
                    });

                    for (const actionData of toAdd) {
                        const pageNumber = actionData.action_pos.p || 1;
                        const globalY = (pageNumber - 1) * 1080 + actionData.action_pos.y;
                        const globalPos = {
                            x: actionData.action_pos.x,
                            y: globalY,
                            w: actionData.action_pos.w,
                            h: actionData.action_pos.h
                        };
                        
                        const actionItemId = await tracker.dataItemManager.createAction(
                            actionData.action_name,
                            actionData.action_type || 'button',
                            actionData.action_verb || 'click',
                            globalPos,
                            pageNumber
                        );

                        await addActionToItem(tracker.selectedPanelId, panelItem.item_category, actionItemId);
                    }

                    for (const actionItem of toDelete) {
                        if (tracker.isRecordingPanel && tracker.recordingPanelId === actionItem.item_id) {
                            await tracker.cancelPanelRecording();
                        }

                        await removeActionFromItem(tracker.selectedPanelId, panelItem.item_category, actionItem.item_id);
                        await tracker.clickManager.deleteClicksForAction(actionItem.item_id);
                        await tracker.stepManager.deleteStepsForAction(actionItem.item_id);
                    }

                    for (const u of toUpdate) {
                        await tracker.dataItemManager.updateItem(u.itemId, u.newData);
                    }

                    if (toAdd.length > 0) {
                        await tracker.dataItemManager.updateItem(tracker.selectedPanelId, { status: 'pending' });
                        console.log(`  🔄 Panel status → pending (new actions added)`);
                    }

                    await checkAndUpdatePanelStatusHandler(tracker.selectedPanelId);

                    const updatedActionIds = await getActionIdsForItem(tracker.selectedPanelId, panelItem.item_category);
                    const updatedActions = await Promise.all(
                        updatedActionIds.map(id => tracker.dataItemManager.getItem(id))
                    );
                    const validActions = updatedActions.filter(Boolean);

                    validActions.sort((a, b) => {
                        const posA = a.metadata?.local_pos || { x: 0, y: 0 };
                        const posB = b.metadata?.local_pos || { x: 0, y: 0 };
                        if (posA.y === posB.y) {
                            return posA.x - posB.x;
                        }
                        return posA.y - posB.y;
                    });

                    const sortedActionIds = validActions.map(a => a.item_id);
                    const panelEntry = await tracker.parentPanelManager.getPanelEntry(tracker.selectedPanelId);
                    if (panelEntry) {
                        panelEntry.child_actions = sortedActionIds;
                        await tracker.parentPanelManager.updatePanelEntry(tracker.selectedPanelId, panelEntry);
                    }

                    // Tạo quan hệ parent-child từ step
                    // await createPanelRelationFromStep(tracker.selectedPanelId);

                    const displayImage = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);

                    await tracker._broadcast({
                        type: 'panel_selected',
                        panel_id: tracker.selectedPanelId,
                        screenshot: displayImage,
                        actions: newActions,
                        action_list: newActions.map(a => a.action_name).filter(Boolean).join(', '),
                        gemini_result: updatedGeminiResult,
                        timestamp: Date.now()
                    });

                    await tracker._broadcast({ type: 'tree_update', data: await tracker.panelLogManager.buildTreeStructure() });
                }
            }
        } catch (err) {
            console.error('Failed to save panel edits:', err);
            throw err;
        }
    };

    const drawPanelHandler = async (mode) => {
        try {
            if (!tracker.selectedPanelId || !tracker.dataItemManager) {
                console.error('No action selected or dataItemManager not initialized');
                return;
            }

            const actionItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
            if (!actionItem || actionItem.item_category !== 'ACTION') {
                console.error('Selected item is not an ACTION');
                return;
            }

            const recordingInfo = await tracker.stopPanelRecording();
            let videoUrl = null;

            if (recordingInfo && recordingInfo.panelId) {
                try {
                    const { uploadVideoAndGetUrl } = await import('../media/uploader.js');
                    const { ENV } = await import('../config/env.js');
                    const exists = await fsp.access(recordingInfo.videoPath).then(() => true).catch(() => false);
                    if (exists) {
                        videoUrl = await uploadVideoAndGetUrl(
                            recordingInfo.videoPath,
                            recordingInfo.panelId,
                            ENV.API_TOKEN
                        );
                        if (videoUrl) {
                            console.log(`📹 Video URL: ${videoUrl}`);
                            await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                                metadata: {
                                    ...actionItem.metadata,
                                    session_url: videoUrl,
                                    session_start: recordingInfo.sessionStart,
                                    session_end: recordingInfo.sessionEnd
                                }
                            });
                            await tracker._broadcast({ type: 'show_toast', message: '✅ Video saved' });
                        }
                    } else {
                        console.warn('⚠️ Recording file not found, skip upload:', recordingInfo.videoPath);
                    }
                } catch (uploadErr) {
                    console.error('Failed to upload panel recording:', uploadErr);
                }
            }

            if (mode === 'USE_BEFORE') {
                console.log('Using current panel (no new panel created)');

                const parentPanelId = await getParentPanelOfActionHandler(tracker.selectedPanelId);

                if (parentPanelId) {
                    await tracker.stepManager.createStep(
                        parentPanelId,
                        tracker.selectedPanelId,
                        parentPanelId
                    );

                    await tracker.dataItemManager.updateItem(tracker.selectedPanelId, { status: 'completed' });

                    await tracker._broadcast({ type: 'tree_update', data: await tracker.panelLogManager.buildTreeStructure() });
                    await selectPanelHandler(tracker.selectedPanelId);
                    await tracker._broadcast({ type: 'show_toast', message: '✓ Marked done!' });

                    console.log(`✅ Action "${actionItem.name}" uses current panel (${parentPanelId})`);
                }

                return { mode: 'USE_BEFORE' };
            }

            console.log('Create new panel - Creating empty panel entry...');

            const parentPanelId = await getParentPanelOfActionHandler(tracker.selectedPanelId);

            if (!parentPanelId) {
                console.error('Cannot find parent panel for action');
                await tracker._broadcast({ type: 'show_toast', message: '❌ Không tìm thấy panel cha!' });
                return { mode: 'DRAW_NEW', success: false };
            }

            const newPanelName = actionItem.name + ' Panel';
            const newPanelId = await tracker.dataItemManager.createPanel(newPanelName, null, null);

            await tracker.parentPanelManager.createPanelEntry(newPanelId);

            await tracker.stepManager.createStep(
                parentPanelId,
                tracker.selectedPanelId,
                newPanelId
            );

            await tracker.dataItemManager.updateItem(tracker.selectedPanelId, { status: 'completed' });

            await tracker._broadcast({ type: 'tree_update', data: await tracker.panelLogManager.buildTreeStructure() });

            await checkAndUpdatePanelStatusHandler(parentPanelId);

            // Select the newly created panel
            await selectPanelHandler(newPanelId);

            console.log(`✅ Create new panel completed: "${newPanelName}" (${newPanelId})`);

            // Automatically trigger draw panel & detect actions
            // Note: We don't show toast here to avoid it being captured in the screenshot
            // The drawPanelAndDetectActionsHandler will show its own progress messages
            
            // Remove any existing toast from tracking page before capturing
            try {
                await tracker.page.evaluate(() => {
                    const existingToast = document.getElementById('__tracking_toast');
                    if (existingToast) existingToast.remove();
                });
            } catch (err) {
                // Ignore errors when removing toast
            }
            
            // Call drawPanelAndDetectActionsHandler automatically
            await drawPanelAndDetectActionsHandler();

            return { mode: 'DRAW_NEW', panelId: newPanelId, panelName: newPanelName, success: true };

        } catch (err) {
            console.error('Failed to draw panel:', err);
            throw err;
        }
    };

    const saveCroppedPanelHandler = async (originalImageBase64, cropArea, actionItemId, parentPanelId) => {
        try {
            if (!tracker.dataItemManager || !tracker.parentPanelManager || !tracker.stepManager) {
                console.error('Managers not initialized');
                return;
            }

            const actionItem = await tracker.dataItemManager.getItem(actionItemId);
            if (!actionItem || actionItem.item_category !== 'ACTION') {
                console.error('Action item not found');
                return;
            }

            const actualParentPanelId = await getParentPanelOfActionHandler(actionItemId);

            if (!actualParentPanelId) {
                console.error('Cannot find parent panel for action');
                return;
            }

            const cropPos = cropArea ? {
                x: Math.round(cropArea.x),
                y: Math.round(cropArea.y),
                w: Math.round(cropArea.width),
                h: Math.round(cropArea.height)
            } : null;

            const newPanelName = actionItem.name + ' Panel';
            const newPanelId = await tracker.dataItemManager.createPanel(newPanelName, originalImageBase64, cropPos);

            const sharp = (await import('sharp')).default;
            const fullBuffer = Buffer.from(originalImageBase64, "base64");
            const fullMeta = await sharp(fullBuffer).metadata();

            // Detect panel type using Gemini
            let detectedPanelType = 'screen'; // Default
            if (cropPos) {
                try {
                    // Crop the image for panel type detection
                    const croppedBuffer = await sharp(fullBuffer)
                        .extract({
                            left: cropPos.x,
                            top: cropPos.y,
                            width: cropPos.w,
                            height: cropPos.h
                        })
                        .toBuffer();
                    const croppedBase64 = croppedBuffer.toString('base64');
                    
                    console.log('🤖 Detecting panel type with Gemini (using full screenshot for backdrop detection)...');
                    const { detectPanelTypeByGemini } = await import('./gemini-handler.js');
                    // Pass both full screenshot and crop area for better popup detection (Solution 1)
                    detectedPanelType = await detectPanelTypeByGemini(croppedBase64, originalImageBase64, cropPos);
                    console.log(`✅ Detected panel type: ${detectedPanelType}`);
                } catch (err) {
                    console.error('⚠️ Failed to detect panel type, using default "screen":', err);
                }
            }

            await tracker.dataItemManager.updateItem(newPanelId, {
                type: detectedPanelType,
                metadata: cropPos ? {
                    global_pos: {
                        x: cropPos.x,
                        y: cropPos.y,
                        w: cropPos.w,
                        h: cropPos.h
                    }
                } : null
            });

            await tracker.parentPanelManager.createPanelEntry(newPanelId);

            const originalViewport = tracker.page.viewport() || await tracker.page.evaluate(() => ({
                width: window.innerWidth,
                height: window.innerHeight,
                deviceScaleFactor: window.devicePixelRatio
            }));

            await tracker.page.setViewport({
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1
            });

            const { captureActionsFromDOM } = await import('../media/dom-capture.js');
            const domActions = await captureActionsFromDOM(tracker.page);

            await tracker.page.setViewport(originalViewport);

            if (domActions && domActions.length > 0) {

                const scaleX = fullMeta.width / 1000;
                const scaleY = fullMeta.height / 1000;

                const scaledDomActions = domActions.map(action => ({
                    ...action,
                    action_pos: {
                        x: Math.round(action.action_pos.x * scaleX),
                        y: Math.round(action.action_pos.y * scaleY),
                        w: Math.round(action.action_pos.w * scaleX),
                        h: Math.round(action.action_pos.h * scaleY)
                    }
                }));

                await tracker.parentPanelManager.updateParentDom(newPanelId, scaledDomActions);
                console.log(`✅ Saved ${scaledDomActions.length} DOM actions (pixels) to parent_dom`);
            }

            if (parentPanelId) {
                await tracker.parentPanelManager.addChildPanel(parentPanelId, newPanelId);
                console.log(`  ✅ Created panel "${newPanelName}" as child of ${parentPanelId}`);
            } else {
                console.log(`  ✅ Created panel "${newPanelName}" (root level)`);
            }

            await tracker.stepManager.createStep(
                actualParentPanelId,
                actionItemId,
                newPanelId
            );

            await tracker.dataItemManager.updateItem(actionItemId, { status: 'completed' });

            await tracker._broadcast({ type: 'tree_update', data: await tracker.panelLogManager.buildTreeStructure() });

            await checkAndUpdatePanelStatusHandler(actualParentPanelId);

            await selectPanelHandler(actionItemId);

            await tracker._broadcast({ type: 'show_toast', message: '✅ Panel created' });

            console.log(`✅ Saved panel "${newPanelName}" (${newPanelId})`);
            return { panelId: newPanelId, panelName: newPanelName };

        } catch (err) {
            console.error('Failed to save cropped panel:', err);
            throw err;
        }
    };

    const resetPanelHandler = async (itemId) => {
        try {
            if (!tracker.dataItemManager || !tracker.parentPanelManager || !tracker.clickManager || !tracker.stepManager) return;

            const targetItemId = itemId || tracker.selectedPanelId;
            if (!targetItemId) return;

            const item = await tracker.dataItemManager.getItem(targetItemId);
            if (!item || (item.item_category !== 'PANEL' && item.item_category !== 'PAGE')) {
                console.error('Item is not a PANEL or PAGE');
                return;
            }

            // Không xoá panel được tạo từ action khi bấm reset
            // if (item.item_category === 'PANEL' && item.name !== 'After Login Panel') {
            //     console.log('Non-root panel → Deleting panel instead of reset');
            //     await deleteEventHandler(targetItemId);
            //     return;
            // }

            tracker.geminiAsking = false;

            if (tracker.isRecordingPanel) {
                await tracker.cancelPanelRecording();
            }

            if (item.item_category === 'PAGE') {
                const { promises: fsp } = await import('fs');
                const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
                const content = await fsp.readFile(parentPath, 'utf8');
                const allParents = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const parentPanelEntry = allParents.find(p =>
                    p.child_pages && p.child_pages.some(pg => pg.page_id === targetItemId)
                );

                if (parentPanelEntry) {
                    const childPage = parentPanelEntry.child_pages?.find(p => p.page_id === targetItemId);
                    if (childPage && childPage.child_actions) {
                        await tracker.dataItemManager.deleteItems(childPage.child_actions);
                        await tracker.clickManager.deleteClicksForActions(childPage.child_actions);
                        await tracker.stepManager.deleteStepsForItems(childPage.child_actions);

                        childPage.child_actions = [];

                        const index = allParents.findIndex(e => e.parent_panel === parentPanelEntry.parent_panel);
                        if (index !== -1) {
                            allParents[index] = parentPanelEntry;
                            await fsp.writeFile(parentPath, allParents.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
                        }
                    }
                }

                await tracker.dataItemManager.updateItem(targetItemId, {
                    status: 'pending',
                    metadata: null
                });
            } else {
                const descendants = await tracker.parentPanelManager.getAllDescendants(targetItemId);

                await tracker.dataItemManager.deleteItems(descendants);
                await tracker.clickManager.deleteClicksForActions(descendants);
                await tracker.stepManager.deleteStepsForItems(descendants);

                for (const id of descendants) {
                    await tracker.parentPanelManager.deletePanelEntry(id);
                }

                const parentEntry = await tracker.parentPanelManager.getPanelEntry(targetItemId);
                if (parentEntry) {
                    if (parentEntry.child_pages) {
                        for (const pageEntry of parentEntry.child_pages) {
                            await tracker.dataItemManager.deleteItem(pageEntry.page_id);
                        }
                    }

                    parentEntry.child_pages = [];
                    parentEntry.child_actions = [];
                    parentEntry.child_panels = [];

                    const { promises: fsp } = await import('fs');
                    const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
                    const content = await fsp.readFile(parentPath, 'utf8');
                    const entries = content.trim().split('\n')
                        .filter(line => line.trim())
                        .map(line => JSON.parse(line));

                    const index = entries.findIndex(e => e.parent_panel === targetItemId);
                    if (index !== -1) {
                        entries[index] = parentEntry;
                        await fsp.writeFile(parentPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
                    }
                }

                await tracker.dataItemManager.updateItem(targetItemId, {
                    status: 'pending',
                    image_base64: null,
                    image_url: null,
                    metadata: null
                });
            }

            await tracker._broadcast({ type: 'tree_update', data: await tracker.panelLogManager.buildTreeStructure() });

            const updatedItem = await tracker.dataItemManager.getItem(targetItemId);
            const broadcastData = {
                type: 'panel_selected',
                panel_id: targetItemId,
                item_category: item.item_category,
                timestamp: Date.now()
            };

            if (item.item_category === 'PAGE' && updatedItem.image_base64) {
                broadcastData.screenshot = await tracker.dataItemManager.loadBase64FromFile(updatedItem.image_base64);
                broadcastData.metadata = updatedItem.metadata;
            }

            await tracker._broadcast(broadcastData);

            if (item.item_category === 'PAGE') {
                console.log(`♻️ Reset PAGE ${targetItemId} to pending, deleted actions`);
            } else {
                console.log(`♻️ Reset PANEL ${targetItemId} to pending, deleted pages and image`);
            }
        } catch (err) {
            console.error('Failed to reset panel:', err);
        }
    };

    const markAsDoneHandler = async (itemId) => {
        try {
            if (!tracker.dataItemManager) return;

            const targetItemId = itemId || tracker.selectedPanelId;
            if (!targetItemId) return;

            const item = await tracker.dataItemManager.getItem(targetItemId);
            if (!item) return;

            await tracker.dataItemManager.updateItem(targetItemId, {
                status: 'completed'
            });

            if (item.item_category === 'ACTION') {
                const actionParentPanelId = await getParentPanelOfActionHandler(targetItemId);
                if (actionParentPanelId) {
                    await checkAndUpdatePanelStatusHandler(actionParentPanelId);
                }
            }

            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });

            await tracker._broadcast({
                type: 'show_toast',
                message: '✓ Marked as done!'
            });

            console.log(`✓ Marked item ${targetItemId} as done`);
        } catch (err) {
            console.error('Failed to mark as done:', err);
        }
    };

    const deleteEventHandler = async (itemId) => {
        try {
            if (!tracker.dataItemManager || !tracker.parentPanelManager || !tracker.clickManager || !tracker.stepManager) return;

            const targetItemId = itemId || tracker.selectedPanelId;
            if (!targetItemId) return;

            if (tracker.isRecordingPanel && tracker.recordingPanelId === targetItemId) {
                await tracker.cancelPanelRecording();
            }

            const item = await tracker.dataItemManager.getItem(targetItemId);
            if (!item) {
                console.error('Item not found:', targetItemId);
                return;
            }

            if (item.item_category === 'PANEL' && item.name === 'After Login Panel') {
                console.error('Cannot delete root panel');
                await tracker._broadcast({ type: 'show_toast', message: '⚠️ Không thể xóa root panel!' });
                return;
            }

            const { promises: fsp } = await import('fs');
            let itemsToDelete = [targetItemId];

            if (item.item_category === 'PANEL') {
                const descendants = await tracker.parentPanelManager.getAllDescendants(targetItemId);
                itemsToDelete.push(...descendants);

                console.log(`🗑️ Deleting panel "${item.name}" and ${descendants.length} descendants`);
            } else if (item.item_category === 'PAGE') {
                const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
                try {
                    const content = await fsp.readFile(parentPath, 'utf8');
                    const allParents = content.trim().split('\n')
                        .filter(line => line.trim())
                        .map(line => JSON.parse(line));

                    for (const parentEntry of allParents) {
                        if (parentEntry.child_pages) {
                            const pageEntry = parentEntry.child_pages.find(pg => pg.page_id === targetItemId);
                            if (pageEntry && pageEntry.child_actions) {
                                itemsToDelete.push(...pageEntry.child_actions);
                                console.log(`🗑️ Deleting page "${item.name}" and ${pageEntry.child_actions.length} actions`);
                                break;
                            }
                        }
                    }
                } catch (err) {
                    console.log(`🗑️ Deleting page "${item.name}"`);
                }
            } else if (item.item_category === 'ACTION') {
                console.log(`🗑️ Deleting action "${item.name}"`);
            }

            const stepPath = path.join(tracker.sessionFolder, 'doing_step.jsonl');

            try {
                const stepContent = await fsp.readFile(stepPath, 'utf8');
                const steps = stepContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const affectedActions = steps
                    .filter(step => itemsToDelete.includes(step.panel_after?.item_id))
                    .map(step => step.action?.item_id)
                    .filter(Boolean);

                const affectedParentPanels = new Set();

                for (const actionId of affectedActions) {
                    await tracker.dataItemManager.updateItem(actionId, { status: 'pending' });
                    console.log(`🔄 Reset action ${actionId} to pending`);

                    const parentContent = await fsp.readFile(path.join(tracker.sessionFolder, 'myparent_panel.jsonl'), 'utf8');
                    const allParents = parentContent.trim().split('\n')
                        .filter(line => line.trim())
                        .map(line => JSON.parse(line));

                    const actionParent = allParents.find(p => p.child_actions.includes(actionId));
                    if (actionParent) {
                        affectedParentPanels.add(actionParent.parent_panel);
                    }
                }

                for (const parentPanelId of affectedParentPanels) {
                    await checkAndUpdatePanelStatusHandler(parentPanelId);
                    console.log(`🔄 Updated parent panel ${parentPanelId} status`);
                }
            } catch (err) {
            }

            await tracker.dataItemManager.deleteItems(itemsToDelete);
            await tracker.clickManager.deleteClicksForActions(itemsToDelete);
            await tracker.stepManager.deleteStepsForItems(itemsToDelete);

            for (const id of itemsToDelete) {
                await tracker.parentPanelManager.deletePanelEntry(id);
            }

            const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
            try {
                const content = await fsp.readFile(parentPath, 'utf8');
                const allParents = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const parentEntry = allParents.find(p =>
                    p.child_actions.includes(targetItemId) ||
                    p.child_panels.includes(targetItemId) ||
                    (p.child_pages && p.child_pages.some(pg => pg.page_id === targetItemId))
                );

                if (parentEntry) {
                    if (item.item_category === 'ACTION') {
                        await tracker.parentPanelManager.removeChildAction(parentEntry.parent_panel, targetItemId);
                        await checkAndUpdatePanelStatusHandler(parentEntry.parent_panel);
                    } else if (item.item_category === 'PANEL') {
                        await tracker.parentPanelManager.removeChildPanel(parentEntry.parent_panel, targetItemId);
                    } else if (item.item_category === 'PAGE') {
                        await tracker.parentPanelManager.removeChildPage(parentEntry.parent_panel, targetItemId);
                    }
                }
            } catch (err) {
                console.error('Failed to remove from parent:', err);
            }

            tracker.selectedPanelId = null;

            await tracker._broadcast({ type: 'tree_update', data: await tracker.panelLogManager.buildTreeStructure() });

            await tracker._broadcast({
                type: 'panel_selected',
                panel_id: null,
                timestamp: Date.now()
            });

            console.log(`✅ Deleted ${itemsToDelete.length} items from all files`);
        } catch (err) {
            console.error('Failed to delete item:', err);
        }
    };

    const manualCaptureAIHandler = async () => {
        try {
            if (tracker.geminiAsking) {
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Gemini đang xử lý, vui lòng đợi...'
                });
                return;
            }

            if (tracker.selectedPanelId && tracker.dataItemManager && tracker.parentPanelManager) {
                const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);

                if (!panelItem || panelItem.item_category !== 'PAGE') {
                    console.error('Selected item is not a PAGE');
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '⚠️ Chỉ có thể detect actions trên PAGE!'
                    });
                    return;
                }

                if (panelItem.status === 'completed') {
                    console.warn('⚠️ Page already completed.');
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '⚠️ Page đã completed!'
                    });
                    return;
                }
            }

            console.log('🤖 Gemini AI capture on PAGE triggered');

            const recordingResult = await tracker.stopPanelRecording();

            const timestamp = Date.now();
            let screenshot = null;
            let screenshotForGemini = null;

            if (tracker.selectedPanelId && tracker.dataItemManager) {
                const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);

                const hasFullImageInfo = panelItem && panelItem.image_base64 &&
                    panelItem.metadata?.y !== undefined &&
                    panelItem.metadata?.h !== undefined;

                if (hasFullImageInfo) {
                    screenshot = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);
                    console.log('✅ Using existing image_base64 with full metadata');
                } else {
                    console.log('📸 PAGE has no screenshot, capturing current viewport...');

                    const scrollPosition = await tracker.page.evaluate(() => ({
                        x: window.scrollX || window.pageXOffset,
                        y: window.scrollY || window.pageYOffset
                    }));

                    await tracker.page.evaluate(() => {
                        document.documentElement.style.overflow = 'hidden';
                        document.body.style.overflow = 'hidden';
                    });

                    const { captureScreenshot } = await import('../media/screenshot.js');
                    screenshot = await captureScreenshot(tracker.page, "base64", false);

                    await tracker.page.evaluate(() => {
                        document.documentElement.style.overflow = '';
                        document.body.style.overflow = '';
                    });

                    const sharp = (await import('sharp')).default;
                    const buffer = Buffer.from(screenshot, 'base64');
                    const metadata = await sharp(buffer).metadata();

                    const currentMetadata = panelItem.metadata || {};
                    await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                        image_base64: screenshot,
                        metadata: {
                            ...currentMetadata,
                            x: scrollPosition.x,
                            y: scrollPosition.y,
                            w: metadata.width,
                            h: metadata.height
                        }
                    });

                    console.log(`✅ Captured current viewport ${metadata.width}x${metadata.height} at scroll (${scrollPosition.x}, ${scrollPosition.y})`);
                }

                screenshotForGemini = screenshot;


                await tracker._broadcast({
                    type: 'panel_selected',
                    panel_id: tracker.selectedPanelId,
                    item_category: 'PANEL',
                    screenshot: screenshotForGemini,
                    actions: [],
                    action_list: '⏳ Loading...',
                    action_count: '⏳ Loading...',
                    gemini_detecting: true,
                    timestamp: timestamp
                });

                await tracker._broadcast({
                    type: 'tree_update',
                    data: await tracker.panelLogManager.buildTreeStructure()
                });
            }

            await tracker.screenQueue.put({
                panel_id: tracker.selectedPanelId,
                screenshot: screenshotForGemini,
                timestamp: timestamp
            });

            console.log('✅ Screenshot added to Gemini queue');

            if (recordingResult && tracker.dataItemManager) {
                const { uploadVideoAndGetUrl } = await import('../media/uploader.js');
                const { ENV } = await import('../config/env.js');
                const videoCode = `panel_${recordingResult.panelId}_${Date.now()}`;

                try {
                    const sessionUrl = await uploadVideoAndGetUrl(recordingResult.videoPath, videoCode, ENV.API_TOKEN);
                    console.log(`✅ Uploaded panel recording: ${sessionUrl}`);

                    const actionItem = await tracker.dataItemManager.getItem(recordingResult.panelId);
                    if (actionItem && actionItem.item_category === 'ACTION') {
                        const updatedMetadata = {
                            ...(actionItem.metadata || {}),
                            session_url: sessionUrl,
                            session_start: recordingResult.sessionStart,
                            session_end: recordingResult.sessionEnd
                        };

                        await tracker.dataItemManager.updateItem(recordingResult.panelId, {
                            metadata: updatedMetadata
                        });
                    }

                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '✅ Recorded!'
                    });
                } catch (uploadErr) {
                    console.error('Failed to upload panel recording:', uploadErr);
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '❌ Upload fail!'
                    });
                }
            }
        } catch (err) {
            console.error('Failed to manual capture AI:', err);
        }
    };

    const drawPanelAndDetectActionsHandler = async () => {
        let restoreViewport = null;

        try {
            if (tracker.geminiAsking) {
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Gemini đang xử lý, vui lòng đợi...'
                });
                return;
            }

            if (!tracker.selectedPanelId || !tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('No panel selected or managers not initialized');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Vui lòng chọn panel trước!'
                });
                return;
            }

            const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
            if (!panelItem || panelItem.item_category !== 'PANEL') {
                console.error('Selected item is not a PANEL');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Item không phải PANEL!'
                });
                return;
            }

            const parentEntry = await tracker.parentPanelManager.getPanelEntry(tracker.selectedPanelId);
            if (parentEntry && parentEntry.child_actions && parentEntry.child_actions.length > 0) {
                console.warn('⚠️ Panel already has actions. Reset panel first.');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Panel đã có actions! Bấm Reset (↺) nếu muốn detect lại.'
                });
                return;
            }

            console.log('📸 Draw Panel & Detect Actions: Capturing long scroll screenshot...');

            // Check for newly opened tabs (within last 30 seconds)
            let pageToCapture = tracker.page;
            let switchedToNewTab = false;
            const now = Date.now();
            const recentTabs = tracker.newlyOpenedTabs.filter(tab => (now - tab.timestamp) < 30000);
            
            if (recentTabs.length > 0) {
                // Get the most recent new tab
                const newestTab = recentTabs[recentTabs.length - 1];
                try {
                    // Wait for the page to be ready
                    try {
                        await newestTab.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 });
                    } catch (navErr) {
                        // Page might already be loaded, continue
                    }
                    
                    // Get URL (might not have been available when tab was created)
                    let newTabUrl = newestTab.url;
                    if (!newTabUrl || newTabUrl === 'about:blank') {
                        try {
                            newTabUrl = newestTab.page.url();
                        } catch (urlErr) {
                            // URL not available yet
                        }
                    }
                    
                    if (newTabUrl && newTabUrl !== 'about:blank') {
                        console.log(`🆕 Switching to newly opened tab: ${newTabUrl}`);
                        tracker.originalPage = tracker.page; // Store original page
                        tracker.page = newestTab.page;
                        pageToCapture = newestTab.page;
                        switchedToNewTab = true;
                        
                        // Wait a bit for the page to fully load
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        console.log('⚠️ New tab URL not available or is about:blank, using current page');
                    }
                } catch (err) {
                    console.warn('⚠️ Failed to switch to new tab, using current page:', err);
                }
            }

            const progressCallback = async (message) => {
                await tracker.queuePage.evaluate((msg) => {
                    if (window.showToast) {
                        window.showToast(msg);
                    }
                }, message);
            };

            const { captureScreenshot } = await import('../media/screenshot.js');
            const result = await captureScreenshot(pageToCapture, "base64", true, true, progressCallback);
            const { screenshot, imageWidth, imageHeight, restoreViewport: restoreViewportFn } = result;
            restoreViewport = restoreViewportFn;
            console.log(`📐 Long scroll image captured: ${imageWidth}x${imageHeight}`);

            console.log('📐 Detecting actions from DOM (FULL PAGE)...');
            const { captureActionsFromDOM } = await import('../media/dom-capture.js');
            const fullPageDomActions = await captureActionsFromDOM(pageToCapture, null, true, imageWidth, imageHeight);
            console.log(`✅ Detected ${fullPageDomActions.length} DOM actions from full page`);

            let suggestedCrop = null;
            try {
                const currentPanelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
                const oldDom = await tracker.parentPanelManager.getParentDom(tracker.selectedPanelId);

                // Lấy panel_before từ doing_step (chính xác hơn findMyParent)
                let oldPanelItem = currentPanelItem;
                try {
                    const stepContent = await tracker.stepManager.getAllSteps();
                    const relatedStep = stepContent.find(step => step.panel_after?.item_id === tracker.selectedPanelId);
                    
                    if (relatedStep && relatedStep.panel_before?.item_id) {
                        const panelBeforeId = relatedStep.panel_before.item_id;
                        const panelBeforeItem = await tracker.dataItemManager.getItem(panelBeforeId);
                        
                        if (panelBeforeItem?.image_base64) {
                            oldPanelItem = panelBeforeItem;
                            console.log('🎯 [CROP SUGGEST] Using panel_before from step as baseline image:', {
                                panel_before_id: panelBeforeId,
                                panel_after_id: tracker.selectedPanelId,
                                panel_before_name: panelBeforeItem.name,
                                panel_after_name: currentPanelItem?.name,
                                step_id: relatedStep.step_id
                            });
                        } else {
                            console.log('🎯 [CROP SUGGEST] panel_before has no image_base64, fallback to current panel');
                        }
                    } else {
                        console.log('🎯 [CROP SUGGEST] No step found with panel_after matching selectedPanelId, using current panel as baseline');
                    }
                } catch (stepErr) {
                    console.error('🎯 [CROP SUGGEST] Failed to resolve panel_before from step, using current panel as baseline:', stepErr);
                }

                const oldScreenshotBase64 = oldPanelItem?.image_base64
                    ? await tracker.dataItemManager.loadBase64FromFile(oldPanelItem.image_base64)
                    : null;

                console.log('🎯 [CROP SUGGEST] Baseline image info:', {
                    panel_id: oldPanelItem?.item_id,
                    panel_name: oldPanelItem?.name,
                    has_image: !!oldScreenshotBase64
                });

                const isAfterLoginPanel = currentPanelItem?.name === 'After Login Panel';
                suggestedCrop = await suggestCropAreaForNewPanel({
                    oldScreenshotBase64,
                    newScreenshotBase64: screenshot,
                    imageWidth,
                    imageHeight,
                    oldDomActions: oldDom,
                    newDomActions: fullPageDomActions,
                    afterLoginPanel: isAfterLoginPanel
                });

                if (suggestedCrop) {
                    console.log('🎯 Suggested crop area:', suggestedCrop);
                }
            } catch (cropErr) {
                console.error('Failed to suggest crop area:', cropErr);
            }

            const pageHeight = 1080;
            const numPages = Math.ceil(imageHeight / pageHeight);
            const pagesData = [];

            for (let i = 0; i < numPages; i++) {
                pagesData.push({
                    page_number: i + 1,
                    y_start: i * pageHeight,
                    y_end: Math.min((i + 1) * pageHeight, imageHeight),
                    height: Math.min(pageHeight, imageHeight - i * pageHeight)
                });
            }

            console.log(`📐 Split into ${numPages} pages`);

            await tracker.queuePage.evaluate(async (editorClass, fullScreenshot, pages, initialCrop) => {
                if (window.queueEditor) {
                    try {
                        await window.queueEditor.cancel();
                    } catch (err) {
                        console.warn('⚠️ Failed to cancel previous editor:', err);
                    }
                    window.queueEditor = null;
                }

                eval(editorClass);

                const editor = new window.PanelEditor(
                    fullScreenshot,
                    null,
                    'twoPointCrop',
                    pages,
                    initialCrop
                );
                await editor.init();
                window.queueEditor = editor;
            }, await getPanelEditorClassHandler(), screenshot, pagesData, suggestedCrop);

            tracker.__drawPanelContext = {
                screenshot,
                imageWidth,
                imageHeight,
                pagesData,
                restoreViewport: restoreViewportFn,
                fullPageDomActions,
                switchedToNewTab: switchedToNewTab,
                originalPage: switchedToNewTab ? tracker.originalPage : null
            };

            console.log('✅ Opened crop editor. Waiting for user to draw panel...');

        } catch (err) {
            console.error('Failed to draw panel & detect actions:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: '❌ Capture failed!'
            });
        } finally {
            if (restoreViewport) {
                try {
                    await restoreViewport();
                    console.log('✅ Viewport restored');
                } catch (restoreErr) {
                    console.error('❌ Failed to restore viewport:', restoreErr);
                }
            }
        }
    };

    const confirmPanelCropHandler = async (cropArea) => {
        try {
            if (!tracker.__drawPanelContext) {
                console.error('No draw panel context found');
                return;
            }

            const { screenshot, imageWidth, imageHeight, pagesData, restoreViewport, fullPageDomActions, switchedToNewTab, originalPage } = tracker.__drawPanelContext;

            cropArea.x = Math.max(0, cropArea.x);
            cropArea.y = Math.max(0, cropArea.y);
            cropArea.w = Math.max(1, cropArea.w);
            cropArea.h = Math.max(1, cropArea.h);

            console.log(`✅ Crop confirmed: x=${cropArea.x}, y=${cropArea.y}, w=${cropArea.w}, h=${cropArea.h}`);

            const sharp = (await import('sharp')).default;
            const fullBuffer = Buffer.from(screenshot, 'base64');

            const croppedBuffer = await sharp(fullBuffer)
                .extract({
                    left: cropArea.x,
                    top: cropArea.y,
                    width: cropArea.w,
                    height: cropArea.h
                })
                .toBuffer();

            const croppedBase64 = croppedBuffer.toString('base64');

            // Detect panel type using Gemini
            // Solution 1: Use full screenshot to see backdrop for better popup detection
            console.log('🤖 Detecting panel type with Gemini (using full screenshot for backdrop detection)...');
            const { detectPanelTypeByGemini } = await import('./gemini-handler.js');
            let detectedPanelType = 'screen'; // Default
            
            // If we switched to a new tab, force panel type to "newtab"
            if (switchedToNewTab) {
                detectedPanelType = 'newtab';
                console.log(`✅ Panel type set to "newtab" (captured from newly opened tab)`);
            } else {
                try {
                    // Pass both full screenshot and crop area for better popup detection (Solution 1)
                    detectedPanelType = await detectPanelTypeByGemini(croppedBase64, screenshot, cropArea);
                    console.log(`✅ Detected panel type: ${detectedPanelType}`);
                } catch (err) {
                    console.error('⚠️ Failed to detect panel type, using default "screen":', err);
                }
            }

            await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                image_base64: croppedBase64,
                type: detectedPanelType,
                metadata: {
                    global_pos: {
                        x: cropArea.x,
                        y: cropArea.y,
                        w: cropArea.w,
                        h: cropArea.h
                    }
                }
            });

            console.log(`📐 Using ${fullPageDomActions.length} actions from full page detection`);
            console.log(`📐 Full screenshot size: ${imageWidth}x${imageHeight}`);

            const scaleX = imageWidth / 1000;
            const scaleY = imageHeight / 1000;

            const scaledDomActions = fullPageDomActions.map(action => ({
                ...action,
                action_pos: {
                    x: Math.round(action.action_pos.x * scaleX),
                    y: Math.round(action.action_pos.y * scaleY),
                    w: Math.round(action.action_pos.w * scaleX),
                    h: Math.round(action.action_pos.h * scaleY)
                }
            }));

            console.log(`✅ Scaled actions from normalized (0-1000) to actual pixels`);

            const seenGlobalPositions = new Map();
            const uniqueScaledActions = [];

            for (const action of scaledDomActions) {
                const posKey = `${action.action_pos.x},${action.action_pos.y},${action.action_pos.w},${action.action_pos.h}`;

                if (!seenGlobalPositions.has(posKey)) {
                    seenGlobalPositions.set(posKey, true);
                    uniqueScaledActions.push(action);
                }
            }

            console.log(`🔄 Deduplicated ${scaledDomActions.length} → ${uniqueScaledActions.length} unique actions (by global position)`);

            const filteredActions = uniqueScaledActions.filter(action => {
                const ax = action.action_pos.x;
                const ay = action.action_pos.y;
                const aw = action.action_pos.w;
                const ah = action.action_pos.h;

                const actionRight = ax + aw;
                const actionBottom = ay + ah;
                const cropRight = cropArea.x + cropArea.w;
                const cropBottom = cropArea.y + cropArea.h;

                return (
                    ax >= cropArea.x &&
                    ay >= cropArea.y &&
                    actionRight <= cropRight &&
                    actionBottom <= cropBottom
                );
            });

            const adjustedActions = filteredActions.map(action => ({
                ...action,
                action_pos: {
                    x: action.action_pos.x - cropArea.x,
                    y: action.action_pos.y - cropArea.y,
                    w: action.action_pos.w,
                    h: action.action_pos.h
                }
            }));

            console.log(`✅ Filtered ${adjustedActions.length} actions in crop area`);

            const actionIds = [];
            const pageHeight = 1080;
            const panelHeight = cropArea.h;
            const numPanelPages = Math.ceil(panelHeight / pageHeight);

            console.log(`📐 Panel height: ${panelHeight}px → ${numPanelPages} pages`);

            const parentEntry = await tracker.parentPanelManager.getPanelEntry(tracker.selectedPanelId);
            const existingActionIds = parentEntry?.child_actions || [];

            const existingActions = await Promise.all(
                existingActionIds.map(id => tracker.dataItemManager.getItem(id))
            );
            const existingNames = existingActions.filter(Boolean).map(a => a.name);

            const nameCountMap = new Map();
            existingNames.forEach(name => {
                nameCountMap.set(name, (nameCountMap.get(name) || 0) + 1);
            });

            for (const action of adjustedActions) {
                const actionCenterY = action.action_pos.y + action.action_pos.h / 2;
                const pageNumber = Math.floor(actionCenterY / pageHeight) + 1;
                const clampedPageNumber = Math.min(pageNumber, numPanelPages);

                let actionName = action.action_name;

                if (nameCountMap.has(actionName)) {
                    const count = nameCountMap.get(actionName);
                    actionName = `${actionName} (${count + 1})`;
                    nameCountMap.set(action.action_name, count + 1);
                } else {
                    nameCountMap.set(actionName, 0);
                }

                const actionId = await tracker.dataItemManager.createAction(
                    actionName,
                    action.action_type,
                    action.action_verb,
                    action.action_pos,
                    clampedPageNumber
                );

                actionIds.push(actionId);
                await tracker.parentPanelManager.addChildAction(tracker.selectedPanelId, actionId);
            }

            console.log(`✅ Added ${actionIds.length} actions to panel child_actions`);

            await tracker.parentPanelManager.updateParentDom(tracker.selectedPanelId, adjustedActions);

            if (restoreViewport) {
                await restoreViewport();
            }

            try {
                await tracker.page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
                console.log('✅ Page reloaded after capture');
            } catch (reloadErr) {
                console.error('⚠️ Page reload failed:', reloadErr.message);
            }

            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });

            const updatedPanel = await tracker.dataItemManager.getItem(tracker.selectedPanelId);

            const actions = [];
            for (const actionId of actionIds) {
                const actionItem = await tracker.dataItemManager.getItem(actionId);
                if (actionItem) {
                    actions.push({
                        action_id: actionItem.item_id,
                        action_name: actionItem.name,
                        action_type: actionItem.type,
                        action_verb: actionItem.verb,
                        action_content: actionItem.content,
                        action_pos: {
                            x: actionItem.metadata.global_pos.x,
                            y: actionItem.metadata.global_pos.y,
                            w: actionItem.metadata.global_pos.w,
                            h: actionItem.metadata.global_pos.h
                        }
                    });
                }
            }

            const actionList = actions.map(a => a.action_name).filter(Boolean).join(', ');

            await tracker._broadcast({
                type: 'panel_selected',
                panel_id: tracker.selectedPanelId,
                screenshot: updatedPanel?.image_base64 ? await tracker.dataItemManager.loadBase64FromFile(updatedPanel.image_base64) : null,
                actions: actions,
                action_list: actionList,
                action_count: actions.length,
                metadata: updatedPanel?.metadata || null,
                timestamp: Date.now()
            });

            await tracker._broadcast({
                type: 'show_toast',
                message: `✅ Panel Saved + ${adjustedActions.length} actions detected`
            });

            // Tạo quan hệ parent-child từ step
            await createPanelRelationFromStep(tracker.selectedPanelId);
            
            // Restore original page if we switched to a new tab
            if (switchedToNewTab && originalPage) {
                try {
                    console.log('🔄 Restoring original page...');
                    tracker.page = originalPage;
                    // Bring original page to front
                    await originalPage.bringToFront().catch(() => {});
                    console.log('✅ Restored to original page');
                } catch (err) {
                    console.warn('⚠️ Failed to restore original page:', err);
                }
            }
            
            delete tracker.__drawPanelContext;
            console.log('✅ Draw Panel & Detect Actions completed!');

        } catch (err) {
            console.error('Failed to confirm panel crop:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: '❌ Failed to save panel!'
            });
        }
    };

    const captureActionsHandler = async () => {
        try {
            if (tracker.geminiAsking) {
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Gemini đang xử lý, vui lòng đợi...'
                });
                return;
            }

            if (!tracker.selectedPanelId || !tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('No panel selected or managers not initialized');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Vui lòng chọn page trước!'
                });
                return;
            }

            const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
            if (!panelItem || panelItem.item_category !== 'PAGE') {
                console.error('Selected item is not a PAGE');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Chỉ có thể detect actions trên PAGE!'
                });
                return;
            }

            if (panelItem.status === 'completed') {
                console.warn('⚠️ Page already completed.');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Page đã completed!'
                });
                return;
            }

            const { promises: fsp } = await import('fs');
            const path = await import('path');
            const parentPath = path.default.join(tracker.sessionFolder, 'myparent_panel.jsonl');
            const content = await fsp.readFile(parentPath, 'utf8');
            const allParents = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const parentPanelEntry = allParents.find(p =>
                p.child_pages && p.child_pages.some(pg => pg.page_id === tracker.selectedPanelId)
            );

            if (parentPanelEntry) {
                const childPage = parentPanelEntry.child_pages?.find(p => p.page_id === tracker.selectedPanelId);
                if (childPage && childPage.child_actions && childPage.child_actions.length > 0) {
                    console.warn('⚠️ Page already has actions. Reset page first.');
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '⚠️ Page đã có actions! Bấm Reset (↺) nếu muốn detect lại.'
                    });
                    return;
                }
            }

            console.log('📸 DOM Capture triggered');

            const recordingResult = await tracker.stopPanelRecording();

            let screenshot = null;
            let imageWidth = 0;
            let imageHeight = 0;
            let displayScreenshot = null;

            if (panelItem.item_category === 'PAGE') {
                const hasFullImageInfo = panelItem.image_base64 &&
                    panelItem.metadata?.y !== undefined &&
                    panelItem.metadata?.h !== undefined;

                if (hasFullImageInfo) {
                    screenshot = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);
                    displayScreenshot = screenshot;
                    console.log('✅ Using PAGE image_base64 with full metadata (no capture)');
                } else {
                    console.log('📸 PAGE has no screenshot, capturing current viewport...');

                    const scrollPosition = await tracker.page.evaluate(() => ({
                        x: window.scrollX || window.pageXOffset,
                        y: window.scrollY || window.pageYOffset
                    }));

                    await tracker.page.evaluate(() => {
                        document.documentElement.style.overflow = 'hidden';
                        document.body.style.overflow = 'hidden';
                    });

                    const { captureScreenshot } = await import('../media/screenshot.js');
                    screenshot = await captureScreenshot(tracker.page, "base64", false);
                    displayScreenshot = screenshot;

                    await tracker.page.evaluate(() => {
                        document.documentElement.style.overflow = '';
                        document.body.style.overflow = '';
                    });

                    const sharp = (await import('sharp')).default;
                    const buffer = Buffer.from(screenshot, 'base64');
                    const metadata = await sharp(buffer).metadata();

                    const currentMetadata = panelItem.metadata || {};
                    await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                        image_base64: screenshot,
                        metadata: {
                            ...currentMetadata,
                            x: scrollPosition.x,
                            y: scrollPosition.y,
                            w: metadata.width,
                            h: metadata.height
                        }
                    });

                    console.log(`✅ Captured current viewport ${metadata.width}x${metadata.height} at scroll (${scrollPosition.x}, ${scrollPosition.y})`);
                }

                const sharp = (await import('sharp')).default;
                const buffer = Buffer.from(screenshot, 'base64');
                const metadata = await sharp(buffer).metadata();
                imageWidth = metadata.width;
                imageHeight = metadata.height;
                console.log(`📐 Page image: ${imageWidth}x${imageHeight}`);
            } else {
                const originalViewport = tracker.page.viewport() || await tracker.page.evaluate(() => ({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    deviceScaleFactor: window.devicePixelRatio
                }));

                await tracker.page.setViewport({
                    width: 1920,
                    height: 1080,
                    deviceScaleFactor: 1
                });

                await tracker.page.evaluate(() => {
                    document.documentElement.style.overflow = 'hidden';
                    document.body.style.overflow = 'hidden';
                });

                const { captureScreenshot } = await import('../media/screenshot.js');
                screenshot = await captureScreenshot(tracker.page, "base64", false);

                await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                    image_base64: screenshot
                });

                const sharp = (await import('sharp')).default;
                const buffer = Buffer.from(screenshot, 'base64');
                const metadata = await sharp(buffer).metadata();
                imageWidth = metadata.width;
                imageHeight = metadata.height;
                console.log(`📐 Image captured: ${imageWidth}x${imageHeight}`);

                displayScreenshot = screenshot;


                await tracker.page.evaluate(() => {
                    document.documentElement.style.overflow = '';
                    document.body.style.overflow = '';
                });
                await tracker.page.setViewport(originalViewport);
            }

            await tracker._broadcast({
                type: 'panel_selected',
                panel_id: tracker.selectedPanelId,
                item_category: panelItem.item_category,
                screenshot: displayScreenshot,
                actions: [],
                action_list: '⏳ Capturing...',
                gemini_detecting: true,
                timestamp: Date.now()
            });

            const { detectScreenByDOM } = await import('./gemini-handler.js');
            const isFullPage = panelItem.item_category === 'PAGE';
            await detectScreenByDOM(tracker, tracker.selectedPanelId, isFullPage, imageWidth, imageHeight);

            if (recordingResult && tracker.dataItemManager) {
                const { uploadVideoAndGetUrl } = await import('../media/uploader.js');
                const { ENV } = await import('../config/env.js');
                const videoCode = `panel_${recordingResult.panelId}_${Date.now()}`;

                try {
                    const sessionUrl = await uploadVideoAndGetUrl(recordingResult.videoPath, videoCode, ENV.API_TOKEN);
                    console.log(`✅ Uploaded panel recording: ${sessionUrl}`);

                    const actionItem = await tracker.dataItemManager.getItem(recordingResult.panelId);
                    if (actionItem && actionItem.item_category === 'ACTION') {
                        const updatedMetadata = {
                            ...(actionItem.metadata || {}),
                            session_url: sessionUrl,
                            session_start: recordingResult.sessionStart,
                            session_end: recordingResult.sessionEnd
                        };

                        await tracker.dataItemManager.updateItem(recordingResult.panelId, {
                            metadata: updatedMetadata
                        });
                    }

                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '✅ Recorded!'
                    });
                } catch (uploadErr) {
                    console.error('Failed to upload panel recording:', uploadErr);
                }
            }

            console.log('✅ DOM Capture completed');
        } catch (err) {
            console.error('Failed to capture actions:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: '❌ Capture failed!'
            });
        }
    };

    const manualCaptureAIScrollingHandler = async () => {
        try {
            if (tracker.geminiAsking) {
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Gemini đang xử lý, vui lòng đợi...'
                });
                return;
            }

            if (tracker.selectedPanelId && tracker.dataItemManager && tracker.parentPanelManager) {
                const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
                if (panelItem && panelItem.status === 'completed') {
                    console.warn('⚠️ Panel already completed. Reset panel first.');
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '⚠️ Panel đã completed! Bấm Reset (↺) nếu muốn chụp lại.'
                    });
                    return;
                }

                const parentEntry = await tracker.parentPanelManager.getPanelEntry(tracker.selectedPanelId);
                if (parentEntry && parentEntry.child_actions && parentEntry.child_actions.length > 0) {
                    console.warn('⚠️ Panel already has actions. Reset panel first.');
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '⚠️ Panel đã có actions! Bấm Reset (↺) nếu muốn detect lại.'
                    });
                    return;
                }
            }

            console.log('🤖 Gemini AI capture (SCROLLING) triggered');

            const recordingResult = await tracker.stopPanelRecording();

            const timestamp = Date.now();
            let screenshot = null;
            let screenshotForGemini = null;

            if (tracker.selectedPanelId && tracker.dataItemManager) {
                const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);

                const { captureScreenshot } = await import('../media/screenshot.js');
                screenshot = await captureScreenshot(tracker.page, "base64", true);
                console.log('📸 Captured FULL PAGE screenshot');

                await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                    image_base64: screenshot
                });

                screenshotForGemini = screenshot;

                await tracker._broadcast({
                    type: 'panel_selected',
                    panel_id: tracker.selectedPanelId,
                    item_category: 'PANEL',
                    screenshot: screenshotForGemini,
                    actions: [],
                    action_list: '⏳ Loading...',
                    action_count: '⏳ Loading...',
                    gemini_detecting: true,
                    timestamp: timestamp
                });

                await tracker._broadcast({
                    type: 'tree_update',
                    data: await tracker.panelLogManager.buildTreeStructure()
                });
            }

            await tracker.screenQueue.put({
                panel_id: tracker.selectedPanelId,
                screenshot: screenshotForGemini,
                timestamp: timestamp
            });

            console.log('✅ Screenshot added to Gemini queue');

            if (recordingResult && tracker.dataItemManager) {
                const { uploadVideoAndGetUrl } = await import('../media/uploader.js');
                const { ENV } = await import('../config/env.js');
                const videoCode = `panel_${recordingResult.panelId}_${Date.now()}`;

                try {
                    const sessionUrl = await uploadVideoAndGetUrl(recordingResult.videoPath, videoCode, ENV.API_TOKEN);
                    console.log(`✅ Uploaded panel recording: ${sessionUrl}`);

                    const actionItem = await tracker.dataItemManager.getItem(recordingResult.panelId);
                    if (actionItem && actionItem.item_category === 'ACTION') {
                        const updatedMetadata = {
                            ...(actionItem.metadata || {}),
                            session_url: sessionUrl,
                            session_start: recordingResult.sessionStart,
                            session_end: recordingResult.sessionEnd
                        };

                        await tracker.dataItemManager.updateItem(recordingResult.panelId, {
                            metadata: updatedMetadata
                        });
                    }

                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '✅ Recorded!'
                    });
                } catch (uploadErr) {
                    console.error('Failed to upload panel recording:', uploadErr);
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '❌ Upload fail!'
                    });
                }
            }
        } catch (err) {
            console.error('Failed to manual capture AI scrolling:', err);
        }
    };

    const detectPagesHandler = async () => {
        try {
            if (!tracker.selectedPanelId || !tracker.dataItemManager) {
                console.error('No panel selected or managers not initialized');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Vui lòng chọn panel trước!'
                });
                return;
            }

            const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
            if (!panelItem || panelItem.item_category !== 'PANEL') {
                console.error('Selected item is not a PANEL');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Item không phải PANEL!'
                });
                return;
            }

            const parentEntry = await tracker.parentPanelManager.getPanelEntry(tracker.selectedPanelId);
            if (parentEntry && parentEntry.child_pages && parentEntry.child_pages.length > 0) {
                console.warn('⚠️ Panel already has pages. Reset panel first.');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Panel đã có pages! Bấm Reset (↺) nếu muốn detect lại.'
                });
                return;
            }

            console.log('📸 Detect Pages: Capturing long scroll screenshot...');
            await tracker._broadcast({
                type: 'detect_pages_status',
                in_progress: true,
                source: 'queue',
                timestamp: Date.now()
            });

            const { captureScreenshot } = await import('../media/screenshot.js');
            const result = await captureScreenshot(tracker.page, "base64", true, true);
            const { screenshot, imageWidth, imageHeight, restoreViewport } = result;
            console.log(`📐 Long scroll image captured: ${imageWidth}x${imageHeight}`);

            let numPages = 0;

            try {
                await tracker.page.evaluate(() => {
                    document.documentElement.style.overflow = 'hidden';
                    document.body.style.overflow = 'hidden';
                });

                await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                    image_base64: screenshot,
                    metadata: {
                        w: imageWidth,
                        h: imageHeight
                    }
                });

                console.log('📐 Auto-splitting into pages...');
                const sharp = (await import('sharp')).default;
                const imageBuffer = Buffer.from(screenshot, 'base64');

                const pageHeight = 1080;
                const pageWidth = Math.min(1920, imageWidth);
                numPages = Math.ceil(imageHeight / pageHeight);

                const panel = await tracker.dataItemManager.getItem(tracker.selectedPanelId);

                for (let i = 0; i < numPages; i++) {
                    const y = i * pageHeight;
                    const h = Math.min(pageHeight, imageHeight - y);
                    const w = Math.min(pageWidth, imageWidth);

                    console.log(`  📄 Creating Page ${i + 1}/${numPages} at y=${y}, h=${h}, w=${w}`);

                    const pageBuffer = await sharp(imageBuffer)
                        .extract({ left: 0, top: y, width: w, height: h })
                        .toBuffer();

                    const pageBase64 = pageBuffer.toString('base64');
                    const pageNumber = i + 1;

                    const pageId = await tracker.dataItemManager.createPage(
                        pageNumber,
                        pageBase64,
                        { x: 0, y, w, h }
                    );

                    await tracker.parentPanelManager.addChildPage(tracker.selectedPanelId, pageNumber, pageId);

                    await tracker._broadcast({
                        type: 'show_toast',
                        message: `📄 Created Page ${pageNumber}/${numPages}`
                    });
                }

                await tracker._broadcast({
                    type: 'tree_update',
                    data: await tracker.panelLogManager.buildTreeStructure()
                });

                const { detectScreenByDOM } = await import('./gemini-handler.js');
                await detectScreenByDOM(tracker, tracker.selectedPanelId, true, imageWidth, imageHeight, true);
            } finally {
                if (restoreViewport) {
                    await restoreViewport();
                }

                console.log('🔄 Reloading page to restore scroll (website-shot changed DOM structure)...');
                try {
                    await tracker.page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
                    console.log('✅ Page reloaded, scroll restored');
                } catch (reloadErr) {
                    console.error('⚠️ Page reload failed:', reloadErr.message);
                }
            }

            await tracker._broadcast({
                type: 'show_toast',
                message: `✅ Created ${numPages} pages + detected actions`
            });

            console.log(`✅ Detect Pages completed: ${numPages} pages created`);
            await tracker._broadcast({
                type: 'detect_pages_status',
                in_progress: false,
                source: 'queue',
                timestamp: Date.now()
            });
        } catch (err) {
            console.error('Failed to detect pages:', err);

            await tracker.page.evaluate(() => {
                document.documentElement.style.removeProperty('overflow');
                document.documentElement.style.removeProperty('overflow-y');
                document.documentElement.style.removeProperty('overflow-x');
                document.body.style.removeProperty('overflow');
                document.body.style.removeProperty('overflow-y');
                document.body.style.removeProperty('overflow-x');
            }).catch(() => { });

            await tracker._broadcast({
                type: 'show_toast',
                message: '❌ Capture failed!'
            });
            await tracker._broadcast({
                type: 'detect_pages_status',
                in_progress: false,
                source: 'queue',
                timestamp: Date.now()
            });
        }
    };

    const captureActionsScrollingHandler = async () => {
        try {
            if (tracker.geminiAsking) {
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Gemini đang xử lý, vui lòng đợi...'
                });
                return;
            }

            if (!tracker.selectedPanelId || !tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('No panel selected or managers not initialized');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Vui lòng chọn panel trước!'
                });
                return;
            }

            const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
            if (!panelItem || panelItem.item_category !== 'PANEL') {
                console.error('Selected item is not a PANEL');
                return;
            }

            if (panelItem.status === 'completed') {
                console.warn('⚠️ Panel already completed. Reset panel first.');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Panel đã completed! Bấm Reset (↺) nếu muốn chụp lại.'
                });
                return;
            }

            const parentEntry = await tracker.parentPanelManager.getPanelEntry(tracker.selectedPanelId);
            if (parentEntry && parentEntry.child_actions && parentEntry.child_actions.length > 0) {
                console.warn('⚠️ Panel already has actions. Reset panel first.');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Panel đã có actions! Bấm Reset (↺) nếu muốn capture lại.'
                });
                return;
            }

            console.log('📸 DOM Capture (SCROLLING) triggered');

            const recordingResult = await tracker.stopPanelRecording();

            await tracker.page.evaluate(() => {
                document.documentElement.style.overflow = 'hidden';
                document.body.style.overflow = 'hidden';
            });

            const { captureScreenshot } = await import('../media/screenshot.js');
            const result = await captureScreenshot(tracker.page, "base64", true, true);
            const { screenshot, imageWidth, imageHeight, restoreViewport } = result;
            console.log(`📐 Image captured: ${imageWidth}x${imageHeight}`);

            await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                image_base64: screenshot
            });

            const displayScreenshot = screenshot;

            await tracker._broadcast({
                type: 'panel_selected',
                panel_id: tracker.selectedPanelId,
                item_category: 'PANEL',
                screenshot: displayScreenshot,
                actions: [],
                action_list: '⏳ Capturing...',
                gemini_detecting: true,
                timestamp: Date.now()
            });

            try {
                const { detectScreenByDOM } = await import('./gemini-handler.js');
                await detectScreenByDOM(tracker, tracker.selectedPanelId, true, imageWidth, imageHeight, true);
            } finally {
                await tracker.page.evaluate(() => {
                    document.documentElement.style.overflow = '';
                    document.body.style.overflow = '';
                });
                if (restoreViewport) {
                    await restoreViewport();
                }
            }

            if (recordingResult && tracker.dataItemManager) {
                const { uploadVideoAndGetUrl } = await import('../media/uploader.js');
                const { ENV } = await import('../config/env.js');
                const videoCode = `panel_${recordingResult.panelId}_${Date.now()}`;

                try {
                    const sessionUrl = await uploadVideoAndGetUrl(recordingResult.videoPath, videoCode, ENV.API_TOKEN);
                    console.log(`✅ Uploaded panel recording: ${sessionUrl}`);

                    const actionItem = await tracker.dataItemManager.getItem(recordingResult.panelId);
                    if (actionItem && actionItem.item_category === 'ACTION') {
                        const updatedMetadata = {
                            ...(actionItem.metadata || {}),
                            session_url: sessionUrl,
                            session_start: recordingResult.sessionStart,
                            session_end: recordingResult.sessionEnd
                        };

                        await tracker.dataItemManager.updateItem(recordingResult.panelId, {
                            metadata: updatedMetadata
                        });
                    }

                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '✅ Recorded!'
                    });
                } catch (uploadErr) {
                    console.error('Failed to upload panel recording:', uploadErr);
                }
            }

            console.log('✅ DOM Capture completed');
        } catch (err) {
            console.error('Failed to capture actions scrolling:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: '❌ Capture failed!'
            });
        }
    };

    const selectPanelHandler = async (itemId) => {
        try {
            if (tracker.isLoadingSelection) {
                const loadingItem = await tracker.dataItemManager.getItem(tracker.loadingSelectionId);
                const loadingName = loadingItem?.name || 'item';
                await tracker._broadcast({
                    type: 'show_toast',
                    message: `⏳ Vui lòng chờ yêu cầu cho "${loadingName}" xử lý xong`
                });
                return;
            }

            if (tracker.selectedPanelId === itemId && lastLoadedPanelId === itemId) {
                console.log(`⏭️ Skip reload: Already selected ${itemId}`);
                return;
            }

            console.log(`🔄 Loading panel ${itemId} (current: ${tracker.selectedPanelId}, last: ${lastLoadedPanelId})`);

            tracker.isLoadingSelection = true;
            tracker.loadingSelectionId = itemId;

            await tracker._broadcast({
                type: 'tree_loading_state',
                loading: true,
                itemId: itemId
            });

            if (tracker.isRecordingPanel && tracker.recordingPanelId !== itemId) {
                await tracker.cancelPanelRecording();
            }

            tracker.selectedPanelId = itemId;

            if (!tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('Managers not initialized');
                return;
            }

            const item = await tracker.dataItemManager.getItem(itemId);
            if (!item) {
                console.error('Item not found:', itemId);
                return;
            }

            if (item.item_category === 'ACTION' && item.status === 'pending' && !item.metadata?.session_url) {
                const { ENV } = await import('../config/env.js');
                const enable = ENV.RECORD_PANEL === 'true' || ENV.RECORD_PANEL === true;
                if (enable) {
                    await tracker.startPanelRecording(itemId);
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '🎬 Recording...'
                    });
                }
            }

            let screenshot = null;
            let actions = [];
            let actionList = '';
            let actionInfo = null;

            if (item.item_category === 'PANEL') {
                const parentEntry = await tracker.parentPanelManager.getPanelEntry(itemId);
                const actionIds = parentEntry?.child_actions || [];

                for (const actionId of actionIds) {
                    const actionItem = await tracker.dataItemManager.getItem(actionId);
                    if (actionItem) {
                        actions.push({
                            action_id: actionItem.item_id,
                            action_name: actionItem.name,
                            action_type: actionItem.type,
                            action_verb: actionItem.verb,
                            action_content: actionItem.content,
                            action_pos: {
                                x: actionItem.metadata.global_pos.x,
                                y: actionItem.metadata.global_pos.y,
                                w: actionItem.metadata.global_pos.w,
                                h: actionItem.metadata.global_pos.h
                            }
                        });
                    }
                }

                actionList = actions.map(a => a.action_name).filter(Boolean).join(', ');

                let displayImage = await tracker.dataItemManager.loadBase64FromFile(item.image_base64);


                screenshot = displayImage;
            } else if (item.item_category === 'PAGE') {
                screenshot = await tracker.dataItemManager.loadBase64FromFile(item.image_base64);

                const { promises: fsp } = await import('fs');
                const path = await import('path');
                const parentPath = path.default.join(tracker.sessionFolder, 'myparent_panel.jsonl');
                const content = await fsp.readFile(parentPath, 'utf8');
                const allParents = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const parentPanelEntry = allParents.find(p =>
                    p.child_pages && p.child_pages.some(pg => pg.page_id === itemId)
                );

                if (parentPanelEntry) {
                    const childPage = parentPanelEntry.child_pages?.find(p => p.page_id === itemId);
                    const actionIds = childPage?.child_actions || [];

                    for (const actionId of actionIds) {
                        const actionItem = await tracker.dataItemManager.getItem(actionId);
                        if (actionItem) {
                            actions.push({
                                action_id: actionItem.item_id,
                                action_name: actionItem.name,
                                action_type: actionItem.type,
                                action_verb: actionItem.verb,
                                action_content: actionItem.content,
                                action_pos: {
                                    x: actionItem.metadata.global_pos.x,
                                    y: actionItem.metadata.global_pos.y,
                                    w: actionItem.metadata.global_pos.w,
                                    h: actionItem.metadata.global_pos.h
                                }
                            });
                        }
                    }

                    actionList = actions.map(a => a.action_name).filter(Boolean).join(', ');
                }
            } else if (item.item_category === 'ACTION') {
                actionInfo = {
                    name: item.name,
                    type: item.type,
                    verb: item.verb,
                    content: item.content,
                    position: {
                        x: item.metadata.global_pos.x,
                        y: item.metadata.global_pos.y,
                        w: item.metadata.global_pos.w,
                        h: item.metadata.global_pos.h
                    },
                    step_info: null
                };

                const step = await tracker.stepManager.getStepForAction(itemId);
                if (step) {
                    const panelBeforeItem = await tracker.dataItemManager.getItem(step.panel_before.item_id);
                    const panelAfterItem = await tracker.dataItemManager.getItem(step.panel_after.item_id);

                    const mode = step.panel_before.item_id === step.panel_after.item_id ? 'USE_BEFORE' : 'DRAW_NEW';

                    actionInfo.step_info = {
                        mode: mode,
                        panel_before_name: panelBeforeItem?.name || 'Unknown',
                        panel_after_name: panelAfterItem?.name || 'Unknown'
                    };
                }
            }

            const baseEvent = {
                type: 'panel_selected',
                panel_id: itemId,
                item_category: item.item_category,
                item_type: item.type,
                item_name: item.name,
                item_verb: item.verb,
                item_content: item.content,
                screenshot: screenshot,
                timestamp: Date.now()
            };

            let updatedEvent;
            if (item.item_category === 'PANEL' && item.metadata?.global_pos) {
                updatedEvent = {
                    ...baseEvent,
                    actions: actions,
                    action_list: actionList,
                    action_count: actions.length,
                    metadata: item.metadata
                };
            } else if (item.item_category === 'ACTION') {
                updatedEvent = {
                    ...baseEvent,
                    action_info: actionInfo
                };
            } else if (item.item_category === 'PAGE' && item.metadata) {
                updatedEvent = {
                    ...baseEvent,
                    actions: actions,
                    action_list: actionList,
                    action_count: actions.length,
                    metadata: item.metadata
                };
            } else {
                updatedEvent = {
                    ...baseEvent,
                    actions: actions,
                    action_list: actionList,
                    action_count: actions.length
                };
            }

            await tracker._broadcast(updatedEvent);
        } catch (err) {
            console.error('Failed to select panel:', err);
        } finally {
            lastLoadedPanelId = itemId;
            tracker.isLoadingSelection = false;
            tracker.loadingSelectionId = null;

            await tracker._broadcast({
                type: 'tree_loading_state',
                loading: false
            });
        }
    };

    const getPanelTreeHandler = async () => {
        try {
            if (!tracker.panelLogManager) return [];
            return await tracker.panelLogManager.buildTreeStructure();
        } catch (err) {
            console.error('Failed to get panel tree:', err);
            return [];
        }
    };

    const deleteClickEventHandler = async (timestamp, actionItemId) => {
        try {
            if (!tracker.clickManager || !actionItemId) return;

            const clickPath = path.join(tracker.sessionFolder, 'click.jsonl');
            const content = await fsp.readFile(clickPath, 'utf8').catch(() => '');
            if (!content.trim()) return;

            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line))
                .filter(e => !(e.action_item_id === actionItemId && e.timestamp === timestamp));

            const newContent = entries.map(e => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
            await fsp.writeFile(clickPath, newContent, 'utf8');

            console.log(`🗑️ Deleted click event ${timestamp}`);
        } catch (err) {
            console.error('Failed to delete click event:', err);
        }
    };

    const clearAllClicksForActionHandler = async (actionItemId) => {
        try {
            if (!tracker.clickManager || !actionItemId) return;

            const clickPath = path.join(tracker.sessionFolder, 'click.jsonl');
            const content = await fsp.readFile(clickPath, 'utf8').catch(() => '');
            if (!content.trim()) return;

            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line))
                .filter(e => e.action_item_id !== actionItemId);

            const newContent = entries.map(e => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
            await fsp.writeFile(clickPath, newContent, 'utf8');

            console.log(`🗑️ Cleared all clicks for action ${actionItemId}`);
        } catch (err) {
            console.error('Failed to clear all clicks:', err);
        }
    };

    const resetActionStepHandler = async (actionItemId) => {
        try {
            if (!tracker.stepManager || !tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('Managers not initialized');
                return;
            }

            const step = await tracker.stepManager.getStepForAction(actionItemId);

            if (step && step.panel_before.item_id !== step.panel_after.item_id) {
                const panelAfterId = step.panel_after.item_id;

                const descendants = await tracker.parentPanelManager.getAllDescendants(panelAfterId);
                const allItemsToDelete = [panelAfterId, ...descendants];

                console.log(`🗑️ Deleting panel ${panelAfterId} and ${descendants.length} descendants`);

                for (const itemId of allItemsToDelete) {
                    await tracker.dataItemManager.deleteItem(itemId);
                }

                await tracker.parentPanelManager.deletePanelEntry(panelAfterId);

                await tracker.stepManager.deleteStepsForItems(allItemsToDelete);

                const clickPath = path.join(tracker.sessionFolder, 'click.jsonl');
                const clickContent = await fsp.readFile(clickPath, 'utf8').catch(() => '');
                if (clickContent.trim()) {
                    const clickEntries = clickContent.trim().split('\n')
                        .filter(line => line.trim())
                        .map(line => JSON.parse(line))
                        .filter(e => !allItemsToDelete.includes(e.action_item_id));

                    const newClickContent = clickEntries.map(e => JSON.stringify(e)).join('\n') + (clickEntries.length > 0 ? '\n' : '');
                    await fsp.writeFile(clickPath, newClickContent, 'utf8');
                }
            }

            await tracker.stepManager.deleteStepsForAction(actionItemId);

            await tracker.dataItemManager.updateItem(actionItemId, { status: 'pending' });

            const actionParentPanelId = await getParentPanelOfActionHandler(actionItemId);
            if (actionParentPanelId) {
                await checkAndUpdatePanelStatusHandler(actionParentPanelId);
            }

            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });

            console.log(`🔄 Reset step for action ${actionItemId}`);
        } catch (err) {
            console.error('Failed to reset action step:', err);
        }
    };

    const renamePanelHandler = async (itemId, newName) => {
        try {
            if (!tracker.dataItemManager) return;

            const item = await tracker.dataItemManager.getItem(itemId);
            if (!item) {
                console.error('Item not found:', itemId);
                return;
            }

            let finalName = newName;

            if (item.item_category === 'ACTION') {
                const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
                const content = await fsp.readFile(parentPath, 'utf8');
                const allParents = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                let siblingActionIds = [];

                for (const entry of allParents) {
                    if (entry.child_actions && entry.child_actions.includes(itemId)) {
                        siblingActionIds = entry.child_actions.filter(id => id !== itemId);
                        break;
                    }

                    if (entry.child_pages) {
                        for (const page of entry.child_pages) {
                            if (page.child_actions && page.child_actions.includes(itemId)) {
                                siblingActionIds = page.child_actions.filter(id => id !== itemId);
                                break;
                            }
                        }
                        if (siblingActionIds.length > 0) break;
                    }
                }

                if (siblingActionIds.length > 0) {
                    const existingNames = new Set();

                    for (const actionId of siblingActionIds) {
                        const actionItem = await tracker.dataItemManager.getItem(actionId);
                        if (actionItem) {
                            existingNames.add(actionItem.name);
                        }
                    }

                    if (existingNames.has(finalName)) {
                        let suffix = 1;
                        while (existingNames.has(`${finalName} (${suffix})`)) {
                            suffix++;
                        }
                        finalName = `${finalName} (${suffix})`;
                        console.log(`⚠️ Duplicate action name detected, renamed to: "${finalName}"`);
                    }
                }
            } else if (item.item_category === 'PAGE') {
                const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
                const content = await fsp.readFile(parentPath, 'utf8');
                const allParents = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const parentPanelEntry = allParents.find(p =>
                    p.child_pages && p.child_pages.some(pg => pg.page_id === itemId)
                );

                if (parentPanelEntry && parentPanelEntry.child_pages) {
                    const siblingPages = parentPanelEntry.child_pages.filter(pg => pg.page_id !== itemId);
                    const existingNames = new Set();

                    for (const page of siblingPages) {
                        const pageItem = await tracker.dataItemManager.getItem(page.page_id);
                        if (pageItem) {
                            existingNames.add(pageItem.name);
                        }
                    }

                    if (existingNames.has(finalName)) {
                        let suffix = 1;
                        while (existingNames.has(`${finalName} (${suffix})`)) {
                            suffix++;
                        }
                        finalName = `${finalName} (${suffix})`;
                        console.log(`⚠️ Duplicate name detected, renamed to: "${finalName}"`);
                    }
                }
            }

            await tracker.dataItemManager.updateItem(itemId, { name: finalName });

            await tracker._broadcast({ type: 'tree_update', data: await tracker.panelLogManager.buildTreeStructure() });

            if (item.item_category === 'ACTION') {
                await rebroadcastPageIfActionUpdated(itemId);
            }

            if (tracker.selectedPanelId === itemId) {
                lastLoadedPanelId = null;
                await selectPanelHandler(itemId);
            }

            console.log(`✏️ Renamed "${item.name}" → "${finalName}"`);
        } catch (err) {
            console.error('Failed to rename:', err);
        }
    };

    const renameActionByAIHandler = async (actionItemId, currentPos = null) => {
        try {
            if (!tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('Managers not initialized');
                return;
            }

            const actionItem = await tracker.dataItemManager.getItem(actionItemId);
            if (!actionItem || actionItem.item_category !== 'ACTION') {
                console.error('Action not found or invalid category:', actionItemId);
                return;
            }

            const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
            const content = await fsp.readFile(parentPath, 'utf8');
            const allParents = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            let parentPanelId = null;
            let parentPageId = null;

            for (const entry of allParents) {
                if (entry.child_actions && entry.child_actions.includes(actionItemId)) {
                    parentPanelId = entry.parent_panel;
                    break;
                }

                if (entry.child_pages) {
                    for (const page of entry.child_pages) {
                        if (page.child_actions && page.child_actions.includes(actionItemId)) {
                            parentPanelId = entry.parent_panel;
                            parentPageId = page.page_id;
                            break;
                        }
                    }
                    if (parentPageId) break;
                }
            }

            if (!parentPanelId) {
                console.error('Parent panel not found for action:', actionItemId);
                await tracker._broadcast({ type: 'show_toast', message: '❌ Không tìm thấy panel cha!' });
                return;
            }

            let sourceImage = null;
            let sourceItemName = '';

            if (parentPageId) {
                const pageItem = await tracker.dataItemManager.getItem(parentPageId);
                if (!pageItem || !pageItem.image_base64) {
                    console.error('Parent page has no image');
                    await tracker._broadcast({ type: 'show_toast', message: '❌ Page không có ảnh!' });
                    return;
                }
                sourceImage = await tracker.dataItemManager.loadBase64FromFile(pageItem.image_base64);
                sourceItemName = pageItem.name;
            } else {
                const parentPanel = await tracker.dataItemManager.getItem(parentPanelId);
                if (!parentPanel || !parentPanel.image_base64) {
                    console.error('Parent panel has no image');
                    await tracker._broadcast({ type: 'show_toast', message: '❌ Panel cha không có ảnh!' });
                    return;
                }
                sourceImage = await tracker.dataItemManager.loadBase64FromFile(parentPanel.image_base64);
                sourceItemName = parentPanel.name;
            }

            console.log(`🤖 Starting AI rename for action: "${actionItem.name}" in ${parentPageId ? 'PAGE' : 'PANEL'}: "${sourceItemName}"`);

            const { cropBase64Image } = await import('../media/screenshot.js');
            const { askGeminiForActionRename } = await import('./gemini-handler.js');

            const cropPos = currentPos || {
                x: actionItem.metadata.global_pos.x,
                y: actionItem.metadata.global_pos.y,
                w: actionItem.metadata.global_pos.w,
                h: actionItem.metadata.global_pos.h
            };

            const croppedImage = await cropBase64Image(sourceImage, cropPos);

            const actionMetadata = {
                action_name: actionItem.name,
                action_type: actionItem.type,
                action_verb: actionItem.verb,
                action_content: actionItem.content
            };

            const aiResult = await askGeminiForActionRename(croppedImage, actionMetadata);

            if (!aiResult) {
                console.error('Gemini API returned null');
                await tracker._broadcast({ type: 'show_toast', message: '❌ AI không trả về kết quả!' });
                return;
            }

            await tracker.dataItemManager.updateItem(actionItemId, {
                name: aiResult.action_name,
                type: aiResult.action_type,
                verb: aiResult.action_verb,
                content: aiResult.action_content || null
            });

            console.log(`✅ AI Renamed: "${actionItem.name}" → "${aiResult.action_name}"`);
            console.log(`   Type: ${actionItem.type} → ${aiResult.action_type}`);
            console.log(`   Verb: ${actionItem.verb} → ${aiResult.action_verb}`);
            console.log(`   Content: ${actionItem.content} → ${aiResult.action_content}`);

            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });

            if (parentPageId) {
                await rebroadcastPageIfActionUpdated(actionItemId);
            } else if (tracker.selectedPanelId === parentPanelId) {
                lastLoadedPanelId = null;
                await selectPanelHandler(parentPanelId);
            }

            if (tracker.selectedPanelId === actionItemId) {
                lastLoadedPanelId = null;
                await selectPanelHandler(actionItemId);
            }

            await tracker._broadcast({ type: 'show_toast', message: `✅ Đã rename: "${aiResult.action_name}"` });

        } catch (err) {
            console.error('Failed to rename action by AI:', err);
            await tracker._broadcast({ type: 'show_toast', message: '❌ Lỗi khi rename by AI!' });
        }
    };

    const getClickEventsForPanelHandler = async (actionItemId) => {
        try {
            if (!actionItemId || !tracker.clickManager) return [];

            const clicks = await tracker.clickManager.getClicksForAction(actionItemId);
            return clicks.map(c => ({
                timestamp: c.timestamp,
                click_x: c.pos.x,
                click_y: c.pos.y,
                element_name: c.element_name,
                element_tag: c.element_tag,
                url: c.from_url
            }));
        } catch (err) {
            console.error('Failed to get click events:', err);
            return [];
        }
    };

    const getPanelEditorClassHandler = () => {
        return getPanelEditorClassCode();
    };

    const getParentPanelOfActionHandler = async (actionItemId) => {
        try {
            if (!tracker.parentPanelManager) return null;

            const { promises: fsp } = await import('fs');
            const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
            const content = await fsp.readFile(parentPath, 'utf8');
            const allParents = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            for (const entry of allParents) {
                if (entry.child_actions && entry.child_actions.includes(actionItemId)) {
                    return entry.parent_panel;
                }

                if (entry.child_pages) {
                    for (const page of entry.child_pages) {
                        if (page.child_actions && page.child_actions.includes(actionItemId)) {
                            return entry.parent_panel;
                        }
                    }
                }
            }

            return null;
        } catch (err) {
            console.error('Failed to get parent panel:', err);
            return null;
        }
    };

    const useBeforePanelHandler = async (actionItemId) => {
        try {
            if (!tracker.stepManager || !tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('Managers not initialized');
                return;
            }

            const recordingInfo = await tracker.stopPanelRecording();

            if (recordingInfo && recordingInfo.panelId) {
                const { uploadVideoAndGetUrl } = await import('../media/uploader.js');
                const { ENV } = await import('../config/env.js');
                const videoUrl = await uploadVideoAndGetUrl(
                    recordingInfo.videoPath,
                    recordingInfo.panelId,
                    ENV.API_TOKEN
                );

                if (videoUrl) {
                    console.log(`📹 Video URL: ${videoUrl}`);
                    const actionItem = await tracker.dataItemManager.getItem(actionItemId);
                    if (actionItem) {
                        await tracker.dataItemManager.updateItem(actionItemId, {
                            metadata: {
                                ...actionItem.metadata,
                                session_url: videoUrl,
                                session_start: recordingInfo.sessionStart,
                                session_end: recordingInfo.sessionEnd
                            }
                        });
                        await tracker._broadcast({ type: 'show_toast', message: '✅ Video saved' });
                    }
                } else {
                    console.error('❌ Video upload failed for USE_BEFORE action');
                }
            }

            const parentPanelId = await getParentPanelOfActionHandler(actionItemId);

            if (!parentPanelId) {
                console.error('Cannot find parent panel for action');
                return;
            }

            await tracker.stepManager.createStep(parentPanelId, actionItemId, parentPanelId);

            await tracker.dataItemManager.updateItem(actionItemId, { status: 'completed' });

            // Verify the update was successful before building tree
            const updatedAction = await tracker.dataItemManager.getItem(actionItemId);
            if (updatedAction && updatedAction.status === 'completed') {
                await tracker._broadcast({
                    type: 'tree_update',
                    data: await tracker.panelLogManager.buildTreeStructure()
                });

                await checkAndUpdatePanelStatusHandler(parentPanelId);

                await selectPanelHandler(actionItemId);
            } else {
                console.error('❌ Failed to verify action status update');
                await tracker._broadcast({ type: 'show_toast', message: '❌ Failed to mark as done' });
            }

            console.log(`✅ Use CURRENT PANEL: ${actionItemId} marked done with panel ${parentPanelId}`);
        } catch (err) {
            console.error('Use CURRENT PANEL failed:', err);
        }
    };

    const triggerDrawPanelNewHandler = async () => {
        await tracker._broadcast({ type: 'trigger_draw_panel', mode: 'DRAW_NEW' });
    };

    const triggerUseBeforePanelHandler = async () => {
        await tracker._broadcast({ type: 'trigger_use_before' });
    };

    const broadcastToastHandler = async (message) => {
        await tracker._broadcast({ type: 'show_toast', message: message });
    };

    const bringQueueBrowserToFrontHandler = async () => {
        try {
            if (tracker.queuePage) {
                await tracker.queuePage.bringToFront();
            }
        } catch (err) {
            console.error('Failed to bring queue browser to front:', err);
        }
    };

    const hideTrackingBrowserHandler = async () => {
        try {
            if (tracker.page) {
                const session = await tracker.page.target().createCDPSession();
                await session.send('Browser.setWindowBounds', {
                    windowId: (await session.send('Browser.getWindowForTarget')).windowId,
                    bounds: { windowState: 'minimized' }
                });
            }
        } catch (err) {
            console.error('Failed to hide tracking browser:', err);
        }
    };

    const showTrackingBrowserHandler = async () => {
        try {
            if (tracker.page) {
                const session = await tracker.page.target().createCDPSession();
                const bounds = {
                    left: 0,
                    top: 0,
                    width: trackingWidth,
                    height: height
                };
                await session.send('Browser.setWindowBounds', {
                    windowId: (await session.send('Browser.getWindowForTarget')).windowId,
                    bounds: bounds
                });
            }
        } catch (err) {
            console.error('Failed to show tracking browser:', err);
        }
    };

    const resetDrawingFlagHandler = async () => {
        /*await tracker.queuePage.evaluate(() => {
            if (typeof isDrawingPanel !== 'undefined') {
                isDrawingPanel = false;
            }
        });*/
    };

    const checkActionHasStepHandler = async (actionItemId) => {
        try {
            if (!tracker.stepManager) return false;

            const { promises: fsp } = await import('fs');
            const stepPath = path.join(tracker.sessionFolder, 'doing_step.jsonl');

            if (!await fsp.access(stepPath).then(() => true).catch(() => false)) {
                return false;
            }

            const content = await fsp.readFile(stepPath, 'utf8');
            const steps = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            return steps.some(step => step.action?.item_id === actionItemId);
        } catch (err) {
            console.error('Failed to check action step:', err);
            return false;
        }
    };

    const checkAndUpdatePanelStatusHandler = async (panelId) => {
        try {
            if (!tracker.parentPanelManager || !tracker.dataItemManager) return;

            const parentEntry = await tracker.parentPanelManager.getPanelEntry(panelId);
            if (!parentEntry || !parentEntry.child_actions || parentEntry.child_actions.length === 0) {
                return;
            }

            let allCompleted = true;
            for (const actionId of parentEntry.child_actions) {
                const action = await tracker.dataItemManager.getItem(actionId);
                if (!action || action.status !== 'completed') {
                    allCompleted = false;
                    break;
                }
            }

            const currentPanel = await tracker.dataItemManager.getItem(panelId);
            if (!currentPanel) return;

            const newStatus = allCompleted ? 'completed' : 'pending';

            if (currentPanel.status !== newStatus) {
                await tracker.dataItemManager.updateItem(panelId, { status: newStatus });
                console.log(`✅ Panel ${panelId} status → ${newStatus}`);

                await tracker._broadcast({
                    type: 'tree_update',
                    data: await tracker.panelLogManager.buildTreeStructure()
                });
            }
        } catch (err) {
            console.error('Failed to check panel status:', err);
        }
    };

    const updatePanelImageAndCoordinatesHandler = async (panelId, imageBase64, cropArea, updatedGeminiResult, deletedActionsInfo) => {
        try {
            if (!tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('Managers not initialized');
                return;
            }

            const panelItem = await tracker.dataItemManager.getItem(panelId);
            if (!panelItem || (panelItem.item_category !== 'PANEL' && panelItem.item_category !== 'PAGE')) {
                console.error('Item not found or not PANEL/PAGE');
                return;
            }

            console.log('📐 Updating "' + panelItem.name + '" with crop:', cropArea);

            if (deletedActionsInfo && deletedActionsInfo.length > 0) {
                console.log('🗑️ Deleting ' + deletedActionsInfo.length + ' actions outside crop area');
                for (const actionInfo of deletedActionsInfo) {
                    if (actionInfo.action_id) {
                        await removeActionFromItem(panelId, panelItem.item_category, actionInfo.action_id);
                    }
                }
            }

            if (updatedGeminiResult && updatedGeminiResult[0] && updatedGeminiResult[0].actions) {
                const actions = updatedGeminiResult[0].actions;
                const existingActionIds = await getActionIdsForItem(panelId, panelItem.item_category);

                for (let i = 0; i < actions.length; i++) {
                    const action = actions[i];
                    const actionId = existingActionIds[i];

                    if (actionId) {
                        await tracker.dataItemManager.updateItem(actionId, {
                            name: action.action_name,
                            metadata: {
                                x: action.action_pos.x,
                                y: action.action_pos.y,
                                w: action.action_pos.w,
                                h: action.action_pos.h
                            }
                        });
                    }
                }
            }

            // Tạo quan hệ parent-child từ step
            // await createPanelRelationFromStep(panelId);

            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });

            let displayImage;
            if (imageBase64) {
                displayImage = imageBase64;
                await tracker.dataItemManager.updateItem(panelId, {
                    image_base64: imageBase64
                });
            } else {
                const updatedPanelItem = await tracker.dataItemManager.getItem(panelId);
                displayImage = await tracker.dataItemManager.loadBase64FromFile(updatedPanelItem.image_base64);
            }

            if (cropArea) {
                const { cropBase64Image } = await import('../media/screenshot.js');
                displayImage = await cropBase64Image(displayImage, cropArea);
            }

            const { drawPanelBoundingBoxes } = await import('../media/screenshot.js');
            const updatedActions = updatedGeminiResult && updatedGeminiResult[0] ? updatedGeminiResult[0].actions : [];
            const screenshotWithBoxes = await drawPanelBoundingBoxes(displayImage, updatedGeminiResult || [{ actions: updatedActions }], '#00aaff', 2);

            await tracker._broadcast({
                type: 'panel_selected',
                panel_id: panelId,
                screenshot: screenshotWithBoxes,
                actions: updatedActions,
                action_list: updatedActions.map(a => a.action_name).filter(Boolean).join(', '),
                gemini_result: updatedGeminiResult || [{ actions: updatedActions }],
                timestamp: Date.now()
            });

            console.log('✅ Panel "' + panelItem.name + '" updated with crop position');
        } catch (err) {
            console.error('Failed to update panel image and coordinates:', err);
            throw err;
        }
    };

    const importCookiesFromJsonHandler = async (jsonString) => {
        try {
            const data = JSON.parse(jsonString);
            if (!data.cookies || !Array.isArray(data.cookies)) {
                return { success: false, message: 'Invalid JSON format' };
            }

            const puppeteerCookies = data.cookies.map(c => {
                const cookie = {
                    name: c.name,
                    value: c.value,
                    domain: c.domain,
                    path: c.path || '/',
                    httpOnly: c.httpOnly || false,
                    secure: c.secure || false
                };

                if (c.expirationDate) {
                    cookie.expires = c.expirationDate;
                }

                if (c.sameSite) {
                    const sameSiteMap = {
                        'no_restriction': 'None',
                        'unspecified': 'Lax',
                        'lax': 'Lax',
                        'strict': 'Strict'
                    };
                    cookie.sameSite = sameSiteMap[c.sameSite.toLowerCase()] || 'Lax';
                }

                return cookie;
            });

            await tracker.page.setCookie(...puppeteerCookies);

            return { success: true, message: `Imported ${puppeteerCookies.length} cookies` };
        } catch (err) {
            console.error('Import cookies failed:', err);
            return { success: false, message: err.message };
        }
    };

    const createManualPageHandler = async (panelId) => {
        try {
            if (!tracker.dataItemManager || !tracker.parentPanelManager) return;

            const panel = await tracker.dataItemManager.getItem(panelId);
            if (!panel || panel.item_category !== 'PANEL') {
                console.error('Invalid panel');
                return;
            }

            const parentEntry = await tracker.parentPanelManager.getPanelEntry(panelId);
            if (!parentEntry) {
                console.error('Panel entry not found');
                return;
            }

            const existingPages = parentEntry.child_pages || [];
            const nextPageNumber = existingPages.length + 1;

            const pageId = await tracker.dataItemManager.createPage(
                nextPageNumber,
                null,
                { x: 0, y: 0, w: 0, h: 0 }
            );

            await tracker.parentPanelManager.addChildPage(panelId, nextPageNumber, pageId);

            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });

            await tracker._broadcast({
                type: 'show_toast',
                message: `✅ Created Page ${nextPageNumber}`
            });

            console.log(`✅ Manual page created: Page ${nextPageNumber} (${pageId})`);
        } catch (err) {
            console.error('Failed to create manual page:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: '❌ Failed to create page'
            });
        }
    };

    const updateItemDetailsHandler = async (itemId, updates) => {
        try {
            if (!tracker.dataItemManager) {
                console.error('DataItemManager not initialized');
                return;
            }

            const item = await tracker.dataItemManager.getItem(itemId);
            if (!item) {
                console.error('Item not found:', itemId);
                await tracker._broadcast({ type: 'show_toast', message: '❌ Item không tồn tại!' });
                return;
            }

            const updateData = {};
            if (updates.name !== undefined) updateData.name = updates.name;
            if (updates.type !== undefined) updateData.type = updates.type;
            if (updates.verb !== undefined) updateData.verb = updates.verb;
            if (updates.content !== undefined) updateData.content = updates.content;

            await tracker.dataItemManager.updateItem(itemId, updateData);

            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });

            if (item.item_category === 'ACTION') {
                await rebroadcastPageIfActionUpdated(itemId);
            }

            if (tracker.selectedPanelId === itemId) {
                lastLoadedPanelId = null;
                await selectPanelHandler(itemId);
            }

            await tracker._broadcast({ type: 'show_toast', message: '✅ Đã cập nhật item details!' });

            console.log(`✅ Updated item details for: ${itemId}`);
        } catch (err) {
            console.error('Failed to update item details:', err);
            await tracker._broadcast({ type: 'show_toast', message: '❌ Lỗi khi cập nhật!' });
        }
    };

    return {
        quitApp: quitAppHandler,
        saveEvents: saveEventsHandler,
        resizeQueueBrowser: resizeQueueBrowserHandler,
        openPanelEditor: openPanelEditorHandler,
        savePanelEdits: savePanelEditsHandler,
        drawPanel: drawPanelHandler,
        saveCroppedPanel: saveCroppedPanelHandler,
        resetPanel: resetPanelHandler,
        markAsDone: markAsDoneHandler,
        deleteEvent: deleteEventHandler,
        manualCaptureAI: manualCaptureAIHandler,
        captureActions: captureActionsHandler,
        manualCaptureAIScrolling: manualCaptureAIScrollingHandler,
        captureActionsScrolling: captureActionsScrollingHandler,
        drawPanelAndDetectActions: drawPanelAndDetectActionsHandler,
        confirmPanelCrop: confirmPanelCropHandler,
        detectPages: detectPagesHandler,
        selectPanel: selectPanelHandler,
        getPanelTree: getPanelTreeHandler,
        deleteClickEvent: deleteClickEventHandler,
        clearAllClicksForAction: clearAllClicksForActionHandler,
        resetActionStep: resetActionStepHandler,
        renamePanel: renamePanelHandler,
        renameActionByAI: renameActionByAIHandler,
        getClickEventsForPanel: getClickEventsForPanelHandler,
        getPanelEditorClass: getPanelEditorClassHandler,
        getParentPanelOfAction: getParentPanelOfActionHandler,
        useBeforePanel: useBeforePanelHandler,
        triggerDrawPanelNew: triggerDrawPanelNewHandler,
        triggerUseBeforePanel: triggerUseBeforePanelHandler,
        broadcastToast: broadcastToastHandler,
        bringQueueBrowserToFront: bringQueueBrowserToFrontHandler,
        hideTrackingBrowser: hideTrackingBrowserHandler,
        showTrackingBrowser: showTrackingBrowserHandler,
        resetDrawingFlag: resetDrawingFlagHandler,
        checkActionHasStep: checkActionHasStepHandler,
        importCookiesFromJson: importCookiesFromJsonHandler,
        updatePanelImageAndCoordinates: updatePanelImageAndCoordinatesHandler,
        createManualPage: createManualPageHandler,
        updateItemDetails: updateItemDetailsHandler
    };
}