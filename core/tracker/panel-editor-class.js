export function getPanelEditorClassCode() {
    return `
window.PanelEditor = class PanelEditor {
    constructor(imageBase64, geminiResultOrActionId, mode = 'full') {
        this.imageBase64 = imageBase64;
        
        if (mode === 'cropOnly') {
            this.actionItemId = geminiResultOrActionId;
            this.geminiResult = [];
            this.originalGeminiResult = [];
        } else {
            this.geminiResult = geminiResultOrActionId;
            this.originalGeminiResult = JSON.parse(JSON.stringify(geminiResultOrActionId));
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
    }

    async init() {
        console.log('Enter Edit actions:');
        console.log(\`  Total panels: \${this.geminiResult.length}\`);
        this.geminiResult.forEach((panel, i) => {
            console.log(\`  Panel[\${i}]: "\${panel.panel_title}" with \${panel.actions?.length || 0} actions\`);
        });
        
        if (window.resizeQueueBrowser) {
            await window.resizeQueueBrowser(true);
        }
        
        if (window.hideTrackingBrowser) {
            await window.hideTrackingBrowser();
        }
        
        document.body.style.zoom = '80%';
        
        this.saveState();
        
        this.container = document.createElement('div');
        this.container.id = 'editor-container';
        
        let toolbarHTML = '<div id="editor-status"></div><div id="editor-toolbar">';
        
        if (this.mode === 'cropOnly') {
            toolbarHTML += '<button id="editorCropBtn" class="editor-btn crop-btn">✂️ Crop (OFF)</button>';
            toolbarHTML += '<button id="editorCancelBtn" class="editor-btn cancel-btn">❌ Cancel</button>';
        } else {
            toolbarHTML += 
                '<button id="editorAddActionBtn" class="editor-btn add-btn">➕ Add Action</button>' +
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
        
        const img = new Image();
        img.src = 'data:image/png;base64,' + this.imageBase64;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });
        
        this.canvas = new fabric.Canvas('editor-canvas', {
            width: img.naturalWidth,
            height: img.naturalHeight,
            backgroundColor: '#000'
        });
        
        await new Promise((resolve) => {
            fabric.Image.fromURL(img.src, (fabricImg) => {
                this.canvas.setBackgroundImage(fabricImg, () => {
                    this.canvas.renderAll();
                    resolve();
                });
            });
        });
        
        if (this.mode !== 'cropOnly') {
            this.drawDefaultPanelBorder();
            this.drawAllBoxes();
            this.fixOutOfBoundsBoxes();
        }
        
        this.setupEventHandlers();
        this.positionUIElements();
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
        
        panel.actions.forEach((action, actionIndex) => {
            if (action.action_pos) {
                this.drawBox(
                    action.action_pos,
                    '0-' + actionIndex,
                    'action',
                    action.action_name
                );
            }
        });
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
            fill: '#fff',
            backgroundColor: color,
            padding: 4,
            fontWeight: 'bold',
            selectable: false,
            evented: true,
            id: id + '_label',
            linkedBox: id,
            hoverCursor: 'pointer'
        });
        
        this.canvas.add(rect);
        this.canvas.add(label);
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
        });
        
        this.canvas.on('selection:cleared', () => {
        });
        
        this.canvas.on('mouse:down', (e) => {
            if (e.target && e.target.linkedBox) {
                const boxData = this.fabricObjects.get(e.target.linkedBox);
                if (boxData && boxData.rect) {
                    this.canvas.setActiveObject(boxData.rect);
                    this.canvas.renderAll();
                }
            }
        });
        
        this.canvas.on('mouse:dblclick', (e) => {
            if (e.target && e.target.linkedBox !== undefined) {
                this.editLabel(e.target);
            }
        });
        
        if (this.mode === 'cropOnly') {
            document.getElementById('editorCropBtn').onclick = () => this.toggleCropMode();
            document.getElementById('editorCancelBtn').onclick = () => this.cancel();
        } else {
            document.getElementById('editorAddActionBtn').onclick = () => this.toggleActionDrawingMode();
            
            document.getElementById('editorSaveBtn').onclick = async () => {
                if (this.isProcessing) {
                    this.showStatus('⚠️ Đang save, vui lòng đợi...', 'warning');
                    return;
                }
                await this.save();
            };
            
            document.getElementById('editorCancelBtn').onclick = () => this.cancel();
            document.getElementById('editorResetBtn').onclick = () => this.reset();
        }
        
        if (this.mode !== 'cropOnly') {
            document.addEventListener('keydown', (e) => {
                if (this.isEditingLabel) {
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
            });
        }
    }
    
    updateLabel(rect) {
        const boxData = this.fabricObjects.get(rect.id);
        if (boxData && boxData.label) {
            boxData.label.set({
                left: rect.left + 8,
                top: rect.top - 20
            });
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
            h: Math.round(rect.height * rect.scaleY)
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

    cancel() {
        if (confirm('Discard all changes?')) {
            this.destroy();
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
        
        const mouseDownHandler = (e) => {
            if (!this.isDrawingMode) return;
            const pointer = this.canvas.getPointer(e.e);
            this.drawingStartX = pointer.x;
            this.drawingStartY = pointer.y;
            
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
            
            const width = pointer.x - this.drawingStartX;
            const height = pointer.y - this.drawingStartY;
            
            this.drawingRect.set({
                width: Math.abs(width),
                height: Math.abs(height),
                left: width < 0 ? pointer.x : this.drawingStartX,
                top: height < 0 ? pointer.y : this.drawingStartY
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
            
            const actionData = {
                name: actionName.trim(),
                type: actionType.trim().toLowerCase(),
                verb: actionVerb.trim().toLowerCase(),
                content: actionContent && actionContent.trim() ? actionContent.trim() : null
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
                h: Math.round(tempRect.height)
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
        
        const type = boxData.rect.type;
        const color = type === 'panel' ? '#ff4444' : '#00aaff';
        
        const itext = new fabric.IText(label.text, {
            left: label.left,
            top: label.top,
            fontSize: 12,
            fill: '#fff',
            backgroundColor: color,
            padding: 4,
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
            
            const newText = itext.text.trim() || 'Unnamed';
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
                fontSize: 12,
                fill: '#fff',
                backgroundColor: color,
                padding: 4,
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
    
    toggleCropMode() {
        const cropBtn = document.getElementById('editorCropBtn');
        if (this.isCroppingMode) {
            this.disableCropMode();
            this.showStatus('✖ Crop mode OFF', 'info');
            if (cropBtn) cropBtn.textContent = '✂️ Crop (OFF)';
        } else {
            this.enableCropMode();
            if (cropBtn) cropBtn.textContent = '✂️ Crop (ON)';
        }
    }
    
    enableCropMode() {
        this.isCroppingMode = true;
        this.canvas.selection = false;
        this.canvas.forEachObject(obj => obj.selectable = false);
        this.showStatus('✂️ Crop Mode ON - Drag to select crop area (ESC or click ✂️ to cancel)', 'info');
        
        const cropBtn = document.getElementById('editorCropBtn');
        if (cropBtn) cropBtn.textContent = '✂️ Crop (ON)';
        
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
            startX = pointer.x;
            startY = pointer.y;
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
            
            const width = pointer.x - startX;
            const height = pointer.y - startY;
            
            cropRect.set({
                width: Math.abs(width),
                height: Math.abs(height),
                left: width < 0 ? pointer.x : startX,
                top: height < 0 ? pointer.y : startY
            });
            this.canvas.renderAll();
        };
        
        const mouseUpHandler = async () => {
            if (!this.isCroppingMode || !isDrawing) return;
            isDrawing = false;
            
            const cropArea = {
                x: Math.round(cropRect.left),
                y: Math.round(cropRect.top),
                width: Math.round(cropRect.width),
                height: Math.round(cropRect.height)
            };
            
            this.canvas.remove(cropRect);
            
            if (cropArea.width < 10 || cropArea.height < 10) {
                this.showStatus('⚠️ Crop area too small', 'error');
                return;
            }
            
            await this.cropImage(cropArea);
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
        this.canvas.forEachObject(obj => obj.selectable = obj.boxType === 'rect');
        
        const cropBtn = document.getElementById('editorCropBtn');
        if (cropBtn) cropBtn.textContent = '✂️ Crop (OFF)';
        
        if (this._cropHandlers) {
            this.canvas.off('mouse:down', this._cropHandlers.mouseDownHandler);
            this.canvas.off('mouse:move', this._cropHandlers.mouseMoveHandler);
            this.canvas.off('mouse:up', this._cropHandlers.mouseUpHandler);
            document.removeEventListener('keydown', this._cropHandlers.escHandler);
            this._cropHandlers = null;
        }
        
    }
    
    
    async cropImage(cropArea) {
        try {
            this.showStatus('✂️ Preview crop...', 'loading');
            
            const croppedBase64 = await this.cropBase64Image(this.imageBase64, cropArea);
            
            const userConfirmed = confirm('Lưu crop này không?\\n\\nOK = Có (tiếp tục)\\nCancel = Không (vẽ lại)');
            
            if (!userConfirmed) {
                this.showStatus('↩️ Crop cancelled, vẽ lại crop area', 'info');
                return;
            }
            
            this.showStatus('✅ Saving panel with crop position...', 'success');
            console.log('Saving original image + crop position');
            
            if (window.saveCroppedPanel && this.actionItemId) {
                let parentPanelId = null;
                
                if (window.getParentPanelOfAction) {
                    parentPanelId = await window.getParentPanelOfAction(this.actionItemId);
                }
                
                const isChildPanel = confirm('Panel này có phải con của panel chứa action không?\\n\\nOK = Có (tạo quan hệ cha-con)\\nCancel = Không (panel độc lập)');
                
                if (isChildPanel) {
                    await window.saveCroppedPanel(this.imageBase64, cropArea, this.actionItemId, parentPanelId);
                } else {
                    await window.saveCroppedPanel(this.imageBase64, cropArea, this.actionItemId, null);
                }
                this.destroy();
            } else {
                this.destroy();
            }
        } catch (err) {
            console.error('Failed to save crop:', err);
            this.showStatus('❌ Failed to save: ' + err.message, 'error');
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

    async destroy() {
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
    `;
}

