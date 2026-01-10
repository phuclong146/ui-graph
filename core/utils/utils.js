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
// Hàm tính overlap dựa vào bounding box
export const calcOverlapBox = (a, b) => {
    // Lấy toạ độ
    const ax1 = a.x;
    const ay1 = a.y;
    const ax2 = a.x + a.w;
    const ay2 = a.y + a.h;

    const bx1 = b.x;
    const by1 = b.y;
    const bx2 = b.x + b.w;
    const by2 = b.y + b.h;

    // Intersection
    const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
    const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
    const intersection = overlapX * overlapY;

    if (intersection <= 0) return 0;

    // Area của từng box
    const aArea = a.w * a.h;
    const bArea = b.w * b.h;

    // Union = A + B - Intersect
    const union = aArea + bArea - intersection;

    if (union <= 0) return 0;

    return intersection / union;
};

// Kích thước làm tròn cho panel (có thể chỉnh sửa dễ dàng)
const ROUND_SIZE = 10;
export const isBoxInside = (a, b, threshold = 0.95) => {
    // 1. Tính diện tích 2 hình trước
    const areaA = a.w * a.h;
    const areaB = b.w * b.h;
    if (areaA <= 0 || areaB <= 0) return "none";

    // 2. Xác định panel nào lớn hơn và làm tròn:
    //    - Panel lớn hơn: roundUP - mở rộng ra 4 hướng (x -= ROUND_SIZE, y -= ROUND_SIZE, w += 2*ROUND_SIZE, h += 2*ROUND_SIZE)
    //    - Panel nhỏ hơn: roundDOWN - thu hẹp lại cả 4 hướng (x += ROUND_SIZE, y += ROUND_SIZE, w -= 2*ROUND_SIZE, h -= 2*ROUND_SIZE)
    let roundedA = { ...a };
    let roundedB = { ...b };

    if (areaA >= areaB) {
        // A lớn hơn hoặc bằng B: A roundUP, B roundDOWN
        roundedA = {
            x: Math.max(0, a.x - ROUND_SIZE),     // Đảm bảo x >= 0
            y: Math.max(0, a.y - ROUND_SIZE),     // Đảm bảo y >= 0
            w: Math.max(1, a.w + 2 * ROUND_SIZE), // Đảm bảo w > 0
            h: Math.max(1, a.h + 2 * ROUND_SIZE)  // Đảm bảo h > 0
        };
        roundedB = {
            x: Math.max(0, b.x + ROUND_SIZE),     // Đảm bảo x >= 0
            y: Math.max(0, b.y + ROUND_SIZE),     // Đảm bảo y >= 0
            w: Math.max(1, b.w - 2 * ROUND_SIZE), // Đảm bảo w > 0
            h: Math.max(1, b.h - 2 * ROUND_SIZE)  // Đảm bảo h > 0
        };
    } else {
        // B lớn hơn: B roundUP, A roundDOWN
        roundedA = {
            x: Math.max(0, a.x + ROUND_SIZE),     // Đảm bảo x >= 0
            y: Math.max(0, a.y + ROUND_SIZE),     // Đảm bảo y >= 0
            w: Math.max(1, a.w - 2 * ROUND_SIZE), // Đảm bảo w > 0
            h: Math.max(1, a.h - 2 * ROUND_SIZE)  // Đảm bảo h > 0
        };
        roundedB = {
            x: Math.max(0, b.x - ROUND_SIZE),     // Đảm bảo x >= 0
            y: Math.max(0, b.y - ROUND_SIZE),     // Đảm bảo y >= 0
            w: Math.max(1, b.w + 2 * ROUND_SIZE), // Đảm bảo w > 0
            h: Math.max(1, b.h + 2 * ROUND_SIZE)  // Đảm bảo h > 0
        };
    }

    // 3. Tính diện tích vùng giao nhau với các box đã làm tròn
    const xOverlap = Math.max(0, Math.min(roundedA.x + roundedA.w, roundedB.x + roundedB.w) - Math.max(roundedA.x, roundedB.x));
    const yOverlap = Math.max(0, Math.min(roundedA.y + roundedA.h, roundedB.y + roundedB.h) - Math.max(roundedA.y, roundedB.y));
    const overlapArea = xOverlap * yOverlap;

    if (overlapArea <= 0) return "NO_OVERLAP";

    // 4. Tính diện tích sau khi làm tròn
    const roundedAreaA = roundedA.w * roundedA.h;
    const roundedAreaB = roundedB.w * roundedB.h;
    if (roundedAreaA <= 0 || roundedAreaB <= 0) return "NO_OVERLAP";

    // 5. Kiểm tra điều kiện ngưỡng (threshold) với các box đã làm tròn
    const isAInB = (overlapArea / roundedAreaA) >= threshold;
    const isBInA = (overlapArea / roundedAreaB) >= threshold;

    // 6. Quyết định kết quả dựa trên logic diện tích
    if (isAInB && isBInA) {
        // Nếu cả hai đều thỏa mãn, hình nào nhỏ hơn sẽ được coi là nằm trong hình kia
        // return areaA <= areaB ? "A_in_B" : "B_in_A";
        return "BOTN_IN_BOTH";
    }
    
    if (isAInB) return "A_in_B";
    if (isBInA) return "B_in_A";

    return "NO_OVERLAP";
};

// SHA256 hash function for file content (supports large files)
export const calculateHash = async (content) => {
    if (content.length === 0) return '';
    
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
};