import dotenv from "dotenv";
dotenv.config();

export const ENV = {
    API_TOKEN: process.env.API_TOKEN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    GEMINI_MODEL_REST: process.env.GEMINI_MODEL_REST,
    GEMINI_USE_REST: process.env.GEMINI_USE_REST || "true",
    UPLOAD_URL: process.env.UPLOAD_URL,
    CHROME_PATH: process.env.CHROME_PATH,
    RECORD_PANEL: process.env.RECORD_PANEL || "true",
    SAVE_REMINDER_INTERVAL_MS: parseInt(process.env.SAVE_REMINDER_INTERVAL_MS) || 1800000, // 30 minutes default
};

/**
 * Reload API_TOKEN from environment after refresh
 */
export function reloadApiToken() {
    dotenv.config();
    ENV.API_TOKEN = process.env.API_TOKEN;
}
