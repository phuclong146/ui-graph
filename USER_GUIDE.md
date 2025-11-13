# 📘 HƯỚNG DẪN SỬ DỤNG UI GRAPH TOOL

> **User Guide - Hướng dẫn từ góc nhìn người dùng**

## 🎯 Mục đích

Record lại toàn bộ flow tương tác trên web app để xuất ra database.

---

## 📝 WORKFLOW THỰC TẾ

### **BƯỚC 1: Khởi động Tool**

```bash
npm start
```

Tool sẽ mở 2 cửa sổ:
- **Tracking Browser**: Trình duyệt để tương tác với web
- **Queue Panel**: Bảng điều khiển để quản lý flow

### **BƯỚC 2: Login vào Web**

1. Trong Tracking Browser, login vào web app cần record
2. Tool tự tạo **"After Login Panel"** (panel gốc)
3. Queue Panel hiển thị panel này trong tree

---

## 🔄 QUY TRÌNH CHÍNH

*Lặp lại cho mọi tính năng cần record*

### **Phase A: DETECT ACTIONS trên Panel hiện tại**

1. **Click chọn Panel** trong Queue Panel tree
2. **Click nút "🔍 Detect Actions"**
   - Tool quét toàn bộ page
   - Tìm tất cả button, link, input, dropdown...
   - Vẽ bounding box xanh lên mỗi action
3. **Review kết quả:**
   - Nếu OK → Xong phase này
   - Nếu sai → Click **"✏️ Edit Actions"**:
     - Add/Delete/Rename actions
     - Adjust bounding box (kéo/resize)
     - Save

**Ví dụ:** "After Login Panel" có 10 actions: Menu items, search bar, user avatar, etc.

---

### **Phase B: TƯƠNG TÁC VỚI ACTION**

1. **Click chọn Action** trong Queue Panel tree (VD: "Product List Menu")
2. **Tương tác trên Tracking Browser:**
   - Click vào menu đó
   - Page chuyển sang Product List
3. Tool đang recording click của bạn (timestamp, vị trí...)

---

### **Phase C: VẼ PANEL MỚI** 

Khi có UI thay đổi, bạn có 2 lựa chọn:

#### **Option 1: DRAW NEW PANEL** (Ctrl+1)

**Khi nào dùng:** UI thay đổi (page mới, popup, sidebar...)

**Các bước:**

1. Click nút **"📝 Draw Panel"** → Chọn **"DRAW NEW"**
2. Tool chụp screenshot
3. **Kéo khung chữ nhật** quanh vùng UI mới:
   - VD: Toàn bộ product list area
   - VD: Chỉ cart popup
   - VD: Sidebar filter
4. Panel mới được tạo **cùng tầng** với panel cũ (sibling)
5. Tool tự động tạo **STEP link**: `After Login Panel → Action → Product List Panel`

**Kết quả trong Queue Panel:**

```
📊 PANEL LIST
├── After Login Panel
│   ├── Search Bar (action)
│   ├── Product List Menu (action) ← Vừa click cái này
│   └── User Avatar (action)
│
└── Product List Panel ← Panel mới (SIBLING, không phải child!)
    └── (chưa có actions - cần detect)
```

#### **Option 2: USE BEFORE** (Ctrl+2)

**Khi nào dùng:** UI không đổi, action chỉ là interaction

**Ví dụ:**
- Click "Sort by Price" → Không có panel mới, chỉ re-sort
- Click "Next Page" pagination → Vẫn product list
- Click "Toggle Dark Mode" → UI thay đổi nhưng không cần panel mới

**Kết quả:**
- Chọn **"USE BEFORE"** → Action marked done, không tạo panel mới
- Tool tạo STEP: `Current Panel → Action → Current Panel` (same)

---

### **Phase D: LẶP LẠI CHO PANEL MỚI**

1. **Panel mới → Quay lại Phase A** (Detect Actions)
2. Mỗi action → **Phase B** (Interact) → **Phase C** (Draw Panel hoặc Use Before)
3. Cứ thế build thêm panels và actions

