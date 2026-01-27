# Giải thích về parent_dom.action_pos và mối liên quan với action.global_pos, action.local_pos

## 1. parent_dom.action_pos được tạo như thế nào?

### Quy trình tạo parent_dom.action_pos:

#### Bước 1: Capture DOM từ browser
- File: `core/media/dom-capture.js` - hàm `captureActionsFromDOM()`
- Capture các interactive elements (button, link, input, etc.) từ DOM
- Tính toán vị trí tương đối của element trong viewport/crop area

#### Bước 2: Normalize về scale 0-1000
```javascript
// Trong dom-capture.js, dòng 138-143
action_pos: {
    x: Math.round((scaledX / refWidth) * 1000),   // Normalize về 0-1000
    y: Math.round((scaledY / refHeight) * 1000),
    w: Math.round((scaledW / refWidth) * 1000),
    h: Math.round((scaledH / refHeight) * 1000)
}
```
- Tọa độ được normalize về scale 0-1000 (độc lập với kích thước thực)
- Nếu có cropArea: tọa độ relative to crop area
- Nếu không có cropArea: tọa độ relative to viewport/full page

#### Bước 3: Scale về pixel coordinates
- File: `core/tracker/gemini-handler.js` (dòng 565-576) hoặc `queue-page-handlers.js` (dòng 1586-1597)
- Scale từ normalized (0-1000) về pixel coordinates dựa trên kích thước thực của panel image:

```javascript
const scaleX = fullMeta.width / 1000;  // fullMeta.width là width thực của panel (pixel)
const scaleY = fullMeta.height / 1000;

const scaledDomActions = domActions.map(action => ({
    ...action,
    action_pos: {
        x: Math.round(action.action_pos.x * scaleX),  // Convert về pixel
        y: Math.round(action.action_pos.y * scaleY),
        w: Math.round(action.action_pos.w * scaleX),
        h: Math.round(action.action_pos.h * scaleY)
    }
}));
```

#### Bước 4: Lưu vào parent_dom
- File: `core/data/ParentPanelManager.js` - hàm `updateParentDom()`
- Lưu danh sách `scaledDomActions` vào `parent_dom` của panel

### Giá trị parent_dom.action_pos phản ánh:
- **Tọa độ pixel** của action element trong hệ tọa độ của panel
- **Trường hợp panel có crop**: tọa độ relative to cropped area (local coordinates)
- **Trường hợp panel không crop**: tọa độ relative to full panel image (có thể là global hoặc local tùy context)

---

## 2. Mối liên quan giữa parent_dom.action_pos, action.global_pos và action.local_pos

### Định nghĩa các loại tọa độ:

#### action.global_pos:
- Tọa độ **tuyệt đối** trong full screenshot/fullscreen image
- Luôn reference đến toàn bộ màn hình ban đầu (không bị ảnh hưởng bởi crop)
- Được lưu trong `action.metadata.global_pos`

#### action.local_pos:
- Tọa độ **tương đối** trong panel
- Nếu panel có crop: relative to cropped area
- Nếu panel không crop: relative to panel image (có thể có page offset)
- Được lưu trong `action.metadata.local_pos` với format: `{p, x, y, w, h}` (p = page number)

#### parent_dom.action_pos:
- Tọa độ pixel của DOM element được capture từ browser
- Được lưu trong `parent_dom` array của panel entry

---

## 3. Mối liên quan giữa action và parent_dom

### parent_dom là gì?
- `parent_dom` là mảng chứa các DOM actions được capture trực tiếp từ browser
- Mỗi entry trong `parent_dom` có format:
```javascript
{
    action_id: "...",
    action_name: "...",
    action_type: "...",
    action_verb: "...",
    action_content: "...",
    action_pos: {x, y, w, h}  // Pixel coordinates
}
```

### Mối liên quan:
1. **parent_dom là source data**: Chứa thông tin DOM elements được capture từ browser
2. **ACTION items là processed data**: Được tạo từ `parent_dom` hoặc từ Gemini detection
3. **Mapping**: Một action trong `parent_dom` có thể được convert thành ACTION item trong database

---

## 4. Chi tiết cho từng trường hợp

### TRƯỜNG HỢP 1: Panel KHÔNG có crop

#### Cách tạo parent_dom.action_pos:
1. Capture DOM từ browser (không có cropArea)
2. Normalize về 0-1000 scale
3. Scale về pixel: `action_pos = normalized_pos * (panel_width/1000, panel_height/1000)`
4. Lưu vào `parent_dom`

