import mysql from 'mysql2/promise';
import { promises as fsp } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { uploadPictureAndGetUrl } from '../media/uploader.js';
import { saveBase64AsFile } from '../utils/utils.js';
import { ENV } from '../config/env.js';

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

    async loadBase64FromFile(imagePath) {
        if (!imagePath || !imagePath.startsWith('images/')) {
            return null;
        }
        const fullPath = path.join(this.sessionFolder, imagePath);
        try {
            const content = await fsp.readFile(fullPath, 'utf8');
            return content.trim();
        } catch (err) {
            console.error(`Failed to load base64 from ${fullPath}:`, err);
            return null;
        }
    }

    async updateItemInJsonl(itemId, updates) {
        const doingItemPath = path.join(this.sessionFolder, 'doing_item.jsonl');
        try {
            const content = await fsp.readFile(doingItemPath, 'utf8');
            const items = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
            
            const itemIndex = items.findIndex(i => i.item_id === itemId);
            if (itemIndex !== -1) {
                items[itemIndex] = { ...items[itemIndex], ...updates };
                
                const newContent = items.map(i => JSON.stringify(i)).join('\n') + '\n';
                await fsp.writeFile(doingItemPath, newContent, 'utf8');
            }
        } catch (err) {
            console.error(`Failed to update item ${itemId} in jsonl:`, err);
        }
    }

    async generatePagesFromPanels(items, itemIdToMyItemMap) {
        const pageJsonlPath = path.join(this.sessionFolder, 'page.jsonl');
        await fsp.writeFile(pageJsonlPath, '', 'utf8');
        
        const panels = items.filter(item => item.item_category === 'PANEL');
        let totalPages = 1;
        console.log(`Processing...${panels.length} panels`);
        for (const panel of panels) {
            const globalPos = panel.metadata?.global_pos;
            if (!globalPos) continue;
            
            const base64Content = await this.loadBase64FromFile(panel.image_base64);
            if (!base64Content) continue;
            
            const imageBuffer = Buffer.from(base64Content, 'base64');
            const pageHeight = Math.min( 1080, globalPos.h);
            const numPages = Math.ceil(globalPos.h / pageHeight);
            
            console.log(`📄 Cropping panel "${panel.name}" (${globalPos.h}px) into ${numPages} pages...`);
            
            for (let pageNo = 1; pageNo <= numPages; pageNo++) {
                const yOffset = (pageNo - 1) * pageHeight;
                const actualHeight = Math.min(pageHeight, globalPos.h - yOffset);
                
                const croppedBuffer = await sharp(imageBuffer)
                    .extract({
                        left: 0,
                        top: yOffset,
                        width: globalPos.w,
                        height: actualHeight
                    })
                    .toBuffer();
                
                const croppedBase64 = croppedBuffer.toString('base64');
                const picCode = `page_${panel.item_id}_${pageNo}_${Date.now()}`;
                const fname = `${picCode}.jpg`;
                const tempFilePath = saveBase64AsFile(croppedBase64, "./screenshots", fname);
                
                let screenshotUrl = null;
                if (tempFilePath) {
                    try {
                        const resp = await uploadPictureAndGetUrl(tempFilePath, picCode, ENV.API_TOKEN);
                        const jsonData = JSON.parse(resp);
                        if (jsonData?.status === 200) {
                            screenshotUrl = jsonData.message;
                            console.log(`  ✅ Uploaded page ${pageNo}/${numPages}`);
                        }
                    } catch (uploadErr) {
                        console.error(`  ❌ Failed to upload page ${pageNo}:`, uploadErr);
                    }
                }
                
                const pageData = {
                    name: `${panel.name} Page ${pageNo}`,
                    coordinate: {
                        x: globalPos.x,
                        y: globalPos.y + yOffset,
                        w: globalPos.w,
                        h: actualHeight
                    },
                    width: globalPos.w,
                    height: actualHeight,
                    screenshot_url: screenshotUrl,
                    my_item: panel.item_id,
                    page_no: pageNo
                };
                
                await fsp.appendFile(pageJsonlPath, JSON.stringify(pageData) + '\n', 'utf8');
                totalPages++;
            }
        }
        
        console.log(`✅ Generated ${totalPages} pages in page.jsonl`);
        return totalPages;
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
                
                const globalPos = item.metadata?.global_pos || null;
                const localPos = item.metadata?.local_pos || null;
                const pageIndex = localPos?.p || null;
                
                let imageUrl = item.image_url;
                if (!imageUrl && item.image_base64) {
                    try {
                        const base64Content = await this.loadBase64FromFile(item.image_base64);
                        if (base64Content) {
                            const picCode = `${item.item_id}_${Date.now()}`;
                            const fname = `${picCode}.jpg`;
                            const tempFilePath = saveBase64AsFile(base64Content, "./screenshots", fname);
                            
                            if (tempFilePath) {
                                const resp = await uploadPictureAndGetUrl(tempFilePath, picCode, ENV.API_TOKEN);
                                const jsonData = JSON.parse(resp);
                                
                                if (jsonData?.status === 200) {
                                    imageUrl = jsonData.message;
                                    console.log(`✅ Uploaded image for ${item.item_category} "${item.name}"`);
                                    
                                    item.image_url = imageUrl;
                                    await this.updateItemInJsonl(item.item_id, { image_url: imageUrl });
                                }
                            }
                        }
                    } catch (uploadErr) {
                        console.error(`❌ Failed to upload image for ${item.name}:`, uploadErr);
                    }
                }
                
                let metadataToSave = {};
                if (localPos) {
                    metadataToSave.local_pos = localPos;
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
                      item_category, verb, content, published, session_id, page_index, coordinate, metadata)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE 
                        name = VALUES(name),
                        image_url = VALUES(image_url),
                        verb = VALUES(verb),
                        content = VALUES(content),
                        session_id = VALUES(session_id),
                        page_index = VALUES(page_index),
                        coordinate = VALUES(coordinate),
                        metadata = VALUES(metadata),
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        code ?? null,
                        this.myAiTool ?? null,
                        myItem ?? null,
                        item.type ?? null,
                        item.name ?? null,
                        imageUrl,
                        item.item_category ?? null,
                        item.verb ?? null,
                        item.content ?? null,
                        1,
                        sessionId,
                        pageIndex,
                        globalPos ? JSON.stringify(globalPos) : null,
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
                    
                    const recordId = sessionId;
                    const stepId = 1;
                    const stepType = 'A-BROWSER';
                    
                    const clicks = allClicks.filter(c => c.action_item_id === actionItemId)
                        .sort((a, b) => a.timestamp - b.timestamp);
                    const stepTimestamp = clicks.length > 0 ? clicks[0].timestamp : null;
                    
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
            
            await this.generatePagesFromPanels(items, itemIdToMyItemMap);
            
            try {
                const pageJsonlPath = path.join(this.sessionFolder, 'page.jsonl');
                const pageContent = await fsp.readFile(pageJsonlPath, 'utf8');
                const pages = pageContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                
                let pageCount = 0;
                for (const page of pages) {
                    const panelMyItem = itemIdToMyItemMap.get(page.my_item);
                    if (!panelMyItem) {
                        console.log(`⚠️ Skip page ${page.page_no} - panel my_item not found for ${page.my_item}`);
                        continue;
                    }
                    
                    const panelCode = `${this.myAiTool}_${panelMyItem}`;
                    
                    await this.connection.execute(
                        `INSERT INTO pages 
                         (name, coordinate, width, height, screenshot_url, my_item, page_no)
                         VALUES (?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE 
                            name = VALUES(name),
                            coordinate = VALUES(coordinate),
                            width = VALUES(width),
                            height = VALUES(height),
                            screenshot_url = VALUES(screenshot_url),
                            updated_at = CURRENT_TIMESTAMP`,
                        [
                            page.name,
                            JSON.stringify(page.coordinate),
                            page.width,
                            page.height,
                            page.screenshot_url,
                            panelCode,
                            page.page_no
                        ]
                    );
                    pageCount++;
                }
                
                console.log(`✅ Exported ${pageCount} pages to pages table`);
            } catch (err) {
                console.log('⚠️ No page.jsonl found or empty');
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

