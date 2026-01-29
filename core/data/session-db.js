import { getDbPool } from './db-connection.js';

/**
 * Generate collaborator_code from device_id
 * Format: COLLAB_[DEVICE_ID in uppercase]
 * @param {string} deviceId - The device ID
 * @returns {string} - The collaborator code
 */
export function generateCollaboratorCode(deviceId) {
    if (!deviceId) {
        return null;
    }
    return `COLLAB_${deviceId.toUpperCase()}`;
}

/**
 * Upsert collaborator to uigraph_collaborator table
 * @param {Object} account - Account object with device_id, device_info, name, collaborator_code
 */
export async function upsertCollaboratorToDb(account) {
    try {
        const pool = getDbPool();
        
        if (!account.device_id) {
            console.error('❌ upsertCollaboratorToDb: device_id is missing');
            return;
        }

        const collaboratorCode = account.collaborator_code || generateCollaboratorCode(account.device_id);
        const deviceId = account.device_id;
        const name = account.name || null;
        const deviceInfo = typeof account.device_info === 'object' ? JSON.stringify(account.device_info) : account.device_info;

        console.log('📝 [upsertCollaboratorToDb] Input:', JSON.stringify({
            code: collaboratorCode,
            deviceId,
            name,
            deviceInfoLength: deviceInfo ? deviceInfo.length : 0
        }, null, 2));

        // Check if collaborator exists
        const [rows] = await pool.query('SELECT id FROM uigraph_collaborator WHERE code = ? LIMIT 1', [collaboratorCode]);
        
        if (rows.length > 0) {
            // Update
            const query = `
                UPDATE uigraph_collaborator 
                SET name = ?, device_id = ?, device_info = ?, updated_at = NOW()
                WHERE code = ?
            `;
            await pool.execute(query, [name, deviceId, deviceInfo, collaboratorCode]);
            console.log(`✅ Collaborator updated in DB: ${collaboratorCode}`);
        } else {
            // Insert
            const query = `
                INSERT INTO uigraph_collaborator (code, name, device_id, device_info, published)
                VALUES (?, ?, ?, ?, 1)
            `;
            await pool.execute(query, [collaboratorCode, name, deviceId, deviceInfo]);
            console.log(`✅ Collaborator inserted into DB: ${collaboratorCode}`);
        }

    } catch (err) {
        console.error('❌ Failed to upsert collaborator to DB:', err);
    }
}

/**
 * Check if there's an active session for a given ai_tool
 * @param {string} aiToolCode - The ai_tool code to check
 * @returns {Promise<Object|null>} - Active session info or null if none
 */
export async function checkActiveSession(aiToolCode) {
    try {
        const pool = getDbPool();
        const query = `
            SELECT * FROM uigraph_session 
            WHERE my_ai_tool = ? AND role = 'DRAW' AND active = 1 
            ORDER BY id DESC 
            LIMIT 1
        `;
        const [rows] = await pool.query(query, [aiToolCode]);
        
        if (rows.length > 0) {
            return rows[0];
        }
        return null;
    } catch (err) {
        console.error('❌ Failed to check active session:', err);
        return null;
    }
}

/**
 * Get active session info for display in conflict modal
 * @param {string} aiToolCode - The ai_tool code to check
 * @returns {Promise<Object|null>} - Active session info with formatted data or null
 */
