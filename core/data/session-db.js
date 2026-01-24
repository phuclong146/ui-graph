import { getDbPool } from './db-connection.js';

export async function upsertSessionToDb(info, account) {
    try {
        const pool = getDbPool();
        
        const sessionId = info.timestamps && info.timestamps.length > 0 ? info.timestamps[0] : null;
        const role = info.role;
        const myAiTool = info.toolCode;
        const name = account.name;
        const deviceId = account.device_id;
        const deviceInfo = typeof account.device_info === 'object' ? JSON.stringify(account.device_info) : account.device_info;

        console.log('📝 [upsertSessionToDb] Input info:', JSON.stringify({
            sessionId,
            role,
            myAiTool,
            name,
            deviceId,
            deviceInfoLength: deviceInfo ? deviceInfo.length : 0
        }, null, 2));

        if (!sessionId) {
            console.error('❌ upsertSessionToDb: session_id (timestamps[0]) is missing');
            return;
        }

        const [rows] = await pool.query('SELECT id FROM uigraph_session WHERE session_id = ? LIMIT 1', [sessionId]);
        
        if (rows.length > 0) {
            // Update
            const query = `
                UPDATE uigraph_session 
                SET role = ?, my_ai_tool = ?, name = ?, device_id = ?, device_info = ?, updated_at = NOW()
                WHERE session_id = ?
            `;
            await pool.execute(query, [role, myAiTool, name, deviceId, deviceInfo, sessionId]);
            console.log(`✅ Session updated in DB: ${sessionId}`);
        } else {
            // Insert
            const query = `
                INSERT INTO uigraph_session (session_id, role, my_ai_tool, name, device_id, device_info)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            await pool.execute(query, [sessionId, role, myAiTool, name, deviceId, deviceInfo]);
            console.log(`✅ Session inserted into DB: ${sessionId}`);
        }

    } catch (err) {
        console.error('❌ Failed to upsert session to DB:', err);
    }
}
