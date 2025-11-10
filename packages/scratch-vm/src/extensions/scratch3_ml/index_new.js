const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');

// Configuration constants
const API_BASE_URL = 'http://localhost:8080';
const IMAGE_QUALITY = 0.8;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const TM_INTERVAL = 33; // 30 FPS for Teachable Machine
const TM_DIMENSIONS = [480, 360];

// Block colors
const IMAGES_COLOR = '#00C851'; // Green
const ML_COLOR = '#1976D2'; // Dark blue

class ML3Extension {
    constructor(runtime) {
        this.runtime = runtime;
        console.log('ML Extension: Comprehensive Image Recognition Extension Loaded');
        
        // Core project data
        this.sessionId = null;
        this.projectId = null;
        this.projectName = null;
        this.projectLabels = [];
        this.isReady = false;
        
        // Camera and image processing
        this.cameraStream = null;
        this.cameraVideo = null;
        this.isCameraEnabled = false;
        this.lastImageCapture = null;
        
        // Teachable Machine mode
        this.isTeachableMachineMode = false;
        this.teachableLink = null;
        this.tmModel = null;
        this.isTmModelLoaded = false;
        this.tmModelLabels = [];
        this.tmCurrentPrediction = null;
        this.tmModelConfidences = {};
        this.tmIsPredicting = 0;
        this.tmLastUpdate = null;
        
        // Prediction cache
        this.lastPrediction = null;
        this.lastConfidence = null;
        
        // Make extension globally accessible for debugging
        if (typeof window !== 'undefined') {
            window.MLExtension = this;
            console.log('ML Extension: Made globally accessible as window.MLExtension');
            console.log('ML Extension: Use window.refreshMLExtension() to manually refresh blocks');
            console.log('ML Extension: Use window.forceMLExtensionRefresh() to force page reload if needed');
        }
        
        // Initialize the extension
        this.initialize();
    }

    async initialize() {
        console.log('ML Extension: Running synchronous initialization...');
        
        // Load session and project data from localStorage
        this.sessionId = window.localStorage.getItem('neural_playground_session_id');
        this.projectId = window.localStorage.getItem('neural_playground_project_id');
        
        // Check for URL parameters
        this.checkUrlParameters();
        
        console.log('ML Extension: Synchronous initialization complete - waiting for API data');
        
        // Set up URL change listener
        if (typeof window !== 'undefined') {
            this.setupUrlChangeListener();
        }
        
        console.log('ML Extension: Running asynchronous initialization...');
        
        // Load project data from API
        await this.loadProjectData();
        
        // Initialize Teachable Machine if needed
        await this.initializeTeachableMachine();
        
        this.isReady = true;
        console.log('ML Extension: Asynchronous initialization complete');
    }

    checkUrlParameters() {
        if (typeof window === 'undefined') return;
        
        const urlParams = new URLSearchParams(window.location.search);
        const sessionParam = urlParams.get('sessionId');
        const projectParam = urlParams.get('projectId');
        
        if (sessionParam && projectParam) {
            console.log(`ML Extension: Found URL params - Session: ${sessionParam}, Project: ${projectParam}`);
            
            // Store in localStorage
            window.localStorage.setItem('neural_playground_session_id', sessionParam);
            window.localStorage.setItem('neural_playground_project_id', projectParam);
            
            // Clear any cached data for fresh load
            window.localStorage.removeItem('ml_extension_project_name');
            window.localStorage.removeItem('ml_extension_project_labels');
            
            // Update instance variables
            this.sessionId = sessionParam;
            this.projectId = projectParam;
            
            console.log('ML Extension: Cleared localStorage for fresh data');
        }
    }

    setupUrlChangeListener() {
        if (typeof window === 'undefined') return;
        
        // Listen for URL changes (for SPA navigation)
        window.addEventListener('popstate', () => {
            setTimeout(() => this.checkUrlParameters(), 100);
        });
        
        // Also check periodically for URL changes
        setInterval(() => {
            this.checkUrlParameters();
        }, 2000);
        
        console.log('ML Extension: URL change listener setup complete');
    }

