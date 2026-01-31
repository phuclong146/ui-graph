import { promises as fsp } from 'fs';
import path from 'path';

/**
 * ValidationManager - Quản lý file uigraph_validation.jsonl
 * Format: JSONL (one line per entry)
 * Each line: {"item_id": "...", "created_at": timestamp, "my_ai_tool": "...", "my_day": "...", "my_session": "...", "my_scene": "..."}
 */
export class ValidationManager {
    constructor(sessionFolder, myAiToolCode) {
        this.sessionFolder = sessionFolder;
        this.myAiToolCode = myAiToolCode;
        this.validationPath = path.join(sessionFolder, 'uigraph_validation.jsonl');
    }

    /**
     * Convert UTC date to GMT+7
     * @param {Date} utcDate - UTC date object
     * @returns {Date} - GMT+7 date object
     */
    convertToGMT7(utcDate) {
        // GMT+7 = UTC + 7 hours
        const gmt7Date = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);
        return gmt7Date;
    }

    /**
     * Format date to yyyyMMdd
     * @param {Date} date - Date object (GMT+7)
     * @returns {string} - Formatted string yyyyMMdd
     */
    formatMyDay(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    /**
     * Format date to yyyyMMddHH with 2-hour rounding down
     * @param {Date} date - Date object (GMT+7)
     * @returns {string} - Formatted string yyyyMMddHH
     */
    formatMySession(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        
        // Round down to 2-hour intervals: 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22
        const hour = date.getUTCHours();
        const roundedHour = Math.floor(hour / 2) * 2;
        const formattedHour = String(roundedHour).padStart(2, '0');
        
        return `${year}${month}${day}${formattedHour}`;
    }

    /**
     * Format date to yyyyMMddHHmm with 10-minute rounding down
     * @param {Date} date - Date object (GMT+7)
     * @returns {string} - Formatted string yyyyMMddHHmm
     */
    formatMyScene(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        
        // Round down to 10-minute intervals: 0, 10, 20, 30, 40, 50
        const minute = date.getUTCMinutes();
        const roundedMinute = Math.floor(minute / 10) * 10;
        const formattedMinute = String(roundedMinute).padStart(2, '0');
        
        return `${year}${month}${day}${hour}${formattedMinute}`;
    }

    /**
     * Format validation time fields from UTC timestamp
     * @param {number} utcTimestamp - UTC timestamp in milliseconds
     * @returns {object} - Object with my_day, my_session, my_scene
     */
    formatValidationTime(utcTimestamp) {
        const utcDate = new Date(utcTimestamp);
        const gmt7Date = this.convertToGMT7(utcDate);
        
        return {
            my_day: this.formatMyDay(gmt7Date),
            my_session: this.formatMySession(gmt7Date),
            my_scene: this.formatMyScene(gmt7Date)
        };
    }

    /**
     * Read validation file and return as object (item_id as keys)
     * JSONL format: one line per validation entry
     * @returns {Promise<Object>} - Validation data object with item_id as keys
     */
    async readValidationFile() {
        try {
            const content = await fsp.readFile(this.validationPath, 'utf8');
            if (!content.trim()) {
                return {};
            }
            
            // Parse JSONL format (one JSON object per line)
            const validations = {};
            const lines = content.trim().split('\n').filter(line => line.trim());
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    if (entry.item_id) {
                        const v = entry.view_count;
                        validations[entry.item_id] = {
                            created_at: entry.created_at,
                            my_ai_tool: entry.my_ai_tool,
                            my_day: entry.my_day,
                            my_session: entry.my_session,
                            my_scene: entry.my_scene,
                            view_count: typeof v === 'number' ? v : (parseInt(v, 10) || 0)
                        };
                    }
                } catch (parseErr) {
                    console.warn(`Failed to parse validation line: ${line}`, parseErr);
                }
            }
            return validations;
        } catch (err) {
            if (err.code === 'ENOENT') {
                return {};
            }
            console.error('Failed to read validation file:', err);
            return {};
        }
    }

    /**
     * Write validation data to file in JSONL format
     * @param {Object} data - Validation data object with item_id as keys
     */
    async writeValidationFile(data) {
        try {
            const lines = [];
            for (const [itemId, validationData] of Object.entries(data)) {
                const jsonlEntry = {
                    item_id: itemId,
                    created_at: validationData.created_at,
                    my_ai_tool: validationData.my_ai_tool,
                    my_day: validationData.my_day,
                    my_session: validationData.my_session,
                    my_scene: validationData.my_scene,
                    view_count: validationData.view_count ?? 0
                };
                lines.push(JSON.stringify(jsonlEntry));
            }
            await fsp.writeFile(this.validationPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');
        } catch (err) {
            console.error('Failed to write validation file:', err);
            throw err;
        }
    }

    /**
     * Add or update validation entry
     * @param {string} itemId - Item ID
     * @param {number} createdAt - UTC timestamp in milliseconds
     */
    async addValidation(itemId, createdAt) {
        try {
            console.log(`[VALIDATION] addValidation called - itemId: ${itemId}, createdAt: ${createdAt}, myAiToolCode: ${this.myAiToolCode}, validationPath: ${this.validationPath}`);
            
            if (!this.myAiToolCode) {
                console.error(`[VALIDATION] ERROR: myAiToolCode is null or undefined!`);
                throw new Error('myAiToolCode is required for validation');
            }
            
            const validations = await this.readValidationFile();
            console.log(`[VALIDATION] Read ${Object.keys(validations).length} existing validations`);
            
            const timeFields = this.formatValidationTime(createdAt);
            console.log(`[VALIDATION] Time fields:`, timeFields);
            
            validations[itemId] = {
                created_at: createdAt,
                my_ai_tool: this.myAiToolCode,
                ...timeFields,
                view_count: 0
            };
            
            console.log(`[VALIDATION] Writing validation file to: ${this.validationPath}`);
            await this.writeValidationFile(validations);
            console.log(`✅ Added validation for item ${itemId}`);
        } catch (err) {
            console.error(`Failed to add validation for item ${itemId}:`, err);
            console.error('Error stack:', err.stack);
            throw err;
        }
    }

    /**
     * Remove validation entry
     * @param {string} itemId - Item ID
     */
    async removeValidation(itemId) {
        try {
            const validations = await this.readValidationFile();
            
            if (validations[itemId]) {
                delete validations[itemId];
                await this.writeValidationFile(validations);
                console.log(`✅ Removed validation for item ${itemId}`);
            }
        } catch (err) {
            console.error(`Failed to remove validation for item ${itemId}:`, err);
            // Don't throw - allow operation to continue
        }
    }

    /**
     * Increment view_count for a validation entry (used when VALIDATE role clicks action in panel log).
     * Updates uigraph_validation.jsonl only; caller is responsible for DB updates.
     * @param {string} itemId - Item ID (action item_id)
     * @returns {Promise<number>} - New view_count after increment, or 0 if entry not found
     */
    async incrementViewCount(itemId) {
        try {
            const validations = await this.readValidationFile();
            const entry = validations[itemId];
            if (!entry) {
                return 0;
            }
            const prev = entry.view_count ?? 0;
            entry.view_count = prev + 1;
            await this.writeValidationFile(validations);
            return entry.view_count;
        } catch (err) {
            console.error(`Failed to increment view_count for item ${itemId}:`, err);
            throw err;
        }
    }

    /**
     * Get validation entry
     * @param {string} itemId - Item ID
     * @returns {Promise<Object|null>} - Validation entry or null
     */
    async getValidation(itemId) {
        try {
            const validations = await this.readValidationFile();
            return validations[itemId] || null;
        } catch (err) {
            console.error(`Failed to get validation for item ${itemId}:`, err);
            return null;
        }
    }

    /**
     * Get all validations
     * @returns {Promise<Object>} - All validation entries
     */
    async getAllValidations() {
        return await this.readValidationFile();
    }
}
