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
}

