import fs from "fs";
import path from "path";
import {execSync} from "child_process";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const ensureDir = (dir) => {
    const d = path.resolve(dir);
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    return d;
};

export const saveBase64AsFile = (base64, folder = "screens", filename = null) => {
    ensureDir(folder);
    const name = filename || `${Date.now()}.png`;
    const filePath = path.join(path.resolve(folder), name);
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return filePath;
};

export const getScreenSize = () => {
    try {
        if (process.platform === 'darwin') {
            const result = execSync(
                `osascript -e 'tell application "Finder" to get bounds of window of desktop'`
            ).toString();
            const [x, y, width, height] = result.split(',').map(s => parseInt(s.trim(), 10));
            return { width, height };
        } else if (process.platform === 'win32') {
            const result = execSync(
                `powershell -command "Add-Type -AssemblyName System.Windows.Forms; $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output $screen.Width; Write-Output $screen.Height"`
            ).toString().trim().split('\n').map(s => parseInt(s.trim(), 10));
            console.log('PowerShell result:', result);
            return { width: result[0], height: result[1] };
        } else {
            const result = execSync(`xrandr | grep '*' | awk '{print $1}'`).toString();
            const [width, height] = result.split('x').map(Number);
            return { width, height };
        }
    } catch (e) {
        console.error("⚠️ Lấy screen size thất bại, fallback 1920x1080");
        return { width: 1920, height: 1080 };
    }
};
