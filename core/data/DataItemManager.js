import { promises as fsp } from 'fs';
import path from 'path';

export class DataItemManager {
    constructor(sessionFolder) {
        this.sessionFolder = sessionFolder;
        this.itemPath = path.join(sessionFolder, 'doing_item.jsonl');
    }

    async init() {
        try {
            await fsp.access(this.itemPath);
        } catch {
            await fsp.writeFile(this.itemPath, '', 'utf8');
        }
    }

    generateItemId() {
        return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    async createPanel(name, imageBase64 = null, cropPos = null) {
        const item = {
            item_id: this.generateItemId(),
            created_at: Date.now(),
            item_category: 'PANEL',
            type: 'screen',
            name: name,
            verb: 'navigate',
            content: null,
            image_base64: imageBase64,
            image_url: null,
            crop_pos: cropPos,
            metadata: null,
            status: 'pending'
        };

        const line = JSON.stringify(item) + '\n';
        await fsp.appendFile(this.itemPath, line, 'utf8');
        
        return item.item_id;
    }

    async createAction(name, type, verb, content, position, pageNumber = null) {
        const item = {
            item_id: this.generateItemId(),
            created_at: Date.now(),
            item_category: 'ACTION',
            type: type,
            name: name,
            verb: verb,
            content: content,
            image_url: null,
            metadata: {
                p: pageNumber,
                x: position.x,
                y: position.y,
                w: position.w,
                h: position.h
            },
            status: 'pending',
            image_base64: null
        };

        const line = JSON.stringify(item) + '\n';
        await fsp.appendFile(this.itemPath, line, 'utf8');
        
        return item.item_id;
    }

    async createPage(pageNumber, imageBase64, pagePos) {
        const item = {
            item_id: this.generateItemId(),
            created_at: Date.now(),
            item_category: 'PAGE',
            type: 'screen_viewport',
            name: `Page ${pageNumber}`,
            verb: 'navigate',
            content: null,
            image_url: null,
            crop_pos: null,
            metadata: {
                p: pageNumber,
                x: pagePos.x,
                y: pagePos.y,
                w: pagePos.w,
                h: pagePos.h
            },
            status: 'pending',
            image_base64: imageBase64
        };

        const line = JSON.stringify(item) + '\n';
        await fsp.appendFile(this.itemPath, line, 'utf8');
        
        return item.item_id;
    }

    async getItem(itemId) {
        try {
            const content = await fsp.readFile(this.itemPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            return entries.find(entry => entry.item_id === itemId) || null;
        } catch (err) {
            return null;
        }
    }

    async getAllItems() {
        try {
            const content = await fsp.readFile(this.itemPath, 'utf8');
            return content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } catch (err) {
            return [];
        }
    }

    async updateItem(itemId, updates) {
        try {
            const content = await fsp.readFile(this.itemPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const index = entries.findIndex(entry => entry.item_id === itemId);
            if (index === -1) return false;

            entries[index] = { ...entries[index], ...updates };

            const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            await fsp.writeFile(this.itemPath, newContent, 'utf8');
            
            return true;
        } catch (err) {
            return false;
        }
    }

    async deleteItem(itemId) {
        try {
            const content = await fsp.readFile(this.itemPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const remaining = entries.filter(entry => entry.item_id !== itemId);
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.itemPath, newContent, 'utf8');
            
            return entries.length - remaining.length;
        } catch (err) {
            return 0;
        }
    }

    async deleteItems(itemIds) {
        try {
            const content = await fsp.readFile(this.itemPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const remaining = entries.filter(entry => !itemIds.includes(entry.item_id));
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.itemPath, newContent, 'utf8');
            
            return entries.length - remaining.length;
        } catch (err) {
            return 0;
        }
    }
}

