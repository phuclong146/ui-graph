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

    const response = await fetch('https://upload.clevai.edu.vn/admin/video', {
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

export async function fetchWebsiteList(apiKey) {
    try {
        const myHeaders = new Headers();
        myHeaders.append("accept", "application/json, text/plain, */*");
        myHeaders.append("authorization", apiKey);

        const resp = await fetch("https://api.comaker.me/api/v1/lms/ai-tool/level1", {
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