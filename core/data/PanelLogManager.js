import { promises as fsp } from 'fs';
import path from 'path';

export class PanelLogManager {
    constructor(sessionFolder) {
        this.sessionFolder = sessionFolder;
    }

    // Check if two rectangles overlap
    doRectsOverlap(rect1, rect2) {
        if (!rect1 || !rect2) return false;
        return !(rect1.x + rect1.w <= rect2.x || 
                 rect2.x + rect2.w <= rect1.x || 
                 rect1.y + rect1.h <= rect2.y || 
                 rect2.y + rect2.h <= rect1.y);
    }

    // Get page number from action position
    getActionPage(actionPos) {
        if (!actionPos) return null;
        if (actionPos.p !== undefined) {
            return actionPos.p;
        }
        // Calculate page from y coordinate (assuming 1080px per page)
        return Math.floor(actionPos.y / 1080) + 1;
    }

    // Compute intersections for actions within the same panel and same page
    computeActionIntersections(actions) {
        const intersections = new Map();
        
        // Group actions by page
        const actionsByPage = new Map();
        actions.forEach(action => {
            if (!action.action_pos) return;
            const page = this.getActionPage(action.action_pos);
            if (!actionsByPage.has(page)) {
                actionsByPage.set(page, []);
            }
            actionsByPage.get(page).push(action);
        });
        
        // Compute intersections for each page separately
        actionsByPage.forEach((pageActions, page) => {
            for (let i = 0; i < pageActions.length; i++) {
                const action1 = pageActions[i];
                if (!action1.action_pos) continue;
                
                let hasIntersections = false;
                
                for (let j = 0; j < pageActions.length; j++) {
                    if (i === j) continue;
                    
                    const action2 = pageActions[j];
                    if (!action2.action_pos) continue;
                    
                    if (this.doRectsOverlap(action1.action_pos, action2.action_pos)) {
                        hasIntersections = true;
                        break;
                    }
                }
                
                intersections.set(action1.panel_id, hasIntersections);
            }
        });
        
        return intersections;
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
                    draw_flow_state: item.metadata?.draw_flow_state || null,
                    bug_flag: item.bug_flag || false,
                    bug_info: item.bug_info || null,
                    bug_note: item.bug_info?.note || null,
                    modality_stacks: item.modality_stacks || null,
                    modality_stacks_reason: item.modality_stacks_reason || null,
                    children: []
                });
            });
            
            const rootPanels = [];
            
            for (const [parentPanelId, parentEntry] of parentMap.entries()) {
                const parentNode = itemMap.get(parentPanelId);
                if (!parentNode) continue;
                
                if (parentEntry.child_actions && parentEntry.child_actions.length > 0) {
                    const actionNodes = [];
                    for (const actionId of parentEntry.child_actions) {
                        const actionNode = itemMap.get(actionId);
                        if (actionNode) {
                            actionNodes.push(actionNode);
                        }
                    }
                    
                    // Compute intersections for actions in this panel
                    const intersections = this.computeActionIntersections(actionNodes);
                    
                    // Add hasIntersections flag to each action node
                    actionNodes.forEach(actionNode => {
                        actionNode.hasIntersections = intersections.get(actionNode.panel_id) || false;
                    });
                    
                    // Sort actions by position
                    actionNodes.sort((a, b) => {
                        const aY = a.action_pos?.y ?? 0;
                        const bY = b.action_pos?.y ?? 0;
                        const aX = a.action_pos?.x ?? 0;
                        const bX = b.action_pos?.x ?? 0;
                        if (aY === bY) return aX - bX;
                        return aY - bY;
                    });
                    
                    parentNode.children = actionNodes;
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

    async buildTreeStructureWithChildPanels() {
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
                    draw_flow_state: item.metadata?.draw_flow_state || null,
                    bug_flag: item.bug_flag || false,
                    bug_info: item.bug_info || null,
                    bug_note: item.bug_info?.note || null,
                    modality_stacks: item.modality_stacks || null,
                    modality_stacks_reason: item.modality_stacks_reason || null,
                    children: []
                });
            });
            
            // Helper function to build tree recursively for a panel
            const buildPanelTree = (panelId, visited = new Set()) => {
                if (visited.has(panelId)) {
                    // Prevent infinite loops
                    return null;
                }
                visited.add(panelId);
                
                const panelNode = itemMap.get(panelId);
                if (!panelNode || panelNode.item_category !== 'PANEL') {
                    return null;
                }
                
                const parentEntry = parentMap.get(panelId);
                if (!parentEntry) {
                    return panelNode;
                }
                
                const children = [];
                
                // Add child_panels first (if any)
                if (parentEntry.child_panels && parentEntry.child_panels.length > 0) {
                    for (const childPanelId of parentEntry.child_panels) {
                        const childPanel = buildPanelTree(childPanelId, new Set(visited));
                        if (childPanel) {
                            children.push(childPanel);
                        }
                    }
                }
                
                // Add child_actions (if any)
                if (parentEntry.child_actions && parentEntry.child_actions.length > 0) {
                    const actionNodes = [];
                    for (const actionId of parentEntry.child_actions) {
                        const actionNode = itemMap.get(actionId);
                        if (actionNode) {
                            actionNodes.push(actionNode);
                        }
                    }
                    
                    // Compute intersections for actions in this panel
                    const intersections = this.computeActionIntersections(actionNodes);
                    
                    // Add hasIntersections flag to each action node
                    actionNodes.forEach(actionNode => {
                        actionNode.hasIntersections = intersections.get(actionNode.panel_id) || false;
                    });
                    
                    // Sort actions by position
                    actionNodes.sort((a, b) => {
                        const aY = a.action_pos?.y ?? 0;
                        const bY = b.action_pos?.y ?? 0;
                        const aX = a.action_pos?.x ?? 0;
                        const bX = b.action_pos?.x ?? 0;
                        if (aY === bY) return aX - bX;
                        return aY - bY;
                    });
                    
                    children.push(...actionNodes);
                }
                
                panelNode.children = children;
                visited.delete(panelId);
                return panelNode;
            };
            
            // Build root panels (panels that are not child_panels of any other panel)
            const rootPanels = [];
            const allChildPanels = new Set();
            
            // Collect all child_panels
            for (const [parentPanelId, parentEntry] of parentMap.entries()) {
                if (parentEntry.child_panels && parentEntry.child_panels.length > 0) {
                    parentEntry.child_panels.forEach(childPanelId => {
                        allChildPanels.add(childPanelId);
                    });
                }
            }
            
            // Root panels are panels that are not child_panels of any other panel
            for (const item of items) {
                if (item.item_category === 'PANEL' && !allChildPanels.has(item.item_id)) {
                    const rootPanel = buildPanelTree(item.item_id);
                    if (rootPanel) {
                        rootPanels.push(rootPanel);
                    }
                }
            }
            
            return rootPanels;
            
        } catch (err) {
            console.error('Failed to build tree structure with child panels:', err);
            return [];
        }
    }

    /**
     * Format my_day (yyyyMMdd) to display dd/MM/yyyy
     */
    _formatDayLabel(myDay) {
        if (!myDay || myDay.length !== 8) return myDay || '';
        const y = myDay.slice(0, 4), m = myDay.slice(4, 6), d = myDay.slice(6, 8);
        return `${d}/${m}/${y}`;
    }

    /**
     * Format my_session (yyyyMMddHH) to display "HHh dd/MM/yyyy"
     */
    _formatSessionLabel(mySession) {
        if (!mySession || mySession.length !== 10) return mySession || '';
        const y = mySession.slice(0, 4), m = mySession.slice(4, 6), d = mySession.slice(6, 8), h = mySession.slice(8, 10);
        return `${h}h ${d}/${m}/${y}`;
    }

    /**
     * Format my_scene (yyyyMMddHHmm) to display "HH:mm dd/MM/yyyy"
     */
    _formatSceneLabel(myScene) {
        if (!myScene || myScene.length !== 12) return myScene || '';
        const y = myScene.slice(0, 4), m = myScene.slice(4, 6), d = myScene.slice(6, 8), h = myScene.slice(8, 10), min = myScene.slice(10, 12);
        return `${h}:${min} ${d}/${m}/${y}`;
    }

    /**
     * Build validation tree: day -> session -> scene -> snapshot (parent_panel -> actions).
     * Data from uigraph_validation.jsonl, doing_item.jsonl, myparent_panel.jsonl.
     */
    async buildValidationTreeStructure() {
        try {
            const validationPath = path.join(this.sessionFolder, 'uigraph_validation.jsonl');
            const doingItemPath = path.join(this.sessionFolder, 'doing_item.jsonl');
            const parentPanelPath = path.join(this.sessionFolder, 'myparent_panel.jsonl');

            let validations = [];
            const itemNameMap = new Map();
            const itemInfoMap = new Map(); // full item info for bug + modality_stacks (like log/tree mode)
            let actionToParentPanel = new Map();

            try {
                const validationContent = await fsp.readFile(validationPath, 'utf8');
                validations = validationContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line))
                    .filter(e => e.item_id && e.my_day != null && e.my_session != null && e.my_scene != null);
            } catch (err) {
                if (err.code !== 'ENOENT') console.warn('Failed to read uigraph_validation.jsonl:', err.message);
                return [];
            }

            try {
                const itemContent = await fsp.readFile(doingItemPath, 'utf8');
                const items = itemContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                items.forEach(item => {
                    if (item.item_id != null) {
                        itemNameMap.set(item.item_id, item.name || item.item_id);
                        itemInfoMap.set(item.item_id, {
                            name: item.name || item.item_id,
                            bug_flag: item.bug_flag || false,
                            bug_info: item.bug_info || null,
                            bug_note: (item.bug_info && item.bug_info.note) ? item.bug_info.note : null,
                            modality_stacks: item.modality_stacks || null,
                            modality_stacks_reason: item.modality_stacks_reason || null,
                            modality_stacks_info: item.modality_stacks_info || null
                        });
                    }
                });
            } catch (err) {
                return [];
            }

            try {
                const parentContent = await fsp.readFile(parentPanelPath, 'utf8');
                const parents = parentContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                parents.forEach(p => {
                    if (p.parent_panel && Array.isArray(p.child_actions)) {
                        p.child_actions.forEach(actionId => {
                            actionToParentPanel.set(actionId, p.parent_panel);
                        });
                    }
                });
            } catch (err) {
            }

            if (validations.length === 0) return [];

            // View count per action: lấy đúng view_count từ dòng tương ứng (key = string để tránh lệch kiểu)
            // Dùng parseInt để xử lý cả trường hợp view_count là string
            const actionViewCountMap = new Map();
            for (const row of validations) {
                const id = row.item_id;
                if (id != null) {
                    const key = String(id);
                    const v = parseInt(row.view_count, 10);
                    actionViewCountMap.set(key, isNaN(v) ? 0 : v);
                }
            }

            // Group: my_day -> my_session -> my_scene -> parent_panel -> [item_id, ...]
            // Use __no_parent__ when action is not in myparent_panel so it still appears in tree with view_count
            const NO_PARENT_KEY = '__no_parent__';
            const dayMap = new Map();
            for (const row of validations) {
                const parentPanel = actionToParentPanel.get(row.item_id) ?? NO_PARENT_KEY;
                if (!dayMap.has(row.my_day)) dayMap.set(row.my_day, new Map());
                const sessionMap = dayMap.get(row.my_day);
                if (!sessionMap.has(row.my_session)) sessionMap.set(row.my_session, new Map());
                const sceneMap = sessionMap.get(row.my_session);
                if (!sceneMap.has(row.my_scene)) sceneMap.set(row.my_scene, new Map());
                const panelMap = sceneMap.get(row.my_scene);
                if (!panelMap.has(parentPanel)) panelMap.set(parentPanel, []);
                const list = panelMap.get(parentPanel);
                if (!list.includes(row.item_id)) list.push(row.item_id);
            }

            const rootDays = [];
            const sortedDays = [...dayMap.keys()].sort();
            for (const myDay of sortedDays) {
                const sessionMap = dayMap.get(myDay);
                const sessionNodes = [];
                const sortedSessions = [...sessionMap.keys()].sort();
                for (const mySession of sortedSessions) {
                    const sceneMap = sessionMap.get(mySession);
                    const sceneNodes = [];
                    const sortedScenes = [...sceneMap.keys()].sort();
                    for (const myScene of sortedScenes) {
                        const panelMap = sceneMap.get(myScene);
                        const snapshotNodes = [];
                        for (const [parentPanelId, actionIds] of panelMap.entries()) {
                            const panelName = parentPanelId === NO_PARENT_KEY ? 'Other' : (itemNameMap.get(parentPanelId) || parentPanelId);
                            const actionNodes = actionIds.map(itemId => {
                                const info = itemInfoMap.get(itemId) || {};
                                const viewKey = String(itemId);
                                const viewCount = actionViewCountMap.has(viewKey) ? actionViewCountMap.get(viewKey) : 0;
                                return {
                                    type: 'ACTION',
                                    panel_id: itemId,
                                    name: info.name || itemNameMap.get(itemId) || itemId,
                                    item_category: 'ACTION',
                                    view_count: viewCount,
                                    bug_flag: info.bug_flag || false,
                                    bug_info: info.bug_info || null,
                                    bug_note: info.bug_note || null,
                                    modality_stacks: info.modality_stacks || null,
                                    modality_stacks_reason: info.modality_stacks_reason || null,
                                    modality_stacks_info: info.modality_stacks_info || null,
                                    children: []
                                };
                            });
                            snapshotNodes.push({
                                type: 'snapshot',
                                panel_id: parentPanelId,
                                name: panelName,
                                item_category: 'PANEL',
                                children: actionNodes
                            });
                        }
                        snapshotNodes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                        sceneNodes.push({
                            type: 'scene',
                            panel_id: null,
                            name: this._formatSceneLabel(myScene),
                            children: snapshotNodes
                        });
                    }
                    sessionNodes.push({
                        type: 'session',
                        panel_id: null,
                        name: this._formatSessionLabel(mySession),
                        children: sceneNodes
                    });
                }
                rootDays.push({
                    type: 'day',
                    panel_id: null,
                    name: this._formatDayLabel(myDay),
                    children: sessionNodes
                });
            }
            return rootDays;
        } catch (err) {
            console.error('Failed to build validation tree structure:', err);
            return [];
        }
    }
}