**Ví dụ:**
```javascript
// Panel size: 1920x1080
// Normalized action_pos: {x: 500, y: 300, w: 100, h: 50}
// Scaled action_pos: {x: 960, y: 324, w: 192, h: 54}
```

#### Mối liên quan với action.global_pos và action.local_pos:

**Khi tạo ACTION từ parent_dom (không crop):**
- File: `core/tracker/queue-page-handlers.js` (dòng 1065-1107)

```javascript
// Panel không có crop
const panelCropArea = panelItem.metadata?.global_pos; // null hoặc undefined

if (!panelCropArea) {
    // local_pos = global_pos (chỉ khác về page offset)
    globalX = newAction.action_pos.x;
    globalY = (pageNumber - 1) * pageHeight + newAction.action_pos.y;
    
    local_pos = {
        p: pageNumber,
        x: newAction.action_pos.x,
        y: newAction.action_pos.y,  // Đã trừ page offset
        w: newAction.action_pos.w,
        h: newAction.action_pos.h
    };
    
    global_pos = {
        x: globalX,
        y: globalY,  // Bao gồm page offset
        w: newAction.action_pos.w,
        h: newAction.action_pos.h
    };
}
```

**Quan hệ:**
- `parent_dom.action_pos` ≈ `action.local_pos` (cùng hệ tọa độ panel)
- `action.global_pos.y` = `action.local_pos.y + (pageNumber - 1) * 1080`
- `action.global_pos.x` = `action.local_pos.x` (không có crop nên không có offset)

---

### TRƯỜNG HỢP 2: Panel CÓ crop

#### Cách tạo parent_dom.action_pos:
1. Capture DOM từ browser với cropArea
2. Normalize về 0-1000 scale (relative to crop area)
3. Scale về pixel: `action_pos = normalized_pos * (crop_width/1000, crop_height/1000)`
4. Lưu vào `parent_dom`

**Ví dụ:**
```javascript
// Crop area: x=100, y=200, w=800, h=600
// Panel full size: 1920x1080
// Normalized action_pos: {x: 250, y: 300, w: 100, h: 50}
// Scaled action_pos: {x: 200, y: 180, w: 80, h: 30}  // Relative to crop area
```

#### Mối liên quan với action.global_pos và action.local_pos:

**Khi tạo ACTION từ parent_dom (có crop):**
- File: `core/tracker/queue-page-handlers.js` (dòng 2886-2911)

```javascript
// Panel có crop
const cropArea = {x: 100, y: 200, w: 800, h: 600};  // panelItem.metadata.global_pos

// parent_dom.action_pos là local (relative to cropped panel)
// action.action_pos từ parent_dom: {x: 200, y: 180, w: 80, h: 30}

// Calculate global_pos by adding back cropArea offset
const globalPos = {
    x: action.action_pos.x + cropArea.x,  // 200 + 100 = 300
    y: action.action_pos.y + cropArea.y,  // 180 + 200 = 380
    w: action.action_pos.w,                // 80
    h: action.action_pos.h                 // 30
};

// local_pos is relative to cropped panel (same as action.action_pos)
const localPos = {
    x: action.action_pos.x,  // 200
    y: action.action_pos.y,  // 180
    w: action.action_pos.w,  // 80
    h: action.action_pos.h   // 30
};
```

**Quan hệ:**
- `parent_dom.action_pos` = `action.local_pos` (cùng là local coordinates trong crop area)
- `action.global_pos` = `action.local_pos + cropArea.offset`
  - `global_pos.x` = `local_pos.x + cropArea.x`
  - `global_pos.y` = `local_pos.y + cropArea.y`
- `action.local_pos` là tọa độ trong cropped panel (0,0 là top-left của crop area)

**⚠️ LƯU Ý QUAN TRỌNG về page number:**
- `pageNumber` được tính từ `action.action_pos.y` trong crop area: `Math.floor(actionCenterY / 1080) + 1`
- Đây là page number **trong crop area** (không phải trong fullscreen)
- `global_pos.y` KHÔNG cần thêm page offset vì:
  - `local_pos.y` đã là absolute position trong crop area (có thể > 1080 nếu crop trải dài nhiều page)
  - `cropArea.y` đã là absolute position trong fullscreen
  - Khi cộng lại: `global_pos.y = local_pos.y + cropArea.y` → đã là absolute position trong fullscreen

