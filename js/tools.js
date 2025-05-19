// js/tools.js - Interactive tools for mask editing (brush, lasso, etc.)

class MaskTools {
    constructor(canvasContainer, maskCanvas, overlayCanvas) {
        this.canvasContainer = canvasContainer;
        this.maskCanvas = maskCanvas;
        this.overlayCanvas = overlayCanvas;
        this.maskCtx = maskCanvas.getContext('2d');
        this.overlayCtx = overlayCanvas.getContext('2d');
        
        // Tool state
        this.currentTool = 'click';
        this.brushSize = 15;
        this.isDrawing = false;
        this.isDragging = false;
        
        // History for undo/redo
        this.history = [];
        this.historyStep = -1;
        this.maxHistorySize = 20;
        
        // Lasso tool state
        this.lassoPoints = [];
        this.isLassoActive = false;
        
        // Mouse/touch tracking
        this.lastPoint = null;
        this.lastTouchPos = null;
        
        // Bind methods to preserve context
        this.handlePointerDown = this.handlePointerDown.bind(this);
        this.handlePointerMove = this.handlePointerMove.bind(this);
        this.handlePointerUp = this.handlePointerUp.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        
        this.setupEventListeners();
        this.saveState(); // Save initial state
    }

    /**
     * Set up event listeners for different tools
     */
    setupEventListeners() {
        // Mouse events
        this.overlayCanvas.addEventListener('mousedown', this.handlePointerDown);
        this.overlayCanvas.addEventListener('mousemove', this.handlePointerMove);
        this.overlayCanvas.addEventListener('mouseup', this.handlePointerUp);
        this.overlayCanvas.addEventListener('mouseleave', this.handlePointerUp);
        this.overlayCanvas.addEventListener('dblclick', this.handleDoubleClick);
        
        // Touch events for mobile support
        this.overlayCanvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.overlayCanvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.overlayCanvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        
        // Prevent context menu on right-click
        this.overlayCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /**
     * Handle touch start events
     */
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.overlayCanvas.getBoundingClientRect();
        const point = {
            x: (touch.clientX - rect.left) * (this.overlayCanvas.width / rect.width),
            y: (touch.clientY - rect.top) * (this.overlayCanvas.height / rect.height)
        };
        
        this.lastTouchPos = point;
        this.handlePointerDown({ point, button: 0 });
    }

    /**
     * Handle touch move events
     */
    handleTouchMove(e) {
        e.preventDefault();
        if (!this.lastTouchPos) return;
        
        const touch = e.touches[0];
        const rect = this.overlayCanvas.getBoundingClientRect();
        const point = {
            x: (touch.clientX - rect.left) * (this.overlayCanvas.width / rect.width),
            y: (touch.clientY - rect.top) * (this.overlayCanvas.height / rect.height)
        };
        
        this.handlePointerMove({ point });
    }

    /**
     * Handle touch end events
     */
    handleTouchEnd(e) {
        e.preventDefault();
        this.lastTouchPos = null;
        this.handlePointerUp();
    }

    /**
     * Handle double-click events (for lasso completion)
     */
    handleDoubleClick(e) {
        if (this.currentTool === 'lasso' && this.isLassoActive) {
            this.completeLasso();
        }
    }

    /**
     * Handle pointer down events (mouse/touch)
     */
    handlePointerDown(e) {
        const point = e.point || this.getMousePos(e);
        const isRightClick = e.button === 2;
        
        switch (this.currentTool) {
            case 'click':
                // AI-based selection will be handled in the main app
                break;
                
            case 'brush':
                this.isDrawing = true;
                this.lastPoint = point;
                this.drawBrushStroke(point, isRightClick);
                break;
                
            case 'lasso':
                if (!this.isLassoActive) {
                    this.startLasso(point);
                } else {
                    this.addLassoPoint(point);
                }
                break;
        }
    }

