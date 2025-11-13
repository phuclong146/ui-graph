# 📘 UI GRAPH TOOL - USER GUIDE v2.0 (Final)

> **Với PAGE System - 2-Step Flow**

## 🎯 Mục đích

Record lại toàn bộ flow tương tác trên web app để xuất ra database.

---

## 🆕 PAGE SYSTEM

### **Vấn đề cũ:**
- Màn hình dài (long scroll) → Ảnh bị scale down → Bounding box nhỏ xíu
- Cannot draw panel properly
- Quá nhiều actions trong 1 viewport → Khó edit

### **Giải pháp: PAGES với 2-Step Flow**

**Cấu trúc:**
```
PANEL
├── PAGE 1 (viewport: 1920x1080)
│   ├── Action 1
│   ├── Action 2
│   └── Action 3
├── PAGE 2 (viewport: 1920x1080)
│   ├── Action 4
│   └── Action 5
└── PAGE 3 (viewport: 1920x1080)
    └── Action 6
```

**2-Step Flow:**

**STEP 1: DETECT PAGES** (PANEL level)
```
User: Click PANEL → Click "🔍 Detect Pages"
Tool: 
  - Chụp full scroll screenshot
  - Auto-split thành pages (1920x1080 mỗi page)
  - Tạo pages (chỉ có screenshot, CHƯA có actions)
  - Pages status = pending
```

**STEP 2: DETECT ACTIONS** (PAGE level)
```
User: Click PAGE → Click "🔍 Detect Actions"
Tool:
  - Detect actions CHỈ trên page đó (viewport 1920x1080)
  - Giống hệt thuật toán detect actions cho panel (ver hiện tại)
  - Actions được tạo với tọa độ tuyệt đối
```

---

### **⚠️ QUAN TRỌNG: Hệ thống Tọa độ**

**PAGE có 2 types positions:**

1. **`page_pos`** (Auto-split position):
   - Vị trí của page trên full screenshot (auto-split)
   - Ví dụ: Page 2 = `{x: 0, y: 1080, w: 1920, h: 1080}`
   - Không thay đổi khi user crop

2. **`crop_pos`** (Manual crop position):
   - Vị trí crop nếu user crop page thêm 1 lần nữa
   - `null` nếu chưa crop
   - Ví dụ: User crop = `{x: 50, y: 1100, w: 800, h: 500}`

**ACTION coordinates: (p, x, y, w, h)**
- `p`: Page number (thuộc page nào)
- `x, y, w, h`: **TỌA ĐỘ TUYỆT ĐỐI** trên:
  - Full screenshot (nếu page chưa crop)
  - Cropped page (nếu page đã crop → đã trừ offset)
- Ví dụ: Action trong Page 2 (chưa crop) = `{p: 2, x: 100, y: 1100, w: 300, h: 400}`
  - `y: 1100` là tọa độ từ TOP của full image

💡 **Luôn luôn lưu tọa độ tuyệt đối! (relative to current image context)**

---

## 📝 WORKFLOW MỚI

### **BƯỚC 1: Khởi động Tool**

```bash
npm start
```

Tool mở 2 cửa sổ:
- **Tracking Browser**: Trình duyệt để tương tác
- **Queue Panel**: Bảng điều khiển quản lý

### **BƯỚC 2: Login**

1. Login vào web app
2. Tool tự tạo **"After Login Panel"** (trống, chưa có pages)

---

## 🔄 QUY TRÌNH CHÍNH (2-Step Flow)

### **Phase A: DETECT PAGES (PANEL Level)**

1. **Click chọn Panel** trong Queue Panel tree
2. **Click nút "🔍 Detect Pages"**

**Tool tự động:**
```
1. Chụp full scroll screenshot (có thể rất dài)
2. Tính toán height của screenshot
3. Auto-split thành nhiều PAGEs (mỗi page 1920x1080):
   - Page 1: y = 0 → 1080
   - Page 2: y = 1080 → 2160
   - Page 3: y = 2160 → 3240
   - ...
4. Crop từng page từ full screenshot
5. Tạo PAGE entries (chỉ có screenshot, CHƯA có actions)
   - Page status = pending (chưa detect actions)
```

**Kết quả:**
```
Product List Panel (pending)
├── 📄 Page 1 (x:0, y:0, w:1920, h:1080) (pending - no actions yet)
├── 📄 Page 2 (x:0, y:1080, w:1920, h:1080) (pending - no actions yet)
└── 📄 Page 3 (x:0, y:2160, w:1920, h:1080) (pending - no actions yet)
```

