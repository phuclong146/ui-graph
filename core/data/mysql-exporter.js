import { promises as fsp } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { uploadPictureAndGetUrl } from '../media/uploader.js';
import { saveBase64AsFile, calculateHash } from '../utils/utils.js';
import { ENV } from '../config/env.js';
import { getDbPool } from './db-connection.js';
import { MAX_CAPTURE_PAGES } from '../lib/website-capture.js';

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
        
        this.connection = getDbPool();
        // console.log('✅ MySQL connected (via pool)');
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

    generateMyItem(itemType, name, panelName = null) {
        if (itemType === 'ACTION' && panelName) {
            const normalizedPanelName = this.normalizeName(panelName);
            const normalizedActionName = this.normalizeName(name);
            return `DOI-ACTION-${normalizedPanelName}-${normalizedActionName}`;
        }
        const normalizedName = this.normalizeName(name);
        return `DOI-${itemType}-${normalizedName}`;
    }

    generateCode(itemType, name, panelName = null) {
        const myItem = this.generateMyItem(itemType, name, panelName);
        return `${this.myAiTool}_${myItem}`;
    }

    extractSessionId(sessionUrl) {
        if (!sessionUrl) return null;
        const match = sessionUrl.match(/\/video\/([^.]+)\./);
        return match ? match[1] : null;
    }

    /**
     * Get record_id from info.json (first timestamp in timestamps array)
     * @param {string} sessionFolder - Optional session folder path. If not provided, uses this.sessionFolder
     * @returns {Promise<number|null>} - Record ID (initial timestamp) or null if not found
     */
    async getRecordId(sessionFolder = null) {
        const folder = sessionFolder || this.sessionFolder;
        if (!folder) {
            console.warn('⚠️ No session folder provided for getRecordId');
            return null;
        }

        try {
            const infoPath = path.join(folder, 'info.json');
            const infoContent = await fsp.readFile(infoPath, 'utf8');
            const info = JSON.parse(infoContent);
            if (info.timestamps && info.timestamps.length > 0) {
                return info.timestamps[0]; // First timestamp is the initialization timestamp
            }
        } catch (err) {
            console.warn('⚠️ Could not read info.json for record_id:', err.message);
        }

        return null;
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
                const oldItem = items[itemIndex];
                
                // Merge metadata để giữ lại các metadata khác (như global_pos, page_urls, etc.)
                if ('metadata' in updates && updates.metadata !== null && typeof updates.metadata === 'object') {
                    const oldMetadata = oldItem.metadata || {};
                    updates.metadata = {
                        ...oldMetadata,
                        ...updates.metadata
                    };
                }
                
                items[itemIndex] = { ...oldItem, ...updates };
                
                const newContent = items.map(i => JSON.stringify(i)).join('\n') + '\n';
                await fsp.writeFile(doingItemPath, newContent, 'utf8');
            }
        } catch (err) {
            console.error(`Failed to update item ${itemId} in jsonl:`, err);
        }
    }

    /**
     * Update a step in doing_step.jsonl by action.item_id
     * @param {string} actionItemId - The action item_id to find the step
     * @param {object} updates - Fields to update (e.g., { purpose: '...', reason: '...' })
     */
    async updateStepInJsonl(actionItemId, updates) {
        const doingStepPath = path.join(this.sessionFolder, 'doing_step.jsonl');
        try {
            const content = await fsp.readFile(doingStepPath, 'utf8');
            const steps = content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
            
            const stepIndex = steps.findIndex(s => s.action?.item_id === actionItemId);
            if (stepIndex !== -1) {
                steps[stepIndex] = { ...steps[stepIndex], ...updates };
                
                const newContent = steps.map(s => JSON.stringify(s)).join('\n') + '\n';
                await fsp.writeFile(doingStepPath, newContent, 'utf8');
                console.log(`✅ Updated step in jsonl for action ${actionItemId}`);
            }
        } catch (err) {
            console.error(`Failed to update step for action ${actionItemId} in jsonl:`, err);
        }
    }

    async generatePagesFromPanels(items, itemIdToMyItemMap) {
        const pageJsonlPath = path.join(this.sessionFolder, 'page.jsonl');
        await fsp.writeFile(pageJsonlPath, '', 'utf8');
        
        const panels = items.filter(item => item.item_category === 'PANEL');
        let totalPages = 0;
        console.log(`Processing...${panels.length} panels`);
        for (const panel of panels) {
            const globalPos = panel.metadata?.global_pos;
            if (!globalPos) continue;
            
            const base64Content = await this.loadBase64FromFile(panel.image_base64);
            if (!base64Content) continue;
            
            const imageBuffer = Buffer.from(base64Content, 'base64');
            
            // Calculate hash of the current image to check if it has changed
            const currentImageHash = await calculateHash(base64Content);
            const storedImageHash = panel.metadata?.image_hash;
            const storedPageUrls = panel.metadata?.page_urls || {};
            
            // Check if image has changed
            const imageChanged = storedImageHash !== currentImageHash;
            
            const pageHeight = Math.min( 1080, globalPos.h);
            let numPages = Math.ceil(globalPos.h / pageHeight);
            
            // Áp dụng giới hạn tối đa số trang (đặc biệt cho After Login Panel)
            if (numPages > MAX_CAPTURE_PAGES) {
                console.log(`⚠️ Limiting pages from ${numPages} to ${MAX_CAPTURE_PAGES} pages for panel "${panel.name}" (maxSections limit)`);
                numPages = MAX_CAPTURE_PAGES;
            }
            
            console.log(`📄 Cropping panel "${panel.name}" (${globalPos.h}px) into ${numPages} pages...`);
            
            const pageUrls = {};
            let hasUpdates = false;
            
            for (let pageNo = 1; pageNo <= numPages; pageNo++) {
                const yOffset = (pageNo - 1) * pageHeight;
                const actualHeight = Math.min(pageHeight, globalPos.h - yOffset);
                
                // Check if this page needs upload
                const existingUrl = storedPageUrls[pageNo];
                const needsUpload = imageChanged || !existingUrl;
                
                let screenshotUrl = existingUrl || null;
                
                if (needsUpload) {
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
                    
                    if (tempFilePath) {
                        try {
                            screenshotUrl = await uploadPictureAndGetUrl(tempFilePath, picCode, ENV.API_TOKEN);
                            if (screenshotUrl) {
                                console.log(`  ✅ Uploaded page ${pageNo}/${numPages}: ${screenshotUrl}`);
                                hasUpdates = true;
                            } else {
                                console.error(`  ❌ Upload failed for page ${pageNo}: status ${jsonData?.status}, response: ${resp}`);
                            }
                        } catch (uploadErr) {
                            console.error(`  ❌ Failed to upload page ${pageNo}:`, uploadErr);
                        }
                    } else {
                        console.error(`  ❌ Failed to save temp file for page ${pageNo}`);
                    }
                } else {
                    console.log(`  ⏭️  Skipped page ${pageNo}/${numPages} (already uploaded): ${existingUrl}`);
                }
                
                pageUrls[pageNo] = screenshotUrl;
                
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
                    screenshot_url: screenshotUrl || null,
                    my_item: panel.item_id,
                    page_no: pageNo
                };
                
                await fsp.appendFile(pageJsonlPath, JSON.stringify(pageData) + '\n', 'utf8');
                totalPages++;
            }
            
            // Update panel metadata with hash and page URLs if there were changes
            if (imageChanged || hasUpdates) {
                const updatedMetadata = {
                    ...panel.metadata,
                    image_hash: currentImageHash,
                    page_urls: pageUrls
                };
                await this.updateItemInJsonl(panel.item_id, { metadata: updatedMetadata });
            }
        }
        
        console.log(`✅ Generated ${totalPages} pages in page.jsonl`);
        return totalPages;
    }

    async exportToMySQL() {
        try {
            // Get record_id from info.json
            const recordId = await this.getRecordId();

            // Mark all existing records for this ai_tool as published=false before saving new ones
            try {
                await this.connection.execute(
                    `UPDATE doing_item SET published = 0 WHERE my_ai_tool = ?`,
                    [this.myAiTool]
                );
                await this.connection.execute(
                    `UPDATE pages SET published = 0 WHERE my_item LIKE ?`,
                    [`${this.myAiTool}_%`]
                );
                await this.connection.execute(
                    `UPDATE doing_step SET published = 0 WHERE my_ai_tool = ?`,
                    [this.myAiTool]
                );
                await this.connection.execute(
                    `UPDATE myparent_panel SET published = 0 WHERE my_item_code LIKE ?`,
                    [`${this.myAiTool}_%`]
                );
                await this.connection.execute(
                    `UPDATE uigraph_validation SET published = 0 WHERE my_ai_tool = ?`,
                    [this.myAiTool]
                );
                console.log(`✅ Marked all existing records for ai_tool=${this.myAiTool} as published=false`);
            } catch (err) {
                console.warn('⚠️ Could not mark existing records as published=false:', err.message);
            }

            // Collections to track saved codes
            const savedDoingItemCodes = new Set();
            const savedPageCodes = new Set();
            const savedDoingStepCodes = new Set();
            const savedMyparentPanelCodes = new Set();

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
            
            // Build actionId -> panelId map from myparent_panel.jsonl
            const actionIdToPanelIdMap = new Map();
            const panelIdToPanelNameMap = new Map();
            const panelIdToParentEntryMap = new Map();
            
            try {
                const parentContent = await fsp.readFile(myparentPanelPath, 'utf8');
                const parents = parentContent.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                
                // Build panelId -> panelName map from items
                for (const item of items) {
                    if (item.item_category === 'PANEL' && item.item_id && item.name) {
                        panelIdToPanelNameMap.set(item.item_id, item.name);
                    }
                }
                
                // Build actionId -> panelId map and panelId -> parentEntry map
                for (const parent of parents) {
                    const panelId = parent.parent_panel;
                    
                    // Store parent entry for easy access
                    panelIdToParentEntryMap.set(panelId, parent);
                    
                    // Handle direct child_actions
                    if (parent.child_actions && Array.isArray(parent.child_actions)) {
                        for (const actionId of parent.child_actions) {
                            actionIdToPanelIdMap.set(actionId, panelId);
                        }
                    }
                    
                    // Handle child_actions in child_pages
                    if (parent.child_pages && Array.isArray(parent.child_pages)) {
                        for (const page of parent.child_pages) {
                            if (page.child_actions && Array.isArray(page.child_actions)) {
                                for (const actionId of page.child_actions) {
                                    actionIdToPanelIdMap.set(actionId, panelId);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('⚠️ Could not read myparent_panel.jsonl for action-panel mapping:', err.message);
            }
            
            const itemIdToMyItemMap = new Map();
            
            for (const item of items) {
                if (!item.item_id || !item.name) continue;
                
                // For ACTION items, find the parent panel and use its name
                let panelName = null;
                if (item.item_category === 'ACTION') {
                    const panelId = actionIdToPanelIdMap.get(item.item_id);
                    if (panelId) {
                        panelName = panelIdToPanelNameMap.get(panelId);
                    }
                }
                
                const myItem = this.generateMyItem(item.item_category, item.name, panelName);
                const code = this.generateCode(item.item_category, item.name, panelName);
                
                itemIdToMyItemMap.set(item.item_id, myItem);
                
                const sessionId = item.metadata?.session_url 
                    ? this.extractSessionId(item.metadata.session_url)
                    : null;
                
                const globalPos = item.metadata?.global_pos || null;
                const localPos = item.metadata?.local_pos || null;
                const pageIndex = localPos?.p || null;
                
                let imageUrl = item.image_url;
                let fullscreenUrl = item.fullscreen_url || null;

                // Upload image_base64 -> image_url (chỉ upload nếu chưa có URL hoặc ảnh đã thay đổi)
                if (item.image_base64) {
                    try {
                        const base64Content = await this.loadBase64FromFile(item.image_base64);
                        if (base64Content) {
                            // Tính hash của ảnh hiện tại
                            const currentImageHash = await calculateHash(base64Content);
                            const storedImageHash = item.metadata?.image_hash;
                            
                            // Chỉ upload nếu chưa có URL hoặc hash đã thay đổi
                            const needsUpload = !imageUrl || (storedImageHash !== currentImageHash);
                            
                            if (needsUpload) {
                                const picCode = `${item.item_id}_${Date.now()}`;
                                const fname = `${picCode}.jpg`;
                                const tempFilePath = saveBase64AsFile(base64Content, "./screenshots", fname);
                                
                                if (tempFilePath) {
                                    const imageUrl = await uploadPictureAndGetUrl(tempFilePath, picCode, ENV.API_TOKEN);
                                    
                                    if (imageUrl) {
                                        console.log(`✅ Uploaded image for ${item.item_category} "${item.name}"`);
                                        
                                        item.image_url = imageUrl;
                                        // Cập nhật metadata với hash mới
                                        const updatedMetadata = {
                                            ...item.metadata,
                                            image_hash: currentImageHash
                                        };
                                        await this.updateItemInJsonl(item.item_id, { 
                                            image_url: imageUrl,
                                            metadata: updatedMetadata 
                                        });
                                    }
                                }
                            } else {
                                console.log(`⏭️  Skipped image upload for ${item.item_category} "${item.name}" (already uploaded)`);
                            }
                        }
                    } catch (uploadErr) {
                        console.error(`❌ Failed to upload image for ${item.name}:`, uploadErr);
                    }
                }

                // Upload fullscreen_base64 -> fullscreen_url (chỉ upload nếu chưa có URL hoặc ảnh đã thay đổi)
                if (item.fullscreen_base64) {
                    try {
                        const fullscreenBase64 = await this.loadBase64FromFile(item.fullscreen_base64);
                        if (fullscreenBase64) {
                            // Tính hash của ảnh fullscreen hiện tại
                            const currentFullscreenHash = await calculateHash(fullscreenBase64);
                            const storedFullscreenHash = item.metadata?.fullscreen_hash;
                            
                            // Chỉ upload nếu chưa có URL hoặc hash đã thay đổi
                            const needsUpload = !fullscreenUrl || (storedFullscreenHash !== currentFullscreenHash);
                            
                            if (needsUpload) {
                                const picCode = `${item.item_id}_full_${Date.now()}`;
                                const fname = `${picCode}.jpg`;
                                const tempFilePath = saveBase64AsFile(fullscreenBase64, "./screenshots", fname);

                                if (tempFilePath) {
                                    const fullscreenUrl = await uploadPictureAndGetUrl(tempFilePath, picCode, ENV.API_TOKEN);

                                    if (fullscreenUrl) {
                                        console.log(`✅ Uploaded fullscreen image for ${item.item_category} "${item.name}"`);

                                        item.fullscreen_url = fullscreenUrl;
                                        // Cập nhật metadata với hash mới
                                        const updatedMetadata = {
                                            ...item.metadata,
                                            fullscreen_hash: currentFullscreenHash
                                        };
                                        await this.updateItemInJsonl(item.item_id, { 
                                            fullscreen_url: fullscreenUrl,
                                            metadata: updatedMetadata 
                                        });
                                    }
                                }
                            } else {
                                console.log(`⏭️  Skipped fullscreen image upload for ${item.item_category} "${item.name}" (already uploaded)`);
                            }
                        }
                    } catch (uploadErr) {
                        console.error(`❌ Failed to upload fullscreen image for ${item.name}:`, uploadErr);
                    }
                }
                
                // Lưu toàn bộ item.metadata vào DB
                let metadataToSave = item.metadata ? { ...item.metadata } : {};
                
                // Bổ sung clicks cho ACTION items nếu có
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
                
                // Bổ sung child_actions, child_panels, parent_dom cho PANEL items
                if (item.item_category === 'PANEL') {
                    const parentEntry = panelIdToParentEntryMap.get(item.item_id);
                    if (parentEntry) {
                        if (parentEntry.child_actions && Array.isArray(parentEntry.child_actions) && parentEntry.child_actions.length > 0) {
                            metadataToSave.child_actions = parentEntry.child_actions;
                        }
                        if (parentEntry.child_panels && Array.isArray(parentEntry.child_panels) && parentEntry.child_panels.length > 0) {
                            metadataToSave.child_panels = parentEntry.child_panels;
                        }
                        if (parentEntry.parent_dom && Array.isArray(parentEntry.parent_dom) && parentEntry.parent_dom.length > 0) {
                            metadataToSave.parent_dom = parentEntry.parent_dom;
                        }
                    }
                }
                
                // Build conditional update clause for purpose/reason
                // Only update if jsonl has values, otherwise keep existing DB values
                const purposeUpdateClause = item.purpose ? ', purpose = VALUES(purpose)' : '';
                const reasonUpdateClause = item.reason ? ', reason = VALUES(reason)' : '';
                
                // Handle modality_stacks - convert array to JSON string if present
                let modalityStacksJson = null;
                if (item.modality_stacks && Array.isArray(item.modality_stacks) && item.modality_stacks.length > 0) {
                    modalityStacksJson = JSON.stringify(item.modality_stacks);
                }
                const modalityStacksUpdateClause = modalityStacksJson ? ', modality_stacks = VALUES(modality_stacks)' : '';
                
                // Handle modality_stacks_reason - update if present
                const modalityStacksReasonUpdateClause = item.modality_stacks_reason !== undefined ? ', modality_stacks_reason = VALUES(modality_stacks_reason)' : '';
                
                await this.connection.execute(
                    `INSERT INTO doing_item 
                     (code, my_ai_tool, my_item, type, name, image_url, fullscreen_url,
                      item_category, verb, content, published, session_id, coordinate, metadata, record_id, purpose, reason, item_id, status, modality_stacks, modality_stacks_reason)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE 
                        type = VALUES(type),                     
                        name = VALUES(name),
                        image_url = VALUES(image_url),
                        fullscreen_url = VALUES(fullscreen_url),
                        verb = VALUES(verb),
                        content = VALUES(content),
                        session_id = VALUES(session_id),
                        coordinate = VALUES(coordinate),
                        metadata = VALUES(metadata),
                        record_id = VALUES(record_id),
                        published = VALUES(published)${purposeUpdateClause}${reasonUpdateClause},
                        item_id = VALUES(item_id),
                        status = VALUES(status)${modalityStacksUpdateClause}${modalityStacksReasonUpdateClause},
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        code ?? null,
                        this.myAiTool ?? null,
                        myItem ?? null,
                        item.type ?? null,
                        item.name ?? null,
                        imageUrl,
                        fullscreenUrl,
                        item.item_category ?? null,
                        item.verb ?? null,
                        item.content ?? null,
                        1,
                        sessionId,
                        globalPos ? JSON.stringify(globalPos) : null,
                        Object.keys(metadataToSave).length > 0 ? JSON.stringify(metadataToSave) : null,
                        recordId,
                        item.purpose ?? null,
                        item.reason ?? null,
                        item.item_id ?? null,
                        item.status ?? null,
                        modalityStacksJson,
                        item.modality_stacks_reason ?? null
                    ]
                );
                
                // Track saved code
                if (code) {
                    savedDoingItemCodes.add(code);
                }
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
                        
                        const myItemCode = `${this.myAiTool}_${childMyItem}`;
                        await this.connection.execute(
                            `INSERT INTO myparent_panel 
                             (my_item_code, my_parent_item, published, record_id)
                             VALUES (?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE 
                                my_parent_item = VALUES(my_parent_item),
                                record_id = VALUES(record_id),
                                published = VALUES(published),
                                updated_at = CURRENT_TIMESTAMP`,
                            [myItemCode, `${this.myAiTool}_${parentMyItem}`, 1, recordId]
                        );
                        
                        // Track saved code
                        savedMyparentPanelCodes.add(myItemCode);
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
                
                // Backfill: Chỉ gán step_id cho những step chưa có step_id (theo thứ tự: 1, 2, 3, ...)
                let needsBackfill = false;
                let backfillCount = 0;
                const stepsWithId = steps.map((step, index) => {
                    if (!step.step_id) {
                        step.step_id = index + 1;
                        needsBackfill = true;
                        backfillCount++;
                    }
                    return step;
                });
                
                // Chỉ ghi lại file nếu có step được backfill
                if (needsBackfill) {
                    const newContent = stepsWithId.map(step => JSON.stringify(step)).join('\n') + '\n';
                    await fsp.writeFile(doingStepPath, newContent, 'utf8');
                    console.log(`✅ Backfilled ${backfillCount} steps with step_id (1, 2, 3, ...)`);
                }
                
                let stepCount = 0;
                for (const step of stepsWithId) {
                    const actionItemId = step.action?.item_id;
                    if (!actionItemId) continue;
                    
                    const actionItem = items.find(item => item.item_id === actionItemId);
                    if (!actionItem) continue;
                    
                    // Sử dụng step_id từ file (đã được backfill: 1, 2, 3, ...)
                    const stepId = step.step_id || (stepCount + 1);
                    const stepType = 'A-BROWSER';
                    
                    const clicks = allClicks.filter(c => c.action_item_id === actionItemId)
                        .sort((a, b) => a.timestamp - b.timestamp);
                    const stepTimestamp = clicks.length > 0 ? clicks[0].timestamp : 0;
                    
                    const myStep = `DOS-${recordId}-${stepId}-${stepType}`;
                    const code = `${this.myAiTool}_${myStep}`;
                    
                    const myPanelBefore = itemIdToMyItemMap.get(step.panel_before?.item_id);
                    const myAction = itemIdToMyItemMap.get(actionItemId);
                    const myPanelAfter = itemIdToMyItemMap.get(step.panel_after?.item_id);
                    
                    if (!myPanelBefore || !myAction || !myPanelAfter) continue;
                    
                    // Build conditional update clause for purpose/reason
                    // Only update if jsonl has values, otherwise keep existing DB values
                    const stepPurposeUpdateClause = step.purpose ? ', purpose = VALUES(purpose)' : '';
                    const stepReasonUpdateClause = step.reason ? ', reason = VALUES(reason)' : '';
                    
                    await this.connection.execute(
                        `INSERT INTO doing_step 
                         (code, my_ai_tool, my_step, record_id, step_id, step_timestamp, step_type,
                          my_panel_before, my_action, my_panel_after, step_input, step_output, step_asset, published, purpose, reason)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE 
                            step_id = VALUES(step_id),
                            step_timestamp = VALUES(step_timestamp),
                            my_panel_before = VALUES(my_panel_before),
                            my_action = VALUES(my_action),
                            my_panel_after = VALUES(my_panel_after),
                            record_id = VALUES(record_id),
                            published = VALUES(published)${stepPurposeUpdateClause}${stepReasonUpdateClause},
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
                            null,
                            1,
                            step.purpose ?? null,
                            step.reason ?? null
                        ]
                    );
                    
                    // Track saved code
                    savedDoingStepCodes.add(code);
                    stepCount++;
                }
                
                console.log(`✅ Exported ${stepCount} steps to doing_step`);
            } catch (err) {
                console.log('⚠️ No doing_step.jsonl found or empty:', err.message);
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
                    const pageCode = `${this.myAiTool}_${panelMyItem}_${page.page_no}`;

                    // Ensure screenshot_url is explicitly set (null if not present)
                    const screenshotUrl = page.screenshot_url !== undefined ? page.screenshot_url : null;
                    
                    if (!screenshotUrl) {
                        console.log(`⚠️ Page ${page.page_no} (${page.name}) has no screenshot_url`);
                    } else {
                        console.log(`📸 Page ${page.page_no} screenshot_url: ${screenshotUrl}`);
                    }
                    await this.connection.execute(
                        `INSERT INTO pages 
                         (name, coordinate, width, height, screenshot_url, my_item, page_no, record_id, published, code)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE 
                            name = VALUES(name),
                            coordinate = VALUES(coordinate),
                            width = VALUES(width),
                            height = VALUES(height),
                            screenshot_url = VALUES(screenshot_url),
                            record_id = VALUES(record_id),
                            published = VALUES(published),
                            code = VALUES(code),
                            updated_at = CURRENT_TIMESTAMP`,
                        [
                            page.name,
                            JSON.stringify(page.coordinate),
                            page.width,
                            page.height,
                            screenshotUrl,
                            panelCode,
                            page.page_no,
                            recordId,
                            1,
                            pageCode
                        ]
                    );
                    
                    // Track saved code
                    savedPageCodes.add(pageCode);
                    pageCount++;
                }
                
                console.log(`✅ Exported ${pageCount} pages to pages table`);
            } catch (err) {
                console.log('⚠️ No page.jsonl found or empty');
            }
            
            // ========== BACKFILL LOGIC (after export completed) ==========
            // Optimized: Only 2 DB calls - one for items, one for steps
            console.log('🔄 Starting backfill purpose/reason from DB to jsonl files...');
            
            try {
                // 1. Backfill doing_item - fetch all items with purpose/reason in ONE query
                const [dbItems] = await this.connection.execute(
                    `SELECT code, purpose, reason FROM doing_item 
                     WHERE my_ai_tool = ? AND published = 1 AND (purpose IS NOT NULL OR reason IS NOT NULL)`,
                    [this.myAiTool]
                );
                
                if (dbItems.length > 0) {
                    // Build code -> {purpose, reason} map
                    const itemPurposeMap = new Map();
                    for (const row of dbItems) {
                        if (row.purpose || row.reason) {
                            itemPurposeMap.set(row.code, { purpose: row.purpose, reason: row.reason });
                        }
                    }
                    console.log(`   📊 Found ${itemPurposeMap.size} items with purpose/reason in DB`);
                    
                    // Read doing_item.jsonl and update ACTION items that don't have purpose/reason
                    const doingItemPath = path.join(this.sessionFolder, 'doing_item.jsonl');
                    const itemContent = await fsp.readFile(doingItemPath, 'utf8');
                    const items = itemContent.trim().split('\n')
                        .filter(line => line.trim())
                        .map(line => JSON.parse(line));
                    
                    let itemBackfillCount = 0;
                    let itemsUpdated = false;
                    let itemsNeedingBackfill = 0;
                    let noMatchCount = 0;
                    
                    for (const item of items) {
                        // Only backfill ACTION items
                        if (!item.purpose && !item.reason && item.item_id && item.item_category === 'ACTION') {
                            itemsNeedingBackfill++;
                            
                            // Generate code using same logic as export (lines 382-392)
                            let panelName = null;
                            const panelId = actionIdToPanelIdMap.get(item.item_id);
                            if (panelId) {
                                panelName = panelIdToPanelNameMap.get(panelId);
                            }
                            
                            const code = this.generateCode(item.item_category, item.name, panelName);
                            const dbData = itemPurposeMap.get(code);
                            
                            if (dbData) {
                                item.purpose = dbData.purpose || null;
                                item.reason = dbData.reason || null;
                                itemBackfillCount++;
                                itemsUpdated = true;
                            } else {
                                noMatchCount++;
                                // Debug: log first few unmatched codes
                                if (noMatchCount <= 3) {
                                    console.log(`   ⚠️ No match for: ${code} (item: ${item.name}, panelName: ${panelName || 'none'})`);
                                }
                            }
                        }
                    }
                    
                    if (noMatchCount > 3) {
                        console.log(`   ⚠️ ... and ${noMatchCount - 3} more items without match`);
                    }
                    
                    if (itemsUpdated) {
                        const newContent = items.map(i => JSON.stringify(i)).join('\n') + '\n';
                        await fsp.writeFile(doingItemPath, newContent, 'utf8');
                        console.log(`   ✅ Backfilled ${itemBackfillCount}/${itemsNeedingBackfill} ACTION items with purpose/reason`);
                    } else if (itemsNeedingBackfill > 0) {
                        console.log(`   ℹ️ ${itemsNeedingBackfill} ACTION items need backfill but no matches found`);
                    }
                }
                
                // 2. Backfill doing_step - fetch all steps with purpose/reason in ONE query
                const [dbSteps] = await this.connection.execute(
                    `SELECT code, purpose, reason FROM doing_step 
                     WHERE my_ai_tool = ? AND published = 1 AND (purpose IS NOT NULL OR reason IS NOT NULL)`,
                    [this.myAiTool]
                );
                
                if (dbSteps.length > 0) {
                    // Build code -> {purpose, reason} map
                    const stepPurposeMap = new Map();
                    for (const row of dbSteps) {
                        if (row.purpose || row.reason) {
                            stepPurposeMap.set(row.code, { purpose: row.purpose, reason: row.reason });
                        }
                    }
                    console.log(`   📊 Found ${stepPurposeMap.size} steps with purpose/reason in DB`);
                    
                    // Read doing_step.jsonl and update steps that don't have purpose/reason
                    const doingStepPath = path.join(this.sessionFolder, 'doing_step.jsonl');
                    const stepContent = await fsp.readFile(doingStepPath, 'utf8');
                    const steps = stepContent.trim().split('\n')
                        .filter(line => line.trim())
                        .map(line => JSON.parse(line));
                    
                    // Get recordId for code generation
                    const recordId = await this.getRecordId();
                    
                    let stepBackfillCount = 0;
                    let stepsUpdated = false;
                    
                    for (let i = 0; i < steps.length; i++) {
                        const step = steps[i];
                        if (!step.purpose && !step.reason && step.action?.item_id) {
                            const stepId = step.step_id || (i + 1);
                            const stepType = 'A-BROWSER';
                            const myStep = `DOS-${recordId}-${stepId}-${stepType}`;
                            const code = `${this.myAiTool}_${myStep}`;
                            
                            const dbData = stepPurposeMap.get(code);
                            
                            if (dbData) {
                                step.purpose = dbData.purpose || null;
                                step.reason = dbData.reason || null;
                                stepBackfillCount++;
                                stepsUpdated = true;
                            }
                        }
                    }
                    
                    if (stepsUpdated) {
                        const newContent = steps.map(s => JSON.stringify(s)).join('\n') + '\n';
                        await fsp.writeFile(doingStepPath, newContent, 'utf8');
                        console.log(`   ✅ Backfilled ${stepBackfillCount} steps with purpose/reason`);
                    }
                }
                
                console.log('✅ Backfill completed');
            } catch (backfillErr) {
                console.warn('⚠️ Backfill error:', backfillErr.message);
            }
            // ========== END BACKFILL LOGIC ==========
            
            // ========== EXPORT VALIDATION ==========
            try {
                const validationPath = path.join(this.sessionFolder, 'uigraph_validation.jsonl');
                let validationContent;
                try {
                    validationContent = await fsp.readFile(validationPath, 'utf8');
                } catch (err) {
                    if (err.code === 'ENOENT') {
                        console.log('⚠️ uigraph_validation.jsonl not found, skipping validation export');
                    } else {
                        throw err;
                    }
                }

                if (validationContent && validationContent.trim()) {
                    // Parse JSONL format (one JSON object per line)
                    const validations = {};
                    const lines = validationContent.trim().split('\n').filter(line => line.trim());
                    for (const line of lines) {
                        try {
                            const entry = JSON.parse(line);
                            if (entry.item_id) {
                                validations[entry.item_id] = {
                                    created_at: entry.created_at,
                                    my_ai_tool: entry.my_ai_tool,
                                    my_day: entry.my_day,
                                    my_session: entry.my_session,
                                    my_scene: entry.my_scene
                                };
                            }
                        } catch (parseErr) {
                            console.warn(`Failed to parse validation line: ${line}`, parseErr);
                        }
                    }
                    const validationEntries = Object.entries(validations);
                    
                    if (validationEntries.length > 0) {
                        console.log(`📊 Exporting ${validationEntries.length} validation entries...`);
                        
                        // Build itemId -> item map từ doing_item.jsonl để generate code
                        const itemIdToItemMap = new Map();
                        for (const item of items) {
                            if (item.item_id) {
                                itemIdToItemMap.set(item.item_id, item);
                            }
                        }
                        
                        let exportedCount = 0;
                        for (const [itemId, validationData] of validationEntries) {
                            try {
                                // Lấy item từ doing_item.jsonl
                                const item = itemIdToItemMap.get(itemId);
                                if (!item || !item.item_id || !item.name) {
                                    console.warn(`⚠️ Could not find item for item_id ${itemId} in doing_item.jsonl, skipping validation`);
                                    continue;
                                }
                                
                                // Generate code giống như doing_item (dòng 381-392)
                                let panelName = null;
                                if (item.item_category === 'ACTION') {
                                    const panelId = actionIdToPanelIdMap.get(item.item_id);
                                    if (panelId) {
                                        panelName = panelIdToPanelNameMap.get(panelId);
                                    }
                                }
                                
                                const code = this.generateCode(item.item_category, item.name, panelName);
                                
                                // Convert created_at timestamp to datetime
                                const createdAt = new Date(validationData.created_at);
                                
                                // Upsert vào bảng uigraph_validation
                                await this.connection.execute(
                                    `INSERT INTO uigraph_validation 
                                     (my_snapshot, my_ai_tool, created_at, my_day, my_session, my_scene, record_id, item_id, published)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                                     ON DUPLICATE KEY UPDATE
                                     my_ai_tool = VALUES(my_ai_tool),
                                     created_at = VALUES(created_at),
                                     my_day = VALUES(my_day),
                                     my_session = VALUES(my_session),
                                     my_scene = VALUES(my_scene),
                                     record_id = VALUES(record_id),
                                     published = 1`,
                                    [
                                        code, // my_snapshot
                                        validationData.my_ai_tool,
                                        createdAt, // created_at (datetime)
                                        validationData.my_day,
                                        validationData.my_session,
                                        validationData.my_scene,
                                        recordId, // record_id từ đầu hàm
                                        itemId
                                    ]
                                );
                                
                                exportedCount++;
                            } catch (validationErr) {
                                console.error(`❌ Failed to export validation for item ${itemId}:`, validationErr);
                                // Continue with next entry
                            }
                        }
                        
                        console.log(`✅ Exported ${exportedCount}/${validationEntries.length} validation entries to DB`);
                    }
                }
            } catch (validationExportErr) {
                console.error('❌ Failed to export validation to DB:', validationExportErr);
                // Don't throw - allow export to complete
            }
            // ========== END EXPORT VALIDATION ==========
            
        } catch (err) {
            console.error('Failed to export to MySQL:', err);
            throw err;
        }
    }

    async close() {
        // Pool is managed globally, no need to close individual connection
        this.connection = null;
        // console.log('✅ MySQL connection released (pool)');
    }

    /**
     * Update only modality_stacks and modality_stacks_reason for a specific item
     * @param {string} itemId - The item_id to update
     * @param {Array} modalityStacks - Array of modality stack codes
     * @param {string|null} modalityStacksReason - Reason for modality stacks
     * @returns {Promise<boolean>} - True if updated successfully
     */
    async updateItemModalityStacks(itemId, modalityStacks, modalityStacksReason) {
        try {
            if (!this.connection) {
                await this.init();
            }

            // Convert modality_stacks array to JSON string
            let modalityStacksJson = null;
            if (modalityStacks && Array.isArray(modalityStacks) && modalityStacks.length > 0) {
                modalityStacksJson = JSON.stringify(modalityStacks);
            }

            await this.connection.execute(
                `UPDATE doing_item 
                 SET modality_stacks = ?, 
                     modality_stacks_reason = ?,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE item_id = ? AND published = 1`,
                [modalityStacksJson, modalityStacksReason || null, itemId]
            );

            console.log(`✅ Updated modality_stacks for item ${itemId}`);
            return true;
        } catch (err) {
            console.error(`❌ Failed to update modality_stacks for item ${itemId}:`, err);
            return false;
        }
    }
}

