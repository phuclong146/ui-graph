import { promises as fsp } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import mysql from 'mysql2/promise';

const MYSQL_CONFIG = {
    host: 'mysql.clevai.vn',
    port: 3306,
    user: 'comaker',
    password: 'zwTe1ROMxeRRZAiXhCDmfNRTeFsroMLI',
    database: 'comaker',
    connectTimeout: 60000
};

export class CheckpointManager {
    constructor(sessionFolder, myAiToolCode = null) {
        this.sessionFolder = sessionFolder;
        this.myAiTool = myAiToolCode;
        this.checkpointsFolder = path.join(sessionFolder, 'checkpoints');
        this.checkpointsJsonPath = path.join(this.checkpointsFolder, 'checkpoints.json');
        this.connection = null;
    }

    async init() {
        // Create checkpoints folder if it doesn't exist
        try {
            await fsp.mkdir(this.checkpointsFolder, { recursive: true });
        } catch (err) {
            console.error('Failed to create checkpoints folder:', err);
            throw err;
        }

        // Initialize checkpoints.json if it doesn't exist
        try {
            await fsp.access(this.checkpointsJsonPath);
        } catch {
            await fsp.writeFile(this.checkpointsJsonPath, JSON.stringify({ checkpoints: [] }, null, 2), 'utf8');
        }

        // Initialize DB connection if myAiTool is provided
        if (this.myAiTool) {
            try {
                this.connection = await mysql.createConnection(MYSQL_CONFIG);
                console.log('✅ CheckpointManager: MySQL connected');
            } catch (err) {
                console.error('⚠️ CheckpointManager: Failed to connect to MySQL:', err);
                // Continue without DB connection for local-only operations
            }
        }
    }

    async close() {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
        }
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

    /**
     * Creates a checkpoint by snapshotting both local data and database
     */
    async createCheckpoint(name = null, description = null, recordId = null) {
        const checkpointId = randomUUID();
        const timestamp = Date.now();

        // Auto-generate name if not provided
        if (!name) {
            try {
                const items = await this._getAllItems();
                const panels = items.filter(i => i.item_category === 'PANEL');
                const actions = items.filter(i => i.item_category === 'ACTION');
                const dateStr = new Date(timestamp).toLocaleString('vi-VN');
                name = `Auto: ${dateStr} - ${panels.length} panels, ${actions.length} actions`;
            } catch (err) {
                const dateStr = new Date(timestamp).toLocaleString('vi-VN');
                name = `Auto: ${dateStr}`;
            }
        }

        let localSuccess = false;
        let dbSuccess = false;

        try {
            // Snapshot local data first
            await this._snapshotLocalData(checkpointId);
            localSuccess = true;

            // Snapshot database data
            if (this.connection && this.myAiTool) {
                await this._snapshotDatabaseData(checkpointId, name, description, recordId);
                dbSuccess = true;
            } else {
                console.warn('⚠️ Skipping DB snapshot: no connection or myAiTool');
                dbSuccess = false;
            }

            // Update checkpoints.json metadata
            await this._updateCheckpointsJson(checkpointId, timestamp, name, description, recordId, localSuccess, dbSuccess);

            console.log(`✅ Checkpoint created: ${checkpointId} (local: ${localSuccess}, db: ${dbSuccess})`);

            return {
                checkpointId,
                timestamp,
                name,
                description,
                recordId,
                localSuccess,
                dbSuccess
            };
        } catch (err) {
            console.error('❌ Failed to create checkpoint:', err);
            
            // Update metadata even if partial failure
            if (localSuccess || dbSuccess) {
                try {
                    await this._updateCheckpointsJson(checkpointId, timestamp, name, description, recordId, localSuccess, dbSuccess);
                } catch (updateErr) {
                    console.error('Failed to update checkpoints.json:', updateErr);
                }
            }

            throw err;
        }
    }

