import { promises as fsp } from 'fs';
import path from 'path';
import { getDbPool } from './db-connection.js';

export class DatabaseLoader {
    constructor(sessionFolder, myAiToolCode) {
        this.sessionFolder = sessionFolder;
        this.myAiTool = myAiToolCode;
        this.connection = null;
    }

    async init() {
        if (!this.myAiTool) {
            throw new Error('❌ myAiToolCode is required!');
        }
        
        this.connection = getDbPool();
        // console.log('✅ DatabaseLoader: MySQL connected (via pool)');
    }

    async close() {
        // Pool is managed globally
        this.connection = null;
        // console.log('✅ DatabaseLoader: MySQL connection released');
    }

    /**
     * Parse JSON string safely. If input is already an object, return it.
     */
    parseJsonSafely(input) {
        if (!input || input === 'null') {
            return null;
        }
        if (typeof input === 'object') {
            return input;
        }
        try {
            return JSON.parse(input);
        } catch (err) {
            console.warn('⚠️ Failed to parse JSON:', err.message);
            return null;
        }
    }

    /**
     * Remove specified fields from metadata object
     */
    cleanMetadata(metadata) {
        if (!metadata || typeof metadata !== 'object') {
            return {};
        }
        
        const cleaned = { ...metadata };
        delete cleaned.clicks;
        delete cleaned.child_actions;
        delete cleaned.child_panels;
        delete cleaned.parent_dom;
        delete cleaned.modality_stacks_reason;
        return cleaned;
    }

    /**
     * Load data from database and create JSONL files
     * @param {string} role - Role type ('DRAW' or other), affects loading behavior
     *   - role=DRAW: Only load uigraph_validation (upsert mode)
     *   - role!=DRAW: Load full (doing_item, step, page, etc.) and override validation
     */
    async loadFromDatabase(role = null) {
        try {
            await this.init();

            // 1. Query doing_item table (needed for codeToItemIdMap in all cases)
            console.log(`📊 Querying doing_item table for my_ai_tool='${this.myAiTool}'...`);
            const [doingItems] = await this.connection.execute(
                `SELECT * FROM doing_item WHERE published=1 AND my_ai_tool=?`,
                [this.myAiTool]
            );
            console.log(`✅ Found ${doingItems.length} doing_item records`);

            // Create code -> item_id mapping
            const codeToItemIdMap = new Map();
            for (const item of doingItems) {
                if (item.code && item.item_id) {
                    codeToItemIdMap.set(item.code, item.item_id);
                }
            }

            if (role === 'DRAW') {
                // DRAW role: Load uigraph_validation (upsert) + myparent_panel from DB (so ADMIN corrections are visible)
                console.log(`🎨 DRAW mode: Loading uigraph_validation and myparent_panel...`);
                await this.createMyparentPanelJsonl(doingItems);
                await this.createValidationJsonl(codeToItemIdMap, role);
            } else {
                // Non-DRAW role: Load full data
                
                // 2. Create doing_item.jsonl
                await this.createDoingItemJsonl(doingItems);

                // 3. Query pages table
                console.log(`📊 Querying pages table for my_item LIKE '${this.myAiTool}_%'...`);
                const [pages] = await this.connection.execute(
                    `SELECT * FROM pages WHERE published=1 AND my_item LIKE ?`,
                    [`${this.myAiTool}_%`]
                );
                console.log(`✅ Found ${pages.length} page records`);

                // 4. Create pages.jsonl
                await this.createPagesJsonl(pages, codeToItemIdMap);

                // 5. Query doing_step table
                console.log(`📊 Querying doing_step table for my_ai_tool='${this.myAiTool}'...`);
                const [doingSteps] = await this.connection.execute(
                    `SELECT * FROM doing_step WHERE published=1 AND my_ai_tool=?`,
                    [this.myAiTool]
                );
                console.log(`✅ Found ${doingSteps.length} doing_step records`);

                // 6. Create doing_step.jsonl
                await this.createDoingStepJsonl(doingSteps, codeToItemIdMap);

                // 7. Create myparent_panel.jsonl from doing_item (PANEL category)
                await this.createMyparentPanelJsonl(doingItems);

                // 8. Create click.jsonl from doing_item.metadata.clicks
                await this.createClickJsonl(doingItems);

                // 9. Create uigraph_validation.jsonl (override mode)
                await this.createValidationJsonl(codeToItemIdMap, role);
            }

            console.log('✅ Successfully loaded all data from database');
        } catch (err) {
            console.error('❌ Failed to load data from database:', err);
            throw err;
        } finally {
            await this.close();
        }
    }

