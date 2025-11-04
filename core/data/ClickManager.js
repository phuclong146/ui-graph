import { promises as fsp } from 'fs';
import path from 'path';

export class ClickManager {
    constructor(sessionFolder) {
        this.sessionFolder = sessionFolder;
        this.clickPath = path.join(sessionFolder, 'click.jsonl');
    }

    async init() {
        try {
            await fsp.access(this.clickPath);
        } catch {
            await fsp.writeFile(this.clickPath, '', 'utf8');
        }
    }

    async logClick(actionItemId, clickData) {
        const entry = {
            action_item_id: actionItemId,
            timestamp: clickData.timestamp,
            pos: {
                x: clickData.click_x,
                y: clickData.click_y
            },
            element_name: clickData.element_name,
            element_tag: clickData.element_tag,
            from_url: clickData.url
        };

        const line = JSON.stringify(entry) + '\n';
        await fsp.appendFile(this.clickPath, line, 'utf8');
    }

    async getClicksForAction(actionItemId) {
        try {
            const content = await fsp.readFile(this.clickPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            return entries.filter(entry => entry.action_item_id === actionItemId)
                .sort((a, b) => a.timestamp - b.timestamp);
        } catch (err) {
            return [];
        }
    }

    async deleteClicksForAction(actionItemId) {
        try {
            const content = await fsp.readFile(this.clickPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const remaining = entries.filter(entry => entry.action_item_id !== actionItemId);
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.clickPath, newContent, 'utf8');
            
            return entries.length - remaining.length;
        } catch (err) {
            return 0;
        }
    }

    async deleteClicksForActions(actionItemIds) {
        try {
            const content = await fsp.readFile(this.clickPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const remaining = entries.filter(entry => !actionItemIds.includes(entry.action_item_id));
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.clickPath, newContent, 'utf8');
            
            return entries.length - remaining.length;
        } catch (err) {
            return 0;
        }
    }
}

