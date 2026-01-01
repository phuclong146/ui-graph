import { promises as fsp } from 'fs';
import path from 'path';
import { calcOverlapBox, isBoxInside } from "../utils/utils.js";

export class ParentPanelManager {
    constructor(sessionFolder) {
        this.sessionFolder = sessionFolder;
        this.parentPath = path.join(sessionFolder, 'myparent_panel.jsonl');
        this.writeLock = Promise.resolve();
    }

    async _atomicWrite(callback) {
        this.writeLock = this.writeLock.then(callback, callback);
        return this.writeLock;
    }

    async init() {
        try {
            await fsp.access(this.parentPath);
        } catch {
            await fsp.writeFile(this.parentPath, '', 'utf8');
        }
    }

    async createPanelEntry(panelItemId) {
        return this._atomicWrite(async () => {
            const entry = {
                parent_panel: panelItemId,
                child_actions: [],
                child_panels: [],
                parent_dom: []
            };

            const line = JSON.stringify(entry) + '\n';
            await fsp.appendFile(this.parentPath, line, 'utf8');
        });
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
        return this._atomicWrite(async () => {
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
        });
    }

    async addChildPage(panelItemId, pageNumber, pageId) {
        return this._atomicWrite(async () => {
            try {
                const content = await fsp.readFile(this.parentPath, 'utf8');
                const entries = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const index = entries.findIndex(entry => entry.parent_panel === panelItemId);
                if (index === -1) return false;

                if (!entries[index].child_pages) {
                    entries[index].child_pages = [];
                }

                const existingPage = entries[index].child_pages.find(p => p.page_number === pageNumber);
                if (!existingPage) {
                    entries[index].child_pages.push({
                        page_number: pageNumber,
                        page_id: pageId,
                        child_actions: []
                    });
                }

                const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
                await fsp.writeFile(this.parentPath, newContent, 'utf8');

                return true;
            } catch (err) {
                return false;
            }
        });
    }

    async addChildActionToPage(panelItemId, pageId, actionId) {
        return this._atomicWrite(async () => {
            try {
                const content = await fsp.readFile(this.parentPath, 'utf8');
                const entries = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const index = entries.findIndex(entry => entry.parent_panel === panelItemId);
                if (index === -1) return false;

                if (!entries[index].child_pages) {
                    entries[index].child_pages = [];
                }

                const page = entries[index].child_pages.find(p => p.page_id === pageId);
                if (page && !page.child_actions.includes(actionId)) {
                    page.child_actions.push(actionId);
                }

                const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
                await fsp.writeFile(this.parentPath, newContent, 'utf8');

                return true;
            } catch (err) {
                return false;
            }
        });
    }

    async addChildPanel(panelItemId, childPanelItemId) {
        return this._atomicWrite(async () => {
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
        });
    }

    async removeChildAction(panelItemId, actionItemId) {
        return this._atomicWrite(async () => {
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
        });
    }

    async removeChildPanel(panelItemId, childPanelItemId) {
        return this._atomicWrite(async () => {
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
        });
    }

    async removeChildPage(panelItemId, pageItemId) {
        return this._atomicWrite(async () => {
            try {
                const content = await fsp.readFile(this.parentPath, 'utf8');
                const entries = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const index = entries.findIndex(entry => entry.parent_panel === panelItemId);
                if (index === -1) return false;

                if (entries[index].child_pages) {
                    entries[index].child_pages = entries[index].child_pages.filter(pg => pg.page_id !== pageItemId);
                }

                const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
                await fsp.writeFile(this.parentPath, newContent, 'utf8');

                return true;
            } catch (err) {
                return false;
            }
        });
    }

    async deletePanelEntry(panelItemId) {
        return this._atomicWrite(async () => {
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
        });
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
        return this._atomicWrite(async () => {
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
        });
    }

    async getParentDom(panelItemId) {
        try {
            const entry = await this.getPanelEntry(panelItemId);
            return entry?.parent_dom || [];
        } catch (err) {
            return [];
        }
    }

    async updatePanelEntry(panelItemId, updatedPanelData) {
        return this._atomicWrite(async () => {
            try {
                const content = await fsp.readFile(this.parentPath, 'utf8');
                let entries = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const index = entries.findIndex(entry => entry.parent_panel === panelItemId);
                if (index === -1) {
                    entries.push(updatedPanelData);
                } else {
                // 3. Ghi đè dữ liệu
                    entries[index] = updatedPanelData;
                }

                const jsonlString = entries
                    .map(e => JSON.stringify(e))
                    .join('\n') + '\n';

                await fsp.writeFile(this.parentPath, jsonlString, 'utf8');
                return true;

            } catch (err) {
                console.error("updatePanelEntry error:", err);
                return false;
            }
        });
    }

