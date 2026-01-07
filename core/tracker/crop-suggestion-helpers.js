import { calcOverlapBox } from '../utils/utils.js';

/**
 * Simple bounding-box clustering based on IoU / distance.
 */
const clusterBoxes = (boxes, maxGap = 40) => {
    if (!boxes || boxes.length === 0) return [];

    const clusters = [];
    const visited = new Array(boxes.length).fill(false);

    const isConnected = (a, b) => {
        const overlap = calcOverlapBox(a, b);
        if (overlap > 0) return true;

        const ax2 = a.x + a.w;
        const ay2 = a.y + a.h;
        const bx2 = b.x + b.w;
        const by2 = b.y + b.h;

        const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(ax2, bx2));
        const dy = Math.max(0, Math.max(ay2, by2) - Math.min(a.y, b.y));

        return Math.max(dx, dy) <= maxGap;
    };

    for (let i = 0; i < boxes.length; i++) {
        if (visited[i]) continue;

        const stack = [i];
        visited[i] = true;
        const indices = [];

        while (stack.length) {
            const idx = stack.pop();
            indices.push(idx);
            const boxA = boxes[idx];

            for (let j = 0; j < boxes.length; j++) {
                if (visited[j]) continue;
                if (isConnected(boxA, boxes[j])) {
                    visited[j] = true;
                    stack.push(j);
                }
            }
        }

        clusters.push(indices);
    }

    return clusters;
};

const pickLargestClusterBox = (boxes, clusters) => {
    if (!clusters || clusters.length === 0) return null;

    let best = null;
    let bestArea = 0;

    for (const indices of clusters) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const idx of indices) {
            const b = boxes[idx];
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }

        const w = maxX - minX;
        const h = maxY - minY;
        const area = w * h;

        if (area > bestArea) {
            bestArea = area;
            best = { x: minX, y: minY, w, h };
        }
    }

    return best;
};

export const detectChangeByDom = (oldDomActions, newDomActions, imageWidth, imageHeight) => {
    if (!newDomActions || newDomActions.length === 0 || !imageWidth || !imageHeight) return null;

    const scaleX = imageWidth / 1000;
    const scaleY = imageHeight / 1000;

    const newBoxes = newDomActions.map(action => ({
        x: Math.round(action.action_pos.x * scaleX),
        y: Math.round(action.action_pos.y * scaleY),
        w: Math.round(action.action_pos.w * scaleX),
        h: Math.round(action.action_pos.h * scaleY)
    }));

    const oldBoxes = (oldDomActions || []).map(action => action.action_pos);
    const changed = [];

    for (const nb of newBoxes) {
        const hasOld = oldBoxes.some(ob => calcOverlapBox(nb, ob) > 0.8);
        if (!hasOld) changed.push(nb);
    }

    for (const ob of oldBoxes) {
        const hasNew = newBoxes.some(nb => calcOverlapBox(nb, ob) > 0.8);
        if (!hasNew) changed.push(ob);
    }

    if (changed.length === 0) return null;

    const clusters = clusterBoxes(changed, 40);
    const best = pickLargestClusterBox(changed, clusters);
    if (!best) return null;

    const padding = 20;
    const x = Math.max(0, best.x - padding);
    const y = Math.max(0, best.y - padding);
    const w = Math.min(imageWidth - x, best.w + 2 * padding);
    const h = Math.min(imageHeight - y, best.h + 2 * padding);

    return { x, y, w, h, source: 'dom', score: 0.6 };
};

