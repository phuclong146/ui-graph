import sharp from "sharp";
import { captureExistingPage } from "./lib-capture.js";

export async function captureScreenshot(page, asType = "base64", fullPage = false, skipViewportRestore = false) {
    if (!page) return null;
    
    const shouldUseFullPage = fullPage === true || fullPage === "auto";
    
    if (shouldUseFullPage) {
        try {
            const result = await captureExistingPage(page, {
                fullPage: true,
                delay: 1,
                blockAds: false,
                skipViewportRestore: skipViewportRestore
            });
            
            const buffer = result.buffer;
            const originalViewport = result.originalViewport;
            
            if (!buffer || buffer.length === 0) {
                console.log('⚠️ Full page capture failed, fallback to viewport');
                if (asType === "buffer") {
                    return await page.screenshot();
                }
                return await page.screenshot({ encoding: "base64" });
            }
            
            let screenshot;
            if (asType === "buffer") {
                screenshot = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
            } else {
                const bufferObj = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
                screenshot = bufferObj.toString("base64");
            }
            
            const sharp = await import('sharp');
            const metadata = await sharp.default(buffer).metadata();
            
            if (skipViewportRestore && originalViewport) {
                return {
                    screenshot,
                    imageWidth: metadata.width,
                    imageHeight: metadata.height,
                    restoreViewport: async () => {
                        await page.setViewport(originalViewport);
                    }
                };
            }
            
            return screenshot;
        } catch (err) {
            console.log('⚠️ Full page capture error, fallback to viewport:', err.message);
            if (asType === "buffer") {
                return await page.screenshot();
            }
            return await page.screenshot({ encoding: "base64" });
        }
    }
    
    if (asType === "buffer") {
        return await page.screenshot();
    }
    return await page.screenshot({ encoding: "base64" });
}

export async function resizeBase64(base64, maxWidth = 640) {
    const buffer = Buffer.from(base64, "base64");
    const resized = await sharp(buffer)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .png()
        .toBuffer();
    return resized.toString("base64");
}

export async function drawPanelBoundingBoxes(base64, panels, color = "#00ff00", stroke = 3) {
    if (!panels || panels.length === 0) return base64;
    
    const imgBuffer = Buffer.from(base64, "base64");
    const metadata = await sharp(imgBuffer).metadata();
    const w = metadata.width;
    const h = metadata.height;
    
    let rectangles = '';
    for (const panel of panels) {
        if (Array.isArray(panel.actions)) {
            for (const action of panel.actions) {
                if (action.action_pos && action.action_name) {
                    const pos = action.action_pos;
                    rectangles += `
      <rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" 
            fill="none" stroke="${color}" stroke-width="${stroke}" />
      <text x="${pos.x + 5}" y="${pos.y + 15}" 
            font-size="12" font-weight="bold" fill="${color}" 
            stroke="black" stroke-width="0.5">${escapeXml(action.action_name)}</text>`;
                }
            }
        }
    }
    
    if (!rectangles) return base64;
    
    const svg = `
    <svg width="${w}" height="${h}">
      ${rectangles}
    </svg>
  `;
    
    const out = await sharp(imgBuffer)
        .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
        .png()
        .toBuffer();
    
    return out.toString("base64");
}

export async function cropBase64Image(base64, cropPos) {
    if (!base64 || !cropPos) return base64;
    
    try {
        const buffer = Buffer.from(base64, "base64");
        const cropped = await sharp(buffer)
            .extract({
                left: Math.max(0, cropPos.x),
                top: Math.max(0, cropPos.y),
                width: cropPos.w,
                height: cropPos.h
            })
            .png()
            .toBuffer();
        
        return cropped.toString("base64");
    } catch (err) {
        console.error('Failed to crop image:', err);
        return base64;
    }
}

function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case "'": return '&apos;';
            case '"': return '&quot;';
        }
    });
}