---

### **Phase B: DETECT ACTIONS (PAGE Level)**

1. **Click chọn Page** trong tree (VD: Page 1)
2. **Click nút "🔍 Detect Actions"**

**Tool tự động:**
```
1. Load screenshot của page đó (1920x1080)
2. Detect actions trên page (Gemini AI hoặc DOM Capture)
   - Thuật toán GIỐNG HỆT detect actions cho panel (ver hiện tại)
   - Viewport chuẩn: 1920x1080
3. Tạo actions với tọa độ:
   - Tọa độ detect: relative trong page viewport
   - Chuyển đổi: Tọa độ tuyệt đối trên full screenshot
   - Formula: y_absolute = page.y_start + y_relative
4. Assign actions vào page
```

**Ví dụ: Detect actions cho Page 2 (y: 1080-2160)**
```
Tool detect actions trong viewport 1920x1080 của Page 2:
  - Action "Product Card 2" detected at (x:100, y:20) TRONG PAGE
  - Convert to absolute: (x:100, y:1080+20=1100) TRÊN FULL IMAGE
  - Save: {p:2, x:100, y:1100, w:300, h:400}
```

**Kết quả:**
```
Product List Panel (pending)
├── 📄 Page 1 (pending)
├── 📄 Page 2 (completed) ✅  ← Vừa detect xong
│   ├── Product Card 2 (p:2, x:100, y:1100, w:300, h:400) (pending)
│   └── Product Card 3 (p:2, x:450, y:1520, w:300, h:400) (pending)
└── 📄 Page 3 (pending - no actions yet)
```

**🆕 (Optional) EDIT & CROP PAGE:**

Sau khi detect actions, có thể edit hoặc crop page nếu cần:

```
Click Page → "✏️ Edit Actions"
→ Editor mở với toolbar: [✂️ Crop] [➕ Add Action] [💾 Save] [❌ Cancel]
→ Có thể:
  - Thêm/sửa/xóa actions manually
  - Crop page để focus vào vùng nhỏ hơn (xóa actions outside, adjust coordinates)

⚠️ Chi tiết workflow xem section "✂️ CROP PAGE WORKFLOW" bên dưới
```

**Reset Page:**
```
Click Page → "🔄 Reset" 
→ XÓA TẤT CẢ actions + crop_pos
→ Page về "pending - no actions yet"
→ Phải "🔍 Detect Actions" lại từ đầu
```

3. **Lặp lại** cho tất cả pages còn lại

---

### **Phase C: TƯƠNG TÁC VỚI ACTION**

1. **Expand Page** trong tree để thấy actions
2. **Click chọn Action** (VD: "Product Card 2" trong Page 2)
3. **Tương tác trên Tracking Browser:**
   - Scroll đến đúng vị trí (y=1100 tuyệt đối)
   - Click vào element
   - Page chuyển sang Product Detail

---

### **Phase D: VẼ PANEL MỚI**

#### **Option 1: DRAW NEW PANEL** (Ctrl+1)

1. Click nút **"📝 Draw Panel"** → **"DRAW NEW"** (hoặc Ctrl+1)
2. **Tool tự động:**
   ```
   1. Chụp full scroll screenshot của page mới
   2. ⚠️ KHÔNG crop - chỉ preview + Save/Cancel (confirmOnly mode)
   3. Click Save → Tạo panel mới (trống, chưa có pages)
   4. Tạo STEP link
   ```
3. Panel mới → Quay lại **Phase A** (Detect Pages → Detect Actions → Crop nếu cần)

**Lưu ý:**
- ✅ Ctrl+1 KHÔNG cần vẽ crop area ngay
- ✅ Chụp full màn hình → Save ngay
- ✅ Crop sau khi detect actions (ở PAGE level)

#### **Option 2: USE BEFORE** (Ctrl+2)
- Action marked done
- Không tạo panel mới

---

## ✂️ CROP PAGE WORKFLOW (Optional)

### **Khi nào cần crop page?**
- Page có quá nhiều actions → Chỉ focus vào vùng quan tâm
- Loại bỏ header/footer/sidebar không cần thiết
- Zoom vào 1 khu vực cụ thể để dễ làm việc