    async loadProjectData() {
        if (!this.sessionId || !this.projectId) {
            console.log('ML Extension: No session or project ID available');
            return;
        }

        try {
            console.log(`ML Extension: Loading project data for session ${this.sessionId}, project ${this.projectId}`);
            
            // Fetch project data from API
            const response = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('ML Extension: Project data loaded from API:', data);
                
                if (data.success && data.data) {
                    this.projectName = data.data.name || 'Image Recognition';
                    this.projectLabels = data.data.dataset?.labels || data.data.model?.labels || [];
                    
                    console.log(`ML Extension: Project data loaded from API - Name: ${this.projectName}, Labels: ${this.projectLabels.join(', ')}`);
                    
                    // Store in localStorage for persistence
                    window.localStorage.setItem('ml_extension_project_name', this.projectName);
                    window.localStorage.setItem('ml_extension_project_labels', JSON.stringify(this.projectLabels));
                } else {
                    console.warn('ML Extension: Invalid project data response:', data);
                    this.projectName = 'Image Recognition';
                    this.projectLabels = [];
                }
            } else {
                console.error(`ML Extension: Failed to load project data: ${response.status}`);
                this.projectName = 'Image Recognition';
                this.projectLabels = [];
            }
        } catch (error) {
            console.error('ML Extension: Error loading project data:', error);
            this.projectName = 'Image Recognition';
            this.projectLabels = [];
        }
    }

    async initializeTeachableMachine() {
        if (typeof window === 'undefined') return;
        
        try {
            const storedLink = window.localStorage.getItem('ml_extension_teachable_link');
            if (storedLink) {
                this.teachableLink = storedLink;
                this.isTeachableMachineMode = true;
                console.log('ML Extension: Found stored Teachable Machine link:', this.teachableLink);
                await this.loadTeachableMachineModel(this.teachableLink);
            } else {
                console.log('ML Extension: No Teachable Machine link found in localStorage');
            }
        } catch (error) {
            console.error('ML Extension: Error initializing Teachable Machine:', error);
        }
    }

    async loadTeachableMachineModel(link) {
        try {
            // Load Teachable Machine model
            const { createTeachableMachineModel } = await import('@teachablemachine/image');
            this.tmModel = await createTeachableMachineModel(link);
            this.isTmModelLoaded = true;
            
            // Get model labels
            this.tmModelLabels = this.tmModel.getLabels();
            console.log('ML Extension: Teachable Machine model loaded with labels:', this.tmModelLabels);
            
            // Start prediction loop
            this.startTeachableMachinePredictionLoop();
        } catch (error) {
            console.error('ML Extension: Failed to load Teachable Machine model:', error);
        }
    }

    startTeachableMachinePredictionLoop() {
        if (!this.tmModel || !this.isTmModelLoaded) return;
        
        const predictLoop = (time) => {
            if (!this.tmModel || !this.isTmModelLoaded) return;
            
            try {
                let frame = null;
                
                // Get video frame from Scratch's video system
                if (this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video) {
                    try {
                        frame = this.runtime.ioDevices.video.getFrame({
                            format: 'image-data',
                            dimensions: TM_DIMENSIONS
                        });
                    } catch (videoError) {
                        console.warn('Teachable Machine: Could not get video frame:', videoError.message);
                    }
                }
                
                if (frame) {
                    this.tmLastUpdate = time;
                    this.tmIsPredicting = 1;
                    this.tmPredictAllBlocks(frame);
                    this.tmIsPredicting = 0;
                }
            } catch (e) {
                this.tmIsPredicting = 0;
                console.error('Teachable Machine: Prediction loop error:', e);
            }
            
            requestAnimationFrame(predictLoop);
        };
        
        requestAnimationFrame(predictLoop);
    }

    async tmPredictAllBlocks(frame) {
        if (!this.tmModel || !this.isTmModelLoaded) return;

        try {
            // Convert Scratch video frame to a format that Teachable Machine can handle
            let imageElement = null;
            
            if (frame && frame.data) {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width || TM_DIMENSIONS[0];
                    canvas.height = frame.height || TM_DIMENSIONS[1];
                    const ctx = canvas.getContext('2d');
                    ctx.putImageData(frame, 0, 0);
                    imageElement = canvas;
                } catch (canvasError) {
                    console.warn('Teachable Machine: Could not convert ImageData to canvas:', canvasError.message);
                }
            } else if (frame && frame instanceof HTMLCanvasElement) {
                imageElement = frame;
            } else if (frame && frame instanceof HTMLVideoElement) {
                imageElement = frame;
            }
            
            if (!imageElement) {
                console.warn('Teachable Machine: Could not convert frame to usable format');
                return;
            }
            
            // Predict using the converted image element
            const prediction = await this.tmModel.predict(imageElement);
            
            // Find highest confidence prediction
            let highestConfidence = 0;
            let bestPrediction = null;
            
            for (let i = 0; i < prediction.length; i++) {
                const probability = prediction[i].probability;
                const className = prediction[i].className;
                
                // Update confidence for reporter block
                this.tmModelConfidences[className] = probability;
                
                if (probability > highestConfidence) {
                    highestConfidence = probability;
                    bestPrediction = {
                        label: className,
                        confidence: probability
                    };
                }
            }
            
            this.tmCurrentPrediction = bestPrediction;
            
        } catch (error) {
            console.error('Teachable Machine: Prediction failed:', error);
        }
    }

    getInfo() {
        console.log('ML Extension: getInfo() called - CREATING COMPREHENSIVE BLOCKS');
        console.log('ML Extension: Current projectLabels:', this.projectLabels);
        console.log('ML Extension: isReady:', this.isReady);
        console.log('ML Extension: isTeachableMachineMode:', this.isTeachableMachineMode);
        
        // Safety check - ensure we have valid data
        if (!this.isReady) {
            console.log('ML Extension: Not ready, returning minimal blocks');
            return {
                id: 'ml',
                name: 'Initializing...',
                color1: ML_COLOR,
                color2: ML_COLOR,
                customFieldTypes: {},
                blocks: [],
                menus: {}
            };
        }
        
        // Check if we're in Teachable Machine mode
        if (this.isTeachableMachineMode) {
            console.log('ML Extension: Returning Teachable Machine blocks');
            return this.getTeachableMachineInfo();
        }
        
        // Ensure projectLabels is always an array
        const labels = Array.isArray(this.projectLabels) ? this.projectLabels : [];
        
        // Create dynamic label blocks based on API response
        const dynamicLabelBlocks = labels
            .filter(label => label && typeof label === 'string' && label.trim().length > 0)
            .map(label => {
                const cleanLabel = label.trim();
                return {
                    opcode: `label_${cleanLabel}`,
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: `ml.label_${cleanLabel}`,
                        default: cleanLabel,
                        description: `Represents the "${cleanLabel}" label from your project`
                    })
                };
            });
        
        // Create label menu items for training blocks
        const labelMenuItems = labels
            .filter(label => label && typeof label === 'string' && label.trim().length > 0)
            .map(label => {
                const cleanLabel = label.trim();
                return [cleanLabel, cleanLabel];
            });
        
        // Ensure we always have at least one valid menu item
        if (labelMenuItems.length === 0) {
            labelMenuItems.push(['No labels', 'no_labels']);
        }
        
        // Validate menu items format
        const validLabelMenuItems = labelMenuItems.filter(item => {
            if (!Array.isArray(item) || item.length !== 2) {
                console.warn('ML Extension: Invalid menu item format:', item);
                return false;
            }
            if (typeof item[0] !== 'string' || typeof item[1] !== 'string') {
                console.warn('ML Extension: Menu item values must be strings:', item);
                return false;
            }
            return true;
        });
        
        // All blocks including Images category and dynamic project category
        const allBlocks = [
            // Images Category (Green blocks)
            {
                opcode: 'costumeImage',
                blockType: BlockType.REPORTER,
                text: formatMessage({
                    id: 'ml.costumeImage',
                    default: 'costume image',
                    description: 'Returns the current sprite\'s costume as image data'
                })
            },
            {
                opcode: 'backdropImage',
                blockType: BlockType.REPORTER,
                text: formatMessage({
                    id: 'ml.backdropImage',
                    default: 'backdrop image',
                    description: 'Returns the current stage backdrop as image data'
                })
            },
            {
                opcode: 'saveScreenshotToCostume',
                blockType: BlockType.COMMAND,
                text: formatMessage({
                    id: 'ml.saveScreenshotToCostume',
                    default: 'save screenshot to costume',
                    description: 'Captures entire screen and saves as costume'
                })
            },
            {
                opcode: 'webcamImage',
                blockType: BlockType.REPORTER,
                text: formatMessage({
                    id: 'ml.webcamImage',
                    default: 'webcam image',
                    description: 'Returns live webcam feed as image data'
                })
            },
            
            // Dynamic Project Category (Dark blue blocks with ML icon)
            {
                opcode: 'recogniseImageLabel',
                blockType: BlockType.REPORTER,
                text: formatMessage({
                    id: 'ml.recogniseImageLabel',
                    default: 'recognise image [IMAGE] (label)',
                    description: 'Recognise image and return the predicted label'
                }),
                arguments: {
                    IMAGE: {
                        type: ArgumentType.STRING,
                        defaultValue: 'costume image'
                    }
                }
            },
            {
                opcode: 'recogniseImageConfidence',
                blockType: BlockType.REPORTER,
                text: formatMessage({
                    id: 'ml.recogniseImageConfidence',
                    default: 'recognise image [IMAGE] (confidence)',
                    description: 'Recognise image and return the confidence score'
                }),
                arguments: {
                    IMAGE: {
                        type: ArgumentType.STRING,
                        defaultValue: 'costume image'
                    }
                }
            },
            {
                opcode: 'isModelReady',
                blockType: BlockType.BOOLEAN,
                text: formatMessage({
                    id: 'ml.isModelReady',
                    default: 'is the machine learning model ready',
                    description: 'Returns true/false based on model training status'
                })
            },
            
            // Text Classification blocks (existing)
            {
                opcode: 'recogniseTextLabel',
                blockType: BlockType.REPORTER,
                text: formatMessage({
                    id: 'ml.recogniseTextLabel',
                    default: 'recognise text [TEXT] (label)',
                    description: 'Recognise text and return the predicted label'
                }),
                arguments: {
                    TEXT: {
                        type: ArgumentType.STRING,
                        defaultValue: 'text'
                    }
                }
            },
            {
                opcode: 'recogniseTextConfidence',
                blockType: BlockType.REPORTER,
                text: formatMessage({
                    id: 'ml.recogniseTextConfidence',
                    default: 'recognise text [TEXT] (confidence)',
                    description: 'Recognise text and return the confidence score'
                }),
                arguments: {
                    TEXT: {
                        type: ArgumentType.STRING,
                        defaultValue: 'text'
                    }
                }
            },
            
            // Dynamic label blocks
            ...dynamicLabelBlocks
        ];
        
        console.log(`ML Extension: Project: ${this.projectName}, Labels: ${labels.join(', ')}, Total blocks: ${allBlocks.length}`);
        console.log(`ML Extension: Label menu items:`, validLabelMenuItems);
        console.log(`ML Extension: Label menu items length:`, validLabelMenuItems.length);
        console.log(`ML Extension: Dynamic label blocks:`, dynamicLabelBlocks.length);
        
        return {
            id: 'ml',
            name: this.projectName || 'Image Recognition',
            color1: ML_COLOR,
            color2: ML_COLOR,
            customFieldTypes: {},
            blocks: allBlocks,
            menus: {
                projectLabels: {
                    acceptReporters: false,
                    items: validLabelMenuItems
                }
            },
            // Add translation map for missing translations
            translation_map: {
                en: {
                    'ml.costumeImage': 'costume image',
                    'ml.backdropImage': 'backdrop image',
                    'ml.saveScreenshotToCostume': 'save screenshot to costume',
                    'ml.webcamImage': 'webcam image',
                    'ml.recogniseImageLabel': 'recognise image [IMAGE] (label)',
                    'ml.recogniseImageConfidence': 'recognise image [IMAGE] (confidence)',
                    'ml.isModelReady': 'is the machine learning model ready',
                    'ml.recogniseTextLabel': 'recognise text [TEXT] (label)',
                    'ml.recogniseTextConfidence': 'recognise text [TEXT] (confidence)'
                }
            }
        };
    }

    getTeachableMachineInfo() {
        if (!this.isTeachableMachineMode || !this.tmModelLabels || this.tmModelLabels.length === 0) {
            return {
                id: 'ml',
                name: 'Teachable Machine',
                color1: ML_COLOR,
                color2: ML_COLOR,
                customFieldTypes: {},
                blocks: [],
                menus: {}
            };
        }

        // Create blocks for Teachable Machine labels
        const tmLabelBlocks = this.tmModelLabels.map(label => ({
            opcode: `tm_label_${label}`,
            blockType: BlockType.REPORTER,
            text: formatMessage({
                id: `ml.tm.label_${label}`,
                default: label,
                description: `Teachable Machine label: ${label}`
            })
        }));

        return {
            id: 'ml',
            name: 'Teachable Machine',
            color1: ML_COLOR,
            color2: ML_COLOR,
            customFieldTypes: {},
            blocks: [
                {
                    opcode: 'tmRecogniseImageLabel',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'ml.tmRecogniseImageLabel',
                        default: 'recognise image (label)',
                        description: 'Recognise image using Teachable Machine model'
                    })
                },
                {
                    opcode: 'tmRecogniseImageConfidence',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'ml.tmRecogniseImageConfidence',
                        default: 'recognise image (confidence)',
                        description: 'Get confidence score from Teachable Machine model'
                    })
                },
                ...tmLabelBlocks
            ],
            menus: {}
        };
    }

    // Image capture methods
    async costumeImage() {
        try {
            const target = this.runtime.getTargetForStage();
            if (!target || !target.sprite) {
                return null;
            }

            const costume = target.sprite.costume;
            if (!costume || !costume.bitmapResolution) {
                return null;
            }

            // Get the costume's canvas
            const canvas = costume._canvas;
            if (!canvas) {
                return null;
            }

            // Convert to base64
            return this.canvasToBase64(canvas);
        } catch (error) {
            console.error('ML Extension: Error capturing costume image:', error);
            return null;
        }
    }

    async backdropImage() {
        try {
            const target = this.runtime.getTargetForStage();
            if (!target) {
                return null;
            }

            const backdrop = target.currentCostume;
            if (!backdrop || !backdrop._canvas) {
                return null;
            }

            // Convert backdrop canvas to base64
            return this.canvasToBase64(backdrop._canvas);
        } catch (error) {
            console.error('ML Extension: Error capturing backdrop image:', error);
            return null;
        }
    }

    async saveScreenshotToCostume() {
        try {
            // Capture the entire stage
            const canvas = await this.captureScreen();
            if (!canvas) {
                console.error('ML Extension: Failed to capture screen');
                return;
            }

            // Convert canvas to costume
            const base64Data = this.canvasToBase64(canvas);
            if (!base64Data) {
                console.error('ML Extension: Failed to convert canvas to base64');
                return;
            }

            // Create new costume from screenshot
            const target = this.runtime.getTargetForStage();
            if (target) {
                // This would require additional implementation to add costume to sprite
                console.log('ML Extension: Screenshot captured, costume creation requires additional implementation');
            }
        } catch (error) {
            console.error('ML Extension: Error saving screenshot to costume:', error);
        }
    }

    async webcamImage() {
        try {
            if (!this.isCameraEnabled) {
                const success = await this.enableCamera();
                if (!success) {
                    return null;
                }
            }

            if (this.cameraVideo && this.cameraVideo.videoWidth > 0) {
                // Create canvas to capture current frame
                const canvas = document.createElement('canvas');
                canvas.width = this.cameraVideo.videoWidth;
                canvas.height = this.cameraVideo.videoHeight;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(this.cameraVideo, 0, 0);
                
                return this.canvasToBase64(canvas);
            }

            return null;
        } catch (error) {
            console.error('ML Extension: Error capturing webcam image:', error);
            return null;
        }
    }

    // Camera management
    async enableCamera() {
        try {
            if (this.isCameraEnabled && this.cameraStream) {
                return true;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });

            this.cameraStream = stream;
            
            // Create video element
            this.cameraVideo = document.createElement('video');
            this.cameraVideo.srcObject = stream;
            this.cameraVideo.autoplay = true;
            this.cameraVideo.muted = true;
            this.cameraVideo.style.display = 'none';
            document.body.appendChild(this.cameraVideo);

            this.isCameraEnabled = true;
            console.log('ML Extension: Camera enabled');
            return true;
        } catch (error) {
            console.error('ML Extension: Error enabling camera:', error);
            this.isCameraEnabled = false;
            return false;
        }
    }

    disableCamera() {
        try {
            if (this.cameraStream) {
                this.cameraStream.getTracks().forEach(track => track.stop());
                this.cameraStream = null;
            }
            if (this.cameraVideo) {
                this.cameraVideo.srcObject = null;
                this.cameraVideo.remove();
                this.cameraVideo = null;
            }
            this.isCameraEnabled = false;
            console.log('ML Extension: Camera disabled');
        } catch (error) {
            console.error('ML Extension: Error disabling camera:', error);
        }
    }

    async captureScreen() {
        try {
            // Use HTML5 screen capture API
            if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: { mediaSource: 'screen' }
                });

                const video = document.createElement('video');
                video.srcObject = stream;
                video.play();

                return new Promise((resolve) => {
                    video.onloadedmetadata = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(video, 0, 0);
                        
                        stream.getTracks().forEach(track => track.stop());
                        resolve(canvas);
                    };
                });
            } else {
                console.warn('ML Extension: Screen capture not supported');
                return null;
            }
        } catch (error) {
            console.error('ML Extension: Error capturing screen:', error);
            return null;
        }
    }

    canvasToBase64(canvas, format = 'image/jpeg', quality = IMAGE_QUALITY) {
        try {
            if (!canvas) return null;
            return canvas.toDataURL(format, quality);
        } catch (error) {
            console.error('ML Extension: Error converting canvas to base64:', error);
            return null;
        }
    }

    base64ToBlob(base64, mimeType = 'image/jpeg') {
        try {
            const byteCharacters = atob(base64.split(',')[1]);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: mimeType });
        } catch (error) {
            console.error('ML Extension: Error converting base64 to blob:', error);
            return null;
        }
    }

    // Image recognition methods
    async recogniseImageLabel(args) {
        try {
            const imageData = args.IMAGE;
            if (!imageData) {
                console.warn('ML Extension: No image data provided');
                return 'No image';
            }

            if (!this.sessionId || !this.projectId) {
                console.warn('ML Extension: Missing session or project ID for prediction');
                return 'Error: No project loaded';
            }

            console.log(`ML Extension: Making image prediction API call`);

            // Convert base64 to blob if needed
            let blob;
            if (typeof imageData === 'string' && imageData.startsWith('data:')) {
                blob = this.base64ToBlob(imageData);
            } else {
                // Assume it's already a blob or file
                blob = imageData;
            }

            if (!blob) {
                console.error('ML Extension: Failed to convert image data to blob');
                return 'Error: Invalid image';
            }

            // Create form data
            const formData = new FormData();
            formData.append('image', blob, 'image.jpg');

            // Make API call
            const response = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict-image`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                console.log('ML Extension: Image prediction response:', data);
                
                if (data.success && data.prediction) {
                    this.lastPrediction = data.prediction;
                    return data.prediction;
                } else {
                    console.warn('ML Extension: No prediction in response:', data);
                    return 'Unknown';
                }
            } else {
                console.error(`ML Extension: Image prediction failed: ${response.status}`);
                return 'Error: Prediction failed';
            }
        } catch (error) {
            console.error('ML Extension: Error in image prediction:', error);
            return 'Error: Network error';
        }
    }

    async recogniseImageConfidence(args) {
        try {
            const imageData = args.IMAGE;
            if (!imageData) {
                console.warn('ML Extension: No image data provided');
                return 0;
            }

            if (!this.sessionId || !this.projectId) {
                console.warn('ML Extension: Missing session or project ID for prediction');
                return 0;
            }

            console.log(`ML Extension: Making image confidence API call`);

            // Convert base64 to blob if needed
            let blob;
            if (typeof imageData === 'string' && imageData.startsWith('data:')) {
                blob = this.base64ToBlob(imageData);
            } else {
                blob = imageData;
            }

            if (!blob) {
                console.error('ML Extension: Failed to convert image data to blob');
                return 0;
            }

            // Create form data
            const formData = new FormData();
            formData.append('image', blob, 'image.jpg');

            // Make API call
            const response = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict-image`, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const data = await response.json();
                console.log('ML Extension: Image confidence response:', data);
                
                if (data.success && typeof data.confidence === 'number') {
                    this.lastConfidence = data.confidence;
                    return Math.min(100, Math.round(data.confidence * 100));
                } else {
                    console.warn('ML Extension: No confidence in response:', data);
                    return 0;
                }
            } else {
                console.error(`ML Extension: Image confidence failed: ${response.status}`);
                return 0;
            }
        } catch (error) {
            console.error('ML Extension: Error in image confidence:', error);
            return 0;
        }
    }


    async isModelReady() {
        try {
            if (!this.sessionId || !this.projectId) {
                console.warn('ML Extension: Missing session or project ID for model status');
                return false;
            }

            // Make API call to check model status
            const response = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('ML Extension: Model status response:', data);
                
                if (data.success && data.data) {
                    // Check if model is trained and ready - return only true/false
                    const hasModel = data.data.model && data.data.model.filename;
                    const isTrained = data.data.model && data.data.model.status === 'trained';
                    const isReady = hasModel && isTrained;
                    console.log('ML Extension: Model ready status:', isReady, 'hasModel:', hasModel, 'isTrained:', isTrained);
                    return isReady;
                }
            } else {
                console.error(`ML Extension: Failed to check model status: ${response.status}`);
            }

            return false;
        } catch (error) {
            console.error('ML Extension: Error checking model status:', error);
            return false;
        }
    }

    // Text recognition methods (existing)
    async recogniseTextLabel(args) {
        const text = args.TEXT;
        console.log(`ML Extension: recogniseTextLabel called with text: "${text}"`);
        
        if (!this.sessionId || !this.projectId) {
            console.warn('ML Extension: Missing session or project ID for prediction');
            return 'Error: No project loaded';
        }
        
        try {
            console.log(`ML Extension: Making prediction API call to: /api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`);
            
            // Make API call to get prediction using the correct endpoint
            const response = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('ML Extension: Prediction response:', data);
                
                if (data.success && data.label) {
                    // Store the last prediction
                    this.lastPrediction = data.label;
                    return data.label;
                } else {
                    console.warn('ML Extension: No label in response:', data);
                    this.lastPrediction = 'Unknown';
                    return 'Unknown';
                }
            } else {
                console.error('ML Extension: Prediction failed:', response.status);
                this.lastPrediction = 'Error: Prediction failed';
                return 'Error: Prediction failed';
            }
        } catch (error) {
            console.error('ML Extension: Error in prediction:', error);
            return 'Error: Network error';
        }
    }

    async recogniseTextConfidence(args) {
        const text = args.TEXT;
        console.log(`ML Extension: recogniseTextConfidence called with text: "${text}"`);
        
        if (!this.sessionId || !this.projectId) {
            console.warn('ML Extension: Missing session or project ID for prediction');
            return 0;
        }
        
        try {
            console.log(`ML Extension: Making confidence API call to: /api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`);
            
            // Make API call to get confidence
            const response = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('ML Extension: Confidence response:', data);
                
                if (data.success && typeof data.confidence === 'number') {
                    // Store the last confidence
                    this.lastConfidence = data.confidence;
                    return Math.min(100, Math.round(data.confidence * 100));
                } else {
                    console.warn('ML Extension: No confidence in response:', data);
                    return 0;
                }
            } else {
                console.error('ML Extension: Confidence failed:', response.status);
                return 0;
            }
        } catch (error) {
            console.error('ML Extension: Error in confidence:', error);
            return 0;
        }
    }

    // Dynamic label methods
    getLabelValue(labelName) {
        // This method is called for each dynamic label block
        // For now, return the label name as the value
        // In a real implementation, this might return cached prediction results
        return labelName;
    }

    // Teachable Machine methods
    tmRecogniseImageLabel() {
        if (this.tmCurrentPrediction) {
            return this.tmCurrentPrediction.label;
        }
        return 'No prediction';
    }

    tmRecogniseImageConfidence() {
        if (this.tmCurrentPrediction) {
            return Math.min(100, Math.round(this.tmCurrentPrediction.confidence * 100));
        }
        return 0;
    }

    getTmLabelValue(labelName) {
        // Return the confidence for a specific Teachable Machine label
        if (this.tmModelConfidences && this.tmModelConfidences[labelName]) {
            return Math.min(100, Math.round(this.tmModelConfidences[labelName] * 100));
        }
        return 0;
    }

    // Utility methods for global access
    refreshMLExtension() {
        console.log('ML Extension: Manual refresh triggered');
        this.isReady = false;
        this.initialize();
    }

    forceMLExtensionRefresh() {
        console.log('ML Extension: Force refresh triggered - reloading page');
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    }
}

// Create dynamic label methods
ML3Extension.prototype.getLabelValue = function(labelName) {
    return labelName;
};

// Create Teachable Machine label methods
ML3Extension.prototype.getTmLabelValue = function(labelName) {
    if (this.tmModelConfidences && this.tmModelConfidences[labelName]) {
        return Math.min(100, Math.round(this.tmModelConfidences[labelName] * 100));
    }
    return 0;
};

module.exports = ML3Extension;