    /**
     * Lists all checkpoints from both local and DB
     */
    async listCheckpoints() {
        const checkpoints = [];

        // Load from local checkpoints.json
        try {
            const content = await fsp.readFile(this.checkpointsJsonPath, 'utf8');
            const data = JSON.parse(content);
            if (data.checkpoints && Array.isArray(data.checkpoints)) {
                checkpoints.push(...data.checkpoints);
            }
        } catch (err) {
            console.error('Failed to read checkpoints.json:', err);
        }

        // Load from DB process table if available
        if (this.connection && this.myAiTool) {
            try {
                // Get record_id using getRecordId method
                const recordId = await this.getRecordId();

                // Only query if recordId is available
                if (!recordId) {
                    console.warn('⚠️ No recordId found, skipping DB checkpoint load');
                } else {
                    const [rows] = await this.connection.execute(
                        `SELECT code, name, description, created_by, rolledback_by, created_at, updated_at, record_id, my_ai_tool
                         FROM process 
                         WHERE my_ai_tool = ? AND record_id = ?
                         ORDER BY created_at DESC`,
                        [this.myAiTool, recordId]
                    );

                    // Merge DB data with local data
                    for (const row of rows) {
                        const existing = checkpoints.find(cp => cp.checkpointId === row.code);
                        if (existing) {
                            // Update with DB data
                            existing.name = row.name || existing.name;
                            existing.description = row.description || existing.description;
                            existing.recordId = row.created_by || existing.recordId;
                            existing.rolledbackBy = row.rolledback_by;
                            existing.createdAt = row.created_at;
                            existing.updatedAt = row.updated_at;
                        } else {
                            // Add new checkpoint from DB
                            checkpoints.push({
                                checkpointId: row.code,
                                timestamp: new Date(row.created_at).getTime(),
                                name: row.name,
                                description: row.description,
                                recordId: row.created_by,
                                rolledbackBy: row.rolledback_by,
                                createdAt: row.created_at,
                                updatedAt: row.updated_at,
                                localSuccess: false, // Not in local
                                dbSuccess: true
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to load checkpoints from DB:', err);
            }
        }

        // Sort by timestamp (newest first)
        checkpoints.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        return checkpoints;
    }

    /**
     * Gets checkpoint metadata
     */
    async getCheckpointMetadata(checkpointId) {
        const checkpoints = await this.listCheckpoints();
        return checkpoints.find(cp => cp.checkpointId === checkpointId) || null;
    }

    /**
     * Rolls back to a specific checkpoint
     */
    async rollbackToCheckpoint(checkpointId, recordId = null) {
        // Validate checkpoint exists
        const metadata = await this.getCheckpointMetadata(checkpointId);
        if (!metadata) {
            throw new Error(`Checkpoint ${checkpointId} not found`);
        }

        // Check if checkpoint has both local and DB data
        if (!metadata.localSuccess) {
            throw new Error(`Checkpoint ${checkpointId} has no local snapshot`);
        }

        if (this.connection && !metadata.dbSuccess) {
            console.warn(`⚠️ Checkpoint ${checkpointId} has no DB snapshot, proceeding with local rollback only`);
        }

        // Backup current state
        const backupTimestamp = Date.now();
        const backupFolder = path.join(this.checkpointsFolder, `_backup_${backupTimestamp}`);
        
        try {
            await this._backupCurrentState(backupFolder);
        } catch (err) {
            console.error('⚠️ Failed to backup current state:', err);
            // Continue anyway
        }

        let localRollbackSuccess = false;
        let dbRollbackSuccess = false;

        try {
            // Rollback local data
            await this._rollbackLocalData(checkpointId);
            localRollbackSuccess = true;

            // Rollback database data
            if (this.connection && this.myAiTool && metadata.dbSuccess) {
                await this._rollbackDatabaseData(checkpointId, recordId);
                dbRollbackSuccess = true;
            }

            console.log(`✅ Rollback completed: ${checkpointId} (local: ${localRollbackSuccess}, db: ${dbRollbackSuccess})`);

            return {
                checkpointId,
                localRollbackSuccess,
                dbRollbackSuccess,
                backupFolder
            };
        } catch (err) {
            console.error('❌ Rollback failed:', err);
            
            // Attempt to restore backup if rollback failed
            if (!localRollbackSuccess && backupFolder) {
                try {
                    console.log('Attempting to restore backup...');
                    await this._restoreFromBackup(backupFolder);
                } catch (restoreErr) {
                    console.error('❌ Failed to restore backup:', restoreErr);
                }
            }

            throw err;
        }
    }

    /**
     * Snapshot local data to checkpoint folder
     */
    async _snapshotLocalData(checkpointId) {
        const checkpointFolder = path.join(this.checkpointsFolder, checkpointId);
        await fsp.mkdir(checkpointFolder, { recursive: true });

        // Files to copy
        const filesToCopy = [
            'doing_item.jsonl',
            'myparent_panel.jsonl',
            'doing_step.jsonl',
            'click.jsonl',
            'page.jsonl',
            'info.json'
        ];

        // Copy files
        for (const fileName of filesToCopy) {
            const sourcePath = path.join(this.sessionFolder, fileName);
            const destPath = path.join(checkpointFolder, fileName);
            
            try {
                await fsp.copyFile(sourcePath, destPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    // File doesn't exist, skip it
                    console.warn(`⚠️ File ${fileName} not found, skipping`);
                } else {
                    throw err;
                }
            }
        }

        // Copy images folder recursively
        const imagesSource = path.join(this.sessionFolder, 'images');
        const imagesDest = path.join(checkpointFolder, 'images');
        
        try {
            await fsp.access(imagesSource);
            await this._copyDirectory(imagesSource, imagesDest);
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.warn('⚠️ Images folder not found, skipping');
            } else {
                throw err;
            }
        }
    }

    /**
     * Snapshot database data to _his tables
     */
    async _snapshotDatabaseData(checkpointId, name, description, recordId) {
        if (!this.connection || !this.myAiTool) {
            throw new Error('Database connection or myAiTool not available');
        }

        // Get record_id from info.json if not provided
        let actualRecordId = recordId;
        if (!actualRecordId) {
            actualRecordId = await this.getRecordId();
        }

        // Insert into process table
        await this.connection.execute(
            `INSERT INTO process (code, name, description, created_by, published, record_id, my_ai_tool)
             VALUES (?, ?, ?, ?, 1, ?, ?)
             ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                description = VALUES(description),
                created_by = VALUES(created_by),
                record_id = VALUES(record_id),
                my_ai_tool = VALUES(my_ai_tool),
                updated_at = CURRENT_TIMESTAMP`,
            [checkpointId, name, description, recordId, actualRecordId, this.myAiTool]
        );

        // Snapshot doing_item to doing_item_his
        await this.connection.execute(
            `INSERT INTO doing_item_his 
             (code, my_ai_tool, my_item, type, page_index, coordinate, name, image_url, fullscreen_url,
              created_at, updated_at, item_category, verb, purpose, reason, content, published,
              record_id, session_id, metadata, page_id, process_id, item_id, status)
             SELECT 
              code, my_ai_tool, my_item, type, page_index, coordinate, name, image_url, fullscreen_url,
              created_at, updated_at, item_category, verb, purpose, reason, content, published,
              record_id, session_id, metadata, page_id, ? as process_id, item_id, status
             FROM doing_item
             WHERE published = 1 AND my_ai_tool = ? AND (record_id = ? OR ? IS NULL)`,
            [checkpointId, this.myAiTool, actualRecordId, actualRecordId]
        );

        // Snapshot pages to pages_his
        await this.connection.execute(
            `INSERT INTO pages_his 
             (name, coordinate, width, height, screenshot_url, my_item, page_no, record_id, published, code, process_id)
             SELECT 
              name, coordinate, width, height, screenshot_url, my_item, page_no, record_id, published, code, ? as process_id
             FROM pages
             WHERE published = 1 AND my_item LIKE ? AND (record_id = ? OR ? IS NULL)`,
            [checkpointId, `${this.myAiTool}_%`, actualRecordId, actualRecordId]
        );

        // Snapshot doing_step to doing_step_his
        await this.connection.execute(
            `INSERT INTO doing_step_his 
             (code, my_ai_tool, my_step, record_id, step_id, step_timestamp, step_type,
              my_panel_before, my_action, my_panel_after, step_input, step_output, step_asset, published, process_id)
             SELECT 
              code, my_ai_tool, my_step, record_id, step_id, step_timestamp, step_type,
              my_panel_before, my_action, my_panel_after, step_input, step_output, step_asset, published, ? as process_id
             FROM doing_step
             WHERE published = 1 AND my_ai_tool = ? AND (record_id = ? OR ? IS NULL)`,
            [checkpointId, this.myAiTool, actualRecordId, actualRecordId]
        );

        // Snapshot myparent_panel to myparent_panel_his
        await this.connection.execute(
            `INSERT INTO myparent_panel_his 
             (my_item_code, my_parent_item, published, record_id, process_id)
             SELECT 
              my_item_code, my_parent_item, published, record_id, ? as process_id
             FROM myparent_panel
             WHERE published = 1 AND my_item_code LIKE ? AND (record_id = ? OR ? IS NULL)`,
            [checkpointId, `${this.myAiTool}_%`, actualRecordId, actualRecordId]
        );

        console.log(`✅ Snapshot database data to checkpoint ${checkpointId}`);
    }

    /**
     * Rollback local data from checkpoint
     */
    async _rollbackLocalData(checkpointId) {
        const checkpointFolder = path.join(this.checkpointsFolder, checkpointId);

        // Verify checkpoint folder exists
        try {
            await fsp.access(checkpointFolder);
        } catch (err) {
            throw new Error(`Checkpoint folder not found: ${checkpointFolder}`);
        }

        // Files to restore
        const filesToRestore = [
            'doing_item.jsonl',
            'myparent_panel.jsonl',
            'doing_step.jsonl',
            'click.jsonl',
            'page.jsonl',
            'info.json'
        ];

        // Restore files
        for (const fileName of filesToRestore) {
            const sourcePath = path.join(checkpointFolder, fileName);
            const destPath = path.join(this.sessionFolder, fileName);
            
            try {
                await fsp.copyFile(sourcePath, destPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    // File doesn't exist in checkpoint, delete it from current
                    try {
                        await fsp.unlink(destPath);
                    } catch (unlinkErr) {
                        // Ignore if file doesn't exist
                    }
                } else {
                    throw err;
                }
            }
        }

        // Restore images folder
        const imagesSource = path.join(checkpointFolder, 'images');
        const imagesDest = path.join(this.sessionFolder, 'images');
        
        try {
            // Remove existing images folder
            try {
                await fsp.rm(imagesDest, { recursive: true, force: true });
            } catch (err) {
                // Ignore if doesn't exist
            }

            // Copy from checkpoint
            await fsp.access(imagesSource);
            await this._copyDirectory(imagesSource, imagesDest);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }

        console.log(`✅ Rollback local data from checkpoint ${checkpointId}`);
    }

    /**
     * Rollback database data from checkpoint
     */
    async _rollbackDatabaseData(checkpointId, recordId = null) {
        if (!this.connection || !this.myAiTool) {
            throw new Error('Database connection or myAiTool not available');
        }

        // Get record_id if not provided
        let actualRecordId = recordId;
        if (!actualRecordId) {
            try {
                const infoPath = path.join(this.sessionFolder, 'info.json');
                const infoContent = await fsp.readFile(infoPath, 'utf8');
                const info = JSON.parse(infoContent);
                if (info.timestamps && info.timestamps.length > 0) {
                    actualRecordId = info.timestamps[0];
                }
            } catch (err) {
                console.warn('⚠️ Could not read record_id from info.json');
            }
        }

        // Mark all current records as unpublished
        await this.connection.execute(
            `UPDATE doing_item SET published = 0 WHERE my_ai_tool = ? AND (record_id = ? OR ? IS NULL)`,
            [this.myAiTool, actualRecordId, actualRecordId]
        );
        await this.connection.execute(
            `UPDATE pages SET published = 0 WHERE my_item LIKE ? AND (record_id = ? OR ? IS NULL)`,
            [`${this.myAiTool}_%`, actualRecordId, actualRecordId]
        );
        await this.connection.execute(
            `UPDATE doing_step SET published = 0 WHERE my_ai_tool = ? AND (record_id = ? OR ? IS NULL)`,
            [this.myAiTool, actualRecordId, actualRecordId]
        );
        await this.connection.execute(
            `UPDATE myparent_panel SET published = 0 WHERE my_item_code LIKE ? AND (record_id = ? OR ? IS NULL)`,
            [`${this.myAiTool}_%`, actualRecordId, actualRecordId]
        );

        // Restore from _his tables
        // doing_item
        await this.connection.execute(
            `INSERT INTO doing_item 
             (code, my_ai_tool, my_item, type, page_index, coordinate, name, image_url, fullscreen_url,
              created_at, updated_at, item_category, verb, purpose, reason, content, published,
              record_id, session_id, metadata, page_id, item_id, status)
             SELECT 
              code, my_ai_tool, my_item, type, page_index, coordinate, name, image_url, fullscreen_url,
              created_at, updated_at, item_category, verb, purpose, reason, content, 1 as published,
              record_id, session_id, metadata, page_id, item_id, status
             FROM doing_item_his
             WHERE process_id = ?
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
                published = 1,
                item_id = VALUES(item_id),
                status = VALUES(status),
                updated_at = CURRENT_TIMESTAMP`,
            [checkpointId]
        );

        // pages
        await this.connection.execute(
            `INSERT INTO pages 
             (name, coordinate, width, height, screenshot_url, my_item, page_no, record_id, published, code)
             SELECT 
              name, coordinate, width, height, screenshot_url, my_item, page_no, record_id, 1 as published, code
             FROM pages_his
             WHERE process_id = ?
             ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                coordinate = VALUES(coordinate),
                width = VALUES(width),
                height = VALUES(height),
                screenshot_url = VALUES(screenshot_url),
                record_id = VALUES(record_id),
                published = 1,
                code = VALUES(code),
                updated_at = CURRENT_TIMESTAMP`,
            [checkpointId]
        );

        // doing_step
        await this.connection.execute(
            `INSERT INTO doing_step 
             (code, my_ai_tool, my_step, record_id, step_id, step_timestamp, step_type,
              my_panel_before, my_action, my_panel_after, step_input, step_output, step_asset, published)
             SELECT 
              code, my_ai_tool, my_step, record_id, step_id, step_timestamp, step_type,
              my_panel_before, my_action, my_panel_after, step_input, step_output, step_asset, 1 as published
             FROM doing_step_his
             WHERE process_id = ?
             ON DUPLICATE KEY UPDATE
                step_id = VALUES(step_id),
                step_timestamp = VALUES(step_timestamp),
                my_panel_before = VALUES(my_panel_before),
                my_action = VALUES(my_action),
                my_panel_after = VALUES(my_panel_after),
                record_id = VALUES(record_id),
                published = 1,
                updated_at = CURRENT_TIMESTAMP`,
            [checkpointId]
        );

        // myparent_panel
        await this.connection.execute(
            `INSERT INTO myparent_panel 
             (my_item_code, my_parent_item, published, record_id)
             SELECT 
              my_item_code, my_parent_item, 1 as published, record_id
             FROM myparent_panel_his
             WHERE process_id = ?
             ON DUPLICATE KEY UPDATE
                my_parent_item = VALUES(my_parent_item),
                record_id = VALUES(record_id),
                published = 1,
                updated_at = CURRENT_TIMESTAMP`,
            [checkpointId]
        );

        // Mark checkpoint as rolledback
        if (recordId) {
            await this.connection.execute(
                `UPDATE process SET rolledback_by = ?, updated_at = NOW() WHERE code = ? AND my_ai_tool = ?`,
                [recordId, checkpointId, this.myAiTool]
            );
        }

        console.log(`✅ Rollback database data from checkpoint ${checkpointId}`);
    }

    /**
     * Update checkpoints.json with new checkpoint metadata
     */
    async _updateCheckpointsJson(checkpointId, timestamp, name, description, recordId, localSuccess, dbSuccess) {
        let data = { checkpoints: [] };
        
        try {
            const content = await fsp.readFile(this.checkpointsJsonPath, 'utf8');
            data = JSON.parse(content);
            if (!data.checkpoints) {
                data.checkpoints = [];
            }
        } catch (err) {
            // File doesn't exist or invalid, start fresh
        }

        // Remove existing checkpoint with same ID if any
        data.checkpoints = data.checkpoints.filter(cp => cp.checkpointId !== checkpointId);

        // Add new checkpoint
        data.checkpoints.push({
            checkpointId,
            timestamp,
            name,
            description: description || null,
            recordId: recordId || null,
            localSuccess,
            dbSuccess
        });

        // Write back
        await fsp.writeFile(this.checkpointsJsonPath, JSON.stringify(data, null, 2), 'utf8');
    }

    /**
     * Backup current state before rollback
     */
    async _backupCurrentState(backupFolder) {
        await fsp.mkdir(backupFolder, { recursive: true });

        const filesToBackup = [
            'doing_item.jsonl',
            'myparent_panel.jsonl',
            'doing_step.jsonl',
            'click.jsonl',
            'page.jsonl',
            'info.json'
        ];

        for (const fileName of filesToBackup) {
            const sourcePath = path.join(this.sessionFolder, fileName);
            const destPath = path.join(backupFolder, fileName);
            
            try {
                await fsp.copyFile(sourcePath, destPath);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    throw err;
                }
            }
        }

        // Backup images folder
        const imagesSource = path.join(this.sessionFolder, 'images');
        const imagesDest = path.join(backupFolder, 'images');
        
        try {
            await fsp.access(imagesSource);
            await this._copyDirectory(imagesSource, imagesDest);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }
    }

    /**
     * Restore from backup
     */
    async _restoreFromBackup(backupFolder) {
        const filesToRestore = [
            'doing_item.jsonl',
            'myparent_panel.jsonl',
            'doing_step.jsonl',
            'click.jsonl',
            'page.jsonl',
            'info.json'
        ];

        for (const fileName of filesToRestore) {
            const sourcePath = path.join(backupFolder, fileName);
            const destPath = path.join(this.sessionFolder, fileName);
            
            try {
                await fsp.copyFile(sourcePath, destPath);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    throw err;
                }
            }
        }

        // Restore images folder
        const imagesSource = path.join(backupFolder, 'images');
        const imagesDest = path.join(this.sessionFolder, 'images');
        
        try {
            await fsp.rm(imagesDest, { recursive: true, force: true });
            await fsp.access(imagesSource);
            await this._copyDirectory(imagesSource, imagesDest);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }
    }

    /**
     * Copy directory recursively
     */
    async _copyDirectory(source, dest) {
        await fsp.mkdir(dest, { recursive: true });

        const entries = await fsp.readdir(source, { withFileTypes: true });

        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                await this._copyDirectory(sourcePath, destPath);
            } else {
                await fsp.copyFile(sourcePath, destPath);
            }
        }
    }

    /**
     * Helper to get all items for auto-generating checkpoint name
     */
    async _getAllItems() {
        try {
            const doingItemPath = path.join(this.sessionFolder, 'doing_item.jsonl');
            const content = await fsp.readFile(doingItemPath, 'utf8');
            return content.trim().split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));
        } catch (err) {
            return [];
        }
    }
}
