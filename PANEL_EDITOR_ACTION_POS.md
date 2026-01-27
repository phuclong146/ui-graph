# Panel Editor - Cách sử dụng action position khi vẽ khung

## Tổng quan

Panel editor sử dụng **absolute coordinates** trong `geminiResult[].actions[].action_pos` để vẽ và quản lý các action boxes. Tuy nhiên, cách xử lý khác nhau giữa panel có crop và không crop.

---

## 1. Khi LOAD actions vào editor

### Code location: `queue-page-handlers.js` dòng 2217-2246

**Trường hợp Panel CÓ crop:**
```javascript
// Check if panel has crop
const panelCropArea = panelItem.metadata?.global_pos;

if (panelCropArea && actionItem.metadata?.global_pos) {
    // Panel has crop: always convert from global_pos to local_pos (relative to crop area)
    // This ensures consistency even if local_pos exists but might be incorrect
    const globalX = actionItem.metadata.global_pos.x;
    const globalY = actionItem.metadata.global_pos.y;
    const localX = globalX - panelCropArea.x;
    const localY = globalY - panelCropArea.y;
    
    actionPos = {
        p: actionItem.metadata.global_pos?.p || actionItem.metadata?.local_pos?.p || Math.floor(localY / 1080) + 1,
        x: localX,
        y: localY,
        w: actionItem.metadata.global_pos.w,
        h: actionItem.metadata.global_pos.h
    };
}
```

**Trường hợp Panel KHÔNG crop:**
```javascript
// Panel has no crop: use local_pos if available, otherwise global_pos
actionPos = actionItem.metadata?.local_pos || actionItem.metadata?.global_pos;
```

**Quy tắc:**
- **Panel có crop**: Luôn convert từ `global_pos` sang `local_pos` (trừ crop offset) để đảm bảo tính nhất quán
- **Panel không crop**: Ưu tiên dùng `local_pos` nếu có, nếu không thì dùng `global_pos`

**Ý nghĩa:**
- `local_pos`: Tọa độ trong panel (relative to crop area nếu có crop, hoặc relative to panel nếu không crop)
- `global_pos`: Tọa độ tuyệt đối trong fullscreen
- **Với panel có crop**: Canvas hiển thị cropped image (bắt đầu từ 0,0), nên `local_pos` phải relative to crop area

---

## 2. Khi VẼ box trên canvas

### Code location: `panel-editor-class.js` dòng 733-802

```javascript
// Check if panel has crop (panelAfterGlobalPos exists)
const hasCrop = this.panelAfterGlobalPos != null;

panel.actions.forEach((action, actionIndex) => {
    if (action.action_pos) {
        if (hasCrop) {
            // Panel has crop: action.action_pos is local_pos (relative to crop area, starts at 0,0)
            // Canvas shows cropped image (also starts at 0,0)
            // Calculate page number within crop area
            actionPage = action.action_pos.p || Math.floor(action.action_pos.y / pageHeight) + 1;
            
            if (actionPage === currentPage) {
                // action.action_pos is already relative to crop area (starts at 0,0)
                // Canvas shows cropped image (also starts at 0,0)
                // So we just need to adjust for page offset within crop area (if crop spans multiple pages)
                relativePos = {
                    x: action.action_pos.x,
                    y: action.action_pos.y - pageYOffset, // Adjust y relative to current page in crop area
                    w: action.action_pos.w,
                    h: action.action_pos.h,
                    p: action.action_pos.p
                };
            }
        } else {
            // Panel has no crop: action.action_pos is absolute in panel
            actionPage = action.action_pos.p || Math.floor(action.action_pos.y / pageHeight) + 1;
            
            if (actionPage === currentPage) {
                // Adjust position relative to current page
                relativePos = {
                    x: action.action_pos.x,
                    y: action.action_pos.y - pageYOffset, // Adjust y coordinate relative to current page
                    w: action.action_pos.w,
                    h: action.action_pos.h,
                    p: action.action_pos.p
                };
            }
        }
        
        if (relativePos) {
            this.drawBox(relativePos, '0-' + actionIndex, 'action', action.action_name);
        }
    }
});
```

