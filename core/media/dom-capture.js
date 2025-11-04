export async function captureActionsFromDOM(page, cropArea = null, fullPage = false, imageWidth = null, imageHeight = null) {
    if (!page) return [];
    
    const scrollPosition = await page.evaluate(() => {
        return { x: window.scrollX || window.pageXOffset, y: window.scrollY || window.pageYOffset };
    });
    
    if (fullPage) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await new Promise(r => setTimeout(r, 100));
    }
    
    const actions = await page.evaluate((cropArea, fullPage, imageWidth, imageHeight) => {
        const interactiveElements = [];
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const documentWidth = document.documentElement.scrollWidth;
        const documentHeight = document.documentElement.scrollHeight;
        
        const isInteractive = (el) => {
            const tag = el.tagName?.toLowerCase();
            const role = el.getAttribute('role');
            return tag === 'button' ||
                   tag === 'a' ||
                   (tag === 'input' && !['hidden', 'submit'].includes(el.type)) ||
                   tag === 'select' ||
                   tag === 'textarea' ||
                   role === 'button' ||
                   role === 'link' ||
                   el.onclick;
        };
        
        const getText = (el) => {
            return el.getAttribute('aria-label')?.trim() ||
                   (typeof el.placeholder === 'string' ? el.placeholder.trim() : '') ||
                   (el.value ? String(el.value).trim() : '') ||
                   (typeof el.alt === 'string' ? el.alt.trim() : '') ||
                   (el.innerText ? String(el.innerText).trim().substring(0, 50) : '') ||
                   el.tagName.toLowerCase();
        };
        
        const isInCropArea = (rect, cropArea) => {
            if (!cropArea) return true;
            
            const elementCenterX = rect.left + rect.width / 2;
            const elementCenterY = rect.top + rect.height / 2;
            
            return elementCenterX >= cropArea.x &&
                   elementCenterX <= cropArea.x + cropArea.width &&
                   elementCenterY >= cropArea.y &&
                   elementCenterY <= cropArea.y + cropArea.height;
        };
        
        const traverse = (element) => {
            if (!element) return;
            
            if (isInteractive(element)) {
                const rect = element.getBoundingClientRect();
                
                const maxWidth = fullPage ? documentWidth : viewportWidth;
                const maxHeight = fullPage ? documentHeight : viewportHeight;
                
                if (rect.width > 0 && rect.height > 0 &&
                    rect.left >= 0 && rect.top >= 0 &&
                    rect.right <= maxWidth &&
                    rect.bottom <= maxHeight &&
                    isInCropArea(rect, cropArea)) {
                    
                    let relativeX, relativeY;
                    if (cropArea) {
                        relativeX = rect.left - cropArea.x;
                        relativeY = rect.top - cropArea.y;
                    } else {
                        relativeX = rect.left;
                        relativeY = rect.top;
                    }
                    
                    let refWidth, refHeight, scaledX, scaledY, scaledW, scaledH;
                    if (imageWidth && imageHeight) {
                        const refDimHeight = fullPage ? documentHeight : viewportHeight;
                        const scaleX = imageWidth / viewportWidth;
                        const scaleY = imageHeight / refDimHeight;
                        
                        scaledX = relativeX * scaleX;
                        scaledY = relativeY * scaleY;
                        scaledW = rect.width * scaleX;
                        scaledH = rect.height * scaleY;
                        
                        refWidth = cropArea ? cropArea.width : imageWidth;
                        refHeight = cropArea ? cropArea.height : imageHeight;
                        
                    } else {
                        scaledX = relativeX;
                        scaledY = relativeY;
                        scaledW = rect.width;
                        scaledH = rect.height;
                        refWidth = cropArea ? cropArea.width : (fullPage ? viewportWidth : viewportWidth);
                        refHeight = cropArea ? cropArea.height : (fullPage ? documentHeight : viewportHeight);
                    }
                    
                    const elementText = getText(element);
                    const elementTag = element.tagName.toLowerCase();
                    const ariaLabel = element.getAttribute('aria-label');
                    const placeholder = element.getAttribute('placeholder');
                    const value = element.value || element.getAttribute('value');
                    const contentAttr = ariaLabel || placeholder || value;
                    
                    interactiveElements.push({
                        action_id: 'action_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        action_name: elementText || 'Unnamed',
                        action_type: elementTag,
                        action_verb: ['input', 'textarea'].includes(elementTag) ? 'type' : 'click',
                        action_content: contentAttr || null,
                        action_pos: {
                            x: Math.round((scaledX / refWidth) * 1000),
                            y: Math.round((scaledY / refHeight) * 1000),
                            w: Math.round((scaledW / refWidth) * 1000),
                            h: Math.round((scaledH / refHeight) * 1000)
                        }
                    });
                }
            }
            
            Array.from(element.children || []).forEach(traverse);
        };
        
        traverse(document.body);
        
        return interactiveElements;
    }, cropArea, fullPage, imageWidth, imageHeight);
    
    if (fullPage) {
        await page.evaluate((pos) => window.scrollTo(pos.x, pos.y), scrollPosition);
    }
    
    return actions;
}

export function filterActionsByCropArea(actions, cropPos) {
    if (!cropPos || !actions) return actions;
    
    return actions.filter(action => {
        const pos = action.action_pos;
        const centerX = pos.x + pos.w / 2;
        const centerY = pos.y + pos.h / 2;
        
        return (
            centerX >= cropPos.x &&
            centerX <= cropPos.x + cropPos.w &&
            centerY >= cropPos.y &&
            centerY <= cropPos.y + cropPos.h
        );
    }).map(action => {
        return {
            ...action,
            action_pos: {
                x: action.action_pos.x - cropPos.x,
                y: action.action_pos.y - cropPos.y,
                w: action.action_pos.w,
                h: action.action_pos.h
            }
        };
    });
}

export function getElementName(element) {
    if (!element) return 'Unnamed';
    
    const ariaLabel = element.getAttribute?.('aria-label');
    const placeholder = typeof element.placeholder === 'string' ? element.placeholder : '';
    const value = element.value ? String(element.value) : '';
    const alt = typeof element.alt === 'string' ? element.alt : '';
    const text = element.textContent ? String(element.textContent).trim().substring(0, 50) : '';
    const id = element.id || '';
    const tagName = element.tagName?.toLowerCase() || '';
    
    return ariaLabel || placeholder || value || alt || text || id || tagName || 'Unnamed';
}