### **Điều kiện:**
Page phải đã detect actions (status = completed hoặc pending với actions)

---

### **Workflow:**

**BƯỚC 1: Mở Editor**
```
Click Page trong tree → Click "✏️ Edit"

Editor hiển thị:
- Page screenshot (1920x1080)
- Tất cả actions hiện tại (bounding boxes)
- Toolbar: [✂️ Crop (OFF)] [➕ Add Action] [💾 Save] [❌ Cancel]
```

**BƯỚC 2: Enable Crop Mode**
```
Click "✂️ Crop (OFF)" → Toggle thành "✂️ Crop (ON)"

Crop mode activated:
- Canvas disabled (không click được vào actions/buttons)
- Green rectangle crop box xuất hiện
- Kéo để chọn vùng crop
- ESC để cancel crop
```

**BƯỚC 3: Draw Crop Area**
```
Kéo chuột để vẽ green rectangle

⚠️ Crop box bị LOCKED trong border đỏ:
- Không thể kéo ra ngoài 4 cạnh
- Border đỏ là căn cứ chuẩn (padding 1.5px)
```

**BƯỚC 4: Confirm Crop**
```
Thả chuột → Popup hiển thị:
"Lưu crop này?

Sẽ xóa X/Y actions nằm ngoài vùng crop.

OK = Lưu
Cancel = Hủy"
```

**BƯỚC 5: Tool Xử Lý**
```javascript
Tool tự động:

1. Filter actions:
   FOR EACH action:
     IF action completely INSIDE crop area:
       → Giữ lại
     ELSE:
       → Xóa khỏi database

2. Adjust coordinates (trừ crop offset):
   FOR EACH kept action:
     action.x = action.x - crop.x
     action.y = action.y - crop.y
     // w, h không đổi

3. Update page:
   - Crop image từ full screenshot
   - Lưu cropped image (width x height mới)
   - Lưu crop_pos: {x, y, w, h} (vị trí crop trên full image)
   - Update actions trong database

4. Broadcast update:
   - Auto-reload UI
   - Page hiển thị cropped image
   - Actions với tọa độ mới
```

**BƯỚC 6: Editor tự đóng**
```
Crop done → Editor close
→ UI reload với cropped image + adjusted actions
```

---

### **Ví dụ Crop:**

**BEFORE CROP:**
```
Page 2: Full screenshot (1920x1080)
Actions:
- Header Logo (x:50, y:20, w:200, h:50)
- Product Card 2 (x:100, y:200, w:300, h:400)
- Product Card 3 (x:450, y:200, w:300, h:400)
- Footer Links (x:100, y:1000, w:1720, h:50)
```

**User crop area: (x:50, y:150, w:800, h:500)**

**Tool filter:**
```
- Header Logo (y:20) → y+h = 70 < crop.y(150) → OUTSIDE → Xóa
- Product Card 2 (x:100, y:200) → INSIDE → Giữ
- Product Card 3 (x:450, y:200) → INSIDE → Giữ
- Footer Links (y:1000) → y > crop.y+crop.h(650) → OUTSIDE → Xóa
```

**Tool adjust coordinates:**
```
Crop offset: (x:50, y:150)

Product Card 2:
  old: (x:100, y:200, w:300, h:400)
  new: (x:50, y:50, w:300, h:400)  ← Trừ offset

Product Card 3:
  old: (x:450, y:200, w:300, h:400)
  new: (x:400, y:50, w:300, h:400)  ← Trừ offset
```

**AFTER CROP:**
```
Page 2: Cropped image (800x500)
crop_pos: {x:50, y:150, w:800, h:500}
Actions:
- Product Card 2 (x:50, y:50, w:300, h:400)
- Product Card 3 (x:400, y:50, w:300, h:400)
```

---

### **Reset Page (Undo Crop):**

Nếu crop sai hoặc muốn về lại full screenshot:

```
Click Page → Click "🔄 Reset"

Tool thực hiện:
1. XÓA TẤT CẢ child actions của page
2. Xóa crop_pos (set = null)
3. Restore full page screenshot (1920x1080)
4. Set page status = 'pending - no actions yet'

→ Page về trạng thái sạch hoàn toàn
→ Phải "🔍 Detect Actions" lại để detect từ đầu
```

