import { promises as fsp } from 'fs';
import path from 'path';

export class ParentPanelManager {
    constructor(sessionFolder) {
        this.sessionFolder = sessionFolder;
        this.parentPath = path.join(sessionFolder, 'myparent_panel.jsonl');
    }

    async init() {
        try {
            await fsp.access(this.parentPath);
        } catch {
            await fsp.writeFile(this.parentPath, '', 'utf8');
        }
    }

    async createPanelEntry(panelItemId) {
        const entry = {
            parent_panel: panelItemId,
            child_actions: [],
            child_panels: [],
            parent_dom: []
        };

        const line = JSON.stringify(entry) + '\n';
        await fsp.appendFile(this.parentPath, line, 'utf8');
    }

    async getPanelEntry(panelItemId) {
        try {
            const content = await fsp.readFile(this.parentPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            return entries.find(entry => entry.parent_panel === panelItemId) || null;
        } catch (err) {
            return null;
        }
    }

    async addChildAction(panelItemId, actionItemId) {
        try {
            const content = await fsp.readFile(this.parentPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const index = entries.findIndex(entry => entry.parent_panel === panelItemId);
            if (index === -1) return false;

            if (!entries[index].child_actions.includes(actionItemId)) {
                entries[index].child_actions.push(actionItemId);
            }

            const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            await fsp.writeFile(this.parentPath, newContent, 'utf8');
            
            return true;
        } catch (err) {
            return false;
        }
    }

    async addChildPanel(panelItemId, childPanelItemId) {
        try {
            const content = await fsp.readFile(this.parentPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const index = entries.findIndex(entry => entry.parent_panel === panelItemId);
            if (index === -1) return false;

            if (!entries[index].child_panels.includes(childPanelItemId)) {
                entries[index].child_panels.push(childPanelItemId);
            }

            const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            await fsp.writeFile(this.parentPath, newContent, 'utf8');
            
            return true;
        } catch (err) {
            return false;
        }
    }

    async removeChildAction(panelItemId, actionItemId) {
        try {
            const content = await fsp.readFile(this.parentPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const index = entries.findIndex(entry => entry.parent_panel === panelItemId);
            if (index === -1) return false;

            entries[index].child_actions = entries[index].child_actions.filter(id => id !== actionItemId);

            const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            await fsp.writeFile(this.parentPath, newContent, 'utf8');
            
            return true;
        } catch (err) {
            return false;
        }
    }

    async removeChildPanel(panelItemId, childPanelItemId) {
        try {
            const content = await fsp.readFile(this.parentPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const index = entries.findIndex(entry => entry.parent_panel === panelItemId);
            if (index === -1) return false;

            entries[index].child_panels = entries[index].child_panels.filter(id => id !== childPanelItemId);

            const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            await fsp.writeFile(this.parentPath, newContent, 'utf8');
            
            return true;
        } catch (err) {
            return false;
        }
    }

    async deletePanelEntry(panelItemId) {
        try {
            const content = await fsp.readFile(this.parentPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const remaining = entries
                .filter(entry => entry.parent_panel !== panelItemId)
                .map(entry => {
                    if (entry.child_panels.includes(panelItemId)) {
                        entry.child_panels = entry.child_panels.filter(id => id !== panelItemId);
                    }
                    return entry;
                });
            
            const newContent = remaining.map(entry => JSON.stringify(entry)).join('\n') + (remaining.length > 0 ? '\n' : '');
            await fsp.writeFile(this.parentPath, newContent, 'utf8');
            
            return entries.length - remaining.length;
        } catch (err) {
            return 0;
        }
    }

    async getAllDescendants(panelItemId) {
        const descendants = [];
        const entry = await this.getPanelEntry(panelItemId);
        
        if (!entry) return descendants;

        descendants.push(...entry.child_actions);

        for (const childPanelId of entry.child_panels) {
            descendants.push(childPanelId);
            const childDescendants = await this.getAllDescendants(childPanelId);
            descendants.push(...childDescendants);
        }

        return descendants;
    }

    async updateParentDom(panelItemId, domActions) {
        try {
            const content = await fsp.readFile(this.parentPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            const index = entries.findIndex(entry => entry.parent_panel === panelItemId);
            if (index === -1) return false;

            entries[index].parent_dom = domActions;

            const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            await fsp.writeFile(this.parentPath, newContent, 'utf8');
            
            return true;
        } catch (err) {
            return false;
        }
    }

    async getParentDom(panelItemId) {
        try {
            const entry = await this.getPanelEntry(panelItemId);
            return entry?.parent_dom || [];
        } catch (err) {
            return [];
        }
    }
}

