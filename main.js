// main.js
import { PanelScreenTracker } from "./core/tracker/PanelScreenTracker.js";

// Handle unhandled promise rejections (e.g., EPERM errors from chrome-launcher cleanup)
process.on('unhandledRejection', (reason, promise) => {
    const isPermissionError = reason?.code === 'EPERM' || 
                            reason?.errno === 1 || 
                            (reason?.message && reason.message.includes('Permission denied')) ||
                            (reason?.message && reason.message.includes('EPERM'));
    
    if (isPermissionError) {
        // EPERM errors during browser cleanup are harmless on Windows
        console.warn('⚠️ Permission warning during cleanup (harmless on Windows):', reason?.message || reason);
    } else {
        console.error('❌ Unhandled promise rejection:', reason);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    const isPermissionError = error?.code === 'EPERM' || 
                            error?.errno === 1 || 
                            (error?.message && error.message.includes('Permission denied')) ||
                            (error?.message && error.message.includes('EPERM'));
    
    if (isPermissionError) {
        // EPERM errors during browser cleanup are harmless on Windows
        console.warn('⚠️ Permission warning during cleanup (harmless on Windows):', error?.message || error);
    } else {
        console.error('❌ Uncaught exception:', error);
        process.exit(1);
    }
});

async function main() {
    const tracker = new PanelScreenTracker();
    try {
        await tracker.init();
        console.log("✅ Ready — chọn website trong cửa sổ trình duyệt chính để bắt đầu tracking.");
        // Giữ tiến trình chạy
        process.on("SIGINT", async () => {
            console.log("\n🛑 Ctrl+C pressed, closing...");
            await tracker.close();
        });
    } catch (err) {
        console.error("❌ Fatal error in main:", err);
        await tracker.close();
    }
}

main();