**Workflow sau Reset:**
```
1. Reset page → All actions deleted, full screenshot restored, crop_pos = null
2. Page status = "pending - no actions yet"
3. Click "🔍 Detect Actions" → Detect lại từ đầu trên full image
4. Tool detect actions mới với tọa độ chính xác
```

---

### **⚠️ LƯU Ý QUAN TRỌNG:**

**Crop Mode:**
- ✅ Bounding box bị lock trong border đỏ (padding 1.5px)
- ✅ Không thể click vào actions/buttons khi crop mode ON (obj.evented = false)
- ❌ Crop sẽ XÓA VĨNH VIỄN actions outside → Review kỹ trước khi confirm!

**Add Action Mode:**
- ✅ Draw bounding box cũng locked trong border đỏ
- ✅ Tọa độ tuyệt đối trên current image (cropped hoặc full)

**Hệ thống Tọa độ sau Crop:**
```
BEFORE CROP: 
- Actions có tọa độ absolute trên full page (1920x1080)

AFTER CROP: 
- Actions có tọa độ absolute trên CROPPED page (wxh mới)
- Tất cả tọa độ đã trừ đi crop offset

⚠️ Không thể undo crop! Chỉ có thể Reset và detect lại.
```

**Best Practices:**
1. ✅ Detect actions trước, crop sau
2. ✅ Review actions trước khi crop (đảm bảo không mất actions quan trọng)
3. ✅ Crop vừa đủ (không crop quá nhỏ)
4. ❌ KHÔNG crop trước khi detect actions
5. ❌ KHÔNG crop nếu không chắc chắn

---

## 🌳 PANEL TREE (3 TẦNG)

```
📊 PANELS (Tầng 1 - Flat)
├── After Login Panel (pending)
│   ├── 📄 Page 1 (Tầng 2) (completed) ✅
│   │   ├── Search Bar (Tầng 3) (pending)
│   │   └── Menu: Products (Tầng 3) (completed) ✅
│   └── 📄 Page 2 (Tầng 2) (pending - no actions yet)
│
├── Product List Panel (pending)
│   ├── 📄 Page 1 (Tầng 2) (completed) ✅
│   │   ├── Filter Button (Tầng 3) (completed) ✅
│   │   └── Product Card 1 (Tầng 3) (completed) ✅
│   ├── 📄 Page 2 (Tầng 2) (completed) ✅
│   │   ├── Product Card 2 (Tầng 3) (pending)
│   │   └── Product Card 3 (Tầng 3) (pending)
│   └── 📄 Page 3 (Tầng 2) (pending - no actions yet)
│
└── Product Detail Panel (pending)
    └── 📄 Page 1 (Tầng 2) (completed) ✅
        ├── Add to Cart (Tầng 3) (pending)
        └── View Reviews (Tầng 3) (pending)
```

**⚠️ CHÚ Ý:**
- ✅ Tất cả PANELs là SIBLINGS (tầng 1)
- ✅ Mỗi PANEL có pages (tầng 2)
- ✅ Mỗi PAGE có actions (tầng 3)
- ⚠️ Page có thể "pending - no actions yet" (chưa detect actions)

---

## 📊 HỆ THỐNG STATUS

### **ACTION Status:**

**✅ Khi nào COMPLETED?**
- DRAW NEW PANEL: Action → Panel mới → `completed`
- USE BEFORE: Action → Same panel → `completed`

**⏳ Khi nào PENDING?**
- Action vừa được detect
- Chưa click "Draw Panel"

---

### **PAGE Status:**

**✅ Khi nào COMPLETED?**
```
TẤT CẢ actions trong page đều completed
```

**⏳ Khi nào PENDING?**
- Page vừa được tạo (chưa detect actions) → "pending - no actions yet"
- Page đã detect actions nhưng có action chưa completed → "pending"

---

### **PANEL Status:**

**✅ Khi nào COMPLETED?**
```
TẤT CẢ pages đều completed
```

**⏳ Khi nào PENDING?**
- Panel vừa được tạo (chưa detect pages)
- Có ít nhất 1 page chưa completed

---

### **Auto-Update Logic:**

```
ACTION completed
    → Check PAGE status
    → Nếu all actions trong page completed
        → Page status = completed ✅
    
PAGE completed
    → Check PANEL status
    → Nếu all pages completed
        → Panel status = completed ✅
```

---

## 🔗 FLOW RELATIONSHIPS

Flow vẫn lưu trong **STEP:**

