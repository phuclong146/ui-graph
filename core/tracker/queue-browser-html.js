export const QUEUE_BROWSER_HTML = `
<html lang="en">
  <head>
    <title>Queue Tracker</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"></script>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: 'Roboto', system-ui, sans-serif;
        background-color: #ffffff;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        height: 100vh;
        color: #333;
      }
      
      #main-container {
        display: flex;
        flex: 1;
        overflow: hidden;
      }
      
      #panel-tree-container {
        width: 30%;
        border-right: 1px solid #e0e0e0;
        background: white;
        overflow-y: auto;
        padding: 10px 0 10px 0;
      }
      
      #panel-tree-container h3 {
        margin: 0 0 10px 0;
        padding: 0 10px;
        font-size: 14px;
        color: #666;
      }
      
      .tree-node {
      }
      
      .tree-node-content {
        display: flex;
        align-items: center;
        padding: 4px 4px 4px 4px;
        cursor: pointer;
        border-radius: 4px;
        font-size: 13px;
        user-select: none;
      }
      
      .tree-node-content:hover {
        background: #f0f0f0;
      }
      
      .tree-node-content.selected {
        background: #e3f2fd;
      }
      
      .tree-expand {
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: 4px;
        font-size: 10px;
        cursor: pointer;
      }
      
      .tree-node-dot {
        margin-right: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        position: relative;
      }
      
      .tree-node-dot svg {
        width: 100%;
        height: 100%;
      }
      
      .tree-label {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .context-menu {
        position: fixed;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        padding: 4px 0;
        z-index: 10000;
        min-width: 150px;
      }
      
      .context-menu-item {
        padding: 8px 16px;
        cursor: pointer;
        font-size: 13px;
      }
      
      .context-menu-item:hover {
        background: #f0f0f0;
      }
      
      .tree-children {
        display: none;
      }
      
      .tree-children.expanded {
        display: block;
      }
      
      .tree-children.level-1 {
        padding-left: 16px;
      }
      
      .tree-children.level-2 {
        padding-left: 0px;
      }
      
      #content-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      #controls {
        background: white;
        padding: 10px 16px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: flex-start;
        gap: 10px;
        position: sticky;
        top: 0;
        z-index: 10;
      }

      #controls button {
        background: #007bff;
        color: white;
        border: none;
        border-radius: 12px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: background 0.2s ease;
      }

      #controls button:hover {
        background: #0056d2;
      }
      
      #detectActionsGeminiBtn {
        padding: 3px 6px;
        font-size: 9px;
        background: white;
        color: #007bff;
        border: 1px solid #007bff;
      }
      
      #detectActionsGeminiBtn:hover {
        background: #007bff;
        color: white;
      }
      
      .draw-panel-option:hover {
        background: #f5f5f5;
      }

      #events {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        background: #ffffff;
      }

      .event {
        display: flex;
        flex-direction: column;
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        margin-bottom: 15px;
        padding: 15px 20px;
        max-width: 700px;
        transition: box-shadow 0.2s ease;
        position: relative;
      }

      .event.updated {
        box-shadow: 0 0 10px rgba(0,123,255,0.3);
      }

      .delete-event-btn {
        position: absolute;
        top: 10px;
        left: 10px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #ff4444;
        color: white;
        border: none;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        z-index: 10;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      }

      .delete-event-btn:hover {
        background: #ff0000;
        transform: scale(1.1);
        box-shadow: 0 3px 8px rgba(255,0,0,0.4);
      }

      .event img {
        border-radius: 10px;
        max-width: 100%;
        margin-bottom: 10px;
        cursor: pointer;
        transition: opacity 0.2s ease;
      }

      .event img:hover {
        opacity: 0.8;
      }

      #imageModal {
        display: none;
        position: fixed;
        z-index: 10000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.9);
        justify-content: center;
        align-items: center;
      }

      #imageModal.show {
        display: flex;
      }

      #imageModal img {
        max-width: 95%;
        max-height: 95%;
        object-fit: contain;
        border-radius: 8px;
      }

      #imageModal .close {
        position: absolute;
        top: 20px;
        right: 35px;
        color: #f1f1f1;
        font-size: 40px;
        font-weight: bold;
        cursor: pointer;
      }

      #imageModal .close:hover {
        color: #bbb;
      }

      .event .meta { font-size: 13px; color: #777; margin-bottom: 6px; }
      .event .action { font-size: 15px; margin-bottom: 6px; }
      .event .screen { font-size: 14px; color: #333; margin-bottom: 4px; }
      .event .timestamp { font-size: 12px; color: #999; text-align: right; }

      .edit-action-btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        margin: 10px 0;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      }

      .edit-action-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.5);
      }

      #editor-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.95);
        z-index: 20000;
        display: flex;
        flex-direction: column;
      }

      #editor-toolbar {
        padding: 15px 10px;
        background: rgba(26, 26, 26, 0.95);
        backdrop-filter: blur(10px);
        display: flex;
        flex-direction: column;
        gap: 10px;
        align-items: stretch;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        border-radius: 12px;
        z-index: 1000;
        min-width: 160px;
      }

      #editor-instructions {
        padding-top: 15px;
        margin-top: 5px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        color: #aaa;
        font-size: 11px;
        line-height: 1.6;
        text-align: left;
      }

      .editor-btn {
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
        transition: all 0.2s ease;
      }

      .crop-btn {
        background: linear-gradient(135deg, #43cea2 0%, #185a9d 100%);
        color: white;
        box-shadow: 0 2px 8px rgba(67, 206, 162, 0.3);
      }

      .crop-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(67, 206, 162, 0.5);
      }

      .save-btn {
        background: linear-gradient(135deg, #00d2ff 0%, #3a47d5 100%);
        color: white;
        box-shadow: 0 2px 8px rgba(58, 71, 213, 0.3);
      }

      .save-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(58, 71, 213, 0.5);
      }

      .reset-btn {
        background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        color: white;
        box-shadow: 0 2px 8px rgba(245, 87, 108, 0.3);
      }

      .reset-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(245, 87, 108, 0.5);
      }

      .cancel-btn {
        background: #666;
        color: white;
      }

      .cancel-btn:hover {
        background: #555;
      }

      #editor-status {
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(26, 26, 26, 0.95);
        backdrop-filter: blur(10px);
        padding: 10px 20px;
        border-radius: 8px;
        color: #aaa;
        font-size: 12px;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        min-height: 20px;
      }

      #editor-status:empty {
        display: none;
      }

      #editor-status.status-success {
        color: #00ff88;
      }

      #editor-status.status-error {
        color: #ff4444;
      }

      #editor-status.status-loading {
        color: #00d2ff;
      }

      #editor-status.status-info {
        color: #aaa;
      }

      #editor-canvas-wrapper {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: auto;
        padding: 70px 20px 20px 20px;
      }

      #editor-canvas {
        box-shadow: 0 0 30px rgba(0,0,0,0.7);
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <div id="main-container">
      <div id="panel-tree-container">
        <h3>Panel Log</h3>
        <div id="panel-tree"></div>
      </div>
      
      <div id="content-container">
    <div id="controls">
      <button id="captureActionsDOMBtn" style="display:none; background:#007bff;">📸 Detect Action</button>
      <button id="drawPanelBtn" style="display:none;">🖼️ Draw Panel</button>
      <button id="importCookiesBtn" style="display:inline-block;">🍪 Import Cookies</button>
      <input type="file" id="cookieFileInput" accept=".json" style="display:none;">
      <button id="saveBtn" style="background:#007bff;">💾 Save</button>
      <button id="quitBtn" style="background:#007bff;">🚪 Quit</button>
      <button id="detectActionsGeminiBtn" style="display:none; background:white; color:#007bff; border:1px solid #007bff; padding:3px 6px; font-size:9px;">🤖 Detect Action Backup</button>
    </div>
    
    <div id="drawPanelMenu" style="display:none; position:absolute; background:white; border:1px solid #ddd; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:10000; padding:4px;">
      <button class="draw-panel-option" data-mode="DRAW_NEW" style="display:block; width:100%; padding:10px 20px; border:none; background:white; text-align:left; cursor:pointer; font-size:14px; border-radius:3px;">📝 Draw NEW</button>
      <button class="draw-panel-option" data-mode="USE_BEFORE" style="display:block; width:100%; padding:10px 20px; border:none; background:white; text-align:left; cursor:pointer; font-size:14px; border-radius:3px; margin-top:2px;">🔄 Use BEFORE</button>
    </div>
    
    <!-- Dropdown menus hidden - direct mode call instead -->
    <!-- <div id="detectAIMenu" style="display:none; position:absolute; background:white; border:1px solid #ddd; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:10000; padding:4px;">
      <button class="detect-ai-option" data-mode="normal" style="display:block; width:100%; padding:10px 20px; border:none; background:white; text-align:left; cursor:pointer; font-size:14px; border-radius:3px;">📸 Normal</button>
      <button class="detect-ai-option" data-mode="scrolling" disabled style="display:block; width:100%; padding:10px 20px; border:none; background:#e0e0e0; color:#999; text-align:left; cursor:not-allowed; font-size:14px; border-radius:3px; margin-top:2px;">📜 Scrolling (Disabled)</button>
    </div>
    
    <div id="detectWebMenu" style="display:none; position:absolute; background:white; border:1px solid #ddd; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:10000; padding:4px;">
      <button class="detect-web-option" data-mode="normal" style="display:block; width:100%; padding:10px 20px; border:none; background:white; text-align:left; cursor:pointer; font-size:14px; border-radius:3px;">📸 Normal</button>
      <button class="detect-web-option" data-mode="scrolling" style="display:block; width:100%; padding:10px 20px; border:none; background:white; text-align:left; cursor:pointer; font-size:14px; border-radius:3px; margin-top:2px;">📜 Scrolling</button>
    </div> -->
    
    <button id="clearAllClicksBtn" style="display:none; margin:10px; padding:8px 16px; background:#ff9800; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600;">🗑️ Clear All Clicks</button>

    <div id="events"></div>
      </div>
    </div>

    <div id="imageModal">
      <span class="close">&times;</span>
      <img id="modalImage" src="" alt="Full size screenshot">
    </div>

    <script>
      const ws = new WebSocket('ws://localhost:8081');
      const container = document.getElementById('events');
      let panelTreeData = [];
      let selectedPanelId = null;
      let expandedPanels = new Set();
      let isDrawingPanel = false;
      let isGeminiDetecting = false;

      ws.onmessage = async (msg) => {
        const evt = JSON.parse(msg.data);
        
        if (evt.type === 'tree_update') {
          panelTreeData = evt.data || [];
          renderPanelTree();
          return;
        }
        
        if (evt.type === 'panel_selected') {
          if (evt.gemini_detecting !== undefined) {
            isGeminiDetecting = evt.gemini_detecting;
            updateDetectCaptureButtonsState();
          }
          handlePanelSelected(evt);
          return;
        }
        
        if (evt.type === 'trigger_capture') {
          handleTriggerCapture(evt.mode);
          return;
        }
        
        if (evt.type === 'trigger_draw_panel') {
          if (isDrawingPanel) {
            showToast('⚠️ Đang xử lý, vui lòng đợi...');
            return;
          }
          
          if (!selectedPanelId) {
            showToast('⚠️ Vui lòng chọn action ở Queue Browser');
            if (window.broadcastToast) {
              await window.broadcastToast('⚠️ Vui lòng chọn action ở Queue Browser');
            }
            return;
          }
          
          const findNodeInTree = (nodes, id) => {
            for (const node of nodes) {
              if (node.panel_id === id) return node;
              if (node.children) {
                const found = findNodeInTree(node.children, id);
                if (found) return found;
              }
            }
            return null;
          };
          
          const selectedNode = findNodeInTree(panelTreeData, selectedPanelId);
          
          if (!selectedNode) {
            showToast('⚠️ Panel không tồn tại');
            if (window.broadcastToast) await window.broadcastToast('⚠️ Panel không tồn tại');
            return;
          }
          
          if (selectedNode.item_category !== 'ACTION') {
            showToast('⚠️ Chỉ ACTION mới có thể Draw Panel. Chọn lại ở Queue Browser');
            if (window.broadcastToast) await window.broadcastToast('⚠️ Chỉ ACTION mới có thể Draw Panel. Chọn lại ở Queue Browser');
            return;
          }
          
          if (window.checkActionHasStep) {
            const hasStep = await window.checkActionHasStep(selectedPanelId);
            if (hasStep) {
              showToast('⚠️ Action đã có step! Bấm Reset để draw lại.');
              return;
            }
          }
          
          isDrawingPanel = true;
          
          try {
            if (window.drawPanel) {
              const result = await window.drawPanel('DRAW_NEW');
              
              if (result?.mode === 'DRAW_NEW' && result.screenshot) {
                showToast('🖼️ Đang mở editor crop...');
                if (window.broadcastToast) await window.broadcastToast('🖼️ Đang mở editor crop...');
                
                if (window.getPanelEditorClass) {
                  const panelEditorCode = await window.getPanelEditorClass();
                  eval(panelEditorCode);
                  
                  const editor = new PanelEditor(result.screenshot, result.actionItemId, 'cropOnly');
                  await editor.init();
                  
                  if (window.bringQueueBrowserToFront) {
                    await window.bringQueueBrowserToFront();
                  }
                }
              } else {
                showToast('❌ Không thể mở editor crop');
                if (window.broadcastToast) await window.broadcastToast('❌ Không thể mở editor crop');
                isDrawingPanel = false;
              }
            }
          } catch (err) {
            console.error('Draw panel error:', err);
            isDrawingPanel = false;
          }
          return;
        }
        
        if (evt.type === 'trigger_use_before') {
          if (isDrawingPanel) {
            showToast('⚠️ Đang xử lý, vui lòng đợi...');
            return;
          }
          
          if (!selectedPanelId) {
            showToast('⚠️ Vui lòng chọn action ở Queue Browser');
            if (window.broadcastToast) await window.broadcastToast('⚠️ Vui lòng chọn action ở Queue Browser');
            return;
          }
          
          const findNodeInTree = (nodes, id) => {
            for (const node of nodes) {
              if (node.panel_id === id) return node;
              if (node.children) {
                const found = findNodeInTree(node.children, id);
                if (found) return found;
              }
            }
            return null;
          };
          
          const selectedNode = findNodeInTree(panelTreeData, selectedPanelId);
          
          if (!selectedNode) {
            showToast('⚠️ Panel không tồn tại');
            if (window.broadcastToast) await window.broadcastToast('⚠️ Panel không tồn tại');
            return;
          }
          
          if (selectedNode.item_category !== 'ACTION') {
            showToast('⚠️ Chỉ ACTION mới có thể Use BEFORE. Chọn lại ở Queue Browser');
            if (window.broadcastToast) await window.broadcastToast('⚠️ Chỉ ACTION mới có thể Use BEFORE. Chọn lại ở Queue Browser');
            return;
          }
          
          if (window.checkActionHasStep) {
            const hasStep = await window.checkActionHasStep(selectedPanelId);
            if (hasStep) {
              showToast('⚠️ Action đã có step! Bấm Reset để draw lại.');
              return;
            }
          }
          
          isDrawingPanel = true;
          
          try {
            if (window.useBeforePanel) {
              await window.useBeforePanel(selectedPanelId);
              showToast('✅ Marked as done với panel BEFORE');
              if (window.broadcastToast) await window.broadcastToast('✅ Marked as done với panel BEFORE');
              isDrawingPanel = false;
            }
          } catch (err) {
            console.error('Use before error:', err);
            isDrawingPanel = false;
          }
          return;
        }
        
        if (evt.type === 'show_toast') {
          showToast(evt.message);
          return;
        }
        
        if (evt.type === 'click_event') {
          if (evt.action_item_id === selectedPanelId) {
            addClickEventToView(evt);
          }
          return;
        }
      };

      const modal = document.getElementById('imageModal');
      const modalImg = document.getElementById('modalImage');
      const closeModal = document.querySelector('.close');

      const openModal = async () => {
        modal.classList.add('show');
        if (window.resizeQueueBrowser) {
          await window.resizeQueueBrowser(true);
        }
      };

      const closeModalFn = async () => {
        modal.classList.remove('show');
        if (window.resizeQueueBrowser) {
          await window.resizeQueueBrowser(false);
        }
      };

      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('event-screenshot')) {
          modalImg.src = e.target.src;
          openModal();
        }
      });

      closeModal.onclick = closeModalFn;

      modal.onclick = (e) => {
        if (e.target === modal) {
          closeModalFn();
        }
      };

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
          closeModalFn();
        }
      });

      let isCapturing = false;
      const detectActionsGeminiBtn = document.getElementById("detectActionsGeminiBtn");
      const captureActionsDOMBtn = document.getElementById("captureActionsDOMBtn");
      const drawPanelBtn = document.getElementById("drawPanelBtn");
      const drawPanelMenu = document.getElementById("drawPanelMenu");
      const detectAIMenu = document.getElementById("detectAIMenu");
      const detectWebMenu = document.getElementById("detectWebMenu");
      
      function updateDetectCaptureButtonsState() {
        const panelResetButtons = document.querySelectorAll('.reset-panel-btn[data-panel-id]');
        
        if (isGeminiDetecting) {
          detectActionsGeminiBtn.disabled = true;
          detectActionsGeminiBtn.style.opacity = '0.6';
          detectActionsGeminiBtn.style.cursor = 'not-allowed';
          detectActionsGeminiBtn.textContent = '⏳ Detecting...';
          
          captureActionsDOMBtn.disabled = true;
          captureActionsDOMBtn.style.opacity = '0.6';
          captureActionsDOMBtn.style.cursor = 'not-allowed';
          captureActionsDOMBtn.textContent = '⏳ Capturing...';
          
          panelResetButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.4';
            btn.style.cursor = 'not-allowed';
            btn.style.pointerEvents = 'none';
          });
        } else {
          detectActionsGeminiBtn.disabled = false;
          detectActionsGeminiBtn.style.opacity = '1';
          detectActionsGeminiBtn.style.cursor = 'pointer';
          detectActionsGeminiBtn.textContent = '🤖 Detect Action Backup';
          
          captureActionsDOMBtn.disabled = false;
          captureActionsDOMBtn.style.opacity = '1';
          captureActionsDOMBtn.style.cursor = 'pointer';
          captureActionsDOMBtn.textContent = '📸 Detect Action';
          
          panelResetButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.style.pointerEvents = 'auto';
          });
        }
      }
      
      detectActionsGeminiBtn.addEventListener("click", async (e) => {
        if (isCapturing || isGeminiDetecting) {
          showToast('⚠️ Đang xử lý, vui lòng đợi...');
          return;
        }
        
        isCapturing = true;
        
        try {
          if (window.manualCaptureAI) {
            await window.manualCaptureAI();
          }
        } finally {
          isCapturing = false;
        }
      });
      
      captureActionsDOMBtn.addEventListener("click", async (e) => {
        if (isCapturing || isGeminiDetecting) {
          showToast('⚠️ Đang xử lý, vui lòng đợi...');
          return;
        }
        
        isCapturing = true;
        
        try {
          if (window.captureActions) {
            await window.captureActions();
          }
        } finally {
          isCapturing = false;
        }
      });
      
      // Dropdown menu listeners commented out - direct mode call instead
      /*
      document.querySelectorAll('.detect-ai-option').forEach(option => {
        option.addEventListener('click', async () => {
          const mode = option.getAttribute('data-mode');
          detectAIMenu.style.display = 'none';
          
        if (isCapturing || isGeminiDetecting) {
          showToast('⚠️ Đang xử lý, vui lòng đợi...');
          return;
        }
        
        isCapturing = true;
        
        try {
            if (mode === 'normal' && window.manualCaptureAI) {
            await window.manualCaptureAI();
            } else if (mode === 'scrolling' && window.manualCaptureAIScrolling) {
              await window.manualCaptureAIScrolling();
          }
        } finally {
          isCapturing = false;
        }
      });
      });
      
      document.querySelectorAll('.detect-web-option').forEach(option => {
        option.addEventListener('click', async () => {
          const mode = option.getAttribute('data-mode');
          detectWebMenu.style.display = 'none';
          
        if (isCapturing || isGeminiDetecting) {
          showToast('⚠️ Đang xử lý, vui lòng đợi...');
          return;
        }
        
        isCapturing = true;
        
        try {
            if (mode === 'normal' && window.captureActions) {
            await window.captureActions();
            } else if (mode === 'scrolling' && window.captureActionsScrolling) {
              await window.captureActionsScrolling();
          }
        } finally {
          isCapturing = false;
        }
        });
      });
      */
      
      drawPanelBtn.addEventListener("click", (e) => {
        const btnRect = drawPanelBtn.getBoundingClientRect();
        drawPanelMenu.style.left = btnRect.left + 'px';
        drawPanelMenu.style.top = (btnRect.bottom + 5) + 'px';
        drawPanelMenu.style.display = 'block';
      });
      
      document.querySelectorAll('.draw-panel-option').forEach(option => {
        option.addEventListener('click', async () => {
          const mode = option.getAttribute('data-mode');
          drawPanelMenu.style.display = 'none';
          
          if (isDrawingPanel) {
            showToast('⚠️ Đang xử lý, vui lòng đợi...');
            return;
          }
          
          if (!selectedPanelId) {
            showToast('⚠️ Vui lòng chọn action trước!');
            return;
          }
          
          if (window.checkActionHasStep) {
            const hasStep = await window.checkActionHasStep(selectedPanelId);
            if (hasStep) {
              showToast('⚠️ Action đã có step! Bấm Reset để draw lại.');
              return;
            }
          }
          
          isDrawingPanel = true;
          
          try {
            if (mode === 'DRAW_NEW') {
              if (window.drawPanel) {
                const result = await window.drawPanel(mode);
                
                if (result?.mode === 'DRAW_NEW' && result.screenshot) {
                  showToast('Đang mở editor crop...');
                  
                  if (window.getPanelEditorClass) {
                    const panelEditorCode = await window.getPanelEditorClass();
                    eval(panelEditorCode);
                    
                    const editor = new PanelEditor(result.screenshot, result.actionItemId, 'cropOnly');
                    await editor.init();
                    
                    if (window.bringQueueBrowserToFront) {
                      await window.bringQueueBrowserToFront();
                    }
                  }
                } else {
                  isDrawingPanel = false;
                }
              }
            } else if (mode === 'USE_BEFORE') {
              if (window.useBeforePanel) {
                await window.useBeforePanel(selectedPanelId);
                showToast('✅ Marked as done với panel BEFORE');
                isDrawingPanel = false;
              }
            }
          } catch (err) {
            console.error('Draw panel error:', err);
            isDrawingPanel = false;
          }
        });
      });
      
      document.addEventListener('click', (e) => {
        if (!drawPanelBtn.contains(e.target) && !drawPanelMenu.contains(e.target)) {
          drawPanelMenu.style.display = 'none';
        }
        // Dropdown menus commented out
        // if (!detectActionsGeminiBtn.contains(e.target) && !detectAIMenu.contains(e.target)) {
        //   detectAIMenu.style.display = 'none';
        // }
        // if (!captureActionsDOMBtn.contains(e.target) && !detectWebMenu.contains(e.target)) {
        //   detectWebMenu.style.display = 'none';
        // }
      });
      
      const clearAllClicksBtn = document.getElementById('clearAllClicksBtn');
      clearAllClicksBtn.addEventListener('click', async () => {
        if (!selectedPanelId) {
          showToast('⚠️ Vui lòng chọn action trước!');
          return;
        }
        
        if (!confirm('Xóa tất cả click events của action này?')) {
          return;
        }
        
        if (window.clearAllClicksForAction) {
          await window.clearAllClicksForAction(selectedPanelId);
          const clickEvents = Array.from(container.querySelectorAll('.event[data-event-type="click"]'));
          clickEvents.forEach(el => el.remove());
          showToast('✅ Đã xóa tất cả clicks');
        }
      });

      let isSaving = false;
      const saveBtn = document.getElementById("saveBtn");
      
      const handleSaveClick = async () => {
        if (isSaving) {
          showToast('⚠️ Đang save, vui lòng đợi...');
          return;
        }
        
        if (window.saveEvents) {
          try {
            isSaving = true;
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.6';
            saveBtn.style.cursor = 'not-allowed';
            saveBtn.style.pointerEvents = 'none';
            saveBtn.textContent = '⏳ Saving...';
            
            await window.saveEvents();
            
            saveBtn.removeEventListener("click", handleSaveClick);
            saveBtn.textContent = '✅ Saved';
            saveBtn.style.opacity = '0.5';
            console.log('✅ Save completed successfully');
          } catch (err) {
            console.error('❌ Save failed:', err);
            
            if (!err.isValidationError) {
              showToast('❌ Save fail!');
            }
            
            isSaving = false;
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.pointerEvents = 'auto';
            saveBtn.textContent = '💾 Save';
          }
        } else {
          alert("SAVE function not connected!");
        }
      };
      
      saveBtn.addEventListener("click", handleSaveClick);

      const importCookiesBtn = document.getElementById("importCookiesBtn");
      const cookieFileInput = document.getElementById("cookieFileInput");
      
      importCookiesBtn.addEventListener("click", () => {
        cookieFileInput.click();
      });
      
      cookieFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
          const text = await file.text();
          const result = await importCookiesFromJson(text);
          
          if (result.success) {
            showToast('✅ ' + result.message);
          } else {
            showToast('❌ ' + result.message);
          }
        } catch (err) {
          showToast('❌ Import failed: ' + err.message);
        }
        
        cookieFileInput.value = '';
      });

      let isQuitting = false;
      const quitBtn = document.getElementById("quitBtn");
      
      quitBtn.addEventListener("click", async () => {
        if (isQuitting) {
          showToast('⚠️ Đang thoát, vui lòng đợi...');
          return;
        }
        
        isQuitting = true;
        quitBtn.disabled = true;
        quitBtn.style.opacity = '0.6';
        quitBtn.style.cursor = 'not-allowed';
        quitBtn.style.pointerEvents = 'none';
        
        const originalText = quitBtn.textContent;
        quitBtn.textContent = '⏳ Quitting...';
        
        if (window.quitApp) {
          try {
            await window.quitApp();
          } catch (err) {
            console.error('Quit failed:', err);
            isQuitting = false;
            quitBtn.disabled = false;
            quitBtn.style.opacity = '1';
            quitBtn.style.cursor = 'pointer';
            quitBtn.style.pointerEvents = 'auto';
            quitBtn.textContent = originalText;
          }
        } else {
          alert("QUIT function not connected!");
          isQuitting = false;
          quitBtn.disabled = false;
          quitBtn.style.opacity = '1';
          quitBtn.style.cursor = 'pointer';
          quitBtn.style.pointerEvents = 'auto';
          quitBtn.textContent = originalText;
        }
      });
      
       document.addEventListener("keydown", async (e) => {
         if ((e.ctrlKey || e.metaKey) && e.key === "1") {
          e.preventDefault();
          
          if (isDrawingPanel) {
            showToast('⚠️ Đang xử lý, vui lòng đợi...');
            return;
          }
          
          if (!selectedPanelId) {
            showToast('⚠️ Vui lòng chọn action trước!');
            return;
          }
          
          const findNodeInTree = (nodes, id) => {
            for (const node of nodes) {
              if (node.panel_id === id) return node;
              if (node.children) {
                const found = findNodeInTree(node.children, id);
                if (found) return found;
              }
            }
            return null;
          };
          
          const selectedNode = findNodeInTree(panelTreeData, selectedPanelId);
          
          if (selectedNode?.item_category !== 'ACTION') {
            showToast('⚠️ Chỉ ACTION mới có thể Draw Panel!');
            return;
          }
          
          if (window.checkActionHasStep) {
            const hasStep = await window.checkActionHasStep(selectedPanelId);
            if (hasStep) {
              showToast('⚠️ Action đã có step! Bấm Reset để draw lại.');
              return;
            }
          }
          
          isDrawingPanel = true;
          
          try {
            if (window.drawPanel) {
              showToast('🖼️ Đang mở editor crop...');
              
              const result = await window.drawPanel('DRAW_NEW');
              
              if (result?.mode === 'DRAW_NEW' && result.screenshot) {
                if (window.getPanelEditorClass) {
                  const panelEditorCode = await window.getPanelEditorClass();
                  eval(panelEditorCode);
                  
                  const editor = new PanelEditor(result.screenshot, result.actionItemId, 'cropOnly');
                  await editor.init();
                  
                  if (window.bringQueueBrowserToFront) {
                    await window.bringQueueBrowserToFront();
                  }
                }
        } else {
                showToast('❌ Không thể mở editor crop');
                isDrawingPanel = false;
              }
            }
          } catch (err) {
            console.error('Draw panel error:', err);
            isDrawingPanel = false;
          }
         }
         
         if ((e.ctrlKey || e.metaKey) && e.key === "2") {
          e.preventDefault();
          
          if (isDrawingPanel) {
            showToast('⚠️ Đang xử lý, vui lòng đợi...');
            return;
          }
          
          if (!selectedPanelId) {
            showToast('⚠️ Vui lòng chọn action trước!');
            return;
          }
          
          const findNodeInTree = (nodes, id) => {
            for (const node of nodes) {
              if (node.panel_id === id) return node;
              if (node.children) {
                const found = findNodeInTree(node.children, id);
                if (found) return found;
              }
            }
            return null;
          };
          
          const selectedNode = findNodeInTree(panelTreeData, selectedPanelId);
          
          if (selectedNode?.item_category !== 'ACTION') {
            showToast('⚠️ Chỉ ACTION mới có thể Use BEFORE!');
            return;
          }
          
          if (window.checkActionHasStep) {
            const hasStep = await window.checkActionHasStep(selectedPanelId);
            if (hasStep) {
              showToast('⚠️ Action đã có step! Bấm Reset để draw lại.');
              return;
            }
          }
          
          isDrawingPanel = true;
          
          try {
            if (window.useBeforePanel) {
              await window.useBeforePanel(selectedPanelId);
              showToast('✅ Marked as done với panel BEFORE');
              isDrawingPanel = false;
            }
          } catch (err) {
            console.error('Use before error:', err);
            isDrawingPanel = false;
          }
         }
         
         if (e.key === "Delete" && selectedPanelId) {
           const activeElement = document.activeElement;
           const isEditing = activeElement && (
             activeElement.tagName === 'INPUT' || 
             activeElement.tagName === 'TEXTAREA' || 
             activeElement.isContentEditable
           );
           
           if (isEditing) return;
           
           e.preventDefault();
           if (confirm('Xóa panel này khỏi tree? Tất cả panel con cũng sẽ bị xóa.')) {
             if (window.deleteEvent) {
               window.deleteEvent(selectedPanelId);
             }
           }
         }
       });
      
      function renderPanelTree() {
        const treeContainer = document.getElementById('panel-tree');
        treeContainer.innerHTML = '';
        panelTreeData.forEach(node => {
          treeContainer.appendChild(createTreeNode(node, 0));
        });
      }
      
      function createTreeNode(node, depth) {
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'tree-node';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'tree-node-content';
        if (selectedPanelId === node.panel_id) {
          contentDiv.classList.add('selected');
        }
        
        const expandIcon = document.createElement('span');
        expandIcon.className = 'tree-expand';
        if (node.item_category === 'PANEL') {
          if (node.children && node.children.length > 0) {
            expandIcon.textContent = '▶';
          } else {
            expandIcon.textContent = '';
            expandIcon.style.visibility = 'hidden';
          }
        } else {
          expandIcon.style.display = 'none';
        }
        contentDiv.appendChild(expandIcon);
        
        const nodeDot = document.createElement('span');
        nodeDot.className = 'tree-node-dot';
        if (node.item_category === 'ACTION') {
          nodeDot.style.marginLeft = '12px';
        }
        
        const dotColor = node.item_category === 'PANEL' ? '#00C853' : '#F44336';
        
        if (node.status === 'completed') {
          nodeDot.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
            '<circle cx="12" cy="12" r="10" fill="' + dotColor + '"/>' +
            '<path d="M9 12l2 2 4-4" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>';
        } else {
          nodeDot.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
            '<circle cx="12" cy="12" r="10" fill="' + dotColor + '"/>' +
            '</svg>';
        }
        contentDiv.appendChild(nodeDot);
        
        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = node.panel_name || 'Panel';
        contentDiv.appendChild(label);
        
        nodeDiv.appendChild(contentDiv);
        
        if (node.children && node.children.length > 0) {
          const childrenDiv = document.createElement('div');
          childrenDiv.className = 'tree-children';
          
          if (depth === 0) {
            childrenDiv.classList.add('level-1');
          } else {
            childrenDiv.classList.add('level-2');
          }
          
          if (expandedPanels.has(node.panel_id)) {
            childrenDiv.classList.add('expanded');
            expandIcon.textContent = '▼';
          }
          
          node.children.forEach(child => {
            childrenDiv.appendChild(createTreeNode(child, depth + 1));
          });
          nodeDiv.appendChild(childrenDiv);
          
          expandIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            childrenDiv.classList.toggle('expanded');
            expandIcon.textContent = childrenDiv.classList.contains('expanded') ? '▼' : '▶';
            
            if (childrenDiv.classList.contains('expanded')) {
              expandedPanels.add(node.panel_id);
            } else {
              expandedPanels.delete(node.panel_id);
            }
          });
        }
        
        contentDiv.addEventListener('click', () => {
          if (window.selectPanel) {
            window.selectPanel(node.panel_id);
          }
        });
        
        contentDiv.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showContextMenu(e.clientX, e.clientY, node.panel_id, node.status, node.name, node.item_category);
        });
        
        return nodeDiv;
      }
      
      function showContextMenu(x, y, panelId, status, nodeName, itemCategory) {
        const existingMenu = document.getElementById('tree-context-menu');
        if (existingMenu) {
          existingMenu.remove();
        }
        
        const isRootPanel = (nodeName === 'After Login Panel');
        
        const menu = document.createElement('div');
        menu.id = 'tree-context-menu';
        menu.style.cssText = \`
          position: fixed;
          left: \${x}px;
          top: \${y}px;
          background: #fff;
          border: 1px solid #ccc;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          z-index: 10000;
          min-width: 150px;
        \`;
        
        const renameOption = document.createElement('div');
        renameOption.textContent = '✏️ Rename Panel';
        renameOption.style.cssText = \`
          padding: 8px 12px;
          cursor: pointer;
          font-size: 14px;
        \`;
        renameOption.addEventListener('mouseenter', () => {
          renameOption.style.background = '#f0f0f0';
        });
        renameOption.addEventListener('mouseleave', () => {
          renameOption.style.background = 'transparent';
        });
        renameOption.addEventListener('click', async () => {
          menu.remove();
          const newName = prompt('Nhập tên mới cho panel:');
          if (newName && newName.trim()) {
            if (window.renamePanel) {
              await window.renamePanel(panelId, newName.trim());
            }
          }
        });
        
        menu.appendChild(renameOption);
        
        if (itemCategory === 'ACTION') {
          const renameByAIOption = document.createElement('div');
          renameByAIOption.textContent = '🤖 Rename by AI';
          renameByAIOption.style.cssText = \`
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            border-top: 1px solid #eee;
          \`;
          renameByAIOption.addEventListener('mouseenter', () => {
            renameByAIOption.style.background = '#f0f0f0';
          });
          renameByAIOption.addEventListener('mouseleave', () => {
            renameByAIOption.style.background = 'transparent';
          });
          renameByAIOption.addEventListener('click', async () => {
            menu.remove();
            showToast('🤖 Đang phân tích...');
            if (window.renameActionByAI) {
              await window.renameActionByAI(panelId);
            }
          });
          menu.appendChild(renameByAIOption);
        }
        
        const deleteOption = document.createElement('div');
        deleteOption.textContent = '🗑️ Delete Panel';
        deleteOption.style.cssText = \`
          padding: 8px 12px;
          cursor: pointer;
          font-size: 14px;
          border-top: 1px solid #eee;
        \`;
        deleteOption.addEventListener('mouseenter', () => {
          deleteOption.style.background = '#f0f0f0';
        });
        deleteOption.addEventListener('mouseleave', () => {
          deleteOption.style.background = 'transparent';
        });
        deleteOption.addEventListener('click', () => {
          menu.remove();
          if (confirm('Xóa panel này khỏi tree? Tất cả panel con cũng sẽ bị xóa.')) {
            if (window.deleteEvent) {
              window.deleteEvent(panelId);
            }
          }
        });
        
        menu.appendChild(renameOption);
        
        if (status !== 'completed') {
          const markDoneOption = document.createElement('div');
          markDoneOption.textContent = '✓ Mark as Done';
          markDoneOption.style.cssText = \`
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            border-top: 1px solid #eee;
          \`;
          markDoneOption.addEventListener('mouseenter', () => {
            markDoneOption.style.background = '#f0f0f0';
          });
          markDoneOption.addEventListener('mouseleave', () => {
            markDoneOption.style.background = 'transparent';
          });
          markDoneOption.addEventListener('click', async () => {
            menu.remove();
            if (window.markAsDone) {
              await window.markAsDone(panelId);
            }
          });
          menu.appendChild(markDoneOption);
        }
        
        if (!isRootPanel) {
          menu.appendChild(deleteOption);
        }
        
        document.body.appendChild(menu);
        
        const closeMenu = (e) => {
          if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
          }
        };
        
        setTimeout(() => {
          document.addEventListener('click', closeMenu);
        }, 0);
      }
      
      function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = \`
          position: fixed;
          top: 15px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 8px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          z-index: 10000000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          max-width: 90%;
          word-wrap: break-word;
        \`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
          toast.remove();
        }, 1500);
      }
      
      function addClickEventToView(evt) {
        const clickDiv = document.createElement('div');
        clickDiv.className = 'event';
        clickDiv.style.position = 'relative';
        clickDiv.setAttribute('data-timestamp', evt.timestamp);
        clickDiv.setAttribute('data-event-type', 'click');
        
        const resetBtn = document.createElement('button');
        resetBtn.className = 'reset-panel-btn';
        resetBtn.style.position = 'absolute';
        resetBtn.style.top = '10px';
        resetBtn.style.left = '10px';
        resetBtn.style.width = '24px';
        resetBtn.style.height = '24px';
        resetBtn.style.background = 'rgba(255, 152, 0, 0.9)';
        resetBtn.style.color = 'white';
        resetBtn.style.border = 'none';
        resetBtn.style.borderRadius = '50%';
        resetBtn.style.cursor = 'pointer';
        resetBtn.style.fontSize = '16px';
        resetBtn.style.fontWeight = 'bold';
        resetBtn.style.display = 'flex';
        resetBtn.style.alignItems = 'center';
        resetBtn.style.justifyContent = 'center';
        resetBtn.style.zIndex = '10';
        resetBtn.textContent = '↺';
        resetBtn.title = 'Delete click event';
        resetBtn.addEventListener('click', async () => {
          if (confirm('Xóa click event này?')) {
            if (window.deleteClickEvent) {
              await window.deleteClickEvent(evt.timestamp, selectedPanelId);
            }
            clickDiv.remove();
          }
        });
        clickDiv.appendChild(resetBtn);
        
        const clickInfo = document.createElement('div');
        clickInfo.className = 'screen';
        clickInfo.innerHTML = '<strong>Clicked:</strong> ' + evt.element_name;
        clickDiv.appendChild(clickInfo);
        
        const typeDiv = document.createElement('div');
        typeDiv.className = 'screen';
        typeDiv.innerHTML = '<strong>type:</strong> ' + evt.element_tag;
        clickDiv.appendChild(typeDiv);
        
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'timestamp';
        timestampDiv.textContent = new Date(evt.timestamp).toLocaleTimeString();
        clickDiv.appendChild(timestampDiv);
        
        insertEventSorted(clickDiv);
      }
      
      function insertEventSorted(newEventDiv) {
        const newTimestamp = parseInt(newEventDiv.getAttribute('data-timestamp'));
        const existingEvents = Array.from(container.children);
        
        let inserted = false;
        for (let i = 0; i < existingEvents.length; i++) {
          const existingTimestamp = parseInt(existingEvents[i].getAttribute('data-timestamp') || '0');
          if (newTimestamp > existingTimestamp) {
            container.insertBefore(newEventDiv, existingEvents[i]);
            inserted = true;
            break;
          }
        }
        
        if (!inserted) {
          container.appendChild(newEventDiv);
        }
      }
      
      async function handleTriggerCapture(mode) {
        if (!selectedPanelId) {
          showToast('⚠️ Vui lòng chọn panel trong tree trước khi capture!');
          return;
        }
        
        if (window.manualCaptureAI) {
          window.manualCaptureAI();
        }
      }
      
      async function handlePanelSelected(evt) {
        selectedPanelId = evt.panel_id;
        renderPanelTree();
        
        const findNodeInTree = (nodes, itemId) => {
          for (const node of nodes) {
            if (node.panel_id === itemId) return node;
            if (node.children) {
              const found = findNodeInTree(node.children, itemId);
              if (found) return found;
            }
          }
          return null;
        };
        
        const selectedNode = findNodeInTree(panelTreeData, selectedPanelId);
        
        const clearAllClicksBtn = document.getElementById('clearAllClicksBtn');
        
        const importCookiesBtn = document.getElementById('importCookiesBtn');
        
        if (selectedNode) {
          if (selectedNode.item_category === 'PANEL') {
            detectActionsGeminiBtn.style.display = 'inline-block';
            captureActionsDOMBtn.style.display = 'inline-block';
            drawPanelBtn.style.display = 'none';
            clearAllClicksBtn.style.display = 'none';
            importCookiesBtn.style.display = 'none';
          } else if (selectedNode.item_category === 'ACTION') {
            detectActionsGeminiBtn.style.display = 'none';
            captureActionsDOMBtn.style.display = 'none';
            drawPanelBtn.style.display = 'inline-block';
            clearAllClicksBtn.style.display = 'inline-block';
            importCookiesBtn.style.display = 'none';
          }
        } else {
          detectActionsGeminiBtn.style.display = 'none';
          captureActionsDOMBtn.style.display = 'none';
          drawPanelBtn.style.display = 'none';
          clearAllClicksBtn.style.display = 'none';
          importCookiesBtn.style.display = 'inline-block';
        }
        
        const existingCaptureEvent = container.querySelector('.event[data-event-type="capture"]');
        if (existingCaptureEvent) {
          existingCaptureEvent.remove();
        }
        
        const existingStepEvent = container.querySelector('.event[data-event-type="step"]');
        if (existingStepEvent) {
          existingStepEvent.remove();
        }
        
        if (!evt.panel_id) {
          const existingClickEvents = Array.from(container.querySelectorAll('.event[data-event-type="click"]'));
          existingClickEvents.forEach(el => el.remove());
          return;
        }
        
        if (evt.screenshot) {
          const panelDiv = document.createElement('div');
          panelDiv.className = 'event';
          panelDiv.style.position = 'relative';
          panelDiv.setAttribute('data-timestamp', evt.timestamp || Date.now());
          panelDiv.setAttribute('data-event-type', 'capture');
          
          if (evt.panel_id) {
            const resetBtn = document.createElement('button');
            resetBtn.className = 'reset-panel-btn';
            resetBtn.style.position = 'absolute';
            resetBtn.style.top = '10px';
            resetBtn.style.left = '10px';
            resetBtn.style.width = '26px';
            resetBtn.style.height = '26px';
            resetBtn.style.background = 'rgba(255, 152, 0, 0.9)';
            resetBtn.style.color = 'white';
            resetBtn.style.border = 'none';
            resetBtn.style.borderRadius = '50%';
            resetBtn.style.cursor = 'pointer';
            resetBtn.style.fontSize = '18px';
            resetBtn.style.fontWeight = 'bold';
            resetBtn.style.display = 'flex';
            resetBtn.style.alignItems = 'center';
            resetBtn.style.justifyContent = 'center';
            resetBtn.style.zIndex = '10';
            resetBtn.style.transition = 'all 0.2s ease';
            resetBtn.style.boxShadow = '0 2px 5px rgba(255,152,0,0.3)';
            resetBtn.setAttribute('data-panel-id', evt.panel_id);
            resetBtn.title = 'Reset panel về pending';
            resetBtn.textContent = '↺';
            resetBtn.addEventListener('mouseenter', () => {
              resetBtn.style.background = 'rgba(255, 152, 0, 1)';
              resetBtn.style.transform = 'scale(1.1)';
              resetBtn.style.boxShadow = '0 3px 8px rgba(255,152,0,0.4)';
            });
            resetBtn.addEventListener('mouseleave', () => {
              resetBtn.style.background = 'rgba(255, 152, 0, 0.9)';
              resetBtn.style.transform = 'scale(1)';
              resetBtn.style.boxShadow = '0 2px 5px rgba(255,152,0,0.3)';
            });
            resetBtn.addEventListener('click', async () => {
              if (isGeminiDetecting) {
                showToast('⚠️ Đang detect/capture, không thể reset!');
                return;
              }
              
              if (resetBtn.disabled) {
                showToast('⚠️ Đang reset, vui lòng đợi...');
                return;
              }
              
              if (!confirm('Reset panel này về pending? Sẽ xóa screenshot và tất cả panel con.')) {
                return;
              }
              
              resetBtn.disabled = true;
              resetBtn.style.opacity = '0.6';
              resetBtn.style.cursor = 'not-allowed';
              resetBtn.style.pointerEvents = 'none';
              const originalText = resetBtn.textContent;
              resetBtn.textContent = '⏳';
              
              try {
                if (window.resetPanel) {
                  await window.resetPanel(evt.panel_id);
                }
              } catch (err) {
                console.error('Reset failed:', err);
                showToast('❌ Reset thất bại!');
              } finally {
                resetBtn.disabled = false;
                resetBtn.style.opacity = '1';
                resetBtn.style.cursor = 'pointer';
                resetBtn.style.pointerEvents = 'auto';
                resetBtn.textContent = originalText;
              }
            });
            panelDiv.appendChild(resetBtn);
          }
          
          const img = document.createElement('img');
          img.src = 'data:image/png;base64,' + evt.screenshot;
          img.alt = 'Panel Screenshot';
          img.className = 'event-screenshot';
          img.addEventListener('click', () => {
            document.getElementById('modalImage').src = img.src;
            document.getElementById('imageModal').classList.add('show');
          });
          panelDiv.appendChild(img);
          
          const hasActions = evt.actions && evt.actions.length > 0;
          const isDetecting = evt.gemini_detecting === true;
          
          if (evt.screenshot && window.openPanelEditor && (hasActions || isDetecting)) {
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-action-btn';
            
            if (isDetecting) {
              editBtn.textContent = '⏳ Loading...';
              editBtn.disabled = true;
              editBtn.style.opacity = '0.6';
              editBtn.style.cursor = 'not-allowed';
              editBtn.style.pointerEvents = 'none';
        } else {
              editBtn.textContent = '✏️ Edit Actions';
            }
            
            editBtn.addEventListener('click', async () => {
              if (editBtn.disabled) {
                showToast('⚠️ Đang mở editor, vui lòng đợi...');
                return;
              }
              
              editBtn.disabled = true;
              editBtn.style.opacity = '0.6';
              editBtn.style.cursor = 'not-allowed';
              editBtn.style.pointerEvents = 'none';
              const originalText = editBtn.textContent;
              editBtn.textContent = '⏳ Opening...';
              
              try {
                await window.openPanelEditor();
              } catch (err) {
                console.error('Open editor failed:', err);
                showToast('❌ Không mở được editor!');
              } finally {
                editBtn.disabled = false;
                editBtn.style.opacity = '1';
                editBtn.style.cursor = 'pointer';
                editBtn.style.pointerEvents = 'auto';
                editBtn.textContent = originalText;
              }
            });
            panelDiv.appendChild(editBtn);
          }
          
          if (evt.action_info) {
            const actionInfoDiv = document.createElement('div');
            actionInfoDiv.className = 'screen';
            actionInfoDiv.style.background = '#f0f8ff';
            actionInfoDiv.style.padding = '8px';
            actionInfoDiv.style.borderRadius = '4px';
            actionInfoDiv.style.marginTop = '5px';
            
            let infoHtml = '<strong>Action Info:</strong><br>' +
              '• Name: ' + evt.action_info.name + '<br>' +
              '• Type: ' + evt.action_info.type + '<br>' +
              '• Verb: ' + evt.action_info.verb;
            
            if (evt.action_info.content) {
              infoHtml += '<br>• Content: ' + evt.action_info.content;
            }
            
            infoHtml += '<br>• Position: (' + evt.action_info.position.x + ',' + evt.action_info.position.y + ',' + 
              evt.action_info.position.w + ',' + evt.action_info.position.h + ')';
            
            actionInfoDiv.innerHTML = infoHtml;
            panelDiv.appendChild(actionInfoDiv);
          }
          
          if (evt.actions && evt.actions.length > 0) {
            const countDiv = document.createElement('div');
            countDiv.className = 'screen';
            countDiv.innerHTML = '<strong>Action Count:</strong> ' + evt.actions.length;
            panelDiv.appendChild(countDiv);
          }
          
          if (evt.action_list) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'screen';
            actionsDiv.innerHTML = '<strong>Actions:</strong> ' + evt.action_list;
            panelDiv.appendChild(actionsDiv);
          }
          
          insertEventSorted(panelDiv);
        } else {
          if (evt.item_category === 'ACTION' && evt.action_info && evt.action_info.step_info) {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'event';
            stepDiv.style.position = 'relative';
            stepDiv.style.background = '#e8f5e9';
            stepDiv.style.border = '2px solid #4caf50';
            stepDiv.setAttribute('data-event-type', 'step');
            
            const resetStepBtn = document.createElement('button');
            resetStepBtn.className = 'reset-panel-btn';
            resetStepBtn.style.position = 'absolute';
            resetStepBtn.style.top = '10px';
            resetStepBtn.style.left = '10px';
            resetStepBtn.style.width = '24px';
            resetStepBtn.style.height = '24px';
            resetStepBtn.style.background = 'rgba(255, 152, 0, 0.9)';
            resetStepBtn.style.color = 'white';
            resetStepBtn.style.border = 'none';
            resetStepBtn.style.borderRadius = '50%';
            resetStepBtn.style.cursor = 'pointer';
            resetStepBtn.style.fontSize = '16px';
            resetStepBtn.style.fontWeight = 'bold';
            resetStepBtn.style.display = 'flex';
            resetStepBtn.style.alignItems = 'center';
            resetStepBtn.style.justifyContent = 'center';
            resetStepBtn.style.zIndex = '10';
            resetStepBtn.textContent = '↺';
            resetStepBtn.title = 'Reset để draw lại';
            resetStepBtn.addEventListener('click', async () => {
              if (confirm('Reset action này để draw/use before lại?')) {
                if (window.resetActionStep) {
                  await window.resetActionStep(evt.panel_id);
                  if (window.selectPanel) {
                    await window.selectPanel(evt.panel_id);
                  }
                  showToast('✅ Đã reset action');
                }
              }
            });
            stepDiv.appendChild(resetStepBtn);
            
            const stepInfo = document.createElement('div');
            stepInfo.className = 'screen';
            stepInfo.style.paddingLeft = '10px';
            
            if (evt.action_info.step_info.mode === 'DRAW_NEW') {
              stepInfo.innerHTML = '<strong>Drawed new panel:</strong> "' + evt.action_info.step_info.panel_after_name + '"';
        } else {
              stepInfo.innerHTML = '<strong>Used before panel:</strong> "' + evt.action_info.step_info.panel_after_name + '"';
            }
            
            stepDiv.appendChild(stepInfo);
            insertEventSorted(stepDiv);
          } else {
            const needCapture = document.createElement('div');
            needCapture.className = 'event';
            needCapture.setAttribute('data-event-type', 'capture');
            
            let icon, message;
            if (evt.item_category === 'PANEL') {
              icon = '🔍';
              message = 'Need Detect Actions';
            } else if (evt.item_category === 'ACTION') {
              icon = '🖼️';
              message = 'Need Draw Panel';
            } else {
              icon = '📸';
              message = 'Need screenshot';
            }
            
            needCapture.innerHTML = '<div class="screen" style="text-align:center;padding:40px;"><strong>' + icon + ' ' + message + '</strong></div>';
            insertEventSorted(needCapture);
          }
        }
        
        if (window.getClickEventsForPanel) {
          const clickEvents = await window.getClickEventsForPanel(evt.panel_id);
          const existingClickEvents = Array.from(container.querySelectorAll('.event[data-event-type="click"]'));
          existingClickEvents.forEach(el => el.remove());
          
          if (clickEvents && Array.isArray(clickEvents)) {
            clickEvents.forEach(clickEvent => {
              addClickEventToView(clickEvent);
            });
          }
        }
      }
      
      async function loadInitialTree() {
        if (window.getPanelTree) {
          panelTreeData = await window.getPanelTree();
          renderPanelTree();
        }
      }
      
      setTimeout(loadInitialTree, 1000);
    </script>
  </body>
</html>
`;