export async function getActiveSessionInfo(aiToolCode) {
    try {
        const activeSession = await checkActiveSession(aiToolCode);
        if (!activeSession) {
            return null;
        }

        // Parse device_info if it's a string
        let deviceInfo = activeSession.device_info;
        if (typeof deviceInfo === 'string') {
            try {
                deviceInfo = JSON.parse(deviceInfo);
            } catch (e) {
                // Keep as string if parsing fails
            }
        }

        // Format timestamps (session_id) to readable date
        const sessionId = activeSession.session_id;
        let creationTime = 'N/A';
        if (sessionId) {
            try {
                const timestamp = parseInt(sessionId);
                if (!isNaN(timestamp)) {
                    const date = new Date(timestamp);
                    const dd = String(date.getDate()).padStart(2, '0');
                    const mm = String(date.getMonth() + 1).padStart(2, '0');
                    const yyyy = date.getFullYear();
                    const hh = String(date.getHours()).padStart(2, '0');
                    const min = String(date.getMinutes()).padStart(2, '0');
                    const ss = String(date.getSeconds()).padStart(2, '0');
                    creationTime = `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
                }
            } catch (e) {
                console.error('Failed to format creation time:', e);
            }
        }

        // Format last work time (updated_at)
        let lastWorkTime = 'N/A';
        if (activeSession.updated_at) {
            try {
                const date = new Date(activeSession.updated_at);
                const dd = String(date.getDate()).padStart(2, '0');
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const yyyy = date.getFullYear();
                const hh = String(date.getHours()).padStart(2, '0');
                const min = String(date.getMinutes()).padStart(2, '0');
                const ss = String(date.getSeconds()).padStart(2, '0');
                lastWorkTime = `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
            } catch (e) {
                console.error('Failed to format last work time:', e);
            }
        }

        return {
            name: activeSession.name || 'Unknown',
            session_name: activeSession.session_name || 'N/A',
            session_id: sessionId,
            creationTime: creationTime,
            lastWorkTime: lastWorkTime,
            device_id: activeSession.device_id || 'N/A',
            device_info: deviceInfo
        };
    } catch (err) {
        console.error('❌ Failed to get active session info:', err);
        return null;
    }
}

export async function upsertSessionToDb(info, account) {
    try {
        const pool = getDbPool();
        
        const sessionId = info.timestamps && info.timestamps.length > 0 ? info.timestamps[0] : null;
        const role = info.role;
        const myAiTool = info.toolCode;
        const name = account.name;
        const deviceId = account.device_id;
        const deviceInfo = typeof account.device_info === 'object' ? JSON.stringify(account.device_info) : account.device_info;
        // Generate collaborator_code if not present
        const collaboratorCode = account.collaborator_code || generateCollaboratorCode(deviceId);
        // Session name matches folder naming: toolCode_timestamp or VALIDATE_toolCode_timestamp
        const sessionName = role === 'VALIDATE'
            ? `VALIDATE_${myAiTool}_${sessionId}`
            : `${myAiTool}_${sessionId}`;

        console.log('📝 [upsertSessionToDb] Input info:', JSON.stringify({
            sessionId,
            sessionName,
            role,
            myAiTool,
            name,
            deviceId,
            collaboratorCode,
            deviceInfoLength: deviceInfo ? deviceInfo.length : 0
        }, null, 2));

        if (!sessionId) {
            console.error('❌ upsertSessionToDb: session_id (timestamps[0]) is missing');
            return;
        }

        // Upsert collaborator first
        await upsertCollaboratorToDb(account);

        const [rows] = await pool.query('SELECT id FROM uigraph_session WHERE session_id = ? LIMIT 1', [sessionId]);
        
        if (rows.length > 0) {
            // Update
            const query = `
                UPDATE uigraph_session 
                SET role = ?, my_ai_tool = ?, session_name = ?, name = ?, device_id = ?, device_info = ?, my_collaborator = ?, active = 1, updated_at = NOW()
                WHERE session_id = ?
            `;
            await pool.execute(query, [role, myAiTool, sessionName, name, deviceId, deviceInfo, collaboratorCode, sessionId]);
            console.log(`✅ Session updated in DB: ${sessionId}`);
        } else {
            // Insert
            const query = `
                INSERT INTO uigraph_session (session_id, role, my_ai_tool, session_name, name, device_id, device_info, my_collaborator, active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            `;
            await pool.execute(query, [sessionId, role, myAiTool, sessionName, name, deviceId, deviceInfo, collaboratorCode]);
            console.log(`✅ Session inserted into DB: ${sessionId}`);
        }

    } catch (err) {
        console.error('❌ Failed to upsert session to DB:', err);
    }
}