**Quy trình:**

### Panel KHÔNG crop:
1. Tính `actionPage` từ `action.action_pos.y` (absolute coordinates trong panel)
2. Chỉ vẽ actions thuộc `currentPage`
3. **Trừ page offset**: `y = action.action_pos.y - pageYOffset`
4. Vẽ box với relative position trên canvas

### Panel CÓ crop:
1. Tính `actionPage` từ `action.action_pos.y` (absolute coordinates trong crop area)
2. Chỉ vẽ actions thuộc `currentPage` (trong crop area)
3. **Trừ page offset trong crop area**: `y = action.action_pos.y - pageYOffset`
4. Vẽ box với relative position trên canvas

**Lưu ý quan trọng:**
- **Panel có crop**: Canvas hiển thị cropped image (bắt đầu từ 0,0), `action.action_pos` là `local_pos` (relative to crop area, cũng bắt đầu từ 0,0)
- **Panel không crop**: Canvas hiển thị full panel image, `action.action_pos` là absolute trong panel
- Editor nhận `panelAfterGlobalPos` để biết panel có crop hay không

---

## 3. Khi UPDATE (move/resize) box

### Code location: `panel-editor-class.js` dòng 1235-1258

```javascript
updateGeminiResult(rect) {
    const id = rect.id;
    
    // Convert relative coordinates (on current page canvas) back to absolute coordinates
    const pageHeight = 1080;
    const pageYOffset = this.currentPageIndex * pageHeight;
    
    const newPos = {
        x: Math.round(rect.left),
        y: Math.round(rect.top + pageYOffset), // Convert relative y to absolute y
        w: Math.round(rect.width * rect.scaleX),
        h: Math.round(rect.height * rect.scaleY),
        p: this.currentPageIndex + 1
    };
    
    // Update geminiResult with absolute coordinates
    if (typeof id === 'string' && id.includes('-')) {
        const [panelIdx, actionIdx] = id.split('-').map(Number);
        if (this.geminiResult[panelIdx] && this.geminiResult[panelIdx].actions[actionIdx]) {
            this.geminiResult[panelIdx].actions[actionIdx].action_pos = newPos;
        }
    }
}
```

**Quy trình:**
1. Lấy relative position từ canvas (`rect.left`, `rect.top`)
2. **Cộng lại page offset**: `y = rect.top + pageYOffset`
3. Lưu vào `geminiResult[].actions[].action_pos` với **absolute coordinates**

---

## 4. Khi SAVE actions từ editor

### Code location: `queue-page-handlers.js` dòng 1050-1107

```javascript
// Check if position changed
const posChanged =
    existing.metadata?.local_pos?.x !== newAction.action_pos.x ||
    existing.metadata?.local_pos?.y !== newAction.action_pos.y ||
    existing.metadata?.local_pos?.w !== newAction.action_pos.w ||
    existing.metadata?.local_pos?.h !== newAction.action_pos.h;

const pageNumber = newAction.action_pos.p || existing.metadata?.local_pos?.p || 1;
const pageHeight = 1080;

// Check if panel has crop
const panelCropArea = panelItem.metadata?.global_pos;

let globalX, globalY;
if (panelCropArea) {
    // Panel có crop: convert local_pos (in crop) to global_pos (in fullscreen)
    globalX = panelCropArea.x + newAction.action_pos.x;
    globalY = panelCropArea.y + newAction.action_pos.y;
} else {
    // Panel không crop: local_pos is same as global_pos, just account for page offset
    globalX = newAction.action_pos.x;
    globalY = (pageNumber - 1) * pageHeight + newAction.action_pos.y;
}

// Update action
const updateData = {
    name: newAction.action_name,
    metadata: {
        local_pos: {
            p: pageNumber,
            x: newAction.action_pos.x,
            y: newAction.action_pos.y,
            w: newAction.action_pos.w,
            h: newAction.action_pos.h
        },
        global_pos: {
            x: globalX,
            y: globalY,
            w: newAction.action_pos.w,
            h: newAction.action_pos.h
        }
    }
};
```