---

## 🌳 KẾT QUẢ: PANEL TREE (2 TẦNG)

### **Trong Queue Panel, bạn thấy:**

```
📊 PANELS (Flat List - Tất cả cùng tầng)
├── After Login Panel
│   ├── Search Bar (action)
│   ├── Menu: Products (action)
│   ├── Menu: Profile (action)
│   └── User Avatar (action)
│
├── Search Results Panel
│   ├── Filter Button (action)
│   ├── Product Card 1 (action)
│   ├── Product Card 2 (action)
│   └── Load More (action)
│
├── Filter Sidebar Panel
│   ├── Category Filter (action)
│   ├── Price Range (action)
│   └── Apply Button (action)
│
├── Product Detail Panel
│   ├── Add to Cart (action)
│   ├── View Reviews (action)
│   └── Back Button (action)
│
├── Cart Popup Panel
│   ├── Checkout (action)
│   ├── Continue Shopping (action)
│   └── Remove Item (action)
│
├── Checkout Page Panel
│   ├── Payment Method (action)
│   ├── Apply Coupon (action)
│   └── Place Order (action)
│
└── Profile Panel
    ├── Edit Info (action)
    ├── Change Password (action)
    └── Logout (action)
```

### **⚠️ CHÚ Ý:**

- ✅ Tất cả PANELs là **SIBLINGS** (cùng tầng)
- ✅ Chỉ ACTIONs mới nested **1 tầng** dưới panel
- ❌ KHÔNG có panel con (child panel)

---

## 📊 HỆ THỐNG STATUS

Tool tự động quản lý trạng thái `pending` và `completed` cho cả PANEL và ACTION.

### **ACTION Status:**

#### **✅ Khi nào ACTION được mark COMPLETED?**

ACTION được tự động mark `completed` khi bạn:

1. **DRAW NEW PANEL** (Ctrl+1):
   ```
   User clicks action → Draw panel mới → Action status = completed
   ```

2. **USE BEFORE** (Ctrl+2):
   ```
   User clicks action → Không tạo panel → Action status = completed
   ```

**Ví dụ:**
```
Product List Panel
├── Filter Button (pending) ← Click action này
│   
User chọn "DRAW NEW" → Filter Sidebar Panel được tạo
→ Filter Button status → completed ✅
```

#### **⏳ Khi nào ACTION là PENDING?**

- ACTION vừa được detect
- Chưa click "Draw Panel" hoặc "Use Before"

### **PANEL Status:**

#### **✅ Khi nào PANEL được mark COMPLETED?**

PANEL tự động mark `completed` khi:

```
TẤT CẢ child actions đều completed
```

**Ví dụ:**
```
Product List Panel (pending)
├── Filter Button (completed) ✅
├── Product Card 1 (completed) ✅
├── Product Card 2 (pending) ⏳  ← Còn cái này chưa done
└── Load More (completed) ✅

→ Panel vẫn pending vì Product Card 2 chưa completed
```

**Khi Product Card 2 completed:**
```
Product List Panel (completed) ✅  ← Auto-update!
├── Filter Button (completed) ✅
├── Product Card 1 (completed) ✅
├── Product Card 2 (completed) ✅
└── Load More (completed) ✅
```

#### **⏳ Khi nào PANEL là PENDING?**

- PANEL vừa được tạo (chưa detect actions)
- Có ít nhất 1 child action chưa completed

### **Auto-Update Logic:**

Tool tự động kiểm tra và update PANEL status:

```
Mỗi khi ACTION completed
    → Tool check parent PANEL
    → Nếu ALL child actions completed
        → Panel auto-mark completed ✅
```

**Không cần manual mark!** Tool tự động quản lý.

### **Visual Status Indicators:**

Trong Queue Panel tree, bạn sẽ thấy:

