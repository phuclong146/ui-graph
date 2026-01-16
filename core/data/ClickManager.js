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
            console.log(`[CLICK] ✅ Click file exists: ${this.clickPath}`);
        } catch {
            await fsp.writeFile(this.clickPath, '', 'utf8');
            console.log(`[CLICK] 📄 Created new click file: ${this.clickPath}`);
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
        
        const timeStr = new Date(clickData.timestamp).toISOString();
        console.log(`[CLICK] 📝 Logged click for action ${actionItemId}:`);
        console.log(`[CLICK]    Timestamp: ${timeStr} (${clickData.timestamp})`);
        console.log(`[CLICK]    Position: (${clickData.click_x}, ${clickData.click_y})`);
        console.log(`[CLICK]    Element: ${clickData.element_tag || 'unknown'} - ${clickData.element_name || 'unnamed'}`);
        console.log(`[CLICK]    URL: ${clickData.url || 'N/A'}`);
    }

    async getClicksForAction(actionItemId) {
        try {
            const content = await fsp.readFile(this.clickPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const filtered = entries.filter(entry => entry.action_item_id === actionItemId)
                .sort((a, b) => a.timestamp - b.timestamp);
            
            console.log(`[CLICK] 🔍 Retrieved ${filtered.length} clicks for action ${actionItemId}`);
            if (filtered.length > 0) {
                console.log(`[CLICK]    First click: ${new Date(filtered[0].timestamp).toISOString()}`);
                console.log(`[CLICK]    Last click: ${new Date(filtered[filtered.length - 1].timestamp).toISOString()}`);
            }
            
            return filtered;
        } catch (err) {
            console.error(`[CLICK] ❌ Failed to get clicks for action ${actionItemId}:`, err);
            return [];
        }
    }

    async deleteClicksForAction(actionItemId) {
        try {
            const content = await fsp.readFile(this.clickPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const beforeCount = entries.length;
            const remaining = entries.filter(entry => entry.action_item_id !== actionItemId);
            const deletedCount = beforeCount - remaining.length;
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.clickPath, newContent, 'utf8');
            
            console.log(`[CLICK] 🗑️  Deleted ${deletedCount} clicks for action ${actionItemId} (${beforeCount} → ${remaining.length} total clicks)`);
            
            return deletedCount;
        } catch (err) {
            console.error(`[CLICK] ❌ Failed to delete clicks for action ${actionItemId}:`, err);
            return 0;
        }
    }

    async deleteClicksForActions(actionItemIds) {
        try {
            const content = await fsp.readFile(this.clickPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const beforeCount = entries.length;
            const remaining = entries.filter(entry => !actionItemIds.includes(entry.action_item_id));
            const deletedCount = beforeCount - remaining.length;
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.clickPath, newContent, 'utf8');
            
            console.log(`[CLICK] 🗑️  Deleted ${deletedCount} clicks for ${actionItemIds.length} actions (${beforeCount} → ${remaining.length} total clicks)`);
            console.log(`[CLICK]    Action IDs: ${actionItemIds.join(', ')}`);
            
            return deletedCount;
        } catch (err) {
            console.error(`[CLICK] ❌ Failed to delete clicks for actions:`, err);
            return 0;
        }
    }
}

