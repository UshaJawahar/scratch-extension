const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const config = require('./config');

// Configuration constants
const API_BASE_URL = config.API_BASE_URL;
const IMAGE_QUALITY = 0.8;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const TM_INTERVAL = 33; // 30 FPS for Teachable Machine
const TM_DIMENSIONS = [480, 360];

// Block colors
const IMAGES_COLOR = '#00C851'; // Green
const ML_COLOR = '#1976D2'; // Dark blue

// Preload data before extension initialization
function preloadMLData() {
    if (typeof window === 'undefined') return null;
    
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('sessionId');
        const projectId = urlParams.get('projectId');
        const teachableLink = urlParams.get('teachableLink') || urlParams.get('teachable_link') || urlParams.get('tmLink');
        
        if (sessionId && projectId) {
            console.log('ML Extension: Preloading data for session:', sessionId, 'project:', projectId);
            console.log('ML Extension: Teachable Machine link from URL:', teachableLink);
            
            // Use synchronous XMLHttpRequest to preload data
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `${API_BASE_URL}/api/guests/session/${sessionId}/projects/${projectId}`, false);
            xhr.send();
            
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                if (data.success && data.data) {
                    const projectData = {
                        name: data.data.name || 'Image Recognition',
                        labels: data.data.dataset?.labels || data.data.model?.labels || [],
                        type: data.data.type || 'image-recognition',
                        teachableLink: teachableLink || data.data.teachableLink || null
                    };
                    
                    // Store in localStorage for immediate access
                    window.localStorage.setItem('ml_extension_project_name', projectData.name);
                    window.localStorage.setItem('ml_extension_project_labels', JSON.stringify(projectData.labels));
                    window.localStorage.setItem('ml_extension_project_type', projectData.type);
                    window.localStorage.setItem('neural_playground_session_id', sessionId);
                    window.localStorage.setItem('neural_playground_project_id', projectId);
                    
                    // Store Teachable Machine link if available
                    if (projectData.teachableLink) {
                        window.localStorage.setItem('ml_extension_teachable_link', projectData.teachableLink);
                        console.log('ML Extension: Preloaded Teachable Machine link:', projectData.teachableLink);
                    }
                    
                    console.log('ML Extension: Preloaded data:', projectData);
                    return projectData;
                }
            }
        }
    } catch (error) {
        console.error('ML Extension: Error preloading data:', error);
    }
    
    return null;
}

// Preload data immediately when script loads
const preloadedData = preloadMLData();

class ML3Extension {
    constructor(runtime) {
        this.runtime = runtime;
        console.log('ML Extension: Comprehensive Image Recognition Extension Loaded');
        
        // Core project data - use preloaded data if available
        this.sessionId = null;
        this.projectId = null;
        this.projectName = preloadedData ? preloadedData.name : null;
        this.projectLabels = preloadedData ? preloadedData.labels : [];
        this.projectType = preloadedData ? preloadedData.type : 'image-recognition';
        this.teachableLink = preloadedData ? preloadedData.teachableLink : null;
        this.isReady = preloadedData ? true : false;
        
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
        
        // Pose recognition mode
        this.isPoseRecognitionMode = false;
        this.poseModel = null;
        this.isPoseModelLoaded = false;
        this.poseModelLabels = [];
        this.poseCurrentPrediction = null;
        this.poseModelConfidences = {};
        this.poseKeypoints = null;
        this.poseCanvas = null;
        this.poseCtx = null;
        this.tmIsPredicting = 0;
        this.tmLastUpdate = null;
        this.tmConfidenceThreshold = 0.8;
        this.tmIsDetecting = false;
        this.tmVideoEnabled = false;
        
        
        // Prediction cache
        this.lastPrediction = null;
        this.lastConfidence = null;
        
        // Make extension globally accessible for debugging
        if (typeof window !== 'undefined') {
            window.MLExtension = this;
            window.testImageFromUrl = () => this.imageFromUrl({URL: 'https://picsum.photos/400/300'});
            window.testBackdropImage = () => this.backdropImage();
            window.testPrediction = () => this.recogniseImageLabel({IMAGE: this.imageFromUrl({URL: 'https://picsum.photos/400/300'})});
            window.testBackdropPrediction = () => this.recogniseImageLabel({IMAGE: this.backdropImage()});
            window.testWorkingImageUrls = () => this.getWorkingExampleUrls();
            window.refreshMLExtension = () => this.refreshMLExtension();
            window.forceMLExtensionRefresh = () => this.forceMLExtensionRefresh();
            window.forceMLBlockRefresh = () => this.refreshBlocks();
            console.log('ML Extension: Made globally accessible as window.MLExtension');
            console.log('ML Extension: Use window.refreshMLExtension() to manually refresh blocks');
            console.log('ML Extension: Use window.forceMLExtensionRefresh() to force page reload if needed');
            console.log('ML Extension: Use window.forceMLBlockRefresh() to force block refresh');
            console.log('ML Extension: Use window.testImageFromUrl() to test image URL loading');
            console.log('ML Extension: Use window.testBackdropImage() to test backdrop image capture');
            console.log('ML Extension: Use window.testPrediction() to test full prediction flow');
            console.log('ML Extension: Use window.testBackdropPrediction() to test backdrop prediction flow');
            console.log('ML Extension: Use window.testWorkingImageUrls() to get working example URLs');
            
            // Add user interaction handler to resolve AudioContext warnings
            this.setupUserInteractionHandler();
        }
        
        // Initialize the extension
        this.initialize();
    }

    initialize() {
        console.log('ML Extension: Running synchronous initialization...');
        
        // If we have preloaded data, use it and skip API calls
        if (preloadedData) {
            console.log('ML Extension: Using preloaded data, skipping API calls');
            this.sessionId = window.localStorage.getItem('neural_playground_session_id');
            this.projectId = window.localStorage.getItem('neural_playground_project_id');
            
            // Load Teachable Machine link from localStorage (in case it wasn't in preloadedData)
            if (!this.teachableLink) {
                this.teachableLink = window.localStorage.getItem('ml_extension_teachable_link');
            }
            
            if (this.teachableLink) {
                console.log('ML Extension: Using preloaded Teachable Machine link:', this.teachableLink);
            } else {
                console.log('ML Extension: No Teachable Machine link found in preloaded data or localStorage');
            }
            
            // Set Teachable Machine mode if project type is image-recognition-teachable-machine
            if (this.projectType === 'image-recognition-teachable-machine') {
                console.log('ML Extension: Project type is image-recognition-teachable-machine, setting TM mode');
                this.isTeachableMachineMode = true;
                // Start prediction loop
                this.tmPredictionLoop();
            }
            
            // Set Pose Recognition mode if project type is pose-recognition-teachable-machine
            if (this.projectType === 'pose-recognition-teachable-machine') {
                console.log('ML Extension: Project type is pose-recognition-teachable-machine, setting Pose Recognition mode');
                this.isPoseRecognitionMode = true;
                // Initialize pose recognition
                this.initializePoseRecognition();
            }
            
            
            this.isReady = true;
            console.log(`ML Extension: Ready with preloaded data - Name: ${this.projectName}, Labels: ${this.projectLabels.join(', ')}, Type: ${this.projectType}, TM Link: ${this.teachableLink || 'None'}`);
            this.refreshBlocks();
            return;
        }
        
        // Clear all previous localStorage data on every load
        this.clearAllLocalStorageData();
        
        // Load session and project data from URL parameters first
        this.checkUrlParameters();
        
        // Set up URL change listener
        if (typeof window !== 'undefined') {
            this.setupUrlChangeListener();
        }
        
        // Load project data synchronously to avoid "initializing" state
        this.loadProjectDataSync();
        
        // Initialize Teachable Machine if needed
        this.initializeTeachableMachineSync();
        
        // Load Teachable Machine link from localStorage
        this.teachableLink = window.localStorage.getItem('ml_extension_teachable_link');
        if (this.teachableLink) {
            console.log('ML Extension: Found Teachable Machine link in localStorage:', this.teachableLink);
        }
        
        // If we still don't have data, try to load from localStorage as fallback
        if (!this.projectName || this.projectName === 'ML Extension') {
            this.loadFromLocalStorage();
        }
        
        // Check if project type is image-recognition-teachable-machine and initialize TM
        if (this.projectType === 'image-recognition-teachable-machine') {
            console.log('ML Extension: Project type is image-recognition-teachable-machine, initializing Teachable Machine');
            this.isTeachableMachineMode = true;
            // Start prediction loop
            this.tmPredictionLoop();
        }
        
        // Check if project type is pose-recognition-teachable-machine and initialize Pose Recognition
        if (this.projectType === 'pose-recognition-teachable-machine') {
            console.log('ML Extension: Project type is pose-recognition-teachable-machine, initializing Pose Recognition');
            this.isPoseRecognitionMode = true;
            // Initialize pose recognition
            this.initializePoseRecognition();
        }
        
        // Mark as ready immediately after synchronous data loading
        this.isReady = true;
        console.log('ML Extension: Synchronous initialization complete with fresh data');
        console.log(`ML Extension: Ready with project - Name: ${this.projectName}, Labels: ${this.projectLabels.join(', ')}, Type: ${this.projectType}`);
        
        // Trigger extension refresh with fresh data
        this.refreshBlocks();
    }

    clearAllLocalStorageData() {
        if (typeof window === 'undefined' || !window.localStorage) return;
        
        console.log('ML Extension: Clearing all previous localStorage data...');
        
        // Clear all ML extension related localStorage data
        const keysToRemove = [
            'ml_extension_session_id',
            'ml_extension_project_id',
            'ml_extension_project_name',
            'ml_extension_project_labels',
            'ml_extension_project_type',
            'ml_extension_teachable_link',
            'neural_playground_session_id',
            'neural_playground_project_id',
            'neural_playground_project_name',
            'neural_playground_project_labels',
            'neural_playground_project_type'
        ];
        
        keysToRemove.forEach(key => {
            if (window.localStorage.getItem(key)) {
                window.localStorage.removeItem(key);
                console.log(`ML Extension: Removed ${key} from localStorage`);
            }
        });
        
        console.log('ML Extension: All previous localStorage data cleared');
    }
    
    // Cleanup method to remove event listeners and canvas
    cleanup() {
        try {
            // Remove resize listener
            if (this.poseCanvasResizeHandler) {
                window.removeEventListener('resize', this.poseCanvasResizeHandler);
                this.poseCanvasResizeHandler = null;
            }
            
            // Remove pose canvas from DOM
            if (this.poseCanvas && this.poseCanvas.parentNode) {
                this.poseCanvas.parentNode.removeChild(this.poseCanvas);
                this.poseCanvas = null;
                this.poseCtx = null;
            }
            
            console.log('ML Extension: Cleanup completed');
        } catch (error) {
            console.error('ML Extension: Error during cleanup:', error);
        }
    }

    setupUserInteractionHandler() {
        if (typeof window === 'undefined') return;
        
        // Add a one-time click handler to resolve AudioContext warnings
        const handleUserInteraction = () => {
            // Resume any suspended AudioContext instances
            if (window.AudioContext || window.webkitAudioContext) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                // This will help resolve AudioContext warnings from other extensions
                try {
                    const tempContext = new AudioContextClass();
                    if (tempContext.state === 'suspended') {
                        tempContext.resume();
                    }
                    tempContext.close();
                } catch (error) {
                    // Ignore errors - this is just to help with warnings
                }
            }
            
            // Remove the event listeners after first interaction
            document.removeEventListener('click', handleUserInteraction);
            document.removeEventListener('touchstart', handleUserInteraction);
            document.removeEventListener('keydown', handleUserInteraction);
        };
        