```
📊 PANEL LIST
├── After Login Panel ✅ (completed - all actions done)
│   ├── Search Bar ✅
│   ├── Menu: Products ✅
│   └── User Avatar ✅
│
├── Search Results Panel ⏳ (pending - có actions chưa done)
│   ├── Filter Button ✅
│   ├── Product Card 1 ⏳  ← Chưa done
│   └── Product Card 2 ⏳  ← Chưa done
│
└── Product Detail Panel ✅ (completed)
    ├── Add to Cart ✅
    └── View Reviews ✅
```

### **Best Practice:**

1. **Hoàn thành từng Panel một:**
   - Detect all actions
   - Process tất cả actions (Draw Panel hoặc Use Before)
   - Đợi Panel auto-mark completed ✅

2. **Tracking Progress:**
   - Panel completed = Đã record xong panel đó
   - Panel pending = Còn actions chưa xử lý

3. **Export Ready:**
   - Tất cả PANELs completed → Flow đầy đủ → Sẵn sàng export!

---

## 🔗 FLOW RELATIONSHIPS

Mặc dù tree chỉ 2 tầng, nhưng **FLOW được lưu riêng trong STEP:**

```
STEP 1: After Login Panel → "Search Bar" → Search Results Panel
STEP 2: Search Results Panel → "Filter Button" → Filter Sidebar Panel
STEP 3: Filter Sidebar Panel → "Apply Button" → Search Results Panel (back)
STEP 4: Search Results Panel → "Product Card 1" → Product Detail Panel
STEP 5: Product Detail Panel → "Add to Cart" → Cart Popup Panel
STEP 6: Cart Popup Panel → "Checkout" → Checkout Page Panel
STEP 7: Checkout Page Panel → "Place Order" → Order Success Panel
...
```

→ **Flow graph riêng biệt**, không hiển thị trực tiếp trong tree!

---

## 🎥 USER INTERACTIONS ĐƯỢC GHI LẠI

Tool tự động record:

- ✅ Mỗi lần bạn click action
- ✅ Vị trí click (x, y)
- ✅ Timestamp
- ✅ Element clicked
- ✅ URL lúc đó

→ Dữ liệu này dùng để validate flow sau này

---

## 💾 EXPORT

Khi done recording:

```bash
# Tool tự export ra MySQL database
```

**Database chứa:**
- Tất cả panels với screenshots (flat table)
- Tất cả actions với bounding boxes
- Flow links trong STEP table: `Panel A → Action → Panel B`
- Click history

---

## 💡 TIPS & BEST PRACTICES

### ✅ **Nên:**

- Detect Actions trước khi tương tác
- Crop panel sát vùng quan tâm (không quá rộng)
- Đặt tên action rõ ràng
- Dùng USE BEFORE cho actions không thay đổi UI
- Hiểu rằng: Panel list là flat (không có hierarchy)

### ❌ **Không nên:**

- Skip detect actions
- Crop toàn màn hình (quá rộng)
- Quên save edits
- Tưởng panels có parent-child (sai!)

---

## 🚀 WORKFLOW NHANH

```
1. Login → Tool tạo root panel

2. Click "Detect Actions" → Panel có list actions

3. Loop:
   a. Click action trong tree
   b. Click action trên browser
   c. Nếu UI thay đổi → Draw New Panel (crop vùng mới)
      → Panel mới xuất hiện CÙNG TẦNG với panel cũ
      → Tool tự tạo STEP link
      Nếu không → Use Before
      → Tool tạo STEP về chính panel đó
   d. Panel mới → Detect Actions (quay lại bước 2)

4. Export khi done
```

---

## 📊 VISUAL SUMMARY

### **Queue Panel Tree (UI):**

```
PANELS (All siblings)
├─ Panel A
│  ├─ Action 1
│  └─ Action 2
├─ Panel B
│  └─ Action 3
└─ Panel C
   └─ Action 4
```

### **Flow Graph (Data - không hiện trên UI):**

```
Panel A --Action 1--> Panel B
Panel B --Action 3--> Panel C
Panel C --Action 4--> Panel A
```

**⚠️ Hai cái này RIÊNG BIỆT!**