```
STEP: Panel A → Action (in Page X) → Panel B
```

**Ví dụ:**
```
STEP 1: After Login Panel → "Search Bar" (Page 1) → Search Results Panel
STEP 2: Search Results Panel → "Product Card 1" (Page 1) → Product Detail Panel
```

---

## 🎥 AUTO-SPLIT LOGIC

### **Detect Pages Algorithm:**

```javascript
function detectPages(fullScreenshot) {
  const height = fullScreenshot.height; // VD: 2800px
  const PAGE_HEIGHT = 1080;
  const pages = [];
  
  let currentY = 0;
  let pageNumber = 1;
  
  while (currentY < height) {
    const pageHeight = Math.min(PAGE_HEIGHT, height - currentY);
    
    // Crop page từ full screenshot
    const pageCrop = {
      x: 0,
      y: currentY,
      w: 1920,
      h: pageHeight
    };
    
    const pageScreenshot = cropImage(fullScreenshot, pageCrop);
    
    // Tạo page entry (CHƯA có actions)
    pages.push({
      page_number: pageNumber,
      x: 0,
      y: currentY,
      w: 1920,
      h: pageHeight,
      screenshot: pageScreenshot,
      status: 'pending' // Chưa detect actions
    });
    
    currentY += PAGE_HEIGHT;
    pageNumber++;
  }
  
  return pages;
}
```

### **Detect Actions for Page Algorithm:**

```javascript
// GIỐNG HỆT thuật toán detect actions cho panel (ver hiện tại)
function detectActionsForPage(page) {
  const pageScreenshot = page.screenshot; // 1920x1080 viewport
  
  // 1. Detect actions trong page viewport (Gemini AI / DOM Capture)
  const actionsInPage = detectActions(pageScreenshot); // [{x, y, w, h}, ...]
  
  // 2. Convert tọa độ từ page-relative → absolute
  const absoluteActions = actionsInPage.map(action => ({
    page_number: page.page_number,
    x: action.x, // x không thay đổi (full width)
    y: page.y + action.y, // ← Convert to absolute: page_start_y + action_y_in_page
    w: action.w,
    h: action.h
  }));
  
  return absoluteActions;
}
```

**Ví dụ:**
```
Page 2: {x:0, y:1080, w:1920, h:1080}

Detect actions trong Page 2 viewport:
  - Action detected at (x:100, y:20, w:300, h:400) TRONG PAGE
  
Convert to absolute:
  - x: 100 (no change)
  - y: 1080 + 20 = 1100 ← Absolute coordinate
  - w: 300
  - h: 400
  
Saved: {p:2, x:100, y:1100, w:300, h:400}
```

---

## 💡 TIPS & BEST PRACTICES

### ✅ **Nên:**

1. **Workflow tuần tự:**
   - Step 1: Detect Pages cho panel
   - Step 2: Detect Actions cho TỪNG page
   - Step 3: Process actions

2. **Check Pages:**
   - Sau "Detect Pages" → Scroll qua từng page screenshot
   - Verify pages đã split đúng

3. **Detect Actions từng page:**
   - Không cần detect hết pages cùng lúc
   - Focus vào page đang làm việc

4. **Manually add missing actions:**
   - Nếu có actions thiếu → Edit Actions
   - Add với tọa độ tuyệt đối

### ❌ **Không nên:**

- Bỏ qua pages (phải detect actions cho tất cả)
- Quên convert tọa độ thành absolute
- Detect actions trước khi detect pages

---

## 🚀 WORKFLOW NHANH

```
1. Login → Tool tạo root panel (trống)

2. Click Panel → "Detect Pages"
   → Tool auto-split pages (screenshots only, no actions)

3. Loop từng Page:
   a. Click Page → "Detect Actions"
      → Page có actions (tọa độ tuyệt đối)
   b. Click Action → Interact trên browser
   c. Nếu UI thay đổi → Draw New Panel (trống)
      → Quay bước 2 cho panel mới
      Nếu không → Use Before

4. Export khi all panels completed ✅
```

---

## 📊 VISUAL SUMMARY

### **Buttons:**

**PANEL Level:**
```
[Panel] → 🔍 Detect Pages
       → Tạo pages (screenshots only)
```

**PAGE Level:**
```
[Page] → 🔍 Detect Actions
      → Page có actions (giống panel cũ)
```