**Quy trình:**

### Trường hợp Panel KHÔNG crop:
1. `newAction.action_pos` từ editor là **absolute trong panel** (đã có page offset)
2. `local_pos.y` = `newAction.action_pos.y` (giữ nguyên)
3. `global_pos.y` = `(pageNumber - 1) * 1080 + newAction.action_pos.y`
   - Nếu action ở page 1: `global_pos.y = newAction.action_pos.y`
   - Nếu action ở page 2: `global_pos.y = 1080 + newAction.action_pos.y`

### Trường hợp Panel CÓ crop:
1. `newAction.action_pos` từ editor là **absolute trong crop area** (local coordinates)
2. `local_pos.y` = `newAction.action_pos.y` (giữ nguyên, đây là local trong crop)
3. `global_pos.y` = `cropArea.y + newAction.action_pos.y`
   - Không cần thêm page offset vì `cropArea.y` đã là absolute trong fullscreen

---

## 5. So sánh 2 trường hợp

### Panel KHÔNG crop:

| Bước | Giá trị `action.action_pos.y` | Ý nghĩa |
|------|-------------------------------|---------|
| Load vào editor | `local_pos.y` (ví dụ: 600) | Absolute trong panel, page 1 |
| Vẽ trên canvas | `600 - 0 = 600` | Relative to page 1 |
| User move to y=700 | `700 + 0 = 700` | Absolute trong panel |
| Save | `local_pos.y = 700`<br>`global_pos.y = 700` | Giữ nguyên |

**Nếu action ở page 2:**
| Bước | Giá trị `action.action_pos.y` | Ý nghĩa |
|------|-------------------------------|---------|
| Load vào editor | `local_pos.y` (ví dụ: 200) | Absolute trong panel, page 2 |
| Vẽ trên canvas | `(200 + 1080) - 1080 = 200` | Relative to page 2 |
| User move to y=300 | `300 + 1080 = 1380` | Absolute trong panel |
| Save | `local_pos.y = 300`<br>`global_pos.y = 1080 + 300 = 1380` | Cộng page offset |

### Panel CÓ crop:

| Bước | Giá trị `action.action_pos.y` | Ý nghĩa |
|------|-------------------------------|---------|
| Load vào editor | `local_pos.y` (ví dụ: 180) | Absolute trong crop area |
| Vẽ trên canvas | `180 - 0 = 180` | Relative to page 1 (crop area) |
| User move to y=280 | `280 + 0 = 280` | Absolute trong crop area |
| Save | `local_pos.y = 280`<br>`global_pos.y = cropArea.y + 280` | Cộng crop offset |

**Nếu crop trải dài 2 pages và action ở page 2 của crop:**
| Bước | Giá trị `action.action_pos.y` | Ý nghĩa |
|------|-------------------------------|---------|
| Load vào editor | `local_pos.y` (ví dụ: 1100) | Absolute trong crop area, page 2 |
| Vẽ trên canvas | `1100 - 1080 = 20` | Relative to page 2 (crop area) |
| User move to y=120 | `120 + 1080 = 1200` | Absolute trong crop area |
| Save | `local_pos.y = 1200`<br>`global_pos.y = cropArea.y + 1200` | Cộng crop offset |

---

## 6. Bug đã được fix

### Bug: Khung action bị lệch vị trí khi panel có crop

**Mô tả:**
- Khi panel có crop (ví dụ crop area: x=100, y=200), các khung action khi load vào panel editor bị lệch vị trí (x lệch 100, y lệch 200)

