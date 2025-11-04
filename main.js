// main.js
import { PanelScreenTracker } from "./core/tracker/PanelScreenTracker.js";

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