    /**
     * Handle pointer move events
     */
    handlePointerMove(e) {
        const point = e.point || this.getMousePos(e);
        
        // Update cursor preview
        this.updateCursorPreview(point);
        
        switch (this.currentTool) {
            case 'brush':
                if (this.isDrawing && this.lastPoint) {
                    this.drawBrushStroke(point, e.shiftKey);
                    this.lastPoint = point;
                }
                break;
                
            case 'lasso':
                if (this.isLassoActive) {
                    this.updateLassoPreview(point);
                }
                break;
        }
    }

    /**
     * Handle pointer up events
     */
    handlePointerUp() {
        switch (this.currentTool) {
            case 'brush':
                if (this.isDrawing) {
                    this.isDrawing = false;
                    this.lastPoint = null;
                    this.saveState(); // Save state after brush stroke
                }
                break;
                
            case 'lasso':
                // Lasso completion is handled by double-click or specific gesture
                break;
        }
        
        // Clear cursor preview
        this.clearCursorPreview();
    }

    /**
     * Get mouse position relative to canvas
     */
    getMousePos(e) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.overlayCanvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.overlayCanvas.height / rect.height)
        };
    }

    /**
     * Draw brush stroke on mask canvas
     */
    drawBrushStroke(point, isErase = false) {
        this.maskCtx.save();
        
        // Set drawing properties
        this.maskCtx.globalCompositeOperation = isErase ? 'destination-out' : 'source-over';
        this.maskCtx.fillStyle = isErase ? 'transparent' : 'white';
        this.maskCtx.globalAlpha = 0.8;
        
        if (this.lastPoint) {
            // Draw line from last point to current point
            this.maskCtx.lineWidth = this.brushSize;
            this.maskCtx.lineCap = 'round';
            this.maskCtx.lineJoin = 'round';
            this.maskCtx.strokeStyle = isErase ? 'transparent' : 'white';
            
            this.maskCtx.beginPath();
            this.maskCtx.moveTo(this.lastPoint.x, this.lastPoint.y);
            this.maskCtx.lineTo(point.x, point.y);
            this.maskCtx.stroke();
        } else {
            // Draw circle at single point
            this.maskCtx.beginPath();
            this.maskCtx.arc(point.x, point.y, this.brushSize / 2, 0, 2 * Math.PI);
            this.maskCtx.fill();
        }
        
        this.maskCtx.restore();
    }

    /**
     * Start lasso selection
     */
    startLasso(point) {
        this.isLassoActive = true;
        this.lassoPoints = [point];
        this.drawLassoPoint(point);
    }

    /**
     * Add point to lasso selection
     */
    addLassoPoint(point) {
        this.lassoPoints.push(point);
        this.drawLassoPreview();
    }

    /**
     * Complete lasso selection
     */
    completeLasso() {
        if (this.lassoPoints.length < 3) {
            this.cancelLasso();
            return;
        }
        
        // Fill the lasso selection on mask canvas
        this.maskCtx.save();
        this.maskCtx.fillStyle = 'white';
        this.maskCtx.globalAlpha = 0.8;
        
        this.maskCtx.beginPath();
        this.maskCtx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
        
        for (let i = 1; i < this.lassoPoints.length; i++) {
            this.maskCtx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
        }
        
        this.maskCtx.closePath();
        this.maskCtx.fill();
        this.maskCtx.restore();
        
        this.cancelLasso();
        this.saveState();
    }

    /**
     * Cancel lasso selection
     */
    cancelLasso() {
        this.isLassoActive = false;
        this.lassoPoints = [];
        this.clearOverlay();
    }

    /**
     * Draw lasso preview on overlay canvas
     */
    drawLassoPreview() {
        this.clearOverlay();
        
        if (this.lassoPoints.length < 2) return;
        
        this.overlayCtx.save();
        this.overlayCtx.strokeStyle = '#3b82f6';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.setLineDash([5, 5]);
        
        this.overlayCtx.beginPath();
        this.overlayCtx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
        
        for (let i = 1; i < this.lassoPoints.length; i++) {
            this.overlayCtx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
        }
        
        this.overlayCtx.stroke();
        this.overlayCtx.restore();
        
        // Draw points
        this.lassoPoints.forEach(point => this.drawLassoPoint(point));
    }

    /**
     * Update lasso preview during movement
     */
    updateLassoPreview(point) {
        this.drawLassoPreview();
        
        // Draw line to current mouse position
        this.overlayCtx.save();
        this.overlayCtx.strokeStyle = '#6b7280';
        this.overlayCtx.lineWidth = 1;
        this.overlayCtx.setLineDash([3, 3]);
        
        this.overlayCtx.beginPath();
        const lastPoint = this.lassoPoints[this.lassoPoints.length - 1];
        this.overlayCtx.moveTo(lastPoint.x, lastPoint.y);
        this.overlayCtx.lineTo(point.x, point.y);
        this.overlayCtx.stroke();
        this.overlayCtx.restore();
    }

    /**
     * Draw a lasso point
     */
    drawLassoPoint(point) {
        this.overlayCtx.save();
        this.overlayCtx.fillStyle = '#3b82f6';
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
        this.overlayCtx.fill();
        this.overlayCtx.restore();
    }

    /**
     * Update cursor preview based on current tool
     */
    updateCursorPreview(point) {
        if (this.currentTool === 'brush') {
            this.clearOverlay();
            
            this.overlayCtx.save();
            this.overlayCtx.strokeStyle = '#3b82f6';
            this.overlayCtx.lineWidth = 2;
            this.overlayCtx.setLineDash([]);
            
            this.overlayCtx.beginPath();
            this.overlayCtx.arc(point.x, point.y, this.brushSize / 2, 0, 2 * Math.PI);
            this.overlayCtx.stroke();
            this.overlayCtx.restore();
        }
    }

    /**
     * Clear cursor preview
     */
    clearCursorPreview() {
        if (this.currentTool === 'brush' && !this.isDrawing) {
            this.clearOverlay();
        }
    }

    /**
     * Clear the overlay canvas
     */
    clearOverlay() {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    /**
     * Set the current tool
     */
    setTool(tool) {
        // Complete any active lasso before switching tools
        if (this.currentTool === 'lasso' && this.isLassoActive) {
            this.cancelLasso();
        }
        
        this.currentTool = tool;
        this.updateCursor();
        this.clearOverlay();
    }

    /**
     * Set brush size
     */
    setBrushSize(size) {
        this.brushSize = Math.max(1, Math.min(100, size));
    }

    /**
     * Update cursor style based on current tool
     */
    updateCursor() {
        this.canvasContainer.className = this.canvasContainer.className
            .replace(/tool-\w+/g, '') + ` tool-${this.currentTool}`;
    }

    /**
     * Save current mask state to history
     */
    saveState() {
        // Remove any redo states if we're not at the end
        if (this.historyStep < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyStep + 1);
        }
        
        // Add new state
        const imageData = this.maskCtx.getImageData(
            0, 0, 
            this.maskCanvas.width, 
            this.maskCanvas.height
        );
        this.history.push(imageData);
        
        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        } else {
            this.historyStep++;
        }
    }

    /**
     * Undo last action
     */
    undo() {
        if (this.historyStep > 0) {
            this.historyStep--;
            const imageData = this.history[this.historyStep];
            this.maskCtx.putImageData(imageData, 0, 0);
            return true;
        }
        return false;
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.historyStep < this.history.length - 1) {
            this.historyStep++;
            const imageData = this.history[this.historyStep];
            this.maskCtx.putImageData(imageData, 0, 0);
            return true;
        }
        return false;
    }

    /**
     * Clear the entire mask
     */
    clearMask() {
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        this.saveState();
    }

    /**
     * Apply AI segmentation result to mask with green overlay
     */
    applySegmentation(imageData, additive = true) {
        if (!additive) {
            this.clearMask();
        }
        
        this.maskCtx.save();
        
        // Create temporary canvas for the segmentation
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Convert white mask to green for display
        const greenImageData = this.convertToGreenOverlay(imageData);
        tempCtx.putImageData(greenImageData, 0, 0);
        
        // Apply to mask canvas
        this.maskCtx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
        this.maskCtx.drawImage(tempCanvas, 0, 0);
        this.maskCtx.restore();
        
        this.saveState();
    }

    /**
     * Convert white mask to green overlay for display
     */
    convertToGreenOverlay(imageData) {
        const data = new Uint8ClampedArray(imageData.data);
        
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (data[i] > 128) { // If white (selected)
                data[i] = 0;     // R - no red
                data[i + 1] = 255; // G - full green
                data[i + 2] = 0;   // B - no blue
                data[i + 3] = 180; // A - semi-transparent green
            } else {
                data[i + 3] = 0; // Fully transparent for non-selected areas
            }
        }
        
        return new ImageData(data, imageData.width, imageData.height);
    }

    /**
     * Get the current mask as pure binary ImageData (for download)
     */
    getMaskData() {
        const imageData = this.maskCtx.getImageData(
            0, 0,
            this.maskCanvas.width,
            this.maskCanvas.height
        );
        
        // Convert to pure binary (any green becomes white, rest becomes black)
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Check if pixel has green component (our selection indicator)
            const hasGreen = data[i + 1] > 50; // Green channel
            
            // Convert to pure binary
            const value = hasGreen ? 255 : 0;
            data[i] = value;     // R
            data[i + 1] = value; // G
            data[i + 2] = value; // B
            data[i + 3] = 255;   // A
        }
        
        return imageData;
    }

    /**
     * Check if undo is available
     */
    canUndo() {
        return this.historyStep > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo() {
        return this.historyStep < this.history.length - 1;
    }

    /**
     * Get tool status information
     */
    getStatus() {
        return {
            currentTool: this.currentTool,
            brushSize: this.brushSize,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            isLassoActive: this.isLassoActive,
            lassoPointsCount: this.lassoPoints.length
        };
    }

    /**
     * Resize canvases (call when image is loaded)
     */
    resize(width, height) {
        // Save current mask if exists
        const currentMask = this.getMaskData();
        
        // Resize canvases
        this.maskCanvas.width = width;
        this.maskCanvas.height = height;
        this.overlayCanvas.width = width;
        this.overlayCanvas.height = height;
        
        // Restore mask if it existed
        if (currentMask.width > 0 && currentMask.height > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = currentMask.width;
            tempCanvas.height = currentMask.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(currentMask, 0, 0);
            
            this.maskCtx.drawImage(tempCanvas, 0, 0, width, height);
        }
        
        // Reset history
        this.history = [];
        this.historyStep = -1;
        this.saveState();
    }

    /**
     * Dispose of resources
     */
    dispose() {
        // Remove event listeners
        this.overlayCanvas.removeEventListener('mousedown', this.handlePointerDown);
        this.overlayCanvas.removeEventListener('mousemove', this.handlePointerMove);
        this.overlayCanvas.removeEventListener('mouseup', this.handlePointerUp);
        this.overlayCanvas.removeEventListener('mouseleave', this.handlePointerUp);
        this.overlayCanvas.removeEventListener('dblclick', this.handleDoubleClick);
        this.overlayCanvas.removeEventListener('touchstart', this.handleTouchStart);
        this.overlayCanvas.removeEventListener('touchmove', this.handleTouchMove);
        this.overlayCanvas.removeEventListener('touchend', this.handleTouchEnd);
        
        // Clear history
        this.history = [];
        this.lassoPoints = [];
    }
}

// Export as global for use in other modules
window.MaskTools = MaskTools;