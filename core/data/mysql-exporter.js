import mysql from 'mysql2/promise';
import { promises as fsp } from 'fs';
import path from 'path';

const MYSQL_CONFIG = {
    host: 'mysql.clevai.vn',
    port: 3306,
    user: 'comaker',
    password: 'zwTe1ROMxeRRZAiXhCDmfNRTeFsroMLI',
    database: 'comaker',
    connectTimeout: 60000
};

export class MySQLExporter {
    constructor(sessionFolder, trackingUrl, myAiToolCode = null) {
        this.sessionFolder = sessionFolder;
        this.trackingUrl = trackingUrl;
        this.connection = null;
        this.myAiTool = myAiToolCode;
    }

    async init() {
        if (!this.myAiTool) {
            throw new Error('❌ myAiToolCode is required!');
        }
        
        this.connection = await mysql.createConnection(MYSQL_CONFIG);
        console.log('✅ MySQL connected');
    }

    normalizeName(name) {
        if (!name) return '';
        
        let normalized = name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        
        const match = normalized.match(/^(.*?)\s*\((\d+)\)\s*$/);
        if (match) {
            const baseName = match[1].trim().replace(/\s+/g, '').toUpperCase();
            const number = match[2];
            return `${baseName}-${number}`;
        }
        
        return normalized.replace(/\s+/g, '').toUpperCase();
    }

    generateMyItem(itemType, name) {
        const normalizedName = this.normalizeName(name);
        return `DOI_${itemType}_${normalizedName}`;
    }

    generateCode(itemType, name) {
        const myItem = this.generateMyItem(itemType, name);
        return `${this.myAiTool}_${myItem}`;
    }

    extractSessionId(sessionUrl) {
        if (!sessionUrl) return null;
        const match = sessionUrl.match(/\/video\/([^.]+)\./);
        return match ? match[1] : null;
    }