- **Tree**: Hiển thị structure (2 tầng flat)
- **Flow**: Lưu relationships (trong database STEP)

---

## 🎬 VÍ DỤ THỰC TẾ: E-Commerce Flow

### Scenario: Record shopping flow

**1. After Login → Detect Actions**
```
User: Login vào web
Tool: Tạo "After Login Panel"

User: Click "🔍 Detect Actions"
Tool: Detect được 4 actions

After Login Panel (pending)
├── Search Bar (pending)
├── Category Menu (pending)
├── Product List (pending)
└── User Profile (pending)
```

**2. User clicks "Search Bar" → Type "laptop" → Draw New → Detect Actions**
```
User: Click "Search Bar" trong tree
User: Type "laptop" trên browser → Press Enter
User: Click "📝 Draw Panel" → "DRAW NEW" → Crop search results area
Tool: Tạo "Search Results Panel"

User: Click "🔍 Detect Actions" trên panel mới
Tool: Detect được 3 actions

Panels:
├── After Login Panel
│   ├── Search Bar (completed) ✅  ← Đã draw panel
│   ├── Category Menu (pending)
│   ├── Product List (pending)
│   └── User Profile (pending)
│
└── Search Results Panel (pending) ← MỚI
    ├── Product Card 1 (pending)
    ├── Product Card 2 (pending)
    └── Filter Button (pending)
```

**3. User clicks "Product Card 1" → Draw New → Detect Actions**
```
User: Click "Product Card 1"
User: Click product trên browser
User: Draw panel mới → Crop product detail area
Tool: Tạo "Product Detail Panel"

User: Detect Actions
Tool: Detect được 3 actions

Panels:
├── After Login Panel
├── Search Results Panel
│   ├── Product Card 1 (completed) ✅
│   ├── Product Card 2 (pending)
│   └── Filter Button (pending)
│
└── Product Detail Panel (pending) ← MỚI
    ├── Add to Cart (pending)
    ├── Buy Now (pending)
    └── View Reviews (pending)
```

**4. User clicks "Add to Cart" → Cart popup appears → Draw New → Detect Actions**
```
User: Click "Add to Cart"
User: Click button trên browser → Cart popup xuất hiện
User: Draw panel → Crop popup
Tool: Tạo "Cart Popup Panel"

User: Detect Actions
Tool: Detect được 3 actions

Panels:
├── After Login Panel
├── Search Results Panel
├── Product Detail Panel
│   ├── Add to Cart (completed) ✅
│   ├── Buy Now (pending)
│   └── View Reviews (pending)
│
└── Cart Popup Panel (pending) ← MỚI
    ├── Checkout (pending)
    ├── Continue Shopping (pending)
    └── Remove Item (pending)
```

**5. User clicks "Checkout" → Draw New → Detect Actions**
```
User: Click "Checkout"
User: Click button trên browser
User: Draw panel → Crop checkout page
Tool: Tạo "Checkout Page Panel"

User: Detect Actions
Tool: Detect được 3 actions

Panels:
├── After Login Panel
├── Search Results Panel
├── Product Detail Panel
├── Cart Popup Panel
│   ├── Checkout (completed) ✅
│   ├── Continue Shopping (pending)
│   └── Remove Item (pending)
│
└── Checkout Page Panel (pending) ← MỚI
    ├── Shipping Info (pending)
    ├── Payment Method (pending)
    └── Place Order (pending)
```

### Final Result:

**Panel Tree:**
```
📊 5 PANELS (flat)
├── After Login Panel (4 actions)
├── Search Results Panel (5 actions)
├── Product Detail Panel (6 actions)
├── Cart Popup Panel (3 actions)
└── Checkout Page Panel (7 actions)
```

**Flow Graph (STEP):**
```
After Login → "Search Bar" → Search Results
Search Results → "Product Card 1" → Product Detail
Product Detail → "Add to Cart" → Cart Popup
Cart Popup → "Checkout" → Checkout Page
```

---

**XONG! Tool đã record toàn bộ flow của bạn!** 🎉
