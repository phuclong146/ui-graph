import ffmpegPath from 'ffmpeg-static';
import ffmpegLib from 'fluent-ffmpeg';
import { promises as fsp } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { drawPanelBoundingBoxes } from './screenshot.js';
import { uploadVideoAndGetUrl, uploadPictureAndGetUrl } from './uploader.js';
import { ENV } from '../config/env.js';

// Set FFmpeg path
if (ffmpegPath) {
    ffmpegLib.setFfmpegPath(ffmpegPath);
}

/**
 * Format subtitle data for overlay rendering
 * @param {Object} panelInfo - Panel info {name, type, verb}
 * @param {Object} actionInfo - Action info {name, type, verb}
 * @param {Array} timeRanges - Array of {startTime, endTime}
 * @returns {Array} Subtitle objects for overlay
 */
export function formatSubtitleData(panelInfo, actionInfo, timeRanges) {
    const subtitles = [];
    
    if (timeRanges.length >= 2) {
        // First 3 seconds: Panel info + Action info
        subtitles.push({
            startTime: timeRanges[0].startTime,
            endTime: timeRanges[0].endTime,
            text: `Panel: ${panelInfo?.name || 'N/A'} (${panelInfo?.type || 'N/A'}, ${panelInfo?.verb || 'N/A'})\nAction: ${actionInfo?.name || 'N/A'} (${actionInfo?.type || 'N/A'}, ${actionInfo?.verb || 'N/A'})`
        });
        
        // Last 3 seconds: Panel after info
        subtitles.push({
            startTime: timeRanges[1].startTime,
            endTime: timeRanges[1].endTime,
            text: `Panel: ${panelInfo?.name || 'N/A'} (${panelInfo?.type || 'N/A'}, ${panelInfo?.verb || 'N/A'})`
        });
    }
    
    return subtitles;
}

/**
 * Resize image to specified dimensions
 * @param {string} imageBase64 - Base64 encoded image
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @returns {Promise<string>} Resized base64 image
 */
