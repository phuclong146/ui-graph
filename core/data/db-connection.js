import mysql from 'mysql2/promise';

const MYSQL_CONFIG = {
    host: 'mysql.clevai.vn',
    port: 3306,
    user: 'comaker',
    password: 'zwTe1ROMxeRRZAiXhCDmfNRTeFsroMLI',
    database: 'comaker',
    connectTimeout: 60000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool = null;

export function getDbPool() {
    if (!pool) {
        console.log('🔌 Initializing MySQL connection pool...');
        pool = mysql.createPool(MYSQL_CONFIG);
    }
    return pool;
}

export async function initDbPool() {
    const pool = getDbPool();
    try {
        const connection = await pool.getConnection();
        console.log('🔌 MySQL connection pool ready');
        connection.release();
    } catch (err) {
        console.error('❌ Failed to initialize MySQL pool:', err);
    }
}

export async function closeDbPool() {
    if (pool) {
        console.log('🔌 Closing MySQL connection pool...');
        await pool.end();
        pool = null;
    }
}