**ACTION Level:**
```
[Action] → 📝 Draw Panel / USE BEFORE
        → Tạo panel mới hoặc mark done
```

---

## 🎬 VÍ DỤ THỰC TẾ: E-Commerce

### **1. After Login → Detect Pages**

```
User: Login vào web
Tool: Tạo "After Login Panel" (trống)

User: Click "After Login Panel" → Click "🔍 Detect Pages"
Tool: 
  - Chụp screenshot → Height = 1200px
  - Auto-split: 2 PAGES
    - Page 1: (x:0, y:0, w:1920, h:1080)
    - Page 2: (x:0, y:1080, w:1920, h:120)
  - Tạo 2 pages (chỉ có screenshots, chưa có actions)

After Login Panel (pending)
├── 📄 Page 1 (x:0, y:0, w:1920, h:1080) (pending - no actions yet)
└── 📄 Page 2 (x:0, y:1080, w:1920, h:120) (pending - no actions yet)
```

---

### **2. Detect Actions cho Page 1**

```
User: Click "Page 1" → Click "🔍 Detect Actions"

Tool:
  - Load Page 1 screenshot (viewport 1920x1080)
  - Detect actions (Gemini AI / DOM Capture)
  - Detected in page viewport:
    - Search Bar at (x:100, y:50, w:400, h:40)
    - Category Menu at (x:50, y:120, w:200, h:40)
    - User Avatar at (x:1700, y:1000, w:150, h:50)
  - Convert to absolute (y_absolute = 0 + y_in_page):
    - Search Bar: {p:1, x:100, y:50, w:400, h:40}
    - Category Menu: {p:1, x:50, y:120, w:200, h:40}
    - User Avatar: {p:1, x:1700, y:1000, w:150, h:50}

After Login Panel (pending)
├── 📄 Page 1 (completed) ✅
│   ├── Search Bar (p:1, x:100, y:50, w:400, h:40) (pending)
│   ├── Category Menu (p:1, x:50, y:120, w:200, h:40) (pending)
│   └── User Avatar (p:1, x:1700, y:1000, w:150, h:50) (pending)
└── 📄 Page 2 (pending - no actions yet)
```

---

### **3. Detect Actions cho Page 2**

```
User: Click "Page 2" → Click "🔍 Detect Actions"

Tool:
  - Load Page 2 screenshot (viewport 1920x120 - short page)
  - Detect actions
  - Detected: Footer Links at (x:50, y:20, w:1800, h:50)
  - Convert to absolute (y_absolute = 1080 + 20 = 1100):
    - Footer Links: {p:2, x:50, y:1100, w:1800, h:50}

After Login Panel (pending)
├── 📄 Page 1 (completed) ✅
│   ├── Search Bar (pending)
│   ├── Category Menu (pending)
│   └── User Avatar (pending)
└── 📄 Page 2 (completed) ✅
    └── Footer Links (p:2, x:50, y:1100, w:1800, h:50) (pending)
```

---

### **4. Click "Search Bar" → Draw New**

```
User: Click "Search Bar" (Page 1)
User: Type "laptop" → Press Enter
User: Draw New Panel → Crop search results area

Tool: Tạo "Search Results Panel" (trống)

Panels:
├── After Login Panel (pending)
│   ├── 📄 Page 1 (completed) ✅
│   │   ├── Search Bar (completed) ✅  ← Vừa draw panel
│   │   ├── Category Menu (pending)
│   │   └── User Avatar (pending)
│   └── 📄 Page 2 (completed) ✅
│       └── Footer Links (pending)
│
└── Search Results Panel (pending) ← Panel mới (trống, chưa có pages)
```

---

### **5. Detect Pages cho Search Results Panel**

```
User: Click "Search Results Panel" → "🔍 Detect Pages"

Tool:
  - Chụp full scroll → Height = 3400px (LONG!)
  - Auto-split: 4 PAGES
    - Page 1: (x:0, y:0, w:1920, h:1080)
    - Page 2: (x:0, y:1080, w:1920, h:1080)
    - Page 3: (x:0, y:2160, w:1920, h:1080)
    - Page 4: (x:0, y:3240, w:1920, h:160)

Search Results Panel (pending)
├── 📄 Page 1 (pending - no actions yet)
├── 📄 Page 2 (pending - no actions yet)
├── 📄 Page 3 (pending - no actions yet)
└── 📄 Page 4 (pending - no actions yet)
```