export const detectChangeByImageDiff = async (oldBase64, newBase64) => {
    if (!oldBase64 || !newBase64) {
        console.log('🖼️ [IMAGE DIFF] Skipped: missing old or new screenshot');
        return null;
    }

    console.log('🖼️ [IMAGE DIFF] Starting image diff detection...');
    const startTime = Date.now();

    try {
        const sharp = (await import('sharp')).default;
        const targetWidth = 1000;

        console.log(`🖼️ [IMAGE DIFF] Resizing images to ${targetWidth}px width...`);
        const [oldImg, newImg] = await Promise.all([
            sharp(Buffer.from(oldBase64, 'base64'))
                .resize({ width: targetWidth })
                .greyscale()
                .raw()
                .toBuffer({ resolveWithObject: true }),
            sharp(Buffer.from(newBase64, 'base64'))
                .resize({ width: targetWidth })
                .greyscale()
                .raw()
                .toBuffer({ resolveWithObject: true })
        ]);

        const { data: oldData, info } = oldImg;
        const { data: newData } = newImg;
        const { width, height } = info;
        console.log(`🖼️ [IMAGE DIFF] Resized to ${width}x${height}px`);

        const diffMask = new Uint8Array(width * height);
        let maxDiff = 0;
        let totalDiff = 0;

        for (let i = 0; i < oldData.length; i++) {
            const d = Math.abs(oldData[i] - newData[i]);
            diffMask[i] = d;
            totalDiff += d;
            if (d > maxDiff) maxDiff = d;
        }

        const avgDiff = totalDiff / oldData.length;
        console.log(`🖼️ [IMAGE DIFF] Diff stats: max=${maxDiff.toFixed(2)}, avg=${avgDiff.toFixed(2)}`);

        if (maxDiff < 10) {
            console.log('🖼️ [IMAGE DIFF] ❌ No significant changes detected (maxDiff < 10)');
            return null;
        }

        const threshold = maxDiff * 0.3;
        console.log(`🖼️ [IMAGE DIFF] Using threshold: ${threshold.toFixed(2)} (30% of maxDiff)`);
        const binary = new Uint8Array(width * height);
        let changedPixels = 0;
        for (let i = 0; i < diffMask.length; i++) {
            binary[i] = diffMask[i] >= threshold ? 1 : 0;
            if (binary[i]) changedPixels++;
        }
        console.log(`🖼️ [IMAGE DIFF] Changed pixels: ${changedPixels} / ${diffMask.length} (${(changedPixels / diffMask.length * 100).toFixed(2)}%)`);

        const visited = new Uint8Array(width * height);
        let bestBox = null;
        let bestArea = 0;
        let componentCount = 0;

        const toIndex = (x, y) => y * width + x;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = toIndex(x, y);
                if (!binary[i] || visited[i]) continue;

                componentCount++;
                let minX = x, maxX = x, minY = y, maxY = y;
                const stack = [i];
                visited[i] = 1;
                let pixelCount = 0;

                while (stack.length) {
                    const cur = stack.pop();
                    pixelCount++;
                    const cx = cur % width;
                    const cy = (cur - cx) / width;

                    minX = Math.min(minX, cx);
                    maxX = Math.max(maxX, cx);
                    minY = Math.min(minY, cy);
                    maxY = Math.max(maxY, cy);

                    const neighbors = [
                        [cx + 1, cy],
                        [cx - 1, cy],
                        [cx, cy + 1],
                        [cx, cy - 1]
                    ];

                    for (const [nx, ny] of neighbors) {
                        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                        const ni = toIndex(nx, ny);
                        if (!binary[ni] || visited[ni]) continue;
                        visited[ni] = 1;
                        stack.push(ni);
                    }
                }

                const area = (maxX - minX + 1) * (maxY - minY + 1);
                if (area > bestArea) {
                    bestArea = area;
                    bestBox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
                    console.log(`🖼️ [IMAGE DIFF] Found component #${componentCount}: ${bestBox.w}x${bestBox.h}px at (${bestBox.x},${bestBox.y}), pixels=${pixelCount}, area=${area}`);
                }
            }
        }

        if (!bestBox) {
            console.log('🖼️ [IMAGE DIFF] ❌ No valid component found');
            return null;
        }

        const newMeta = await sharp(Buffer.from(newBase64, 'base64')).metadata();
        const scale = newMeta.width / width;
        const padding = 20 * scale;

        const x = Math.max(0, Math.round(bestBox.x * scale - padding));
        const y = Math.max(0, Math.round(bestBox.y * scale - padding));
        const w = Math.min(newMeta.width - x, Math.round(bestBox.w * scale + 2 * padding));
        const h = Math.min(newMeta.height - y, Math.round(bestBox.h * scale + 2 * padding));

        const result = { x, y, w, h, source: 'image', score: 0.7 };
        const elapsed = Date.now() - startTime;
        console.log(`🖼️ [IMAGE DIFF] ✅ Result: ${JSON.stringify(result)} (${componentCount} components, ${elapsed}ms)`);
        return result;
    } catch (err) {
        console.error('🖼️ [IMAGE DIFF] ❌ Error:', err);
        return null;
    }
};

