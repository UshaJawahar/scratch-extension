const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');

// Teachable Machine constants
const TM_INTERVAL = 33; // 30 FPS
const TM_DIMENSIONS = [480, 360];

class ML3Extension {
    constructor(runtime) {
        this.runtime = runtime;
        console.log('ML Extension: CLEAN VERSION LOADED - DYNAMIC BLOCKS');
        
        // Initialize with default values to prevent undefined errors
        this.projectName = null; // Will be set from API
        this.projectId = null;
        this.sessionId = null;
        this.projectLabels = ['Happy', 'Sad']; // Default labels to prevent undefined errors
        this.lastPrediction = null; // Store the last prediction result
        this.isRefreshing = false; // Prevent duplicate refreshes
        
        // Teachable Machine mode variables
        this.isTeachableMachineMode = false;
        this.teachableLink = null;
        this.tmModel = null;
        this.isTmModelLoaded = false;
        this.tmModelLabels = ['class1', 'class2', 'class3'];
        this.tmCurrentPrediction = null;
        this.tmConfidenceThreshold = 0.8;
        this.tmIsDetecting = false;
        this.tmVideoEnabled = false;
        this.tmModelConfidences = {};
        this.tmLastUpdate = null;
        this.tmIsPredicting = 0;
        
        // Make extension globally accessible for debugging
        if (typeof window !== 'undefined') {
            window.MLExtension = this;
            console.log('ML Extension: Made globally accessible as window.MLExtension');
        }
        
        // Initialize project data
        this.initializeProjectDataSync();
        
        // Set up periodic check for URL parameters (in case they're added after extension loads)
        if (typeof window !== 'undefined') {
            setTimeout(() => {
                this.checkForUrlParams();
            }, 1000);
            
            // Also listen for URL changes (for single-page applications)
            this.setupUrlChangeListener();
        }
        
        // Also run async initialization immediately to get project data
        this.initializeProjectDataAsync().then(() => {
            // Initialize Teachable Machine from URL parameters after ML data is loaded
            this.initializeTeachableMachineFromURL();
        });
        
        // Start the Teachable Machine prediction loop
        this.tmPredictionLoop();
    }

    extractUrlParams() {
        if (typeof window !== 'undefined' && window.location) {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionId = urlParams.get('sessionId');
            const projectId = urlParams.get('projectId');
            const teachableLink = urlParams.get('teachableLink');
            
            if (sessionId && projectId) {
                console.log(`ML Extension: Found URL params - Session: ${sessionId}, Project: ${projectId}`);
                
                // Clear localStorage first to ensure fresh data
                if (window.localStorage) {
                    window.localStorage.removeItem('ml_extension_session_id');
                    window.localStorage.removeItem('ml_extension_project_id');
                    window.localStorage.removeItem('ml_extension_teachable_link');
                    console.log('ML Extension: Cleared localStorage for fresh data');
                }
                
                // Save new data to localStorage
                window.localStorage.setItem('ml_extension_session_id', sessionId);
                window.localStorage.setItem('ml_extension_project_id', projectId);
                
                // Check for Teachable Machine link
                if (teachableLink) {
                    console.log(`ML Extension: Found teachableLink - ${teachableLink}`);
                    this.teachableLink = decodeURIComponent(teachableLink);
                    this.isTeachableMachineMode = true;
                    window.localStorage.setItem('ml_extension_teachable_link', this.teachableLink);
                } else {
                    this.isTeachableMachineMode = false;
                    window.localStorage.removeItem('ml_extension_teachable_link');
                }
                
                return { sessionId, projectId, teachableLink };
            }
        }
        return null;
    }

    checkForUrlParams() {
        console.log('ML Extension: Checking for URL parameters...');
        const urlParams = this.extractUrlParams();
        if (urlParams) {
            console.log('ML Extension: Found URL parameters, clearing state and reinitializing...');
            this.clearExtensionState();
            this.initializeProjectDataAsync();
        }
    }

