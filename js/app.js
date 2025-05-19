// js/app.js - Main application logic for AI Image Segmentation Tool

class ImageSegmentationApp {
    constructor() {
        // Initialize components
        this.segmentation = new ImageSegmentation();
        this.maskTools = null;
        
        // DOM elements
        this.uploadArea = document.getElementById('uploadArea');
        this.imageInput = document.getElementById('imageInput');
        this.canvasSection = document.getElementById('canvasSection');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        
        // Canvas elements
        this.imageCanvas = document.getElementById('imageCanvas');
        this.maskCanvas = document.getElementById('maskCanvas');
        this.overlayCanvas = document.getElementById('overlayCanvas');
        this.canvasContainer = document.querySelector('.canvas-container');
        this.canvasInfo = document.getElementById('canvasInfo');
        
        // Tool controls
        this.toolButtons = document.querySelectorAll('.tool-btn');
        this.brushSizeSlider = document.getElementById('brushSize');
        this.brushSizeValue = document.getElementById('brushSizeValue');
        this.brushSizeGroup = document.getElementById('brushSizeGroup');
        
        // Action buttons
        this.undoBtn = document.getElementById('undoBtn');
        this.redoBtn = document.getElementById('redoBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.refineBtn = document.getElementById('refineBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        
        // App state
        this.currentImage = null;
        this.isProcessing = false;
        this.modelLoaded = false;
        this.previewMask = null;
        this.isShowingPreview = false;
        this.cachedSegmentation = null;
        this.previewTimeout = null;
        
        // Bind methods to preserve context
        this.handleFileSelect = this.handleFileSelect.bind(this);
        this.handleDragEvents = this.handleDragEvents.bind(this);
        this.handleToolChange = this.handleToolChange.bind(this);
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        
        this.initializeApp();
    }

    async initializeApp() {
        try {
            this.setupEventListeners();
            this.updateCanvasInfo('Initializing AI model...');
            
            // Load AI model
            await this.segmentation.initializeModel();
            this.modelLoaded = true;
            this.hideLoadingOverlay();
            this.updateCanvasInfo('Model loaded. Upload an image to begin.');
            
            console.log('App initialized successfully');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.hideLoadingOverlay();
            this.showError('Failed to load AI model. Please refresh the page and try again.');
        }
    }

    setupEventListeners() {
        // File upload events
        this.uploadArea.addEventListener('click', () => this.imageInput.click());
        this.imageInput.addEventListener('change', this.handleFileSelect);
        
        // Drag and drop events
        this.uploadArea.addEventListener('dragover', this.handleDragEvents);
        this.uploadArea.addEventListener('dragenter', this.handleDragEvents);
        this.uploadArea.addEventListener('dragleave', this.handleDragEvents);
        this.uploadArea.addEventListener('drop', this.handleDragEvents);
        
        // Tool selection events
        this.toolButtons.forEach(btn => {
            btn.addEventListener('click', this.handleToolChange);
        });
        
        // Brush size control
        this.brushSizeSlider.addEventListener('input', (e) => {
            const size = parseInt(e.target.value);
            this.brushSizeValue.textContent = `${size}px`;
            if (this.maskTools) {
                this.maskTools.setBrushSize(size);
            }
        });
        
        // Action button events
        this.undoBtn.addEventListener('click', () => this.handleUndo());
        this.redoBtn.addEventListener('click', () => this.handleRedo());
        this.clearBtn.addEventListener('click', () => this.handleClear());
        this.refineBtn.addEventListener('click', () => this.handleRefine());
        this.downloadBtn.addEventListener('click', () => this.handleDownload());
        
        // Canvas events for AI segmentation and preview
        this.overlayCanvas.addEventListener('click', this.handleCanvasClick);
        this.overlayCanvas.addEventListener('mousemove', this.handleCanvasMouseMove.bind(this));
        this.overlayCanvas.addEventListener('mouseleave', this.handleCanvasMouseLeave.bind(this));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) {
                            this.handleRedo();
                        } else {
                            this.handleUndo();
                        }
                        break;
                    case 'y':
                        e.preventDefault();
                        this.handleRedo();
                        break;
                }
            }
        });
    }

    handleFileSelect(e) {
        const files = e.target.files || e.dataTransfer.files;
        if (files && files.length > 0) {
            this.loadImage(files[0]);
        }
    }

    handleDragEvents(e) {
        e.preventDefault();
        e.stopPropagation();
        
        switch (e.type) {
            case 'dragover':
            case 'dragenter':
                this.uploadArea.classList.add('dragover');
                break;
            case 'dragleave':
                if (!this.uploadArea.contains(e.relatedTarget)) {
                    this.uploadArea.classList.remove('dragover');
                }
                break;
            case 'drop':
                this.uploadArea.classList.remove('dragover');
                this.handleFileSelect(e);
                break;
        }
    }

    async loadImage(file) {
        try {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                this.showError('Please select a valid image file.');
                return;
            }
            
            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                this.showError('Image file is too large. Please select a file smaller than 10MB.');
                return;
            }
            
            this.showLoadingOverlay('Loading image...');
            
            // Create image element
            const img = new Image();
            img.onload = () => {
                console.log('Image loaded successfully:', img.width, 'x', img.height);
                this.setupCanvas(img);
            };
            img.onerror = (error) => {
                console.error('Image loading error:', error);
                this.hideLoadingOverlay();
                this.showError('Failed to load image. Please try a different file.');
            };
            
            // Load image from file
            const reader = new FileReader();
            reader.onload = (e) => {
                console.log('FileReader loaded, setting image src');
                img.src = e.target.result;
            };
            reader.onerror = (error) => {
                console.error('FileReader error:', error);
                this.hideLoadingOverlay();
                this.showError('Failed to read image file.');
            };
            reader.readAsDataURL(file);
            
        } catch (error) {
            console.error('Failed to load image:', error);
            this.hideLoadingOverlay();
            this.showError('Failed to load image. Please try again.');
        }
    }

    setupCanvas(img) {
        try {
            this.currentImage = img;
            
            // Clear any cached segmentation from previous image
            this.cachedSegmentation = null;
            this.hideClickPreview();
            
            // Use exact original image dimensions
            const width = img.naturalWidth || img.width;
            const height = img.naturalHeight || img.height;
            
            console.log(`Setting up canvas with dimensions: ${width}x${height}`);
            
            // Set canvas internal dimensions to exact image size
            this.imageCanvas.width = width;
            this.imageCanvas.height = height;
            this.maskCanvas.width = width;
            this.maskCanvas.height = height;
            this.overlayCanvas.width = width;
            this.overlayCanvas.height = height;
            
            // Calculate reasonable display size
            const containerPadding = 100;
            const maxDisplayWidth = Math.min(window.innerWidth - containerPadding, 1000);
            const maxDisplayHeight = Math.min(window.innerHeight - 400, 600);
            
            const scale = Math.min(1, maxDisplayWidth / width, maxDisplayHeight / height);
            const displayWidth = Math.round(width * scale);
            const displayHeight = Math.round(height * scale);
            
            // Set CSS dimensions for display
            [this.imageCanvas, this.maskCanvas, this.overlayCanvas].forEach(canvas => {
                canvas.style.width = displayWidth + 'px';
                canvas.style.height = displayHeight + 'px';
            });
            
            // Update container to fit the image
            this.canvasContainer.style.minHeight = Math.max(400, displayHeight + 40) + 'px';
            
            // Get contexts and draw image
            const ctx = this.imageCanvas.getContext('2d', { willReadFrequently: true });
            const maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
            
            // Clear canvases
            ctx.clearRect(0, 0, width, height);
            maskCtx.clearRect(0, 0, width, height);
            
            // Draw image at full resolution
            ctx.drawImage(img, 0, 0, width, height);
            
            console.log('Image drawn to canvas');
            
            // Initialize mask tools
            if (this.maskTools) {
                this.maskTools.dispose();
            }
            this.maskTools = new MaskTools(
                this.canvasContainer,
                this.maskCanvas,
                this.overlayCanvas
            );
            
            // Show workspace instead of individual sections
            const workspace = document.getElementById('workspace');
            workspace.style.display = 'flex';
            
            // Update UI
            this.updateToolButtons();
            const scalePercent = Math.round(scale * 100);
            this.updateCanvasInfo(`Image: ${width}×${height} (displayed at ${scalePercent}%)`);
            this.hideLoadingOverlay();
            
            console.log('Canvas setup completed');
        } catch (error) {
            console.error('Failed to setup canvas:', error);
            this.hideLoadingOverlay();
            this.showError('Failed to process image. Please try again.');
        }
    }

    handleToolChange(e) {
        const tool = e.currentTarget.dataset.tool;
        
        // Update active tool button
        this.toolButtons.forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');
        
        // Show/hide brush size control
        this.brushSizeGroup.style.display = tool === 'brush' ? 'block' : 'none';
        
        // Set tool in mask tools
        if (this.maskTools) {
            this.maskTools.setTool(tool);
        }
        
        // Update canvas info
        this.updateCanvasInfo(this.getToolDescription(tool));
    }

    getToolDescription(tool) {
        switch (tool) {
            case 'click':
                return 'Click on objects to select them with AI';
            case 'brush':
                return 'Paint to add to selection (Shift+click to erase)';
            case 'lasso':
                return 'Draw around objects to select them';
            default:
                return 'Select a tool to begin editing';
        }
    }

    handleCanvasMouseMove(e) {
        if (!this.currentImage || !this.modelLoaded || this.isProcessing) {
            return;
        }
        
        const currentTool = this.maskTools?.currentTool || 'click';
        if (currentTool !== 'click') {
            return;
        }
        
        // Debounce the preview to avoid too many requests
        clearTimeout(this.previewTimeout);
        this.previewTimeout = setTimeout(() => {
            this.showClickPreview(e);
        }, 150);
    }

    handleCanvasMouseLeave() {
        if (this.previewTimeout) {
            clearTimeout(this.previewTimeout);
        }
        this.hideClickPreview();
    }

    async showClickPreview(e) {
        if (this.isProcessing || !this.segmentation || this.isShowingPreview) {
            return;
        }

        try {
            // Get click coordinates
            const rect = this.overlayCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.overlayCanvas.width / rect.width);
            const y = (e.clientY - rect.top) * (this.overlayCanvas.height / rect.height);

            this.isShowingPreview = true;

            // Use cached segmentation if available, otherwise segment
            if (!this.cachedSegmentation) {
                console.log('Generating segmentation for preview...');
                this.cachedSegmentation = await this.segmentation.segmentImage(this.imageCanvas);
            }

            // Create preview mask
            const previewMask = this.segmentation.createClickMask(this.cachedSegmentation.imageData, x, y);
            
            // Draw preview on overlay canvas
            const overlayCtx = this.overlayCanvas.getContext('2d');
            overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            
            // Create temporary canvas for preview
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = previewMask.width;
            tempCanvas.height = previewMask.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(previewMask, 0, 0);
            
            // Draw preview with blue tint - only show the actual selection, not the whole image
            overlayCtx.save();
            overlayCtx.globalCompositeOperation = 'source-over';
            overlayCtx.globalAlpha = 0.5;
            
            // Use blue color for preview
            overlayCtx.fillStyle = '#3b82f6';
            overlayCtx.fillRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
            
            // Only show where the mask is
            overlayCtx.globalCompositeOperation = 'destination-in';
            overlayCtx.drawImage(tempCanvas, 0, 0);
            overlayCtx.restore();

            this.previewMask = previewMask;
        } catch (error) {
            console.warn('Preview generation failed:', error);
        } finally {
            this.isShowingPreview = false;
        }
    }

    hideClickPreview() {
        if (this.overlayCanvas) {
            const overlayCtx = this.overlayCanvas.getContext('2d');
            overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }
        this.previewMask = null;
    }

    async handleCanvasClick(e) {
        if (!this.currentImage || !this.modelLoaded || this.isProcessing) {
            return;
        }
        
        const currentTool = this.maskTools?.currentTool || 'click';
        if (currentTool !== 'click') {
            return;
        }
        
        try {
            this.isProcessing = true;
            this.hideClickPreview();
            this.showLoadingOverlay('Analyzing image...');
            
            // Get click coordinates
            const rect = this.overlayCanvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (this.overlayCanvas.width / rect.width);
            const y = (e.clientY - rect.top) * (this.overlayCanvas.height / rect.height);
            
            console.log(`Click at: ${x}, ${y}`);
            
            // Use cached segmentation or generate new one
            let segmentationResult;
            if (this.cachedSegmentation) {
                segmentationResult = this.cachedSegmentation;
            } else {
                segmentationResult = await this.segmentation.segmentImage(this.imageCanvas);
                this.cachedSegmentation = segmentationResult;
            }
            
            const segmentationData = segmentationResult.imageData;
            
            // Check if click hit existing mask (to toggle selection)
            const maskData = this.maskTools.getMaskData();
            const pixelIndex = (Math.floor(y) * maskData.width + Math.floor(x)) * 4;
            const isInSelection = maskData.data[pixelIndex] > 128;
            
            console.log('Is in selection:', isInSelection);
            
            // Create mask for clicked object using the segmentation module
            const objectMask = this.segmentation.createClickMask(segmentationData, x, y);
            
            // Check if the mask has any selection
            const maskDataArray = objectMask.data;
            let hasSelection = false;
            for (let i = 0; i < maskDataArray.length; i += 4) {
                if (maskDataArray[i] > 0) {
                    hasSelection = true;
                    break;
                }
            }
            
            if (hasSelection) {
                if (isInSelection) {
                    // Remove from selection
                    this.subtractMaskFromSelection(objectMask);
                    console.log('Removed selection');
                } else {
                    // Add to selection
                    this.maskTools.applySegmentation(objectMask, true);
                    console.log('Added to selection');
                }
            } else {
                console.log('Clicked on background - no changes made');
            }
            
            this.hideLoadingOverlay();
            this.updateCanvasInfo('Selection updated');
            
        } catch (error) {
            console.error('AI segmentation failed:', error);
            this.hideLoadingOverlay();
            this.showError(`AI segmentation failed: ${error.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    handleUndo() {
        if (this.maskTools && this.maskTools.undo()) {
            this.updateToolButtons();
            this.updateCanvasInfo('Action undone');
        }
    }

    handleRedo() {
        if (this.maskTools && this.maskTools.redo()) {
            this.updateToolButtons();
            this.updateCanvasInfo('Action redone');
        }
    }

    handleClear() {
        if (this.maskTools) {
            this.maskTools.clearMask();
            this.updateToolButtons();
            this.updateCanvasInfo('Selection cleared');
        }
    }

    async handleRefine() {
        if (!this.maskTools) return;
        
        try {
            this.showLoadingOverlay('Refining edges...');
            
            // Simple edge refinement using canvas operations
            const currentMask = this.maskTools.getMaskData();
            const refinedMask = this.refineMaskEdges(currentMask);
            
            // Apply refined mask
            const maskCtx = this.maskCanvas.getContext('2d');
            maskCtx.putImageData(refinedMask, 0, 0);
            this.maskTools.saveState();
            
            this.hideLoadingOverlay();
            this.updateCanvasInfo('Edges refined');
            
        } catch (error) {
            console.error('Edge refinement failed:', error);
            this.hideLoadingOverlay();
            this.showError('Edge refinement failed. Please try again.');
        }
    }

    refineMaskEdges(maskData, iterations = 1) {
        const width = maskData.width;
        const height = maskData.height;
        const data = new Uint8ClampedArray(maskData.data);
        
        // Apply closing operation (dilation followed by erosion)
        for (let iter = 0; iter < iterations; iter++) {
            // Dilation
            const dilated = new Uint8ClampedArray(data);
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    if (data[idx] > 128) continue;
                    
                    // Check 3x3 neighborhood
                    let hasWhiteNeighbor = false;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
                            if (data[neighborIdx] > 128) {
                                hasWhiteNeighbor = true;
                                break;
                            }
                        }
                        if (hasWhiteNeighbor) break;
                    }
                    
                    if (hasWhiteNeighbor) {
                        dilated[idx] = 255;
                        dilated[idx + 1] = 255;
                        dilated[idx + 2] = 255;
                    }
                }
            }
            
            // Erosion
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    if (dilated[idx] < 128) continue;
                    
                    // Check 3x3 neighborhood
                    let hasBlackNeighbor = false;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const neighborIdx = ((y + dy) * width + (x + dx)) * 4;
                            if (dilated[neighborIdx] < 128) {
                                hasBlackNeighbor = true;
                                break;
                            }
                        }
                        if (hasBlackNeighbor) break;
                    }
                    
                    if (hasBlackNeighbor) {
                        data[idx] = 0;
                        data[idx + 1] = 0;
                        data[idx + 2] = 0;
                    } else {
                        data[idx] = dilated[idx];
                        data[idx + 1] = dilated[idx + 1];
                        data[idx + 2] = dilated[idx + 2];
                    }
                }
            }
        }
        
        return new ImageData(data, width, height);
    }

    subtractMaskFromSelection(objectMask) {
        const maskCtx = this.maskCanvas.getContext('2d');
        
        // Create temporary canvas for the object mask
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = objectMask.width;
        tempCanvas.height = objectMask.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(objectMask, 0, 0);
        
        // Use destination-out blend mode to subtract
        maskCtx.save();
        maskCtx.globalCompositeOperation = 'destination-out';
        maskCtx.drawImage(tempCanvas, 0, 0);
        maskCtx.restore();
        
        this.maskTools.saveState();
    }

    handleDownload() {
        if (!this.maskTools) {
            this.showError('No mask to download');
            return;
        }
        
        try {
            // Get current mask
            const currentMask = this.maskTools.getMaskData();
            
            // Create download canvas with pure black/white
            const downloadCanvas = document.createElement('canvas');
            downloadCanvas.width = currentMask.width;
            downloadCanvas.height = currentMask.height;
            const downloadCtx = downloadCanvas.getContext('2d');
            
            // Create pure binary mask
            const binaryMask = this.createBinaryMask(currentMask);
            downloadCtx.putImageData(binaryMask, 0, 0);
            
            // Create download link
            downloadCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `mask_${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.updateCanvasInfo('Mask downloaded');
            });
            
        } catch (error) {
            console.error('Download failed:', error);
            this.showError('Failed to download mask. Please try again.');
        }
    }

    createBinaryMask(maskData) {
        const width = maskData.width;
        const height = maskData.height;
        const data = maskData.data;
        const binaryData = new Uint8ClampedArray(data.length);
        
        // Convert to pure binary: > 128 = white (255), <= 128 = black (0)
        for (let i = 0; i < data.length; i += 4) {
            const isSelected = data[i] > 128;
            const value = isSelected ? 255 : 0;
            
            binaryData[i] = value;
            binaryData[i + 1] = value;
            binaryData[i + 2] = value;
            binaryData[i + 3] = 255;
        }
        
        return new ImageData(binaryData, width, height);
    }

    updateToolButtons() {
        if (!this.maskTools) return;
        
        const status = this.maskTools.getStatus();
        this.undoBtn.disabled = !status.canUndo;
        this.redoBtn.disabled = !status.canRedo;
    }

    updateCanvasInfo(text) {
        this.canvasInfo.textContent = text;
    }

    showLoadingOverlay(message = 'Loading...') {
        this.loadingOverlay.style.display = 'flex';
        const loadingText = this.loadingOverlay.querySelector('p');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }

    hideLoadingOverlay() {
        this.loadingOverlay.style.display = 'none';
    }

    showError(message) {
        alert(`Error: ${message}`);
        console.error(message);
    }

    dispose() {
        if (this.maskTools) {
            this.maskTools.dispose();
        }
        if (this.segmentation) {
            this.segmentation.dispose();
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ImageSegmentationApp();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.dispose();
    }
});