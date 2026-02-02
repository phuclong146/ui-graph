import crypto from 'crypto';
import path from 'path';
import { promises as fsp } from 'fs';
import { getDbPool } from './db-connection.js';

/**
 * Process type constants for ADMIN/VALIDATE actions that change DB
 */
export const PROCESS_TYPES = {
    ADMIN_ASSIGN_VALIDATOR: { code: 'ADMIN_ASSIGN_VALIDATOR', name: 'Assign Validator' },
    ADMIN_UNASSIGN_VALIDATOR: { code: 'ADMIN_UNASSIGN_VALIDATOR', name: 'Unassign Validator' },
    ADMIN_RANDOM_ASSIGN: { code: 'ADMIN_RANDOM_ASSIGN', name: 'Random Assign Sessions' },
    ADMIN_UPDATE_SESSION_ACTIVE: { code: 'ADMIN_UPDATE_SESSION_ACTIVE', name: 'Update Session Active' },
    ADMIN_CORRECT_CHILD: { code: 'ADMIN_CORRECT_CHILD', name: 'Correct Child Actions & Panels' },
    SET_IMPORTANT_ACTION: { code: 'SET_IMPORTANT_ACTION', name: 'Set Important Action' },
    SET_NORMAL_ACTION: { code: 'SET_NORMAL_ACTION', name: 'Set Normal Action' },
    RESOLVE_BUG: { code: 'RESOLVE_BUG', name: 'Resolve Bug' },
    CANCEL_BUG: { code: 'CANCEL_BUG', name: 'Cancel Bug' },
    RAISE_BUG: { code: 'RAISE_BUG', name: 'Raise Bug' },
    VALIDATE_VIEW_ACTION: { code: 'VALIDATE_VIEW_ACTION', name: 'Validate View Action' }
};

/**
 * Format bug_info for process log description
 * @param {Object|null} bugInfo - { note, details: [{ bug_type, bug_name, bug_fixed, resolved_at }] }
 * @returns {string}
 */
export function formatBugInfoForLog(bugInfo) {
    if (!bugInfo || typeof bugInfo !== 'object') return '';
    const parts = [];
    if (bugInfo.note && typeof bugInfo.note === 'string') {
        const note = bugInfo.note.length > 200 ? bugInfo.note.slice(0, 200) + '...' : bugInfo.note;
        parts.push(`note: "${note.replace(/"/g, "'")}"`);
    }
    if (Array.isArray(bugInfo.details) && bugInfo.details.length > 0) {
        const types = bugInfo.details.map(d => (d.bug_name || d.bug_type || '?'));
        parts.push(`types: [${types.join(', ')}]`);
        const fixed = bugInfo.details.filter(d => d.bug_fixed);
        if (fixed.length > 0) {
            const fixedStr = fixed.map(d => `${d.bug_name || d.bug_type}${d.resolved_at ? ' @ ' + d.resolved_at : ''}`).join('; ');
            parts.push(`resolved: [${fixedStr}]`);
        }
    }
    return parts.join('; ');
}

/**
 * Get record_id (session_id) from info.json in session folder
 * @param {string} sessionFolder - Path to session folder
 * @returns {Promise<number|null>}
 */
export async function getRecordIdFromSessionFolder(sessionFolder) {
    if (!sessionFolder) return null;
    try {
        const infoPath = path.join(sessionFolder, 'info.json');
        const info = JSON.parse(await fsp.readFile(infoPath, 'utf8'));
        if (info.timestamps && info.timestamps.length > 0) {
            return info.timestamps[0];
        }
    } catch (err) {
        if (err.code !== 'ENOENT') console.warn('⚠️ getRecordIdFromSessionFolder:', err.message);
    }
    return null;
}

/**
 * Log ADMIN/VALIDATE action to process table
 * @param {Object} params
 * @param {string} params.processType - Process type code (e.g. 'ADMIN_ASSIGN_VALIDATOR')
 * @param {string} params.name - Process type name (e.g. 'Assign Validator')
 * @param {string} params.description - Detailed description of data changes
 * @param {string} params.myAiTool - AI tool code
 * @param {number|null} [params.recordId] - Session ID (record_id)
 * @param {number|string|null} [params.createdBy] - Who performed (record_id or collaborator_code)
 */
export async function logAdminValidateProcess({ processType, name, description, myAiTool, recordId = null, createdBy = null }) {
    try {
        const code = crypto.randomUUID();
        const pool = getDbPool();
        await pool.execute(
            `INSERT INTO process (code, process_type, name, description, published, my_ai_tool, record_id, created_by)
             VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
            [code, processType, name, description || '', myAiTool, recordId, createdBy ?? recordId]
        );
        console.log(`📋 [process] Logged ${processType}: ${name}`);
    } catch (err) {
        console.error(`❌ [process] Failed to log ${processType}:`, err.message);
    }
}
