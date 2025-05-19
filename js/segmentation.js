// js/segmentation.js - Improved AI segmentation using core DeepLab only

class ImageSegmentation {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.loadingPromise = null;
        
        // Cache for performance
        this.lastImageData = null;
        this.lastSegmentation = null;
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
            
            // Get image data for caching
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // Check if we already processed this exact image
            if (this.lastImageData && this._imageDataEqual(imageData, this.lastImageData)) {
                console.log('Using cached segmentation result');
                return this.lastSegmentation;
            }
            
            // Convert canvas to tensor
            const imageTensor = tf.browser.fromPixels(canvas);
            console.log('Input image tensor shape:', imageTensor.shape);
            
            // Get predictions from model
            const predictions = await this.model.segment(imageTensor);
            console.log('Raw predictions:', predictions);
            
            // Clean up input tensor
            imageTensor.dispose();
            
            // Process the results
            const result = await this._processSegmentationResult(predictions, canvas.width, canvas.height);
            
            // Cache the results
            this.lastImageData = imageData;
            this.lastSegmentation = result;
            
            return result;
            
        } catch (error) {
            console.error('Segmentation failed:', error);
            throw new Error(`Failed to segment image: ${error.message}`);
        }
    }

    /**
     * Check if two ImageData objects are equal
     * @private
     */
    _imageDataEqual(data1, data2) {
        if (data1.width !== data2.width || data1.height !== data2.height) {
            return false;
        }
        
        // Sample a few pixels for quick comparison
        const sampleIndices = [0, Math.floor(data1.data.length / 4), data1.data.length - 4];
        for (const idx of sampleIndices) {
            for (let i = 0; i < 4; i++) {
                if (data1.data[idx + i] !== data2.data[idx + i]) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Process segmentation results from DeepLab model
     * @private
     */
    async _processSegmentationResult(predictions, width, height) {
        // Debug what we actually received
        console.log('Processing segmentation result:', Object.keys(predictions));
        
        // Check if we have segmentationMap as Uint8ClampedArray
        if (predictions.segmentationMap && 
            (predictions.segmentationMap instanceof Uint8ClampedArray || 
             predictions.segmentationMap instanceof Uint8Array ||
             Array.isArray(predictions.segmentationMap))) {
            
            console.log('Found segmentationMap as array data');
            const segWidth = predictions.width || width;
            const segHeight = predictions.height || height;
            
            // Create ImageData from the array
            const imageData = new ImageData(segWidth, segHeight);
            
            if (predictions.segmentationMap.length === segWidth * segHeight * 4) {
                imageData.data.set(predictions.segmentationMap);
            } else {
                // Convert class indices to binary mask
                const segData = predictions.segmentationMap;
                for (let i = 0; i < segData.length; i++) {
                    const pixelIndex = i * 4;
                    const classValue = segData[i];
                    
                    // Store original class value for better selection
                    imageData.data[pixelIndex] = classValue;     // R stores class
                    imageData.data[pixelIndex + 1] = classValue; // G stores class
                    imageData.data[pixelIndex + 2] = classValue; // B stores class
                    imageData.data[pixelIndex + 3] = 255;        // A
                }
            }
            
            // Resize if needed
            let finalImageData = imageData;
            if (segWidth !== width || segHeight !== height) {
                finalImageData = this._resizeImageData(imageData, width, height);
            }
            
            return {
                imageData: finalImageData,
                segmentationMap: predictions.segmentationMap,
                legend: predictions.legend || null,
                width: width,
                height: height
            };
        }
        
        // Handle tensor-based results
        let segmentationTensor = null;
        if (predictions.segmentationMap && typeof predictions.segmentationMap.shape !== 'undefined') {
            segmentationTensor = predictions.segmentationMap;
        } else if (predictions.segmentation && typeof predictions.segmentation.shape !== 'undefined') {
            segmentationTensor = predictions.segmentation;
        } else if (predictions.prediction && typeof predictions.prediction.shape !== 'undefined') {
            segmentationTensor = predictions.prediction;
        } else {
            // Look for any tensor-like property
            for (const key in predictions) {
                const value = predictions[key];
                if (value && typeof value.shape !== 'undefined' && value.shape.length >= 2) {
                    segmentationTensor = value;
                    break;
                }
            }
        }
        
        if (!segmentationTensor) {
            if (predictions && typeof predictions.shape !== 'undefined') {
                segmentationTensor = predictions;
            } else {
                throw new Error('Could not find segmentation data in model predictions');
            }
        }
        
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
     * Resize ImageData to target dimensions
     * @private
     */
    _resizeImageData(imageData, targetWidth, targetHeight) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.putImageData(imageData, 0, 0);
        
        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = targetWidth;
        targetCanvas.height = targetHeight;
        const targetCtx = targetCanvas.getContext('2d');
        
        targetCtx.imageSmoothingEnabled = false;
        targetCtx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
        
        return targetCtx.getImageData(0, 0, targetWidth, targetHeight);
    }

    /**
     * Convert tensor to ImageData format
     * @private
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
                const totalPixels = height * width;
                if (tensor.shape[0] === totalPixels) {
                    processedTensor = tensor.reshape([height, width]);
                } else {
                    throw new Error(`Cannot reshape 1D tensor of size ${tensor.shape[0]} to ${height}x${width}`);
                }
            } else if (tensor.rank === 3) {
                processedTensor = tensor.squeeze();
            } else if (tensor.rank === 4) {
                processedTensor = tensor.squeeze();
            }
            
            // Resize to target dimensions if needed
            let resizedTensor = processedTensor;
            if (processedTensor.shape[0] !== height || processedTensor.shape[1] !== width) {
                const expandedTensor = processedTensor.expandDims(-1);
                resizedTensor = tf.image.resizeBilinear(expandedTensor, [height, width], true);
                resizedTensor = resizedTensor.squeeze(-1);
                expandedTensor.dispose();
            }
            
            // Convert to array
            const segmentationArray = await resizedTensor.data();
            
            // Create ImageData storing class values
            const imageData = new ImageData(width, height);
            const data = imageData.data;
            
            // Store class values directly (not binary)
            for (let i = 0; i < segmentationArray.length; i++) {
                const pixelIndex = i * 4;
                const classValue = segmentationArray[i];
                
                // Store class value in all channels for consistency
                data[pixelIndex] = classValue;     // R
                data[pixelIndex + 1] = classValue; // G
                data[pixelIndex + 2] = classValue; // B
                data[pixelIndex + 3] = 255;        // A
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
     * Create a binary mask using connected components analysis only
     * @param {Object} segmentationResult - Segmentation result
     * @param {number} clickX - X coordinate of click
     * @param {number} clickY - Y coordinate of click
     * @returns {ImageData} Binary mask for the clicked object
     */
    createClickMask(segmentationResult, clickX, clickY) {
        const imageData = segmentationResult.imageData;
        const width = imageData.width;
        const height = imageData.height;
        const data = imageData.data;
        
        console.log(`AI Click at: ${clickX}, ${clickY}`);
        
        // Get the class at the clicked point
        const pixelIndex = (Math.floor(clickY) * width + Math.floor(clickX)) * 4;
        const clickedClass = data[pixelIndex];
        
        console.log(`Clicked class value: ${clickedClass}`);
        
        // Create mask for the clicked class using connected components
        const maskData = new ImageData(width, height);
        const maskArray = maskData.data;
        
        if (clickedClass === 0) {
            // Clicked on background - create empty mask
            console.log('Clicked on background, creating empty mask');
            for (let i = 0; i < maskArray.length; i += 4) {
                maskArray[i] = 0;
                maskArray[i + 1] = 0;
                maskArray[i + 2] = 0;
                maskArray[i + 3] = 255;
            }
        } else {
            // Find connected component of the clicked class
            console.log('Finding connected component for class:', clickedClass);
            this._findConnectedComponent(data, maskArray, width, height, Math.floor(clickX), Math.floor(clickY), clickedClass);
        }
        
        return maskData;
    }

    /**
     * Find connected component using flood fill starting from click point
     * @private
     */
    _findConnectedComponent(data, maskArray, width, height, startX, startY, targetClass) {
        const visited = new Set();
        const queue = [[startX, startY]];
        
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            
            const idx = y * width + x;
            const pixelIdx = idx * 4;
            
            if (visited.has(idx)) continue;
            visited.add(idx);
            
            // Check if this pixel has the target class
            const pixelClass = data[pixelIdx];
            if (pixelClass === targetClass) {
                // Add to mask
                maskArray[pixelIdx] = 255;
                maskArray[pixelIdx + 1] = 255;
                maskArray[pixelIdx + 2] = 255;
                maskArray[pixelIdx + 3] = 255;
                
                // Add 4-connected neighbors to queue
                queue.push([x + 1, y]);
                queue.push([x - 1, y]);
                queue.push([x, y + 1]);
                queue.push([x, y - 1]);
            }
        }
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
            features: ['Connected Components'],
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
        
        // Clear caches
        this.lastImageData = null;
        this.lastSegmentation = null;
    }
}

// Export as global for use in other modules
window.ImageSegmentation = ImageSegmentation;