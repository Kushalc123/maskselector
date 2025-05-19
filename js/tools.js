// js/tools.js - Interactive tools for mask editing with enhanced magnifier

class MaskTools {
    constructor(canvasContainer, maskCanvas, overlayCanvas) {
        this.canvasContainer = canvasContainer;
        this.maskCanvas = maskCanvas;
        this.overlayCanvas = overlayCanvas;
        this.maskCtx = maskCanvas.getContext('2d');
        this.overlayCtx = overlayCanvas.getContext('2d');
        
        // Enhanced magnifier setup - larger and positioned away from cursor
        this.magnifier = document.getElementById('magnifier');
        this.magnifierCanvas = document.getElementById('magnifierCanvas');
        this.magnifierCtx = this.magnifierCanvas ? this.magnifierCanvas.getContext('2d') : null;
        this.magnifierSize = 216; // 20% larger than 180px (was 180px)
        this.magnificationLevel = 3; // Keep 3x zoom
        this.magnifierOffset = 10; // Very close to cursor (10px away)
        if (this.magnifierCanvas) {
            this.magnifierCanvas.width = this.magnifierSize;
            this.magnifierCanvas.height = this.magnifierSize;
        }
        
        // Tool state
        this.currentTool = 'click';
        this.brushSize = 25;
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
        this.overlayCanvas.addEventListener('mouseleave', (e) => {
            this.handlePointerUp();
            // Hide magnifier when leaving canvas
            if (['brush', 'erase', 'lasso', 'lasso-erase'].includes(this.currentTool)) {
                this.hideMagnifier();
            }
        });
        this.overlayCanvas.addEventListener('mouseenter', () => {
            // Show magnifier when entering canvas with precision tools
            if (['brush', 'erase', 'lasso', 'lasso-erase'].includes(this.currentTool)) {
                this.showMagnifier();
            }
        });
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
        if ((this.currentTool === 'lasso' || this.currentTool === 'lasso-erase') && this.isLassoActive) {
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
                this.drawBrushStroke(point, false);
                break;
                
            case 'erase':
                this.isDrawing = true;
                this.lastPoint = point;
                this.drawBrushStroke(point, true);
                break;
                
            case 'lasso':
            case 'lasso-erase':
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
        
        // Update magnifier for precision tools - pass the original event
        if (['brush', 'erase', 'lasso', 'lasso-erase'].includes(this.currentTool)) {
            this.updateMagnifier(point, e);
        }
        
        // Update cursor preview
        this.updateCursorPreview(point);
        
        switch (this.currentTool) {
            case 'brush':
                if (this.isDrawing && this.lastPoint) {
                    this.drawBrushStroke(point, false);
                    this.lastPoint = point;
                }
                break;
                
            case 'erase':
                if (this.isDrawing && this.lastPoint) {
                    this.drawBrushStroke(point, true);
                    this.lastPoint = point;
                }
                break;
                
            case 'lasso':
            case 'lasso-erase':
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
            case 'erase':
                if (this.isDrawing) {
                    this.isDrawing = false;
                    this.lastPoint = null;
                    this.saveState();
                }
                break;
                
            case 'lasso':
            case 'lasso-erase':
                // Lasso completion is handled by double-click
                break;
        }
        
        // Clear cursor preview but keep magnifier if precision tool is active
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
     * Draw brush stroke on mask canvas with enhanced opacity
     */
    drawBrushStroke(point, isErase = false) {
        this.maskCtx.save();
        
        if (isErase) {
            // For erasing, remove from mask
            this.maskCtx.globalCompositeOperation = 'destination-out';
        } else {
            // For adding, use darker and more opaque green
            this.maskCtx.globalCompositeOperation = 'source-over';
            this.maskCtx.fillStyle = 'rgba(0, 180, 20, 0.98)'; // Darker, more opaque green
            this.maskCtx.strokeStyle = 'rgba(0, 180, 20, 0.98)';
        }
        
        if (this.lastPoint) {
            // Draw line from last point to current point
            this.maskCtx.lineWidth = this.brushSize;
            this.maskCtx.lineCap = 'round';
            this.maskCtx.lineJoin = 'round';
            
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
     * Complete lasso selection with enhanced colors
     */
    completeLasso() {
        if (this.lassoPoints.length < 3) {
            this.cancelLasso();
            return;
        }
        
        // Determine if we're adding or erasing based on tool
        const isErase = this.currentTool === 'lasso-erase';
        
        this.maskCtx.save();
        
        if (isErase) {
            // For lasso erase, use destination-out to remove from existing mask
            this.maskCtx.globalCompositeOperation = 'destination-out';
        } else {
            // For regular lasso, use darker and more opaque green
            this.maskCtx.globalCompositeOperation = 'source-over';
            this.maskCtx.fillStyle = 'rgba(0, 180, 20, 0.98)'; // Darker, more opaque green
        }
        
        // Draw the lasso selection
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
        // Use different colors for different tools with much bigger lines
        if (this.currentTool === 'lasso-erase') {
            this.overlayCtx.strokeStyle = '#ef4444';
        } else {
            this.overlayCtx.strokeStyle = '#10b981';
        }
        this.overlayCtx.lineWidth = 6;
        this.overlayCtx.setLineDash([12, 8]);
        
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
        
        // Draw line to current mouse position with much bigger preview line
        this.overlayCtx.save();
        this.overlayCtx.strokeStyle = '#6b7280';
        this.overlayCtx.lineWidth = 4;
        this.overlayCtx.setLineDash([8, 6]);
        
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
        // Use different colors for different tools with much bigger dots
        if (this.currentTool === 'lasso-erase') {
            this.overlayCtx.fillStyle = '#ef4444';
        } else {
            this.overlayCtx.fillStyle = '#10b981';
        }
        this.overlayCtx.beginPath();
        this.overlayCtx.arc(point.x, point.y, 8, 0, 2 * Math.PI);
        this.overlayCtx.fill();
        
        // Add white outline for better visibility
        this.overlayCtx.strokeStyle = '#ffffff';
        this.overlayCtx.lineWidth = 2;
        this.overlayCtx.stroke();
        this.overlayCtx.restore();
    }

    /**
     * Update cursor preview based on current tool
     */
    updateCursorPreview(point) {
        if (this.currentTool === 'brush' || this.currentTool === 'erase') {
            this.clearOverlay();
            
            this.overlayCtx.save();
            // Use different colors for brush and erase preview
            this.overlayCtx.strokeStyle = this.currentTool === 'erase' ? '#ef4444' : '#10b981';
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
        if ((this.currentTool === 'brush' || this.currentTool === 'erase') && !this.isDrawing) {
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
        if ((this.currentTool === 'lasso' || this.currentTool === 'lasso-erase') && this.isLassoActive) {
            this.cancelLasso();
        }
        
        this.currentTool = tool;
        this.updateCursor();
        this.clearOverlay();
        
        // Show/hide magnifier based on tool
        if (['brush', 'erase', 'lasso', 'lasso-erase'].includes(tool)) {
            this.showMagnifier();
        } else {
            this.hideMagnifier();
        }
    }

    /**
     * Set brush size with wider range
     */
    setBrushSize(size) {
        this.brushSize = Math.max(5, Math.min(200, size));
    }

    /**
     * Update cursor style based on current tool
     */
    updateCursor() {
        this.canvasContainer.className = this.canvasContainer.className
            .replace(/tool-\w+/g, '') + ` tool-${this.currentTool}`;
    }

    /**
     * Show magnifier for precision tools
     */
    showMagnifier() {
        if (this.magnifier) {
            this.magnifier.style.display = 'block';
        }
    }

    /**
     * Hide magnifier
     */
    hideMagnifier() {
        if (this.magnifier) {
            this.magnifier.style.display = 'none';
        }
    }

    /**
     * Update magnifier position and content - Canvas-relative positioning
     */
    updateMagnifier(point, event) {
        if (!this.magnifier || !this.magnifierCtx || this.magnifier.style.display === 'none') return;
        
        // Get canvas position and dimensions
        const canvasRect = this.overlayCanvas.getBoundingClientRect();
        const containerRect = this.canvasContainer.getBoundingClientRect();
        
        // Convert canvas coordinates to screen coordinates within the canvas
        const scaleX = canvasRect.width / this.overlayCanvas.width;
        const scaleY = canvasRect.height / this.overlayCanvas.height;
        
        // Calculate the actual pixel position on the displayed canvas
        const canvasPixelX = point.x * scaleX;
        const canvasPixelY = point.y * scaleY;
        
        // Calculate position relative to the canvas container
        const containerX = canvasPixelX + (canvasRect.left - containerRect.left);
        const containerY = canvasPixelY + (canvasRect.top - containerRect.top);
        
        // Position magnifier close to cursor (10px offset)
        let magnifierX = containerX + this.magnifierOffset;
        let magnifierY = containerY - this.magnifierOffset;
        
        // Keep magnifier within container bounds
        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        const margin = 10;
        
        // Adjust if goes out of bounds
        if (magnifierX + this.magnifierSize > containerWidth - margin) {
            magnifierX = containerX - this.magnifierOffset - this.magnifierSize;
        }
        if (magnifierX < margin) {
            magnifierX = containerX + this.magnifierOffset;
        }
        if (magnifierY < margin) {
            magnifierY = containerY + this.magnifierOffset;
        }
        if (magnifierY + this.magnifierSize > containerHeight - margin) {
            magnifierY = containerY - this.magnifierOffset - this.magnifierSize;
        }
        
        // Position relative to container, not page
        this.magnifier.style.position = 'absolute';
        this.magnifier.style.left = Math.round(magnifierX) + 'px';
        this.magnifier.style.top = Math.round(magnifierY) + 'px';
        
        // Update content
        this.drawMagnifiedView(point);
    }

    /**
     * Draw magnified view with fixed scaling and enhanced lasso indicators
     */
    drawMagnifiedView(point) {
        if (!this.magnifierCtx) return;
        
        // Dynamic magnification based on brush size for brush/erase tools
        let effectiveMagnification = this.magnificationLevel;
        if (this.currentTool === 'brush' || this.currentTool === 'erase') {
            // Scale magnification properly for the full brush range (5-200px)
            const minMag = 1.5;
            const maxMag = 4.5;
            const minBrush = 5;
            const maxBrush = 200;
            
            // Clamp brush size to valid range
            const clampedBrushSize = Math.max(minBrush, Math.min(maxBrush, this.brushSize));
            
            // Calculate normalized position (0 to 1)
            const normalizedBrushSize = (clampedBrushSize - minBrush) / (maxBrush - minBrush);
            
            // Inverse relationship: larger brush = less magnification (more context)
            effectiveMagnification = maxMag - (normalizedBrushSize * (maxMag - minMag));
        }
        
        const sourceSize = this.magnifierSize / effectiveMagnification;
        const halfSize = sourceSize / 2;
        
        // Calculate source area to capture
        const sourceX = Math.max(0, point.x - halfSize);
        const sourceY = Math.max(0, point.y - halfSize);
        const sourceWidth = Math.min(sourceSize, this.overlayCanvas.width - sourceX);
        const sourceHeight = Math.min(sourceSize, this.overlayCanvas.height - sourceY);
        
        // Clear magnifier canvas
        this.magnifierCtx.clearRect(0, 0, this.magnifierSize, this.magnifierSize);
        
        // Create composite canvas with all layers
        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = this.overlayCanvas.width;
        compositeCanvas.height = this.overlayCanvas.height;
        const compositeCtx = compositeCanvas.getContext('2d');
        
        // Draw image layer
        const imageCanvas = document.getElementById('imageCanvas');
        if (imageCanvas) {
            compositeCtx.drawImage(imageCanvas, 0, 0);
        }
        
        // Draw mask layer with enhanced visibility
        compositeCtx.globalAlpha = 0.7;
        compositeCtx.globalCompositeOperation = 'screen';
        compositeCtx.drawImage(this.maskCanvas, 0, 0);
        
        // Draw overlay layer
        compositeCtx.globalAlpha = 1.0;
        compositeCtx.globalCompositeOperation = 'source-over';
        compositeCtx.drawImage(this.overlayCanvas, 0, 0);
        
        // Draw the magnified portion
        this.magnifierCtx.imageSmoothingEnabled = false;
        this.magnifierCtx.drawImage(
            compositeCanvas,
            sourceX, sourceY, sourceWidth, sourceHeight,
            0, 0, this.magnifierSize, this.magnifierSize
        );
        
        // Draw center indicators based on current tool
        const centerX = this.magnifierSize / 2;
        const centerY = this.magnifierSize / 2;
        
        this.magnifierCtx.save();
        
        if (this.currentTool === 'brush' || this.currentTool === 'erase') {
            // Draw brush circle that scales with brush size AND magnification
            const brushRadius = (this.brushSize / 2) * effectiveMagnification;
            
            this.magnifierCtx.strokeStyle = this.currentTool === 'erase' ? '#ef4444' : '#10b981';
            this.magnifierCtx.lineWidth = 3;
            this.magnifierCtx.setLineDash([7, 7]); // 20% larger dashes
            this.magnifierCtx.beginPath();
            this.magnifierCtx.arc(centerX, centerY, brushRadius, 0, 2 * Math.PI);
            this.magnifierCtx.stroke();
            this.magnifierCtx.setLineDash([]);
            
            // Add center crosshair for precise positioning
            this.magnifierCtx.strokeStyle = this.currentTool === 'erase' ? '#ef4444' : '#10b981';
            this.magnifierCtx.lineWidth = 2;
            this.magnifierCtx.beginPath();
            // Horizontal line
            this.magnifierCtx.moveTo(centerX - 12, centerY);
            this.magnifierCtx.lineTo(centerX + 12, centerY);
            // Vertical line
            this.magnifierCtx.moveTo(centerX, centerY - 12);
            this.magnifierCtx.lineTo(centerX, centerY + 12);
            this.magnifierCtx.stroke();
            
        } else if (this.currentTool === 'lasso' || this.currentTool === 'lasso-erase') {
            // Draw crosshair for lasso tools - 20% larger
            this.magnifierCtx.strokeStyle = this.currentTool === 'lasso-erase' ? '#ef4444' : '#10b981';
            this.magnifierCtx.lineWidth = 2.4; // 20% larger (was 2)
            this.magnifierCtx.setLineDash([4.8, 4.8]); // 20% larger dashes (was 4, 4)
            this.magnifierCtx.beginPath();
            // Horizontal line - 20% longer
            this.magnifierCtx.moveTo(centerX - 18, centerY);
            this.magnifierCtx.lineTo(centerX + 18, centerY);
            // Vertical line - 20% longer
            this.magnifierCtx.moveTo(centerX, centerY - 18);
            this.magnifierCtx.lineTo(centerX, centerY + 18);
            this.magnifierCtx.stroke();
            this.magnifierCtx.setLineDash([]);
            
            // Add center dot for precision - 20% larger
            this.magnifierCtx.fillStyle = this.currentTool === 'lasso-erase' ? '#ef4444' : '#10b981';
            this.magnifierCtx.beginPath();
            this.magnifierCtx.arc(centerX, centerY, 3.6, 0, 2 * Math.PI); // 20% larger (was 3)
            this.magnifierCtx.fill();
            
            // Add outer circle for reference - 20% larger
            this.magnifierCtx.strokeStyle = this.currentTool === 'lasso-erase' ? '#ef4444' : '#10b981';
            this.magnifierCtx.lineWidth = 1.2; // 20% larger (was 1)
            this.magnifierCtx.beginPath();
            this.magnifierCtx.arc(centerX, centerY, 9.6, 0, 2 * Math.PI); // 20% larger (was 8)
            this.magnifierCtx.stroke();
        }
        
        this.magnifierCtx.restore();
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
     * Apply AI segmentation result to mask with enhanced colors
     */
    applySegmentation(imageData, additive = true) {
        if (!additive) {
            this.clearMask();
        }
        
        // Convert white mask to darker, more opaque green for display
        const greenImageData = this.convertToGreenOverlay(imageData);
        
        this.maskCtx.save();
        this.maskCtx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
        
        // Create temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = greenImageData.width;
        tempCanvas.height = greenImageData.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(greenImageData, 0, 0);
        
        // Draw to mask canvas
        this.maskCtx.drawImage(tempCanvas, 0, 0);
        this.maskCtx.restore();
        
        this.saveState();
    }

    /**
     * Convert white mask to enhanced dark green overlay for better visibility
     */
    convertToGreenOverlay(imageData) {
        const data = new Uint8ClampedArray(imageData.data);
        
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 128) { // If white (selected)
                data[i] = 0;       // R - no red
                data[i + 1] = 180; // G - darker green (reduced from 255)
                data[i + 2] = 20;  // B - less blue for darker appearance
                data[i + 3] = 250; // A - more opaque (increased from 240)
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
            lassoPointsCount: this.lassoPoints.length,
            magnifierSize: this.magnifierSize
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
        // Hide magnifier
        this.hideMagnifier();
        
        // Remove event listeners
        this.overlayCanvas.removeEventListener('mousedown', this.handlePointerDown);
        this.overlayCanvas.removeEventListener('mousemove', this.handlePointerMove);
        this.overlayCanvas.removeEventListener('mouseup', this.handlePointerUp);
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