        // Add event listeners for user interaction
        document.addEventListener('click', handleUserInteraction, { once: true });
        document.addEventListener('touchstart', handleUserInteraction, { once: true });
        document.addEventListener('keydown', handleUserInteraction, { once: true });
    }

    loadCachedProjectData() {
        if (typeof window === 'undefined') return;
        
        // Load cached project data from localStorage
        const cachedName = window.localStorage.getItem('ml_extension_project_name');
        const cachedLabels = window.localStorage.getItem('ml_extension_project_labels');
        const cachedType = window.localStorage.getItem('ml_extension_project_type');
        
        if (cachedName) {
            this.projectName = cachedName;
        }
        
        if (cachedLabels) {
            try {
                this.projectLabels = JSON.parse(cachedLabels);
            } catch (error) {
                console.warn('ML Extension: Could not parse cached labels:', error);
                this.projectLabels = [];
            }
        }
        
        if (cachedType) {
            this.projectType = cachedType;
        }
        
        console.log(`ML Extension: Loaded cached data - Name: ${this.projectName}, Labels: ${this.projectLabels.join(', ')}, Type: ${this.projectType}`);
    }

    refreshBlocks() {
        // Only refresh if we haven't already refreshed recently
        if (this._lastRefresh && Date.now() - this._lastRefresh < 1000) {
            console.log('ML Extension: Skipping refresh - too soon');
            return;
        }
        
        this._lastRefresh = Date.now();
        
        // Force extension refresh by triggering a VM update
        if (typeof window !== 'undefined' && window.vm) {
            try {
                // Force refresh the extension blocks
                window.vm.extensionManager.refreshExtension('ml');
                console.log('ML Extension: Blocks refreshed successfully');
                
                // Also try to emit the extension added event
                if (window.vm.emit) {
                    window.vm.emit('EXTENSION_ADDED', 'ml');
                    console.log('ML Extension: Emitted EXTENSION_ADDED event');
                }
            } catch (error) {
                console.warn('ML Extension: Could not refresh blocks automatically:', error);
            }
        }
        
        // Also try the runtime emit if available
        if (this.runtime && this.runtime.emit) {
            try {
                this.runtime.emit('EXTENSION_ADDED', 'ml');
                console.log('ML Extension: Emitted EXTENSION_ADDED via runtime');
            } catch (error) {
                console.warn('ML Extension: Could not emit via runtime:', error);
            }
        }
    }

    checkUrlParameters() {
        if (typeof window === 'undefined') return;
        
        const urlParams = new URLSearchParams(window.location.search);
        const sessionParam = urlParams.get('sessionId');
        const projectParam = urlParams.get('projectId');
        
        if (sessionParam && projectParam) {
            console.log(`ML Extension: Found URL params - Session: ${sessionParam}, Project: ${projectParam}`);
            
            // Always clear localStorage and use fresh URL parameters
            this.clearAllLocalStorageData();
            
            // Store new data in localStorage
            window.localStorage.setItem('neural_playground_session_id', sessionParam);
            window.localStorage.setItem('neural_playground_project_id', projectParam);
            
            // Update instance variables
            this.sessionId = sessionParam;
            this.projectId = projectParam;
            
            console.log('ML Extension: Updated with fresh URL parameters');
        } else {
            console.log('ML Extension: No URL parameters found, will use fresh API data');
        }
    }

    setupUrlChangeListener() {
        if (typeof window === 'undefined') return;
        
        // Listen for URL changes (for SPA navigation)
        window.addEventListener('popstate', () => {
            setTimeout(() => this.checkUrlParameters(), 100);
        });
        
        // Check less frequently to avoid constant clearing
        setInterval(() => {
            this.checkUrlParameters();
        }, 10000); // Changed from 2000ms to 10000ms (10 seconds)
        
        console.log('ML Extension: URL change listener setup complete');
    }

    loadProjectDataSync() {
        if (!this.sessionId || !this.projectId) {
            console.log('ML Extension: No session or project ID available, using defaults');
            this.projectName = 'ML Extension';
            this.projectLabels = [];
            this.projectType = 'image-recognition';
            return;
        }
        
        try {
            console.log(`ML Extension: Loading project data synchronously for session ${this.sessionId}, project ${this.projectId}`);
            
            // Use XMLHttpRequest for synchronous loading
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}`, false); // false = synchronous
            xhr.send();
            
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                console.log('ML Extension: Fresh project data loaded from API:', data);
                
                if (data.success && data.data) {
                    this.projectName = data.data.name || 'Image Recognition';
                    this.projectLabels = data.data.dataset?.labels || data.data.model?.labels || [];
                    this.projectType = data.data.type || 'image-recognition';
                    
                    console.log(`ML Extension: Fresh project data - Name: ${this.projectName}, Labels: ${this.projectLabels.join(', ')}, Type: ${this.projectType}`);
                    
                    // Always update localStorage with fresh data
                    if (typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.setItem('ml_extension_project_name', this.projectName);
                        window.localStorage.setItem('ml_extension_project_labels', JSON.stringify(this.projectLabels));
                        window.localStorage.setItem('ml_extension_project_type', this.projectType);
                        window.localStorage.setItem('neural_playground_session_id', this.sessionId);
                        window.localStorage.setItem('neural_playground_project_id', this.projectId);
                        console.log('ML Extension: Updated localStorage with fresh API data');
                    }
                } else {
                    console.warn('ML Extension: Invalid project data response:', data);
                    this.projectName = 'ML Extension';
                    this.projectLabels = [];
                    this.projectType = 'image-recognition';
                }
            } else {
                console.error(`ML Extension: Failed to load project data: ${xhr.status}`);
                this.projectName = 'ML Extension';
                this.projectLabels = [];
                this.projectType = 'image-recognition';
            }
        } catch (error) {
            console.error('ML Extension: Error loading project data:', error);
            this.projectName = 'ML Extension';
            this.projectLabels = [];
            this.projectType = 'image-recognition';
        }
        
        // Always ensure we have some default data
        if (!this.projectName) {
            this.projectName = 'ML Extension';
        }
        if (!Array.isArray(this.projectLabels)) {
            this.projectLabels = [];
        }
        if (!this.projectType) {
            this.projectType = 'image-recognition';
        }
    }

    async loadProjectData() {
        if (!this.sessionId || !this.projectId) {
            console.log('ML Extension: No session or project ID available');
            return;
        }
        
        try {
            console.log(`ML Extension: Loading fresh project data for session ${this.sessionId}, project ${this.projectId}`);
            
            // Always fetch fresh data from API
            const response = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('ML Extension: Fresh project data loaded from API:', data);
                
                if (data.success && data.data) {
                    this.projectName = data.data.name || 'Image Recognition';
                    this.projectLabels = data.data.dataset?.labels || data.data.model?.labels || [];
                    this.projectType = data.data.type || 'image-recognition';
                    
                    console.log(`ML Extension: Fresh project data - Name: ${this.projectName}, Labels: ${this.projectLabels.join(', ')}, Type: ${this.projectType}`);
                    
                    // Always update localStorage with fresh data
                    if (typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.setItem('ml_extension_project_name', this.projectName);
                        window.localStorage.setItem('ml_extension_project_labels', JSON.stringify(this.projectLabels));
                        window.localStorage.setItem('ml_extension_project_type', this.projectType);
                        window.localStorage.setItem('neural_playground_session_id', this.sessionId);
                        window.localStorage.setItem('neural_playground_project_id', this.projectId);
                        console.log('ML Extension: Updated localStorage with fresh API data');
                    }
                } else {
                    console.warn('ML Extension: Invalid project data response:', data);
                    this.projectName = 'ML Extension';
                    this.projectLabels = [];
                    this.projectType = 'image-recognition';
                }
            } else {
                console.error(`ML Extension: Failed to load project data: ${response.status}`);
                this.projectName = 'ML Extension';
                this.projectLabels = [];
                this.projectType = 'image-recognition';
            }
        } catch (error) {
            console.error('ML Extension: Error loading project data:', error);
            this.projectName = 'ML Extension';
            this.projectLabels = [];
            this.projectType = 'image-recognition';
        }
        
        // Always ensure we have some default data
        if (!this.projectName) {
            this.projectName = 'ML Extension';
        }
        if (!Array.isArray(this.projectLabels)) {
            this.projectLabels = [];
        }
        if (!this.projectType) {
            this.projectType = 'image-recognition';
        }
    }

    initializeTeachableMachineSync() {
        if (typeof window === 'undefined') return;
        
        try {
            const storedLink = window.localStorage.getItem('ml_extension_teachable_link');
            if (storedLink) {
                this.teachableLink = storedLink;
                this.isTeachableMachineMode = true;
                console.log('ML Extension: Found stored Teachable Machine link:', this.teachableLink);
                // Note: Model loading will be done asynchronously when needed
            } else {
                console.log('ML Extension: No Teachable Machine link found in localStorage');
            }
        } catch (error) {
            console.error('ML Extension: Error initializing Teachable Machine:', error);
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
            // Skip Teachable Machine if package is not available
            console.warn('ML Extension: Teachable Machine package not available - skipping TM mode');
            return;
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
        console.log('ML Extension: Current projectType:', this.projectType);
        console.log('ML Extension: isReady:', this.isReady);
        console.log('ML Extension: isTeachableMachineMode:', this.isTeachableMachineMode);
        
        // Prevent duplicate block definitions by checking if already defined
        if (this._blocksDefined) {
            console.log('ML Extension: Blocks already defined, returning cached info');
            return this._cachedInfo;
        }
        
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
        
        // Check if we're in Pose Recognition mode
        if (this.isPoseRecognitionMode || this.projectType === 'pose-recognition-teachable-machine') {
            console.log('ML Extension: Returning Pose Recognition blocks for project type:', this.projectType);
            return this.getPoseRecognitionInfo();
        }
        
        // Check if we're in Teachable Machine mode or if project type is image-recognition-teachable-machine
        if (this.isTeachableMachineMode || this.projectType === 'image-recognition-teachable-machine') {
            console.log('ML Extension: Returning Teachable Machine blocks for project type:', this.projectType);
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
                    text: cleanLabel // Use direct text instead of formatMessage for dynamic labels
                };
            });
        
        // Create label menu items for training blocks
        const labelMenuItems = labels
            .filter(label => label && typeof label === 'string' && label.trim().length > 0)
            .map(label => {
                const cleanLabel = label.trim();
                return { text: cleanLabel, value: cleanLabel };
            });
        
        // Ensure we always have at least one valid menu item
        if (labelMenuItems.length === 0) {
            labelMenuItems.push({ text: 'No labels available', value: 'no_labels' });
        }
        
        // Validate menu items format
        const validLabelMenuItems = labelMenuItems.filter(item => {
            if (typeof item !== 'object' || !item.text || !item.value) {
                console.warn('ML Extension: Invalid menu item format:', item);
                return false;
            }
            if (typeof item.text !== 'string' || typeof item.value !== 'string') {
                console.warn('ML Extension: Menu item values must be strings:', item);
                return false;
            }
            return true;
        });
        
        // Ensure we always have at least one valid menu item
        if (validLabelMenuItems.length === 0) {
            validLabelMenuItems.push({ text: 'No labels available', value: 'no_labels' });
        }
        
        // Get default label for training block
        const defaultLabel = validLabelMenuItems.length > 0 ? validLabelMenuItems[0].value : 'no_labels';
        
        // Define image-related blocks
        const imageBlocks = [
            // Images Category (Green blocks)
            {
                opcode: 'imageFromUrl',
                blockType: BlockType.REPORTER,
                text: 'image from URL [URL]',
                arguments: {
                    URL: {
                        type: ArgumentType.STRING,
                        defaultValue: 'https://example.com/image.jpg'
                    }
                }
            },
            {
                opcode: 'backdropImage',
                blockType: BlockType.REPORTER,
                text: 'backdrop image'
            },
            {
                opcode: 'saveScreenshotToCostume',
                blockType: BlockType.COMMAND,
                text: 'save screenshot to costume'
            },
            {
                opcode: 'webcamImage',
                blockType: BlockType.REPORTER,
                text: 'webcam image'
            },
            
            // Image Recognition blocks
            {
                opcode: 'recogniseImageLabel',
                blockType: BlockType.REPORTER,
                text: 'recognise image [IMAGE] (label)',
                arguments: {
                    IMAGE: {
                        type: ArgumentType.STRING,
                        defaultValue: 'image'
                    }
                }
            },
            {
                opcode: 'recogniseImageConfidence',
                blockType: BlockType.REPORTER,
                text: 'recognise image [IMAGE] (confidence)',
                arguments: {
                    IMAGE: {
                        type: ArgumentType.STRING,
                        defaultValue: 'image'
                    }
                }
            }
        ];

        // Define text-related blocks
        const textBlocks = [
            // Text Classification blocks
            {
                opcode: 'recogniseTextLabel',
                blockType: BlockType.REPORTER,
                text: 'recognise text [TEXT] (label)',
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
                text: 'recognise text [TEXT] (confidence)',
                arguments: {
                    TEXT: {
                        type: ArgumentType.STRING,
                        defaultValue: 'text'
                    }
                }
            }
        ];

        // Common blocks (always shown)
        const commonBlocks = [
            {
                opcode: 'isModelReady',
                blockType: BlockType.BOOLEAN,
                text: 'is the machine learning model ready'
            }
        ];

        // Select blocks based on project type
        let selectedBlocks = [];
        if (this.projectType === 'image-recognition') {
            selectedBlocks = [...imageBlocks, ...commonBlocks, ...dynamicLabelBlocks];
            console.log('ML Extension: Selected image-recognition blocks');
        } else if (this.projectType === 'text-recognition') {
            selectedBlocks = [...textBlocks, ...commonBlocks, ...dynamicLabelBlocks];
            console.log('ML Extension: Selected text-recognition blocks');
        } else {
            // Default to image-recognition if type is unknown
            selectedBlocks = [...imageBlocks, ...commonBlocks, ...dynamicLabelBlocks];
            console.log('ML Extension: Selected default (image-recognition) blocks for unknown type:', this.projectType);
        }

        const allBlocks = selectedBlocks;
        
        console.log(`ML Extension: Project: ${this.projectName}, Type: ${this.projectType}, Labels: ${labels.join(', ')}, Total blocks: ${allBlocks.length}`);
        console.log(`ML Extension: Label menu items:`, validLabelMenuItems);
        console.log(`ML Extension: Label menu items length:`, validLabelMenuItems.length);
        console.log(`ML Extension: Dynamic label blocks:`, dynamicLabelBlocks.length);
        
        return {
            id: 'ml',
            name: this.projectName || 'ML Extension',
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
                    'ml.imageFromUrl': 'image from URL [URL]',
                    'ml.backdropImage': 'backdrop image',
                    'ml.saveScreenshotToCostume': 'save screenshot to costume',
                    'ml.webcamImage': 'webcam image',
                    'ml.recogniseImageLabel': 'recognise image [IMAGE] (label)',
                    'ml.recogniseImageConfidence': 'recognise image [IMAGE] (confidence)',
                    'ml.isModelReady': 'is the machine learning model ready',
                    'ml.recogniseTextLabel': 'recognise text [TEXT] (label)',
                    'ml.recogniseTextConfidence': 'recognise text [TEXT] (confidence)',
                }
            }
        };
        
        // Cache the result to prevent duplicate block definitions
        this._blocksDefined = true;
        this._cachedInfo = {
            id: 'ml',
            name: this.projectName || 'ML Extension',
            color1: ML_COLOR,
            color2: ML_COLOR,
            customFieldTypes: {},
            blocks: [
                // Image capture blocks
                { opcode: 'imageFromUrl', blockType: BlockType.REPORTER, text: 'image from URL [URL]', arguments: { URL: { type: ArgumentType.STRING, defaultValue: 'https://example.com/image.jpg' } } },
                { opcode: 'backdropImage', blockType: BlockType.REPORTER, text: 'backdrop image' },
                { opcode: 'saveScreenshotToCostume', blockType: BlockType.COMMAND, text: 'save screenshot to costume' },
                { opcode: 'webcamImage', blockType: BlockType.REPORTER, text: 'webcam image' },
                
                // ML prediction blocks
                { opcode: 'recogniseImageLabel', blockType: BlockType.REPORTER, text: 'recognise image [IMAGE] (label)', arguments: { IMAGE: { type: ArgumentType.STRING, defaultValue: 'image from URL' } } },
                { opcode: 'recogniseImageConfidence', blockType: BlockType.REPORTER, text: 'recognise image [IMAGE] (confidence)', arguments: { IMAGE: { type: ArgumentType.STRING, defaultValue: 'image from URL' } } },
                { opcode: 'isModelReady', blockType: BlockType.BOOLEAN, text: 'is the machine learning model ready' },
                
                // Text recognition blocks
                { opcode: 'recogniseTextLabel', blockType: BlockType.REPORTER, text: 'recognise text [TEXT] (label)', arguments: { TEXT: { type: ArgumentType.STRING, defaultValue: 'Hello' } } },
                { opcode: 'recogniseTextConfidence', blockType: BlockType.REPORTER, text: 'recognise text [TEXT] (confidence)', arguments: { TEXT: { type: ArgumentType.STRING, defaultValue: 'Hello' } } },
                
                // Dynamic label blocks
                ...dynamicLabelBlocks,
                
                // Training blocks
                { opcode: 'trainImage', blockType: BlockType.COMMAND, text: 'train image [IMAGE] as [LABEL]', arguments: { IMAGE: { type: ArgumentType.STRING, defaultValue: 'image from URL' }, LABEL: { type: ArgumentType.STRING, menu: 'ml_labels', defaultValue: labels[0] || 'label1' } } },
                { opcode: 'trainText', blockType: BlockType.COMMAND, text: 'train text [TEXT] as [LABEL]', arguments: { TEXT: { type: ArgumentType.STRING, defaultValue: 'Hello' }, LABEL: { type: ArgumentType.STRING, menu: 'ml_labels', defaultValue: labels[0] || 'label1' } } },
                { opcode: 'clearTrainingData', blockType: BlockType.COMMAND, text: 'clear all training data' },
                { opcode: 'saveModel', blockType: BlockType.COMMAND, text: 'save model' },
                { opcode: 'loadModel', blockType: BlockType.COMMAND, text: 'load model' }
            ],
            menus: {
                ml_labels: {
                    acceptReporters: false,
                    items: labelMenuItems.length > 0 ? labelMenuItems : [['No labels available', 'no_labels']]
                }
            },
            translation_map: {
                'en': {
                    'ml.imageFromUrl': 'image from URL [URL]',
                    'ml.backdropImage': 'backdrop image',
                    'ml.saveScreenshotToCostume': 'save screenshot to costume',
                    'ml.webcamImage': 'webcam image',
                    'ml.recogniseImageLabel': 'recognise image [IMAGE] (label)',
                    'ml.recogniseImageConfidence': 'recognise image [IMAGE] (confidence)',
                    'ml.isModelReady': 'is the machine learning model ready',
                    'ml.recogniseTextLabel': 'recognise text [TEXT] (label)',
                    'ml.recogniseTextConfidence': 'recognise text [TEXT] (confidence)',
                }
            }
        };
        
        return this._cachedInfo;
    }

    getTeachableMachineInfo() {
        console.log('ML Extension: Creating Teachable Machine blocks for project type:', this.projectType);
        
        // Cache Teachable Machine info to prevent duplicate definitions
        if (this._tmBlocksDefined) {
            console.log('ML Extension: TM blocks already defined, returning cached info');
            return this._cachedTmInfo;
        }
        
        // Base blocks for all Teachable Machine modes
        const baseBlocks = [
            {
                opcode: 'tm_useModel',
                blockType: BlockType.COMMAND,
                text: 'use model [url]',
                arguments: {
                    url: {
                        type: ArgumentType.STRING,
                        defaultValue: 'Auto-Detected from URL'
                    }
                }
            },
            {
                opcode: 'tm_whenModelDetects',
                blockType: BlockType.HAT,
                text: 'when model detects [label]',
                arguments: {
                    label: {
                        type: ArgumentType.STRING,
                        menu: 'tm_labels',
                        defaultValue: 'class1'
                    }
                }
            },
            {
                opcode: 'tm_modelPrediction',
                blockType: BlockType.REPORTER,
                text: 'model prediction'
            },
            {
                opcode: 'tm_predictionIs',
                blockType: BlockType.BOOLEAN,
                text: 'prediction is [label]',
                arguments: {
                    label: {
                        type: ArgumentType.STRING,
                        menu: 'tm_labels',
                        defaultValue: 'class1'
                    }
                }
            },
            {
                opcode: 'tm_confidenceFor',
                blockType: BlockType.REPORTER,
                text: 'confidence for [label]',
                arguments: {
                    label: {
                        type: ArgumentType.STRING,
                        menu: 'tm_labels',
                        defaultValue: 'class1'
                    }
                }
            },
            {
                opcode: 'tm_turnVideo',
                blockType: BlockType.COMMAND,
                text: 'turn video [state]',
                arguments: {
                    state: {
                        type: ArgumentType.STRING,
                        menu: 'tm_videoState',
                        defaultValue: 'on'
                    }
                }
            },
            {
                opcode: 'tm_setVideoTransparency',
                blockType: BlockType.COMMAND,
                text: 'set video transparency to [value]',
                arguments: {
                    value: {
                        type: ArgumentType.NUMBER,
                        defaultValue: 50
                    }
                }
            }
        ];


        // Use base blocks only
        const allBlocks = baseBlocks;
        
        const tmInfo = {
            id: 'ml',
            name: this.projectName || 'Teachable Machine',
            color1: '#800080', // Purple for image recognition
            color2: '#800080',
            customFieldTypes: {},
            blocks: allBlocks,
            menus: {
                tm_labels: {
                    acceptReporters: false,
                    items: () => {
                        // Return labels from API only
                        if (this.tmModelLabels && Array.isArray(this.tmModelLabels) && this.tmModelLabels.length > 0) {
                            // Filter out any invalid labels and ensure they're strings
                            const validLabels = this.tmModelLabels.filter(label => 
                                label && typeof label === 'string' && label.trim().length > 0
                            );
                            
                            if (validLabels.length > 0) {
                                // Return labels in the format that Scratch expects
                                // Each item should be [displayText, value] pair
                                const menuItems = validLabels.map(label => [label, label]);
                                return menuItems;
                            }
                        }
                        
                        // Return a single placeholder item to prevent Blockly crash
                        return [['Loading...', 'loading']];
                    }
                },
                tm_videoState: {
                    acceptReporters: false,
                    items: ['on', 'off']
                }
            }
        };
        
        // Cache the Teachable Machine info
        this._tmBlocksDefined = true;
        this._cachedTmInfo = tmInfo;
        
        return tmInfo;
    }

    getPoseRecognitionInfo() {
        console.log('ML Extension: Creating Pose Recognition blocks for project type:', this.projectType);
        
        // Cache Pose Recognition info to prevent duplicate definitions
        if (this._poseBlocksDefined) {
            console.log('ML Extension: Pose blocks already defined, returning cached info');
            return this._cachedPoseInfo;
        }
        
        // Pose Recognition blocks (similar to Teachable Machine but for pose)
        const poseBlocks = [
            {
                opcode: 'pose_useModel',
                blockType: BlockType.COMMAND,
                text: 'use model [url]',
                arguments: {
                    url: {
                        type: ArgumentType.STRING,
                        defaultValue: 'Auto-Detected from URL'
                    }
                }
            },
            {
                opcode: 'pose_whenModelDetects',
                blockType: BlockType.HAT,
                text: 'when model detects [label]',
                arguments: {
                    label: {
                        type: ArgumentType.STRING,
                        menu: 'pose_labels',
                        defaultValue: 'class1'
                    }
                }
            },
            {
                opcode: 'pose_modelPrediction',
                blockType: BlockType.REPORTER,
                text: 'model prediction'
            },
            {
                opcode: 'pose_predictionIs',
                blockType: BlockType.BOOLEAN,
                text: 'prediction is [label]',
                arguments: {
                    label: {
                        type: ArgumentType.STRING,
                        menu: 'pose_labels',
                        defaultValue: 'class1'
                    }
                }
            },
            {
                opcode: 'pose_confidenceFor',
                blockType: BlockType.REPORTER,
                text: 'confidence for [label]',
                arguments: {
                    label: {
                        type: ArgumentType.STRING,
                        menu: 'pose_labels',
                        defaultValue: 'class1'
                    }
                }
            },
            {
                opcode: 'pose_turnVideo',
                blockType: BlockType.COMMAND,
                text: 'turn video [state]',
                arguments: {
                    state: {
                        type: ArgumentType.STRING,
                        menu: 'pose_videoState',
                        defaultValue: 'on'
                    }
                }
            },
            {
                opcode: 'pose_setVideoTransparency',
                blockType: BlockType.COMMAND,
                text: 'set video transparency to [value]',
                arguments: {
                    value: {
                        type: ArgumentType.NUMBER,
                        defaultValue: 50
                    }
                }
            }
        ];
        
        const poseInfo = {
            id: 'ml',
            name: this.projectName || 'Mood calculator',
            color1: '#800080', // Purple for pose recognition
            color2: '#800080',
            customFieldTypes: {},
            blocks: poseBlocks,
            menus: {
                pose_labels: {
                    acceptReporters: false,
                    items: () => {
                        // Return labels from API only
                        if (this.poseModelLabels && Array.isArray(this.poseModelLabels) && this.poseModelLabels.length > 0) {
                            // Filter out any invalid labels and ensure they're strings
                            const validLabels = this.poseModelLabels.filter(label => 
                                label && typeof label === 'string' && label.trim().length > 0
                            );
                            
                            if (validLabels.length > 0) {
                                // Return labels in the format that Scratch expects
                                // Each item should be [displayText, value] pair
                                const menuItems = validLabels.map(label => [label, label]);
                                return menuItems;
                            }
                        }
                        
                        // Return a single placeholder item to prevent Blockly crash
                        return [['Loading...', 'loading']];
                    }
                },
                pose_videoState: {
                    acceptReporters: false,
                    items: ['on', 'off']
                }
            }
        };
        
        // Cache the Pose Recognition info
        this._poseBlocksDefined = true;
        this._cachedPoseInfo = poseInfo;
        
        return poseInfo;
    }

    // Image capture methods
    // Note: CORS (Cross-Origin Resource Sharing) restrictions may prevent loading images from external domains.
    // This method implements multiple fallback strategies to handle CORS issues.
    async imageFromUrl(args) {
        try {
            const imageUrl = args.URL;
            console.log('ML Extension: imageFromUrl called with URL:', imageUrl);
            
            if (!imageUrl || typeof imageUrl !== 'string') {
                console.warn('ML Extension: Invalid or missing image URL');
                return null;
            }

            // Validate URL format
            try {
                new URL(imageUrl);
            } catch (error) {
                console.warn('ML Extension: Invalid URL format:', imageUrl);
                return null;
            }

            // Try multiple methods to load the image
            return await this.loadImageWithFallbacks(imageUrl);
        } catch (error) {
            console.error('ML Extension: Error in imageFromUrl:', error);
                return null;
        }
    }

    async loadImageWithFallbacks(imageUrl) {
        // Method 1: Try direct loading first (for CORS-enabled images)
        try {
            console.log('ML Extension: Trying direct image loading...');
            return await this.loadImageFromUrl(imageUrl);
        } catch (error) {
            console.log('ML Extension: Direct loading failed, trying URL conversion...');
        }

        // Method 2: Try to convert various URL patterns to direct image URLs
        try {
            const convertedUrl = this.convertImageUrl(imageUrl);
            if (convertedUrl !== imageUrl) {
                console.log('ML Extension: Trying converted URL:', convertedUrl);
                return await this.loadImageFromUrl(convertedUrl);
            }
        } catch (error) {
            console.log('ML Extension: URL conversion failed, trying CORS proxies...');
        }

        // Method 3: Try with multiple CORS proxies
        const corsProxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`,
            `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`,
            `https://thingproxy.freeboard.io/fetch/${imageUrl}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(imageUrl)}`,
            `https://cors-anywhere.herokuapp.com/${imageUrl}`
        ];

        for (let i = 0; i < corsProxies.length; i++) {
            try {
                console.log(`ML Extension: Trying CORS proxy ${i + 1}/${corsProxies.length}...`);
                return await this.loadImageFromUrl(corsProxies[i]);
            } catch (error) {
                console.log(`ML Extension: CORS proxy ${i + 1} failed, trying next...`);
            }
        }

        // Method 4: Try direct fetch with no-cors mode
        try {
            console.log('ML Extension: Trying direct fetch with no-cors...');
            return await this.loadImageWithFetch(imageUrl);
        } catch (error) {
            console.log('ML Extension: Direct fetch failed, trying server-side proxy...');
        }

        // Method 5: Try server-side proxy (if available)
        try {
            console.log('ML Extension: Trying server-side proxy...');
            return await this.loadImageWithServerProxy(imageUrl);
        } catch (error) {
            console.log('ML Extension: Server proxy failed, trying base64 conversion...');
        }

        // Method 6: Try to convert to base64 using a different approach
        try {
            console.log('ML Extension: Trying base64 conversion...');
            return await this.loadImageWithBase64Conversion(imageUrl);
        } catch (error) {
            console.log('ML Extension: Base64 conversion failed...');
        }

        // All methods failed
        console.error('ML Extension: All image loading methods failed');
        const exampleUrls = this.getWorkingExampleUrls();
        throw new Error(`Unable to load image from URL due to CORS restrictions. Please try:\n1. Using a different image URL\n2. Using a CORS-enabled image hosting service (like imgur.com, unsplash.com, or pixabay.com)\n3. Right-clicking the image and copying the direct image URL\n4. Using a different image source\n\nWorking example URLs you can try:\n${exampleUrls.join('\n')}`);
    }

    convertImageUrl(imageUrl) {
        try {
            const url = new URL(imageUrl);
            
            // Google Images URL conversion
            if (url.hostname.includes('google') && url.pathname.includes('/imgres')) {
                const imgUrl = url.searchParams.get('imgurl');
                if (imgUrl) {
                    console.log('ML Extension: Converted Google Images URL:', imgUrl);
                    return imgUrl;
                }
            }
            
            // Google Images direct URLs
            if (url.hostname.includes('googleusercontent.com') || url.hostname.includes('googleapis.com')) {
                return imageUrl;
            }
            
            // Pinterest URL conversion
            if (url.hostname.includes('pinterest.com') || url.hostname.includes('pinimg.com')) {
                // Convert Pinterest URLs to direct image URLs
                if (url.pathname.includes('/originals/')) {
                    return imageUrl;
                }
                // Try to convert to original size
                const originalUrl = imageUrl.replace(/\/\d+x\//, '/originals/');
                if (originalUrl !== imageUrl) {
                    console.log('ML Extension: Converted Pinterest URL to original:', originalUrl);
                    return originalUrl;
                }
            }
            
            // Instagram URL conversion
            if (url.hostname.includes('instagram.com')) {
                // Instagram URLs are usually not direct image URLs, but we can try
                return imageUrl;
            }
            
            // Facebook URL conversion
            if (url.hostname.includes('facebook.com') || url.hostname.includes('fbcdn.net')) {
                // Try to get the direct image URL
                const directUrl = imageUrl.replace(/&amp;/g, '&');
                if (directUrl !== imageUrl) {
                    console.log('ML Extension: Converted Facebook URL:', directUrl);
                    return directUrl;
                }
            }
            
            // Remove common tracking parameters that might cause issues
            const cleanUrl = this.removeTrackingParameters(imageUrl);
            if (cleanUrl !== imageUrl) {
                console.log('ML Extension: Cleaned URL:', cleanUrl);
                return cleanUrl;
            }
            
            return imageUrl;
        } catch (error) {
            console.log('ML Extension: Error converting image URL:', error);
            return imageUrl;
        }
    }

    removeTrackingParameters(url) {
        try {
            const urlObj = new URL(url);
            const trackingParams = [
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                'fbclid', 'gclid', 'ref', 'source', 'campaign', 'medium',
                'tracking', 'track', 'click', 'affiliate', 'partner'
            ];
            
            trackingParams.forEach(param => {
                urlObj.searchParams.delete(param);
            });
            
            return urlObj.toString();
                } catch (error) {
            return url;
        }
    }

    getWorkingExampleUrls() {
        return [
            'https://picsum.photos/400/300',
            'https://picsum.photos/800/600',
            'https://via.placeholder.com/400x300/0000FF/FFFFFF?text=Test+Image',
            'https://via.placeholder.com/800x600/FF0000/FFFFFF?text=Sample+Image',
            'https://httpbin.org/image/jpeg',
            'https://httpbin.org/image/png',
            'https://httpbin.org/image/webp',
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
            'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400',
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800'
        ];
    }

    async loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    canvas.width = img.width;
                    canvas.height = img.height;
                    
                    ctx.drawImage(img, 0, 0);
                    
                    const dataURI = canvas.toDataURL('image/png');
                    console.log('ML Extension: Successfully loaded image, data URI length:', dataURI.length);
                    resolve(dataURI);
                } catch (error) {
                    console.error('ML Extension: Error processing image:', error);
                    reject(error);
                }
            };
            
            img.onerror = (error) => {
                console.error('ML Extension: Error loading image from URL:', error);
                reject(new Error('Failed to load image from URL'));
            };
            
            setTimeout(() => {
                reject(new Error('Image load timeout'));
            }, 15000);
            
            img.src = url;
        });
    }

    async loadImageWithFetch(imageUrl) {
        try {
            console.log('ML Extension: Trying direct fetch method...');
            const response = await fetch(imageUrl, {
                mode: 'no-cors',
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const dataURI = reader.result;
                    console.log('ML Extension: Successfully loaded image with fetch, data URI length:', dataURI.length);
                    resolve(dataURI);
                };
                reader.onerror = () => reject(new Error('Failed to read image data'));
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('ML Extension: Fetch method failed:', error);
            throw error;
        }
    }

    async loadImageWithServerProxy(imageUrl) {
        try {
            console.log('ML Extension: Trying server-side proxy...');
            
            // Use the existing backend API to proxy the image
            const response = await fetch(`${API_BASE_URL}/api/proxy-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: imageUrl
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server proxy failed: ${response.status} ${response.statusText}`);
            }
            
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const dataURI = reader.result;
                    console.log('ML Extension: Successfully loaded image with server proxy, data URI length:', dataURI.length);
                    resolve(dataURI);
                };
                reader.onerror = () => reject(new Error('Failed to read proxied image data'));
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('ML Extension: Server proxy method failed:', error);
            throw error;
        }
    }

    async loadImageWithBase64Conversion(imageUrl) {
        try {
            console.log('ML Extension: Trying base64 conversion method...');
            
            // Try to fetch the image as a blob first
            const response = await fetch(imageUrl, {
                mode: 'no-cors',
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const blob = await response.blob();
            
            // Check if it's actually an image
            if (!blob.type.startsWith('image/')) {
                throw new Error('Response is not an image');
            }
            
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const dataURI = reader.result;
                    console.log('ML Extension: Successfully converted image to base64, data URI length:', dataURI.length);
                    resolve(dataURI);
                };
                reader.onerror = () => reject(new Error('Failed to read image data'));
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('ML Extension: Base64 conversion method failed:', error);
            throw error;
        }
    }

    async backdropImage() {
        try {
            console.log('ML Extension: backdropImage called');
            const target = this.runtime.getTargetForStage();
            console.log('ML Extension: Target:', target);
            
            if (!target) {
                console.warn('ML Extension: No target found for backdrop');
                return null;
            }

            // Get the current backdrop using the proper method
            const backdrop = target.getCurrentCostume();
            console.log('ML Extension: Current backdrop:', backdrop);
            
            if (!backdrop) {
                console.warn('ML Extension: No current backdrop found');
                return null;
            }

            // Check if backdrop has the necessary properties
            console.log('ML Extension: Backdrop properties:', {
                name: backdrop.name,
                skinId: backdrop.skinId,
                bitmapResolution: backdrop.bitmapResolution,
                hasAsset: !!backdrop.asset,
                dataFormat: backdrop.asset?.dataFormat,
                assetId: backdrop.asset?.assetId,
                size: backdrop.asset?.data ? backdrop.asset.data.length : 'unknown'
            });
            
            if (!backdrop.asset) {
                console.warn('ML Extension: No asset found on backdrop');
                return null;
            }

            // Try to get raw image data directly first
            let dataURI = null;
            
            if (backdrop.asset.data && backdrop.asset.dataFormat === 'png') {
                console.log('ML Extension: Found raw PNG data, using directly');
                // Handle different data types
                let bytes;
                if (backdrop.asset.data instanceof Uint8Array) {
                    bytes = backdrop.asset.data;
                } else if (backdrop.asset.data instanceof ArrayBuffer) {
                    bytes = new Uint8Array(backdrop.asset.data);
                } else if (typeof backdrop.asset.data === 'string') {
                    bytes = new Uint8Array(backdrop.asset.data.length);
                    for (let i = 0; i < backdrop.asset.data.length; i++) {
                        bytes[i] = backdrop.asset.data.charCodeAt(i);
                    }
                } else {
                    console.error('ML Extension: Unknown data type:', typeof backdrop.asset.data);
                    return null;
                }
                // Return binary data directly instead of base64
                return {
                    data: bytes,
                    mimeType: 'image/png',
                    format: 'png'
                };
            } else if (backdrop.asset.data && backdrop.asset.dataFormat === 'jpg') {
                console.log('ML Extension: Found raw JPG data, using directly');
                // Handle different data types
                let bytes;
                if (backdrop.asset.data instanceof Uint8Array) {
                    bytes = backdrop.asset.data;
                } else if (backdrop.asset.data instanceof ArrayBuffer) {
                    bytes = new Uint8Array(backdrop.asset.data);
                } else if (typeof backdrop.asset.data === 'string') {
                    bytes = new Uint8Array(backdrop.asset.data.length);
                    for (let i = 0; i < backdrop.asset.data.length; i++) {
                        bytes[i] = backdrop.asset.data.charCodeAt(i);
                    }
                } else {
                    console.error('ML Extension: Unknown data type:', typeof backdrop.asset.data);
                    return null;
                }
                // Return binary data directly instead of base64
                return {
                    data: bytes,
                    mimeType: 'image/jpeg',
                    format: 'jpg'
                };
            } else if (backdrop.asset.data && backdrop.asset.dataFormat === 'jpeg') {
                console.log('ML Extension: Found raw JPEG data, using directly');
                // Handle different data types
                let bytes;
                if (backdrop.asset.data instanceof Uint8Array) {
                    bytes = backdrop.asset.data;
                } else if (backdrop.asset.data instanceof ArrayBuffer) {
                    bytes = new Uint8Array(backdrop.asset.data);
                } else if (typeof backdrop.asset.data === 'string') {
                    bytes = new Uint8Array(backdrop.asset.data.length);
                    for (let i = 0; i < backdrop.asset.data.length; i++) {
                        bytes[i] = backdrop.asset.data.charCodeAt(i);
                    }
                } else {
                    console.error('ML Extension: Unknown data type:', typeof backdrop.asset.data);
                    return null;
                }
                // Return binary data directly instead of base64
                return {
                    data: bytes,
                    mimeType: 'image/jpeg',
                    format: 'jpeg'
                };
            } else if (backdrop.asset.data && backdrop.asset.dataFormat === 'svg') {
                console.log('ML Extension: Found SVG data, converting to PNG');
                // Handle different data types
                let bytes;
                if (backdrop.asset.data instanceof Uint8Array) {
                    bytes = backdrop.asset.data;
                } else if (backdrop.asset.data instanceof ArrayBuffer) {
                    bytes = new Uint8Array(backdrop.asset.data);
                } else if (typeof backdrop.asset.data === 'string') {
                    bytes = new Uint8Array(backdrop.asset.data.length);
                    for (let i = 0; i < backdrop.asset.data.length; i++) {
                        bytes[i] = backdrop.asset.data.charCodeAt(i);
                    }
                } else {
                    console.error('ML Extension: Unknown data type:', typeof backdrop.asset.data);
                    return null;
                }
                const svgDataUrl = `data:image/svg+xml;base64,${btoa(String.fromCharCode(...bytes))}`;
                try {
                    dataURI = await this.svgToPng(svgDataUrl);
                    console.log('ML Extension: SVG converted to PNG successfully');
                } catch (error) {
                    console.error('ML Extension: Failed to convert SVG to PNG:', error);
                    return null;
                }
            } else {
                console.warn('ML Extension: No raw image data found, backdrop may not be suitable for ML prediction');
                console.warn('ML Extension: Available data format:', backdrop.asset.dataFormat);
                console.warn('ML Extension: Available data:', backdrop.asset.data ? 'Yes' : 'No');
                return null;
            }
            
            console.log('ML Extension: Data URI length:', dataURI ? dataURI.length : 'null');
            console.log('ML Extension: Data URI preview:', dataURI ? dataURI.substring(0, 50) + '...' : 'null');
            console.log('ML Extension: Data URI type:', dataURI ? dataURI.split(',')[0] : 'null');
            
            if (!dataURI) {
                console.warn('ML Extension: Failed to encode backdrop data');
                return null;
            }

            return dataURI;
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
            // Automatically enable video and display it in the stage when webcam is accessed
            if (this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video) {
                // Enable video to show it in the stage
                this.runtime.ioDevices.video.enableVideo();
                
                // Set video transparency to make it visible (0 = fully opaque, 100 = fully transparent)
                const stage = this.runtime.getTargetForStage();
                if (stage) {
                    stage.videoTransparency = 0; // Make video fully visible
                }
                
                // Wait a moment for video to initialize
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Get video frame from Scratch's video system
                const frame = this.runtime.ioDevices.video.getFrame({
                    format: 'image-data',
                    dimensions: [640, 480]
                });
                
                if (frame && frame.data) {
                    // Convert ImageData to canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width || 640;
                    canvas.height = frame.height || 480;
                    const ctx = canvas.getContext('2d');
                    ctx.putImageData(frame, 0, 0);
                    
                    console.log('ML Extension: Webcam image captured and video enabled in stage');
                    return this.canvasToBase64(canvas);
                } else {
                    console.log('ML Extension: Video enabled but no frame data available yet');
                    return null;
                }
            }

            return null;
        } catch (error) {
            console.error('ML Extension: Error capturing webcam image:', error);
            return null;
        }
    }


    // Legacy camera management (kept for compatibility)
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
            
            // Create Teachable Machine webcam object for better pose detection
            // Don't create separate camera window - use Scratch's video sensing instead
            console.log('ML Extension: Using Scratch video sensing for pose detection');
            this.tmWebcam = null; // We'll use imageElement from Scratch's video sensing
            this.cameraVideo = null; // No separate video element needed
            this.videoElement = null; // Will be found dynamically from Scratch's video sensing

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
            
            // Clean up pose canvas
            if (this.poseCanvas && this.poseCanvas.parentNode) {
                this.poseCanvas.parentNode.removeChild(this.poseCanvas);
            }
            this.poseCanvas = null;
            this.poseCtx = null;
            
            
            this.videoElement = null;
            
            // Clean up tmWebcam
            if (this.tmWebcam) {
                this.tmWebcam.stop();
                this.tmWebcam = null;
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

    async svgToPng(svgDataUrl) {
        return new Promise((resolve, reject) => {
            try {
                // Create a new image element
                const img = new Image();
                
                // Set crossOrigin to avoid CORS issues
                img.crossOrigin = 'anonymous';
                
                img.onload = function() {
                    try {
                        // Create canvas with proper dimensions
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        
                        // Set canvas size - use natural dimensions or minimum 224x224
                        const width = Math.max(img.naturalWidth || img.width || 400, 224);
                        const height = Math.max(img.naturalHeight || img.height || 400, 224);
                        
                        canvas.width = width;
                        canvas.height = height;
                        
                        // Fill with white background first
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, width, height);
                        
                        // Draw the image
                        ctx.drawImage(img, 0, 0, width, height);
                        
                        // Convert to PNG
                        const pngDataUrl = canvas.toDataURL('image/png', 0.9);
                        console.log('ML Extension: Converted SVG to PNG - Size:', width + 'x' + height, 'Data length:', pngDataUrl.length);
                        resolve(pngDataUrl);
                    } catch (error) {
                        console.error('ML Extension: Error converting SVG to PNG:', error);
                        reject(error);
                    }
                };
                
                img.onerror = function(error) {
                    console.error('ML Extension: Error loading SVG image:', error);
                    reject(error);
                };
                
                // Load the SVG
                img.src = svgDataUrl;
            } catch (error) {
                console.error('ML Extension: Error in svgToPng:', error);
                reject(error);
            }
        });
    }

    base64ToBlob(base64, mimeType = 'image/jpeg') {
        try {
            if (!base64 || typeof base64 !== 'string') {
                console.error('ML Extension: Invalid base64 input:', typeof base64);
                return null;
            }

            // Check if it's a data URL
            if (base64.startsWith('data:')) {
                // Find the first comma after the data: prefix to split properly
                const commaIndex = base64.indexOf(',');
                if (commaIndex === -1) {
                    console.error('ML Extension: Invalid data URL format - no comma found');
                    return null;
                }
                
                const header = base64.substring(0, commaIndex);
                const data = base64.substring(commaIndex + 1);
                
                // Extract mime type from data URL if available
                const mimeMatch = header.match(/data:([^;]+)/);
                if (mimeMatch) {
                    mimeType = mimeMatch[1];
                }
                
                base64 = data;
            }

            // Decode base64
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            
            console.log('ML Extension: Creating blob with mime type:', mimeType, 'size:', byteArray.length);
            return new Blob([byteArray], { type: mimeType });
        } catch (error) {
            console.error('ML Extension: Error converting base64 to blob:', error);
            console.error('ML Extension: Base64 preview:', base64 ? base64.substring(0, 100) + '...' : 'null');
            return null;
        }
    }


    // Image recognition methods
    async recogniseImageLabel(args) {
        try {
            const imageData = args.IMAGE;
            console.log('ML Extension: recogniseImageLabel called with args:', args);
            if (typeof imageData === 'string') {
                console.log('ML Extension: Image data received:', imageData ? imageData.substring(0, 100) + '...' : 'null');
            } else if (imageData && typeof imageData === 'object') {
                console.log('ML Extension: Binary image data received - size:', imageData.data ? imageData.data.length : 'unknown', 'format:', imageData.format);
            } else {
                console.log('ML Extension: Image data received:', imageData);
            }
            
            if (!imageData) {
                console.warn('ML Extension: No image data provided');
                return 'No image';
            }

            if (!this.sessionId || !this.projectId) {
                console.warn('ML Extension: Missing session or project ID for prediction');
                console.warn('ML Extension: Session ID:', this.sessionId, 'Project ID:', this.projectId);
                return 'Error: No project loaded';
            }

            console.log(`ML Extension: Making image prediction API call`);
            console.log('ML Extension: Image data type:', typeof imageData);
            if (typeof imageData === 'string') {
                console.log('ML Extension: Image data preview:', imageData ? imageData.substring(0, 50) + '...' : 'null');
            } else if (imageData && typeof imageData === 'object') {
                console.log('ML Extension: Binary image data - size:', imageData.data ? imageData.data.length : 'unknown', 'format:', imageData.format, 'mimeType:', imageData.mimeType);
            } else {
                console.log('ML Extension: Image data preview:', imageData);
            }

            // Step 1: Upload image to GCS for prediction
            let gcsUrl;
            if (typeof imageData === 'string' && imageData.startsWith('data:')) {
                console.log('ML Extension: Converting base64 to blob for upload');
                
                const blob = this.base64ToBlob(imageData);
                if (!blob || !(blob instanceof Blob)) {
                    console.error('ML Extension: Failed to convert image data to blob');
                    return 'Error: Invalid image';
                }

                // Upload image to GCS
                const formData = new FormData();
                // Generate unique filename
                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substring(2, 8);
                const filename = `prediction_${timestamp}_${randomId}.jpg`;
                formData.append('files', blob, filename);

                const uploadResponse = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict-image`, {
                    method: 'POST',
                    body: formData
                });

                if (!uploadResponse.ok) {
                    console.error(`ML Extension: Image upload failed: ${uploadResponse.status}`);
                    try {
                        const errorData = await uploadResponse.text();
                        console.error('ML Extension: Upload error details:', errorData);
                    } catch (e) {
                        console.error('ML Extension: Could not read error response');
                    }
                    return 'Error: Image upload failed';
                }

                const uploadData = await uploadResponse.json();
                gcsUrl = uploadData.imageUrl;
                console.log('ML Extension: Image uploaded to GCS:', gcsUrl);
            } else if (imageData && typeof imageData === 'object' && imageData.data && imageData.mimeType) {
                console.log('ML Extension: Using binary data directly for upload');
                
                // Create blob from binary data
                const blob = new Blob([imageData.data], { type: imageData.mimeType });
                
                // Upload image to GCS
                const formData = new FormData();
                // Generate unique filename
                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substring(2, 8);
                const filename = `prediction_${timestamp}_${randomId}.${imageData.format}`;
                formData.append('files', blob, filename);

                const uploadResponse = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict-image`, {
                    method: 'POST',
                    body: formData
                });

                if (!uploadResponse.ok) {
                    console.error(`ML Extension: Image upload failed: ${uploadResponse.status}`);
                    try {
                        const errorData = await uploadResponse.text();
                        console.error('ML Extension: Upload error details:', errorData);
                    } catch (e) {
                        console.error('ML Extension: Could not read error response');
                    }
                    return 'Error: Image upload failed';
                }

                const uploadData = await uploadResponse.json();
                gcsUrl = uploadData.imageUrl;
                console.log('ML Extension: Image uploaded to GCS:', gcsUrl);
            } else {
                console.error('ML Extension: Unsupported image data type:', typeof imageData);
                return 'Error: Invalid image format';
            }

            // Step 2: Make prediction using GCS URL
            const predictionResponse = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: gcsUrl  // Your API expects the GCS URL in the 'text' field
                })
            });

            if (predictionResponse.ok) {
                const data = await predictionResponse.json();
                console.log('ML Extension: Image prediction response:', data);
                console.log('ML Extension: Prediction details - success:', data.success, 'label:', data.label, 'confidence:', data.confidence);
                
                if (data.success && data.label) {
                    this.lastPrediction = data.label;
                    console.log('ML Extension: Returning prediction label:', data.label);
                    return data.label;
                } else {
                    console.warn('ML Extension: No prediction in response:', data);
                    console.warn('ML Extension: Response structure:', JSON.stringify(data, null, 2));
                    return 'Unknown';
                }
            } else {
                console.error(`ML Extension: Image prediction failed: ${predictionResponse.status}`);
                try {
                    const errorText = await predictionResponse.text();
                    console.error('ML Extension: Prediction error details:', errorText);
                } catch (e) {
                    console.error('ML Extension: Could not read error response');
                }
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
            console.log('ML Extension: recogniseImageConfidence called with args:', args);
            if (typeof imageData === 'string') {
                console.log('ML Extension: Image data received:', imageData ? imageData.substring(0, 100) + '...' : 'null');
            } else if (imageData && typeof imageData === 'object') {
                console.log('ML Extension: Binary image data received - size:', imageData.data ? imageData.data.length : 'unknown', 'format:', imageData.format);
            } else {
                console.log('ML Extension: Image data received:', imageData);
            }
            
            if (!imageData) {
                console.warn('ML Extension: No image data provided');
                return 0;
            }

            if (!this.sessionId || !this.projectId) {
                console.warn('ML Extension: Missing session or project ID for prediction');
                console.warn('ML Extension: Session ID:', this.sessionId, 'Project ID:', this.projectId);
                return 0;
            }

            console.log(`ML Extension: Making image confidence API call`);
            console.log('ML Extension: Image data type:', typeof imageData);
            if (typeof imageData === 'string') {
                console.log('ML Extension: Image data preview:', imageData ? imageData.substring(0, 50) + '...' : 'null');
            } else if (imageData && typeof imageData === 'object') {
                console.log('ML Extension: Binary image data - size:', imageData.data ? imageData.data.length : 'unknown', 'format:', imageData.format, 'mimeType:', imageData.mimeType);
            } else {
                console.log('ML Extension: Image data preview:', imageData);
            }

            // Step 1: Upload image to GCS for prediction
            let gcsUrl;
            if (typeof imageData === 'string' && imageData.startsWith('data:')) {
                console.log('ML Extension: Converting base64 to blob for upload');
                
                const blob = this.base64ToBlob(imageData);
                if (!blob || !(blob instanceof Blob)) {
                    console.error('ML Extension: Failed to convert image data to blob');
                    return 0;
                }

                // Upload image to GCS
                const formData = new FormData();
                // Generate unique filename
                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substring(2, 8);
                const filename = `prediction_${timestamp}_${randomId}.jpg`;
                formData.append('files', blob, filename);

                const uploadResponse = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict-image`, {
                    method: 'POST',
                    body: formData
                });

                if (!uploadResponse.ok) {
                    console.error(`ML Extension: Image upload failed: ${uploadResponse.status}`);
                    try {
                        const errorData = await uploadResponse.text();
                        console.error('ML Extension: Upload error details:', errorData);
                    } catch (e) {
                        console.error('ML Extension: Could not read error response');
                    }
                    return 0;
                }

                const uploadData = await uploadResponse.json();
                gcsUrl = uploadData.imageUrl;
                console.log('ML Extension: Image uploaded to GCS:', gcsUrl);
            } else if (imageData && typeof imageData === 'object' && imageData.data && imageData.mimeType) {
                console.log('ML Extension: Using binary data directly for upload');
                
                // Create blob from binary data
                const blob = new Blob([imageData.data], { type: imageData.mimeType });
                
                // Upload image to GCS
                const formData = new FormData();
                // Generate unique filename
                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substring(2, 8);
                const filename = `prediction_${timestamp}_${randomId}.${imageData.format}`;
                formData.append('files', blob, filename);

                const uploadResponse = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict-image`, {
                    method: 'POST',
                    body: formData
                });

                if (!uploadResponse.ok) {
                    console.error(`ML Extension: Image upload failed: ${uploadResponse.status}`);
                    try {
                        const errorData = await uploadResponse.text();
                        console.error('ML Extension: Upload error details:', errorData);
                    } catch (e) {
                        console.error('ML Extension: Could not read error response');
                    }
                    return 0;
                }

                const uploadData = await uploadResponse.json();
                gcsUrl = uploadData.imageUrl;
                console.log('ML Extension: Image uploaded to GCS:', gcsUrl);
            } else {
                console.error('ML Extension: Unsupported image data type:', typeof imageData);
                return 0;
            }

            // Step 2: Make prediction using GCS URL
            const predictionResponse = await fetch(`${API_BASE_URL}/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: gcsUrl  // Your API expects the GCS URL in the 'text' field
                })
            });

            if (predictionResponse.ok) {
                const data = await predictionResponse.json();
                console.log('ML Extension: Image confidence response:', data);
                
                if (data.success && typeof data.confidence === 'number') {
                    this.lastConfidence = data.confidence;
                    // API returns confidence as percentage (0-100), so no need to multiply by 100
                    const roundedConfidence = Math.min(100, Math.round(data.confidence));
                    console.log(`ML Extension: Confidence calculation - Raw: ${data.confidence}, Rounded: ${roundedConfidence}`);
                    return roundedConfidence;
                } else {
                    console.warn('ML Extension: No confidence in response:', data);
                    return 0;
                }
            } else {
                console.error(`ML Extension: Image confidence failed: ${predictionResponse.status}`);
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
                    const isTrained = data.data.status === 'trained';
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
                    // API returns confidence as percentage (0-100), so no need to multiply by 100
                    const roundedConfidence = Math.min(100, Math.round(data.confidence));
                    console.log(`ML Extension: Confidence calculation - Raw: ${data.confidence}, Rounded: ${roundedConfidence}`);
                    return roundedConfidence;
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

    // Pose Recognition Initialization
    async initializePoseRecognition() {
        try {
            console.log('ML Extension: Initializing Pose Recognition mode');
            
            // Load Teachable Machine link from localStorage
            if (this.teachableLink) {
                console.log('ML Extension: Found stored Teachable Machine link for pose:', this.teachableLink);
                await this.loadPoseModel(this.teachableLink);
            } else {
                console.log('ML Extension: No Teachable Machine link found for pose recognition');
            }
            
            // Override video rendering to include pose keypoints (disabled for now)
            // this.overrideVideoRendering();
        } catch (error) {
            console.error('ML Extension: Error initializing pose recognition:', error);
        }
    }

    // Override video rendering to include pose keypoints
    overrideVideoRendering() {
        try {
            const videoIO = this.runtime.ioDevices.video;
            if (!videoIO) {
                console.warn('ML Extension: Video IO device not available');
                return;
            }

            // Store original renderPreviewFrame method
            const originalRenderPreviewFrame = videoIO._renderPreviewFrame;
            
            // Override the method
            videoIO._renderPreviewFrame = () => {
                // Call original method first to ensure video works
                if (originalRenderPreviewFrame) {
                    originalRenderPreviewFrame.call(videoIO);
                }

                // Only modify if we have pose data and video is working
                if (this.poseKeypoints && videoIO._skinId !== -1) {
                    try {
                        // Get the current video frame
                        const imageData = videoIO.getFrame({
                            format: videoIO.constructor.FORMAT_IMAGE_DATA,
                            cacheTimeout: this.runtime.currentStepTime
                        });

                        if (imageData) {
                            // Modify the video frame with pose keypoints
                            const modifiedImageData = this.modifyVideoFrame(imageData);
                            
                            // Update the video skin with modified frame
                            videoIO.runtime.renderer.updateBitmapSkin(videoIO._skinId, modifiedImageData, 1);
                            videoIO.runtime.requestRedraw();
                        }
                    } catch (modifyError) {
                        console.warn('ML Extension: Error modifying video frame, continuing with original:', modifyError);
                    }
                }
            };

            console.log('ML Extension: Video rendering overridden for pose keypoints');
        } catch (error) {
            console.error('ML Extension: Error overriding video rendering:', error);
        }
    }

    // Pose Recognition Library Loading
    async loadPoseLibraries() {
        try {
            // Check if Teachable Machine Pose library is already loaded
            if (window.tmPose) {
                console.log('ML Extension: Teachable Machine Pose library already loaded');
                return;
            }

            // Load TensorFlow.js first
            if (!window.tf) {
                console.log('ML Extension: Loading TensorFlow.js for pose recognition...');
                const tfScript = document.createElement('script');
                tfScript.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js';
                tfScript.async = true;
                document.head.appendChild(tfScript);
                
                await new Promise((resolve, reject) => {
                    tfScript.onload = resolve;
                    tfScript.onerror = reject;
                });
            }

            // Load Teachable Machine Pose library
            console.log('ML Extension: Loading Teachable Machine Pose library...');
            const tmScript = document.createElement('script');
            tmScript.src = 'https://cdn.jsdelivr.net/npm/@teachablemachine/pose@0.8/dist/teachablemachine-pose.min.js';
            tmScript.async = true;
            document.head.appendChild(tmScript);
            
            await new Promise((resolve, reject) => {
                tmScript.onload = resolve;
                tmScript.onerror = reject;
            });
            
            console.log('ML Extension: Teachable Machine Pose library loaded successfully');
        } catch (error) {
            console.error('ML Extension: Failed to load pose libraries:', error);
            throw error;
        }
    }

    // Load Pose Model
    async loadPoseModel(url) {
        try {
            await this.loadPoseLibraries();
            
            if (!window.tmPose) {
                throw new Error('Teachable Machine Pose library not available');
            }

            console.log('ML Extension: Loading pose model from:', url);
            
            // Load model and metadata
            this.poseModel = await window.tmPose.load(url + 'model.json', url + 'metadata.json');
            
            // Get labels from metadata
            try {
                const metadataResponse = await fetch(url + 'metadata.json');
                const metadata = await metadataResponse.json();
                this.poseModelLabels = metadata.labels || [];
            } catch (error) {
                console.warn('ML Extension: Could not fetch metadata, using default labels');
                this.poseModelLabels = ['class1', 'class2', 'class3']; // Default labels
            }
            
            this.isPoseModelLoaded = true;
            
            // Skip tmWebcam creation - use Scratch's video sensing instead
            
            console.log('ML Extension: Pose model loaded successfully');
            console.log('ML Extension: Pose model labels:', this.poseModelLabels);
            
            // Start pose prediction loop
            this.startPosePredictionLoop();
            
        } catch (error) {
            console.error('ML Extension: Failed to load pose model:', error);
            this.isPoseModelLoaded = false;
        }
    }

    // Start Pose Prediction Loop
    startPosePredictionLoop() {
        if (!this.isPoseModelLoaded || !this.poseModel) {
            console.warn('ML Extension: Pose model not loaded, cannot start prediction loop');
            return;
        }

        console.log('ML Extension: Starting pose prediction loop');
        
        const predictPose = async () => {
            try {
                if (!this.isPoseModelLoaded || !this.poseModel) {
                    return;
                }
                
                // Try to create tmWebcam if not already created
                console.log('ML Extension: tmPose check:', {
                    tmPoseExists: typeof tmPose !== 'undefined',
                    tmPoseWebcam: typeof tmPose !== 'undefined' ? typeof tmPose.Webcam : 'undefined',
                    isCameraEnabled: this.isCameraEnabled,
                    tmWebcamExists: !!this.tmWebcam,
                    cameraStream: !!this.cameraStream,
                    videoElement: !!this.videoElement
                });
                
                // Try to create tmWebcam even if camera is not enabled (for pose detection)
                // Skip tmWebcam creation - use imageElement directly

                // Get video frame from Scratch's video system
                let frame = null;
                
                if (this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video) {
                    try {
                        frame = this.runtime.ioDevices.video.getFrame({
                            format: 'image-data',
                            dimensions: [480, 360]
                        });
                    } catch (videoError) {
                        console.warn('Pose Recognition: Could not get video frame:', videoError.message);
                        requestAnimationFrame(predictPose);
                        return;
                    }
                }

                if (!frame) {
                    requestAnimationFrame(predictPose);
                    return;
                }

                // Convert frame to canvas for pose estimation
                let imageElement = null;
                
                if (frame instanceof ImageData) {
                    // Convert ImageData to canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width;
                    canvas.height = frame.height;
                    const ctx = canvas.getContext('2d');
                    ctx.putImageData(frame, 0, 0);
                    imageElement = canvas;
                } else if (frame instanceof HTMLCanvasElement) {
                    // If it's already a canvas, use it directly
                    imageElement = frame;
                } else if (frame instanceof HTMLVideoElement) {
                    // If it's a video element, use it directly
                    imageElement = frame;
                } else if (frame instanceof ImageBitmap) {
                    // If it's an ImageBitmap, convert to canvas
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width;
                    canvas.height = frame.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(frame, 0, 0);
                    imageElement = canvas;
                } else {
                    console.warn('Pose Recognition: Could not convert frame to usable format');
                    requestAnimationFrame(predictPose);
                    return;
                }

                // Estimate pose and get prediction using tmWebcam if available
                let pose, posenetOutput, prediction;
                
                // Validate pose model before using it
                if (!this.poseModel || typeof this.poseModel.estimatePose !== 'function') {
                    console.error('ML Extension: Pose model not properly loaded or estimatePose method missing');
                    requestAnimationFrame(predictPose);
                    return;
                }
                
                if (false) { // Disabled tmWebcam usage - always use imageElement
                    // Use tmWebcam for better pose detection
                    this.tmWebcam.update();
                    
                    // Debug canvas data before pose detection
                    const canvas = this.tmWebcam.canvas;
                    const ctx = canvas.getContext('2d');
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const hasNonZeroPixels = Array.from(imageData.data).some(pixel => pixel !== 0);
                    
                    console.log('ML Extension: Canvas data check:', {
                        canvasSize: { width: canvas.width, height: canvas.height },
                        hasNonZeroPixels: hasNonZeroPixels,
                        imageDataLength: imageData.data.length,
                        firstFewPixels: Array.from(imageData.data).slice(0, 20)
                    });
                    
                    try {
                        // Try pose detection with different approaches
                        console.log('ML Extension: Attempting pose detection with canvas:', {
                            canvasWidth: canvas.width,
                            canvasHeight: canvas.height,
                            canvasType: canvas.constructor.name
                        });
                        
                        // Ensure canvas has valid dimensions
                        if (canvas.width === 0 || canvas.height === 0) {
                            console.warn('ML Extension: Canvas has zero dimensions, skipping pose detection');
                            pose = null;
                            posenetOutput = null;
                            prediction = null;
                        } else {
                        const result = await this.poseModel.estimatePose(canvas);
                        console.log('ML Extension: Raw pose detection result:', result);
                        
                        pose = result.pose;
                        posenetOutput = result.posenetOutput;
                        
                        // Fix keypoint coordinates - they might be in position.x, position.y format
                        if (pose && pose.keypoints && pose.keypoints.length > 0) {
                            pose.keypoints = pose.keypoints.map(keypoint => {
                                if (keypoint.x === undefined && keypoint.position && keypoint.position.x !== undefined) {
                                    return {
                                        ...keypoint,
                                        x: keypoint.position.x,
                                        y: keypoint.position.y
                                    };
                                }
                                return keypoint;
                            });
                            console.log('ML Extension: Fixed keypoint coordinates');
                        }
                            
                            // Only try prediction if we have valid posenetOutput
                            if (posenetOutput) {
                                prediction = await this.poseModel.predict(posenetOutput);
                            } else {
                                console.warn('ML Extension: No posenetOutput available for prediction');
                                prediction = null;
                            }
                            
                            console.log('ML Extension: Pose detection result details:', {
                                resultKeys: Object.keys(result),
                                poseKeys: pose ? Object.keys(pose) : 'no pose',
                                posenetOutputType: typeof posenetOutput,
                                posenetOutputLength: Array.isArray(posenetOutput) ? posenetOutput.length : 'not array',
                                predictionType: typeof prediction,
                                predictionLength: Array.isArray(prediction) ? prediction.length : 'not array'
                            });
                        }
                    } catch (poseError) {
                        console.error('ML Extension: Pose detection error:', poseError);
                        pose = null;
                        posenetOutput = null;
                        prediction = null;
                    }
                    
                    // Check if pose detection worked properly
                    const hasValidKeypoints = pose && pose.keypoints && pose.keypoints.length > 0 && 
                        pose.keypoints.some(kp => typeof kp.x === 'number' && typeof kp.y === 'number');
                    
                    console.log('ML Extension: Used tmWebcam for pose detection', {
                        tmWebcamSize: { width: this.tmWebcam.canvas.width, height: this.tmWebcam.canvas.height },
                        poseKeypoints: pose ? pose.keypoints.length : 0,
                        firstKeypoint: pose && pose.keypoints[0] ? { x: pose.keypoints[0].x, y: pose.keypoints[0].y } : 'none',
                        hasValidKeypoints: hasValidKeypoints,
                        poseObject: pose ? Object.keys(pose) : 'no pose',
                        allKeypoints: pose && pose.keypoints ? pose.keypoints.map(kp => ({ x: kp.x, y: kp.y, part: kp.part, score: kp.score })) : 'no keypoints'
                    });
                    
                    // If tmWebcam failed, fallback to imageElement
                    if (!hasValidKeypoints) {
                        console.log('ML Extension: tmWebcam pose detection failed, falling back to imageElement');
                        console.log('ML Extension: imageElement details:', {
                            tagName: imageElement.tagName,
                            width: imageElement.width,
                            height: imageElement.height,
                            naturalWidth: imageElement.naturalWidth,
                            naturalHeight: imageElement.naturalHeight,
                            src: imageElement.src ? imageElement.src.substring(0, 50) + '...' : 'no src',
                            videoWidth: imageElement.videoWidth,
                            videoHeight: imageElement.videoHeight
                        });
                        
                        // Debug fallback canvas data
                        const fallbackCanvas = imageElement;
                        const fallbackCtx = fallbackCanvas.getContext('2d');
                        const fallbackImageData = fallbackCtx.getImageData(0, 0, fallbackCanvas.width, fallbackCanvas.height);
                        const fallbackHasNonZeroPixels = Array.from(fallbackImageData.data).some(pixel => pixel !== 0);
                        
                        console.log('ML Extension: Fallback canvas data check:', {
                            canvasSize: { width: fallbackCanvas.width, height: fallbackCanvas.height },
                            hasNonZeroPixels: fallbackHasNonZeroPixels,
                            imageDataLength: fallbackImageData.data.length,
                            firstFewPixels: Array.from(fallbackImageData.data).slice(0, 20)
                        });
                        
                        try {
                            const fallbackResult = await this.poseModel.estimatePose(imageElement);
                            pose = fallbackResult.pose;
                            posenetOutput = fallbackResult.posenetOutput;
                            
                            // Fix keypoint coordinates for fallback too
                            if (pose && pose.keypoints && pose.keypoints.length > 0) {
                                pose.keypoints = pose.keypoints.map(keypoint => {
                                    if (keypoint.x === undefined && keypoint.position && keypoint.position.x !== undefined) {
                                        return {
                                            ...keypoint,
                                            x: keypoint.position.x,
                                            y: keypoint.position.y
                                        };
                                    }
                                    return keypoint;
                                });
                                console.log('ML Extension: Fixed fallback keypoint coordinates');
                            }
                            
                            prediction = await this.poseModel.predict(posenetOutput);
                            
                            console.log('ML Extension: Fallback pose detection result details:', {
                                resultKeys: Object.keys(fallbackResult),
                                poseKeys: pose ? Object.keys(pose) : 'no pose',
                                posenetOutputType: typeof posenetOutput,
                                posenetOutputLength: Array.isArray(posenetOutput) ? posenetOutput.length : 'not array'
                            });
                        } catch (fallbackError) {
                            console.error('ML Extension: Fallback pose detection error:', fallbackError);
                            pose = null;
                            posenetOutput = null;
                            prediction = null;
                        }
                        
                        console.log('ML Extension: Fallback pose detection result:', {
                            poseKeypoints: pose ? pose.keypoints.length : 0,
                            firstKeypoint: pose && pose.keypoints[0] ? { x: pose.keypoints[0].x, y: pose.keypoints[0].y } : 'none',
                            poseObject: pose ? Object.keys(pose) : 'no pose',
                            posenetOutput: posenetOutput ? Object.keys(posenetOutput) : 'no posenetOutput'
                        });
                    }
                } else {
                    // Skip tmWebcam creation - use imageElement directly
                    
                    // If tmWebcam creation failed or doesn't exist, fallback to imageElement
                    if (!pose) {
                        console.log('ML Extension: Using imageElement for pose detection - tmWebcam not available');
                        console.log('ML Extension: imageElement details:', {
                            tagName: imageElement.tagName,
                            width: imageElement.width,
                            height: imageElement.height,
                            naturalWidth: imageElement.naturalWidth,
                            naturalHeight: imageElement.naturalHeight,
                            src: imageElement.src ? imageElement.src.substring(0, 50) + '...' : 'no src',
                            videoWidth: imageElement.videoWidth,
                            videoHeight: imageElement.videoHeight
                        });
                        
                        const result = await this.poseModel.estimatePose(imageElement);
                        pose = result.pose;
                        posenetOutput = result.posenetOutput;
                        prediction = await this.poseModel.predict(posenetOutput);
                        
                        // Fix keypoint coordinates for imageElement too
                        if (pose && pose.keypoints && pose.keypoints.length > 0) {
                            pose.keypoints = pose.keypoints.map(keypoint => {
                                if (keypoint.x === undefined && keypoint.position && keypoint.position.x !== undefined) {
                                    return {
                                        ...keypoint,
                                        x: keypoint.position.x,
                                        y: keypoint.position.y
                                    };
                                }
                                return keypoint;
                            });
                            console.log('ML Extension: Fixed keypoint coordinates for imageElement');
                        }
                    }
                    
                    console.log('ML Extension: imageElement pose detection result:', {
                        poseKeypoints: pose ? pose.keypoints.length : 0,
                        firstKeypoint: pose && pose.keypoints[0] ? { x: pose.keypoints[0].x, y: pose.keypoints[0].y } : 'none',
                        poseObject: pose ? Object.keys(pose) : 'no pose',
                        posenetOutput: posenetOutput ? Object.keys(posenetOutput) : 'no posenetOutput',
                        tmWebcamExists: !!this.tmWebcam,
                        tmWebcamCanvas: this.tmWebcam ? !!this.tmWebcam.canvas : false
                    });
                }

                // Store pose data for drawing
                this.poseKeypoints = pose;

                // Update prediction data
                if (prediction && prediction.length > 0) {
                    // Find the prediction with highest probability
                    const bestPrediction = prediction.reduce((best, current) => 
                        current.probability > best.probability ? current : best
                    );
                    
                    this.poseCurrentPrediction = bestPrediction.className || 'unknown';
                    this.poseModelConfidences = {};
                    
                    prediction.forEach(pred => {
                        this.poseModelConfidences[pred.className] = pred.probability;
                    });
                } else {
                    this.poseCurrentPrediction = 'unknown';
                    this.poseModelConfidences = {};
                }

                // Draw pose on video (with error handling)
                try {
                    this.drawPoseOnVideo(pose, imageElement);
                } catch (drawError) {
                    console.error('ML Extension: Error in drawPoseOnVideo:', drawError);
                }
                
                // Make sprite say the prediction (like in your image)
                try {
                    this.makeSpriteSayPrediction(this.poseCurrentPrediction);
                } catch (speechError) {
                    console.error('ML Extension: Error in makeSpriteSayPrediction:', speechError);
                }

            } catch (error) {
                console.error('ML Extension: Pose prediction error:', error);
            }

            // Continue the loop
            requestAnimationFrame(predictPose);
        };

        // Start the prediction loop
        requestAnimationFrame(predictPose);
    }

    // Draw Pose on Video - Create overlay canvas positioned over video
    drawPoseOnVideo(pose, imageElement) {
        try {
            // Store the pose data
            this.poseKeypoints = pose;
            
            // Create or update overlay canvas
            if (!this.poseCanvas) {
                this.poseCanvas = document.createElement('canvas');
                this.poseCtx = this.poseCanvas.getContext('2d');
                
                // Style the canvas for overlay
                this.poseCanvas.style.position = 'fixed';
                this.poseCanvas.style.pointerEvents = 'none';
                this.poseCanvas.style.zIndex = '9999'; // Higher z-index to ensure visibility
                this.poseCanvas.style.border = 'none';
                this.poseCanvas.style.outline = 'none';
                this.poseCanvas.style.backgroundColor = 'transparent';
                this.poseCanvas.style.margin = '0';
                this.poseCanvas.style.padding = '0';
                this.poseCtx.lineWidth = 4;
                this.poseCtx.strokeStyle = '#00ff00';
                this.poseCtx.fillStyle = '#00ff00';
                
                // Add to document body
                document.body.appendChild(this.poseCanvas);
                console.log('ML Extension: Pose canvas added to document body');
                
                // Add resize listener to update positioning when stage changes size
                this.setupPoseCanvasResizeListener();
            }

            // Update canvas position to match current stage/video position
            this.updatePoseCanvasPosition();
            
            // Set canvas internal dimensions for consistent keypoint scaling
            this.poseCanvas.width = 480;
            this.poseCanvas.height = 360;

            // Clear canvas
            this.poseCtx.clearRect(0, 0, this.poseCanvas.width, this.poseCanvas.height);
            
            // Ensure drawing context is properly configured
            this.poseCtx.lineWidth = 4;
            this.poseCtx.strokeStyle = '#00ff00';
            this.poseCtx.fillStyle = '#00ff00';
            this.poseCtx.lineCap = 'round';
            this.poseCtx.lineJoin = 'round';

            // Draw pose if available
            if (pose && pose.keypoints && pose.keypoints.length > 0) {
                console.log('ML Extension: Drawing pose with', pose.keypoints.length, 'keypoints');

                // Draw the video frame first
                if (this.tmWebcam && this.tmWebcam.canvas) {
                    // Use tmWebcam canvas for better alignment
                    this.poseCtx.drawImage(this.tmWebcam.canvas, 0, 0, this.poseCanvas.width, this.poseCanvas.height);
                    console.log('ML Extension: Drew tmWebcam canvas', {
                        tmWebcamSize: { width: this.tmWebcam.canvas.width, height: this.tmWebcam.canvas.height },
                        canvasSize: { width: this.poseCanvas.width, height: this.poseCanvas.height }
                    });
                } else if (this.videoElement) {
                    // Fallback to video element
                    this.poseCtx.drawImage(this.videoElement, 0, 0, this.poseCanvas.width, this.poseCanvas.height);
                    console.log('ML Extension: Drew video element');
                }
                
                // Draw the sprite on a separate canvas on top

                // Scale keypoints to match the actual video display size
                const videoElement = this.findVideoElement();
                const videoRect = videoElement ? videoElement.getBoundingClientRect() : { width: 480, height: 360 };
                const scaledPose = this.scalePoseForVideoDisplay(pose, imageElement, videoRect);
                
                // Use Teachable Machine's built-in drawing functions with scaled keypoints
                const minPartConfidence = 0.5;
                try {
                    // Check if tmPose is available
                    if (typeof tmPose !== 'undefined' && tmPose.drawKeypoints && tmPose.drawSkeleton) {
                        // Use scaled keypoints for proper alignment with video display
                        tmPose.drawKeypoints(scaledPose.keypoints, minPartConfidence, this.poseCtx);
                        tmPose.drawSkeleton(scaledPose.keypoints, minPartConfidence, this.poseCtx);
                        console.log('ML Extension: Used tmPose drawing functions with scaled keypoints');
                    } else {
                        // Fallback to custom drawing with scaling
                        this.drawPoseCustom(scaledPose);
                    }
                } catch (error) {
                    console.warn('ML Extension: tmPose drawing failed, using custom drawing:', error);
                    this.drawPoseCustom(scaledPose);
                }
                
                // Debug elements removed - pose detection is working correctly
                
                // Debug canvas visibility
                const canvasRect = this.poseCanvas.getBoundingClientRect();
                const computedStyle = window.getComputedStyle(this.poseCanvas);
                console.log('ML Extension: Canvas visibility debug:', {
                    canvasRect: canvasRect,
                    zIndex: computedStyle.zIndex,
                    display: computedStyle.display,
                    visibility: computedStyle.visibility,
                    opacity: computedStyle.opacity,
                    position: computedStyle.position
                });

                console.log('ML Extension: Pose drawing completed successfully');
            }

            // Always draw sprite on top, regardless of pose detection

        } catch (error) {
            console.error('ML Extension: Error drawing pose:', error);
        }
    }


    // Draw sprite on the pose canvas
    drawSpriteOnPoseCanvas() {
        try {
            // Get the stage and its sprites
            const stage = this.runtime.getTargetForStage();
            if (!stage) return;
            
            // Get all sprites from the stage
            const sprites = this.runtime.targets.filter(target => 
                target.isStage === false && target.visible
            );
            
            if (sprites.length === 0) return;
            
            // Draw each visible sprite
            sprites.forEach(sprite => {
                if (sprite.visible && sprite.drawable) {
                    // Get sprite's current position and size
                    const x = sprite.x;
                    const y = sprite.y;
                    const size = sprite.size || 100;
                    const direction = sprite.direction || 90;
                    
                    // Convert Scratch coordinates to canvas coordinates
                    // Scratch uses center-based coordinates, canvas uses top-left
                    const canvasX = (x + 240) * (this.poseCanvas.width / 480); // 480 is Scratch stage width
                    const canvasY = (180 - y) * (this.poseCanvas.height / 360); // 360 is Scratch stage height
                    
                    // Scale sprite size to match canvas
                    const scaledSize = size * (this.poseCanvas.width / 480);
                    
                    // Save context state
                    this.poseCtx.save();
                    
                    // Move to sprite position and rotate
                    this.poseCtx.translate(canvasX, canvasY);
                    this.poseCtx.rotate((direction - 90) * Math.PI / 180);
                    
                    // Draw a simple sprite representation (circle with face)
                    this.poseCtx.fillStyle = '#4C97FF'; // Scratch blue
                    this.poseCtx.strokeStyle = '#3373CC';
                    this.poseCtx.lineWidth = 2;
                    
                    // Draw body (circle)
                    this.poseCtx.beginPath();
                    this.poseCtx.arc(0, 0, scaledSize / 2, 0, 2 * Math.PI);
                    this.poseCtx.fill();
                    this.poseCtx.stroke();
                    
                    // Draw eyes
                    this.poseCtx.fillStyle = 'white';
                    this.poseCtx.beginPath();
                    this.poseCtx.arc(-scaledSize / 6, -scaledSize / 8, scaledSize / 12, 0, 2 * Math.PI);
                    this.poseCtx.arc(scaledSize / 6, -scaledSize / 8, scaledSize / 12, 0, 2 * Math.PI);
                    this.poseCtx.fill();
                    
                    // Draw pupils
                    this.poseCtx.fillStyle = 'black';
                    this.poseCtx.beginPath();
                    this.poseCtx.arc(-scaledSize / 6, -scaledSize / 8, scaledSize / 24, 0, 2 * Math.PI);
                    this.poseCtx.arc(scaledSize / 6, -scaledSize / 8, scaledSize / 24, 0, 2 * Math.PI);
                    this.poseCtx.fill();
                    
                    // Draw mouth
                    this.poseCtx.strokeStyle = 'black';
                    this.poseCtx.lineWidth = 1;
                    this.poseCtx.beginPath();
                    this.poseCtx.arc(0, scaledSize / 8, scaledSize / 8, 0, Math.PI);
                    this.poseCtx.stroke();
                    
                    // Restore context state
                    this.poseCtx.restore();
                    
                    console.log('ML Extension: Drew sprite on pose canvas', {
                        spriteId: sprite.id,
                        position: { x, y },
                        canvasPosition: { x: canvasX, y: canvasY },
                        size: scaledSize
                    });
                }
            });
        } catch (error) {
            console.error('ML Extension: Error drawing sprite on pose canvas:', error);
        }
    }

    // Scale pose keypoints to match canvas dimensions (new method for tmPose)
    // Scale pose keypoints for video display (handles different stage sizes)
    scalePoseForVideoDisplay(pose, imageElement, videoRect) {
        if (!pose || !pose.keypoints) return pose;
        
        // Get the source dimensions (imageElement is always 480x360)
        const sourceWidth = 480;
        const sourceHeight = 360;
        
        // Get the target dimensions (actual video display size)
        const targetWidth = videoRect.width;
        const targetHeight = videoRect.height;
        
        console.log('ML Extension: Scaling pose for video display:', {
            sourceSize: { width: sourceWidth, height: sourceHeight },
            targetSize: { width: targetWidth, height: targetHeight },
            firstKeypoint: { x: pose.keypoints[0].x, y: pose.keypoints[0].y }
        });
        
        // Calculate scale factors
        const scaleX = targetWidth / sourceWidth;
        const scaleY = targetHeight / sourceHeight;
        
        console.log('ML Extension: Video display scale factors:', { x: scaleX, y: scaleY });
        
        // Create scaled pose
        const scaledPose = {
            ...pose,
            keypoints: pose.keypoints.map(keypoint => ({
                ...keypoint,
                x: keypoint.x * scaleX,
                y: keypoint.y * scaleY
            }))
        };
        
        console.log('ML Extension: Scaled first keypoint for video display:', {
            original: { x: pose.keypoints[0].x, y: pose.keypoints[0].y },
            scaled: { x: scaledPose.keypoints[0].x, y: scaledPose.keypoints[0].y }
        });
        
        return scaledPose;
    }

    scalePoseForCanvas(pose, canvasWidth, canvasHeight) {
        if (!pose || !pose.keypoints) return pose;
        
        // Get source dimensions - use tmWebcam if available, otherwise use PoseNet defaults
        let sourceWidth = 640; // Default PoseNet resolution
        let sourceHeight = 480;
        
        if (this.tmWebcam && this.tmWebcam.canvas) {
            sourceWidth = this.tmWebcam.canvas.width;
            sourceHeight = this.tmWebcam.canvas.height;
            console.log('ML Extension: Using tmWebcam dimensions for scaling');
        } else {
            // For imageElement, use the actual video dimensions
            if (this.videoElement) {
                sourceWidth = this.videoElement.videoWidth || 640;
                sourceHeight = this.videoElement.videoHeight || 480;
                console.log('ML Extension: Using video element dimensions for scaling');
            }
        }
        
        // Calculate scaling factors
        const scaleX = canvasWidth / sourceWidth;
        const scaleY = canvasHeight / sourceHeight;
        
        console.log('ML Extension: Scaling pose for canvas:', {
            sourceSize: { width: sourceWidth, height: sourceHeight },
            canvasSize: { width: canvasWidth, height: canvasHeight },
            scale: { x: scaleX, y: scaleY },
            firstKeypoint: pose.keypoints[0] ? { x: pose.keypoints[0].x, y: pose.keypoints[0].y } : 'none',
            keypointCount: pose.keypoints.length,
            allKeypoints: pose.keypoints.map(kp => ({ x: kp.x, y: kp.y, part: kp.part, score: kp.score }))
        });
        
        // Create scaled pose object with validation
        const scaledPose = {
            ...pose,
            keypoints: pose.keypoints.map(keypoint => {
                // Validate keypoint coordinates
                const x = typeof keypoint.x === 'number' && !isNaN(keypoint.x) ? keypoint.x : 0;
                const y = typeof keypoint.y === 'number' && !isNaN(keypoint.y) ? keypoint.y : 0;
                
                return {
                    ...keypoint,
                    x: x * scaleX,
                    y: y * scaleY
                };
            })
        };
        
        console.log('ML Extension: Scaled first keypoint:', scaledPose.keypoints[0] ? { x: scaledPose.keypoints[0].x, y: scaledPose.keypoints[0].y } : 'none');
        
        return scaledPose;
    }

    // Scale pose keypoints to match canvas dimensions (legacy method)
    scalePoseKeypoints(pose, canvasWidth, canvasHeight) {
        if (!pose || !pose.keypoints) return pose;
        
        // Get the original video dimensions from the video element
        let videoWidth = 640; // Default PoseNet resolution
        let videoHeight = 480;
        
        if (this.videoElement) {
            videoWidth = this.videoElement.videoWidth || this.videoElement.clientWidth || 640;
            videoHeight = this.videoElement.videoHeight || this.videoElement.clientHeight || 480;
        }
        
        // For PoseNet, the coordinates are typically in 640x480 space
        // But we need to scale them to match our canvas size
        const poseNetWidth = 640;
        const poseNetHeight = 480;
        
        // Calculate scaling factors from PoseNet coordinates to canvas
        const scaleX = canvasWidth / poseNetWidth;
        const scaleY = canvasHeight / poseNetHeight;
        
        console.log('ML Extension: Scaling keypoints:', {
            poseNetSize: { width: poseNetWidth, height: poseNetHeight },
            videoSize: { width: videoWidth, height: videoHeight },
            canvasSize: { width: canvasWidth, height: canvasHeight },
            scale: { x: scaleX, y: scaleY },
            firstKeypoint: pose.keypoints[0] ? { x: pose.keypoints[0].x, y: pose.keypoints[0].y } : 'none'
        });
        
        // Create scaled pose object
        const scaledPose = {
            ...pose,
            keypoints: pose.keypoints.map(keypoint => ({
                ...keypoint,
                x: keypoint.x * scaleX,
                y: keypoint.y * scaleY
            }))
        };
        
        console.log('ML Extension: Scaled first keypoint:', scaledPose.keypoints[0] ? { x: scaledPose.keypoints[0].x, y: scaledPose.keypoints[0].y } : 'none');
        
        return scaledPose;
    }

    // Custom pose drawing fallback method
    drawPoseCustom(pose) {
        const minPartConfidence = 0.5;
        const keypoints = pose.keypoints;
        
        // Use the same scaling approach as the main drawing function
        const scaledPose = this.scalePoseKeypoints(pose, this.poseCanvas.width, this.poseCanvas.height);
        const scaledKeypoints = scaledPose.keypoints;

        // Set drawing style with more visible colors
        this.poseCtx.lineWidth = 6;
        this.poseCtx.strokeStyle = '#00ff00';
        this.poseCtx.fillStyle = '#00ff00';
        this.poseCtx.lineCap = 'round';
        this.poseCtx.lineJoin = 'round';

        // Draw keypoints using scaled coordinates
        scaledKeypoints.forEach((keypoint, index) => {
                    if (keypoint.score > minPartConfidence) {
                        this.poseCtx.beginPath();
                this.poseCtx.arc(keypoint.x, keypoint.y, 8, 0, 2 * Math.PI);
                        this.poseCtx.fill();
                    }
                });

        // Draw skeleton using scaled coordinates
                const connections = [
                    [0, 1], [0, 2], [1, 3], [2, 4], // Face
                    [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // Arms
                    [5, 11], [6, 12], [11, 12], // Torso
                    [11, 13], [12, 14], [13, 15], [14, 16] // Legs
                ];

                connections.forEach(([startIdx, endIdx]) => {
            const start = scaledKeypoints[startIdx];
            const end = scaledKeypoints[endIdx];

                    if (start && end && start.score > minPartConfidence && end.score > minPartConfidence) {
                        this.poseCtx.beginPath();
                this.poseCtx.moveTo(start.x, start.y);
                this.poseCtx.lineTo(end.x, end.y);
                        this.poseCtx.stroke();
                    }
                });
    }

    // Setup resize listener for pose canvas to handle fullscreen changes
    setupPoseCanvasResizeListener() {
        if (this.poseCanvasResizeHandler) return; // Already set up
        
        this.poseCanvasResizeHandler = () => {
            if (this.poseCanvas && this.poseKeypoints) {
                // Reposition the canvas when window resizes (including fullscreen changes)
                this.updatePoseCanvasPosition();
            }
        };
        
        // Listen for window resize events
        window.addEventListener('resize', this.poseCanvasResizeHandler);
        
        // Also listen for stage size changes by monitoring the stage canvas
        const checkStageChanges = () => {
            const stage = this.runtime.getTargetForStage();
            if (stage && stage.canvas) {
                const currentRect = stage.canvas.getBoundingClientRect();
                if (!this.lastStageRect || 
                    currentRect.width !== this.lastStageRect.width || 
                    currentRect.height !== this.lastStageRect.height ||
                    currentRect.left !== this.lastStageRect.left ||
                    currentRect.top !== this.lastStageRect.top) {
                    this.lastStageRect = currentRect;
                    this.updatePoseCanvasPosition();
                }
            }
            requestAnimationFrame(checkStageChanges);
        };
        checkStageChanges();
    }
    
    // Update pose canvas position to match current stage/video position
    updatePoseCanvasPosition() {
        if (!this.poseCanvas) return;
        
        try {
            // Find the video element in the Scratch stage
            const videoElement = this.findVideoElement();
            if (videoElement) {
                const videoRect = videoElement.getBoundingClientRect();
                
                // Position canvas directly over the video element
                this.poseCanvas.style.left = videoRect.left + 'px';
                this.poseCanvas.style.top = videoRect.top + 'px';
                this.poseCanvas.style.width = videoRect.width + 'px';
                this.poseCanvas.style.height = videoRect.height + 'px';
                
                console.log('ML Extension: Updated pose canvas position over video:', {
                    left: this.poseCanvas.style.left,
                    top: this.poseCanvas.style.top,
                    width: this.poseCanvas.style.width,
                    height: this.poseCanvas.style.height
                });
            } else {
                // Fallback: try to find stage area
                const stage = this.runtime.getTargetForStage();
                if (stage && stage.canvas) {
                    const stageRect = stage.canvas.getBoundingClientRect();
                    
                    // Position canvas over the stage
                    this.poseCanvas.style.left = stageRect.left + 'px';
                    this.poseCanvas.style.top = stageRect.top + 'px';
                    this.poseCanvas.style.width = stageRect.width + 'px';
                    this.poseCanvas.style.height = stageRect.height + 'px';
                    
                    console.log('ML Extension: Updated pose canvas position over stage:', {
                        left: this.poseCanvas.style.left,
                        top: this.poseCanvas.style.top,
                        width: this.poseCanvas.style.width,
                        height: this.poseCanvas.style.height
                    });
                }
            }
        } catch (error) {
            console.error('ML Extension: Error updating pose canvas position:', error);
        }
    }

    // Helper method to find the video element in the Scratch stage
    findVideoElement() {
        try {
            // First, try to use our stored video element
            if (this.videoElement && this.videoElement.srcObject && this.videoElement.srcObject.getVideoTracks().length > 0) {
                const rect = this.videoElement.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    console.log('ML Extension: Using stored video element:', rect);
                    return this.videoElement;
                }
            }
            
            // Look for video elements in the document
            const videos = document.querySelectorAll('video');
            for (let video of videos) {
                // Check if video is visible and has a video stream
                if (video.srcObject && video.srcObject.getVideoTracks().length > 0) {
                    const rect = video.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        console.log('ML Extension: Found video element:', rect);
                        return video;
                    }
                }
            }
            
            // Also check for canvas elements that might contain video
            const canvases = document.querySelectorAll('canvas');
            for (let canvas of canvases) {
                const rect = canvas.getBoundingClientRect();
                if (rect.width > 200 && rect.height > 150) { // Reasonable video size
                    console.log('ML Extension: Found potential video canvas:', rect);
                    return canvas;
                }
            }
            
            return null;
        } catch (error) {
            console.error('ML Extension: Error finding video element:', error);
            return null;
        }
    }

    // Modify video frame data to include pose keypoints and skeleton
    modifyVideoFrame(imageData) {
        try {
            if (!this.poseKeypoints || !this.poseKeypoints.keypoints || this.poseKeypoints.keypoints.length === 0) {
                return imageData; // Return original if no pose data
            }

            // Create a canvas to draw the modified frame
            if (!this.poseCanvas) {
                this.poseCanvas = document.createElement('canvas');
                this.poseCtx = this.poseCanvas.getContext('2d');
            }

            // Set canvas size to match video dimensions
            this.poseCanvas.width = imageData.width;
            this.poseCanvas.height = imageData.height;

            // Draw the original video frame
            this.poseCtx.putImageData(imageData, 0, 0);

            // Draw pose keypoints and skeleton on top
            const minPartConfidence = 0.3;
            const keypoints = this.poseKeypoints.keypoints;
            
            console.log('ML Extension: Drawing pose on video frame with', keypoints.length, 'keypoints');

            // Set drawing style
            this.poseCtx.lineWidth = 3;
            this.poseCtx.strokeStyle = '#00ff00'; // Bright green
            this.poseCtx.fillStyle = '#00ff00';

            // Draw keypoints (circles)
            keypoints.forEach((keypoint, index) => {
                if (keypoint.score > minPartConfidence) {
                    this.poseCtx.beginPath();
                    this.poseCtx.arc(keypoint.x, keypoint.y, 5, 0, 2 * Math.PI);
                    this.poseCtx.fill();
                }
            });

            // Draw skeleton connections
            const connections = [
                [0, 1], [0, 2], [1, 3], [2, 4], // Face
                [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // Arms
                [5, 11], [6, 12], [11, 12], // Torso
                [11, 13], [12, 14], [13, 15], [14, 16] // Legs
            ];

            connections.forEach(([startIdx, endIdx]) => {
                const start = keypoints[startIdx];
                const end = keypoints[endIdx];

                if (start && end && start.score > minPartConfidence && end.score > minPartConfidence) {
                    this.poseCtx.beginPath();
                    this.poseCtx.moveTo(start.x, start.y);
                    this.poseCtx.lineTo(end.x, end.y);
                    this.poseCtx.stroke();
                }
            });

            // Get the modified image data
            const modifiedImageData = this.poseCtx.getImageData(0, 0, this.poseCanvas.width, this.poseCanvas.height);
            console.log('ML Extension: Video frame modified with pose keypoints');
            
            return modifiedImageData;

        } catch (error) {
            console.error('ML Extension: Error modifying video frame:', error);
            return imageData; // Return original on error
        }
    }

    // Teachable Machine Library Loading
    async loadTeachableMachineLibraries() {
        return new Promise((resolve, reject) => {
            // Check if libraries are already loaded
            if (window.tf && window.tmImage) {
                resolve();
                return;
            }

            // Load TensorFlow.js
            const tfScript = document.createElement('script');
            tfScript.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js';
            tfScript.onload = () => {
                // Load Teachable Machine Image (not pose)
                const tmScript = document.createElement('script');
                tmScript.src = 'https://cdn.jsdelivr.net/npm/@teachablemachine/image@latest/dist/teachablemachine-image.min.js';
                tmScript.onload = () => resolve();
                tmScript.onerror = reject;
                document.head.appendChild(tmScript);
            };
            tfScript.onerror = reject;
            document.head.appendChild(tfScript);
        });
    }


    // Load Teachable Machine Model
    async loadTeachableMachineModel(url) {
        try {
            await this.loadTeachableMachineLibraries();
            
            const modelURL = url + 'model.json';
            const metadataURL = url + 'metadata.json';
            
            // Load the model and metadata
            this.tmModel = await window.tmImage.load(modelURL, metadataURL);
            
            // Get labels from metadata
            try {
                const response = await fetch(metadataURL);
                const metadata = await response.json();
                if (metadata.labels && Array.isArray(metadata.labels)) {
                    this.tmModelLabels = metadata.labels;
                    console.log('Teachable Machine: Labels loaded:', this.tmModelLabels);
                }
            } catch (e) {
                console.log('Teachable Machine: Could not fetch metadata, using default labels');
            }
            
            this.isTmModelLoaded = true;
            this.teachableLink = url;
            
            console.log('Teachable Machine: Model loaded successfully');
            console.log('Teachable Machine: Labels:', this.tmModelLabels);
            
            // Start prediction loop
            this.tmPredictionLoop();
            
            return true;
        } catch (error) {
            console.error('Teachable Machine: Failed to load model:', error);
            this.isTmModelLoaded = false;
            return false;
        }
    }










    // Teachable Machine Prediction Loop
    tmPredictionLoop() {
        // Always run the loop, but only predict when conditions are met
        setTimeout(() => this.tmPredictionLoop(), Math.max(33, this.runtime?.currentStepTime || 33));

        if (!this.isTmModelLoaded || !this.tmVideoEnabled) {
            return;
        }

        const time = Date.now();
        if (this.tmLastUpdate === null) {
            this.tmLastUpdate = time;
        }

        const offset = time - this.tmLastUpdate;

        // Only run predictions at the specified interval
        if (offset > TM_INTERVAL && this.tmIsPredicting === 0) {
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
        }
    }

    // Teachable Machine Prediction
    async tmPredictAllBlocks(frame) {
        if (!this.tmModel || !this.isTmModelLoaded) return;

        try {
            // Convert Scratch video frame to a format that Teachable Machine can handle
            let imageElement = null;
            
            if (frame && frame.data) {
                // If we have ImageData, convert it to a canvas
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
                // If it's already a canvas, use it directly
                imageElement = frame;
            } else if (frame && frame instanceof HTMLVideoElement) {
                // If it's a video element, use it directly
                imageElement = frame;
            } else if (frame && frame instanceof ImageBitmap) {
                // If it's an ImageBitmap, convert to canvas
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = frame.width;
                    canvas.height = frame.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(frame, 0, 0);
                    imageElement = canvas;
                } catch (bitmapError) {
                    console.warn('Teachable Machine: Could not convert ImageBitmap to canvas:', bitmapError.message);
                }
            }
            
            if (!imageElement) {
                console.warn('Teachable Machine: Could not convert frame to usable format');
                return;
            }
            
            // Now predict using the converted image element
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

    // Teachable Machine Helper Methods
    tmIsPrediction(label) {
        if (!this.tmCurrentPrediction) return false;
        return this.tmCurrentPrediction.label === label && this.tmCurrentPrediction.confidence >= this.tmConfidenceThreshold;
    }

    tmGetConfidenceForLabel(label) {
        return this.tmModelConfidences[label] || 0;
    }

    async tmSetVideoState(state) {
        try {
            if (state === 'on') {
                // Enable video using Scratch's video system
                if (this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video) {
                    try {
                        await this.runtime.ioDevices.video.enableVideo();
                        this.tmVideoEnabled = true;
                        this.tmIsDetecting = true;
                        console.log('Teachable Machine: Video enabled and detection started');
                        return;
                    } catch (videoError) {
                        console.warn('Teachable Machine: Could not enable video:', videoError.message);
                    }
                }
            } else {
                // Disable video
                if (this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video) {
                    try {
                        this.runtime.ioDevices.video.disableVideo();
                    } catch (e) {
                        console.warn('Teachable Machine: Could not disable video:', e.message);
                    }
                }
                this.tmVideoEnabled = false;
                this.tmIsDetecting = false;
                console.log('Teachable Machine: Video disabled and detection stopped');
            }
        } catch (error) {
            console.error('Teachable Machine: Failed to change video state:', error);
            this.tmVideoEnabled = false;
            this.tmIsDetecting = false;
        }
    }

    tmSetVideoTransparency(value) {
        if (!this.runtime || !this.runtime.ioDevices || !this.runtime.ioDevices.video) {
            console.error('Teachable Machine: Video system not available');
            return;
        }
        
        try {
            // Convert percentage to Scratch's ghost effect (0-100)
            const ghostValue = Math.max(0, Math.min(100, value));
            this.runtime.ioDevices.video.setPreviewGhost(ghostValue);
            console.log(`Teachable Machine: Video transparency set to ${ghostValue}%`);
        } catch (error) {
            console.error('Teachable Machine: Failed to set video transparency:', error);
        }
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

// Create specific label functions for dynamic labels
ML3Extension.prototype.label_cat = function() {
    return 'cat';
};

ML3Extension.prototype.label_flowers = function() {
    return 'flowers';
};

// Create Teachable Machine label methods
ML3Extension.prototype.getTmLabelValue = function(labelName) {
    if (this.tmModelConfidences && this.tmModelConfidences[labelName]) {
        return Math.min(100, Math.round(this.tmModelConfidences[labelName] * 100));
    }
    return 0;
};

// Teachable Machine Block Implementations
ML3Extension.prototype.tm_useModel = async function(args, util) {
    let url = args.url;
    
    console.log('Teachable Machine: tm_useModel called with args.url:', url);
    console.log('Teachable Machine: this.teachableLink:', this.teachableLink);
    
    // Check if we have a preloaded Teachable Machine link
    if (this.teachableLink) {
        console.log('Teachable Machine: Using preloaded link:', this.teachableLink);
        url = this.teachableLink;
    } else if (url && url.trim() && url !== 'Auto-Detected from URL') {
        // If no preloaded link, use the block argument (but not the default placeholder)
        console.log('Teachable Machine: Using block argument URL:', url);
        url = url.trim();
    } else {
        console.log('Teachable Machine: No valid URL provided and no preloaded link found');
        console.log('Teachable Machine: Please provide a valid Teachable Machine model URL');
        return;
    }
    
    if (url) {
        console.log('Teachable Machine: Loading model from:', url);
        const success = await this.loadTeachableMachineModel(url);
        if (success) {
            console.log('Teachable Machine: Model loaded successfully, ready for detection');
        } else {
            console.error('Teachable Machine: Failed to load model');
        }
    }
};

ML3Extension.prototype.tm_whenModelDetects = function(args, util) {
    const label = args.label;
    return this.tmIsPrediction(label);
};

ML3Extension.prototype.tm_modelPrediction = function(args, util) {
    if (this.tmCurrentPrediction) {
        return this.tmCurrentPrediction.label;
    }
    return '';
};

ML3Extension.prototype.tm_predictionIs = function(args, util) {
    const label = args.label;
    return this.tmIsPrediction(label);
};

ML3Extension.prototype.tm_confidenceFor = function(args, util) {
    const label = args.label;
    return this.tmGetConfidenceForLabel(label);
};

ML3Extension.prototype.tm_turnVideo = async function(args, util) {
    const state = args.state;
    await this.tmSetVideoState(state);
};

ML3Extension.prototype.tm_setVideoTransparency = function(args, util) {
    const value = args.value;
    this.tmSetVideoTransparency(value);
};

// Pose Recognition Block Implementations
ML3Extension.prototype.pose_useModel = async function(args, util) {
    const url = args.url;
    console.log('Pose Recognition: pose_useModel called with args.url:', url);
    console.log('Pose Recognition: this.teachableLink:', this.teachableLink);

    // Check if we have a preloaded Teachable Machine link
    if (url === 'Auto-Detected from URL' && this.teachableLink) {
        console.log('Pose Recognition: Using preloaded link:', this.teachableLink);
        await this.loadPoseModel(this.teachableLink);
    } else if (url && url !== 'Auto-Detected from URL') {
        console.log('Pose Recognition: Using block argument URL:', url);
        await this.loadPoseModel(url);
    } else {
        console.log('Pose Recognition: No valid URL provided and no preloaded link found');
        console.log('Pose Recognition: Please provide a valid Teachable Machine model URL');
        return;
    }

    if (this.isPoseModelLoaded) {
        console.log('Pose Recognition: Model loaded successfully, ready for detection');
    } else {
        console.error('Pose Recognition: Failed to load model');
    }
};

ML3Extension.prototype.pose_whenModelDetects = function(args, util) {
    const label = args.label;
    
    if (!this.isPoseModelLoaded || !this.poseCurrentPrediction) {
        return false;
    }
    
    return this.poseCurrentPrediction === label;
};

ML3Extension.prototype.pose_modelPrediction = function(args, util) {
    return this.poseCurrentPrediction || 'unknown';
};

ML3Extension.prototype.pose_predictionIs = function(args, util) {
    const label = args.label;
    
    if (!this.isPoseModelLoaded || !this.poseCurrentPrediction) {
        return false;
    }
    
    return this.poseCurrentPrediction === label;
};

ML3Extension.prototype.pose_confidenceFor = function(args, util) {
    const label = args.label;
    
    if (!this.isPoseModelLoaded || !this.poseModelConfidences) {
        return 0;
    }
    
    if (this.poseModelConfidences[label]) {
        return Math.min(100, Math.round(this.poseModelConfidences[label] * 100));
    }
    return 0;
};

ML3Extension.prototype.pose_turnVideo = async function(args, util) {
    const state = args.state;
    await this.poseSetVideoState(state);
};

ML3Extension.prototype.pose_setVideoTransparency = function(args, util) {
    const value = args.value;
    this.poseSetVideoTransparency(value);
};

// Pose Recognition Helper Methods
ML3Extension.prototype.poseSetVideoState = async function(state) {
    try {
        if (state === 'on') {
            if (!this.tmVideoEnabled) {
                await this.runtime.ioDevices.video.enableVideo();
                this.tmVideoEnabled = true;
                console.log('Pose Recognition: Video enabled and detection started');
            }
        } else if (state === 'off') {
            if (this.tmVideoEnabled) {
                try {
                    await this.runtime.ioDevices.video.disableVideo();
                } catch (e) {
                    console.warn('Pose Recognition: Could not disable video:', e.message);
                }
                this.tmVideoEnabled = false;
                console.log('Pose Recognition: Video disabled and detection stopped');
            }
        }
    } catch (error) {
        console.error('Pose Recognition: Failed to change video state:', error);
    }
};

ML3Extension.prototype.poseSetVideoTransparency = function(ghostValue) {
    try {
        if (this.runtime && this.runtime.ioDevices && this.runtime.ioDevices.video) {
            // Convert percentage to Scratch's ghost effect (0-100)
            const transparencyValue = Math.max(0, Math.min(100, ghostValue));
            this.runtime.ioDevices.video.setPreviewGhost(transparencyValue);
            console.log(`Pose Recognition: Video transparency set to ${transparencyValue}%`);
        } else {
            console.error('Pose Recognition: Video system not available');
        }
    } catch (error) {
        console.error('Pose Recognition: Failed to set video transparency:', error);
    }
};

// Make sprite say the prediction
ML3Extension.prototype.makeSpriteSayPrediction = function(prediction) {
    try {
        // Simple approach: just log the prediction for now
        // The actual speech can be handled by Scratch blocks
        console.log('ML Extension: Pose detected:', prediction);
        
        // Try to get the current target and use its say method
        const target = this.runtime.getEditingTarget();
        if (target && typeof target.say === 'function') {
            target.say(prediction, 2);
            console.log('ML Extension: Sprite saying prediction:', prediction);
        } else {
            console.log('ML Extension: Target does not support speech, prediction logged:', prediction);
        }
    } catch (error) {
        console.error('ML Extension: Error making sprite say prediction:', error);
        // Don't let speech errors break the pose detection
        console.log('ML Extension: Pose detected (speech failed):', prediction);
    }
};


module.exports = ML3Extension;
