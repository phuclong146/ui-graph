import { promises as fsp } from 'fs';
import path from 'path';

export class PanelLogManager {
    constructor(sessionFolder) {
        this.sessionFolder = sessionFolder;
    }

    async buildTreeStructure() {
        try {
            const doingItemPath = path.join(this.sessionFolder, 'doing_item.jsonl');
            const parentPanelPath = path.join(this.sessionFolder, 'myparent_panel.jsonl');
            
            let items = [];
            let parentMap = new Map();
            
            try {
                const itemContent = await fsp.readFile(doingItemPath, 'utf8');
                items = itemContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
            } catch (err) {
                return [];
            }
            
            try {
                const parentContent = await fsp.readFile(parentPanelPath, 'utf8');
                const parents = parentContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                
                parents.forEach(p => {
                    parentMap.set(p.parent_panel, p);
                });
            } catch (err) {
            }
            
            const itemMap = new Map();
            items.forEach(item => {
                itemMap.set(item.item_id, {
                    panel_id: item.item_id,
                    name: item.name,
                    item_category: item.item_category,
                    status: item.status,
                    action_pos: item.metadata?.global_pos,
                    children: []
                });
            });
            
            const rootPanels = [];
            
            for (const [parentPanelId, parentEntry] of parentMap.entries()) {
                const parentNode = itemMap.get(parentPanelId);
                if (!parentNode) continue;
                
                if (parentEntry.child_actions && parentEntry.child_actions.length > 0) {
                    for (const actionId of parentEntry.child_actions) {
                        const actionNode = itemMap.get(actionId);
                        if (actionNode) {
                            parentNode.children.push(actionNode);
                        }
                    }
                    parentNode.children.sort((a, b) => {
                        const aY = a.action_pos?.y ?? 0;
                        const bY = b.action_pos?.y ?? 0;
                        const aX = a.action_pos?.x ?? 0;
                        const bX = b.action_pos?.x ?? 0;
                        if (aY === bY) return aX - bX;
                        return aY - bY;
                    });
                }
            }
            
            for (const item of items) {
                if (item.item_category === 'PANEL') {
                    const node = itemMap.get(item.item_id);
                    if (node) {
                        rootPanels.push(node);
                    }
                }
            }
            
            return rootPanels;
            
        } catch (err) {
            console.error('Failed to build tree structure:', err);
            return [];
        }
    }
}

