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
 * Cut video segment from source video
 * @param {string} inputVideoPath - Path to input video file
 * @param {number} startSeconds - Start time in seconds
 * @param {number} durationSeconds - Duration in seconds
 * @param {string} outputVideoPath - Path to output video file
 * @returns {Promise<string>} Path to output video file
 */
async function cutVideoSegment(inputVideoPath, startSeconds, durationSeconds, outputVideoPath) {
    return new Promise((resolve, reject) => {
        const inputPathNormalized = path.resolve(inputVideoPath).replace(/\\/g, '/');
        const outputPathNormalized = path.resolve(outputVideoPath).replace(/\\/g, '/');
        
        console.log(`[VIDEO] Cutting video segment: ${startSeconds}s for ${durationSeconds}s`);
        
        ffmpegLib(inputPathNormalized)
            .seekInput(startSeconds)
            .outputOptions([
                '-t', String(durationSeconds),
                '-c:v', 'libx264',
                '-c:a', 'copy',
                '-avoid_negative_ts', 'make_zero'
            ])
            .output(outputPathNormalized)
            .on('start', (commandLine) => {
                console.log('[VIDEO] Cut command:', commandLine);
            })
            .on('stderr', (stderrLine) => {
                console.log('[VIDEO] Cut stderr:', stderrLine);
            })
            .on('end', () => {
                console.log(`[VIDEO] Video segment cut successfully: ${outputPathNormalized}`);
                resolve(outputPathNormalized);
            })
            .on('error', (err) => {
                console.error('[VIDEO] Cut video segment error:', err);
                reject(err);
            })
            .run();
    });
}

/**
 * Concatenate two video files
 * @param {string} video1Path - Path to first video file
 * @param {string} video2Path - Path to second video file
 * @param {string} outputVideoPath - Path to output video file
 * @returns {Promise<string>} Path to output video file
 */
async function concatenateVideos(video1Path, video2Path, outputVideoPath) {
    return new Promise((resolve, reject) => {
        const video1Normalized = path.resolve(video1Path).replace(/\\/g, '/');
        const video2Normalized = path.resolve(video2Path).replace(/\\/g, '/');
        const outputNormalized = path.resolve(outputVideoPath).replace(/\\/g, '/');
        
        // Create a temporary file list for ffmpeg concat
        const listFilePath = outputVideoPath.replace('.mp4', '_concat_list.txt');
        const listContent = `file '${video1Normalized}'\nfile '${video2Normalized}'`;
        
        fsp.writeFile(listFilePath, listContent)
            .then(() => {
                const listFilePathNormalized = path.resolve(listFilePath).replace(/\\/g, '/');
                
                console.log(`[VIDEO] Concatenating videos: ${video1Normalized} + ${video2Normalized}`);
                
                ffmpegLib()
                    .input(listFilePathNormalized)
                    .inputOptions(['-f', 'concat', '-safe', '0'])
                    .outputOptions([
                        '-c', 'copy',
                        '-avoid_negative_ts', 'make_zero'
                    ])
                    .output(outputNormalized)
                    .on('start', (commandLine) => {
                        console.log('[VIDEO] Concat command:', commandLine);
                    })
                    .on('stderr', (stderrLine) => {
                        console.log('[VIDEO] Concat stderr:', stderrLine);
                    })
                    .on('end', async () => {
                        // Cleanup list file
                        try {
                            await fsp.unlink(listFilePath);
                        } catch (err) {
                            console.warn('[VIDEO] Failed to cleanup concat list file:', err);
                        }
                        console.log(`[VIDEO] Videos concatenated successfully: ${outputNormalized}`);
                        resolve(outputNormalized);
                    })
                    .on('error', async (err) => {
                        // Cleanup list file on error
                        try {
                            await fsp.unlink(listFilePath);
                        } catch (cleanupErr) {
                            console.warn('[VIDEO] Failed to cleanup concat list file on error:', cleanupErr);
                        }
                        console.error('[VIDEO] Concatenate videos error:', err);
                        reject(err);
                    })
                    .run();
            })
            .catch(reject);
    });
}

