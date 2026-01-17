import fs from "fs";

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

    const response = await fetch('https://api-gateway.mikai.tech/api/v1/authoring/admin/picture', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'authorization': apiKey,
        },
        body: formData
    });

    const responseText = await response.text();
    console.log('Upload xong:', responseText);
    return responseText;
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
    
    // Log request details for Postman testing
    console.log('[UPLOAD VIDEO] Request details:');
    console.log('  URL:', uploadUrl);
    console.log('  Method: POST');
    console.log('  Headers:');
    console.log('    accept: application/json');
    console.log('    authorization:', apiKey ? `${apiKey.substring(0, 20)}...` : '(empty)');
    console.log('  FormData fields:');
    console.log('    source_name:', videoCode);
    console.log('    source_code:', videoCode);
    console.log('    file:', fileName, `(${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log('    content_type: video/mp4');
    console.log('[UPLOAD VIDEO] Sending request...');

    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'authorization': apiKey,
        },
        body: formData
    });

    const responseText = await response.text();
    console.log('Upload xong:', responseText);
    
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
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'accept': 'application/json',
            'authorization': apiKey,
        }
    });

    const responseText = await response.text();
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