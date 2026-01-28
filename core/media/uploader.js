import fs from "fs";
import { refreshApiToken, isTokenExpiredError } from "../config/token-refresh.js";
import { reloadApiToken, ENV } from "../config/env.js";

export async function uploadPictureAndGetUrl(filePath, pictureCode, apiKey) {
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error(`File is empty: ${filePath}`);
    }
    
    const fileName = filePath.split(/[/\\]/).pop();
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    
    const formData = new FormData();
    formData.append('picture_name', pictureCode);
    formData.append('picture_code', pictureCode);
    formData.append('picture_type', '1');
    formData.append('file', blob, fileName);
    formData.append('content_type', 'image/jpeg');

    let currentApiKey = apiKey || ENV.API_TOKEN;
    let response = await fetch('https://api-gateway.mikai.tech/api/v1/authoring/admin/picture', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'authorization': currentApiKey,
        },
        body: formData
    });

    const responseText = await response.text();
    console.log('Upload xong:', responseText);
    
    // Check if token expired and retry with refreshed token
    if (!response.ok && isTokenExpiredError(new Error(responseText), response.status)) {
        console.log('🔄 Token expired, refreshing...');
        try {
            const newToken = await refreshApiToken();
            reloadApiToken();
            currentApiKey = newToken;
            
            // Retry the request with new token
            response = await fetch('https://api-gateway.mikai.tech/api/v1/authoring/admin/picture', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'authorization': currentApiKey,
                },
                body: formData
            });
            
            const retryResponseText = await response.text();
            console.log('Upload xong (after refresh):', retryResponseText);
            
            if (!response.ok) {
                throw new Error(`Upload failed with status ${response.status}: ${response.statusText} - ${retryResponseText}`);
            }
            
            const retryResponseData = JSON.parse(retryResponseText);
            if (retryResponseData.status === 200 && retryResponseData.message) {
                return retryResponseData.message;
            } else {
                throw new Error(`Upload failed: ${retryResponseText}`);
            }
        } catch (refreshError) {
            throw new Error(`Token refresh failed: ${refreshError.message}. Original error: ${responseText}`);
        }
    }
    
    // Check if HTTP response is ok
    if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}: ${response.statusText} - ${responseText}`);
    }
    
    // Parse JSON response and return only the link (message field)
    try {
        const responseData = JSON.parse(responseText);
        if (responseData.status === 200 && responseData.message) {
            return responseData.message;
        } else {
            throw new Error(`Upload failed: ${responseText}`);
        }
    } catch (e) {
        // If not JSON or parsing fails, throw error
        if (e instanceof Error && e.message.includes('Upload failed')) {
            throw e;
        }
        throw new Error(`Failed to parse upload response: ${responseText}`);
    }
}

export async function uploadVideo(filePath, videoCode, apiKey) {
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`Video file not found: ${filePath}`);
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error(`Video file is empty: ${filePath}`);
    }
    
    const fileName = filePath.split(/[/\\]/).pop();
    const blob = new Blob([fileBuffer], { type: 'video/mp4' });
    
    const formData = new FormData();
    formData.append('source_name', videoCode);
    formData.append('source_code', videoCode);
    formData.append('file', blob, fileName);
    formData.append('content_type', 'video/mp4');

    const uploadUrl = 'https://upload.clevai.edu.vn/admin/video';
    
    let currentApiKey = apiKey || ENV.API_TOKEN;
    
    // Log request details for Postman testing
    console.log('[UPLOAD VIDEO] Request details:');
    console.log('  URL:', uploadUrl);
    console.log('  Method: POST');
    console.log('  Headers:');
    console.log('    accept: application/json');
    console.log('    authorization:', currentApiKey ? `${currentApiKey.substring(0, 20)}...` : '(empty)');
    console.log('  FormData fields:');
    console.log('    source_name:', videoCode);
    console.log('    source_code:', videoCode);
    console.log('    file:', fileName, `(${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log('    content_type: video/mp4');
    console.log('[UPLOAD VIDEO] Sending request...');

    let response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'authorization': currentApiKey,
        },
        body: formData
    });

    let responseText = await response.text();
    console.log('Upload xong:', responseText);
    
    // Check if token expired and retry with refreshed token
    if (!response.ok && isTokenExpiredError(new Error(responseText), response.status)) {
        console.log('🔄 Token expired, refreshing...');
        try {
            const newToken = await refreshApiToken();
            reloadApiToken();
            currentApiKey = newToken;
            
            // Retry the request with new token
            response = await fetch(uploadUrl, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'authorization': currentApiKey,
                },
                body: formData
            });
            
            responseText = await response.text();
            console.log('Upload xong (after refresh):', responseText);
        } catch (refreshError) {
            throw new Error(`Token refresh failed: ${refreshError.message}. Original error: ${responseText}`);
        }
    }
    
    // Check if upload was successful - check both response.ok and status field in JSON
    let isError = !response.ok;
    let errorMessage = '';
    
    try {
        const responseData = JSON.parse(responseText);
        // Also check if response JSON has status !== 200
        if (responseData.status && responseData.status !== 200) {
            isError = true;
            errorMessage = `Upload failed with status ${responseData.status}`;
            if (responseData.message) {
                errorMessage += ` - ${responseData.message}`;
            }
        }
    } catch (e) {
        // If response is not JSON, check response.ok
        if (!response.ok) {
            isError = true;
            errorMessage = `Upload failed with status ${response.status}: ${response.statusText}`;
            if (responseText) {
                errorMessage += ` - ${responseText}`;
            }
        }
    }
    
    if (isError) {
        if (!errorMessage) {
            errorMessage = `Upload failed with status ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
    }
    
    return responseText;
}

export async function getVideoLink(videoCode, apiKey) {
    const url = `https://api.clevai.edu.vn/api/v1/authoring/resource?source_code=${videoCode}&source_name=&content_type=video%2Fmp4&page=0&size=10`;
    
    let currentApiKey = apiKey || ENV.API_TOKEN;
    let response = await fetch(url, {
        method: 'GET',
        headers: {
            'accept': 'application/json',
            'authorization': currentApiKey,
        }
    });

    let responseText = await response.text();
    
    // Check if token expired and retry with refreshed token
    if (!response.ok && isTokenExpiredError(new Error(responseText), response.status)) {
        console.log('🔄 Token expired, refreshing...');
        try {
            const newToken = await refreshApiToken();
            reloadApiToken();
            currentApiKey = newToken;
            
            // Retry the request with new token
            response = await fetch(url, {
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'authorization': currentApiKey,
                }
            });
            
            responseText = await response.text();
        } catch (refreshError) {
            throw new Error(`Token refresh failed: ${refreshError.message}. Original error: ${responseText}`);
        }
    }
    
    if (!response.ok) {
        throw new Error(`Get video link failed with status ${response.status}: ${response.statusText} - ${responseText}`);
    }
    
    const data = JSON.parse(responseText);
    
    if (
        data &&
        Array.isArray(data.content) &&
        data.content.length > 0 &&
        data.content[0].source_url
    ) {
        return data.content[0].source_url;
    } else {
        throw new Error('Không tìm thấy source_url trong response');
    }
}

export async function uploadVideoAndGetUrl(filePath, videoCode, apiKey) {
    await uploadVideo(filePath, videoCode, apiKey);
    const videoUrl = await getVideoLink(videoCode, apiKey);
    return videoUrl;
}

export async function fetchWebsiteList() {
    try {
        const myHeaders = new Headers();
        myHeaders.append("accept", "application/json, text/plain, */*");

        const resp = await fetch("https://api.comaker.me/api/v1/lms/internal/ai-tool/level1", {
            method: "GET",
            headers: myHeaders,
            redirect: "follow",
        });

        if (!resp.ok) {
            console.error(`❌ Fetch websites failed: HTTP ${resp.status} ${resp.statusText}`);
            return [];
        }

        const data = await resp.json();
        const websites = data.data || [];
        console.log(`✅ Fetch websites thành công: ${websites.length} trang web`);
        return websites;
    } catch (e) {
        console.error("❌ Fetch websites failed:", e);
        return [];
    }
}