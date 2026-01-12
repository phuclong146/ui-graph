export function getPanelEditorClassCode() {
    return `
window.PanelEditor = class PanelEditor {
    constructor(imageBase64, geminiResultOrActionId, mode = 'full', panelId = null, panelBeforeBase64 = null, panelAfterGlobalPos = null) {
        this.imageBase64 = imageBase64;
        this.panelBeforeBase64 = panelBeforeBase64;
        this.panelAfterGlobalPos = panelAfterGlobalPos;
        console.log(\`🎨 PanelEditor constructor: panelBeforeBase64 = \${panelBeforeBase64 ? 'EXISTS (' + panelBeforeBase64.length + ' chars)' : 'NULL'}\`);
        console.log(\`🎨 PanelEditor constructor: panelAfterGlobalPos = \${panelAfterGlobalPos ? JSON.stringify(panelAfterGlobalPos) : 'NULL'}\`);
        
        if (mode === 'cropOnly' || mode === 'confirmOnly' || mode === 'twoPointCrop') {
            this.actionItemId = geminiResultOrActionId;
            this.geminiResult = [];
            this.originalGeminiResult = [];
            
            if (mode === 'twoPointCrop') {
                this.pagesData = panelId;
                this.currentPageIndex = 0;
                this.cropPoints = [];
                this.cropMarkers = [];
                this.cropRectangle = null;
                this.fullScreenshotBase64 = null;
                this.currentPageBase64 = null;
            }
        } else {
            this.geminiResult = geminiResultOrActionId;
            this.originalGeminiResult = JSON.parse(JSON.stringify(geminiResultOrActionId));
            this.eventId = panelId;
            this.currentPageIndex = 0;
            this.fullPanelBase64 = null;
            this.currentPageBase64 = null;
            this.numPages = 1;
        }
        this.mode = mode;
        this.canvas = null;
        this.fabricObjects = new Map();
        this.container = null;
        this.undoStack = [];
        this.redoStack = [];
        this.isDrawingMode = false;
        this.isCroppingMode = false;
        this.drawingRect = null;
        this.drawingStartX = 0;
        this.drawingStartY = 0;
        this.selectedPanelIndex = null;
        this.selectedActionIdInSidebar = null; // Track selected action in sidebar
        this.isProcessing = false;
        this.isEditingLabel = false;
        this.editingActionId = null; // Track which action is being edited
        this.isDraggingLabel = false;
        this.dragLinkedRect = null;
        this.dragStartPointer = null;
        this.rectStart = null;
        this.prevCanvasSelection = true;
        this._globalMouseUpHandler = null;
        
        // Overlay comparison state
        this.compareMode = 'AUTO'; // 'ON', 'OFF', 'AUTO'
        this.overlayVisible = false;
        this.overlayImage = null;
        this.overlayAutoInterval = null;
        this.panelBeforePageBase64 = null;
        this.overlayAutoIntervalMs = 1000; // Configurable overlay toggle interval in milliseconds (default: 1s)
        this.initialActionPositions = new Map(); // Store initial position/size of actions when panel opens
    }

    async init() {
        if (this.mode === 'twoPointCrop') {
            console.log('Enter Two-Point Crop Mode:');
            console.log(\`  Total pages: \${this.pagesData ? this.pagesData.length : 0}\`);
        } else {
            console.log('Enter Edit actions:');
            console.log(\`  Total panels: \${this.geminiResult.length}\`);
            this.geminiResult.forEach((panel, i) => {
                console.log(\`  Panel[\${i}]: "\${panel.panel_title}" with \${panel.actions?.length || 0} actions\`);
            });
        }
        
        if (window.resizeQueueBrowser) {
            await window.resizeQueueBrowser(true);
        }
        
        if (window.hideTrackingBrowser) {
            await window.hideTrackingBrowser();
        }
        
        document.body.style.zoom = '80%';
        
        let imageToLoad = this.imageBase64;
        
        if (this.mode === 'full') {
            this.fullPanelBase64 = this.imageBase64;
            const tempImg = new Image();
            tempImg.src = 'data:image/png;base64,' + this.imageBase64;
            await new Promise((resolve, reject) => {
                tempImg.onload = resolve;
                tempImg.onerror = reject;
            });
            const pageHeight = 1080;
            this.numPages = Math.ceil(tempImg.naturalHeight / pageHeight);
            console.log(\`📄 Panel height: \${tempImg.naturalHeight}px → \${this.numPages} pages\`);
        }
        
        if (this.mode !== 'twoPointCrop' && this.mode !== 'confirmOnly') {
            this.saveState();
        }
        
        this.container = document.createElement('div');
        this.container.id = 'editor-container';
        
        let toolbarHTML = '<div id="editor-status"></div><div id="editor-toolbar">';
        
        if (this.mode === 'confirmOnly') {
            toolbarHTML += '<button id="editorSaveBtn" class="editor-btn save-btn">✅ Save Panel</button>';
            toolbarHTML += '<button id="editorCancelBtn" class="editor-btn cancel-btn">❌ Cancel</button>';
        } else if (this.mode === 'twoPointCrop') {
            toolbarHTML += \`<div id="pageIndicator" style="margin-bottom: 10px; font-weight: bold; font-size: 16px; color: #00ffff; text-align: center; text-shadow: 0 0 10px rgba(0,255,255,0.5);">Page 1/\${this.pagesData ? this.pagesData.length : 1}</div>\`;
            toolbarHTML += '<button id="editorPrevPageBtn" class="editor-btn">◀ Prev</button>';
            toolbarHTML += '<button id="editorNextPageBtn" class="editor-btn">Next ▶</button>';
            
            // Add Compare button only if panelBeforeBase64 exists
            console.log(\`🔍 Checking panelBeforeBase64 for Compare button in twoPointCrop: \${this.panelBeforeBase64 ? 'EXISTS' : 'NULL'}\`);
            if (this.panelBeforeBase64) {
                toolbarHTML += '<button id="editorCompareBtn" class="editor-btn compare-btn">🔄 Compare (AUTO)</button>';
                console.log(\`✅ Added Compare button to twoPointCrop toolbar\`);
            } else {
                console.warn(\`⚠️ Compare button NOT added to twoPointCrop - panelBeforeBase64 is null\`);
            }
            
            toolbarHTML += '<button id="editorDontCropBtn" class="editor-btn" style="background: #f44336; color: white; font-weight: bold;">📐 Don&apos;t Crop (Use Full)</button>';
            toolbarHTML += '<button id="editorSaveCropBtn" class="editor-btn save-btn" style="display:none; background: #4CAF50; color: white; font-weight: bold;">✅ Save Crop</button>';
            toolbarHTML += '<button id="editorCancelBtn" class="editor-btn cancel-btn">❌ Cancel</button>';
        } else if (this.mode === 'cropOnly') {
            toolbarHTML += '<button id="editorCropBtn" class="editor-btn crop-btn">✂️ Crop (OFF)</button>';
            toolbarHTML += '<button id="editorCancelBtn" class="editor-btn cancel-btn">❌ Cancel</button>';
        } else {
            // Group 2: Edit Action - only visible when action is selected
            toolbarHTML += '<div id="editor-edit-action-group" style="display: none; flex-direction: column; gap: 10px; align-items: stretch;">';
            toolbarHTML += '<button id="editorRenameBtn" class="editor-btn">✏️ Rename</button>';
            toolbarHTML += '<button id="editorRenameByAIBtn" class="editor-btn ai-btn" disabled>🤖 Rename by AI</button>';
            toolbarHTML += '<button id="editorResetActionBtn" class="editor-btn">↺ Reset location</button>';
            toolbarHTML += '<button id="editorDeleteActionBtn" class="editor-btn" style="background: #f44336; color: white;">🗑️ Delete</button>';
            toolbarHTML += '<div id="editor-instructions" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.1); color: #aaa; font-size: 11px; line-height: 1.6;">';
            toolbarHTML += 'Drag actions to move<br>';
            toolbarHTML += 'Drag corners to resize<br>';
            toolbarHTML += 'Shift+Click to select multiple<br>';
            toolbarHTML += 'Ctrl+Z to undo<br>';
            toolbarHTML += 'Double-click to edit name<br>';
            toolbarHTML += 'Delete to remove (single or multiple)';
            toolbarHTML += '</div>';
            toolbarHTML += '</div>';
            
            // Group 3: Common - always visible
            toolbarHTML += '<div id="editor-common-group" style="display: flex; flex-direction: column; gap: 10px;">';
            toolbarHTML += '<button id="editorViewToolsBtn" class="editor-btn">🔧 View tools</button>';
            toolbarHTML += '<button id="editorSaveBtn" class="editor-btn save-btn">💾 Save Changes</button>';
            toolbarHTML += '<button id="editorResetBtn" class="editor-btn reset-btn">↺ Reset</button>';
            toolbarHTML += '<button id="editorCancelBtn" class="editor-btn cancel-btn">❌ Cancel</button>';
            toolbarHTML += '</div>';
        }
        
        // Add action sidebar for edit mode
        let sidebarHTML = '';
        if (this.mode === 'full') {
            sidebarHTML = \`
                <div id="editor-action-sidebar" style="
                    position: fixed;
                    left: 0;
                    top: 0;
                    width: 250px;
                    height: 100%;
                    background: rgba(26, 26, 26, 0.95);
                    backdrop-filter: blur(10px);
                    border-right: 1px solid rgba(255, 255, 255, 0.1);
                    z-index: 1001;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                ">
                    <div style="padding: 15px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                        <button id="editorAddActionBtn" class="editor-btn add-btn" style="width: 100%; margin-bottom: 10px;">➕ Add Action</button>
                        <button id="editorViewAllActionBtn" class="editor-btn" style="
                            width: 100%;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                        ">👁️ View all action</button>
                    </div>
                    <div id="editor-action-list" style="
                        flex: 1;
                        overflow-y: auto;
                        padding: 10px;
                    "></div>
                </div>
            \`;
        }
        
        toolbarHTML += '</div>';
        
        // Group 1: Panel controls - positioned centered above panel display area (outside toolbar)
        // Positioned at top, status message will be below
        if (this.mode === 'full') {
            toolbarHTML += '<div id="editor-panel-group" style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; z-index: 1001; background: rgba(26, 26, 26, 0.95); backdrop-filter: blur(10px); padding: 8px 12px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.5);">';
            toolbarHTML += '<button id="editorPrevPageBtn" class="editor-btn">◀ Prev</button>';
            toolbarHTML += \`<div id="pageIndicator" style="font-weight: bold; font-size: 14px; color: #00ffff; text-shadow: 0 0 10px rgba(0,255,255,0.5); min-width: 80px; text-align: center;">Page 1/\${this.numPages || 1}</div>\`;
            toolbarHTML += '<button id="editorNextPageBtn" class="editor-btn">Next ▶</button>';
            
            // Add Compare button only if panelBeforeBase64 exists
            console.log(\`🔍 Checking panelBeforeBase64 for Compare button: \${this.panelBeforeBase64 ? 'EXISTS' : 'NULL'}\`);
            if (this.panelBeforeBase64) {
                toolbarHTML += '<button id="editorCompareBtn" class="editor-btn compare-btn">🔄 Compare (AUTO)</button>';
                console.log(\`✅ Added Compare button to toolbar\`);
            } else {
                console.warn(\`⚠️ Compare button NOT added - panelBeforeBase64 is null\`);
            }
            
            toolbarHTML += '<button id="editorCropBtn" class="editor-btn crop-btn" disabled style="opacity: 0.5; cursor: not-allowed;">✂️ Crop</button>';
            toolbarHTML += '</div>';
        }
        
        toolbarHTML += '<div id="editor-canvas-wrapper"><canvas id="editor-canvas"></canvas></div>';
        
        // Insert sidebar before toolbar if in edit mode
        if (this.mode === 'full') {
            toolbarHTML = sidebarHTML + toolbarHTML;
        }
        
        this.container.innerHTML = toolbarHTML;
        document.body.appendChild(this.container);
        
        // Set toolbar to right side immediately to avoid left-side flash
        const toolbar = document.getElementById('editor-toolbar');
        if (toolbar) {
            toolbar.style.right = '10px';
            toolbar.style.left = 'auto';
        }
        
        if (this.mode === 'twoPointCrop') {
            this.fullScreenshotBase64 = this.imageBase64;
            imageToLoad = await this.cropPageFromFull(0);
            this.currentPageBase64 = imageToLoad;
        } else if (this.mode === 'full') {
            imageToLoad = await this.cropPageFromPanel(0);
            this.currentPageBase64 = imageToLoad;
        }
        
        const img = new Image();
        img.src = 'data:image/png;base64,' + imageToLoad;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
        
        this.canvas = new fabric.Canvas('editor-canvas', {
            width: img.naturalWidth,
            height: img.naturalHeight,
            backgroundColor: '#000'
        });
        this.canvas.targetFindTolerance = 8;
        
        await new Promise((resolve) => {
            fabric.Image.fromURL(img.src, (fabricImg) => {
                this.canvas.setBackgroundImage(fabricImg, () => {
                    this.canvas.renderAll();
                    resolve();
                });
            });
        });
        
        if (this.mode !== 'cropOnly' && this.mode !== 'twoPointCrop') {
            this.drawDefaultPanelBorder();
            this.drawAllBoxes();
            this.saveInitialActionPositions(); // Save initial positions after drawing boxes
            this.fixOutOfBoundsBoxes();
            this.canvas.selection = true;
        }
        
        if (this.mode === 'twoPointCrop') {
            this.enableTwoPointCropMode();
        }
        
        this.setupEventHandlers();
        this.autoZoomToFit();
        this.positionUIElements();
        
        // Initialize compare mode if panelBeforeBase64 exists (for both 'full' and 'twoPointCrop' modes)
        console.log(\`🔍 Initializing compare mode: panelBeforeBase64=\${this.panelBeforeBase64 ? 'EXISTS' : 'NULL'}, mode=\${this.mode}\`);
        if (this.panelBeforeBase64 && (this.mode === 'full' || this.mode === 'twoPointCrop')) {
            console.log(\`✅ Initializing compare mode with AUTO for mode \${this.mode}\`);
            this.updateCompareButton();
            if (this.compareMode === 'AUTO') {
                this.startAutoCompare();
            }
        } else {
            console.warn(\`⚠️ Compare mode NOT initialized: panelBeforeBase64=\${this.panelBeforeBase64 ? 'EXISTS' : 'NULL'}, mode=\${this.mode}\`);
        }
    }
    
    autoZoomToFit() {
        const windowHeight = window.innerHeight;
        const windowWidth = window.innerWidth;
        const canvasHeight = this.canvas.getHeight();
        const canvasWidth = this.canvas.getWidth();
        
        const toolbarHeight = 150;
        const availableHeight = windowHeight - toolbarHeight - 40;
        const availableWidth = windowWidth - 40;
        
        const scaleHeight = availableHeight / canvasHeight;
        const scaleWidth = availableWidth / canvasWidth;
        const scale = Math.min(scaleHeight, scaleWidth, 1);
        
        if (scale < 1) {
            const zoomPercent = Math.floor(scale * 100);
            document.body.style.zoom = \`\${zoomPercent}%\`;
            console.log(\`Auto-zoom set to \${zoomPercent}% to fit canvas (\${canvasWidth}x\${canvasHeight}) in viewport (\${windowWidth}x\${windowHeight})\`);
        }
    }
    
    positionUIElements() {
        const canvasWrapper = document.getElementById('editor-canvas-wrapper');
        const toolbar = document.getElementById('editor-toolbar');
        
        if (!canvasWrapper || !toolbar) return;
        
        // Account for sidebar width in edit mode
        if (this.mode === 'full') {
            const sidebar = document.getElementById('editor-action-sidebar');
            if (sidebar) {
                const sidebarWidth = sidebar.offsetWidth || 250;
                canvasWrapper.style.paddingLeft = sidebarWidth + 'px';
            }
        }
        
        const canvasRect = this.canvas.getElement().getBoundingClientRect();
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        
        const rightGap = wrapperRect.right - canvasRect.right;
        const toolbarWidth = toolbar.offsetWidth;
        
        const centerRightGap = Math.max(10, (rightGap - toolbarWidth) / 2);
        
        toolbar.style.right = centerRightGap + 'px';
        toolbar.style.left = 'auto';
    }
    
    renderActionList() {
        if (this.mode !== 'full') return;
        
        const actionListContainer = document.getElementById('editor-action-list');
        if (!actionListContainer) return;
        
        const panel = this.geminiResult[0];
        if (!panel || !Array.isArray(panel.actions)) {
            actionListContainer.innerHTML = '<div style="color: #aaa; padding: 10px; text-align: center; font-size: 12px;">No actions</div>';
            return;
        }
        
        const currentPage = this.currentPageIndex + 1;
        const actionsOnCurrentPage = panel.actions.filter(action => {
            if (!action.action_pos) return false;
            const actionPage = action.action_pos.p || Math.floor(action.action_pos.y / 1080) + 1;
            return actionPage === currentPage;
        });
        
        if (actionsOnCurrentPage.length === 0) {
            actionListContainer.innerHTML = '<div style="color: #aaa; padding: 10px; text-align: center; font-size: 12px;">No actions on this page</div>';
            return;
        }
        
        let html = '';
        actionsOnCurrentPage.forEach((action, index) => {
            const actionIndex = panel.actions.indexOf(action);
            const actionId = '0-' + actionIndex;
            html += \`
                <div class="action-list-item" data-action-id="\${actionId}" style="
                    padding: 10px;
                    margin-bottom: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    color: #fff;
                    font-size: 13px;
                " onmouseover="this.style.background='rgba(255, 255, 255, 0.1)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
                    <div style="font-weight: 600; margin-bottom: 4px;">\${action.action_name || 'Unnamed Action'}</div>
                    <div style="font-size: 11px; color: #aaa;">
                        \${action.action_type || 'button'} • \${action.action_verb || 'click'}
                    </div>
                </div>
            \`;
        });
        
        actionListContainer.innerHTML = html;
        
        // Add click handlers to select actions with toggle behavior
        actionListContainer.querySelectorAll('.action-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const actionId = item.getAttribute('data-action-id');
                const boxData = this.fabricObjects.get(actionId);
                
                // Toggle selection: if same action clicked, deselect; otherwise select
                if (this.selectedActionIdInSidebar === actionId) {
                    // Deselect
                    this.selectedActionIdInSidebar = null;
                    this.canvas.discardActiveObject();
                    this.canvas.renderAll();
                    this.updateRenameByAIButton();
                    // Remove selected style
                    item.style.background = 'rgba(255, 255, 255, 0.05)';
                    item.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                } else {
                    // Select new action
                    this.selectedActionIdInSidebar = actionId;
                    if (boxData && boxData.rect) {
                        this.canvas.setActiveObject(boxData.rect);
                        this.canvas.renderAll();
                        this.updateRenameByAIButton();
                    }
                    // Update visual selection in sidebar
                    actionListContainer.querySelectorAll('.action-list-item').forEach(otherItem => {
                        otherItem.style.background = 'rgba(255, 255, 255, 0.05)';
                        otherItem.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                    });
                    item.style.background = 'rgba(102, 126, 234, 0.3)';
                    item.style.border = '1px solid rgba(102, 126, 234, 0.6)';
                }
            });
        });
        
        // Restore selection state if exists
        this.updateSidebarSelection();
    }
    
    drawDefaultPanelBorder() {
        if (this.defaultPanelBorderLines) {
            this.defaultPanelBorderLines.forEach(line => this.canvas.remove(line));
        }
        
        const borderWidth = 3;
        const borderColor = '#ff4444';
        const w = this.canvas.width;
        const h = this.canvas.height;
        const half = borderWidth / 2;
        
        const lineProps = {
            stroke: borderColor,
            strokeWidth: borderWidth,
            selectable: false,
            evented: false,
            excludeFromExport: true,
            isPanelBorder: true
        };
        
        const topLine = new fabric.Line([0, 0, w, 0], lineProps);
        const leftLine = new fabric.Line([0, 0, 0, h], lineProps);
        const rightLine = new fabric.Line([w - half, 0, w - half, h], lineProps);
        const bottomLine = new fabric.Line([0, h - half, w, h - half], lineProps);
        
        this.defaultPanelBorderLines = [topLine, rightLine, bottomLine, leftLine];
        this.defaultPanelBorderLines.forEach(line => {
            this.canvas.add(line);
            this.canvas.sendToBack(line);
        });
    }
    
    fixOutOfBoundsBoxes() {
        const canvasW = this.canvas.width;
        const canvasH = this.canvas.height;
        let offsetY = 20;
        let needsSave = false;
        
        this.fabricObjects.forEach((boxData, id) => {
            if (!boxData.rect) return;
            
            const rect = boxData.rect;
            let corrected = false;
            let newX = rect.left;
            let newY = rect.top;
            let newW = rect.width;
            let newH = rect.height;
            
            if (newX < 0) {
                newX = 0;
                corrected = true;
            }
            if (newY < 0) {
                newY = 0;
                corrected = true;
            }
            
            if (newX + newW > canvasW) {
                if (newX === 0) {
                    newW = canvasW;
                } else {
                    newX = canvasW - newW - 20;
                    if (newX < 0) {
                        newX = 0;
                        newW = canvasW - 20;
                    }
                }
                corrected = true;
            }
            
            if (newY + newH > canvasH) {
                if (newY === 0) {
                    newH = canvasH;
                } else {
                    newY = canvasH - newH - offsetY;
                    if (newY < 0) {
                        newY = 0;
                        newH = canvasH - offsetY;
                    }
                    offsetY += newH + 10;
                }
                corrected = true;
            }
            
            if (corrected) {
                rect.set({
                    left: newX,
                    top: newY,
                    width: newW,
                    height: newH
                });
                
                if (boxData.label) {
                    boxData.label.set({
                        left: newX + 8,
                        top: newY - 20
                    });
                }
                
                const newPos = {
                    x: Math.round(newX),
                    y: Math.round(newY),
                    w: Math.round(newW),
                    h: Math.round(newH)
                };
                
                if (typeof id === 'number') {
                    this.geminiResult[id].panel_pos = newPos;
                } else if (typeof id === 'string' && id.includes('-')) {
                    const [panelIdx, actionIdx] = id.split('-').map(Number);
                    if (this.geminiResult[panelIdx] && this.geminiResult[panelIdx].actions[actionIdx]) {
                        this.geminiResult[panelIdx].actions[actionIdx].action_pos = newPos;
                    }
                }
                
                needsSave = true;
            }
        });
        
        if (needsSave) {
            this.saveState();
        }
        
        this.canvas.renderAll();
    }

    drawAllBoxes() {
        const panel = this.geminiResult[0];
        if (!panel || !Array.isArray(panel.actions)) return;
        
        const currentPage = this.currentPageIndex + 1;
        
        panel.actions.forEach((action, actionIndex) => {
            if (action.action_pos) {
                const actionPage = action.action_pos.p || Math.floor(action.action_pos.y / 1080) + 1;
                
                if (actionPage === currentPage) {
                    this.drawBox(
                        action.action_pos,
                        '0-' + actionIndex,
                        'action',
                        action.action_name
                    );
                }
            }
        });
        
        console.log(\`🎨 Drew boxes for \${panel.actions.filter(a => (a.action_pos?.p || Math.floor((a.action_pos?.y || 0) / 1080) + 1) === currentPage).length} actions on page \${currentPage}\`);
    }

    saveInitialActionPositions() {
        // Save initial position and size of all actions when panel opens
        // Only save if not already saved (to avoid overwriting on page switches)
        if (this.initialActionPositions.size > 0) {
            return; // Already saved
        }
        
        const panel = this.geminiResult[0];
        if (!panel || !Array.isArray(panel.actions)) return;
        
        panel.actions.forEach((action, actionIndex) => {
            if (action.action_pos) {
                const actionId = '0-' + actionIndex;
                // Deep copy the action_pos to avoid reference issues
                this.initialActionPositions.set(actionId, {
                    x: action.action_pos.x,
                    y: action.action_pos.y,
                    w: action.action_pos.w,
                    h: action.action_pos.h,
                    p: action.action_pos.p // Preserve page number if exists
                });
            }
        });
        
        console.log(\`💾 Saved initial positions for \${this.initialActionPositions.size} actions\`);
    }

    drawBox(pos, id, type, title) {
        const color = type === 'panel' ? '#ff4444' : '#00aaff';
        
        const rect = new fabric.Rect({
            left: pos.x,
            top: pos.y,
            width: pos.w,
            height: pos.h,
            fill: 'transparent',
            stroke: color,
            strokeWidth: 2,
            strokeUniform: true,
            cornerColor: color,
            cornerSize: 10,
            cornerStyle: 'circle',
            transparentCorners: false,
            hasRotatingPoint: false,
            lockRotation: true,
            id: id,
            type: type,
            boxType: 'rect'
        });
        
        rect.setControlsVisibility({
            mtr: false
        });
        
        const label = new fabric.Text(title || 'Unnamed', {
            left: pos.x + 8,
            top: pos.y - 20,
            fontSize: 12,
            fill: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.55)',
            padding: 3,
            fontWeight: 'bold',
            selectable: false,
            evented: true,
            perPixelTargetFind: false,
            hasControls: false,
            hasBorders: false,
            id: id + '_label',
            linkedBox: id,
            hoverCursor: 'move'
        });
        
        this.canvas.add(rect);
        this.canvas.add(label);
        this.canvas.bringToFront(label);
        this.fabricObjects.set(id, { rect, label });
    }

    setupEventHandlers() {
        this.canvas.on('object:modified', (e) => {
            const obj = e.target;
            if (obj.boxType === 'rect') {
                this.saveState();
                const boxData = this.fabricObjects.get(obj.id);
                const actionName = boxData?.label?.text || 'Unknown';
                const newPos = {
                    x: Math.round(obj.left),
                    y: Math.round(obj.top),
                    w: Math.round(obj.width * obj.scaleX),
                    h: Math.round(obj.height * obj.scaleY)
                };
                console.log(\`  - Resize: "\${actionName}" to (\${newPos.x},\${newPos.y},\${newPos.w},\${newPos.h})\`);
                this.updateGeminiResult(obj);
                this.updateLabel(obj);
                this.showStatus('✓ Box updated (not saved yet)', 'info');
            }
        });
        
        this.canvas.on('object:moving', (e) => {
            const obj = e.target;
            if (obj.boxType === 'rect') {
                const canvasWidth = this.canvas.width;
                const canvasHeight = this.canvas.height;
                
                obj.setCoords();
                const bound = obj.getBoundingRect();
                
                if (bound.left < 0) {
                    obj.left += Math.abs(bound.left);
                }
                if (bound.top < 0) {
                    obj.top += Math.abs(bound.top);
                }
                if (bound.left + bound.width > canvasWidth) {
                    obj.left -= (bound.left + bound.width - canvasWidth);
                }
                if (bound.top + bound.height > canvasHeight) {
                    obj.top -= (bound.top + bound.height - canvasHeight);
                }
                
                obj.setCoords();
                this.updateLabel(obj);
            }
        });
        
        this.canvas.on('object:scaling', (e) => {
            const obj = e.target;
            if (obj.boxType === 'rect') {
                const canvasWidth = this.canvas.width;
                const canvasHeight = this.canvas.height;
                
                obj.setCoords();
                const bound = obj.getBoundingRect();
                
                if (bound.left < 0) {
                    obj.left += Math.abs(bound.left);
                }
                if (bound.top < 0) {
                    obj.top += Math.abs(bound.top);
                }
                if (bound.left + bound.width > canvasWidth) {
                    const overflow = bound.left + bound.width - canvasWidth;
                    obj.scaleX = (bound.width - overflow) / obj.width;
                }
                if (bound.top + bound.height > canvasHeight) {
                    const overflow = bound.top + bound.height - canvasHeight;
                    obj.scaleY = (bound.height - overflow) / obj.height;
                }
                
                obj.setCoords();
                this.updateLabel(obj);
            }
        });
        
        this.canvas.on('selection:created', () => {
            this.showStatus('Selected • Drag to move • Use handles to resize', 'info');
            this.updateRenameByAIButton();
        });
        
        this.canvas.on('selection:cleared', () => {
            this.updateRenameByAIButton();
        });
        
        this.canvas.on('selection:updated', () => {
            this.updateRenameByAIButton();
        });
        
        this.canvas.on('mouse:down', (e) => {
            if (this.isDrawingMode || this.isCroppingMode) return;
            if (e.target && e.target.linkedBox) {
                const boxData = this.fabricObjects.get(e.target.linkedBox);
                if (boxData && boxData.rect) {
                    if (e.e && e.e.preventDefault) e.e.preventDefault();
                    if (e.e && e.e.stopPropagation) e.e.stopPropagation();
                    this.canvas.setActiveObject(boxData.rect);
                    this.dragLinkedRect = boxData.rect;
                    this.isDraggingLabel = false;
                    this.dragStartPointer = this.canvas.getPointer(e.e);
                    this.rectStart = { left: boxData.rect.left, top: boxData.rect.top };
                    this.prevCanvasSelection = this.canvas.selection;
                    this.canvas.selection = false;
                    this.canvas.skipTargetFind = true;
                    const done = () => {
                        if (!this.dragLinkedRect) return;
                        if (this.isDraggingLabel) {
                            this.updateGeminiResult(this.dragLinkedRect);
                            this.saveState();
                            this.showStatus('✓ Box updated (not saved yet)', 'info');
                        }
                        this.isDraggingLabel = false;
                        this.dragLinkedRect = null;
                        this.dragStartPointer = null;
                        this.rectStart = null;
                        this.canvas.selection = this.prevCanvasSelection;
                        this.canvas.skipTargetFind = false;
                        this.canvas.defaultCursor = 'default';
                        this.canvas.requestRenderAll();
                    };
                    this._globalMouseUpHandler = () => {
                        done();
                        document.removeEventListener('mouseup', this._globalMouseUpHandler);
                        this._globalMouseUpHandler = null;
                    };
                    document.addEventListener('mouseup', this._globalMouseUpHandler, { once: true });
                    this.canvas.renderAll();
                }
            }
        });

        this.canvas.on('mouse:move', (e) => {
            if (!this.dragLinkedRect) return;
            const pointer = this.canvas.getPointer(e.e);
            const dx = pointer.x - this.dragStartPointer.x;
            const dy = pointer.y - this.dragStartPointer.y;
            if (!this.isDraggingLabel) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) < 3) return;
                this.isDraggingLabel = true;
                this.canvas.defaultCursor = 'grabbing';
            }
            let newLeft = this.rectStart.left + dx;
            let newTop = this.rectStart.top + dy;
            const canvasWidth = this.canvas.width;
            const canvasHeight = this.canvas.height;
            const rect = this.dragLinkedRect;
            rect.setCoords();
            const width = rect.width * rect.scaleX;
            const height = rect.height * rect.scaleY;
            if (newLeft < 0) newLeft = 0;
            if (newTop < 0) newTop = 0;
            if (newLeft + width > canvasWidth) newLeft = canvasWidth - width;
            if (newTop + height > canvasHeight) newTop = canvasHeight - height;
            rect.set({ left: newLeft, top: newTop });
            rect.setCoords();
            this.updateLabel(rect);
            this.canvas.renderAll();
        });

        this.canvas.on('mouse:up', () => {
            if (this._globalMouseUpHandler) {
                return;
            }
            
            if (!this.dragLinkedRect) return;
            
            if (this.isDraggingLabel && this.dragLinkedRect) {
                this.updateGeminiResult(this.dragLinkedRect);
                this.saveState();
                this.showStatus('✓ Box updated (not saved yet)', 'info');
            }
            this.isDraggingLabel = false;
            this.dragLinkedRect = null;
            this.dragStartPointer = null;
            this.rectStart = null;
            this.canvas.selection = this.prevCanvasSelection;
            this.canvas.skipTargetFind = false;
            this.canvas.defaultCursor = 'default';
            this.canvas.requestRenderAll();
        });

        this.canvas.on('mouse:out', () => {
            if (!this.dragLinkedRect) return;
            if (this.isDraggingLabel && this.dragLinkedRect) {
                this.updateGeminiResult(this.dragLinkedRect);
                this.saveState();
                this.showStatus('✓ Box updated (not saved yet)', 'info');
            }
            this.isDraggingLabel = false;
            this.dragLinkedRect = null;
            this.dragStartPointer = null;
            this.rectStart = null;
            this.canvas.selection = this.prevCanvasSelection;
            this.canvas.skipTargetFind = false;
            this.canvas.defaultCursor = 'default';
            this.canvas.requestRenderAll();
        });
        
        this.canvas.on('mouse:dblclick', (e) => {
            if (e.target && e.target.linkedBox !== undefined) {
                this.editLabel(e.target);
            }
        });
        
        if (this.mode === 'confirmOnly') {
            document.getElementById('editorSaveBtn').onclick = async () => {
                if (this.isProcessing) {
                    this.showStatus('⚠️ Đang save, vui lòng đợi...', 'warning');
                    return;
                }
                await this.saveFullScreenshotPanel();
            };
            document.getElementById('editorCancelBtn').onclick = async () => await this.cancel();
        } else if (this.mode === 'twoPointCrop') {
            document.getElementById('editorPrevPageBtn').onclick = () => this.switchPage('prev');
            document.getElementById('editorNextPageBtn').onclick = () => this.switchPage('next');
            
            // Add Compare button handler if it exists
            const compareBtn = document.getElementById('editorCompareBtn');
            if (compareBtn) {
                compareBtn.onclick = () => this.toggleCompareMode();
            }
            
            document.getElementById('editorDontCropBtn').onclick = async () => await this.dontCropFullPage();
            document.getElementById('editorSaveCropBtn').onclick = async () => await this.saveTwoPointCrop();
            document.getElementById('editorCancelBtn').onclick = async () => await this.cancel();
        } else if (this.mode === 'cropOnly') {
            document.getElementById('editorCropBtn').onclick = () => this.toggleCropMode();
            document.getElementById('editorCancelBtn').onclick = async () => await this.cancel();
        } else {
            // Group 1: Panel controls
            document.getElementById('editorPrevPageBtn').onclick = () => this.switchEditPage('prev');
            document.getElementById('editorNextPageBtn').onclick = () => this.switchEditPage('next');
            
            // Add Compare button handler if it exists
            const compareBtn = document.getElementById('editorCompareBtn');
            if (compareBtn) {
                compareBtn.onclick = () => this.toggleCompareMode();
            }
            
            // Crop button is disabled, no handler needed
            
            // Group 2: Edit Action controls
            document.getElementById('editorRenameBtn').onclick = () => this.renameSelectedAction();
            document.getElementById('editorRenameByAIBtn').onclick = async () => await this.renameSelectedActionByAI();
            document.getElementById('editorResetActionBtn').onclick = () => this.resetSelectedActionLocation();
            document.getElementById('editorDeleteActionBtn').onclick = () => this.deleteSelectedAction();
            
            // Group 3: Common controls
            document.getElementById('editorViewToolsBtn').onclick = () => {
                // TODO: Implement view tools functionality
                console.log('View tools clicked - functionality to be implemented');
            };
            document.getElementById('editorSaveBtn').onclick = async () => {
                if (this.isProcessing) {
                    this.showStatus('⚠️ Đang save, vui lòng đợi...', 'warning');
                    return;
                }
                await this.save();
            };
            document.getElementById('editorCancelBtn').onclick = async () => await this.cancel();
            document.getElementById('editorResetBtn').onclick = () => this.reset();
            
            // Sidebar controls
            document.getElementById('editorAddActionBtn').onclick = () => this.toggleActionDrawingMode();
            
            // Add View all action button handler - deselects current action
            const viewAllActionBtn = document.getElementById('editorViewAllActionBtn');
            if (viewAllActionBtn) {
                viewAllActionBtn.onclick = () => {
                    // Deselect action
                    this.selectedActionIdInSidebar = null;
                    this.canvas.discardActiveObject();
                    this.canvas.renderAll();
                    this.updateRenameByAIButton();
                    this.updateSidebarSelection();
                    
                    // TODO: Implement view all action functionality
                    console.log('View all action clicked - functionality to be implemented');
                };
            }
            
            // Render action list after setup
            this.renderActionList();
        }
        
        if (this.mode !== 'cropOnly') {
            this._keydownHandler = (e) => {
                const activeObject = this.canvas.getActiveObject();
                const isEditingIText = activeObject && activeObject.type === 'i-text' && activeObject.isEditing;
                
                if (this.isEditingLabel || isEditingIText) {
                    return;
                }
                
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    this.deleteSelectedAction();
                } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    this.undo();
                } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
                    e.preventDefault();
                    this.redo();
                }
            };
            document.addEventListener('keydown', this._keydownHandler);
        }
    }
    
    updateLabel(rect) {
        const boxData = this.fabricObjects.get(rect.id);
        if (boxData && boxData.label) {
            const newTop = (rect.top - 20 < 0) ? (rect.top + (rect.height * rect.scaleY) + 4) : (rect.top - 20);
            boxData.label.set({
                left: rect.left + 8,
                top: newTop
            });
            boxData.label.setCoords();
            this.canvas.bringToFront(boxData.label);
            this.canvas.renderAll();
        }
    }
    
    saveState() {
        const state = JSON.parse(JSON.stringify(this.geminiResult));
        this.undoStack.push(state);
        this.redoStack = [];
        if (this.undoStack.length > 50) {
            this.undoStack.shift();
        }
    }
    
    undo() {
        if (this.undoStack.length === 0) {
            this.showStatus('Nothing to undo', 'info');
            return;
        }
        
        const currentState = JSON.parse(JSON.stringify(this.geminiResult));
        this.redoStack.push(currentState);
        
        const previousState = this.undoStack.pop();
        this.geminiResult = previousState;
        
        this.fabricObjects.forEach((boxData) => {
            if (boxData.rect) this.canvas.remove(boxData.rect);
            if (boxData.label) this.canvas.remove(boxData.label);
        });
        this.fabricObjects.clear();
        
        this.drawAllBoxes();
        this.canvas.renderAll();
        console.log(\`  - Undo (stack: \${this.undoStack.length} remaining)\`);
        this.showStatus('↶ Undo (' + this.undoStack.length + ' remaining)', 'success');
    }
    
    redo() {
        if (this.redoStack.length === 0) {
            this.showStatus('Nothing to redo', 'info');
            return;
        }
        
        const currentState = JSON.parse(JSON.stringify(this.geminiResult));
        this.undoStack.push(currentState);
        
        const nextState = this.redoStack.pop();
        this.geminiResult = nextState;
        
        this.fabricObjects.forEach((boxData) => {
            if (boxData.rect) this.canvas.remove(boxData.rect);
            if (boxData.label) this.canvas.remove(boxData.label);
        });
        this.fabricObjects.clear();
        
        this.drawAllBoxes();
        this.canvas.renderAll();
        console.log(\`  - Redo (stack: \${this.redoStack.length} remaining)\`);
        this.showStatus('↷ Redo (' + this.redoStack.length + ' remaining)', 'success');
    }

    updateGeminiResult(rect) {
        const id = rect.id;
        
        const newPos = {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width * rect.scaleX),
            h: Math.round(rect.height * rect.scaleY),
            p: this.currentPageIndex + 1
        };
        
        if (typeof id === 'number') {
            this.geminiResult[id].panel_pos = newPos;
        } else if (typeof id === 'string' && id.includes('-')) {
            const [panelIdx, actionIdx] = id.split('-').map(Number);
            if (this.geminiResult[panelIdx] && this.geminiResult[panelIdx].actions[actionIdx]) {
                this.geminiResult[panelIdx].actions[actionIdx].action_pos = newPos;
            }
        }
    }

    getAllCoordinates() {
        this.fabricObjects.forEach((boxData, id) => {
            if (boxData.rect) {
                this.updateGeminiResult(boxData.rect);
            }
        });
        return this.geminiResult;
    }

    showStatus(message, type = 'info') {
        const status = document.getElementById('editor-status');
        if (!status) return;
        
        status.textContent = message;
        status.className = 'status-' + type;
        status.style.display = 'block';
        
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                status.textContent = '';
                status.className = '';
                status.style.display = 'none';
            }, 2000);
        }
    }

    async save() {
        if (this.isProcessing) {
            this.showStatus('⚠️ Đang save, vui lòng đợi...', 'warning');
            return;
        }
        
        this.isProcessing = true;
        
        try {
            this.showStatus('💾 Saving changes...', 'loading');
            
            const updatedData = this.getAllCoordinates();
            
            if (window.savePanelEdits) {
                await window.savePanelEdits(updatedData);
                this.showStatus('✅ Saved successfully!', 'success');
                
                setTimeout(() => {
                    this.destroy();
                }, 1000);
            } else {
                throw new Error('savePanelEdits function not available');
            }
        } catch (err) {
            console.error('Failed to save:', err);
            this.showStatus('❌ Failed to save: ' + err.message, 'error');
            this.isProcessing = false;
        }
    }
    
    updateRenameByAIButton() {
        if (this.mode !== 'full') return;
        
        const renameBtn = document.getElementById('editorRenameByAIBtn');
        const editActionGroup = document.getElementById('editor-edit-action-group');
        if (!renameBtn || !editActionGroup) return;
        
        // Keep toolbar visible when editing label
        if (this.isEditingLabel && this.editingActionId) {
            editActionGroup.style.display = 'flex';
            renameBtn.disabled = true; // Disable rename button while editing
            return;
        }
        
        const activeObject = this.canvas.getActiveObject();
        const hasSingleActionSelected = activeObject && activeObject.boxType === 'rect' && (!this.canvas.getActiveObjects || this.canvas.getActiveObjects().length === 1);
        
        if (hasSingleActionSelected) {
            renameBtn.disabled = false;
            editActionGroup.style.display = 'flex';
            
            // Update sidebar selection to match canvas selection
            const actionId = activeObject.id;
            if (actionId && typeof actionId === 'string' && actionId.includes('-')) {
                this.selectedActionIdInSidebar = actionId;
                this.updateSidebarSelection();
            }
        } else {
            renameBtn.disabled = true;
            editActionGroup.style.display = 'none';
            this.selectedActionIdInSidebar = null;
            this.updateSidebarSelection();
        }
    }
    
    updateSidebarSelection() {
        const actionListContainer = document.getElementById('editor-action-list');
        if (!actionListContainer) return;
        
        // Remove selection style from all items
        actionListContainer.querySelectorAll('.action-list-item').forEach(item => {
            item.style.background = 'rgba(255, 255, 255, 0.05)';
            item.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        });
        
        // Apply selection style to selected item
        if (this.selectedActionIdInSidebar) {
            const selectedItem = actionListContainer.querySelector(\`[data-action-id="\${this.selectedActionIdInSidebar}"]\`);
            if (selectedItem) {
                selectedItem.style.background = 'rgba(102, 126, 234, 0.3)';
                selectedItem.style.border = '1px solid rgba(102, 126, 234, 0.6)';
            }
        }
    }
    
    renameSelectedAction() {
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject || activeObject.boxType !== 'rect') {
            this.showStatus('⚠️ Please select an action first', 'warning');
            return;
        }
        
        const boxData = this.fabricObjects.get(activeObject.id);
        if (!boxData || !boxData.label) {
            this.showStatus('⚠️ Could not find action label to rename', 'error');
            return;
        }
        
        const id = activeObject.id;
        const currentName = boxData.label.text;
        
        // Show dialog with input field
        const newName = prompt('Nhập tên mới cho action:', currentName);
        
        if (newName === null) {
            // User cancelled
            return;
        }
        
        const normalizedText = newName.trim().replace(/\\s+/g, ' ');
        const finalName = normalizedText || 'Unnamed';
        
        if (finalName === currentName) {
            // No change
            return;
        }
        
        this.saveState();
        
        // Update data
        if (typeof id === 'number') {
            this.geminiResult[id].panel_title = finalName;
        } else if (typeof id === 'string' && id.includes('-')) {
            const [panelIdx, actionIdx] = id.split('-').map(Number);
            if (this.geminiResult[panelIdx] && this.geminiResult[panelIdx].actions[actionIdx]) {
                this.geminiResult[panelIdx].actions[actionIdx].action_name = finalName;
            }
        }
        
        // Update label on canvas
        const label = boxData.label;
        const labelBgColor = label.backgroundColor || 'rgba(0,0,0,0.55)';
        const labelFill = label.fill || '#ffffff';
        const labelFontSize = label.fontSize || 12;
        const labelPadding = label.padding || 3;
        
        const newLabel = new fabric.Text(finalName, {
            left: label.left,
            top: label.top,
            fontSize: labelFontSize,
            fill: labelFill,
            backgroundColor: labelBgColor,
            padding: labelPadding,
            fontWeight: 'bold',
            selectable: false,
            evented: true,
            id: id + '_label',
            linkedBox: id,
            hoverCursor: 'pointer'
        });
        
        this.canvas.remove(label);
        this.canvas.add(newLabel);
        boxData.label = newLabel;
        this.canvas.renderAll();
        
        console.log(\`  - Renamed: "\${currentName}" -> "\${finalName}"\`);
        this.showStatus('✅ Name updated to "' + finalName + '"', 'success');
    }
    
    resetSelectedActionLocation() {
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject || activeObject.boxType !== 'rect') {
            this.showStatus('⚠️ Please select an action first', 'warning');
            return;
        }
        
        const id = activeObject.id;
        
        // Check if this is an action (not a panel)
        if (typeof id === 'number') {
            this.showStatus('⚠️ Please select an action, not a panel', 'warning');
            return;
        }
        
        // Get initial position from saved map
        const initialPos = this.initialActionPositions.get(id);
        if (!initialPos) {
            this.showStatus('⚠️ Could not find initial position for this action', 'error');
            return;
        }
        
        // Get box data
        const boxData = this.fabricObjects.get(id);
        if (!boxData || !boxData.rect) {
            this.showStatus('⚠️ Could not find action box', 'error');
            return;
        }
        
        this.saveState();
        
        // Restore position and size on canvas
        // Reset scaleX and scaleY to 1 to ensure proper size reset
        boxData.rect.set({
            left: initialPos.x,
            top: initialPos.y,
            width: initialPos.w,
            height: initialPos.h,
            scaleX: 1,
            scaleY: 1
        });
        
        // Update coordinates after setting properties
        boxData.rect.setCoords();
        
        // Update label position
        if (boxData.label) {
            boxData.label.set({
                left: initialPos.x + 8,
                top: initialPos.y - 20
            });
            boxData.label.setCoords();
        }
        
        // Update data in geminiResult
        if (typeof id === 'string' && id.includes('-')) {
            const [panelIdx, actionIdx] = id.split('-').map(Number);
            if (this.geminiResult[panelIdx] && this.geminiResult[panelIdx].actions[actionIdx]) {
                this.geminiResult[panelIdx].actions[actionIdx].action_pos = {
                    x: initialPos.x,
                    y: initialPos.y,
                    w: initialPos.w,
                    h: initialPos.h,
                    p: initialPos.p // Preserve page number if exists
                };
            }
        }
        
        this.canvas.renderAll();
        this.showStatus('✅ Action location reset to original position', 'success');
        console.log(\`  - Reset location: action \${id} to (\${initialPos.x}, \${initialPos.y}, \${initialPos.w}, \${initialPos.h})\`);
    }
    
    async renameSelectedActionByAI() {
        if (this.isRenamingByAI) {
            this.showStatus('⚠️ AI rename đang chạy, vui lòng đợi...', 'warning');
            return;
        }
        
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject || activeObject.boxType !== 'rect') {
            this.showStatus('\u26a0\ufe0f Please select an action first', 'warning');
            return;
        }
        
        const [panelIdx, actionIdx] = activeObject.id.split('-').map(Number);
        const action = this.geminiResult[panelIdx]?.actions[actionIdx];
        
        if (!action || !action.action_id) {
            this.showStatus('\u274c Invalid action selected', 'error');
            return;
        }
        
        this.isRenamingByAI = true;
        this.showStatus('\ud83e\udd16 Renaming with AI...', 'loading');
        
        const currentPos = {
            x: Math.round(activeObject.left),
            y: Math.round(activeObject.top),
            w: Math.round(activeObject.width * activeObject.scaleX),
            h: Math.round(activeObject.height * activeObject.scaleY)
        };
        
        try {
            if (window.renameActionByAI) {
                await window.renameActionByAI(action.action_id, currentPos);
                
                if (window.getActionItem) {
                    const updatedAction = await window.getActionItem(action.action_id);
                    if (updatedAction) {
                        this.geminiResult[panelIdx].actions[actionIdx].action_name = updatedAction.name;
                        this.geminiResult[panelIdx].actions[actionIdx].action_type = updatedAction.type;
                        this.geminiResult[panelIdx].actions[actionIdx].action_verb = updatedAction.verb;
                        this.geminiResult[panelIdx].actions[actionIdx].action_content = updatedAction.content;
                        
                        const boxData = this.fabricObjects.get(activeObject.id);
                        if (boxData && boxData.label) {
                            boxData.label.set({ text: updatedAction.name });
                        }
                        this.canvas.renderAll();
                        console.log(\`\u2705 AI renamed action to: "\${updatedAction.name}"\`);
                        this.showStatus(\`\u2705 Renamed to: "\${updatedAction.name}"\`, 'success');
                    }
                }
            } else {
                this.showStatus('\u274c Rename function not available', 'error');
            }
        } catch (err) {
            console.error('Rename by AI failed:', err);
            this.showStatus('\u274c AI rename failed', 'error');
        } finally {
            this.isRenamingByAI = false;
        }
    }

    async cancel() {
        // Stop auto compare interval if running
        if (this.overlayAutoInterval) {
            clearInterval(this.overlayAutoInterval);
            this.overlayAutoInterval = null;
        }
        
        if (this.mode === 'twoPointCrop' || this.mode === 'confirmOnly' || this.mode === 'cropOnly') {
            await this.destroy();
        } else {
            if (confirm('Discard all changes?')) {
                await this.destroy();
            }
        }
    }
    
    toggleCompareMode() {
        if (!this.panelBeforeBase64) return;
        
        // Cycle through modes: AUTO -> OFF -> ON -> AUTO
        if (this.compareMode === 'AUTO') {
            this.compareMode = 'OFF';
            this.stopAutoCompare();
            this.hideOverlay();
        } else if (this.compareMode === 'OFF') {
            this.compareMode = 'ON';
            this.stopAutoCompare();
            this.showOverlay();
        } else {
            this.compareMode = 'AUTO';
            this.startAutoCompare();
        }
        
        this.updateCompareButton();
    }
    
    updateCompareButton() {
        const btn = document.getElementById('editorCompareBtn');
        if (!btn) return;
        
        const labels = {
            'ON': '🔄 Compare (ON)',
            'OFF': '🔄 Compare (OFF)',
            'AUTO': '🔄 Compare (AUTO)'
        };
        btn.textContent = labels[this.compareMode] || '🔄 Compare';
    }
    
    async startAutoCompare() {
        this.stopAutoCompare();
        this.overlayVisible = true;
        await this.showOverlay();
        
        this.overlayAutoInterval = setInterval(async () => {
            this.overlayVisible = !this.overlayVisible;
            if (this.overlayVisible) {
                await this.showOverlay();
            } else {
                this.hideOverlay();
            }
        }, this.overlayAutoIntervalMs);
    }
    
    stopAutoCompare() {
        if (this.overlayAutoInterval) {
            clearInterval(this.overlayAutoInterval);
            this.overlayAutoInterval = null;
        }
    }
    
    async cropPanelBeforeToCurrentPage() {
        if (!this.panelBeforeBase64) return null;
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                
                let yStart, pageHeight, canvasWidth, cropX, cropY, cropW, cropH;
                
                // If panelAfterGlobalPos exists, use it to crop the overlay to match panelAfter region
                if (this.panelAfterGlobalPos && this.mode === 'full') {
                    // Crop panelBefore at the same global_pos region as panelAfter
                    cropX = this.panelAfterGlobalPos.x || 0;
                    cropY = this.panelAfterGlobalPos.y || 0;
                    cropW = this.panelAfterGlobalPos.w || img.width;
                    cropH = this.panelAfterGlobalPos.h || img.height;
                    
                    console.log(\`🎨 cropPanelBeforeToCurrentPage: panelAfterGlobalPos = {x:\${cropX}, y:\${cropY}, w:\${cropW}, h:\${cropH}}, currentPageIndex = \${this.currentPageIndex}\`);
                    
                    // Canvas shows a page (1080px height) of the panelAfter (which is already cropped at global_pos)
                    // So we need to crop panelBefore at the same global_pos region and extract the corresponding page
                    const pageHeight = 1080;
                    const pageYStart = this.currentPageIndex * pageHeight;
                    
                    // Calculate the Y position in the full panelBefore image for current page
                    // Since panelAfter is cropped at global_pos, the current page corresponds to:
                    // global_pos.y + pageYStart in the full panelBefore image
                    const sourceYStart = cropY + pageYStart;
                    const sourceHeight = Math.min(pageHeight, cropH - pageYStart);
                    
                    // If current page is outside global_pos region, return empty/transparent
                    if (pageYStart >= cropH || sourceHeight <= 0) {
                        console.log(\`⚠️ cropPanelBeforeToCurrentPage: Current page is outside global_pos region, returning transparent\`);
                        canvas.width = cropW;
                        canvas.height = pageHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = 'transparent';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        resolve(canvas.toDataURL('image/png').split(',')[1]);
                        return;
                    }
                    
                    // Crop from panelBefore at global_pos region for current page
                    // Use cropW as width to match the panelAfter region width
                    canvas.width = cropW;
                    canvas.height = sourceHeight;
                    const ctx = canvas.getContext('2d');
                    
                    console.log(\`✅ cropPanelBeforeToCurrentPage: Cropping from panelBefore at (x:\${cropX}, y:\${sourceYStart}), size (w:\${cropW}, h:\${sourceHeight})\`);
                    
                    ctx.drawImage(
                        img,
                        cropX, sourceYStart,    // Source: crop from panelBefore at global_pos + page offset
                        cropW, sourceHeight,    // Source size
                        0, 0,                   // Destination position
                        cropW, sourceHeight     // Destination size
                    );
                    
                    const croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
                    resolve(croppedBase64);
                    return;
                }
                
                // Original logic for twoPointCrop mode or when global_pos is not provided
                if (this.mode === 'twoPointCrop' && this.pagesData && this.pagesData[this.currentPageIndex]) {
                    // Use pagesData for twoPointCrop mode
                    const page = this.pagesData[this.currentPageIndex];
                    yStart = page.y_start;
                    pageHeight = page.height;
                    // In twoPointCrop mode, always use width 1920 to match panelAfter page dimensions
                    canvasWidth = 1920;
                } else {
                    // Use default page height for full mode
                    pageHeight = 1080;
                    yStart = this.currentPageIndex * pageHeight;
                    canvasWidth = img.width;
                }
                
                canvas.width = canvasWidth;
                canvas.height = Math.min(pageHeight, img.height - yStart);
                const ctx = canvas.getContext('2d');
                
                ctx.drawImage(
                    img,
                    0, yStart,
                    img.width, canvas.height,
                    0, 0,
                    canvasWidth, canvas.height
                );
                
                const croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
                resolve(croppedBase64);
            };
            img.onerror = reject;
            img.src = 'data:image/png;base64,' + this.panelBeforeBase64;
        });
    }
    
    async showOverlay() {
        if (!this.panelBeforeBase64) {
            console.warn('⚠️ showOverlay: panelBeforeBase64 is null');
            return;
        }
        
        console.log(\`🎨 showOverlay: Using panelBeforeBase64 (length: \${this.panelBeforeBase64.length} chars)\`);
        
        // Remove existing overlay
        if (this.overlayImage) {
            this.canvas.remove(this.overlayImage);
            this.overlayImage = null;
        }
        
        // Crop panelBefore to current page
        const panelBeforePageBase64 = await this.cropPanelBeforeToCurrentPage();
        if (!panelBeforePageBase64) {
            console.warn('⚠️ showOverlay: cropPanelBeforeToCurrentPage returned null');
            return;
        }
        
        console.log(\`✅ showOverlay: Cropped panelBefore page base64 (length: \${panelBeforePageBase64.length} chars)\`);
        
        // Create overlay image
        const img = new Image();
        img.src = 'data:image/png;base64,' + panelBeforePageBase64;
        
        await new Promise((resolve, reject) => {
            img.onload = () => {
                fabric.Image.fromURL(img.src, (fabricImg) => {
                    // Set overlay properties
                    fabricImg.set({
                        left: 0,
                        top: 0,
                        selectable: false,
                        evented: false,
                        excludeFromExport: true,
                        opacity: 0.5,
                        originX: 'left',
                        originY: 'top'
                    });
                    
                    // Scale to match canvas size
                    const canvasWidth = this.canvas.width;
                    const canvasHeight = this.canvas.height;
                    const scaleX = canvasWidth / fabricImg.width;
                    const scaleY = canvasHeight / fabricImg.height;
                    fabricImg.scaleX = scaleX;
                    fabricImg.scaleY = scaleY;
                    
                    this.overlayImage = fabricImg;
                    
                    // Add overlay, but make sure it's above background but below cropRectangle and markers
                    this.canvas.add(fabricImg);
                    
                    // Send overlay to back, but bring cropRectangle and markers to front if they exist
                    this.canvas.sendToBack(fabricImg);
                    
                    // If cropRectangle exists, bring it to front
                    if (this.cropRectangle) {
                        this.canvas.bringToFront(this.cropRectangle);
                    }
                    
                    // If cropMarkers exist (twoPointCrop mode), bring them to front
                    if (this.cropMarkers && this.cropMarkers.length > 0) {
                        this.cropMarkers.forEach(marker => {
                            this.canvas.bringToFront(marker);
                        });
                    }
                    
                    // Bring all other objects (boxes, labels) to front
                    this.fabricObjects.forEach((boxData) => {
                        if (boxData.rect) {
                            this.canvas.bringToFront(boxData.rect);
                        }
                        if (boxData.label) {
                            this.canvas.bringToFront(boxData.label);
                        }
                    });
                    
                    // Bring default panel border to front
                    if (this.defaultPanelBorderLines) {
                        this.defaultPanelBorderLines.forEach(line => {
                            this.canvas.bringToFront(line);
                        });
                    }
                    
                    this.canvas.renderAll();
                    resolve();
                });
            };
            img.onerror = reject;
        });
    }
    
    hideOverlay() {
        if (this.overlayImage) {
            this.canvas.remove(this.overlayImage);
            this.overlayImage = null;
            this.canvas.renderAll();
        }
    }

    reset() {
        if (confirm('Reset all boxes to original positions?')) {
            this.geminiResult = JSON.parse(JSON.stringify(this.originalGeminiResult));
            
            this.fabricObjects.forEach((boxData) => {
                if (boxData.rect) this.canvas.remove(boxData.rect);
                if (boxData.label) this.canvas.remove(boxData.label);
            });
            this.fabricObjects.clear();
            
            this.drawAllBoxes();
            this.canvas.renderAll();
            this.showStatus('↺ Reset to original', 'success');
        }
    }
    
    enableActionDrawingMode(panelIndex) {
        this.isDrawingMode = true;
        this.selectedPanelIndex = panelIndex;
        this.canvas.selection = false;
        this.canvas.forEachObject(obj => obj.selectable = false);
        this.showStatus(\`🖱️ Drawing action for "\${this.geminiResult[panelIndex].panel_title}" - Click and drag\`, 'info');
        
        const borderPadding = 1.5;
        
        const mouseDownHandler = (e) => {
            if (!this.isDrawingMode) return;
            const pointer = this.canvas.getPointer(e.e);
            this.drawingStartX = Math.max(borderPadding, Math.min(pointer.x, this.canvas.width - borderPadding));
            this.drawingStartY = Math.max(borderPadding, Math.min(pointer.y, this.canvas.height - borderPadding));
            
            this.drawingRect = new fabric.Rect({
                left: this.drawingStartX,
                top: this.drawingStartY,
                width: 0,
                height: 0,
                fill: 'transparent',
                stroke: '#00aaff',
                strokeWidth: 3,
                strokeUniform: true,
                selectable: false
            });
            this.canvas.add(this.drawingRect);
        };
        
        const mouseMoveHandler = (e) => {
            if (!this.isDrawingMode || !this.drawingRect) return;
            const pointer = this.canvas.getPointer(e.e);
            
            const clampedX = Math.max(borderPadding, Math.min(pointer.x, this.canvas.width - borderPadding));
            const clampedY = Math.max(borderPadding, Math.min(pointer.y, this.canvas.height - borderPadding));
            
            let width = clampedX - this.drawingStartX;
            let height = clampedY - this.drawingStartY;
            let left = width < 0 ? clampedX : this.drawingStartX;
            let top = height < 0 ? clampedY : this.drawingStartY;
            
            width = Math.abs(width);
            height = Math.abs(height);
            
            width = Math.min(width, this.canvas.width - borderPadding - left);
            height = Math.min(height, this.canvas.height - borderPadding - top);
            
            this.drawingRect.set({
                width: width,
                height: height,
                left: left,
                top: top
            });
            this.canvas.renderAll();
        };
        
        const mouseUpHandler = () => {
            if (!this.isDrawingMode || !this.drawingRect) return;
            
            if (this.drawingRect.width < 10 || this.drawingRect.height < 10) {
                this.canvas.remove(this.drawingRect);
                this.showStatus('⚠️ Action too small, try again', 'error');
                this.disableActionDrawingMode();
                return;
            }
            
            const actionName = prompt('Action Name:');
            if (!actionName || !actionName.trim()) {
                this.canvas.remove(this.drawingRect);
                this.showStatus('❌ Action creation cancelled', 'info');
                this.disableActionDrawingMode();
                return;
            }
            
            let actionType = prompt('Action Type (button/input field/dropdown menu/draggable item):');
            if (!actionType || !actionType.trim()) {
                actionType = 'button';
            }
            
            let actionVerb = prompt('Action Verb (click/type/dragdrop/paste):');
            if (!actionVerb || !actionVerb.trim()) {
                actionVerb = 'click';
            }
            
            const actionContent = prompt('Action Content (optional):');
            
            const normalizeWhitespace = (text) => text ? text.trim().replace(/\\s+/g, ' ') : '';
            
            const actionData = {
                name: normalizeWhitespace(actionName) || 'Unnamed',
                type: normalizeWhitespace(actionType).toLowerCase() || 'button',
                verb: normalizeWhitespace(actionVerb).toLowerCase() || 'click',
                content: normalizeWhitespace(actionContent) || null
            };
            
            this.addNewAction(this.drawingRect, actionData, this.selectedPanelIndex);
            
            this.disableActionDrawingMode();
        };
        
        this.canvas.on('mouse:down', mouseDownHandler);
        this.canvas.on('mouse:move', mouseMoveHandler);
        this.canvas.on('mouse:up', mouseUpHandler);
        
        this._actionDrawingHandlers = { mouseDownHandler, mouseMoveHandler, mouseUpHandler };
    }
    
    disableActionDrawingMode() {
        this.isDrawingMode = false;
        this.drawingRect = null;
        this.selectedPanelIndex = null;
        this.canvas.selection = true;
        this.canvas.forEachObject(obj => obj.selectable = obj.boxType === 'rect');
        
        if (this._actionDrawingHandlers) {
            this.canvas.off('mouse:down', this._actionDrawingHandlers.mouseDownHandler);
            this.canvas.off('mouse:move', this._actionDrawingHandlers.mouseMoveHandler);
            this.canvas.off('mouse:up', this._actionDrawingHandlers.mouseUpHandler);
            this._actionDrawingHandlers = null;
        }
        
        const addBtn = document.getElementById('editorAddActionBtn');
        if (addBtn) {
            addBtn.style.background = '';
            addBtn.style.color = '';
            addBtn.style.fontWeight = '';
        }
    }
    
    toggleActionDrawingMode() {
        const addBtn = document.getElementById('editorAddActionBtn');
        
        if (this.isDrawingMode) {
            this.disableActionDrawingMode();
            this.showStatus('✅ Drawing mode disabled', 'info');
        } else {
            if (this.isCroppingMode) {
                this.disableCropMode();
            }
            this.enableActionDrawingMode(0);
            addBtn.style.background = '#2196F3';
            addBtn.style.color = 'white';
            addBtn.style.fontWeight = 'bold';
        }
    }
    
    enableCropMode() {
        this.isCroppingMode = true;
        this.canvas.selection = false;
        this.canvas.forEachObject(obj => {
            obj.selectable = false;
            obj.evented = false;
        });
        this.showStatus('✂️ Crop Mode - Click and drag to select crop area (ESC to cancel)', 'info');
        
        const borderPadding = 1.5;
        
        const cropRect = new fabric.Rect({
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            fill: 'transparent',
            stroke: '#00ff00',
            strokeWidth: 3,
            strokeUniform: true,
            selectable: false,
            evented: false
        });
        
        let startX = 0, startY = 0;
        let isDrawing = false;
        
        const mouseDownHandler = (e) => {
            if (!this.isCroppingMode) return;
            const pointer = this.canvas.getPointer(e.e);
            startX = Math.max(borderPadding, Math.min(pointer.x, this.canvas.width - borderPadding));
            startY = Math.max(borderPadding, Math.min(pointer.y, this.canvas.height - borderPadding));
            isDrawing = true;
            
            cropRect.set({
                left: startX,
                top: startY,
                width: 0,
                height: 0
            });
            this.canvas.add(cropRect);
        };
        
        const mouseMoveHandler = (e) => {
            if (!this.isCroppingMode || !isDrawing) return;
            const pointer = this.canvas.getPointer(e.e);
            
            const clampedX = Math.max(borderPadding, Math.min(pointer.x, this.canvas.width - borderPadding));
            const clampedY = Math.max(borderPadding, Math.min(pointer.y, this.canvas.height - borderPadding));
            
            let width = clampedX - startX;
            let height = clampedY - startY;
            let left = width < 0 ? clampedX : startX;
            let top = height < 0 ? clampedY : startY;
            
            width = Math.abs(width);
            height = Math.abs(height);
            
            width = Math.min(width, this.canvas.width - borderPadding - left);
            height = Math.min(height, this.canvas.height - borderPadding - top);
            
            cropRect.set({
                width: width,
                height: height,
                left: left,
                top: top
            });
            this.canvas.renderAll();
        };
        
        const mouseUpHandler = async () => {
            if (!this.isCroppingMode || !isDrawing) return;
            isDrawing = false;
            
            const cropArea = {
                x: Math.max(0, Math.round(cropRect.left)),
                y: Math.max(0, Math.round(cropRect.top)),
                width: Math.round(cropRect.width),
                height: Math.round(cropRect.height)
            };
            
            this.canvas.remove(cropRect);
            
            if (cropArea.width < 10 || cropArea.height < 10) {
                this.showStatus('⚠️ Crop area too small', 'error');
                this.disableCropMode();
                return;
            }
            
            await this.cropImage(cropArea);
            this.disableCropMode();
        };
        
        const escHandler = (e) => {
            if (e.key === 'Escape' && this.isCroppingMode) {
                this.canvas.remove(cropRect);
                this.disableCropMode();
                this.showStatus('✖ Crop cancelled', 'info');
            }
        };
        
        this.canvas.on('mouse:down', mouseDownHandler);
        this.canvas.on('mouse:move', mouseMoveHandler);
        this.canvas.on('mouse:up', mouseUpHandler);
        document.addEventListener('keydown', escHandler);
        
        this._cropHandlers = { mouseDownHandler, mouseMoveHandler, mouseUpHandler, escHandler };
    }
    
    disableCropMode() {
        this.isCroppingMode = false;
        this.canvas.selection = true;
        this.canvas.forEachObject(obj => {
            obj.selectable = obj.boxType === 'rect';
            obj.evented = true;
        });
        
        if (this._cropHandlers) {
            this.canvas.off('mouse:down', this._cropHandlers.mouseDownHandler);
            this.canvas.off('mouse:move', this._cropHandlers.mouseMoveHandler);
            this.canvas.off('mouse:up', this._cropHandlers.mouseUpHandler);
            document.removeEventListener('keydown', this._cropHandlers.escHandler);
            this._cropHandlers = null;
        }
        
        const cropBtn = document.getElementById('editorCropBtn');
        if (cropBtn) {
            cropBtn.style.background = '';
            cropBtn.style.color = '';
            cropBtn.style.fontWeight = '';
            cropBtn.textContent = '✂️ Crop (OFF)';
        }
    }
    
    toggleCropMode() {
        const cropBtn = document.getElementById('editorCropBtn');
        
        if (this.isCroppingMode) {
            this.disableCropMode();
            this.showStatus('✅ Crop mode disabled', 'info');
        } else {
            if (this.isDrawingMode) {
                this.disableActionDrawingMode();
            }
            this.enableCropMode();
            cropBtn.style.background = '#4CAF50';
            cropBtn.style.color = 'white';
            cropBtn.style.fontWeight = 'bold';
            cropBtn.textContent = '✂️ Crop (ON)';
        }
    }
    
    addNewAction(tempRect, actionData, panelIndex) {
        this.saveState();
        
        const actionIndex = this.geminiResult[panelIndex].actions.length;
        const newAction = {
            action_id: 'action_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            action_name: actionData.name,
            action_type: actionData.type,
            action_verb: actionData.verb,
            action_content: actionData.content,
            action_pos: {
                x: Math.round(tempRect.left),
                y: Math.round(tempRect.top),
                w: Math.round(tempRect.width),
                h: Math.round(tempRect.height),
                p: this.currentPageIndex + 1
            }
        };
        
        this.geminiResult[panelIndex].actions.push(newAction);
        this.canvas.remove(tempRect);
        this.drawBox(newAction.action_pos, panelIndex + '-' + actionIndex, 'action', actionData.name);
        console.log(\`  - Add: "\${actionData.name}" [\${actionData.type}] at (\${newAction.action_pos.x},\${newAction.action_pos.y},\${newAction.action_pos.w},\${newAction.action_pos.h})\`);
        this.showStatus('✅ Action "' + actionData.name + '" added to "' + this.geminiResult[panelIndex].panel_title + '"', 'success');
        this.renderActionList();
    }
    
    editLabel(label) {
        const id = label.linkedBox;
        const boxData = this.fabricObjects.get(id);
        if (!boxData) return;
        
        const labelBgColor = label.backgroundColor || 'rgba(0,0,0,0.55)';
        const labelFill = label.fill || '#ffffff';
        const labelFontSize = label.fontSize || 12;
        const labelPadding = label.padding || 3;
        
        const itext = new fabric.IText(label.text, {
            left: label.left,
            top: label.top,
            fontSize: labelFontSize,
            fill: labelFill,
            backgroundColor: labelBgColor,
            padding: labelPadding,
            fontWeight: 'bold'
        });
        
        this.canvas.remove(label);
        this.canvas.add(itext);
        this.canvas.setActiveObject(itext);
        itext.enterEditing();
        itext.selectAll();
        
        // Store editing state to keep toolbar visible
        this.isEditingLabel = true;
        this.editingActionId = id;
        this.updateRenameByAIButton(); // Update toolbar to show it's visible during editing
        
        const finishEditing = () => {
            this.isEditingLabel = false;
            const savedActionId = this.editingActionId;
            this.editingActionId = null;
            
            const normalizedText = itext.text.trim().replace(/\\s+/g, ' ');
            const newText = normalizedText || 'Unnamed';
            const oldText = label.text;
            
            this.saveState();
            
            if (typeof id === 'number') {
                this.geminiResult[id].panel_title = newText;
            } else if (typeof id === 'string' && id.includes('-')) {
                const [panelIdx, actionIdx] = id.split('-').map(Number);
                if (this.geminiResult[panelIdx] && this.geminiResult[panelIdx].actions[actionIdx]) {
                    this.geminiResult[panelIdx].actions[actionIdx].action_name = newText;
                }
            }
            
            if (oldText !== newText) {
                console.log(\`  - Renamed: "\${oldText}" -> "\${newText}"\`);
            }
            
            const newLabel = new fabric.Text(newText, {
                left: itext.left,
                top: itext.top,
                fontSize: labelFontSize,
                fill: labelFill,
                backgroundColor: labelBgColor,
                padding: labelPadding,
                fontWeight: 'bold',
                selectable: false,
                evented: true,
                id: id + '_label',
                linkedBox: id,
                hoverCursor: 'pointer'
            });
            
            this.canvas.remove(itext);
            this.canvas.add(newLabel);
            boxData.label = newLabel;
            
            // Restore selection to the rect object after editing
            if (boxData.rect) {
                this.canvas.setActiveObject(boxData.rect);
            }
            
            this.canvas.renderAll();
            this.updateRenameByAIButton(); // Update toolbar state after editing
            this.showStatus('✅ Name updated to "' + newText + '"', 'success');
        };
        
        itext.on('editing:exited', finishEditing);
    }
    
    deleteSelectedAction() {
        const activeObject = this.canvas.getActiveObject();
        
        if (!activeObject) {
            this.showStatus('⚠️ Select action(s) to delete', 'error');
            return;
        }
        
        let objectsToDelete = [];
        
        if (activeObject.type === 'activeSelection') {
            objectsToDelete = activeObject.getObjects().filter(obj => obj.boxType === 'rect');
        } else if (activeObject.boxType === 'rect') {
            objectsToDelete = [activeObject];
        }
        
        if (objectsToDelete.length === 0) {
            this.showStatus('⚠️ No actions selected', 'error');
            return;
        }
        
        this.saveState();
        
        const deletedNames = [];
        const deletedIds = [];
        
        objectsToDelete.forEach(obj => {
            const id = obj.id;
            if (typeof id === 'string' && id.includes('-')) {
                const boxData = this.fabricObjects.get(id);
                if (boxData) {
                    this.canvas.remove(boxData.rect);
                    this.canvas.remove(boxData.label);
                    this.fabricObjects.delete(id);
                    deletedIds.push(id);
                    
                    const [panelIdx, actionIdx] = id.split('-').map(Number);
                    const actionName = this.geminiResult[panelIdx]?.actions[actionIdx]?.action_name || 'action';
                    deletedNames.push(actionName);
                }
            }
        });
        
        deletedIds.sort((a, b) => {
            const [aPanelIdx, aActionIdx] = a.split('-').map(Number);
            const [bPanelIdx, bActionIdx] = b.split('-').map(Number);
            if (aPanelIdx !== bPanelIdx) return bPanelIdx - aPanelIdx;
            return bActionIdx - aActionIdx;
        });
        
        deletedIds.forEach(id => {
            const [panelIdx, actionIdx] = id.split('-').map(Number);
            if (this.geminiResult[panelIdx] && this.geminiResult[panelIdx].actions) {
                this.geminiResult[panelIdx].actions.splice(actionIdx, 1);
            }
        });
        
        this.redrawAll();
        
            if (deletedNames.length === 1) {
                console.log(\`  - Delete: "\${deletedNames[0]}"\`);
                this.showStatus('✅ Deleted "' + deletedNames[0] + '"', 'success');
            } else {
                deletedNames.forEach(name => console.log(\`  - Delete: "\${name}"\`));
                this.showStatus('✅ Deleted ' + deletedNames.length + ' actions', 'success');
            }
        
        this.renderActionList();
    }
    
    redrawAll() {
        this.fabricObjects.forEach((boxData) => {
            if (boxData.rect) this.canvas.remove(boxData.rect);
            if (boxData.label) this.canvas.remove(boxData.label);
        });
        this.fabricObjects.clear();
        this.drawDefaultPanelBorder();
        this.drawAllBoxes();
        this.canvas.renderAll();
    }
    
    async saveFullScreenshotPanel() {
        try {
            this.isProcessing = true;
            this.showStatus('💾 Saving panel with full screenshot...', 'loading');
            
            if (window.saveCroppedPanel && this.actionItemId) {
                let parentPanelId = null;
                
                if (window.getParentPanelOfAction) {
                    parentPanelId = await window.getParentPanelOfAction(this.actionItemId);
                }
                
                await window.saveCroppedPanel(this.imageBase64, null, this.actionItemId, parentPanelId);
                this.destroy();
            } else {
                this.showStatus('❌ saveCroppedPanel not available', 'error');
                this.isProcessing = false;
            }
        } catch (err) {
            console.error('Failed to save panel:', err);
            this.showStatus('❌ Failed to save: ' + err.message, 'error');
            this.isProcessing = false;
        }
    }
    
    async cropImage(cropArea) {
        try {
            this.showStatus('✂️ Analyzing crop area...', 'loading');
            
            const actionsToDelete = [];
            const actionsToKeep = [];
            
            this.fabricObjects.forEach((boxData, id) => {
                if (boxData.rect && typeof id === 'string' && id.includes('-')) {
                    const rect = boxData.rect;
                    const actionRight = rect.left + (rect.width * rect.scaleX);
                    const actionBottom = rect.top + (rect.height * rect.scaleY);
                    const cropRight = cropArea.x + cropArea.width;
                    const cropBottom = cropArea.y + cropArea.height;
                    
                    const isFullyInside = 
                        rect.left >= cropArea.x &&
                        rect.top >= cropArea.y &&
                        actionRight <= cropRight &&
                        actionBottom <= cropBottom;
                    
                    if (!isFullyInside) {
                        actionsToDelete.push(id);
                    } else {
                        actionsToKeep.push(id);
                    }
                }
            });
            
            const totalActions = actionsToDelete.length + actionsToKeep.length;
            let confirmMessage = 'Lưu crop này không?';
            if (actionsToDelete.length > 0) {
                console.log(\`  - Crop: Will remove \${actionsToDelete.length}/\${totalActions} actions outside crop area\`);
                confirmMessage = \`Lưu crop này?\\n\\nSẽ xóa \${actionsToDelete.length}/\${totalActions} actions nằm ngoài vùng crop.\\n\\nOK = Lưu\\nCancel = Hủy\`;
            }
            
            const userConfirmed = confirm(confirmMessage);
            
            if (!userConfirmed) {
                this.showStatus('↩️ Crop cancelled', 'info');
                return;
            }
            
            this.isProcessing = true;
            this.showStatus('💾 Saving cropped panel...', 'loading');
            console.log('Saving panel with crop position:', cropArea);
            
            if (window.updatePanelImageAndCoordinates && this.eventId) {
                const updatedGeminiResult = JSON.parse(JSON.stringify(this.geminiResult));
                
                actionsToDelete.sort((a, b) => {
                    const [aPanelIdx, aActionIdx] = a.split('-').map(Number);
                    const [bPanelIdx, bActionIdx] = b.split('-').map(Number);
                    if (aPanelIdx !== bPanelIdx) return bPanelIdx - aPanelIdx;
                    return bActionIdx - aActionIdx;
                });
                
                const deletedActionsInfo = [];
                actionsToDelete.forEach(id => {
                    const [panelIdx, actionIdx] = id.split('-').map(Number);
                    if (updatedGeminiResult[panelIdx] && updatedGeminiResult[panelIdx].actions) {
                        const action = updatedGeminiResult[panelIdx].actions[actionIdx];
                        if (action) {
                            deletedActionsInfo.push({
                                action_id: action.action_id,
                                action_name: action.action_name,
                                action_pos: action.action_pos
                            });
                        }
                        updatedGeminiResult[panelIdx].actions.splice(actionIdx, 1);
                    }
                });
                
                updatedGeminiResult.forEach(panel => {
                    panel.actions.forEach(action => {
                        action.action_pos.x = Math.round(action.action_pos.x - cropArea.x);
                        action.action_pos.y = Math.round(action.action_pos.y - cropArea.y);
                    });
                });
                
                await window.updatePanelImageAndCoordinates(
                    this.eventId, 
                    this.imageBase64,
                    cropArea,
                    updatedGeminiResult,
                    deletedActionsInfo
                );
                
                if (actionsToDelete.length > 0) {
                    this.showStatus(\`✅ Saved! Removed \${actionsToDelete.length}/\${totalActions} actions\`, 'success');
                } else {
                    this.showStatus('✅ Cropped panel saved', 'success');
                }
                
                setTimeout(() => {
                    this.destroy();
                }, 800);
            } else {
                this.showStatus('❌ updatePanelImageAndCoordinates not available', 'error');
                this.isProcessing = false;
            }
        } catch (err) {
            console.error('Failed to crop:', err);
            this.showStatus('❌ Failed to crop: ' + err.message, 'error');
            this.isProcessing = false;
        }
    }
    
    async cropBase64Image(base64, cropArea) {
        const response = await fetch('data:image/png;base64,' + base64);
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = cropArea.width;
                canvas.height = cropArea.height;
                const ctx = canvas.getContext('2d');
                
                ctx.drawImage(
                    img,
                    cropArea.x, cropArea.y, cropArea.width, cropArea.height,
                    0, 0, cropArea.width, cropArea.height
                );
                
                const croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
                resolve(croppedBase64);
            };
            img.onerror = reject;
            img.src = URL.createObjectURL(blob);
        });
    }

    drawCropRectangle() {
        if (!this.calculatedCropArea || !this.pagesData) return;
        
        if (this.cropRectangle) {
            this.canvas.remove(this.cropRectangle);
            this.cropRectangle = null;
        }
        
        const page = this.pagesData[this.currentPageIndex];
        if (!page) return;
        
        const pageYStart = page.y_start;
        const pageYEnd = pageYStart + page.height;
        
        const cropYStart = this.calculatedCropArea.y;
        const cropYEnd = cropYStart + this.calculatedCropArea.h;
        
        if (cropYEnd < pageYStart || cropYStart > pageYEnd) {
            return;
        }
        
        const rectYStart = Math.max(0, cropYStart - pageYStart);
        const rectYEnd = Math.min(page.height, cropYEnd - pageYStart);
        const rectHeight = rectYEnd - rectYStart;
        
        if (rectHeight <= 0) return;
        
        const rectX = this.calculatedCropArea.x;
        const rectWidth = this.calculatedCropArea.w;
        
        this.cropRectangle = new fabric.Rect({
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
        
        this.canvas.add(this.cropRectangle);
        // Bring cropRectangle to front (above overlay but below other objects)
        this.canvas.bringToFront(this.cropRectangle);
        
        // Bring all other objects (boxes, labels) to front
        this.fabricObjects.forEach((boxData) => {
            if (boxData.rect) {
                this.canvas.bringToFront(boxData.rect);
            }
            if (boxData.label) {
                this.canvas.bringToFront(boxData.label);
            }
        });
        
        // Bring default panel border to front
        if (this.defaultPanelBorderLines) {
            this.defaultPanelBorderLines.forEach(line => {
                this.canvas.bringToFront(line);
            });
        }
        
        this.canvas.renderAll();
    }
    
    removeCropRectangle() {
        if (this.cropRectangle) {
            this.canvas.remove(this.cropRectangle);
            this.cropRectangle = null;
            this.canvas.renderAll();
        }
    }
    
    setupMarkerDragHandlers() {
        // Remove existing handlers first
        if (this._markerMoveHandler) {
            this.canvas.off('object:moving', this._markerMoveHandler);
        }
        if (this._markerModifiedHandler) {
            this.canvas.off('object:modified', this._markerModifiedHandler);
        }
        
        // Only setup handlers if we have 2 points
        if (this.cropPoints.length !== 2) {
            return;
        }
        
        this._markerMoveHandler = (e) => {
            const obj = e.target;
            if (obj.cropMarkerIndex !== undefined && obj.cropMarkerIndex !== null) {
                const canvasWidth = this.canvas.width;
                const canvasHeight = this.canvas.height;
                
                // Keep marker within canvas bounds
                obj.setCoords();
                const bound = obj.getBoundingRect();
                
                if (bound.left < 0) {
                    obj.left += Math.abs(bound.left);
                }
                if (bound.top < 0) {
                    obj.top += Math.abs(bound.top);
                }
                if (bound.left + bound.width > canvasWidth) {
                    obj.left -= (bound.left + bound.width - canvasWidth);
                }
                if (bound.top + bound.height > canvasHeight) {
                    obj.top -= (bound.top + bound.height - canvasHeight);
                }
                
                obj.setCoords();
                this.canvas.renderAll();
            }
        };
        
        this._markerModifiedHandler = (e) => {
            const obj = e.target;
            if (obj.cropMarkerIndex !== undefined && obj.cropMarkerIndex !== null) {
                const markerIndex = obj.cropMarkerIndex;
                const newX = Math.round(obj.left + 8); // center of marker
                const newY = Math.round(obj.top + 8);
                
                // Update the crop point
                if (this.cropPoints[markerIndex]) {
                    this.cropPoints[markerIndex].x = newX;
                    this.cropPoints[markerIndex].y = newY;
                    
                    // Recalculate crop area and redraw rectangle
                    if (this.cropPoints.length === 2) {
                        this.confirmTwoPointCrop();
                    }
                }
            }
        };
        
        this.canvas.on('object:moving', this._markerMoveHandler);
        this.canvas.on('object:modified', this._markerModifiedHandler);
    }

    enableTwoPointCropMode() {
        console.log('✅ Two-Point Crop Mode enabled, cropPoints:', this.cropPoints);
        
        if (!this.cropPoints) {
            this.cropPoints = [];
        }
        
        if (this.cropMarkers && this.cropMarkers.length > 0) {
            this.cropMarkers.forEach(m => this.canvas.remove(m));
        }
        this.cropMarkers = [];
        
        // Remove existing marker handlers
        if (this._markerMoveHandler) {
            this.canvas.off('object:moving', this._markerMoveHandler);
        }
        if (this._markerModifiedHandler) {
            this.canvas.off('object:modified', this._markerModifiedHandler);
        }
        
        this.removeCropRectangle();
        
        // Create markers - allow dragging if we have 2 points
        const canDrag = this.cropPoints.length === 2;
        
        this.cropPoints.forEach((point, index) => {
            if (point.pageIndex === this.currentPageIndex) {
                const marker = new fabric.Circle({
                    left: point.x - 8,
                    top: point.y - 8,
                    radius: 8,
                    fill: index === 0 ? 'lime' : 'red',
                    stroke: '#000',
                    strokeWidth: 2,
                    selectable: canDrag,
                    evented: canDrag,
                    hasControls: false,
                    hasBorders: false,
                    lockRotation: true,
                    lockScalingX: true,
                    lockScalingY: true,
                    cropMarkerIndex: index
                });
                this.canvas.add(marker);
                this.cropMarkers.push(marker);
            }
        });
        
        // Add drag handlers for markers when we have 2 points
        if (canDrag) {
            this.setupMarkerDragHandlers();
        }
        
        if (this.calculatedCropArea && this.cropPoints.length === 2) {
            this.drawCropRectangle();
        }
        
        this.canvas.renderAll();
        
        this.canvas.selection = false;
        
        const statusMsg = this.cropPoints.length === 1 
            ? \`📍 Point 1 set on Page \${this.cropPoints[0].pageIndex + 1}. Click BottomRight corner.\`
            : this.cropPoints.length === 2
            ? '📍 Drag points to adjust crop area'
            : '📍 Click TopLeft corner (or switch page first)';
        this.showStatus(statusMsg, 'info');
        
        if (this._twoPointHandler) {
            this.canvas.off('mouse:down', this._twoPointHandler);
        }
        
        if (this._twoPointUndoHandler) {
            document.removeEventListener('keydown', this._twoPointUndoHandler);
        }
        
        this._twoPointUndoHandler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && this.cropPoints.length > 0) {
                e.preventDefault();
                console.log('↶ Undo crop point');
                
                this.cropPoints.pop();
                
                const saveBtn = document.getElementById('editorSaveCropBtn');
                if (saveBtn) {
                    saveBtn.style.display = 'none';
                }
                this.calculatedCropArea = null;
                this.removeCropRectangle();
                
                if (this.cropPoints.length === 0) {
                    this.showStatus('↶ Undo: Point removed. Click TopLeft corner', 'info');
                } else {
                    this.showStatus(\`↶ Undo: Point 2 removed. Point 1 at Page \${this.cropPoints[0].pageIndex + 1}\`, 'info');
                }
                
                this.enableTwoPointCropMode();
            }
        };
        
        document.addEventListener('keydown', this._twoPointUndoHandler);
        
        const clickHandler = (e) => {
            // Don't handle clicks if clicking on a marker (let marker drag handle it)
            if (e.target && e.target.cropMarkerIndex !== undefined) {
                return;
            }
            
            const pointer = this.canvas.getPointer(e.e);
            const x = Math.round(pointer.x);
            const y = Math.round(pointer.y);
            
            console.log('Click detected! Current cropPoints:', this.cropPoints, 'Current page:', this.currentPageIndex);
            
            if (this.cropPoints.length === 0) {
                console.log('Adding Point 1 at:', {x, y, pageIndex: this.currentPageIndex});
                this.cropPoints.push({ x, y, pageIndex: this.currentPageIndex });
                
                const marker = new fabric.Circle({
                    left: x - 8,
                    top: y - 8,
                    radius: 8,
                    fill: 'lime',
                    stroke: '#000',
                    strokeWidth: 2,
                    selectable: false,
                    evented: false,
                    hasControls: false,
                    hasBorders: false,
                    lockRotation: true,
                    lockScalingX: true,
                    lockScalingY: true,
                    cropMarkerIndex: 0
                });
                this.canvas.add(marker);
                this.cropMarkers.push(marker);
                
                this.showStatus('📍 Point 1 set. Click BottomRight corner (or switch page)', 'success');
                
            } else if (this.cropPoints.length === 1) {
                console.log('Adding Point 2 at:', {x, y, pageIndex: this.currentPageIndex});
                console.log('Point 1 was at:', this.cropPoints[0]);
                this.cropPoints.push({ x, y, pageIndex: this.currentPageIndex });
                
                const marker = new fabric.Circle({
                    left: x - 8,
                    top: y - 8,
                    radius: 8,
                    fill: 'red',
                    stroke: '#000',
                    strokeWidth: 2,
                    selectable: true,
                    evented: true,
                    hasControls: false,
                    hasBorders: false,
                    lockRotation: true,
                    lockScalingX: true,
                    lockScalingY: true,
                    cropMarkerIndex: 1
                });
                this.canvas.add(marker);
                this.cropMarkers.push(marker);
                
                // Enable dragging for the first marker as well
                if (this.cropMarkers[0]) {
                    this.cropMarkers[0].set({
                        selectable: true,
                        evented: true
                    });
                }
                
                // Setup drag handlers for markers
                this.setupMarkerDragHandlers();
                
                this.canvas.off('mouse:down', clickHandler);
                this.confirmTwoPointCrop();
            }
        };
        
        // Only add click handler if we don't have 2 points yet
        if (this.cropPoints.length < 2) {
            this.canvas.on('mouse:down', clickHandler);
            this._twoPointHandler = clickHandler;
        }
    }
    
    async confirmTwoPointCrop() {
        const point1 = this.cropPoints[0];
        const point2 = this.cropPoints[1];
        
        console.log('=== CONFIRM CROP ===');
        console.log('Point 1:', point1);
        console.log('Point 2:', point2);
        console.log('Pages data:', this.pagesData);
        
        const page1Y = this.pagesData[point1.pageIndex].y_start;
        const page2Y = this.pagesData[point2.pageIndex].y_start;
        
        console.log('Page 1 Y start:', page1Y);
        console.log('Page 2 Y start:', page2Y);
        
        const absolutePoint1 = { x: point1.x, y: page1Y + point1.y };
        const absolutePoint2 = { x: point2.x, y: page2Y + point2.y };
        
        console.log('Absolute Point 1:', absolutePoint1);
        console.log('Absolute Point 2:', absolutePoint2);
        
        const cropArea = {
            x: Math.min(absolutePoint1.x, absolutePoint2.x),
            y: Math.min(absolutePoint1.y, absolutePoint2.y),
            w: Math.abs(absolutePoint2.x - absolutePoint1.x),
            h: Math.abs(absolutePoint2.y - absolutePoint1.y)
        };
        
        console.log('Final crop area:', cropArea);
        
        if (cropArea.w < 50 || cropArea.h < 50) {
            alert('⚠️ Crop area quá nhỏ (min 50x50px). Vui lòng vẽ lại.');
            this.cropPoints = [];
            this.cropMarkers.forEach(m => this.canvas.remove(m));
            this.cropMarkers = [];
            this.enableTwoPointCropMode();
            return;
        }
        
        this.calculatedCropArea = cropArea;
        
        const saveBtn = document.getElementById('editorSaveCropBtn');
        if (saveBtn) {
            saveBtn.style.display = 'inline-block';
        }
        
        this.drawCropRectangle();
        
        this.showStatus(\`✅ Crop area ready: \${cropArea.w}x\${cropArea.h}px. Click Save to confirm.\`, 'success');
    }
    
    async saveTwoPointCrop() {
        if (!this.calculatedCropArea) {
            alert('⚠️ No crop area calculated');
            return;
        }
        
        const saveBtn = document.getElementById('editorSaveCropBtn');
        if (saveBtn) {
            saveBtn.innerHTML = '⏳ Saving... <span style="display:inline-block;width:12px;height:12px;border:2px solid white;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-left:5px;"></span>';
            saveBtn.disabled = true;
        }
        
        this.showStatus('✅ Saving cropped panel...', 'success');
        
        if (window.confirmPanelCrop) {
            await window.confirmPanelCrop(this.calculatedCropArea);
        }
        
        await this.cancel();
    }
    
    async dontCropFullPage() {
        const dontCropBtn = document.getElementById('editorDontCropBtn');
        if (dontCropBtn) {
            dontCropBtn.innerHTML = '⏳ Processing... <span style="display:inline-block;width:12px;height:12px;border:2px solid white;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-left:5px;"></span>';
            dontCropBtn.disabled = true;
        }
        
        const tempImg = new Image();
        tempImg.src = 'data:image/png;base64,' + this.imageBase64;
        await new Promise((resolve, reject) => {
            tempImg.onload = resolve;
            tempImg.onerror = reject;
        });
        
        const fullWidth = tempImg.naturalWidth;
        const fullHeight = tempImg.naturalHeight;
        
        this.calculatedCropArea = {
            x: 0,
            y: 0,
            w: fullWidth,
            h: fullHeight
        };
        
        this.showStatus(\`📐 Using full screenshot: \${fullWidth}x\${fullHeight}px. Saving...\`, 'info');
        
        await this.saveTwoPointCrop();
    }
    
    async cropPageFromFull(pageIndex) {
        if (!this.pagesData || !this.fullScreenshotBase64) return this.fullScreenshotBase64;
        
        const page = this.pagesData[pageIndex];
        if (!page) return this.fullScreenshotBase64;
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 1920;
                canvas.height = page.height;
                const ctx = canvas.getContext('2d');
                
                ctx.drawImage(
                    img,
                    0, page.y_start,
                    1920, page.height,
                    0, 0,
                    1920, page.height
                );
                
                const croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
                resolve(croppedBase64);
            };
            img.onerror = reject;
            img.src = 'data:image/png;base64,' + this.fullScreenshotBase64;
        });
    }
    
    async cropPageFromPanel(pageIndex) {
        if (!this.fullPanelBase64) return this.fullPanelBase64;
        
        const pageHeight = 1080;
        const yStart = pageIndex * pageHeight;
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = Math.min(pageHeight, img.height - yStart);
                const ctx = canvas.getContext('2d');
                
                ctx.drawImage(
                    img,
                    0, yStart,
                    img.width, canvas.height,
                    0, 0,
                    img.width, canvas.height
                );
                
                const croppedBase64 = canvas.toDataURL('image/png').split(',')[1];
                resolve(croppedBase64);
            };
            img.onerror = reject;
            img.src = 'data:image/png;base64,' + this.fullPanelBase64;
        });
    }
    
    async switchEditPage(direction) {
        if (this.numPages <= 1) return;
        
        if (direction === 'next' && this.currentPageIndex < this.numPages - 1) {
            this.currentPageIndex++;
        } else if (direction === 'prev' && this.currentPageIndex > 0) {
            this.currentPageIndex--;
        } else {
            return;
        }
        
        // Reset selection when switching pages
        this.selectedActionIdInSidebar = null;
        this.canvas.discardActiveObject();
        
        this.showStatus('⏳ Loading page...', 'info');
        
        const pageBase64 = await this.cropPageFromPanel(this.currentPageIndex);
        this.currentPageBase64 = pageBase64;
        
        const img = new Image();
        img.src = 'data:image/png;base64,' + pageBase64;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
        
        this.canvas.setWidth(img.naturalWidth);
        this.canvas.setHeight(img.naturalHeight);
        
        await new Promise((resolve) => {
            fabric.Image.fromURL(img.src, (fabricImg) => {
                this.canvas.setBackgroundImage(fabricImg, () => {
                    this.canvas.renderAll();
                    resolve();
                });
            });
        });
        
        const indicator = document.getElementById('pageIndicator');
        if (indicator) {
            indicator.textContent = \`Page \${this.currentPageIndex + 1}/\${this.numPages}\`;
        }
        
        this.fabricObjects.forEach((boxData) => {
            if (boxData.rect) this.canvas.remove(boxData.rect);
            if (boxData.label) this.canvas.remove(boxData.label);
        });
        this.fabricObjects.clear();
        
        this.drawDefaultPanelBorder();
        this.drawAllBoxes();
        this.canvas.selection = true;
        
        // Refresh overlay if visible
        if (this.overlayVisible && this.panelBeforeBase64) {
            await this.showOverlay();
        } else {
            this.hideOverlay();
        }
        
        this.canvas.renderAll();
        this.renderActionList();
        
        this.showStatus(\`📄 Page \${this.currentPageIndex + 1}/\${this.numPages}\`, 'success');
    }
    
    async switchPage(direction) {
        if (!this.pagesData || this.pagesData.length === 0) return;
        
        const oldIndex = this.currentPageIndex;
        
        if (direction === 'next' && this.currentPageIndex < this.pagesData.length - 1) {
            this.currentPageIndex++;
        } else if (direction === 'prev' && this.currentPageIndex > 0) {
            this.currentPageIndex--;
        } else {
            return;
        }
        
        if (this.cropMarkers && this.cropMarkers.length > 0) {
            this.cropMarkers.forEach(m => this.canvas.remove(m));
            this.cropMarkers = [];
        }
        
        this.removeCropRectangle();
        
        this.showStatus('⏳ Loading page...', 'info');
        
        const pageBase64 = await this.cropPageFromFull(this.currentPageIndex);
        this.currentPageBase64 = pageBase64;
        
        const img = new Image();
        img.src = 'data:image/png;base64,' + pageBase64;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
        
        this.canvas.setWidth(img.naturalWidth);
        this.canvas.setHeight(img.naturalHeight);
        
        await new Promise((resolve) => {
            fabric.Image.fromURL(img.src, (fabricImg) => {
                this.canvas.setBackgroundImage(fabricImg, () => {
                    this.canvas.renderAll();
                    resolve();
                });
            });
        });
        
        const indicator = document.getElementById('pageIndicator');
        if (indicator) {
            indicator.textContent = \`Page \${this.currentPageIndex + 1}/\${this.pagesData.length}\`;
        }
        
        const saveBtn = document.getElementById('editorSaveCropBtn');
        if (saveBtn && this.calculatedCropArea) {
            saveBtn.style.display = 'inline-block';
        }
        
        // Refresh overlay if visible
        if (this.overlayVisible && this.panelBeforeBase64) {
            await this.showOverlay();
        } else {
            this.hideOverlay();
        }
        
        console.log('Before enableTwoPointCropMode - cropPoints:', this.cropPoints);
        this.enableTwoPointCropMode();
        console.log('After enableTwoPointCropMode - cropPoints:', this.cropPoints);
        
        if (this.cropPoints.length === 1) {
            this.showStatus(\`📄 Page \${this.currentPageIndex + 1}/\${this.pagesData.length} | 📍 Point 1 set on Page \${this.cropPoints[0].pageIndex + 1}. Click BottomRight corner.\`, 'success');
        } else if (this.cropPoints.length === 2 && this.calculatedCropArea) {
            this.showStatus(\`📄 Page \${this.currentPageIndex + 1}/\${this.pagesData.length} | ✅ Crop area ready\`, 'success');
        } else {
            this.showStatus(\`📄 Page \${this.currentPageIndex + 1}/\${this.pagesData.length}\`, 'success');
        }
    }
    
    async destroy() {
        // Stop auto compare interval if running
        this.stopAutoCompare();
        this.hideOverlay();
        
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        
        if (this._twoPointHandler) {
            this.canvas.off('mouse:down', this._twoPointHandler);
            this._twoPointHandler = null;
        }
        
        if (this._twoPointUndoHandler) {
            document.removeEventListener('keydown', this._twoPointUndoHandler);
            this._twoPointUndoHandler = null;
        }
        
        this.removeCropRectangle();
        
        if (this.canvas) {
            this.canvas.dispose();
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        document.body.style.zoom = '100%';
        
        if (window.resizeQueueBrowser) {
            await window.resizeQueueBrowser(false);
        }
        
        if (window.showTrackingBrowser) {
            await window.showTrackingBrowser();
        }
        
        if (window.resetDrawingFlag) {
            await window.resetDrawingFlag();
        }
    }

    async destroy() {
        // Stop auto compare interval if running
        this.stopAutoCompare();
        this.hideOverlay();
        
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        
        if (this._twoPointHandler) {
            this.canvas.off('mouse:down', this._twoPointHandler);
            this._twoPointHandler = null;
        }
        
        if (this._twoPointUndoHandler) {
            document.removeEventListener('keydown', this._twoPointUndoHandler);
            this._twoPointUndoHandler = null;
        }
        
        if (this.canvas) {
            this.canvas.dispose();
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        document.body.style.zoom = '100%';
        
        if (window.resizeQueueBrowser) {
            await window.resizeQueueBrowser(false);
        }
        
        if (window.showTrackingBrowser) {
            await window.showTrackingBrowser();
        }
        
        if (window.resetDrawingFlag) {
            await window.resetDrawingFlag();
        }
    }
};

const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
document.head.appendChild(spinnerStyle);
    `;
}

