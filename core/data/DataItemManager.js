import { promises as fsp } from 'fs';
import path from 'path';

export class DataItemManager {
    constructor(sessionFolder) {
        this.sessionFolder = sessionFolder;
        this.itemPath = path.join(sessionFolder, 'doing_item.jsonl');
        this.imagesFolder = path.join(sessionFolder, 'images');
    }

    async init() {
        try {
            await fsp.access(this.itemPath);
        } catch {
            await fsp.writeFile(this.itemPath, '', 'utf8');
        }
        
        try {
            await fsp.access(this.imagesFolder);
        } catch {
            await fsp.mkdir(this.imagesFolder, { recursive: true });
        }
    }
    
    async saveBase64ToFile(itemId, base64Data) {
        if (!base64Data) return null;
        
        const fileName = `${itemId}.txt`;
        const filePath = path.join(this.imagesFolder, fileName);
        await fsp.writeFile(filePath, base64Data, 'utf8');
        
        return `images/${fileName}`;
    }
    
    async deleteImageFile(imagePath) {
        if (!imagePath || !imagePath.startsWith('images/')) return;
        
        try {
            const filePath = path.join(this.sessionFolder, imagePath);
            await fsp.unlink(filePath);
            console.log(`🗑️ Deleted image file: ${imagePath}`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`⚠️ Failed to delete image file ${imagePath}:`, error.message);
            }
        }
    }
    
    async loadBase64FromFile(pathOrBase64) {
        if (!pathOrBase64) return null;
        
        if (pathOrBase64.startsWith('images/')) {
            const filePath = path.join(this.sessionFolder, pathOrBase64);
            try {
                return await fsp.readFile(filePath, 'utf8');
            } catch (error) {
                console.error(`⚠️ Failed to load image from ${pathOrBase64}:`, error.message);
                return null;
            }
        }
        
        return pathOrBase64;
    }

    generateItemId() {
        return Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    }

    async createPanel(name, imageBase64 = null, cropArea = null) {
        const metadata = cropArea ? {
            global_pos: {
                x: cropArea.x,
                y: cropArea.y,
                w: cropArea.w,
                h: cropArea.h
            }
        } : null;
        
        const itemId = this.generateItemId();
        const imagePath = await this.saveBase64ToFile(itemId, imageBase64);
        
        const item = {
            item_id: itemId,
            created_at: Date.now(),
            item_category: 'PANEL',
            type: 'screen',
            name: name,
            verb: 'navigate',
            content: null,
            image_url: null,
            metadata: metadata,
            status: 'pending',
            image_base64: imagePath
        };

        const line = JSON.stringify(item) + '\n';
        await fsp.appendFile(this.itemPath, line, 'utf8');
        
        return item.item_id;
    }

    async createAction(name, type, verb, position, pageNumber = null) {
        const pageHeight = 1080;
        const localY = pageNumber ? position.y - (pageNumber - 1) * pageHeight : position.y;
        
        const item = {
            item_id: this.generateItemId(),
            created_at: Date.now(),
            item_category: 'ACTION',
            type: type,
            name: name,
            verb: verb,
            content: null,
            image_url: null,
            metadata: {
                local_pos: {
                    p: pageNumber,
                    x: position.x,
                    y: localY,
                    w: position.w,
                    h: position.h
                },
                global_pos: {
                    x: position.x,
                    y: position.y,
                    w: position.w,
                    h: position.h
                }
            },
            status: 'pending',
            image_base64: null
        };

        const line = JSON.stringify(item) + '\n';
        await fsp.appendFile(this.itemPath, line, 'utf8');
        
        return item.item_id;
    }

    async createPage(pageNumber, imageBase64, pagePos) {
        const itemId = this.generateItemId();
        const imagePath = await this.saveBase64ToFile(itemId, imageBase64);
        
        const item = {
            item_id: itemId,
            created_at: Date.now(),
            item_category: 'PAGE',
            type: 'screen_viewport',
            name: `Page ${pageNumber}`,
            verb: 'navigate',
            content: null,
            image_url: null,
            metadata: {
                p: pageNumber,
                x: pagePos.x,
                y: pagePos.y,
                w: pagePos.w,
                h: pagePos.h
            },
            status: 'pending',
            image_base64: imagePath
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

            const oldItem = entries[index];
            
            if ('image_base64' in updates) {
                if (updates.image_base64 === null && oldItem.image_base64) {
                    await this.deleteImageFile(oldItem.image_base64);
                } else if (updates.image_base64 && !updates.image_base64.startsWith('images/')) {
                    updates.image_base64 = await this.saveBase64ToFile(itemId, updates.image_base64);
                }
            }

            // Merge metadata để giữ lại global_pos và các metadata khác
            if ('metadata' in updates && updates.metadata !== null && typeof updates.metadata === 'object') {
                const oldMetadata = oldItem.metadata || {};
                // Merge metadata: giữ lại metadata cũ, override bằng metadata mới
                // Điều này đảm bảo global_pos được giữ lại nếu updates không có global_pos mới
                updates.metadata = {
                    ...oldMetadata,
                    ...updates.metadata
                };
            }

            entries[index] = { ...oldItem, ...updates };

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

            const itemToDelete = entries.find(entry => entry.item_id === itemId);
            if (itemToDelete && itemToDelete.image_base64) {
                await this.deleteImageFile(itemToDelete.image_base64);
            }

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

            const itemsToDelete = entries.filter(entry => itemIds.includes(entry.item_id));
            for (const item of itemsToDelete) {
                if (item.image_base64) {
                    await this.deleteImageFile(item.image_base64);
                }
            }

            const remaining = entries.filter(entry => !itemIds.includes(entry.item_id));
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.itemPath, newContent, 'utf8');
            
            return entries.length - remaining.length;
        } catch (err) {
            return 0;
        }
    }
}

