---
name: Auto Draw Panel Flow with Completion Tracking
overview: "Thay đổi flow \"draw panel & detect actions\" để tự động hóa và theo dõi trạng thái hoàn tất. Flow mới: 1. capture -> 2. detect panel type -> 3. xác nhận panel type -> 4. crop panel -> 5. edit actions -> 6. xác nhận hoàn tất -> 7. makeChild. Lưu trạng thái flow vào metadata của panel item trong doing_item.jsonl."
todos:
  - id: add_flow_state_field
    content: Thêm field draw_flow_state vào metadata của panel item trong DataItemManager.js. Cập nhật createPanel và updateItem để support field này.
    status: completed
  - id: add_helper_functions
    content: "Thêm helper functions: getIncompleteDrawFlowPanels(), getPanelDrawFlowState(), setPanelDrawFlowState() trong queue-page-handlers.js"
    status: completed
    dependencies:
      - add_flow_state_field
  - id: modify_draw_panel_handler
    content: Modify drawPanelHandler để block 'draw new panel' khi có panel chưa hoàn tất. Hiện thông báo và mở lại panel chưa hoàn tất.
    status: completed
    dependencies:
      - add_helper_functions
  - id: modify_draw_panel_detect_actions
    content: "Modify drawPanelAndDetectActionsHandler để: kiểm tra panel chưa hoàn tất, resume flow từ state hiện tại, lưu state khi cancel."
    status: completed
    dependencies:
      - add_helper_functions
  - id: modify_confirm_crop
    content: Modify confirmPanelCropHandler để KHÔNG gọi makeChild, set draw_flow_state = 'edit_actions', và mở editor edit actions tự động.
    status: completed
    dependencies:
      - add_helper_functions
  - id: add_completion_modal
    content: "Thêm panelCompletionConfirmationModal vào queue-browser-html.js với 2 nút: Hoàn tất và Chưa."
    status: completed
  - id: add_completion_handlers
    content: Thêm confirmPanelCompletionHandler và cancelPanelCompletionHandler trong queue-page-handlers.js. confirmPanelCompletionHandler gọi makeChild và set state completed.
    status: completed
    dependencies:
      - add_completion_modal
      - add_helper_functions
  - id: modify_save_edits
    content: Modify savePanelEditsHandler để KHÔNG gọi makeChild, kiểm tra draw_flow_state và mở dialog xác nhận hoàn tất nếu cần.
    status: completed
    dependencies:
      - add_completion_handlers
  - id: modify_save_button
    content: Thay đổi nút Save để hiện 'Save & Complete' khi panel chưa hoàn tất. Khi click, save và mở dialog xác nhận hoàn tất.
    status: completed
    dependencies:
      - modify_save_edits
  - id: add_ui_indicators
    content: "Thêm UI indicators trong panel tree để hiển thị panel chưa hoàn tất: icon ⚠️ trước tên, màu dot vàng/cam, badge '[Chưa hoàn tất]' sau tên."
    status: completed
    dependencies:
      - add_helper_functions
---

# Auto Draw Panel Flow with Completion Tracking

## Tổng quan

Thay đổi flow "draw panel & detect actions" để tự động hóa hoàn toàn và theo dõi trạng thái hoàn tất. Flow mới sẽ có 7 bước tuần tự và chỉ gọi `makeChild` 1 lần khi hoàn tất.

## Flow mới

```
1. capture → 2. detect panel type → 3. xác nhận panel type → 
4. crop panel → 5. edit actions → 6. xác nhận hoàn tất → 7. makeChild
```

## Các thay đổi chính

### 1. Thêm field `draw_flow_state` vào panel metadata

**File:** `core/data/DataItemManager.js`

- Thêm field `draw_flow_state` vào metadata của panel item
- Các giá trị có thể:
  - `null` hoặc không có: chưa bắt đầu flow
  - `'capture'`: đang ở bước capture
  - `'detect_type'`: đang ở bước detect panel type
  - `'confirm_type'`: đang ở bước xác nhận panel type
  - `'crop'`: đang ở bước crop panel
  - `'edit_actions'`: đang ở bước edit actions (hoặc đã cancel ở bước 5-6)
  - `'completed'`: đã hoàn tất flow

### 2. Modify `drawPanelAndDetectActionsHandler`

**File:** `core/tracker/queue-page-handlers.js`

- **Kiểm tra panel chưa hoàn tất:** Trước khi bắt đầu flow, kiểm tra xem có panel nào đang có `draw_flow_state` khác `null` và khác `'completed'` không
  - Nếu có, block và hiện thông báo: "Bạn hãy hoàn tất panel [PANEL NAME]"
  - Bấm OK thì mở lại panel chưa hoàn tất để làm tiếp
- **Resume flow:** Nếu panel đã có `draw_flow_state`, resume từ bước tương ứng:
  - `'edit_actions'`: mở editor edit actions trực tiếp
  - Các state khác (`'capture'`, `'detect_type'`, `'confirm_type'`, `'crop'`): làm lại từ đầu (set state = null)
- **Lưu state khi cancel:**
  - Cancel ở bước 1-4: set state = `null` (để làm lại từ đầu, vì người dùng có thể cần capture lại)
  - Cancel ở bước 5-6: lưu state `'edit_actions'` để lần sau quay lại edit actions

### 3. Modify `confirmPanelCropHandler`

**File:** `core/tracker/queue-page-handlers.js`

- Sau khi crop xong, **KHÔNG** gọi `createPanelRelationFromStep` (makeChild) ngay
- Cập nhật `draw_flow_state` = `'edit_actions'`
- Mở editor edit actions tự động

