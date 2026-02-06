# Prompt: Validate Full Flow By AI (Gemini)

Tài liệu prompt đầy đủ dùng cho `validateFullFlowByAI` trong gemini-handler. Input gồm `ai_tool_info`, `modality_stacks_info`, `first_step`, `full_steps`; output là JSON `modality_stack_routes`.

---

## 1. Nhiệm vụ

Bạn là trợ lý phân tích luồng UI. Nhiệm vụ: với một **important action** (first_step) và toàn bộ **full_steps** của phiên, kiểm tra với từng **modality_stack** (tính năng end-to-end) xem đã có **luồng đầy đủ từ input đến output** hay chưa.

**Input:**
- **ai_tool_info**: thông tin tool từ DB at_tool (code, company, tool_name, version, description, domain, website).
- **modality_stacks_info**: danh sách modality stack của action (mỗi phần tử: code, name, description, example, main_feature_list, main_feature_reason).
- **first_step**: step gắn với important action đang validate — format: step_id, panel_before (name, image_url), action (name, image_url, type, verb, purpose), panel_after (name, image_url).
- **full_steps**: toàn bộ step trong phiên; mỗi step: step_id, panel_before_name, action (name, type, verb, step_purpose), panel_after_name.

**Output:** JSON với key `modality_stack_routes`: mảng, mỗi phần tử tương ứng một modality_stack, gồm đánh giá end-to-end, lý do, và danh sách routes.

---

## 2. Quy tắc logic (bắt buộc)

Với **từng** modality_stack trong `modality_stacks_info`:

**2.1** Chọn modality_stack hiện tại (code, name, description, example).

**2.2** Tìm tất cả step **liên quan** tới modality_stack đó — **Sequence_Full_End_To_End_Flow_Steps**. Một step được coi là liên quan nếu thuộc một trong hai nhóm sau:

- **Liên tiếp theo cầu nối:** step sau có `panel_before` trùng với `panel_after` của step trước (chuỗi panel_before → action → panel_after nối với nhau).

- **Liên quan ngữ cảnh (cùng flow):** step có liên quan về ngữ cảnh dù không liên tiếp nhau theo cầu nối. Tức là các step cùng thuộc một luồng nghiệp vụ (cùng flow) từ input đến output cuối, ví dụ: thao tác tạo/kích hoạt rồi sang bước xem/quản lý kết quả, dù không nối trực tiếp panel_after bước trước = panel_before bước sau.

  **Ví dụ:**
  - **Step A:** Từ `panel_video_generate` bấm nút "generation" → ra `panel_generation` (xong bước generate).
  - **Step B:** Từ `panel_after_login` bấm nút "asset" → ra `panel_asset_management` để xem kết quả generate.

  Hai step này **không** có cầu nối liên tiếp (panel_after của A ≠ panel_before của B), nhưng **có liên quan ngữ cảnh**: generate video xong thì vào asset để xem kết quả — luồng từ "làm xong bước tạo nội dung" đến "xem output cuối cùng". Khi phân tích flow cho modality_stack tương ứng, step A và step B vẫn được coi là thuộc cùng một flow và có thể nằm trong cùng route/đánh giá end-to-end.

Dùng cả **full_steps** và **first_step** (coi first_step là một step đặc biệt gắn important action) để xác định tập step liên quan.

**2.3** Sắp xếp và tạo **routes:** từ tập step trong Sequence_Full_End_To_End_Flow_Steps, xây dựng các **route** (đường đi) từ **điểm bắt đầu** (first_step / step đầu vào của flow) tới **điểm kết thúc** (step tạo ra output cuối của modality_stack). Nếu không có **điểm kết thúc** thì **route** từ **điểm bắt đầu** (first_step / step đầu vào của flow) tới step liên quan cuối cùng. Mỗi route là một danh sách step theo thứ tự. Nếu modality_stack có nhiều **route** thì BẮT BUỘC tạo đủ tất cả các route.

**Định nghĩa điểm kết thúc:** step tại đó tạo ra output cuối hoặc xem, tải được output cuối của modality_stack.

**2.4** Đánh giá **is_end_to_end_flow** cho modality_stack đó:
- **true:** Có ít nhất một route đi được **liên tục** từ input tới output của flow đầy đủ (không thiếu bước trung gian).
- **false:** Không có route nào đi được tới output, hoặc có tới output nhưng thiếu step trung gian.

**2.5** Viết **end_to_end_flow_reason** (bằng **tiếng Việt**):
- Nếu **is_end_to_end_flow = true:** giải thích ngắn gọn tại sao (ví dụ: có route từ panel X qua action Y tới panel Z, đủ các bước cho modality_stack).
- Nếu **is_end_to_end_flow = false:** giải thích rõ thiếu step nào (mô tả panel_before / action / panel_after hoặc step_id) hoặc tại sao không có route tới output.

---

## 3. Định dạng output JSON (bắt buộc)

Schema trả về (dùng `response_schema` khi gọi Gemini):

- **modality_stack_routes** (array, required): mỗi phần tử tương ứng **một** modality_stack trong `modality_stacks_info`.
- Mỗi phần tử gồm:
  - **modality_stack_code** (string, required)
  - **is_end_to_end_flow** (boolean, required)
  - **end_to_end_flow_reason** (string, required) — luôn bằng tiếng Việt.
  - **routes** (array, required): mảng các route; mỗi route là **mảng các step** (object bên dưới), theo thứ tự từ first_step/đầu flow đến bước cuối. Không có route thì `routes: []`.

Mỗi step trong route:
- **step_id** (string, required)
- **panel_before_name** (string, required)
- **action_name** (string, required)
- **action_type** (string, required)
- **action_verb** (string, required)
- **step_purpose** (string, required)
- **panel_after_name** (string, required)

```json
{
  "modality_stack_routes": [
    {
      "modality_stack_code": "string - code của modality_stack",
      "is_end_to_end_flow": true,
      "end_to_end_flow_reason": "string - giải thích bằng tiếng Việt",
      "routes": [
        [
          {
            "step_id": "id của step",
            "panel_before_name": "tên panel trước",
            "action_name": "tên action",
            "action_type": "type",
            "action_verb": "verb",
            "step_purpose": "purpose của step",
            "panel_after_name": "tên panel sau"
          }
        ]
      ]
    }
  ]
}
```

---

## 4. Yêu cầu nhất quán

- **Cùng một bộ input** thì output JSON phải **giống nhau** giữa các lần gọi (cùng số phần tử, cùng is_end_to_end_flow, cùng cấu trúc routes).
- Chỉ dựa vào dữ liệu đã cho; không bịa step hay panel không có trong first_step / full_steps.
- Nếu modality_stacks_info rỗng, hàm trả về `modality_stack_routes: []` mà không gọi Gemini.

---

## 5. Tham chiếu code

- **Gọi API:** `validateFullFlowByAI(tracker, { ai_tool_info, modality_stacks_info, first_step, full_steps })` trong `gemini-handler.js`.
- **Nguồn dữ liệu:** `queue-page-handlers.js` — `getAiToolInfo(aiToolCode)`, `getAiToolModalityStacks(aiToolCode)`, `tracker.stepManager.getStepForAction(actionId)`, `tracker.stepManager.getAllSteps()`; first_step và full_steps được build từ `dataItemManager.getItem()` cho panel_before, action, panel_after.
- **Response schema:** Định nghĩa trong `gemini-handler.js` (response_schema) khớp với cấu trúc trên; Gemini trả về `application/json` theo schema đó.