/**
 * Create TrackingVideo from session video
 * @param {string} sessionUrl - URL of original session video
 * @param {number} sessionStart - Session start timestamp
 * @param {string} actionItemId - Action item ID
 * @param {Array} clicks - Array of click objects from click.jsonl
 * @param {Object} tracker - Tracker instance
 * @returns {Promise<{videoUrl: string}>}
 */
export async function createTrackingVideo(sessionUrl, sessionStart, actionItemId, clicks, tracker) {
    const sessionFolder = tracker?.sessionFolder || null;
    let tempVideoPath = null;
    let panelBeforePath = null;
    let panelAfterPath = null;
    let trackingVideoPath = null;
    
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
        
        // 3. Calculate action_clicked_at in seconds (ms = click.timestamp - session_start)
        const actionClickedAtMs = lastClick.timestamp - sessionStart;
        const actionClickedAtSeconds = Math.floor(actionClickedAtMs / 1000);
        
        console.log(`[VIDEO] Action clicked at: ${actionClickedAtSeconds}s (${actionClickedAtMs}ms)`);
        
        // 4. Try to get video from panel_record first (by actionId), fallback to sessionUrl
        const baseDir = sessionFolder ? path.join(sessionFolder, 'validate', 'temp') : tmpdir();
        await fsp.mkdir(baseDir, { recursive: true });
        const videoId = randomUUID();
        tempVideoPath = path.join(baseDir, `${videoId}.mp4`);
        
        let videoSource = null;
        let panelVideoPath = null;
        
        // Try to find video in panel_record folder by actionId (format: actionId.mp4)
        if (sessionFolder) {
            try {
                const panelRecordFolder = path.join(sessionFolder, 'panel_record');
                panelVideoPath = path.join(panelRecordFolder, `${actionItemId}.mp4`);
                
                try {
                    await fsp.access(panelVideoPath);
                    // Video file exists in panel_record
                    videoSource = 'panel_record';
                    console.log(`[VIDEO] Found video in panel_record: ${panelVideoPath}`);
                } catch (err) {
                    // Video file doesn't exist in panel_record
                    console.log(`[VIDEO] Video not found in panel_record (${panelVideoPath}), will use session_url`);
                }
            } catch (err) {
                console.warn(`[VIDEO] Failed to check panel_record: ${err.message}, will use session_url`);
            }
        }
        
        // Use panel_record video if found, otherwise download from sessionUrl
        if (videoSource === 'panel_record' && panelVideoPath) {
            // Copy video from panel_record to temp folder
            const videoBuffer = await fsp.readFile(panelVideoPath);
            await fsp.writeFile(tempVideoPath, videoBuffer);
            console.log(`[VIDEO] Copied video from panel_record to: ${tempVideoPath}`);
        } else {
            // Download from sessionUrl
            if (!sessionUrl) {
                throw new Error(`No video source available: panel_record not found and session_url is missing`);
            }
            
            console.log('[VIDEO] Downloading video from session_url:', sessionUrl);
            const videoResponse = await fetch(sessionUrl);
            if (!videoResponse.ok) {
                throw new Error(`Failed to download video: ${videoResponse.statusText}`);
            }
            
            const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
            await fsp.writeFile(tempVideoPath, videoBuffer);
            console.log('[VIDEO] Video downloaded to:', tempVideoPath);
        }
        
        // 5. Get video duration
        const videoDuration = await getVideoDuration(tempVideoPath);
        console.log(`[VIDEO] Video duration: ${videoDuration}s`);
        
        // Validate action_clicked_at is within video duration
        // Clamp to [0, videoDuration] to handle negative values or values exceeding video duration
        const validActionClickedAtSeconds = Math.max(0, Math.min(actionClickedAtSeconds, videoDuration));
        if (validActionClickedAtSeconds !== actionClickedAtSeconds) {
            if (actionClickedAtSeconds < 0) {
                console.warn(`[VIDEO] Warning: action_clicked_at (${actionClickedAtSeconds}s) is negative, using 0s instead`);
            } else if (actionClickedAtSeconds > videoDuration) {
                console.warn(`[VIDEO] Warning: action_clicked_at (${actionClickedAtSeconds}s) exceeds video duration (${videoDuration}s), using ${validActionClickedAtSeconds}s instead`);
            }
        }
        
        // 6. Cut panel_before: 3 seconds before action_clicked_at
        // Clamp to video duration to ensure we don't cut beyond video bounds
        const panelBeforeStart = Math.max(0, validActionClickedAtSeconds - 3);
        const panelBeforeEnd = Math.min(validActionClickedAtSeconds, videoDuration);
        let actualPanelBeforeDuration = Math.max(0, panelBeforeEnd - panelBeforeStart);
        panelBeforePath = path.join(baseDir, `panel_before_${videoId}.mp4`);
        
        if (actualPanelBeforeDuration > 0 && panelBeforeStart < videoDuration) {
            // Ensure we don't exceed video duration
            actualPanelBeforeDuration = Math.min(actualPanelBeforeDuration, videoDuration - panelBeforeStart);
            await cutVideoSegment(tempVideoPath, panelBeforeStart, actualPanelBeforeDuration, panelBeforePath);
            
            // Verify panel_before was created and has content
            const panelBeforeFileSize = (await fsp.stat(panelBeforePath)).size;
            if (panelBeforeFileSize === 0) {
                throw new Error(`Panel before video is empty (${panelBeforeStart}s for ${actualPanelBeforeDuration}s from ${videoDuration}s video)`);
            }
            
            console.log(`[VIDEO] Panel before cut: ${panelBeforeStart}s for ${actualPanelBeforeDuration}s (file size: ${panelBeforeFileSize} bytes)`);
        } else {
            // If action happens at the very beginning (0s or negative), use first 3 seconds of video
            if (validActionClickedAtSeconds <= 0) {
                const fallbackDuration = Math.min(3, videoDuration);
                await cutVideoSegment(tempVideoPath, 0, fallbackDuration, panelBeforePath);
                
                // Verify panel_before was created and has content
                const panelBeforeFileSize = (await fsp.stat(panelBeforePath)).size;
                if (panelBeforeFileSize === 0) {
                    throw new Error(`Panel before video is empty (0s for ${fallbackDuration}s from ${videoDuration}s video)`);
                }
                
                actualPanelBeforeDuration = fallbackDuration;
                console.log(`[VIDEO] Panel before cut (fallback for negative action_clicked_at): 0s for ${fallbackDuration}s (file size: ${panelBeforeFileSize} bytes)`);
            } else {
                throw new Error(`Cannot cut panel_before: action_clicked_at=${validActionClickedAtSeconds}s, video_duration=${videoDuration}s, panel_before_start=${panelBeforeStart}s`);
            }
        }
        
        // 7. Cut panel_after: last 3 seconds of original video
        const panelAfterStart = Math.max(0, videoDuration - 3);
        let actualPanelAfterDuration = Math.min(3, videoDuration);
        panelAfterPath = path.join(baseDir, `panel_after_${videoId}.mp4`);
        
        await cutVideoSegment(tempVideoPath, panelAfterStart, actualPanelAfterDuration, panelAfterPath);
        
        // Verify panel_after was created and has content
        const panelAfterFileSize = (await fsp.stat(panelAfterPath)).size;
        if (panelAfterFileSize === 0) {
            throw new Error(`Panel after video is empty (${panelAfterStart}s for ${actualPanelAfterDuration}s from ${videoDuration}s video)`);
        }
        
        console.log(`[VIDEO] Panel after cut: ${panelAfterStart}s for ${actualPanelAfterDuration}s (file size: ${panelAfterFileSize} bytes)`);
        
        // 8. Calculate actual durations and adjust to ensure exactly 6 seconds total
        const totalDuration = actualPanelBeforeDuration + actualPanelAfterDuration;
        
        console.log(`[VIDEO] Total duration: ${totalDuration}s (before: ${actualPanelBeforeDuration}s, after: ${actualPanelAfterDuration}s)`);
        
        // If total > 6s, trim panel_after
        // If total < 6s, extend panel_after (by repeating frames or slowing down)
        // Target: exactly 6 seconds total
        let finalPanelAfterDuration = actualPanelAfterDuration;
        
        if (totalDuration > 6) {
            // Trim panel_after to fit exactly 6 seconds
            finalPanelAfterDuration = 6 - actualPanelBeforeDuration;
            if (finalPanelAfterDuration > 0 && finalPanelAfterDuration < actualPanelAfterDuration) {
                const trimmedPanelAfterPath = path.join(baseDir, `panel_after_trimmed_${videoId}.mp4`);
                await cutVideoSegment(panelAfterPath, 0, finalPanelAfterDuration, trimmedPanelAfterPath);
                await fsp.unlink(panelAfterPath); // Remove original
                panelAfterPath = trimmedPanelAfterPath;
                console.log(`[VIDEO] Trimmed panel_after to ${finalPanelAfterDuration}s to fit 6s total`);
            }
        } else if (totalDuration < 6) {
            // Extend panel_after to fill remaining time
            finalPanelAfterDuration = 6 - actualPanelBeforeDuration;
            if (finalPanelAfterDuration > actualPanelAfterDuration) {
                // Use setpts filter to slow down the video to extend duration
                const extendedPanelAfterPath = path.join(baseDir, `panel_after_extended_${videoId}.mp4`);
                const panelAfterPathNormalized = path.resolve(panelAfterPath).replace(/\\/g, '/');
                const extendedPathNormalized = path.resolve(extendedPanelAfterPath).replace(/\\/g, '/');
                
                // Calculate PTS factor to extend: target_duration / original_duration
                const ptsFactor = finalPanelAfterDuration / actualPanelAfterDuration;
                
                await new Promise((resolve, reject) => {
                    ffmpegLib(panelAfterPathNormalized)
                        .outputOptions([
                            `-filter:v`, `setpts=${ptsFactor}*PTS`,
                            `-t`, String(finalPanelAfterDuration),
                            '-c:v', 'libx264',
                            '-an' // Remove audio
                        ])
                        .output(extendedPathNormalized)
                        .on('start', (commandLine) => {
                            console.log('[VIDEO] Extend command:', commandLine);
                        })
                        .on('stderr', (stderrLine) => {
                            console.log('[VIDEO] Extend stderr:', stderrLine);
                        })
                        .on('end', () => {
                            resolve();
                        })
                        .on('error', (err) => {
                            console.error('[VIDEO] Extend video error:', err);
                            reject(err);
                        })
                        .run();
                });
                
                await fsp.unlink(panelAfterPath); // Remove original
                panelAfterPath = extendedPanelAfterPath;
                console.log(`[VIDEO] Extended panel_after to ${finalPanelAfterDuration}s to fill 6s total`);
            }
        }
        
        // 9. Concatenate panel_before + panel_after → tracking_video
        trackingVideoPath = path.join(baseDir, `tracking_video_${videoId}.mp4`);
        await concatenateVideos(panelBeforePath, panelAfterPath, trackingVideoPath);
        console.log(`[VIDEO] Videos concatenated: ${trackingVideoPath}`);
        
        // 10. Upload tracking_video
        const videoCode = `${actionItemId}_tracking_video`;
        const videoUrl = await uploadVideoAndGetUrl(trackingVideoPath, videoCode, ENV.API_TOKEN);
        
        // Cleanup temp files
        const filesToCleanup = [tempVideoPath, panelBeforePath, panelAfterPath, trackingVideoPath];
        for (const filePath of filesToCleanup) {
            try {
                if (filePath) {
                    await fsp.unlink(filePath);
                }
            } catch (err) {
                console.warn(`[VIDEO] Failed to cleanup temp file ${filePath}:`, err);
            }
        }
        
        console.log('[VIDEO] ✅ TrackingVideo created:', videoUrl);
        return { videoUrl };
        
    } catch (err) {
        // Cleanup temp files on error
        const filesToCleanup = [tempVideoPath, panelBeforePath, panelAfterPath, trackingVideoPath];
        for (const filePath of filesToCleanup) {
            try {
                if (filePath) {
                    await fsp.unlink(filePath);
                }
            } catch (cleanupErr) {
                console.warn(`[VIDEO] Failed to cleanup temp file ${filePath} on error:`, cleanupErr);
            }
        }
        console.error('[VIDEO] ❌ Failed to create TrackingVideo:', err);
        throw err;
    }
}