### 4. Modify `savePanelEditsHandler`

**File:** `core/tracker/queue-page-handlers.js`

- **KHÔNG** gọi `createPanelRelationFromStep` (makeChild) ở đây
- Kiểm tra `draw_flow_state`:
  - Nếu chưa có hoặc là `'edit_actions'`, hiện dialog xác nhận hoàn tất
  - Nếu đã `'completed'`, chỉ save bình thường

### 5. Thêm dialog xác nhận hoàn tất

**File:** `core/tracker/queue-browser-html.js`

- Thêm modal mới: `panelCompletionConfirmationModal`
- Nội dung: "Bạn đã chắc chắn vẽ đúng panel mới và đúng/đủ các action của panel mới chưa?"
- 2 nút:
  - "Hoàn tất": đóng dialog, gọi `createPanelRelationFromStep` (makeChild), set `draw_flow_state` = `'completed'`, quay về queue tracker
  - "Chưa": đóng dialog, giữ `draw_flow_state` = `'edit_actions'` để có thể edit tiếp

**File:** `core/tracker/queue-page-handlers.js`

- Thêm handler `confirmPanelCompletionHandler`: gọi makeChild và set state completed
- Thêm handler `cancelPanelCompletionHandler`: chỉ đóng dialog

### 6. Thay đổi nút Save

**File:** `core/tracker/queue-browser-html.js`

- Nút Save hiện text động:
  - Nếu panel có `draw_flow_state` = `'edit_actions'` hoặc chưa có: hiện "Save & Complete"
  - Nếu panel đã `'completed'` hoặc không có flow state: hiện "Save" bình thường
- Khi click "Save & Complete": gọi `savePanelEditsHandler`, sau đó tự động mở dialog xác nhận hoàn tất

### 7. Block "draw new panel" khi có panel chưa hoàn tất

**File:** `core/tracker/queue-page-handlers.js`

- Modify `drawPanelHandler`:
  - Trước khi tạo panel mới, kiểm tra xem có panel nào có `draw_flow_state` khác `null` và khác `'completed'` không
  - Nếu có, hiện thông báo: "Bạn hãy hoàn tất panel [PANEL NAME]"
  - Bấm OK thì:
    - Select panel chưa hoàn tất
    - Gọi `drawPanelAndDetectActionsHandler` để resume flow

### 8. Helper functions

**File:** `core/tracker/queue-page-handlers.js`

- Thêm `getIncompleteDrawFlowPanels()`: trả về danh sách panels chưa hoàn tất flow
- Thêm `getPanelDrawFlowState(panelId)`: lấy `draw_flow_state` của panel
- Thêm `setPanelDrawFlowState(panelId, state)`: set `draw_flow_state` của panel

### 9. Hiển thị panel chưa hoàn tất trong Panel Tree

**File:** `core/tracker/queue-browser-html.js`

- Modify function `createTreeNode()` để kiểm tra `draw_flow_state` của panel
- Nếu panel có `draw_flow_state` khác `null` và khác `'completed'`:
  - **Icon ⚠️** trước tên panel
  - **Màu dot vàng/cam** (`#ff9800` hoặc `#ffa726`) thay vì xanh
  - **Badge nhỏ** `[Chưa hoàn tất]` sau tên panel với style tương tự checkpoint status badges
- Thêm CSS cho badge:
  ```css
  .tree-incomplete-badge {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    margin-left: 6px;
    background: #fff3cd;
    color: #856404;
    border: 1px solid #ffc107;
  }
  ```


**File:** `core/data/PanelLogManager.js`

- Modify `buildTreeStructure()` để include `draw_flow_state` trong node data (nếu có trong metadata)

## Chi tiết implementation

### Flow state transitions

```
null → 'capture' → 'detect_type' → 'confirm_type' → 'crop' → 'edit_actions' → 'completed'
```

### Cancel behavior

- Cancel ở bước 1-4: set state = `null` (làm lại từ đầu, vì người dùng có thể cần capture lại)
- Cancel ở bước 5-6: set state = `'edit_actions'` (để lần sau quay lại edit actions)

### Resume behavior

- State `null` hoặc không có: làm lại từ đầu (bước 1: capture)
- State `'edit_actions'`: mở editor edit actions trực tiếp
- Các state khác (`'capture'`, `'detect_type'`, `'confirm_type'`, `'crop'`): không cần resume, làm lại từ đầu

## Files cần thay đổi

1. `core/data/DataItemManager.js` - Thêm support cho `draw_flow_state` trong metadata
2. `core/tracker/queue-page-handlers.js` - Modify các handlers và thêm logic flow tracking
3. `core/tracker/queue-browser-html.js` - Thêm modal xác nhận hoàn tất, thay đổi nút Save, và UI indicators cho panel chưa hoàn tất
4. `core/data/PanelLogManager.js` - Include `draw_flow_state` trong tree structure data

## Testing checklist

- [ ] Tạo panel mới, flow chạy tự động từ đầu đến cuối
- [ ] Cancel ở bước 1-4, state reset về null và làm lại từ đầu
- [ ] Cancel ở bước 5-6, resume ở edit actions
- [ ] Dialog xác nhận hoàn tất hiện đúng khi click "Save & Complete"
- [ ] makeChild chỉ được gọi 1 lần khi hoàn tất
- [ ] Block "draw new panel" khi có panel chưa hoàn tất
- [ ] Thông báo và mở lại panel chưa hoàn tất đúng
- [ ] Nút Save hiện "Save & Complete" khi chưa hoàn tất
- [ ] Panel tree hiển thị đúng indicators cho panel chưa hoàn tất (icon ⚠️, màu dot vàng/cam, badge)