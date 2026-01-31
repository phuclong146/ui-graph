import { getPanelEditorClassCode } from './panel-editor-class.js';
import { MySQLExporter } from '../data/mysql-exporter.js';
import { promises as fsp } from 'fs';
import path from 'path';
import { CheckpointManager } from '../data/CheckpointManager.js';
import { calculateHash } from '../utils/utils.js';
import { ENV } from '../config/env.js';
import { cropBase64Image } from '../media/screenshot.js';
import { getDbPool } from '../data/db-connection.js';
import { MAX_CAPTURE_PAGES } from '../lib/website-capture.js';
import { fetchWebsiteList } from '../media/uploader.js';

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
     * Get modality_stacks for an AI tool from database
     * @param {string} aiToolCode - The AI tool code
     * @returns {Promise<Array>} Array of modality_stack objects
     */
    const getAiToolModalityStacks = async (aiToolCode) => {
        try {
            if (!aiToolCode) {
                console.warn('⚠️ No aiToolCode provided to getAiToolModalityStacks');
                return [];
            }

            const pool = getDbPool();
            const [rows] = await pool.execute(
                `SELECT f.code, CONCAT(m.name, ' ', f.name) AS name, f.description, f.example, 
                        tf.main_feature_list, tf.main_feature_reason
                 FROM at_tool_feature tf
                 JOIN at_feature f ON tf.my_feature = f.code AND f.level = 'L2'
                 JOIN at_feature m ON f.parent_code = m.code AND m.level = 'L1'
                 WHERE tf.published AND tf.available
                   AND tf.my_ai_tool = ?
                   AND tf.main_feature > 0`,
                [aiToolCode]
            );

            console.log(`✅ Retrieved ${rows.length} modality_stacks for ai_tool: ${aiToolCode}`);
            return rows;
        } catch (err) {
            console.error('❌ Failed to get modality_stacks from database:', err);
            return [];
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
            const relatedStep = stepContent.find(step => step.panel_after?.item_id === panelId);
            
            if (relatedStep) {
                const panelBeforeId = relatedStep.panel_before?.item_id;
                const panelAfterId = relatedStep.panel_after?.item_id;
                if (!panelBeforeId || !panelAfterId) {
                    console.log(`⚠️ Skipping makeChild: missing panel_before (${panelBeforeId}) or panel_after (${panelAfterId}) in step`);
                    return;
                }
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
            // Set initial change timestamp only for DRAW role
            if (currentRole === 'DRAW') {
                const timestamp = Date.now();
                console.log(`🔔 [Save Reminder] First time - no saved state, setting initial timestamp: ${new Date(timestamp).toISOString()}`);
                await saveLastSavedState(currentHashes, timestamp);
            }
            return true;
        }

        const hasChanges = (
            currentHashes.doing_item !== lastSavedState.doing_item ||
            currentHashes.doing_step !== lastSavedState.doing_step ||
            currentHashes.myparent_panel !== lastSavedState.myparent_panel
        );

        // Only track changes and timestamps for DRAW role
        if (currentRole === 'DRAW') {
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
                    isQuitting: typeof isQuitting !== 'undefined' && isQuitting === true,
                    isDetectingImportantActions: typeof window.isDetectingImportantActions !== 'undefined' && window.isDetectingImportantActions === true
                };
                
                const anyRunning = (
                    flags.isSaving ||
                    flags.isCapturing ||
                    flags.isGeminiDetecting ||
                    flags.isDrawingPanel ||
                    flags.isQuitting ||
                    flags.isDetectingImportantActions
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
    let currentRole = 'DRAW'; // Track current role to skip save reminder logic for non-DRAW roles

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
            // User chose to save - force save (mandatory)
            console.log('🔔 [Save Reminder] User chose to save - calling saveEventsHandler');
            await saveEventsHandler();
        }
        // Note: "later" option removed - dialog is now mandatory save only

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

    // Initialize reminder timer only for DRAW role
    const initializeSaveReminder = async () => {
        try {
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const projectRoot = path.dirname(path.dirname(path.dirname(__filename)));
            const accountPath = path.join(projectRoot, 'account.json');
            
            let role = 'DRAW'; // Default to DRAW
            try {
                const content = await fsp.readFile(accountPath, 'utf8');
                const accountData = JSON.parse(content);
                if (accountData && accountData.role) {
                    role = accountData.role;
                }
            } catch (err) {
                console.log('⚠️ Could not read account.json for save reminder, using default role: DRAW');
            }
            
            // Update current role
            currentRole = role;
            
            if (role === 'DRAW') {
                console.log('🔔 [Save Reminder] Initializing save reminder system for DRAW role...');
                startReminderTimer();
            } else {
                console.log(`🔔 [Save Reminder] Skipping save reminder initialization for role: ${role}`);
            }
        } catch (err) {
            console.error('❌ [Save Reminder] Error initializing save reminder:', err);
            // Default to starting timer if there's an error
            console.log('🔔 [Save Reminder] Defaulting to starting timer due to error');
            startReminderTimer();
        }
    };
    
    initializeSaveReminder();

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

                                // Prepare update data
                                const updateData = {
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
                                };

                                // If position changed, crop new action image from panel
                                if (posChanged) {
                                    try {
                                        // Get parent panel image (prefer fullscreen_base64)
                                        let panelImageBase64 = null;
                                        if (panelItem.fullscreen_base64) {
                                            panelImageBase64 = await tracker.dataItemManager.loadBase64FromFile(panelItem.fullscreen_base64);
                                        } else if (panelItem.image_base64) {
                                            panelImageBase64 = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);
                                        }

                                        if (panelImageBase64) {
                                            // Crop action image with new global_pos
                                            const newGlobalPos = {
                                                x: globalX,
                                                y: globalY,
                                                w: newAction.action_pos.w,
                                                h: newAction.action_pos.h
                                            };
                                            const actionImage = await cropBase64Image(panelImageBase64, newGlobalPos);
                                            
                                            // Calculate hash of new image
                                            const newImageHash = await calculateHash(actionImage);
                                            
                                            // Update image_base64 and hash
                                            updateData.image_base64 = actionImage;
                                            updateData.metadata.image_hash = newImageHash;
                                            
                                            console.log(`    [${logIndex}] Cropped new action image for "${newAction.action_name}"`);
                                        }
                                    } catch (err) {
                                        console.error(`    [${logIndex}] Failed to crop action image for "${newAction.action_name}":`, err);
                                    }
                                }

                                toUpdate.push({
                                    itemId: existing.item_id,
                                    newData: updateData
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
                            console.log(`[RECORD] 🗑️  Deleting action ${actionItem.item_id} that is currently recording, cancelling...`);
                            await tracker.cancelPanelRecording();
                        }

                        await removeActionFromItem(tracker.selectedPanelId, panelItem.item_category, actionItem.item_id);
                        console.log(`[CLICK] 🗑️  Deleting clicks for action ${actionItem.item_id} (from edit actions)`);
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
                        // Wait for panel editor to close before showing dialog to prevent duplicate display
                        const checkAndShowDialog = async () => {
                            // Check if panel editor is still open
                            if (tracker.queuePage) {
                                const editorExists = await tracker.queuePage.evaluate(() => {
                                    const editorContainer = document.getElementById('editor-container');
                                    return editorContainer && editorContainer.parentNode !== null;
                                });
                                
                                if (editorExists) {
                                    // Editor still open, wait a bit more
                                    setTimeout(checkAndShowDialog, 200);
                                    return;
                                }
                            }
                            
                            // Editor is closed, show dialog
                            await tracker._broadcast({
                                type: 'show_panel_completion_dialog',
                                panelId: tracker.selectedPanelId
                            });
                        };
                        
                        // Start checking after a short delay
                        setTimeout(checkAndShowDialog, 500);
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

            console.log(`[RECORD] 📤 Complete action - checking for recording...`);
            const recordingInfo = await tracker.stopPanelRecording();
            let videoUrl = null;

            if (recordingInfo && recordingInfo.panelId) {
                console.log(`[RECORD] 📹 Recording found, preparing upload:`);
                console.log(`[RECORD]    Panel ID: ${recordingInfo.panelId}`);
                console.log(`[RECORD]    Video path: ${recordingInfo.videoPath}`);
                console.log(`[RECORD]    Session: ${new Date(recordingInfo.sessionStart).toISOString()} → ${new Date(recordingInfo.sessionEnd).toISOString()}`);
                
                try {
                    const { uploadVideoAndGetUrl } = await import('../media/uploader.js');
                    const { ENV } = await import('../config/env.js');
                    
                    console.log(`[RECORD] 🔍 Checking if video file exists...`);
                    const exists = await fsp.access(recordingInfo.videoPath).then(() => true).catch(() => false);
                    console.log(`[RECORD]    File exists: ${exists}`);
                    
                    if (exists) {
                        console.log(`[RECORD] ⬆️  Starting upload...`);
                        console.log(`[RECORD]    Video code: ${recordingInfo.panelId}`);
                        console.log(`[RECORD]    Upload endpoint: https://upload.clevai.edu.vn/admin/video`);
                        
                        videoUrl = await uploadVideoAndGetUrl(
                            recordingInfo.videoPath,
                            recordingInfo.panelId,
                            ENV.API_TOKEN
                        );
                        
                        if (videoUrl) {
                            console.log(`[RECORD] ✅ Upload successful!`);
                            console.log(`[RECORD]    Video URL: ${videoUrl}`);
                            console.log(`[RECORD] 💾 Saving metadata to action: ${tracker.selectedPanelId}`);
                            
                            await tracker.dataItemManager.updateItem(tracker.selectedPanelId, {
                                metadata: {
                                    ...actionItem.metadata,
                                    session_url: videoUrl,
                                    session_start: recordingInfo.sessionStart,
                                    session_end: recordingInfo.sessionEnd
                                }
                            });
                            
                            console.log(`[RECORD] ✅ Metadata saved successfully`);
                            await tracker._broadcast({ type: 'show_toast', message: '✅ Video saved' });
                        } else {
                            console.error(`[RECORD] ❌ Upload returned no URL`);
                        }
                    } else {
                        console.warn(`[RECORD] ⚠️  Recording file not found, skip upload: ${recordingInfo.videoPath}`);
                    }
                } catch (uploadErr) {
                    console.error(`[RECORD] ❌ Failed to upload panel recording:`, uploadErr);
                    console.error(`[RECORD]    Error details:`, uploadErr.message, uploadErr.stack);
                }
            } else {
                console.log(`[RECORD] ⏭️  No recording info to upload`);
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
                    detectedPanelType = await detectPanelTypeByGemini(croppedBase64, originalImageBase64, cropPos, tracker);
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
            
            // Auto-call detectActionPurpose after draw new panel (wrapped in try-catch to not break main flow)
            try {
                await detectActionPurposeHandler(actionItemId);
            } catch (purposeErr) {
                console.error('⚠️ Auto detectActionPurpose failed (non-blocking):', purposeErr);
            }
            
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
                console.log(`[RECORD] 🚫 Gemini asking finished, cancelling active recording...`);
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
                        console.log(`[CLICK] 🗑️  Deleting clicks for ${childPage.child_actions.length} actions in page ${targetItemId} (from reset panel)`);
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
                console.log(`[CLICK] 🗑️  Deleting clicks for ${descendants.length} descendant items (from reset panel)`);
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

            // Scenario C: Ghi validation khi role=DRAW chọn action và bấm Mark Done
            if (item.item_category === 'ACTION') {
                try {
                    // Read role from account.json
                    let accountRole = 'DRAW';
                    try {
                        const { fileURLToPath } = await import('url');
                        const __filename = fileURLToPath(import.meta.url);
                        const projectRoot = path.dirname(path.dirname(path.dirname(__filename)));
                        const accountPath = path.join(projectRoot, 'account.json');
                        const accountContent = await fsp.readFile(accountPath, 'utf8');
                        const accountData = JSON.parse(accountContent);
                        accountRole = accountData.role || 'DRAW';
                    } catch (err) {
                        console.log('⚠️ Could not read account.json for role check, using default: DRAW');
                    }

                    console.log(`[VALIDATION] Scenario C - accountRole: ${accountRole}, validationManager: ${!!tracker.validationManager}, itemId: ${targetItemId}`);

                    // Chỉ ghi validation cho role=DRAW
                    if (accountRole === 'DRAW' && tracker.validationManager) {
                        const createdAt = Date.now(); // UTC timestamp
                        console.log(`[VALIDATION] Adding validation for action ${targetItemId}...`);
                        await tracker.validationManager.addValidation(targetItemId, createdAt);
                        console.log(`✅ Added validation for action ${targetItemId} (Mark Done scenario)`);
                    } else {
                        console.log(`[VALIDATION] Skipping validation - accountRole: ${accountRole}, validationManager exists: ${!!tracker.validationManager}`);
                    }
                } catch (validationErr) {
                    console.error('Failed to add validation in markAsDoneHandler:', validationErr);
                    console.error('Validation error stack:', validationErr.stack);
                    // Don't throw - allow operation to continue
                }

                const actionParentPanelId = await getParentPanelOfActionHandler(targetItemId);
                if (actionParentPanelId) {
                    await checkAndUpdatePanelStatusHandler(actionParentPanelId);
                }

                // Tạo step với panel_before = panel chứa action, action = action được mark done, panel_after = null
                if (tracker.stepManager && actionParentPanelId) {
                    const existingStep = await tracker.stepManager.getStepForAction(targetItemId);
                    if (!existingStep) {
                        await tracker.stepManager.createStep(actionParentPanelId, targetItemId, null);
                    }
                }

                // Auto-call detectActionPurpose sau khi Mark as Done (non-blocking)
                try {
                    await detectActionPurposeHandler(targetItemId);
                } catch (purposeErr) {
                    console.error('⚠️ Auto detectActionPurpose after Mark as Done failed (non-blocking):', purposeErr);
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
                console.log(`[RECORD] 🗑️  Deleting item ${targetItemId} that is currently recording, cancelling...`);
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

            if (item.item_category === 'PANEL') {
                const panelEntry = await tracker.parentPanelManager.getPanelEntry(targetItemId);
                const hasChildActions = panelEntry?.child_actions?.length > 0;
                const hasChildPanels = panelEntry?.child_panels?.length > 0;
                if (hasChildActions || hasChildPanels) {
                    console.warn(`[DELETE PANEL] Skip: panel "${item.name}" (${targetItemId}) vì đang còn child_actions hoặc child_panels`, {
                        child_actions: panelEntry?.child_actions?.length ?? 0,
                        child_panels: panelEntry?.child_panels?.length ?? 0
                    });
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: `Không xóa được panel ${item.name} vì đang còn action và panel con`
                    });
                    return;
                }
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

            // Xóa validation cho các ACTION items bị xóa
            if (tracker.validationManager) {
                try {
                    for (const id of itemsToDelete) {
                        const deletedItem = await tracker.dataItemManager.getItem(id);
                        if (deletedItem && deletedItem.item_category === 'ACTION') {
                            await tracker.validationManager.removeValidation(id);
                        }
                    }
                } catch (validationErr) {
                    console.error('Failed to remove validation in deleteEventHandler:', validationErr);
                    // Don't throw - allow operation to continue
                }
            }

            await tracker.dataItemManager.deleteItems(itemsToDelete);
            console.log(`[CLICK] 🗑️  Deleting clicks for ${itemsToDelete.length} items (from delete panel)`);
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
            console.log(`[RECORD] 📤 Gemini AI capture (PAGE) - checking for recording...`);

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
                console.log(`[RECORD] 📹 Recording found, preparing upload:`);
                console.log(`[RECORD]    Panel ID: ${recordingResult.panelId}`);
                console.log(`[RECORD]    Video path: ${recordingResult.videoPath}`);
                console.log(`[RECORD]    Session: ${new Date(recordingResult.sessionStart).toISOString()} → ${new Date(recordingResult.sessionEnd).toISOString()}`);
                
                const { uploadVideoAndGetUrl } = await import('../media/uploader.js');
                const { ENV } = await import('../config/env.js');
                const videoCode = `panel_${recordingResult.panelId}_${Date.now()}`;
                console.log(`[RECORD]    Video code: ${videoCode}`);

                try {
                    console.log(`[RECORD] ⬆️  Starting upload...`);
                    console.log(`[RECORD]    Upload endpoint: https://upload.clevai.edu.vn/admin/video`);
                    
                    const sessionUrl = await uploadVideoAndGetUrl(recordingResult.videoPath, videoCode, ENV.API_TOKEN);
                    console.log(`[RECORD] ✅ Upload successful!`);
                    console.log(`[RECORD]    Video URL: ${sessionUrl}`);

                    const actionItem = await tracker.dataItemManager.getItem(recordingResult.panelId);
                    if (actionItem && actionItem.item_category === 'ACTION') {
                        console.log(`[RECORD] 💾 Saving metadata to action: ${recordingResult.panelId}`);
                        const updatedMetadata = {
                            ...(actionItem.metadata || {}),
                            session_url: sessionUrl,
                            session_start: recordingResult.sessionStart,
                            session_end: recordingResult.sessionEnd
                        };

                        await tracker.dataItemManager.updateItem(recordingResult.panelId, {
                            metadata: updatedMetadata
                        });
                        console.log(`[RECORD] ✅ Metadata saved successfully`);
                    } else {
                        console.warn(`[RECORD] ⚠️  Action item not found or not ACTION category: ${recordingResult.panelId}`);
                    }

                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '✅ Recorded!'
                    });
                } catch (uploadErr) {
                    console.error(`[RECORD] ❌ Failed to upload panel recording:`, uploadErr);
                    console.error(`[RECORD]    Error details:`, uploadErr.message, uploadErr.stack);
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '❌ Upload fail!'
                    });
                }
            } else {
                console.log(`[RECORD] ⏭️  No recording result to upload`);
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
                
                // Check if panel has crop
                const panelCropArea = panelItem.metadata?.global_pos;
                
                for (const actionId of actionIds) {
                    const actionItem = await tracker.dataItemManager.getItem(actionId);
                    if (actionItem) {
                        let actionPos;
                        
                        if (panelCropArea && actionItem.metadata?.global_pos) {
                            // Panel has crop: always convert from global_pos to local_pos (relative to crop area)
                            // This ensures consistency even if local_pos exists but might be incorrect
                            const globalX = actionItem.metadata.global_pos.x;
                            const globalY = actionItem.metadata.global_pos.y;
                            const localX = globalX - panelCropArea.x;
                            const localY = globalY - panelCropArea.y;
                            
                            console.log(`🔄 Converting action "${actionItem.name}": global(${globalX},${globalY}) -> local(${localX},${localY}) with crop(${panelCropArea.x},${panelCropArea.y})`);
                            
                            actionPos = {
                                p: actionItem.metadata.global_pos?.p || actionItem.metadata?.local_pos?.p || Math.floor(localY / 1080) + 1,
                                x: localX,
                                y: localY,
                                w: actionItem.metadata.global_pos.w,
                                h: actionItem.metadata.global_pos.h
                            };
                        } else {
                            // Panel has no crop: use local_pos if available, otherwise global_pos
                            actionPos = actionItem.metadata?.local_pos || actionItem.metadata?.global_pos;
                        }
                        
                        actions.push({
                            action_id: actionItem.item_id,
                            action_name: actionItem.name,
                            action_type: actionItem.type,
                            action_verb: actionItem.verb,
                            action_content: actionItem.content,
                            action_pos: actionPos
                        });
                    }
                }
                
                // Get panelAfter global_pos for editor (crop area)
                const panelAfterGlobalPos = panelItem.metadata?.global_pos || null;
                
                // Open editor with existing actions
                await tracker.queuePage.evaluate(async (editorClass, screenshot, geminiResult, panelAfterGlobalPos) => {
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

                    const editor = new window.PanelEditor(screenshot, geminiResult, 'full', null, null, panelAfterGlobalPos);
                    await editor.init();
                    window.queueEditor = editor;
                }, await getPanelEditorClassHandler(), displayImage, [{ panel_title: panelItem.name, actions: actions }], panelAfterGlobalPos);
                
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

            // Show loading indicator (only in queue browser)
            await tracker._broadcast({ 
                type: 'show_toast', 
                message: '📸 Đang capture màn hình, vui lòng đợi...',
                target: 'queue'
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

            // Check for frozen screenshot first (to capture dropdowns/popups before focus lost)
            let screenshot, imageWidth, imageHeight;
            let restoreViewportFn = null;
            
            if (tracker.frozenScreenshot && tracker.frozenScreenshotMetadata) {
                console.log('❄️ Using frozen screenshot (captured with Ctrl+` or F2)');
                screenshot = tracker.frozenScreenshot;
                imageWidth = tracker.frozenScreenshotMetadata.imageWidth;
                imageHeight = tracker.frozenScreenshotMetadata.imageHeight;
                
                await tracker._broadcast({ 
                    type: 'show_toast', 
                    message: '❄️ Đang sử dụng frozen screenshot...' 
                });
                
                // Clear frozen screenshot after use
                tracker.clearFrozenScreenshot();
            } else {
                // Capture fresh screenshot
                const { captureScreenshot } = await import('../media/screenshot.js');
                const result = await captureScreenshot(pageToCapture, "base64", true, true, progressCallback);
                screenshot = result.screenshot;
                imageWidth = result.imageWidth;
                imageHeight = result.imageHeight;
                restoreViewportFn = result.restoreViewport;
            }
            
            restoreViewport = restoreViewportFn;
            console.log(`📐 Long scroll image captured: ${imageWidth}x${imageHeight}`);

            // Update state to 'detect_type'
            await setPanelDrawFlowState(tracker.selectedPanelId, 'detect_type');

            console.log('📐 Detecting actions from DOM (FULL PAGE)...');
            const { captureActionsFromDOM } = await import('../media/dom-capture.js');
            const fullPageDomActions = await captureActionsFromDOM(pageToCapture, null, true, imageWidth, imageHeight);
            console.log(`✅ Detected ${fullPageDomActions.length} DOM actions from full page`);

            const pageHeight = 1080;
            let numPages = Math.ceil(imageHeight / pageHeight);
            
            // Áp dụng giới hạn tối đa số trang
            if (numPages > MAX_CAPTURE_PAGES) {
                console.log(`⚠️ Limiting pages from ${numPages} to ${MAX_CAPTURE_PAGES} pages (maxSections limit)`);
                numPages = MAX_CAPTURE_PAGES;
                // Giới hạn imageHeight tương ứng
                imageHeight = MAX_CAPTURE_PAGES * pageHeight;
            }
            
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
                        detectedPanelType = await detectPanelTypeByGemini(screenshot, null, null, tracker);
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

            // Scenario B: Ghi validation trước khi gọi makeChild khi role=DRAW hoàn tất draw panel & detect actions
            try {
                // Read role from account.json
                let accountRole = 'DRAW';
                try {
                    const { fileURLToPath } = await import('url');
                    const __filename = fileURLToPath(import.meta.url);
                    const projectRoot = path.dirname(path.dirname(path.dirname(__filename)));
                    const accountPath = path.join(projectRoot, 'account.json');
                    const accountContent = await fsp.readFile(accountPath, 'utf8');
                    const accountData = JSON.parse(accountContent);
                    accountRole = accountData.role || 'DRAW';
                } catch (err) {
                    console.log('⚠️ Could not read account.json for role check, using default: DRAW');
                }

                console.log(`[VALIDATION] Scenario B - accountRole: ${accountRole}, validationManager: ${!!tracker.validationManager}, panelId: ${panelId}`);

                // Tìm action liên quan từ step
                if (accountRole === 'DRAW' && tracker.validationManager) {
                    const stepContent = await tracker.stepManager.getAllSteps();
                    console.log(`[VALIDATION] Found ${stepContent.length} steps, looking for panel_after=${panelId}`);
                    const relatedStep = stepContent.find(step => step.panel_after?.item_id === panelId);
                    
                    if (relatedStep && relatedStep.action?.item_id) {
                        const actionId = relatedStep.action.item_id;
                        const createdAt = Date.now(); // UTC timestamp
                        console.log(`[VALIDATION] Found action ${actionId} for panel ${panelId}, adding validation...`);
                        await tracker.validationManager.addValidation(actionId, createdAt);
                        console.log(`✅ Added validation for action ${actionId} (Draw New Panel scenario)`);
                    } else {
                        console.log(`[VALIDATION] No related step or action found for panel ${panelId}`);
                    }
                } else {
                    console.log(`[VALIDATION] Skipping validation - accountRole: ${accountRole}, validationManager exists: ${!!tracker.validationManager}`);
                }
            } catch (validationErr) {
                console.error('Failed to add validation in confirmPanelCompletionHandler:', validationErr);
                console.error('Validation error stack:', validationErr.stack);
                // Don't throw - allow operation to continue
            }

            // Call makeChild
            await createPanelRelationFromStep(panelId);
            
            // Generate tracking video and step video for the action in the step related to this panel
            try {
                // Find step with panel_after matching this panelId
                const stepContent = await tracker.stepManager.getAllSteps();
                const relatedStep = stepContent.find(step => step.panel_after?.item_id === panelId);
                
                if (relatedStep && relatedStep.action?.item_id) {
                    const actionId = relatedStep.action.item_id;
                    console.log(`🎬 Generating videos for action ${actionId} in step (panel_after=${panelId})...`);
                    
                    try {
                        await generateVideoForActionHandler(actionId);
                        console.log(`✅ Videos generated for action ${actionId}`);
                    } catch (videoErr) {
                        console.error(`❌ Failed to generate videos for action ${actionId}:`, videoErr);
                        // Don't throw - continue with completion flow
                    }
                } else {
                    console.log(`ℹ️ No step or action found for panel ${panelId}, skipping video generation`);
                }
            } catch (videoGenErr) {
                console.error('❌ Error during video generation (non-blocking):', videoGenErr);
                // Don't throw - continue with completion flow
            }
            
            // Set state to completed
            await setPanelDrawFlowState(panelId, 'completed');
            
            // Detect important actions (modality_stacks) for After Login Panel after completion
            const panelItem = await tracker.dataItemManager.getItem(panelId);
            if (panelItem?.name === 'After Login Panel') {
                try {
                    // Get panel actions
                    const parentEntry = await tracker.parentPanelManager.getPanelEntry(panelId);
                    const actionIds = parentEntry?.child_actions || [];
                    
                    if (actionIds.length > 0) {
                        console.log('🎯 Detecting important actions (modality_stacks) for After Login Panel after completion...');
                        
                        // Set flag and show loading modal
                        await tracker.queuePage.evaluate(() => {
                            window.isDetectingImportantActions = true;
                        });
                        
                        await tracker._broadcast({
                            type: 'show_loading',
                            message: '🤖 Đang detect important actions...',
                            isDetectingImportantActions: true // Flag để browser context biết đây là detect important actions
                        });

                        // Get panel image URL or base64
                        let panelImageUrl = panelItem?.image_url || panelItem?.fullscreen_url || null;
                        if (!panelImageUrl && panelItem?.image_base64) {
                            // Use base64 if no URL available
                            panelImageUrl = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);
                            console.log('📸 Using base64 image for modality_stacks detection');
                        }
                        
                        if (panelImageUrl) {
                            // Get actions list for detectImportantActions
                            const actionsForDetection = [];
                            for (const actionId of actionIds) {
                                const actionItem = await tracker.dataItemManager.getItem(actionId);
                                if (actionItem) {
                                    actionsForDetection.push({
                                        item_id: actionId,
                                        name: actionItem.name || 'Unknown Action'
                                    });
                                }
                            }

                            // Get modality_stacks from database
                            const aiToolModalityStacks = await getAiToolModalityStacks(tracker.myAiToolCode);
                            
                            if (aiToolModalityStacks.length > 0) {
                                // Import detectImportantActions
                                const { detectImportantActions } = await import('./gemini-handler.js');
                                
                                // Log before calling detectImportantActions
                                console.log('🔍 Calling detectImportantActions with:', {
                                    panelId: panelItem?.item_id,
                                    panelName: panelItem?.name,
                                    actionsCount: actionsForDetection.length,
                                    modalityStacksCount: aiToolModalityStacks.length,
                                    aiToolCode: tracker.myAiToolCode,
                                    panelImageUrlType: panelImageUrl?.startsWith('http') ? 'URL' : 'base64',
                                    panelImageUrlLength: panelImageUrl?.length || 0
                                });
                                
                                // Log actions data for debugging
                                actionsForDetection.forEach((action, idx) => {
                                    console.log(`📋 Action [${idx}]:`, {
                                        item_id: action.item_id,
                                        name: action.name,
                                        nameLength: action.name?.length || 0,
                                        hasSpecialChars: action.name ? /[^\x20-\x7E\u00A0-\uFFFF]/.test(action.name) : false
                                    });
                                });
                                
                                // Call detectImportantActions
                                const detectionResult = await detectImportantActions(
                                    tracker,
                                    panelImageUrl,
                                    actionsForDetection,
                                    aiToolModalityStacks
                                );

                                // Update actions with modality_stacks and reason
                                let dbUpdatedCount = 0;
                                const exporter = new MySQLExporter(tracker.sessionFolder, tracker.urlTracking, tracker.myAiToolCode);
                                
                                try {
                                    await exporter.init();
                                    
                                    for (const resultItem of detectionResult) {
                                        const actionItem = await tracker.dataItemManager.getItem(resultItem.item_id);
                                        if (actionItem) {
                                            // Check if there are changes
                                            const oldModalityStacks = JSON.stringify(actionItem.modality_stacks || []);
                                            const newModalityStacks = JSON.stringify(resultItem.modality_stacks || []);
                                            const oldReason = actionItem.modality_stacks_reason || null;
                                            const newReason = resultItem.reason || null;
                                            
                                            const hasChanges = oldModalityStacks !== newModalityStacks || oldReason !== newReason;
                                            
                                            if (hasChanges) {
                                                // Save modality_stacks and reason to action item (JSONL)
                                                const updates = {
                                                    modality_stacks: resultItem.modality_stacks,
                                                    modality_stacks_reason: resultItem.reason || null
                                                };
                                                
                                                await tracker.dataItemManager.updateItem(resultItem.item_id, updates);
                                                
                                                // Update database for this item
                                                const dbUpdated = await exporter.updateItemModalityStacks(
                                                    resultItem.item_id,
                                                    resultItem.modality_stacks,
                                                    resultItem.reason || null
                                                );
                                                
                                                if (dbUpdated) {
                                                    dbUpdatedCount++;
                                                }
                                            }
                                        }
                                    }
                                } finally {
                                    await exporter.close();
                                }
                                
                                if (dbUpdatedCount > 0) {
                                    console.log(`✅ Updated ${dbUpdatedCount} items in database with modality_stacks`);
                                }

                                const actionsWithModalityStacks = detectionResult.filter(r => r.modality_stacks.length > 0).length;
                                console.log(`✅ Detected modality_stacks: ${actionsWithModalityStacks}/${detectionResult.length} actions have modality_stacks`);
                                
                                await tracker._broadcast({
                                    type: 'show_toast',
                                    message: `✅ Detected ${actionsWithModalityStacks} important actions`
                                });
                            } else {
                                console.log('⚠️ No modality_stacks found in database, skipping detection');
                            }
                        } else {
                            // No panel image, clear flag and hide loading
                            await tracker.queuePage.evaluate(() => {
                                window.isDetectingImportantActions = false;
                            });
                            await tracker._broadcast({
                                type: 'hide_loading'
                            });
                        }
                    } else {
                        // No actions, clear flag and hide loading
                        await tracker.queuePage.evaluate(() => {
                            window.isDetectingImportantActions = false;
                        });
                        await tracker._broadcast({
                            type: 'hide_loading'
                        });
                    }
                } catch (err) {
                    console.error('❌ Failed to detect important actions:', err);
                    // Don't block the flow if detection fails
                    await tracker._broadcast({
                        type: 'show_toast',
                        message: '⚠️ Failed to detect important actions, but panel completed successfully'
                    });
                } finally {
                    // Clear flag and hide loading modal
                    await tracker.queuePage.evaluate(() => {
                        window.isDetectingImportantActions = false;
                    });
                    await tracker._broadcast({
                        type: 'hide_loading'
                    });
                }
            }
            
            // Auto-call detectActionPurpose after draw new panel completion (wrapped in try-catch to not break main flow)
            try {
                // Find step with panel_after matching this panelId to get the action ID
                const stepsForPurpose = await tracker.stepManager.getAllSteps();
                const stepForPurpose = stepsForPurpose.find(step => step.panel_after?.item_id === panelId);
                
                if (stepForPurpose && stepForPurpose.action?.item_id) {
                    const actionIdForPurpose = stepForPurpose.action.item_id;
                    console.log(`🎯 Auto-calling detectActionPurpose for action ${actionIdForPurpose}...`);
                    await detectActionPurposeHandler(actionIdForPurpose);
                } else {
                    console.log(`ℹ️ No action found for panel ${panelId}, skipping detectActionPurpose`);
                }
            } catch (purposeErr) {
                console.error('⚠️ Auto detectActionPurpose failed (non-blocking):', purposeErr);
            }
            
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
            
            // Auto-call detectActionPurpose even when user cancels completion (wrapped in try-catch to not break main flow)
            try {
                const panelId = tracker.selectedPanelId;
                if (panelId) {
                    // Find step with panel_after matching this panelId to get the action ID
                    const stepsForPurpose = await tracker.stepManager.getAllSteps();
                    const stepForPurpose = stepsForPurpose.find(step => step.panel_after?.item_id === panelId);
                    
                    if (stepForPurpose && stepForPurpose.action?.item_id) {
                        const actionIdForPurpose = stepForPurpose.action.item_id;
                        console.log(`🎯 Auto-calling detectActionPurpose for action ${actionIdForPurpose} (on cancel)...`);
                        await detectActionPurposeHandler(actionIdForPurpose);
                    } else {
                        console.log(`ℹ️ No action found for panel ${panelId}, skipping detectActionPurpose`);
                    }
                }
            } catch (purposeErr) {
                console.error('⚠️ Auto detectActionPurpose failed (non-blocking):', purposeErr);
            }
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
            // Get crop area for converting coordinates
            const panelCropArea = updatedPanel?.metadata?.global_pos || null;
            
            for (const actionId of actionIds) {
                const actionItem = await tracker.dataItemManager.getItem(actionId);
                if (actionItem) {
                    // Use local_pos if available (relative to crop area), otherwise global_pos
                    // For panel with crop, local_pos is already correct (relative to crop area)
                    let actionPos = actionItem.metadata?.local_pos || actionItem.metadata?.global_pos;
                    
                    // If panel has crop but we only have global_pos, convert to local_pos
                    if (panelCropArea && actionItem.metadata?.global_pos && !actionItem.metadata?.local_pos) {
                        actionPos = {
                            p: actionItem.metadata.global_pos?.p || Math.floor((actionItem.metadata.global_pos.y - panelCropArea.y) / 1080) + 1,
                            x: actionItem.metadata.global_pos.x - panelCropArea.x,
                            y: actionItem.metadata.global_pos.y - panelCropArea.y,
                            w: actionItem.metadata.global_pos.w,
                            h: actionItem.metadata.global_pos.h
                        };
                    }
                    
                    actions.push({
                        action_id: actionItem.item_id,
                        action_name: actionItem.name,
                        action_type: actionItem.type,
                        action_verb: actionItem.verb,
                        action_content: actionItem.content,
                        action_pos: actionPos
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
            
            // Get panelAfter global_pos for editor (crop area)
            const panelAfterGlobalPos = updatedPanel?.metadata?.global_pos || null;
            
            await tracker.queuePage.evaluate(async (editorClass, screenshot, geminiResult, panelAfterGlobalPos) => {
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

                const editor = new window.PanelEditor(screenshot, geminiResult, 'full', null, null, panelAfterGlobalPos);
                await editor.init();
                window.queueEditor = editor;
            }, await getPanelEditorClassHandler(), displayImage, geminiResult, panelAfterGlobalPos);
            
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

    /**
     * Handler to detect important actions (modality_stacks) for a panel
     * @param {string} panelId - The panel ID
     */
    const detectImportantActionsForPanelHandler = async (panelId) => {
        // Check if already running
        const isAlreadyRunning = await tracker.queuePage.evaluate(() => {
            return typeof window.isDetectingImportantActions !== 'undefined' && window.isDetectingImportantActions === true;
        });
        
        if (isAlreadyRunning) {
            await tracker._broadcast({
                type: 'show_toast',
                message: '⚠️ Đang detect important actions, vui lòng đợi...'
            });
            return;
        }

        // Set flag and show loading modal
        await tracker.queuePage.evaluate(() => {
            window.isDetectingImportantActions = true;
        });
        
        await tracker._broadcast({
            type: 'show_loading',
            message: '🤖 Đang detect important actions...',
            isDetectingImportantActions: true // Flag để browser context biết đây là detect important actions
        });

        try {
            if (!panelId) {
                panelId = tracker.selectedPanelId;
            }
            
            if (!panelId) {
                console.error('No panel selected');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Vui lòng chọn panel trước!'
                });
                return;
            }

            const panelItem = await tracker.dataItemManager.getItem(panelId);
            if (!panelItem || panelItem.item_category !== 'PANEL') {
                console.error('Selected item is not a PANEL');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Item không phải PANEL!'
                });
                return;
            }

            // Get actions for the panel
            const parentEntry = await tracker.parentPanelManager.getPanelEntry(panelId);
            const actionIds = parentEntry?.child_actions || [];
            
            if (actionIds.length === 0) {
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Panel chưa có actions! Vui lòng detect actions trước.'
                });
                return;
            }

            console.log(`🎯 Detecting important actions for panel: ${panelItem.name} (${actionIds.length} actions)`);
            
            // Get panel image URL or base64
            let panelImageUrl = panelItem?.image_url || panelItem?.fullscreen_url || null;
            if (!panelImageUrl && panelItem?.image_base64) {
                panelImageUrl = await tracker.dataItemManager.loadBase64FromFile(panelItem.image_base64);
                console.log('📸 Using base64 image for modality_stacks detection');
            }
            
            if (!panelImageUrl) {
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Panel chưa có ảnh! Vui lòng draw panel trước.'
                });
                return;
            }

            // Get actions list for detectImportantActions
            const actionsForDetection = [];
            for (const actionId of actionIds) {
                const actionItem = await tracker.dataItemManager.getItem(actionId);
                if (actionItem) {
                    actionsForDetection.push({
                        item_id: actionId,
                        name: actionItem.name || 'Unknown Action'
                    });
                }
            }

            // Get modality_stacks from database
            const aiToolModalityStacks = await getAiToolModalityStacks(tracker.myAiToolCode);
            
            if (aiToolModalityStacks.length === 0) {
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Không tìm thấy modality_stacks trong database'
                });
                return;
            }

            // Import detectImportantActions
            const { detectImportantActions } = await import('./gemini-handler.js');
            
            // Log before calling detectImportantActions
            console.log('🔍 Calling detectImportantActions (handler) with:', {
                panelId: panelItem?.item_id,
                panelName: panelItem?.name,
                actionsCount: actionsForDetection.length,
                modalityStacksCount: aiToolModalityStacks.length,
                aiToolCode: tracker.myAiToolCode,
                panelImageUrlType: panelImageUrl?.startsWith('http') ? 'URL' : 'base64',
                panelImageUrlLength: panelImageUrl?.length || 0
            });
            
            // Log actions data for debugging
            actionsForDetection.forEach((action, idx) => {
                console.log(`📋 Action [${idx}]:`, {
                    item_id: action.item_id,
                    name: action.name,
                    nameLength: action.name?.length || 0,
                    hasSpecialChars: action.name ? /[^\x20-\x7E\u00A0-\uFFFF]/.test(action.name) : false
                });
            });
            
            // Call detectImportantActions
            const detectionResult = await detectImportantActions(
                tracker,
                panelImageUrl,
                actionsForDetection,
                aiToolModalityStacks
            );

            // Update actions with modality_stacks and reason
            let updatedCount = 0;
            let dbUpdatedCount = 0;
            const exporter = new MySQLExporter(tracker.sessionFolder, tracker.urlTracking, tracker.myAiToolCode);
            
            try {
                await exporter.init();
                
                for (const resultItem of detectionResult) {
                    const actionItem = await tracker.dataItemManager.getItem(resultItem.item_id);
                    if (actionItem) {
                        // Check if there are changes
                        const oldModalityStacks = JSON.stringify(actionItem.modality_stacks || []);
                        const newModalityStacks = JSON.stringify(resultItem.modality_stacks || []);
                        const oldReason = actionItem.modality_stacks_reason || null;
                        const newReason = resultItem.reason || null;
                        
                        const hasChanges = oldModalityStacks !== newModalityStacks || oldReason !== newReason;
                        
                        if (hasChanges) {
                            // Save modality_stacks and reason to action item (JSONL)
                            const updates = {
                                modality_stacks: resultItem.modality_stacks,
                                modality_stacks_reason: resultItem.reason || null
                            };
                            
                            await tracker.dataItemManager.updateItem(resultItem.item_id, updates);
                            
                            // Update database for this item
                            const dbUpdated = await exporter.updateItemModalityStacks(
                                resultItem.item_id,
                                resultItem.modality_stacks,
                                resultItem.reason || null
                            );
                            
                            if (dbUpdated) {
                                dbUpdatedCount++;
                            }
                            
                            if (resultItem.modality_stacks.length > 0) {
                                updatedCount++;
                            }
                        }
                    }
                }
            } finally {
                await exporter.close();
            }
            
            if (dbUpdatedCount > 0) {
                console.log(`✅ Updated ${dbUpdatedCount} items in database with modality_stacks`);
            }

            const actionsWithModalityStacks = detectionResult.filter(r => r.modality_stacks.length > 0).length;
            console.log(`✅ Detected modality_stacks: ${actionsWithModalityStacks}/${detectionResult.length} actions have modality_stacks`);
            
            // Refresh tree to show updated modality_stacks
            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });
            
            await tracker._broadcast({
                type: 'show_toast',
                message: `✅ Đã detect ${actionsWithModalityStacks} important actions`
            });
        } catch (err) {
            console.error('❌ Failed to detect important actions for panel:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: '❌ Lỗi khi detect important actions: ' + err.message
            });
        } finally {
            // Clear flag and hide loading modal
            await tracker.queuePage.evaluate(() => {
                window.isDetectingImportantActions = false;
            });
            
            await tracker._broadcast({
                type: 'hide_loading'
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
            console.log(`[RECORD] 📤 DOM Capture - checking for recording...`);

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

                // Show loading indicator (only in queue browser)
                await tracker._broadcast({ 
                    type: 'show_toast', 
                    message: '📸 Đang capture màn hình, vui lòng đợi...',
                    target: 'queue'
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
            console.log(`[RECORD] 📤 Gemini AI capture (SCROLLING) - checking for recording...`);

            const recordingResult = await tracker.stopPanelRecording();

            const timestamp = Date.now();
            let screenshot = null;
            let screenshotForGemini = null;

            if (tracker.selectedPanelId && tracker.dataItemManager) {
                const panelItem = await tracker.dataItemManager.getItem(tracker.selectedPanelId);

                // Show loading indicator (only in queue browser)
                await tracker._broadcast({ 
                    type: 'show_toast', 
                    message: '📸 Đang capture màn hình, vui lòng đợi...',
                    target: 'queue'
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

            // Show loading indicator (only in queue browser)
            await tracker._broadcast({ 
                type: 'show_toast', 
                message: '📸 Đang capture màn hình, vui lòng đợi...',
                target: 'queue'
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
                
                // Áp dụng giới hạn tối đa số trang
                if (numPages > MAX_CAPTURE_PAGES) {
                    console.log(`⚠️ Limiting pages from ${numPages} to ${MAX_CAPTURE_PAGES} pages (maxSections limit)`);
                    numPages = MAX_CAPTURE_PAGES;
                }

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
            console.log(`[RECORD] 📤 DOM Capture (SCROLLING) - checking for recording...`);

            const recordingResult = await tracker.stopPanelRecording();

            // Show loading indicator (only in queue browser)
            await tracker._broadcast({ 
                type: 'show_toast', 
                message: '📸 Đang capture màn hình, vui lòng đợi...',
                target: 'queue'
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
                console.log(`[RECORD] 🔄 Switching from recording ${tracker.recordingPanelId} to ${itemId}, cancelling current recording...`);
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
                // Read role from account.json to check if we should skip recording for VALIDATE role
                let accountRole = 'DRAW';
                try {
                    const { fileURLToPath } = await import('url');
                    const __filename = fileURLToPath(import.meta.url);
                    const projectRoot = path.dirname(path.dirname(path.dirname(__filename)));
                    const accountPath = path.join(projectRoot, 'account.json');
                    const accountContent = await fsp.readFile(accountPath, 'utf8');
                    const accountData = JSON.parse(accountContent);
                    accountRole = accountData.role || 'DRAW';
                } catch (err) {
                    console.log('⚠️ Could not read account.json for role check, using default: DRAW');
                }
                
                // Skip recording for VALIDATE role
                if (accountRole === 'VALIDATE') {
                    console.log(`[RECORD] ⏸️  Skipping recording for VALIDATE role`);
                } else {
                    const { ENV } = await import('../config/env.js');
                    const enable = ENV.RECORD_PANEL === 'true' || ENV.RECORD_PANEL === true;
                    console.log(`[RECORD] 🔍 Checking if should start recording for ACTION ${itemId}:`);
                    console.log(`[RECORD]    Status: ${item.status}`);
                    console.log(`[RECORD]    Has session_url: ${!!item.metadata?.session_url}`);
                    console.log(`[RECORD]    RECORD_PANEL enabled: ${enable}`);
                    
                    if (enable) {
                        console.log(`[RECORD] ▶️  Starting recording for ACTION: ${itemId}`);
                        await tracker.startPanelRecording(itemId);
                        await tracker._broadcast({
                            type: 'show_toast',
                            message: '🎬 Recording...'
                        });
                    } else {
                        console.log(`[RECORD] ⏸️  Recording disabled, skipping start`);
                    }
                }
            } else {
                console.log(`[RECORD] ⏭️  Not starting recording for item ${itemId}:`);
                console.log(`[RECORD]    Category: ${item.item_category}`);
                console.log(`[RECORD]    Status: ${item.status}`);
                console.log(`[RECORD]    Has session_url: ${!!item.metadata?.session_url}`);
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
                    image_base64: null,
                    image_url: item.image_url || null
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
                                // Check if action already has image in doing_item.jsonl
                                if (item.image_base64) {
                                    // Load existing image from doing_item.jsonl
                                    const existingImageBase64 = await tracker.dataItemManager.loadBase64FromFile(item.image_base64);
                                    if (existingImageBase64) {
                                        actionInfo.image_base64 = existingImageBase64;
                                        console.log(`✅ Loaded existing action image from doing_item.jsonl for action ${itemId}`);
                                    } else {
                                        // File not found, need to crop new image
                                        const actionImage = await cropBase64Image(panelImageBase64, item.metadata.global_pos);
                                        actionInfo.image_base64 = actionImage;
                                        
                                        const newImageHash = await calculateHash(actionImage);
                                        await tracker.dataItemManager.updateItem(itemId, {
                                            image_base64: actionImage,
                                            metadata: {
                                                ...item.metadata,
                                                image_hash: newImageHash
                                            }
                                        });
                                        console.log(`✅ Cropped and saved new action image for action ${itemId} (file was missing)`);
                                    }
                                } else {
                                    // Action doesn't have image, crop and save it
                                    const actionImage = await cropBase64Image(panelImageBase64, item.metadata.global_pos);
                                    actionInfo.image_base64 = actionImage;
                                    
                                    const newImageHash = await calculateHash(actionImage);
                                    await tracker.dataItemManager.updateItem(itemId, {
                                        image_base64: actionImage,
                                        metadata: {
                                            ...item.metadata,
                                            image_hash: newImageHash
                                        }
                                    });
                                    console.log(`✅ Cropped and saved new action image for action ${itemId}`);
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Failed to get action image from panel:', err);
                    }
                }

                const step = await tracker.stepManager.getStepForAction(itemId);
                if (step) {
                    const panelBeforeItem = await tracker.dataItemManager.getItem(step.panel_before?.item_id);
                    const panelAfterId = step.panel_after?.item_id;
                    const panelAfterItem = panelAfterId
                        ? await tracker.dataItemManager.getItem(panelAfterId)
                        : null;

                    const mode = !panelAfterId
                        ? 'MARK_AS_DONE'
                        : step.panel_before?.item_id === panelAfterId
                            ? 'USE_BEFORE'
                            : 'DRAW_NEW';

                    actionInfo.step_info = {
                        mode: mode,
                        panel_before_name: panelBeforeItem?.name || 'Unknown',
                        panel_after_name: panelAfterItem?.name || 'None'
                    };
                    
                    // Add purpose and reason from step (step_purpose) and item (action_purpose)
                    actionInfo.step_purpose = step.purpose || null;
                    actionInfo.step_reason = step.reason || null;
                }
                
                // Add purpose and reason from the action item itself
                // Note: item.purpose stores action_purpose (from Gemini detection)
                actionInfo.purpose = item.purpose || null;
                actionInfo.action_purpose = item.purpose || null;  // UI expects action_purpose
                actionInfo.reason = item.reason || null;
                
                // Add modality_stacks and modality_stacks_info
                actionInfo.modality_stacks = item.modality_stacks || null;
                actionInfo.modality_stacks_reason = item.modality_stacks_reason || null;
                
                // Load modality_stacks_info (detailed info) if modality_stacks exist
                if (item.modality_stacks && Array.isArray(item.modality_stacks) && item.modality_stacks.length > 0) {
                    try {
                        const aiToolModalityStacks = await getAiToolModalityStacks(tracker.myAiToolCode);
                        const modalityStacksMap = new Map();
                        aiToolModalityStacks.forEach(ms => {
                            modalityStacksMap.set(ms.code, ms);
                        });
                        
                        actionInfo.modality_stacks_info = item.modality_stacks
                            .map(code => modalityStacksMap.get(code))
                            .filter(Boolean);
                    } catch (err) {
                        console.error('Failed to load modality_stacks_info:', err);
                        actionInfo.modality_stacks_info = [];
                    }
                } else {
                    actionInfo.modality_stacks_info = [];
                }
            }

            // Get draw_flow_state for panels
            let drawFlowState = null;
            if (item.item_category === 'PANEL') {
                drawFlowState = await getPanelDrawFlowState(itemId);
            }

            // For PANEL: fullscreen_url and coordinate (crop) for ADMIN/VALIDATE panel info view
            const panelFullscreenUrl = item.item_category === 'PANEL' ? (item.fullscreen_url || null) : null;
            const panelCoordinate = item.item_category === 'PANEL' ? (item.coordinate || item.metadata?.global_pos || null) : null;

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
                image_url: item.image_url || null,
                timestamp: Date.now()
            };

            let updatedEvent;
            if (item.item_category === 'PANEL' && item.metadata?.global_pos) {
                updatedEvent = {
                    ...baseEvent,
                    actions: actions,
                    action_list: actionList,
                    action_count: actions.length,
                    metadata: item.metadata,
                    fullscreen_url: panelFullscreenUrl,
                    coordinate: panelCoordinate
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
                    action_count: actions.length,
                    fullscreen_url: panelFullscreenUrl,
                    coordinate: panelCoordinate
                };
            }

            await tracker._broadcast(updatedEvent);

            // Scenario A (Save trong SELECT PANEL) ghi validation ở useSelectPanelHandler, không ở đây.
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

    const getPanelTreeHandler = async (mode = 'log') => {
        try {
            if (!tracker.panelLogManager) return [];
            if (mode === 'tree') {
                return await tracker.panelLogManager.buildTreeStructureWithChildPanels();
            }
            if (mode === 'validation') {
                return await tracker.panelLogManager.buildValidationTreeStructure();
            }
            return await tracker.panelLogManager.buildTreeStructure();
        } catch (err) {
            console.error('Failed to get panel tree:', err);
            return [];
        }
    };

    /**
     * Increment view_count when role=VALIDATE clicks an action on panel log main.
     * 1. Update uigraph_validation.jsonl field view_count = view_count + 1
     * 2. From item_id -> generateCode -> item_code
     * 3. Update uigraph_validation.view_count = view_count + 1 by item_code
     * 4. Upsert uigraph_validation_viewitem (my_snapshot=item_code, my_collaborator=collaborator_code), view_count += 1
     */
    const incrementValidationViewCountHandler = async (actionItemId) => {
        try {
            if (!actionItemId || !tracker.sessionFolder) return;

            const accountRes = await getAccountInfoHandler();
            const accountData = accountRes?.data || accountRes;
            const role = accountData?.role || 'DRAW';
            if (role !== 'VALIDATE') {
                return;
            }
            const collaboratorCode = accountData?.collaborator_code || null;
            if (!collaboratorCode) {
                console.warn('[VIEW_COUNT] No collaborator_code in account, skip viewitem upsert');
            }

            // 1. Update uigraph_validation.jsonl view_count
            if (tracker.validationManager) {
                await tracker.validationManager.incrementViewCount(actionItemId);
            } else {
                const validationPath = path.join(tracker.sessionFolder, 'uigraph_validation.jsonl');
                try {
                    const content = await fsp.readFile(validationPath, 'utf8');
                    const lines = content.trim().split('\n').filter(line => line.trim());
                    let updated = false;
                    for (let i = 0; i < lines.length; i++) {
                        const entry = JSON.parse(lines[i]);
                        if (entry.item_id === actionItemId) {
                            entry.view_count = (entry.view_count ?? 0) + 1;
                            lines[i] = JSON.stringify(entry);
                            updated = true;
                            break;
                        }
                    }
                    if (updated) {
                        await fsp.writeFile(validationPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
                    }
                } catch (err) {
                    if (err.code !== 'ENOENT') console.error('[VIEW_COUNT] Failed to update jsonl:', err);
                }
            }

            // 2. item_id -> item_code via generateCode (need action item + panel name)
            const item = await tracker.dataItemManager?.getItem(actionItemId);
            if (!item || item.item_category !== 'ACTION') return;

            let panelName = null;
            const parentPanelId = await getParentPanelOfActionHandler(actionItemId);
            if (parentPanelId) {
                const parentPanelItem = await tracker.dataItemManager.getItem(parentPanelId);
                if (parentPanelItem) panelName = parentPanelItem.name || null;
            }

            const myAiToolCode = tracker.myAiToolCode;
            if (!myAiToolCode) {
                console.warn('[VIEW_COUNT] No myAiToolCode, skip DB update');
                await broadcastValidationTreeUpdate();
                return;
            }

            const exporter = new MySQLExporter(tracker.sessionFolder, tracker.urlTracking, myAiToolCode);
            await exporter.init();
            const itemCode = exporter.generateCode(item.item_category, item.name, panelName);
            const conn = exporter.connection;

            // 3. Update uigraph_validation.view_count by item_code
            await conn.execute(
                `UPDATE uigraph_validation SET view_count = view_count + 1 WHERE my_snapshot = ? AND my_ai_tool = ?`,
                [itemCode, myAiToolCode]
            );

            // 4. Upsert uigraph_validation_viewitem (with updated_at for sorting by most recent)
            if (collaboratorCode) {
                await conn.execute(
                    `INSERT INTO uigraph_validation_viewitem (my_snapshot, my_collaborator, view_count, updated_at)
                     VALUES (?, ?, 1, NOW())
                     ON DUPLICATE KEY UPDATE view_count = view_count + 1, updated_at = NOW()`,
                    [itemCode, collaboratorCode]
                ).catch(() => {
                    // Fallback if updated_at column doesn't exist
                    return conn.execute(
                        `INSERT INTO uigraph_validation_viewitem (my_snapshot, my_collaborator, view_count)
                         VALUES (?, ?, 1)
                         ON DUPLICATE KEY UPDATE view_count = view_count + 1`,
                        [itemCode, collaboratorCode]
                    );
                });
            }

            await exporter.close();
            await broadcastValidationTreeUpdate();
        } catch (err) {
            console.error('[VIEW_COUNT] incrementValidationViewCount failed:', err);
        }

        async function broadcastValidationTreeUpdate() {
            try {
                if (tracker.panelLogManager) {
                    const data = await tracker.panelLogManager.buildValidationTreeStructure();
                    await tracker._broadcast({ type: 'tree_update', data });
                }
            } catch (e) {
                console.warn('[VIEW_COUNT] broadcast tree_update failed:', e);
            }
        }
    };

    /**
     * Get list of viewers for an action (from uigraph_validation_viewitem).
     * Returns [{ collaborator_code, collaborator_name, view_count, updated_at }] sorted by updated_at DESC.
     */
    const getValidationViewersHandler = async (actionItemId) => {
        try {
            if (!actionItemId || !tracker.sessionFolder) return [];
            const accountRes = await getAccountInfoHandler();
            const accountData = accountRes?.data || accountRes;
            if ((accountData?.role || '') !== 'ADMIN') return [];

            const item = await tracker.dataItemManager?.getItem(actionItemId);
            if (!item || item.item_category !== 'ACTION') return [];

            let panelName = null;
            const parentPanelId = await getParentPanelOfActionHandler(actionItemId);
            if (parentPanelId) {
                const parentPanelItem = await tracker.dataItemManager.getItem(parentPanelId);
                if (parentPanelItem) panelName = parentPanelItem.name || null;
            }

            const myAiToolCode = tracker.myAiToolCode;
            if (!myAiToolCode) return [];

            const { MySQLExporter } = await import('../data/mysql-exporter.js');
            const exporter = new MySQLExporter(tracker.sessionFolder, tracker.urlTracking, myAiToolCode);
            await exporter.init();
            const itemCode = exporter.generateCode(item.item_category, item.name, panelName);
            const conn = exporter.connection;

            // Query viewitem, join collaborator for name. Sort by updated_at DESC (most recent first).
            // Note: uigraph_validation_viewitem should have updated_at column for time-based sorting.
            let rows = [];
            try {
                const [result] = await conn.execute(
                    `SELECT v.my_collaborator as collaborator_code, v.view_count, v.updated_at, ifnull(c.name, 'Other') as collaborator_name
                    FROM uigraph_validation_viewitem v
                    LEFT JOIN uigraph_collaborator c ON c.code = v.my_collaborator AND c.published = 1
                    WHERE v.my_snapshot = ?
                    ORDER BY v.updated_at DESC`,
                    [itemCode]
                );
                rows = result || [];
            } catch (queryErr) {
                console.error('[getValidationViewers] query failed:', queryErr);
                rows = [];
            }

            await exporter.close();

            const viewers = Array.isArray(rows) ? rows : [];
            return viewers.map(r => ({
                collaborator_code: r.collaborator_code,
                collaborator_name: r.collaborator_name || r.collaborator_code || '—',
                view_count: r.view_count ?? 0,
                updated_at: r.updated_at ? (r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)) : null
            }));
        } catch (err) {
            console.error('[getValidationViewers] failed:', err);
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

            // Chỉ xóa panel_after khi step có panel_after (không phải case Mark as Done)
            const panelAfterId = step?.panel_after?.item_id;
            const panelBeforeId = step?.panel_before?.item_id;
            if (step && panelAfterId && panelBeforeId !== panelAfterId) {
                // Check if panel_after is used in other steps
                const panelUsageCount = await tracker.stepManager.countPanelUsageInSteps(panelAfterId);
                
                // Only delete panel_after if it appears exactly once (only in this step)
                // Xóa panel_after và child_actions, nhưng không xóa child_panels (reparent chúng lên parent của panel_after)
                if (panelUsageCount === 1) {
                    const panelEntry = await tracker.parentPanelManager.getPanelEntry(panelAfterId);
                    const childPanelIds = panelEntry?.child_panels || [];
                    const childActionIds = [...(panelEntry?.child_actions || [])];
                    for (const page of panelEntry?.child_pages || []) {
                        if (page.child_actions?.length) childActionIds.push(...page.child_actions);
                    }
                    const allItemsToDelete = [panelAfterId, ...childActionIds];

                    if (childPanelIds.length > 0) {
                        const parentEntry = await tracker.parentPanelManager.findMyParent(panelAfterId);
                        if (parentEntry) {
                            const grandparentId = parentEntry.parent_panel;
                            for (const childPanelId of childPanelIds) {
                                await tracker.parentPanelManager.addChildPanel(grandparentId, childPanelId);
                            }
                            console.log(`[RESET ACTION] Reparent ${childPanelIds.length} child_panels từ panel_after ${panelAfterId} lên parent ${grandparentId}`);
                        }
                    }

                    console.log(`🗑️ Deleting panel_after ${panelAfterId} and ${childActionIds.length} child_actions (giữ lại ${childPanelIds.length} child_panels)`);

                    for (const itemId of allItemsToDelete) {
                        await tracker.dataItemManager.deleteItem(itemId);
                    }

                    await tracker.parentPanelManager.deletePanelEntry(panelAfterId);

                    await tracker.stepManager.deleteStepsForItems(allItemsToDelete);

                    if (tracker.clickManager) {
                        await tracker.clickManager.deleteClicksForActions(childActionIds);
                    }
                    if (tracker.validationManager) {
                        for (const actionId of childActionIds) {
                            try { await tracker.validationManager.removeValidation(actionId); } catch (_) { }
                        }
                    }

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
                } else {
                    console.log(`⚠️ Skipping deletion of panel ${panelAfterId} (used ${panelUsageCount} times in steps)`);
                }
            } else if (step && !panelAfterId) {
                console.log(`🔄 Reset action (Mark as Done case - no panel_after to delete)`);
            }

            await tracker.stepManager.deleteStepsForAction(actionItemId);

            // Xóa validation khi reset action
            if (tracker.validationManager) {
                try {
                    await tracker.validationManager.removeValidation(actionItemId);
                } catch (validationErr) {
                    console.error('Failed to remove validation in resetActionStepHandler:', validationErr);
                    // Don't throw - allow operation to continue
                }
            }

            const actionItem = await tracker.dataItemManager.getItem(actionItemId);
            await tracker.dataItemManager.updateItem(actionItemId, { 
                status: 'pending',
                metadata: {
                    ...(actionItem?.metadata || {}),
                    session_url: null,
                    session_start: null,
                    session_end: null,                                        
                    step_video_url: null,
                    step_video_subtitles: null,
                    tracking_video_url: null
                }
            });

            const actionParentPanelId = await getParentPanelOfActionHandler(actionItemId);
            if (actionParentPanelId) {
                await checkAndUpdatePanelStatusHandler(actionParentPanelId);
            }

            await tracker._broadcast({
                type: 'tree_update',
                data: await tracker.panelLogManager.buildTreeStructure()
            });

            // Clear lastLoadedPanelId so re-selecting this action will trigger full reload
            // This ensures tracking browser recording can restart after reset
            if (tracker.selectedPanelId === actionItemId) {
                lastLoadedPanelId = null;
                await selectPanelHandler(actionItemId);
            }

            console.log(`🔄 Reset step for action ${actionItemId}`);
            
            // Check for changes after resetting step
            scheduleChangeCheck();
        } catch (err) {
            console.error('Failed to reset action step:', err);
        }
    };

    /**
     * Detect action purpose using Gemini AI
     * Builds doing_step_info and calls Gemini to detect purpose
     * @param {string} actionItemId - The action item ID to detect purpose for
     * @returns {Promise<object|null>} - Detection result or null on error
     */
    const detectActionPurposeHandler = async (actionItemId) => {
        try {
            if (!tracker.stepManager || !tracker.dataItemManager) {
                console.error('Managers not initialized for detectActionPurpose');
                return null;
            }

            // Get step for action
            const step = await tracker.stepManager.getStepForAction(actionItemId);
            if (!step) {
                console.warn(`⚠️ No step found for action ${actionItemId}`);
                return null;
            }

            // Get items for panel_before, action, panel_after (panel_after có thể null khi Mark as Done)
            const panelBeforeItem = await tracker.dataItemManager.getItem(step.panel_before.item_id);
            const actionItem = await tracker.dataItemManager.getItem(actionItemId);
            const panelAfterItem = step.panel_after?.item_id
                ? await tracker.dataItemManager.getItem(step.panel_after.item_id)
                : null;

            if (!panelBeforeItem || !actionItem) {
                console.warn('⚠️ Missing panel_before or action for detectActionPurpose');
                return null;
            }

            // Resolve action image: image_url (sau khi upload) hoặc từ image_base64 (file trong session)
            let actionImageUrl = actionItem.image_url || null;
            if (!actionImageUrl && actionItem.image_base64) {
                try {
                    const actionBase64 = await tracker.dataItemManager.loadBase64FromFile(actionItem.image_base64);
                    if (actionBase64) {
                        actionImageUrl = `data:image/png;base64,${actionBase64}`;
                    }
                } catch (err) {
                    console.warn('⚠️ Failed to load action image from image_base64:', err?.message);
                }
            }

            // Show toast notification
            await tracker._broadcast({
                type: 'show_toast',
                message: '🤖 Đang detect action purpose...',
                target: 'queue'
            });

            // Build doing_step_info (panel_after có thể null)
            const doingStepInfo = {
                ai_tool_name: tracker.myAiToolCode || 'Unknown',
                ai_tool_website: tracker.urlTracking || '',
                panel_before_name: panelBeforeItem.name || 'Unknown Panel',
                panel_before_fullscreen: panelBeforeItem.fullscreen_url || '',
                action_name: actionItem.name || 'Unknown Action',
                action_url: actionImageUrl || '',
                action_type: actionItem.type || 'button',
                action_verb: actionItem.verb || 'click',
                panel_after_name: panelAfterItem?.name || 'None',
                panel_after_fullscreen: panelAfterItem?.fullscreen_url || ''
            };

            // Collect image URLs in fixed order so Gemini knows: [panel_before, action, panel_after]
            // action có thể là URL http hoặc data URL (từ image_base64)
            const imageUrls = [
                panelBeforeItem.fullscreen_url || null,
                actionImageUrl || null,
                panelAfterItem?.fullscreen_url || null
            ];

            console.log('🎯 Calling detectActionPurpose with:', {
                doingStepInfo,
                imageUrlsCount: imageUrls.length
            });

            // Call Gemini to detect action purpose
            const { detectActionPurpose } = await import('./gemini-handler.js');
            const result = await detectActionPurpose(doingStepInfo, imageUrls);

            if (!result) {
                console.warn('⚠️ detectActionPurpose returned null');
                await tracker._broadcast({
                    type: 'show_toast',
                    message: '⚠️ Không thể detect action purpose'
                });
                return null;
            }

            // Save results to doing_step.jsonl
            await tracker.stepManager.updateStep(actionItemId, {
                purpose: result.step_purpose || null,
                reason: result.reason || null
            });

            // Save results to doing_item.jsonl (for the action)
            await tracker.dataItemManager.updateItem(actionItemId, {
                purpose: result.action_purpose || null,
                reason: result.reason || null
            });

            console.log(`✅ Saved action purpose for ${actionItemId}:`, result);

            await tracker._broadcast({
                type: 'show_toast',
                message: '✅ Đã detect action purpose'
            });

            // Refresh the view
            if (tracker.selectedPanelId === actionItemId) {
                await selectPanelHandler(actionItemId);
            }

            // Ensure Save button reflects updated purpose changes
            scheduleChangeCheck();

            return result;
        } catch (err) {
            console.error('detectActionPurpose failed:', err);
            await tracker._broadcast({
                type: 'show_toast',
                message: '❌ Lỗi khi detect action purpose'
            });
            return null;
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

            const aiResult = await askGeminiForActionRename(croppedImage, actionMetadata, tracker);

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
            if (!actionItemId || !tracker.clickManager) {
                console.log(`[CLICK] ⏭️  getClickEventsForPanel: invalid actionItemId or clickManager not initialized`);
                return [];
            }

            console.log(`[CLICK] 🔍 getClickEventsForPanel called for action ${actionItemId}`);
            const clicks = await tracker.clickManager.getClicksForAction(actionItemId);
            console.log(`[CLICK] 📤 Returning ${clicks.length} click events`);
            
            return clicks.map(c => ({
                timestamp: c.timestamp,
                click_x: c.pos.x,
                click_y: c.pos.y,
                element_name: c.element_name,
                element_tag: c.element_tag,
                url: c.from_url
            }));
        } catch (err) {
            console.error(`[CLICK] ❌ Failed to get click events for action ${actionItemId}:`, err);
            console.error(`[CLICK]    Error details:`, err.message, err.stack);
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

            console.log(`[RECORD] 📤 USE_BEFORE handler - checking for recording...`);
            const recordingInfo = await tracker.stopPanelRecording();

            if (recordingInfo && recordingInfo.panelId) {
                console.log(`[RECORD] 📹 Recording found, preparing upload:`);
                console.log(`[RECORD]    Panel ID: ${recordingInfo.panelId}`);
                console.log(`[RECORD]    Action ID: ${actionItemId}`);
                console.log(`[RECORD]    Video path: ${recordingInfo.videoPath}`);
                console.log(`[RECORD]    Session: ${new Date(recordingInfo.sessionStart).toISOString()} → ${new Date(recordingInfo.sessionEnd).toISOString()}`);
                
                const { uploadVideoAndGetUrl } = await import('../media/uploader.js');
                const { ENV } = await import('../config/env.js');
                
                try {
                    console.log(`[RECORD] ⬆️  Starting upload...`);
                    console.log(`[RECORD]    Video code: ${recordingInfo.panelId}`);
                    console.log(`[RECORD]    Upload endpoint: https://upload.clevai.edu.vn/admin/video`);
                    
                    const videoUrl = await uploadVideoAndGetUrl(
                        recordingInfo.videoPath,
                        recordingInfo.panelId,
                        ENV.API_TOKEN
                    );

                    if (videoUrl) {
                        console.log(`[RECORD] ✅ Upload successful!`);
                        console.log(`[RECORD]    Video URL: ${videoUrl}`);
                        console.log(`[RECORD] 💾 Saving metadata to action: ${actionItemId}`);
                        
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
                            console.log(`[RECORD] ✅ Metadata saved successfully`);
                            await tracker._broadcast({ type: 'show_toast', message: '✅ Video saved' });
                        } else {
                            console.warn(`[RECORD] ⚠️  Action item not found: ${actionItemId}`);
                        }
                    } else {
                        console.error(`[RECORD] ❌ Video upload failed - no URL returned for USE_BEFORE action`);
                    }
                } catch (uploadErr) {
                    console.error(`[RECORD] ❌ Video upload failed for USE_BEFORE action:`, uploadErr);
                    console.error(`[RECORD]    Error details:`, uploadErr.message, uploadErr.stack);
                }
            } else {
                console.log(`[RECORD] ⏭️  No recording info to upload for USE_BEFORE`);
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
            
            // Auto-call detectActionPurpose after use current panel (wrapped in try-catch to not break main flow)
            try {
                await detectActionPurposeHandler(actionItemId);
            } catch (purposeErr) {
                console.error('⚠️ Auto detectActionPurpose failed (non-blocking):', purposeErr);
            }
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

                // Scenario A: Ghi validation khi role=DRAW bấm Save trong màn hình SELECT PANEL
                try {
                    let accountRole = 'DRAW';
                    try {
                        const { fileURLToPath } = await import('url');
                        const __filename = fileURLToPath(import.meta.url);
                        const projectRoot = path.dirname(path.dirname(path.dirname(__filename)));
                        const accountPath = path.join(projectRoot, 'account.json');
                        const accountContent = await fsp.readFile(accountPath, 'utf8');
                        const accountData = JSON.parse(accountContent);
                        accountRole = accountData.role || 'DRAW';
                    } catch (err) {
                        console.log('⚠️ Could not read account.json for role check, using default: DRAW');
                    }
                    if (accountRole === 'DRAW' && tracker.validationManager) {
                        const createdAt = Date.now();
                        await tracker.validationManager.addValidation(actionItemId, createdAt);
                        console.log(`✅ Added validation for action ${actionItemId} (Scenario A: Save in SELECT PANEL)`);
                    }
                } catch (validationErr) {
                    console.error('Failed to add validation in useSelectPanelHandler:', validationErr);
                }

                await selectPanelHandler(actionItemId);
            } else {
                console.error('❌ Failed to verify action status update');
                await tracker._broadcast({ type: 'show_toast', message: '❌ Failed to mark as done' });
            }

            console.log(`✅ Use SELECT PANEL: ${actionItemId} marked done with panel ${selectedPanelId}`);
            
            // Check for changes after using select panel
            scheduleChangeCheck();
            
            // Auto-call detectActionPurpose after select panel (wrapped in try-catch to not break main flow)
            try {
                await detectActionPurposeHandler(actionItemId);
            } catch (purposeErr) {
                console.error('⚠️ Auto detectActionPurpose failed (non-blocking):', purposeErr);
            }
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

    // Helper function to load image from URL and convert to base64
    const loadImageFromUrl = async (url) => {
        if (!url) return null;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error(`Failed to fetch image from URL: ${url}, status: ${response.status}`);
                return null;
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return buffer.toString('base64');
        } catch (err) {
            console.error(`Error loading image from URL ${url}:`, err.message);
            return null;
        }
    };

    // Helper function to load panel image with fallback logic
    const loadPanelImage = async (item) => {
        if (!item) return null;
        
        // Try fullscreen_base64 first
        if (item.fullscreen_base64) {
            const imageBase64 = await tracker.dataItemManager.loadBase64FromFile(item.fullscreen_base64);
            if (imageBase64) return imageBase64;
        }
        
        // Try fullscreen_url if fullscreen_base64 is not available
        if (item.fullscreen_url) {
            const imageBase64 = await loadImageFromUrl(item.fullscreen_url);
            if (imageBase64) return imageBase64;
        }
        
        // Fallback to image_base64
        if (item.image_base64) {
            return await tracker.dataItemManager.loadBase64FromFile(item.image_base64);
        }
        
        return null;
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

            return await loadPanelImage(panelItem);
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
            // Check if completion dialog is visible - don't show tracking browser if it is
            if (tracker.queuePage) {
                const isCompletionDialogVisible = await tracker.queuePage.evaluate(() => {
                    const completionModal = document.getElementById('panelCompletionConfirmationModal');
                    return completionModal && completionModal.style.display === 'flex';
                });
                
                if (isCompletionDialogVisible) {
                    console.log('⚠️ Completion dialog is visible, skipping showTrackingBrowser');
                    return;
                }
            }
            
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

    // Graph View Handlers
    const loadGraphData = async () => {
        const doingItemPath = path.join(tracker.sessionFolder, 'doing_item.jsonl');
        const myparentPanelPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
        const doingStepPath = path.join(tracker.sessionFolder, 'doing_step.jsonl');

        let items = [];
        let parentPanels = [];
        let steps = [];

        try {
            const itemContent = await fsp.readFile(doingItemPath, 'utf8');
            items = itemContent.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } catch (err) {
            console.warn('Could not read doing_item.jsonl:', err.message);
        }

        try {
            const parentContent = await fsp.readFile(myparentPanelPath, 'utf8');
            parentPanels = parentContent.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } catch (err) {
            console.warn('Could not read myparent_panel.jsonl:', err.message);
        }

        try {
            const stepContent = await fsp.readFile(doingStepPath, 'utf8');
            steps = stepContent.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } catch (err) {
            console.warn('Could not read doing_step.jsonl:', err.message);
        }

        return { items, parentPanels, steps };
    };

    const getEdgeStatus = (actionId, stepMap, actionMap) => {
        const step = stepMap.get(actionId);
        const actionItem = actionMap.get(actionId);

        // Check if step exists and has panel_after with item_id
        if (step) {
            // Check if panel_after exists and has item_id
            if (step.panel_after && step.panel_after.item_id) {
                return 'normal';
            }
            // Step exists but panel_after is null/undefined or doesn't have item_id
            return 'in_progress';
        }

        // No step, check if action is marked as completed
        if (!step && actionItem && actionItem.status === 'completed') {
            return 'done';
        }

        // No step and not completed
        return 'pending';
    };

    const buildGraphStructure = async () => {
        const { items, parentPanels, steps } = await loadGraphData();

        // Create maps for quick lookup
        const itemMap = new Map();
        items.forEach(item => {
            itemMap.set(item.item_id, item);
        });

        const stepMap = new Map();
        steps.forEach(step => {
            if (step.action?.item_id) {
                stepMap.set(step.action.item_id, step);
            }
        });

        // Build nodes (panels only)
        const nodes = [];
        const panelIds = new Set();
        items.forEach(item => {
            if (item.item_category === 'PANEL') {
                panelIds.add(item.item_id);
                const isIncomplete = item.metadata?.draw_flow_state !== null && 
                                    item.metadata?.draw_flow_state !== undefined && 
                                    item.metadata?.draw_flow_state !== 'completed';
                const color = isIncomplete ? '#ff9800' : '#4caf50';
                
                // Build label with draw_flow_state suffix
                let label = item.name || 'Panel';
                const drawFlowState = item.metadata?.draw_flow_state;
                if (drawFlowState === null || drawFlowState === undefined) {
                    label = `${label} [Chưa làm]`;
                } else if (drawFlowState === 'edit_actions') {
                    label = `${label} [Đang làm]`;
                }
                
                nodes.push({
                    id: item.item_id,
                    label: label,
                    color: color,
                    shape: 'box',
                    font: { color: '#fff', size: 14 },
                    data: { item }
                });
            }
        });

        // Track virtual nodes created for each action (to avoid duplicates)
        const virtualNodesCreated = new Set();

        // Build edges (actions)
        const edges = [];
        parentPanels.forEach(parent => {
            const panelBeforeId = parent.parent_panel;
            const childActions = parent.child_actions || [];

            // Handle child_actions in child_pages
            if (parent.child_pages) {
                parent.child_pages.forEach(page => {
                    if (page.child_actions) {
                        childActions.push(...page.child_actions);
                    }
                });
            }

            childActions.forEach(actionId => {
                const actionItem = itemMap.get(actionId);
                if (!actionItem) return;

                const step = stepMap.get(actionId);
                const status = getEdgeStatus(actionId, stepMap, itemMap);
                
                // Check if action has modality_stacks (important action)
                const hasModalityStacks = actionItem.modality_stacks && 
                                         Array.isArray(actionItem.modality_stacks) && 
                                         actionItem.modality_stacks.length > 0;
                
                // Debug logging
                if (status === 'in_progress') {
                    console.log(`[Graph] Action ${actionId} (${actionItem.name}) has step but no panel_after - status: in_progress`);
                }
                
                let edge = {
                    id: `edge_${panelBeforeId}_${actionId}`,
                    from: panelBeforeId,
                    label: hasModalityStacks ? '⭐' : '', // Show star icon for important actions
                    data: { actionId, actionItem, step, hasModalityStacks }
                };

                if (status === 'normal' && step?.panel_after?.item_id) {
                    const panelAfterId = step.panel_after.item_id;
                    edge.to = panelAfterId;
                    edge.color = { color: '#00aaff' };
                    edge.dashes = false;
                } else {
                    // Create individual virtual node for each action
                    const actionName = actionItem.name || 'Unnamed Action';
                    let virtualNodeId, virtualNodeLabel, virtualNodeColor, virtualNodeBorderColor, statusLabel;
                    
                    if (status === 'in_progress') {
                        // Dangling edge - đang làm
                        virtualNodeId = `virtual_${actionId}_in_progress`;
                        statusLabel = 'Đang làm';
                        virtualNodeColor = '#ffc107';
                        virtualNodeBorderColor = '#ffc107';
                        edge.color = { color: '#ffc107' };
                        edge.dashes = true;
                    } else if (status === 'done') {
                        // Dangling edge - đã mark done
                        virtualNodeId = `virtual_${actionId}_done`;
                        statusLabel = 'Done';
                        virtualNodeColor = '#00aaff';
                        virtualNodeBorderColor = '#00aaff';
                        edge.color = { color: '#00aaff' };
                        edge.dashes = false;
                    } else {
                        // Dangling edge - chưa làm
                        virtualNodeId = `virtual_${actionId}_pending`;
                        statusLabel = 'Chưa làm';
                        virtualNodeColor = '#999999';
                        virtualNodeBorderColor = '#999999';
                        edge.color = { color: '#999999' };
                        edge.dashes = true;
                    }
                    
                    edge.to = virtualNodeId;
                    
                    // Create virtual node if not already created
                    if (!virtualNodesCreated.has(virtualNodeId)) {
                        // Add star icon for important actions
                        const actionLabel = hasModalityStacks 
                            ? `⭐ [${actionName}] [${statusLabel}]`
                            : `[${actionName}] [${statusLabel}]`;
                        
                        // Highlight important actions with yellow border
                        const finalBorderColor = hasModalityStacks ? '#ffc107' : virtualNodeBorderColor;
                        const finalBorderWidth = hasModalityStacks ? 3 : 2;
                        
                        nodes.push({
                            id: virtualNodeId,
                            label: actionLabel,
                            color: virtualNodeColor,
                            shape: 'box',
                            font: { color: '#fff', size: 14 },
                            borderWidth: finalBorderWidth,
                            borderColor: finalBorderColor,
                            data: { isVirtual: true, type: status, actionId, actionItem, hasModalityStacks, modality_stacks: actionItem.modality_stacks }
                        });
                        virtualNodesCreated.add(virtualNodeId);
                        // console.log(`[Graph] Created virtual node ${virtualNodeId} for action ${actionId} (${actionName}) with status ${status}`);
                    }
                }

                edges.push(edge);
            });
        });
        
        // console.log(`[Graph] Total nodes: ${nodes.length}, Total edges: ${edges.length}`);

        return { nodes, edges, itemMap, stepMap };
    };

    // Note: drawCropBorder will be called in browser context via evaluate

    const viewGraphHandler = async () => {
        try {
            // Load panel tree data - default to log mode
            // User can toggle mode via showMode button in browser
            let panelTreeData = [];
            if (tracker.panelLogManager) {
                panelTreeData = await tracker.panelLogManager.buildTreeStructure();
            }
            
            // Load data in Node.js context
            const { nodes, edges, itemMap, stepMap } = await buildGraphStructure();
            
            // Load steps data for backward tracing
            const graphData = await loadGraphData();
            const stepsData = (graphData.steps || []).map(step => ({
                step_id: step.step_id,
                panel_before: step.panel_before ? { item_id: step.panel_before.item_id } : null,
                action: step.action ? { item_id: step.action.item_id } : null,
                panel_after: step.panel_after ? { item_id: step.panel_after.item_id } : null
            }));

            if (nodes.length === 0) {
                await tracker.queuePage.evaluate(() => {
                    const graphContainer = document.getElementById('graphContainer');
                    if (graphContainer) {
                        graphContainer.innerHTML = '<div style="color:#fff; padding:20px; text-align:center;">No panels found</div>';
                    }
                });
                return;
            }

            // Serialize data for browser
            const nodesData = nodes.map(n => {
                const baseNode = {
                    id: n.id,
                    label: n.label,
                    color: n.color,
                    shape: n.shape,
                    font: n.font
                };
                
                // Virtual nodes don't have item data
                if (n.data.isVirtual) {
                    baseNode.data = {
                        isVirtual: true,
                        type: n.data.type
                    };
                } else {
                    baseNode.data = {
                        itemId: n.data.item.item_id,
                        itemCategory: n.data.item.item_category,
                        name: n.data.item.name,
                        type: n.data.item.type,
                        verb: n.data.item.verb,
                        image_base64: n.data.item.image_base64,
                        fullscreen_base64: n.data.item.fullscreen_base64,
                        fullscreen_url: n.data.item.fullscreen_url,
                        metadata: n.data.item.metadata,
                        bug_flag: n.data.item.bug_flag || n.data.item.metadata?.bug_flag || false,
                        bug_info: n.data.item.bug_info || null
                    };
                }
                
                return baseNode;
            });

            // Build a set of node IDs that have child nodes
            const nodesWithChildren = new Set();
            const buildNodesWithChildren = (treeNodes) => {
                if (!Array.isArray(treeNodes)) return;
                treeNodes.forEach(node => {
                    if (node.children && node.children.length > 0) {
                        nodesWithChildren.add(node.panel_id);
                        buildNodesWithChildren(node.children);
                    }
                });
            };
            buildNodesWithChildren(panelTreeData);

            const edgesData = edges.map(e => {
                const hasModalityStacks = e.data.hasModalityStacks || false;
                const edgeData = {
                    id: e.id,
                    from: e.from,
                    to: e.to,
                    label: hasModalityStacks ? '⭐' : '', // Show star icon for important actions
                    color: hasModalityStacks ? { color: '#ffc107', highlight: '#ffc107' } : e.color,
                    dashes: e.dashes,
                    font: { color: '#fff', size: 11, face: 'Roboto', align: 'middle' },
                    width: hasModalityStacks ? 3 : 2, // Thicker edge for important actions
                    data: {
                        actionId: e.data.actionId,
                        actionName: e.data.actionItem.name,
                        actionType: e.data.actionItem.type,
                        actionVerb: e.data.actionItem.verb,
                        actionPurpose: e.data.actionItem.purpose,
                        actionImage_base64: e.data.actionItem.image_base64,
                        actionMetadata: e.data.actionItem.metadata,
                        actionBugFlag: e.data.actionItem.bug_flag || e.data.actionItem.metadata?.bug_flag || false,
                        actionBugInfo: e.data.actionItem.bug_info || null,
                        actionModalityStacks: e.data.actionItem.modality_stacks || null,
                        hasModalityStacks: hasModalityStacks,
                        step: e.data.step ? {
                            step_id: e.data.step.step_id,
                            panel_before: e.data.step.panel_before,
                            panel_after: e.data.step.panel_after
                        } : null
                    }
                };
                
                // Set edge length: 2x (400) if target node has children, 1x (200) if not
                // Check if target node has children
                if (nodesWithChildren.has(e.to)) {
                    edgeData.length = 400; // 2x the default springLength of 200
                } else {
                    edgeData.length = 200; // 1x the default springLength
                }
                
                return edgeData;
            });

            // Render graph in browser context
            await tracker.queuePage.evaluate(async (nodesData, edgesData, panelTreeData, stepsData) => {
                let lastMouseX = 0;
                let lastMouseY = 0;
                document.addEventListener('mousemove', (e) => {
                    lastMouseX = e.clientX;
                    lastMouseY = e.clientY;
                });

                const graphContainer = document.getElementById('graphContainer');
                if (!graphContainer) {
                    console.error('graphContainer not found');
                    return;
                }

                graphContainer.innerHTML = '';

                if (typeof vis === 'undefined') {
                    graphContainer.innerHTML = '<div style="color:#ff0000; padding:20px;">vis-network library not loaded</div>';
                    return;
                }

                // Build a set of node IDs that have child nodes (in browser context)
                const nodesWithChildren = new Set();
                const buildNodesWithChildren = (treeNodes) => {
                    if (!Array.isArray(treeNodes)) return;
                    treeNodes.forEach(node => {
                        if (node.children && node.children.length > 0) {
                            nodesWithChildren.add(node.panel_id);
                            buildNodesWithChildren(node.children);
                        }
                    });
                };
                buildNodesWithChildren(panelTreeData);

                // Create vis-network data
                const edgesForVis = edgesData.map(e => ({
                    ...e,
                    label: e.data && e.data.actionBugFlag ? '🐛' : ''
                }));
                
                // Add collapse/expand icons and set mass for nodes that have children
                // Nodes with children get higher mass to form separate clusters
                const nodesWithIcons = nodesData.map(node => {
                    const hasOutgoingEdges = edgesData.some(e => e.from === node.id);
                    const hasChildren = nodesWithChildren.has(node.id);
                    
                    const nodeData = { ...node };
                    
                    if (hasOutgoingEdges && !node.data?.isVirtual) {
                        // Add ▼ icon to indicate node can be collapsed (expanded by default)
                        nodeData.label = `▼ ${node.label}`;
                    }
                    
                    // Set higher mass for nodes with children to create separate clusters
                    if (hasChildren && !node.data?.isVirtual) {
                        nodeData.mass = 5; // Higher mass = stronger repulsion, forms separate cluster
                        nodeData.group = 'hasChildren'; // Group for styling/clustering
                    } else if (!node.data?.isVirtual) {
                        nodeData.mass = 1; // Normal mass for nodes without children
                        nodeData.group = 'noChildren';
                    }
                    
                    return nodeData;
                });
                
                const data = {
                    nodes: new vis.DataSet(nodesWithIcons),
                    edges: new vis.DataSet(edgesForVis)
                };

                const options = {
                    nodes: {
                        shape: 'box',
                        font: { color: '#fff', size: 14 },
                        borderWidth: 2,
                        shadow: true,
                        margin: 20,  // Thêm margin cho mỗi node
                        widthConstraint: {
                            maximum: 200  // Giới hạn chiều rộng node
                        }
                    },
                    edges: {
                        arrows: {
                            to: { enabled: true, scaleFactor: 1.2 }
                        },
                        font: { color: '#fff', size: 11, align: 'middle', face: 'Roboto' },
                        smooth: {
                            type: 'continuous',
                            roundness: 0.5
                        },
                        shadow: true,
                        width: 2,
                        selectionWidth: 3,
                        chosen: {
                            edge: function(values, id, selected, hovering) {
                                if (selected || hovering) {
                                    values.color = '#0056b3'; // Xanh dương đậm
                                    values.width = 3;
                                }
                            }
                        }
                    },
                    physics: {
                        enabled: true,
                        barnesHut: {
                            gravitationalConstant: -3000, // Tăng repulsion (giá trị âm hơn) để tách các cụm xa hơn
                            centralGravity: 0.1, // Giảm central gravity để các cụm tự do tách xa
                            springLength: 200,
                            springConstant: 0.03,
                            damping: 0.25,
                            avoidOverlap: 1
                        },
                        stabilization: {
                            iterations: 500, // Tăng iterations để đảm bảo clustering tốt hơn
                            fit: true,
                            updateInterval: 50
                        },
                        timestep: 0.35
                    },
                    interaction: {
                        dragNodes: true,
                        zoomView: true,
                        dragView: true,
                        hover: true
                    }
                };

                const network = new vis.Network(graphContainer, data, options);

                network.on("hoverEdge", function (params) {
                    const edgeId = params.edge;
                    const edge = edgesForVis.find(e => e.id === edgeId);
                    if (!edge || !edge.data) return;
                    
                    // Show bug tooltip if action has bug
                    if (edge.data.actionBugFlag) {
                         if (typeof window.showBugTooltip === 'function') {
                             window.showBugTooltip({ clientX: lastMouseX, clientY: lastMouseY }, null, edge.data.actionBugInfo);
                         }
                    }
                    
                    // Show modality_stacks tooltip if action has modality_stacks
                    if (edge.data.hasModalityStacks && edge.data.actionModalityStacks && edge.data.actionModalityStacks.length > 0) {
                        const tooltip = document.createElement('div');
                        tooltip.id = 'graph-modality-stacks-tooltip';
                        tooltip.style.cssText = 'position: fixed;' +
                            'left: ' + (lastMouseX + 10) + 'px;' +
                            'top: ' + (lastMouseY + 10) + 'px;' +
                            'background: rgba(0, 0, 0, 0.9);' +
                            'color: white;' +
                            'padding: 12px;' +
                            'border-radius: 6px;' +
                            'font-size: 12px;' +
                            'max-width: 400px;' +
                            'z-index: 10000;' +
                            'pointer-events: none;' +
                            'box-shadow: 0 4px 12px rgba(0,0,0,0.3);' +
                            'border: 2px solid #ffc107;';
                        
                        let tooltipContent = '<div style="font-weight: 600; margin-bottom: 8px; color: #ffc107;">⭐ Đây là tính năng quan trọng cần làm hết luồng</div>';
                        tooltipContent += '<div style="margin-top: 8px; color: #ccc;">Modality stacks: ' + edge.data.actionModalityStacks.join(', ') + '</div>';
                        
                        tooltip.innerHTML = tooltipContent;
                        document.body.appendChild(tooltip);
                    } else if (!edge.data.actionBugFlag && 
                               Array.isArray(edge.data.actionModalityStacks) && 
                               edge.data.actionModalityStacks.length === 0) {
                        // Show tooltip for actions with empty modality_stacks array (if no bug)
                        const tooltip = document.createElement('div');
                        tooltip.id = 'graph-action-tooltip';
                        tooltip.style.cssText = 'position: fixed;' +
                            'left: ' + (lastMouseX + 10) + 'px;' +
                            'top: ' + (lastMouseY + 10) + 'px;' +
                            'background: rgba(0, 0, 0, 0.9);' +
                            'color: white;' +
                            'padding: 8px 12px;' +
                            'border-radius: 6px;' +
                            'font-size: 12px;' +
                            'z-index: 10000;' +
                            'pointer-events: none;' +
                            'box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
                        tooltip.textContent = 'Tính năng này cần làm ít nhất tới tầng thứ 2 (nếu có)';
                        document.body.appendChild(tooltip);
                    }
                });
                
                network.on("blurEdge", function (params) {
                     if (typeof window.hideBugTooltip === 'function') {
                         window.hideBugTooltip();
                     }
                     // Remove modality_stacks tooltip
                     const modalityTooltip = document.getElementById('graph-modality-stacks-tooltip');
                     if (modalityTooltip) {
                         modalityTooltip.remove();
                     }
                     // Remove action tooltip
                     const actionTooltip = document.getElementById('graph-action-tooltip');
                     if (actionTooltip) {
                         actionTooltip.remove();
                     }
                });

                // Store network reference globally for fit to screen
                window.graphNetwork = network;
                
                let stabilizationCompleted = false;
                
                // Tắt physics sau khi stabilization xong để đồ thị ổn định
                network.once('stabilizationEnd', () => {
                    stabilizationCompleted = true;
                    network.setOptions({ physics: false });
                    console.log('[Graph] Physics disabled after stabilization');
                });
                
                // Fallback: Đảm bảo physics tắt sau 3 giây nếu stabilizationEnd không kích hoạt
                setTimeout(() => {
                    if (!stabilizationCompleted) {
                        network.setOptions({ physics: false });
                        console.log('[Graph] Physics disabled after timeout (stabilization may still be running)');
                    }
                }, 3000);
                
                // Log info about collapsible nodes
                const collapsibleNodes = nodesWithIcons.filter(n => {
                    const hasOutgoingEdges = edgesData.some(e => e.from === n.id);
                    return hasOutgoingEdges && !n.data?.isVirtual;
                });
                console.log(`[Graph] Graph rendered with ${nodesWithIcons.length} nodes, ${edgesData.length} edges`);
                console.log(`[Graph] ${collapsibleNodes.length} nodes can be collapsed/expanded (click on nodes with ▼ icon)`);
                
                // Track collapsed nodes
                const collapsedNodes = new Set();
                
                // Store original labels (without icons) for all nodes
                const originalLabels = new Map();
                nodesWithIcons.forEach(node => {
                    // Extract original label by removing icon if present
                    let originalLabel = node.label;
                    if (originalLabel && (originalLabel.startsWith('▼ ') || originalLabel.startsWith('▶ '))) {
                        originalLabel = originalLabel.substring(2);
                    }
                    originalLabels.set(node.id, originalLabel);
                });
                
                // Label clearing logic removed to support bug icons
                /*
                const allEdges = data.edges.get();
                allEdges.forEach(edge => {
                    if (edge.label && edge.label !== '') {
                        data.edges.update({
                            id: edge.id,
                            label: ''
                        });
                    }
                });
                */

                // Function to hide all edge labels
                const hideAllEdgeLabels = () => {
                    const allEdges = data.edges.get();
                    const updates = allEdges.map(edge => ({
                        id: edge.id,
                        label: ''
                    }));
                    if (updates.length > 0) {
                        data.edges.update(updates);
                    }
                };
                
                // Function to get all outgoing edges and their target nodes for a given node
                const getOutgoingEdgesAndNodes = (nodeId) => {
                    const outgoingEdges = edgesData.filter(e => e.from === nodeId);
                    const targetNodeIds = new Set(outgoingEdges.map(e => e.to));
                    return { edges: outgoingEdges, targetNodeIds: Array.from(targetNodeIds) };
                };
                
                // Function to recursively get all descendant nodes (for nested collapse)
                const getDescendantNodes = (nodeId, visited = new Set()) => {
                    if (visited.has(nodeId)) return new Set();
                    visited.add(nodeId);
                    
                    const descendants = new Set();
                    const { targetNodeIds } = getOutgoingEdgesAndNodes(nodeId);
                    
                    targetNodeIds.forEach(targetId => {
                        descendants.add(targetId);
                        const nested = getDescendantNodes(targetId, visited);
                        nested.forEach(n => descendants.add(n));
                    });
                    
                    return descendants;
                };
                
                // Function to update node label with collapse/expand icon
                const updateNodeLabel = (nodeId, isCollapsed) => {
                    const nodeInDataSet = data.nodes.get(nodeId);
                    if (!nodeInDataSet) return;
                    
                    const originalLabel = originalLabels.get(nodeId) || 'Node';
                    const icon = isCollapsed ? '▶' : '▼';
                    const newLabel = `${icon} ${originalLabel}`;
                    
                    data.nodes.update({
                        id: nodeId,
                        label: newLabel
                    });
                };
                
                // Function to collapse a node (hide outgoing edges and target nodes)
                const collapseNode = (nodeId) => {
                    console.log(`[Graph] ===== COLLAPSE NODE CALLED =====`);
                    console.log(`[Graph] NodeId received: ${nodeId}`);
                    console.log(`[Graph] NodeId type: ${typeof nodeId}`);
                    
                    // Tắt physics trước khi collapse để tránh dao động
                    network.setOptions({ physics: false });
                    
                    const { edges, targetNodeIds } = getOutgoingEdgesAndNodes(nodeId);
                    
                    console.log(`[Graph] Found ${edges.length} outgoing edges from node ${nodeId}`);
                    console.log(`[Graph] Edges:`, edges.map(e => ({ id: e.id, from: e.from, to: e.to })));
                    console.log(`[Graph] Target node IDs:`, targetNodeIds);
                    
                    if (edges.length === 0) {
                        console.log(`[Graph] Cannot collapse node ${nodeId}: no outgoing edges`);
                        return; // No outgoing edges, nothing to collapse
                    }
                    
                    console.log(`[Graph] Collapsing node ${nodeId}, will hide ${edges.length} edges and ${targetNodeIds.length} target nodes`);
                    
                    // Update label to show collapsed icon
                    updateNodeLabel(nodeId, true);
                    
                    // Hide edges by removing them from dataset
                    const edgeIdsToRemove = edges.map(e => e.id);
                    console.log(`[Graph] Removing edges:`, edgeIdsToRemove);
                    data.edges.remove(edgeIdsToRemove);
                    
                    // Hide immediate target nodes and recursively hide their descendants
                    const nodesToHide = new Set();
                    const hideNodeAndDescendants = (targetId) => {
                        if (nodesToHide.has(targetId)) return;
                        nodesToHide.add(targetId);
                        
                        // Recursively hide children of this target node
                        const childEdges = edgesData.filter(e => e.from === targetId);
                        childEdges.forEach(childEdge => {
                            // Also remove child edges
                            const childEdgeInDataSet = data.edges.get(childEdge.id);
                            if (childEdgeInDataSet) {
                                data.edges.remove(childEdge.id);
                            }
                            hideNodeAndDescendants(childEdge.to);
                        });
                    };
                    
                    targetNodeIds.forEach(targetId => {
                        hideNodeAndDescendants(targetId);
                    });
                    
                    // Remove all nodes that should be hidden
                    if (nodesToHide.size > 0) {
                        console.log(`[Graph] Removing ${nodesToHide.size} nodes:`, Array.from(nodesToHide));
                        data.nodes.remove(Array.from(nodesToHide));
                    }
                    
                    collapsedNodes.add(nodeId);
                    console.log(`[Graph] Node ${nodeId} collapsed successfully`);
                    
                    // Physics đã tắt, không cần bật lại
                };
                
                // Function to expand a node (show outgoing edges and target nodes)
                const expandNode = (nodeId) => {
                    console.log(`[Graph] ===== EXPAND NODE CALLED =====`);
                    console.log(`[Graph] NodeId received: ${nodeId}`);
                    console.log(`[Graph] NodeId type: ${typeof nodeId}`);
                    
                    // Tắt physics trước khi expand để tránh dao động
                    network.setOptions({ physics: false });
                    
                    const { edges, targetNodeIds } = getOutgoingEdgesAndNodes(nodeId);
                    
                    console.log(`[Graph] Found ${edges.length} outgoing edges from node ${nodeId}`);
                    console.log(`[Graph] Edges:`, edges.map(e => ({ id: e.id, from: e.from, to: e.to })));
                    console.log(`[Graph] Target node IDs:`, targetNodeIds);
                    
                    if (edges.length === 0) {
                        console.log(`[Graph] Cannot expand node ${nodeId}: no outgoing edges`);
                        return; // No outgoing edges
                    }
                    
                    console.log(`[Graph] Expanding node ${nodeId}, will show ${edges.length} edges and ${targetNodeIds.length} target nodes`);
                    
                    // Update label to show expanded icon
                    updateNodeLabel(nodeId, false);
                    
                    // Add edges back to dataset
                    const edgesToAdd = edges.map(edge => ({
                        id: edge.id,
                        from: edge.from,
                        to: edge.to,
                        label: '',
                        color: edge.color,
                        dashes: edge.dashes,
                        data: edge.data
                    }));
                    console.log(`[Graph] Adding edges:`, edgesToAdd.map(e => e.id));
                    data.edges.add(edgesToAdd);
                    
                    // Show immediate target nodes by adding them back
                    const nodesToAdd = [];
                    const nodesToPosition = []; // Nodes that need positioning
                    targetNodeIds.forEach(targetId => {
                        const originalNode = nodesWithIcons.find(n => n.id === targetId);
                        if (originalNode) {
                            // Check if node already exists in dataset
                            const existingNode = data.nodes.get(targetId);
                            if (!existingNode) {
                                nodesToAdd.push(originalNode);
                                nodesToPosition.push(targetId);
                            } else {
                                // Node exists, check if it needs repositioning
                                const existingPos = network.getPositions([targetId]);
                                if (!existingPos || !existingPos[targetId]) {
                                    nodesToPosition.push(targetId);
                                }
                            }
                        }
                    });
                    
                    if (nodesToAdd.length > 0) {
                        console.log(`[Graph] Adding ${nodesToAdd.length} nodes:`, nodesToAdd.map(n => n.id));
                        data.nodes.add(nodesToAdd);
                    }
                    
                    // Position child nodes around parent node in radial layout
                    if (nodesToPosition.length > 0) {
                        // Get parent node position
                        const parentPositions = network.getPositions([nodeId]);
                        const parentPos = parentPositions[nodeId];
                        
                        if (parentPos) {
                            const radius = 250; // Distance from parent to child nodes
                            const angleStep = (2 * Math.PI) / nodesToPosition.length; // Divide 360 degrees evenly
                            
                            const positionUpdates = [];
                            nodesToPosition.forEach((targetId, index) => {
                                // Calculate angle for this node (start from top, clockwise)
                                const angle = index * angleStep - Math.PI / 2; // Start from top (-90 degrees)
                                
                                // Calculate position
                                const x = parentPos.x + radius * Math.cos(angle);
                                const y = parentPos.y + radius * Math.sin(angle);
                                
                                positionUpdates.push({
                                    id: targetId,
                                    x: x,
                                    y: y,
                                    fixed: {
                                        x: true,
                                        y: true
                                    }
                                });
                                
                                console.log(`[Graph] Positioning node ${targetId} at (${x.toFixed(2)}, ${y.toFixed(2)}) with angle ${(angle * 180 / Math.PI).toFixed(2)}°`);
                            });
                            
                            if (positionUpdates.length > 0) {
                                console.log(`[Graph] Positioning ${positionUpdates.length} child nodes around parent node ${nodeId}`);
                                data.nodes.update(positionUpdates);
                            }
                        } else {
                            console.warn(`[Graph] Could not get parent position for node ${nodeId}, skipping radial positioning`);
                        }
                    }
                    
                    // If target nodes are not collapsed, recursively expand them
                    targetNodeIds.forEach(targetId => {
                        if (!collapsedNodes.has(targetId)) {
                            const childEdges = edgesData.filter(e => e.from === targetId);
                            if (childEdges.length > 0) {
                                // Recursively expand this child node to show its children
                                expandNode(targetId);
                            }
                        }
                    });
                    
                    collapsedNodes.delete(nodeId);
                    console.log(`[Graph] Node ${nodeId} expanded successfully`);
                    
                    // Physics đã tắt, không cần bật lại
                };
                
                // Store original states for reset
                let originalStates = {
                    nodes: new Map(),
                    edges: new Map()
                };
                
                // Function to find all paths to a target node by tracing back through steps
                const findAllPathsToNode = (targetNodeId, steps, edgesData) => {
                    const pathNodes = new Set([targetNodeId]);
                    const pathEdges = new Set();
                    const pathSteps = [];
                    const processed = new Set(); // Track nodes we've processed to avoid infinite loops
                    
                    const traceBack = (nodeId) => {
                        // Avoid infinite loops in circular graphs
                        // We use a check: if we've already processed this node, we still collect edges
                        // but don't recursively trace back again
                        const alreadyProcessed = processed.has(nodeId);
                        if (!alreadyProcessed) {
                            processed.add(nodeId);
                        }
                        
                        // Find all steps where panel_after = nodeId
                        const stepsToThisNode = steps.filter(step => 
                            step.panel_after && 
                            step.panel_after.item_id === nodeId
                        );
                        
                        if (stepsToThisNode.length === 0) {
                            // No steps lead to this node - it's a root node
                            return;
                        }
                        
                        stepsToThisNode.forEach(step => {
                            pathSteps.push(step);
                            const panelBeforeId = step.panel_before?.item_id;
                            const actionId = step.action?.item_id;
                            
                            if (panelBeforeId) {
                                pathNodes.add(panelBeforeId);
                                
                                // Find the edge corresponding to this step
                                // Try multiple matching strategies
                                let correspondingEdge = edgesData.find(edge => {
                                    // First try: exact match with actionId
                                    if (edge.from === panelBeforeId && edge.to === nodeId) {
                                        if (edge.data && edge.data.actionId === actionId) {
                                            return true;
                                        }
                                        // Second try: match by edge ID format
                                        if (edge.id === `edge_${panelBeforeId}_${actionId}`) {
                                            return true;
                                        }
                                    }
                                    return false;
                                });
                                
                                // If not found, try finding any edge between these two nodes
                                if (!correspondingEdge) {
                                    correspondingEdge = edgesData.find(edge => 
                                        edge.from === panelBeforeId && edge.to === nodeId
                                    );
                                }
                                
                                if (correspondingEdge) {
                                    pathEdges.add(correspondingEdge.id);
                                } else {
                                    console.log(`[Graph] Warning: Could not find edge from ${panelBeforeId} to ${nodeId} for action ${actionId}`);
                                }
                                
                                // Only recursively trace back if we haven't processed this node before
                                if (!alreadyProcessed) {
                                    // Recursively trace back from panel_before
                                    traceBack(panelBeforeId);
                                }
                            }
                        });
                    };
                    
                    // Start tracing back from target node
                    traceBack(targetNodeId);
                    
                    // After collecting all path nodes, find ALL edges between path nodes
                    // This ensures we capture all edges in the path, even if step matching missed some
                    const pathNodesArray = Array.from(pathNodes);
                    console.log('[Graph] Finding edges between path nodes:', pathNodesArray);
                    
                    pathNodesArray.forEach(fromNodeId => {
                        edgesData.forEach(edge => {
                            // Only add edges that connect two nodes in our path
                            if (pathNodes.has(edge.from) && pathNodes.has(edge.to)) {
                                // Make sure this edge is part of the actual path (from -> to relationship)
                                // Don't add reverse edges or unrelated edges
                                pathEdges.add(edge.id);
                                console.log(`[Graph] Added edge ${edge.id} from ${edge.from} to ${edge.to}`);
                            }
                        });
                    });
                    
                    console.log(`[Graph] findAllPathsToNode result: ${pathNodesArray.length} nodes, ${pathEdges.size} edges`);
                    
                    return {
                        pathNodes: Array.from(pathNodes),
                        pathEdges: Array.from(pathEdges),
                        pathSteps: pathSteps
                    };
                };
                
                // Function to highlight path nodes and edges
                const highlightPath = (pathNodes, pathEdges, data, network) => {
                    // First, reset any previous highlighting
                    resetHighlight(originalStates, data);
                    
                    // Deselect all nodes and edges to avoid selection state overriding highlight
                    network.unselectAll();
                    
                    // Save original states and highlight nodes
                    pathNodes.forEach(nodeId => {
                        const node = data.nodes.get(nodeId);
                        if (node) {
                            // Save original state
                            originalStates.nodes.set(nodeId, {
                                color: node.color,
                                borderColor: node.borderColor || node.color
                            });
                            
                            // Highlight node with yellow color
                            data.nodes.update({
                                id: nodeId,
                                color: {
                                    background: '#ffc107',
                                    border: '#ff9800',
                                    highlight: {
                                        background: '#ffd54f',
                                        border: '#ff9800'
                                    }
                                }
                            });
                        }
                    });
                    
                    // Save original states and highlight edges
                    pathEdges.forEach(edgeId => {
                        const edge = data.edges.get(edgeId);
                        if (edge) {
                            // Save original state (need to get the actual color object structure)
                            const originalColor = edge.color || { color: '#848484' };
                            const originalWidth = edge.width || 2;
                            
                            originalStates.edges.set(edgeId, {
                                color: typeof originalColor === 'string' 
                                    ? { color: originalColor } 
                                    : originalColor,
                                width: originalWidth
                            });
                            
                            // Highlight edge with red color and increased width
                            // Use selectionWidth to override selection state
                            const updateData = {
                                id: edgeId,
                                color: {
                                    color: '#ff6b6b',
                                    highlight: '#ff4444',
                                    hover: '#ff4444'
                                },
                                width: 4,
                                selectionWidth: 4  // Force width even when selected
                            };
                            
                            data.edges.update(updateData);
                        }
                    });
                    
                    // Force network to update and prevent selection from overriding
                    // Wait a bit and update again to ensure highlight persists
                    setTimeout(() => {
                        pathEdges.forEach(edgeId => {
                            const edge = data.edges.get(edgeId);
                            if (edge) {
                                data.edges.update({
                                    id: edgeId,
                                    color: {
                                        color: '#ff6b6b',
                                        highlight: '#ff4444',
                                        hover: '#ff4444'
                                    },
                                    width: 4,
                                    selectionWidth: 4
                                });
                            }
                        });
                    }, 50);
                    
                    console.log(`[Graph] Highlighted ${pathNodes.length} nodes and ${pathEdges.length} edges`);
                };
                
                // Function to reset highlighting
                const resetHighlight = (originalStates, data) => {
                    // Reset nodes
                    originalStates.nodes.forEach((originalState, nodeId) => {
                        data.nodes.update({
                            id: nodeId,
                            color: originalState.color,
                            borderColor: originalState.borderColor
                        });
                    });
                    
                    // Reset edges
                    originalStates.edges.forEach((originalState, edgeId) => {
                        data.edges.update({
                            id: edgeId,
                            color: originalState.color,
                            width: originalState.width
                        });
                    });
                    
                    // Clear original states
                    originalStates.nodes.clear();
                    originalStates.edges.clear();
                };
                
                // Handle edge selection - keep labels hidden
                network.on('selectEdge', (params) => {
                    hideAllEdgeLabels();
                });
                
                network.on('deselectEdge', () => {
                    hideAllEdgeLabels();
                });
                
                // Create context menu element - append to graphViewModal for proper z-index
                const graphViewModal = document.getElementById('graphViewModal');
                const contextMenu = document.createElement('div');
                contextMenu.id = 'graphContextMenu';
                contextMenu.style.cssText = `
                    display: none;
                    position: fixed;
                    background: white;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    padding: 4px 0;
                    z-index: 20006;
                    min-width: 150px;
                    pointer-events: auto;
                `;
                // Append to graphViewModal if available, otherwise to body
                if (graphViewModal) {
                    graphViewModal.appendChild(contextMenu);
                } else {
                    document.body.appendChild(contextMenu);
                }
                
                // Function to show context menu
                const showContextMenu = (x, y, nodeId) => {
                    console.log('[Graph] showContextMenu called for node:', nodeId, 'at position:', x, y);
                    
                    const { edges } = getOutgoingEdgesAndNodes(nodeId);
                    const isCollapsed = collapsedNodes.has(nodeId);
                    
                    contextMenu.innerHTML = '';
                    
                    if (edges.length > 0) {
                        const collapseItem = document.createElement('div');
                        collapseItem.className = 'context-menu-item';
                        collapseItem.style.cssText = 'padding: 8px 16px; cursor: pointer; font-size: 13px;';
                        collapseItem.textContent = isCollapsed ? '▶ Expand' : '▼ Collapse';
                        collapseItem.onmouseover = () => collapseItem.style.background = '#f0f0f0';
                        collapseItem.onmouseout = () => collapseItem.style.background = '';
                        
                        // Store nodeId in data attribute to ensure it's preserved
                        collapseItem.setAttribute('data-node-id', nodeId);
                        
                        collapseItem.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // Get nodeId from data attribute to ensure correct node
                            const targetNodeId = collapseItem.getAttribute('data-node-id') || nodeId;
                            const targetIsCollapsed = collapsedNodes.has(targetNodeId);
                            
                            console.log('[Graph] Collapse/Expand clicked for node:', targetNodeId, 'isCollapsed:', targetIsCollapsed);
                            
                            contextMenu.style.display = 'none';
                            
                            if (targetIsCollapsed) {
                                console.log('[Graph] Expanding node:', targetNodeId);
                                expandNode(targetNodeId);
                            } else {
                                console.log('[Graph] Collapsing node:', targetNodeId);
                                collapseNode(targetNodeId);
                            }
                        };
                        contextMenu.appendChild(collapseItem);
                    }
                    
                    const node = nodesData.find(n => n.id === nodeId);
                    if (node && node.data && !node.data.isVirtual) {
                        const infoItem = document.createElement('div');
                        infoItem.className = 'context-menu-item';
                        infoItem.style.cssText = 'padding: 8px 16px; cursor: pointer; font-size: 13px;';
                        infoItem.textContent = 'ℹ️ Panel Info';
                        infoItem.onmouseover = () => infoItem.style.background = '#f0f0f0';
                        infoItem.onmouseout = () => infoItem.style.background = '';
                        
                        // Store nodeId and node data to ensure correct info is shown
                        infoItem.setAttribute('data-node-id', nodeId);
                        
                        infoItem.onclick = async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            const targetNodeId = infoItem.getAttribute('data-node-id') || nodeId;
                            const targetNode = nodesData.find(n => n.id === targetNodeId);
                            
                            console.log('[Graph] Show Info clicked for node:', targetNodeId);
                            
                            contextMenu.style.display = 'none';
                            
                            if (targetNode && targetNode.data && window.showPanelInfoGraph) {
                                await window.showPanelInfoGraph(targetNode.data);
                            }
                        };
                        contextMenu.appendChild(infoItem);
                    }
                    
                    if (contextMenu.children.length === 0) {
                        console.log('[Graph] No menu items to show');
                        return;
                    }
                    
                    // Ensure menu is visible and on top
                    contextMenu.style.display = 'block';
                    contextMenu.style.visibility = 'visible';
                    contextMenu.style.opacity = '1';
                    contextMenu.style.left = x + 'px';
                    contextMenu.style.top = y + 'px';
                    contextMenu.style.zIndex = '20006';
                    
                    console.log('[Graph] Context menu displayed at:', x, y);
                    console.log('[Graph] Context menu style:', {
                        display: contextMenu.style.display,
                        left: contextMenu.style.left,
                        top: contextMenu.style.top,
                        zIndex: contextMenu.style.zIndex,
                        children: contextMenu.children.length
                    });
                    
                    // Force a reflow to ensure rendering
                    contextMenu.offsetHeight;
                };
                
                // Hide context menu when clicking elsewhere
                document.addEventListener('click', (e) => {
                    if (contextMenu && !contextMenu.contains(e.target)) {
                        contextMenu.style.display = 'none';
                    }
                });
                
                // Also hide on Escape key
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && contextMenu && contextMenu.style.display === 'block') {
                        contextMenu.style.display = 'none';
                    }
                });
                
                // Track current node under cursor for right-click
                let currentNodeUnderCursor = null;
                let lastSelectedNodeId = null;
                
                // Handle hover to track which node is under cursor
                network.on('hoverNode', (params) => {
                    currentNodeUnderCursor = params.node;
                    console.log('[Graph] Hovering over node:', params.node);
                });
                
                network.on('blurNode', () => {
                    // Keep currentNodeUnderCursor for a short time to allow right-click
                    // Don't clear immediately
                });
                
                // Also track selected nodes
                network.on('selectNode', (params) => {
                    if (params.nodes && params.nodes.length > 0) {
                        lastSelectedNodeId = params.nodes[0];
                        currentNodeUnderCursor = params.nodes[0];
                        console.log('[Graph] Node selected:', params.nodes[0]);
                    }
                });
                
                // Handle click events (left click - highlight path)
                network.on('click', async (params) => {
                    console.log('[Graph] Click event triggered:', params);
                    
                    // Keep all edge labels hidden
                    hideAllEdgeLabels();
                    
                    // Update current node
                    if (params.nodes && params.nodes.length > 0) {
                        currentNodeUnderCursor = params.nodes[0];
                    }
                    
                    // IMPORTANT: Check nodes first, as clicking a node may also include edges
                    // Priority: Node click > Edge click > Empty space
                    if (params.nodes && params.nodes.length > 0) {
                        // Node clicked - highlight path from steps (skip virtual nodes)
                        console.log('[Graph] Node clicked, highlighting path');
                        const nodeId = params.nodes[0];
                        const node = nodesData.find(n => n.id === nodeId);
                        
                        console.log('[Graph] Clicked node:', nodeId, 'Node data:', node?.data);
                        
                        if (node && node.data && !node.data.isVirtual) {
                            // Get steps data from global variable
                            const steps = window.graphStepsData || [];
                            console.log('[Graph] Steps data available:', steps.length, 'steps');
                            
                            if (steps.length > 0) {
                                // Find all paths to this node by tracing back through steps
                                const pathInfo = findAllPathsToNode(nodeId, steps, edgesData);
                                console.log('[Graph] Path info:', pathInfo);
                                
                                // pathNodes always includes the target node, so check if we have more than just the target
                                // or if we have edges leading to it
                                if (pathInfo.pathNodes.length > 1 || pathInfo.pathEdges.length > 0) {
                                    // Highlight the path (has nodes before this one or edges)
                                    console.log('[Graph] Highlighting path with', pathInfo.pathNodes.length, 'nodes and', pathInfo.pathEdges.length, 'edges');
                                    highlightPath(pathInfo.pathNodes, pathInfo.pathEdges, data, network);
                                    console.log(`[Graph] Highlighted path to node ${nodeId}: ${pathInfo.pathNodes.length} nodes, ${pathInfo.pathEdges.length} edges`);
                                } else {
                                    // No paths found - just highlight the clicked node (root node)
                                    console.log('[Graph] No paths found, highlighting only the clicked node');
                                    highlightPath([nodeId], [], data, network);
                                    console.log(`[Graph] No paths found to node ${nodeId}, highlighting only the node (root node)`);
                                }
                            } else {
                                // No steps data - just highlight the clicked node
                                console.log('[Graph] No steps data, highlighting only the clicked node');
                                highlightPath([nodeId], [], data, network);
                                console.log(`[Graph] No steps data available, highlighting only node ${nodeId}`);
                            }
                        } else {
                            console.log('[Graph] Node is virtual or has no data, skipping');
                        }
                    } else if (params.edges && params.edges.length > 0) {
                        // Edge clicked - show step info but keep label hidden
                        // Only handle edge click if no node was clicked
                        console.log('[Graph] Edge clicked (no node), showing step info');
                        const edgeId = params.edges[0];
                        const edge = edgesData.find(e => e.id === edgeId);
                        if (edge && edge.data) {
                            if (window.showStepInfoGraph) {
                                await window.showStepInfoGraph(edge.data, nodesData);
                            }
                        }
                    } else {
                        // Clicked on empty space - reset highlight
                        console.log('[Graph] Clicked on empty space, resetting highlight');
                        resetHighlight(originalStates, data);
                    }
                });
                
                // Handle right-click events (context menu)
                graphContainer.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    console.log('[Graph] Right-click detected at:', e.clientX, e.clientY);
                    console.log('[Graph] currentNodeUnderCursor:', currentNodeUnderCursor);
                    console.log('[Graph] lastSelectedNodeId:', lastSelectedNodeId);
                    
                    // Use the node that's currently under cursor or was last selected/clicked
                    const targetNodeId = currentNodeUnderCursor || lastSelectedNodeId;
                    
                    if (targetNodeId) {
                        console.log('[Graph] Showing context menu for node:', targetNodeId);
                        showContextMenu(e.clientX, e.clientY, targetNodeId);
                    } else {
                        console.log('[Graph] No node found for context menu. Try clicking on a node first, then right-click.');
                    }
                });
                
                // Store panel tree data and nodes/edges data globally for tree click handlers
                window.graphPanelTreeData = panelTreeData;
                window.graphNodesData = nodesData;
                window.graphEdgesData = edgesData;
                window.graphStepsData = stepsData;
                
                // Load and render panel tree
                if (window.loadGraphPanelTree) {
                    await window.loadGraphPanelTree();
                }
            }, nodesData, edgesData, panelTreeData, stepsData);

        } catch (err) {
            console.error('Failed to render graph:', err);
            await tracker.queuePage.evaluate((errorMsg) => {
                const graphContainer = document.getElementById('graphContainer');
                if (graphContainer) {
                    graphContainer.innerHTML = `<div style="color:#ff0000; padding:20px;">Error: ${errorMsg}</div>`;
                }
            }, err.message);
        }
    };

    const showPanelInfoHandler = async (panelData) => {
        // Load image in Node.js context
        const imageBase64 = await loadPanelImage(panelData);

        const globalPos = panelData.metadata?.global_pos;

        // Show info in browser context
        await tracker.queuePage.evaluate((panelData, imageBase64, globalPos) => {
            const infoPanel = document.getElementById('graphInfoPanel');
            const infoContent = document.getElementById('graphInfoContent');
            if (!infoPanel || !infoContent) return;

            // Set default width to 2/3 of screen
            if (!infoPanel.dataset.widthSet) {
                const screenWidth = window.innerWidth;
                infoPanel.style.width = (screenWidth * 2 / 3) + 'px';
                infoPanel.dataset.widthSet = 'true';
            }
            
            infoPanel.style.display = 'flex';

            // Update header title
            const headerTitle = infoPanel.querySelector('h4');
            if (headerTitle) {
                headerTitle.textContent = 'Panel info';
            }

            let imageHtml = '';
            if (imageBase64) {
                if (globalPos) {
                    imageHtml = `<div id="panelImageContainer" style="position:relative; display:inline-block;">
                        <img id="panelImage" src="data:image/png;base64,${imageBase64}" style="max-width:100%; border:1px solid #555; border-radius:4px; display:block;" />
                        <canvas id="panelImageCanvas" style="position:absolute; top:0; left:0; pointer-events:none;"></canvas>
                    </div>`;
                } else {
                    imageHtml = `<img src="data:image/png;base64,${imageBase64}" style="max-width:100%; border:1px solid #555; border-radius:4px;" />`;
                }
            }

            infoContent.innerHTML = `
                <p><strong>Name:</strong> ${panelData.name || 'N/A'}</p>
                <p><strong>Type:</strong> ${panelData.type || 'N/A'}</p>
                <p><strong>Verb:</strong> ${panelData.verb || 'N/A'}</p>
                <div style="margin-top:15px;">
                    ${imageHtml}
                </div>
            `;

            // Draw border after HTML is set
            if (imageBase64 && globalPos) {
                const img = document.getElementById('panelImage');
                const canvas = document.getElementById('panelImageCanvas');
                if (img && canvas) {
                    const drawBorder = () => {
                        const rect = img.getBoundingClientRect();
                        canvas.width = rect.width;
                        canvas.height = rect.height;
                        canvas.style.width = rect.width + 'px';
                        canvas.style.height = rect.height + 'px';
                        const ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        const scaleX = rect.width / img.naturalWidth;
                        const scaleY = rect.height / img.naturalHeight;
                        ctx.strokeStyle = '#ff0000';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(globalPos.x * scaleX, globalPos.y * scaleY, globalPos.w * scaleX, globalPos.h * scaleY);
                    };
                    
                    if (img.complete) {
                        drawBorder();
                    } else {
                        img.onload = drawBorder;
                    }
                    
                    // Use ResizeObserver to redraw border when image size changes
                    const resizeObserver = new ResizeObserver(() => {
                        if (img.complete) {
                            drawBorder();
                        }
                    });
                    resizeObserver.observe(img);
                    
                    // Also observe the info panel for resize
                    if (infoPanel) {
                        const panelResizeObserver = new ResizeObserver(() => {
                            if (img.complete) {
                                drawBorder();
                            }
                        });
                        panelResizeObserver.observe(infoPanel);
                    }
                }
            }
        }, panelData, imageBase64, globalPos);
    };

    // Helper function to find panel containing an action
    const findPanelForAction = async (actionId) => {
        try {
            const parentPath = path.join(tracker.sessionFolder, 'myparent_panel.jsonl');
            const content = await fsp.readFile(parentPath, 'utf8');
            const allParents = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            // First, check direct child_actions
            for (const entry of allParents) {
                if (entry.child_actions && entry.child_actions.includes(actionId)) {
                    return entry.parent_panel;
                }

                // Also check child_pages for actions
                if (entry.child_pages) {
                    for (const page of entry.child_pages) {
                        if (page.child_actions && page.child_actions.includes(actionId)) {
                            return entry.parent_panel;
                        }
                    }
                }
            }

            // If not found in direct child_actions, check recursively in child_panels
            const checkChildPanels = async (panelId) => {
                const entry = allParents.find(p => p.parent_panel === panelId);
                if (!entry) return null;

                // Check if this panel's child_panels contain the action
                if (entry.child_panels && entry.child_panels.length > 0) {
                    for (const childPanelId of entry.child_panels) {
                        const childEntry = allParents.find(p => p.parent_panel === childPanelId);
                        if (childEntry) {
                            if (childEntry.child_actions && childEntry.child_actions.includes(actionId)) {
                                return childPanelId;
                            }
                            // Recursively check nested child_panels
                            const nestedResult = await checkChildPanels(childPanelId);
                            if (nestedResult) return nestedResult;
                        }
                    }
                }
                return null;
            };

            // Check all root panels (panels that are not child_panels of others)
            for (const entry of allParents) {
                const isChildPanel = allParents.some(p => p.child_panels && p.child_panels.includes(entry.parent_panel));
                if (!isChildPanel) {
                    const result = await checkChildPanels(entry.parent_panel);
                    if (result) return result;
                }
            }

            return null;
        } catch (err) {
            console.error('Error finding panel for action:', err);
            return null;
        }
    };

    const generateVideoForActionHandler = async (actionId) => {
        try {
            const actionItem = await tracker.dataItemManager.getItem(actionId);
            if (!actionItem || actionItem.item_category !== 'ACTION') {
                throw new Error(`Action not found: ${actionId}`);
            }

            const step = await tracker.stepManager.getStepForAction(actionId);
            if (!step) {
                throw new Error(`Step not found for action: ${actionId}`);
            }

            // Import video generators
            const { createStepVideo, createTrackingVideo } = await import('../media/video-generator.js');

            const results = {};

            // 1. Create StepVideo if not exists
            const existingStepVideoUrl = actionItem.metadata?.step_video_url || null;
            if (!existingStepVideoUrl) {
                const panelBeforeId = step.panel_before?.item_id;
                const panelAfterId = step.panel_after?.item_id;

                if (panelBeforeId && panelAfterId) {
                    const panelBefore = await tracker.dataItemManager.getItem(panelBeforeId);
                    const panelAfter = await tracker.dataItemManager.getItem(panelAfterId);

                    let panelBeforeImage = null;
                    if (panelBefore?.fullscreen_base64) {
                        panelBeforeImage = await tracker.dataItemManager.loadBase64FromFile(panelBefore.fullscreen_base64);
                    } else if (panelBefore?.image_base64) {
                        panelBeforeImage = await tracker.dataItemManager.loadBase64FromFile(panelBefore.image_base64);
                    }

                    let panelAfterImage = null;
                    if (panelAfter?.fullscreen_base64) {
                        panelAfterImage = await tracker.dataItemManager.loadBase64FromFile(panelAfter.fullscreen_base64);
                    } else if (panelAfter?.image_base64) {
                        panelAfterImage = await tracker.dataItemManager.loadBase64FromFile(panelAfter.image_base64);
                    }

                    if (panelBeforeImage && panelAfterImage) {
                        const actionPos = actionItem.metadata?.global_pos || { x: 0, y: 0, w: 100, h: 100 };
                        const panelBeforeGlobalPos = panelBefore.metadata?.global_pos || null;
                        const panelAfterGlobalPos = panelAfter.metadata?.global_pos || null;
                        const panelBeforeInfo = {
                            name: panelBefore.name || 'Panel',
                            type: panelBefore.type || 'screen',
                            verb: panelBefore.verb || 'view'
                        };
                        const panelAfterInfo = {
                            name: panelAfter.name || 'Panel',
                            type: panelAfter.type || 'screen',
                            verb: panelAfter.verb || 'view'
                        };
                        const actionInfo = {
                            name: actionItem.name || 'Action',
                            type: actionItem.type || 'button',
                            verb: actionItem.verb || 'click'
                        };

                        const stepVideoResult = await createStepVideo(
                            panelBeforeImage,
                            panelAfterImage,
                            actionPos,
                            panelBeforeInfo,
                            actionInfo,
                            tracker.sessionFolder,
                            actionId,
                            panelBeforeGlobalPos,
                            panelAfterGlobalPos,
                            panelAfterInfo
                        );

                        await tracker.dataItemManager.updateItem(actionId, {
                            metadata: {
                                ...actionItem.metadata,
                                step_video_url: stepVideoResult.videoUrl,
                                step_video_subtitles: stepVideoResult.subtitles
                            }
                        });

                        results.step_video_url = stepVideoResult.videoUrl;
                        results.step_video_subtitles = stepVideoResult.subtitles;
                        console.log(`✅ StepVideo created for action ${actionId}: ${stepVideoResult.videoUrl}`);
                        
                        // Delay 1 second before creating TrackingVideo to avoid API returning same URL
                        console.log(`[VIDEO] Waiting 1 second before creating TrackingVideo to avoid URL collision...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } else {
                results.step_video_url = existingStepVideoUrl;
                results.step_video_subtitles = actionItem.metadata.step_video_subtitles || [];
            }

            // 2. Create TrackingVideo if not exists
            // Wrap in try-catch to ensure step_video_url is still returned even if trackingVideo fails
            const existingTrackingVideoUrl = actionItem.metadata?.tracking_video_url || null;
            
            if (!existingTrackingVideoUrl && actionItem.metadata?.session_url) {
                const sessionUrl = actionItem.metadata.session_url;
                const sessionStart = actionItem.metadata.session_start || Date.now();
                
                // Get clicks for action
                let clicks = null;
                if (tracker.clickManager) {
                    clicks = await tracker.clickManager.getClicksForAction(actionId);
                }

                if (clicks && clicks.length > 0) {
                    try {
                        const trackingVideoResult = await createTrackingVideo(
                            sessionUrl,
                            sessionStart,
                            actionId,
                            clicks,
                            tracker
                        );

                        // Reload actionItem to get latest metadata (step_video may have been saved)
                        const updatedActionItem = await tracker.dataItemManager.getItem(actionId);
                        await tracker.dataItemManager.updateItem(actionId, {
                            metadata: {
                                ...updatedActionItem.metadata,
                                tracking_video_url: trackingVideoResult.videoUrl
                            }
                        });

                        results.tracking_video_url = trackingVideoResult.videoUrl;
                        console.log(`✅ TrackingVideo created for action ${actionId}: ${trackingVideoResult.videoUrl}`);
                    } catch (trackingErr) {
                        console.error(`❌ Failed to create TrackingVideo for action ${actionId}:`, trackingErr);
                        // Don't throw - allow step_video_url to be returned
                        results.tracking_video_error = trackingErr.message || 'Failed to create TrackingVideo';
                    }
                }
            } else {
                results.tracking_video_url = existingTrackingVideoUrl;
                results.session_url = actionItem.metadata?.session_url || null;
            }

            return results;
        } catch (err) {
            console.error(`Failed to generate video for action ${actionId}:`, err);
            throw err;
        }
    };

    const regenerateTrackingVideoHandler = async (actionId) => {
        try {
            const actionItem = await tracker.dataItemManager.getItem(actionId);
            if (!actionItem || actionItem.item_category !== 'ACTION') {
                throw new Error(`Action not found: ${actionId}`);
            }

            // Import video generators
            const { createTrackingVideo } = await import('../media/video-generator.js');

            const sessionUrl = actionItem.metadata?.session_url;
            const sessionStart = actionItem.metadata?.session_start || Date.now();

            if (!sessionUrl) {
                throw new Error(`No session_url found for action ${actionId}`);
            }

            // Get clicks for action
            let clicks = null;
            if (tracker.clickManager) {
                clicks = await tracker.clickManager.getClicksForAction(actionId);
            }

            if (!clicks || clicks.length === 0) {
                throw new Error(`No clicks found for action ${actionId}`);
            }

            const trackingVideoResult = await createTrackingVideo(
                sessionUrl,
                sessionStart,
                actionId,
                clicks,
                tracker
            );

            await tracker.dataItemManager.updateItem(actionId, {
                metadata: {
                    ...actionItem.metadata,
                    tracking_video_url: trackingVideoResult.videoUrl
                }
            });

            console.log(`✅ TrackingVideo regenerated for action ${actionId}: ${trackingVideoResult.videoUrl}`);
            return { tracking_video_url: trackingVideoResult.videoUrl };
        } catch (err) {
            console.error(`Failed to regenerate tracking video for action ${actionId}:`, err);
            throw err;
        }
    };

    const regenerateStepVideoHandler = async (actionId) => {
        try {
            const actionItem = await tracker.dataItemManager.getItem(actionId);
            if (!actionItem || actionItem.item_category !== 'ACTION') {
                throw new Error(`Action not found: ${actionId}`);
            }

            const step = await tracker.stepManager.getStepForAction(actionId);
            if (!step) {
                throw new Error(`Step not found for action: ${actionId}`);
            }

            // Import video generators
            const { createStepVideo } = await import('../media/video-generator.js');

            const panelBeforeId = step.panel_before?.item_id;
            const panelAfterId = step.panel_after?.item_id;

            if (!panelBeforeId || !panelAfterId) {
                throw new Error(`Panel before or after not found for action ${actionId}`);
            }

            const panelBefore = await tracker.dataItemManager.getItem(panelBeforeId);
            const panelAfter = await tracker.dataItemManager.getItem(panelAfterId);

            let panelBeforeImage = null;
            if (panelBefore?.fullscreen_base64) {
                panelBeforeImage = await tracker.dataItemManager.loadBase64FromFile(panelBefore.fullscreen_base64);
            } else if (panelBefore?.image_base64) {
                panelBeforeImage = await tracker.dataItemManager.loadBase64FromFile(panelBefore.image_base64);
            }

            let panelAfterImage = null;
            if (panelAfter?.fullscreen_base64) {
                panelAfterImage = await tracker.dataItemManager.loadBase64FromFile(panelAfter.fullscreen_base64);
            } else if (panelAfter?.image_base64) {
                panelAfterImage = await tracker.dataItemManager.loadBase64FromFile(panelAfter.image_base64);
            }

            if (!panelBeforeImage || !panelAfterImage) {
                throw new Error(`Panel images not found for action ${actionId}`);
            }

            const actionPos = actionItem.metadata?.global_pos || { x: 0, y: 0, w: 100, h: 100 };
            const panelBeforeGlobalPos = panelBefore.metadata?.global_pos || null;
            const panelAfterGlobalPos = panelAfter.metadata?.global_pos || null;
            const panelBeforeInfo = {
                name: panelBefore.name || 'Panel',
                type: panelBefore.type || 'screen',
                verb: panelBefore.verb || 'view'
            };
            const panelAfterInfo = {
                name: panelAfter.name || 'Panel',
                type: panelAfter.type || 'screen',
                verb: panelAfter.verb || 'view'
            };
            const actionInfo = {
                name: actionItem.name || 'Action',
                type: actionItem.type || 'button',
                verb: actionItem.verb || 'click'
            };

            const stepVideoResult = await createStepVideo(
                panelBeforeImage,
                panelAfterImage,
                actionPos,
                panelBeforeInfo,
                actionInfo,
                tracker.sessionFolder,
                actionId,
                panelBeforeGlobalPos,
                panelAfterGlobalPos,
                panelAfterInfo
            );

            await tracker.dataItemManager.updateItem(actionId, {
                metadata: {
                    ...actionItem.metadata,
                    step_video_url: stepVideoResult.videoUrl,
                    step_video_subtitles: stepVideoResult.subtitles
                }
            });

            console.log(`✅ StepVideo regenerated for action ${actionId}: ${stepVideoResult.videoUrl}`);
            return { 
                step_video_url: stepVideoResult.videoUrl,
                step_video_subtitles: stepVideoResult.subtitles
            };
        } catch (err) {
            console.error(`Failed to regenerate step video for action ${actionId}:`, err);
            throw err;
        }
    };

    const validateStepHandler = async () => {
        try {
            // Load panel tree - default to log mode
            // User can toggle mode via showMode button in browser
            let panelTreeData = [];
            if (tracker.panelLogManager) {
                panelTreeData = await tracker.panelLogManager.buildTreeStructure();
            }

            // Get all actions with steps
            const allItems = await tracker.dataItemManager.getAllItems();
            const actionItems = allItems.filter(item => item.item_category === 'ACTION');
            const steps = await tracker.stepManager.getAllSteps();

            // Build step data with video URLs
            const stepData = [];
            for (const step of steps) {
                const actionId = step.action?.item_id;
                if (!actionId) continue;

                const actionItem = actionItems.find(a => a.item_id === actionId);
                if (!actionItem) continue;

                const stepInfo = {
                    step_id: step.step_id,
                    action_id: actionId,
                    action_name: actionItem.name,
                    action_type: actionItem.type,
                    action_verb: actionItem.verb,
                    step_video_url: actionItem.metadata?.step_video_url || null,
                    step_video_subtitles: actionItem.metadata?.step_video_subtitles || [],
                    tracking_video_url: actionItem.metadata?.tracking_video_url || null,
                    session_url: actionItem.metadata?.session_url || null,
                    tracking_action_url: actionItem.metadata?.tracking_action_url || null,
                    tracking_panel_after_url: actionItem.metadata?.tracking_panel_after_url || null,
                    bug_flag: actionItem.bug_flag || actionItem.metadata?.bug_flag || false,
                    bug_info: actionItem.bug_info || actionItem.metadata?.bug_info || null,
                    panel_before_id: step.panel_before?.item_id || null,
                    panel_after_id: step.panel_after?.item_id || null
                };

                stepData.push(stepInfo);
            }

            // Show VideoValidationScreen
            await tracker.queuePage.evaluate((panelTreeData, stepData) => {
                const modal = document.getElementById('videoValidationModal');
                if (!modal) {
                    console.error('videoValidationModal not found');
                    return;
                }

                modal.style.display = 'flex';

                // Render panel tree
                const panelLogTree = document.getElementById('videoValidationPanelLogTree');
                if (panelLogTree && window.renderPanelTreeForValidation) {
                    window.renderPanelTreeForValidation(panelTreeData, panelLogTree);
                }

                // Store step data for later use
                window.videoValidationStepData = stepData;

                // Update SyncedPlay button state based on raw video toggle
                if (window.updateSyncedPlayButtonState) {
                    window.updateSyncedPlayButtonState();
                }
            }, panelTreeData, stepData);

        } catch (err) {
            console.error('Failed to validate step:', err);
            await tracker._broadcast({ type: 'show_toast', message: '❌ Failed to load validation data' });
        }
    };

    const raiseBugHandler = async (actionItemId, bugInfo) => {
        try {
            if (!actionItemId) {
                console.warn('⚠️ No actionItemId provided for raiseBug');
                return;
            }

            const actionItem = await tracker.dataItemManager.getItem(actionItemId);
            if (!actionItem) {
                console.warn(`⚠️ Action item not found: ${actionItemId}`);
                return;
            }

            // Update doing_item.jsonl
            const updates = {
                bug_flag: true,
                bug_info: bugInfo
            };

            // Remove bug-related fields from metadata if they exist (cleanup old way)
            if (actionItem.metadata && (actionItem.metadata.bug_flag || actionItem.metadata.bug_note)) {
                updates.metadata = { ...actionItem.metadata };
                delete updates.metadata.bug_flag;
                delete updates.metadata.bug_note;
            }

            await tracker.dataItemManager.updateItem(actionItemId, updates);

            // Update DB
            try {
                const exporter = new MySQLExporter(tracker.sessionFolder, tracker.urlTracking, tracker.myAiToolCode);
                await exporter.init();
                
                await exporter.connection.execute(
                    `UPDATE doing_item SET bug_flag = 1, bug_info = ? WHERE item_id = ? AND my_ai_tool = ?`,
                    [JSON.stringify(bugInfo), actionItemId, tracker.myAiToolCode]
                );
                
                await exporter.close();
                console.log(`✅ Updated bug info in DB for action ${actionItemId}`);
            } catch (dbErr) {
                console.error('⚠️ Failed to update bug info in DB:', dbErr);
            }

            console.log(`✅ Bug raised for action ${actionItemId}`);
            await tracker._broadcast({ type: 'show_toast', message: '✅ Bug raised successfully' });

            // Helper function to find node in tree
            const findNodeInTree = (nodes, nodeId) => {
                for (const node of nodes) {
                    if (node.panel_id === nodeId) return node;
                    if (node.children && node.children.length > 0) {
                        const found = findNodeInTree(node.children, nodeId);
                        if (found) return found;
                    }
                }
                return null;
            };

            // Refresh video validation tree if modal is open
            const isModalOpen = await tracker.queuePage.evaluate(() => {
                const modal = document.getElementById('videoValidationModal');
                return modal && modal.style.display === 'flex';
            });

            if (isModalOpen && tracker.panelLogManager) {
                // Small delay to ensure file is written
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Reload tree structure with updated bug info (default to log mode)
                const panelTreeData = await tracker.panelLogManager.buildTreeStructure();
                
                // Debug: log to verify bug_flag is in tree data
                const actionNode = findNodeInTree(panelTreeData, actionItemId);
                if (actionNode) {
                    console.log(`🔍 Debug: Action node bug_flag = ${actionNode.bug_flag}`);
                } else {
                    console.warn(`⚠️ Action node not found in tree: ${actionItemId}`);
                }
                
                // Re-render the tree in the video validation modal
                await tracker.queuePage.evaluate((panelTreeData) => {
                    const panelLogTree = document.getElementById('videoValidationPanelLogTree');
                    if (panelLogTree && window.renderPanelTreeForValidation) {
                        window.renderPanelTreeForValidation(panelTreeData, panelLogTree);
                    }
                }, panelTreeData);
            }

            // Refresh graph view if modal is open
            const isGraphModalOpen = await tracker.queuePage.evaluate(() => {
                const modal = document.getElementById('graphViewModal');
                return modal && modal.style.display !== 'none';
            });

            if (isGraphModalOpen) {
                 await tracker.queuePage.evaluate((itemId, bugInfo) => {
                     if (window.graphNetwork && window.vis && window.vis.DataSet) {
                        const network = window.graphNetwork;
                        const edges = network.body.data.edges;
                        const nodes = network.body.data.nodes;
                        
                        // Try to find as edge (Action)
                        const allEdges = edges.get();
                        const targetEdge = allEdges.find(e => e.data && e.data.actionId === itemId);
                        
                        if (targetEdge) {
                             // Update edge
                             targetEdge.data.actionBugFlag = true;
                             targetEdge.data.actionBugInfo = bugInfo;
                             targetEdge.label = '🐛';
                             edges.update(targetEdge);
                             console.log('Updated graph edge with bug info:', itemId);
                        } else {
                            // Try to find as node (Panel)
                            const targetNode = nodes.get(itemId);
                            if (targetNode) {
                                if (targetNode.data && targetNode.data.item) {
                                    targetNode.data.item.bug_flag = true;
                                    targetNode.data.item.bug_info = bugInfo;
                                }
                                
                                // Update label to show bug icon if not already there
                                if (!targetNode.label.includes('🐞')) {
                                    targetNode.label = targetNode.label + ' 🐞';
                                    nodes.update(targetNode);
                                    console.log('Updated graph node with bug info:', itemId);
                                }
                            }
                        }
                     }
                     
                     // Also update the Panel Log Tree in Graph View
                     const treeContainer = document.getElementById('graphPanelLogTree');
                     if (treeContainer) {
                         const targetNode = treeContainer.querySelector(`[data-panel-id="${itemId}"]`);
                         if (targetNode) {
                             const labelSpan = targetNode.querySelector('.graph-tree-label');
                             if (labelSpan && !labelSpan.innerHTML.includes('🐞')) {
                                 const bugIcon = document.createElement('span');
                                 bugIcon.style.marginLeft = '4px';
                                 bugIcon.style.display = 'inline-block';
                                 bugIcon.style.verticalAlign = 'middle';
                                 bugIcon.style.width = '16px';
                                 bugIcon.style.height = '16px';
                                 bugIcon.style.fontSize = '14px';
                                 bugIcon.style.cursor = 'help';
                                 bugIcon.textContent = '🐞';
                                 
                                 // Add bug tooltip behavior
                                 bugIcon.addEventListener('mouseenter', (e) => {
                                     if (window.showBugTooltip) {
                                         // Pass minimal bug info needed for tooltip
                                         const note = bugInfo?.note || null;
                                         window.showBugTooltip(e, note, bugInfo);
                                     }
                                 });
                                 bugIcon.addEventListener('mouseleave', () => {
                                     if (window.hideBugTooltip) {
                                         window.hideBugTooltip();
                                     }
                                 });
                                 
                                 labelSpan.appendChild(bugIcon);
                                 console.log('Updated graph panel log tree with bug icon:', itemId);
                             }
                         }
                     }
                 }, actionItemId, bugInfo);
            }
        } catch (err) {
            console.error('Failed to raise bug:', err);
            await tracker._broadcast({ type: 'show_toast', message: '❌ Failed to raise bug' });
        }
    };

    const showStepInfoHandler = async (edgeData, nodesData) => {
        // Load images in Node.js context
        let panelBeforeImage = null;
        let panelAfterImage = null;
        
        const step = edgeData.step;
        const actionItem = {
            name: edgeData.actionName,
            type: edgeData.actionType,
            verb: edgeData.actionVerb,
            purpose: edgeData.actionPurpose,
            metadata: edgeData.actionMetadata
        };

        // Panel Before
        let panelBeforeId = step?.panel_before?.item_id;
        
        // If doing_step doesn't have panel_before, find panel containing the action
        if (!panelBeforeId && edgeData.actionId) {
            panelBeforeId = await findPanelForAction(edgeData.actionId);
        }

        if (panelBeforeId) {
            // Try to load from DataItemManager first to get full data including fullscreen_url
            let panelBeforeItem = null;
            if (tracker.dataItemManager) {
                panelBeforeItem = await tracker.dataItemManager.getItem(panelBeforeId);
            }
            
            // If not found in DataItemManager, try nodesData
            if (!panelBeforeItem) {
                const panelBeforeNode = nodesData.find(n => n.id === panelBeforeId);
                if (panelBeforeNode && panelBeforeNode.data) {
                    panelBeforeItem = panelBeforeNode.data;
                }
            }
            
            if (panelBeforeItem) {
                panelBeforeImage = await loadPanelImage(panelBeforeItem);
                // console.log(`[StepInfo] Panel Before (${panelBeforeId}): image loaded = ${!!panelBeforeImage}, has fullscreen_base64 = ${!!panelBeforeItem.fullscreen_base64}, has fullscreen_url = ${!!panelBeforeItem.fullscreen_url}, has image_base64 = ${!!panelBeforeItem.image_base64}`);
            } else {
                console.warn(`[StepInfo] Panel Before (${panelBeforeId}): not found in DataItemManager or nodesData`);
            }
        }

        // Panel After
        if (step?.panel_after?.item_id) {
            const panelAfterId = step.panel_after.item_id;
            
            // Try to load from DataItemManager first to get full data including fullscreen_url
            let panelAfterItem = null;
            if (tracker.dataItemManager) {
                panelAfterItem = await tracker.dataItemManager.getItem(panelAfterId);
            }
            
            // If not found in DataItemManager, try nodesData
            if (!panelAfterItem) {
                const panelAfterNode = nodesData.find(n => n.id === panelAfterId);
                if (panelAfterNode && panelAfterNode.data) {
                    panelAfterItem = panelAfterNode.data;
                }
            }
            
            if (panelAfterItem) {
                panelAfterImage = await loadPanelImage(panelAfterItem);
                // console.log(`[StepInfo] Panel After (${panelAfterId}): image loaded = ${!!panelAfterImage}, has fullscreen_base64 = ${!!panelAfterItem.fullscreen_base64}, has fullscreen_url = ${!!panelAfterItem.fullscreen_url}, has image_base64 = ${!!panelAfterItem.image_base64}`);
            } else {
                console.warn(`[StepInfo] Panel After (${panelAfterId}): not found in DataItemManager or nodesData`);
            }
        }

        // Get positions
        const panelBeforeNode = panelBeforeId ? nodesData.find(n => n.id === panelBeforeId) : null;
        const panelBeforePos = panelBeforeNode?.data?.metadata?.global_pos;
        const panelAfterNode = step?.panel_after?.item_id ? nodesData.find(n => n.id === step.panel_after.item_id) : null;
        const panelAfterPos = panelAfterNode?.data?.metadata?.global_pos;
        const actionPos = actionItem.metadata?.global_pos;

        // Show info in browser context
        await tracker.queuePage.evaluate((actionItem, step, panelBeforeImage, panelAfterImage, panelBeforePos, panelAfterPos, actionPos) => {
            const infoPanel = document.getElementById('graphInfoPanel');
            const infoContent = document.getElementById('graphInfoContent');
            if (!infoPanel || !infoContent) return;

            // Set default width to 2/3 of screen
            if (!infoPanel.dataset.widthSet) {
                const screenWidth = window.innerWidth;
                infoPanel.style.width = (screenWidth * 2 / 3) + 'px';
                infoPanel.dataset.widthSet = 'true';
            }
            
            infoPanel.style.display = 'flex';

            // Update header title
            const headerTitle = infoPanel.querySelector('h4');
            if (headerTitle) {
                headerTitle.textContent = 'Step info';
            }

            let panelBeforeHtml = '';
            let panelAfterHtml = '';
            let actionInfoHtml = '';

            // Panel Before - always show frame, even if no data
            if (panelBeforeImage) {
                panelBeforeHtml = `
                    <h4 style="color:#fff;">Panel Before</h4>
                    <div id="panelBeforeImageContainer" style="position:relative; display:inline-block;">
                        <img id="panelBeforeImage" src="data:image/png;base64,${panelBeforeImage}" style="max-width:100%; border:1px solid #555; border-radius:4px; display:block;" />
                        <canvas id="panelBeforeImageCanvas" style="position:absolute; top:0; left:0; pointer-events:none;"></canvas>
                    </div>
                `;
            } else {
                panelBeforeHtml = `
                    <h4 style="color:#fff;">Panel Before</h4>
                    <div style="min-height:200px; border:2px dashed #666; border-radius:4px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.02);">
                        <p style="color:#888; margin:0; text-align:center;">No information available</p>
                    </div>
                `;
            }

            // Action Info
            actionInfoHtml = `
                <h4 style="color:#fff;">Action Info</h4>
                <p><strong>Name:</strong> ${actionItem.name || 'N/A'}</p>
                <p><strong>Type:</strong> ${actionItem.type || 'N/A'}</p>
                <p><strong>Verb:</strong> ${actionItem.verb || 'N/A'}</p>
                <p><strong>Purpose:</strong> ${actionItem.purpose || 'N/A'}</p>
            `;

            // Panel After - always show frame, even if no data
            if (panelAfterImage) {
                if (panelAfterPos) {
                    panelAfterHtml = `
                        <h4 style="color:#fff;">Panel After</h4>
                        <div id="panelAfterImageContainer" style="position:relative; display:inline-block;">
                            <img id="panelAfterImage" src="data:image/png;base64,${panelAfterImage}" style="max-width:100%; border:1px solid #555; border-radius:4px; display:block;" />
                            <canvas id="panelAfterImageCanvas" style="position:absolute; top:0; left:0; pointer-events:none;"></canvas>
                        </div>`;
                } else {
                    panelAfterHtml = `
                        <h4 style="color:#fff;">Panel After</h4>
                        <img src="data:image/png;base64,${panelAfterImage}" style="max-width:100%; border:1px solid #555; border-radius:4px;" />`;
                }
            } else {
                panelAfterHtml = `
                    <h4 style="color:#fff;">Panel After</h4>
                    <div style="min-height:200px; border:2px dashed #666; border-radius:4px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.02);">
                        <p style="color:#888; margin:0; text-align:center;">No information available</p>
                    </div>
                `;
            }

            infoContent.innerHTML = `
                <div id="stepInfoContainer" style="display:flex; flex-direction:row; gap:15px; align-items:flex-start; min-width:max-content;">
                    <div id="stepPanelBefore" style="flex:0 0 auto; min-width:300px; max-width:500px; display:flex; flex-direction:column;">
                        ${panelBeforeHtml}
                    </div>
                    <div id="stepAction" style="flex:0 0 auto; min-width:200px; max-width:300px; display:flex; flex-direction:column; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                        ${actionInfoHtml}
                    </div>
                    <div id="stepPanelAfter" style="flex:0 0 auto; min-width:300px; max-width:500px; display:flex; flex-direction:column;">
                        ${panelAfterHtml}
                    </div>
                </div>
            `;
            
            // Make images resizable and add horizontal scroll
            infoContent.style.overflowX = 'auto';
            infoContent.style.overflowY = 'auto';

            // Draw borders after HTML is set
            if (panelBeforeImage && (panelBeforePos || actionPos)) {
                const img = document.getElementById('panelBeforeImage');
                const canvas = document.getElementById('panelBeforeImageCanvas');
                if (img && canvas) {
                    const drawBorders = () => {
                        const rect = img.getBoundingClientRect();
                        canvas.width = rect.width;
                        canvas.height = rect.height;
                        canvas.style.width = rect.width + 'px';
                        canvas.style.height = rect.height + 'px';
                        const ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        const scaleX = rect.width / img.naturalWidth;
                        const scaleY = rect.height / img.naturalHeight;
                        
                        if (panelBeforePos) {
                            ctx.strokeStyle = '#00ff00';
                            ctx.lineWidth = 2;
                            ctx.strokeRect(panelBeforePos.x * scaleX, panelBeforePos.y * scaleY, panelBeforePos.w * scaleX, panelBeforePos.h * scaleY);
                        }
                        
                        if (actionPos) {
                            ctx.strokeStyle = '#ff0000';
                            ctx.lineWidth = 2;
                            ctx.strokeRect(actionPos.x * scaleX, actionPos.y * scaleY, actionPos.w * scaleX, actionPos.h * scaleY);
                        }
                    };
                    
                    if (img.complete) {
                        drawBorders();
                    } else {
                        img.onload = drawBorders;
                    }
                    
                    // Use ResizeObserver to redraw borders when image size changes
                    const resizeObserver = new ResizeObserver(() => {
                        if (img.complete) {
                            drawBorders();
                        }
                    });
                    resizeObserver.observe(img);
                    
                    // Also observe the info panel for resize
                    if (infoPanel) {
                        const panelResizeObserver = new ResizeObserver(() => {
                            if (img.complete) {
                                drawBorders();
                            }
                        });
                        panelResizeObserver.observe(infoPanel);
                    }
                }
            }

            // Draw border for panel after
            if (panelAfterImage && panelAfterPos) {
                const img = document.getElementById('panelAfterImage');
                const canvas = document.getElementById('panelAfterImageCanvas');
                if (img && canvas) {
                    const drawBorder = () => {
                        const rect = img.getBoundingClientRect();
                        canvas.width = rect.width;
                        canvas.height = rect.height;
                        canvas.style.width = rect.width + 'px';
                        canvas.style.height = rect.height + 'px';
                        const ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        const scaleX = rect.width / img.naturalWidth;
                        const scaleY = rect.height / img.naturalHeight;
                        ctx.strokeStyle = '#00ff00';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(panelAfterPos.x * scaleX, panelAfterPos.y * scaleY, panelAfterPos.w * scaleX, panelAfterPos.h * scaleY);
                    };
                    
                    if (img.complete) {
                        drawBorder();
                    } else {
                        img.onload = drawBorder;
                    }
                    
                    // Use ResizeObserver to redraw border when image size changes
                    const resizeObserver = new ResizeObserver(() => {
                        if (img.complete) {
                            drawBorder();
                        }
                    });
                    resizeObserver.observe(img);
                    
                    // Also observe the info panel for resize
                    if (infoPanel) {
                        const panelResizeObserver = new ResizeObserver(() => {
                            if (img.complete) {
                                drawBorder();
                            }
                        });
                        panelResizeObserver.observe(infoPanel);
                    }
                }
            }
        }, actionItem, step, panelBeforeImage, panelAfterImage, panelBeforePos, panelAfterPos, actionPos);
    };

    const showStepInfo = async (actionItem, step, itemMap) => {
        const infoPanel = document.getElementById('graphInfoPanel');
        const infoContent = document.getElementById('graphInfoContent');
        if (!infoPanel || !infoContent) return;

        infoPanel.style.display = 'flex';

        let panelBeforeHtml = '';
        let panelAfterHtml = '';
        let actionInfoHtml = '';

        // Panel Before - always show frame, even if no data
        if (step?.panel_before?.item_id) {
            const panelBefore = itemMap.get(step.panel_before.item_id);
            if (panelBefore) {
                let imageBase64 = null;
                if (panelBefore.fullscreen_base64) {
                    imageBase64 = await tracker.dataItemManager.loadBase64FromFile(panelBefore.fullscreen_base64);
                } else if (panelBefore.image_base64) {
                    imageBase64 = await tracker.dataItemManager.loadBase64FromFile(panelBefore.image_base64);
                }

                if (imageBase64) {
                    const panelAfter = step.panel_after?.item_id ? itemMap.get(step.panel_after.item_id) : null;
                    const panelAfterPos = panelAfter?.metadata?.global_pos;
                    const actionPos = actionItem.metadata?.global_pos;

                    panelBeforeHtml = `
                        <h4 style="color:#fff;">Panel Before</h4>
                        <div id="panelBeforeImageContainer" style="position:relative; display:inline-block;">
                            <img id="panelBeforeImage" src="data:image/png;base64,${imageBase64}" style="max-width:100%; border:1px solid #555; border-radius:4px; display:block;" />
                            <canvas id="panelBeforeImageCanvas" style="position:absolute; top:0; left:0; pointer-events:none;"></canvas>
                        </div>
                    `;
                } else {
                    panelBeforeHtml = `
                        <h4 style="color:#fff;">Panel Before</h4>
                        <div style="min-height:200px; border:2px dashed #666; border-radius:4px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.02);">
                            <p style="color:#888; margin:0; text-align:center;">No information available</p>
                        </div>
                    `;
                }
            } else {
                panelBeforeHtml = `
                    <h4 style="color:#fff;">Panel Before</h4>
                    <div style="min-height:200px; border:2px dashed #666; border-radius:4px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.02);">
                        <p style="color:#888; margin:0; text-align:center;">No information available</p>
                    </div>
                `;
            }
        } else {
            panelBeforeHtml = `
                <h4 style="color:#fff;">Panel Before</h4>
                <div style="min-height:200px; border:2px dashed #666; border-radius:4px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.02);">
                    <p style="color:#888; margin:0; text-align:center;">No information available</p>
                </div>
            `;
        }

        // Action Info
        actionInfoHtml = `
            <h4 style="color:#fff;">Action Info</h4>
            <p><strong>Name:</strong> ${actionItem.name || 'N/A'}</p>
            <p><strong>Type:</strong> ${actionItem.type || 'N/A'}</p>
            <p><strong>Verb:</strong> ${actionItem.verb || 'N/A'}</p>
            <p><strong>Purpose:</strong> ${actionItem.purpose || 'N/A'}</p>
        `;

        // Panel After - always show frame, even if no data
        if (step?.panel_after?.item_id) {
            const panelAfter = itemMap.get(step.panel_after.item_id);
            if (panelAfter) {
                let imageBase64 = null;
                if (panelAfter.fullscreen_base64) {
                    imageBase64 = await tracker.dataItemManager.loadBase64FromFile(panelAfter.fullscreen_base64);
                } else if (panelAfter.image_base64) {
                    imageBase64 = await tracker.dataItemManager.loadBase64FromFile(panelAfter.image_base64);
                }

                if (imageBase64) {
                    const panelAfterPos = panelAfter.metadata?.global_pos;
                    if (panelAfterPos) {
                        panelAfterHtml = `
                            <h4 style="color:#fff;">Panel After</h4>
                            <div id="panelAfterImageContainer" style="position:relative; display:inline-block;">
                                <img id="panelAfterImage" src="data:image/png;base64,${imageBase64}" style="max-width:100%; border:1px solid #555; border-radius:4px; display:block;" />
                                <canvas id="panelAfterImageCanvas" style="position:absolute; top:0; left:0; pointer-events:none;"></canvas>
                            </div>`;
                    } else {
                        panelAfterHtml = `
                            <h4 style="color:#fff;">Panel After</h4>
                            <img src="data:image/png;base64,${imageBase64}" style="max-width:100%; border:1px solid #555; border-radius:4px;" />`;
                    }
                } else {
                    panelAfterHtml = `
                        <h4 style="color:#fff;">Panel After</h4>
                        <div style="min-height:200px; border:2px dashed #666; border-radius:4px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.02);">
                            <p style="color:#888; margin:0; text-align:center;">No information available</p>
                        </div>
                    `;
                }
            } else {
                panelAfterHtml = `
                    <h4 style="color:#fff;">Panel After</h4>
                    <div style="min-height:200px; border:2px dashed #666; border-radius:4px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.02);">
                        <p style="color:#888; margin:0; text-align:center;">No information available</p>
                    </div>
                `;
            }
        } else {
            panelAfterHtml = `
                <h4 style="color:#fff;">Panel After</h4>
                <div style="min-height:200px; border:2px dashed #666; border-radius:4px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.02);">
                    <p style="color:#888; margin:0; text-align:center;">No information available</p>
                </div>
            `;
        }

        // Update header title
        const headerTitle = infoPanel.querySelector('h4');
        if (headerTitle) {
            headerTitle.textContent = 'Step info';
        }

        infoContent.innerHTML = `
            <div id="stepInfoContainer" style="display:flex; flex-direction:row; gap:15px; align-items:flex-start; min-width:max-content;">
                <div id="stepPanelBefore" style="flex:0 0 auto; min-width:300px; max-width:500px; display:flex; flex-direction:column;">
                    ${panelBeforeHtml}
                </div>
                <div id="stepAction" style="flex:0 0 auto; min-width:200px; max-width:300px; display:flex; flex-direction:column; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                    ${actionInfoHtml}
                </div>
                <div id="stepPanelAfter" style="flex:0 0 auto; min-width:300px; max-width:500px; display:flex; flex-direction:column;">
                    ${panelAfterHtml}
                </div>
            </div>
        `;
        
        // Make images resizable and add horizontal scroll
        infoContent.style.overflowX = 'auto';
        infoContent.style.overflowY = 'auto';

        // Draw borders after HTML is set
        if (step?.panel_before?.item_id) {
            const panelBefore = itemMap.get(step.panel_before.item_id);
            if (panelBefore) {
                const panelBeforePos = panelBefore.metadata?.global_pos;
                const actionPos = actionItem.metadata?.global_pos;

                if (panelBeforePos || actionPos) {
                    await tracker.queuePage.evaluate((beforePos, actPos) => {
                        const img = document.getElementById('panelBeforeImage');
                        const canvas = document.getElementById('panelBeforeImageCanvas');
                        if (img && canvas) {
                            const drawBorders = () => {
                                const rect = img.getBoundingClientRect();
                                canvas.width = rect.width;
                                canvas.height = rect.height;
                                canvas.style.width = rect.width + 'px';
                                canvas.style.height = rect.height + 'px';
                                const ctx = canvas.getContext('2d');
                                const scaleX = rect.width / img.naturalWidth;
                                const scaleY = rect.height / img.naturalHeight;
                                
                                if (beforePos) {
                                    ctx.strokeStyle = '#00ff00';
                                    ctx.lineWidth = 2;
                                    ctx.strokeRect(beforePos.x * scaleX, beforePos.y * scaleY, beforePos.w * scaleX, beforePos.h * scaleY);
                                }
                                
                                if (actPos) {
                                    ctx.strokeStyle = '#ff0000';
                                    ctx.lineWidth = 2;
                                    ctx.strokeRect(actPos.x * scaleX, actPos.y * scaleY, actPos.w * scaleX, actPos.h * scaleY);
                                }
                            };
                            if (img.complete) {
                                drawBorders();
                            } else {
                                img.onload = drawBorders;
                            }
                        }
                    }, panelBeforePos, actionPos);
                }
            }
        }

        // Draw border for panel after
        if (step?.panel_after?.item_id) {
            const panelAfter = itemMap.get(step.panel_after.item_id);
            if (panelAfter) {
                const panelAfterPos = panelAfter.metadata?.global_pos;
                if (panelAfterPos) {
                    await tracker.queuePage.evaluate((pos) => {
                        const img = document.getElementById('panelAfterImage');
                        const canvas = document.getElementById('panelAfterImageCanvas');
                        if (img && canvas) {
                            const drawBorder = () => {
                                const rect = img.getBoundingClientRect();
                                canvas.width = rect.width;
                                canvas.height = rect.height;
                                canvas.style.width = rect.width + 'px';
                                canvas.style.height = rect.height + 'px';
                                const ctx = canvas.getContext('2d');
                                const scaleX = rect.width / img.naturalWidth;
                                const scaleY = rect.height / img.naturalHeight;
                                ctx.strokeStyle = '#00ff00';
                                ctx.lineWidth = 2;
                                ctx.strokeRect(pos.x * scaleX, pos.y * scaleY, pos.w * scaleX, pos.h * scaleY);
                            };
                            if (img.complete) {
                                drawBorder();
                            } else {
                                img.onload = drawBorder;
                            }
                        }
                    }, panelAfterPos);
                }
            }
        }
    };

    /**
     * Get the sessions folder path (parent of session folders)
     */
    const getSessionsBasePath = () => {
        const { fileURLToPath } = require('url');
        const __filename = fileURLToPath(import.meta.url);
        return path.join(path.dirname(path.dirname(path.dirname(__filename))), 'sessions');
    };

    /**
     * Generate or get device ID
     * Uses a persistent device ID stored in account.json
     */
    const generateDeviceId = () => {
        const crypto = require('crypto');
        return crypto.randomUUID();
    };

    /**
     * Get device information
     */
    const getDeviceInfo = () => {
        const os = require('os');
        return {
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
        };
    };

    /**
     * Get account info from account.json (in project root, outside sessions folder)
     * Returns the account info or creates a new one with device_id
     */
    const getAccountInfoHandler = async () => {
        try {
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const projectRoot = path.dirname(path.dirname(path.dirname(__filename)));
            const accountPath = path.join(projectRoot, 'account.json');
            
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
                    return { success: true, data: accountData };
                }
            } catch (readErr) {
                // File doesn't exist, will create new account
                console.log('📝 No existing account.json, will create new one');
            }
            
            // Create new account with device_id
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
                role: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            console.log(`✅ Created new account with device_id: ${newAccount.device_id}, collaborator_code: ${newAccount.collaborator_code}`);
            return { success: true, data: newAccount };
        } catch (err) {
            console.error('Failed to get account info:', err);
            return { success: false, error: err.message };
        }
    };

    /** Admin password hash (MD5). Compare with md5(userInput) to allow ADMIN role. */
    const ADMIN_PASSWORD = 'a71857ea45bf9e9a3fca1e6842759dc0';

    /**
     * Validate admin password. Returns true if md5(password) === ADMIN_PASSWORD.
     * @param {string} password - Plain password from user
     * @returns {Promise<boolean>}
     */
    const validateAdminPasswordHandler = async (password) => {
        if (typeof password !== 'string') return false;
        const { createHash } = await import('crypto');
        const hash = createHash('md5').update(password, 'utf8').digest('hex');
        return hash === ADMIN_PASSWORD;
    };

    /**
     * Save account info to account.json (in project root, outside sessions folder)
     * Upserts by deviceId - overwrites existing account data
     * @param {string} role - The role to save ('DRAW', 'VALIDATE', or 'ADMIN')
     * @param {string} name - The recorder's name
     */
    const saveAccountInfoHandler = async (role, name) => {
        try {
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const projectRoot = path.dirname(path.dirname(path.dirname(__filename)));
            const accountPath = path.join(projectRoot, 'account.json');
            
            let existingAccount = null;
            
            try {
                const content = await fsp.readFile(accountPath, 'utf8');
                existingAccount = JSON.parse(content);
            } catch (readErr) {
                // File doesn't exist
            }
            
            const { randomUUID } = await import('crypto');
            const os = await import('os');
            
            const deviceId = existingAccount?.device_id || randomUUID();
            const collaboratorCode = existingAccount?.collaborator_code || `COLLAB_${deviceId.toUpperCase()}`;
            
            const accountData = {
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
                        .map(([iname, interfaces]) => ({
                            name: iname,
                            addresses: interfaces
                                .filter(iface => !iface.internal)
                                .map(iface => ({ family: iface.family, address: iface.address, mac: iface.mac }))
                        }))
                        .filter(iface => iface.addresses.length > 0)
                },
                name: name,
                role: role,
                created_at: existingAccount?.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            // Upsert - overwrite the entire file with updated account data
            await fsp.writeFile(accountPath, JSON.stringify(accountData, null, 2), 'utf8');
            
            console.log(`✅ Account info saved: ${name}, role: ${role}, device_id: ${accountData.device_id}, collaborator_code: ${accountData.collaborator_code}`);

            // Update current role and manage save reminder timer
            const previousRole = currentRole;
            currentRole = role;
            
            // Stop timer if switching from DRAW to non-DRAW
            if (previousRole === 'DRAW' && role !== 'DRAW') {
                if (reminderTimerInterval) {
                    console.log(`🔔 [Save Reminder] Stopping timer - role changed from DRAW to ${role}`);
                    clearInterval(reminderTimerInterval);
                    reminderTimerInterval = null;
                }
            }
            // Start timer if switching from non-DRAW to DRAW
            if (previousRole !== 'DRAW' && role === 'DRAW') {
                console.log(`🔔 [Save Reminder] Starting timer - role changed from ${previousRole} to DRAW`);
                startReminderTimer();
            }

            // Broadcast to hide dialog
            await tracker._broadcast({ type: 'hide_role_selection' });

            // DRAW: old flow - open tracking browser first, then CTV chọn tạo/mở session trên website selector (loadSessionData -> loadSessionAttachPage đã đúng trong loadSession)
            if (role === 'DRAW') {
                const { initTrackingBrowser } = await import('./browser-init.js');
                await initTrackingBrowser(tracker);
                console.log(`🚀 Tracking browser launched for ${role} role`);
            } else {
                // ADMIN and VALIDATE: broadcast ai_tools list -> user picks tool -> view tool -> chỉ loadSessionData (không mở tracking browser)
                const toolsRes = await getAiToolsListHandler();
                const tools = (toolsRes.data || []);
                await tracker._broadcast({ type: 'show_admin_ai_tools', tools });
                console.log(`📋 ${role} role - ai_tools list broadcast (${tools.length} tools)`);
            }

            return { success: true, data: accountData };
        } catch (err) {
            console.error('Failed to save account info:', err);
            return { success: false, error: err.message };
        }
    };

    /**
     * Save role to info.json (deprecated - kept for backward compatibility)
     * @param {string} role - The role to save ('DRAW', 'VALIDATE', or 'ADMIN')
     */
    const saveRoleHandler = async (role) => {
        // Redirect to new saveAccountInfoHandler
        return await saveAccountInfoHandler(role, 'Unknown');
    };

    /**
     * Get list of ai_tools for ADMIN (from API, same as website selector).
     * @returns {Promise<{ success: boolean, data?: Array<{code:string, website:string, toolName:string}> }>}
     */
    const getAiToolsListHandler = async () => {
        try {
            const raw = await fetchWebsiteList();
            const tools = (raw || []).map((w) => ({
                code: w.code || w.id || '',
                website: w.website || w.url || '',
                toolName: w.toolName || w.name || w.website || ''
            })).filter((t) => t.code && t.website);
            return { success: true, data: tools };
        } catch (err) {
            console.error('Failed to get ai_tools list:', err);
            return { success: false, data: [] };
        }
    };

    /**
     * ADMIN/VALIDATE: Mở tool từ danh sách ai_tool — chỉ load session data và hiển thị panel log, không mở tracking browser.
     * DRAW (nếu gọi): mở session hoặc startTracking, có thể launch tracking browser.
     * @param {string} toolCode - AI tool code
     * @returns {Promise<{ success: boolean, error?: string }>}
     */
    const adminOpenOrCreateSessionHandler = async (toolCode) => {
        if (!toolCode) {
            return { success: false, error: 'toolCode is required' };
        }
        try {
            const toolsRes = await getAiToolsListHandler();
            const tools = (toolsRes.data || []);
            const tool = tools.find((t) => t.code === toolCode);
            if (!tool) {
                return { success: false, error: `AI tool not found: ${toolCode}` };
            }

            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const projectRoot = path.dirname(path.dirname(path.dirname(__filename)));
            const sessionsPath = path.join(projectRoot, 'sessions');

            let accountRole = 'ADMIN';
            try {
                const accountPath = path.join(projectRoot, 'account.json');
                const accountContent = await fsp.readFile(accountPath, 'utf8');
                const accountData = JSON.parse(accountContent);
                if (accountData && accountData.role) accountRole = accountData.role;
            } catch (_) { /* use default */ }

            let allSessions = [];
            try {
                const sessionFolders = await fsp.readdir(sessionsPath);
                for (const folder of sessionFolders) {
                    const infoPath = path.join(sessionsPath, folder, 'info.json');
                    try {
                        const infoContent = await fsp.readFile(infoPath, 'utf8');
                        const info = JSON.parse(infoContent);
                        const sessionRole = info.role || 'DRAW';
                        if (info.toolCode === toolCode && sessionRole === accountRole) {
                            const timestamps = info.timestamps || [];
                            const lastTs = timestamps.length > 0 ? timestamps[timestamps.length - 1] : Date.now();
                            allSessions.push({
                                folder: path.join(sessionsPath, folder),
                                lastTs
                            });
                        }
                    } catch (_) { /* skip invalid */ }
                }
                allSessions.sort((a, b) => b.lastTs - a.lastTs);
            } catch (_) {
                // no sessions dir
            }

            // ADMIN/VALIDATE: chỉ load session data và hiển thị panel log, không mở tracking browser
            const isAdminOrValidate = accountRole === 'ADMIN' || accountRole === 'VALIDATE';
            if (isAdminOrValidate) {
                if (allSessions.length > 0) {
                    await tracker.loadSessionData(allSessions[0].folder);
                } else {
                    // Chưa có session: tạo folder + info.json rồi load từ DB (không mở browser)
                    const ts = Date.now();
                    await tracker.logger.initLogFile(ts, toolCode, tool.website || '');
                    await tracker.loadSessionData(tracker.logger.sessionFolder);
                }
                await tracker._broadcast({
                    type: 'current_tool',
                    toolCode: tool.code,
                    toolName: tool.toolName || tool.code,
                    website: tool.website || ''
                });
                return { success: true };
            }

            // DRAW hoặc role khác: giữ flow cũ (load session rồi mở browser nếu cần)
            if (allSessions.length > 0) {
                await tracker.loadSessionData(allSessions[0].folder);
            }

            if (!tracker.browser) {
                const { initTrackingBrowser } = await import('./browser-init.js');
                await initTrackingBrowser(tracker);
            }

            if (allSessions.length > 0) {
                await tracker.loadSessionAttachPage();
                await tracker._broadcast({
                    type: 'current_tool',
                    toolCode: tool.code,
                    toolName: tool.toolName || tool.code,
                    website: tool.website || ''
                });
                return { success: true };
            }

            await tracker.startTracking(tool.website, toolCode);
            await tracker._broadcast({
                type: 'current_tool',
                toolCode: tool.code,
                toolName: tool.toolName || tool.code,
                website: tool.website || ''
            });
            return { success: true };
        } catch (err) {
            console.error('adminOpenOrCreateSession failed:', err);
            return { success: false, error: err.message };
        }
    };

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
        incrementValidationViewCount: incrementValidationViewCountHandler,
        getValidationViewers: getValidationViewersHandler,
        deleteClickEvent: deleteClickEventHandler,
        clearAllClicksForAction: clearAllClicksForActionHandler,
        resetActionStep: resetActionStepHandler,
        detectActionPurpose: detectActionPurposeHandler,
        detectImportantActionsForPanel: detectImportantActionsForPanelHandler,
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
        handleSaveReminderResponse: handleSaveReminderResponse,
        viewGraph: viewGraphHandler,
        showPanelInfoGraph: showPanelInfoHandler,
        showStepInfoGraph: showStepInfoHandler,
        validateStep: validateStepHandler,
        raiseBug: raiseBugHandler,
        generateVideoForAction: generateVideoForActionHandler,
        regenerateTrackingVideo: regenerateTrackingVideoHandler,
        regenerateStepVideo: regenerateStepVideoHandler,
        saveRole: saveRoleHandler,
        getAccountInfo: getAccountInfoHandler,
        saveAccountInfo: saveAccountInfoHandler,
        validateAdminPassword: validateAdminPasswordHandler,
        getAiToolsList: getAiToolsListHandler,
        adminOpenOrCreateSession: adminOpenOrCreateSessionHandler
    };
}