async function resizeImage(imageBase64, width, height) {
    const imgBuffer = Buffer.from(imageBase64, 'base64');
    const resized = await sharp(imgBuffer)
        .resize(width, height, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toBuffer();
    
    return resized.toString('base64');
}

/**
 * Generate video from array of images
 * @param {Array} images - Array of base64 images
 * @param {number} fps - Frames per second (default: 1)
 * @param {number} durationPerImage - Duration per image in seconds (default: 3)
 * @param {string} resolution - Resolution like '640x480'
 * @param {string} sessionFolder - Session folder path (optional, uses temp if not provided)
 * @returns {Promise<string>} Path to generated video file
 */
async function generateVideoFromImages(images, fps = 1, durationPerImage = 3, resolution = '640x480', sessionFolder = null) {
    const [width, height] = resolution.split('x').map(Number);
    const videoId = randomUUID();
    
    // Use sessionFolder/validate/temp if provided, otherwise use temp
    const baseDir = sessionFolder ? path.join(sessionFolder, 'validate', 'temp') : tmpdir();
    await fsp.mkdir(baseDir, { recursive: true });
    
    const videoPath = path.join(baseDir, `${videoId}.mp4`);
    
    // Create directory for frames
    const framesDir = path.join(baseDir, `frames_${videoId}`);
    await fsp.mkdir(framesDir, { recursive: true });
    
    // Store framesDir for cleanup later
    let framesDirForCleanup = framesDir;
    
    // Write images as frames with duplicates for duration
        const numFramesPerImage = fps * durationPerImage;
        let frameIndex = 0;
        
        for (let i = 0; i < images.length; i++) {
            const imgBuffer = Buffer.from(images[i], 'base64');
            
            // Create numFramesPerImage copies of each image
            for (let j = 0; j < numFramesPerImage; j++) {
                const framePath = path.join(framesDir, `frame_${String(frameIndex).padStart(4, '0')}.png`);
                await fsp.writeFile(framePath, imgBuffer);
                frameIndex++;
            }
        }
        
        console.log(`[VIDEO] Created ${frameIndex} frames in ${framesDir}`);
        
        // Verify frames exist before running ffmpeg
        const frameFiles = await fsp.readdir(framesDir);
        console.log(`[VIDEO] Frame files count: ${frameFiles.length}, expected: ${frameIndex}`);
        
        if (frameFiles.length === 0) {
            throw new Error(`No frames created in ${framesDir}`);
        }
        
        // Verify first and last frame files exist
        const firstFramePath = path.join(framesDir, 'frame_0000.png');
        const lastFramePath = path.join(framesDir, `frame_${String(frameIndex - 1).padStart(4, '0')}.png`);
        try {
            await fsp.access(firstFramePath);
            await fsp.access(lastFramePath);
            console.log(`[VIDEO] Verified frames: ${firstFramePath} and ${lastFramePath} exist`);
        } catch (err) {
            throw new Error(`Frames verification failed: ${err.message}`);
        }
        
        // Use absolute path with forward slashes for ffmpeg on Windows
        // ffmpeg on Windows needs forward slashes and absolute path
        const framesDirAbsolute = path.resolve(framesDir);
        const framesDirNormalized = framesDirAbsolute.replace(/\\/g, '/');
        
        // For Windows, use forward slashes (ffmpeg on Windows supports both)
        // Use absolute path with forward slashes
        const inputPattern = `${framesDirNormalized}/frame_%04d.png`;
        const videoPathNormalized = path.resolve(videoPath).replace(/\\/g, '/');
        
        console.log(`[VIDEO] FFmpeg input pattern: ${inputPattern}`);
        console.log(`[VIDEO] FFmpeg output path: ${videoPathNormalized}`);
        console.log(`[VIDEO] Frames directory (absolute): ${framesDirAbsolute}`);
        console.log(`[VIDEO] Total frames: ${frameIndex}`);
        
        // Try listing actual frame files to verify
        const actualFrameFiles = await fsp.readdir(framesDir);
        console.log(`[VIDEO] Actual frame files: ${actualFrameFiles.slice(0, 3).join(', ')}... (total: ${actualFrameFiles.length})`);
        
        // Verify a specific frame file exists using absolute path
        const testFramePath = path.resolve(framesDir, 'frame_0000.png');
        try {
            await fsp.access(testFramePath);
            console.log(`[VIDEO] Test frame exists: ${testFramePath}`);
        } catch (err) {
            throw new Error(`Test frame does not exist: ${testFramePath} - ${err.message}`);
        }
        
        // On Windows, try using backslash in pattern (native Windows path)
        // But fluent-ffmpeg might convert it, so let's try a different approach
        // Use the first frame as input and let ffmpeg figure out the sequence
        const inputPatternWindows = path.join(framesDirAbsolute, 'frame_%04d.png');
        console.log(`[VIDEO] FFmpeg input pattern (Windows native): ${inputPatternWindows}`);
        
        // Generate video using ffmpeg with image2 demuxer
        return new Promise((resolve, reject) => {
            const ffmpegCommand = ffmpegLib()
                .input(inputPatternWindows)
                .inputOptions([
                    '-f', 'image2',
                    '-framerate', String(fps),
                    '-start_number', '0'
                ])
                .outputOptions([
                    `-vf scale=${width}:${height}`,
                    '-c:v libx264',
                    '-pix_fmt yuv420p',
                    '-r', String(fps), // Output frame rate  
                    '-an' // No audio
                ])
                .output(videoPathNormalized);
            
            // Add error handling with more details
            ffmpegCommand
                .on('start', (commandLine) => {
                    console.log('[VIDEO] FFmpeg command:', commandLine);
                })
                .on('stderr', (stderrLine) => {
                    console.log('[VIDEO] FFmpeg stderr:', stderrLine);
                })
                .on('end', async () => {
                    console.log('[VIDEO] FFmpeg completed successfully');
                    
                    // Cleanup frames directory after video is created
                    try {
                        const frames = await fsp.readdir(framesDirForCleanup);
                        for (const frame of frames) {
                            await fsp.unlink(path.join(framesDirForCleanup, frame));
                        }
                        await fsp.rmdir(framesDirForCleanup);
                        console.log(`[VIDEO] Cleaned up frames directory: ${framesDirForCleanup}`);
                    } catch (err) {
                        console.warn('[VIDEO] Failed to cleanup frames directory:', err);
                    }
                    
                    resolve(videoPath);
                })
                .on('error', async (err) => {
                    console.error('[VIDEO] FFmpeg error:', err);
                    
                    // Cleanup frames directory on error too
                    try {
                        const frames = await fsp.readdir(framesDirForCleanup);
                        for (const frame of frames) {
                            await fsp.unlink(path.join(framesDirForCleanup, frame));
                        }
                        await fsp.rmdir(framesDirForCleanup);
                    } catch (cleanupErr) {
                        console.warn('[VIDEO] Failed to cleanup frames directory on error:', cleanupErr);
                    }
                    
                    reject(err);
                })
                .run();
        });
}

/**
 * Create StepVideo from panel before and after images
 * @param {string} panelBeforeImage - Base64 image of panel before
 * @param {string} panelAfterImage - Base64 image of panel after
 * @param {Object} actionPos - Action position {x, y, w, h}
 * @param {Object} panelInfo - Panel info {name, type, verb}
 * @param {Object} actionInfo - Action info {name, type, verb}
 * @param {string} sessionFolder - Session folder path (optional)
 * @param {string} actionId - Action item ID
 * @returns {Promise<{videoUrl: string, subtitles: Array}>}
 */
export async function createStepVideo(panelBeforeImage, panelAfterImage, actionPos, panelInfo, actionInfo, sessionFolder = null, actionId = null) {
    try {
        console.log('[VIDEO] 🎬 Creating StepVideo...');
        
        // 1. Draw bounding box on panel before image
        const geminiResult = [{
            panel_title: panelInfo?.name || 'Panel',
            actions: [{
                action_name: actionInfo?.name || 'Action',
                action_type: actionInfo?.type || 'button',
                action_verb: actionInfo?.verb || 'click',
                action_pos: actionPos
            }]
        }];
        
        const panelBeforeWithBox = await drawPanelBoundingBoxes(
            panelBeforeImage,
            geminiResult,
            '#00aaff',
            2
        );
        
        // 2. Resize images to 640x480
        const resizedBefore = await resizeImage(panelBeforeWithBox, 640, 480);
        const resizedAfter = await resizeImage(panelAfterImage, 640, 480);
        
        // 3. Generate video from images (6 seconds: 3s before + 3s after)
        const images = [resizedBefore, resizedAfter];
        const videoPath = await generateVideoFromImages(images, 1, 3, '640x480', sessionFolder);
        
        // 4. Upload video
        const videoCode = actionId ? `${actionId}_step_video` : `step_video_${randomUUID().replace(/-/g, '').substring(0, 32)}`;
        const videoUrl = await uploadVideoAndGetUrl(videoPath, videoCode, ENV.API_TOKEN);
        
        // 5. Format subtitle data
        const subtitles = formatSubtitleData(
            panelInfo,
            actionInfo,
            [
                { startTime: 0, endTime: 3 },
                { startTime: 3, endTime: 6 }
            ]
        );
        
        // Cleanup temp video file
        try {
            await fsp.unlink(videoPath);
        } catch (err) {
            console.warn('Failed to cleanup temp video file:', err);
        }
        
        console.log('[VIDEO] ✅ StepVideo created:', videoUrl);
        return { videoUrl, subtitles };
    } catch (err) {
        console.error('[VIDEO] ❌ Failed to create StepVideo:', err);
        throw err;
    }
}

/**
 * Snapshot video at specific timestamp
 * @param {string} videoPath - Path to video file
 * @param {number} timestampSeconds - Timestamp in seconds
 * @param {string} sessionFolder - Session folder path (optional, uses temp if not provided)
 * @returns {Promise<Buffer>} Image buffer
 */
async function snapshotVideoAtTimestamp(videoPath, timestampSeconds, sessionFolder = null) {
    // Use sessionFolder/validate/temp if provided, otherwise use temp
    const baseDir = sessionFolder ? path.join(sessionFolder, 'validate', 'temp') : tmpdir();
    await fsp.mkdir(baseDir, { recursive: true });
    const snapshotPath = path.join(baseDir, `snapshot_${randomUUID()}.png`);
    
    console.log(`[VIDEO] Creating snapshot at ${timestampSeconds}s: ${snapshotPath}`);
    
    return new Promise((resolve, reject) => {
        // Use forward slashes for video path on Windows
        const videoPathNormalized = path.resolve(videoPath).replace(/\\/g, '/');
        const snapshotPathNormalized = path.resolve(snapshotPath).replace(/\\/g, '/');
        
        ffmpegLib(videoPathNormalized)
            .seekInput(timestampSeconds)
            .outputOptions(['-vframes', '1', '-update', '1'])
            .output(snapshotPathNormalized)
            .on('start', (commandLine) => {
                console.log('[VIDEO] Snapshot command:', commandLine);
            })
            .on('stderr', (stderrLine) => {
                console.log('[VIDEO] Snapshot stderr:', stderrLine);
            })
            .on('end', async () => {
                try {
                    // Small delay to ensure file is fully written
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Verify file exists before reading
                    await fsp.access(snapshotPath);
                    console.log(`[VIDEO] Snapshot created successfully: ${snapshotPath}`);
                    
                    const buffer = await fsp.readFile(snapshotPath);
                    // Don't delete snapshot immediately - let caller handle cleanup
                    // await fsp.unlink(snapshotPath);
                    resolve(buffer);
                } catch (err) {
                    console.error(`[VIDEO] Failed to read snapshot: ${snapshotPath}`, err);
                    reject(err);
                }
            })
            .on('error', (err) => {
                console.error('[VIDEO] Snapshot creation error:', err);
                reject(err);
            })
            .run();
    });
}

/**
 * Get video duration in seconds
 * @param {string} videoPath - Path to video file
 * @returns {Promise<number>} Duration in seconds
 */
async function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpegLib.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                resolve(metadata.format.duration || 0);
            }
        });
    });
}

