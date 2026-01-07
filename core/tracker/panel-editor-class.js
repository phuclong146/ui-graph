export function getPanelEditorClassCode() {
    return `
window.PanelEditor = class PanelEditor {
    constructor(imageBase64, geminiResultOrActionId, mode = 'full', panelId = null, initialCrop = null) {
        this.imageBase64 = imageBase64;
        
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
                // Dải crop dùng chung cho multi-page: { x, w }.
                // Với single-page, không dùng sharedStrip, cho phép tự do.
                this.sharedCropStrip = null;
                // Với multi-page, lưu chiều cao cắt riêng cho page cuối
                this.lastPageHeightOverride = null;
                this.fullScreenshotBase64 = null;
                this.currentPageBase64 = null;
                this.initialCrop = initialCrop;
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
        this.isProcessing = false;
        this.isEditingLabel = false;
        this.isDraggingLabel = false;
        this.dragLinkedRect = null;
        this.dragStartPointer = null;
        this.rectStart = null;
        this.prevCanvasSelection = true;
        this._globalMouseUpHandler = null;
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
            toolbarHTML += '<button id="editorDontCropBtn" class="editor-btn" style="background: #f44336; color: white; font-weight: bold;">📐 Don&apos;t Crop (Use Full)</button>';
            toolbarHTML += '<button id="editorSaveCropBtn" class="editor-btn save-btn" style="display:none; background: #4CAF50; color: white; font-weight: bold;">✅ Save Crop</button>';
            toolbarHTML += '<button id="editorCancelBtn" class="editor-btn cancel-btn">❌ Cancel</button>';
        } else if (this.mode === 'cropOnly') {
            toolbarHTML += '<button id="editorCropBtn" class="editor-btn crop-btn">✂️ Crop (OFF)</button>';
            toolbarHTML += '<button id="editorCancelBtn" class="editor-btn cancel-btn">❌ Cancel</button>';
        } else {
            toolbarHTML += 
                \`<div id="pageIndicator" style="margin-bottom: 10px; font-weight: bold; font-size: 16px; color: #00ffff; text-align: center; text-shadow: 0 0 10px rgba(0,255,255,0.5);">Page 1/\${this.numPages || 1}</div>\` +
                '<button id="editorPrevPageBtn" class="editor-btn">◀ Prev</button>' +
                '<button id="editorNextPageBtn" class="editor-btn">Next ▶</button>' +
                '<button id="editorCropBtn" class="editor-btn crop-btn">✂️ Crop (OFF)</button>' +
                '<button id="editorAddActionBtn" class="editor-btn add-btn">➕ Add Action</button>' +
                '<button id="editorRenameByAIBtn" class="editor-btn ai-btn" disabled>🤖 Rename by AI</button>' +
                '<button id="editorSaveBtn" class="editor-btn save-btn">💾 Save Changes</button>' +
                '<button id="editorResetBtn" class="editor-btn reset-btn">↺ Reset</button>' +
                '<button id="editorCancelBtn" class="editor-btn cancel-btn">❌ Cancel</button>' +
                '<div id="editor-instructions">' +
                'Drag actions to move<br>' +
                'Drag corners to resize<br>' +
                'Shift+Click to select multiple<br>' +
                'Ctrl+Z to undo<br>' +
                'Double-click to edit name<br>' +
                'Delete to remove (single or multiple)' +
                '</div>';
        }
        
        toolbarHTML += '</div><div id="editor-canvas-wrapper"><canvas id="editor-canvas"></canvas></div>';
        
        this.container.innerHTML = toolbarHTML;
        document.body.appendChild(this.container);
        
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
            this.fixOutOfBoundsBoxes();
            this.canvas.selection = true;
        }
        
        if (this.mode === 'twoPointCrop') {
            this.enableTwoPointCropMode();
            if (this.initialCrop) {
                await this.applyInitialCropSuggestion(this.initialCrop);
            }
        }
        
        this.setupEventHandlers();
        this.autoZoomToFit();
        this.positionUIElements();
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
        
        const canvasRect = this.canvas.getElement().getBoundingClientRect();
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        
        const leftGap = canvasRect.left - wrapperRect.left;
        const toolbarWidth = toolbar.offsetWidth;
        
        const centerLeftGap = Math.max(10, (leftGap - toolbarWidth) / 2);
        
        toolbar.style.left = centerLeftGap + 'px';
        toolbar.style.right = 'auto';
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
            document.getElementById('editorDontCropBtn').onclick = async () => await this.dontCropFullPage();
            document.getElementById('editorSaveCropBtn').onclick = async () => await this.saveTwoPointCrop();
            document.getElementById('editorCancelBtn').onclick = async () => await this.cancel();
        } else if (this.mode === 'cropOnly') {
            document.getElementById('editorCropBtn').onclick = () => this.toggleCropMode();
            document.getElementById('editorCancelBtn').onclick = async () => await this.cancel();
        } else {
            document.getElementById('editorPrevPageBtn').onclick = () => this.switchEditPage('prev');
            document.getElementById('editorNextPageBtn').onclick = () => this.switchEditPage('next');
            document.getElementById('editorCropBtn').onclick = () => this.toggleCropMode();
            document.getElementById('editorAddActionBtn').onclick = () => this.toggleActionDrawingMode();
            document.getElementById('editorRenameByAIBtn').onclick = async () => await this.renameSelectedActionByAI();
            
            document.getElementById('editorSaveBtn').onclick = async () => {
                if (this.isProcessing) {
                    this.showStatus('⚠️ Đang save, vui lòng đợi...', 'warning');
                    return;
                }
                await this.save();
            };
            
            document.getElementById('editorCancelBtn').onclick = async () => await this.cancel();
            document.getElementById('editorResetBtn').onclick = () => this.reset();
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
        if (!renameBtn) return;
        
        const activeObject = this.canvas.getActiveObject();
        
        if (activeObject && activeObject.boxType === 'rect' && !this.canvas.getActiveObjects || this.canvas.getActiveObjects().length === 1) {
            renameBtn.disabled = false;
        } else {
            renameBtn.disabled = true;
        }
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
        if (this.mode === 'twoPointCrop' || this.mode === 'confirmOnly' || this.mode === 'cropOnly') {
            await this.destroy();
        } else {
            if (confirm('Discard all changes?')) {
                await this.destroy();
            }
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
        
        this.isEditingLabel = true;
        
        const finishEditing = () => {
            this.isEditingLabel = false;
            
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
            this.canvas.renderAll();
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

    enableTwoPointCropMode() {
        console.log('✅ Two-Point Crop Mode enabled, cropRectangle:', this.cropRectangle);
        
        // Remove old markers
        if (this.cropMarkers && this.cropMarkers.length > 0) {
            this.cropMarkers.forEach(m => this.canvas.remove(m));
        }
        this.cropMarkers = [];
        
        // Remove old rectangle if exists
        if (this.cropRectangle) {
            this.canvas.remove(this.cropRectangle);
            this.cropRectangle = null;
        }
        
        // If we have cropPoints from old system, convert to rectangle
        if (this.cropPoints && this.cropPoints.length === 2) {
            const point1 = this.cropPoints[0];
            const point2 = this.cropPoints[1];
            
            if (point1.pageIndex === this.currentPageIndex && point2.pageIndex === this.currentPageIndex) {
                const x = Math.min(point1.x, point2.x);
                const y = Math.min(point1.y, point2.y);
                const w = Math.abs(point2.x - point1.x);
                const h = Math.abs(point2.y - point1.y);
                
                this.createCropRectangle(x, y, w, h);
                this.confirmTwoPointCrop();
                return;
            }
        }
        
        // Allow selection so users can select and modify the rectangle
        this.canvas.selection = true;
        this.showStatus('📍 Kéo chuột để vẽ vùng crop, hoặc kéo và thay đổi kích thước khung hiện có', 'info');
        
        // Remove old handlers
        if (this._twoPointHandler) {
            this.canvas.off('mouse:down', this._twoPointHandler);
        }
        
        if (this._twoPointUndoHandler) {
            document.removeEventListener('keydown', this._twoPointUndoHandler);
        }
        
        // Undo handler
        this._twoPointUndoHandler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && this.cropRectangle) {
                e.preventDefault();
                console.log('↶ Undo crop rectangle');
                
                this.canvas.remove(this.cropRectangle);
                this.cropRectangle = null;
                
                const saveBtn = document.getElementById('editorSaveCropBtn');
                if (saveBtn) {
                    saveBtn.style.display = 'none';
                }
                this.calculatedCropArea = null;
                
                this.showStatus('↶ Undo: Crop rectangle removed. Kéo chuột để vẽ vùng crop mới', 'info');
            }
        };
        
        document.addEventListener('keydown', this._twoPointUndoHandler);
        
        // Drawing handler for creating new rectangle (vertical strip)
        let isDrawing = false;
        let startX = 0;
        let startY = 0;
        
        const mouseDownHandler = (e) => {
            // Don't start drawing if clicking on existing rectangle or its controls
            if (this.cropRectangle && (e.target === this.cropRectangle || e.target === this.canvas.getActiveObject())) {
                // Allow Fabric.js to handle selection and resizing
                return;
            }
            
            // If clicking on empty space, start drawing new rectangle
            if (!e.target || e.target === this.canvas.backgroundImage) {
                const pointer = this.canvas.getPointer(e.e);
                startX = Math.round(pointer.x);
                startY = 0; // luôn bắt đầu từ top
                isDrawing = true;
                
                // Remove existing rectangle if starting new one
                if (this.cropRectangle) {
                    this.canvas.remove(this.cropRectangle);
                    this.cropRectangle = null;
                    this.canvas.discardActiveObject();
                }
            }
        };
        
        const mouseMoveHandler = (e) => {
            if (!isDrawing) return;
            
            const pointer = this.canvas.getPointer(e.e);
            const currentX = Math.round(pointer.x);
            
            const x = Math.min(startX, currentX);
            const w = Math.abs(currentX - startX);
            const y = 0;
            const h = this.canvas.getHeight();
            
            if (w > 10) {
                if (this.cropRectangle) {
                    this.cropRectangle.set({ left: x, top: y, width: w, height: h });
                } else {
                    this.createCropRectangle(x, y, w, h);
                }
                this.canvas.renderAll();
            }
        };
        
        const mouseUpHandler = (e) => {
            if (isDrawing && this.cropRectangle) {
                isDrawing = false;
                // Select the rectangle so user can immediately resize it
                this.canvas.setActiveObject(this.cropRectangle);
                this.canvas.renderAll();
                this.confirmTwoPointCrop();
            }
        };
        
        this.canvas.on('mouse:down', mouseDownHandler);
        this.canvas.on('mouse:move', mouseMoveHandler);
        this.canvas.on('mouse:up', mouseUpHandler);
        
        this._twoPointHandler = { mouseDown: mouseDownHandler, mouseMove: mouseMoveHandler, mouseUp: mouseUpHandler };
    }
    
    createCropRectangle(x, y, w, h) {
        // Remove old rectangle if exists
        if (this.cropRectangle) {
            this.canvas.remove(this.cropRectangle);
        }
        
        // Create resizable and draggable rectangle
        this.cropRectangle = new fabric.Rect({
            left: x,
            top: y,
            width: w,
            height: h,
            fill: 'rgba(0, 150, 255, 0.1)',
            stroke: '#0096ff',
            strokeWidth: 2,
            strokeDashArray: [5, 5],
            selectable: true,
            hasControls: true,
            hasBorders: true,
            lockRotation: true,
            cornerColor: '#0096ff',
            cornerSize: 10,
            transparentCorners: false,
            borderColor: '#0096ff',
            borderScaleFactor: 2
        });
        
        // Update crop area when rectangle is modified (resized or rotated)
        this.cropRectangle.on('modified', () => {
            // Normalize scale to width/height
            const rect = this.cropRectangle;
            if (rect.scaleX !== 1 || rect.scaleY !== 1) {
                rect.set({
                    width: rect.width * rect.scaleX,
                    height: this.canvas.getHeight(),
                    scaleX: 1,
                    scaleY: 1,
                    top: 0
                });
            }
            this.confirmTwoPointCrop();
        });
        
        // Update crop area when rectangle is moved
        this.cropRectangle.on('moving', () => {
            // Constrain to canvas bounds (dải dọc: khóa theo trục Y)
            const canvasWidth = this.canvas.getWidth();
            const rect = this.cropRectangle;
            const currentWidth = rect.width * (rect.scaleX || 1);
            
            if (rect.left < 0) rect.left = 0;
            if (rect.left + currentWidth > canvasWidth) {
                rect.left = Math.max(0, canvasWidth - currentWidth);
            }
            // Luôn giữ top = 0 và full height
            rect.top = 0;
            rect.height = this.canvas.getHeight();
        });
        
        // Update crop area after moving
        this.cropRectangle.on('moved', () => {
            this.confirmTwoPointCrop();
        });
        
        // Constrain resizing to canvas bounds (chỉ cho phép resize theo trục X)
        this.cropRectangle.on('scaling', () => {
            const canvasWidth = this.canvas.getWidth();
            const rect = this.cropRectangle;
            
            const newWidth = rect.width * rect.scaleX;
            
            if (rect.left + newWidth > canvasWidth) {
                const maxScaleX = (canvasWidth - rect.left) / rect.width;
                rect.scaleX = Math.min(rect.scaleX, maxScaleX);
            }
            if (rect.left < 0) {
                rect.left = 0;
            }
            
            // Khóa chiều cao & scale Y
            rect.top = 0;
            rect.height = this.canvas.getHeight();
            rect.scaleY = 1;
        });
        
        this.canvas.add(this.cropRectangle);
        this.canvas.setActiveObject(this.cropRectangle);
        this.canvas.renderAll();
    }
    
    async applyInitialCropSuggestion(cropArea) {
        try {
            if (!this.pagesData || !cropArea) return;

            const topPageIndex = this.pagesData.findIndex(p =>
                cropArea.y >= p.y_start && cropArea.y < p.y_end
            );

            if (topPageIndex === -1) {
                console.warn('Initial crop suggestion is out of page bounds', cropArea);
                return;
            }

            // Dùng gợi ý để set dải dọc chung: chỉ lấy x và w
            this.sharedCropStrip = {
                x: cropArea.x,
                w: cropArea.w
            };

            this.currentPageIndex = topPageIndex;

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

            // Tạo khung dọc full-height trên page đầu tiên
            this.createCropRectangle(this.sharedCropStrip.x, 0, this.sharedCropStrip.w, this.canvas.getHeight());
            await this.confirmTwoPointCrop();
        } catch (err) {
            console.error('Failed to apply initial crop suggestion:', err);
        }
    }
    
    async confirmTwoPointCrop() {
        if (!this.cropRectangle) {
            // Fallback to old two-point system if rectangle doesn't exist
            if (!this.cropPoints || this.cropPoints.length !== 2) {
                return;
            }
            
            const point1 = this.cropPoints[0];
            const point2 = this.cropPoints[1];
            
            const page1Y = this.pagesData[point1.pageIndex].y_start;
            const page2Y = this.pagesData[point2.pageIndex].y_start;
            
            const absolutePoint1 = { x: point1.x, y: page1Y + point1.y };
            const absolutePoint2 = { x: point2.x, y: page2Y + point2.y };
            
            const cropArea = {
                x: Math.min(absolutePoint1.x, absolutePoint2.x),
                y: Math.min(absolutePoint1.y, absolutePoint2.y),
                w: Math.abs(absolutePoint2.x - absolutePoint1.x),
                h: Math.abs(absolutePoint2.y - absolutePoint1.y)
            };
            
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
            
            this.showStatus(\`✅ Crop area ready: \${cropArea.w}x\${cropArea.h}px. Click Save to confirm.\`, 'success');
            return;
        }
        
        // Use rectangle-based system
        const rect = this.cropRectangle;
        // Get actual dimensions accounting for scale
        const actualWidth = rect.width * (rect.scaleX || 1);
        const x = Math.round(rect.left);
        const w = Math.round(actualWidth);
        
        // Trên mỗi page: y luôn = 0, height = chiều cao page (canvas height)
        const localY = 0;
        const localH = this.canvas.getHeight();
        
        console.log('=== CONFIRM CROP (Rectangle) ===');
        console.log('Rectangle position (local):', { x, y: localY, w, h: localH });
        console.log('Current page:', this.currentPageIndex);
        console.log('Pages data:', this.pagesData);
        
        if (w < 50 || localH < 50) {
            alert('⚠️ Crop area quá nhỏ (min 50x50px). Vui lòng vẽ lại.');
            this.canvas.remove(this.cropRectangle);
            this.cropRectangle = null;
            this.enableTwoPointCropMode();
            return;
        }
        
        // Convert to absolute coordinates
        const page = this.pagesData[this.currentPageIndex];
        if (!page) {
            console.error('No page data for current page index:', this.currentPageIndex);
            return;
        }
                
        // Với yêu cầu mới: cùng 1 dải dọc cho toàn bộ panel,
        // nên cropArea luôn bắt đầu từ y = 0 tới hết chiều cao full screenshot
        const totalHeight = this.pagesData[this.pagesData.length - 1].y_end;
        const cropArea = {
            x: x,
            y: 0,
            w: w,
            h: totalHeight
        };
        
        // Lưu dải crop dùng chung cho tất cả page (toạ độ local trên page)
        this.sharedCropStrip = { x, w };
        
        console.log('Final crop area:', cropArea);
        
        this.calculatedCropArea = cropArea;
        
        const saveBtn = document.getElementById('editorSaveCropBtn');
        if (saveBtn) {
            saveBtn.style.display = 'inline-block';
        }
        
        this.showStatus(\`✅ Crop area ready: \${w}x\${h}px. Kéo để điều chỉnh, click Save để xác nhận.\`, 'success');
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
        this.canvas.renderAll();
        
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
        
        // Lưu preset khung crop của page cũ (nếu đang có rectangle)
        if (this.mode === 'twoPointCrop' && this.cropRectangle) {
            const rect = this.cropRectangle;
            const actualWidth = rect.width * (rect.scaleX || 1);
            const actualHeight = rect.height * (rect.scaleY || 1);
            if (!this.pageCropPresets) {
                this.pageCropPresets = {};
            }
            this.pageCropPresets[oldIndex] = {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                w: Math.round(actualWidth),
                h: Math.round(actualHeight)
            };
        }
        
        if (this.cropMarkers && this.cropMarkers.length > 0) {
            this.cropMarkers.forEach(m => this.canvas.remove(m));
            this.cropMarkers = [];
        }
        
        // Remove crop rectangle when switching pages (sẽ tạo lại từ preset nếu có)
        if (this.cropRectangle) {
            this.canvas.remove(this.cropRectangle);
            this.cropRectangle = null;
        }
        
        const saveBtn = document.getElementById('editorSaveCropBtn');
        if (saveBtn) {
            saveBtn.style.display = 'none';
        }
        this.calculatedCropArea = null;
        
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
        
        console.log('Before enableTwoPointCropMode - cropPoints:', this.cropPoints);
        this.enableTwoPointCropMode();
        console.log('After enableTwoPointCropMode - cropPoints:', this.cropPoints);
        
        // Sau khi load page mới, nếu đã có dải crop chung thì tạo lại khung crop
        if (this.mode === 'twoPointCrop' && this.sharedCropStrip) {
            const { x, w } = this.sharedCropStrip;
            const h = this.canvas.getHeight();
            this.createCropRectangle(x, 0, w, h);
            await this.confirmTwoPointCrop();
        }
        
        if (this.cropPoints.length === 1) {
            this.showStatus(\`📄 Page \${this.currentPageIndex + 1}/\${this.pagesData.length} | 📍 Point 1 set on Page \${this.cropPoints[0].pageIndex + 1}. Click BottomRight corner.\`, 'success');
        } else {
            this.showStatus(\`📄 Page \${this.currentPageIndex + 1}/\${this.pagesData.length}\`, 'success');
        }
    }

    async destroy() {
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
            this._keydownHandler = null;
        }
        
        if (this._twoPointHandler) {
            if (typeof this._twoPointHandler === 'object' && this._twoPointHandler.mouseDown) {
                // New rectangle-based handler
                this.canvas.off('mouse:down', this._twoPointHandler.mouseDown);
                this.canvas.off('mouse:move', this._twoPointHandler.mouseMove);
                this.canvas.off('mouse:up', this._twoPointHandler.mouseUp);
            } else {
                // Old point-based handler
                this.canvas.off('mouse:down', this._twoPointHandler);
            }
            this._twoPointHandler = null;
        }
        
        // Remove crop rectangle if exists
        if (this.cropRectangle && this.canvas) {
            this.canvas.remove(this.cropRectangle);
            this.cropRectangle = null;
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

