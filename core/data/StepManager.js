import { promises as fsp } from 'fs';
import path from 'path';

export class StepManager {
    constructor(sessionFolder) {
        this.sessionFolder = sessionFolder;
        this.stepPath = path.join(sessionFolder, 'doing_step.jsonl');
    }

    async init() {
        try {
            await fsp.access(this.stepPath);
        } catch {
            await fsp.writeFile(this.stepPath, '', 'utf8');
        }
    }

    async createStep(panelBeforeId, actionId, panelAfterId) {
        if (!panelBeforeId || !actionId || !panelAfterId) {
            console.error('❌ Cannot create step with null values:', { panelBeforeId, actionId, panelAfterId });
            return;
        }
        
        // Đọc tất cả steps hiện có để tìm step_id lớn nhất
        let maxStepId = 0;
        try {
            const content = await fsp.readFile(this.stepPath, 'utf8');
            const existingSteps = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
            
            for (const existingStep of existingSteps) {
                if (existingStep.step_id && existingStep.step_id > maxStepId) {
                    maxStepId = existingStep.step_id;
                }
            }
        } catch (err) {
            // File chưa tồn tại hoặc rỗng, maxStepId = 0
        }
        
        // Gán step_id = maxStepId + 1
        const stepId = maxStepId + 1;
        
        const step = {
            step_id: stepId,
            panel_before: {
                item_id: panelBeforeId
            },
            action: {
                item_id: actionId
            },
            panel_after: {
                item_id: panelAfterId
            }
        };

        const line = JSON.stringify(step) + '\n';
        await fsp.appendFile(this.stepPath, line, 'utf8');
        console.log(`✅ Created step (step_id=${stepId}): ${panelBeforeId} → ${actionId} → ${panelAfterId}`);
    }

    async getStepForAction(actionId) {
        try {
            const content = await fsp.readFile(this.stepPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            return entries.find(entry => entry.action.item_id === actionId) || null;
        } catch (err) {
            return null;
        }
    }

    /**
     * Update a step by action.item_id with new fields (e.g., purpose, reason)
     * @param {string} actionId - The action item_id to find the step
     * @param {object} updates - Fields to update (e.g., { purpose: '...', reason: '...' })
     * @returns {Promise<boolean>} - True if updated successfully
     */
    async updateStep(actionId, updates) {
        try {
            const content = await fsp.readFile(this.stepPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const index = entries.findIndex(entry => entry.action.item_id === actionId);
            if (index === -1) {
                console.warn(`⚠️ Step not found for action ${actionId}`);
                return false;
            }

            // Merge updates into the step
            entries[index] = { ...entries[index], ...updates };

            const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            await fsp.writeFile(this.stepPath, newContent, 'utf8');
            
            console.log(`✅ Updated step for action ${actionId} with:`, Object.keys(updates).join(', '));
            return true;
        } catch (err) {
            console.error('Failed to update step:', err);
            return false;
        }
    }

    async getAllSteps() {
        try {
            const content = await fsp.readFile(this.stepPath, 'utf8');
            return content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } catch (err) {
            return [];
        }
    }

    async deleteStepsForAction(actionId) {
        try {
            const content = await fsp.readFile(this.stepPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const remaining = entries.filter(entry => entry.action.item_id !== actionId);
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.stepPath, newContent, 'utf8');
            
            return entries.length - remaining.length;
        } catch (err) {
            return 0;
        }
    }

    async deleteStepsForItems(itemIds) {
        try {
            const content = await fsp.readFile(this.stepPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const remaining = entries.filter(entry => 
                !itemIds.includes(entry.panel_before.item_id) &&
                !itemIds.includes(entry.action.item_id) &&
                !itemIds.includes(entry.panel_after.item_id)
            );
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.stepPath, newContent, 'utf8');
            
            return entries.length - remaining.length;
        } catch (err) {
            return 0;
        }
    }

    async cleanupInvalidSteps() {
        try {
            const content = await fsp.readFile(this.stepPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const validEntries = entries.filter(entry => 
                entry.panel_before?.item_id && 
                entry.action?.item_id && 
                entry.panel_after?.item_id
            );
            
            const invalidCount = entries.length - validEntries.length;
            
            if (invalidCount > 0) {
                const newContent = validEntries.map(entry => JSON.stringify(entry)).join('\n') + (validEntries.length > 0 ? '\n' : '');
                await fsp.writeFile(this.stepPath, newContent, 'utf8');
                console.log(`🧹 Cleaned up ${invalidCount} invalid steps`);
            }
            
            return invalidCount;
        } catch (err) {
            return 0;
        }
    }

    /**
     * Count how many times a panel appears in all steps (as panel_before or panel_after)
     * If a panel appears as both panel_before and panel_after in the same step, it counts as 2
     * @param {string} panelId - The panel item_id to count
     * @returns {Promise<number>} - Number of times the panel appears in steps
     */
    async countPanelUsageInSteps(panelId) {
        try {
            const content = await fsp.readFile(this.stepPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            let count = 0;
            for (const entry of entries) {
                if (entry.panel_before?.item_id === panelId) {
                    count++;
                }
                if (entry.panel_after?.item_id === panelId) {
                    count++;
                }
            }
            
            return count;
        } catch (err) {
            return 0;
        }
    }
}

