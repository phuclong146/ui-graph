/**
 * Hiển thị vòng tròn vàng quanh con trỏ trên tab đang được tracker để người dùng biết tab nào đang được theo dõi.
 */

const TRACKER_CURSOR_ID = 'tracker-cursor-indicator';

/**
 * Gắn script chạy mỗi lần document load (F5, navigate) để tự thêm vòng tròn vàng.
 * Chỉ cần gọi 1 lần cho mỗi page.
 * @param {import('puppeteer').Page} page
 */
export async function ensureTrackerCursorIndicatorOnLoad(page) {
    if (!page || page.isClosed()) return;
    try {
        await page.evaluateOnNewDocument((id) => {
            const addIndicator = () => {
                if (document.getElementById(id)) return;
                if (!document.body) return;
                const el = document.createElement('div');
                el.id = id;
                el.style.cssText = [
                    'position: fixed',
                    'width: 32px',
                    'height: 32px',
                    'border: 3px solid #facc15',
                    'border-radius: 50%',
                    'pointer-events: none',
                    'z-index: 2147483647',
                    'left: 0',
                    'top: 0',
                    'transform: translate(-50%, -50%)',
                    'box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.4)',
                    'transition: left 0.05s ease-out, top 0.05s ease-out'
                ].join(';');
                const onMove = (e) => {
                    el.style.left = e.clientX + 'px';
                    el.style.top = e.clientY + 'px';
                };
                document.addEventListener('mousemove', onMove);
                document.body.appendChild(el);
                window.__trackerCursorMove = onMove;
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', addIndicator);
            } else {
                addIndicator();
            }
        }, TRACKER_CURSOR_ID);
    } catch (e) {
        const msg = e.message || '';
        if (!msg.includes('Target closed') && !msg.includes('detached')) {
            console.warn('ensureTrackerCursorIndicatorOnLoad failed:', msg);
        }
    }
}

/**
 * Hiển thị vòng tròn vàng quanh con trỏ trên page (tab đang tracker).
 * @param {import('puppeteer').Page} page
 */
export async function showTrackerCursorIndicator(page) {
    if (!page || page.isClosed()) return;
    try {
        await page.evaluate((id) => {
            const addIndicator = () => {
                if (document.getElementById(id)) return;
                if (!document.body) return;
                const el = document.createElement('div');
                el.id = id;
                el.style.cssText = [
                    'position: fixed',
                    'width: 32px',
                    'height: 32px',
                    'border: 3px solid #facc15',
                    'border-radius: 50%',
                    'pointer-events: none',
                    'z-index: 2147483647',
                    'left: 0',
                    'top: 0',
                    'transform: translate(-50%, -50%)',
                    'box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.4)',
                    'transition: left 0.05s ease-out, top 0.05s ease-out'
                ].join(';');
                const onMove = (e) => {
                    el.style.left = e.clientX + 'px';
                    el.style.top = e.clientY + 'px';
                };
                document.addEventListener('mousemove', onMove);
                document.body.appendChild(el);
                window.__trackerCursorMove = onMove;
            };
            if (document.body) {
                addIndicator();
            } else {
                document.addEventListener('DOMContentLoaded', addIndicator);
                if (document.readyState === 'complete') addIndicator();
            }
        }, TRACKER_CURSOR_ID);
    } catch (e) {
        const msg = e.message || '';
        if (!msg.includes('Target closed') && !msg.includes('Execution context was destroyed') && !msg.includes('detached Frame')) {
            console.warn('showTrackerCursorIndicator failed:', msg);
        }
    }
}

/**
 * Ẩn vòng tròn vàng trên page (khi chuyển sang tab khác làm tracker).
 * @param {import('puppeteer').Page} page
 */
export async function hideTrackerCursorIndicator(page) {
    if (!page || page.isClosed()) return;
    try {
        await page.evaluate((id) => {
            const el = document.getElementById(id);
            if (el && el.parentNode) {
                const onMove = window.__trackerCursorMove;
                if (onMove) {
                    document.removeEventListener('mousemove', onMove);
                    window.__trackerCursorMove = null;
                }
                el.parentNode.removeChild(el);
            }
        }, TRACKER_CURSOR_ID);
    } catch (e) {
        const msg = e.message || '';
        if (!msg.includes('Target closed') && !msg.includes('Execution context was destroyed') && !msg.includes('detached Frame')) {
            console.warn('hideTrackerCursorIndicator failed:', msg);
        }
    }
}
