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
        width: 20%;
        min-width: 200px;
        max-width: 60%;
        border-right: 1px solid #e0e0e0;
        background: white;
        overflow-y: auto;
        padding: 10px 0 10px 0;
        position: relative;
      }
      
      #panel-log-resizer {
        position: absolute;
        top: 0;
        right: -6px;
        width: 12px;
        height: 100%;
        cursor: col-resize;
        background: transparent;
        z-index: 1000;
        user-select: none;
        touch-action: none;
        pointer-events: auto;
      }
      
      #panel-log-resizer:hover {
        background: rgba(0, 123, 255, 0.1);
      }
      
      #panel-log-resizer.resizing {
        background: rgba(0, 123, 255, 0.2);
      }
      
      #panel-log-resizer::before {
        content: '';
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #ccc;
        transform: translateX(-50%);
        transition: all 0.2s ease;
      }
      
      #panel-log-resizer:hover::before {
        background: #007bff;
        width: 3px;
      }
      
      #panel-log-resizer.resizing::before {
        background: #007bff;
        width: 4px;
      }
      
      #panel-tree-container h3 {
        margin: 0 0 10px 0;
        padding: 0 10px;
        font-size: 14px;
        color: #666;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: relative;
      }
      
      #panel-log-refresh-btn {
        background: transparent;
        color: #666;
        border: none;
        border-radius: 6px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: color 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      
      #panel-log-refresh-btn:hover {
        color: #007bff;
      }
      
      #panel-log-refresh-btn:active {
        transform: scale(0.95);
      }
      
      #panel-log-refresh-btn.loading {
        opacity: 0.6;
        cursor: not-allowed;
        pointer-events: none;
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
        width: 12px;
        height: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: 0px;
        font-size: 10px;
        cursor: pointer;
      }
      
      .tree-node-dot {
        margin-right: 4px;
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
        padding-left: 4px;
      }
      
      .tree-children.level-2 {
        padding-left: 4px;
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

      #saveBtn.has-changes {
        background: #007bff !important;
        opacity: 1 !important;
      }

      #saveBtn.has-changes:hover {
        background: #0056d2 !important;
      }

      #saveBtn.no-changes {
        background: #6c757d !important;
        opacity: 1 !important;
      }

      #saveBtn.no-changes:hover {
        background: #5a6268 !important;
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
        right: 10px;
        left: auto;
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

      .compare-btn {
        background: linear-gradient(135deg, #ffa726 0%, #fb8c00 100%);
        color: white;
        box-shadow: 0 2px 8px rgba(255, 167, 38, 0.3);
      }

      .compare-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255, 167, 38, 0.5);
      }

      #editor-status {
        position: fixed;
        top: 50px;
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
        border-radius: 2px;
      }

      .checkpoint-item {
        background: #f8f9fa;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 12px;
        transition: all 0.2s ease;
      }

      .checkpoint-item:hover {
        background: #f0f0f0;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .checkpoint-item-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 10px;
      }

      .checkpoint-item-title {
        font-weight: 600;
        font-size: 16px;
        color: #333;
        margin-bottom: 4px;
      }

      .checkpoint-item-time {
        font-size: 12px;
        color: #666;
        margin-bottom: 4px;
      }

      .checkpoint-item-description {
        font-size: 13px;
        color: #555;
        margin-bottom: 8px;
        font-style: italic;
      }

      .checkpoint-item-meta {
        font-size: 11px;
        color: #999;
        margin-bottom: 10px;
      }

      .checkpoint-item-actions {
        display: flex;
        gap: 8px;
      }

      .checkpoint-rollback-btn {
        background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: all 0.2s ease;
      }

      .checkpoint-rollback-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(220, 53, 69, 0.4);
      }

      .checkpoint-status {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        margin-left: 8px;
      }

      .checkpoint-status.local {
        background: #28a745;
        color: white;
      }

      .checkpoint-status.db {
        background: #007bff;
        color: white;
      }

      .checkpoint-status.rolledback {
        background: #6c757d;
        color: white;
      }

      #saveReminderModal {
        animation: fadeIn 0.3s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      #saveReminderSaveBtn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,123,255,0.5);
      }

      #saveReminderLaterBtn:hover {
        background: #5a6268;
        transform: translateY(-2px);
      }

      #select-panel-container {
        display: none;
      }

      #select-panel-container.show {
        display: flex;
      }

      #select-panel-sidebar {
        overflow-y: auto;
      }

      #select-panel-draw-new:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255,179,217,0.5);
      }

      .select-panel-item {
        padding: 10px 12px;
        margin: 4px 0;
        background: rgba(255,255,255,0.05);
        border-radius: 6px;
        cursor: pointer;
        color: #aaa;
        font-size: 13px;
        transition: all 0.2s ease;
        border: 1px solid transparent;
      }

      .select-panel-item:hover {
        background: rgba(255,255,255,0.1);
        color: #fff;
      }

      .select-panel-item.selected {
        background: rgba(0,123,255,0.2);
        border-color: #007bff;
        color: #fff;
      }

      .select-panel-item-name {
        font-weight: 600;
        margin-bottom: 4px;
      }

      .select-panel-item-status {
        font-size: 11px;
        opacity: 0.7;
      }

      #select-panel-save:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(58,71,213,0.5);
      }

      #select-panel-pagination button {
        transition: all 0.2s ease;
      }

      #select-panel-pagination button:hover:not(:disabled) {
        background: rgba(255,255,255,0.2) !important;
        transform: translateY(-1px);
      }

      #select-panel-pagination button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
      
    </style>
  </head>
  <body>
    <div id="main-container">
      <div id="panel-tree-container">
        <h3>
          <span>Panel Log</span>
          <button id="panel-log-refresh-btn" title="Refresh Panel Log">🔄</button>
        </h3>
        <div id="panel-tree"></div>
        <div id="panel-log-resizer"></div>
      </div>
      
      <div id="content-container">
    <div id="controls">
      <button id="captureActionsDOMBtn" style="display:none; background:#007bff;">📸 Detect Action</button>
      <button id="drawPanelAndDetectActionsBtn" style="display:none; background:#007bff;">🎨 Draw Panel & Detect Actions</button>
      <button id="detectPagesBtn" style="display:none; background:#007bff;">📄 Detect Pages (Old)</button>
      <button id="drawPanelBtn" style="display:none !important;">🖼️ Draw Panel</button>
      <button id="importCookiesBtn" style="display:inline-block;">🍪 Import Cookies</button>
      <input type="file" id="cookieFileInput" accept=".json" style="display:none;">
      <button id="saveBtn" style="background:#007bff;">💾 Save</button>
      <button id="checkpointBtn" style="background:#28a745;">↩️ Rollback</button>
      <button id="quitBtn" style="background:#007bff;">🚪 Quit</button>
      <button id="detectActionsGeminiBtn" style="display:none; background:white; color:#007bff; border:1px solid #007bff; padding:3px 6px; font-size:9px;">🤖 Detect Action Backup</button>
    </div>
    
    <div id="drawPanelMenu" style="display:none; position:absolute; background:white; border:1px solid #ddd; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:10000; padding:4px;">
      <button class="draw-panel-option" data-mode="DRAW_NEW" style="display:block; width:100%; padding:10px 20px; border:none; background:white; text-align:left; cursor:pointer; font-size:14px; border-radius:3px;">📝 CREATE NEW PANEL</button>
      <button class="draw-panel-option" data-mode="USE_BEFORE" style="display:block; width:100%; padding:10px 20px; border:none; background:white; text-align:left; cursor:pointer; font-size:14px; border-radius:3px; margin-top:2px;">🔄 USE CURRENT PANEL</button>
    </div>
    
    <button id="clearAllClicksBtn" style="display:none; margin:10px; padding:8px 16px; background:#ff9800; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600;">🗑️ Clear All Clicks</button>

    <div id="events"></div>
      </div>
    </div>

    <div id="imageModal">
      <span class="close">&times;</span>
      <img id="modalImage" src="" alt="Full size screenshot">
    </div>

    <div id="checkpointModal" style="display:none; position:fixed; z-index:20000; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:20px; max-width:800px; max-height:80vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.3); position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #e0e0e0; padding-bottom:10px;">
          <h3 style="margin:0; font-size:20px; color:#333;">📋 Checkpoints</h3>
          <button id="closeCheckpointModal" style="background:none; border:none; font-size:28px; cursor:pointer; color:#666; padding:0; width:30px; height:30px; line-height:1;">&times;</button>
        </div>
        <div id="checkpointList" style="min-height:200px;">
          <div style="text-align:center; padding:40px; color:#999;">Loading checkpoints...</div>
        </div>
      </div>
    </div>

    <div id="saveReminderModal" style="display:none; position:fixed; z-index:20001; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:30px; max-width:500px; box-shadow:0 4px 20px rgba(0,0,0,0.3); position:relative;">
        <div style="text-align:center; margin-bottom:25px;">
          <div style="font-size:48px; margin-bottom:15px;">💾</div>
          <h3 style="margin:0 0 10px 0; font-size:20px; color:#333;">Nhắc nhở lưu dữ liệu</h3>
          <p id="saveReminderMessage" style="margin:0; font-size:14px; color:#666; line-height:1.6;">
            Bạn có thay đổi chưa được lưu từ <span id="saveReminderMinutes">0</span> phút trước. Bạn có muốn lưu ngay không?
          </p>
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button id="saveReminderSaveBtn" style="background:linear-gradient(135deg, #007bff 0%, #0056d2 100%); color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(0,123,255,0.3);">
            Đồng ý
          </button>
          <button id="saveReminderLaterBtn" style="background:#6c757d; color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease;">
            Để sau
          </button>
        </div>
      </div>
    </div>

    <div id="select-panel-container" style="display:none; position:fixed; z-index:20002; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.95); flex-direction:row;">
      <div id="select-panel-sidebar" style="width:300px; background:rgba(26, 26, 26, 0.95); border-right:1px solid rgba(255,255,255,0.1); display:flex; flex-direction:column; overflow:hidden;">
        <button id="select-panel-draw-new" style="margin:15px; padding:12px 16px; background:linear-gradient(135deg, #ffb3d9 0%, #ff99cc 100%); color:#333; border:none; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; text-align:center; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(255,179,217,0.3);">
          DRAW NEW PANEL
        </button>
        <div id="select-panel-list" style="flex:1; overflow-y:auto; padding:10px;">
          <div style="text-align:center; padding:20px; color:#aaa; font-size:13px;">Loading panels...</div>
        </div>
      </div>
      <div id="select-panel-preview" style="flex:1; position:relative; display:flex; justify-content:center; align-items:center; overflow:auto; padding:20px;">
        <div id="select-panel-canvas-wrapper" style="display:flex; justify-content:center; align-items:center; width:100%; height:100%;">
          <canvas id="select-panel-canvas" style="box-shadow:0 0 30px rgba(0,0,0,0.7); border-radius:2px; max-width:100%; max-height:100%;"></canvas>
        </div>
      </div>
      <div id="select-panel-pagination" style="position:absolute; bottom:20px; left:50%; transform:translateX(-50%); display:none; align-items:center; gap:15px; z-index:1000; background:rgba(26, 26, 26, 0.9); padding:10px 20px; border-radius:8px; border:1px solid rgba(255,255,255,0.2);">
        <button id="select-panel-prev-page" style="padding:8px 16px; background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.3); border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; transition:all 0.2s ease;">◀ Prev</button>
        <div id="select-panel-page-indicator" style="font-weight:bold; font-size:14px; color:#00ffff; text-shadow:0 0 10px rgba(0,255,255,0.5); min-width:80px; text-align:center;">Page 1/1</div>
        <button id="select-panel-next-page" style="padding:8px 16px; background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.3); border-radius:6px; cursor:pointer; font-size:13px; font-weight:600; transition:all 0.2s ease;">Next ▶</button>
      </div>
      <div id="select-panel-toolbar" style="position:absolute; top:20px; right:20px; display:flex; gap:10px; z-index:1000;">
        <button id="select-panel-save" style="padding:12px 24px; background:linear-gradient(135deg, #00d2ff 0%, #3a47d5 100%); color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(58,71,213,0.3);">
          💾 SAVE
        </button>
        <button id="select-panel-cancel" style="padding:12px 24px; background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.3); border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease;">
          ❌ CANCEL
        </button>
      </div>
    </div>

    <script>
      // Panel Log Resizer - Initialize when DOM is ready
      (function initPanelLogResizer() {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        function setupResizer() {
          const panelTreeContainer = document.getElementById('panel-tree-container');
          const resizer = document.getElementById('panel-log-resizer');
          const mainContainer = document.getElementById('main-container');
          
          if (!panelTreeContainer || !resizer || !mainContainer) {
            console.warn('Panel log resizer elements not found, retrying...');
            setTimeout(setupResizer, 100);
            return;
          }
          
          console.log('✅ Panel log resizer initialized');
        
          // Helper function to safely access localStorage
          function getLocalStorage(key) {
            try {
              return localStorage.getItem(key);
            } catch (e) {
              console.warn('localStorage not available:', e.message);
              return null;
            }
          }
          
          function setLocalStorage(key, value) {
            try {
              localStorage.setItem(key, value);
            } catch (e) {
              console.warn('localStorage not available:', e.message);
            }
          }
        
          // Set initial width: 400px or 20% (prefer 400px if possible)
          const savedWidth = getLocalStorage('panel-log-width');
          if (savedWidth) {
            const width = parseInt(savedWidth, 10);
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.6;
            if (width >= minWidth && width <= maxWidth) {
              panelTreeContainer.style.width = width + 'px';
            } else if (width < minWidth) {
              panelTreeContainer.style.width = minWidth + 'px';
            } else {
              panelTreeContainer.style.width = maxWidth + 'px';
            }
          } else {
            // No saved width, use 400px or 20% (prefer 400px, but cap at 20%)
            const preferredWidth = 400;
            const percentWidth = window.innerWidth * 0.2;
            // Use 400px if it's within 20%, otherwise use 20%
            const initialWidth = preferredWidth <= percentWidth ? preferredWidth : percentWidth;
            panelTreeContainer.style.width = initialWidth + 'px';
          }
          
          // Handle window resize
          window.addEventListener('resize', () => {
            const currentWidth = panelTreeContainer.offsetWidth;
            const maxWidth = window.innerWidth * 0.6;
            if (currentWidth > maxWidth) {
              panelTreeContainer.style.width = maxWidth + 'px';
              setLocalStorage('panel-log-width', maxWidth.toString());
            }
          });
          
          // Ensure resizer can receive events
          resizer.style.pointerEvents = 'auto';
          resizer.style.touchAction = 'none';
          
          // Test if resizer is clickable
          resizer.addEventListener('click', (e) => {
            console.log('✅ Resizer is clickable');
          });
          
          // Mouse down handler
          resizer.addEventListener('mousedown', (e) => {
            console.log('🖱️ Resizer mousedown at', e.clientX, e.clientY);
            isResizing = true;
            startX = e.clientX;
            startWidth = panelTreeContainer.offsetWidth;
            resizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
            e.stopPropagation();
            return false;
          });
          
          // Mouse move handler
          const handleMouseMove = (e) => {
            if (!isResizing) return;
            
            const diff = e.clientX - startX;
            const newWidth = startWidth + diff;
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.6;
            
            if (newWidth >= minWidth && newWidth <= maxWidth) {
              panelTreeContainer.style.width = newWidth + 'px';
            }
            e.preventDefault();
            return false;
          };
          
          document.addEventListener('mousemove', handleMouseMove, { passive: false });
          
          // Mouse up handler
          const handleMouseUp = (e) => {
            if (isResizing) {
              console.log('🖱️ Resizer mouseup');
              isResizing = false;
              resizer.classList.remove('resizing');
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
              
              // Save width to localStorage (with error handling)
              const currentWidth = panelTreeContainer.offsetWidth;
              setLocalStorage('panel-log-width', currentWidth.toString());
              console.log('💾 Saved panel width:', currentWidth + 'px');
              
              if (e) {
                e.preventDefault();
                e.stopPropagation();
              }
            }
          };
          
          document.addEventListener('mouseup', handleMouseUp, { passive: false });
          document.addEventListener('mouseleave', handleMouseUp); // Handle mouse leaving window
          
          // Also handle on the resizer itself
          resizer.addEventListener('mouseup', handleMouseUp);
          
          console.log('✅ Resizer event handlers attached');
        }
        
        // Start setup when DOM is ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', setupResizer);
        } else {
          // DOM already ready, but wait a bit to ensure all elements are rendered
          setTimeout(setupResizer, 50);
        }
      })();

      // Main code (keep existing structure for compatibility)
      const ws = new WebSocket('ws://localhost:8081');
      const container = document.getElementById('events');
      let panelTreeData = [];
      let selectedPanelId = null;
      let expandedPanels = new Set();
      let isDrawingPanel = false;
      let isGeminiDetecting = false;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('⚠️ WebSocket closed');
      };

      ws.onmessage = async (msg) => {
        const evt = JSON.parse(msg.data);
        
        if (evt.type === 'tree_update') {
          panelTreeData = evt.data || [];
          renderPanelTree();
          
          // Check for changes after panel log is loaded
          setTimeout(() => {
            if (window.checkForChanges) {
              window.checkForChanges().catch(err => {
                console.error('Error checking changes after tree update:', err);
              });
            } else {
              console.warn('checkForChanges function not available yet');
            }
          }, 500);
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

        if (evt.type === 'detect_pages_status') {
          isCapturing = !!evt.in_progress;
          window.__detectPagesInProgressQueue = isCapturing;
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
          
          const originalDrawPanelText = drawPanelBtn.textContent;
          drawPanelBtn.disabled = true;
          drawPanelBtn.style.opacity = '0.6';
          drawPanelBtn.style.cursor = 'not-allowed';
          drawPanelBtn.textContent = '⏳ Creating...';
          
          try {
            if (window.drawPanel) {
              const result = await window.drawPanel('DRAW_NEW');
              isDrawingPanel = false;
              drawPanelBtn.disabled = false;
              drawPanelBtn.style.opacity = '1';
              drawPanelBtn.style.cursor = 'pointer';
              drawPanelBtn.textContent = originalDrawPanelText;
            }
          } catch (err) {
            console.error('Draw panel error:', err);
            isDrawingPanel = false;
            drawPanelBtn.disabled = false;
            drawPanelBtn.style.opacity = '1';
            drawPanelBtn.style.cursor = 'pointer';
            drawPanelBtn.textContent = originalDrawPanelText;
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
            showToast('⚠️ Chỉ ACTION mới có thể Use CURRENT PANEL. Chọn lại ở Queue Browser');
            if (window.broadcastToast) await window.broadcastToast('⚠️ Chỉ ACTION mới có thể Use CURRENT PANEL. Chọn lại ở Queue Browser');
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
              showToast('✅ Marked as done với current panel');
              if (window.broadcastToast) await window.broadcastToast('✅ Marked as done với current panel');
              isDrawingPanel = false;
            }
          } catch (err) {
            console.error('Use current panel error:', err);
            isDrawingPanel = false;
          }
          return;
        }
        
        if (evt.type === 'show_toast') {
          showToast(evt.message);
          return;
        }
        
        if (evt.type === 'tree_loading_state') {
          const treeContainer = document.getElementById('panel-tree');
          if (treeContainer) {
            if (evt.loading) {
              treeContainer.style.pointerEvents = 'none';
              treeContainer.style.opacity = '0.5';
              
              if (evt.itemId) {
                const selector = '[data-panel-id="' + evt.itemId + '"]';
                const treeItem = treeContainer.querySelector(selector);
                if (treeItem) {
                  const nodeDot = treeItem.querySelector('.tree-node-dot');
                  if (nodeDot && !nodeDot.classList.contains('loading')) {
                    const dotColor = nodeDot.getAttribute('data-dot-color') || '#ff5252';
                    nodeDot.classList.add('loading');
                    nodeDot.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="animation: spin 1s linear infinite;"><style>@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style>' +
                      '<circle cx="12" cy="12" r="10" fill="none" stroke="' + dotColor + '" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"><animate attributeName="stroke-dashoffset" values="0;-62.8" dur="1s" repeatCount="indefinite"/></circle>' +
                      '</svg>';
                  }
                }
              }
            } else {
              treeContainer.style.pointerEvents = 'auto';
              treeContainer.style.opacity = '1';
              
              const loadingDot = treeContainer.querySelector('.tree-node-dot.loading');
              if (loadingDot) {
                const originalDot = loadingDot.getAttribute('data-original-dot');
                if (originalDot) {
                  loadingDot.innerHTML = originalDot;
                  loadingDot.classList.remove('loading');
                }
              }
            }
          }
          return;
        }
        
        if (evt.type === 'click_event') {
          if (evt.action_item_id === selectedPanelId) {
            addClickEventToView(evt);
          }
          return;
        }
        
        if (evt.type === 'save_btn_state') {
          console.log('Received save_btn_state event:', evt.hasChanges);
          updateSaveBtnState(evt.hasChanges);
          return;
        }

        if (evt.type === 'show_save_reminder') {
          console.log('🔔 [Save Reminder - Browser] Received show_save_reminder event, minutesElapsed:', evt.minutesElapsed);
          showSaveReminderDialog(evt.minutesElapsed);
          return;
        }

        if (evt.type === 'hide_save_reminder') {
          console.log('🔔 [Save Reminder - Browser] Received hide_save_reminder event');
          hideSaveReminderDialog();
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
      const drawPanelAndDetectActionsBtn = document.getElementById("drawPanelAndDetectActionsBtn");
      const detectPagesBtn = document.getElementById("detectPagesBtn");
      const drawPanelBtn = document.getElementById("drawPanelBtn");
      const drawPanelMenu = document.getElementById("drawPanelMenu");
      
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
        updateDetectCaptureButtonsState();
        
        try {
          if (window.manualCaptureAI) {
            await window.manualCaptureAI();
          }
        } finally {
          isCapturing = false;
          updateDetectCaptureButtonsState();
        }
      });
      
      captureActionsDOMBtn.addEventListener("click", async (e) => {
        if (isCapturing || isGeminiDetecting) {
          showToast('⚠️ Đang xử lý, vui lòng đợi...');
          return;
        }
        
        isCapturing = true;
        updateDetectCaptureButtonsState();
        
        try {
          if (window.captureActions) {
            await window.captureActions();
          }
        } finally {
          isCapturing = false;
          updateDetectCaptureButtonsState();
        }
      });
      
      drawPanelAndDetectActionsBtn.addEventListener("click", async () => {
        if (isCapturing || isGeminiDetecting) {
          showToast('⚠️ Đang xử lý, vui lòng đợi...');
          return;
        }
        if (!selectedPanelId) {
          showToast('⚠️ Vui lòng chọn panel trước!');
          return;
        }
        
        isCapturing = true;
        
        try {
          if (window.drawPanelAndDetectActions) {
            await window.drawPanelAndDetectActions();
          }
        } finally {
          isCapturing = false;
        }
      });
      
      detectPagesBtn.addEventListener("click", async () => {
        if (isCapturing || isGeminiDetecting) {
          showToast('⚠️ Đang xử lý, vui lòng đợi...');
          return;
        }
        
        isCapturing = true;
        
        try {
          if (window.detectPages) {
            await window.detectPages();
          }
        } finally {
          isCapturing = false;
        }
      });
      
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
          
          const originalDrawPanelText = drawPanelBtn.textContent;
          if (mode === 'DRAW_NEW') {
            drawPanelBtn.disabled = true;
            drawPanelBtn.style.opacity = '0.6';
            drawPanelBtn.style.cursor = 'not-allowed';
            drawPanelBtn.textContent = '⏳ Creating...';
          }
          
          try {
            if (mode === 'DRAW_NEW') {
              if (window.drawPanel) {
                const result = await window.drawPanel(mode);
                
                isDrawingPanel = false;
                drawPanelBtn.disabled = false;
                drawPanelBtn.style.opacity = '1';
                drawPanelBtn.style.cursor = 'pointer';
                drawPanelBtn.textContent = originalDrawPanelText;
              }
            } else if (mode === 'USE_BEFORE') {
              if (window.useBeforePanel) {
                await window.useBeforePanel(selectedPanelId);
                showToast('✅ Marked as done với current panel');
                isDrawingPanel = false;
              }
            }
          } catch (err) {
            console.error('Draw panel error:', err);
            isDrawingPanel = false;
            if (mode === 'DRAW_NEW') {
              drawPanelBtn.disabled = false;
              drawPanelBtn.style.opacity = '1';
              drawPanelBtn.style.cursor = 'pointer';
              drawPanelBtn.textContent = originalDrawPanelText;
            }
          }
        });
      });
      
      document.addEventListener('click', (e) => {
        if (!drawPanelBtn.contains(e.target) && !drawPanelMenu.contains(e.target)) {
          drawPanelMenu.style.display = 'none';
        }
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
      
      const updateSaveBtnState = (hasChanges) => {
        if (!saveBtn) {
          console.warn('saveBtn not found');
          return;
        }
        
        console.log('updateSaveBtnState:', hasChanges);
        
        if (hasChanges) {
          saveBtn.classList.add('has-changes');
          saveBtn.classList.remove('no-changes');
          console.log('SaveBtn: has-changes class added');
        } else {
          saveBtn.classList.add('no-changes');
          saveBtn.classList.remove('has-changes');
          console.log('SaveBtn: no-changes class added');
        }
      };
      
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
            
            // Reset button để có thể save lại
            isSaving = false;
            saveBtn.disabled = false;
            saveBtn.style.opacity = '';
            saveBtn.style.cursor = '';
            saveBtn.style.pointerEvents = '';
            saveBtn.textContent = '💾 Save';
            
            // Check for changes after save (should be no changes now)
            if (window.checkForChanges) {
              await window.checkForChanges();
            }
            
            console.log('✅ Save completed successfully');
          } catch (err) {
            console.error('❌ Save failed:', err);
            
            if (!err.isValidationError) {
              showToast('❌ Save fail!');
            }
            
            isSaving = false;
            saveBtn.disabled = false;
            saveBtn.style.opacity = '';
            saveBtn.style.cursor = '';
            saveBtn.style.pointerEvents = '';
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

      const checkpointBtn = document.getElementById("checkpointBtn");
      const checkpointModal = document.getElementById("checkpointModal");
      const closeCheckpointModal = document.getElementById("closeCheckpointModal");
      const checkpointList = document.getElementById("checkpointList");

      const openCheckpointModal = async () => {
        checkpointModal.style.display = 'flex';
        await loadCheckpoints();
      };

      const closeCheckpointModalFn = () => {
        checkpointModal.style.display = 'none';
      };

      const loadCheckpoints = async () => {
        checkpointList.innerHTML = '<div style="text-align:center; padding:40px; color:#999;">Loading checkpoints...</div>';
        
        try {
          if (window.getCheckpoints) {
            const checkpoints = await window.getCheckpoints();
            renderCheckpoints(checkpoints);
          } else {
            checkpointList.innerHTML = '<div style="text-align:center; padding:40px; color:#ff4444;">Checkpoint function not available</div>';
          }
        } catch (err) {
          console.error('Failed to load checkpoints:', err);
          checkpointList.innerHTML = '<div style="text-align:center; padding:40px; color:#ff4444;">Failed to load checkpoints: ' + err.message + '</div>';
        }
      };

      const renderCheckpoints = (checkpoints) => {
        if (!checkpoints || checkpoints.length === 0) {
          checkpointList.innerHTML = '<div style="text-align:center; padding:40px; color:#999;">No checkpoints found</div>';
          return;
        }

        checkpointList.innerHTML = '';

        checkpoints.forEach(checkpoint => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'checkpoint-item';

          const timestamp = checkpoint.timestamp ? new Date(checkpoint.timestamp).toLocaleString('vi-VN') : 'Unknown time';
          const name = checkpoint.name || 'Unnamed checkpoint';
          const description = checkpoint.description || '';
          const recordId = checkpoint.recordId || 'N/A';
          const rolledbackBy = checkpoint.rolledbackBy;

          let statusHtml = '';
          if (checkpoint.localSuccess) {
            statusHtml += '<span class="checkpoint-status local">Local</span>';
          }
          if (checkpoint.dbSuccess) {
            statusHtml += '<span class="checkpoint-status db">DB</span>';
          }
          if (rolledbackBy) {
            statusHtml += '<span class="checkpoint-status rolledback">Rolledback</span>';
          }

          itemDiv.innerHTML = \`
            <div class="checkpoint-item-header">
              <div style="flex:1;">
                <div class="checkpoint-item-title">\${name}\${statusHtml}</div>
                <div class="checkpoint-item-time">\${timestamp}</div>
                \${description ? '<div class="checkpoint-item-description">' + description + '</div>' : ''}
                <div class="checkpoint-item-meta">Record ID: \${recordId}</div>
              </div>
            </div>
            <div class="checkpoint-item-actions">
              <button class="checkpoint-rollback-btn" data-checkpoint-id="\${checkpoint.checkpointId}">
                ↩️ Rollback
              </button>
            </div>
          \`;

          const rollbackBtn = itemDiv.querySelector('.checkpoint-rollback-btn');
          rollbackBtn.addEventListener('click', async () => {
            await handleRollbackClick(checkpoint.checkpointId, name);
          });

          checkpointList.appendChild(itemDiv);
        });
      };

      const handleRollbackClick = async (checkpointId, checkpointName) => {
        const warningMsg = \`⚠️ CẢNH BÁO: Rollback sẽ thay thế toàn bộ dữ liệu hiện tại bằng dữ liệu từ checkpoint này.

Checkpoint: \${checkpointName}

Dữ liệu hiện tại sẽ bị mất và không thể khôi phục (trừ khi có checkpoint khác).

Bạn có chắc chắn muốn rollback?\`;

        if (!confirm(warningMsg)) {
          return;
        }

        try {
          showToast('⏳ Đang rollback...');
          
          if (window.rollbackCheckpoint) {
            await window.rollbackCheckpoint(checkpointId);
            showToast('✅ Rollback completed successfully!');
            closeCheckpointModalFn();
            
            // Reload checkpoints to reflect changes
            setTimeout(() => {
              loadCheckpoints();
            }, 1000);
          } else {
            showToast('❌ Rollback function not available');
          }
        } catch (err) {
          console.error('Rollback failed:', err);
          showToast('❌ Rollback failed: ' + (err.message || 'Unknown error'));
        }
      };

      checkpointBtn.addEventListener("click", openCheckpointModal);
      closeCheckpointModal.addEventListener("click", closeCheckpointModalFn);

      checkpointModal.addEventListener("click", (e) => {
        if (e.target === checkpointModal) {
          closeCheckpointModalFn();
        }
      });

      // Save Reminder Modal handlers
      const saveReminderModal = document.getElementById('saveReminderModal');
      const saveReminderSaveBtn = document.getElementById('saveReminderSaveBtn');
      const saveReminderLaterBtn = document.getElementById('saveReminderLaterBtn');
      const saveReminderMinutes = document.getElementById('saveReminderMinutes');

      const showSaveReminderDialog = (minutesElapsed) => {
        if (!saveReminderModal) {
          console.log('🔔 [Save Reminder - Browser] Error: saveReminderModal not found');
          return;
        }
        console.log('🔔 [Save Reminder - Browser] ✅ Displaying dialog for', minutesElapsed, 'minutes');
        saveReminderMinutes.textContent = minutesElapsed;
        saveReminderModal.style.display = 'flex';
      };

      const hideSaveReminderDialog = () => {
        if (!saveReminderModal) {
          console.log('🔔 [Save Reminder - Browser] Error: saveReminderModal not found');
          return;
        }
        console.log('🔔 [Save Reminder - Browser] Hiding dialog');
        saveReminderModal.style.display = 'none';
      };

      saveReminderSaveBtn.addEventListener('click', async () => {
        console.log('🔔 [Save Reminder - Browser] User clicked "Đồng ý" button');
        hideSaveReminderDialog();
        if (window.handleSaveReminderResponse) {
          await window.handleSaveReminderResponse('save');
        } else {
          console.error('🔔 [Save Reminder - Browser] Error: handleSaveReminderResponse not available');
        }
      });

      saveReminderLaterBtn.addEventListener('click', async () => {
        console.log('🔔 [Save Reminder - Browser] User clicked "Để sau" button');
        hideSaveReminderDialog();
        if (window.handleSaveReminderResponse) {
          await window.handleSaveReminderResponse('later');
        } else {
          console.error('🔔 [Save Reminder - Browser] Error: handleSaveReminderResponse not available');
        }
      });

      saveReminderModal.addEventListener('click', (e) => {
        if (e.target === saveReminderModal) {
          // Don't close on background click - require explicit button click
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && saveReminderModal.style.display === 'flex') {
          // Don't close on Escape - require explicit button click
        }
      });

      document.addEventListener("keydown", async (e) => {
        if (e.key === "Escape" && checkpointModal.style.display === 'flex') {
          closeCheckpointModalFn();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === "1") {
          e.preventDefault();
          if (isCapturing || isGeminiDetecting) {
            showToast('⚠️ Đang xử lý, vui lòng đợi...');
            return;
          }
          if (!selectedPanelId) {
            showToast('⚠️ Vui lòng chọn panel trước!');
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
          if (selectedNode?.item_category !== 'PANEL') {
            showToast('⚠️ Chỉ PANEL mới có thể Draw Panel & Detect Actions!');
            return;
          }
          isCapturing = true;
          try {
            if (window.drawPanelAndDetectActions) {
              await window.drawPanelAndDetectActions();
            }
          } finally {
            isCapturing = false;
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
          
          const isPanelEditorOpen = document.getElementById('editor-container');
          if (isPanelEditorOpen) return;
          
          const findNodeInTree = (nodes, targetId) => {
            for (const node of nodes) {
              if (node.panel_id === targetId) return node;
              if (node.children) {
                const found = findNodeInTree(node.children, targetId);
                if (found) return found;
              }
            }
            return null;
          };
          const selectedNode = findNodeInTree(panelTreeData, selectedPanelId);
          if (!selectedNode) return;
          
          const itemCategory = selectedNode.item_category;
          const confirmMsg = itemCategory === 'PAGE' ? 'Xóa page này? Tất cả actions cũng sẽ bị xóa.' : 
                            itemCategory === 'ACTION' ? 'Xóa action này?' :
                            'Xóa panel này khỏi tree? Tất cả panel con cũng sẽ bị xóa.';
          
          e.preventDefault();
          if (confirm(confirmMsg)) {
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
        contentDiv.setAttribute('data-panel-id', node.panel_id);
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
          expandIcon.textContent = '';
          expandIcon.style.visibility = 'hidden';
        }
        contentDiv.appendChild(expandIcon);
        
        const nodeDot = document.createElement('span');
        nodeDot.className = 'tree-node-dot';
        if (node.item_category === 'ACTION') {
          nodeDot.style.marginLeft = '8px';
        }
        
        let dotColor;
        if (node.item_category === 'PANEL') {
          // Panel icons: màu xanh lục (green)
          dotColor = '#4caf50';
        } else {
          // Action icons: đỏ nếu có intersection, xanh nếu không
          const hasIntersections = node.hasIntersections || false;
          dotColor = hasIntersections ? '#ff4444' : '#00aaff';
        }
        
        let originalDotHTML;
        if (node.status === 'completed') {
          originalDotHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
            '<circle cx="12" cy="12" r="10" fill="' + dotColor + '"/>' +
            '<path d="M9 12l2 2 4-4" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
            '</svg>';
        } else {
          originalDotHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
            '<circle cx="12" cy="12" r="10" fill="' + dotColor + '"/>' +
            '</svg>';
        }
        nodeDot.innerHTML = originalDotHTML;
        nodeDot.setAttribute('data-original-dot', originalDotHTML);
        nodeDot.setAttribute('data-dot-color', dotColor);
        contentDiv.appendChild(nodeDot);
        
        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = node.name || 'Item';
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
          showContextMenu(e.clientX, e.clientY, node.panel_id, node.status, node.name, node.item_category, node.pageNumber, node.maxPageNumber);
        });
        
        return nodeDiv;
      }
      
      function showContextMenu(x, y, panelId, status, nodeName, itemCategory, pageNumber, maxPageNumber) {
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
        
        let itemLabel = 'Panel';
        if (itemCategory === 'PAGE') {
          itemLabel = 'Page';
        } else if (itemCategory === 'ACTION') {
          itemLabel = 'Action';
        }
        
        const renameOption = document.createElement('div');
        renameOption.textContent = '✏️ Rename ' + itemLabel;
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
          const newName = prompt('Nhập tên mới cho ' + itemLabel.toLowerCase() + ':');
          if (newName && newName.trim()) {
            if (window.renamePanel) {
              await window.renamePanel(panelId, newName.trim());
            }
          }
        });
        
        menu.appendChild(renameOption);
        
        if (itemCategory === 'PANEL') {
          const newPageOption = document.createElement('div');
          newPageOption.textContent = '➕ New Page';
          newPageOption.style.cssText = \`
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            border-top: 1px solid #eee;
          \`;
          newPageOption.addEventListener('mouseenter', () => {
            newPageOption.style.background = '#f0f0f0';
          });
          newPageOption.addEventListener('mouseleave', () => {
            newPageOption.style.background = 'transparent';
          });
          newPageOption.addEventListener('click', async () => {
            menu.remove();
            if (window.createManualPage) {
              await window.createManualPage(panelId);
            }
          });
          menu.appendChild(newPageOption);
        }
        
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
          
          const selectPanelOption = document.createElement('div');
          selectPanelOption.textContent = '📋 SELECT PANEL';
          selectPanelOption.style.cssText = \`
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            border-top: 1px solid #eee;
          \`;
          selectPanelOption.addEventListener('mouseenter', () => {
            selectPanelOption.style.background = '#f0f0f0';
          });
          selectPanelOption.addEventListener('mouseleave', () => {
            selectPanelOption.style.background = 'transparent';
          });
          selectPanelOption.addEventListener('click', async () => {
            menu.remove();
            if (window.openSelectPanelModal) {
              await window.openSelectPanelModal(panelId);
            }
          });
          menu.appendChild(selectPanelOption);
        }
        
        const deleteOption = document.createElement('div');
        deleteOption.textContent = '🗑️ Delete ' + itemLabel;
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
          const confirmMsg = itemCategory === 'PAGE' ? 'Xóa page này? Tất cả actions cũng sẽ bị xóa.' : 
                            itemCategory === 'ACTION' ? 'Xóa action này?' :
                            'Xóa panel này khỏi tree? Tất cả các page của panel và các panel con cũng sẽ bị xóa.';
          if (confirm(confirmMsg)) {
            if (window.deleteEvent) {
              window.deleteEvent(panelId);
            }
          }
        });
        
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
          if (itemCategory === 'PAGE') {
            // Chỉ cho delete page cuối cùng (page có number lớn nhất)
            if (pageNumber && maxPageNumber && pageNumber === maxPageNumber) {
              menu.appendChild(deleteOption);
            }
          } else {
            // PANEL và ACTION - delete bình thường
            menu.appendChild(deleteOption);
          }
        }
        
        document.body.appendChild(menu);
        
        const menuRect = menu.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        
        if (y + menuRect.height > viewportHeight) {
          const newY = Math.max(10, y - menuRect.height);
          menu.style.top = \`\${newY}px\`;
        }
        
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
      
      function createEditableItemDetails(evt, titleIcon) {
        const itemDetailsDiv = document.createElement('div');
        itemDetailsDiv.className = 'screen item-details-container';
        itemDetailsDiv.style.background = '#e8f5e9';
        itemDetailsDiv.style.padding = '8px';
        itemDetailsDiv.style.borderRadius = '4px';
        itemDetailsDiv.style.marginTop = '5px';
        itemDetailsDiv.style.fontSize = '13px';
        itemDetailsDiv.style.position = 'relative';
        
        const titleText = titleIcon + ' Item Details:';
        let detailsHtml = '<div class="details-content"><strong>' + titleText + '</strong><br>';
        detailsHtml += '<div class="detail-row"><span class="detail-label">• Category:</span> <span class="detail-value" style="color:#1976d2;font-weight:600" data-field="category">' + evt.item_category + '</span></div>';
        detailsHtml += '<div class="detail-row"><span class="detail-label">• Name:</span> <span class="detail-value" style="color:#d32f2f;font-weight:600" data-field="name">' + (evt.item_name || '<i style="color:#999">null</i>') + '</span></div>';
        detailsHtml += '<div class="detail-row"><span class="detail-label">• Type:</span> <span class="detail-value" data-field="type">' + (evt.item_type || '<i style="color:#999">null</i>') + '</span></div>';
        detailsHtml += '<div class="detail-row"><span class="detail-label">• Verb:</span> <span class="detail-value" data-field="verb">' + (evt.item_verb || '<i style="color:#999">null</i>') + '</span></div>';
        detailsHtml += '<div class="detail-row"><span class="detail-label">• Content:</span> <span class="detail-value" data-field="content">' + (evt.item_content ? '<span style="color:#388e3c">' + evt.item_content + '</span>' : '<i style="color:#999">null</i>') + '</span></div>';
        detailsHtml += '</div>';
        
        itemDetailsDiv.innerHTML = detailsHtml;
        
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️ Edit';
        editBtn.style.cssText = 'position:absolute;top:8px;right:8px;padding:4px 8px;font-size:11px;cursor:pointer;background:#2196f3;color:white;border:none;border-radius:3px;';
        editBtn.onclick = () => toggleEditMode(itemDetailsDiv, evt);
        itemDetailsDiv.appendChild(editBtn);
        
        return itemDetailsDiv;
      }
      
      function toggleEditMode(container, evt) {
        const detailsContent = container.querySelector('.details-content');
        const editBtn = container.querySelector('button');
        
        if (container.classList.contains('edit-mode')) {
          return;
        }
        
        container.classList.add('edit-mode');
        
        const nameVal = evt.item_name || '';
        const typeVal = evt.item_type || '';
        const verbVal = evt.item_verb || '';
        const contentVal = evt.item_content || '';
        
        let editHtml = '<strong>Item Details:</strong><br>';
        editHtml += '<div style="margin:5px 0"><span class="detail-label">• Category:</span> <span style="color:#1976d2;font-weight:600">' + evt.item_category + '</span></div>';
        editHtml += '<div style="margin:5px 0"><span class="detail-label">• Name:</span> <input type="text" data-field="name" value="' + (nameVal || '') + '" style="width:70%;padding:2px;border:1px solid #ccc;border-radius:3px;"></div>';
        editHtml += '<div style="margin:5px 0"><span class="detail-label">• Type:</span> <input type="text" data-field="type" value="' + (typeVal || '') + '" style="width:70%;padding:2px;border:1px solid #ccc;border-radius:3px;"></div>';
        editHtml += '<div style="margin:5px 0"><span class="detail-label">• Verb:</span> <input type="text" data-field="verb" value="' + (verbVal || '') + '" style="width:70%;padding:2px;border:1px solid #ccc;border-radius:3px;"></div>';
        editHtml += '<div style="margin:5px 0"><span class="detail-label">• Content:</span> <input type="text" data-field="content" value="' + (contentVal || '') + '" style="width:70%;padding:2px;border:1px solid #ccc;border-radius:3px;"></div>';
        
        detailsContent.innerHTML = editHtml;
        
        editBtn.remove();
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 Save';
        saveBtn.style.cssText = 'position:absolute;top:8px;right:70px;padding:4px 8px;font-size:11px;cursor:pointer;background:#4caf50;color:white;border:none;border-radius:3px;';
        saveBtn.onclick = async () => await saveItemDetails(container, evt);
        container.appendChild(saveBtn);
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '❌ Cancel';
        cancelBtn.style.cssText = 'position:absolute;top:8px;right:8px;padding:4px 8px;font-size:11px;cursor:pointer;background:#f44336;color:white;border:none;border-radius:3px;';
        cancelBtn.onclick = () => cancelEditMode(container, evt);
        container.appendChild(cancelBtn);
      }
      
      async function saveItemDetails(container, evt) {
        const nameInput = container.querySelector('input[data-field="name"]');
        const typeInput = container.querySelector('input[data-field="type"]');
        const verbInput = container.querySelector('input[data-field="verb"]');
        const contentInput = container.querySelector('input[data-field="content"]');
        
        const updates = {
          name: nameInput.value.trim(),
          type: typeInput.value.trim(),
          verb: verbInput.value.trim(),
          content: contentInput.value.trim()
        };
        
        if (window.updateItemDetails) {
          await window.updateItemDetails(evt.panel_id, updates);
        }
      }
      
      function cancelEditMode(container, evt) {
        container.classList.remove('edit-mode');
        const detailsContent = container.querySelector('.details-content');
        
        // Rebuild the details content
        detailsContent.innerHTML = '';
        detailsContent.style.cssText = 'font-size: 13px; line-height: 1.8;';
        
        const categoryRow = document.createElement('div');
        categoryRow.innerHTML = '• Category: <span style="color:#1976d2;font-weight:600">' + evt.item_category + '</span>';
        detailsContent.appendChild(categoryRow);
        
        const nameRow = document.createElement('div');
        nameRow.innerHTML = '• Name: <span style="color:#d32f2f;font-weight:600">' + (evt.item_name || '<i style="color:#999">null</i>') + '</span>';
        detailsContent.appendChild(nameRow);
        
        const typeRow = document.createElement('div');
        typeRow.innerHTML = '• Type: ' + (evt.item_type || '<i style="color:#999">null</i>');
        detailsContent.appendChild(typeRow);
        
        const verbRow = document.createElement('div');
        verbRow.innerHTML = '• Verb: ' + (evt.item_verb || '<i style="color:#999">null</i>');
        detailsContent.appendChild(verbRow);
        
        const contentRow = document.createElement('div');
        contentRow.innerHTML = '• Content: ' + (evt.item_content ? '<span style="color:#388e3c">' + evt.item_content + '</span>' : '<i style="color:#999">null</i>');
        detailsContent.appendChild(contentRow);
        
        container.querySelectorAll('button').forEach(btn => btn.remove());
        
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.style.cssText = 'position:absolute;top:12px;right:12px;padding:4px 12px;font-size:11px;cursor:pointer;background:#2196f3;color:white;border:none;border-radius:4px;display:flex;align-items:center;gap:4px;';
        const editIcon = document.createElement('span');
        editIcon.textContent = '✏️';
        editIcon.style.cssText = 'font-size:10px;';
        editBtn.appendChild(editIcon);
        editBtn.appendChild(document.createTextNode('Edit'));
        editBtn.onclick = () => toggleEditMode(container, evt);
        container.appendChild(editBtn);
      }
      
      function createActionStep1Details(evt) {
        const step1Div = document.createElement('div');
        step1Div.style.cssText = 'margin-bottom: 20px;';
        
        const step1Title = document.createElement('div');
        step1Title.textContent = 'Bước 1: Kiểm tra thông tin';
        step1Title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 10px; color: #333;';
        step1Div.appendChild(step1Title);
        
        const itemDetailsBox = document.createElement('div');
        itemDetailsBox.style.cssText = 'background: #e8f5e9; border: 2px solid #ff69b4; border-radius: 6px; padding: 12px; position: relative;';
        
        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display: flex; align-items: center; margin-bottom: 10px;';
        const titleIcon = document.createElement('span');
        titleIcon.textContent = '⚙️';
        titleIcon.style.cssText = 'margin-right: 6px; font-size: 14px;';
        const titleText = document.createElement('strong');
        titleText.textContent = 'Item Details:';
        titleText.style.cssText = 'font-size: 13px;';
        titleRow.appendChild(titleIcon);
        titleRow.appendChild(titleText);
        itemDetailsBox.appendChild(titleRow);
        
        const detailsContent = document.createElement('div');
        detailsContent.className = 'details-content';
        detailsContent.style.cssText = 'font-size: 13px; line-height: 1.8;';
        
        const categoryRow = document.createElement('div');
        categoryRow.innerHTML = '• Category: <span style="color:#1976d2;font-weight:600">' + evt.item_category + '</span>';
        detailsContent.appendChild(categoryRow);
        
        const nameRow = document.createElement('div');
        nameRow.innerHTML = '• Name: <span style="color:#d32f2f;font-weight:600">' + (evt.item_name || '<i style="color:#999">null</i>') + '</span>';
        detailsContent.appendChild(nameRow);
        
        const typeRow = document.createElement('div');
        typeRow.innerHTML = '• Type: ' + (evt.item_type || '<i style="color:#999">null</i>');
        detailsContent.appendChild(typeRow);
        
        const verbRow = document.createElement('div');
        verbRow.innerHTML = '• Verb: ' + (evt.item_verb || '<i style="color:#999">null</i>');
        detailsContent.appendChild(verbRow);
        
        const contentRow = document.createElement('div');
        contentRow.innerHTML = '• Content: ' + (evt.item_content ? '<span style="color:#388e3c">' + evt.item_content + '</span>' : '<i style="color:#999">null</i>');
        detailsContent.appendChild(contentRow);
        
        itemDetailsBox.appendChild(detailsContent);
        
        const editBtn = document.createElement('button');
        editBtn.style.cssText = 'position:absolute;top:12px;right:12px;padding:4px 12px;font-size:11px;cursor:pointer;background:#2196f3;color:white;border:none;border-radius:4px;display:flex;align-items:center;gap:4px;';
        const editIcon = document.createElement('span');
        editIcon.textContent = '✏️';
        editIcon.style.cssText = 'font-size:10px;';
        editBtn.appendChild(editIcon);
        editBtn.appendChild(document.createTextNode('Edit'));
        editBtn.onclick = () => toggleEditMode(itemDetailsBox, evt);
        itemDetailsBox.appendChild(editBtn);
        
        step1Div.appendChild(itemDetailsBox);
        return step1Div;
      }
      
      function createActionStep2Image(evt, screenshotBase64) {
        const step2Div = document.createElement('div');
        step2Div.setAttribute('data-step', '2');
        step2Div.style.cssText = 'margin-bottom: 20px;';
        
        const step2Title = document.createElement('div');
        step2Title.textContent = 'Bước 2: Click hình ảnh action trên AI Tool';
        step2Title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 10px; color: #333;';
        step2Div.appendChild(step2Title);
        
        const actionImageContainer = document.createElement('div');
        actionImageContainer.className = 'action-image-container';
        actionImageContainer.style.cssText = 'display: flex; align-items: center; gap: 15px;';
        
        // Prefer action_info.image_base64 (cropped from panel fullscreen_base64)
        if (evt.action_info && evt.action_info.image_base64) {
          const actionImg = document.createElement('img');
          actionImg.style.cssText = 'max-width: 200px; max-height: 60px; border: 1px dashed #333; border-radius: 4px; padding: 4px; cursor: pointer; object-fit: contain;';
          actionImg.title = 'Ảnh nút action - Cắt từ panel fullscreen';
          actionImg.src = 'data:image/png;base64,' + evt.action_info.image_base64;
          actionImg.style.display = 'block';
          
          actionImg.addEventListener('click', async () => {
            // Open panel editor and auto-select this action
            if (window.openPanelEditorForAction && evt.panel_id) {
              await window.openPanelEditorForAction(evt.panel_id);
            } else {
              // Fallback: show in modal
              document.getElementById('modalImage').src = actionImg.src;
              document.getElementById('imageModal').classList.add('show');
            }
          });
          
          const imageLabel = document.createElement('div');
          imageLabel.innerHTML = '<div style="font-size: 12px;">Ảnh nút action</div><div style="font-size: 11px; color: #666;">Cắt từ panel fullscreen</div>';
          
          actionImageContainer.appendChild(actionImg);
          actionImageContainer.appendChild(imageLabel);
        } else {
          const noImageMsg = document.createElement('div');
          noImageMsg.textContent = 'Chưa có ảnh action';
          noImageMsg.style.cssText = 'color: #999; font-style: italic; padding: 10px;';
          actionImageContainer.appendChild(noImageMsg);
          
          const imageLabel = document.createElement('div');
          imageLabel.innerHTML = '<div style="font-size: 12px;">Ảnh nút action</div><div style="font-size: 11px; color: #666;">Cắt từ fullscreen</div>';
          actionImageContainer.appendChild(imageLabel);
        }
        
        step2Div.appendChild(actionImageContainer);
        
        return step2Div;
      }
      
      function createActionStep3Buttons(evt) {
        const step3Div = document.createElement('div');
        step3Div.setAttribute('data-step', '3');
        step3Div.style.cssText = 'margin-bottom: 20px;';
        
        const step3Title = document.createElement('div');
        step3Title.textContent = 'Bước 3: Sau khi xem panel trên AI Tool thì nhấn vào nút dưới để hoàn thành action';
        step3Title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 10px; color: #333;';
        step3Div.appendChild(step3Title);
        
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';
        
        const selectPanelBtn = document.createElement('button');
        selectPanelBtn.textContent = 'SELECT PANEL';
        selectPanelBtn.style.cssText = 'padding: 12px 20px; background: #ffb3d9; border: 1px solid #333; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; text-align: center; transition: all 0.2s ease;';
        selectPanelBtn.addEventListener('mouseenter', () => {
          selectPanelBtn.style.background = '#ff99cc';
        });
        selectPanelBtn.addEventListener('mouseleave', () => {
          selectPanelBtn.style.background = '#ffb3d9';
        });
        selectPanelBtn.addEventListener('click', async () => {
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
          
          // Open SELECT PANEL modal
          if (window.openSelectPanelModal) {
            await window.openSelectPanelModal(selectedPanelId);
          } else {
            showToast('❌ SELECT PANEL modal không khả dụng');
          }
        });
        
        const drawNewPanelBtn = document.createElement('button');
        drawNewPanelBtn.textContent = 'DRAW NEW PANEL';
        drawNewPanelBtn.style.cssText = 'padding: 12px 20px; background: #ffb3d9; border: 1px solid #333; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600; text-align: center; transition: all 0.2s ease;';
        drawNewPanelBtn.addEventListener('mouseenter', () => {
          drawNewPanelBtn.style.background = '#ff99cc';
        });
        drawNewPanelBtn.addEventListener('mouseleave', () => {
          drawNewPanelBtn.style.background = '#ffb3d9';
        });
        drawNewPanelBtn.addEventListener('click', async () => {
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
          
          const originalDrawPanelText = drawPanelBtn.textContent;
          drawPanelBtn.disabled = true;
          drawPanelBtn.style.opacity = '0.6';
          drawPanelBtn.style.cursor = 'not-allowed';
          drawPanelBtn.textContent = '⏳ Creating...';
          
          try {
            if (window.drawPanel) {
              const result = await window.drawPanel('DRAW_NEW');
              if (window.selectPanel) {
                await window.selectPanel(selectedPanelId);
              }
            }
          } catch (err) {
            console.error('Draw panel error:', err);
            showToast('❌ Lỗi khi tạo panel mới');
          } finally {
            isDrawingPanel = false;
            drawPanelBtn.disabled = false;
            drawPanelBtn.style.opacity = '1';
            drawPanelBtn.style.cursor = 'pointer';
            drawPanelBtn.textContent = originalDrawPanelText;
          }
        });
        
        buttonsContainer.appendChild(selectPanelBtn);
        buttonsContainer.appendChild(drawNewPanelBtn);
        step3Div.appendChild(buttonsContainer);
        
        return step3Div;
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
        
        const detectPagesBtn = document.getElementById('detectPagesBtn');
        
        if (selectedNode) {
          if (selectedNode.item_category === 'PANEL') {
            detectActionsGeminiBtn.style.display = 'none';
            captureActionsDOMBtn.style.display = 'none';
            drawPanelAndDetectActionsBtn.style.display = 'inline-block';
            detectPagesBtn.style.display = 'none';
            drawPanelBtn.style.display = 'none';
            clearAllClicksBtn.style.display = 'none';
            importCookiesBtn.style.display = 'none';
          } else if (selectedNode.item_category === 'ACTION') {
            detectActionsGeminiBtn.style.display = 'none';
            captureActionsDOMBtn.style.display = 'none';
            drawPanelAndDetectActionsBtn.style.display = 'none';
            detectPagesBtn.style.display = 'none';
            drawPanelBtn.style.display = 'none';
            clearAllClicksBtn.style.display = 'inline-block';
            importCookiesBtn.style.display = 'none';
          }
        } else {
          detectActionsGeminiBtn.style.display = 'none';
          captureActionsDOMBtn.style.display = 'none';
          drawPanelAndDetectActionsBtn.style.display = 'none';
          detectPagesBtn.style.display = 'none';
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
        
        const existingActionDetails = container.querySelector('.event[data-event-type="action_details"]');
        if (existingActionDetails) {
          existingActionDetails.remove();
        }
        
        if (!evt.panel_id) {
          const existingClickEvents = Array.from(container.querySelectorAll('.event[data-event-type="click"]'));
          existingClickEvents.forEach(el => el.remove());
          return;
        }
        
        if (evt.item_category === 'ACTION') {
          console.log('🎯 ACTION detected, evt:', evt);
          
          const actionDiv = document.createElement('div');
          actionDiv.className = 'event';
          actionDiv.style.position = 'relative';
          actionDiv.setAttribute('data-timestamp', evt.timestamp || Date.now());
          actionDiv.setAttribute('data-event-type', 'action_details');
          
          // Step 1: Item Details
          const step1Div = createActionStep1Details(evt);
          actionDiv.appendChild(step1Div);
          
          // Step 2: Action Image (always show, even without screenshot)
          const step2Div = createActionStep2Image(evt, evt.screenshot || null);
          actionDiv.appendChild(step2Div);
          
          // Step 3: Action buttons (only if action doesn't have step_info)
          if (evt.action_info && !evt.action_info.step_info) {
            const step3Div = createActionStep3Buttons(evt);
            actionDiv.appendChild(step3Div);
          }
          
          container.appendChild(actionDiv);
        }
        
        if (evt.screenshot) {
          // If screenshot becomes available later, update Step 2 in actionDiv
          // Only update if action_info.image_base64 is not already available
          if (evt.item_category === 'ACTION' && evt.action_info && evt.action_info.position && !evt.action_info.image_base64) {
            const existingActionDiv = container.querySelector('.event[data-event-type="action_details"]');
            if (existingActionDiv) {
              const existingStep2 = existingActionDiv.querySelector('[data-step="2"]');
              if (existingStep2) {
                // Update existing Step 2 with screenshot
                const actionImageContainer = existingStep2.querySelector('.action-image-container');
                if (actionImageContainer) {
                  const actionImg = actionImageContainer.querySelector('img');
                  if (actionImg && actionImg.style.display === 'none') {
                    // Update the image with cropped version
                    const sourceImg = new Image();
                    sourceImg.onload = function() {
                      try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        const pos = evt.action_info.position;
                        
                        canvas.width = pos.w;
                        canvas.height = pos.h;
                        ctx.drawImage(sourceImg, pos.x, pos.y, pos.w, pos.h, 0, 0, pos.w, pos.h);
                        
                        actionImg.src = canvas.toDataURL('image/png');
                        actionImg.style.display = 'block';
                      } catch (err) {
                        console.error('Failed to crop action image:', err);
                        actionImg.src = 'data:image/png;base64,' + evt.screenshot;
                        actionImg.style.display = 'block';
                      }
                    };
                    sourceImg.onerror = function() {
                      actionImg.src = 'data:image/png;base64,' + evt.screenshot;
                      actionImg.style.display = 'block';
                    };
                    sourceImg.src = 'data:image/png;base64,' + evt.screenshot;
                  }
                } else {
                  // If no image container, rebuild Step 2
                  existingStep2.remove();
                  const step2Div = createActionStep2Image(evt, evt.screenshot);
                  const step3Div = existingActionDiv.querySelector('[data-step="3"]');
                  if (step3Div) {
                    existingActionDiv.insertBefore(step2Div, step3Div);
                  } else {
                    existingActionDiv.appendChild(step2Div);
                  }
                }
              }
            }
          }
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
          
          if (evt.item_category === 'PANEL' || evt.item_category === 'ACTION' || evt.item_category === 'PAGE') {
            const itemDetailsDiv = createEditableItemDetails(evt, '📋');
            panelDiv.appendChild(itemDetailsDiv);
          }
          
          const hasActions = evt.actions && evt.actions.length > 0;
          const isDetecting = evt.gemini_detecting === true;
          
          if (evt.screenshot && window.openPanelEditor) {
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
          
          // For ACTION items, action details are shown in actionDiv, not here
          // Only show action_info here if it's not an ACTION category
          if (evt.action_info && evt.item_category !== 'ACTION') {
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
            const hasLabel = evt.action_list.includes(':');
            actionsDiv.innerHTML = hasLabel ? evt.action_list : '<strong>Actions:</strong> ' + evt.action_list;
            panelDiv.appendChild(actionsDiv);
          }
          
          if (evt.metadata && evt.metadata.global_pos) {
            const sizeDiv = document.createElement('div');
            sizeDiv.className = 'screen';
            sizeDiv.innerHTML = '<strong>Size:</strong> ' + evt.metadata.global_pos.w + 'x' + evt.metadata.global_pos.h;
            panelDiv.appendChild(sizeDiv);
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
              if (confirm('Reset action này để CREATE NEW PANEL / USE CURRENT PANEL lại?')) {
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
              stepInfo.innerHTML = '<strong>Created new panel:</strong> "' + evt.action_info.step_info.panel_after_name + '"';
        } else {
              stepInfo.innerHTML = '<strong>Used current panel:</strong> "' + evt.action_info.step_info.panel_after_name + '"';
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
      
      async function refreshPanelTree() {
        const refreshBtn = document.getElementById('panel-log-refresh-btn');
        if (!refreshBtn) return;
        
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
        const originalText = refreshBtn.textContent;
        refreshBtn.textContent = '⏳';
        
        try {
          if (window.getPanelTree) {
            panelTreeData = await window.getPanelTree();
            renderPanelTree();
            showToast('✅ Panel Log đã được cập nhật');
          } else {
            showToast('⚠️ Refresh function không khả dụng');
          }
        } catch (err) {
          console.error('Failed to refresh panel tree:', err);
          showToast('❌ Lỗi khi refresh Panel Log');
        } finally {
          refreshBtn.classList.remove('loading');
          refreshBtn.disabled = false;
          refreshBtn.textContent = originalText;
        }
      }
      
      // Thêm event listener cho nút refresh
      const panelLogRefreshBtn = document.getElementById('panel-log-refresh-btn');
      if (panelLogRefreshBtn) {
        panelLogRefreshBtn.addEventListener('click', refreshPanelTree);
      }
      
      setTimeout(loadInitialTree, 1000);

      // SELECT PANEL Modal Logic
      let selectPanelModalActionId = null;
      let selectPanelModalSelectedPanelId = null;
      let selectPanelModalCanvas = null;
      let selectPanelModalFabricCanvas = null;
      let selectPanelModalFullImageBase64 = null;
      let selectPanelModalCurrentPageIndex = 0;
      let selectPanelModalNumPages = 1;

      async function openSelectPanelModal(actionId) {
        try {
          selectPanelModalActionId = actionId;
          selectPanelModalSelectedPanelId = null;
          const container = document.getElementById('select-panel-container');
          const listContainer = document.getElementById('select-panel-list');
          const canvas = document.getElementById('select-panel-canvas');
          
          if (!container) {
            console.error('select-panel-container not found');
            showToast('❌ SELECT PANEL modal không tìm thấy');
            return;
          }
          
          // Clean up existing fabric canvas if any
          if (selectPanelModalFabricCanvas) {
            selectPanelModalFabricCanvas.dispose();
            selectPanelModalFabricCanvas = null;
          }
          
          // Show modal by setting display to flex
          container.style.display = 'flex';
          container.classList.add('show');
          listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa; font-size:13px;">Loading panels...</div>';
          
          // Setup pagination buttons immediately - before loading panels
          const prevPageBtn = document.getElementById('select-panel-prev-page');
          const nextPageBtn = document.getElementById('select-panel-next-page');
          if (prevPageBtn) {
            // Remove any existing handlers and attach new one
            prevPageBtn.replaceWith(prevPageBtn.cloneNode(true));
            const newPrevBtn = document.getElementById('select-panel-prev-page');
            newPrevBtn.addEventListener('click', async () => {
              await switchSelectPanelPage('prev');
            });
          }
          if (nextPageBtn) {
            // Remove any existing handlers and attach new one
            nextPageBtn.replaceWith(nextPageBtn.cloneNode(true));
            const newNextBtn = document.getElementById('select-panel-next-page');
            newNextBtn.addEventListener('click', async () => {
              await switchSelectPanelPage('next');
            });
          }
          
          // Reset pagination state when modal opens
          selectPanelModalFullImageBase64 = null;
          selectPanelModalCurrentPageIndex = 0;
          selectPanelModalNumPages = 1;
          
          // Get current panel (parent panel of action)
          let currentPanelId = null;
          if (window.getParentPanelOfAction) {
            currentPanelId = await window.getParentPanelOfAction(actionId);
          }
          
          // Load all panels
          let panels = [];
          if (window.getAllPanels) {
            panels = await window.getAllPanels();
          }
          
          if (panels.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#aaa; font-size:13px;">No panels found</div>';
            return;
          }
          
          // Render panel list
          listContainer.innerHTML = '';
          panels.forEach(panel => {
            const panelItem = document.createElement('div');
            panelItem.className = 'select-panel-item';
            panelItem.setAttribute('data-panel-id', panel.item_id);
            
            if (panel.item_id === currentPanelId) {
              panelItem.classList.add('selected');
              selectPanelModalSelectedPanelId = panel.item_id;
            }
            
            panelItem.innerHTML = \`
              <div class="select-panel-item-name">\${panel.name || 'Unnamed Panel'}</div>
              <div class="select-panel-item-status">Status: \${panel.status || 'pending'}</div>
            \`;
            
            panelItem.addEventListener('click', async () => {
              // Remove selected class from all items
              listContainer.querySelectorAll('.select-panel-item').forEach(item => {
                item.classList.remove('selected');
              });
              // Add selected class to clicked item
              panelItem.classList.add('selected');
              selectPanelModalSelectedPanelId = panel.item_id;
              
              // Load and display panel image
              await loadPanelPreview(panel.item_id);
            });
            
            listContainer.appendChild(panelItem);
          });
          
          // Auto-select current panel and load preview
          if (currentPanelId) {
            const currentPanelItem = listContainer.querySelector(\`[data-panel-id="\${currentPanelId}"]\`);
            if (currentPanelItem) {
              currentPanelItem.classList.add('selected');
              selectPanelModalSelectedPanelId = currentPanelId;
              await loadPanelPreview(currentPanelId);
            } else if (panels.length > 0) {
              // If current panel not found, select first panel
              const firstItem = listContainer.querySelector('.select-panel-item');
              if (firstItem) {
                firstItem.classList.add('selected');
                selectPanelModalSelectedPanelId = firstItem.getAttribute('data-panel-id');
                await loadPanelPreview(selectPanelModalSelectedPanelId);
              }
            }
          } else if (panels.length > 0) {
            // No current panel, select first panel
            const firstItem = listContainer.querySelector('.select-panel-item');
            if (firstItem) {
              firstItem.classList.add('selected');
              selectPanelModalSelectedPanelId = firstItem.getAttribute('data-panel-id');
              await loadPanelPreview(selectPanelModalSelectedPanelId);
            }
          }
          
          // Helper function to close modal
          const closeModal = () => {
            container.style.display = 'none';
            container.classList.remove('show');
            if (selectPanelModalFabricCanvas) {
              selectPanelModalFabricCanvas.dispose();
              selectPanelModalFabricCanvas = null;
            }
            // Reset pagination state
            selectPanelModalFullImageBase64 = null;
            selectPanelModalCurrentPageIndex = 0;
            selectPanelModalNumPages = 1;
          };
          
          // Setup DRAW NEW PANEL button
          const drawNewBtn = document.getElementById('select-panel-draw-new');
          if (drawNewBtn) {
            drawNewBtn.onclick = async () => {
              closeModal();
              if (window.drawPanel) {
                await window.drawPanel('DRAW_NEW');
              }
            };
          }
          
          // Setup SAVE button
          const saveBtn = document.getElementById('select-panel-save');
          if (saveBtn) {
            saveBtn.onclick = async () => {
              if (!selectPanelModalSelectedPanelId) {
                showToast('⚠️ Vui lòng chọn panel!');
                return;
              }
              
              if (window.useSelectPanel) {
                try {
                  await window.useSelectPanel(selectPanelModalActionId, selectPanelModalSelectedPanelId);
                  closeModal();
                  showToast('✅ Panel selected successfully');
                  
                  // Reload action info
                  if (window.selectPanel) {
                    await window.selectPanel(selectPanelModalActionId);
                  }
                } catch (err) {
                  console.error('Failed to use select panel:', err);
                  showToast('❌ Lỗi khi chọn panel');
                }
              }
            };
          }
          
          // Setup CANCEL button
          const cancelBtn = document.getElementById('select-panel-cancel');
          if (cancelBtn) {
            cancelBtn.onclick = () => {
              closeModal();
              document.removeEventListener('keydown', escHandler);
            };
          }
          
          // Close on ESC key
          const escHandler = (e) => {
            if (e.key === 'Escape' && container.style.display === 'flex') {
              closeModal();
              document.removeEventListener('keydown', escHandler);
            }
          };
          document.addEventListener('keydown', escHandler);
          
          // Close on background click
          container.addEventListener('click', (e) => {
            if (e.target === container) {
              closeModal();
              document.removeEventListener('keydown', escHandler);
            }
          });
          
        } catch (err) {
          console.error('Failed to open select panel modal:', err);
          showToast('❌ Lỗi khi mở SELECT PANEL');
        }
      }

      async function cropPageFromPanel(pageIndex) {
        if (!selectPanelModalFullImageBase64) return null;
        
        const pageHeight = 1080;
        const img = new Image();
        img.src = 'data:image/png;base64,' + selectPanelModalFullImageBase64;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        
        const yStart = pageIndex * pageHeight;
        const actualPageHeight = Math.min(pageHeight, img.naturalHeight - yStart);
        
        return new Promise((resolve, reject) => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = actualPageHeight;
          const ctx = canvas.getContext('2d');
          
          ctx.drawImage(
            img,
            0, yStart,
            img.naturalWidth, actualPageHeight,
            0, 0,
            img.naturalWidth, actualPageHeight
          );
          
          const croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
          resolve(croppedBase64);
        });
      }
      
      async function switchSelectPanelPage(direction) {
        if (selectPanelModalNumPages <= 1) return;
        
        const oldIndex = selectPanelModalCurrentPageIndex;
        
        if (direction === 'next' && selectPanelModalCurrentPageIndex < selectPanelModalNumPages - 1) {
          selectPanelModalCurrentPageIndex++;
        } else if (direction === 'prev' && selectPanelModalCurrentPageIndex > 0) {
          selectPanelModalCurrentPageIndex--;
        } else {
          return;
        }
        
        // Only reload if index actually changed
        if (oldIndex !== selectPanelModalCurrentPageIndex) {
          await loadPanelPreviewPage(selectPanelModalCurrentPageIndex);
        }
      }
      
      function autoZoomToFitSelectPanel() {
        if (!selectPanelModalFabricCanvas) return;
        
        const previewContainer = document.getElementById('select-panel-preview');
        const canvasWrapper = document.getElementById('select-panel-canvas-wrapper');
        if (!previewContainer || !canvasWrapper) return;
        
        // Get available space (account for sidebar, padding, pagination, toolbar)
        const sidebar = document.getElementById('select-panel-sidebar');
        const sidebarWidth = sidebar ? sidebar.offsetWidth : 300;
        const toolbar = document.getElementById('select-panel-toolbar');
        const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
        const pagination = document.getElementById('select-panel-pagination');
        const paginationHeight = pagination && pagination.style.display !== 'none' ? pagination.offsetHeight : 0;
        
        const windowHeight = window.innerHeight;
        const windowWidth = window.innerWidth;
        const availableHeight = windowHeight - toolbarHeight - paginationHeight - 60; // Account for padding
        const availableWidth = windowWidth - sidebarWidth - 60; // Account for padding
        
        const canvasHeight = selectPanelModalFabricCanvas.getHeight();
        const canvasWidth = selectPanelModalFabricCanvas.getWidth();
        
        const scaleHeight = availableHeight / canvasHeight;
        const scaleWidth = availableWidth / canvasWidth;
        const scale = Math.min(scaleHeight, scaleWidth, 1);
        
        // Apply zoom to wrapper
        if (scale < 1) {
          const zoomPercent = Math.floor(scale * 100);
          canvasWrapper.style.zoom = \`\${zoomPercent}%\`;
        } else {
          canvasWrapper.style.zoom = '100%';
        }
      }
      
      async function loadPanelPreviewPage(pageIndex) {
        try {
          const canvas = document.getElementById('select-panel-canvas');
          if (!canvas) return;
          
          if (!selectPanelModalFullImageBase64) {
            canvas.style.display = 'none';
            return;
          }
          
          // Crop page from full image
          const pageBase64 = await cropPageFromPanel(pageIndex);
          if (!pageBase64) {
            canvas.style.display = 'none';
            return;
          }
          
          // Load image to get dimensions
          const img = new Image();
          img.src = 'data:image/png;base64,' + pageBase64;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          
          // Dispose existing canvas if any
          if (selectPanelModalFabricCanvas) {
            selectPanelModalFabricCanvas.dispose();
            selectPanelModalFabricCanvas = null;
          }
          
          // Initialize Fabric.js canvas
          selectPanelModalFabricCanvas = new fabric.Canvas('select-panel-canvas', {
            width: img.naturalWidth,
            height: img.naturalHeight,
            backgroundColor: '#000'
          });
          
          // Set background image
          await new Promise((resolve) => {
            fabric.Image.fromURL(img.src, (fabricImg) => {
              selectPanelModalFabricCanvas.setBackgroundImage(fabricImg, () => {
                selectPanelModalFabricCanvas.renderAll();
                resolve();
              });
            });
          });
          
          // Always show canvas
          canvas.style.display = 'block';
          
          // Force canvas to render first
          if (selectPanelModalFabricCanvas) {
            selectPanelModalFabricCanvas.renderAll();
          }
          
          // Auto zoom to fit after layout settles
          setTimeout(() => {
            autoZoomToFitSelectPanel();
          }, 50);
          
          // Update page indicator
          const indicator = document.getElementById('select-panel-page-indicator');
          if (indicator) {
            indicator.textContent = \`Page \${pageIndex + 1}/\${selectPanelModalNumPages}\`;
          }
          
          // Update prev/next button states
          const prevBtn = document.getElementById('select-panel-prev-page');
          const nextBtn = document.getElementById('select-panel-next-page');
          if (prevBtn) {
            prevBtn.disabled = pageIndex === 0;
            prevBtn.style.opacity = pageIndex === 0 ? '0.5' : '1';
            prevBtn.style.cursor = pageIndex === 0 ? 'not-allowed' : 'pointer';
          }
          if (nextBtn) {
            nextBtn.disabled = pageIndex >= selectPanelModalNumPages - 1;
            nextBtn.style.opacity = pageIndex >= selectPanelModalNumPages - 1 ? '0.5' : '1';
            nextBtn.style.cursor = pageIndex >= selectPanelModalNumPages - 1 ? 'not-allowed' : 'pointer';
          }
          
          // Show/hide pagination controls
          const pagination = document.getElementById('select-panel-pagination');
          if (pagination) {
            pagination.style.display = selectPanelModalNumPages > 1 ? 'flex' : 'none';
          }
          
          // Always show canvas
          canvas.style.display = 'block';
          
          // Force canvas to render
          if (selectPanelModalFabricCanvas) {
            selectPanelModalFabricCanvas.renderAll();
          }
          
        } catch (err) {
          console.error('Failed to load panel preview page:', err);
          const canvas = document.getElementById('select-panel-canvas');
          if (canvas) {
            canvas.style.display = 'none';
          }
          if (selectPanelModalFabricCanvas) {
            selectPanelModalFabricCanvas.dispose();
            selectPanelModalFabricCanvas = null;
          }
        }
      }
      
      async function loadPanelPreview(panelId) {
        try {
          const canvas = document.getElementById('select-panel-canvas');
          if (!canvas) return;
          
          // Load panel image
          let panelImageBase64 = null;
          if (window.getPanelImage) {
            panelImageBase64 = await window.getPanelImage(panelId);
          }
          
          if (!panelImageBase64) {
            canvas.style.display = 'none';
            if (selectPanelModalFabricCanvas) {
              selectPanelModalFabricCanvas.dispose();
              selectPanelModalFabricCanvas = null;
            }
            // Hide pagination
            const pagination = document.getElementById('select-panel-pagination');
            if (pagination) {
              pagination.style.display = 'none';
            }
            return;
          }
          
          // Store full image for pagination
          selectPanelModalFullImageBase64 = panelImageBase64;
          
          // Get panel metadata for crop area and calculate pages
          let panelMetadata = null;
          if (window.getAllPanels) {
            const panels = await window.getAllPanels();
            const panel = panels.find(p => p.item_id === panelId);
            if (panel) {
              panelMetadata = panel.metadata;
            }
          }
          
          // Load image to get dimensions
          const img = new Image();
          img.src = 'data:image/png;base64,' + panelImageBase64;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          
          // Calculate number of pages (1080px per page)
          const pageHeight = 1080;
          selectPanelModalNumPages = Math.ceil(img.naturalHeight / pageHeight);
          selectPanelModalCurrentPageIndex = 0;
          
          // Load first page
          await loadPanelPreviewPage(0);
          
        } catch (err) {
          console.error('Failed to load panel preview:', err);
          const canvas = document.getElementById('select-panel-canvas');
          if (canvas) {
            canvas.style.display = 'none';
          }
          if (selectPanelModalFabricCanvas) {
            selectPanelModalFabricCanvas.dispose();
            selectPanelModalFabricCanvas = null;
          }
          // Hide pagination
          const pagination = document.getElementById('select-panel-pagination');
          if (pagination) {
            pagination.style.display = 'none';
          }
        }
      }

      // Expose function to window
      window.openSelectPanelModal = openSelectPanelModal;
      
      setTimeout(loadInitialTree, 1000);
    </script>
  </body>
</html>
`;