export const detectChangeByGemini = async (oldBase64, newBase64) => {
    if (!oldBase64 || !newBase64) {
        console.log('🤖 [GEMINI] Skipped: missing old or new screenshot');
        return null;
    }

    console.log('🤖 [GEMINI] Starting Gemini change detection...');
    const startTime = Date.now();

    try {
        const { detectChangeBoxByGemini } = await import('./gemini-handler.js');
        console.log('🤖 [GEMINI] Calling detectChangeBoxByGemini...');
        const box = await detectChangeBoxByGemini(oldBase64, newBase64);
        
        if (!box) {
            console.log('🤖 [GEMINI] ❌ No box returned from Gemini');
            return null;
        }

        const result = { ...box, source: 'gemini', score: 0.95 };
        const elapsed = Date.now() - startTime;
        console.log(`🤖 [GEMINI] ✅ Result: ${JSON.stringify(result)} (${elapsed}ms)`);
        return result;
    } catch (err) {
        const elapsed = Date.now() - startTime;
        console.error(`🤖 [GEMINI] ❌ Error after ${elapsed}ms:`, err);
        return null;
    }
};

const mergeTwoBoxes = (a, b, imageWidth, imageHeight) => {
    if (!a) return b;
    if (!b) return a;

    const overlap = calcOverlapBox(a, b);
    if (overlap > 0.3) {
        const x1 = Math.max(a.x, b.x);
        const y1 = Math.max(a.y, b.y);
        const x2 = Math.min(a.x + a.w, b.x + b.w);
        const y2 = Math.min(a.y + a.h, b.y + b.h);
        if (x2 > x1 && y2 > y1) {
            const padding = 10;
            const x = Math.max(0, x1 - padding);
            const y = Math.max(0, y1 - padding);
            const w = Math.min(imageWidth - x, (x2 - x1) + 2 * padding);
            const h = Math.min(imageHeight - y, (y2 - y1) + 2 * padding);
            return {
                x,
                y,
                w,
                h,
                source: `${a.source}+${b.source}`,
                score: Math.max(a.score, b.score)
            };
        }
    }

    return a.score >= b.score ? a : b;
};

export const suggestCropAreaForNewPanel = async ({
    oldScreenshotBase64,
    newScreenshotBase64,
    imageWidth,
    imageHeight,
    oldDomActions,
    newDomActions,
    afterLoginPanel = false
}) => {
    console.log('🎯 [CROP SUGGEST] Starting crop suggestion with Gemini only...');
    console.log(`🎯 [CROP SUGGEST] Image size: ${imageWidth}x${imageHeight}`);
    console.log(`🎯 [CROP SUGGEST] After Login Panel: ${afterLoginPanel}`);

    // Skip Gemini for afterLoginPanel, return fullscreen directly
    if (afterLoginPanel) {
        console.log('🎯 [CROP SUGGEST] ⚡ After Login Panel detected, skipping Gemini and returning fullscreen');
        return {
            x: 0,
            y: 0,
            w: imageWidth,
            h: imageHeight,
            source: 'afterLoginPanel',
            score: 1.0
        };
    }

    const gemRes = await detectChangeByGemini(oldScreenshotBase64, newScreenshotBase64);

    console.log(`🎯 [CROP SUGGEST] GEMINI result: ${gemRes ? JSON.stringify(gemRes) : 'null'}`);

    if (!gemRes) {
        console.log('🎯 [CROP SUGGEST] ⚠️ No valid suggestion from Gemini, using full page fallback');
        return {
            x: 0,
            y: 0,
            w: imageWidth,
            h: imageHeight,
            source: 'fallback',
            score: 0.1
        };
    }

    let best = gemRes;

    console.log(`🎯 [CROP SUGGEST] Before min-size check: ${JSON.stringify(best)}`);
    const minSize = 80;
    if (best.w < minSize) {
        console.log(`🎯 [CROP SUGGEST] Adjusting width: ${best.w} → ${minSize}`);
        best.w = minSize;
    }
    if (best.h < minSize) {
        console.log(`🎯 [CROP SUGGEST] Adjusting height: ${best.h} → ${minSize}`);
        best.h = minSize;
    }

    if (best.x + best.w > imageWidth) {
        const oldX = best.x;
        best.x = Math.max(0, imageWidth - best.w);
        console.log(`🎯 [CROP SUGGEST] Adjusting X (out of bounds): ${oldX} → ${best.x}`);
    }
    if (best.y + best.h > imageHeight) {
        const oldY = best.y;
        best.y = Math.max(0, imageHeight - best.h);
        console.log(`🎯 [CROP SUGGEST] Adjusting Y (out of bounds): ${oldY} → ${best.y}`);
    }

    console.log(`🎯 [CROP SUGGEST] ✅ Final suggestion: ${JSON.stringify(best)}`);
    return best;
};