    /**
     * For role=DRAW: Update bug_flag and bug_info in existing doing_item.jsonl from database
     */
    async updateBugInfoInDoingItems() {
        try {
            await this.init();

            // 1. Read existing doing_item.jsonl
            const filePath = path.join(this.sessionFolder, 'doing_item.jsonl');
            let fileContent;
            try {
                fileContent = await fsp.readFile(filePath, 'utf8');
            } catch (err) {
                if (err.code === 'ENOENT') {
                    console.log('⚠️ doing_item.jsonl not found, skipping bug info update');
                    return;
                }
                throw err;
            }

            if (!fileContent.trim()) {
                 console.log('⚠️ doing_item.jsonl is empty, skipping bug info update');
                 return;
            }

            const items = fileContent.trim().split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
            if (items.length === 0) return;

            // 2. Query doing_item from DB to get latest bug info, modality_stacks, and modality_stacks_reason
            console.log(`📊 Querying doing_item table for bug info, modality_stacks, and modality_stacks_reason (my_ai_tool='${this.myAiTool}')...`);
            const [dbItems] = await this.connection.execute(
                `SELECT item_id, bug_flag, bug_info, modality_stacks, modality_stacks_reason FROM doing_item WHERE published=1 AND my_ai_tool=?`,
                [this.myAiTool]
            );
            console.log(`✅ Found ${dbItems.length} items in DB for bug info update`);
            
            // Create map for fast lookup
            const dbItemMap = new Map();
            for (const dbItem of dbItems) {
                dbItemMap.set(dbItem.item_id, dbItem);
            }

            // 3. Update items
            let updatedCount = 0;
            for (const item of items) {
                const dbItem = dbItemMap.get(item.item_id);
                if (dbItem) {
                     // Parse bug_info if needed
                    let bugInfo = dbItem.bug_info;
                    if (typeof bugInfo === 'string') {
                        bugInfo = this.parseJsonSafely(bugInfo);
                    }

                    item.bug_flag = dbItem.bug_flag === 1;
                    item.bug_info = bugInfo;

                    // Parse and update modality_stacks
                    let modalityStacks = null;
                    if (dbItem.modality_stacks) {
                        if (typeof dbItem.modality_stacks === 'string') {
                            modalityStacks = this.parseJsonSafely(dbItem.modality_stacks);
                        } else if (Array.isArray(dbItem.modality_stacks)) {
                            modalityStacks = dbItem.modality_stacks;
                        }
                    }
                    item.modality_stacks = modalityStacks;

                    // Update modality_stacks_reason from database column
                    item.modality_stacks_reason = dbItem.modality_stacks_reason || null;

                    updatedCount++;
                }
            }

            // 4. Write back to file
            const newLines = items.map(item => JSON.stringify(item));
            await fsp.writeFile(filePath, newLines.join('\n') + (newLines.length > 0 ? '\n' : ''), 'utf8');
            console.log(`✅ Updated bug info, modality_stacks, and modality_stacks_reason for ${updatedCount} items in doing_item.jsonl`);

        } catch (err) {
            console.error('❌ Failed to update bug info:', err);
            // Don't throw to avoid blocking session load
        } finally {
            await this.close();
        }
    }