    async getActionInfo(itemIdList) {
        try {
            const doingItemPath = path.join(this.sessionFolder, 'doing_item.jsonl');
            let items = [];
            try {
                const itemContent = await fsp.readFile(doingItemPath, 'utf8');
                const allItems = itemContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                items = allItems.filter(item => itemIdList.includes(item.item_id));
            } catch (err) {
                return [];
            }
            return items;
        } catch (err) {
            return [];
        }
    }
    async findMyParent(itemId) {
        try {
            const content = await fsp.readFile(this.parentPath, 'utf8');
            const entries = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

            return entries.find(entry => entry.child_panels.includes(itemId)) || null;
        } catch (err) {
            return null;
        }
    }
    async makeChild(panelParentId, panelChildId, processedPairs = new Set()) {
        //0. Khong xu ly chinh no
        if (panelParentId === panelChildId) {
            return;
        }
        
        // Kiểm tra xem cặp này đã được xử lý chưa để tránh vòng lặp vô tận
        const pairKey = `${panelParentId}->${panelChildId}`;
        if (processedPairs.has(pairKey)) {
            console.log(`⏭️ Skip makeChild: Pair already processed (${pairKey})`);
            return;
        }
        processedPairs.add(pairKey);
        
        //1. Load panel info
        const panelParent = await this.getPanelEntry(panelParentId);
        if (!panelParent || panelParent.child_actions.length === 0) {
            console.log('makeChild: Khong tim thay Panel', panelParentId);
            return;
        }
        const panelChild = await this.getPanelEntry(panelChildId);
        if (!panelChild || panelChild.child_actions.length === 0) {
            console.log('makeChild: Khong tim thay Panel', panelChildId);
            return;
        }
        const panelParentInfoArray = await this.getActionInfo([panelParentId]);
        const panelChildInfoArray = await this.getActionInfo([panelChildId]);
        if (!panelChildInfoArray || panelChildInfoArray.length === 0 || !panelParentInfoArray || panelParentInfoArray.length === 0) {
            console.log('makeChild: Khong tim thay Item ', panelParentId, panelChildId);
            return;
        }
        const myParent = await this.findMyParent(panelParentId);
        // if (!myParent || myParent.child_panels.length === 0) {
        //     console.log('makeChild: Khong tim thay myParent của id=', panelParentId);
        //     return;
        // }
        const panelParentInfo = panelParentInfoArray[0];
        const panelChildInfo = panelChildInfoArray[0];
        const parentBox = panelParentInfo.metadata?.global_pos;
        const childBox = panelChildInfo.metadata?.global_pos;
        const overlap = calcOverlapBox(parentBox, childBox);
        if (overlap === 0) {
            // Case A: Khong can loc Action, chi can set parent - child
            if (myParent && !myParent.child_panels.includes(panelChildId)) {
                myParent.child_panels.push(panelChildId);
                //update
                await this.updatePanelEntry(myParent.parent_panel, myParent);
            }
            return;
        } else if (overlap === 1) {
            // Case D: trung len nhau thi 2 thang deu la con cua MyParent
            if (myParent && !myParent.child_panels.includes(panelChildId)) {
                myParent.child_panels.push(panelChildId);
                //update
                await this.updatePanelEntry(myParent.parent_panel, myParent);
            }
            return;
        } else {
            // Case BCE: co giao nhau
            if (isBoxInside(parentBox, childBox) === "A_in_B") {
                // Case C: doi cho Parent va Child
                if (myParent && !myParent.child_panels.includes(panelChildId)) {
                    myParent.child_panels.push(panelChildId);
                    //update
                    await this.updatePanelEntry(myParent.parent_panel, myParent);
                }
                if (!panelChild.child_panels.includes(panelParentId)) {
                    panelChild.child_panels.push(panelParentId);
                    //update
                    await this.updatePanelEntry(panelChildId, panelChild);
                }
                await this.makeChild(panelChildId, panelParentId, processedPairs);
                return;
            }
        }

        const parentActionInfo = await this.getActionInfo(panelParent.child_actions);
        if (!parentActionInfo) {
            return;
        }
        const childActionInfo = await this.getActionInfo(panelChild.child_actions);
        if (!childActionInfo) {
            return;
        }
        //2. Xóa các action của parent nằm trong child >90%
        const beforeCount = parentActionInfo.length;
        const filteredParentActions = parentActionInfo.filter(parentAct => {
            const pBox = parentAct.metadata?.global_pos;
            // Kiểm tra nếu NO child action overlap > 90%, thì giữ lại.
            const hasLargeOverlap = childActionInfo.some(childAct => {
                const cBox = childAct.metadata?.global_pos;
                const overlap = calcOverlapBox(pBox, cBox);
                return overlap > 0.9;
            });

            return !hasLargeOverlap;
        });
        const afterCount = filteredParentActions.length;
        const removedCount = beforeCount - afterCount;
        panelParent.child_actions = filteredParentActions.map(item => item.item_id);
        console.log(`🗑️ Removed ${removedCount} duplicate actions from parent panel (${beforeCount} → ${afterCount})`);
        // 3. Add panelChildId to child_panels nếu chưa có
        if (!panelParent.child_panels.includes(panelChildId)) {
            panelParent.child_panels.push(panelChildId);
        }
        // 4. Ghi lại parent vào file
        await this.updatePanelEntry(panelParentId, panelParent);
        // 5. De quy voi cac panel con (truyền processedPairs để tránh vòng lặp)
        const childPanels = panelParent.child_panels;
        for (const cP of childPanels) {
            await this.makeChild(cP, panelChildId, processedPairs);
        }
    }
}