    clearExtensionState() {
        console.log('ML Extension: Clearing extension state for fresh initialization');
        
        // Reset all state variables
        this.projectName = null;
        this.projectId = null;
        this.sessionId = null;
        this.projectLabels = ['Happy', 'Sad'];
        this.lastPrediction = null;
        this.isReady = false;
        this.isRefreshing = false;
        
        // Reset Teachable Machine state
        this.isTeachableMachineMode = false;
        this.teachableLink = null;
        this.tmModel = null;
        this.isTmModelLoaded = false;
        this.tmModelLabels = ['class1', 'class2', 'class3'];
        this.tmCurrentPrediction = null;
        this.tmConfidenceThreshold = 0.8;
        this.tmIsDetecting = false;
        this.tmVideoEnabled = false;
        this.tmModelConfidences = {};
        this.tmLastUpdate = null;
        this.tmIsPredicting = 0;
        
        console.log('ML Extension: Extension state cleared');
    }

    setupUrlChangeListener() {
        if (typeof window === 'undefined') return;
        
        let currentUrl = window.location.href;
        
        // Check for URL changes every 500ms
        setInterval(() => {
            if (window.location.href !== currentUrl) {
                console.log('ML Extension: URL changed, reinitializing...');
                currentUrl = window.location.href;
                this.checkForUrlParams();
            }
        }, 500);
        
        // Also listen for popstate events (back/forward navigation)
        window.addEventListener('popstate', () => {
            console.log('ML Extension: Popstate event, checking URL...');
            this.checkForUrlParams();
        });
        
        console.log('ML Extension: URL change listener setup complete');
    }

    // Synchronous initialization - runs immediately
    initializeProjectDataSync() {
        console.log('ML Extension: Running synchronous initialization...');
        
        // Set default values to ensure getInfo() works
        this.projectName = null; // Will be set from API
        this.projectId = null;
        this.sessionId = null;
        this.projectLabels = ['Happy', 'Sad'];
        this.lastPrediction = null;
        this.isReady = false;
        
        // Don't mark as ready until we have real data
        console.log('ML Extension: Synchronous initialization complete - waiting for API data');
    }

