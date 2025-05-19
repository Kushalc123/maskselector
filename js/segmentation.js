// js/segmentation.js - AI segmentation module using TensorFlow.js DeepLab

class ImageSegmentation {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.loadingPromise = null;
    }

    /**
     * Initialize and load the segmentation model
     * @returns {Promise} Model loading promise
     */
    async initializeModel() {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = this._loadModel();
        return this.loadingPromise;
    }

    /**
     * Internal method to load the DeepLab model
     * @private
     */
    async _loadModel() {
        try {
            console.log('Loading DeepLab model...');
            
            // Load the DeepLab v3 model from TensorFlow Hub
            this.model = await deeplab.load({
                base: 'pascal',
                quantizationBytes: 2
            });
            
            this.isModelLoaded = true;
            console.log('DeepLab model loaded successfully');
            
            // Warm up the model
            await this._warmUpModel();
            
            return this.model;
        } catch (error) {
            console.error('Failed to load segmentation model:', error);
            throw new Error('Failed to load AI segmentation model. Please refresh and try again.');
        }
    }

    /**
     * Resize ImageData to target dimensions
     * @private
     * @param {ImageData} imageData - Source image data
     * @param {number} targetWidth - Target width
     * @param {number} targetHeight - Target height
     * @returns {ImageData} Resized image data
     */
    _resizeImageData(imageData, targetWidth, targetHeight) {
        // Create temporary canvas for resizing
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Put original data on canvas
        tempCtx.putImageData(imageData, 0, 0);
        
        // Create target canvas
        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = targetWidth;
        targetCanvas.height = targetHeight;
        const targetCtx = targetCanvas.getContext('2d');
        
        // Draw resized image
        targetCtx.imageSmoothingEnabled = false; // Preserve sharp edges for segmentation
        targetCtx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
        
        // Get resized image data
        return targetCtx.getImageData(0, 0, targetWidth, targetHeight);
    }

    /**
     * Warm up the model to improve initial inference performance
     * @private
     */
    async _warmUpModel() {
        try {
            // Create a properly sized dummy image for warm-up
            const dummyImage = tf.zeros([513, 513, 3]);
            const result = await this.model.segment(dummyImage);
            dummyImage.dispose();
            
            // Clean up warm-up result
            if (result && typeof result.dispose === 'function') {
                result.dispose();
            }
            console.log('Model warmed up successfully');
        } catch (error) {
            console.warn('Model warm-up failed:', error);
        }
    }

    /**
     * Segment the given image and return segmentation result
     * @param {HTMLCanvasElement} canvas - Canvas containing the image
     * @returns {Promise<Object>} Segmentation results
     */
    async segmentImage(canvas) {
        if (!this.isModelLoaded) {
            throw new Error('Model not loaded. Please wait for initialization to complete.');
        }

        try {
            console.log('Starting image segmentation...');
            
            // Convert canvas to tensor
            const imageTensor = tf.browser.fromPixels(canvas);
            console.log('Input image tensor shape:', imageTensor.shape);
            
            // Get predictions from model
            const predictions = await this.model.segment(imageTensor);
            console.log('Raw predictions:', predictions);
            
            // Clean up input tensor
            imageTensor.dispose();
            
            // Process the results based on what we actually get
            return this._processSegmentationResult(predictions, canvas.width, canvas.height);
            
        } catch (error) {
            console.error('Segmentation failed:', error);
            throw new Error(`Failed to segment image: ${error.message}`);
        }
    }

    /**
     * Process segmentation results from DeepLab model
     * @private
     * @param {Object} predictions - Raw predictions from model
     * @param {number} width - Target width
     * @param {number} height - Target height
     * @returns {Promise<Object>} Processed segmentation data
     */
    async _processSegmentationResult(predictions, width, height) {
        // Debug what we actually received
        console.log('Processing segmentation result:', Object.keys(predictions));
        
        // Check if we have segmentationMap as Uint8ClampedArray (common with newer DeepLab)
        if (predictions.segmentationMap && 
            (predictions.segmentationMap instanceof Uint8ClampedArray || 
             predictions.segmentationMap instanceof Uint8Array ||
             Array.isArray(predictions.segmentationMap))) {
            
            console.log('Found segmentationMap as array data');
            console.log('Array length:', predictions.segmentationMap.length);
            console.log('Provided dimensions:', predictions.width, 'x', predictions.height);
            
            // Extract dimensions from predictions or use provided width/height
            const segWidth = predictions.width || width;
            const segHeight = predictions.height || height;
            
            // Create ImageData from the array
            const imageData = new ImageData(segWidth, segHeight);
            
            // If the array is already RGBA format
            if (predictions.segmentationMap.length === segWidth * segHeight * 4) {
                imageData.data.set(predictions.segmentationMap);
            } else {
                // If it's just class indices, convert to RGBA
                const segData = predictions.segmentationMap;
                for (let i = 0; i < segData.length; i++) {
                    const pixelIndex = i * 4;
                    const classValue = segData[i];
                    
                    // Convert class to grayscale (0 = background = black, >0 = white)
                    const grayValue = classValue > 0 ? 255 : 0;
                    
                    imageData.data[pixelIndex] = grayValue;     // R
                    imageData.data[pixelIndex + 1] = grayValue; // G
                    imageData.data[pixelIndex + 2] = grayValue; // B
                    imageData.data[pixelIndex + 3] = 255;       // A
                }
            }
            
            // Resize to target dimensions if needed
            let finalImageData = imageData;
            if (segWidth !== width || segHeight !== height) {
                finalImageData = this._resizeImageData(imageData, width, height);
            }
            
            return {
                imageData: finalImageData,
                legend: predictions.legend || null,
                width: width,
                height: height
            };
        }
        
        // Log all properties to understand the structure
        for (const key in predictions) {
            const value = predictions[key];
            console.log(`${key}:`, value, 'type:', typeof value, 'isTensor:', value && typeof value.shape !== 'undefined');
            if (value && typeof value.shape !== 'undefined') {
                console.log(`  - shape: [${value.shape.join(', ')}], rank: ${value.rank}`);
            }
        }
        
        let segmentationTensor = null;
        
        // Try to find tensor-based segmentation data
        if (predictions.segmentationMap && typeof predictions.segmentationMap.shape !== 'undefined') {
            console.log('Found segmentationMap tensor');
            segmentationTensor = predictions.segmentationMap;
        } else if (predictions.segmentation && typeof predictions.segmentation.shape !== 'undefined') {
            console.log('Found segmentation tensor');
            segmentationTensor = predictions.segmentation;
        } else if (predictions.prediction && typeof predictions.prediction.shape !== 'undefined') {
            console.log('Found prediction tensor');
            segmentationTensor = predictions.prediction;
        } else {
            // Look for any tensor-like property
            for (const key in predictions) {
                const value = predictions[key];
                if (value && typeof value.shape !== 'undefined' && value.shape.length >= 2) {
                    console.log(`Using tensor from property: ${key}`);
                    segmentationTensor = value;
                    break;
                }
            }
        }
        
        if (!segmentationTensor) {
            // Last resort - try to use the predictions directly if it's a tensor
            if (predictions && typeof predictions.shape !== 'undefined') {
                segmentationTensor = predictions;
            } else {
                throw new Error('Could not find segmentation data in model predictions. Available keys: ' + Object.keys(predictions).join(', '));
            }
        }
        
        console.log('Using segmentation tensor:', segmentationTensor.shape);
        
        // Convert tensor to ImageData
        const segmentationData = await this._tensorToImageData(segmentationTensor, width, height);
        
        return {
            imageData: segmentationData,
            originalTensor: segmentationTensor,
            legend: predictions.legend || null,
            width: width,
            height: height
        };
    }

    /**
     * Convert tensor to ImageData format
     * @private
     * @param {tf.Tensor} tensor - Segmentation tensor
     * @param {number} width - Target width
     * @param {number} height - Target height
     * @returns {Promise<ImageData>} Converted ImageData
     */
    async _tensorToImageData(tensor, width, height) {
        if (!tensor || typeof tensor.shape === 'undefined') {
            throw new Error('Invalid tensor provided');
        }

        try {
            console.log('Converting tensor to ImageData, tensor shape:', tensor.shape);
            
            let processedTensor = tensor;
            
            // Handle different tensor shapes
            if (tensor.rank === 1) {
                // Reshape 1D tensor to 2D
                const totalPixels = height * width;
                if (tensor.shape[0] === totalPixels) {
                    processedTensor = tensor.reshape([height, width]);
                } else {
                    throw new Error(`Cannot reshape 1D tensor of size ${tensor.shape[0]} to ${height}x${width}`);
                }
            } else if (tensor.rank === 3) {
                // Remove single dimensions (squeeze)
                processedTensor = tensor.squeeze();
            } else if (tensor.rank === 4) {
                // Remove batch dimension and potentially channel dimension
                processedTensor = tensor.squeeze();
            }
            
            console.log('Processed tensor shape:', processedTensor.shape);
            
            // Resize to target dimensions if needed
            let resizedTensor = processedTensor;
            if (processedTensor.shape[0] !== height || processedTensor.shape[1] !== width) {
                // Add channel dimension for resize
                const expandedTensor = processedTensor.expandDims(-1);
                resizedTensor = tf.image.resizeBilinear(expandedTensor, [height, width], true);
                resizedTensor = resizedTensor.squeeze(-1);
                expandedTensor.dispose();
            }
            
            // Convert to array
            const segmentationArray = await resizedTensor.data();
            
            // Create RGBA ImageData
            const imageData = new ImageData(width, height);
            const data = imageData.data;
            
            // Convert class labels to binary mask (0 or 255)
            for (let i = 0; i < segmentationArray.length; i++) {
                const pixelIndex = i * 4;
                const classValue = segmentationArray[i];
                
                // Create binary mask: background (class 0) = black, everything else = white
                const maskValue = classValue > 0 ? 255 : 0;
                
                data[pixelIndex] = maskValue;     // R
                data[pixelIndex + 1] = maskValue; // G
                data[pixelIndex + 2] = maskValue; // B
                data[pixelIndex + 3] = 255;       // A
            }
            
            // Clean up tensors
            if (resizedTensor !== processedTensor) {
                resizedTensor.dispose();
            }
            if (processedTensor !== tensor) {
                processedTensor.dispose();
            }
            
            return imageData;
        } catch (error) {
            console.error('Error converting tensor to ImageData:', error);
            throw error;
        }
    }

    /**
     * Create a binary mask for a specific class at clicked point
     * @param {ImageData} segmentationData - Segmentation data
     * @param {number} clickX - X coordinate of click
     * @param {number} clickY - Y coordinate of click
     * @returns {ImageData} Binary mask for the clicked object
     */
    createClickMask(segmentationData, clickX, clickY) {
        const width = segmentationData.width;
        const height = segmentationData.height;
        const data = segmentationData.data;
        
        // Get the class at the clicked point
        const pixelIndex = (Math.floor(clickY) * width + Math.floor(clickX)) * 4;
        const clickedClass = data[pixelIndex];
        
        console.log(`Clicked class value: ${clickedClass} at position (${clickX}, ${clickY})`);
        
        // Create new mask for just this class
        const maskData = new ImageData(width, height);
        const maskArray = maskData.data;
        
        // Handle different segmentation data formats
        if (clickedClass === 0) {
            // Clicked on background - select nothing
            console.log('Clicked on background, creating empty mask');
            for (let i = 0; i < maskArray.length; i += 4) {
                maskArray[i] = 0;       // R
                maskArray[i + 1] = 0;   // G
                maskArray[i + 2] = 0;   // B
                maskArray[i + 3] = 255; // A
            }
        } else {
            // Clicked on an object - select all pixels of same class
            console.log('Clicked on object, creating class mask');
            for (let i = 0; i < data.length; i += 4) {
                const classValue = data[i];
                
                // For binary segmentation (like person vs background)
                // Select all non-background pixels
                const isTargetClass = classValue > 0;
                
                const maskValue = isTargetClass ? 255 : 0;
                maskArray[i] = maskValue;     // R
                maskArray[i + 1] = maskValue; // G
                maskArray[i + 2] = maskValue; // B
                maskArray[i + 3] = 255;       // A
            }
        }
        
        return maskData;
    }

    /**
     * Get model information
     * @returns {Object} Model metadata
     */
    getModelInfo() {
        return {
            isLoaded: this.isModelLoaded,
            modelType: 'DeepLab v3',
            baseModel: 'Pascal VOC',
            supportedClasses: [
                'background', 'aeroplane', 'bicycle', 'bird', 'boat', 
                'bottle', 'bus', 'car', 'cat', 'chair', 'cow', 
                'diningtable', 'dog', 'horse', 'motorbike', 'person',
                'pottedplant', 'sheep', 'sofa', 'train', 'tvmonitor'
            ]
        };
    }

    /**
     * Dispose of the model to free memory
     */
    dispose() {
        if (this.model && typeof this.model.dispose === 'function') {
            this.model.dispose();
            this.model = null;
            this.isModelLoaded = false;
            console.log('Segmentation model disposed');
        }
    }
}

// Export as global for use in other modules
window.ImageSegmentation = ImageSegmentation;