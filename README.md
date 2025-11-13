#--- START

npm install  --legacy-peer-deps
node main.js

Tóm tắt user flow:
1. PANEL → Detect Pages 
   → Auto-split long scroll thành PAGE 1, PAGE 2, ... (viewport 1920x1080)
   → Mỗi page có screenshot crop từ long scroll

2. PAGE → Detect Actions
   → Detect actions trong page viewport
   → Actions nested trong page với tọa độ tuyệt đối

3. PAGE → Edit Actions (nếu cần)
   → Thêm/sửa/xóa actions
   → CROP page (manual crop thêm 1 lần nữa để focus vùng nhỏ hơn)
     - Filter actions: inside giữ, outside xóa
     - Adjust coordinates: trừ offset

4. ACTION → Draw New
   → Tạo PANEL mới (long scroll)
   → Lặp lại từ bước 1

Chi tiết User Flow:
### Với mỗi Panel:

1. Capture Pages Của Panel

  1.1. Capture Từng Page
  
      - Click vào Panel trong Panel Log
      
      - Scroll trên tracking browser để Capture Page
      
      - Mỗi lần muốn tạo 1 page mới:
      
          - Kéo vùng crop trên Coordinate Editor để vẽ page
          
          - Nhập page name hoặc để mặc định "Page 1", "Page 2"... và lưu page
      
      - Lặp lại cho tất cả pages của panel (scroll lên/xuống và vẽ tiếp)

    ### Với mỗi Page:

    2. Detect Actions Trên Page

      2.1. Trigger Detection
  
          - Click vào Page trong Panel Log
          
          - Click nút "Detect Actions"
          
          - Detect xong hiển thị Coordinate với actions của page đó
          
          - Full Coordinate của action = (page_number, x, y, w, h)
  
      2.2. Edit Actions
  
          - Click "Edit Actions" để mở Coordinate Editor
          
          - Editor tự động hiển thị đúng page
          
          - Foreach Action:
          
              - Show Full Coordinate: (page, x, y, w, h)
              
              - User edit nếu cần
          
          - Add/Delete/Rename/Move actions
          
          - Click "Save"

            ### Với mỗi Action:

            3. Draw Panel Từ Action

            3.1. Trigger Draw
    
                - Click vào Action trong Panel Log
                
                - Tương tác với action trên tracking browser
                
                - Click nút "Draw Panel" (DRAW NEW / USE BEFORE)
    
            3.2. DRAW NEW (Ctrl+1)
    
                - Bấm DRAW NEW PANEL
                
                - Kéo vùng crop để vẽ panel mới
                
                - Panel mới tạo: Name = ActionName + "Panel", mark Action done
                    
            3.3. USE BEFORE (Ctrl+2)
    
                - Bấm USE BEFORE
                
                - PanelAfter = PanelBefore, mark Action done