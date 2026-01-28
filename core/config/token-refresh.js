import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const envPath = path.join(projectRoot, '.env');

/**
 * Refresh API token by calling login API
 * Retries on failure: 1 second intervals, max 30 times
 * @returns {Promise<string>} New access token
 */
export async function refreshApiToken() {
    const username = process.env.LOGIN_USERNAME || '0973013488';
    const password = process.env.LOGIN_PASSWORD || '0973013488';
    
    const loginUrl = 'https://api-gateway.mikai.tech/api/v1/user/login/lms-web';
    const maxRetries = 30;
    const retryDelay = 1000; // 1 second
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 Attempting to refresh API token (attempt ${attempt}/${maxRetries})...`);
            
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    usernameOrEmail: username,
                    password: password
                })
            });
            
            const responseText = await response.text();
            
            if (!response.ok) {
                throw new Error(`Login API returned status ${response.status}: ${responseText}`);
            }
            
            let responseData;
            try {
                responseData = JSON.parse(responseText);
            } catch (e) {
                throw new Error(`Failed to parse login response: ${responseText}`);
            }
            
            if (responseData.status === 'success' && responseData.data?.access_token) {
                const newToken = responseData.data.access_token;
                console.log('✅ Successfully refreshed API token');
                
                // Update .env file
                await updateEnvFile(newToken);
                
                // Reload dotenv to update process.env
                dotenv.config();
                
                return newToken;
            } else {
                throw new Error(`Login failed: ${responseText}`);
            }
        } catch (error) {
            lastError = error;
            console.error(`❌ Token refresh attempt ${attempt} failed:`, error.message);
            
            if (attempt < maxRetries) {
                console.log(`⏳ Retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }
    
    // All retries failed
    throw new Error(`Failed to refresh API token after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Update API_TOKEN in .env file
 * @param {string} newToken - New access token to write
 */
async function updateEnvFile(newToken) {
    try {
        // Read current .env file
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        // Update or add API_TOKEN
        const lines = envContent.split('\n');
        let apiTokenFound = false;
        
        const updatedLines = lines.map(line => {
            if (line.startsWith('API_TOKEN=')) {
                apiTokenFound = true;
                return `API_TOKEN=${newToken}`;
            }
            return line;
        });
        
        // If API_TOKEN not found, add it
        if (!apiTokenFound) {
            updatedLines.push(`API_TOKEN=${newToken}`);
        }
        
        // Write back to .env file
        fs.writeFileSync(envPath, updatedLines.join('\n'), 'utf8');
        console.log('✅ Updated API_TOKEN in .env file');
    } catch (error) {
        console.error('❌ Failed to update .env file:', error);
        throw error;
    }
}

/**
 * Check if error indicates token expiration or authentication failure
 * @param {Error} error - Error object
 * @param {number} statusCode - HTTP status code (if available)
 * @returns {boolean} True if token needs refresh
 */
export function isTokenExpiredError(error, statusCode) {
    // Check HTTP status codes that indicate auth failure
    if (statusCode === 401 || statusCode === 403) {
        return true;
    }
    
    // Check error message for common auth failure patterns
    const errorMessage = error?.message || '';
    const lowerMessage = errorMessage.toLowerCase();
    
    return (
        lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('forbidden') ||
        lowerMessage.includes('token') && (lowerMessage.includes('expired') || lowerMessage.includes('invalid')) ||
        lowerMessage.includes('authentication') ||
        lowerMessage.includes('401') ||
        lowerMessage.includes('403')
    );
}