---

## 5. Tóm tắt công thức chuyển đổi

### Panel KHÔNG crop:
```
parent_dom.action_pos = action.local_pos (cùng hệ tọa độ)
action.global_pos.x = action.local_pos.x
action.global_pos.y = action.local_pos.y + (pageNumber - 1) * 1080
```

### Panel CÓ crop:
```
parent_dom.action_pos = action.local_pos (cùng hệ tọa độ crop area)
action.global_pos.x = action.local_pos.x + cropArea.x
action.global_pos.y = action.local_pos.y + cropArea.y  // KHÔNG cần page offset
action.local_pos = parent_dom.action_pos (relative to crop area, có thể > 1080 nếu crop nhiều page)
```

**Giải thích tại sao không cần page offset:**
- `local_pos.y` trong crop area là absolute position trong crop area (0 = top của crop)
- `cropArea.y` là absolute position của crop area trong fullscreen
- Khi cộng: `global_pos.y = local_pos.y + cropArea.y` → đã là absolute position trong fullscreen
- Khác với trường hợp không crop: `local_pos.y` đã được trừ page offset, nên cần cộng lại

---

## 6. Code references

### Files liên quan:
1. **dom-capture.js**: Capture và normalize DOM actions
2. **gemini-handler.js**: Scale và lưu vào parent_dom (không crop)
3. **queue-page-handlers.js**: 
   - Dòng 1579-1600: Tạo parent_dom cho panel mới (có crop)
   - Dòng 2779-2919: Tạo parent_dom và actions khi confirm crop
   - Dòng 1065-1107: Update action từ parent_dom (không crop)
4. **ParentPanelManager.js**: Quản lý parent_dom storage
5. **DataItemManager.js**: Tạo ACTION items với global_pos và local_pos

---

## 7. Ví dụ cụ thể

### Ví dụ 1: Panel không crop
```
Panel size: 1920x1080
parent_dom.action_pos: {x: 500, y: 600, w: 100, h: 50}
Page: 1

→ action.local_pos: {p: 1, x: 500, y: 600, w: 100, h: 50}
→ action.global_pos: {x: 500, y: 600, w: 100, h: 50}
```

### Ví dụ 2: Panel có crop
```
Panel full size: 1920x1080
Crop area: {x: 100, y: 200, w: 800, h: 600}
parent_dom.action_pos: {x: 200, y: 180, w: 80, h: 30}

→ action.local_pos: {p: 1, x: 200, y: 180, w: 80, h: 30}
→ action.global_pos: {x: 300, y: 380, w: 80, h: 30}
   (300 = 200 + 100, 380 = 180 + 200)
```

### Ví dụ 3: Panel có crop, action ở page 2 của crop area
```
Panel full size: 1920x2160 (2 pages)
Crop area: {x: 100, y: 200, w: 800, h: 1200}  // Crop từ y=200 đến y=1400
parent_dom.action_pos: {x: 200, y: 1100, w: 80, h: 30}  // Local to crop, ở page 2 của crop

→ pageNumber trong crop: Math.floor(1100 / 1080) + 1 = 2
→ action.local_pos: {p: 2, x: 200, y: 1100, w: 80, h: 30}
→ action.global_pos: {x: 300, y: 1300, w: 80, h: 30}
   (300 = 200 + 100, 1300 = 1100 + 200)
   Note: global_pos.y = 1300 là absolute trong fullscreen (page 2, y=220 trong page)
```

### Ví dụ 4: Panel có crop bắt đầu từ page 2 của fullscreen
```
Panel full size: 1920x2160 (2 pages)
Crop area: {x: 100, y: 1200, w: 800, h: 600}  // Crop từ page 2 (y=1200)
parent_dom.action_pos: {x: 200, y: 300, w: 80, h: 30}  // Local to crop

→ pageNumber trong crop: Math.floor(300 / 1080) + 1 = 1
→ action.local_pos: {p: 1, x: 200, y: 300, w: 80, h: 30}
→ action.global_pos: {x: 300, y: 1500, w: 80, h: 30}
   (300 = 200 + 100, 1500 = 300 + 1200)
   Note: global_pos.y = 1500 là absolute trong fullscreen (page 2, y=420 trong page)
   KHÔNG cần thêm (pageNumber - 1) * 1080 vì cropArea.y đã là 1200 (bắt đầu từ page 2)
```
