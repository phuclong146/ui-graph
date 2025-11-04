import dotenv from "dotenv";
dotenv.config();

export const ENV = {
    API_TOKEN: process.env.API_TOKEN || "",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
    GEMINI_MODEL: process.env.GEMINI_MODEL || "",
    GEMINI_MODEL_REST: process.env.GEMINI_MODEL_REST || "gemini-2.5-flash",
    GEMINI_USE_REST: process.env.GEMINI_USE_REST || "true",
    UPLOAD_URL: process.env.UPLOAD_URL || "",
};