    /**
     * Create doing_item.jsonl from doing_item table
     */
    async createDoingItemJsonl(doingItems) {
        const filePath = path.join(this.sessionFolder, 'doing_item.jsonl');
        const lines = [];

        for (const item of doingItems) {
            // Parse metadata and clean it
            const metadata = this.parseJsonSafely(item.metadata);
            const cleanedMetadata = this.cleanMetadata(metadata);

            // Parse coordinate if it's a JSON string
            let coordinate = item.coordinate;
            if (typeof coordinate === 'string') {
                coordinate = this.parseJsonSafely(coordinate);
            }

            // Parse bug_info if exists
            const bugInfo = this.parseJsonSafely(item.bug_info);

            // Parse modality_stacks if exists (JSON string from database)
            let modalityStacks = null;
            if (item.modality_stacks) {
                if (typeof item.modality_stacks === 'string') {
                    modalityStacks = this.parseJsonSafely(item.modality_stacks);
                } else if (Array.isArray(item.modality_stacks)) {
                    modalityStacks = item.modality_stacks;
                }
            }

            const jsonlItem = {
                item_id: item.item_id,
                item_category: item.item_category,
                type: item.type,
                name: item.name,
                verb: item.verb,
                purpose: item.purpose,
                reason: item.reason,
                content: item.content,
                coordinate: coordinate,
                image_url: item.image_url,
                fullscreen_url: item.fullscreen_url,
                status: item.status,
                metadata: cleanedMetadata,
                bug_flag: item.bug_flag === 1,
                bug_info: bugInfo,
                modality_stacks: modalityStacks,
                modality_stacks_reason: item.modality_stacks_reason || null
            };

            lines.push(JSON.stringify(jsonlItem));
        }

        await fsp.writeFile(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
        console.log(`✅ Created doing_item.jsonl with ${lines.length} items`);
    }

    /**
     * Create pages.jsonl from pages table
     */
    async createPagesJsonl(pages, codeToItemIdMap) {
        const filePath = path.join(this.sessionFolder, 'pages.jsonl');
        const lines = [];

        for (const page of pages) {
            // Map pages.my_item (code) to item_id using codeToItemIdMap
            const itemId = codeToItemIdMap.get(page.my_item);
            if (!itemId) {
                console.warn(`⚠️ Could not find item_id for page with my_item='${page.my_item}', skipping...`);
                continue;
            }

            // Parse coordinate if it's a JSON string
            let coordinate = page.coordinate;
            if (typeof coordinate === 'string') {
                coordinate = this.parseJsonSafely(coordinate);
            }

            const jsonlPage = {
                my_item: itemId,
                name: page.name,
                coordinate: coordinate,
                width: page.width,
                height: page.height,
                screenshot_url: page.screenshot_url,
                page_no: page.page_no
            };

            lines.push(JSON.stringify(jsonlPage));
        }

        await fsp.writeFile(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
        console.log(`✅ Created pages.jsonl with ${lines.length} pages`);
    }

    /**
     * Create doing_step.jsonl from doing_step table
     */
    async createDoingStepJsonl(doingSteps, codeToItemIdMap) {
        const filePath = path.join(this.sessionFolder, 'doing_step.jsonl');
        const lines = [];

        for (const step of doingSteps) {
            // Map my_panel_before (code) to item_id
            const panelBeforeItemId = codeToItemIdMap.get(step.my_panel_before);
            if (!panelBeforeItemId) {
                console.warn(`⚠️ Could not find item_id for step with my_panel_before='${step.my_panel_before}', skipping...`);
                continue;
            }

            // Map my_action (code) to item_id
            const actionItemId = codeToItemIdMap.get(step.my_action);
            if (!actionItemId) {
                console.warn(`⚠️ Could not find item_id for step with my_action='${step.my_action}', skipping...`);
                continue;
            }

            // Map my_panel_after (code) to item_id; null khi Mark as Done
            const panelAfterItemId = step.my_panel_after != null ? codeToItemIdMap.get(step.my_panel_after) : null;

            const jsonlStep = {
                step_id: step.step_id,
                panel_before: {
                    item_id: panelBeforeItemId
                },
                action: {
                    item_id: actionItemId
                },
                panel_after: panelAfterItemId ? { item_id: panelAfterItemId } : null,
                purpose: step.purpose,
                reason: step.reason
            };

            lines.push(JSON.stringify(jsonlStep));
        }

        await fsp.writeFile(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
        console.log(`✅ Created doing_step.jsonl with ${lines.length} steps`);
    }

    /**
     * Create myparent_panel.jsonl from doing_item (only PANEL category)
     */
    async createMyparentPanelJsonl(doingItems) {
        const filePath = path.join(this.sessionFolder, 'myparent_panel.jsonl');
        const lines = [];

        // Filter only PANEL items
        const panelItems = doingItems.filter(item => item.item_category === 'PANEL');

        for (const panel of panelItems) {
            // Parse metadata
            const metadata = this.parseJsonSafely(panel.metadata);
            if (!metadata) {
                continue;
            }

            const jsonlPanel = {
                parent_panel: panel.item_id,
                child_actions: metadata.child_actions || [],
                child_panels: metadata.child_panels || [],
                parent_dom: metadata.parent_dom || null
            };

            lines.push(JSON.stringify(jsonlPanel));
        }

        await fsp.writeFile(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
        console.log(`✅ Created myparent_panel.jsonl with ${lines.length} panels`);
    }

    /**
     * Create click.jsonl from doing_item.metadata.clicks array
     */
    async createClickJsonl(doingItems) {
        const filePath = path.join(this.sessionFolder, 'click.jsonl');
        const lines = [];

        for (const item of doingItems) {
            // Parse metadata
            const metadata = this.parseJsonSafely(item.metadata);
            if (!metadata || !metadata.clicks || !Array.isArray(metadata.clicks)) {
                continue;
            }

            // Each element in clicks array is one line in click.jsonl
            // Add action_item_id = doing_item.item_id to each click
            for (const click of metadata.clicks) {
                const clickWithActionId = {
                    ...click,
                    action_item_id: item.item_id
                };
                lines.push(JSON.stringify(clickWithActionId));
            }
        }

        await fsp.writeFile(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
        console.log(`✅ Created click.jsonl with ${lines.length} clicks`);
    }

    /**
     * Create uigraph_validation.jsonl from uigraph_validation table
     * @param {Map} codeToItemIdMap - Map from code to item_id
     * @param {string} role - Role type ('DRAW' or other)
     */
    async createValidationJsonl(codeToItemIdMap, role = null) {
        const filePath = path.join(this.sessionFolder, 'uigraph_validation.jsonl');
        
        try {
            // Query uigraph_validation with assignee from uigraph_validation_assignee (published=1)
            console.log(`📊 Querying uigraph_validation table for my_ai_tool='${this.myAiTool}'...`);
            const [validations] = await this.connection.execute(
                `SELECT v.*, a.my_collaborator as assignee
FROM uigraph_validation v
LEFT JOIN uigraph_validation_assignee a ON v.my_ai_tool = a.my_ai_tool AND v.my_session = a.my_session AND a.published = 1
WHERE v.published = 1 AND v.my_ai_tool = ?`,
                [this.myAiTool]
            );
            console.log(`✅ Found ${validations.length} validation records`);

            // Build DB entries map (item_id -> entry)
            const dbEntriesMap = new Map();
            for (const validation of validations) {
                const itemId = codeToItemIdMap.get(validation.my_snapshot);
                if (!itemId) {
                    console.warn(`⚠️ Could not find item_id for validation with my_snapshot='${validation.my_snapshot}', skipping...`);
                    continue;
                }

                // Convert created_at datetime to timestamp
                const createdAt = validation.created_at instanceof Date 
                    ? validation.created_at.getTime() 
                    : new Date(validation.created_at).getTime();

                const jsonlEntry = {
                    item_id: itemId,
                    created_at: createdAt,
                    my_ai_tool: validation.my_ai_tool,
                    my_day: validation.my_day,
                    my_session: validation.my_session,
                    my_scene: validation.my_scene,
                    view_count: validation.view_count,
                    assignee: validation.assignee ?? null
                };

                dbEntriesMap.set(itemId, jsonlEntry);
            }

            let lines = [];

            if (role === 'DRAW') {
                // DRAW role: Upsert mechanism
                // - If item exists in file AND DB -> update with DB data
                // - If item exists in file but NOT in DB -> keep as-is (preserve)
                // - If item exists in DB but NOT in file -> add
                
                // Read existing file
                let existingEntries = new Map();
                try {
                    const fileContent = await fsp.readFile(filePath, 'utf8');
                    if (fileContent.trim()) {
                        const fileLines = fileContent.trim().split('\n').filter(line => line.trim());
                        for (const line of fileLines) {
                            try {
                                const entry = JSON.parse(line);
                                if (entry.item_id) {
                                    existingEntries.set(entry.item_id, entry);
                                }
                            } catch (parseErr) {
                                console.warn(`⚠️ Failed to parse line in uigraph_validation.jsonl: ${parseErr.message}`);
                            }
                        }
                    }
                    console.log(`📖 Read ${existingEntries.size} existing entries from uigraph_validation.jsonl`);
                } catch (err) {
                    if (err.code !== 'ENOENT') {
                        throw err;
                    }
                    console.log(`📖 uigraph_validation.jsonl not found, will create new file`);
                }

                let updatedCount = 0;
                let addedCount = 0;
                let keptCount = 0;

                // Process: items in file
                for (const [itemId, existingEntry] of existingEntries) {
                    if (dbEntriesMap.has(itemId)) {
                        // Update with DB data
                        lines.push(JSON.stringify(dbEntriesMap.get(itemId)));
                        updatedCount++;
                    } else {
                        // Keep as-is - item not in DB, preserve existing entry
                        lines.push(JSON.stringify(existingEntry));
                        keptCount++;
                    }
                }

                // Add items from DB that are not in file
                for (const [itemId, dbEntry] of dbEntriesMap) {
                    if (!existingEntries.has(itemId)) {
                        lines.push(JSON.stringify(dbEntry));
                        addedCount++;
                    }
                }

                console.log(`🔄 DRAW mode: updated=${updatedCount}, added=${addedCount}, kept=${keptCount}`);
            } else {
                // Non-DRAW role: Override entire file (original behavior)
                for (const [itemId, entry] of dbEntriesMap) {
                    lines.push(JSON.stringify(entry));
                }
            }

            // Write to file in JSONL format (one line per entry)
            await fsp.writeFile(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
            console.log(`✅ Created uigraph_validation.jsonl with ${lines.length} entries`);
        } catch (err) {
            console.error('❌ Failed to create uigraph_validation.jsonl:', err);
            // Don't throw - allow load to continue
        }
    }
}