    async exportToMySQL() {
        try {
            const doingItemPath = path.join(this.sessionFolder, 'doing_item.jsonl');
            const myparentPanelPath = path.join(this.sessionFolder, 'myparent_panel.jsonl');
            const clickPath = path.join(this.sessionFolder, 'click.jsonl');
            
            const itemContent = await fsp.readFile(doingItemPath, 'utf8');
            const items = itemContent.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
            
            let allClicks = [];
            try {
                const clickContent = await fsp.readFile(clickPath, 'utf8');
                allClicks = clickContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
            } catch (err) {
            }
            
            const itemIdToMyItemMap = new Map();
            
            for (const item of items) {
                if (!item.item_id || !item.name) continue;
                
                const myItem = this.generateMyItem(item.item_category, item.name);
                const code = this.generateCode(item.item_category, item.name);
                
                itemIdToMyItemMap.set(item.item_id, myItem);
                
                const sessionId = item.metadata?.session_url 
                    ? this.extractSessionId(item.metadata.session_url)
                    : null;
                
                let metadataToSave = item.metadata || {};
                
                if (item.item_category === 'PANEL' && item.crop_pos) {
                    metadataToSave.panel_pos = item.crop_pos;
                }
                
                if (item.item_category === 'ACTION') {
                    const clicks = allClicks
                        .filter(c => c.action_item_id === item.item_id)
                        .map(c => ({
                            timestamp: c.timestamp,
                            pos: c.pos,
                            element_name: c.element_name,
                            element_tag: c.element_tag,
                            from_url: c.from_url
                        }));
                    if (clicks.length > 0) {
                        metadataToSave.clicks = clicks;
                    }
                }
                
                await this.connection.execute(
                    `INSERT INTO doing_item 
                     (code, my_ai_tool, my_item, type, name, image_url, 
                      item_category, verb, content, published, session_id, metadata)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE 
                        name = VALUES(name),
                        image_url = VALUES(image_url),
                        verb = VALUES(verb),
                        content = VALUES(content),
                        session_id = VALUES(session_id),
                        metadata = VALUES(metadata),
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        code ?? null,
                        this.myAiTool ?? null,
                        myItem ?? null,
                        item.type ?? null,
                        item.name ?? null,
                        item.image_url ?? null,
                        item.item_category ?? null,
                        item.verb ?? null,
                        item.content ?? null,
                        1,
                        sessionId,
                        Object.keys(metadataToSave).length > 0 ? JSON.stringify(metadataToSave) : null
                    ]
                );
            }
            
            console.log(`✅ Exported ${items.length} items to doing_item`);
            
            try {
                const parentContent = await fsp.readFile(myparentPanelPath, 'utf8');
                const parents = parentContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                
                let relationCount = 0;
                for (const parent of parents) {
                    const parentMyItem = itemIdToMyItemMap.get(parent.parent_panel);
                    if (!parentMyItem) continue;
                    
                    const allChildren = [...(parent.child_actions || []), ...(parent.child_panels || [])];
                    
                    for (const childId of allChildren) {
                        const childMyItem = itemIdToMyItemMap.get(childId);
                        if (!childMyItem) continue;
                        
                        await this.connection.execute(
                            `INSERT INTO myparent_panel 
                             (my_item_code, my_parent_item, published)
                             VALUES (?, ?, ?)
                             ON DUPLICATE KEY UPDATE 
                                my_parent_item = VALUES(my_parent_item),
                                updated_at = CURRENT_TIMESTAMP`,
                            [`${this.myAiTool}_${childMyItem}`, `${this.myAiTool}_${parentMyItem}`, 1]
                        );
                        relationCount++;
                    }
                }
                
                console.log(`✅ Exported ${relationCount} parent-child relations to myparent_panel`);
            } catch (err) {
                console.log('⚠️ No myparent_panel.jsonl found or empty');
            }
            
            try {
                const doingStepPath = path.join(this.sessionFolder, 'doing_step.jsonl');
                const stepContent = await fsp.readFile(doingStepPath, 'utf8');
                const steps = stepContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                
                let stepCount = 0;
                for (const step of steps) {
                    const actionItemId = step.action?.item_id;
                    if (!actionItemId) continue;
                    
                    const actionItem = items.find(item => item.item_id === actionItemId);
                    if (!actionItem) continue;
                    
                    const sessionId = actionItem.metadata?.session_url 
                        ? this.extractSessionId(actionItem.metadata.session_url)
                        : null;
                    
                    if (!sessionId) {
                        console.log(`⚠️ Skip step for action ${actionItem.name} - missing session_url`);
                        continue;
                    }
                    
                    const recordId = sessionId;
                    const stepId = 1;
                    const stepType = 'A-BROWSER';
                    
                    const clicks = allClicks.filter(c => c.action_item_id === actionItemId)
                        .sort((a, b) => a.timestamp - b.timestamp);
                    const stepTimestamp = clicks.length > 0 ? clicks[0].timestamp : null;
                    
                    if (!stepTimestamp) continue;
                    
                    const myStep = `DOS-${recordId}-${stepId}-${stepType}`;
                    const code = `${this.myAiTool}_${myStep}`;
                    
                    const myPanelBefore = itemIdToMyItemMap.get(step.panel_before?.item_id);
                    const myAction = itemIdToMyItemMap.get(actionItemId);
                    const myPanelAfter = itemIdToMyItemMap.get(step.panel_after?.item_id);
                    
                    if (!myPanelBefore || !myAction || !myPanelAfter) continue;
                    
                    await this.connection.execute(
                        `INSERT INTO doing_step 
                         (code, my_ai_tool, my_step, record_id, step_id, step_timestamp, step_type,
                          my_panel_before, my_action, my_panel_after, step_input, step_output, step_asset)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE 
                            step_timestamp = VALUES(step_timestamp),
                            my_panel_before = VALUES(my_panel_before),
                            my_action = VALUES(my_action),
                            my_panel_after = VALUES(my_panel_after),
                            updated_at = CURRENT_TIMESTAMP`,
                        [
                            code,
                            this.myAiTool,
                            myStep,
                            recordId,
                            stepId,
                            stepTimestamp,
                            stepType,
                            `${this.myAiTool}_${myPanelBefore}`,
                            `${this.myAiTool}_${myAction}`,
                            `${this.myAiTool}_${myPanelAfter}`,
                            null,
                            null,
                            null
                        ]
                    );
                    stepCount++;
                }
                
                console.log(`✅ Exported ${stepCount} steps to doing_step`);
            } catch (err) {
                console.log('⚠️ No doing_step.jsonl found or empty');
            }
            
        } catch (err) {
            console.error('Failed to export to MySQL:', err);
            throw err;
        }
    }

    async close() {
        if (this.connection) {
            await this.connection.end();
            console.log('✅ MySQL connection closed');
        }
    }
}

