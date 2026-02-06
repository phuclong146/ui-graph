export const QUEUE_BROWSER_HTML = `
<html lang="en">
  <head>
    <title>Queue Tracker</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"></script>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
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
        width: 350px;
        min-width: 200px;
        max-width: 60%;
        border-right: 1px solid #e0e0e0;
        background: white;
        overflow-y: auto;
        padding: 10px 0 10px 0;
        position: relative;
        margin-top: -10px;
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
      
      #admin-ai-tools-sidebar {
        position: relative;
      }
      #admin-ai-tools-resizer {
        position: absolute;
        top: 0;
        right: -6px;
        width: 12px;
        height: 100%;
        cursor: col-resize;
        background: transparent;
        z-index: 1001;
        user-select: none;
        touch-action: none;
        pointer-events: auto;
      }
      #admin-ai-tools-resizer:hover {
        background: rgba(0, 0, 0, 0.06);
      }
      #admin-ai-tools-resizer.resizing {
        background: rgba(0, 0, 0, 0.1);
      }
      #admin-ai-tools-resizer::before {
        content: '';
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #dee2e6;
        transform: translateX(-50%);
      }
      #admin-ai-tools-resizer:hover::before,
      #admin-ai-tools-resizer.resizing::before {
        background: #adb5bd;
        width: 3px;
      }
      
      #panel-tree-container h3 {
        margin: 0 0 10px 0;
        padding: 10px 10px;
        font-size: 14px;
        color: #666;
        display: flex;
        justify-content: space-between;
        align-items: center;
        position: relative;
        min-height: 40px;
        box-sizing: border-box;
        line-height: 20px;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      #panel-log-refresh-btn {
        background: transparent;
        color: #666;
        border: none;
        border-radius: 6px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 24px;
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
      
      #panel-log-show-mode-btn {
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
        justify-content: center;
        gap: 4px;
        width: 48px;
        height: 48px;
      }
      
      #panel-log-show-mode-btn:hover {
        color: #007bff;
      }
      
      #panel-log-show-mode-btn:active {
        transform: scale(0.95);
      }
      
      #panel-log-show-mode-btn svg {
        width: 32px;
        height: 32px;
        fill: currentColor;
      }
      
      #panel-log-show-mode-btn img {
        width: 24px;
        height: 24px;
        display: block;
      }
      
      /* Shared style for panel log mode buttons in modals */
      .panel-log-mode-btn {
        background: transparent;
        color: #999;
        border: none;
        border-radius: 6px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 32px;
        height: 32px;
      }
      
      .panel-log-mode-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }
      
      .panel-log-mode-btn:active {
        transform: scale(0.95);
      }
      
      .panel-log-mode-btn img {
        width: 20px;
        height: 20px;
        display: block;
      }

      /* ADMIN/VALIDATE: highlight tool đang chọn trong panel log (AI tools list) */
      .admin-ai-tool-item-selected {
        background: #e8d4f8 !important;
        border-color: #9c27b0 !important;
        border-width: 2px !important;
        font-weight: 600;
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
      
      .tree-node-content.session-has-assignee {
        background: rgba(255, 193, 7, 0.15);
        border-left: 3px solid #ffc107;
      }
      
      .tree-node-content.session-assigned-to-me {
        background: rgba(76, 175, 80, 0.2);
        border-left: 3px solid #4caf50;
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
      
      .collaborators-active-cell:hover {
        color: #0056b3 !important;
        text-decoration: underline !important;
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
        position: relative;
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
        align-items: center;
        height: 40px;
        box-sizing: border-box;
      }

      .controls-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      #controls .controls-quit {
        margin-left: 8px;
        padding-left: 12px;
        border-left: 1px solid #dee2e6;
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

      #sessionConflictModal {
        animation: fadeIn 0.3s ease;
      }

      #conflictDeviceDetailsBtn:hover {
        background: #138496;
        transform: translateY(-1px);
      }

      #conflictOkBtn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,123,255,0.5);
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
        padding: 10px;
        margin-bottom: 8px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px;
        cursor: pointer;
        color: #fff;
        font-size: 11px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .select-panel-item:hover {
        background: rgba(255,255,255,0.1);
      }

      .select-panel-item.selected {
        background: rgba(102, 126, 234, 0.3);
        border-color: rgba(102, 126, 234, 0.6);
      }

      .select-panel-item-content {
        flex: 1;
      }

      .select-panel-item-name {
        font-weight: 600;
        margin-bottom: 4px;
        color: #fff;
      }

      .select-panel-item-status {
        font-size: 11px;
        color: #aaa;
      }

      #select-panel-save:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(58,71,213,0.5);
      }

      #select-panel-cancel:hover {
        background: #555 !important;
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
      
      #graphInfoResizer {
        position: absolute;
        left: -6px;
        top: 0;
        width: 12px;
        height: 100%;
        cursor: col-resize;
        background: transparent;
        z-index: 1000;
        user-select: none;
        touch-action: none;
      }
      
      #graphInfoResizer:hover {
        background: rgba(0, 123, 255, 0.1);
      }
      
      #graphInfoResizer.resizing {
        background: rgba(0, 123, 255, 0.2);
      }
      
      #graphInfoResizer::before {
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
      
      #graphInfoResizer:hover::before {
        background: #007bff;
        width: 3px;
      }
      
      #graphInfoResizer.resizing::before {
        background: #007bff;
        width: 4px;
      }
      
      #graphPanelLogTreeContainer {
        width: 320px;
        min-width: 200px;
        max-width: 40vw;
        background: #2a2a2a;
        border-right: 1px solid #333;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        position: relative;
      }
      
      #graphPanelLogTreeResizer {
        position: absolute;
        right: -6px;
        top: 0;
        width: 12px;
        height: 100%;
        cursor: col-resize;
        background: transparent;
        z-index: 1000;
        user-select: none;
        touch-action: none;
      }
      
      #graphPanelLogTreeResizer:hover {
        background: rgba(0, 123, 255, 0.1);
      }
      
      #graphPanelLogTreeResizer.resizing {
        background: rgba(0, 123, 255, 0.2);
      }
      
      #graphPanelLogTreeResizer::before {
        content: '';
        position: absolute;
        left: 50%;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #555;
        transform: translateX(-50%);
        transition: all 0.2s ease;
      }
      
      #graphPanelLogTreeResizer:hover::before {
        background: #007bff;
        width: 3px;
      }
      
      #graphPanelLogTreeResizer.resizing::before {
        background: #007bff;
        width: 4px;
      }
      
      #graphPanelLogTree {
        flex: 1;
        overflow-y: auto;
        padding: 10px 0;
      }
      
      .graph-tree-node {
      }
      
      .graph-tree-node-content {
        display: flex;
        align-items: center;
        padding: 4px 4px 4px 4px;
        cursor: pointer;
        border-radius: 4px;
        font-size: 13px;
        user-select: none;
        color: #fff;
      }
      
      .graph-tree-node-content:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      
      .graph-tree-node-content.selected {
        background: rgba(0, 123, 255, 0.3);
      }
      
      .graph-tree-node-content.session-has-assignee {
        background: rgba(255, 193, 7, 0.15);
        border-left: 3px solid #ffc107;
      }
      
      .graph-tree-node-content.session-assigned-to-me {
        background: rgba(76, 175, 80, 0.2);
        border-left: 3px solid #4caf50;
      }
      
      .graph-tree-expand {
        width: 12px;
        height: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: 0px;
        font-size: 10px;
        cursor: pointer;
        color: #fff;
      }
      
      .graph-tree-node-dot {
        margin-right: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        position: relative;
      }
      
      .graph-tree-node-dot svg {
        width: 100%;
        height: 100%;
      }
      
      .graph-tree-label {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #fff;
      }
      
      .graph-tree-incomplete-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        margin-left: 6px;
        background: rgba(255, 193, 7, 0.3);
        color: #ffc107;
        border: 1px solid #ffc107;
      }
      
      .graph-tree-children {
        display: none;
      }
      
      .graph-tree-children.expanded {
        display: block;
      }
      
      .graph-tree-children.level-1 {
        padding-left: 4px;
      }
      
      .graph-tree-children.level-2 {
        padding-left: 4px;
      }
      
      #stepInfoContainer {
        display: flex;
        flex-direction: row;
        gap: 15px;
        align-items: flex-start;
        min-width: max-content;
      }
      
      #stepPanelBefore, #stepPanelAfter {
        flex: 0 0 auto;
        min-width: 300px;
        max-width: 500px;
        display: flex;
        flex-direction: column;
      }
      
      #stepPanelBefore img, #stepPanelAfter img {
        max-width: 100%;
        height: auto;
        border: 1px solid #555;
        border-radius: 4px;
      }
      
      #stepAction {
        flex: 0 0 auto;
        min-width: 200px;
        max-width: 300px;
        display: flex;
        flex-direction: column;
        padding: 10px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <div id="main-container">
      <div id="admin-ai-tools-sidebar" style="display:none; width:180px; min-width:180px; max-width:480px; background:linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%); border-right:1px solid #dee2e6; flex-shrink:0; flex-direction:column; overflow:hidden;">
        <div style="padding:10px 12px; border-bottom:1px solid #dee2e6; display:flex; align-items:center; justify-content:space-between; flex-shrink:0;">
          <span style="font-size:13px; font-weight:600; color:#495057;">AI Tools</span>
          <button id="admin-ai-tools-close-btn" style="background:transparent; border:none; color:#6c757d; cursor:pointer; padding:2px 6px; font-size:16px; line-height:1;" title="Đóng">×</button>
        </div>
        <div style="padding:8px; border-bottom:1px solid #dee2e6; flex-shrink:0;">
          <input type="text" id="admin-ai-tools-filter" placeholder="Lọc theo tên hoặc URL..." style="width:100%; padding:8px 10px; border:1px solid #ced4da; border-radius:6px; background:#fff; color:#212529; font-size:12px; outline:none; box-sizing:border-box;" />
        </div>
        <div id="admin-ai-tools-list" style="flex:1; overflow-y:auto; padding:8px; background:#f1f3f5;"></div>
        <div id="admin-ai-tools-resizer"></div>
      </div>
      <div id="panel-tree-container">
        <h3>
          <span>Panel Log</span>
          <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
            <label id="panel-log-my-assignment-wrapper" style="display:none; align-items:center; gap:3px; cursor:pointer; font-size:11px; font-weight:500; margin:0; padding:2px 6px; background:#f0f0f0; border-radius:4px;">
              <input type="checkbox" id="panel-log-my-assignment-cb" style="cursor:pointer; width:14px; height:14px;" />
              <span style="white-space:nowrap;">My Assignment</span>
            </label>
            <button id="panel-log-show-mode-btn" title="Switch to Tree Mode">
              <img src="https://cdn.jsdelivr.net/npm/remixicon/icons/Editor/node-tree.svg" alt="Tree Mode" style="width: 24px; height: 24px; filter: brightness(0) saturate(100%) invert(0%);" />
            </button>
            <button id="panel-log-refresh-btn" title="Refresh Panel Log">🔄</button>
          </div>
        </h3>
        <div id="panel-tree"></div>
        <div id="panel-log-resizer"></div>
      </div>
      
      <div id="content-container" style="position:relative;">
    <div id="controls">
      <div id="controls-draw-group" class="controls-group">
        <button id="captureActionsDOMBtn" style="display:none; background:#007bff;">📸 Detect Action</button>
        <button id="drawPanelAndDetectActionsBtn" style="display:none; background:#007bff;">🎨 Draw Panel & Detect Actions</button>
        <button id="detectPagesBtn" style="display:none; background:#007bff;">📄 Detect Pages (Old)</button>
        <button id="drawPanelBtn" style="display:none !important;">🖼️ Draw Panel</button>
        <button id="importCookiesBtn" style="display:inline-block;">🍪 Import Cookies</button>
        <input type="file" id="cookieFileInput" accept=".json" style="display:none;">
        <button id="saveBtn" style="background:#007bff;">💾 Save</button>
        <button id="checkpointBtn" style="background:#28a745;">↩️ Rollback</button>
        <button id="viewGraphBtn" style="background:#007bff; display:flex; align-items:center; gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;">
            <circle cx="6" cy="6" r="3"></circle>
            <circle cx="18" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="6" y1="6" x2="12" y2="12"></line>
            <line x1="18" y1="6" x2="12" y2="12"></line>
            <line x1="6" y1="18" x2="12" y2="12"></line>
            <line x1="18" y1="18" x2="12" y2="12"></line>
          </svg>
          View Graph
        </button>
        <button id="validateBtn" style="background:#ff9800; color:white;">✓ Validate</button>
        <button id="detectActionsGeminiBtn" style="display:none; background:white; color:#007bff; border:1px solid #007bff; padding:3px 6px; font-size:9px;">🤖 Detect Action Backup</button>
      </div>
      <div id="controls-admin-validate-group" class="controls-group" style="display:none;">
        <button id="aiToolsBtn" style="background:#9c27b0; color:white;">AI Tools</button>
        <span id="controls-current-tool" style="display:none; align-items:center; padding:4px 10px; background:#e8e0f0; border-radius:6px; font-size:13px; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="Tool đang chọn"></span>
        <button id="randomlyAssignBtn" style="background:#17a2b8; color:white;">Randomly assign</button>
        <button id="collaboratorsBtn" style="background:#5a6268; color:white;">Collaborators</button>
      </div>
      <button id="quitBtn" class="controls-quit" style="background:#6c757d;">✕ Quit</button>
    </div>
    
    <div id="drawPanelMenu" style="display:none; position:absolute; background:white; border:1px solid #ddd; border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:10000; padding:4px;">
      <button class="draw-panel-option" data-mode="DRAW_NEW" style="display:block; width:100%; padding:10px 20px; border:none; background:white; text-align:left; cursor:pointer; font-size:14px; border-radius:3px;">📝 CREATE NEW PANEL</button>
      <button class="draw-panel-option" data-mode="USE_BEFORE" style="display:block; width:100%; padding:10px 20px; border:none; background:white; text-align:left; cursor:pointer; font-size:14px; border-radius:3px; margin-top:2px;">🔄 USE CURRENT PANEL</button>
    </div>
    
    <button id="clearAllClicksBtn" style="display:none; margin:10px; padding:8px 16px; background:#ff9800; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600;">🗑️ Clear All Clicks</button>

    <div id="events"></div>
      </div>
    </div>

    <div id="collaboratorsModal" style="display:none; position:fixed; inset:0; z-index:20005; background-color:rgba(0,0,0,0.5); justify-content:center; align-items:center;">
      <div id="collaboratorsModalPanel" style="position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:1200px; max-width:95vw; height:85vh; min-width:400px; min-height:300px; background:white; border-radius:12px; padding:0; box-shadow:0 8px 32px rgba(0,0,0,0.3); display:flex; flex-direction:column; overflow:hidden;">
        <div id="collaboratorsModalDragHandle" style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid #e0e0e0; flex-shrink:0; cursor:move; user-select:none;">
          <h3 style="margin:0; font-size:20px; color:#333;">Quản lý phiên làm việc CTV</h3>
          <button id="closeCollaboratorsModal" style="background:none; border:none; font-size:28px; cursor:pointer; color:#666; padding:0; width:30px; height:30px; line-height:1;">&times;</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin:12px 16px; flex-shrink:0;">
          <input type="text" id="collaboratorsSearchInput" placeholder="Tên CTV" style="padding:8px 12px; border:1px solid #ced4da; border-radius:6px; width:200px; font-size:13px;" />
          <label style="display:flex; align-items:center; gap:6px; font-size:13px;">AI Tool:</label>
          <select id="collaboratorsAiToolSelect" style="padding:6px 12px; border:1px solid #ced4da; border-radius:6px; min-width:180px; font-size:13px;">
            <option value="">Tất cả</option>
          </select>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px;">Role:</label>
          <div id="collaboratorsRoleDropdownWrap" style="position:relative;">
            <button type="button" id="collaboratorsRoleTrigger" style="padding:6px 12px; border:1px solid #ced4da; border-radius:6px; min-width:140px; font-size:13px; background:#fff; cursor:pointer; text-align:left;">DRAW ▼</button>
            <div id="collaboratorsRoleDropdown" style="display:none; position:absolute; left:0; top:100%; margin-top:2px; background:#fff; border:1px solid #ced4da; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:20006; padding:6px 0; min-width:140px;">
              <label style="display:flex; align-items:center; gap:8px; padding:6px 12px; cursor:pointer; font-size:13px;"><input type="checkbox" class="collaborators-role-cb" value="DRAW" checked /> DRAW</label>
              <label style="display:flex; align-items:center; gap:8px; padding:6px 12px; cursor:pointer; font-size:13px;"><input type="checkbox" class="collaborators-role-cb" value="VALIDATE" /> VALIDATE</label>
              <label style="display:flex; align-items:center; gap:8px; padding:6px 12px; cursor:pointer; font-size:13px;"><input type="checkbox" class="collaborators-role-cb" value="ADMIN" /> ADMIN</label>
            </div>
          </div>
          <label style="font-size:13px;">Từ:</label>
          <input type="datetime-local" id="collaboratorsDateFrom" style="padding:6px 10px; border:1px solid #ced4da; border-radius:6px; font-size:13px;" />
          <label style="font-size:13px;">Đến:</label>
          <input type="datetime-local" id="collaboratorsDateTo" style="padding:6px 10px; border:1px solid #ced4da; border-radius:6px; font-size:13px;" />
          <button id="collaboratorsFilterBtn" style="padding:8px 16px; background:#007bff; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">Tìm</button>
        </div>
        <div id="collaboratorsTableWrap" style="flex:1; overflow:auto; margin:0 16px; border:1px solid #dee2e6; border-radius:6px; min-height:200px;">
          <table id="collaboratorsSessionsTable" style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
              <tr style="background:#f8f9fa;">
                <th style="padding:8px; text-align:left; border-bottom:1px solid #dee2e6;">session_id</th>
                <th style="padding:8px; text-align:left; border-bottom:1px solid #dee2e6;">Tên tool</th>
                <th style="padding:8px; text-align:left; border-bottom:1px solid #dee2e6;">Tên CTV</th>
                <th style="padding:8px; text-align:left; border-bottom:1px solid #dee2e6;">ROLE</th>
                <th style="padding:8px; text-align:left; border-bottom:1px solid #dee2e6;">Session name</th>
                <th style="padding:8px; text-align:left; border-bottom:1px solid #dee2e6;">created_at (GMT+7)</th>
                <th style="padding:8px; text-align:left; border-bottom:1px solid #dee2e6;">updated_at (GMT+7)</th>
                <th style="padding:8px; text-align:left; border-bottom:1px solid #dee2e6;">active</th>
                <th style="padding:8px; text-align:left; border-bottom:1px solid #dee2e6;"></th>
              </tr>
            </thead>
            <tbody id="collaboratorsSessionsTbody"></tbody>
          </table>
        </div>
        <div id="collaboratorsPagination" style="display:flex; align-items:center; gap:12px; margin:12px 16px; flex-shrink:0;"></div>
        <div id="collaboratorsModalResizeHandle" style="position:absolute; right:0; bottom:0; width:16px; height:16px; cursor:nwse-resize; background:linear-gradient(135deg, transparent 50%, #dee2e6 50%); border-radius:0 0 12px 0;"></div>
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
            Bạn có thay đổi chưa được lưu từ <span id="saveReminderMinutes">0</span> phút trước. Vui lòng lưu ngay để đảm bảo dữ liệu được bảo toàn.
          </p>
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button id="saveReminderSaveBtn" style="background:linear-gradient(135deg, #007bff 0%, #0056d2 100%); color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(0,123,255,0.3);">
            Lưu
          </button>
        </div>
      </div>
    </div>

    <div id="sessionDetailsDialog" style="display:none; position:fixed; z-index:20010; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div id="sessionDetailsDialogInner" style="background:white; border-radius:12px; padding:20px; width:800px; max-width:95vw; max-height:90vh; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.3); display:flex; flex-direction:column; position:relative; resize:both; min-width:500px; min-height:400px;">
        <div id="sessionDetailsDialogHeader" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid #e0e0e0; padding-bottom:10px; flex-shrink:0; cursor:move; background:#f5f5f5; margin:-20px -20px 16px -20px; padding:10px 20px;">
          <h3 style="margin:0; font-size:18px; color:#333;">Session Details</h3>
          <button id="closeSessionDetailsDialog" style="background:none; border:none; font-size:28px; cursor:pointer; color:#666; padding:0; width:30px; height:30px; line-height:1;">&times;</button>
        </div>
        <div style="margin-bottom:16px; flex-shrink:0;">
          <h4 style="margin:0 0 8px 0; font-size:14px;">DeviceInfo</h4>
          <div id="sessionDetailsDeviceInfo" style="background:#f8f9fa; padding:12px; border-radius:6px; font-size:12px;">
            <div style="display:grid; grid-template-columns: auto 1fr; gap:6px 16px; align-items:baseline;">
              <span style="font-weight:600; color:#495057;">Mã CTV:</span>
              <span id="sessionDetailsMaCtv"></span>
              <span style="font-weight:600; color:#495057;">Tên CTV:</span>
              <span id="sessionDetailsTenCtv"></span>
              <span style="font-weight:600; color:#495057;">Device Id:</span>
              <span id="sessionDetailsDeviceId" style="word-break:break-all;"></span>
              <span style="font-weight:600; color:#495057;"></span>
              <span><a id="sessionDetailsDeviceInfoMore" href="#" style="color:#007bff; font-size:12px;">Xem chi tiết device info</a></span>
            </div>
            <div id="sessionDetailsDeviceInfoDetails" style="display:none; margin-top:12px; padding:10px; background:#fff; border:1px solid #dee2e6; border-radius:4px; max-height:200px; overflow:auto; white-space:pre-wrap; font-size:11px;"></div>
          </div>
        </div>
        <div style="flex:1; overflow:hidden; display:flex; flex-direction:column; min-height:0;">
          <h4 style="margin:0 0 8px 0; font-size:14px;">History</h4>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <input type="text" id="sessionDetailsHistorySearch" placeholder="Tìm theo name, description" style="padding:6px 10px; border:1px solid #ced4da; border-radius:6px; width:240px; font-size:12px;" />
            <button id="sessionDetailsHistorySearchBtn" style="padding:6px 12px; background:#007bff; color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px;">Tìm</button>
          </div>
          <div id="sessionDetailsHistoryWrap" style="flex:1; overflow:auto; border:1px solid #dee2e6; border-radius:6px; min-height:120px;">
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="padding:6px; text-align:left; border-bottom:1px solid #dee2e6;">my_ai_tool</th>
                  <th style="padding:6px; text-align:left; border-bottom:1px solid #dee2e6;">name</th>
                  <th style="padding:6px; text-align:left; border-bottom:1px solid #dee2e6;">description</th>
                  <th style="padding:6px; text-align:left; border-bottom:1px solid #dee2e6;">created_at (GMT+7)</th>
                </tr>
              </thead>
              <tbody id="sessionDetailsHistoryTbody"></tbody>
            </table>
          </div>
          <div id="sessionDetailsHistoryPagination" style="display:flex; align-items:center; gap:8px; margin-top:8px;"></div>
        </div>
      </div>
    </div>

    <div id="sessionConflictModal" style="display:none; position:fixed; z-index:20002; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:30px; max-width:600px; box-shadow:0 4px 20px rgba(0,0,0,0.3); position:relative;">
        <div style="text-align:center; margin-bottom:25px;">
          <div style="font-size:48px; margin-bottom:15px;">⚠️</div>
          <h3 style="margin:0 0 10px 0; font-size:20px; color:#333;">AI Tool đang được sử dụng</h3>
          <p style="margin:0; font-size:14px; color:#666; line-height:1.6;">
            AI Tool này đang được làm bởi người khác. Vui lòng chọn AI Tool khác hoặc liên hệ Admin để chuyển cho bạn làm.
          </p>
        </div>
        <div style="background:#f8f9fa; border-radius:8px; padding:20px; margin-bottom:20px;">
          <div style="margin-bottom:12px;">
            <strong style="color:#333; font-size:14px;">Tên session:</strong>
            <div id="conflictSessionName" style="color:#666; font-size:14px; margin-top:4px;">-</div>
          </div>
          <div style="margin-bottom:12px;">
            <strong style="color:#333; font-size:14px;">Tên người đang làm:</strong>
            <div id="conflictName" style="color:#666; font-size:14px; margin-top:4px;">-</div>
          </div>
          <div style="margin-bottom:12px;">
            <strong style="color:#333; font-size:14px;">Thời gian tạo:</strong>
            <div id="conflictCreationTime" style="color:#666; font-size:14px; margin-top:4px;">-</div>
          </div>
          <div style="margin-bottom:12px;">
            <strong style="color:#333; font-size:14px;">Lần làm gần nhất:</strong>
            <div id="conflictLastWorkTime" style="color:#666; font-size:14px; margin-top:4px;">-</div>
          </div>
          <div style="margin-bottom:12px;">
            <strong style="color:#333; font-size:14px;">Device ID:</strong>
            <div id="conflictDeviceId" style="color:#666; font-size:14px; margin-top:4px; word-break:break-all;">-</div>
          </div>
          <div style="margin-top:15px;">
            <button id="conflictDeviceDetailsBtn" style="background:#17a2b8; color:white; border:none; border-radius:6px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:500; transition:all 0.2s ease;">
              Device Details
            </button>
          </div>
          <div id="conflictDeviceInfo" style="display:none; margin-top:15px; padding:12px; background:white; border:1px solid #ddd; border-radius:6px; max-height:200px; overflow-y:auto;">
            <pre id="conflictDeviceInfoContent" style="margin:0; font-size:12px; color:#333; white-space:pre-wrap; word-wrap:break-word;"></pre>
          </div>
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button id="conflictOkBtn" style="background:linear-gradient(135deg, #007bff 0%, #0056d2 100%); color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(0,123,255,0.3);">
            Đã hiểu
          </button>
        </div>
      </div>
    </div>

    <div id="resetBlockedModal" style="display:none; position:fixed; z-index:20006; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:30px; max-width:700px; max-height:90vh; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <div style="flex-shrink:0; margin-bottom:20px;">
          <div style="font-size:48px; margin-bottom:10px; text-align:center;">&#x26A0;&#xFE0F;</div>
          <h3 style="margin:0 0 10px 0; font-size:20px; color:#333; text-align:center;">Không thể reset action</h3>
          <p id="resetBlockedMessage" style="margin:0; font-size:14px; color:#666; line-height:1.6; text-align:center;"></p>
        </div>
        <div style="flex:1; min-height:0; overflow-y:auto; background:#f8f9fa; border-radius:8px; padding:16px; margin-bottom:20px;">
          <div id="resetBlockedStepList" style="font-family:monospace; font-size:13px; line-height:1.8; color:#333; white-space:pre-wrap;"></div>
        </div>
        <div style="display:flex; justify-content:center; flex-shrink:0;">
          <button id="resetBlockedOkBtn" style="background:linear-gradient(135deg, #007bff 0%, #0056d2 100%); color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600;">Đã hiểu</button>
        </div>
      </div>
    </div>

    <div id="correctChildActionsModal" style="display:none; position:fixed; z-index:20004; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:24px; max-width:720px; width:95%; max-height:90vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <h3 id="correctChildActionsModalTitle" style="margin:0 0 16px 0; font-size:18px; color:#333;">Correct Child Actions</h3>
        <div style="margin-bottom:16px;">
          <label style="font-weight:600; font-size:13px; display:block; margin-bottom:8px;">Chọn actions để chuyển:</label>
          <div id="correctChildActionsActionsList" style="display:flex; flex-wrap:wrap; gap:12px; max-height:300px; overflow-y:auto; padding:8px; border:1px solid #eee; border-radius:6px;"></div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-weight:600; font-size:13px; display:block; margin-bottom:8px;">Panel đích (chọn 1):</label>
          <div id="correctChildActionsDestList" style="max-height:200px; overflow-y:auto; border:1px solid #eee; border-radius:6px; padding:8px;"></div>
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="correctChildActionsCancelBtn" style="background:#6c757d; color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px;">Hủy</button>
          <button id="correctChildActionsMoveBtn" style="background:linear-gradient(135deg, #28a745 0%, #1e7e34 100%); color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px; font-weight:600;">Move</button>
        </div>
      </div>
    </div>
    <div id="correctChildActionsImageLightbox" style="display:none; position:fixed; z-index:20005; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.9); justify-content:center; align-items:center; cursor:pointer;" title="Click to close">
      <img id="correctChildActionsLightboxImg" style="max-width:95%; max-height:95%; object-fit:contain;" />
    </div>

    <div id="correctChildPanelsModal" style="display:none; position:fixed; z-index:20004; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:24px; max-width:720px; width:95%; max-height:90vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <h3 id="correctChildPanelsModalTitle" style="margin:0 0 16px 0; font-size:18px; color:#333;">Correct Child Panels</h3>
        <div style="margin-bottom:16px;">
          <label style="font-weight:600; font-size:13px; display:block; margin-bottom:8px;">Chọn panels để chuyển:</label>
          <div id="correctChildPanelsPanelsList" style="display:flex; flex-wrap:wrap; gap:12px; max-height:300px; overflow-y:auto; padding:8px; border:1px solid #eee; border-radius:6px;"></div>
        </div>
        <div style="margin-bottom:16px;">
          <label style="font-weight:600; font-size:13px; display:block; margin-bottom:8px;">Panel đích (chọn 1):</label>
          <div id="correctChildPanelsDestList" style="max-height:200px; overflow-y:auto; border:1px solid #eee; border-radius:6px; padding:8px;"></div>
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="correctChildPanelsCancelBtn" style="background:#6c757d; color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px;">Hủy</button>
          <button id="correctChildPanelsMoveBtn" style="background:linear-gradient(135deg, #28a745 0%, #1e7e34 100%); color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px; font-weight:600;">Move</button>
        </div>
      </div>
    </div>
    <div id="correctChildPanelsImageLightbox" style="display:none; position:fixed; z-index:20005; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.9); justify-content:center; align-items:center; cursor:pointer;" title="Click to close">
      <img id="correctChildPanelsLightboxImg" style="max-width:95%; max-height:95%; object-fit:contain;" />
    </div>

    <div id="assignValidatorModal" style="display:none; position:fixed; z-index:20002; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:24px; max-width:480px; width:90%; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <h3 style="margin:0 0 16px 0; font-size:18px; color:#333;">Chọn CTV (Assign Validator)</h3>
        <input type="text" id="assignValidatorFilter" placeholder="Lọc theo tên hoặc code..." style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; margin-bottom:12px; font-size:14px; box-sizing:border-box;" />
        <div id="assignValidatorList" style="max-height:280px; overflow-y:auto; border:1px solid #eee; border-radius:6px; margin-bottom:16px;"></div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="assignValidatorCancelBtn" style="background:#6c757d; color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px;">Hủy</button>
          <button id="assignValidatorAssignBtn" style="background:linear-gradient(135deg, #007bff 0%, #0056d2 100%); color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px; font-weight:600;">Assign</button>
        </div>
      </div>
    </div>

    <div id="setImportantActionModal" style="display:none; position:fixed; z-index:20003; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:24px; max-width:520px; width:90%; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <h3 style="margin:0 0 16px 0; font-size:18px; color:#333;">Set Important Action</h3>
        <label style="display:block; font-size:14px; font-weight:600; color:#333; margin-bottom:6px;">Mô tả lý do quan trọng <span style="color:red;">*</span></label>
        <textarea id="setImportantActionReason" placeholder="Nhập lý do..." style="width:100%; min-height:80px; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px; box-sizing:border-box; resize:vertical;" rows="3"></textarea>
        <p id="setImportantActionReasonError" style="display:none; color:#dc3545; font-size:12px; margin:4px 0 0 0;">Vui lòng nhập mô tả lý do quan trọng.</p>
        <label style="display:block; font-size:14px; font-weight:600; color:#333; margin:14px 0 6px 0;">Chọn modality_stack (có thể chọn nhiều)</label>
        <div id="setImportantActionModalityList" style="max-height:220px; overflow-y:auto; border:1px solid #eee; border-radius:6px; padding:8px; margin-bottom:16px;"></div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="setImportantActionCancelBtn" style="background:#6c757d; color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px;">Hủy</button>
          <button id="setImportantActionOkBtn" style="background:linear-gradient(135deg, #007bff 0%, #0056d2 100%); color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px; font-weight:600;">OK</button>
        </div>
      </div>
    </div>

    <div id="randomlyAssignModal" style="display:none; position:fixed; z-index:20002; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.7); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:24px; max-width:480px; width:90%; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <h3 style="margin:0 0 16px 0; font-size:18px; color:#333;">Randomly assign – Chọn CTV</h3>
        <p id="randomlyAssignSessionCount" style="margin:0 0 12px 0; font-size:13px; color:#666;">Đang tải...</p>
        <input type="text" id="randomlyAssignFilter" placeholder="Lọc theo tên hoặc code..." style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; margin-bottom:12px; font-size:14px; box-sizing:border-box;" />
        <div id="randomlyAssignList" style="max-height:280px; overflow-y:auto; border:1px solid #eee; border-radius:6px; margin-bottom:16px;"></div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="randomlyAssignCancelBtn" style="background:#6c757d; color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px;">Hủy</button>
          <button id="randomlyAssignAssignBtn" style="background:linear-gradient(135deg, #007bff 0%, #0056d2 100%); color:white; border:none; border-radius:6px; padding:10px 20px; cursor:pointer; font-size:14px; font-weight:600;">Assign</button>
        </div>
      </div>
    </div>

    <div id="panelTypeConfirmationModal" style="display:none; position:fixed; z-index:20003; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.85); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:30px; max-width:95vw; max-height:95vh; box-shadow:0 4px 20px rgba(0,0,0,0.3); position:relative; display:flex; flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #e0e0e0; padding-bottom:15px;">
          <h3 style="margin:0; font-size:20px; color:#333;">Xác nhận Panel Type</h3>
        </div>
        <div style="flex:1; overflow:auto; margin-bottom:20px; display:flex; flex-direction:column; align-items:center;">
          <img id="panelTypePreviewImg" style="max-width:100%; max-height:70vh; border:1px solid #ddd; border-radius:8px; object-fit:contain;" />
        </div>
        <div style="margin-bottom:20px;">
          <p style="margin-bottom:15px; padding:12px; background-color:#fff3cd; border:1px solid #ffc107; border-radius:6px; font-size:13px; color:#856404; font-weight:600; line-height:1.5;">
            ⚠️ Đây là thông tin QUAN TRỌNG. Xin hãy KIỂM TRA KỸ VÀ CHỌN ĐÚNG LOẠI của panel mới này!
          </p>
          <label style="display:block; margin-bottom:8px; font-weight:600; color:#333;">Panel Type:</label>
          <select id="panelTypeSelect" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:6px; font-size:14px;">
            <option value="screen">Screen</option>
            <option value="popup">Popup/Dropdown (Overlay - hiện lên trên screen cũ)</option>
            <option value="newtab">New Tab</option>
          </select>
          <p style="margin-top:8px; font-size:12px; color:#666; line-height:1.5;">
            Gemini đã detect: <strong id="panelTypeDetectedValue"></strong>. Bạn có thể chỉnh sửa nếu cần.
          </p>
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="cancelPanelTypeBtn" style="background:#6c757d; color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease;">
            ❌ Hủy
          </button>
          <button id="confirmPanelTypeBtn" style="background:linear-gradient(135deg, #007bff 0%, #0056d2 100%); color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(0,123,255,0.3);">
            ✅ Xác nhận
          </button>
        </div>
      </div>
    </div>

    <div id="panelCompletionConfirmationModal" style="display:none; position:fixed; z-index:20004; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.85); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:30px; max-width:600px; box-shadow:0 4px 20px rgba(0,0,0,0.3); position:relative;">
        <div style="text-align:center; margin-bottom:25px;">
          <div style="font-size:48px; margin-bottom:15px;">✅</div>
          <h3 style="margin:0 0 15px 0; font-size:20px; color:#333;">Xác nhận hoàn tất</h3>
          <p style="margin:0 0 20px 0; font-size:14px; color:#666; line-height:1.6;">
            Bạn đã chắc chắn vẽ đúng panel mới và đúng/đủ các action của panel mới chưa?
          </p>
          <p style="margin:0; padding:12px; background-color:#fff3cd; border:1px solid #ffc107; border-radius:6px; font-size:13px; color:#856404; font-weight:600; line-height:1.5;">
            ⚠️ Đây là thông tin QUAN TRỌNG. Xin hãy KIỂM TRA KỸ và CHỈ BẤM "HOÀN TẤT" khi đã VẼ ĐÚNG PANEL VÀ ĐỦ ACTIONS!
          </p>
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button id="cancelPanelCompletionBtn" style="background:#6c757d; color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease;">
            Chưa
          </button>
          <button id="confirmPanelCompletionBtn" style="background:linear-gradient(135deg, #28a745 0%, #20c997 100%); color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(40,167,69,0.3);">
            Hoàn tất
          </button>
        </div>
      </div>
    </div>

    <div id="geminiBillingErrorModal" style="display:none; position:fixed; z-index:20006; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.85); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:30px; max-width:500px; box-shadow:0 4px 20px rgba(0,0,0,0.3); position:relative;">
        <div style="text-align:center; margin-bottom:25px;">
          <div style="font-size:48px; margin-bottom:15px;">⚠️</div>
          <h3 style="margin:0 0 15px 0; font-size:20px; color:#333;">Cảnh báo Gemini</h3>
          <p style="margin:0; padding:12px; background-color:#fff3cd; border:1px solid #ffc107; border-radius:6px; font-size:14px; color:#856404; font-weight:600; line-height:1.6;">
            Tài khoản Gemini đang không sẵn sàng, liên hệ Admin để hỗ trợ!
          </p>
        </div>
        <div style="display:flex; gap:10px; justify-content:center;">
          <button id="geminiBillingErrorOkBtn" style="background:linear-gradient(135deg, #dc3545 0%, #c82333 100%); color:white; border:none; border-radius:8px; padding:12px 24px; cursor:pointer; font-size:14px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(220,53,69,0.3);">
            Đã hiểu
          </button>
        </div>
      </div>
    </div>

    <div id="roleSelectionModal" style="display:none; position:fixed; z-index:20005; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.85); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:30px; max-width:500px; min-width:400px; box-shadow:0 4px 20px rgba(0,0,0,0.3); position:relative;">
        <div style="text-align:center; margin-bottom:25px;">
          <div style="font-size:48px; margin-bottom:15px;">👤</div>
          <h3 style="margin:0 0 15px 0; font-size:20px; color:#333;">Thông tin người record</h3>
          <p style="margin:0; font-size:14px; color:#666; line-height:1.6;">
            Vui lòng nhập tên và chọn role trước khi bắt đầu làm việc.
          </p>
        </div>
        
        <!-- Name input section -->
        <div id="nameInputSection" style="margin-bottom:20px;">
          <label style="display:block; font-size:14px; font-weight:600; color:#333; margin-bottom:8px;">Tên của bạn <span style="color:red;">*</span></label>
          <div style="display:flex; gap:10px; align-items:center;">
            <input type="text" id="recorderNameInput" placeholder="Nhập tên của bạn..." style="flex:1; padding:12px 15px; border:2px solid #ddd; border-radius:8px; font-size:14px; transition:border-color 0.2s ease; outline:none;" />
            <button id="editNameBtn" style="display:none; padding:10px 15px; background:#f0f0f0; border:1px solid #ddd; border-radius:8px; cursor:pointer; font-size:13px; transition:all 0.2s ease;">
              ✏️ Sửa
            </button>
          </div>
          <p id="nameError" style="display:none; color:#dc3545; font-size:12px; margin-top:5px;">Vui lòng nhập tên của bạn</p>
        </div>

        <!-- Display current name when exists -->
        <div id="currentNameDisplay" style="display:none; margin-bottom:20px; padding:15px; background:#f8f9fa; border-radius:8px; border:1px solid #e9ecef;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div id="currentNameViewMode">
              <span style="font-size:12px; color:#666;">Xin chào,</span>
              <div id="currentNameText" style="font-size:16px; font-weight:600; color:#333;"></div>
            </div>
            <div id="currentNameEditMode" style="display:none; flex:1;">
              <input type="text" id="editNameInput" placeholder="Nhập tên của bạn..." style="width:100%; padding:10px 12px; border:2px solid #007bff; border-radius:6px; font-size:14px; outline:none;" />
            </div>
            <button id="changeNameBtn" style="padding:8px 12px; background:#fff; border:1px solid #ddd; border-radius:6px; cursor:pointer; font-size:12px; transition:all 0.2s ease; margin-left:10px;">
              ✏️ Đổi tên
            </button>
          </div>
        </div>

        <!-- Role selection -->
        <div style="margin-bottom:10px;">
          <label style="display:block; font-size:14px; font-weight:600; color:#333; margin-bottom:12px; text-align:center;">Chọn Role</label>
          <div style="display:flex; gap:15px; justify-content:center;">
            <button id="roleDrawBtn" style="background:linear-gradient(135deg, #007bff 0%, #0056d2 100%); color:white; border:none; border-radius:8px; padding:15px 35px; cursor:pointer; font-size:16px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(0,123,255,0.3);">
              DRAW
            </button>
            <button id="roleValidateBtn" style="background:linear-gradient(135deg, #ff9800 0%, #f57c00 100%); color:white; border:none; border-radius:8px; padding:15px 35px; cursor:pointer; font-size:16px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(255,152,0,0.3);">
              VALIDATE
            </button>
            <button id="roleAdminBtn" style="background:linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%); color:white; border:none; border-radius:8px; padding:15px 35px; cursor:pointer; font-size:16px; font-weight:600; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(156,39,176,0.3);">
              ADMIN
            </button>
          </div>
        </div>
        
        <!-- Device info display -->
        <div id="deviceInfoDisplay" style="margin-top:15px; padding:10px; background:#f8f9fa; border-radius:6px; font-size:11px; color:#666;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span>🖥️</span>
            <span id="deviceIdText" style="word-break:break-all; flex:1;">Device ID: Loading...</span>
            <button id="copyDeviceIdBtn" style="padding:4px 8px; background:#fff; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:10px; transition:all 0.2s ease; white-space:nowrap;" title="Copy Device ID">
              📋 Copy
            </button>
          </div>
        </div>
      </div>
    </div>

    <div id="adminPasswordModal" style="display:none; position:fixed; z-index:20006; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.85); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:30px; max-width:400px; min-width:320px; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
        <div style="text-align:center; margin-bottom:20px;">
          <div style="font-size:40px; margin-bottom:10px;">🔐</div>
          <h3 style="margin:0 0 8px 0; font-size:18px; color:#333;">Mật khẩu ADMIN</h3>
          <p style="margin:0; font-size:13px; color:#666;">Nhập mật khẩu để đăng nhập role ADMIN</p>
        </div>
        <input type="password" id="adminPasswordInput" placeholder="Nhập mật khẩu..." style="width:100%; padding:12px 15px; border:2px solid #ddd; border-radius:8px; font-size:14px; margin-bottom:8px; outline:none; box-sizing:border-box;" />
        <label style="display:flex; align-items:center; gap:8px; margin-bottom:12px; font-size:13px; color:#666; cursor:pointer;">
          <input type="checkbox" id="adminPasswordShowCheckbox" checked style="cursor:pointer;" />
          <span>Hiện mật khẩu</span>
        </label>
        <p id="adminPasswordError" style="display:none; color:#dc3545; font-size:12px; margin:0 0 12px 0;">Mật khẩu không đúng</p>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="adminPasswordCancelBtn" style="padding:10px 20px; background:#f0f0f0; border:1px solid #ddd; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600;">Hủy</button>
          <button id="adminPasswordOkBtn" style="padding:10px 20px; background:linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%); color:white; border:none; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600;">OK</button>
        </div>
      </div>
    </div>

    <div id="loadingModal" style="display:none; position:fixed; z-index:20010; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.85); justify-content:center; align-items:center;">
      <div style="background:white; border-radius:12px; padding:40px; max-width:500px; min-width:400px; box-shadow:0 4px 20px rgba(0,0,0,0.3); position:relative; text-align:center;">
        <div style="font-size:48px; margin-bottom:20px;">⏳</div>
        <h3 style="margin:0 0 15px 0; font-size:20px; color:#333;">Đang xử lý, vui lòng chờ giây lát!</h3>
        <p id="loadingModalMessage" style="margin:0; font-size:14px; color:#666; line-height:1.6;">
          Vui lòng đợi trong khi hệ thống đang tải dữ liệu và tạo các file JSONL...
        </p>
        <div style="margin-top:30px;">
          <div style="display:inline-block; width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #007bff; border-radius:50%; animation:spin 1s linear infinite;"></div>
        </div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </div>
    </div>

    <div id="select-panel-container" style="display:none; position:fixed; z-index:20002; left:0; top:0; width:100%; height:100%; background:rgba(0,0,0,0.95); flex-direction:row;">
      <div id="select-panel-sidebar" style="width:200px; background:rgba(26, 26, 26, 0.95); backdrop-filter:blur(10px); border-right:1px solid rgba(255,255,255,0.1); display:flex; flex-direction:column; overflow:hidden;">
        <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.1);">
          <button id="select-panel-draw-new" style="width:100%; padding:10px 16px; background:linear-gradient(135deg, #ffb3d9 0%, #ff99cc 100%); color:#333; border:none; border-radius:8px; cursor:pointer; font-size:11px; font-weight:600; text-align:center; transition:all 0.2s ease; box-shadow:0 2px 8px rgba(255,179,217,0.3);">
            ➕ DRAW NEW PANEL (vẽ panel mới nếu chưa có)
          </button>
        </div>
        <div id="select-panel-list" style="flex:1; overflow-y:auto; padding:10px;">
          <div style="text-align:center; padding:20px; color:#aaa; font-size:12px;">Loading panels...</div>
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
      <div id="select-panel-toolbar" style="position:absolute; top:50%; right:10px; transform:translateY(-50%); padding:15px 10px; background:rgba(26, 26, 26, 0.95); backdrop-filter:blur(10px); display:flex; flex-direction:column; gap:10px; align-items:stretch; box-shadow:0 2px 10px rgba(0,0,0,0.5); border-radius:12px; z-index:1000; min-width:160px;">
        <button id="select-panel-save" class="editor-btn save-btn" style="border:none; border-radius:8px; padding:8px 16px; cursor:pointer; font-weight:600; font-size:13px; transition:all 0.2s ease;">
          💾 Save Changes
        </button>
        <button id="select-panel-cancel" class="editor-btn cancel-btn" style="border:none; border-radius:8px; padding:8px 16px; cursor:pointer; font-weight:600; font-size:13px; transition:all 0.2s ease;">
          ❌ Cancel
        </button>
      </div>
    </div>

    <div id="graphViewModal" style="display:none; position:fixed; z-index:20005; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.95); flex-direction:column;">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; background:#1a1a1a; border-bottom:1px solid #333;">
        <h3 style="margin:0; font-size:18px; color:#fff; display:flex; align-items:center; gap:8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="6" r="3"></circle>
            <circle cx="18" cy="6" r="3"></circle>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="12" cy="12" r="3"></circle>
            <line x1="6" y1="6" x2="12" y2="12"></line>
            <line x1="18" y1="6" x2="12" y2="12"></line>
            <line x1="6" y1="18" x2="12" y2="12"></line>
            <line x1="18" y1="18" x2="12" y2="12"></line>
          </svg>
          View Graph
        </h3>
        <div style="display:flex; gap:10px; align-items:center;">
          <button id="toggleGraphPanelLogBtn" style="background:#007bff; color:white; border:none; border-radius:6px; padding:8px 12px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px;" title="Ẩn/Hiện Panel Log">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>Panel Log</span>
          </button>
          <button id="graphFitToScreenBtn" style="background:#007bff; color:white; border:none; border-radius:6px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600;">🔍 Fit to Screen</button>
          <button id="graphRaiseBugBtn" style="background:#dc3545; color:white; border:none; border-radius:6px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;"><ellipse cx="32" cy="36" rx="14" ry="18"/><circle cx="32" cy="20" r="8"/><line x1="28" y1="12" x2="22" y2="4"/><line x1="36" y1="12" x2="42" y2="4"/><line x1="18" y1="42" x2="8" y2="48"/><line x1="18" y1="36" x2="8" y2="36"/><line x1="18" y1="30" x2="8" y2="24"/><line x1="46" y1="42" x2="56" y2="48"/><line x1="46" y1="36" x2="56" y2="36"/><line x1="46" y1="30" x2="56" y2="24"/></svg> RaiseBug</button>
          <button id="closeGraphViewBtn" style="background:none; border:none; font-size:28px; cursor:pointer; color:#fff; padding:0; width:30px; height:30px; line-height:1;">&times;</button>
        </div>
      </div>
      <div style="flex:1; display:flex; overflow:hidden; position:relative;">
        <div id="graphPanelLogTreeContainer" style="width:320px; min-width:200px; max-width:40vw; background:#2a2a2a; border-right:1px solid #333; overflow:hidden; display:flex; flex-direction:column; position:relative;">
          <div id="graphPanelLogTreeResizer" style="position:absolute; right:-6px; top:0; width:12px; height:100%; cursor:col-resize; background:transparent; z-index:1000; user-select:none; touch-action:none;"></div>
          <div style="padding:15px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; flex-shrink:0; position:relative; z-index:1001;">
            <h4 style="margin:0; font-size:16px; color:#fff;">Panel Log</h4>
            <div style="display:flex; align-items:center; gap:8px;">
              <label id="graph-panel-log-my-assignment-wrapper" style="display:none; align-items:center; gap:3px; cursor:pointer; font-size:11px; font-weight:500; margin:0; color:#fff; padding:2px 6px; background:rgba(255,255,255,0.1); border-radius:4px;">
                <input type="checkbox" id="graph-panel-log-my-assignment-cb" style="cursor:pointer; width:14px; height:14px;" />
                <span style="white-space:nowrap;">My Assignment</span>
              </label>
              <button id="graph-panel-log-show-mode-btn" class="panel-log-mode-btn" title="Switch to Tree Mode">
                <img src="https://cdn.jsdelivr.net/npm/remixicon/icons/Editor/node-tree.svg" alt="Tree Mode" style="width: 20px; height: 20px; filter: brightness(0) saturate(100%) invert(100%);" />
              </button>
            </div>
          </div>
          <div id="graphPanelLogTree" style="flex:1; overflow-y:auto; padding:10px 0;">
          </div>
        </div>
        <div id="graphContainer" style="flex:1; position:relative; background:#1a1a1a;"></div>
        <div id="graphInfoPanel" style="min-width:400px; max-width:90vw; background:#2a2a2a; border-left:1px solid #333; overflow:hidden; display:none; flex-direction:column; position:relative;">
          <div id="graphInfoResizer" style="position:absolute; left:-6px; top:0; width:12px; height:100%; cursor:col-resize; background:transparent; z-index:1000; user-select:none; touch-action:none;"></div>
          <div style="padding:15px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
            <h4 style="margin:0; font-size:16px; color:#fff;">Info</h4>
            <button id="closeGraphInfoBtn" style="background:none; border:none; font-size:20px; cursor:pointer; color:#fff; padding:0; width:24px; height:24px; line-height:1;">&times;</button>
          </div>
          <div id="graphInfoContent" style="flex:1; overflow:auto; padding:15px; color:#fff;">
          </div>
        </div>
      </div>
    </div>

    <div id="videoValidationModal" style="display:none; position:fixed; z-index:20006; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.95); flex-direction:column;">
      <div style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; background:#1a1a1a; border-bottom:1px solid #333;">
        <h3 style="margin:0; font-size:18px; color:#fff; display:flex; align-items:center; gap:8px;">
          Verify Steps with Video
        </h3>
        <div style="display:flex; gap:10px; align-items:center;">
          <button id="videoValidationPlayPauseBtn" style="background:#28a745; color:white; border:none; border-radius:6px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600;">⏯ Play</button>
          <label style="color:#fff; font-size:13px; display:flex; align-items:center; gap:6px;">
            <span>Speed:</span>
            <select id="videoValidationPlaybackSpeed" style="background:#2a2a2a; color:#fff; border:1px solid #555; border-radius:4px; padding:6px 10px; cursor:pointer; font-size:13px;">
              <option value="1">Normal (1x)</option>
              <option value="0.5" selected>Slow (0.5x)</option>
              <option value="0.33">Very Slow (0.33x)</option>
            </select>
          </label>
          <button id="videoValidationSubtitleToggleBtn" style="background:#17a2b8; color:white; border:none; border-radius:6px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600;">📝 Subtitle ON</button>
          <button id="videoValidationRaiseBugBtn" style="background:#dc3545; color:white; border:none; border-radius:6px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;"><ellipse cx="32" cy="36" rx="14" ry="18"/><circle cx="32" cy="20" r="8"/><line x1="28" y1="12" x2="22" y2="4"/><line x1="36" y1="12" x2="42" y2="4"/><line x1="18" y1="42" x2="8" y2="48"/><line x1="18" y1="36" x2="8" y2="36"/><line x1="18" y1="30" x2="8" y2="24"/><line x1="46" y1="42" x2="56" y2="48"/><line x1="46" y1="36" x2="56" y2="36"/><line x1="46" y1="30" x2="56" y2="24"/></svg> RaiseBug</button>
          <button id="closeVideoValidationBtn" style="background:none; border:none; font-size:28px; cursor:pointer; color:#fff; padding:0; width:30px; height:30px; line-height:1;">&times;</button>
        </div>
      </div>
      <div style="flex:1; display:flex; overflow:hidden; position:relative;">
        <div id="videoValidationPanelLogContainer" style="width:320px; min-width:200px; max-width:40vw; background:#2a2a2a; border-right:1px solid #333; overflow:hidden; display:flex; flex-direction:column;">
          <div style="padding:15px; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; flex-shrink:0;">
            <h4 style="margin:0; font-size:16px; color:#fff;">Panel Log</h4>
            <div style="display:flex; align-items:center; gap:8px;">
              <label id="video-validation-panel-log-my-assignment-wrapper" style="display:none; align-items:center; gap:3px; cursor:pointer; font-size:11px; font-weight:500; margin:0; color:#fff; padding:2px 6px; background:rgba(255,255,255,0.1); border-radius:4px;">
                <input type="checkbox" id="video-validation-panel-log-my-assignment-cb" style="cursor:pointer; width:14px; height:14px;" />
                <span style="white-space:nowrap;">My Assignment</span>
              </label>
              <button id="video-validation-panel-log-show-mode-btn" class="panel-log-mode-btn" title="Switch to Tree Mode">
                <img src="https://cdn.jsdelivr.net/npm/remixicon/icons/Editor/node-tree.svg" alt="Tree Mode" style="width: 20px; height: 20px; filter: brightness(0) saturate(100%) invert(100%);" />
              </button>
            </div>
          </div>
          <div id="videoValidationPanelLogTree" style="flex:1; overflow-y:auto; padding:10px 0;">
          </div>
        </div>
        <div style="flex:1; display:flex; background:#1a1a1a; overflow:hidden;">
          <div style="flex:1; display:flex; flex-direction:column; padding:20px; border-right:1px solid #333;">
            <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
              <label style="color:#fff; font-size:14px; font-weight:600;">A - Tracking Video</label>
              <div style="display:flex; align-items:center; gap:12px;">
                <label style="color:#fff; font-size:12px; display:flex; align-items:center; gap:8px; cursor:pointer;">
                  <input type="checkbox" id="videoValidationRawVideoToggle" style="cursor:pointer;">
                  <span>View RawVideo</span>
                </label>
                <button id="videoValidationRecreateTrackingBtn" style="background:#4a9eff; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:12px; cursor:pointer;">Recreate Tracking Video</button>
              </div>
            </div>
            <div style="flex:1; position:relative; background:#000; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
              <video id="videoValidationTrackingVideo" controls style="width:100%; height:100%; max-height:100%; object-fit:contain;">
                Your browser does not support the video tag.
              </video>
              <div id="videoValidationTrackingSubtitle" style="position:absolute; bottom:30px; left:120px; right:100px; background:rgba(0,0,0,0.5); color:#fff; padding:8px 16px; border-radius:4px; font-size:14px; text-align:center; display:none; pointer-events:none; white-space:pre-line;">
              </div>
            </div>
          </div>
          <div style="flex:1; display:flex; flex-direction:column; padding:20px;">
            <div style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
              <label style="color:#fff; font-size:14px; font-weight:600;">B - Step Video</label>
              <button id="videoValidationRecreateStepBtn" style="background:#4a9eff; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:12px; cursor:pointer;">Recreate Step Video</button>
            </div>
            <div style="flex:1; position:relative; background:#000; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
              <video id="videoValidationStepVideo" controls style="width:100%; height:100%; max-height:100%; object-fit:contain;">
                Your browser does not support the video tag.
              </video>
              <div id="videoValidationStepSubtitle" style="position:absolute; bottom:30px; left:120px; right:100px; background:rgba(0,0,0,0.5); color:#fff; padding:8px 16px; border-radius:4px; font-size:14px; text-align:center; display:none; pointer-events:none; white-space:pre-line;">
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- RaiseBug Modal -->
    <div id="raiseBugModal" style="display:none; position:fixed; z-index:20007; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.5); align-items:center; justify-content:center;">
        <div id="raiseBugDialog" style="background:white; width:1400px; max-width:95%; max-height:90vh; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.2); display:flex; flex-direction:column; overflow:hidden; position:relative; resize:both; min-width:800px; min-height:500px;">
            <div id="raiseBugHeader" style="padding:15px 20px; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center; background:#f5f5f5; cursor:move;">
                <h3 style="margin:0; font-size:18px; color:#333;">Raise Bug</h3>
                <button id="closeRaiseBugModalBtn" style="background:none; border:none; font-size:24px; cursor:pointer; color:#666;">&times;</button>
            </div>
            <div id="raiseBugContent" style="padding:20px; overflow-y:auto; overflow-x:hidden; flex:1; min-height:0;">
                <!-- Content generated dynamically -->
            </div>
            <div style="padding:15px 20px; border-top:1px solid #ddd; display:flex; justify-content:flex-end; gap:10px; background:#f5f5f5;">
                <button id="cancelRaiseBugBtn" style="padding:8px 16px; border:1px solid #ccc; background:white; border-radius:4px; cursor:pointer;">Cancel</button>
                <button id="confirmRaiseBugBtn" style="padding:8px 16px; border:none; background:#dc3545; color:white; border-radius:4px; cursor:pointer; font-weight:600;">Save</button>
            </div>
        </div>
    </div>

    <!-- Resolved Bug Modal (ADMIN/VALIDATE) - same layout as Raise Bug -->
    <div id="resolvedBugModal" style="display:none; position:fixed; z-index:20008; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.5); align-items:center; justify-content:center;">
        <div id="resolvedBugDialog" style="background:white; width:800px; max-width:95%; max-height:90vh; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.2); display:flex; flex-direction:column; overflow:hidden; position:relative; resize:both; min-width:400px; min-height:300px;">
            <div style="padding:15px 20px; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center; background:#f5f5f5;">
                <h3 style="margin:0; font-size:18px; color:#333;">Resolved Bug</h3>
                <button id="closeResolvedBugModalBtn" style="background:none; border:none; font-size:24px; cursor:pointer; color:#666;">&times;</button>
            </div>
            <div id="resolvedBugContent" style="padding:20px; overflow-y:auto; flex:1;">
                <!-- Content generated dynamically -->
            </div>
            <div style="padding:15px 20px; border-top:1px solid #ddd; display:flex; justify-content:flex-end; gap:10px; background:#f5f5f5;">
                <button id="cancelResolvedBugBtn" style="padding:8px 16px; border:1px solid #ccc; background:white; border-radius:4px; cursor:pointer;">Cancel</button>
                <button id="confirmResolvedBugBtn" style="padding:8px 16px; border:none; background:#28a745; color:white; border-radius:4px; cursor:pointer; font-weight:600;">OK</button>
            </div>
        </div>
    </div>

    <script>
    // Raise Bug Dialog Drag & Resize
    (function initRaiseBugDialogFeatures() {
      function setupDraggable() {
        const dialog = document.getElementById('raiseBugDialog');
        const header = document.getElementById('raiseBugHeader');
        
        if (!dialog || !header) {
          setTimeout(setupDraggable, 500);
          return;
        }

        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('mousemove', drag);

        function dragStart(e) {
          if (e.target === header || header.contains(e.target)) {
            if (e.target.tagName === 'BUTTON') return;
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
          }
        }

        function dragEnd(e) {
          initialX = currentX;
          initialY = currentY;
          isDragging = false;
        }

        function drag(e) {
          if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            dialog.style.transform = "translate3d(" + currentX + "px, " + currentY + "px, 0)";
          }
        }
        console.log('✅ RaiseBugDialog drag initialized');
      }
      setupDraggable();
    })();

    // Session Details Dialog - Drag & Resize
    (function initSessionDetailsDialogFeatures() {
      function setupDraggable() {
        const dialog = document.getElementById('sessionDetailsDialogInner');
        const header = document.getElementById('sessionDetailsDialogHeader');
        if (!dialog || !header) {
          setTimeout(setupDraggable, 500);
          return;
        }
        let isDragging = false;
        let currentX, currentY, initialX, initialY;
        let xOffset = 0, yOffset = 0;
        header.addEventListener('mousedown', dragStart);
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('mousemove', drag);
        function dragStart(e) {
          if (e.target === header || header.contains(e.target)) {
            if (e.target.tagName === 'BUTTON') return;
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
          }
        }
        function dragEnd() {
          initialX = currentX;
          initialY = currentY;
          isDragging = false;
        }
        function drag(e) {
          if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            dialog.style.transform = 'translate3d(' + currentX + 'px, ' + currentY + 'px, 0)';
          }
        }
        console.log('✅ SessionDetailsDialog drag initialized');
      }
      setupDraggable();
    })();

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
            // No saved width, use default 350px (match panel log width)
            const preferredWidth = 350;
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.6;
            const initialWidth = Math.min(maxWidth, Math.max(minWidth, preferredWidth));
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
      console.log('🚀 [DEBUG] Main script starting...');
      const ws = new WebSocket('ws://localhost:8081');
      const container = document.getElementById('events');
      let panelTreeData = [];
      let selectedPanelId = null;
      let expandedPanels = new Set();
      
      // Helper functions for localStorage
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
      
      // Panel log display mode: 'log', 'tree', or 'validation'
      // Default set by role when known: DRAW=log, other=validation (see showRoleSelectionDialog / validateAndSaveRole)
      let panelLogDisplayMode = getLocalStorage('panel-log-display-mode') || 'log';
      window.panelLogDisplayMode = panelLogDisplayMode;
      // My Assignment filter: only sessions assigned to current VALIDATE user (showMode=validation + role=VALIDATE)
      let myAssignmentFilterEnabled = getLocalStorage('panel-log-my-assignment') === 'true';
      let isDrawingPanel = false;
      let isGeminiDetecting = false;
      let isDetectingImportantActions = false;
      window.isDetectingImportantActions = false; // For isAnyOperationRunning check

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('⚠️ WebSocket closed');
      };

      // Filter validation tree to only sessions assigned to collaboratorCode (My Assignment)
      function filterValidationTreeByMyAssignment(treeData, collaboratorCode) {
        if (!treeData || !Array.isArray(treeData) || !collaboratorCode) return treeData || [];
        return treeData.map(dayNode => {
          if (dayNode.type !== 'day' || !dayNode.children) return dayNode;
          const filteredSessions = dayNode.children.filter(s => s.type === 'session' && s.assignee === collaboratorCode);
          if (filteredSessions.length === 0) return null;
          return { ...dayNode, children: filteredSessions };
        }).filter(Boolean);
      }
      
      async function getFilteredPanelTree(mode) {
        if (!window.getPanelTree) return [];
        const data = await window.getPanelTree(mode);
        try {
          const role = currentRole || 'DRAW';
          const accountInfo = currentAccountInfo || null;
          if (mode !== 'validation' || !myAssignmentFilterEnabled || role !== 'VALIDATE' || !accountInfo?.collaborator_code) {
            return data || [];
          }
          return filterValidationTreeByMyAssignment(data, accountInfo.collaborator_code);
        } catch (e) {
          // currentRole/currentAccountInfo not yet defined, return unfiltered data
          return data || [];
        }
      }
      
      function updateMyAssignmentCheckboxVisibility() {
        try {
          const role = currentRole || 'DRAW';
          const mainShow = (panelLogDisplayMode === 'validation' && role === 'VALIDATE');
          const graphShow = (typeof graphPanelLogDisplayMode !== 'undefined' && graphPanelLogDisplayMode === 'validation' && role === 'VALIDATE');
          const videoShow = (typeof videoValidationPanelLogDisplayMode !== 'undefined' && videoValidationPanelLogDisplayMode === 'validation' && role === 'VALIDATE');
          const mainWrap = document.getElementById('panel-log-my-assignment-wrapper');
          const graphWrap = document.getElementById('graph-panel-log-my-assignment-wrapper');
          const videoWrap = document.getElementById('video-validation-panel-log-my-assignment-wrapper');
          if (mainWrap) mainWrap.style.display = mainShow ? 'flex' : 'none';
          if (graphWrap) graphWrap.style.display = graphShow ? 'flex' : 'none';
          if (videoWrap) videoWrap.style.display = videoShow ? 'flex' : 'none';
        } catch (e) {
          // currentRole not yet defined during initialization, ignore
        }
      }
      
      ws.onmessage = async (msg) => {
        const evt = JSON.parse(msg.data);
        console.log('📨 [WS] Message received:', evt.type);
        
        if (evt.type === 'tree_update') {
          // Reload panel log with current showMode so we don't switch mode when user clicks an action.
          // (tree_update from server sends validation structure; we must keep log/tree/validation mode unchanged.)
          const fallbackData = evt.data || [];
          if (window.getPanelTree) {
            getFilteredPanelTree(panelLogDisplayMode).then(data => {
              panelTreeData = data || [];
              renderPanelTree();
              updateGraphPanelLogTreeIfOpen(fallbackData);
              updateVideoValidationPanelLogTreeIfOpen(fallbackData);
            }).catch(err => {
              console.error('Failed to reload tree with current mode:', err);
              panelTreeData = fallbackData;
              renderPanelTree();
              updateGraphPanelLogTreeIfOpen(fallbackData);
              updateVideoValidationPanelLogTreeIfOpen(fallbackData);
            });
          } else {
            panelTreeData = fallbackData;
            renderPanelTree();
            updateGraphPanelLogTreeIfOpen(fallbackData);
            updateVideoValidationPanelLogTreeIfOpen(fallbackData);
          }
          
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
          // Branch based on role: VALIDATE and ADMIN
          if (currentRole === 'VALIDATE' || currentRole === 'ADMIN') {
            if (evt.item_category === 'ACTION') {
              handlePanelSelectedForValidate(evt);
              return;
            }
            if (evt.item_category === 'PANEL') {
              handlePanelSelectedForValidatePanel(evt);
              return;
            }
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
          // Get current draw_flow_state from selected panel if available
          const selectedNode = panelTreeData.find(n => n.panel_id === selectedPanelId) || 
            panelTreeData.find(n => n.children?.some(c => c.panel_id === selectedPanelId));
          const drawFlowState = selectedNode?.draw_flow_state || null;
          updateSaveBtnState(evt.hasChanges, drawFlowState);
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

        if (evt.type === 'show_session_conflict') {
          console.log('⚠️ [Session Conflict - Browser] Received show_session_conflict event');
          if (window.showSessionConflictDialog && evt.sessionInfo) {
            window.showSessionConflictDialog(evt.sessionInfo);
          }
          return;
        }
        
        if (evt.type === 'panel_type_confirmation') {
          showPanelTypeConfirmationDialog(evt.detectedPanelType, evt.fullScreenshot, evt.imageWidth, evt.imageHeight);
          return;
        }
        
        if (evt.type === 'show_panel_completion_dialog') {
          showPanelCompletionDialog(evt.panelId);
          return;
        }

        if (evt.type === 'hide_panel_completion_dialog') {
          hidePanelCompletionDialog();
          return;
        }

        if (evt.type === 'show_reset_blocked_dialog') {
          if (typeof showResetBlockedDialog === 'function') {
            showResetBlockedDialog(evt.panelName || '', evt.stepLines || []);
          }
          return;
        }

        if (evt.type === 'show_role_selection') {
          console.log('📋 [DEBUG] Received show_role_selection message:', evt);
          try {
            showRoleSelectionDialog(evt.accountInfo || null);
          } catch (err) {
            console.error('❌ [DEBUG] Error in showRoleSelectionDialog:', err);
          }
          return;
        }

        if (evt.type === 'hide_role_selection') {
          hideRoleSelectionDialog();
          hideAdminAiToolsList();
          return;
        }

        if (evt.type === 'show_admin_ai_tools') {
          const tools = evt.tools || [];
          showAdminAiToolsList(tools);
          return;
        }

        if (evt.type === 'current_tool') {
          currentToolInfo = evt.toolCode
            ? { toolCode: evt.toolCode, toolName: evt.toolName || evt.toolCode, website: evt.website || '' }
            : null;
          selectedPanelId = null;
          const eventsContainer = document.getElementById('events');
          if (eventsContainer) {
            eventsContainer.querySelectorAll('.event[data-event-type="validate_panel_info"], .event[data-event-type="validate_action"], .event[data-event-type="action_details"], .event[data-event-type="capture"], .event[data-event-type="step"], .event[data-event-type="purpose"], .event[data-event-type="click"]').forEach(el => el.remove());
          }
          renderPanelTree();
          if (typeof updateControlsCurrentToolDisplay === 'function') updateControlsCurrentToolDisplay();
          if (adminAiToolsListEl && adminAiToolsFullList.length) {
            renderAdminAiToolsFiltered(adminAiToolsFilterInput ? adminAiToolsFilterInput.value : '');
          }
          return;
        }

        if (evt.type === 'show_gemini_billing_error') {
          console.log('⚠️ [Gemini Billing Error - Browser] Received show_gemini_billing_error event');
          if (window.showGeminiBillingErrorDialog) {
            window.showGeminiBillingErrorDialog();
          }
          return;
        }

        if (evt.type === 'show_loading') {
          const message = evt.message || 'Đang xử lý, vui lòng chờ giây lát!';
          showLoadingModal(message);
          // If it's for detecting important actions, set the flag
          if (evt.isDetectingImportantActions === true || (evt.message && (evt.message.includes('detect important actions') || evt.message.includes('Đang xử lý')))) {
            isDetectingImportantActions = true;
            window.isDetectingImportantActions = true;
          }
          return;
        }

        if (evt.type === 'hide_loading') {
          hideLoadingModal();
          // If it was for detecting important actions, clear the flag
          if (isDetectingImportantActions) {
            isDetectingImportantActions = false;
            window.isDetectingImportantActions = false;
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
      window.isSaving = false; // For isAnyOperationRunning check
      const saveBtn = document.getElementById("saveBtn");
      
      const updateSaveBtnState = (hasChanges, drawFlowState = null) => {
        if (!saveBtn) {
          console.warn('saveBtn not found');
          return;
        }
        
        console.log('updateSaveBtnState:', hasChanges, 'drawFlowState:', drawFlowState);
        
        // Check if panel is incomplete (draw_flow_state is 'edit_actions' or null/undefined for panels that started flow)
        const isIncomplete = drawFlowState === 'edit_actions' || (drawFlowState === null && selectedPanelId);
        
        if (isIncomplete) {
          // Show "Save" for incomplete panels
          saveBtn.textContent = '💾 Save';
        } else {
          // Show normal "Save" for completed or no flow state
          saveBtn.textContent = '💾 Save';
        }
        
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
            window.isSaving = true; // For isAnyOperationRunning check
            saveBtn.disabled = true;
            saveBtn.style.opacity = '0.6';
            saveBtn.style.cursor = 'not-allowed';
            saveBtn.style.pointerEvents = 'none';
            saveBtn.textContent = '⏳ Saving...';
            
            await window.saveEvents();
            
            // Reset button để có thể save lại
            isSaving = false;
            window.isSaving = false; // For isAnyOperationRunning check
            saveBtn.disabled = false;
            saveBtn.style.opacity = '';
            saveBtn.style.cursor = '';
            saveBtn.style.pointerEvents = '';
            
            // Update button text based on current flow state
            const selectedNode = panelTreeData.find(n => n.panel_id === selectedPanelId) || 
              panelTreeData.find(n => n.children?.some(c => c.panel_id === selectedPanelId));
            const drawFlowState = selectedNode?.draw_flow_state || null;
            const isIncomplete = drawFlowState === 'edit_actions' || (drawFlowState === null && selectedPanelId);
            saveBtn.textContent = isIncomplete ? '💾 Save' : '💾 Save';
            
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
            window.isSaving = false; // For isAnyOperationRunning check
            saveBtn.disabled = false;
            saveBtn.style.opacity = '';
            saveBtn.style.cursor = '';
            saveBtn.style.pointerEvents = '';
            
            // Update button text based on current flow state
            const selectedNode = panelTreeData.find(n => n.panel_id === selectedPanelId) || 
              panelTreeData.find(n => n.children?.some(c => c.panel_id === selectedPanelId));
            const drawFlowState = selectedNode?.draw_flow_state || null;
            const isIncomplete = drawFlowState === 'edit_actions' || (drawFlowState === null && selectedPanelId);
            saveBtn.textContent = isIncomplete ? '💾 Save' : '💾 Save';
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

      // Graph View Modal handlers
      const graphViewModal = document.getElementById('graphViewModal');
      const viewGraphBtn = document.getElementById('viewGraphBtn');
      const closeGraphViewBtn = document.getElementById('closeGraphViewBtn');
      const graphFitToScreenBtn = document.getElementById('graphFitToScreenBtn');
      const graphInfoPanel = document.getElementById('graphInfoPanel');
      const closeGraphInfoBtn = document.getElementById('closeGraphInfoBtn');
      let graphNetwork = null;
      let graphPanelTreeData = [];
      let graphExpandedPanels = new Set();

      const openGraphView = async (actionIdToOpen = null) => {
        if (!graphViewModal) {
          console.error('graphViewModal not found');
          return;
        }
        graphViewModal.style.display = 'flex';
        
        // Ensure RaiseBug button is visible if allowed
        if (typeof updateButtonsVisibility === 'function') {
            updateButtonsVisibility(currentRole);
        }
        
        // Restore panel log visibility state
        const graphPanelLogTreeContainer = document.getElementById('graphPanelLogTreeContainer');
        const toggleGraphPanelLogBtn = document.getElementById('toggleGraphPanelLogBtn');
        if (graphPanelLogTreeContainer && toggleGraphPanelLogBtn) {
          const savedState = getLocalStorage('graph-panel-log-visible');
          const isVisible = savedState === null ? true : savedState === 'true';
          
          if (!isVisible) {
            graphPanelLogTreeContainer.style.display = 'none';
            // Update button icon to chevron-right (show)
            const svg = toggleGraphPanelLogBtn.querySelector('svg');
            if (svg) {
              svg.innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
            }
          } else {
            graphPanelLogTreeContainer.style.display = 'flex';
            // Update button icon to chevron-left (hide)
            const svg = toggleGraphPanelLogBtn.querySelector('svg');
            if (svg) {
              svg.innerHTML = '<polyline points="15 18 9 12 15 6"></polyline>';
            }
          }
        }
        
        if (window.viewGraph) {
          await window.viewGraph();
        }
        
        // Auto-select the specified action after graph loads
        if (actionIdToOpen) {
          // Use polling to wait for tree to be rendered
          const trySelectAction = async (maxAttempts = 20, attempt = 0) => {
            const treeContainer = document.getElementById('graphPanelLogTree');
            if (!treeContainer) {
              if (attempt < maxAttempts) {
                setTimeout(() => trySelectAction(maxAttempts, attempt + 1), 200);
              } else {
                console.warn('Graph panel log tree container not found after', maxAttempts, 'attempts');
              }
              return;
            }
            
            // Check if tree has nodes
            const hasNodes = treeContainer.querySelectorAll('.graph-tree-node').length > 0;
            if (!hasNodes && attempt < maxAttempts) {
              setTimeout(() => trySelectAction(maxAttempts, attempt + 1), 200);
              return;
            }
            
            // Find the node with matching panel_id using data-panel-id attribute
            const targetNode = treeContainer.querySelector(\`[data-panel-id="\${actionIdToOpen}"]\`);
            if (!targetNode) {
              if (attempt < maxAttempts) {
                setTimeout(() => trySelectAction(maxAttempts, attempt + 1), 200);
              } else {
                console.warn('Panel/Action node not found in graph tree after', maxAttempts, 'attempts:', actionIdToOpen);
              }
              return;
            }
            
            // Found the node, now expand parents and select
            // Expand all parent panels first to make sure the panel/action is visible
            const expandParentPanels = async (node) => {
              // Find all parent nodeDivs that contain this node
              const parentNodeDivs = [];
              let current = node;
              
              // Traverse up to find all parent nodeDivs
              while (current && current !== treeContainer) {
                // Check if current is a nodeDiv (graph-tree-node)
                if (current.classList && current.classList.contains('graph-tree-node')) {
                  parentNodeDivs.push(current);
                }
                current = current.parentElement;
              }
              
              // Expand from top to bottom (reverse order - expand root first, then children)
              // Skip the target node itself, only expand its parents
              for (let i = parentNodeDivs.length - 1; i >= 0; i--) {
                const nodeDiv = parentNodeDivs[i];
                // Skip if this is the target node itself (only expand parents, not the target)
                if (nodeDiv === targetNode) {
                  continue;
                }
                // Find the childrenDiv for this node
                const childrenDiv = nodeDiv.querySelector('.graph-tree-children');
                if (childrenDiv && !childrenDiv.classList.contains('expanded')) {
                  // Find the contentDiv which contains the expand icon
                  const contentDiv = nodeDiv.querySelector('.graph-tree-node-content');
                  if (contentDiv) {
                    // Find the expand icon
                    const expandIcon = contentDiv.querySelector('.graph-tree-expand');
                    if (expandIcon && expandIcon.style.visibility !== 'hidden' && expandIcon.textContent.trim() !== '') {
                      // Click the expand icon
                      expandIcon.click();
                      // Wait for expansion animation
                      await new Promise(resolve => setTimeout(resolve, 300));
                    }
                  }
                }
              }
            };
            
            // Expand all parent panels (this will work for both panels and actions)
            await expandParentPanels(targetNode);
            
            // Find the contentDiv for selection
            const contentDiv = targetNode.querySelector('.graph-tree-node-content') || targetNode;
            if (contentDiv) {
              // Remove selected class from all nodes first
              treeContainer.querySelectorAll('.graph-tree-node-content').forEach(el => {
                el.classList.remove('selected');
              });
              
              // Add selected class to target node
              contentDiv.classList.add('selected');
              
              // Scroll into view
              contentDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              // Click the node to trigger graph selection (works for both panel and action)
              setTimeout(() => {
                contentDiv.click();
              }, 300);
            } else {
              console.warn('ContentDiv not found for target node:', actionIdToOpen);
            }
          };
          
          // Start trying to select after a short delay
          setTimeout(() => {
            trySelectAction();
          }, 500);
        }
      };

      const closeGraphView = () => {
        if (graphViewModal) {
          graphViewModal.style.display = 'none';
          if (graphInfoPanel) {
            graphInfoPanel.style.display = 'none';
          }
        }
      };

      if (viewGraphBtn) {
        viewGraphBtn.addEventListener('click', () => {
          // Try to get selected panel/action from main panel log tree
          let selectedItemId = null;
          
          // First, try to get from selectedPanelId variable
          if (selectedPanelId) {
            selectedItemId = selectedPanelId;
          } else {
            // Try to find selected node in any panel log tree (main panel log)
            // Look for any node with class 'selected' that has data-panel-id
            const selectedNode = document.querySelector('.graph-tree-node-content.selected');
            if (selectedNode) {
              selectedItemId = selectedNode.getAttribute('data-panel-id');
            }
          }
          
          // Fallback to currentValidateActionId if available
          if (!selectedItemId && currentValidateActionId) {
            selectedItemId = currentValidateActionId;
          }
          
          openGraphView(selectedItemId);
        });
      }

      // Validate Step handler
      const validateBtn = document.getElementById('validateBtn');
      const openValidateView = async (actionIdToOpen = null) => {
        // Ensure RaiseBug button is visible if allowed
        if (typeof updateButtonsVisibility === 'function') {
            updateButtonsVisibility(currentRole);
        }
        
        if (window.validateStep) {
          await window.validateStep();
          
          // Auto-open the specified action after modal opens
          if (actionIdToOpen) {
            // Use polling to wait for tree to be rendered
            const trySelectAction = async (maxAttempts = 20, attempt = 0) => {
              const treeContainer = document.getElementById('videoValidationPanelLogTree');
              if (!treeContainer) {
                if (attempt < maxAttempts) {
                  setTimeout(() => trySelectAction(maxAttempts, attempt + 1), 200);
                } else {
                  console.warn('Video validation tree container not found after', maxAttempts, 'attempts');
                }
                return;
              }
              
              // Check if tree has nodes
              const hasNodes = treeContainer.querySelectorAll('.graph-tree-node').length > 0;
              if (!hasNodes && attempt < maxAttempts) {
                setTimeout(() => trySelectAction(maxAttempts, attempt + 1), 200);
                return;
              }
              
              // Find the node with matching panel_id using data-panel-id attribute
              const targetNode = treeContainer.querySelector(\`[data-panel-id="\${actionIdToOpen}"]\`);
              if (!targetNode) {
                if (attempt < maxAttempts) {
                  setTimeout(() => trySelectAction(maxAttempts, attempt + 1), 200);
                } else {
                  console.warn('Action node not found in tree after', maxAttempts, 'attempts:', actionIdToOpen);
                }
                return;
              }
              
              // Found the node, now expand parents and select
              // Expand all parent panels first to make sure the action is visible
              const expandParentPanels = async (node) => {
                // Find all parent nodeDivs that contain this node
                const parentNodeDivs = [];
                let current = node;
                
                // Traverse up to find all parent nodeDivs
                while (current && current !== treeContainer) {
                  // Check if current is a nodeDiv (graph-tree-node)
                  if (current.classList && current.classList.contains('graph-tree-node')) {
                    parentNodeDivs.push(current);
                  }
                  current = current.parentElement;
                }
                
                // Expand from top to bottom (reverse order - expand root first, then children)
                for (let i = parentNodeDivs.length - 1; i >= 0; i--) {
                  const nodeDiv = parentNodeDivs[i];
                  // Find the childrenDiv for this node
                  const childrenDiv = nodeDiv.querySelector('.graph-tree-children');
                  if (childrenDiv && !childrenDiv.classList.contains('expanded')) {
                    // Find the contentDiv which contains the expand icon
                    const contentDiv = nodeDiv.querySelector('.graph-tree-node-content');
                    if (contentDiv) {
                      // Find the expand icon
                      const expandIcon = contentDiv.querySelector('.graph-tree-expand');
                      if (expandIcon && expandIcon.style.visibility !== 'hidden' && expandIcon.textContent.trim() !== '') {
                        // Click the expand icon
                        expandIcon.click();
                        // Wait for expansion animation
                        await new Promise(resolve => setTimeout(resolve, 300));
                      }
                    }
                  }
                }
              };
              
              // Expand all parent panels
              await expandParentPanels(targetNode);
              
              // Find the contentDiv for selection
              const contentDiv = targetNode.querySelector('.graph-tree-node-content') || targetNode;
              if (contentDiv) {
                // Remove selected class from all nodes first
                treeContainer.querySelectorAll('.graph-tree-node-content').forEach(el => {
                  el.classList.remove('selected');
                });
                
                // Add selected class to target node
                contentDiv.classList.add('selected');
                
                // Scroll into view
                contentDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Click the node to trigger video loading
                setTimeout(() => {
                  contentDiv.click();
                }, 300);
              }
            };
            
            // Start trying to select after a short delay
            setTimeout(() => {
              trySelectAction();
            }, 300);
          }
        }
      };

      if (validateBtn) {
        validateBtn.addEventListener('click', () => {
          // Try to get selected panel/action from main panel log tree
          let selectedItemId = null;
          
          // First, try to get from selectedPanelId variable
          if (selectedPanelId) {
            selectedItemId = selectedPanelId;
          } else {
            // Try to find selected node in any panel log tree (main panel log)
            // Look for any node with class 'selected' that has data-panel-id
            const selectedNode = document.querySelector('.graph-tree-node-content.selected');
            if (selectedNode) {
              selectedItemId = selectedNode.getAttribute('data-panel-id');
            }
          }
          
          // Fallback to currentValidateActionId if available
          if (!selectedItemId && currentValidateActionId) {
            selectedItemId = currentValidateActionId;
          }
          
          openValidateView(selectedItemId);
        });
      }

      if (closeGraphViewBtn) {
        closeGraphViewBtn.addEventListener('click', closeGraphView);
      }

      if (closeGraphInfoBtn) {
        closeGraphInfoBtn.addEventListener('click', () => {
          if (graphInfoPanel) {
            graphInfoPanel.style.display = 'none';
          }
        });
      }

      // Toggle Panel Log visibility
      const toggleGraphPanelLogBtn = document.getElementById('toggleGraphPanelLogBtn');
      const graphPanelLogTreeContainer = document.getElementById('graphPanelLogTreeContainer');
      if (toggleGraphPanelLogBtn && graphPanelLogTreeContainer) {
        toggleGraphPanelLogBtn.addEventListener('click', () => {
          const isCurrentlyVisible = graphPanelLogTreeContainer.style.display !== 'none';
          
          if (isCurrentlyVisible) {
            // Hide panel log
            graphPanelLogTreeContainer.style.display = 'none';
            setLocalStorage('graph-panel-log-visible', 'false');
            // Update button icon to chevron-right (to show)
            const svg = toggleGraphPanelLogBtn.querySelector('svg');
            if (svg) {
              svg.innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
            }
          } else {
            // Show panel log
            graphPanelLogTreeContainer.style.display = 'flex';
            setLocalStorage('graph-panel-log-visible', 'true');
            // Update button icon to chevron-left (to hide)
            const svg = toggleGraphPanelLogBtn.querySelector('svg');
            if (svg) {
              svg.innerHTML = '<polyline points="15 18 9 12 15 6"></polyline>';
            }
          }
        });
      }

      if (graphViewModal) {
        graphViewModal.addEventListener('click', (e) => {
          if (e.target === graphViewModal) {
            closeGraphView();
          }
        });
      }

      if (graphFitToScreenBtn) {
        graphFitToScreenBtn.addEventListener('click', () => {
          if (window.graphNetwork) {
            window.graphNetwork.fit();
          }
        });
      }

      // Graph View RaiseBug button
      const graphRaiseBugBtn = document.getElementById('graphRaiseBugBtn');
      if (graphRaiseBugBtn) {
        graphRaiseBugBtn.addEventListener('click', async () => {
          // Get selected node or edge from graph network
          let selectedId = null;
          
          if (window.graphNetwork) {
             const selectedNodes = window.graphNetwork.getSelectedNodes();
             if (selectedNodes && selectedNodes.length > 0) {
                selectedId = selectedNodes[0];
             } else {
                 const selectedEdges = window.graphNetwork.getSelectedEdges();
                 if (selectedEdges && selectedEdges.length > 0) {
                     const edgeId = selectedEdges[0];
                     // Try to get edge data to find actionId
                     if (window.graphNetwork.body && window.graphNetwork.body.data && window.graphNetwork.body.data.edges) {
                         const edge = window.graphNetwork.body.data.edges.get(edgeId);
                         if (edge && edge.data && edge.data.actionId) {
                             selectedId = edge.data.actionId;
                         } else {
                             // Fallback to edge ID if no data (might be the action ID itself)
                             selectedId = edgeId;
                         }
                     } else {
                         selectedId = edgeId;
                     }
                 }
             }
          }

          // If not selected in graph, check in panel log tree
          if (!selectedId) {
            const selectedNode = document.querySelector('#graphPanelLogTree .graph-tree-node-content.selected');
            if (selectedNode) {
              selectedId = selectedNode.getAttribute('data-panel-id');
            }
          }
          
          if (!selectedId) {
            alert('Please select a Panel/Action in the graph or the Panel Log first');
            return;
          }
          
          let currentBugInfo = null;
          let item = null;
          if (window.getActionItem) {
              item = await window.getActionItem(selectedId);
              if (item) {
                  currentBugInfo = item.bug_info || null;
              }
          }
          
          showRaiseBugDialog(selectedId, currentBugInfo, item);
        });
      }

      // Video Validation Modal handlers
      const videoValidationModal = document.getElementById('videoValidationModal');
      const closeVideoValidationBtn = document.getElementById('closeVideoValidationBtn');
      const videoValidationPlayPauseBtn = document.getElementById('videoValidationPlayPauseBtn');
      const videoValidationPlaybackSpeed = document.getElementById('videoValidationPlaybackSpeed');
      const videoValidationSubtitleToggleBtn = document.getElementById('videoValidationSubtitleToggleBtn');
      const videoValidationRaiseBugBtn = document.getElementById('videoValidationRaiseBugBtn');
      const videoValidationRawVideoToggle = document.getElementById('videoValidationRawVideoToggle');
      const videoValidationTrackingVideo = document.getElementById('videoValidationTrackingVideo');
      const videoValidationStepVideo = document.getElementById('videoValidationStepVideo');
      const videoValidationTrackingSubtitle = document.getElementById('videoValidationTrackingSubtitle');
      const videoValidationStepSubtitle = document.getElementById('videoValidationStepSubtitle');
      const videoValidationPanelLogTree = document.getElementById('videoValidationPanelLogTree');

      let videoValidationSubtitlesEnabled = true;
      let videoValidationCurrentActionId = null;
      let videoValidationStepSubtitles = [];
      let videoValidationTrackingVideoUrl = null;
      let videoValidationRawVideoUrl = null;
      let videoValidationCurrentPlaybackSpeed = 0.5;
      let currentValidateActionId = null; // Store the action ID currently being viewed in validate mode

      const closeVideoValidationView = () => {
        if (videoValidationModal) {
          videoValidationModal.style.display = 'none';
          // Pause videos
          if (videoValidationTrackingVideo) {
            videoValidationTrackingVideo.pause();
          }
          if (videoValidationStepVideo) {
            videoValidationStepVideo.pause();
          }
        }
      };

      const syncVideoPlayPause = () => {
        // Only sync when View RawVideo is NOT checked
        if (videoValidationRawVideoToggle && videoValidationRawVideoToggle.checked) {
          return; // Don't sync when raw video is selected
        }
        if (videoValidationTrackingVideo && videoValidationStepVideo) {
          if (videoValidationTrackingVideo.paused) {
            videoValidationStepVideo.pause();
          } else {
            videoValidationStepVideo.play();
          }
        }
      };

      const updateSyncedPlayButtonState = () => {
        if (videoValidationPlayPauseBtn && videoValidationRawVideoToggle) {
          const isRawVideoChecked = videoValidationRawVideoToggle.checked;
          videoValidationPlayPauseBtn.disabled = isRawVideoChecked;
          videoValidationPlayPauseBtn.style.opacity = isRawVideoChecked ? '0.5' : '1';
          videoValidationPlayPauseBtn.style.cursor = isRawVideoChecked ? 'not-allowed' : 'pointer';
        }
      };

      // Expose to window for access from evaluate context
      window.updateSyncedPlayButtonState = updateSyncedPlayButtonState;

      // Update Play button text based on video playing state
      const updatePlayButtonText = () => {
        if (videoValidationPlayPauseBtn) {
          const trackingVideo = videoValidationTrackingVideo;
          const stepVideo = videoValidationStepVideo;
          const isPlaying = (trackingVideo && !trackingVideo.paused) || (stepVideo && !stepVideo.paused);
          videoValidationPlayPauseBtn.textContent = isPlaying ? '⏯ Playing' : '⏯ Play';
        }
      };

      const updateSubtitleOverlay = (video, subtitleElement, subtitles) => {
        if (!videoValidationSubtitlesEnabled || !subtitles || subtitles.length === 0) {
          subtitleElement.style.display = 'none';
          return;
        }

        const currentTime = video.currentTime;
        const currentSubtitle = subtitles.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
        
        if (currentSubtitle) {
          subtitleElement.textContent = currentSubtitle.text;
          subtitleElement.style.display = 'block';
        } else {
          subtitleElement.style.display = 'none';
        }
      };

      // Apply playback speed to both videos
      const applyPlaybackSpeed = (speed) => {
        videoValidationCurrentPlaybackSpeed = parseFloat(speed);
        if (videoValidationTrackingVideo) {
          videoValidationTrackingVideo.playbackRate = videoValidationCurrentPlaybackSpeed;
        }
        if (videoValidationStepVideo) {
          videoValidationStepVideo.playbackRate = videoValidationCurrentPlaybackSpeed;
        }
      };

      if (closeVideoValidationBtn) {
        closeVideoValidationBtn.addEventListener('click', closeVideoValidationView);
      }

      if (videoValidationModal) {
        videoValidationModal.addEventListener('click', (e) => {
          if (e.target === videoValidationModal) {
            closeVideoValidationView();
          }
        });
      }

      if (videoValidationPlayPauseBtn) {
        videoValidationPlayPauseBtn.addEventListener('click', () => {
          if (videoValidationRawVideoToggle && videoValidationRawVideoToggle.checked) {
            return; // Disabled when raw video is checked
          }
          if (videoValidationTrackingVideo) {
            if (videoValidationTrackingVideo.paused) {
              // Reset both videos to start before playing
              if (videoValidationTrackingVideo) {
                videoValidationTrackingVideo.currentTime = 0;
              }
              if (videoValidationStepVideo) {
                videoValidationStepVideo.currentTime = 0;
              }
              // Apply current playback speed before playing
              applyPlaybackSpeed(videoValidationCurrentPlaybackSpeed);
              videoValidationTrackingVideo.play();
            } else {
              videoValidationTrackingVideo.pause();
            }
            syncVideoPlayPause();
            // Button text will be updated by play/pause event listeners
          }
        });
      }

      // Handle playback speed change
      if (videoValidationPlaybackSpeed) {
        videoValidationPlaybackSpeed.addEventListener('change', (e) => {
          const speed = parseFloat(e.target.value);
          applyPlaybackSpeed(speed);
        });
      }

      if (videoValidationSubtitleToggleBtn) {
        videoValidationSubtitleToggleBtn.addEventListener('click', () => {
          videoValidationSubtitlesEnabled = !videoValidationSubtitlesEnabled;
          videoValidationSubtitleToggleBtn.textContent = videoValidationSubtitlesEnabled ? '📝 Subtitle ON' : '📝 Subtitle OFF';
          
          // Update subtitle overlays immediately based on current video time
          if (videoValidationTrackingVideo && videoValidationTrackingSubtitle) {
            updateSubtitleOverlay(videoValidationTrackingVideo, videoValidationTrackingSubtitle, []);
          }
          if (videoValidationStepVideo && videoValidationStepSubtitle) {
            updateSubtitleOverlay(videoValidationStepVideo, videoValidationStepSubtitle, videoValidationStepSubtitles);
          }
        });
      }

      if (videoValidationRaiseBugBtn) {
        videoValidationRaiseBugBtn.addEventListener('click', async () => {
          if (!videoValidationCurrentActionId) {
            alert('Please select an action first');
            return;
          }
          
          let currentBugInfo = null;
          let item = null;
          if (window.getActionItem) {
              item = await window.getActionItem(videoValidationCurrentActionId);
              if (item) {
                  currentBugInfo = item.bug_info || null;
              }
          }
          
          showRaiseBugDialog(videoValidationCurrentActionId, currentBugInfo, item);
        });
      }

      if (videoValidationRawVideoToggle) {
        videoValidationRawVideoToggle.addEventListener('change', () => {
          if (videoValidationTrackingVideo) {
            if (videoValidationRawVideoToggle.checked && videoValidationRawVideoUrl) {
              videoValidationTrackingVideo.src = videoValidationRawVideoUrl;
            } else if (videoValidationTrackingVideoUrl) {
              videoValidationTrackingVideo.src = videoValidationTrackingVideoUrl;
            }
            // Apply current playback speed after loading new video
            videoValidationTrackingVideo.addEventListener('loadedmetadata', () => {
              videoValidationTrackingVideo.playbackRate = videoValidationCurrentPlaybackSpeed;
            }, { once: true });
          }
          updateSyncedPlayButtonState();
        });
      }

      // Recreate Tracking Video button
      const videoValidationRecreateTrackingBtn = document.getElementById('videoValidationRecreateTrackingBtn');
      if (videoValidationRecreateTrackingBtn) {
        videoValidationRecreateTrackingBtn.addEventListener('click', async () => {
          if (!videoValidationCurrentActionId) {
            alert('No action selected');
            return;
          }
          videoValidationRecreateTrackingBtn.disabled = true;
          videoValidationRecreateTrackingBtn.textContent = 'Recreating...';
          try {
            const result = await window.regenerateTrackingVideo(videoValidationCurrentActionId);
            if (result && result.tracking_video_url) {
              videoValidationTrackingVideoUrl = result.tracking_video_url;
              if (videoValidationTrackingVideo && (!videoValidationRawVideoToggle || !videoValidationRawVideoToggle.checked)) {
                videoValidationTrackingVideo.src = result.tracking_video_url;
              }
              alert('Tracking video recreated successfully!');
            }
          } catch (err) {
            console.error('Failed to recreate tracking video:', err);
            alert('Failed to recreate tracking video: ' + err.message);
          } finally {
            videoValidationRecreateTrackingBtn.disabled = false;
            videoValidationRecreateTrackingBtn.textContent = 'Recreate Tracking Video';
          }
        });
      }

      // Recreate Step Video button
      const videoValidationRecreateStepBtn = document.getElementById('videoValidationRecreateStepBtn');
      if (videoValidationRecreateStepBtn) {
        videoValidationRecreateStepBtn.addEventListener('click', async () => {
          if (!videoValidationCurrentActionId) {
            alert('No action selected');
            return;
          }
          videoValidationRecreateStepBtn.disabled = true;
          videoValidationRecreateStepBtn.textContent = 'Recreating...';
          try {
            const result = await window.regenerateStepVideo(videoValidationCurrentActionId);
            if (result && result.step_video_url) {
              if (videoValidationStepVideo) {
                videoValidationStepVideo.src = result.step_video_url;
              }
              if (result.step_video_subtitles) {
                videoValidationStepSubtitles = result.step_video_subtitles;
              }
              alert('Step video recreated successfully!');
            }
          } catch (err) {
            console.error('Failed to recreate step video:', err);
            alert('Failed to recreate step video: ' + err.message);
          } finally {
            videoValidationRecreateStepBtn.disabled = false;
            videoValidationRecreateStepBtn.textContent = 'Recreate Step Video';
          }
        });
      }

      // Update subtitles on timeupdate
      if (videoValidationTrackingVideo) {
        videoValidationTrackingVideo.addEventListener('timeupdate', () => {
          updateSubtitleOverlay(videoValidationTrackingVideo, videoValidationTrackingSubtitle, []);
        });
      }

      if (videoValidationStepVideo) {
        videoValidationStepVideo.addEventListener('timeupdate', () => {
          updateSubtitleOverlay(videoValidationStepVideo, videoValidationStepSubtitle, videoValidationStepSubtitles);
        });
      }

      // Sync video playback (only when View RawVideo is NOT checked)
      if (videoValidationTrackingVideo) {
        videoValidationTrackingVideo.addEventListener('play', () => {
          // Only sync if View RawVideo is NOT checked
          if (videoValidationRawVideoToggle && videoValidationRawVideoToggle.checked) {
            return; // Don't sync when raw video is selected
          }
          if (videoValidationStepVideo && videoValidationStepVideo.paused) {
            // Apply current playback speed before playing
            applyPlaybackSpeed(videoValidationCurrentPlaybackSpeed);
            videoValidationStepVideo.play();
          }
          updatePlayButtonText();
        });
        videoValidationTrackingVideo.addEventListener('pause', () => {
          // Only sync if View RawVideo is NOT checked
          if (videoValidationRawVideoToggle && videoValidationRawVideoToggle.checked) {
            return; // Don't sync when raw video is selected
          }
          if (videoValidationStepVideo && !videoValidationStepVideo.paused) {
            videoValidationStepVideo.pause();
          }
          updatePlayButtonText();
        });
        videoValidationTrackingVideo.addEventListener('ended', () => {
          updatePlayButtonText();
        });
      }

      if (videoValidationStepVideo) {
        videoValidationStepVideo.addEventListener('play', () => {
          // Only sync if View RawVideo is NOT checked
          if (videoValidationRawVideoToggle && videoValidationRawVideoToggle.checked) {
            return; // Don't sync when raw video is selected
          }
          if (videoValidationTrackingVideo && videoValidationTrackingVideo.paused) {
            // Apply current playback speed before playing
            applyPlaybackSpeed(videoValidationCurrentPlaybackSpeed);
            videoValidationTrackingVideo.play();
          }
          updatePlayButtonText();
        });
        videoValidationStepVideo.addEventListener('pause', () => {
          // Only sync if View RawVideo is NOT checked
          if (videoValidationRawVideoToggle && videoValidationRawVideoToggle.checked) {
            return; // Don't sync when raw video is selected
          }
          if (videoValidationTrackingVideo && !videoValidationTrackingVideo.paused) {
            videoValidationTrackingVideo.pause();
          }
          updatePlayButtonText();
        });
        videoValidationStepVideo.addEventListener('ended', () => {
          updatePlayButtonText();
        });
      }

      // Graph Info Panel Resizer
      const graphInfoResizer = document.getElementById('graphInfoResizer');
      if (graphInfoResizer && graphInfoPanel) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        graphInfoResizer.addEventListener('mousedown', (e) => {
          isResizing = true;
          startX = e.clientX;
          startWidth = parseInt(window.getComputedStyle(graphInfoPanel).width, 10);
          graphInfoResizer.classList.add('resizing');
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
          e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
          if (!isResizing) return;
          const diff = startX - e.clientX;
          const newWidth = startWidth + diff;
          const minWidth = 400;
          const maxWidth = window.innerWidth * 0.9;
          if (newWidth >= minWidth && newWidth <= maxWidth) {
            graphInfoPanel.style.width = newWidth + 'px';
          }
        });

        document.addEventListener('mouseup', () => {
          if (isResizing) {
            isResizing = false;
            graphInfoResizer.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
          }
        });
      }

      // Graph Panel Log Tree functions
      // Display mode for Graph Panel Log: 'log', 'tree', or 'validation'
      let graphPanelLogDisplayMode = getLocalStorage('graph-panel-log-display-mode') || 'log';
      
      async function loadGraphPanelTree() {
        updateGraphShowModeButton();
        
        if ((graphPanelLogDisplayMode === 'tree' || graphPanelLogDisplayMode === 'validation') && window.getPanelTree) {
          try {
            graphPanelTreeData = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(graphPanelLogDisplayMode) : window.getPanelTree(graphPanelLogDisplayMode));
            renderGraphPanelTree();
          } catch (err) {
            console.error('Failed to load graph panel tree with current mode:', err);
            if (window.graphPanelTreeData) {
              graphPanelTreeData = window.graphPanelTreeData;
              renderGraphPanelTree();
            }
          }
        } else if (window.graphPanelTreeData) {
          graphPanelTreeData = window.graphPanelTreeData;
          renderGraphPanelTree();
        }
      }
      
      // Expose to window for access from evaluate context
      window.loadGraphPanelTree = loadGraphPanelTree;
      
      // Update graph panel log showMode button icon (log -> tree -> validation -> log)
      function updateGraphShowModeButton() {
        const showModeBtn = document.getElementById('graph-panel-log-show-mode-btn');
        if (!showModeBtn) return;
        
        updateMyAssignmentCheckboxVisibility();
        if (graphPanelLogDisplayMode === 'log') {
          showModeBtn.innerHTML = '<img src="https://cdn.jsdelivr.net/npm/remixicon/icons/Editor/node-tree.svg" alt="Tree Mode" style="width: 20px; height: 20px; filter: brightness(0) saturate(100%) invert(100%);" />';
          showModeBtn.title = 'Switch to Tree Mode';
        } else if (graphPanelLogDisplayMode === 'tree') {
          showModeBtn.innerHTML = '<span style="font-size: 20px; line-height: 1;">🗹</span>';
          showModeBtn.title = 'Switch to Validation Mode';
        } else {
          showModeBtn.innerHTML = '<img src="https://cdn.jsdelivr.net/npm/bootstrap-icons/icons/list.svg" alt="List Mode" style="width: 20px; height: 20px; filter: brightness(0) saturate(100%) invert(100%);" />';
          showModeBtn.title = 'Switch to Log Mode';
        }
      }
      
      // Toggle graph panel log display mode: log -> tree -> validation -> log
      async function toggleGraphPanelLogDisplayMode() {
        if (graphPanelLogDisplayMode === 'log') graphPanelLogDisplayMode = 'tree';
        else if (graphPanelLogDisplayMode === 'tree') graphPanelLogDisplayMode = 'validation';
        else graphPanelLogDisplayMode = 'log';
        setLocalStorage('graph-panel-log-display-mode', graphPanelLogDisplayMode);
        updateGraphShowModeButton();
        
        if (window.getPanelTree) {
          try {
            graphPanelTreeData = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(graphPanelLogDisplayMode) : window.getPanelTree(graphPanelLogDisplayMode));
            renderGraphPanelTree();
            const modeText = graphPanelLogDisplayMode === 'tree' ? 'Tree' : (graphPanelLogDisplayMode === 'validation' ? 'Validation' : 'Log');
            if (window.showToast) window.showToast('✅ Graph Panel: Switched to ' + modeText + ' Mode');
          } catch (err) {
            console.error('Failed to reload graph panel tree:', err);
          }
        }
      }
      
      // Sync graph panel log showMode from main panel (when opening View Graph)
      window.syncGraphPanelLogDisplayModeFromMain = function(mode) {
        graphPanelLogDisplayMode = mode || 'log';
        setLocalStorage('graph-panel-log-display-mode', graphPanelLogDisplayMode);
        updateGraphShowModeButton();
        if (window.loadGraphPanelTree) loadGraphPanelTree();
      };

      // Initialize graph panel log showMode button
      const graphPanelLogShowModeBtn = document.getElementById('graph-panel-log-show-mode-btn');
      if (graphPanelLogShowModeBtn) {
        graphPanelLogShowModeBtn.addEventListener('click', toggleGraphPanelLogDisplayMode);
        updateGraphShowModeButton();
      }

      function renderGraphPanelTree() {
        const treeContainer = document.getElementById('graphPanelLogTree');
        if (!treeContainer) return;
        
        treeContainer.innerHTML = '';
        let showEmptyMyAssignment = false;
        try {
          const role = currentRole || 'DRAW';
          showEmptyMyAssignment = graphPanelLogDisplayMode === 'validation' && myAssignmentFilterEnabled && role === 'VALIDATE' && (!graphPanelTreeData || graphPanelTreeData.length === 0);
        } catch (e) { /* currentRole not defined yet */ }
        if (showEmptyMyAssignment) {
          const emptyDiv = document.createElement('div');
          emptyDiv.style.cssText = 'padding:24px 16px; text-align:center; color:#9e9e9e; font-size:14px;';
          emptyDiv.textContent = 'Bạn chưa được gán session nào!';
          treeContainer.appendChild(emptyDiv);
        } else {
          graphPanelTreeData.forEach(node => {
            treeContainer.appendChild(createGraphTreeNode(node, 0));
          });
        }
      }

      async function updateGraphPanelLogTreeIfOpen(data) {
        const graphViewModal = document.getElementById('graphViewModal');
        if (!graphViewModal || graphViewModal.style.display === 'none') return;
        if (window.getPanelTree) {
          try {
            if (graphPanelLogDisplayMode === 'tree' || graphPanelLogDisplayMode === 'validation') {
              graphPanelTreeData = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(graphPanelLogDisplayMode) : window.getPanelTree(graphPanelLogDisplayMode));
            } else {
              graphPanelTreeData = await window.getPanelTree('log');
            }
            renderGraphPanelTree();
          } catch (err) {
            console.error('Failed to reload graph panel tree:', err);
            if (data && Array.isArray(data)) {
              graphPanelTreeData = data;
              renderGraphPanelTree();
            }
          }
        } else if (data && Array.isArray(data)) {
          graphPanelTreeData = data;
          renderGraphPanelTree();
        }
      }

      function createGraphTreeNode(node, depth) {
        const expandKey = node.panel_id != null ? node.panel_id : (node.type + ':' + (node.name || '').replace(/\s/g, '_'));
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'graph-tree-node';
        if (node.panel_id != null) nodeDiv.setAttribute('data-panel-id', node.panel_id);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'graph-tree-node-content';
        if (node.panel_id != null) contentDiv.setAttribute('data-panel-id', node.panel_id);
        
        // Add session highlight classes for VALIDATE mode
        if (node.type === 'session') {
          if (currentRole === 'ADMIN' && node.assignee) {
            contentDiv.classList.add('session-has-assignee');
          }
          if (currentRole === 'VALIDATE' && node.assignee && currentAccountInfo && node.assignee === currentAccountInfo.collaborator_code) {
            contentDiv.classList.add('session-assigned-to-me');
          }
        }
        
        if (depth > 0) {
          contentDiv.style.paddingLeft = (20 * depth) + 'px';
        }
        
        const expandIcon = document.createElement('span');
        expandIcon.className = 'graph-tree-expand';
        if (node.children && node.children.length > 0) {
          expandIcon.textContent = '▶';
        } else {
          expandIcon.textContent = '';
          expandIcon.style.visibility = 'hidden';
        }
        contentDiv.appendChild(expandIcon);
        
        const nodeDot = document.createElement('span');
        nodeDot.className = 'graph-tree-node-dot';
        if (node.item_category === 'ACTION') {
          nodeDot.style.marginLeft = '8px';
        }
        
        let dotColor;
        let useIconInsteadOfDot = false;
        let validationIcon = '';
        
        if (node.item_category === 'PANEL') {
          const isIncomplete = node.draw_flow_state !== null && 
                              node.draw_flow_state !== undefined && 
                              node.draw_flow_state !== 'completed';
          dotColor = isIncomplete ? '#ff9800' : '#4caf50';
        } else if (node.item_category === 'ACTION') {
          const hasIntersections = node.hasIntersections || false;
          dotColor = hasIntersections ? '#ff4444' : '#00aaff';
        } else if (node.type === 'day') {
          // Day nodes: calendar icon in orange
          useIconInsteadOfDot = true;
          validationIcon = '📅';
          dotColor = '#ff9800';
        } else if (node.type === 'session') {
          // Session nodes: clock icon in orange
          useIconInsteadOfDot = true;
          validationIcon = '🕘';
          dotColor = '#ff9800';
        } else if (node.type === 'scene') {
          // Scene nodes: movie clapper icon in orange
          useIconInsteadOfDot = true;
          validationIcon = '🎬';
          dotColor = '#ff9800';
        } else {
          dotColor = '#9e9e9e';
        }
        
        let originalDotHTML;
        if (useIconInsteadOfDot) {
          // Use icon for day/session/scene nodes with margin-right for spacing
          originalDotHTML = '<span style="font-size: 14px; color: ' + dotColor + '; margin-right: 4px;">' + validationIcon + '</span>';
        } else if (node.status === 'completed') {
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
        contentDiv.appendChild(nodeDot);
        
        const label = document.createElement('span');
        label.className = 'graph-tree-label';
        
        const isIncomplete = node.item_category === 'PANEL' && 
                            node.draw_flow_state !== null && 
                            node.draw_flow_state !== undefined && 
                            node.draw_flow_state !== 'completed';
        
        if (isIncomplete) {
          const warningIcon = document.createElement('span');
          warningIcon.textContent = '⚠️ ';
          warningIcon.style.marginRight = '4px';
          label.appendChild(warningIcon);
        }
        
        const nameText = document.createTextNode(node.name || 'Item');
        label.appendChild(nameText);
        
        // Validation mode: show view count (only ADMIN role) after action name, only if > 0
        if (node.item_category === 'ACTION' && node.view_count !== undefined && node.view_count > 0 && currentRole === 'ADMIN') {
          const viewCountSpan = document.createElement('span');
          viewCountSpan.style.marginLeft = '6px';
          viewCountSpan.style.display = 'inline-flex';
          viewCountSpan.style.alignItems = 'center';
          viewCountSpan.style.gap = '4px';
          viewCountSpan.style.fontSize = '12px';
          viewCountSpan.style.color = '#9e9e9e';
          viewCountSpan.style.cursor = 'help';
          const count = node.view_count ?? 0;
          viewCountSpan.appendChild(document.createTextNode('👁️‍🗨️ ' + String(count)));
          viewCountSpan.addEventListener('mouseenter', (ev) => { showViewersTooltip(ev, node.panel_id); });
          viewCountSpan.addEventListener('mouseleave', () => { hideViewersTooltip(); });
          label.appendChild(viewCountSpan);
        }
        
        if (isIncomplete) {
          const badge = document.createElement('span');
          badge.className = 'graph-tree-incomplete-badge';
          badge.textContent = '[Chưa hoàn tất]';
          label.appendChild(badge);
        }
        
        // Bug icon: no bug / bug chưa fix (đỏ 🐞) / bug đã fix hết (xanh ✓)
        if (node.item_category === 'ACTION' && (node.bug_flag || (node.metadata && node.metadata.bug_flag))) {
            const bugInfo = node.bug_info || (node.metadata && node.metadata.bug_info) || null;
            const bugNote = node.bug_note || (node.metadata && node.metadata.bug_note) || null;
            const allFixed = typeof hasAllBugFixed === 'function' ? hasAllBugFixed(bugInfo) : false;
            const bugIcon = document.createElement('span');
            bugIcon.style.marginLeft = '4px';
            bugIcon.style.display = 'inline-block';
            bugIcon.style.verticalAlign = 'middle';
            bugIcon.style.width = '16px';
            bugIcon.style.height = '16px';
            bugIcon.style.fontSize = '14px';
            bugIcon.style.cursor = 'help';
            bugIcon.style.color = allFixed ? '#28a745' : '#dc3545';
            bugIcon.textContent = allFixed ? '✓' : '🐞';
            bugIcon.addEventListener('mouseenter', (e) => { showBugTooltip(e, bugNote, bugInfo); });
            bugIcon.addEventListener('mouseleave', () => { hideBugTooltip(); });
            label.appendChild(bugIcon);
        }
        
        // Important action (modality_stacks) - same as main panel log
        if (node.item_category === 'ACTION') {
            const hasModalityStacks = node.modality_stacks && Array.isArray(node.modality_stacks) && node.modality_stacks.length > 0;
            if (hasModalityStacks) {
                const importantIcon = document.createElement('span');
                importantIcon.style.marginLeft = '6px';
                importantIcon.style.cursor = 'help';
                importantIcon.style.display = 'inline-block';
                importantIcon.style.verticalAlign = 'middle';
                importantIcon.style.width = '16px';
                importantIcon.style.height = '16px';
                importantIcon.style.color = '#ffc107';
                importantIcon.textContent = '⭐';
                importantIcon.title = 'Important Action';
                importantIcon.addEventListener('mouseenter', (e) => {
                    // Remove any existing tooltips first to prevent duplicates
                    const existingTooltip = document.getElementById('graph-modality-stacks-tooltip');
                    if (existingTooltip) existingTooltip.remove();
                    
                    const tooltip = document.createElement('div');
                    tooltip.id = 'graph-modality-stacks-tooltip';
                    tooltip.style.cssText = 'position: fixed; left: ' + (e.clientX + 10) + 'px; top: ' + (e.clientY + 10) + 'px; background: rgba(0, 0, 0, 0.9); color: white; padding: 12px; border-radius: 6px; font-size: 12px; max-width: 400px; z-index: 10000; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
                    let tooltipContent = '<div style="font-weight: 600; margin-bottom: 8px; color: #ffc107;">⭐ Đây là tính năng quan trọng cần làm hết luồng</div>';
                    if (node.modality_stacks_reason) tooltipContent += '<div style="margin-top: 8px; padding: 6px; background: rgba(33, 150, 243, 0.2); border-left: 2px solid #2196f3; border-radius: 4px;"><div style="font-weight: 600; color: #4fc3f7; font-size: 11px;">Lý do lựa chọn:</div><div style="color: #fff; font-size: 11px;">' + node.modality_stacks_reason + '</div></div>';
                    if (node.modality_stacks_info && Array.isArray(node.modality_stacks_info)) {
                        node.modality_stacks_info.forEach((ms) => {
                            tooltipContent += '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);"><div style="font-weight: 600; color: #4fc3f7;">' + (ms.name || 'N/A') + '</div><div style="margin-top: 4px; color: #ccc;">' + (ms.description || 'N/A') + '</div></div>';
                        });
                    } else {
                        tooltipContent += '<div style="margin-top: 8px; color: #ccc;">Modality stacks: ' + (node.modality_stacks || []).join(', ') + '</div>';
                    }
                    tooltip.innerHTML = tooltipContent;
                    document.body.appendChild(tooltip);
                });
                importantIcon.addEventListener('mouseleave', () => { const t = document.getElementById('graph-modality-stacks-tooltip'); if (t) t.remove(); });
                label.appendChild(importantIcon);
            }
        }
        
        contentDiv.appendChild(label);
        nodeDiv.appendChild(contentDiv);
        
        if (node.children && node.children.length > 0) {
          const childrenDiv = document.createElement('div');
          childrenDiv.className = 'graph-tree-children';
          
          if (depth === 0) {
            childrenDiv.classList.add('level-1');
          } else {
            childrenDiv.classList.add('level-2');
          }
          
          // Auto-expand day + session only; scene/snapshot collapsed by default, unless previously expanded
          const isValidationNodeExpandAll = node.type === 'day' || node.type === 'session';
          if (isValidationNodeExpandAll || graphExpandedPanels.has(expandKey)) {
            childrenDiv.classList.add('expanded');
            expandIcon.textContent = '▼';
            if (isValidationNodeExpandAll) graphExpandedPanels.add(expandKey);
          }
          
          node.children.forEach(child => {
            childrenDiv.appendChild(createGraphTreeNode(child, depth + 1));
          });
          nodeDiv.appendChild(childrenDiv);
          
          expandIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            childrenDiv.classList.toggle('expanded');
            expandIcon.textContent = childrenDiv.classList.contains('expanded') ? '▼' : '▶';
            
            if (childrenDiv.classList.contains('expanded')) {
              graphExpandedPanels.add(expandKey);
            } else {
              graphExpandedPanels.delete(expandKey);
            }
          });
        }
        
        contentDiv.addEventListener('click', async () => {
          const treeContainer = document.getElementById('graphPanelLogTree');
          if (treeContainer) {
            treeContainer.querySelectorAll('.graph-tree-node-content').forEach(el => {
              el.classList.remove('selected');
            });
          }
          contentDiv.classList.add('selected');
          
          if (node.panel_id == null) return;
          if (node.item_category === 'PANEL') {
            // Find node in graph and show panel info
            if (window.graphNodesData) {
              const graphNode = window.graphNodesData.find(n => 
                n.data && n.data.itemId === node.panel_id
              );
              if (graphNode && graphNode.data && window.showPanelInfoGraph) {
                await window.showPanelInfoGraph(graphNode.data);
              }
            }
          } else if (node.item_category === 'ACTION') {
            // Find edge in graph and show step info
            if (window.graphEdgesData && window.graphNodesData) {
              const graphEdge = window.graphEdgesData.find(e => 
                e.data && e.data.actionId === node.panel_id
              );
              if (graphEdge && graphEdge.data && window.showStepInfoGraph) {
                await window.showStepInfoGraph(graphEdge.data, window.graphNodesData);
              }
            }
          }
        });
        
        return nodeDiv;
      }

      // Video Validation Panel Log Tree functions
      let videoValidationPanelTreeData = [];
      let videoValidationExpandedPanels = new Set();
      
      // Display mode for Video Validation Panel Log: 'log', 'tree', or 'validation'
      let videoValidationPanelLogDisplayMode = getLocalStorage('video-validation-panel-log-display-mode') || 'log';

      function renderPanelTreeForValidationInternal(panelTreeData, treeContainer) {
        if (!treeContainer) return;
        
        videoValidationPanelTreeData = panelTreeData || [];
        treeContainer.innerHTML = '';
        
        let showEmptyMyAssignment = false;
        try {
          const role = currentRole || 'DRAW';
          showEmptyMyAssignment = videoValidationPanelLogDisplayMode === 'validation' && myAssignmentFilterEnabled && role === 'VALIDATE' && (!videoValidationPanelTreeData || videoValidationPanelTreeData.length === 0);
        } catch (e) { /* currentRole not defined yet */ }
        if (showEmptyMyAssignment) {
          const emptyDiv = document.createElement('div');
          emptyDiv.style.cssText = 'padding:24px 16px; text-align:center; color:#9e9e9e; font-size:14px;';
          emptyDiv.textContent = 'Bạn chưa được gán session nào!';
          treeContainer.appendChild(emptyDiv);
        } else {
          videoValidationPanelTreeData.forEach(node => {
            treeContainer.appendChild(createVideoValidationTreeNode(node, 0));
          });
        }
      }
      
      async function renderPanelTreeForValidation(panelTreeData, treeContainer) {
        updateVideoValidationShowModeButton();
        
        if ((videoValidationPanelLogDisplayMode === 'tree' || videoValidationPanelLogDisplayMode === 'validation') && window.getPanelTree) {
          try {
            const treeData = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(videoValidationPanelLogDisplayMode) : window.getPanelTree(videoValidationPanelLogDisplayMode));
            renderPanelTreeForValidationInternal(treeData, treeContainer);
          } catch (err) {
            console.error('Failed to load video validation panel tree with current mode:', err);
            renderPanelTreeForValidationInternal(panelTreeData, treeContainer);
          }
        } else {
          renderPanelTreeForValidationInternal(panelTreeData, treeContainer);
        }
      }

      // Expose to window for access from evaluate context
      window.renderPanelTreeForValidation = renderPanelTreeForValidation;
      
      // Update video validation panel log showMode button icon (log -> tree -> validation -> log)
      function updateVideoValidationShowModeButton() {
        const showModeBtn = document.getElementById('video-validation-panel-log-show-mode-btn');
        if (!showModeBtn) return;
        
        updateMyAssignmentCheckboxVisibility();
        if (videoValidationPanelLogDisplayMode === 'log') {
          showModeBtn.innerHTML = '<img src="https://cdn.jsdelivr.net/npm/remixicon/icons/Editor/node-tree.svg" alt="Tree Mode" style="width: 20px; height: 20px; filter: brightness(0) saturate(100%) invert(100%);" />';
          showModeBtn.title = 'Switch to Tree Mode';
        } else if (videoValidationPanelLogDisplayMode === 'tree') {
          showModeBtn.innerHTML = '<span style="font-size: 20px; line-height: 1;">🗹</span>';
          showModeBtn.title = 'Switch to Validation Mode';
        } else {
          showModeBtn.innerHTML = '<img src="https://cdn.jsdelivr.net/npm/bootstrap-icons/icons/list.svg" alt="List Mode" style="width: 20px; height: 20px; filter: brightness(0) saturate(100%) invert(100%);" />';
          showModeBtn.title = 'Switch to Log Mode';
        }
      }
      
      // Toggle video validation panel log display mode: log -> tree -> validation -> log
      async function toggleVideoValidationPanelLogDisplayMode() {
        if (videoValidationPanelLogDisplayMode === 'log') videoValidationPanelLogDisplayMode = 'tree';
        else if (videoValidationPanelLogDisplayMode === 'tree') videoValidationPanelLogDisplayMode = 'validation';
        else videoValidationPanelLogDisplayMode = 'log';
        setLocalStorage('video-validation-panel-log-display-mode', videoValidationPanelLogDisplayMode);
        updateVideoValidationShowModeButton();
        
        if (window.getPanelTree) {
          try {
            const panelTreeData = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(videoValidationPanelLogDisplayMode) : window.getPanelTree(videoValidationPanelLogDisplayMode));
            const treeContainer = document.getElementById('videoValidationPanelLogTree');
            if (treeContainer) {
              renderPanelTreeForValidationInternal(panelTreeData, treeContainer);
            }
            const modeText = videoValidationPanelLogDisplayMode === 'tree' ? 'Tree' : (videoValidationPanelLogDisplayMode === 'validation' ? 'Validation' : 'Log');
            if (window.showToast) window.showToast('✅ Video Validation: Switched to ' + modeText + ' Mode');
          } catch (err) {
            console.error('Failed to reload video validation panel tree:', err);
          }
        }
      }
      
      // Sync video validation panel log showMode from main panel (when opening Video Validate)
      window.syncVideoValidationPanelLogDisplayModeFromMain = function(mode) {
        videoValidationPanelLogDisplayMode = mode || 'log';
        setLocalStorage('video-validation-panel-log-display-mode', videoValidationPanelLogDisplayMode);
        updateVideoValidationShowModeButton();
      };

      async function updateVideoValidationPanelLogTreeIfOpen(data) {
        const modal = document.getElementById('videoValidationModal');
        const treeContainer = document.getElementById('videoValidationPanelLogTree');
        if (!modal || modal.style.display === 'none' || !treeContainer) return;
        if (window.getPanelTree) {
          try {
            if (videoValidationPanelLogDisplayMode === 'tree' || videoValidationPanelLogDisplayMode === 'validation') {
              const treeData = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(videoValidationPanelLogDisplayMode) : window.getPanelTree(videoValidationPanelLogDisplayMode));
              renderPanelTreeForValidationInternal(treeData, treeContainer);
            } else {
              const treeData = await window.getPanelTree('log');
              renderPanelTreeForValidationInternal(treeData, treeContainer);
            }
          } catch (err) {
            console.error('Failed to reload video validation panel tree:', err);
            if (data && Array.isArray(data)) {
              renderPanelTreeForValidationInternal(data, treeContainer);
            }
          }
        } else if (data && Array.isArray(data)) {
          renderPanelTreeForValidationInternal(data, treeContainer);
        }
      }

      // Initialize video validation panel log showMode button
      const videoValidationPanelLogShowModeBtn = document.getElementById('video-validation-panel-log-show-mode-btn');
      if (videoValidationPanelLogShowModeBtn) {
        videoValidationPanelLogShowModeBtn.addEventListener('click', toggleVideoValidationPanelLogDisplayMode);
        updateVideoValidationShowModeButton();
      }

      // Function to load video data for a specific action
      function loadVideoDataForAction(actionId) {
        const stepData = window.videoValidationStepData || [];
        const stepInfo = stepData.find(s => s.action_id === actionId);
        
        if (stepInfo) {
          const trackingVideo = document.getElementById('videoValidationTrackingVideo');
          const stepVideo = document.getElementById('videoValidationStepVideo');
          const rawVideoToggle = document.getElementById('videoValidationRawVideoToggle');
          
          // Store URLs for later use
          videoValidationCurrentActionId = actionId;
          videoValidationStepSubtitles = stepInfo.step_video_subtitles || [];
          videoValidationTrackingVideoUrl = stepInfo.tracking_video_url;
          videoValidationRawVideoUrl = stepInfo.session_url;
          
          // Helper function to reset video after metadata loaded
          const resetVideoAfterLoad = (video) => {
            if (!video) return;
            const onLoadedMetadata = () => {
              video.pause();
              video.currentTime = 0;
              // Apply current playback speed
              video.playbackRate = videoValidationCurrentPlaybackSpeed;
              video.removeEventListener('loadedmetadata', onLoadedMetadata);
            };
            // If already loaded, reset immediately
            if (video.readyState >= 1) {
              video.pause();
              video.currentTime = 0;
              video.playbackRate = videoValidationCurrentPlaybackSpeed;
            } else {
              video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
            }
          };
          
          // Load StepVideo
          if (stepVideo && stepInfo.step_video_url) {
            stepVideo.src = stepInfo.step_video_url;
            stepVideo.load();
            resetVideoAfterLoad(stepVideo);
          } else if (stepVideo) {
            stepVideo.src = '';
          }
          
          // Load TrackingVideo (default, not raw)
          if (trackingVideo) {
            if (stepInfo.tracking_video_url) {
              trackingVideo.src = stepInfo.tracking_video_url;
              trackingVideo.load();
              resetVideoAfterLoad(trackingVideo);
              if (rawVideoToggle) {
                rawVideoToggle.checked = false;
              }
            } else if (stepInfo.session_url) {
              // Fallback to raw video if tracking video not available
              trackingVideo.src = stepInfo.session_url;
              trackingVideo.load();
              resetVideoAfterLoad(trackingVideo);
              if (rawVideoToggle) {
                rawVideoToggle.checked = true;
              }
            } else {
              trackingVideo.src = '';
            }
          }
          
          // Update SyncedPlay button state after loading video
          if (window.updateSyncedPlayButtonState) {
            window.updateSyncedPlayButtonState();
          }
          
          // Update play button text to "Play"
          updatePlayButtonText();
        } else {
          // No step data for this action - clear videos
          const trackingVideo = document.getElementById('videoValidationTrackingVideo');
          const stepVideo = document.getElementById('videoValidationStepVideo');
          
          if (trackingVideo) {
            trackingVideo.src = '';
          }
          if (stepVideo) {
            stepVideo.src = '';
          }
          
          videoValidationCurrentActionId = null;
          videoValidationStepSubtitles = [];
          videoValidationTrackingVideoUrl = null;
          videoValidationRawVideoUrl = null;
          
          // Update SyncedPlay button state
          if (window.updateSyncedPlayButtonState) {
            window.updateSyncedPlayButtonState();
          }
        }
      }

      function createVideoValidationTreeNode(node, depth) {
        const expandKey = node.panel_id != null ? node.panel_id : (node.type + ':' + (node.name || '').replace(/\s/g, '_'));
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'graph-tree-node';
        if (node.panel_id != null) nodeDiv.setAttribute('data-panel-id', node.panel_id);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'graph-tree-node-content';
        if (node.panel_id != null) contentDiv.setAttribute('data-panel-id', node.panel_id);
        
        // Add session highlight classes for VALIDATE mode
        if (node.type === 'session') {
          if (currentRole === 'ADMIN' && node.assignee) {
            contentDiv.classList.add('session-has-assignee');
          }
          if (currentRole === 'VALIDATE' && node.assignee && currentAccountInfo && node.assignee === currentAccountInfo.collaborator_code) {
            contentDiv.classList.add('session-assigned-to-me');
          }
        }
        
        if (depth > 0) {
          contentDiv.style.paddingLeft = (20 * depth) + 'px';
        }
        
        const expandIcon = document.createElement('span');
        expandIcon.className = 'graph-tree-expand';
        if (node.children && node.children.length > 0) {
          expandIcon.textContent = '▶';
        } else {
          expandIcon.textContent = '';
          expandIcon.style.visibility = 'hidden';
        }
        contentDiv.appendChild(expandIcon);
        
        const nodeDot = document.createElement('span');
        nodeDot.className = 'graph-tree-node-dot';
        if (node.item_category === 'ACTION') {
          nodeDot.style.marginLeft = '8px';
        }
        
        let dotColor;
        let useIconInsteadOfDot = false;
        let validationIcon = '';
        
        if (node.item_category === 'PANEL') {
          const isIncomplete = node.draw_flow_state !== null && 
                              node.draw_flow_state !== undefined && 
                              node.draw_flow_state !== 'completed';
          dotColor = isIncomplete ? '#ff9800' : '#4caf50';
        } else if (node.item_category === 'ACTION') {
          const hasIntersections = node.hasIntersections || false;
          dotColor = hasIntersections ? '#ff4444' : '#00aaff';
        } else if (node.type === 'day') {
          // Day nodes: calendar icon in orange
          useIconInsteadOfDot = true;
          validationIcon = '📅';
          dotColor = '#ff9800';
        } else if (node.type === 'session') {
          // Session nodes: clock icon in orange
          useIconInsteadOfDot = true;
          validationIcon = '🕘';
          dotColor = '#ff9800';
        } else if (node.type === 'scene') {
          // Scene nodes: movie clapper icon in orange
          useIconInsteadOfDot = true;
          validationIcon = '🎬';
          dotColor = '#ff9800';
        } else {
          dotColor = '#9e9e9e';
        }
        
        let originalDotHTML;
        if (useIconInsteadOfDot) {
          // Use icon for day/session/scene nodes with margin-right for spacing
          originalDotHTML = '<span style="font-size: 14px; color: ' + dotColor + '; margin-right: 4px;">' + validationIcon + '</span>';
        } else if (node.status === 'completed') {
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
        contentDiv.appendChild(nodeDot);
        
        const label = document.createElement('span');
        label.className = 'graph-tree-label';
        
        const isIncomplete = node.item_category === 'PANEL' && 
                            node.draw_flow_state !== null && 
                            node.draw_flow_state !== undefined && 
                            node.draw_flow_state !== 'completed';
        
        if (isIncomplete) {
          const warningIcon = document.createElement('span');
          warningIcon.textContent = '⚠️ ';
          warningIcon.style.marginRight = '4px';
          label.appendChild(warningIcon);
        }
        
        const nameText = document.createTextNode(node.name || 'Item');
        label.appendChild(nameText);
        
        // Validation mode: show view count (only ADMIN role) after action name, only if > 0
        if (node.item_category === 'ACTION' && node.view_count !== undefined && node.view_count > 0 && currentRole === 'ADMIN') {
          const viewCountSpan = document.createElement('span');
          viewCountSpan.style.marginLeft = '6px';
          viewCountSpan.style.display = 'inline-flex';
          viewCountSpan.style.alignItems = 'center';
          viewCountSpan.style.gap = '4px';
          viewCountSpan.style.fontSize = '12px';
          viewCountSpan.style.color = '#9e9e9e';
          viewCountSpan.style.cursor = 'help';
          const count = node.view_count ?? 0;
          viewCountSpan.appendChild(document.createTextNode('👁️‍🗨️ ' + String(count)));
          viewCountSpan.addEventListener('mouseenter', (ev) => { showViewersTooltip(ev, node.panel_id); });
          viewCountSpan.addEventListener('mouseleave', () => { hideViewersTooltip(); });
          label.appendChild(viewCountSpan);
        }
        
        if (isIncomplete) {
          const badge = document.createElement('span');
          badge.className = 'graph-tree-incomplete-badge';
          badge.textContent = '[Chưa hoàn tất]';
          label.appendChild(badge);
        }
        
        // Bug icon: no bug / bug chưa fix (đỏ 🐞) / bug đã fix hết (xanh ✓)
        if (node.item_category === 'ACTION' && (node.bug_flag || (node.metadata && node.metadata.bug_flag))) {
            const bugInfo = node.bug_info || (node.metadata && node.metadata.bug_info) || null;
            const bugNote = node.bug_note || (node.metadata && node.metadata.bug_note) || null;
            const allFixed = typeof hasAllBugFixed === 'function' ? hasAllBugFixed(bugInfo) : false;
            const bugIcon = document.createElement('span');
            bugIcon.style.marginLeft = '4px';
            bugIcon.style.display = 'inline-block';
            bugIcon.style.verticalAlign = 'middle';
            bugIcon.style.width = '16px';
            bugIcon.style.height = '16px';
            bugIcon.style.fontSize = '14px';
            bugIcon.style.cursor = 'help';
            bugIcon.style.color = allFixed ? '#28a745' : '#dc3545';
            bugIcon.textContent = allFixed ? '✓' : '🐞';
            bugIcon.addEventListener('mouseenter', (e) => { showBugTooltip(e, bugNote, bugInfo); });
            bugIcon.addEventListener('mouseleave', () => { hideBugTooltip(); });
            label.appendChild(bugIcon);
        }
        
        // Important action (modality_stacks) - same as main panel log
        if (node.item_category === 'ACTION') {
            const hasModalityStacks = node.modality_stacks && Array.isArray(node.modality_stacks) && node.modality_stacks.length > 0;
            if (hasModalityStacks) {
                const importantIcon = document.createElement('span');
                importantIcon.style.marginLeft = '6px';
                importantIcon.style.cursor = 'help';
                importantIcon.style.display = 'inline-block';
                importantIcon.style.verticalAlign = 'middle';
                importantIcon.style.width = '16px';
                importantIcon.style.height = '16px';
                importantIcon.style.color = '#ffc107';
                importantIcon.textContent = '⭐';
                importantIcon.title = 'Important Action';
                importantIcon.addEventListener('mouseenter', (e) => {
                    // Remove any existing tooltips first to prevent duplicates
                    const existingTooltip = document.getElementById('video-validation-modality-tooltip');
                    if (existingTooltip) existingTooltip.remove();
                    
                    const tooltip = document.createElement('div');
                    tooltip.id = 'video-validation-modality-tooltip';
                    tooltip.style.cssText = 'position: fixed; left: ' + (e.clientX + 10) + 'px; top: ' + (e.clientY + 10) + 'px; background: rgba(0, 0, 0, 0.9); color: white; padding: 12px; border-radius: 6px; font-size: 12px; max-width: 400px; z-index: 10000; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
                    let tooltipContent = '<div style="font-weight: 600; margin-bottom: 8px; color: #ffc107;">⭐ Đây là tính năng quan trọng cần làm hết luồng</div>';
                    if (node.modality_stacks_reason) tooltipContent += '<div style="margin-top: 8px; padding: 6px; background: rgba(33, 150, 243, 0.2); border-left: 2px solid #2196f3; border-radius: 4px;"><div style="font-weight: 600; color: #4fc3f7; font-size: 11px;">Lý do lựa chọn:</div><div style="color: #fff; font-size: 11px;">' + node.modality_stacks_reason + '</div></div>';
                    if (node.modality_stacks_info && Array.isArray(node.modality_stacks_info)) {
                        node.modality_stacks_info.forEach((ms) => {
                            tooltipContent += '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);"><div style="font-weight: 600; color: #4fc3f7;">' + (ms.name || 'N/A') + '</div><div style="margin-top: 4px; color: #ccc;">' + (ms.description || 'N/A') + '</div></div>';
                        });
                    } else {
                        tooltipContent += '<div style="margin-top: 8px; color: #ccc;">Modality stacks: ' + (node.modality_stacks || []).join(', ') + '</div>';
                    }
                    tooltip.innerHTML = tooltipContent;
                    document.body.appendChild(tooltip);
                });
                importantIcon.addEventListener('mouseleave', () => { const t = document.getElementById('video-validation-modality-tooltip'); if (t) t.remove(); });
                label.appendChild(importantIcon);
            }
        }
        
        contentDiv.appendChild(label);
        nodeDiv.appendChild(contentDiv);
        
        if (node.children && node.children.length > 0) {
          const childrenDiv = document.createElement('div');
          childrenDiv.className = 'graph-tree-children';
          
          if (depth === 0) {
            childrenDiv.classList.add('level-1');
          } else {
            childrenDiv.classList.add('level-2');
          }
          
          // Auto-expand day + session only; scene/snapshot collapsed by default, unless previously expanded
          const isValidationNodeExpandAll = node.type === 'day' || node.type === 'session';
          if (isValidationNodeExpandAll || videoValidationExpandedPanels.has(expandKey)) {
            childrenDiv.classList.add('expanded');
            expandIcon.textContent = '▼';
            if (isValidationNodeExpandAll) videoValidationExpandedPanels.add(expandKey);
          }
          
          node.children.forEach(child => {
            childrenDiv.appendChild(createVideoValidationTreeNode(child, depth + 1));
          });
          nodeDiv.appendChild(childrenDiv);
          
          expandIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            childrenDiv.classList.toggle('expanded');
            expandIcon.textContent = childrenDiv.classList.contains('expanded') ? '▼' : '▶';
            
            if (childrenDiv.classList.contains('expanded')) {
              videoValidationExpandedPanels.add(expandKey);
            } else {
              videoValidationExpandedPanels.delete(expandKey);
            }
          });
        }
        
        contentDiv.addEventListener('click', async () => {
          const treeContainer = document.getElementById('videoValidationPanelLogTree');
          if (treeContainer) {
            treeContainer.querySelectorAll('.graph-tree-node-content').forEach(el => {
              el.classList.remove('selected');
            });
          }
          contentDiv.classList.add('selected');
          
          if (node.panel_id == null) return;
          if (node.item_category === 'ACTION') {
            // Load video URLs for this action
            const stepData = window.videoValidationStepData || [];
            let stepInfo = stepData.find(s => s.action_id === node.panel_id);
            
            // If video doesn't exist, generate it on-demand
            if (stepInfo && (!stepInfo.step_video_url || !stepInfo.tracking_video_url)) {
              const loadingMsg = document.getElementById('videoValidationStepVideo');
              if (loadingMsg && !stepInfo.step_video_url) {
                loadingMsg.previousElementSibling?.remove();
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'video-validation-loading-msg';
                loadingDiv.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:#fff; font-size:14px;';
                loadingDiv.textContent = '⏳ Creating StepVideo...';
                loadingMsg.parentElement.appendChild(loadingDiv);
              }
              
              const loadingMsg2 = document.getElementById('videoValidationTrackingVideo');
              let loadingDiv2 = null;
              if (loadingMsg2 && !stepInfo.tracking_video_url && stepInfo.session_url) {
                loadingMsg2.previousElementSibling?.remove();
                loadingDiv2 = document.createElement('div');
                loadingDiv2.className = 'video-validation-loading-msg';
                loadingDiv2.style.cssText = 'position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:#fff; font-size:14px;';
                loadingDiv2.textContent = '⏳ Creating TrackingVideo...';
                loadingMsg2.parentElement.appendChild(loadingDiv2);
              }
              
              try {
                if (window.generateVideoForAction) {
                  const videoResult = await window.generateVideoForAction(node.panel_id);
                  
                  // Update stepInfo with new URLs
                  if (videoResult.step_video_url) {
                    stepInfo.step_video_url = videoResult.step_video_url;
                    stepInfo.step_video_subtitles = videoResult.step_video_subtitles || [];
                  }
                  if (videoResult.tracking_video_url) {
                    stepInfo.tracking_video_url = videoResult.tracking_video_url;
                  }
                  if (videoResult.tracking_action_url) {
                    stepInfo.tracking_action_url = videoResult.tracking_action_url;
                  }
                  if (videoResult.tracking_panel_after_url) {
                    stepInfo.tracking_panel_after_url = videoResult.tracking_panel_after_url;
                  }
                  
                  // Update window.videoValidationStepData
                  const dataIndex = window.videoValidationStepData.findIndex(s => s.action_id === node.panel_id);
                  if (dataIndex >= 0) {
                    window.videoValidationStepData[dataIndex] = stepInfo;
                  }
                  
                  // Remove loading messages
                  const loadingMsgs = document.querySelectorAll('.video-validation-loading-msg');
                  loadingMsgs.forEach(msg => msg.remove());
                  
                  // Show warning if trackingVideo failed but stepVideo was created
                  if (videoResult.tracking_video_error && videoResult.step_video_url) {
                    console.warn('TrackingVideo failed but StepVideo created:', videoResult.tracking_video_error);
                    // Show non-blocking warning - stepVideo still works
                    const warningDiv = document.createElement('div');
                    warningDiv.style.cssText = 'position:fixed; bottom:20px; right:20px; background:#ff9800; color:#000; padding:12px 20px; border-radius:8px; font-size:14px; z-index:10001; box-shadow:0 4px 12px rgba(0,0,0,0.3);';
                    warningDiv.textContent = '⚠️ TrackingVideo failed - viewing raw session video';
                    document.body.appendChild(warningDiv);
                    setTimeout(() => warningDiv.remove(), 5000);
                  }
                  
                  // Reload videos if URLs are available
                  if (stepInfo.step_video_url || stepInfo.tracking_video_url) {
                    loadVideoDataForAction(node.panel_id);
                  }
                }
              } catch (err) {
                console.error('Failed to generate video:', err);
                // Remove loading messages
                const loadingMsgs = document.querySelectorAll('.video-validation-loading-msg');
                loadingMsgs.forEach(msg => msg.remove());
                alert('Failed to generate video: ' + (err.message || err));
              }
            }
            
            if (stepInfo) {
              const trackingVideo = document.getElementById('videoValidationTrackingVideo');
              const stepVideo = document.getElementById('videoValidationStepVideo');
              const rawVideoToggle = document.getElementById('videoValidationRawVideoToggle');
              
              // Store URLs for later use
              videoValidationCurrentActionId = node.panel_id;
              videoValidationStepSubtitles = stepInfo.step_video_subtitles || [];
              videoValidationTrackingVideoUrl = stepInfo.tracking_video_url;
              videoValidationRawVideoUrl = stepInfo.session_url;
              
              // Helper function to reset video after metadata loaded
              const resetVideoAfterLoad = (video) => {
                if (!video) return;
                const onLoadedMetadata = () => {
                  video.pause();
                  video.currentTime = 0;
                  // Apply current playback speed
                  video.playbackRate = videoValidationCurrentPlaybackSpeed;
                  video.removeEventListener('loadedmetadata', onLoadedMetadata);
                };
                // If already loaded, reset immediately
                if (video.readyState >= 1) {
                  video.pause();
                  video.currentTime = 0;
                  video.playbackRate = videoValidationCurrentPlaybackSpeed;
                } else {
                  video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
                }
              };
              
              // Load StepVideo
              if (stepVideo && stepInfo.step_video_url) {
                stepVideo.src = stepInfo.step_video_url;
                stepVideo.load();
                resetVideoAfterLoad(stepVideo);
              } else if (stepVideo) {
                stepVideo.src = '';
              }
              
              // Load TrackingVideo (default, not raw)
              if (trackingVideo) {
                if (stepInfo.tracking_video_url) {
                  trackingVideo.src = stepInfo.tracking_video_url;
                  trackingVideo.load();
                  resetVideoAfterLoad(trackingVideo);
                  if (rawVideoToggle) {
                    rawVideoToggle.checked = false;
                  }
                } else if (stepInfo.session_url) {
                  // Fallback to raw video if tracking video not available
                  trackingVideo.src = stepInfo.session_url;
                  trackingVideo.load();
                  resetVideoAfterLoad(trackingVideo);
                  if (rawVideoToggle) {
                    rawVideoToggle.checked = true;
                  }
                } else {
                  trackingVideo.src = '';
                }
              }
              
              // Update SyncedPlay button state after loading video
              if (window.updateSyncedPlayButtonState) {
                window.updateSyncedPlayButtonState();
              }
              
              // Update play button text to "Play"
              updatePlayButtonText();
            } else {
              // No step data for this action - clear videos
              const trackingVideo = document.getElementById('videoValidationTrackingVideo');
              const stepVideo = document.getElementById('videoValidationStepVideo');
              
              if (trackingVideo) {
                trackingVideo.src = '';
              }
              if (stepVideo) {
                stepVideo.src = '';
              }
              
              videoValidationCurrentActionId = null;
              videoValidationStepSubtitles = [];
              videoValidationTrackingVideoUrl = null;
              videoValidationRawVideoUrl = null;
              
              // Update SyncedPlay button state
              if (window.updateSyncedPlayButtonState) {
                window.updateSyncedPlayButtonState();
              }
            }
          }
        });
        
        return nodeDiv;
      }

      // Graph Panel Log Tree Resizer
      const graphPanelLogTreeResizer = document.getElementById('graphPanelLogTreeResizer');
      if (graphPanelLogTreeResizer) {
        const graphPanelLogTreeContainer = document.getElementById('graphPanelLogTreeContainer');
        if (graphPanelLogTreeContainer) {
          let isResizing = false;
          let startX = 0;
          let startWidth = 0;

          graphPanelLogTreeResizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = parseInt(window.getComputedStyle(graphPanelLogTreeContainer).width, 10);
            graphPanelLogTreeResizer.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
          });

          document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const diff = e.clientX - startX;
            const newWidth = startWidth + diff;
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.4;
            if (newWidth >= minWidth && newWidth <= maxWidth) {
              graphPanelLogTreeContainer.style.width = newWidth + 'px';
            }
          });

          document.addEventListener('mouseup', () => {
            if (isResizing) {
              isResizing = false;
              graphPanelLogTreeResizer.classList.remove('resizing');
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            }
          });
        }
      }

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

      // Collaborators modal (admin sessions list)
      const collaboratorsModal = document.getElementById('collaboratorsModal');
      const closeCollaboratorsModalBtn = document.getElementById('closeCollaboratorsModal');
      const collaboratorsBtn = document.getElementById('collaboratorsBtn');
      const collaboratorsSearchInput = document.getElementById('collaboratorsSearchInput');
      const collaboratorsAiToolSelect = document.getElementById('collaboratorsAiToolSelect');
      const collaboratorsRoleTrigger = document.getElementById('collaboratorsRoleTrigger');
      const collaboratorsRoleDropdown = document.getElementById('collaboratorsRoleDropdown');
      const collaboratorsDateFrom = document.getElementById('collaboratorsDateFrom');
      const collaboratorsDateTo = document.getElementById('collaboratorsDateTo');
      const collaboratorsFilterBtn = document.getElementById('collaboratorsFilterBtn');
      const collaboratorsSessionsTbody = document.getElementById('collaboratorsSessionsTbody');
      const collaboratorsPagination = document.getElementById('collaboratorsPagination');

      let collaboratorsCurrentPage = 1;
      const collaboratorsPerPage = 100;

      const formatGmt7 = (isoStr) => {
        if (isoStr == null || isoStr === '') return '-';
        try {
          let str = String(isoStr).trim();
          if (!str) return '-';
          if (!/Z|[+-]\d{2}:?\d{2}$/.test(str) && /^\d{4}-\d{2}-\d{2}/.test(str)) {
            str = str.replace(' ', 'T') + 'Z';
          }
          const d = new Date(str);
          if (isNaN(d.getTime())) return String(isoStr);
          return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        } catch (_) { return String(isoStr); }
      };

      const getSelectedRoles = () => {
        const cbs = document.querySelectorAll('.collaborators-role-cb:checked');
        const roles = Array.from(cbs).map((el) => el.value).filter((v) => v);
        return roles.length > 0 ? roles : ['DRAW'];
      };

      const updateCollaboratorsRoleTriggerText = () => {
        if (collaboratorsRoleTrigger) collaboratorsRoleTrigger.textContent = getSelectedRoles().join(', ') + ' ▼';
      };

      if (collaboratorsRoleTrigger && collaboratorsRoleDropdown) {
        collaboratorsRoleTrigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const open = collaboratorsRoleDropdown.style.display === 'block';
          collaboratorsRoleDropdown.style.display = open ? 'none' : 'block';
        });
        collaboratorsRoleDropdown.addEventListener('click', (e) => e.stopPropagation());
        document.querySelectorAll('.collaborators-role-cb').forEach((cb) => {
          cb.addEventListener('change', updateCollaboratorsRoleTriggerText);
        });
        document.addEventListener('click', () => { if (collaboratorsRoleDropdown) collaboratorsRoleDropdown.style.display = 'none'; });
      }

      const loadCollaboratorsSessions = async (page) => {
        if (!collaboratorsSessionsTbody) return;
        collaboratorsSessionsTbody.innerHTML = '<tr><td colspan="9" style="padding:20px; text-align:center;">Loading...</td></tr>';
        try {
          const search = collaboratorsSearchInput ? collaboratorsSearchInput.value.trim() : '';
          const myAiTool = collaboratorsAiToolSelect && collaboratorsAiToolSelect.value ? collaboratorsAiToolSelect.value.trim() : '';
          const roles = getSelectedRoles();
          if (roles.length === 0) roles.push('DRAW');
          const dateFrom = collaboratorsDateFrom && collaboratorsDateFrom.value ? collaboratorsDateFrom.value : null;
          const dateTo = collaboratorsDateTo && collaboratorsDateTo.value ? collaboratorsDateTo.value : null;
          const params = { page: page || 1, perPage: collaboratorsPerPage, search, roles, dateFrom, dateTo, my_ai_tool: myAiTool || null };
          const res = window.getAdminSessionsList ? await window.getAdminSessionsList(params) : { items: [], total: 0, page: 1, perPage: 100 };
          const items = res.items || [];
          const total = res.total || 0;
          const currentPage = res.page || 1;
          collaboratorsCurrentPage = currentPage;

          if (items.length === 0) {
            collaboratorsSessionsTbody.innerHTML = '<tr><td colspan="9" style="padding:20px; text-align:center;">Không có phiên nào.</td></tr>';
          } else {
            collaboratorsSessionsTbody.innerHTML = '';
            items.forEach((row) => {
              const tr = document.createElement('tr');
              if (row.active === 1) tr.style.background = '#e8f5e9';
              const activeLabel = row.active === 1 ? 'Active' : 'Inactive';
              tr.innerHTML = \`
                <td style="padding:8px; border-bottom:1px solid #eee;">\${row.session_id ?? ''}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">\${(row.toolName || row.my_ai_tool || '').replace(/</g, '&lt;')}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">\${(row.name || '').replace(/</g, '&lt;')}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">\${(row.role || '').replace(/</g, '&lt;')}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">\${(row.session_name || '').replace(/</g, '&lt;')}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">\${formatGmt7(row.created_at)}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;">\${formatGmt7(row.updated_at)}</td>
                <td class="collaborators-active-cell" data-session-id="\${row.session_id}" data-active="\${row.active}" style="padding:8px; border-bottom:1px solid #eee; cursor:pointer; color:#007bff; text-decoration:underline;" title="Bấm hoặc chuột phải để đổi trạng thái">\${activeLabel}</td>
                <td style="padding:8px; border-bottom:1px solid #eee;"><button class="collaborators-details-btn" data-session-id="\${row.session_id}" style="padding:4px 10px; font-size:12px; cursor:pointer;">Details</button></td>
              \`;
              tr.querySelector('.collaborators-active-cell').addEventListener('click', (e) => showActiveContextMenu(e, row.session_id, row.active));
              tr.querySelector('.collaborators-active-cell').addEventListener('contextmenu', (e) => { e.preventDefault(); showActiveContextMenu(e, row.session_id, row.active); });
              tr.querySelector('.collaborators-details-btn').addEventListener('click', () => openSessionDetailsDialog(row.session_id));
              collaboratorsSessionsTbody.appendChild(tr);
            });
          }

          const totalPages = Math.max(1, Math.ceil(total / collaboratorsPerPage));
          collaboratorsPagination.innerHTML = '';
          collaboratorsPagination.appendChild(document.createTextNode(\`Trang \${currentPage} / \${totalPages} (\${total} phiên)\`));
          const prevBtn = document.createElement('button');
          prevBtn.textContent = 'Trước';
          prevBtn.disabled = currentPage <= 1;
          prevBtn.style.marginLeft = '12px';
          prevBtn.addEventListener('click', () => { if (currentPage > 1) loadCollaboratorsSessions(currentPage - 1); });
          collaboratorsPagination.appendChild(prevBtn);
          const nextBtn = document.createElement('button');
          nextBtn.textContent = 'Sau';
          nextBtn.disabled = currentPage >= totalPages;
          nextBtn.style.marginLeft = '8px';
          nextBtn.addEventListener('click', () => { if (currentPage < totalPages) loadCollaboratorsSessions(currentPage + 1); });
          collaboratorsPagination.appendChild(nextBtn);
        } catch (err) {
          console.error('loadCollaboratorsSessions failed:', err);
          collaboratorsSessionsTbody.innerHTML = '<tr><td colspan="9" style="padding:20px; color:#c00;">Lỗi: ' + (err.message || '') + '</td></tr>';
        }
      };

      const showActiveContextMenu = (e, sessionId, currentActive) => {
        const existing = document.getElementById('collaborators-active-context-menu');
        if (existing) existing.remove();
        const menu = document.createElement('div');
        menu.id = 'collaborators-active-context-menu';
        menu.style.cssText = 'position:fixed; background:#fff; border:1px solid #dee2e6; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:20006; padding:4px 0; min-width:120px;';
        menu.style.left = (e.clientX + 4) + 'px';
        menu.style.top = (e.clientY + 4) + 'px';
        const label = currentActive === 1 ? 'Inactive' : 'Active';
        const newVal = currentActive === 1 ? 0 : 1;
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = 'display:block; width:100%; padding:8px 14px; border:none; background:transparent; text-align:left; cursor:pointer; font-size:13px;';
        btn.addEventListener('click', async () => {
          menu.remove();
          if (window.updateSessionActive) await window.updateSessionActive(sessionId, newVal);
          loadCollaboratorsSessions(collaboratorsCurrentPage);
        });
        menu.appendChild(btn);
        document.body.appendChild(menu);
        const closeMenu = () => {
          const m = document.getElementById('collaborators-active-context-menu');
          if (m) m.remove();
          document.removeEventListener('click', closeMenu);
          document.removeEventListener('contextmenu', closeMenu);
        };
        setTimeout(() => {
          document.addEventListener('click', closeMenu);
          document.addEventListener('contextmenu', closeMenu);
        }, 0);
      };

      const openCollaboratorsModal = async () => {
        if (!collaboratorsModal) return;
        collaboratorsModal.style.display = 'flex';
        if (collaboratorsAiToolSelect) {
          collaboratorsAiToolSelect.innerHTML = '<option value="">Tất cả</option>';
          if (window.getAiToolsList) {
            const res = await window.getAiToolsList();
            const tools = (res && res.data) ? res.data : [];
            tools.forEach((t) => {
              const opt = document.createElement('option');
              opt.value = t.code || '';
              opt.textContent = (t.toolName || t.code || '');
              collaboratorsAiToolSelect.appendChild(opt);
            });
          }
          collaboratorsAiToolSelect.value = (currentToolInfo && currentToolInfo.toolCode) ? currentToolInfo.toolCode : '';
        }
        loadCollaboratorsSessions(1);
      };

      const closeCollaboratorsModalFn = () => {
        if (collaboratorsModal) collaboratorsModal.style.display = 'none';
      };

      const collaboratorsModalPanel = document.getElementById('collaboratorsModalPanel');
      const collaboratorsModalDragHandle = document.getElementById('collaboratorsModalDragHandle');
      const collaboratorsModalResizeHandle = document.getElementById('collaboratorsModalResizeHandle');

      if (collaboratorsModalPanel && collaboratorsModalDragHandle) {
        let dragStartX = 0, dragStartY = 0, panelStartLeft = 0, panelStartTop = 0, isDragging = false;
        collaboratorsModalDragHandle.addEventListener('mousedown', (e) => {
          if (e.target && e.target.id === 'closeCollaboratorsModal') return;
          e.preventDefault();
          isDragging = true;
          const rect = collaboratorsModalPanel.getBoundingClientRect();
          panelStartLeft = rect.left;
          panelStartTop = rect.top;
          dragStartX = e.clientX;
          dragStartY = e.clientY;
          collaboratorsModalPanel.style.transform = 'none';
          collaboratorsModalPanel.style.left = panelStartLeft + 'px';
          collaboratorsModalPanel.style.top = panelStartTop + 'px';
        });
        document.addEventListener('mousemove', (e) => {
          if (!isDragging || !collaboratorsModalPanel) return;
          const dx = e.clientX - dragStartX;
          const dy = e.clientY - dragStartY;
          collaboratorsModalPanel.style.left = (panelStartLeft + dx) + 'px';
          collaboratorsModalPanel.style.top = (panelStartTop + dy) + 'px';
        });
        document.addEventListener('mouseup', () => { isDragging = false; });
      }

      if (collaboratorsModalPanel && collaboratorsModalResizeHandle) {
        let resizeStartX = 0, resizeStartY = 0, startWidth = 0, startHeight = 0, isResizing = false;
        collaboratorsModalResizeHandle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          isResizing = true;
          const rect = collaboratorsModalPanel.getBoundingClientRect();
          startWidth = rect.width;
          startHeight = rect.height;
          resizeStartX = e.clientX;
          resizeStartY = e.clientY;
        });
        document.addEventListener('mousemove', (e) => {
          if (!isResizing || !collaboratorsModalPanel) return;
          const dw = e.clientX - resizeStartX;
          const dh = e.clientY - resizeStartY;
          const newW = Math.max(400, startWidth + dw);
          const newH = Math.max(300, startHeight + dh);
          collaboratorsModalPanel.style.width = newW + 'px';
          collaboratorsModalPanel.style.height = newH + 'px';
        });
        document.addEventListener('mouseup', () => { isResizing = false; });
      }

      if (collaboratorsBtn) collaboratorsBtn.addEventListener('click', openCollaboratorsModal);
      if (closeCollaboratorsModalBtn) closeCollaboratorsModalBtn.addEventListener('click', closeCollaboratorsModalFn);
      if (collaboratorsModal) collaboratorsModal.addEventListener('click', (e) => { if (e.target === collaboratorsModal) closeCollaboratorsModalFn(); });
      if (collaboratorsFilterBtn) collaboratorsFilterBtn.addEventListener('click', () => loadCollaboratorsSessions(1));
      if (collaboratorsSearchInput) collaboratorsSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadCollaboratorsSessions(1); });
      if (collaboratorsAiToolSelect) collaboratorsAiToolSelect.addEventListener('change', () => loadCollaboratorsSessions(1));

      // Session Details dialog
      const sessionDetailsDialog = document.getElementById('sessionDetailsDialog');
      const closeSessionDetailsDialogBtn = document.getElementById('closeSessionDetailsDialog');
      const sessionDetailsMaCtv = document.getElementById('sessionDetailsMaCtv');
      const sessionDetailsTenCtv = document.getElementById('sessionDetailsTenCtv');
      const sessionDetailsDeviceId = document.getElementById('sessionDetailsDeviceId');
      const sessionDetailsDeviceInfoMore = document.getElementById('sessionDetailsDeviceInfoMore');
      const sessionDetailsDeviceInfoDetails = document.getElementById('sessionDetailsDeviceInfoDetails');
      const sessionDetailsHistoryTbody = document.getElementById('sessionDetailsHistoryTbody');
      const sessionDetailsHistorySearch = document.getElementById('sessionDetailsHistorySearch');
      const sessionDetailsHistoryPagination = document.getElementById('sessionDetailsHistoryPagination');

      let sessionDetailsCurrentSessionId = null;
      let sessionDetailsHistoryPage = 1;

      const loadSessionDetailsHistory = async (sessionId, page, search) => {
        if (!sessionDetailsHistoryTbody) return;
        sessionDetailsHistoryTbody.innerHTML = '<tr><td colspan="4" style="padding:12px;">Loading...</td></tr>';
        try {
          const res = window.getSessionProcessHistory ? await window.getSessionProcessHistory(sessionId, page || 1, 100, search || '') : { items: [], total: 0, page: 1, perPage: 100 };
          const items = res.items || [];
          const total = res.total || 0;
          const currentPage = res.page || 1;
          sessionDetailsHistoryPage = currentPage;

          if (items.length === 0) {
            sessionDetailsHistoryTbody.innerHTML = '<tr><td colspan="4" style="padding:12px;">Không có bản ghi.</td></tr>';
          } else {
            sessionDetailsHistoryTbody.innerHTML = '';
            items.forEach((row) => {
              const tr = document.createElement('tr');
              tr.innerHTML = \`
                <td style="padding:6px; border-bottom:1px solid #eee;">\${(row.my_ai_tool || '').replace(/</g, '&lt;')}</td>
                <td style="padding:6px; border-bottom:1px solid #eee;">\${(row.name || '').replace(/</g, '&lt;')}</td>
                <td style="padding:6px; border-bottom:1px solid #eee;">\${(row.description || '').replace(/</g, '&lt;')}</td>
                <td style="padding:6px; border-bottom:1px solid #eee;">\${formatGmt7(row.created_at)}</td>
              \`;
              sessionDetailsHistoryTbody.appendChild(tr);
            });
          }

          const totalPages = Math.max(1, Math.ceil(total / 100));
          sessionDetailsHistoryPagination.innerHTML = '';
          sessionDetailsHistoryPagination.appendChild(document.createTextNode(\`Trang \${currentPage} / \${totalPages}\`));
          const prevBtn = document.createElement('button');
          prevBtn.textContent = 'Trước';
          prevBtn.disabled = currentPage <= 1;
          prevBtn.style.marginLeft = '8px';
          prevBtn.addEventListener('click', () => loadSessionDetailsHistory(sessionDetailsCurrentSessionId, currentPage - 1, sessionDetailsHistorySearch ? sessionDetailsHistorySearch.value.trim() : ''));
          sessionDetailsHistoryPagination.appendChild(prevBtn);
          const nextBtn = document.createElement('button');
          nextBtn.textContent = 'Sau';
          nextBtn.disabled = currentPage >= totalPages;
          nextBtn.style.marginLeft = '4px';
          nextBtn.addEventListener('click', () => loadSessionDetailsHistory(sessionDetailsCurrentSessionId, currentPage + 1, sessionDetailsHistorySearch ? sessionDetailsHistorySearch.value.trim() : ''));
          sessionDetailsHistoryPagination.appendChild(nextBtn);
        } catch (err) {
          console.error('loadSessionDetailsHistory failed:', err);
          sessionDetailsHistoryTbody.innerHTML = '<tr><td colspan="4" style="padding:12px; color:#c00;">Lỗi</td></tr>';
        }
      };

      const openSessionDetailsDialog = async (sessionId) => {
        sessionDetailsCurrentSessionId = sessionId;
        if (!sessionDetailsDialog) return;
        sessionDetailsDialog.style.display = 'flex';
        if (sessionDetailsMaCtv) sessionDetailsMaCtv.textContent = 'Loading...';
        if (sessionDetailsTenCtv) sessionDetailsTenCtv.textContent = '';
        if (sessionDetailsDeviceId) sessionDetailsDeviceId.textContent = '';
        if (sessionDetailsDeviceInfoDetails) { sessionDetailsDeviceInfoDetails.style.display = 'none'; sessionDetailsDeviceInfoDetails.textContent = ''; }
        if (sessionDetailsDeviceInfoMore) sessionDetailsDeviceInfoMore.textContent = 'Xem chi tiết device info';
        if (window.getSessionDetails) {
          const info = await window.getSessionDetails(sessionId);
          if (info) {
            if (sessionDetailsMaCtv) sessionDetailsMaCtv.textContent = info.my_collaborator || '-';
            if (sessionDetailsTenCtv) sessionDetailsTenCtv.textContent = info.collaborator_name || '-';
            if (sessionDetailsDeviceId) sessionDetailsDeviceId.textContent = info.device_id || '-';
            const deviceInfoStr = info.device_info ? (typeof info.device_info === 'object' ? JSON.stringify(info.device_info, null, 2) : String(info.device_info)) : '';
            if (sessionDetailsDeviceInfoDetails) sessionDetailsDeviceInfoDetails.textContent = deviceInfoStr || '-';
            if (sessionDetailsDeviceInfoMore) {
              sessionDetailsDeviceInfoMore.style.display = deviceInfoStr ? 'inline' : 'none';
              sessionDetailsDeviceInfoDetails.style.display = 'none';
              sessionDetailsDeviceInfoMore.textContent = 'Xem chi tiết device info';
            }
          } else {
            if (sessionDetailsMaCtv) sessionDetailsMaCtv.textContent = '-';
            if (sessionDetailsTenCtv) sessionDetailsTenCtv.textContent = '-';
            if (sessionDetailsDeviceId) sessionDetailsDeviceId.textContent = '-';
          }
        } else {
          if (sessionDetailsMaCtv) sessionDetailsMaCtv.textContent = '-';
        }
        sessionDetailsHistoryPage = 1;
        const search = sessionDetailsHistorySearch ? sessionDetailsHistorySearch.value.trim() : '';
        await loadSessionDetailsHistory(sessionId, 1, search);
      };

      const closeSessionDetailsDialogFn = () => {
        if (sessionDetailsDialog) sessionDetailsDialog.style.display = 'none';
      };

      if (closeSessionDetailsDialogBtn) closeSessionDetailsDialogBtn.addEventListener('click', closeSessionDetailsDialogFn);
      if (sessionDetailsDialog) sessionDetailsDialog.addEventListener('click', (e) => { if (e.target === sessionDetailsDialog) closeSessionDetailsDialogFn(); });
      if (sessionDetailsDeviceInfoMore) {
        sessionDetailsDeviceInfoMore.addEventListener('click', (e) => {
          e.preventDefault();
          if (sessionDetailsDeviceInfoDetails) {
            const isVisible = sessionDetailsDeviceInfoDetails.style.display !== 'none';
            sessionDetailsDeviceInfoDetails.style.display = isVisible ? 'none' : 'block';
            sessionDetailsDeviceInfoMore.textContent = isVisible ? 'Xem chi tiết device info' : 'Ẩn chi tiết device info';
          }
        });
      }
      const sessionDetailsHistorySearchBtn = document.getElementById('sessionDetailsHistorySearchBtn');
      if (sessionDetailsHistorySearch) {
        const runHistorySearch = () => {
          if (sessionDetailsCurrentSessionId != null) loadSessionDetailsHistory(sessionDetailsCurrentSessionId, 1, sessionDetailsHistorySearch.value.trim());
        };
        sessionDetailsHistorySearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') runHistorySearch(); });
        if (sessionDetailsHistorySearchBtn) sessionDetailsHistorySearchBtn.addEventListener('click', runHistorySearch);
      }

      // Save Reminder Modal handlers
      const saveReminderModal = document.getElementById('saveReminderModal');
      const saveReminderSaveBtn = document.getElementById('saveReminderSaveBtn');
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
        console.log('🔔 [Save Reminder - Browser] User clicked "Lưu" button');
        hideSaveReminderDialog();
        if (window.handleSaveReminderResponse) {
          await window.handleSaveReminderResponse('save');
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

      // Session Conflict Modal handlers
      const sessionConflictModal = document.getElementById('sessionConflictModal');
      const conflictOkBtn = document.getElementById('conflictOkBtn');
      const conflictSessionName = document.getElementById('conflictSessionName');
      const conflictName = document.getElementById('conflictName');
      const conflictCreationTime = document.getElementById('conflictCreationTime');
      const conflictLastWorkTime = document.getElementById('conflictLastWorkTime');
      const conflictDeviceId = document.getElementById('conflictDeviceId');
      const conflictDeviceDetailsBtn = document.getElementById('conflictDeviceDetailsBtn');
      const conflictDeviceInfo = document.getElementById('conflictDeviceInfo');
      const conflictDeviceInfoContent = document.getElementById('conflictDeviceInfoContent');

      const showSessionConflictDialog = (sessionInfo) => {
        if (!sessionConflictModal) {
          console.error('sessionConflictModal not found');
          return;
        }
        console.log('⚠️ [Session Conflict] Displaying conflict dialog');
        
        if (conflictSessionName) conflictSessionName.textContent = sessionInfo.session_name || 'N/A';
        if (conflictName) conflictName.textContent = sessionInfo.name || 'Unknown';
        if (conflictCreationTime) conflictCreationTime.textContent = sessionInfo.creationTime || 'N/A';
        if (conflictLastWorkTime) conflictLastWorkTime.textContent = sessionInfo.lastWorkTime || 'N/A';
        if (conflictDeviceId) conflictDeviceId.textContent = sessionInfo.device_id || 'N/A';
        
        // Reset device info display
        if (conflictDeviceInfo) conflictDeviceInfo.style.display = 'none';
        if (conflictDeviceInfoContent) {
          conflictDeviceInfoContent.textContent = sessionInfo.device_info 
            ? JSON.stringify(sessionInfo.device_info, null, 2) 
            : 'N/A';
        }
        
        sessionConflictModal.style.display = 'flex';
      };

      const hideSessionConflictDialog = () => {
        if (sessionConflictModal) {
          sessionConflictModal.style.display = 'none';
        }
      };

      if (conflictDeviceDetailsBtn) {
        conflictDeviceDetailsBtn.addEventListener('click', () => {
          if (conflictDeviceInfo) {
            const isVisible = conflictDeviceInfo.style.display !== 'none';
            conflictDeviceInfo.style.display = isVisible ? 'none' : 'block';
            conflictDeviceDetailsBtn.textContent = isVisible ? 'Device Details' : 'Ẩn Device Details';
          }
        });
      }

      if (conflictOkBtn) {
        conflictOkBtn.addEventListener('click', () => {
          hideSessionConflictDialog();
        });
      }

      sessionConflictModal.addEventListener('click', (e) => {
        if (e.target === sessionConflictModal) {
          // Don't close on background click - require explicit button click
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sessionConflictModal.style.display === 'flex') {
          // Don't close on Escape - require explicit button click
        }
      });

      // Expose function to show conflict dialog
      window.showSessionConflictDialog = showSessionConflictDialog;

      // Reset Blocked Modal (chỉ dùng khi resetActionStep bị chặn)
      const resetBlockedModal = document.getElementById('resetBlockedModal');
      const resetBlockedMessage = document.getElementById('resetBlockedMessage');
      const resetBlockedStepList = document.getElementById('resetBlockedStepList');
      const resetBlockedOkBtn = document.getElementById('resetBlockedOkBtn');
      const showResetBlockedDialog = function(panelName, stepLines) {
        if (!resetBlockedModal) return;
        if (resetBlockedMessage) resetBlockedMessage.textContent = 'Panel "' + panelName + '" đang được sử dụng tại các step sau. Vui lòng reset hết các action đang sử dụng trước nếu thực sự cần thiết.';
        if (resetBlockedStepList) resetBlockedStepList.textContent = (stepLines && stepLines.length > 0) ? stepLines.join('\\n') : '(Không có dữ liệu)';
        resetBlockedModal.style.display = 'flex';
      };
      const hideResetBlockedDialog = function() { if (resetBlockedModal) resetBlockedModal.style.display = 'none'; };
      if (resetBlockedOkBtn) resetBlockedOkBtn.addEventListener('click', hideResetBlockedDialog);
      if (resetBlockedModal) resetBlockedModal.addEventListener('click', function(e) { if (e.target === resetBlockedModal) hideResetBlockedDialog(); });

      // Gemini Billing Error Modal handlers
      const geminiBillingErrorModal = document.getElementById('geminiBillingErrorModal');
      const geminiBillingErrorOkBtn = document.getElementById('geminiBillingErrorOkBtn');

      const showGeminiBillingErrorDialog = () => {
        if (!geminiBillingErrorModal) {
          console.error('geminiBillingErrorModal not found');
          return;
        }
        console.log('⚠️ [Gemini Billing Error] Displaying billing error dialog');
        geminiBillingErrorModal.style.display = 'flex';
      };

      const hideGeminiBillingErrorDialog = () => {
        if (geminiBillingErrorModal) {
          geminiBillingErrorModal.style.display = 'none';
        }
      };

      if (geminiBillingErrorOkBtn) {
        geminiBillingErrorOkBtn.addEventListener('click', () => {
          hideGeminiBillingErrorDialog();
        });
      }

      geminiBillingErrorModal.addEventListener('click', (e) => {
        if (e.target === geminiBillingErrorModal) {
          // Don't close on background click - require explicit button click
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && geminiBillingErrorModal.style.display === 'flex') {
          // Don't close on Escape - require explicit button click
        }
      });

      // Expose function to show billing error dialog
      window.showGeminiBillingErrorDialog = showGeminiBillingErrorDialog;

      // Panel Type Confirmation Modal handlers
      const panelTypeConfirmationModal = document.getElementById('panelTypeConfirmationModal');
      const confirmPanelTypeBtn = document.getElementById('confirmPanelTypeBtn');
      const cancelPanelTypeBtn = document.getElementById('cancelPanelTypeBtn');

      const showPanelTypeConfirmationDialog = (detectedType, fullScreenshot, imageWidth, imageHeight) => {
        if (!panelTypeConfirmationModal) {
          console.error('panelTypeConfirmationModal not found');
          return;
        }
        
        const previewImg = document.getElementById('panelTypePreviewImg');
        const typeSelect = document.getElementById('panelTypeSelect');
        const detectedValue = document.getElementById('panelTypeDetectedValue');
        
        if (!previewImg || !typeSelect || !detectedValue) {
          console.error('Panel type confirmation modal elements not found');
          return;
        }
        
        // Set image
        previewImg.src = 'data:image/png;base64,' + fullScreenshot;
        
        // Set detected type
        typeSelect.value = detectedType;
        detectedValue.textContent = detectedType;
        
        // Show modal
        panelTypeConfirmationModal.style.display = 'flex';
      };

      const hidePanelTypeConfirmationDialog = () => {
        if (panelTypeConfirmationModal) {
          panelTypeConfirmationModal.style.display = 'none';
        }
      };

      if (confirmPanelTypeBtn) {
        confirmPanelTypeBtn.addEventListener('click', async () => {
          const typeSelect = document.getElementById('panelTypeSelect');
          const selectedType = typeSelect?.value || 'screen';
          hidePanelTypeConfirmationDialog();
          
          if (window.confirmPanelType) {
            await window.confirmPanelType(selectedType);
          }
        });
      }

      if (cancelPanelTypeBtn) {
        cancelPanelTypeBtn.addEventListener('click', async () => {
          hidePanelTypeConfirmationDialog();
          
          if (window.cancelPanelType) {
            await window.cancelPanelType();
          }
        });
      }

      // Panel Completion Confirmation Modal handlers
      const panelCompletionConfirmationModal = document.getElementById('panelCompletionConfirmationModal');
      const confirmPanelCompletionBtn = document.getElementById('confirmPanelCompletionBtn');
      const cancelPanelCompletionBtn = document.getElementById('cancelPanelCompletionBtn');
      let currentCompletionPanelId = null;

      const showPanelCompletionDialog = (panelId) => {
        if (!panelCompletionConfirmationModal) {
          console.error('panelCompletionConfirmationModal not found');
          return;
        }
        // Check if dialog is already visible - prevent duplicate display
        if (panelCompletionConfirmationModal.style.display === 'flex') {
          console.log('Panel completion dialog already visible, skipping duplicate display');
          return;
        }
        currentCompletionPanelId = panelId;
        panelCompletionConfirmationModal.style.display = 'flex';
      };

      const hidePanelCompletionDialog = () => {
        if (panelCompletionConfirmationModal) {
          panelCompletionConfirmationModal.style.display = 'none';
          currentCompletionPanelId = null;
        }
      };

      if (confirmPanelCompletionBtn) {
        confirmPanelCompletionBtn.addEventListener('click', async () => {
          hidePanelCompletionDialog();
          
          if (window.confirmPanelCompletion) {
            await window.confirmPanelCompletion(currentCompletionPanelId);
          }
        });
      }

      if (cancelPanelCompletionBtn) {
        cancelPanelCompletionBtn.addEventListener('click', async () => {
          hidePanelCompletionDialog();
          
          if (window.cancelPanelCompletion) {
            await window.cancelPanelCompletion();
          }
        });
      }

      // Role Selection Modal handlers
      const roleSelectionModal = document.getElementById('roleSelectionModal');
      console.log('📋 [DEBUG] roleSelectionModal element:', roleSelectionModal);
      const roleDrawBtn = document.getElementById('roleDrawBtn');
      const roleValidateBtn = document.getElementById('roleValidateBtn');
      const recorderNameInput = document.getElementById('recorderNameInput');
      const nameError = document.getElementById('nameError');
      const nameInputSection = document.getElementById('nameInputSection');
      const currentNameDisplay = document.getElementById('currentNameDisplay');
      const currentNameText = document.getElementById('currentNameText');
      const changeNameBtn = document.getElementById('changeNameBtn');
      const deviceIdText = document.getElementById('deviceIdText');
      const copyDeviceIdBtn = document.getElementById('copyDeviceIdBtn');
      const currentNameViewMode = document.getElementById('currentNameViewMode');
      const currentNameEditMode = document.getElementById('currentNameEditMode');
      const editNameInput = document.getElementById('editNameInput');

      let currentAccountInfo = null;
      let isEditingName = false;
      let currentDeviceId = '';
      let currentRole = 'DRAW'; // Track current role for panel_selected handler
      let currentToolInfo = null; // { toolCode, toolName, website } when ADMIN/VALIDATE has a tool open

      // Function to update button visibility based on role
      const updateButtonsVisibility = (role) => {
        const drawGroup = document.getElementById('controls-draw-group');
        const adminGroup = document.getElementById('controls-admin-validate-group');
        const quitBtn = document.getElementById('quitBtn');
        const graphRaiseBugBtn = document.getElementById('graphRaiseBugBtn');
        const videoValidationRaiseBugBtn = document.getElementById('videoValidationRaiseBugBtn');
        const aiToolsBtn = document.getElementById('aiToolsBtn');
        const randomlyAssignBtn = document.getElementById('randomlyAssignBtn');
        const collaboratorsBtn = document.getElementById('collaboratorsBtn');

        // RaiseBug: ẩn khi role=DRAW, hiện khi role<>DRAW (viewGraph + video validation)
        const showRaiseBug = (role !== 'DRAW');
        if (graphRaiseBugBtn) graphRaiseBugBtn.style.display = showRaiseBug ? 'flex' : 'none';
        if (videoValidationRaiseBugBtn) videoValidationRaiseBugBtn.style.display = showRaiseBug ? 'flex' : 'none';

        if (role === 'VALIDATE' || role === 'ADMIN') {
          if (drawGroup) drawGroup.style.display = 'none';
          if (adminGroup) adminGroup.style.display = 'flex';
          if (quitBtn) quitBtn.style.display = 'inline-block';
          if (aiToolsBtn) aiToolsBtn.style.display = 'inline-block';
          if (randomlyAssignBtn) randomlyAssignBtn.style.display = (role === 'ADMIN') ? 'inline-block' : 'none';
          if (collaboratorsBtn) collaboratorsBtn.style.display = (role === 'ADMIN') ? 'inline-block' : 'none';
        } else {
          if (drawGroup) drawGroup.style.display = 'flex';
          if (adminGroup) adminGroup.style.display = 'none';
          if (quitBtn) quitBtn.style.display = 'inline-block';
          const importCookiesBtn = document.getElementById('importCookiesBtn');
          const drawPanelAndDetectActionsBtn = document.getElementById('drawPanelAndDetectActionsBtn');
          const saveBtn = document.getElementById('saveBtn');
          const checkpointBtn = document.getElementById('checkpointBtn');
          const viewGraphBtn = document.getElementById('viewGraphBtn');
          const validateBtn = document.getElementById('validateBtn');
          if (importCookiesBtn) importCookiesBtn.style.display = 'inline-block';
          if (drawPanelAndDetectActionsBtn) drawPanelAndDetectActionsBtn.style.display = 'none';
          if (saveBtn) saveBtn.style.display = 'inline-block';
          if (checkpointBtn) checkpointBtn.style.display = 'inline-block';
          if (viewGraphBtn) viewGraphBtn.style.display = 'flex';
          if (validateBtn) validateBtn.style.display = 'inline-block';
          if (aiToolsBtn) aiToolsBtn.style.display = 'none';
          if (randomlyAssignBtn) randomlyAssignBtn.style.display = 'none';
          if (collaboratorsBtn) collaboratorsBtn.style.display = 'none';
        }
        // Recreate Tracking Video: only show for DRAW, hide for ADMIN/VALIDATE
        const videoValidationRecreateTrackingBtn = document.getElementById('videoValidationRecreateTrackingBtn');
        if (videoValidationRecreateTrackingBtn) {
          videoValidationRecreateTrackingBtn.style.display = (role === 'DRAW') ? 'inline-block' : 'none';
        }
        if (typeof updateControlsCurrentToolDisplay === 'function') updateControlsCurrentToolDisplay();
      };

      const updateControlsCurrentToolDisplay = () => {
        const el = document.getElementById('controls-current-tool');
        if (!el) return;
        const show = (currentRole === 'ADMIN' || currentRole === 'VALIDATE') && currentToolInfo;
        if (!show) {
          el.style.display = 'none';
          return;
        }
        const name = currentToolInfo.toolName || currentToolInfo.toolCode;
        const website = currentToolInfo.website || '';
        if (website) {
          el.innerHTML = '<a href="' + website.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener" style="color:#6a1b9a; text-decoration:none; font-weight:600;">' + escapeHtml(name) + '</a>';
          el.title = name + ' – ' + website;
        } else {
          el.textContent = name;
          el.title = name;
        }
        el.style.display = 'inline-flex';
      };

      const escapeHtml = (s) => {
        if (!s) return '';
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
      };

      const showRoleSelectionDialog = async (accountInfo) => {
        console.log('📋 [DEBUG] showRoleSelectionDialog called, roleSelectionModal:', roleSelectionModal);
        if (!roleSelectionModal) {
          console.error('❌ roleSelectionModal not found');
          return;
        }
        console.log('📋 Showing role selection dialog with account info:', accountInfo);
        
        currentAccountInfo = accountInfo;
        
        // Display full device ID
        if (deviceIdText && accountInfo && accountInfo.device_id) {
          currentDeviceId = accountInfo.device_id;
          deviceIdText.textContent = 'Device ID: ' + accountInfo.device_id;
        }
        
        // Get default name from device_info if name is empty
        let displayName = accountInfo?.name;
        
        if (!displayName && accountInfo?.device_info?.hostname) {
          displayName = accountInfo.device_info.hostname;
        }
        
        // Check if user already has a name
        if (displayName && !isEditingName) {
          // Show current name display, hide input section
          if (nameInputSection) nameInputSection.style.display = 'none';
          if (currentNameDisplay) {
            currentNameDisplay.style.display = 'block';
            if (currentNameText) currentNameText.textContent = displayName;
            // Reset edit mode UI
            if (currentNameViewMode) currentNameViewMode.style.display = 'block';
            if (currentNameEditMode) currentNameEditMode.style.display = 'none';
            if (changeNameBtn) {
              changeNameBtn.innerHTML = '✏️ Đổi tên';
            }
          }
        } else {
          // Show input section, hide current name display
          if (nameInputSection) nameInputSection.style.display = 'block';
          if (currentNameDisplay) currentNameDisplay.style.display = 'none';
          if (recorderNameInput) {
            recorderNameInput.value = displayName || '';
          }
        }
        
        // Update button visibility if role already exists
        if (accountInfo && accountInfo.role) {
          currentRole = accountInfo.role;
          updateButtonsVisibility(accountInfo.role);
          updateMyAssignmentCheckboxVisibility();
          // Default showMode by role when no saved preference: DRAW=log, other=validation
          if (!getLocalStorage('panel-log-display-mode')) {
            panelLogDisplayMode = (currentRole === 'DRAW') ? 'log' : 'validation';
            setLocalStorage('panel-log-display-mode', panelLogDisplayMode);
            window.panelLogDisplayMode = panelLogDisplayMode;
            updateShowModeButton();
          }
        }

        // ADMIN and VALIDATE: load and show ai_tools list so they can pick tool -> view tool -> panel log + content (không mở tracking browser)
        if (accountInfo && (accountInfo.role === 'ADMIN' || accountInfo.role === 'VALIDATE') && typeof window.getAiToolsList === 'function') {
          window.getAiToolsList().then((res) => {
            if (res && res.success && res.data && res.data.length) {
              showAdminAiToolsList(res.data);
            }
          }).catch(() => {});
        }
        
        roleSelectionModal.style.display = 'flex';
      };

      // Mở queue tracker → hiện select_role_dialog ngay (không phụ thuộc WebSocket/broadcast)
      (function tryShowRoleDialog() {
        if (typeof window.getAccountInfo !== 'function') {
          setTimeout(tryShowRoleDialog, 80);
          return;
        }
        window.getAccountInfo().then(function (res) {
          const accountInfo = res && (res.data !== undefined ? res.data : res);
          if (typeof showRoleSelectionDialog === 'function' && roleSelectionModal) {
            showRoleSelectionDialog(accountInfo);
          }
        }).catch(function () {
          setTimeout(tryShowRoleDialog, 200);
        });
      })();

      const hideRoleSelectionDialog = () => {
        if (roleSelectionModal) {
          console.log('Hiding role selection dialog');
          roleSelectionModal.style.display = 'none';
          isEditingName = false;
          currentToolInfo = null;
          if (typeof updateControlsCurrentToolDisplay === 'function') updateControlsCurrentToolDisplay();
          
          // Reset edit mode UI
          if (currentNameViewMode) currentNameViewMode.style.display = 'block';
          if (currentNameEditMode) currentNameEditMode.style.display = 'none';
          if (changeNameBtn) {
            changeNameBtn.innerHTML = '✏️ Đổi tên';
            changeNameBtn.style.background = '#fff';
            changeNameBtn.style.color = '';
            changeNameBtn.style.borderColor = '#ddd';
          }
        }
      };

      const adminAiToolsSidebar = document.getElementById('admin-ai-tools-sidebar');
      const adminAiToolsListEl = document.getElementById('admin-ai-tools-list');
      const adminAiToolsFilterInput = document.getElementById('admin-ai-tools-filter');
      let adminAiToolsFullList = [];

      const renderAdminAiToolsFiltered = (filterText) => {
        if (!adminAiToolsListEl) return;
        const q = (filterText || '').trim().toLowerCase();
        const filtered = q
          ? adminAiToolsFullList.filter((t) => {
              const name = (t.toolName || t.code || '').toLowerCase();
              const code = (t.code || '').toLowerCase();
              const website = (t.website || '').toLowerCase();
              return name.includes(q) || code.includes(q) || website.includes(q);
            })
          : adminAiToolsFullList;
        adminAiToolsListEl.innerHTML = '';
        if (filtered.length === 0) {
          adminAiToolsListEl.innerHTML = '<div style="padding:12px; color:#6c757d; font-size:12px;">' + (q ? 'Không có kết quả phù hợp' : 'Chưa có ai_tool nào') + '</div>';
          return;
        }
        const viewIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:8px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        filtered.forEach((t) => {
          const item = document.createElement('div');
          const isSelected = currentToolInfo && t.code === currentToolInfo.toolCode;
          item.style.cssText = 'padding:10px 12px; margin-bottom:4px; background:#fff; border:1px solid #e9ecef; border-radius:8px; cursor:pointer; font-size:12px; color:#495057; transition:background 0.2s ease; position:relative;';
          if (isSelected) item.classList.add('admin-ai-tool-item-selected');
          item.textContent = t.toolName || t.code || t.website;
          item.title = (t.toolName || t.code) + (t.website ? ' - ' + t.website : '');
          item.dataset.toolCode = t.code;
          const showToolContextMenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const existing = document.getElementById('admin-ai-tool-context-menu');
            if (existing) existing.remove();
            const menu = document.createElement('div');
            menu.id = 'admin-ai-tool-context-menu';
            menu.style.cssText = 'position:fixed; background:#fff; border:1px solid #dee2e6; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.15); z-index:20010; padding:4px 0; min-width:160px;';
            const x = e.clientX;
            const y = e.clientY;
            const gap = 4;
            menu.style.left = x + gap + 'px';
            menu.style.top = y + gap + 'px';
            const viewToolBtn = document.createElement('button');
            viewToolBtn.style.cssText = 'display:flex; align-items:center; width:100%; padding:10px 14px; border:none; background:transparent; color:#495057; text-align:left; cursor:pointer; font-size:13px; border-radius:4px; box-sizing:border-box;';
            viewToolBtn.innerHTML = viewIconSvg + '<span>View tool</span>';
            viewToolBtn.addEventListener('mouseenter', () => { viewToolBtn.style.background = '#f8f9fa'; });
            viewToolBtn.addEventListener('mouseleave', () => { viewToolBtn.style.background = 'transparent'; });
            viewToolBtn.addEventListener('click', async (ev) => {
              ev.stopPropagation();
              menu.remove();
              if (typeof window.adminOpenOrCreateSession !== 'function') return;
              item.style.opacity = '0.7';
              item.style.pointerEvents = 'none';
              try {
                const res = await window.adminOpenOrCreateSession(t.code);
                if (res && !res.success && res.error) {
                  if (window.broadcastToast) window.broadcastToast(res.error, 'error');
                }
              } finally {
                item.style.opacity = '';
                item.style.pointerEvents = '';
              }
            });
            menu.appendChild(viewToolBtn);
            document.body.appendChild(menu);
            const closeMenu = () => {
              const m = document.getElementById('admin-ai-tool-context-menu');
              if (m) m.remove();
              document.removeEventListener('click', closeMenu);
              document.removeEventListener('contextmenu', closeMenu);
            };
            setTimeout(() => {
              document.addEventListener('click', closeMenu);
              document.addEventListener('contextmenu', closeMenu);
            }, 0);
          };
          item.addEventListener('click', showToolContextMenu);
          item.addEventListener('contextmenu', showToolContextMenu);
          item.addEventListener('mouseenter', () => { if (!item.classList.contains('admin-ai-tool-item-selected')) item.style.background = '#e9ecef'; });
          item.addEventListener('mouseleave', () => { if (!item.classList.contains('admin-ai-tool-item-selected')) item.style.background = '#fff'; });
          adminAiToolsListEl.appendChild(item);
        });
      };

      const showAdminAiToolsList = (tools) => {
        if (!adminAiToolsSidebar || !adminAiToolsListEl) return;
        adminAiToolsFullList = Array.isArray(tools) ? tools : [];
        if (adminAiToolsFilterInput) adminAiToolsFilterInput.value = '';
        renderAdminAiToolsFiltered('');
        adminAiToolsSidebar.style.display = 'flex';
        adminAiToolsSidebar.style.flexDirection = 'column';
      };

      const hideAdminAiToolsList = () => {
        if (adminAiToolsSidebar) adminAiToolsSidebar.style.display = 'none';
        const menu = document.getElementById('admin-ai-tool-context-menu');
        if (menu) menu.remove();
      };

      const toggleAdminAiToolsSidebar = async () => {
        if (adminAiToolsSidebar.style.display === 'flex') {
          hideAdminAiToolsList();
          return;
        }
        if (adminAiToolsFullList.length === 0 && typeof window.getAiToolsList === 'function') {
          try {
            const res = await window.getAiToolsList();
            if (res && res.success && res.data) showAdminAiToolsList(res.data);
            else showAdminAiToolsList([]);
          } catch (_) {
            showAdminAiToolsList([]);
          }
        } else {
          adminAiToolsSidebar.style.display = 'flex';
          adminAiToolsSidebar.style.flexDirection = 'column';
          renderAdminAiToolsFiltered(adminAiToolsFilterInput ? adminAiToolsFilterInput.value : '');
        }
      };

      if (adminAiToolsFilterInput) {
        adminAiToolsFilterInput.addEventListener('input', () => {
          renderAdminAiToolsFiltered(adminAiToolsFilterInput.value);
        });
      }
      const adminAiToolsCloseBtn = document.getElementById('admin-ai-tools-close-btn');
      if (adminAiToolsCloseBtn) {
        adminAiToolsCloseBtn.addEventListener('click', () => hideAdminAiToolsList());
      }
      const aiToolsBtn = document.getElementById('aiToolsBtn');
      if (aiToolsBtn) {
        aiToolsBtn.addEventListener('click', () => toggleAdminAiToolsSidebar());
      }

      const randomlyAssignBtn = document.getElementById('randomlyAssignBtn');
      if (randomlyAssignBtn) {
        randomlyAssignBtn.addEventListener('click', async () => {
          if (!currentToolInfo) {
            showToast('Chọn AI Tool trước');
            return;
          }
          const getUnassigned = typeof window.getUnassignedSessions === 'function' ? window.getUnassignedSessions : null;
          if (!getUnassigned) {
            showToast('API không sẵn sàng');
            return;
          }
          const res = await getUnassigned();
          if (!res || !res.success || !res.data || res.data.length === 0) {
            showToast('Không có session nào chưa có assignee');
            return;
          }
          openRandomlyAssignModal();
        });
      }

      async function openRandomlyAssignModal() {
        const modal = document.getElementById('randomlyAssignModal');
        const listEl = document.getElementById('randomlyAssignList');
        const filterInput = document.getElementById('randomlyAssignFilter');
        const assignBtn = document.getElementById('randomlyAssignAssignBtn');
        const cancelBtn = document.getElementById('randomlyAssignCancelBtn');
        const sessionCountEl = document.getElementById('randomlyAssignSessionCount');
        if (!modal || !listEl) return;
        filterInput.value = '';
        const getUnassigned = typeof window.getUnassignedSessions === 'function' ? window.getUnassignedSessions : null;
        const unassignedRes = getUnassigned ? await getUnassigned() : null;
        const unassignedCount = (unassignedRes && unassignedRes.success && unassignedRes.data) ? unassignedRes.data.length : 0;
        if (sessionCountEl) {
          sessionCountEl.textContent = unassignedCount + ' session(s) chưa có assignee. Chọn CTV để gán tuần tự.';
        }
        const selectedCodes = [];
        const renderList = async (filter) => {
          const getList = typeof window.getCollaboratorsList === 'function' ? window.getCollaboratorsList : null;
          if (!getList) { listEl.innerHTML = '<div style="padding:12px; color:#666;">Không có API</div>'; return; }
          const collaborators = await getList(filter && filter.trim() ? filter.trim() : undefined);
          listEl.innerHTML = '';
          if (!collaborators || collaborators.length === 0) {
            listEl.innerHTML = '<div style="padding:12px; color:#666;">Không có CTV</div>';
            return;
          }
          collaborators.forEach(c => {
            const row = document.createElement('label');
            row.style.cssText = 'padding:10px 12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; align-items:center; gap:10px; margin:0;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.setAttribute('data-code', c.code);
            const idx = selectedCodes.indexOf(c.code);
            if (idx >= 0) cb.checked = true;
            cb.addEventListener('change', () => {
              if (cb.checked) { if (selectedCodes.indexOf(c.code) < 0) selectedCodes.push(c.code); }
              else { const i = selectedCodes.indexOf(c.code); if (i >= 0) selectedCodes.splice(i, 1); }
            });
            row.appendChild(cb);
            row.appendChild(document.createTextNode((c.name || c.code || '') + ' (' + (c.code || '') + ')'));
            listEl.appendChild(row);
          });
        };
        await renderList('');
        filterInput.oninput = () => { renderList(filterInput.value); };
        assignBtn.onclick = async () => {
          if (selectedCodes.length === 0) { showToast('Chọn ít nhất 1 CTV'); return; }
          if (typeof window.randomlyAssignSessions === 'function') {
            await window.randomlyAssignSessions(selectedCodes);
            modal.style.display = 'none';
            if (window.getPanelTree) {
              const data = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(panelLogDisplayMode) : window.getPanelTree(panelLogDisplayMode));
              panelTreeData = data || []; renderPanelTree();
            }
            showToast('Đã gán xong');
          } else {
            showToast('API không sẵn sàng');
          }
        };
        cancelBtn.onclick = () => { modal.style.display = 'none'; };
        modal.style.display = 'flex';
      }

      (function setupAdminAiToolsResizer() {
        const sidebar = document.getElementById('admin-ai-tools-sidebar');
        const resizer = document.getElementById('admin-ai-tools-resizer');
        if (!sidebar || !resizer) return;
        const MIN_WIDTH = 180;
        const MAX_WIDTH = 520;
        let aiToolsResizing = false;
        let aiToolsStartX = 0;
        let aiToolsStartWidth = 0;
        try {
          const saved = localStorage.getItem('admin-ai-tools-sidebar-width');
          if (saved) {
            const w = parseInt(saved, 10);
            if (w >= MIN_WIDTH && w <= MAX_WIDTH) sidebar.style.width = w + 'px';
          }
        } catch (_) {}
        const onMove = (e) => {
          if (!aiToolsResizing) return;
          const diff = e.clientX - aiToolsStartX;
          let newWidth = aiToolsStartWidth + diff;
          newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
          sidebar.style.width = newWidth + 'px';
        };
        const onUp = () => {
          if (!aiToolsResizing) return;
          aiToolsResizing = false;
          resizer.classList.remove('resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          try {
            localStorage.setItem('admin-ai-tools-sidebar-width', String(sidebar.offsetWidth));
          } catch (_) {}
        };
        resizer.addEventListener('mousedown', (e) => {
          aiToolsResizing = true;
          aiToolsStartX = e.clientX;
          aiToolsStartWidth = sidebar.offsetWidth;
          resizer.classList.add('resizing');
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
          e.preventDefault();
        });
      })();

      // Change name button handler - toggles between edit mode and view mode
      if (changeNameBtn) {
        changeNameBtn.addEventListener('click', async () => {
          if (!isEditingName) {
            // Switch to edit mode
            isEditingName = true;
            if (currentNameViewMode) currentNameViewMode.style.display = 'none';
            if (currentNameEditMode) currentNameEditMode.style.display = 'block';
            changeNameBtn.innerHTML = '✓ Hoàn thành';
            changeNameBtn.style.background = '#28a745';
            changeNameBtn.style.color = '#fff';
            changeNameBtn.style.borderColor = '#28a745';
            
            // Get current display name
            let currentName = currentAccountInfo?.name;
            if (!currentName && currentAccountInfo?.device_info?.hostname) {
              currentName = currentAccountInfo.device_info.hostname;
            }
            if (editNameInput) {
              editNameInput.value = currentName || '';
              editNameInput.focus();
              editNameInput.select();
            }
          } else {
            // Complete editing - save the new name
            const newName = editNameInput ? editNameInput.value.trim() : '';
            if (!newName) {
              if (editNameInput) {
                editNameInput.style.borderColor = '#dc3545';
                editNameInput.focus();
              }
              return;
            }
            
            // Update the display name
            if (currentNameText) currentNameText.textContent = newName;
            
            // Switch back to view mode
            isEditingName = false;
            if (currentNameViewMode) currentNameViewMode.style.display = 'block';
            if (currentNameEditMode) currentNameEditMode.style.display = 'none';
            changeNameBtn.innerHTML = '✏️ Đổi tên';
            changeNameBtn.style.background = '#fff';
            changeNameBtn.style.color = '';
            changeNameBtn.style.borderColor = '#ddd';
            
            // Update currentAccountInfo with new name
            if (currentAccountInfo) {
              currentAccountInfo.name = newName;
            }
          }
        });
      }
      
      // Copy device ID button handler
      if (copyDeviceIdBtn) {
        copyDeviceIdBtn.addEventListener('click', async () => {
          if (currentDeviceId) {
            try {
              // Try modern clipboard API first
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(currentDeviceId);
              } else {
                // Fallback for environments where clipboard API is not available
                const textArea = document.createElement('textarea');
                textArea.value = currentDeviceId;
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                textArea.style.top = '-9999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
              }
              
              const originalText = copyDeviceIdBtn.innerHTML;
              copyDeviceIdBtn.innerHTML = '✓ Copied!';
              copyDeviceIdBtn.style.background = '#28a745';
              copyDeviceIdBtn.style.color = '#fff';
              copyDeviceIdBtn.style.borderColor = '#28a745';
              setTimeout(() => {
                copyDeviceIdBtn.innerHTML = originalText;
                copyDeviceIdBtn.style.background = '#fff';
                copyDeviceIdBtn.style.color = '';
                copyDeviceIdBtn.style.borderColor = '#ddd';
              }, 1500);
            } catch (err) {
              console.error('Failed to copy device ID:', err);
              // Show error feedback
              copyDeviceIdBtn.innerHTML = '❌ Failed';
              setTimeout(() => {
                copyDeviceIdBtn.innerHTML = '📋 Copy';
              }, 1500);
            }
          }
        });
      }

      // Name input validation
      if (recorderNameInput) {
        recorderNameInput.addEventListener('input', () => {
          if (nameError) nameError.style.display = 'none';
          recorderNameInput.style.borderColor = '#ddd';
        });
        
        recorderNameInput.addEventListener('focus', () => {
          recorderNameInput.style.borderColor = '#007bff';
        });
        
        recorderNameInput.addEventListener('blur', () => {
          recorderNameInput.style.borderColor = '#ddd';
        });
      }

      const validateAndSaveRole = async (role) => {
        // Get name from input or existing account
        let name = '';
        
        if (nameInputSection && nameInputSection.style.display !== 'none') {
          // User is entering/editing name via initial input section
          name = recorderNameInput ? recorderNameInput.value.trim() : '';
          
          if (!name) {
            // Show error
            if (nameError) nameError.style.display = 'block';
            if (recorderNameInput) {
              recorderNameInput.style.borderColor = '#dc3545';
              recorderNameInput.focus();
            }
            return false;
          }
        } else if (currentNameDisplay && currentNameDisplay.style.display !== 'none') {
          // Use name from currentNameDisplay (either existing or edited)
          if (isEditingName && editNameInput) {
            // Currently editing, get from edit input
            name = editNameInput.value.trim();
            if (!name) {
              if (editNameInput) {
                editNameInput.style.borderColor = '#dc3545';
                editNameInput.focus();
              }
              return false;
            }
          } else if (currentAccountInfo && currentAccountInfo.name) {
            // Use existing/updated name from account info
            name = currentAccountInfo.name;
          } else if (currentAccountInfo?.device_info?.hostname) {
            // Fall back to hostname
            name = currentAccountInfo.device_info.hostname;
          }
        } else if (currentAccountInfo && currentAccountInfo.name) {
          // Use existing name
          name = currentAccountInfo.name;
        } else if (currentAccountInfo?.device_info?.hostname) {
          // Fall back to hostname as default
          name = currentAccountInfo.device_info.hostname;
        }
        
        if (!name) {
          // No name available
          if (nameError) nameError.style.display = 'block';
          if (nameInputSection) nameInputSection.style.display = 'block';
          if (currentNameDisplay) currentNameDisplay.style.display = 'none';
          if (recorderNameInput) {
            recorderNameInput.focus();
          }
          return false;
        }
        
        console.log('User selected ' + role + ' role with name: ' + name);
        hideRoleSelectionDialog();
        
        if (window.saveAccountInfo) {
          await window.saveAccountInfo(role, name);
        }
        
        // Update button visibility based on role
        updateButtonsVisibility(role);
        
        // Update currentRole for panel_selected handler
        currentRole = role;
        updateMyAssignmentCheckboxVisibility();
        // Default showMode by role when no saved preference: DRAW=log, other=validation
        if (!getLocalStorage('panel-log-display-mode')) {
          panelLogDisplayMode = (role === 'DRAW') ? 'log' : 'validation';
          setLocalStorage('panel-log-display-mode', panelLogDisplayMode);
          window.panelLogDisplayMode = panelLogDisplayMode;
          updateShowModeButton();
        }
        
        return true;
      };

      if (roleDrawBtn) {
        roleDrawBtn.addEventListener('click', async () => {
          await validateAndSaveRole('DRAW');
        });
      }

      if (roleValidateBtn) {
        roleValidateBtn.addEventListener('click', async () => {
          await validateAndSaveRole('VALIDATE');
        });
      }

      const roleAdminBtn = document.getElementById('roleAdminBtn');
      const adminPasswordModal = document.getElementById('adminPasswordModal');
      const adminPasswordInput = document.getElementById('adminPasswordInput');
      const adminPasswordError = document.getElementById('adminPasswordError');
      const adminPasswordOkBtn = document.getElementById('adminPasswordOkBtn');
      const adminPasswordCancelBtn = document.getElementById('adminPasswordCancelBtn');

      const adminPasswordShowCheckbox = document.getElementById('adminPasswordShowCheckbox');
      if (adminPasswordShowCheckbox && adminPasswordInput) {
        adminPasswordShowCheckbox.addEventListener('change', () => {
          adminPasswordInput.type = adminPasswordShowCheckbox.checked ? 'text' : 'password';
        });
      }

      const showAdminPasswordModal = () => {
        if (adminPasswordModal) {
          adminPasswordModal.style.display = 'flex';
          if (adminPasswordInput) {
            adminPasswordInput.value = '';
            adminPasswordInput.type = 'text';
            adminPasswordInput.focus();
          }
          if (adminPasswordShowCheckbox) adminPasswordShowCheckbox.checked = true;
          if (adminPasswordError) adminPasswordError.style.display = 'none';
        }
      };

      const hideAdminPasswordModal = () => {
        if (adminPasswordModal) adminPasswordModal.style.display = 'none';
      };

      if (roleAdminBtn) {
        roleAdminBtn.addEventListener('click', () => {
          showAdminPasswordModal();
        });
      }

      if (adminPasswordOkBtn && adminPasswordInput) {
        const tryAdminLogin = async () => {
          const pass = adminPasswordInput.value.trim();
          if (!pass) {
            if (adminPasswordError) {
              adminPasswordError.textContent = 'Vui lòng nhập mật khẩu';
              adminPasswordError.style.display = 'block';
            }
            return;
          }
          if (!window.validateAdminPassword) {
            if (adminPasswordError) {
              adminPasswordError.textContent = 'Lỗi xác thực';
              adminPasswordError.style.display = 'block';
            }
            return;
          }
          const ok = await window.validateAdminPassword(pass);
          if (ok) {
            hideAdminPasswordModal();
            await validateAndSaveRole('ADMIN');
          } else {
            if (adminPasswordError) {
              adminPasswordError.textContent = 'Mật khẩu không đúng';
              adminPasswordError.style.display = 'block';
            }
            adminPasswordInput.value = '';
            adminPasswordInput.focus();
          }
        };
        adminPasswordOkBtn.addEventListener('click', tryAdminLogin);
        adminPasswordInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') tryAdminLogin();
        });
      }

      if (adminPasswordCancelBtn) {
        adminPasswordCancelBtn.addEventListener('click', () => {
          hideAdminPasswordModal();
        });
      }

      // Loading Modal handlers
      const loadingModal = document.getElementById('loadingModal');
      const loadingModalMessage = document.getElementById('loadingModalMessage');

      const showLoadingModal = (message) => {
        if (!loadingModal) {
          console.error('loadingModal not found');
          return;
        }
        if (loadingModalMessage && message) {
          loadingModalMessage.textContent = message;
        }
        loadingModal.style.display = 'flex';
      };

      const hideLoadingModal = () => {
        if (loadingModal) {
          loadingModal.style.display = 'none';
        }
      };

      document.addEventListener("keydown", async (e) => {
        if (e.key === "Escape") {
          if (sessionDetailsDialog && sessionDetailsDialog.style.display === 'flex') {
            closeSessionDetailsDialogFn();
            return;
          }
          if (collaboratorsModal && collaboratorsModal.style.display === 'flex') {
            closeCollaboratorsModalFn();
            return;
          }
          if (checkpointModal.style.display === 'flex') {
            closeCheckpointModalFn();
            return;
          }
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
                            'Xóa panel này khỏi tree? Panel con sẽ được giữ lại.';
          
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
        let showEmptyMyAssignment = false;
        try {
          const role = currentRole || 'DRAW';
          showEmptyMyAssignment = panelLogDisplayMode === 'validation' && myAssignmentFilterEnabled && role === 'VALIDATE' && (!panelTreeData || panelTreeData.length === 0);
        } catch (e) { /* currentRole not defined yet */ }
        if (showEmptyMyAssignment) {
          const emptyDiv = document.createElement('div');
          emptyDiv.style.cssText = 'padding:24px 16px; text-align:center; color:#9e9e9e; font-size:14px;';
          emptyDiv.textContent = 'Bạn chưa được gán session nào!';
          treeContainer.appendChild(emptyDiv);
        } else {
          panelTreeData.forEach(node => {
            treeContainer.appendChild(createTreeNode(node, 0));
          });
        }
      }
      
      function createTreeNode(node, depth) {
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'tree-node';
        const expandKey = node.panel_id != null ? node.panel_id : (node.type + ':' + (node.name || '').replace(/\s/g, '_'));
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'tree-node-content';
        if (node.panel_id != null) {
          contentDiv.setAttribute('data-panel-id', node.panel_id);
        }
        if (node.panel_id && selectedPanelId === node.panel_id) {
          contentDiv.classList.add('selected');
        }
        if (node.type === 'session') {
          if (currentRole === 'ADMIN' && node.assignee) {
            contentDiv.classList.add('session-has-assignee');
          }
          if (currentRole === 'VALIDATE' && node.assignee && currentAccountInfo && node.assignee === currentAccountInfo.collaborator_code) {
            contentDiv.classList.add('session-assigned-to-me');
          }
        }
        
        // Add padding-left for child panels (20px per level)
        if (depth > 0) {
          contentDiv.style.paddingLeft = (20 * depth) + 'px';
        }
        
        const expandIcon = document.createElement('span');
        expandIcon.className = 'tree-expand';
        if (node.children && node.children.length > 0) {
          expandIcon.textContent = '▶';
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
        let useIconInsteadOfDot = false;
        let validationIcon = '';
        
        if (node.item_category === 'PANEL') {
          // Check if panel is incomplete
          const isIncomplete = node.draw_flow_state !== null && 
                              node.draw_flow_state !== undefined && 
                              node.draw_flow_state !== 'completed';
          // Panel icons: màu vàng/cam nếu chưa hoàn tất, xanh lục nếu đã hoàn tất
          dotColor = isIncomplete ? '#ff9800' : '#4caf50';
        } else if (node.item_category === 'ACTION') {
          // Action icons: đỏ nếu có intersection, xanh nếu không
          const hasIntersections = node.hasIntersections || false;
          dotColor = hasIntersections ? '#ff4444' : '#00aaff';
        } else if (node.type === 'day') {
          // Day nodes: calendar icon in orange
          useIconInsteadOfDot = true;
          validationIcon = '📅';
          dotColor = '#ff9800';
        } else if (node.type === 'session') {
          // Session nodes: clock icon in orange
          useIconInsteadOfDot = true;
          validationIcon = '🕘';
          dotColor = '#ff9800';
        } else if (node.type === 'scene') {
          // Scene nodes: movie clapper icon in orange
          useIconInsteadOfDot = true;
          validationIcon = '🎬';
          dotColor = '#ff9800';
        } else {
          // Other validation tree nodes (snapshot)
          dotColor = '#9e9e9e';
        }
        
        let originalDotHTML;
        if (useIconInsteadOfDot) {
          // Use icon for day/session/scene nodes with margin-right for spacing
          originalDotHTML = '<span style="font-size: 14px; color: ' + dotColor + '; margin-right: 4px;">' + validationIcon + '</span>';
        } else if (node.status === 'completed') {
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
        
        // Check if panel is incomplete (draw_flow_state is not null and not 'completed')
        const isIncomplete = node.item_category === 'PANEL' && 
                            node.draw_flow_state !== null && 
                            node.draw_flow_state !== undefined && 
                            node.draw_flow_state !== 'completed';
        
        if (isIncomplete) {
          // Add warning icon before name
          const warningIcon = document.createElement('span');
          warningIcon.textContent = '⚠️ ';
          warningIcon.style.marginRight = '4px';
          label.appendChild(warningIcon);
        }
        
        const nameText = document.createTextNode(node.name || 'Item');
        label.appendChild(nameText);
        
        // Validation mode: show view count (only ADMIN role) after action name, only if > 0
        if (node.item_category === 'ACTION' && node.view_count !== undefined && node.view_count > 0 && currentRole === 'ADMIN') {
          const viewCountSpan = document.createElement('span');
          viewCountSpan.style.marginLeft = '6px';
          viewCountSpan.style.display = 'inline-flex';
          viewCountSpan.style.alignItems = 'center';
          viewCountSpan.style.gap = '4px';
          viewCountSpan.style.fontSize = '12px';
          viewCountSpan.style.color = '#9e9e9e';
          viewCountSpan.style.cursor = 'help';
          const count = node.view_count ?? 0;
          viewCountSpan.appendChild(document.createTextNode('👁️‍🗨️ ' + String(count)));
          viewCountSpan.addEventListener('mouseenter', (ev) => { showViewersTooltip(ev, node.panel_id); });
          viewCountSpan.addEventListener('mouseleave', () => { hideViewersTooltip(); });
          label.appendChild(viewCountSpan);
        }
        
        if (isIncomplete) {
          // Add badge after name
          const badge = document.createElement('span');
          badge.className = 'tree-incomplete-badge';
          badge.textContent = '[Chưa hoàn tất]';
          label.appendChild(badge);
        }

        // Bug icon: no bug / bug chưa fix (đỏ) / bug đã fix hết (xanh)
        if (node.bug_flag) {
            const bugInfo = node.bug_info || null;
            const allFixed = typeof hasAllBugFixed === 'function' ? hasAllBugFixed(bugInfo) : false;
            const bugIcon = document.createElement('span');
            bugIcon.style.marginLeft = '6px';
            bugIcon.style.cursor = 'help';
            bugIcon.style.display = 'inline-block';
            bugIcon.style.verticalAlign = 'middle';
            bugIcon.style.width = '14px';
            bugIcon.style.height = '14px';
            bugIcon.style.color = allFixed ? '#28a745' : '#dc3545';
            if (allFixed) {
                bugIcon.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><path d="M20 6L9 17l-5-5"/></svg>\`;
            } else {
                bugIcon.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" style="width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2;">
                  <ellipse cx="32" cy="36" rx="14" ry="18"/><circle cx="32" cy="20" r="8"/>
                  <line x1="28" y1="12" x2="22" y2="4"/><line x1="36" y1="12" x2="42" y2="4"/>
                  <line x1="18" y1="42" x2="8" y2="48"/><line x1="18" y1="36" x2="8" y2="36"/><line x1="18" y1="30" x2="8" y2="24"/>
                  <line x1="46" y1="42" x2="56" y2="48"/><line x1="46" y1="36" x2="56" y2="36"/><line x1="46" y1="30" x2="56" y2="24"/>
                </svg>\`;
            }
            bugIcon.addEventListener('mouseenter', (e) => { showBugTooltip(e, node.bug_note, node.bug_info); });
            bugIcon.addEventListener('mouseleave', () => { hideBugTooltip(); });
            label.appendChild(bugIcon);
        }
        
        // Check for modality_stacks (important actions)
        if (node.item_category === 'ACTION') {
            const hasModalityStacks = node.modality_stacks && Array.isArray(node.modality_stacks) && node.modality_stacks.length > 0;
            
            // Add highlight icon for important actions
            if (hasModalityStacks) {
                const importantIcon = document.createElement('span');
                importantIcon.style.marginLeft = '6px';
                importantIcon.style.cursor = 'help';
                importantIcon.style.display = 'inline-block';
                importantIcon.style.verticalAlign = 'middle';
                importantIcon.style.width = '16px';
                importantIcon.style.height = '16px';
                importantIcon.style.color = '#ffc107';
                importantIcon.textContent = '⭐';
                importantIcon.title = 'Important Action';
                
                // Add tooltip with modality_stacks info
                importantIcon.addEventListener('mouseenter', (e) => {
                    // Remove any existing tooltips first to prevent duplicates
                    const existingTooltip = document.getElementById('modality-stacks-tooltip');
                    if (existingTooltip) existingTooltip.remove();
                    
                    const tooltip = document.createElement('div');
                    tooltip.id = 'modality-stacks-tooltip';
                    tooltip.style.cssText = 'position: fixed;' +
                        'left: ' + (e.clientX + 10) + 'px;' +
                        'top: ' + (e.clientY + 10) + 'px;' +
                        'background: rgba(0, 0, 0, 0.9);' +
                        'color: white;' +
                        'padding: 12px;' +
                        'border-radius: 6px;' +
                        'font-size: 12px;' +
                        'max-width: 400px;' +
                        'z-index: 10000;' +
                        'pointer-events: none;' +
                        'box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
                    
                    let tooltipContent = '<div style="font-weight: 600; margin-bottom: 8px; color: #ffc107;">⭐ Đây là tính năng quan trọng cần làm hết luồng</div>';
                    
                    // Show reason if available
                    if (node.modality_stacks_reason) {
                        tooltipContent += '<div style="margin-top: 8px; padding: 6px; background: rgba(33, 150, 243, 0.2); border-left: 2px solid #2196f3; border-radius: 4px;">' +
                            '<div style="font-weight: 600; color: #4fc3f7; font-size: 11px; margin-bottom: 4px;">Lý do lựa chọn:</div>' +
                            '<div style="color: #fff; font-size: 11px;">' + node.modality_stacks_reason + '</div>' +
                            '</div>';
                    }
                    
                    if (node.modality_stacks_info && Array.isArray(node.modality_stacks_info)) {
                        node.modality_stacks_info.forEach((ms, idx) => {
                            tooltipContent += '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.2);">' +
                                '<div style="font-weight: 600; color: #4fc3f7;">' + (ms.name || 'N/A') + '</div>' +
                                '<div style="margin-top: 4px; color: #ccc;">' + (ms.description || 'N/A') + '</div>' +
                                '<div style="margin-top: 4px; color: #ffc107; font-size: 11px;">Lý do: ' + (ms.main_feature_reason || 'N/A') + '</div>' +
                                '</div>';
                        });
                    } else {
                        tooltipContent += '<div style="margin-top: 8px; color: #ccc;">Modality stacks: ' + node.modality_stacks.join(', ') + '</div>';
                    }
                    
                    tooltip.innerHTML = tooltipContent;
                    document.body.appendChild(tooltip);
                });
                
                importantIcon.addEventListener('mouseleave', () => {
                    const tooltip = document.getElementById('modality-stacks-tooltip');
                    if (tooltip) {
                        tooltip.remove();
                    }
                });
                
                label.appendChild(importantIcon);
            }
            
            // Validate Full Flow result: đọc từ node (PanelLogManager gán từ item.modality_stacks_routes)
            const routes = (node.modality_stacks_routes && node.modality_stacks_routes.length > 0)
                ? node.modality_stacks_routes
                : (node.modality_stack_routes && node.modality_stack_routes.length > 0 ? node.modality_stack_routes : null);
            if (routes && routes.length > 0) {
              const allOk = routes.every(function (r) { return r.is_end_to_end_flow; });
              const validateIcon = document.createElement('span');
              validateIcon.style.marginLeft = '6px';
              validateIcon.style.cursor = 'help';
              validateIcon.style.display = 'inline-block';
              validateIcon.style.verticalAlign = 'middle';
              validateIcon.style.fontSize = '14px';
              validateIcon.textContent = allOk ? '✅' : '⚠️';
              validateIcon.title = allOk ? 'Đủ luồng end-to-end' : 'Một số modality stack chưa đủ luồng';
              validateIcon.addEventListener('mouseenter', function (e) {
                const existing = document.getElementById('validate-full-flow-tooltip');
                if (existing) existing.remove();
                const tooltip = document.createElement('div');
                tooltip.id = 'validate-full-flow-tooltip';
                tooltip.style.cssText = 'position: fixed; left: ' + (e.clientX + 12) + 'px; top: ' + (e.clientY + 12) + 'px;' +
                  'background: rgba(0,0,0,0.92); color: #fff; padding: 12px 14px; border-radius: 8px; font-size: 12px;' +
                  'max-width: 420px; z-index: 10001; pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,0.4); line-height: 1.45;';
                let html = '<div style="font-weight:600; margin-bottom:8px; color: #4fc3f7;">Kết quả Validate Full Flow</div>';
                routes.forEach(function (r) {
                  const icon = r.is_end_to_end_flow ? '✅' : '⚠️';
                  html += '<div style="margin-top:10px; padding:8px; background: rgba(255,255,255,0.08); border-radius:6px; border-left:3px solid ' + (r.is_end_to_end_flow ? '#4caf50' : '#ff9800') + ';">';
                  html += '<div style="font-weight:600; margin-bottom:4px;">' + icon + ' ' + (r.modality_stack_code || '') + '</div>';
                  html += '<div style="color: #e0e0e0; font-size: 11px;">' + (r.end_to_end_flow_reason || '') + '</div>';
                  if (r.routes && r.routes.length > 0) {
                    var routesToShow = r.is_end_to_end_flow
                      ? r.routes
                      : (function () {
                          var longest = r.routes.reduce(function (a, b) { return (a && a.length) >= (b && b.length) ? a : b; }, null);
                          return longest ? [longest] : [];
                        }());
                    routesToShow.forEach(function (route, idx) {
                      var parts = [];
                      (route || []).forEach(function (step, i) {
                        var pBefore = step.panel_before_name || '';
                        var actName = step.action_name || (step.action && step.action.name) || '';
                        if (pBefore) parts.push(pBefore);
                        if (actName) parts.push(actName);
                        if (i === (route.length - 1) && (step.panel_after_name || '')) parts.push(step.panel_after_name);
                      });
                      if (parts.length) {
                        var label = r.is_end_to_end_flow
                          ? ('Route' + (r.routes.length > 1 ? ' ' + (idx + 1) : ''))
                          : 'Route (dài nhất)';
                        html += '<div style="margin-top:6px; font-size: 11px; color: #81d4fa;">' + label + ': ' + parts.join(' → ') + '</div>';
                      }
                    });
                  }
                  html += '</div>';
                });
                tooltip.innerHTML = html;
                document.body.appendChild(tooltip);
                var rect = tooltip.getBoundingClientRect();
                if (rect.right > window.innerWidth) tooltip.style.left = (e.clientX - rect.width - 12) + 'px';
                if (rect.bottom > window.innerHeight) tooltip.style.top = (e.clientY - rect.height - 12) + 'px';
              });
              validateIcon.addEventListener('mouseleave', function () {
                const t = document.getElementById('validate-full-flow-tooltip');
                if (t) t.remove();
              });
              label.appendChild(validateIcon);
            } else if (Array.isArray(node.modality_stacks) && node.modality_stacks.length === 0) {
                // Add tooltip for actions with empty modality_stacks array
                label.addEventListener('mouseenter', (e) => {
                    const tooltip = document.createElement('div');
                    tooltip.id = 'action-tooltip';
                    tooltip.style.cssText = 'position: fixed;' +
                        'left: ' + (e.clientX + 10) + 'px;' +
                        'top: ' + (e.clientY + 10) + 'px;' +
                        'background: rgba(0, 0, 0, 0.9);' +
                        'color: white;' +
                        'padding: 8px 12px;' +
                        'border-radius: 6px;' +
                        'font-size: 12px;' +
                        'z-index: 10000;' +
                        'pointer-events: none;' +
                        'box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
                    tooltip.textContent = 'Tính năng này cần làm ít nhất tới tầng thứ 2 (nếu có)';
                    document.body.appendChild(tooltip);
                });
                
                label.addEventListener('mouseleave', () => {
                    const tooltip = document.getElementById('action-tooltip');
                    if (tooltip) {
                        tooltip.remove();
                    }
                });
            }
        }
        
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
          
          // Auto-expand day + session only; scene/snapshot collapsed by default, unless previously expanded
          const isValidationNodeExpandAll = node.type === 'day' || node.type === 'session';
          if (isValidationNodeExpandAll || expandedPanels.has(expandKey)) {
            childrenDiv.classList.add('expanded');
            expandIcon.textContent = '▼';
            if (isValidationNodeExpandAll) expandedPanels.add(expandKey);
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
              expandedPanels.add(expandKey);
            } else {
              expandedPanels.delete(expandKey);
            }
          });
        }
        
        const showAssigneeTooltip = node.type === 'session' && node.assignee && (
          currentRole === 'ADMIN' || (currentRole === 'VALIDATE' && currentAccountInfo && node.assignee === currentAccountInfo.collaborator_code)
        );
        if (showAssigneeTooltip) {
          contentDiv.addEventListener('mouseenter', (ev) => { showSessionAssigneeTooltip(ev, node.my_session); });
          contentDiv.addEventListener('mouseleave', hideSessionAssigneeTooltip);
        }
        
        contentDiv.addEventListener('click', () => {
          if (node.panel_id != null && window.selectPanel) {
            window.selectPanel(node.panel_id);
          }
        });
        
        contentDiv.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (currentRole === 'ADMIN' && node.type === 'session' && node.my_session != null) {
            showSessionContextMenu(e.clientX, e.clientY, node);
          } else if (node.panel_id != null) {
            showContextMenu(e.clientX, e.clientY, node.panel_id, node.status, node.name, node.item_category, node.pageNumber, node.maxPageNumber, node.bug_flag, node.modality_stacks);
          }
        });
        
        return nodeDiv;
      }
      
      function showSessionContextMenu(x, y, node) {
        const existingMenu = document.getElementById('session-context-menu');
        if (existingMenu) existingMenu.remove();
        const menu = document.createElement('div');
        menu.id = 'session-context-menu';
        menu.style.cssText = \`
          position: fixed;
          left: \${x}px;
          top: \${y}px;
          background: #fff;
          border: 1px solid #ccc;
          border-radius: 4px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          z-index: 10000;
          min-width: 180px;
        \`;
        const addItem = (text, handler) => {
          const div = document.createElement('div');
          div.textContent = text;
          div.style.cssText = 'padding: 8px 12px; cursor: pointer; font-size: 14px;';
          div.addEventListener('mouseenter', () => { div.style.background = '#f0f0f0'; });
          div.addEventListener('mouseleave', () => { div.style.background = 'transparent'; });
          div.addEventListener('click', (ev) => { ev.stopPropagation(); menu.remove(); document.removeEventListener('click', closeMenu); handler(); });
          menu.appendChild(div);
        };
        if (!node.assignee) {
          addItem('Assign Validator', () => { openAssignValidatorModal(node); });
        } else {
          addItem('Unassign Validator', async () => {
            if (window.confirm('Bỏ gán CTV cho session này?')) {
              if (typeof window.unassignValidator === 'function') await window.unassignValidator(node.my_session);
              if (window.getPanelTree) {
                const data = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(panelLogDisplayMode) : window.getPanelTree(panelLogDisplayMode));
                panelTreeData = data || []; renderPanelTree();
              }
            }
          });
          addItem('Change Validator', () => { openAssignValidatorModal(node); });
        }
        document.body.appendChild(menu);
        const menuRect = menu.getBoundingClientRect();
        if (y + menuRect.height > window.innerHeight) menu.style.top = (Math.max(10, y - menuRect.height)) + 'px';
        const closeMenu = (e) => {
          if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 100);
      }
      
      async function openCorrectChildActionsDialog(panelId) {
        const modal = document.getElementById('correctChildActionsModal');
        const titleEl = document.getElementById('correctChildActionsModalTitle');
        const actionsList = document.getElementById('correctChildActionsActionsList');
        const destList = document.getElementById('correctChildActionsDestList');
        const moveBtn = document.getElementById('correctChildActionsMoveBtn');
        const cancelBtn = document.getElementById('correctChildActionsCancelBtn');
        const lightbox = document.getElementById('correctChildActionsImageLightbox');
        const lightboxImg = document.getElementById('correctChildActionsLightboxImg');
        if (!modal || !actionsList || !destList) return;
        actionsList.innerHTML = '<div style="padding:12px; color:#666;">Đang tải...</div>';
        destList.innerHTML = '';
        modal.style.display = 'flex';
        const res = await (typeof window.getCorrectChildActionsDialogData === 'function' ? window.getCorrectChildActionsDialogData(panelId) : { success: false });
        if (!res.success) {
          if (typeof showToast === 'function') showToast(res.message || 'Không thể tải dữ liệu');
          modal.style.display = 'none';
          return;
        }
        titleEl.textContent = 'Correct Child Actions - ' + (res.panelName || 'Panel');
        const showLightbox = (src) => {
          if (!lightbox || !lightboxImg) return;
          lightboxImg.src = src || '';
          lightbox.style.display = 'flex';
        };
        if (lightbox) lightbox.onclick = () => { lightbox.style.display = 'none'; };
        actionsList.innerHTML = '';
        (res.childActions || []).forEach(a => {
          const wrap = document.createElement('label');
          wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; cursor:pointer; border:2px solid #eee; border-radius:8px; padding:8px; min-width:100px;';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.dataset.id = a.id;
          cb.style.marginBottom = '4px';
          const img = document.createElement('img');
          img.src = a.imageBase64 ? 'data:image/png;base64,' + a.imageBase64 : '';
          img.style.cssText = 'width:80px; height:60px; object-fit:cover; border-radius:4px; cursor:pointer;';
          img.alt = a.name || '';
          img.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (a.imageBase64) showLightbox(img.src); };
          const name = document.createElement('span');
          name.textContent = (a.name || '').slice(0, 20) + ((a.name || '').length > 20 ? '...' : '');
          name.style.cssText = 'font-size:11px; text-align:center; margin-top:4px; max-width:100px; overflow:hidden; text-overflow:ellipsis;';
          wrap.appendChild(cb);
          wrap.appendChild(img);
          wrap.appendChild(name);
          actionsList.appendChild(wrap);
        });
        if ((res.childActions || []).length === 0) actionsList.innerHTML = '<div style="padding:8px; color:#999; font-size:13px;">Không có actions con</div>';
        let selectedDest = null;
        (res.allPanels || []).forEach(p => {
          const row = document.createElement('div');
          row.style.cssText = 'padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'correctChildActionsDest';
          radio.value = p.item_id;
          radio.onchange = () => { selectedDest = p.item_id; destList.querySelectorAll('[data-dest]').forEach(el => { el.style.background = 'transparent'; }); row.style.background = '#e3f2fd'; };
          const name = document.createElement('span');
          name.textContent = p.name || p.item_id || '';
          row.setAttribute('data-dest', '1');
          row.appendChild(radio);
          row.appendChild(name);
          row.onclick = () => { radio.checked = true; selectedDest = p.item_id; destList.querySelectorAll('[data-dest]').forEach(el => { el.style.background = 'transparent'; }); row.style.background = '#e3f2fd'; };
          destList.appendChild(row);
        });
        if ((res.allPanels || []).length === 0) destList.innerHTML = '<div style="padding:8px; color:#999; font-size:13px;">Không có panel nào khác để chọn làm đích</div>';
        cancelBtn.onclick = () => { modal.style.display = 'none'; };
        moveBtn.onclick = async () => {
          if (!selectedDest) { if (typeof showToast === 'function') showToast('Vui lòng chọn panel đích'); return; }
          const selActions = [].slice.call(actionsList.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.dataset.id).filter(Boolean);
          if (selActions.length === 0) { if (typeof showToast === 'function') showToast('Vui lòng chọn ít nhất 1 action để chuyển'); return; }
          moveBtn.textContent = 'Moving...';
          moveBtn.disabled = true;
          moveBtn.style.cursor = 'not-allowed';
          try {
            const r = await (typeof window.correctChildActions === 'function' ? window.correctChildActions(panelId, selActions, selectedDest) : { success: false });
            modal.style.display = 'none';
            if (r.success) {
              if (typeof showToast === 'function') showToast('Đã chuyển actions thành công');
              if (window.getPanelTree) {
                const data = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(panelLogDisplayMode) : window.getPanelTree(panelLogDisplayMode));
                panelTreeData = data || []; renderPanelTree();
              }
            } else {
              if (typeof showToast === 'function') showToast(r.message || 'Lỗi khi chuyển actions');
            }
          } finally {
            moveBtn.textContent = 'Move';
            moveBtn.disabled = false;
            moveBtn.style.cursor = 'pointer';
          }
        };
      }
      window.openCorrectChildActionsDialog = openCorrectChildActionsDialog;

      async function openCorrectChildPanelsDialog(panelId) {
        const modal = document.getElementById('correctChildPanelsModal');
        const titleEl = document.getElementById('correctChildPanelsModalTitle');
        const panelsList = document.getElementById('correctChildPanelsPanelsList');
        const destList = document.getElementById('correctChildPanelsDestList');
        const moveBtn = document.getElementById('correctChildPanelsMoveBtn');
        const cancelBtn = document.getElementById('correctChildPanelsCancelBtn');
        const lightbox = document.getElementById('correctChildPanelsImageLightbox');
        const lightboxImg = document.getElementById('correctChildPanelsLightboxImg');
        if (!modal || !panelsList || !destList) return;
        panelsList.innerHTML = '<div style="padding:12px; color:#666;">Đang tải...</div>';
        destList.innerHTML = '';
        modal.style.display = 'flex';
        const res = await (typeof window.getCorrectChildPanelsDialogData === 'function' ? window.getCorrectChildPanelsDialogData(panelId) : { success: false });
        if (!res.success) {
          if (typeof showToast === 'function') showToast(res.message || 'Không thể tải dữ liệu');
          modal.style.display = 'none';
          return;
        }
        titleEl.textContent = 'Correct Child Panels - ' + (res.panelName || 'Panel');
        const showLightbox = (src) => {
          if (!lightbox || !lightboxImg) return;
          lightboxImg.src = src || '';
          lightbox.style.display = 'flex';
        };
        if (lightbox) lightbox.onclick = () => { lightbox.style.display = 'none'; };
        panelsList.innerHTML = '';
        (res.childPanels || []).forEach(p => {
          const wrap = document.createElement('label');
          wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; cursor:pointer; border:2px solid #eee; border-radius:8px; padding:8px; min-width:100px;';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.dataset.id = p.id;
          cb.style.marginBottom = '4px';
          const img = document.createElement('img');
          img.src = p.imageBase64 ? 'data:image/png;base64,' + p.imageBase64 : '';
          img.style.cssText = 'width:80px; height:60px; object-fit:cover; border-radius:4px; cursor:pointer;';
          img.alt = p.name || '';
          img.onclick = (e) => { e.preventDefault(); e.stopPropagation(); if (p.imageBase64) showLightbox(img.src); };
          const name = document.createElement('span');
          name.textContent = (p.name || '').slice(0, 20) + ((p.name || '').length > 20 ? '...' : '');
          name.style.cssText = 'font-size:11px; text-align:center; margin-top:4px; max-width:100px; overflow:hidden; text-overflow:ellipsis;';
          wrap.appendChild(cb);
          wrap.appendChild(img);
          wrap.appendChild(name);
          panelsList.appendChild(wrap);
        });
        if ((res.childPanels || []).length === 0) panelsList.innerHTML = '<div style="padding:8px; color:#999; font-size:13px;">Không có panels con</div>';
        const CORRECT_CHILD_PANELS_DEST_NONE = '__NONE__';
        let selectedDest = null;
        (function addDestRow(value, label) {
          const row = document.createElement('div');
          row.style.cssText = 'padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'correctChildPanelsDest';
          radio.value = value;
          radio.onchange = () => { selectedDest = value; destList.querySelectorAll('[data-dest]').forEach(el => { el.style.background = 'transparent'; }); row.style.background = '#e3f2fd'; };
          const name = document.createElement('span');
          name.textContent = label;
          row.setAttribute('data-dest', '1');
          row.appendChild(radio);
          row.appendChild(name);
          row.onclick = () => { radio.checked = true; selectedDest = value; destList.querySelectorAll('[data-dest]').forEach(el => { el.style.background = 'transparent'; }); row.style.background = '#e3f2fd'; };
          destList.appendChild(row);
        })(CORRECT_CHILD_PANELS_DEST_NONE, 'Không thuộc panel nào');
        (res.allPanels || []).forEach(p => {
          const row = document.createElement('div');
          row.style.cssText = 'padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'correctChildPanelsDest';
          radio.value = p.item_id;
          radio.onchange = () => { selectedDest = p.item_id; destList.querySelectorAll('[data-dest]').forEach(el => { el.style.background = 'transparent'; }); row.style.background = '#e3f2fd'; };
          const name = document.createElement('span');
          name.textContent = p.name || p.item_id || '';
          row.setAttribute('data-dest', '1');
          row.appendChild(radio);
          row.appendChild(name);
          row.onclick = () => { radio.checked = true; selectedDest = p.item_id; destList.querySelectorAll('[data-dest]').forEach(el => { el.style.background = 'transparent'; }); row.style.background = '#e3f2fd'; };
          destList.appendChild(row);
        });
        cancelBtn.onclick = () => { modal.style.display = 'none'; };
        moveBtn.onclick = async () => {
          if (!selectedDest) { if (typeof showToast === 'function') showToast('Vui lòng chọn panel đích hoặc Không thuộc panel nào'); return; }
          const selPanels = [].slice.call(panelsList.querySelectorAll('input[type=checkbox]:checked')).map(cb => cb.dataset.id).filter(Boolean);
          if (selPanels.length === 0) { if (typeof showToast === 'function') showToast('Vui lòng chọn ít nhất 1 panel để chuyển'); return; }
          moveBtn.textContent = selectedDest === CORRECT_CHILD_PANELS_DEST_NONE ? 'Đang xóa...' : 'Moving...';
          moveBtn.disabled = true;
          moveBtn.style.cursor = 'not-allowed';
          try {
            const r = await (typeof window.correctChildPanels === 'function' ? window.correctChildPanels(panelId, selPanels, selectedDest) : { success: false });
            modal.style.display = 'none';
            if (r.success) {
              if (typeof showToast === 'function') showToast(selectedDest === CORRECT_CHILD_PANELS_DEST_NONE ? 'Đã xóa panels khỏi panel cha' : 'Đã chuyển panels thành công');
              if (window.getPanelTree) {
                const data = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(panelLogDisplayMode) : window.getPanelTree(panelLogDisplayMode));
                panelTreeData = data || []; renderPanelTree();
              }
            } else {
              if (typeof showToast === 'function') showToast(r.message || 'Lỗi khi chuyển panels');
            }
          } finally {
            moveBtn.textContent = 'Move';
            moveBtn.disabled = false;
            moveBtn.style.cursor = 'pointer';
          }
        };
      }
      window.openCorrectChildPanelsDialog = openCorrectChildPanelsDialog;

      let assignValidatorModalSession = null;
      async function openAssignValidatorModal(node) {
        assignValidatorModalSession = node;
        const modal = document.getElementById('assignValidatorModal');
        const listEl = document.getElementById('assignValidatorList');
        const filterInput = document.getElementById('assignValidatorFilter');
        const assignBtn = document.getElementById('assignValidatorAssignBtn');
        const cancelBtn = document.getElementById('assignValidatorCancelBtn');
        if (!modal || !listEl) return;
        filterInput.value = '';
        let selectedCode = null;
        const renderList = async (filter) => {
          const getList = typeof window.getCollaboratorsList === 'function' ? window.getCollaboratorsList : null;
          if (!getList) { listEl.innerHTML = '<div style="padding:12px; color:#666;">Không có API</div>'; return; }
          const collaborators = await getList(filter && filter.trim() ? filter.trim() : undefined);
          listEl.innerHTML = '';
          if (!collaborators || collaborators.length === 0) {
            listEl.innerHTML = '<div style="padding:12px; color:#666;">Không có CTV</div>';
            return;
          }
          collaborators.forEach(c => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:10px 12px; border-bottom:1px solid #eee; cursor:pointer; display:flex; justify-content:space-between; align-items:center;';
            row.innerHTML = '<span>' + (c.name || c.code || '') + '</span><span style="font-size:12px; color:#999;">' + (c.code || '') + '</span>';
            row.addEventListener('click', () => {
              selectedCode = c.code;
              listEl.querySelectorAll('[data-selected]').forEach(el => { el.removeAttribute('data-selected'); el.style.background = 'transparent'; });
              row.setAttribute('data-selected', '1');
              row.style.background = '#e3f2fd';
            });
            row.addEventListener('mouseenter', () => { if (row.getAttribute('data-selected') !== '1') row.style.background = '#f5f5f5'; });
            row.addEventListener('mouseleave', () => { if (row.getAttribute('data-selected') !== '1') row.style.background = 'transparent'; });
            listEl.appendChild(row);
          });
        };
        await renderList('');
        filterInput.oninput = () => { renderList(filterInput.value); };
        assignBtn.onclick = async () => {
          if (!selectedCode || !assignValidatorModalSession) { showToast('Chọn 1 CTV'); return; }
          if (typeof window.assignValidator === 'function') await window.assignValidator(assignValidatorModalSession.my_session, selectedCode);
          modal.style.display = 'none';
          assignValidatorModalSession = null;
          if (window.getPanelTree) {
            const data = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(panelLogDisplayMode) : window.getPanelTree(panelLogDisplayMode));
            panelTreeData = data || []; renderPanelTree();
          }
        };
        cancelBtn.onclick = () => { modal.style.display = 'none'; assignValidatorModalSession = null; };
        modal.style.display = 'flex';
      }
      
      let setImportantActionCurrentId = null;
      async function openSetImportantActionDialog(actionId) {
        setImportantActionCurrentId = actionId;
        const modal = document.getElementById('setImportantActionModal');
        const reasonEl = document.getElementById('setImportantActionReason');
        const reasonErr = document.getElementById('setImportantActionReasonError');
        const listEl = document.getElementById('setImportantActionModalityList');
        const okBtn = document.getElementById('setImportantActionOkBtn');
        const cancelBtn = document.getElementById('setImportantActionCancelBtn');
        if (!modal || !reasonEl || !listEl || !okBtn || !cancelBtn) return;
        reasonEl.value = '';
        reasonErr.style.display = 'none';
        listEl.innerHTML = '<div style="padding:12px; color:#666;">Đang tải...</div>';
        const stacks = typeof window.getModalityStacksForCurrentTool === 'function' ? await window.getModalityStacksForCurrentTool() : [];
        let currentStacks = [];
        if (typeof window.getActionItem === 'function') {
          const item = await window.getActionItem(actionId);
          if (item && item.modality_stacks && Array.isArray(item.modality_stacks)) currentStacks = item.modality_stacks;
          if (item && item.modality_stacks_reason) reasonEl.value = item.modality_stacks_reason;
        }
        listEl.innerHTML = '';
        const codeToChecked = new Set(currentStacks);
        stacks.forEach(s => {
          const label = document.createElement('label');
          label.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 0; cursor:pointer; font-size:14px;';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.dataset.code = s.code;
          cb.checked = codeToChecked.has(s.code);
          label.appendChild(cb);
          label.appendChild(document.createTextNode((s.name || s.code) + ' (' + s.code + ')'));
          label.addEventListener('click', (e) => { if (e.target !== cb) cb.checked = !cb.checked; });
          listEl.appendChild(label);
        });
        if (stacks.length === 0) listEl.innerHTML = '<div style="padding:12px; color:#999;">Không có modality_stack nào.</div>';
        cancelBtn.onclick = () => { modal.style.display = 'none'; setImportantActionCurrentId = null; };
        okBtn.onclick = async () => {
          const reason = (reasonEl.value || '').trim();
          if (!reason) { reasonErr.style.display = 'block'; reasonErr.textContent = 'Vui lòng nhập mô tả lý do quan trọng.'; return; }
          reasonErr.style.display = 'none';
          const selectedCodes = [];
          listEl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => { if (cb.dataset.code) selectedCodes.push(cb.dataset.code); });
          if (typeof window.setImportantAction === 'function') await window.setImportantAction(setImportantActionCurrentId, reason, selectedCodes);
          modal.style.display = 'none';
          setImportantActionCurrentId = null;
          if (window.getPanelTree) {
            const data = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(panelLogDisplayMode) : window.getPanelTree(panelLogDisplayMode));
            panelTreeData = data || []; renderPanelTree();
          }
        };
        modal.style.display = 'flex';
      }
      
      function showContextMenu(x, y, panelId, status, nodeName, itemCategory, pageNumber, maxPageNumber, hasBug, modalityStacks) {
        const existingMenu = document.getElementById('tree-context-menu');
        if (existingMenu) {
          existingMenu.remove();
        }
        
        const isRootPanel = (nodeName === 'After Login Panel');
        const hasModalityStacks = modalityStacks && Array.isArray(modalityStacks) && modalityStacks.length > 0;
        
        // If role is ADMIN or VALIDATE: show Set Important Action / Set Normal Action (and Resolved Bug only if action has bug) for ACTION nodes
        if ((currentRole === 'ADMIN' || currentRole === 'VALIDATE') && itemCategory === 'ACTION') {
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
            min-width: 180px;
          \`;
          const addItem = (text, handler) => {
            const div = document.createElement('div');
            div.textContent = text;
            div.style.cssText = 'padding: 8px 12px; cursor: pointer; font-size: 14px;';
            div.addEventListener('mouseenter', () => { div.style.background = '#f0f0f0'; });
            div.addEventListener('mouseleave', () => { div.style.background = 'transparent'; });
            div.addEventListener('click', (ev) => { ev.stopPropagation(); menu.remove(); document.removeEventListener('click', closeMenu); handler(); });
            menu.appendChild(div);
          };
          if (hasModalityStacks) {
            addItem('🤖 Validate Full Flow By AI', async () => {
              if (typeof window.validateImportantAction === 'function') {
                try {
                  if (typeof showToast === 'function') showToast('Đang validate full flow...');
                  await window.validateImportantAction(panelId);
                } catch (err) {
                  console.error('validateImportantAction error:', err);
                  if (typeof showToast === 'function') showToast('❌ Lỗi: ' + (err.message || 'Validate thất bại'));
                }
              }
            });
          }
          addItem('⭐ Set Important Action', () => { openSetImportantActionDialog(panelId); });
          addItem('➖ Set Normal Action', async () => {
            if (window.confirm('Đặt action này thành Normal (xóa modality_stacks và lý do)?')) {
              if (typeof window.setNormalAction === 'function') await window.setNormalAction(panelId);
              if (window.getPanelTree) {
                const data = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(panelLogDisplayMode) : window.getPanelTree(panelLogDisplayMode));
                panelTreeData = data || []; renderPanelTree();
              }
            }
          });
          if (hasBug) {
            addItem('✅ Resolved Bug', async () => {
              if (typeof window.getActionItem !== 'function') { showToast('Không thể tải action.'); return; }
              const item = await window.getActionItem(panelId);
              if (!item || !item.bug_flag || !item.bug_info || !item.bug_info.details || item.bug_info.details.length === 0) {
                if (typeof showToast === 'function') showToast('Action này chưa có bug hoặc chưa có chi tiết bug.');
                else alert('Action này chưa có bug hoặc chưa có chi tiết bug.');
                return;
              }
              openResolvedBugDialog(panelId, item.bug_info, item);
            });
            addItem('❌ Cancel bug', async () => {
              if (!window.confirm('Bỏ đánh dấu bug của action này?')) return;
              if (typeof window.cancelBug !== 'function') { showToast('Cancel bug không khả dụng.'); return; }
              try {
                await window.cancelBug(panelId);
                if (window.getPanelTree) {
                  const data = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(panelLogDisplayMode) : window.getPanelTree(panelLogDisplayMode));
                  panelTreeData = data || []; renderPanelTree();
                }
                if (typeof showToast === 'function') showToast('✅ Đã bỏ đánh dấu bug.');
              } catch (err) {
                console.error('cancelBug error:', err);
                if (typeof showToast === 'function') showToast('❌ Không thể bỏ đánh dấu bug.');
              }
            });
          }
          document.body.appendChild(menu);
          const menuRect = menu.getBoundingClientRect();
          if (y + menuRect.height > window.innerHeight) menu.style.top = (Math.max(10, y - menuRect.height)) + 'px';
          const closeMenu = (e) => {
            if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
          };
          setTimeout(() => document.addEventListener('click', closeMenu), 100);
          return;
        }
        
        // If role is not DRAW: show menu for PANEL (ADMIN: any panel; VALIDATE: only root)
        if (currentRole !== 'DRAW') {
          const showMenuForPanel = (currentRole === 'ADMIN' && itemCategory === 'PANEL') ||
            (currentRole === 'VALIDATE' && isRootPanel && itemCategory === 'PANEL');
          if (!showMenuForPanel) {
            return;
          }
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
            min-width: 200px;
          \`;
          const addItem = (text, handler) => {
            const div = document.createElement('div');
            div.textContent = text;
            div.style.cssText = 'padding: 8px 12px; cursor: pointer; font-size: 14px;' + (menu.children.length ? ' border-top: 1px solid #eee;' : '');
            div.addEventListener('mouseenter', () => { div.style.background = '#f0f0f0'; });
            div.addEventListener('mouseleave', () => { div.style.background = 'transparent'; });
            div.addEventListener('click', (ev) => { ev.stopPropagation(); menu.remove(); document.removeEventListener('click', closeMenu); handler(); });
            menu.appendChild(div);
          };
          if (currentRole === 'ADMIN') {
            addItem('🔧 Correct Child Actions', () => { if (window.openCorrectChildActionsDialog) window.openCorrectChildActionsDialog(panelId); });
            addItem('🔧 Correct Child Panels', () => { if (window.openCorrectChildPanelsDialog) window.openCorrectChildPanelsDialog(panelId); });
          }
          if (isRootPanel) {
            addItem('🎯 Detect Important Actions', async () => {
              if (isDetectingImportantActions) {
                showToast('⚠️ Đang detect important actions, vui lòng đợi...');
                return;
              }
              if (window.detectImportantActionsForPanel) await window.detectImportantActionsForPanel(panelId);
            });
          }
          document.body.appendChild(menu);
          const menuRect = menu.getBoundingClientRect();
          if (y + menuRect.height > window.innerHeight) menu.style.top = (Math.max(10, y - menuRect.height)) + 'px';
          const closeMenu = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); } };
          setTimeout(() => document.addEventListener('click', closeMenu), 100);
          return;
        }
        
        // For DRAW role: show full menu
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
          
          // Add "Detect Important Actions" menu item for After Login Panel
          if (isRootPanel) {
            const detectImportantActionsOption = document.createElement('div');
            detectImportantActionsOption.textContent = '🎯 Detect Important Actions';
            detectImportantActionsOption.style.cssText = \`
              padding: 8px 12px;
              cursor: pointer;
              font-size: 14px;
              border-top: 1px solid #eee;
            \`;
            detectImportantActionsOption.addEventListener('mouseenter', () => {
              detectImportantActionsOption.style.background = '#f0f0f0';
            });
            detectImportantActionsOption.addEventListener('mouseleave', () => {
              detectImportantActionsOption.style.background = 'transparent';
            });
            detectImportantActionsOption.addEventListener('click', async () => {
              // Check if already running
              if (isDetectingImportantActions) {
                showToast('⚠️ Đang detect important actions, vui lòng đợi...');
                return;
              }
              
              menu.remove();
              if (window.detectImportantActionsForPanel) {
                await window.detectImportantActionsForPanel(panelId);
              }
            });
            menu.appendChild(detectImportantActionsOption);
          }
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
                            'Xóa panel này khỏi tree? Các page của panel và panel con sẽ được giữ lại.';
          if (confirm(confirmMsg)) {
            if (window.deleteEvent) {
              window.deleteEvent(panelId);
            }
          }
        });
        
        // Only show "Mark as Done" for DRAW role
        if (status !== 'completed' && currentRole === 'DRAW') {
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

      // RaiseBug Dialog Handler
      async function showRaiseBugDialog(actionId, currentBugInfo = null, actionItem = null) {
          // Fetch action item if not provided
          if (!actionItem && window.getActionItem) {
              try {
                  actionItem = await window.getActionItem(actionId);
              } catch (e) {
                  console.error('Failed to fetch action item for bug dialog:', e);
              }
          } else if (actionItem && (!actionItem.purpose && !actionItem.item_purpose) && window.getActionItem) {
              // If we have an item but it seems incomplete (e.g. from UI event), try to fetch full data
              try {
                  const fullItem = await window.getActionItem(actionId);
                  if (fullItem) {
                      // Merge full item into actionItem
                      actionItem = { ...actionItem, ...fullItem };
                  }
              } catch (e) {
                  console.warn('Failed to fetch full action item:', e);
              }
          }

          // If currentBugInfo is null, try to get it from actionItem
          if (!currentBugInfo && actionItem && actionItem.bug_info) {
              currentBugInfo = actionItem.bug_info;
          }

          const modal = document.getElementById('raiseBugModal');
          const content = document.getElementById('raiseBugContent');
          const closeBtn = document.getElementById('closeRaiseBugModalBtn');
          const cancelBtn = document.getElementById('cancelRaiseBugBtn');
          const confirmBtn = document.getElementById('confirmRaiseBugBtn');
          
          if (!modal || !content) return;
          
          modal.style.display = 'flex';
          
          // Reset button state
          if (confirmBtn) {
              confirmBtn.disabled = false;
              confirmBtn.textContent = 'Save';
              confirmBtn.style.opacity = '1';
              confirmBtn.style.cursor = 'pointer';
          }
          
          // Helper to check if a specific bug type is checked
          const isChecked = (type) => {
              if (!currentBugInfo || !currentBugInfo.details) return false;
              // Check if bug exists and is NOT fixed (active)
              return currentBugInfo.details.some(d => d.bug_type === type && d.bug_fixed !== true);
          };

          // Parse bug_description (can be JSON array string or legacy string format)
          const parseMissingActionsFromDescription = (description) => {
              if (!description) return [];
              if (Array.isArray(description)) {
                  return description.filter(action => 
                      action && typeof action === 'object' && action.mising_action_name
                  );
              }
              if (typeof description === 'string') {
                  try {
                      const parsed = JSON.parse(description);
                      if (Array.isArray(parsed)) {
                          return parsed.filter(action => 
                              action && typeof action === 'object' && action.mising_action_name
                          );
                      }
                  } catch (e) {
                      // Not JSON, try legacy string format
                  }
                  return description.split('\\n')
                      .filter(line => line.trim())
                      .map(line => {
                          const colonIndex = line.indexOf(':');
                          if (colonIndex === -1) {
                              return { mising_action_name: line.trim(), mising_action_reason: '' };
                          }
                          return {
                              mising_action_name: line.substring(0, colonIndex).trim(),
                              mising_action_reason: line.substring(colonIndex + 1).trim()
                          };
                      });
              }
              return [];
          };

          // Format array to bug_description (store as JSON array string)
          const formatMissingActionsToDescription = (actionsArray) => {
              if (!Array.isArray(actionsArray) || actionsArray.length === 0) return null;
              const filtered = actionsArray.filter(action => 
                  action && action.mising_action_name && action.mising_action_name.trim()
              );
              if (filtered.length === 0) return null;
              return JSON.stringify(filtered);
          };

          // Format array to display string (for tooltip)
          const formatMissingActionsToDisplayString = (actionsArray) => {
              if (!Array.isArray(actionsArray) || actionsArray.length === 0) return '';
              return actionsArray
                  .filter(action => action.mising_action_name && action.mising_action_name.trim())
                  .map(action => {
                      const name = action.mising_action_name.trim();
                      const reason = (action.mising_action_reason || '').trim();
                      return reason ? name + ': ' + reason : name;
                  })
                  .join('\\n');
          };

          // Get existing missing actions from bug_info
          const getMissingActionsArray = () => {
              if (!currentBugInfo || !currentBugInfo.details) return [];
              const missingActionsBug = currentBugInfo.details.find(
                  d => (d.bug_type === 'panel_after.missing_actions' || d.bug_type === 'panel.missing_actions') && d.bug_fixed !== true
              );
              if (!missingActionsBug?.description) return [];
              return parseMissingActionsFromDescription(missingActionsBug.description);
          };

          // Helper to get value from action item
          const getActionValue = (field) => {
              if (!actionItem) return '';
              const val = (prop) => actionItem[prop] !== undefined ? actionItem[prop] : '';
              
              switch(field) {
                  case 'action.name': return val('item_name') || val('name');
                  case 'action.type': return val('item_type') || val('type');
                  case 'action.verb': return val('item_verb') || val('verb');
                  case 'action.content': return val('item_content') || val('content');
                  case 'action.purpose': return val('item_purpose') || val('purpose');
                  case 'action.image': return val('image_url') || val('item_image_url') || ''; 
                  
                  case 'panel_after.name': return val('panel_after_name');
                  case 'panel_after.type': return val('panel_after_type');
                  case 'panel_after.verb': return val('panel_after_verb');
                  case 'panel_after.image': return val('panel_after_image');
                  default: return '';
              }
          };

          const formatLabel = (label, value) => {
              if (value === undefined || value === null || value === '') {
                   return \`<span>\${label}: <span style="font-weight:normal; color:#999;">N/A</span></span>\`;
              }
              // Check if value is an image URL
              if (typeof value === 'string' && value.match(/^https?:.*\.(jpg|jpeg|png|gif|webp|svg)/i)) {
                   return \`<span>\${label}: <img src="\${value}" style="max-height: 40px; vertical-align: middle; margin-left: 5px; border: 1px solid #ddd; border-radius: 4px;" alt="Image" /></span>\`;
              }
              const displayValue = String(value).length > 100 ? String(value).substring(0, 100) + '...' : value;
              return \`<span>\${label}: <span style="font-weight:normal; color:#555;">\${displayValue}</span></span>\`;
          };
          
          content.innerHTML = \`
              <div style="font-size: 13px; color: #666; margin-bottom: 15px; padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; line-height: 1.5; display: flex; align-items: start; gap: 8px;">
                  <span style="font-size: 16px;">📋</span>
                  <span><strong>Hướng dẫn:</strong> Vui lòng kiểm tra từng thông tin bên dưới. Nếu thấy thông tin <strong>không đúng</strong>, hãy <strong>tick vào checkbox</strong> tương ứng để đánh dấu, sau đó nhấn nút <strong>Save</strong> để báo lỗi.</span>
              </div>
              
              <div style="display: flex; gap: 0; margin-bottom: 15px; align-items: flex-start;">
                  <!-- Action Info Section -->
                  <div style="flex: 1; min-width: 0; padding-right: 15px;">
                      <h4 style="margin: 0 0 10px 0; font-size: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Action Info</h4>
                      <div style="display: flex; flex-direction: column; gap: 15px;">
                          <div style="width: 100%; border: 1px solid #eee; padding: 5px; border-radius: 4px; display: flex; flex-direction: column; align-items: center;">
                              <div style="margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #555;">Action Image</div>
                              \${getActionValue('action.image') ? 
                                \`<img src="\${getActionValue('action.image')}" style="max-width: 100%; max-height: 150px; object-fit: contain; border: 1px solid #ddd;" />\` : 
                                \`<div style="color: #999; font-size: 12px; padding: 20px; text-align: center;">No Image<br>(or N/A)</div>\`
                              }
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px; font-size: 12px;">
                                  <input type="checkbox" name="bug_type" value="action.image" \${isChecked('action.image') ? 'checked' : ''}> Image Incorrect
                              </label>
                          </div>
                          <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                  <input type="checkbox" name="bug_type" value="action.name" \${isChecked('action.name') ? 'checked' : ''}> \${formatLabel('Name', getActionValue('action.name'))}
                              </label>
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                  <input type="checkbox" name="bug_type" value="action.type" \${isChecked('action.type') ? 'checked' : ''}> \${formatLabel('Type', getActionValue('action.type'))}
                              </label>
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                  <input type="checkbox" name="bug_type" value="action.verb" \${isChecked('action.verb') ? 'checked' : ''}> \${formatLabel('Verb', getActionValue('action.verb'))}
                              </label>
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                  <input type="checkbox" name="bug_type" value="action.content" \${isChecked('action.content') ? 'checked' : ''}> \${formatLabel('Content', getActionValue('action.content'))}
                              </label>
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                  <input type="checkbox" name="bug_type" value="action.purpose" \${isChecked('action.purpose') ? 'checked' : ''}> \${formatLabel('Purpose', getActionValue('action.purpose'))}
                              </label>
                          </div>
                      </div>
                  </div>
                  
                  <!-- Divider 1 -->
                  <div style="width: 1px; background-color: #ddd; align-self: stretch; margin: 0 15px;"></div>
                  
                  <!-- Panel After Info Section -->
                  <div style="flex: 1; min-width: 0; padding: 0 15px;">
                      <h4 style="margin: 0 0 10px 0; font-size: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Panel After Info</h4>
                      <div style="display: flex; flex-direction: column; gap: 15px;">
                          <div style="width: 100%; border: 1px solid #eee; padding: 5px; border-radius: 4px; display: flex; flex-direction: column; align-items: center;">
                              <div style="margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #555;">Panel Image</div>
                              \${getActionValue('panel_after.image') ? 
                                \`<img src="\${getActionValue('panel_after.image')}" style="max-width: 100%; max-height: 150px; object-fit: contain; border: 1px solid #ddd;" />\` : 
                                \`<div style="color: #999; font-size: 12px; padding: 20px; text-align: center;">No Image<br>(or N/A)</div>\`
                              }
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px; font-size: 12px;">
                                  <input type="checkbox" name="bug_type" value="panel_after.image" \${isChecked('panel_after.image') ? 'checked' : ''}> Image Incorrect
                              </label>
                          </div>
                          <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                  <input type="checkbox" name="bug_type" value="panel_after.name" \${isChecked('panel_after.name') ? 'checked' : ''}> \${formatLabel('Name', getActionValue('panel_after.name'))}
                              </label>
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                  <input type="checkbox" name="bug_type" value="panel_after.type" \${isChecked('panel_after.type') ? 'checked' : ''}> \${formatLabel('Type', getActionValue('panel_after.type'))}
                              </label>
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                  <input type="checkbox" name="bug_type" value="panel_after.verb" \${isChecked('panel_after.verb') ? 'checked' : ''}> \${formatLabel('Verb', getActionValue('panel_after.verb'))}
                              </label>
                          </div>
                          <div style="margin-top: 5px; padding: 8px; background: #f8f9fa; border: 1px solid #eee; border-radius: 4px;">
                              <div style="font-weight: bold; font-size: 12px; color: #555; margin-bottom: 6px;">Actions on this panel: \${actionItem && actionItem.panel_after_actions ? actionItem.panel_after_actions.length : 0}</div>
                              <div style="max-height: 120px; overflow-y: auto; font-size: 12px; color: #666;">
                                  \${actionItem && actionItem.panel_after_actions && actionItem.panel_after_actions.length > 0
                                    ? actionItem.panel_after_actions.map((a, i) => \`<div style="padding: 2px 0; border-bottom: 1px solid #eee;">\${i + 1}. \${a.name || 'Unknown'}</div>\`).join('')
                                    : '<div style="color: #999; font-style: italic;">No actions recorded</div>'
                                  }
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  <!-- Divider 2 -->
                  <div style="width: 1px; background-color: #ddd; align-self: stretch; margin: 0 15px;"></div>
                  
                  <!-- Panel After Actions Section -->
                  <div style="flex: 1; min-width: 0; padding-left: 15px;">
                      <h4 style="margin: 0 0 10px 0; font-size: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Panel After Actions</h4>
                      <div style="display: flex; flex-direction: column; gap: 10px;">
                          <div style="display: flex; align-items: center; gap: 10px;">
                              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1;">
                                  <input type="checkbox" name="bug_type" value="panel_after.missing_actions" \${isChecked('panel_after.missing_actions') || isChecked('panel.missing_actions') ? 'checked' : ''}> Missing actions
                              </label>
                              <button id="detectMissingActionsBtn" type="button" style="padding: 6px 12px; border: 1px solid #007bff; background: #007bff; color: white; border-radius: 4px; cursor: pointer; font-size: 13px; white-space: nowrap;">Detect Missing Actions By AI</button>
                          </div>
                          <div>
                              <label style="display: block; margin-bottom: 5px; font-size: 13px; color: #555;">Danh sách action bị thiếu:</label>
                              <div id="missingActionsListContainer" style="max-height: 200px; overflow-y: auto; border: 1px solid #ccc; border-radius: 4px; padding: 8px;">
                                  <!-- Actions rendered dynamically -->
                              </div>
                              <button id="addMissingActionBtn" type="button" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 8px; font-size: 13px;">➕ Add missing action</button>
                          </div>
                      </div>
                  </div>
              </div>
              
              <div>
                  <h4 style="margin: 0 0 10px 0; font-size: 15px;">Note</h4>
                  <textarea id="raiseBugNote" rows="3" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;" placeholder="Mô tả chi tiết lỗi...">\${currentBugInfo?.note || ''}</textarea>
              </div>
          \`;
          
          // === Missing Actions Interactive List ===
          let missingActionsArray = getMissingActionsArray();

          const renderMissingActionsList = () => {
              const container = content.querySelector('#missingActionsListContainer');
              if (!container) return;
              container.innerHTML = '';

              if (missingActionsArray.length === 0) {
                  container.innerHTML = '<div style="color: #999; font-size: 12px; text-align: center; padding: 10px;">Chưa có action nào. Nhấn "Detect Missing Actions By AI" hoặc "➕ Add Action" để thêm.</div>';
                  return;
              }

              missingActionsArray.forEach((action, index) => {
                  const row = document.createElement('div');
                  row.className = 'missing-action-row';
                  row.style.cssText = 'display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px;';

                  const nameInput = document.createElement('input');
                  nameInput.type = 'text';
                  nameInput.value = action.mising_action_name || '';
                  nameInput.placeholder = 'Action name';
                  nameInput.style.cssText = 'flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;';
                  nameInput.addEventListener('input', (e) => {
                      missingActionsArray[index].mising_action_name = e.target.value;
                  });

                  const reasonInput = document.createElement('textarea');
                  reasonInput.value = action.mising_action_reason || '';
                  reasonInput.placeholder = 'Reason';
                  reasonInput.style.cssText = 'flex: 2; padding: 6px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; min-height: 32px; font-size: 13px; font-family: inherit;';
                  reasonInput.addEventListener('input', (e) => {
                      missingActionsArray[index].mising_action_reason = e.target.value;
                  });

                  const deleteBtn = document.createElement('button');
                  deleteBtn.type = 'button';
                  deleteBtn.textContent = '🗑️';
                  deleteBtn.style.cssText = 'padding: 6px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; flex-shrink: 0;';
                  deleteBtn.addEventListener('click', () => {
                      missingActionsArray.splice(index, 1);
                      renderMissingActionsList();
                  });

                  row.appendChild(nameInput);
                  row.appendChild(reasonInput);
                  row.appendChild(deleteBtn);
                  container.appendChild(row);
              });
          };

          // Initial render
          renderMissingActionsList();

          // Add Action button
          const addMissingActionBtn = content.querySelector('#addMissingActionBtn');
          if (addMissingActionBtn) {
              addMissingActionBtn.addEventListener('click', () => {
                  missingActionsArray.push({ mising_action_name: '', mising_action_reason: '' });
                  renderMissingActionsList();
                  // Scroll to bottom of list
                  const container = content.querySelector('#missingActionsListContainer');
                  if (container) container.scrollTop = container.scrollHeight;
              });
          }

          // Setup Detect Missing Actions By AI button handler
          const detectMissingActionsBtn = content.querySelector('#detectMissingActionsBtn');
          if (detectMissingActionsBtn) {
              detectMissingActionsBtn.addEventListener('click', async () => {
                  if (!window.detectMissingActionsByAI) {
                      if (typeof showToast === 'function') {
                          showToast('⚠️ detectMissingActionsByAI is not available');
                      } else {
                          alert('detectMissingActionsByAI is not available');
                      }
                      return;
                  }

                  // Show loading state
                  const originalText = detectMissingActionsBtn.textContent;
                  detectMissingActionsBtn.disabled = true;
                  detectMissingActionsBtn.textContent = '⏳ Detecting...';
                  detectMissingActionsBtn.style.opacity = '0.7';
                  detectMissingActionsBtn.style.cursor = 'not-allowed';

                  try {
                      const panelAfterId = actionItem && (actionItem.panel_after_id || actionItem.panel_after_item_id) || null;
                      if (!panelAfterId) {
                          if (typeof showToast === 'function') {
                              showToast('⚠️ Không tìm thấy panel_after cho action này');
                          }
                          return;
                      }
                      const result = await window.detectMissingActionsByAI(panelAfterId);

                      if (result && Array.isArray(result) && result.length > 0) {
                          // Populate the interactive list with results
                          missingActionsArray = result.map(item => ({
                              mising_action_name: item.mising_action_name || '',
                              mising_action_reason: item.mising_action_reason || ''
                          }));
                          renderMissingActionsList();

                          // Auto-check the missing_actions checkbox
                          const missingActionsCheckbox = content.querySelector('input[name="bug_type"][value="panel_after.missing_actions"]');
                          if (missingActionsCheckbox) {
                              missingActionsCheckbox.checked = true;
                          }

                          if (typeof showToast === 'function') {
                              showToast('✅ Phát hiện ' + result.length + ' action(s) bị thiếu');
                          }
                      } else {
                          if (typeof showToast === 'function') {
                              showToast('✅ Không phát hiện action nào bị thiếu');
                          }
                      }
                  } catch (err) {
                      console.error('Error detecting missing actions:', err);
                      if (typeof showToast === 'function') {
                          showToast('❌ Lỗi khi detect missing actions: ' + (err.message || err));
                      } else {
                          alert('Error: ' + (err.message || err));
                      }
                  } finally {
                      // Restore button state
                      detectMissingActionsBtn.disabled = false;
                      detectMissingActionsBtn.textContent = originalText;
                      detectMissingActionsBtn.style.opacity = '1';
                      detectMissingActionsBtn.style.cursor = 'pointer';
                  }
              });
          }
          
          const closeHandler = () => {
              modal.style.display = 'none';
              closeBtn.removeEventListener('click', closeHandler);
              cancelBtn.removeEventListener('click', closeHandler);
              confirmBtn.replaceWith(confirmBtn.cloneNode(true)); // remove all listeners
          };
          
          closeBtn.addEventListener('click', closeHandler);
          cancelBtn.addEventListener('click', closeHandler);
          
          confirmBtn.onclick = async () => {
              const note = document.getElementById('raiseBugNote').value;
              const checkboxes = content.querySelectorAll('input[name="bug_type"]:checked');
              
              const bugNameMap = {
                  "action.name": "Action Name",
                  "action.image": "Action Image or Position",
                  "action.type": "Action Type",
                  "action.verb": "Action Verb",
                  "action.content": "Action Content",
                  "action.purpose": "Action Purpose",
                  "panel_after.name": "Panel After Name",
                  "panel_after.image": "Panel After Image or Position",
                  "panel_after.type": "Panel After Type",
                  "panel_after.verb": "Panel After Verb",
                  "panel_after.missing_actions": "Missing Actions"
              };
              
              // Get active bugs from checkboxes
              const activeBugs = Array.from(checkboxes).map(cb => {
                  const bug = {
                      bug_type: cb.value,
                      bug_name: bugNameMap[cb.value] || cb.value,
                      bug_fixed: false
                  };
                  // Add description for missing actions (store as JSON array string)
                  if (cb.value === 'panel_after.missing_actions') {
                      const filteredActions = missingActionsArray.filter(a => 
                          a && a.mising_action_name && a.mising_action_name.trim()
                      );
                      if (filteredActions.length > 0) {
                          bug.description = JSON.stringify(filteredActions);
                      }
                  }
                  return bug;
              });
              
              // Preserve existing fixed bugs
              const existingFixedBugs = (currentBugInfo && currentBugInfo.details) 
                  ? currentBugInfo.details.filter(d => d.bug_fixed === true) 
                  : [];
              
              // Filter out fixed bugs that are now active (checked)
              const activeTypes = new Set(activeBugs.map(b => b.bug_type));
              const keptFixedBugs = existingFixedBugs.filter(d => !activeTypes.has(d.bug_type));
              
              const details = [...activeBugs, ...keptFixedBugs];
              
              const bugInfo = {
                  note: note,
                  details: details
              };
              
              if (window.raiseBug) {
                  // Disable button and show loading state
                  confirmBtn.disabled = true;
                  const originalText = confirmBtn.textContent;
                  confirmBtn.textContent = 'Saving...';
                  confirmBtn.style.opacity = '0.7';
                  confirmBtn.style.cursor = 'not-allowed';

                  try {
                      await window.raiseBug(actionId, bugInfo);

                      if (typeof refreshPanelTree === 'function') {
                          refreshPanelTree();
                      }
                      
                      if (typeof showToast === 'function') {
                          showToast('✅ Bug reported successfully');
                      } else {
                          alert('Bug reported successfully');
                      }
                      closeHandler();
                  } catch (error) {
                      console.error('Error raising bug:', error);
                      alert('Failed to raise bug: ' + (error.message || error));
                      // Re-enable button on error
                      confirmBtn.disabled = false;
                      confirmBtn.textContent = originalText;
                      confirmBtn.style.opacity = '1';
                      confirmBtn.style.cursor = 'pointer';
                  }
              } else {
                  console.warn('window.raiseBug is not defined');
                  alert('RaiseBug feature is not available (function missing).');
              }
          };
      }

      // Bug Tooltip + helpers for bug state
      function formatResolvedAtGmt7(iso) {
          if (!iso) return '';
          try {
              const d = new Date(iso);
              return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }) + ' (GMT+7)';
          } catch (e) { return iso; }
      }
      function hasAllBugFixed(bugInfo) {
          if (!bugInfo || !Array.isArray(bugInfo.details) || bugInfo.details.length === 0) return false;
          return bugInfo.details.every(d => d.bug_fixed === true);
      }
      function hasUnfixedBug(bugInfo) {
          if (!bugInfo || !Array.isArray(bugInfo.details)) return !!bugInfo;
          return bugInfo.details.some(d => d.bug_fixed !== true);
      }
      let bugTooltip = null;
      function showBugTooltip(e, note, bugInfo) {
          if (bugTooltip) bugTooltip.remove();
          
          bugTooltip = document.createElement('div');
          bugTooltip.style.cssText = \`
              position: fixed;
              left: \${e.clientX + 10}px;
              top: \${e.clientY + 10}px;
              background: rgba(0, 0, 0, 0.9);
              color: white;
              padding: 10px;
              border-radius: 6px;
              font-size: 12px;
              z-index: 10000001;
              max-width: 320px;
              pointer-events: none;
              white-space: pre-wrap;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          \`;
          
          let content = '';
          if (bugInfo) {
              if (bugInfo.note) {
                  content += \`<strong>Note:</strong> \${bugInfo.note}\n\`;
              }
              if (bugInfo.details && Array.isArray(bugInfo.details) && bugInfo.details.length > 0) {
                  content += \`\n<strong>Details:</strong>\n\`;
                  bugInfo.details.forEach(d => {
                      const statusText = d.bug_fixed ? '[đã sửa]' : '[cần sửa]';
                      const resolvedAt = d.bug_fixed && d.resolved_at ? ' — ' + formatResolvedAtGmt7(d.resolved_at) : '';
                      content += \`- \${d.bug_name} \${statusText}\${resolvedAt}\n\`;
                      
                      // Show missing actions details in tooltip
                      if ((d.bug_type === 'panel_after.missing_actions' || d.bug_type === 'panel.missing_actions') && d.description) {
                          let actionsArr = [];
                          try {
                              if (typeof d.description === 'string') {
                                  const parsed = JSON.parse(d.description);
                                  if (Array.isArray(parsed)) {
                                      actionsArr = parsed.filter(a => a && a.mising_action_name);
                                  }
                              } else if (Array.isArray(d.description)) {
                                  actionsArr = d.description.filter(a => a && a.mising_action_name);
                              }
                          } catch (e) {
                              // Legacy string format fallback
                              if (typeof d.description === 'string' && d.description.trim()) {
                                  const lines = d.description.split('\\n').filter(l => l.trim());
                                  actionsArr = lines.map(line => {
                                      const ci = line.indexOf(':');
                                      if (ci === -1) return { mising_action_name: line.trim(), mising_action_reason: '' };
                                      return { mising_action_name: line.substring(0, ci).trim(), mising_action_reason: line.substring(ci + 1).trim() };
                                  });
                              }
                          }
                          if (actionsArr.length > 0) {
                              actionsArr.forEach(a => {
                                  const reason = (a.mising_action_reason || '').trim();
                                  content += \`  · \${a.mising_action_name}\${reason ? ': ' + reason : ''}\n\`;
                              });
                          }
                      }
                  });
              }
          } else if (note) {
               content += \`<strong>Note:</strong> \${note}\`;
          } else {
               content += \`Bug detected\`;
          }
          
          bugTooltip.innerHTML = content;
          document.body.appendChild(bugTooltip);
      }
      
      function hideBugTooltip() {
          if (bugTooltip) {
              bugTooltip.remove();
              bugTooltip = null;
          }
      }

      // Resolved Bug Dialog (ADMIN/VALIDATE): same layout as Raise Bug, mark bug details as fixed
      let resolvedBugCurrentActionId = null;
      async function openResolvedBugDialog(actionId, bugInfo, actionItem = null) {
          if (!bugInfo || !Array.isArray(bugInfo.details) || bugInfo.details.length === 0) {
              if (typeof showToast === 'function') showToast('Action này chưa có chi tiết bug.');
              else alert('Action này chưa có chi tiết bug.');
              return;
          }
          if (!actionItem && typeof window.getActionItem === 'function') {
              try { actionItem = await window.getActionItem(actionId); } catch (e) { console.warn('getActionItem failed:', e); }
          }
          resolvedBugCurrentActionId = actionId;
          const modal = document.getElementById('resolvedBugModal');
          const content = document.getElementById('resolvedBugContent');
          const closeBtn = document.getElementById('closeResolvedBugModalBtn');
          const cancelBtn = document.getElementById('cancelResolvedBugBtn');
          const confirmBtn = document.getElementById('confirmResolvedBugBtn');
          if (!modal || !content) return;
          modal.style.display = 'flex';

          const getActionValue = (field) => {
              if (!actionItem) return '';
              const val = (prop) => actionItem[prop] !== undefined ? actionItem[prop] : '';
              switch (field) {
                  case 'action.name': return val('item_name') || val('name');
                  case 'action.type': return val('item_type') || val('type');
                  case 'action.verb': return val('item_verb') || val('verb');
                  case 'action.content': return val('item_content') || val('content');
                  case 'action.purpose': return val('item_purpose') || val('purpose');
                  case 'action.image': return val('image_url') || val('item_image_url') || '';
                  case 'panel_after.name': return val('panel_after_name');
                  case 'panel_after.type': return val('panel_after_type');
                  case 'panel_after.verb': return val('panel_after_verb');
                  case 'panel_after.image': return val('panel_after_image');
                  default: return '';
              }
          };
          const formatLabel = (label, value) => {
              if (value === undefined || value === null || value === '') return \`<span>\${label}: <span style="font-weight:normal; color:#999;">N/A</span></span>\`;
              if (typeof value === 'string' && value.match(/^https?:.*\\.(jpg|jpeg|png|gif|webp|svg)/i)) return \`<span>\${label}: <img src="\${value}" style="max-height: 40px; vertical-align: middle; margin-left: 5px; border: 1px solid #ddd; border-radius: 4px;" alt="Image" /></span>\`;
              const displayValue = String(value).length > 100 ? String(value).substring(0, 100) + '...' : value;
              return \`<span>\${label}: <span style="font-weight:normal; color:#555;">\${displayValue}</span></span>\`;
          };
          const formatResolvedAt = (iso) => {
              if (!iso) return '';
              try { const d = new Date(iso); return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }) + ' (GMT+7)'; } catch (e) { return iso; }
          };
          const getDetailByType = (type) => bugInfo.details.find(d => d.bug_type === type);
          const isFixed = (type) => { const d = getDetailByType(type); return d && d.bug_fixed === true; };
          const getDetailIndex = (type) => bugInfo.details.findIndex(d => d.bug_type === type);
          const bugNameMap = { 'action.name': 'Action Name', 'action.image': 'Action Image or Position', 'action.type': 'Action Type', 'action.verb': 'Action Verb', 'action.content': 'Action Content', 'action.purpose': 'Action Purpose', 'panel_after.name': 'Panel After Name', 'panel_after.image': 'Panel After Image or Position', 'panel_after.type': 'Panel After Type', 'panel_after.verb': 'Panel After Verb' };

          const rowHtml = (type) => {
              const detail = getDetailByType(type);
              const idx = getDetailIndex(type);
              const name = bugNameMap[type] || type;
              const isImageType = type === 'action.image' || type === 'panel_after.image';
              const valueHtml = isImageType ? name : formatLabel(name, getActionValue(type));
              if (detail && detail.bug_fixed === true) {
                  return \`<div style="display: flex; align-items: center; gap: 8px; padding: 6px 0;"><span style="color:#28a745;">✓</span> \${valueHtml} <span style="color:#28a745; font-size:12px;">[đã sửa] \${formatResolvedAt(detail.resolved_at)}</span></div>\`;
              }
              if (detail) {
                  return \`<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;"><input type="checkbox" name="resolved_bug" data-index="\${idx}"> \${valueHtml}</label>\`;
              }
              return \`<div style="display: flex; align-items: center; gap: 8px; padding: 6px 0;">\${valueHtml}</div>\`;
          };

          content.innerHTML = \`
              <div style="font-size: 13px; color: #666; margin-bottom: 15px; padding: 10px; background: #d4edda; border: 1px solid #28a745; border-radius: 6px; line-height: 1.5;">
                  <strong>Hướng dẫn:</strong> Chọn các mục đã được sửa xong, sau đó bấm <strong>OK</strong>.
              </div>
              <div style="margin-bottom: 15px;">
                  <h4 style="margin: 0 0 10px 0; font-size: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Action Info</h4>
                  <div style="display: flex; gap: 15px;">
                      <div style="flex: 1; display: grid; grid-template-columns: 1fr; gap: 10px;">
                          \${rowHtml('action.name')}
                          \${rowHtml('action.type')}
                          \${rowHtml('action.verb')}
                          \${rowHtml('action.content')}
                          \${rowHtml('action.purpose')}
                      </div>
                      <div style="width: 200px; flex-shrink: 0; border: 1px solid #eee; padding: 5px; border-radius: 4px; display: flex; flex-direction: column; align-items: center;">
                          <div style="margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #555;">Action Image</div>
                          \${getActionValue('action.image') ? \`<img src="\${getActionValue('action.image')}" style="max-width: 100%; max-height: 150px; object-fit: contain; border: 1px solid #ddd;" />\` : \`<div style="color:#999; font-size:12px; padding:20px; text-align:center;">No Image<br>(or N/A)</div>\`}
                          \${rowHtml('action.image')}
                      </div>
                  </div>
              </div>
              <div style="margin-bottom: 15px;">
                  <h4 style="margin: 0 0 10px 0; font-size: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Panel After Info</h4>
                  <div style="display: flex; gap: 15px;">
                      <div style="flex: 1; display: grid; grid-template-columns: 1fr; gap: 10px;">
                          \${rowHtml('panel_after.name')}
                          \${rowHtml('panel_after.type')}
                          \${rowHtml('panel_after.verb')}
                      </div>
                      <div style="width: 200px; flex-shrink: 0; border: 1px solid #eee; padding: 5px; border-radius: 4px; display: flex; flex-direction: column; align-items: center;">
                          <div style="margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #555;">Panel Image</div>
                          \${getActionValue('panel_after.image') ? \`<img src="\${getActionValue('panel_after.image')}" style="max-width: 100%; max-height: 150px; object-fit: contain; border: 1px solid #ddd;" />\` : \`<div style="color:#999; font-size:12px; padding:20px; text-align:center;">No Image<br>(or N/A)</div>\`}
                          \${rowHtml('panel_after.image')}
                      </div>
                  </div>
              </div>
              <div>
                  <h4 style="margin: 0 0 10px 0; font-size: 15px;">Note</h4>
                  <textarea id="resolvedBugNote" rows="3" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;" readonly>\${(bugInfo && bugInfo.note) || ''}</textarea>
              </div>
          \`;

          const closeHandler = () => {
              modal.style.display = 'none';
              resolvedBugCurrentActionId = null;
              if (closeBtn) closeBtn.removeEventListener('click', closeHandler);
              if (cancelBtn) cancelBtn.removeEventListener('click', closeHandler);
          };
          closeBtn.onclick = closeHandler;
          cancelBtn.onclick = closeHandler;
          confirmBtn.onclick = async () => {
              const checkboxes = content.querySelectorAll('input[name="resolved_bug"]:checked');
              const indicesToMark = new Set(Array.from(checkboxes).map(cb => parseInt(cb.dataset.index, 10)));
              const updatedDetails = bugInfo.details.map((d, i) => {
                  if (indicesToMark.has(i)) return { ...d, bug_fixed: true, resolved_at: new Date().toISOString() };
                  return d;
              });
              const updatedBugInfo = { ...bugInfo, details: updatedDetails };
              if (typeof window.resolveBug === 'function') {
                  try {
                      await window.resolveBug(resolvedBugCurrentActionId, updatedBugInfo);
                      if (typeof refreshPanelTree === 'function') refreshPanelTree();
                      if (window.getPanelTree) {
                          const data = await (typeof getFilteredPanelTree === 'function' ? getFilteredPanelTree(panelLogDisplayMode) : window.getPanelTree(panelLogDisplayMode));
                          panelTreeData = data || []; renderPanelTree();
                      }
                      if (typeof showToast === 'function') showToast('✅ Đã cập nhật bug resolved.');
                      closeHandler();
                  } catch (err) {
                      console.error('resolveBug error:', err);
                      if (typeof showToast === 'function') showToast('❌ Cập nhật thất bại.');
                      else alert('Cập nhật thất bại: ' + (err.message || err));
                  }
              } else {
                  if (typeof showToast === 'function') showToast('ResolveBug không khả dụng.');
                  else alert('ResolveBug không khả dụng.');
              }
          };
      }

      let viewersTooltip = null;
      async function showViewersTooltip(e, actionItemId) {
          if (viewersTooltip) viewersTooltip.remove();
          if (!actionItemId) return;
          const getViewers = typeof window.getValidationViewers === 'function' ? window.getValidationViewers : null;
          if (!getViewers) return;
          viewersTooltip = document.createElement('div');
          viewersTooltip.id = 'graph-viewers-tooltip';
          viewersTooltip.style.cssText = \`
              position: fixed;
              left: \${e.clientX + 10}px;
              top: \${e.clientY + 10}px;
              background: rgba(0, 0, 0, 0.92);
              color: white;
              padding: 12px;
              border-radius: 8px;
              font-size: 12px;
              z-index: 10000001;
              max-width: 280px;
              pointer-events: none;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          \`;
          viewersTooltip.innerHTML = '<span style="color:#ccc;">Đang tải...</span>';
          document.body.appendChild(viewersTooltip);
          try {
              const viewers = await getViewers(actionItemId);
              if (!viewers || viewers.length === 0) {
                  viewersTooltip.innerHTML = '<div style="color:#9e9e9e;">Chưa có lượt xem</div>';
              } else {
                  const fmtTime = (s) => {
                      if (!s) return '';
                      try { const d = new Date(s); return d.toLocaleString('vi-VN'); } catch (_) { return s; }
                  };
                  let html = '<div style="font-weight:600; margin-bottom:8px; color:#4fc3f7;">Người xem</div>';
                  viewers.forEach(v => {
                      html += '<div style="display:flex; justify-content:space-between; gap:12px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.1);">';
                      html += '<span>' + (v.collaborator_name || v.collaborator_code || '—') + '</span>';
                      html += '<span style="color:#9e9e9e;">' + (v.view_count || 0) + ' lần' + (v.updated_at ? ' · ' + fmtTime(v.updated_at) : '') + '</span>';
                      html += '</div>';
                  });
                  viewersTooltip.innerHTML = html;
              }
          } catch (err) {
              viewersTooltip.innerHTML = '<div style="color:#f44336;">Không tải được danh sách</div>';
          }
      }
      function hideViewersTooltip() {
          if (viewersTooltip) {
              viewersTooltip.remove();
              viewersTooltip = null;
          }
      }
      
      let sessionAssigneeTooltip = null;
      async function showSessionAssigneeTooltip(e, mySession) {
          if (sessionAssigneeTooltip) sessionAssigneeTooltip.remove();
          if (!mySession) return;
          const getInfo = typeof window.getSessionAssigneeInfo === 'function' ? window.getSessionAssigneeInfo : null;
          if (!getInfo) return;
          sessionAssigneeTooltip = document.createElement('div');
          sessionAssigneeTooltip.id = 'session-assignee-tooltip';
          sessionAssigneeTooltip.style.cssText = \`
              position: fixed;
              left: \${e.clientX + 10}px;
              top: \${e.clientY + 10}px;
              background: rgba(0, 0, 0, 0.92);
              color: white;
              padding: 12px;
              border-radius: 8px;
              font-size: 12px;
              z-index: 10000001;
              max-width: 280px;
              pointer-events: none;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          \`;
          sessionAssigneeTooltip.innerHTML = '<span style="color:#ccc;">Đang tải...</span>';
          document.body.appendChild(sessionAssigneeTooltip);
          try {
              const info = await getInfo(mySession);
              if (!info) {
                  sessionAssigneeTooltip.innerHTML = '<div style="color:#9e9e9e;">Chưa có assignee</div>';
              } else {
                  // Hiển thị thời điểm assigned theo GMT+7 (Asia/Ho_Chi_Minh)
                  const fmtTimeGMT7 = (s) => {
                      if (!s) return '';
                      try {
                          let iso = String(s).trim();
                          if (iso && !/Z|[+-]\d{2}:?\d{2}$/.test(iso) && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(iso)) {
                              iso = iso.replace(' ', 'T') + 'Z';
                          }
                          const d = new Date(iso);
                          if (isNaN(d.getTime())) return s;
                          return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
                      } catch (_) { return s; }
                  };
                  let html = '<div style="font-weight:600; margin-bottom:8px; color:#4fc3f7;">Assigned</div>';
                  html += '<div style="padding:4px 0;">Name: ' + (info.name || info.assignee || '—') + '</div>';
                  html += '<div style="padding:4px 0;">Device ID: ' + (info.device_id || '—') + '</div>';
                  html += '<div style="padding:4px 0; color:#9e9e9e;">Assigned: ' + fmtTimeGMT7(info.updated_at) + ' (GMT+7)</div>';
                  sessionAssigneeTooltip.innerHTML = html;
              }
          } catch (err) {
              sessionAssigneeTooltip.innerHTML = '<div style="color:#f44336;">Không tải được</div>';
          }
      }
      function hideSessionAssigneeTooltip() {
          if (sessionAssigneeTooltip) {
              sessionAssigneeTooltip.remove();
              sessionAssigneeTooltip = null;
          }
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
        selectPanelBtn.textContent = 'SELECT PANEL (chọn một panel đã vẽ)';
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
        drawNewPanelBtn.textContent = 'DRAW NEW PANEL (vẽ panel mới nếu chưa có)';
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
        
        // Add freeze screenshot tip
        const freezeTip = document.createElement('div');
        freezeTip.style.cssText = 'margin-top: 12px; padding: 10px; background: rgba(100, 200, 255, 0.1); border: 1px solid rgba(100, 200, 255, 0.3); border-radius: 6px; font-size: 12px; color: #8cf;';
        freezeTip.innerHTML = '<div style="font-weight: 600; margin-bottom: 6px;">💡 Capture Dropdown/Content auto hide:</div>' +
          '<div style="color: #aaa; line-height: 1.5;">' +
            'Nếu cần capture dropdown/content tự động ẩn:<br>' +
            '<b style="color: #fff;">1.</b> Mở dropdown/popup trên Tracking Browser<br>' +
            '<b style="color: #fff;">2.</b> Bấm <span style="background: #444; padding: 2px 6px; border-radius: 3px; font-family: monospace;">F2</span> để freeze screenshot<br>' +
            '<b style="color: #fff;">3.</b> Click <b>DRAW NEW PANEL</b> - sẽ dùng ảnh đã freeze' +
          '</div>';
        step3Div.appendChild(freezeTip);
        
        return step3Div;
      }
      
      async function handlePanelSelected(evt) {
        selectedPanelId = evt.panel_id;
        renderPanelTree();
        
        // Update save button text based on draw_flow_state
        if (evt.item_category === 'PANEL' && evt.draw_flow_state !== undefined) {
          const hasChanges = saveBtn.classList.contains('has-changes');
          updateSaveBtnState(hasChanges, evt.draw_flow_state);
        }
        
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
            // Only show "Draw panel & detect actions" button for DRAW role
            drawPanelAndDetectActionsBtn.style.display = (currentRole === 'DRAW') ? 'inline-block' : 'none';
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
        
        const existingPurposeEvent = container.querySelector('.event[data-event-type="purpose"]');
        if (existingPurposeEvent) {
          existingPurposeEvent.remove();
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
          
          // Step 3: Check purpose of action (only show when action has step_info)
          if (evt.action_info && evt.action_info.step_info) {
            const stepHeader = document.createElement('div');
            stepHeader.style.cssText = 'font-weight: bold; margin-bottom: 5px; margin-top: 10px; color: #333;';
            stepHeader.textContent = 'Bước 3: Kiểm tra action purpose';
            actionDiv.appendChild(stepHeader);

            const purposeDiv = document.createElement('div');
            purposeDiv.className = 'event';
            purposeDiv.style.position = 'relative';
            purposeDiv.style.background = '#ffe4ec';
            purposeDiv.style.border = '2px solid #ff69b4';
            purposeDiv.setAttribute('data-event-type', 'purpose');
            
            const purposeTitle = document.createElement('div');
            purposeTitle.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 10px; color: #333; text-align: center; background: #ffb6c1; padding: 8px; border-radius: 4px;';
            const titleStepPurpose = evt.action_info.step_purpose || evt.action_info.purpose || '';
            const titleActionPurpose = evt.action_info.action_purpose || '';
            const titleReason = evt.action_info.reason || evt.action_info.step_reason || '';
            purposeTitle.innerHTML = '<strong>Action Purpose:</strong> ' + (titleActionPurpose || 'N/A') + '<br><span style="font-weight: normal; font-size: 12px;"><strong>Step Purpose:</strong> ' + (titleStepPurpose || 'N/A') + '</span><br><span style="font-weight: normal; font-size: 12px;"><strong>Reason:</strong> ' + (titleReason || 'N/A') + '</span>';
            purposeDiv.appendChild(purposeTitle);
            
            // ReGen button container
            const regenContainer = document.createElement('div');
            regenContainer.style.cssText = 'text-align: center; margin-top: 12px;';
            
            const regenBtn = document.createElement('button');
            regenBtn.textContent = 'ReGen';
            regenBtn.style.cssText = 'padding: 8px 20px; background: #ff69b4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s ease;';
            regenBtn.addEventListener('mouseenter', () => {
              regenBtn.style.background = '#ff1493';
            });
            regenBtn.addEventListener('mouseleave', () => {
              regenBtn.style.background = '#ff69b4';
            });
            regenBtn.addEventListener('click', async () => {
              regenBtn.disabled = true;
              regenBtn.textContent = 'Đang detect...';
              regenBtn.style.opacity = '0.6';
              
              try {
                if (window.detectActionPurpose) {
                  const result = await window.detectActionPurpose(evt.panel_id);
                  
                  // Update purposeTitle directly with new values
                  if (result) {
                    const newStepPurpose = result.step_purpose || 'N/A';
                    const newActionPurpose = result.action_purpose || 'N/A';
                    const newReason = result.reason || 'N/A';
                    purposeTitle.innerHTML = '<strong>Action Purpose:</strong> ' + newActionPurpose + '<br><span style="font-weight: normal; font-size: 12px;"><strong>Step Purpose:</strong> ' + newStepPurpose + '</span><br><span style="font-weight: normal; font-size: 12px;"><strong>Reason:</strong> ' + newReason + '</span>';
                  } else {
                    // Fallback: Refresh the view
                    if (window.selectPanel) {
                      await window.selectPanel(evt.panel_id);
                    }
                  }
                } else {
                  showToast('❌ detectActionPurpose không khả dụng');
                }
              } catch (err) {
                console.error('ReGen purpose failed:', err);
                showToast('❌ Lỗi khi detect action purpose');
              } finally {
                regenBtn.disabled = false;
                regenBtn.textContent = 'ReGen';
                regenBtn.style.opacity = '1';
              }
            });
            regenContainer.appendChild(regenBtn);
            
            // Helper text
            const helperText = document.createElement('div');
            helperText.style.cssText = 'font-size: 11px; color: #888; margin-top: 6px;';
            helperText.textContent = 'ReGen (có thể call lại cho đến khi đúng thì thôi)';
            regenContainer.appendChild(helperText);
            
            purposeDiv.appendChild(regenContainer);
            actionDiv.appendChild(purposeDiv);
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
            // Only show "Need Detect Actions" for DRAW role
            if (currentRole === 'DRAW') {
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
      
      // Handle panel selected for ADMIN/VALIDATE when clicking a PANEL node (panel info view)
      async function handlePanelSelectedForValidatePanel(evt) {
        selectedPanelId = evt.panel_id;
        
        // Update selection highlight without re-rendering entire tree to preserve session-assigned-to-me highlight
        const treeContainer = document.getElementById('panel-tree');
        if (treeContainer) {
          treeContainer.querySelectorAll('.tree-node-content').forEach(el => {
            el.classList.remove('selected');
          });
          const targetNode = treeContainer.querySelector('.tree-node-content[data-panel-id="' + evt.panel_id + '"]');
          if (targetNode) {
            targetNode.classList.add('selected');
          }
        }

        if (currentRole === 'VALIDATE' || currentRole === 'ADMIN') {
          if (typeof updateButtonsVisibility === 'function') updateButtonsVisibility(currentRole);
        }

        const existingCaptureEvent = container.querySelector('.event[data-event-type="capture"]');
        if (existingCaptureEvent) existingCaptureEvent.remove();
        const existingStepEvent = container.querySelector('.event[data-event-type="step"]');
        if (existingStepEvent) existingStepEvent.remove();
        const existingPurposeEvent = container.querySelector('.event[data-event-type="purpose"]');
        if (existingPurposeEvent) existingPurposeEvent.remove();
        const existingActionDetails = container.querySelector('.event[data-event-type="action_details"]');
        if (existingActionDetails) existingActionDetails.remove();
        const existingValidateAction = container.querySelector('.event[data-event-type="validate_action"]');
        if (existingValidateAction) existingValidateAction.remove();
        const existingValidatePanelInfo = container.querySelector('.event[data-event-type="validate_panel_info"]');
        if (existingValidatePanelInfo) existingValidatePanelInfo.remove();
        const existingClickEvents = Array.from(container.querySelectorAll('.event[data-event-type="click"]'));
        existingClickEvents.forEach(el => el.remove());

        if (!evt.panel_id) return;

        const coord = evt.coordinate || evt.metadata?.global_pos || null;
        const panelInfoDiv = document.createElement('div');
        panelInfoDiv.className = 'event';
        panelInfoDiv.setAttribute('data-event-type', 'validate_panel_info');
        panelInfoDiv.setAttribute('data-timestamp', evt.timestamp || Date.now());
        panelInfoDiv.style.cssText = 'position: relative;';

        const imageWrapper = document.createElement('div');
        imageWrapper.style.cssText = 'position: relative; display: inline-block; max-width: 100%; margin-bottom: 16px;';

        let imageSrc = evt.fullscreen_url || null;
        if (!imageSrc && evt.screenshot) {
          imageSrc = (typeof evt.screenshot === 'string' && evt.screenshot.startsWith('data:')) ? evt.screenshot : 'data:image/png;base64,' + evt.screenshot;
        }
        if (imageSrc) {
          const img = document.createElement('img');
          img.src = imageSrc;
          img.style.cssText = 'max-width: 100%; display: block; border: 1px solid #ddd; border-radius: 6px;';
          img.alt = 'Panel fullscreen';
          img.onerror = function() { this.style.display = 'none'; };
          img.onload = function() {
            if (coord && coord.x != null && coord.y != null && coord.w != null && coord.h != null && cropOverlay && img.parentNode) {
              const scale = img.offsetWidth / img.naturalWidth;
              cropOverlay.style.left = (coord.x * scale) + 'px';
              cropOverlay.style.top = (coord.y * scale) + 'px';
              cropOverlay.style.width = (coord.w * scale) + 'px';
              cropOverlay.style.height = (coord.h * scale) + 'px';
              cropOverlay.style.display = 'block';
            }
          };
          imageWrapper.appendChild(img);

          const cropOverlay = document.createElement('div');
          cropOverlay.setAttribute('data-crop-overlay', '1');
          cropOverlay.style.cssText = 'position: absolute; border: 2px solid #00aaff; box-sizing: border-box; pointer-events: none; display: none;';
          imageWrapper.appendChild(cropOverlay);
        }

        panelInfoDiv.appendChild(imageWrapper);

        const itemDetailsTitle = document.createElement('div');
        itemDetailsTitle.textContent = 'Item details';
        itemDetailsTitle.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 10px; color: #333;';
        panelInfoDiv.appendChild(itemDetailsTitle);
        const infoBox = document.createElement('div');
        infoBox.style.cssText = 'background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 16px;';
        const itemFields = [
          { label: 'Name', value: evt.item_name || 'N/A' },
          { label: 'Type', value: evt.item_type || 'N/A' },
          { label: 'Verb', value: evt.item_verb || 'N/A' }
        ];
        itemFields.forEach(f => {
          const row = document.createElement('div');
          row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px; background: white; border-radius: 4px;';
          const label = document.createElement('strong');
          label.textContent = f.label + ':';
          label.style.cssText = 'flex: 0 0 60px; font-size: 13px;';
          const value = document.createElement('span');
          value.textContent = f.value;
          value.style.cssText = 'font-size: 13px; color: #333;';
          row.appendChild(label);
          row.appendChild(value);
          infoBox.appendChild(row);
        });
        panelInfoDiv.appendChild(infoBox);

        const actionInfoTitle = document.createElement('div');
        actionInfoTitle.textContent = 'Action info';
        actionInfoTitle.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 10px; color: #333;';
        panelInfoDiv.appendChild(actionInfoTitle);
        const actionInfoBox = document.createElement('div');
        actionInfoBox.style.cssText = 'background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 12px;';
        const totalCount = evt.action_count != null ? evt.action_count : (evt.actions && evt.actions.length) || 0;
        const actionListStr = evt.action_list != null ? evt.action_list : (evt.actions && evt.actions.length) ? evt.actions.map(a => a.action_name).filter(Boolean).join(', ') : '';
        const totalRow = document.createElement('div');
        totalRow.style.cssText = 'margin-bottom: 8px; padding: 6px; background: white; border-radius: 4px;';
        totalRow.innerHTML = '<strong style="font-size: 13px;">Tổng số action:</strong> <span style="font-size: 13px; color: #333;">' + totalCount + '</span>';
        actionInfoBox.appendChild(totalRow);
        const listRow = document.createElement('div');
        listRow.style.cssText = 'padding: 6px; background: white; border-radius: 4px; font-size: 13px; color: #333;';
        listRow.innerHTML = '<strong>Danh sách:</strong> ' + (actionListStr || 'N/A');
        actionInfoBox.appendChild(listRow);
        panelInfoDiv.appendChild(actionInfoBox);

        container.appendChild(panelInfoDiv);
      }

      // Handle panel selected for VALIDATE role - separate from DRAW role
      async function handlePanelSelectedForValidate(evt) {
        selectedPanelId = evt.panel_id;
        // Store the current action ID being viewed for auto-opening in Video Validate
        if (evt.item_category === 'ACTION' && evt.panel_id) {
          currentValidateActionId = evt.panel_id;
        }
        
        // Update selection highlight without re-rendering entire tree to preserve session-assigned-to-me highlight
        const treeContainer = document.getElementById('panel-tree');
        if (treeContainer) {
          treeContainer.querySelectorAll('.tree-node-content').forEach(el => {
            el.classList.remove('selected');
          });
          const targetNode = treeContainer.querySelector('.tree-node-content[data-panel-id="' + evt.panel_id + '"]');
          if (targetNode) {
            targetNode.classList.add('selected');
          }
        }
        
        if (currentRole === 'VALIDATE' || currentRole === 'ADMIN') {
          if (typeof updateButtonsVisibility === 'function') updateButtonsVisibility(currentRole);
        }
        
        // Clean up existing events (same cleanup as handlePanelSelected but separate implementation)
        const existingCaptureEvent = container.querySelector('.event[data-event-type="capture"]');
        if (existingCaptureEvent) {
          existingCaptureEvent.remove();
        }
        
        const existingStepEvent = container.querySelector('.event[data-event-type="step"]');
        if (existingStepEvent) {
          existingStepEvent.remove();
        }
        
        const existingPurposeEvent = container.querySelector('.event[data-event-type="purpose"]');
        if (existingPurposeEvent) {
          existingPurposeEvent.remove();
        }
        
        const existingActionDetails = container.querySelector('.event[data-event-type="action_details"]');
        if (existingActionDetails) {
          existingActionDetails.remove();
        }
        
        const existingValidateAction = container.querySelector('.event[data-event-type="validate_action"]');
        if (existingValidateAction) {
          existingValidateAction.remove();
        }
        
        const existingValidatePanelInfo = container.querySelector('.event[data-event-type="validate_panel_info"]');
        if (existingValidatePanelInfo) {
          existingValidatePanelInfo.remove();
        }
        
        if (!evt.panel_id) {
          const existingClickEvents = Array.from(container.querySelectorAll('.event[data-event-type="click"]'));
          existingClickEvents.forEach(el => el.remove());
          return;
        }
        
        // Only handle ACTION items
        if (evt.item_category !== 'ACTION') {
          return;
        }
        
        // Increment view_count when VALIDATE clicks action on panel log (jsonl + DB + viewitem)
        if (evt.panel_id && typeof window.incrementValidationViewCount === 'function') {
          try {
            await window.incrementValidationViewCount(evt.panel_id);
          } catch (e) {
            console.warn('incrementValidationViewCount failed:', e);
          }
        }
        
        console.log('🎯 VALIDATE ACTION detected, evt:', evt);
        
        const validateActionDiv = document.createElement('div');
        validateActionDiv.className = 'event';
        validateActionDiv.style.position = 'relative';
        validateActionDiv.setAttribute('data-timestamp', evt.timestamp || Date.now());
        validateActionDiv.setAttribute('data-event-type', 'validate_action');
        
        // Step 1: Click action
        const step1Div = document.createElement('div');
        step1Div.setAttribute('data-step', '1');
        step1Div.style.cssText = 'margin-bottom: 20px;';
        
        const step1Title = document.createElement('div');
        step1Title.textContent = 'Bước 1: Click action';
        step1Title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 10px; color: #333;';
        step1Div.appendChild(step1Title);
        
        // Action name with modality_stacks indicator
        const actionNameContainer = document.createElement('div');
        actionNameContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 10px;';
        
        const actionName = document.createElement('div');
        actionName.textContent = evt.item_name || 'Action';
        actionName.style.cssText = 'font-size: 14px; color: #333; font-weight: 500;';
        actionNameContainer.appendChild(actionName);
        
        // Add star icon if action has modality_stacks
        const hasModalityStacksForTitle = evt.action_info?.modality_stacks && 
                                         Array.isArray(evt.action_info.modality_stacks) && 
                                         evt.action_info.modality_stacks.length > 0;
        if (hasModalityStacksForTitle) {
          const importantBadge = document.createElement('span');
          importantBadge.textContent = '⭐';
          importantBadge.style.cssText = 'font-size: 16px; color: #ffc107; cursor: help;';
          importantBadge.title = 'Đây là tính năng quan trọng cần làm hết luồng';
          actionNameContainer.appendChild(importantBadge);
        }
        
        step1Div.appendChild(actionNameContainer);
        
        // Action image (from action_info.image_base64, action_info.image_url, or evt.image_url)
        const actionImageContainer = document.createElement('div');
        actionImageContainer.style.cssText = 'margin-top: 10px;';
        
        let hasImage = false;
        let imageSrc = null;
        
        // Priority 1: action_info.image_base64
        if (evt.action_info && evt.action_info.image_base64) {
          imageSrc = 'data:image/png;base64,' + evt.action_info.image_base64;
          hasImage = true;
        }
        // Priority 2: action_info.image_url
        else if (evt.action_info && evt.action_info.image_url) {
          imageSrc = evt.action_info.image_url;
          hasImage = true;
        }
        // Priority 3: evt.image_url (from baseEvent)
        else if (evt.image_url) {
          imageSrc = evt.image_url;
          hasImage = true;
        }
        
        if (hasImage && imageSrc) {
          const actionImg = document.createElement('img');
          actionImg.src = imageSrc;
          actionImg.style.cssText = 'max-width: 100%; border: 1px solid #ddd; border-radius: 6px; display: block;';
          actionImg.alt = 'Action image';
          actionImg.onerror = function() {
            console.error('Failed to load action image:', imageSrc);
            this.style.display = 'none';
          };
          actionImg.onload = function() {
            console.log('✅ Action image loaded successfully');
          };
          actionImageContainer.appendChild(actionImg);
          step1Div.appendChild(actionImageContainer);
        } else {
          // Debug: log what we have
          console.log('🔍 Action image debug:', {
            hasActionInfo: !!evt.action_info,
            hasImageBase64: !!(evt.action_info && evt.action_info.image_base64),
            hasImageUrl: !!(evt.action_info && evt.action_info && evt.action_info.image_url),
            hasEvtImageUrl: !!evt.image_url,
            actionInfo: evt.action_info
          });
        }
        
        validateActionDiv.appendChild(step1Div);
        
        // Step 2: Kiểm tra thông tin action
        const step2Div = document.createElement('div');
        step2Div.setAttribute('data-step', '2');
        step2Div.style.cssText = 'margin-bottom: 20px;';
        
        const step2Title = document.createElement('div');
        step2Title.textContent = 'Bước 2: Kiểm tra thông tin action';
        step2Title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 10px; color: #333;';
        step2Div.appendChild(step2Title);
        
        // Instruction text - Simplified for this view, detailed one is in dialog
        const instructionText = document.createElement('div');
        instructionText.style.cssText = 'font-size: 13px; color: #666; margin-bottom: 12px; padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; line-height: 1.5;';
        instructionText.innerHTML = \`<strong>Check Bugs:</strong> Nếu thấy thông tin không đúng, nhấn nút <strong>RaiseBug</strong> để báo lỗi.\`;
        step2Div.appendChild(instructionText);
        
        // Show current values (readonly)
        const infoBox = document.createElement('div');
        infoBox.style.cssText = 'background: #f9f9f9; border: 1px solid #ddd; border-radius: 6px; padding: 12px;';
        
        const fields = [
          { label: 'Category', value: evt.item_category || 'N/A' },
          { label: 'Name', value: evt.item_name || 'N/A' },
          { label: 'Type', value: evt.item_type || 'N/A' },
          { label: 'Verb', value: evt.item_verb || 'N/A' },
          { label: 'Content', value: evt.item_content || 'N/A' },
          { label: 'purpose', value: evt.action_info?.purpose || evt.action_info?.action_purpose || 'N/A' }
        ];
        
        fields.forEach(field => {
          const fieldRow = document.createElement('div');
          fieldRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px; background: white; border-radius: 4px;';
          
          const label = document.createElement('label');
          label.style.cssText = 'flex: 1; font-size: 13px; display: flex; align-items: center;';
          const labelText = document.createElement('strong');
          labelText.textContent = field.label + ':';
          label.appendChild(labelText);
          const valueSpan = document.createElement('span');
          valueSpan.style.cssText = 'margin-left: 6px; color: #555;';
          valueSpan.textContent = field.value;
          label.appendChild(valueSpan);
          fieldRow.appendChild(label);
          
          infoBox.appendChild(fieldRow);
        });
        
        step2Div.appendChild(infoBox);
        
        validateActionDiv.appendChild(step2Div);
        
        // Step 3: View graph and Video Validate
        const step3Div = document.createElement('div');
        step3Div.setAttribute('data-step', '3');
        step3Div.style.cssText = 'margin-bottom: 20px;';
        
        const step3Title = document.createElement('div');
        step3Title.textContent = 'Bước 3: Xem nội dung action trong 2 nút này đã đúng chưa';
        step3Title.style.cssText = 'font-weight: 600; font-size: 14px; margin-bottom: 10px; color: #333;';
        step3Div.appendChild(step3Title);
        
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px;';
        
        // View graph button with icon
        const viewGraphBtn = document.createElement('button');
        viewGraphBtn.style.cssText = 'flex: 1; padding: 12px 20px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 6px;';
        viewGraphBtn.innerHTML = \`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;">
          <circle cx="6" cy="6" r="3"></circle>
          <circle cx="18" cy="6" r="3"></circle>
          <circle cx="6" cy="18" r="3"></circle>
          <circle cx="18" cy="18" r="3"></circle>
          <circle cx="12" cy="12" r="3"></circle>
          <line x1="6" y1="6" x2="12" y2="12"></line>
          <line x1="18" y1="6" x2="12" y2="12"></line>
          <line x1="6" y1="18" x2="12" y2="12"></line>
          <line x1="18" y1="18" x2="12" y2="12"></line>
        </svg>
        View Graph\`;
        viewGraphBtn.addEventListener('mouseenter', () => {
          viewGraphBtn.style.background = '#0056b3';
        });
        viewGraphBtn.addEventListener('mouseleave', () => {
          viewGraphBtn.style.background = '#007bff';
        });
        viewGraphBtn.addEventListener('click', async () => {
          if (typeof openGraphView === 'function') {
            // Pass the current action ID to auto-open it in graph view
            await openGraphView(evt.panel_id);
          }
        });
        buttonsContainer.appendChild(viewGraphBtn);
        
        // Video Validate button with icon
        const validateVideoBtn = document.createElement('button');
        validateVideoBtn.style.cssText = 'flex: 1; padding: 12px 20px; background: #ff9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 6px;';
        validateVideoBtn.innerHTML = \`<span style="font-size: 16px;">✓</span>
        Video Validate\`;
        validateVideoBtn.addEventListener('mouseenter', () => {
          validateVideoBtn.style.background = '#f57c00';
        });
        validateVideoBtn.addEventListener('mouseleave', () => {
          validateVideoBtn.style.background = '#ff9800';
        });
        validateVideoBtn.addEventListener('click', async () => {
          if (typeof openValidateView === 'function') {
            // Pass the current action ID to auto-open it in video validation
            await openValidateView(evt.panel_id);
          }
        });
        buttonsContainer.appendChild(validateVideoBtn);
        
        step3Div.appendChild(buttonsContainer);
        
        // RaiseBug button (moved from Step 2)
        const raiseBugBtn2 = document.createElement('button');
        raiseBugBtn2.textContent = 'RaiseBug';
        raiseBugBtn2.style.cssText = 'padding: 8px 16px; background: #ff6b6b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; margin-top: 8px; width: 100%;';
        raiseBugBtn2.addEventListener('mouseenter', () => {
          raiseBugBtn2.style.background = '#ff5252';
        });
        raiseBugBtn2.addEventListener('mouseleave', () => {
          raiseBugBtn2.style.background = '#ff6b6b';
        });
        raiseBugBtn2.addEventListener('click', () => {
             // Pass current bug info from event if available
             const currentBugInfo = evt.bug_info || null;
             showRaiseBugDialog(evt.panel_id, currentBugInfo, evt);
        });
        step3Div.appendChild(raiseBugBtn2);
        
        validateActionDiv.appendChild(step3Div);
        
        container.appendChild(validateActionDiv);
      }
      
      // Update showMode button icon based on current mode (log -> tree -> validation -> log)
      function updateShowModeButton() {
        const showModeBtn = document.getElementById('panel-log-show-mode-btn');
        if (!showModeBtn) return;
        
        if (panelLogDisplayMode === 'log') {
          showModeBtn.innerHTML = '<img src="https://cdn.jsdelivr.net/npm/remixicon/icons/Editor/node-tree.svg" alt="Tree Mode" style="width: 24px; height: 24px; filter: brightness(0) saturate(100%) invert(0%);" />';
          showModeBtn.title = 'Switch to Tree Mode';
        } else if (panelLogDisplayMode === 'tree') {
          showModeBtn.innerHTML = '<span style="font-size: 24px; line-height: 1;">🗹</span>';
          showModeBtn.title = 'Switch to Validation Mode';
        } else {
          showModeBtn.innerHTML = '<img src="https://cdn.jsdelivr.net/npm/bootstrap-icons/icons/list.svg" alt="List Mode" style="width: 24px; height: 24px; filter: brightness(0) saturate(100%) invert(0%);" />';
          showModeBtn.title = 'Switch to Log Mode';
        }
        updateMyAssignmentCheckboxVisibility();
      }
      
      // Toggle display mode: log -> tree -> validation -> log
      async function togglePanelLogDisplayMode() {
        if (panelLogDisplayMode === 'log') panelLogDisplayMode = 'tree';
        else if (panelLogDisplayMode === 'tree') panelLogDisplayMode = 'validation';
        else panelLogDisplayMode = 'log';
        setLocalStorage('panel-log-display-mode', panelLogDisplayMode);
        window.panelLogDisplayMode = panelLogDisplayMode;
        updateShowModeButton();
        
        if (window.getPanelTree) {
          panelTreeData = await getFilteredPanelTree(panelLogDisplayMode);
          renderPanelTree();
          const modeText = panelLogDisplayMode === 'tree' ? 'Tree' : (panelLogDisplayMode === 'validation' ? 'Validation' : 'Log');
          showToast('✅ Switched to ' + modeText + ' Mode');
        }
      }
      
      async function loadInitialTree() {
        if (window.getPanelTree) {
          panelTreeData = await getFilteredPanelTree(panelLogDisplayMode);
          renderPanelTree();
        }
      }
      
      async function refreshPanelTree() {
        const refreshBtn = document.getElementById('panel-log-refresh-btn');
        let originalText = '';

        if (refreshBtn) {
            refreshBtn.classList.add('loading');
            refreshBtn.disabled = true;
            originalText = refreshBtn.textContent;
            refreshBtn.textContent = '⏳';
        }
        
        try {
          if (window.getPanelTree) {
            panelTreeData = await getFilteredPanelTree(panelLogDisplayMode);
            renderPanelTree();
            // Optional: Only show toast if triggered by user click? 
            // For now keeping it simple as it confirms the update.
            showToast('✅ Panel Log đã được cập nhật');
          } else {
            showToast('⚠️ Refresh function không khả dụng');
          }
        } catch (err) {
          console.error('Failed to refresh panel tree:', err);
          showToast('❌ Lỗi khi refresh Panel Log');
        } finally {
          if (refreshBtn) {
            refreshBtn.classList.remove('loading');
            refreshBtn.disabled = false;
            refreshBtn.textContent = originalText;
          }
        }
      }
      
      // Thêm event listener cho nút refresh
      const panelLogRefreshBtn = document.getElementById('panel-log-refresh-btn');
      if (panelLogRefreshBtn) {
        panelLogRefreshBtn.addEventListener('click', refreshPanelTree);
      }
      
      // Thêm event listener cho nút showMode
      const panelLogShowModeBtn = document.getElementById('panel-log-show-mode-btn');
      if (panelLogShowModeBtn) {
        panelLogShowModeBtn.addEventListener('click', togglePanelLogDisplayMode);
        // Initialize button icon
        updateShowModeButton();
      }
      
      // My Assignment checkbox: sync state and reload on change
      function syncMyAssignmentCheckboxState() {
        const cb = document.getElementById('panel-log-my-assignment-cb');
        const graphCb = document.getElementById('graph-panel-log-my-assignment-cb');
        const videoCb = document.getElementById('video-validation-panel-log-my-assignment-cb');
        if (cb) cb.checked = myAssignmentFilterEnabled;
        if (graphCb) graphCb.checked = myAssignmentFilterEnabled;
        if (videoCb) videoCb.checked = myAssignmentFilterEnabled;
      }
      function onMyAssignmentCheckboxChange(e) {
        const clickedCb = e?.target;
        myAssignmentFilterEnabled = clickedCb?.checked ?? document.getElementById('panel-log-my-assignment-cb')?.checked ?? false;
        setLocalStorage('panel-log-my-assignment', myAssignmentFilterEnabled ? 'true' : 'false');
        syncMyAssignmentCheckboxState();
        if (panelLogDisplayMode === 'validation' && window.getPanelTree) {
          getFilteredPanelTree(panelLogDisplayMode).then(data => { panelTreeData = data || []; renderPanelTree(); });
        }
        if (typeof graphPanelLogDisplayMode !== 'undefined' && graphPanelLogDisplayMode === 'validation' && window.loadGraphPanelTree) {
          loadGraphPanelTree();
        }
        if (typeof videoValidationPanelLogDisplayMode !== 'undefined' && videoValidationPanelLogDisplayMode === 'validation' && window.getPanelTree) {
          getFilteredPanelTree(videoValidationPanelLogDisplayMode).then(data => {
            const treeContainer = document.getElementById('videoValidationPanelLogTree');
            if (treeContainer && typeof renderPanelTreeForValidationInternal === 'function') {
              renderPanelTreeForValidationInternal(data || [], treeContainer);
            }
          });
        }
      }
      const mainMyAssignmentCb = document.getElementById('panel-log-my-assignment-cb');
      const graphMyAssignmentCb = document.getElementById('graph-panel-log-my-assignment-cb');
      const videoMyAssignmentCb = document.getElementById('video-validation-panel-log-my-assignment-cb');
      if (mainMyAssignmentCb) {
        mainMyAssignmentCb.checked = myAssignmentFilterEnabled;
        mainMyAssignmentCb.addEventListener('change', onMyAssignmentCheckboxChange);
      }
      if (graphMyAssignmentCb) {
        graphMyAssignmentCb.checked = myAssignmentFilterEnabled;
        graphMyAssignmentCb.addEventListener('change', onMyAssignmentCheckboxChange);
      }
      if (videoMyAssignmentCb) {
        videoMyAssignmentCb.checked = myAssignmentFilterEnabled;
        videoMyAssignmentCb.addEventListener('change', onMyAssignmentCheckboxChange);
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
      let selectPanelModalPanelMetadata = null;

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
          listContainer.innerHTML = '<div style="text-align:center; padding:10px; color:#aaa; font-size:12px;">Loading panels...</div>';
          
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
          selectPanelModalPanelMetadata = null;
          
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
            listContainer.innerHTML = '<div style="text-align:center; padding:10px; color:#aaa; font-size:12px;">No panels found</div>';
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
            
            // Determine dot color based on status
            const dotColor = panel.status === 'completed' ? '#4caf50' : '#4caf50'; // Green for panels
            const statusText = panel.status === 'completed' ? 'completed' : 'pending';
            
            panelItem.innerHTML = \`
              <div class="select-panel-item-dot" style="width:16px; height:16px; min-width:16px; flex-shrink:0;">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%;">
                  <circle cx="12" cy="12" r="10" fill="\${dotColor}"/>
                  \${panel.status === 'completed' ? '<path d="M9 12l2 2 4-4" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' : ''}
                </svg>
              </div>
              <div class="select-panel-item-content">
                <div class="select-panel-item-name">\${panel.name || 'Unnamed Panel'}</div>
                <div class="select-panel-item-status">Status: \${statusText}</div>
              </div>
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
            selectPanelModalPanelMetadata = null;
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
        const sidebarWidth = sidebar ? sidebar.offsetWidth : 200;
        const toolbar = document.getElementById('select-panel-toolbar');
        const toolbarWidth = toolbar ? toolbar.offsetWidth : 180;
        const toolbarHeight = toolbar ? toolbar.offsetHeight : 0;
        const pagination = document.getElementById('select-panel-pagination');
        const paginationHeight = pagination && pagination.style.display !== 'none' ? pagination.offsetHeight : 0;
        
        const windowHeight = window.innerHeight;
        const windowWidth = window.innerWidth;
        const availableHeight = windowHeight - paginationHeight - 60; // Account for padding
        const availableWidth = windowWidth - sidebarWidth - toolbarWidth - 60; // Account for padding and toolbar
        
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
          
          // Draw crop area rectangle if metadata.global_pos exists
          if (selectPanelModalPanelMetadata && selectPanelModalPanelMetadata.global_pos) {
            const globalPos = selectPanelModalPanelMetadata.global_pos;
            const pageHeight = 1080;
            const pageYStart = pageIndex * pageHeight;
            const pageYEnd = pageYStart + img.naturalHeight;
            const cropYStart = globalPos.y;
            const cropYEnd = cropYStart + globalPos.h;
            
            // Check if crop area intersects with current page
            if (cropYEnd >= pageYStart && cropYStart <= pageYEnd) {
              const rectYStart = Math.max(0, cropYStart - pageYStart);
              const rectYEnd = Math.min(img.naturalHeight, cropYEnd - pageYStart);
              const rectHeight = rectYEnd - rectYStart;
              
              // Calculate rectangle x and width (clamp to canvas bounds)
              const rectX = Math.max(0, globalPos.x);
              const rectXEnd = Math.min(img.naturalWidth, globalPos.x + globalPos.w);
              const rectWidth = rectXEnd - rectX;
              
              if (rectHeight > 0 && rectWidth > 0) {
                const cropRect = new fabric.Rect({
                  left: rectX,
                  top: rectYStart,
                  width: rectWidth,
                  height: rectHeight,
                  fill: 'transparent',
                  stroke: '#00ff00',
                  strokeWidth: 3,
                  strokeDashArray: [5, 5],
                  strokeUniform: true,
                  selectable: false,
                  evented: false,
                  excludeFromExport: true
                });
                
                selectPanelModalFabricCanvas.add(cropRect);
                selectPanelModalFabricCanvas.bringToFront(cropRect);
              }
            }
          }
          
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
          selectPanelModalPanelMetadata = null;
          if (window.getAllPanels) {
            const panels = await window.getAllPanels();
            const panel = panels.find(p => p.item_id === panelId);
            if (panel) {
              selectPanelModalPanelMetadata = panel.metadata;
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

      // Global tooltip cleanup mechanism to prevent stuck tooltips
      // Clean up tooltips on scroll or when clicking anywhere
      const cleanupAllTooltips = () => {
        const tooltipIds = [
          'modality-stacks-tooltip',
          'graph-modality-stacks-tooltip',
          'video-validation-modality-tooltip',
          'graph-action-tooltip',
          'action-tooltip'
        ];
        tooltipIds.forEach(id => {
          const tooltip = document.getElementById(id);
          if (tooltip) tooltip.remove();
        });
      };

      // Clean up tooltips on scroll (tooltips can get stuck when scrolling quickly)
      document.addEventListener('scroll', cleanupAllTooltips, true);
      
      // Clean up tooltips on any click (except on the tooltip itself)
      document.addEventListener('click', (e) => {
        // Don't clean up if clicking on an important icon (let the normal flow handle it)
        if (!e.target.closest('.important-icon')) {
          cleanupAllTooltips();
        }
      }, true);
    </script>
  </body>
</html>
`;