/**
 * Create TrackingVideo from session video
 * @param {string} sessionUrl - URL of original session video
 * @param {number} sessionStart - Session start timestamp
 * @param {string} actionItemId - Action item ID
 * @param {Array} clicks - Array of click objects from click.jsonl
 * @param {Object} tracker - Tracker instance
 * @returns {Promise<{videoUrl: string, trackingActionUrl: string, trackingPanelAfterUrl: string}>}
 */
export async function createTrackingVideo(sessionUrl, sessionStart, actionItemId, clicks, tracker) {
    const sessionFolder = tracker?.sessionFolder || null;
    try {
        console.log('[VIDEO] 🎬 Creating TrackingVideo...');
        
        // 1. Get clicks for action if not provided
        let actionClicks = clicks;
        if (!actionClicks && tracker.clickManager) {
            actionClicks = await tracker.clickManager.getClicksForAction(actionItemId);
        }
        
        if (!actionClicks || actionClicks.length === 0) {
            throw new Error(`No clicks found for action ${actionItemId}`);
        }
        
        // 2. Get last click (assumed to be the action click)
        const lastClick = actionClicks.sort((a, b) => b.timestamp - a.timestamp)[0];
        
        // 3. Calculate action_clicked_at in seconds
        const actionClickedAtMs = lastClick.timestamp - sessionStart;
        const actionClickedAtSeconds = actionClickedAtMs / 1000;
        
        console.log(`[VIDEO] Action clicked at: ${actionClickedAtSeconds}s (${actionClickedAtMs}ms)`);
        
        // 4. Download video from sessionUrl to validate/temp folder
        const baseDir = sessionFolder ? path.join(sessionFolder, 'validate', 'temp') : tmpdir();
        await fsp.mkdir(baseDir, { recursive: true });
        const videoId = randomUUID();
        const tempVideoPath = path.join(baseDir, `${videoId}.mp4`);
        
        console.log('[VIDEO] Downloading video from:', sessionUrl);
        const videoResponse = await fetch(sessionUrl);
        if (!videoResponse.ok) {
            throw new Error(`Failed to download video: ${videoResponse.statusText}`);
        }
        
        const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
        await fsp.writeFile(tempVideoPath, videoBuffer);
        console.log('[VIDEO] Video downloaded to:', tempVideoPath);
        
        try {
            // 5. Get video duration first
            const videoDuration = await getVideoDuration(tempVideoPath);
            console.log(`[VIDEO] Video duration: ${videoDuration}s`);
            
            // 6. Snapshot at action_clicked_at - 1 second → tracking_action image
            const actionTimestamp = Math.min(actionClickedAtSeconds, videoDuration - 0.1);
            const trackingActionBuffer = await snapshotVideoAtTimestamp(tempVideoPath, Math.max(0, actionTimestamp - 1.0), sessionFolder);
            const trackingActionPath = path.join(baseDir, `tracking_action_${videoId}.png`);
            await fsp.writeFile(trackingActionPath, trackingActionBuffer);
            
            // 7. Snapshot last frame → tracking_panel_after image (use second-to-last second to avoid edge issues)
            const lastFrameTimestamp = Math.max(0, videoDuration - 1.0);
            console.log(`[VIDEO] Snapshotting last frame at ${lastFrameTimestamp}s (duration: ${videoDuration}s)`);
            const trackingPanelAfterBuffer = await snapshotVideoAtTimestamp(tempVideoPath, lastFrameTimestamp, sessionFolder);
            const trackingPanelAfterPath = path.join(baseDir, `tracking_panel_after_${videoId}.png`);
            await fsp.writeFile(trackingPanelAfterPath, trackingPanelAfterBuffer);
            
            // 7. Resize images to 640x480
            const resizedAction = await resizeImage(trackingActionBuffer.toString('base64'), 640, 480);
            const resizedAfter = await resizeImage(trackingPanelAfterBuffer.toString('base64'), 640, 480);
            
            // 8. Upload images
            const actionImageCode = `tracking_action_${actionItemId}_${randomUUID().replace(/-/g, '')}`;
            const afterImageCode = `tracking_panel_after_${actionItemId}_${randomUUID().replace(/-/g, '')}`;
            
            const trackingActionUrl = await uploadPictureAndGetUrl(trackingActionPath, actionImageCode, ENV.API_TOKEN);
            const trackingPanelAfterUrl = await uploadPictureAndGetUrl(trackingPanelAfterPath, afterImageCode, ENV.API_TOKEN);
            
            console.log('[VIDEO] Tracking images uploaded:', { trackingActionUrl, trackingPanelAfterUrl });
            
            // 9. Generate video from images (6 seconds: 3s action + 3s after)
            const images = [resizedAction, resizedAfter];
            const videoPath = await generateVideoFromImages(images, 1, 3, '640x480', sessionFolder);
            
            // 10. Upload video
            const videoCode = `${actionItemId}_tracking_video`;
            const videoUrl = await uploadVideoAndGetUrl(videoPath, videoCode, ENV.API_TOKEN);
            
            // Cleanup temp files
            try {
                await fsp.unlink(tempVideoPath);
                await fsp.unlink(trackingActionPath);
                await fsp.unlink(trackingPanelAfterPath);
                await fsp.unlink(videoPath);
            } catch (err) {
                console.warn('Failed to cleanup temp files:', err);
            }
            
            console.log('[VIDEO] ✅ TrackingVideo created:', videoUrl);
            return {
                videoUrl,
                trackingActionUrl,
                trackingPanelAfterUrl
            };
        } catch (err) {
            // Cleanup temp video file on error
            try {
                await fsp.unlink(tempVideoPath);
            } catch (cleanupErr) {
                console.warn('Failed to cleanup temp video file:', cleanupErr);
            }
            throw err;
        }
    } catch (err) {
        console.error('[VIDEO] ❌ Failed to create TrackingVideo:', err);
        throw err;
    }
}
