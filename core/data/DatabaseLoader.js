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
        
        this.connection = await mysql.createConnection(MYSQL_CONFIG);
        console.log('✅ DatabaseLoader: MySQL connected');
    }

    async close() {
        if (this.connection) {
            await this.connection.end();
            console.log('✅ DatabaseLoader: MySQL connection closed');
        }
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
        return cleaned;
    }

    /**
     * Load data from database and create JSONL files
     */
    async loadFromDatabase() {
        try {
            await this.init();

            // 1. Query doing_item table
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

            console.log('✅ Successfully loaded all data from database');
        } catch (err) {
            console.error('❌ Failed to load data from database:', err);
            throw err;
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
                bug_info: bugInfo
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

            // Map my_panel_after (code) to item_id
            const panelAfterItemId = codeToItemIdMap.get(step.my_panel_after);
            if (!panelAfterItemId) {
                console.warn(`⚠️ Could not find item_id for step with my_panel_after='${step.my_panel_after}', skipping...`);
                continue;
            }

            const jsonlStep = {
                step_id: step.step_id,
                panel_before: {
                    item_id: panelBeforeItemId
                },
                action: {
                    item_id: actionItemId
                },
                panel_after: {
                    item_id: panelAfterItemId
                },
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
}
