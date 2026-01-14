import { getPanelEditorClassCode } from './panel-editor-class.js';
import { promises as fsp } from 'fs';
import path from 'path';
import { CheckpointManager } from '../data/CheckpointManager.js';
import { calculateHash } from '../utils/utils.js';
import { ENV } from '../config/env.js';
import { cropBase64Image } from '../media/screenshot.js';

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

    /**
     * Get panelBeforeBase64 from step by finding step with panel_after.item_id === panelAfterId
     * Always tries to get from step, preferring fullscreen_base64 over image_base64
     * @param {string} panelAfterId - The panel_after.item_id to search for
     * @returns {Promise<string|null>} - Base64 string or null if not found
     */
    const getPanelBeforeBase64FromStep = async (panelAfterId) => {
        if (!panelAfterId || !tracker.stepManager || !tracker.dataItemManager) {
            console.warn(`⚠️ Cannot get panelBeforeBase64: panelAfterId=${panelAfterId}, stepManager=${!!tracker.stepManager}, dataItemManager=${!!tracker.dataItemManager}`);
            return null;
        }

        try {
            const allSteps = await tracker.stepManager.getAllSteps();
            console.log(`🔍 Looking for step with panel_after.item_id === ${panelAfterId}`);
            console.log(`📋 Total steps: ${allSteps.length}`);
            
            const step = allSteps.find(s => s.panel_after?.item_id === panelAfterId);
            if (!step) {
                console.warn(`⚠️ No step found with panel_after.item_id === ${panelAfterId}`);
                console.log(`📋 Available steps:`, allSteps.map(s => ({
                    step_id: s.step_id,
                    panel_after: s.panel_after?.item_id
                })));
                return null;
            }

            console.log(`✅ Found step:`, {
                step_id: step.step_id,
                panel_before: step.panel_before?.item_id,
                panel_after: step.panel_after?.item_id
            });

            if (!step.panel_before?.item_id) {
                console.warn(`⚠️ Step found but no panel_before.item_id`);
                return null;
            }

            const panelBeforeItem = await tracker.dataItemManager.getItem(step.panel_before.item_id);
            if (!panelBeforeItem) {
                console.warn(`⚠️ panelBeforeItem not found for id: ${step.panel_before.item_id}`);
                return null;
            }

            // Try fullscreen_base64 first, then fall back to image_base64
            if (panelBeforeItem.fullscreen_base64) {
                const panelBeforeBase64 = await tracker.dataItemManager.loadBase64FromFile(panelBeforeItem.fullscreen_base64);
                console.log(`✅ Found panelBefore image from fullscreen_base64 for comparison (${panelBeforeBase64 ? panelBeforeBase64.length : 0} chars)`);
                return panelBeforeBase64;
            } else if (panelBeforeItem.image_base64) {
                const panelBeforeBase64 = await tracker.dataItemManager.loadBase64FromFile(panelBeforeItem.image_base64);
                console.log(`✅ Found panelBefore image from image_base64 for comparison (${panelBeforeBase64 ? panelBeforeBase64.length : 0} chars)`);
                return panelBeforeBase64;
            } else {
                console.warn(`⚠️ panelBeforeItem found but no fullscreen_base64 or image_base64:`, {
                    hasItem: !!panelBeforeItem,
                    hasFullscreenBase64: !!panelBeforeItem?.fullscreen_base64,
                    hasImageBase64: !!panelBeforeItem?.image_base64
                });
                return null;
            }
        } catch (err) {
            console.warn('⚠️ Failed to load panelBefore image from step:', err);
            return null;
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
                    
                    // Cập nhật UI Panel Log sau khi makeChild hoàn thành
                    if (tracker.panelLogManager) {
                        await tracker._broadcast({
                            type: 'tree_update',
                            data: await tracker.panelLogManager.buildTreeStructure()
                        });
                    }
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

    /**
     * Helper functions for draw flow state management
     */
    const getPanelDrawFlowState = async (panelId) => {
        try {
            if (!tracker.dataItemManager) return null;
            const panelItem = await tracker.dataItemManager.getItem(panelId);
            if (!panelItem || panelItem.item_category !== 'PANEL') return null;
            return panelItem.metadata?.draw_flow_state || null;
        } catch (err) {
            console.error('Failed to get panel draw flow state:', err);
            return null;
        }
    };

    const setPanelDrawFlowState = async (panelId, state) => {
        try {
            if (!tracker.dataItemManager) return false;
            const panelItem = await tracker.dataItemManager.getItem(panelId);
            if (!panelItem || panelItem.item_category !== 'PANEL') return false;
            
            const currentMetadata = panelItem.metadata || {};
            await tracker.dataItemManager.updateItem(panelId, {
                metadata: {
                    ...currentMetadata,
                    draw_flow_state: state
                }
            });
            
            console.log(`✅ Panel ${panelId} draw_flow_state → ${state}`);
            return true;
        } catch (err) {
            console.error('Failed to set panel draw flow state:', err);
            return false;
        }
    };

    const getIncompleteDrawFlowPanels = async () => {
        try {
            if (!tracker.dataItemManager) return [];
            const allItems = await tracker.dataItemManager.getAllItems();
            const panels = allItems.filter(item => item.item_category === 'PANEL');
            
            const incompletePanels = [];
            for (const panel of panels) {
                const flowState = panel.metadata?.draw_flow_state;
                if (flowState !== null && flowState !== undefined && flowState !== 'completed') {
                    incompletePanels.push({
                        item_id: panel.item_id,
                        name: panel.name,
                        draw_flow_state: flowState
                    });
                }
            }
            
            return incompletePanels;
        } catch (err) {
            console.error('Failed to get incomplete draw flow panels:', err);
            return [];
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

    // Change tracking functions
    const getLastSavedState = async () => {
        if (!tracker.sessionFolder) {
            console.log('🔔 [Save Reminder] sessionFolder not set yet, skipping getLastSavedState');
            return null;
        }
        const statePath = path.join(tracker.sessionFolder, '.last_saved_state.json');
        try {
            const content = await fsp.readFile(statePath, 'utf8');
            return JSON.parse(content);
        } catch (err) {
            return null;
        }
    };

    const saveLastSavedState = async (hashes, lastChangeTimestamp = null) => {
        if (!tracker.sessionFolder) {
            console.log('🔔 [Save Reminder] sessionFolder not set yet, skipping saveLastSavedState');
            return;
        }
        const statePath = path.join(tracker.sessionFolder, '.last_saved_state.json');
        const state = { ...hashes };
        if (lastChangeTimestamp !== null) {
            state.lastChangeTimestamp = lastChangeTimestamp;
            console.log(`🔔 [Save Reminder] 💾 Saved state with timestamp: ${new Date(lastChangeTimestamp).toISOString()}`);
        } else {
            // Remove lastChangeTimestamp if explicitly set to null
            state.lastChangeTimestamp = null;
            console.log('🔔 [Save Reminder] 💾 Saved state - timestamp cleared (after save)');
        }
        await fsp.writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');
    };

    const calculateFileHashes = async () => {
        if (!tracker.sessionFolder) {
            console.log('🔔 [Save Reminder] sessionFolder not set yet, returning empty hashes');
            return { doing_item: '', doing_step: '', myparent_panel: '' };
        }
        const doingItemPath = path.join(tracker.sessionFolder, 'doing_item.jsonl');
        const doingStepPath = path.join(tracker.sessionFolder, 'doing_step.jsonl');
        const myparentPanelPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');

        const hashes = {};

        try {
            const doingItemContent = await fsp.readFile(doingItemPath, 'utf8');
            hashes.doing_item = await calculateHash(doingItemContent);
        } catch (err) {
            hashes.doing_item = '';
        }

        try {
            const doingStepContent = await fsp.readFile(doingStepPath, 'utf8');
            hashes.doing_step = await calculateHash(doingStepContent);
        } catch (err) {
            hashes.doing_step = '';
        }

        try {
            const myparentPanelContent = await fsp.readFile(myparentPanelPath, 'utf8');
            hashes.myparent_panel = await calculateHash(myparentPanelContent);
        } catch (err) {
            hashes.myparent_panel = '';
        }

        return hashes;
    };

    const hasChanges = async () => {
        const currentHashes = await calculateFileHashes();
        const lastSavedState = await getLastSavedState();

        if (!lastSavedState) {
            // First time, no saved state, consider as having changes
            // Set initial change timestamp
            const timestamp = Date.now();
            console.log(`🔔 [Save Reminder] First time - no saved state, setting initial timestamp: ${new Date(timestamp).toISOString()}`);
            await saveLastSavedState(currentHashes, timestamp);
            return true;
        }

        const hasChanges = (
            currentHashes.doing_item !== lastSavedState.doing_item ||
            currentHashes.doing_step !== lastSavedState.doing_step ||
            currentHashes.myparent_panel !== lastSavedState.myparent_panel
        );

        // If changes detected and no timestamp exists, set it (but keep old hashes for comparison)
        if (hasChanges && !lastSavedState.lastChangeTimestamp) {
            const timestamp = Date.now();
            console.log(`🔔 [Save Reminder] Changes detected - setting timestamp: ${new Date(timestamp).toISOString()}`);
            // Only update timestamp, keep old hashes for comparison
            const oldHashes = {
                doing_item: lastSavedState.doing_item,
                doing_step: lastSavedState.doing_step,
                myparent_panel: lastSavedState.myparent_panel
            };
            await saveLastSavedState(oldHashes, timestamp);
        } else if (hasChanges && lastSavedState.lastChangeTimestamp) {
            const timeSinceChange = Date.now() - lastSavedState.lastChangeTimestamp;
            console.log(`🔔 [Save Reminder] Changes detected - timestamp already exists (${Math.floor(timeSinceChange / 1000)}s ago)`);
        }

        return hasChanges;
    };

    // Debounced change checker to avoid checking too frequently
    let changeCheckTimeout = null;
    const scheduleChangeCheck = () => {
        // Clear existing timeout
        if (changeCheckTimeout) {
            clearTimeout(changeCheckTimeout);
        }
        // Schedule check after 300ms (debounce)
        changeCheckTimeout = setTimeout(async () => {
            try {
                const changed = await hasChanges();
                await tracker._broadcast({
                    type: 'save_btn_state',
                    hasChanges: changed
                });
            } catch (err) {
                console.error('Error checking for changes:', err);
            }
        }, 300);
    };

    const checkAndBroadcastChanges = async () => {
        const changed = await hasChanges();
        console.log('checkAndBroadcastChanges: hasChanges =', changed);
        await tracker._broadcast({
            type: 'save_btn_state',
            hasChanges: changed
        });
        return changed;
    };

    // Functions to check if reminder dialog should be shown
    const isMainScreenActive = async () => {
        // This will be called from browser context to check if modals are open
        try {
            const result = await tracker.queuePage.evaluate(() => {
                const checkpointModal = document.getElementById('checkpointModal');
                const imageModal = document.getElementById('imageModal');
                const editorContainer = document.getElementById('editor-container');
                const saveReminderModal = document.getElementById('saveReminderModal');
                
                const modalStates = {
                    checkpointModal: checkpointModal ? checkpointModal.style.display !== 'none' : false,
                    imageModal: imageModal ? imageModal.classList.contains('show') : false,
                    editorContainer: !!editorContainer,
                    saveReminderModal: saveReminderModal ? saveReminderModal.style.display !== 'none' : false
                };
                
                // Return true only if no modals are open
                const isActive = (
                    (!checkpointModal || checkpointModal.style.display === 'none') &&
                    (!imageModal || !imageModal.classList.contains('show')) &&
                    !editorContainer &&
                    (!saveReminderModal || saveReminderModal.style.display === 'none')
                );
                
                return { isActive, modalStates };
            });
            
            console.log(`🔔 [Save Reminder] Modal states:`, result.modalStates);
            return result.isActive;
        } catch (err) {
            console.error('🔔 [Save Reminder] Error checking main screen:', err);
            return false;
        }
    };

    const isAnyOperationRunning = async () => {
        // This will be called from browser context to check operation flags
        try {
            const result = await tracker.queuePage.evaluate(() => {
                const flags = {
                    isSaving: typeof isSaving !== 'undefined' && isSaving === true,
                    isCapturing: typeof isCapturing !== 'undefined' && isCapturing === true,
                    isGeminiDetecting: typeof isGeminiDetecting !== 'undefined' && isGeminiDetecting === true,
                    isDrawingPanel: typeof isDrawingPanel !== 'undefined' && isDrawingPanel === true,
                    isQuitting: typeof isQuitting !== 'undefined' && isQuitting === true
                };
                
                const anyRunning = (
                    flags.isSaving ||
                    flags.isCapturing ||
                    flags.isGeminiDetecting ||
                    flags.isDrawingPanel ||
                    flags.isQuitting
                );
                
                return { anyRunning, flags };
            });
            
            console.log(`🔔 [Save Reminder] Operation flags:`, result.flags);
            return result.anyRunning;
        } catch (err) {
            console.error('🔔 [Save Reminder] Error checking operations:', err);
            return false;
        }
    };

    // Save reminder functionality
    let reminderTimerInterval = null;
    let isReminderDialogShowing = false;

    const checkAndShowReminder = async () => {
        try {
            console.log('🔔 [Save Reminder] Timer check triggered');
            
            // Check if main screen is active
            const mainScreenActive = await isMainScreenActive();
            console.log(`🔔 [Save Reminder] Main screen active: ${mainScreenActive}`);
            if (!mainScreenActive) {
                console.log('🔔 [Save Reminder] Skipped: Not on main screen (modal/dialog open)');
                return;
            }

            // Check if any operation is running
            const operationRunning = await isAnyOperationRunning();
            console.log(`🔔 [Save Reminder] Operation running: ${operationRunning}`);
            if (operationRunning) {
                console.log('🔔 [Save Reminder] Skipped: Operation in progress');
                return;
            }

            // Check if there are changes
            const changed = await hasChanges();
            console.log(`🔔 [Save Reminder] Has changes: ${changed}`);
            if (!changed) {
                console.log('🔔 [Save Reminder] Skipped: No changes detected');
                return;
            }

            // Get last change timestamp
            const lastSavedState = await getLastSavedState();
            if (!lastSavedState || !lastSavedState.lastChangeTimestamp) {
                console.log('🔔 [Save Reminder] Skipped: No lastChangeTimestamp found');
                return;
            }

            // Calculate time elapsed
            const timeElapsed = Date.now() - lastSavedState.lastChangeTimestamp;
            const reminderInterval = ENV.SAVE_REMINDER_INTERVAL_MS;
            const minutesElapsed = Math.floor(timeElapsed / 60000);
            const secondsElapsed = Math.floor((timeElapsed % 60000) / 1000);
            
            console.log(`🔔 [Save Reminder] Time elapsed: ${minutesElapsed}m ${secondsElapsed}s`);
            console.log(`🔔 [Save Reminder] Reminder interval: ${reminderInterval}ms (${reminderInterval / 60000} minutes)`);
            console.log(`🔔 [Save Reminder] Dialog showing: ${isReminderDialogShowing}`);

            if (timeElapsed >= reminderInterval && !isReminderDialogShowing) {
                console.log(`🔔 [Save Reminder] ⚠️ Showing reminder dialog (${minutesElapsed} minutes elapsed)`);
                await showSaveReminderDialog(minutesElapsed);
            } else if (timeElapsed < reminderInterval) {
                console.log(`🔔 [Save Reminder] Not yet time (${(reminderInterval - timeElapsed) / 1000}s remaining)`);
            } else if (isReminderDialogShowing) {
                console.log('🔔 [Save Reminder] Skipped: Dialog already showing');
            }
        } catch (err) {
            console.error('❌ [Save Reminder] Error checking reminder:', err);
        }
    };

    const showSaveReminderDialog = async (minutesElapsed) => {
        if (isReminderDialogShowing) {
            console.log('🔔 [Save Reminder] Dialog already showing, skipping');
            return;
        }

        console.log(`🔔 [Save Reminder] ✅ Showing dialog for ${minutesElapsed} minutes of unsaved changes`);
        isReminderDialogShowing = true;
        await tracker._broadcast({
            type: 'show_save_reminder',
            minutesElapsed: minutesElapsed
        });
    };

    const handleSaveReminderResponse = async (response) => {
        console.log(`🔔 [Save Reminder] User response: ${response}`);
        isReminderDialogShowing = false;

        if (response === 'save') {
            // User chose to save
            console.log('🔔 [Save Reminder] User chose to save - calling saveEventsHandler');
            await saveEventsHandler();
        } else if (response === 'later') {
            // User chose to remind later - reset timestamp
            // Important: We must keep the ORIGINAL saved hashes (not current hashes)
            // so that hasChanges() will still return true (because current != saved)
            // We only reset the timestamp to track when to remind again
            console.log('🔔 [Save Reminder] User chose "Để sau" - resetting timestamp only');
            const lastSavedState = await getLastSavedState();
            const newTimestamp = Date.now();
            
            if (lastSavedState) {
                // Keep the original saved hashes (don't update to current)
                // This ensures hasChanges() will still return true
                const originalSavedHashes = {
                    doing_item: lastSavedState.doing_item || '',
                    doing_step: lastSavedState.doing_step || '',
                    myparent_panel: lastSavedState.myparent_panel || ''
                };
                await saveLastSavedState(originalSavedHashes, newTimestamp);
                console.log(`🔔 [Save Reminder] ✅ Timestamp reset to: ${new Date(newTimestamp).toISOString()}`);
                console.log(`🔔 [Save Reminder] ✅ Kept original saved hashes (changes still exist, will remind again)`);
            } else {
                // No previous state - this shouldn't happen, but handle it
                const currentHashes = await calculateFileHashes();
                await saveLastSavedState(currentHashes, newTimestamp);
                console.log(`🔔 [Save Reminder] ✅ No previous state, saved current hashes with timestamp`);
            }
        }

        // Hide dialog
        await tracker._broadcast({
            type: 'hide_save_reminder'
        });
        console.log('🔔 [Save Reminder] Dialog hidden');
    };

    // Start reminder timer (check every 5 minutes)
    const startReminderTimer = () => {
        if (reminderTimerInterval) {
            console.log('🔔 [Save Reminder] Clearing existing timer');
            clearInterval(reminderTimerInterval);
        }
        // Check every 5 minutes (300000ms)
        console.log('🔔 [Save Reminder] ⏰ Starting reminder timer (check every 5 minutes, reminder after 30 minutes of unsaved changes)');
        reminderTimerInterval = setInterval(() => {
            checkAndShowReminder();
        }, 300000);
    };

    // Initialize reminder timer
    console.log('🔔 [Save Reminder] Initializing save reminder system...');
    startReminderTimer();

    let isSaving = false;
    const saveEventsHandler = async () => {
        if (isSaving) {
            console.warn('⚠️ Save already in progress or completed, skipping...');
            return;
        }

        // Check if there are changes
        const changed = await hasChanges();
        if (!changed) {
            await tracker._broadcast({
                type: 'show_toast',
                message: 'ℹ️ Không có thay đổi để lưu'
            });
            console.log('ℹ️ No changes detected, skipping save');
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
            
            // Save current state after successful save
            console.log('🔔 [Save Reminder] Save successful - clearing lastChangeTimestamp');
            const currentHashes = await calculateFileHashes();
            await saveLastSavedState(currentHashes, null); // Clear lastChangeTimestamp on save
            
            // Create checkpoint after successful save
            try {
                if (!tracker.checkpointManager) {
                    tracker.checkpointManager = new CheckpointManager(tracker.sessionFolder, tracker.myAiToolCode);
                    await tracker.checkpointManager.init();
                }

                // Get record_id from info.json
                let recordId = null;
                try {
                    const infoPath = path.join(tracker.sessionFolder, 'info.json');
                    const infoContent = await fsp.readFile(infoPath, 'utf8');
                    const info = JSON.parse(infoContent);
                    if (info.timestamps && info.timestamps.length > 0) {
                        recordId = info.timestamps[0];
                    }
                } catch (err) {
                    console.warn('⚠️ Could not read record_id from info.json');
                }

                const checkpoint = await tracker.checkpointManager.createCheckpoint(null, null, recordId);
                
                await tracker._broadcast({
                    type: 'show_toast',
                    message: `✅ Save completed successfully! Checkpoint created: ${checkpoint.checkpointId.substring(0, 8)}...`
                });
                console.log('✅ Save completed successfully with checkpoint:', checkpoint.checkpointId);
            } catch (checkpointErr) {
                console.error('⚠️ Failed to create checkpoint:', checkpointErr);
                // Don't fail the save if checkpoint creation fails
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '✅ Save completed successfully! (Checkpoint creation failed)'
                });
            }
            
            // Broadcast that changes are saved
            await tracker._broadcast({
                type: 'save_btn_state',
                hasChanges: false
            });
            
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
            
            // Always maximize Queue Tracker (maximized state, taskbar still visible)
            await session.send('Browser.setWindowBounds', {
                windowId,
                bounds: { windowState: 'maximized' }
            });
            await session.detach();
        } catch (err) {
            console.error('Failed to resize queue browser:', err);
        }
    };

    const openPanelEditorHandler = async (actionItemIdToSelect = null) => {
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
            let selectedActionIndex = null;
            
            for (let i = 0; i < actionIds.length; i++) {
                const actionId = actionIds[i];
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
                    
                    // Track index if this is the action to select
                    if (actionItemIdToSelect && actionItem.item_id === actionItemIdToSelect) {
                        selectedActionIndex = i;
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

            // Get panelBefore image from step
            const panelBeforeBase64 = await getPanelBeforeBase64FromStep(tracker.selectedPanelId);
            console.log(`🎨 panelBeforeBase64: ${panelBeforeBase64 ? 'EXISTS (' + panelBeforeBase64.length + ' chars)' : 'NULL'}`);

            // Get panelAfter global_pos for overlay positioning
            const panelAfterGlobalPos = panelItem.metadata?.global_pos || null;
            console.log(`🎨 panelAfterGlobalPos: ${panelAfterGlobalPos ? JSON.stringify(panelAfterGlobalPos) : 'NULL'}`);

            console.log(`Opening editor with ${actions.length} actions from doing_item.jsonl`);

            await tracker.queuePage.evaluate(async (data) => {
                eval(data.panelEditorClassCode);

                const editor = new PanelEditor(data.imageBase64, data.geminiResult, 'full', data.panelId, data.panelBeforeBase64, data.panelAfterGlobalPos);
                await editor.init();
                
                // Auto-select action if specified
                if (data.selectedActionIndex !== null && data.selectedActionIndex !== undefined) {
                    const actionId = '0-' + data.selectedActionIndex;
                    console.log('🎯 Auto-selecting action:', actionId, 'at index:', data.selectedActionIndex);
                    
                    // Find the action to get its page number
                    const action = data.geminiResult[0]?.actions[data.selectedActionIndex];
                    if (action && action.action_pos) {
                        const actionPage = action.action_pos.p || Math.floor(action.action_pos.y / 1080) + 1;
                        const currentPage = editor.currentPageIndex + 1;
                        console.log('📄 Action page:', actionPage, 'Current page:', currentPage);
                        
                        // Switch to the correct page if needed
                        if (actionPage !== currentPage && editor.switchEditPage) {
                            console.log('🔄 Switching to page', actionPage);
                            // Calculate how many pages to switch
                            const pagesToSwitch = actionPage - currentPage;
                            if (pagesToSwitch > 0) {
                                // Switch forward
                                for (let i = 0; i < pagesToSwitch; i++) {
                                    await editor.switchEditPage('next');
                                }
                            } else if (pagesToSwitch < 0) {
                                // Switch backward
                                for (let i = 0; i < Math.abs(pagesToSwitch); i++) {
                                    await editor.switchEditPage('prev');
                                }
                            }
                            // Wait for page to load and action list to update
                            await new Promise(resolve => setTimeout(resolve, 300));
                            console.log('✅ Switched to page', editor.currentPageIndex + 1);
                        }
                    }
                    
                    // Wait for action list to be rendered, then select the action
                    const selectAction = () => {
                        const actionListContainer = document.getElementById('action-list-container');
                        console.log('🔍 Looking for action list container:', !!actionListContainer);
                        if (actionListContainer) {
                            const actionItem = actionListContainer.querySelector('[data-action-id="' + actionId + '"]');
                            console.log('🔍 Found action item:', !!actionItem, 'for actionId:', actionId);
                            if (actionItem) {
                                console.log('✅ Selecting action:', actionId);
                                // Scroll action item into view
                                actionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                // Wait a bit then trigger click
                                setTimeout(() => {
                                    actionItem.click();
                                    console.log('✅ Clicked action item');
                                }, 100);
                                return true;
                            } else {
                                // Log all available action items for debugging
                                const allItems = actionListContainer.querySelectorAll('.action-list-item');
                                const availableIds = Array.from(allItems).map(item => item.getAttribute('data-action-id'));
                                console.log('⚠️ Action item not found. Available items:', availableIds);
                                console.log('⚠️ Looking for:', actionId);
                            }
                        } else {
                            console.log('⚠️ Action list container not found');
                        }
                        return false;
                    };
                    
                    // Also try to select directly using editor's fabricObjects
                    const selectActionDirectly = () => {
                        const boxData = editor.fabricObjects.get(actionId);
                        if (boxData && boxData.rect) {
                            console.log('✅ Found action in fabricObjects, selecting directly');
                            editor.selectedActionIdInSidebar = actionId;
                            const hasIntersections = editor.actionHasIntersections.get(actionId) || false;
                            
                            if (hasIntersections) {
                                const intersections = editor.actionIntersections.get(actionId) || new Set();
                                editor.showIntersectingBoxes(actionId, intersections);
                            } else {
                                editor.showOnlySelectedBox(actionId);
                            }
                            
                            editor.canvas.setActiveObject(boxData.rect);
                            editor.canvas.renderAll();
                            
                            // Update sidebar selection
                            const actionListContainer = document.getElementById('action-list-container');
                            if (actionListContainer) {
                                const actionItem = actionListContainer.querySelector('[data-action-id="' + actionId + '"]');
                                if (actionItem) {
                                    actionListContainer.querySelectorAll('.action-list-item').forEach(otherItem => {
                                        otherItem.style.background = 'rgba(255, 255, 255, 0.05)';
                                        otherItem.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                                    });
                                    actionItem.style.background = 'rgba(102, 126, 234, 0.3)';
                                    actionItem.style.border = '1px solid rgba(102, 126, 234, 0.6)';
                                    actionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            }
                            
                            if (editor.updateRenameByAIButton) {
                                editor.updateRenameByAIButton();
                            }
                            
                            return true;
                        }
                        return false;
                    };
                    
                    // Wait for action list to be fully rendered
                    await new Promise(resolve => setTimeout(resolve, 400));
                    
                    // Try to select via DOM click first
                    if (!selectAction()) {
                        console.log('⚠️ DOM click failed, trying direct selection...');
                        // If DOM click fails, try direct selection
                        if (!selectActionDirectly()) {
                            console.log('⚠️ Direct selection also failed, retrying DOM click...');
                            // Retry DOM click
                            setTimeout(() => {
                                if (!selectAction()) {
                                    console.log('⚠️ Second DOM attempt failed, trying direct again...');
                                    setTimeout(() => {
                                        if (!selectActionDirectly()) {
                                            console.error('❌ Failed to select action after all retries');
                                        }
                                    }, 300);
                                }
                            }, 400);
                        }
                    }
                }
            }, {
                geminiResult: geminiResult,
                imageBase64: editorImage,
                panelEditorClassCode: getPanelEditorClassCode(),
                panelId: tracker.selectedPanelId,
                panelBeforeBase64: panelBeforeBase64,
                panelAfterGlobalPos: panelAfterGlobalPos,
                selectedActionIndex: selectedActionIndex
            });

        } catch (err) {
            console.error('Failed to open panel editor:', err);
        }
    };

    const openPanelEditorForActionHandler = async (actionItemId) => {
        try {
            if (!actionItemId || !tracker.dataItemManager || !tracker.parentPanelManager) {
                console.error('No action ID provided or managers not initialized');
                return;
            }

            // Get parent panel of action
            const parentPanelId = await getParentPanelOfActionHandler(actionItemId);
            if (!parentPanelId) {
                console.error('Could not find parent panel for action:', actionItemId);
                return;
            }

            // Select the parent panel first
            tracker.selectedPanelId = parentPanelId;
            
            // Open panel editor with action to select
            await openPanelEditorHandler(actionItemId);
        } catch (err) {
            console.error('Failed to open panel editor for action:', err);
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

                                const pageNumber = newAction.action_pos.p || existing.metadata?.local_pos?.p || 1;
                                const pageHeight = 1080;
                                
                                // Check if panel has crop (panelItem.metadata.global_pos contains crop area)
                                const panelCropArea = panelItem.metadata?.global_pos;
                                
                                let globalX, globalY;
                                if (panelCropArea) {
                                    // Panel has crop: convert local_pos (in crop) to global_pos (in fullscreen)
                                    // global_x = crop_x + local_x
                                    // global_y = crop_y + local_y (local_y is already relative to crop, so just add crop_y)
                                    globalX = panelCropArea.x + newAction.action_pos.x;
                                    // For y: need to account for page offset if local_pos has page number
                                    // But since local_pos is in crop coordinates, we just add crop_y
                                    // However, if there's a page number, we need to check if the crop area itself spans pages
                                    // For now, assume local_y is relative to the crop area, so:
                                    globalY = panelCropArea.y + newAction.action_pos.y;
                                } else {
                                    // Panel has no crop: local_pos is same as global_pos, just account for page offset
                                    globalX = newAction.action_pos.x;
                                    globalY = (pageNumber - 1) * pageHeight + newAction.action_pos.y;
                                }

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
                                                x: globalX,
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
                        
                        // Check if panel has crop (panelItem.metadata.global_pos contains crop area)
                        const panelCropArea = panelItem.metadata?.global_pos;
                        
                        let globalX, globalY;
                        if (panelCropArea) {
                            // Panel has crop: convert local_pos (in crop) to global_pos (in fullscreen)
                            globalX = panelCropArea.x + actionData.action_pos.x;
                            globalY = panelCropArea.y + actionData.action_pos.y;
                        } else {
                            // Panel has no crop: local_pos is same as global_pos, just account for page offset
                            globalX = actionData.action_pos.x;
                            globalY = (pageNumber - 1) * 1080 + actionData.action_pos.y;
                        }
                        
                        const globalPos = {
                            x: globalX,
                            y: globalY,
                            w: actionData.action_pos.w,
                            h: actionData.action_pos.h
                        };
                        
                        const actionItemId = await tracker.dataItemManager.createAction(
                            actionData.action_name,
                            actionData.action_type || 'button',
                            actionData.action_verb || 'click',
                            globalPos,
                            pageNumber,
                            actionData.action_pos // Pass localPos for createAction to handle correctly
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

                    // Check draw_flow_state and show completion dialog if needed
                    const currentFlowState = await getPanelDrawFlowState(tracker.selectedPanelId);
                    if (currentFlowState === 'edit_actions') {
                        // Panel is in edit_actions state - show completion dialog
                        await tracker._broadcast({
                            type: 'show_panel_completion_dialog',
                            panelId: tracker.selectedPanelId
                        });
                    } else {
                        // If already completed or not part of the flow, just show success toast
                        await tracker._broadcast({
                            type: 'show_toast',
                            message: '✅ Đã lưu chỉnh sửa panel!'
                        });
                    }

                    const displayImage = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);

                    // Use currentFlowState already retrieved above
                    await tracker._broadcast({
                        type: 'panel_selected',
                        panel_id: tracker.selectedPanelId,
                        item_category: 'PANEL',
                        screenshot: displayImage,
                        actions: newActions,
                        action_list: newActions.map(a => a.action_name).filter(Boolean).join(', '),
                        gemini_result: updatedGeminiResult,
                        draw_flow_state: currentFlowState,
                        metadata: panelItem.metadata,
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

            // Check for incomplete draw flow panels
            const incompletePanels = await getIncompleteDrawFlowPanels();
            if (incompletePanels.length > 0) {
                const incompletePanel = incompletePanels[0];
                const panelName = incompletePanel.name || 'Unknown Panel';
                
                // Show alert and open incomplete panel
                await tracker.queuePage.evaluate((msg) => {
                    alert(msg);
                }, `Bạn hãy hoàn tất panel "${panelName}" trước!`);
                
                // Select the incomplete panel and resume flow
                await selectPanelHandler(incompletePanel.item_id);
                await drawPanelAndDetectActionsHandler();
                
                return { mode: 'DRAW_NEW', success: false, blocked: true };
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

            // Check for changes after drawing panel
            scheduleChangeCheck();

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
                    
                    // Show loading indicator (only in queue browser)
                    await tracker._broadcast({ 
                        type: 'show_toast', 
                        message: '🤖 Đang detect panel type với Gemini, vui lòng đợi...',
                        target: 'queue'
                    });
                    
                    const { detectPanelTypeByGemini } = await import('./gemini-handler.js');
                    // Pass both full screenshot and crop area for better popup detection (Solution 1)
                    detectedPanelType = await detectPanelTypeByGemini(croppedBase64, originalImageBase64, cropPos);
                    console.log(`✅ Detected panel type: ${detectedPanelType}`);
                } catch (err) {
                    console.error('⚠️ Failed to detect panel type, using default "screen":', err);
                    await tracker._broadcast({ 
                        type: 'show_toast', 
                        message: '⚠️ Lỗi khi detect panel type, sử dụng mặc định "screen"' 
                    });
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
            
            // Check for changes after saving cropped panel
            scheduleChangeCheck();
            
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
            
            // Check for changes after reset
            scheduleChangeCheck();
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
            
            // Check for changes after marking as done
            scheduleChangeCheck();
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
            
            // Check for changes after deletion
            scheduleChangeCheck();
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

                    // Show loading indicator (only in queue browser)
                    await tracker._broadcast({ 
                        type: 'show_toast', 
                        message: '📸 Đang capture màn hình, vui lòng đợi...',
                        target: 'queue'
                    });

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

            // Check for incomplete panels (excluding current panel)
            const incompletePanels = await getIncompleteDrawFlowPanels();
            const otherIncompletePanels = incompletePanels.filter(p => p.item_id !== tracker.selectedPanelId);
            if (otherIncompletePanels.length > 0) {
                const incompletePanel = otherIncompletePanels[0];
                const panelName = incompletePanel.name || 'Unknown Panel';
                await tracker._broadcast({
                    type: 'show_toast',
                    message: `⚠️ Bạn hãy hoàn tất panel "${panelName}" trước!`
                });
                return;
            }

            // Check current panel's draw_flow_state and resume if needed
            const currentFlowState = await getPanelDrawFlowState(tracker.selectedPanelId);
            if (currentFlowState === 'edit_actions') {
                // Resume at edit actions - open editor directly
                console.log('🔄 Resuming flow at edit_actions - opening editor...');
                const { getPanelEditorClassHandler } = await import('./queue-page-handlers.js');
                const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);
                const displayImage = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);
                
                // Get actions for the panel
                const parentEntry = await tracker.parentPanelManager.getPanelEntry(tracker.selectedPanelId);
                const actionIds = parentEntry?.child_actions || [];
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
                            action_pos: actionItem.metadata?.local_pos || actionItem.metadata?.global_pos
                        });
                    }
                }
                
                // Open editor with existing actions
                await tracker.queuePage.evaluate(async (editorClass, screenshot, geminiResult) => {
                    if (window.queueEditor) {
                        try {
                            // Destroy previous editor directly without showing "Discard all changes?" popup
                            // This is part of the automatic flow (resuming at edit_actions)
                            await window.queueEditor.destroy();
                        } catch (err) {
                            console.warn('⚠️ Failed to destroy previous editor:', err);
                        }
                        window.queueEditor = null;
                    }

                    eval(editorClass);

                    const editor = new window.PanelEditor(screenshot, geminiResult, 'full');
                    await editor.init();
                    window.queueEditor = editor;
                }, await getPanelEditorClassHandler(), displayImage, [{ panel_title: panelItem.name, actions: actions }]);
                
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

            // Set flow state to 'capture' at the start
            await setPanelDrawFlowState(tracker.selectedPanelId, 'capture');

            console.log('📸 Draw Panel & Detect Actions: Capturing long scroll screenshot...');

            // Show loading indicator
            await tracker._broadcast({ 
                type: 'show_toast', 
                message: '📸 Đang capture màn hình, vui lòng đợi...' 
            });

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

            // Update state to 'detect_type'
            await setPanelDrawFlowState(tracker.selectedPanelId, 'detect_type');

            console.log('📐 Detecting actions from DOM (FULL PAGE)...');
            const { captureActionsFromDOM } = await import('../media/dom-capture.js');
            const fullPageDomActions = await captureActionsFromDOM(pageToCapture, null, true, imageWidth, imageHeight);
            console.log(`✅ Detected ${fullPageDomActions.length} DOM actions from full page`);

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

            // Check if this is "After Login Panel" - skip confirmation if true
            const isAfterLoginPanel = panelItem?.name === 'After Login Panel';

            let confirmedPanelType = 'screen'; // Default

            if (!isAfterLoginPanel) {
                // Detect panel type
                let detectedPanelType = 'screen'; // Default
                
                if (switchedToNewTab) {
                    detectedPanelType = 'newtab';
                    console.log(`✅ Panel type set to "newtab" (detected from new tab)`);
                } else {
                    // Call Gemini with full screenshot
                    try {
                        // Show loading indicator
                        await tracker._broadcast({ 
                            type: 'show_toast', 
                            message: '🤖 Đang detect panel type với Gemini, vui lòng đợi...' 
                        });
                        
                        const { detectPanelTypeByGemini } = await import('./gemini-handler.js');
                        // Call with full screenshot (use screenshot as croppedScreenshotB64, no cropArea)
                        detectedPanelType = await detectPanelTypeByGemini(screenshot, null, null);
                        console.log(`✅ Detected panel type: ${detectedPanelType}`);
                    } catch (err) {
                        console.error('⚠️ Failed to detect panel type, using default "screen":', err);
                        await tracker._broadcast({ 
                            type: 'show_toast', 
                            message: '⚠️ Lỗi khi detect panel type, sử dụng mặc định "screen"',
                            target: 'queue'
                        });
                    }
                }

                // Update state to 'confirm_type'
                await setPanelDrawFlowState(tracker.selectedPanelId, 'confirm_type');

                // Show confirmation dialog
                const confirmationPromise = new Promise((resolve, reject) => {
                    tracker.__panelTypeConfirmationResolve = resolve;
                    tracker.__panelTypeConfirmationReject = reject;
                    tracker.__panelTypeConfirmationData = {
                        detectedPanelType,
                        fullScreenshot: screenshot,
                        imageWidth,
                        imageHeight,
                        pagesData,
                        fullPageDomActions,
                        switchedToNewTab,
                        originalPage: switchedToNewTab ? tracker.originalPage : null,
                        restoreViewportFn
                    };
                });

                await tracker._broadcast({
                    type: 'panel_type_confirmation',
                    detectedPanelType,
                    fullScreenshot: screenshot,
                    imageWidth,
                    imageHeight
                });

                try {
                    confirmedPanelType = await confirmationPromise;
                    console.log(`✅ Panel type confirmed: ${confirmedPanelType}`);
                    // Update state to 'crop' after confirming panel type
                    await setPanelDrawFlowState(tracker.selectedPanelId, 'crop');
                } catch (err) {
                    // User canceled - set state to null to allow restart
                    console.log('User canceled panel type confirmation');
                    await setPanelDrawFlowState(tracker.selectedPanelId, null);
                    if (restoreViewport) {
                        await restoreViewport();
                    }
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: 'Đã hủy draw panel'
                    });
                    return;
                }
            } else {
                console.log('⚠️ After Login Panel detected - skipping panel type confirmation');
            }

            // Get panelBefore image from step for comparison
            // selectedItem is always PANEL at this point (checked at line 1316)
            console.log(`🔍 Getting panelBefore for crop editor, selectedPanelId: ${tracker.selectedPanelId}`);
            
            // Always get panelBeforeBase64 from step
            const panelBeforeBase64 = await getPanelBeforeBase64FromStep(tracker.selectedPanelId);
            console.log(`🎨 Final panelBeforeBase64 for crop editor: ${panelBeforeBase64 ? 'EXISTS (' + panelBeforeBase64.length + ' chars)' : 'NULL'}`);

            await tracker.queuePage.evaluate(async (editorClass, fullScreenshot, pages, panelBeforeBase64) => {
                console.log(`🎨 Evaluating crop editor with panelBeforeBase64: ${panelBeforeBase64 ? 'EXISTS (' + panelBeforeBase64.length + ' chars)' : 'NULL'}`);
                
                if (window.queueEditor) {
                    try {
                        // Destroy previous editor directly without showing "Discard all changes?" popup
                        // This is part of the automatic flow, not a user cancel action
                        await window.queueEditor.destroy();
                    } catch (err) {
                        console.warn('⚠️ Failed to destroy previous editor:', err);
                    }
                    window.queueEditor = null;
                }

                eval(editorClass);

                const editor = new window.PanelEditor(
                    fullScreenshot,
                    null,
                    'twoPointCrop',
                    pages,
                    panelBeforeBase64
                );
                await editor.init();
                window.queueEditor = editor;
            }, await getPanelEditorClassHandler(), screenshot, pagesData, panelBeforeBase64);

            tracker.__drawPanelContext = {
                screenshot,
                imageWidth,
                imageHeight,
                pagesData,
                restoreViewport: restoreViewportFn,
                fullPageDomActions,
                switchedToNewTab: switchedToNewTab,
                originalPage: switchedToNewTab ? tracker.originalPage : null,
                confirmedPanelType: confirmedPanelType
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

    const confirmPanelTypeHandler = async (confirmedPanelType) => {
        try {
            if (!tracker.__panelTypeConfirmationData) {
                console.error('No panel type confirmation data found');
                return;
            }

            const { fullScreenshot, imageWidth, imageHeight, pagesData, fullPageDomActions, switchedToNewTab, originalPage, restoreViewportFn } = tracker.__panelTypeConfirmationData;

            // Lưu context với confirmed panel type
            tracker.__drawPanelContext = {
                screenshot: fullScreenshot,
                imageWidth,
                imageHeight,
                pagesData,
                restoreViewport: restoreViewportFn,
                fullPageDomActions,
                switchedToNewTab,
                originalPage,
                confirmedPanelType // Lưu panel type đã confirm
            };

            // Resolve promise để drawPanelAndDetectActionsHandler tiếp tục
            if (tracker.__panelTypeConfirmationResolve) {
                tracker.__panelTypeConfirmationResolve(confirmedPanelType);
                tracker.__panelTypeConfirmationResolve = null;
                tracker.__panelTypeConfirmationReject = null;
                tracker.__panelTypeConfirmationData = null;
            }
        } catch (err) {
            console.error('Failed to confirm panel type:', err);
        }
    };

    const cancelPanelTypeHandler = async () => {
        try {
            // Reject promise
            if (tracker.__panelTypeConfirmationReject) {
                tracker.__panelTypeConfirmationReject(new Error('User canceled panel type confirmation'));
                tracker.__panelTypeConfirmationResolve = null;
                tracker.__panelTypeConfirmationReject = null;
            }

            // Cleanup
            const restoreViewportFn = tracker.__panelTypeConfirmationData?.restoreViewportFn;
            tracker.__panelTypeConfirmationData = null;

            // Set state to null (cancel at step 3)
            if (tracker.selectedPanelId) {
                await setPanelDrawFlowState(tracker.selectedPanelId, null);
            }

            // Restore viewport nếu có
            if (restoreViewportFn) {
                await restoreViewportFn();
            }

            await tracker._broadcast({
                type: 'show_toast',
                message: 'Đã hủy draw panel'
            });
        } catch (err) {
            console.error('Failed to cancel panel type:', err);
        }
    };

    const cancelCropPanelHandler = async () => {
        try {
            // Check if drawPanelContext exists (means crop was canceled, not saved)
            if (tracker.__drawPanelContext && tracker.selectedPanelId) {
                // Set state to null (cancel at step 4)
                await setPanelDrawFlowState(tracker.selectedPanelId, null);
                
                // Cleanup context
                const { restoreViewport } = tracker.__drawPanelContext;
                if (restoreViewport) {
                    await restoreViewport();
                }
                delete tracker.__drawPanelContext;
                
                await tracker._broadcast({
                    type: 'show_toast',
                    message: 'Đã hủy crop panel'
                });
            }
        } catch (err) {
            console.error('Failed to cancel crop panel:', err);
        }
    };

    const confirmPanelCompletionHandler = async (panelId) => {
        try {
            if (!panelId) {
                panelId = tracker.selectedPanelId;
            }
            if (!panelId) {
                console.error('No panel ID provided for completion');
                return;
            }

            // Call makeChild
            await createPanelRelationFromStep(panelId);
            
            // Set state to completed
            await setPanelDrawFlowState(panelId, 'completed');
            
            // Hide dialog
            await tracker._broadcast({
                type: 'hide_panel_completion_dialog'
            });
            
            await tracker._broadcast({
                type: 'show_toast',
                message: '✅ Panel đã hoàn tất!'
            });
            
            // Refresh tree
            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });
            
            // Bring queue browser to front after completion
            if (tracker.queuePage) {
                await tracker.queuePage.bringToFront();
            }
            
            console.log('✅ Panel completion confirmed and makeChild called');
        } catch (err) {
            console.error('Failed to confirm panel completion:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: '❌ Lỗi khi hoàn tất panel!'
            });
        }
    };

    const cancelPanelCompletionHandler = async () => {
        try {
            // Just hide the dialog, keep state as 'edit_actions'
            await tracker._broadcast({
                type: 'hide_panel_completion_dialog'
            });
        } catch (err) {
            console.error('Failed to cancel panel completion:', err);
        }
    };

    const confirmPanelCropHandler = async (cropArea) => {
        try {
            if (!tracker.__drawPanelContext) {
                console.error('No draw panel context found');
                return;
            }

            const { screenshot, imageWidth, imageHeight, pagesData, restoreViewport, fullPageDomActions, switchedToNewTab, originalPage, confirmedPanelType } = tracker.__drawPanelContext;

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

            // Use confirmed panel type from context (already confirmed before opening crop editor)
            const panelTypeToSave = confirmedPanelType || 'screen';
            console.log(`✅ Using confirmed panel type: ${panelTypeToSave}`);

            await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                image_base64: croppedBase64,
                // Luu anh fullscreen goc (khong crop) rieng
                fullscreen_base64: screenshot,
                type: panelTypeToSave,
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

                // Calculate global_pos by adding back cropArea offset
                // action.action_pos is local (relative to cropped panel)
                // global_pos should be relative to full screenshot
                const globalPos = {
                    x: action.action_pos.x + cropArea.x,
                    y: action.action_pos.y + cropArea.y,
                    w: action.action_pos.w,
                    h: action.action_pos.h
                };

                // local_pos is relative to cropped panel (action.action_pos)
                const localPos = {
                    x: action.action_pos.x,
                    y: action.action_pos.y,
                    w: action.action_pos.w,
                    h: action.action_pos.h
                };

                const actionId = await tracker.dataItemManager.createAction(
                    actionName,
                    action.action_type,
                    action.action_verb,
                    globalPos,
                    clampedPageNumber,
                    localPos
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

            // Set flow state to 'edit_actions' and open editor
            await setPanelDrawFlowState(tracker.selectedPanelId, 'edit_actions');
            
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
            
            // Open editor edit actions automatically
            console.log('🔄 Opening editor edit actions...');
            const displayImage = updatedPanel?.image_base64 ? await tracker.dataItemManager.loadBase64FromFile(updatedPanel.image_base64) : null;
            
            const geminiResult = [{
                panel_title: updatedPanel?.name || 'Panel',
                actions: actions.map(a => ({
                    action_id: a.action_id,
                    action_name: a.action_name,
                    action_type: a.action_type,
                    action_verb: a.action_verb,
                    action_content: a.action_content,
                    action_pos: a.action_pos
                }))
            }];
            
            await tracker.queuePage.evaluate(async (editorClass, screenshot, geminiResult) => {
                if (window.queueEditor) {
                    try {
                        // Destroy previous editor directly without showing "Discard all changes?" popup
                        // This is part of the automatic flow (opening edit actions after crop)
                        await window.queueEditor.destroy();
                    } catch (err) {
                        console.warn('⚠️ Failed to destroy previous editor:', err);
                    }
                    window.queueEditor = null;
                }

                eval(editorClass);

                const editor = new window.PanelEditor(screenshot, geminiResult, 'full');
                await editor.init();
                window.queueEditor = editor;
            }, await getPanelEditorClassHandler(), displayImage, geminiResult);
            
            console.log('✅ Draw Panel & Detect Actions - crop completed, editor opened!');
            
            // Check for changes after drawing panel and detecting actions
            scheduleChangeCheck();

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

                // Show loading indicator
                await tracker._broadcast({ 
                    type: 'show_toast', 
                    message: '📸 Đang capture màn hình, vui lòng đợi...' 
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
            
            // Check for changes after capturing actions
            scheduleChangeCheck();
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

                // Show loading indicator
                await tracker._broadcast({ 
                    type: 'show_toast', 
                    message: '📸 Đang capture màn hình, vui lòng đợi...' 
                });

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

            // Show loading indicator
            await tracker._broadcast({ 
                type: 'show_toast', 
                message: '📸 Đang capture màn hình, vui lòng đợi...' 
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

            // Show loading indicator
            await tracker._broadcast({ 
                type: 'show_toast', 
                message: '📸 Đang capture màn hình, vui lòng đợi...' 
            });

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
                    step_info: null,
                    image_base64: null
                };

                // Get parent panel of action
                const parentPanelId = await getParentPanelOfActionHandler(itemId);
                if (parentPanelId) {
                    try {
                        const parentPanelItem = await tracker.dataItemManager.getItem(parentPanelId);
                        if (parentPanelItem) {
                            // Try fullscreen_base64 first, then fall back to image_base64
                            let panelImageBase64 = null;
                            if (parentPanelItem.fullscreen_base64) {
                                panelImageBase64 = await tracker.dataItemManager.loadBase64FromFile(parentPanelItem.fullscreen_base64);
                            } else if (parentPanelItem.image_base64) {
                                panelImageBase64 = await tracker.dataItemManager.loadBase64FromFile(parentPanelItem.image_base64);
                            }

                            if (panelImageBase64 && item.metadata?.global_pos) {
                                // Crop action image from panel image using global_pos
                                const actionImage = await cropBase64Image(panelImageBase64, item.metadata.global_pos);
                                actionInfo.image_base64 = actionImage;
                                console.log(`✅ Cropped action image from panel ${parentPanelId} fullscreen_base64`);
                            }
                        }
                    } catch (err) {
                        console.error('Failed to get action image from panel:', err);
                    }
                }

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

            // Get draw_flow_state for panels
            let drawFlowState = null;
            if (item.item_category === 'PANEL') {
                drawFlowState = await getPanelDrawFlowState(itemId);
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
                draw_flow_state: drawFlowState,
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
            
            // Check for changes after resetting step
            scheduleChangeCheck();
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
            
            // Check for changes after renaming
            scheduleChangeCheck();
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
            
            // Check for changes after renaming by AI
            scheduleChangeCheck();

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
            
            // Check for changes after using before panel
            scheduleChangeCheck();
        } catch (err) {
            console.error('Use CURRENT PANEL failed:', err);
        }
    };

    const useSelectPanelHandler = async (actionItemId, selectedPanelId) => {
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
                    console.error('❌ Video upload failed for USE_SELECT_PANEL action');
                }
            }

            const parentPanelId = await getParentPanelOfActionHandler(actionItemId);

            if (!parentPanelId) {
                console.error('Cannot find parent panel for action');
                return;
            }

            if (!selectedPanelId) {
                console.error('Selected panel ID is required');
                return;
            }

            await tracker.stepManager.createStep(parentPanelId, actionItemId, selectedPanelId);

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

            console.log(`✅ Use SELECT PANEL: ${actionItemId} marked done with panel ${selectedPanelId}`);
            
            // Check for changes after using select panel
            scheduleChangeCheck();
        } catch (err) {
            console.error('Use SELECT PANEL failed:', err);
            throw err;
        }
    };

    const getAllPanelsHandler = async () => {
        try {
            if (!tracker.dataItemManager) {
                console.error('DataItemManager not initialized');
                return [];
            }

            const allItems = await tracker.dataItemManager.getAllItems();
            const panels = allItems
                .filter(item => item.item_category === 'PANEL')
                .map(panel => ({
                    item_id: panel.item_id,
                    name: panel.name,
                    status: panel.status,
                    metadata: panel.metadata || null
                }));

            return panels;
        } catch (err) {
            console.error('Failed to get all panels:', err);
            return [];
        }
    };

    const getPanelImageHandler = async (panelId) => {
        try {
            if (!tracker.dataItemManager) {
                console.error('DataItemManager not initialized');
                return null;
            }

            const panelItem = await tracker.dataItemManager.getItem(panelId);
            if (!panelItem || panelItem.item_category !== 'PANEL') {
                console.error('Panel not found or not a PANEL');
                return null;
            }

            // Try fullscreen_base64 first, then fall back to image_base64
            let panelImageBase64 = null;
            if (panelItem.fullscreen_base64) {
                panelImageBase64 = await tracker.dataItemManager.loadBase64FromFile(panelItem.fullscreen_base64);
            } else if (panelItem.image_base64) {
                panelImageBase64 = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);
            }

            return panelImageBase64;
        } catch (err) {
            console.error('Failed to get panel image:', err);
            return null;
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
            
            // Check for changes after creating manual page
            scheduleChangeCheck();
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

    const getCheckpointsHandler = async () => {
        try {
            if (!tracker.checkpointManager) {
                tracker.checkpointManager = new CheckpointManager(tracker.sessionFolder, tracker.myAiToolCode);
                await tracker.checkpointManager.init();
            }

            const checkpoints = await tracker.checkpointManager.listCheckpoints();
            return checkpoints;
        } catch (err) {
            console.error('Failed to get checkpoints:', err);
            return [];
        }
    };

    const rollbackCheckpointHandler = async (checkpointId, recordId = null) => {
        try {
            if (!tracker.checkpointManager) {
                tracker.checkpointManager = new CheckpointManager(tracker.sessionFolder, tracker.myAiToolCode);
                await tracker.checkpointManager.init();
            }

            // Get record_id if not provided
            let actualRecordId = recordId;
            if (!actualRecordId) {
                try {
                    const infoPath = path.join(tracker.sessionFolder, 'info.json');
                    const infoContent = await fsp.readFile(infoPath, 'utf8');
                    const info = JSON.parse(infoContent);
                    if (info.timestamps && info.timestamps.length > 0) {
                        actualRecordId = info.timestamps[0];
                    }
                } catch (err) {
                    console.warn('⚠️ Could not read record_id from info.json');
                }
            }

            const result = await tracker.checkpointManager.rollbackToCheckpoint(checkpointId, actualRecordId);

            // Reload session after rollback
            if (tracker.reloadSessionAfterRollback) {
                await tracker.reloadSessionAfterRollback();
            }

            // Update last saved state after rollback (rollback restores files to a saved state)
            const currentHashes = await calculateFileHashes();
            await saveLastSavedState(currentHashes);

            await tracker._broadcast({
                type: 'show_toast',
                message: `✅ Rollback completed successfully! Checkpoint: ${checkpointId.substring(0, 8)}...`
            });

            // Refresh panel tree
            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });

            // Check and broadcast changes after rollback
            await checkAndBroadcastChanges();

            return result;
        } catch (err) {
            console.error('Failed to rollback checkpoint:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: `❌ Rollback failed: ${err.message || 'Unknown error'}`
            });
            throw err;
        }
    };

    // Initialize saved state if it doesn't exist (for existing sessions)
    const initializeSavedStateIfNeeded = async () => {
        if (!tracker.sessionFolder) {
            console.log('🔔 [Save Reminder] sessionFolder not set yet, skipping initialization');
            return;
        }
        const lastSavedState = await getLastSavedState();
        if (!lastSavedState) {
            // If no saved state exists, initialize it with current file hashes
            // This handles the case where we load an existing session that was saved before
            // but the .last_saved_state.json file doesn't exist
            const currentHashes = await calculateFileHashes();
            // Only initialize if files have content (not a completely new session)
            if (currentHashes.doing_item || currentHashes.doing_step || currentHashes.myparent_panel) {
                await saveLastSavedState(currentHashes);
                console.log('ℹ️ Initialized saved state from current files');
            }
        }
    };

    // Initialize: set up saved state and check changes on startup
    // Wait a bit to ensure sessionFolder is set
    setTimeout(() => {
        initializeSavedStateIfNeeded().then(() => {
            return checkAndBroadcastChanges();
        }).catch(err => {
            console.error('Error initializing change checker:', err);
        });
    }, 1000);

    return {
        quitApp: quitAppHandler,
        saveEvents: saveEventsHandler,
        resizeQueueBrowser: resizeQueueBrowserHandler,
        openPanelEditor: openPanelEditorHandler,
        openPanelEditorForAction: openPanelEditorForActionHandler,
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
        confirmPanelType: confirmPanelTypeHandler,
        cancelPanelType: cancelPanelTypeHandler,
        confirmPanelCrop: confirmPanelCropHandler,
        cancelCropPanel: cancelCropPanelHandler,
        confirmPanelCompletion: confirmPanelCompletionHandler,
        cancelPanelCompletion: cancelPanelCompletionHandler,
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
        useSelectPanel: useSelectPanelHandler,
        getAllPanels: getAllPanelsHandler,
        getPanelImage: getPanelImageHandler,
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
        updateItemDetails: updateItemDetailsHandler,
        getCheckpoints: getCheckpointsHandler,
        rollbackCheckpoint: rollbackCheckpointHandler,
        checkForChanges: checkAndBroadcastChanges,
        isMainScreenActive: isMainScreenActive,
        isAnyOperationRunning: isAnyOperationRunning,
        showSaveReminderDialog: showSaveReminderDialog,
        handleSaveReminderResponse: handleSaveReminderResponse
    };
}