---

### **6. Detect Actions cho từng Page**

```
User: Click "Page 1" → "🔍 Detect Actions"
Tool: Detect → 2 actions

User: Click "Page 2" → "🔍 Detect Actions"
Tool: Detect → 2 actions

User: Click "Page 3" → "🔍 Detect Actions"
Tool: Detect → 2 actions

User: Click "Page 4" → "🔍 Detect Actions"
Tool: Detect → 1 action

Search Results Panel (pending)
├── 📄 Page 1 (completed) ✅
│   ├── Filter Button (p:1, x:50, y:50, w:150, h:40) (pending)
│   └── Product Card 1 (p:1, x:100, y:200, w:300, h:400) (pending)
├── 📄 Page 2 (completed) ✅
│   ├── Product Card 2 (p:2, x:100, y:1100, w:300, h:400) (pending)
│   └── Product Card 3 (p:2, x:450, y:1520, w:300, h:400) (pending)
├── 📄 Page 3 (completed) ✅
│   ├── Product Card 4 (p:3, x:100, y:2200, w:300, h:400) (pending)
│   └── Product Card 5 (p:3, x:450, y:2650, w:300, h:400) (pending)
└── 📄 Page 4 (completed) ✅
    └── Load More (p:4, x:100, y:3300, w:200, h:50) (pending)
```

---

### **Final Result:**

**Panel Tree:**
```
📊 2 PANELS
├── After Login Panel (completed) ✅
│   ├── 📄 Page 1 (3 actions)
│   └── 📄 Page 2 (1 action)
│
└── Search Results Panel (pending)
    ├── 📄 Page 1 (2 actions)
    ├── 📄 Page 2 (2 actions)
    ├── 📄 Page 3 (2 actions)
    └── 📄 Page 4 (1 action)
```

**Flow Graph (STEP):**
```
After Login (Page 1) --"Search Bar"--> Search Results
```

---

## 💾 DATA STRUCTURE

### **doing_item.jsonl:**

```javascript
// PANEL (chứa pages)
{
  item_id: "panel_123",
  item_category: "PANEL",
  name: "Search Results Panel",
  image_base64: "...", // Full scroll screenshot
  metadata: {
    full_height: 3400,
    pages: [
      {page_number: 1, x: 0, y: 0, w: 1920, h: 1080},
      {page_number: 2, x: 0, y: 1080, w: 1920, h: 1080},
      {page_number: 3, x: 0, y: 2160, w: 1920, h: 1080},
      {page_number: 4, x: 0, y: 3240, w: 1920, h: 160}
    ]
  },
  status: "pending"
}

// PAGE (subset của panel, có screenshot riêng)
{
  item_id: "page_456",
  item_category: "PAGE",
  parent_panel_id: "panel_123",
  page_number: 2,
  image_base64: "...", // Page screenshot (có thể cropped nếu user crop)
  page_pos: {x: 0, y: 1080, w: 1920, h: 1080}, // Vị trí auto-split trên full screenshot
  crop_pos: null, // Manual crop position (nếu user crop page sau đó)
  // Ví dụ nếu user crop: {x: 50, y: 1100, w: 800, h: 500}
  status: "pending"
}

// ACTION (thuộc page, tọa độ tuyệt đối)
{
  item_id: "action_789",
  item_category: "ACTION",
  type: "button",
  name: "Product Card 2",
  parent_page_id: "page_456",
  metadata: {
    page_number: 2,
    x: 100,
    y: 1100,  // ← Tọa độ TUYỆT ĐỐI trên full screenshot
    w: 300,
    h: 400
  },
  status: "pending"
}
```

### **myparent_panel.jsonl:**

```javascript
{
  parent_panel: "panel_123",
  pages: [
    {
      page_number: 1,
      page_id: "page_123",
      child_actions: ["action_001", "action_002"]
    },
    {
      page_number: 2,
      page_id: "page_456",
      child_actions: ["action_789", "action_012"]
    }
  ]
}
```

---

**HOÀN CHỈNH! Ready để implement!** 🎉

**Key Points:**
- ✅ 2-Step Flow: Detect Pages → Detect Actions (per page)
- ✅ Thuật toán detect actions giống hệt panel cũ
- ✅ Tọa độ tuyệt đối (convert từ page-relative)
- ✅ PAGE là entity mới (có screenshot riêng, status riêng)