    // Asynchronous initialization - runs after constructor
    async initializeProjectDataAsync() {
        console.log('ML Extension: Running asynchronous initialization...');
        
        if (typeof window !== 'undefined' && window.localStorage) {
            // Always prioritize URL params over localStorage
            const urlParams = this.extractUrlParams();
            
            let projectId, sessionId;
            
            if (urlParams) {
                // Use URL params if available
                projectId = urlParams.projectId;
                sessionId = urlParams.sessionId;
                console.log('ML Extension: Using URL parameters for fresh data');
            } else {
                // Fallback to localStorage only if no URL params
                projectId = window.localStorage.getItem('ml_extension_project_id');
                sessionId = window.localStorage.getItem('ml_extension_session_id');
                console.log('ML Extension: Using localStorage data (no URL params)');
            }
            
            if (projectId && sessionId) {
                this.projectId = projectId;
                this.sessionId = sessionId;
                
                console.log(`ML Extension: Using project data - ID: ${projectId}, Session: ${sessionId}`);
                
                // Fetch project data from API
                try {
                    const response = await fetch(`https://playgroundai-backend-uaaur7no2a-uc.a.run.app/api/guests/session/${sessionId}/projects/${projectId}`);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.data) {
                            this.projectName = data.data.name;
                            this.projectLabels = data.data.dataset?.labels || data.data.model?.labels || [];
                            console.log(`ML Extension: Project data loaded from API - Name: ${this.projectName}, Labels: ${this.projectLabels.join(', ')}`);
                            
                            // Add dynamic label block methods for each label
                            this.addDynamicLabelMethods();
                            
                            // Mark as ready only after getting real data
                            this.isReady = true;
                            console.log('ML Extension: Extension is now ready with real project data');
                        } else {
                            this.projectName = null;
                            this.projectLabels = ['Happy', 'Sad'];
                            this.isReady = false;
                            console.log('ML Extension: API response not successful, extension not ready');
                        }
                    } else {
                        this.projectName = null;
                        this.projectLabels = ['Happy', 'Sad'];
                        this.isReady = false;
                        console.log('ML Extension: Failed to fetch project data, extension not ready');
                    }
                } catch (error) {
                    this.projectName = null;
                    this.projectLabels = ['Happy', 'Sad'];
                    this.isReady = false;
                    console.error('ML Extension: Error fetching project data:', error);
                }
            } else {
                this.projectName = null;
                this.projectId = null;
                this.sessionId = null;
                this.projectLabels = ['Happy', 'Sad'];
                this.isReady = false;
                console.log('ML Extension: No project data found, extension not ready');
            }
        } else {
            this.projectName = null;
            this.projectId = null;
            this.sessionId = null;
            this.projectLabels = ['Happy', 'Sad'];
            this.isReady = false;
        }
        
        console.log('ML Extension: Asynchronous initialization complete');
    }

    addDynamicLabelMethods() {
        // Add a method for each label from the API
        const self = this; // Store reference to 'this'
        this.projectLabels.forEach(label => {
            // Use arrow function to preserve 'this' context, or use 'self'
            this[`label_${label}`] = (args, util) => {
                console.log(`ML Extension: label_${label} block called`);
                return label;
            };
        });
        
        console.log('ML Extension: Dynamic label methods added for:', this.projectLabels);
    }

    getInfo() {
        console.log('ML Extension: getInfo() called - CREATING DYNAMIC BLOCKS');
        console.log('ML Extension: Current projectLabels:', this.projectLabels);
        console.log('ML Extension: isReady:', this.isReady);
        console.log('ML Extension: isTeachableMachineMode:', this.isTeachableMachineMode);
        
        // Safety check - ensure we have valid data
        if (!this.isReady) {
            console.log('ML Extension: Not ready, returning minimal blocks');
            return {
                id: 'ml',
                name: 'Initializing...',
                color1: '#800080',
                color2: '#800080',
                blocks: [],
                menus: {}
            };
        }
        
        // Check if we're in Teachable Machine mode
        if (this.isTeachableMachineMode) {
            console.log('ML Extension: Returning Teachable Machine blocks');
            return this.getTeachableMachineInfo();
        }
        
        // Ensure projectLabels is always an array to prevent map errors
        const labels = Array.isArray(this.projectLabels) ? this.projectLabels : ['Happy', 'Sad'];
        
        // Create dynamic label blocks based on API response
        const dynamicLabelBlocks = labels.map(label => ({
            opcode: `label_${label}`,
            blockType: BlockType.REPORTER,
            text: formatMessage({
                id: `ml.label_${label}`,
                default: label,
                description: `Represents the "${label}" label from your project`
            })
        }));
        
        // Only the 2 main blocks plus dynamic label blocks
        const allBlocks = [
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
            ...dynamicLabelBlocks
        ];
        
        console.log(`ML Extension: Project: ${this.projectName}, Labels: ${labels.join(', ')}, Total blocks: ${allBlocks.length}`);
        
        return {
            id: 'ml',
            name: this.projectName || 'Loading...',
            color1: '#4B5566',
            color2: '#374151',
            blocks: allBlocks,
            menus: {}
        };
    }

    async recogniseTextLabel(args, util) {
        const text = args.TEXT;
        console.log(`ML Extension: recogniseTextLabel called with text: "${text}"`);
        
        if (!this.sessionId || !this.projectId) {
            console.warn('ML Extension: Missing session or project ID for prediction');
            return 'Error: No project loaded';
        }
        
        try {
            console.log(`ML Extension: Making prediction API call to: /api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`);
            
            // Make API call to get prediction using the correct endpoint
            const response = await fetch(`https://playgroundai-backend-uaaur7no2a-uc.a.run.app/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`, {
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

    async recogniseTextConfidence(args, util) {
        const text = args.TEXT;
        console.log(`ML Extension: recogniseTextConfidence called with text: "${text}"`);
        
        if (!this.sessionId || !this.projectId) {
            console.warn('ML Extension: Missing session or project ID for prediction');
            return 0;
        }
        
        try {
            console.log(`ML Extension: Making confidence API call to: /api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`);
            
            // Make API call to get prediction using the correct endpoint
            const response = await fetch(`https://playgroundai-backend-uaaur7no2a-uc.a.run.app/api/guests/session/${this.sessionId}/projects/${this.projectId}/predict`, {
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
                
                if (data.success && data.confidence !== undefined) {
                    // Store the last prediction with confidence
                    this.lastPrediction = `${data.label || 'Unknown'} (${data.confidence}%)`;
                    return data.confidence;
                } else {
                    console.warn('ML Extension: No confidence in response:', data);
                    this.lastPrediction = 'Unknown (0%)';
                    return 0;
                }
            } else {
                console.error('ML Extension: Confidence request failed:', response.status);
                this.lastPrediction = 'Error: Request failed';
                return 0;
            }
        } catch (error) {
            console.error('ML Extension: Error getting confidence:', error);
            return 0;
        }
    }

    // Block implementation for setting project data
    setProjectData(args, util) {
        const sessionId = args.SESSION_ID;
        const projectId = args.PROJECT_ID;
        
        if (sessionId && projectId) {
            this.sessionId = sessionId;
            this.projectId = projectId;
            
            // Save to localStorage
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem('ml_extension_session_id', sessionId);
                window.localStorage.setItem('ml_extension_project_id', projectId);
            }
            
            console.log(`ML Extension: Block set project data - Session: ${sessionId}, Project: ${projectId}`);
            
            // Re-fetch project data
            this.initializeProjectDataAsync();
        }
    }

    // Block implementation for getting project name
    getProjectName(args, util) {
        return this.projectName || '';
    }

    // Block implementation for getting project labels
    getProjectLabels(args, util) {
        if (Array.isArray(this.projectLabels) && this.projectLabels.length > 0) {
            return this.projectLabels.join(', ');
        }
        return 'Happy, Sad';
    }

    // Debug method to manually set session and project IDs (for console use)
    setProjectDataManually(sessionId, projectId) {
        if (sessionId && projectId) {
            this.sessionId = sessionId;
            this.projectId = projectId;
            
            // Save to localStorage
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem('ml_extension_session_id', sessionId);
                window.localStorage.setItem('ml_extension_project_id', projectId);
            }
            
            console.log(`ML Extension: Manually set project data - Session: ${sessionId}, Project: ${projectId}`);
            
            // Re-fetch project data
            this.initializeProjectDataAsync();
        }
    }

    // Block implementation for refreshing the extension
    refreshExtension(args, util) {
        console.log('ML Extension: Refreshing extension from block...');
        this.initializeProjectDataAsync();
        
        // Notify the runtime that the extension has changed
        if (this.runtime && this.runtime.emit) {
            this.runtime.emit('EXTENSION_ADDED', 'ml');
        }
    }

    // Block implementation for checking if extension is ready
    isExtensionReady(args, util) {
        return !!(this.sessionId && this.projectId && this.projectLabels && this.projectLabels.length > 0);
    }

    // Block implementation for getting session ID
    getSessionId(args, util) {
        return this.sessionId || 'No session ID set';
    }

    // Block implementation for getting project ID
    getProjectId(args, util) {
        return this.projectId || 'No project ID set';
    }

    // Block implementation for clearing project data
    clearProjectData(args, util) {
        console.log('ML Extension: Clearing project data from block...');
        
        // Clear project data
        this.sessionId = null;
        this.projectId = null;
        this.projectName = null;
        this.projectLabels = ['Happy', 'Sad'];
        this.lastPrediction = null;
        
        // Clear localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('ml_extension_session_id');
            window.localStorage.removeItem('ml_extension_project_id');
            window.localStorage.removeItem('ml_extension_project_name');
        }
        
        console.log('ML Extension: Project data cleared');
    }

    // Block implementation for testing API connection
    async testAPIConnection(args, util) {
        console.log('ML Extension: Testing API connection from block...');
        
        if (!this.sessionId || !this.projectId) {
            console.warn('ML Extension: Cannot test API without session and project IDs');
            return;
        }
        
        try {
            const response = await fetch(`https://playgroundai-backend-uaaur7no2a-uc.a.run.app/api/guests/session/${this.sessionId}/projects/${this.projectId}`);
            if (response.ok) {
                console.log('ML Extension: API connection test successful');
            } else {
                console.warn(`ML Extension: API connection test failed with status ${response.status}`);
            }
        } catch (error) {
            console.error('ML Extension: API connection test error:', error);
        }
    }

    // Block implementation for waiting for extension to be ready
    waitForReady(args, util) {
        console.log('ML Extension: waitForReady block called');
        
        if (this.isReady) {
            console.log('ML Extension: Extension is already ready');
            return;
        }
        
        // Wait a bit and check again
        setTimeout(() => {
            if (this.isReady) {
                console.log('ML Extension: Extension is now ready');
            } else {
                console.log('ML Extension: Extension still not ready');
            }
        }, 1000);
    }

    // Method to force extension to be ready (for debugging)
    forceReady() {
        console.log('ML Extension: Force setting extension to ready');
        this.isReady = true;
        this.projectLabels = this.projectLabels || ['Happy', 'Sad'];
        
        // Notify runtime that extension has changed
        if (this.runtime && this.runtime.emit) {
            this.runtime.emit('EXTENSION_ADDED', 'ml');
        }
    }

    // Method to manually trigger async initialization (for debugging)
    async manualInit() {
        console.log('ML Extension: Manual initialization triggered');
        await this.initializeProjectDataAsync();
        
        // Force refresh the extension
        if (this.runtime && this.runtime.emit) {
            this.runtime.emit('EXTENSION_ADDED', 'ml');
        }
    }

    // Method to manually set project labels (for debugging)
    setProjectLabels(labels) {
        console.log('ML Extension: Manually setting project labels:', labels);
        this.projectLabels = Array.isArray(labels) ? labels : ['Happy', 'Sad'];
        this.isReady = true;
        
        // Force refresh the extension
        if (this.runtime && this.runtime.emit) {
            this.runtime.emit('EXTENSION_ADDED', 'ml');
        }
    }

    // Method to manually set project data for testing
    setProjectDataForTesting(sessionId, projectId) {
        console.log('ML Extension: Setting project data for testing:', { sessionId, projectId });
        this.sessionId = sessionId;
        this.projectId = projectId;
        
        // Save to localStorage
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem('ml_extension_session_id', sessionId);
            window.localStorage.setItem('ml_extension_project_id', projectId);
        }
        
        // Re-fetch project data
        this.initializeProjectDataAsync();
    }

    // Block implementation for getting last prediction
    getLastPrediction(args, util) {
        return this.lastPrediction || 'No predictions yet';
    }

    // Block implementation for showing status in console
    showStatus(args, util) {
        const status = this.getStatus();
        console.log('ML Extension Status:', status);
        console.log('ML Extension: Session ID:', status.sessionId);
        console.log('ML Extension: Project ID:', status.projectId);
        console.log('ML Extension: Project Name:', status.projectName);
        console.log('ML Extension: Project Labels:', status.projectLabels);
        console.log('ML Extension: Last Prediction:', status.lastPrediction);
    }

    // Debug method to get current status
    getStatus() {
        return {
            sessionId: this.sessionId,
            projectId: this.projectId,
            projectName: this.projectName,
            projectLabels: this.projectLabels,
            lastPrediction: this.lastPrediction,
            isReady: this.isReady,
            localStorage: {
                sessionId: typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('ml_extension_session_id') : null,
                projectId: typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('ml_extension_project_id') : null
            }
        };
    }

    // Debug method to check what's happening
    debugState() {
        console.log('=== ML Extension Debug State ===');
        console.log('isReady:', this.isReady);
        console.log('projectLabels:', this.projectLabels);
        console.log('projectLabels type:', typeof this.projectLabels);
        console.log('projectLabels isArray:', Array.isArray(this.projectLabels));
        console.log('projectLabels length:', this.projectLabels ? this.projectLabels.length : 'undefined');
        console.log('sessionId:', this.sessionId);
        console.log('projectId:', this.projectId);
        console.log('projectName:', this.projectName);
        console.log('lastPrediction:', this.lastPrediction);
        console.log('================================');
    }

    // Method to refresh the extension (useful when new project data is loaded)
    refreshExtension() {
        console.log('ML Extension: Refreshing extension...');
        this.initializeProjectDataAsync();
        
        // Force ready state and notify the runtime that the extension has changed
        this.isReady = true;
        if (this.runtime && this.runtime.emit) {
            this.runtime.emit('EXTENSION_ADDED', 'ml');
        }
    }

    // Method to force refresh with new labels
    forceRefreshWithLabels(labels) {
        console.log('ML Extension: Force refreshing with labels:', labels);
        
        // Prevent duplicate refreshes
        if (this.isRefreshing) {
            console.log('ML Extension: Already refreshing, skipping...');
            return;
        }
        
        this.isRefreshing = true;
        
        // Update labels
        this.projectLabels = Array.isArray(labels) ? labels : ['Happy', 'Sad'];
        this.isReady = true;
        
        // Add dynamic methods for new labels
        this.addDynamicLabelMethods();
        
        // Notify runtime that extension has changed
        if (this.runtime && this.runtime.emit) {
            console.log('ML Extension: Emitting EXTENSION_ADDED event');
            this.runtime.emit('EXTENSION_ADDED', 'ml');
        }
        
        // Reset refresh flag after a delay
        setTimeout(() => {
            this.isRefreshing = false;
        }, 1000);
        
        console.log('ML Extension: Extension refreshed with labels:', this.projectLabels);
    }

    // Method to check if a label method exists
    hasLabelMethod(label) {
        return typeof this[`label_${label}`] === 'function';
    }

    // Method to list all available label methods
    listLabelMethods() {
        const methods = [];
        this.projectLabels.forEach(label => {
            if (this.hasLabelMethod(label)) {
                methods.push(`label_${label}`);
            }
        });
        return methods;
    }

    // Teachable Machine Info Method
    getTeachableMachineInfo() {
        console.log('ML Extension: Creating Teachable Machine blocks');
        console.log('ML Extension: Using project name for Teachable Machine:', this.projectName);
        
        return {
            id: 'ml',
            name: this.projectName || 'Loading...',
            color1: '#800080',
            color2: '#800080',
            blocks: [
                {
                    opcode: 'tm_useModel',
                    blockType: BlockType.COMMAND,
                    text: 'use model [url]',
                    arguments: {
                        url: {
                            type: ArgumentType.STRING,
                            defaultValue: 'Auto-detected from URL'
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
            ],
            menus: {
                tm_labels: {
                    acceptReporters: false,
                    items: () => {
                        // Always return valid labels, with fallback to defaults
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
                        
                        // Fallback to default labels
                        return [['class1', 'class1'], ['class2', 'class2'], ['class3', 'class3']];
                    }
                },
                tm_videoState: {
                    acceptReporters: false,
                    items: ['on', 'off']
                }
            }
        };
    }

    // Teachable Machine Functions
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
            
            // Note: Extension refresh will happen automatically when getInfo() is called next
            
            return true;
        } catch (error) {
            console.error('Teachable Machine: Failed to load model:', error);
            this.isTmModelLoaded = false;
            return false;
        }
    }

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

    async initializeTeachableMachineFromURL() {
        // Check if we have a teachable link from URL or localStorage
        if (this.teachableLink) {
            console.log('ML Extension: Initializing Teachable Machine with link:', this.teachableLink);
            await this.loadTeachableMachineModel(this.teachableLink);
            // Also fetch project name from backend API
            await this.fetchTeachableMachineProjectName();
        } else if (typeof window !== 'undefined' && window.localStorage) {
            const storedLink = window.localStorage.getItem('ml_extension_teachable_link');
            if (storedLink) {
                this.teachableLink = storedLink;
                this.isTeachableMachineMode = true;
                console.log('ML Extension: Found stored Teachable Machine link:', this.teachableLink);
                await this.loadTeachableMachineModel(this.teachableLink);
                // Also fetch project name from backend API
                await this.fetchTeachableMachineProjectName();
            }
        }
        
        // Mark as ready after Teachable Machine initialization
        this.isReady = true;
        console.log('ML Extension: Teachable Machine initialization complete');
    }

    async fetchTeachableMachineProjectName() {
        if (!this.sessionId || !this.projectId) {
            console.log('ML Extension: No session or project ID for Teachable Machine project name fetch');
            return;
        }

        try {
            console.log(`ML Extension: Fetching Teachable Machine project name from API: /api/guests/session/${this.sessionId}/projects/${this.projectId}`);
            
            const response = await fetch(`https://playgroundai-backend-uaaur7no2a-uc.a.run.app/api/guests/session/${this.sessionId}/projects/${this.projectId}`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data) {
                    this.projectName = data.data.name;
                    console.log(`ML Extension: Teachable Machine project name loaded from API: ${this.projectName}`);
                } else {
                    console.log('ML Extension: API response not successful for Teachable Machine project name, extension not ready');
                    this.projectName = null;
                    this.isReady = false;
                }
            } else {
                console.log('ML Extension: Failed to fetch Teachable Machine project name, extension not ready');
                this.projectName = null;
                this.isReady = false;
            }
            
            // Note: Extension refresh will happen automatically when getInfo() is called next
        } catch (error) {
            console.error('ML Extension: Error fetching Teachable Machine project name:', error);
            this.projectName = null;
            this.isReady = false;
            
            // Don't emit extension refresh if there was an error
            // This prevents the blocks.jsx error
            return;
        }
    }

    // Teachable Machine Block Implementations
    async tm_useModel(args, util) {
        let url = args.url;
        
        // Check if we have a detected project ID from URL parameters
        if (this.teachableLink) {
            console.log('Teachable Machine: Using detected link:', this.teachableLink);
            url = this.teachableLink;
        } else if (url && url.trim()) {
            // If no detected link, use the block argument
            console.log('Teachable Machine: Using block argument URL:', url);
            url = url.trim();
        } else {
            console.log('Teachable Machine: No URL provided and no link detected');
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
    }

    tm_whenModelDetects(args, util) {
        const label = args.label;
        return this.tmIsPrediction(label);
    }
    
    tm_modelPrediction(args, util) {
        if (this.tmCurrentPrediction) {
            return this.tmCurrentPrediction.label;
        }
        return '';
    }
    
    tm_predictionIs(args, util) {
        const label = args.label;
        return this.tmIsPrediction(label);
    }
    
    tm_confidenceFor(args, util) {
        const label = args.label;
        return this.tmGetConfidenceForLabel(label);
    }
    
    async tm_turnVideo(args, util) {
        const state = args.state;
        await this.tmSetVideoState(state);
    }
    
    tm_setVideoTransparency(args, util) {
        const value = args.value;
        this.tmSetVideoTransparency(value);
    }
}

module.exports = ML3Extension;