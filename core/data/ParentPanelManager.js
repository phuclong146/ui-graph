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
    async appendMyParentList(itemId, parentPanelId) {
        return this._atomicWrite(async () => {
            try {
                const doingItemPath = path.join(this.sessionFolder, 'doing_item.jsonl');
                const content = await fsp.readFile(doingItemPath, 'utf8').catch(() => '');
                const entries = content.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));

                const index = entries.findIndex(entry => entry.item_id === itemId);
                if (index === -1) return false;

                const item = entries[index];
                const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
                const list = Array.isArray(metadata.my_parent_list) ? metadata.my_parent_list : [];
                if (!list.includes(parentPanelId)) {
                    list.push(parentPanelId);
                }
                metadata.my_parent_list = list;
                entries[index] = { ...item, metadata };

                const newContent = entries.map(entry => JSON.stringify(entry)).join('\n') + (entries.length > 0 ? '\n' : '');
                await fsp.writeFile(doingItemPath, newContent, 'utf8');
                return true;
            } catch (err) {
                return false;
            }
        });
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
    /**
     * @returns {Promise<string[]>} IDs of actions removed from child (duplicates) — caller nên xóa khỏi doing_item.jsonl
     */
    async makeChild(panelParentId, panelChildId, processedPairs = new Set()) {
        //0. Khong xu ly chinh no
        if (panelParentId === panelChildId) {
            return [];
        }
        
        // Kiểm tra xem cặp này đã được xử lý chưa để tránh vòng lặp vô tận
        const pairKey = `${panelParentId}->${panelChildId}`;
        if (processedPairs.has(pairKey)) {
            const infos = await this.getActionInfo([panelParentId, panelChildId]);
            const pName = infos.find(i => i?.item_id === panelParentId)?.name ?? panelParentId;
            const cName = infos.find(i => i?.item_id === panelChildId)?.name ?? panelChildId;
            console.log(`⏭️ Skip makeChild: Pair already processed parent="${pName}" (${panelParentId}) -> child="${cName}" (${panelChildId})`);
            return [];
        }
        processedPairs.add(pairKey);
        
        //1. Load panel info
        const panelParent = await this.getPanelEntry(panelParentId);
        if (!panelParent) {
            console.log(`makeChild: Khong tim thay Panel parent id=${panelParentId}`);
            return [];
        }
        const panelChild = await this.getPanelEntry(panelChildId);
        if (!panelChild) {
            console.log(`makeChild: Khong tim thay Panel child id=${panelChildId}`);
            return [];
        }
        const panelParentInfoArray = await this.getActionInfo([panelParentId]);
        const panelChildInfoArray = await this.getActionInfo([panelChildId]);
        if (!panelChildInfoArray || panelChildInfoArray.length === 0 || !panelParentInfoArray || panelParentInfoArray.length === 0) {
            console.log(`makeChild: Khong tim thay Item trong doing_item parent=${panelParentId} child=${panelChildId}`);
            return [];
        }
        const myParent = await this.findMyParent(panelParentId);
        const panelParentInfo = panelParentInfoArray[0];
        const panelChildInfo = panelChildInfoArray[0];
        const parentName = panelParentInfo?.name ?? panelParentId;
        const childName = panelChildInfo?.name ?? panelChildId;

        // Bỏ qua xử lý nếu panelChild.type là popup hoặc newtab (không phân biệt chữ hoa/thường)
        const childType = panelChildInfo.type?.toLowerCase();
        if (childType === 'popup' || childType === 'newtab') {
            console.log(`⏭️ Skip makeChild: panelChild.type is "${panelChildInfo.type}" (${panelChildId} "${childName}")`);
            return [];
        }
        
        const parentBox = panelParentInfo.metadata?.global_pos;
        const childBox = panelChildInfo.metadata?.global_pos;
        const overlap = calcOverlapBox(parentBox, childBox);
        if (overlap === 0) {
            // Case A: Khong can loc Action, chi can set parent - child
            console.log(`makeChild: case A parent="${parentName}" (${panelParentId}) child="${childName}" (${panelChildId}) overlap=${overlap} parentBox=`, parentBox, 'childBox=', childBox);
            if (myParent && !myParent.child_panels.includes(panelChildId)) {
                myParent.child_panels.push(panelChildId);
                //update
                await this.updatePanelEntry(myParent.parent_panel, myParent);
                await this.appendMyParentList(panelChildId, myParent.parent_panel);
            }
            return [];
        } else if (overlap >= 0.95) {
            // Case D: trung len nhau thi 2 thang deu la con cua MyParent
            console.log(`makeChild: case D parent="${parentName}" (${panelParentId}) child="${childName}" (${panelChildId}) overlap=${overlap} parentBox=`, parentBox, 'childBox=', childBox);
            if (myParent && !myParent.child_panels.includes(panelChildId)) {
                myParent.child_panels.push(panelChildId);
                //update
                await this.updatePanelEntry(myParent.parent_panel, myParent);
                await this.appendMyParentList(panelChildId, myParent.parent_panel);
            }
            return [];
        } else {
            // Case BCE: co giao nhau
            const result = isBoxInside(parentBox, childBox);
            if (result === "A_in_B") {
                console.log(`makeChild: case C parent="${parentName}" (${panelParentId}) child="${childName}" (${panelChildId}) overlap=${overlap} parentBox=`, parentBox, 'childBox=', childBox);
                // 1. Gán panelParent là child của panelChild
                if (myParent && !myParent.child_panels.includes(panelChildId)) {
                    myParent.child_panels.push(panelChildId);
                    await this.updatePanelEntry(myParent.parent_panel, myParent);
                    await this.appendMyParentList(panelChildId, myParent.parent_panel);
                }
                if (!panelChild.child_panels.includes(panelParentId)) {
                    panelChild.child_panels.push(panelParentId);
                    await this.updatePanelEntry(panelChildId, panelChild);
                    await this.appendMyParentList(panelParentId, panelChildId);
                }
                // 2.1 Tìm action trùng giữa panelParent và panelChild
                const parentActionInfoC = await this.getActionInfo(panelParent.child_actions || []);
                const childActionInfoC = await this.getActionInfo(panelChild.child_actions || []);
                const parentActionIdsOverlap = new Set();
                const childActionIdsToRemoveC = new Set();
                if (parentActionInfoC && childActionInfoC) {
                    for (const parentAct of parentActionInfoC) {
                        const pBox = parentAct.metadata?.global_pos;
                        if (!pBox) continue;
                        for (const childAct of childActionInfoC) {
                            const cBox = childAct.metadata?.global_pos;
                            if (!cBox) continue;
                            if (calcOverlapBox(pBox, cBox) > 0.7) {
                                parentActionIdsOverlap.add(parentAct.item_id);
                                childActionIdsToRemoveC.add(childAct.item_id);
                            }
                        }
                    }
                }
                // 2.2 Thêm panelChildId vào my_parent_list (không trùng) cho các action trùng của panelParent
                for (const actionId of parentActionIdsOverlap) {
                    await this.appendMyParentList(actionId, panelChildId);
                }
                // 2.3 Xóa action trùng khỏi panelChild.child_actions
                if (childActionIdsToRemoveC.size > 0) {
                    panelChild.child_actions = (panelChild.child_actions || []).filter(id => !childActionIdsToRemoveC.has(id));
                    await this.updatePanelEntry(panelChildId, panelChild);
                    console.log(`makeChild: case C parent="${parentName}" child="${childName}" -> added my_parent_list for ${parentActionIdsOverlap.size} parent actions, removed ${childActionIdsToRemoveC.size} duplicate actions from child (caller will delete from doing_item)`);
                }
                return [...childActionIdsToRemoveC];
            }
            if (result === "BOTN_IN_BOTH") {
                console.log(`makeChild: case E parent="${parentName}" (${panelParentId}) child="${childName}" (${panelChildId}) overlap=${overlap} parentBox=`, parentBox, 'childBox=', childBox);
                if (myParent && !myParent.child_panels.includes(panelChildId)) {
                    myParent.child_panels.push(panelChildId);
                    //update
                    await this.updatePanelEntry(myParent.parent_panel, myParent);
                    await this.appendMyParentList(panelChildId, myParent.parent_panel);
                }                
                return [];
            }
            if (result === "NO_OVERLAP") {
                console.log(`makeChild: case A (NO_OVERLAP) parent="${parentName}" (${panelParentId}) child="${childName}" (${panelChildId}) overlap=${overlap} parentBox=`, parentBox, 'childBox=', childBox);
                if (myParent && !myParent.child_panels.includes(panelChildId)) {
                    myParent.child_panels.push(panelChildId);
                    //update
                    await this.updatePanelEntry(myParent.parent_panel, myParent);
                    await this.appendMyParentList(panelChildId, myParent.parent_panel);
                }                
                return [];
            }
        }
        console.log(`makeChild: case B parent="${parentName}" (${panelParentId}) child="${childName}" (${panelChildId}) overlap=${overlap} parentBox=`, parentBox, 'childBox=', childBox);
        const parentActionInfo = await this.getActionInfo(panelParent.child_actions);
        if (!parentActionInfo) {
            return [];
        }
        const childActionInfo = await this.getActionInfo(panelChild.child_actions);
        if (!childActionInfo) {
            return [];
        }
        //2. Tim action trung nhau (overlap > 0.7, xoa action trung ben child, chuyen action trung ben parent sang child
        const parentActionIdsToMove = new Set();
        const childActionIdsToRemove = new Set();
        for (const parentAct of parentActionInfo) {
            const pBox = parentAct.metadata?.global_pos;
            if (!pBox) continue;
            for (const childAct of childActionInfo) {
                const cBox = childAct.metadata?.global_pos;
                if (!cBox) continue;
                const overlap = calcOverlapBox(pBox, cBox);
                if (overlap > 0.7) {
                    parentActionIdsToMove.add(parentAct.item_id);
                    childActionIdsToRemove.add(childAct.item_id);
                }
            }
        }

        const originalParentActionIds = panelParent.child_actions || [];
        const originalChildActionIds = panelChild.child_actions || [];

        const newParentActionIds = originalParentActionIds.filter(id => !parentActionIdsToMove.has(id));
        const filteredChildActionIds = originalChildActionIds.filter(id => !childActionIdsToRemove.has(id));
        const newChildActionIds = [...filteredChildActionIds];
        for (const id of parentActionIdsToMove) {
            if (!newChildActionIds.includes(id)) {
                newChildActionIds.push(id);
            }
        }

        panelParent.child_actions = newParentActionIds;
        panelChild.child_actions = newChildActionIds;
        console.log(`makeChild: case B parent="${parentName}" (${panelParentId}) child="${childName}" (${panelChildId}) -> move ${parentActionIdsToMove.size} duplicate actions from parent to child, remove ${childActionIdsToRemove.size} duplicate actions from child`);
        // 3. Add panelChildId to child_panels nếu chưa có
        if (!panelParent.child_panels.includes(panelChildId)) {
            panelParent.child_panels.push(panelChildId);
        }
        // 4. Ghi lại parent & child vào file
        await this.updatePanelEntry(panelParentId, panelParent);
        await this.updatePanelEntry(panelChildId, panelChild);

        // 5. Luu my_parent_list cho action duoc chuyen va cho panel con
        for (const actionId of parentActionIdsToMove) {
            await this.appendMyParentList(actionId, panelParentId);
        }
        await this.appendMyParentList(panelChildId, panelParentId);

        // 6. De quy voi cac panel con (truyền processedPairs để tránh vòng lặp), gom ID action trùng cần xóa
        const childPanels = panelParent.child_panels;
        const removedFromRecursive = [];
        for (const cP of childPanels) {
            const rec = await this.makeChild(cP, panelChildId, processedPairs);
            removedFromRecursive.push(...rec);
        }
        return [...childActionIdsToRemove, ...removedFromRecursive];
    }
}