**Nguyên nhân:**
1. **Khi load actions**: Code dùng `local_pos || global_pos`, nhưng với panel có crop, nếu `local_pos` không đúng hoặc không tồn tại, sẽ dùng `global_pos` (absolute trong fullscreen) → sai
2. **Khi mở editor sau crop**: Code tạo actions dùng `global_pos` thay vì `local_pos` → sai
3. **Editor không nhận crop area**: Editor không biết panel có crop nên không xử lý đúng

**Giải pháp đã áp dụng:**

1. **Sửa code load actions** (`queue-page-handlers.js` dòng 2217-2246):
   - Với panel có crop: Luôn convert từ `global_pos` sang `local_pos` (trừ crop offset)
   - Đảm bảo `local_pos` luôn relative to crop area

2. **Pass crop area vào editor** (`queue-page-handlers.js` dòng 2248-2276, 3042-3059):
   - Thêm `panelAfterGlobalPos` khi khởi tạo editor
   - Editor biết panel có crop và xử lý đúng

3. **Sửa code vẽ** (`panel-editor-class.js` dòng 733-802):
   - Check `hasCrop` để xử lý đúng cho cả 2 trường hợp
   - Với panel có crop: `local_pos` đã đúng (relative to crop area), chỉ cần trừ page offset trong crop area

**Kết quả:**
- ✅ Khung action vẽ đúng vị trí với panel có crop
- ✅ Khung action vẽ đúng vị trí với panel không crop
- ✅ Code nhất quán và dễ maintain

---

## 7. Code references

### Files liên quan:
1. **panel-editor-class.js**:
   - Dòng 733-802: `drawAllBoxes()` - Vẽ boxes (xử lý cả panel có crop và không crop)
   - Dòng 1235-1258: `updateGeminiResult()` - Update khi move/resize
   - Dòng 799-858: `drawBox()` - Vẽ 1 box
   - Constructor: Nhận `panelAfterGlobalPos` để biết panel có crop

2. **queue-page-handlers.js**:
   - Dòng 2217-2246: Load actions vào editor (convert `global_pos` → `local_pos` nếu panel có crop)
   - Dòng 2248-2276: Mở editor với `panelAfterGlobalPos` (resume flow)
   - Dòng 2970-2988: Tạo actions sau khi crop (dùng `local_pos` thay vì `global_pos`)
   - Dòng 3042-3059: Mở editor sau khi crop (pass `panelAfterGlobalPos`)
   - Dòng 1050-1107: Save actions từ editor (convert sang `local_pos` và `global_pos`)

---

## 8. Kết luận

### Panel Editor sử dụng:
- **`action.action_pos` trong `geminiResult`**: Absolute coordinates trong hệ tọa độ tương ứng
  - **Panel không crop**: Absolute trong panel (có thể có page offset)
  - **Panel có crop**: Absolute trong crop area (chính là `local_pos`, relative to crop area)

### Khi load vào editor:
- **Panel có crop**: Luôn convert từ `global_pos` sang `local_pos` (trừ crop offset)
- **Panel không crop**: Dùng `local_pos` nếu có, nếu không thì dùng `global_pos`

### Khi vẽ:
- **Panel có crop**: `local_pos` đã relative to crop area (0,0), chỉ cần trừ page offset trong crop area
- **Panel không crop**: Convert absolute → relative cho page hiện tại: `y = absolute_y - pageYOffset`

### Khi save:
- **Panel không crop**: `global_pos.y = (pageNumber - 1) * 1080 + local_pos.y`
- **Panel có crop**: `global_pos.y = cropArea.y + local_pos.y`

### Lưu ý quan trọng:
- **Editor nhận `panelAfterGlobalPos`** để biết panel có crop hay không
- **Canvas hiển thị cropped image** khi panel có crop (bắt đầu từ 0,0)
- **`local_pos` với panel có crop** là relative to crop area (bắt đầu từ 0,0)
- **Code đã được fix** để đảm bảo khung action vẽ đúng vị trí trong cả 2 trường hợp
