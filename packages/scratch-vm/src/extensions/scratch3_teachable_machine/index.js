const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const formatMessage = require('format-message');

// Global variables for the extension
let model = null;
let isModelLoaded = false;
let modelLabels = ['class1', 'class2', 'class3']; // Default labels
let originalLabels = ['class1', 'class2', 'class3']; // Store original labels without prefixes
let currentPrediction = null;
let confidenceThreshold = 0.8;
let teachableLink = '';
let isDetecting = false;
let runtime = null;
let videoEnabled = false;
let predictionInterval = null;
let lastUpdate = null;
let isPredicting = 0;
let modelConfidences = {};
let predictionState = {};

// Constants
const INTERVAL = 33; // Video refresh rate
const DIMENSIONS = [480, 360]; // Dimensions of the video frame

// Load TensorFlow.js and Teachable Machine libraries
function loadTeachableMachineLibraries() {
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

// Load model from Teachable Machine URL
async function loadModel(url) {
    try {
        await loadTeachableMachineLibraries();
        
        const modelURL = url + 'model.json';
        const metadataURL = url + 'metadata.json';
        
        // Load the model and metadata
        model = await window.tmImage.load(modelURL, metadataURL);
        
        // Get labels from metadata
        try {
            const response = await fetch(metadataURL);
            const metadata = await response.json();
            if (metadata.labels && Array.isArray(metadata.labels)) {
                // Store original labels and create formatted versions for display
                originalLabels = metadata.labels;
                modelLabels = metadata.labels;
                console.log('Teachable Machine: Original labels loaded:', originalLabels);
                console.log('Teachable Machine: Labels loaded:', modelLabels);
                
                // Force refresh the extension menus to show new labels
                if (typeof window !== 'undefined' && window.Scratch && window.Scratch.vm) {
                    try {
                        window.Scratch.vm.emit('BLOCKSINFO_UPDATE');
                        console.log('Teachable Machine: Extension menus refreshed with new labels');
                    } catch (e) {
                        console.log('Teachable Machine: Could not refresh menus:', e.message);
                    }
                }
            }
        } catch (e) {
            console.log('Teachable Machine: Could not fetch metadata, using default labels');
        }
        
        isModelLoaded = true;
        teachableLink = url;
        
        console.log('Teachable Machine: Model loaded successfully');
        console.log('Teachable Machine: Labels:', modelLabels);
        
        // Clear any existing error notifications
        clearModelErrors();
        
        return true;
    } catch (error) {
        console.error('Teachable Machine: Failed to load model:', error);
        isModelLoaded = false;
        
        // Show user-friendly error message
        let errorMessage = 'Failed to load model.';
        
        if (error.message && error.message.includes('404')) {
            errorMessage = 'Model not found. Please check if the URL is correct and the model exists.';
        } else if (error.message && error.message.includes('status code')) {
            errorMessage = 'Model server error. Please try again later.';
        } else if (error.message && error.message.includes('network')) {
            errorMessage = 'Network error. Please check your internet connection.';
        }
        
        showModelError(errorMessage);
        return false;
    }
}

// Main prediction loop - this is the key to making it work like MIT RAISE Playground
function predictionLoop() {
    if (!isModelLoaded || !videoEnabled) {
        setTimeout(predictionLoop, Math.max(100, INTERVAL));
        return;
    }

    const time = Date.now();
    if (lastUpdate === null) {
        lastUpdate = time;
    }
    
    const offset = time - lastUpdate;

    // Only run predictions at the specified interval
    if (offset > INTERVAL && isPredicting === 0) {
    try {
        let frame = null;
        
            // First try Scratch's video system
        if (runtime && runtime.ioDevices && runtime.ioDevices.video) {
                try {
                    // Try different frame formats to get the best one for Teachable Machine
                    
                                        // First try to get a canvas format (most compatible)
            try {
                frame = runtime.ioDevices.video.getFrame({
                    format: 'canvas',
                            dimensions: DIMENSIONS
                        });
                    } catch (canvasError) {
                        // Try image-data format
                    }
                    
                    // If canvas failed, try image-data
                    if (!frame) {
                        try {
                            frame = runtime.ioDevices.video.getFrame({
                                format: 'image-data',
                                dimensions: DIMENSIONS
                            });
                        } catch (imageDataError) {
                            // Try default format
                        }
                    }
                    
                    // If still no frame, try default format
                    if (!frame) {
                        try {
                            frame = runtime.ioDevices.video.getFrame({
                                dimensions: DIMENSIONS
                            });
                        } catch (defaultError) {
                            // All formats failed
                        }
                    }
                } catch (scratchError) {
                    // Scratch video system failed
                }
            }
            
            // If Scratch video failed, try fallback webcam
            if (!frame && window.webcam && window.webcam.canvas) {
                try {
                    frame = window.webcam.canvas;
                } catch (webcamError) {
                    // Fallback webcam failed
            }
        }
        
        if (frame) {
                lastUpdate = time;
                isPredicting = 1;
                predictAllBlocks(frame);
                isPredicting = 0;
            }
        } catch (e) {
            isPredicting = 0;
        }
    }

    setTimeout(predictionLoop, Math.max(50, INTERVAL));
}

// Predict all blocks for the current frame
async function predictAllBlocks(frame) {
    if (!model || !isModelLoaded) return;

    try {
        // Convert Scratch video frame to a format that Teachable Machine can handle
        let imageElement = null;
        
        if (frame && frame.data) {
            // If we have ImageData, convert it to a canvas
            try {
                const canvas = document.createElement('canvas');
                canvas.width = frame.width || DIMENSIONS[0];
                canvas.height = frame.height || DIMENSIONS[1];
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
        const prediction = await model.predict(imageElement);
            
            // Find highest confidence prediction
            let highestConfidence = 0;
            let bestPrediction = null;
            
            for (let i = 0; i < prediction.length; i++) {
            const probability = prediction[i].probability;
            const className = prediction[i].className;
            
            // Update confidence for reporter block
            modelConfidences[className] = probability;
            
            if (probability > highestConfidence) {
                highestConfidence = probability;
                    bestPrediction = {
                    label: className,
                    confidence: probability
                    };
                }
            }
            
            currentPrediction = bestPrediction;
            
                    // Store current prediction
        if (bestPrediction) {
            // Prediction stored for hat block evaluation
        }
            
    } catch (error) {
        console.error('Teachable Machine: Prediction failed:', error);
    }
}

// Get confidence for specific label
function getConfidenceForLabel(label) {
    return modelConfidences[label] || 0;
}

// Check if prediction matches label
function isPrediction(label) {
    if (!currentPrediction) return false;
    return currentPrediction.label === label && currentPrediction.confidence >= confidenceThreshold;
}

// Turn video on/off using Scratch's video system
async function setVideoState(state) {
    try {
        if (state === 'on') {
            // First try Scratch's video system
            if (runtime && runtime.ioDevices && runtime.ioDevices.video) {
            try {
                await runtime.ioDevices.video.enableVideo();
                videoEnabled = true;
                isDetecting = true;
                    console.log('Teachable Machine: Scratch video system enabled and detection started');
                    return;
            } catch (videoError) {
                console.warn('Teachable Machine: Could not enable Scratch video system:', videoError.message);
                }
            }
                
            // Fallback: setup our own webcam
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    try {
                    console.log('Teachable Machine: Setting up fallback webcam...');
                    const success = await setupFallbackWebcam();
                    if (success) {
                        videoEnabled = true;
                        isDetecting = true;
                        console.log('Teachable Machine: Fallback webcam setup successful, detection started');
                        return;
                    }
                    } catch (webcamError) {
                    console.error('Teachable Machine: Fallback webcam setup failed:', webcamError.message);
                    }
                }
            
            // If we get here, both methods failed
            throw new Error('Could not enable video with any method');
            
        } else {
            // Turn off video
            if (runtime && runtime.ioDevices && runtime.ioDevices.video) {
                try {
            runtime.ioDevices.video.disableVideo();
                } catch (e) {
                    console.warn('Teachable Machine: Could not disable Scratch video:', e.message);
                }
            }
            
            // Stop fallback webcam
            if (window.webcam && window.webcam.stream) {
                try {
                    window.webcam.stream.getTracks().forEach(track => track.stop());
                    window.webcam = null;
                } catch (e) {
                    console.warn('Teachable Machine: Could not stop fallback webcam:', e.message);
                }
            }
            
            videoEnabled = false;
            isDetecting = false;
            console.log('Teachable Machine: Video disabled and detection stopped');
        }
    } catch (error) {
        console.error('Teachable Machine: Failed to change video state:', error);
        videoEnabled = false;
        isDetecting = false;
    }
}

// Set video transparency using Scratch's video system
function setVideoTransparency(value) {
    if (!runtime || !runtime.ioDevices || !runtime.ioDevices.video) {
        console.error('Teachable Machine: Video system not available');
        return;
    }
    
    try {
        // Convert percentage to Scratch's ghost effect (0-100)
        const ghostValue = Math.max(0, Math.min(100, value));
        runtime.ioDevices.video.setPreviewGhost(ghostValue);
        console.log(`Teachable Machine: Video transparency set to ${ghostValue}%`);
    } catch (error) {
        console.error('Teachable Machine: Failed to set video transparency:', error);
    }
}

// Fallback webcam setup function
async function setupFallbackWebcam() {
    if (window.webcam && window.webcam.stream && window.webcam.stream.active) {
        console.log('Teachable Machine: Fallback webcam already active');
        return true;
    }
    
    try {
        console.log('Teachable Machine: Setting up fallback webcam...');
        
        // Create video element
        const video = document.createElement('video');
        video.width = DIMENSIONS[0];
        video.height = DIMENSIONS[1];
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        
        // Get user media
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: DIMENSIONS[0] },
                height: { ideal: DIMENSIONS[1] },
                facingMode: 'user'
            },
            audio: false
        });
        
        video.srcObject = stream;
        
        // Create canvas for predictions
        const canvas = document.createElement('canvas');
        canvas.width = DIMENSIONS[0];
        canvas.height = DIMENSIONS[1];
        const ctx = canvas.getContext('2d');
        
        // Store webcam reference
        window.webcam = {
            video: video,
            canvas: canvas,
            stream: stream,
            ctx: ctx
        };
        
        // Start drawing frames to canvas
        function drawFrame() {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                ctx.drawImage(video, 0, 0, DIMENSIONS[0], DIMENSIONS[1]);
            }
            requestAnimationFrame(drawFrame);
        }
        
        video.onloadedmetadata = () => {
            drawFrame();
            console.log('Teachable Machine: Fallback webcam setup complete');
        };
        
        return true;
    } catch (error) {
        console.error('Teachable Machine: Failed to setup fallback webcam:', error);
        return false;
    }
}

// Get URL parameters - improved to handle multiple formats
function getURLParameter(name) {
    // Try multiple ways to get the parameter
    const urlParams = new URLSearchParams(window.location.search);
    let value = urlParams.get(name);
    
    if (!value) {
        // Try hash parameters
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
        value = hashParams.get(name);
    }
    
    if (!value) {
        // Try different parameter names
        value = urlParams.get('teachableLink') || urlParams.get('teachable_link') || urlParams.get('link');
    }
    
    console.log(`Teachable Machine: Looking for parameter '${name}', found:`, value);
    return value;
}

// Extract project ID from Teachable Machine URL
function extractProjectId(url) {
    if (!url) return null;
    
    try {
        // Handle both full URLs and just project IDs
        if (url.includes('teachablemachine.withgoogle.com/models/')) {
            // Extract project ID from full URL - get everything after /models/ and before the next /
            const match = url.match(/teachablemachine\.withgoogle\.com\/models\/([^\/\?]+)/);
            if (match && match[1] && match[1].length > 3) {
                return match[1];
            }
        } else {
            // Assume it's just a project ID
            const projectId = url.trim();
            if (projectId.length > 3) {
                return projectId;
            }
        }
        } catch (e) {
        console.warn('Teachable Machine: Could not extract project ID from URL:', e.message);
    }
    
    return null;
}

// Construct full Teachable Machine URL from project ID
function constructTeachableMachineURL(projectId) {
    if (!projectId) return null;
    
    const baseURL = 'https://teachablemachine.withgoogle.com/models/';
    return baseURL + projectId + '/';
}

// Initialize extension with URL parameters
function initializeFromURL() {
    const link = getURLParameter('teachableLink');
    if (link) {
        console.log('Teachable Machine: Found teachableLink parameter:', link);
        
        // Extract project ID from the URL
        const projectId = extractProjectId(link);
        if (projectId) {
            // Construct the full URL
            const fullURL = constructTeachableMachineURL(projectId);
            console.log('Teachable Machine: Extracted project ID:', projectId);
            console.log('Teachable Machine: Constructed full URL:', fullURL);
            
            // Store the project ID globally for use in blocks
            window.teachableMachineProjectId = projectId;
            window.teachableMachineFullURL = fullURL;
            
            // Auto-load the model
            loadModel(fullURL);
            
                    // Force refresh the extension blocks to show the new URL
        setTimeout(() => {
            if (typeof window !== 'undefined' && window.Scratch && window.Scratch.vm) {
                try {
                    window.Scratch.vm.emit('BLOCKSINFO_UPDATE');
                    
                    // Also try to update the block text directly
                    updateUseModelBlockText(fullURL);
                } catch (e) {
                    // Silent fail
                }
            }
        }, 100);
            } else {
            console.error('Teachable Machine: Could not extract project ID from URL parameter');
            handleNoModelFound();
        }
    } else {
        console.error('Teachable Machine: No teachableLink parameter found in URL');
        handleNoModelFound();
    }
}

// Handle case when no valid model URL is found
function handleNoModelFound() {
    console.error('Teachable Machine: No valid model URL found. Please check the teachableLink parameter.');
    isModelLoaded = false;
    setDefaultLabels();
    showModelError('No valid model URL found. Please check the teachableLink parameter.');
}

// Show model error message in the UI
function showModelError(message) {
    try {
        // Try to show error in Scratch's notification system
    if (typeof window !== 'undefined' && window.Scratch && window.Scratch.vm) {
        try {
                // Try to use Scratch's built-in notification system
                if (window.Scratch.vm.emit) {
                    window.Scratch.vm.emit('SHOW_NOTIFICATION', {
                        message: `Teachable Machine: ${message}`,
                        type: 'error'
                    });
                }
        } catch (e) {
                // Fallback: create a custom error notification
                createCustomErrorNotification(message);
            }
        } else {
            // Fallback: create a custom error notification
            createCustomErrorNotification(message);
        }
    } catch (error) {
        // Last resort: console error
        console.error('Teachable Machine Error:', message);
    }
}

// Clear any existing model error notifications
function clearModelErrors() {
    try {
        const existingNotification = document.getElementById('teachable-machine-error');
        if (existingNotification) {
            existingNotification.remove();
        }
    } catch (error) {
        // Silent fail
    }
}

// Create a custom error notification in the UI
function createCustomErrorNotification(message) {
    try {
        // Remove any existing error notifications
        const existingNotification = document.getElementById('teachable-machine-error');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create error notification element
        const notification = document.createElement('div');
        notification.id = 'teachable-machine-error';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 400px;
            word-wrap: break-word;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 18px;">⚠️</span>
                <span>Teachable Machine: ${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; margin-left: 10px;">
                    ×
                </button>
            </div>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
        
    } catch (error) {
        console.error('Teachable Machine: Could not create error notification:', error);
    }
}

// Function to set default labels when no model is loaded
function setDefaultLabels() {
    modelLabels = ['class1', 'class2', 'class3'];
    
    // Force refresh the extension menus
    if (typeof window !== 'undefined' && window.Scratch && window.Scratch.vm) {
        try {
            window.Scratch.vm.emit('BLOCKSINFO_UPDATE');
        } catch (e) {
            // Silent fail
        }
    }
}

// Manual functions that can be called from console
window.clearTeachableMachineCallbacks = function() {
    // Function kept for compatibility
};

window.getTeachableMachineStatus = function() {
    return {
        isModelLoaded: isModelLoaded,
        videoEnabled: videoEnabled,
        isDetecting: isDetecting,
        currentPrediction: currentPrediction,
        labels: modelLabels,
        modelConfidences: modelConfidences
    };
};

window.getTeachableMachineLabels = function() {
    return { labels: modelLabels };
};

// Function to show URL detection status
window.showURLDetectionStatus = function() {
    const urlParam = getURLParameter('teachableLink');
    
    if (urlParam) {
        const projectId = extractProjectId(urlParam);
        const fullURL = constructTeachableMachineURL(projectId);
        return {
            urlParam: urlParam,
            projectId: projectId,
            fullURL: fullURL
        };
    } else {
        return {
            urlParam: null,
            projectId: null,
            fullURL: null
        };
    }
};

// Function to manually trigger URL detection
window.triggerURLDetection = function() {
    initializeFromURL();
    return window.showURLDetectionStatus();
};

// Function to manually set project ID
window.setProjectID = function(projectId) {
    if (projectId) {
        const fullURL = constructTeachableMachineURL(projectId);
        window.teachableMachineProjectId = projectId;
        window.teachableMachineFullURL = fullURL;
        
        // Auto-load the model
        loadModel(fullURL);
        
        // Refresh blocks to show new URL
        window.refreshTeachableMachineBlocks();
        
        // Update block text
        updateUseModelBlockText(fullURL);
        return true;
    } else {
        console.error('Teachable Machine: No project ID provided');
        return false;
    }
};

// Function to refresh extension blocks
window.refreshTeachableMachineBlocks = function() {
    if (typeof window !== 'undefined' && window.Scratch && window.Scratch.vm) {
        try {
            window.Scratch.vm.emit('BLOCKSINFO_UPDATE');
        } catch (e) {
            // Silent fail
        }
    }
};

// Function to update the useModel block text with the detected URL
function updateUseModelBlockText(url) {
    try {
        // Try to find and update the block in the workspace
        if (typeof window !== 'undefined' && window.Scratch && window.Scratch.vm && window.Scratch.vm.workspace) {
            const workspace = window.Scratch.vm.workspace;
            
            // Look for blocks with our opcode
            if (workspace.getAllBlocks) {
                const allBlocks = workspace.getAllBlocks();
                let updatedCount = 0;
                
                for (const block of allBlocks) {
                    if (block.type === 'tm_useModel') {
                        try {
                            // Try to update the block's field value
                            if (block.inputs && block.inputs.URL && block.inputs.URL.block) {
                                const inputBlock = block.inputs.URL.block;
                                if (inputBlock.fields && inputBlock.fields.TEXT) {
                                    inputBlock.fields.TEXT.value = url;
                                    updatedCount++;
                                }
                            }
                        } catch (blockError) {
                            // Silent fail
                        }
                    }
                }
                
                if (updatedCount > 0) {
                    // Force a workspace update
                    workspace.fireChangeListener();
                }
            }
        }
    } catch (error) {
        // Silent fail
    }
}

// Auto-initialize when extension loads - call immediately to set URL variables before blocks are rendered
initializeFromURL();

// Set default labels after initialization
setTimeout(setDefaultLabels, 1000);

// Make the updateUseModelBlockText function available globally
window.updateUseModelBlockText = updateUseModelBlockText;

// Make error clearing function available globally
window.clearTeachableMachineErrors = clearModelErrors;

// Main extension function that Scratch calls
function TeachableMachineExtension(runtimeInstance) {
    // Store runtime reference for video access
    runtime = runtimeInstance;
    
    console.log('Teachable Machine Extension: Runtime initialized:', !!runtime);
    console.log('Teachable Machine Extension: Video system available:', !!(runtime && runtime.ioDevices && runtime.ioDevices.video));
    
    // Start the prediction loop
    predictionLoop();
    
    // Cleanup function for when extension is unloaded
    const cleanup = () => {
        if (predictionInterval) {
            clearInterval(predictionInterval);
            predictionInterval = null;
        }
        console.log('Teachable Machine: Extension cleaned up');
    };
    
    // Register cleanup on runtime dispose
    if (runtime && runtime.on) {
        runtime.on('dispose', cleanup);
    }
    
    // Return the extension object
    return {
        getInfo() {
            return {
                id: 'tm',
                name: 'Teachable Machine',
                color1: '#800080',
                color2: '#800080',
                blocks: [
                    {
                        opcode: 'useModel',
                        blockType: BlockType.COMMAND,
                        text: formatMessage({
                            id: 'teachable_machine.useModel',
                            default: 'use model [url]',
                            description: 'Load a Teachable Machine model from URL or auto-detect from URL parameters'
                        }),
                        arguments: {
                            url: {
                                type: ArgumentType.STRING,
                                defaultValue: 'Auto-detected from URL'
                            }
                        },
                        iconURI: 'static/Neural Logo-Light Green.png'
                    },

                    {
                        opcode: 'whenModelDetects',
                        blockType: BlockType.HAT,
                        text: formatMessage({
                            id: 'teachable_machine.whenModelDetects',
                            default: 'when model detects [label]',
                            description: 'Trigger when a specific label is detected'
                        }),
                        arguments: {
                            label: {
                                type: ArgumentType.STRING,
                                menu: 'labels',
                                defaultValue: 'class1'
                            }
                        },
                        iconURI: 'static/Neural Logo-Light Green.png'
                    },
                    {
                        opcode: 'modelPrediction',
                        blockType: BlockType.REPORTER,
                        text: formatMessage({
                            id: 'teachable_machine.modelPrediction',
                            default: 'model prediction',
                            description: 'Get the current predicted label'
                        }),
                        iconURI: 'static/Neural Logo-Light Green.png'
                    },
                    {
                        opcode: 'predictionIs',
                        blockType: BlockType.BOOLEAN,
                        text: formatMessage({
                            id: 'teachable_machine.predictionIs',
                            default: 'prediction is [label]',
                            description: 'Check if current prediction matches a label'
                        }),
                        arguments: {
                            label: {
                                type: ArgumentType.STRING,
                                menu: 'labels',
                                defaultValue: 'class1'
                            }
                        },
                        iconURI: 'static/Neural Logo-Light Green.png'
                    },
                    {
                        opcode: 'confidenceFor',
                        blockType: BlockType.REPORTER,
                        text: formatMessage({
                            id: 'teachable_machine.confidenceFor',
                            default: 'confidence for [label]',
                            description: 'Get confidence score for a specific label'
                        }),
                        arguments: {
                            label: {
                                type: ArgumentType.STRING,
                                menu: 'labels',
                                defaultValue: 'class1'
                            }
                        },
                        iconURI: 'static/Neural Logo-Light Green.png'
                    },
                    {
                        opcode: 'turnVideo',
                        blockType: BlockType.COMMAND,
                        text: formatMessage({
                            id: 'teachable_machine.turnVideo',
                            default: 'turn video [state]',
                            description: 'Turn video on or off'
                        }),
                        arguments: {
                            state: {
                                type: ArgumentType.STRING,
                                menu: 'videoState',
                                defaultValue: 'on'
                            }
                        },
                        iconURI: 'static/Neural Logo-Light Green.png'
                    },
                    {
                        opcode: 'setVideoTransparency',
                        blockType: BlockType.COMMAND,
                        text: formatMessage({
                            id: 'teachable_machine.setVideoTransparency',
                            default: 'set video transparency to [value]',
                            description: 'Set video transparency level'
                        }),
                        arguments: {
                            value: {
                                type: ArgumentType.NUMBER,
                                defaultValue: 50
                            }
                        },
                        iconURI: 'static/Neural Logo-Light Green.png'
                    }
                ],
                menus: {
                    labels: {
                        acceptReporters: false,
                        items: () => {
                            // Always return valid labels, with fallback to defaults
                            if (modelLabels && Array.isArray(modelLabels) && modelLabels.length > 0) {
                                // Filter out any invalid labels and ensure they're strings
                                const validLabels = modelLabels.filter(label => 
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
                    videoState: {
                        acceptReporters: false,
                        items: ['on', 'off']
                    }
                },

            };
        },

        // Block implementations
        useModel: async function (args, util) {
            let url = args.url;
            
            // Check if we have a detected project ID from URL parameters
            if (window.teachableMachineProjectId && window.teachableMachineFullURL) {
                console.log('Teachable Machine: Using detected project ID:', window.teachableMachineProjectId);
                console.log('Teachable Machine: Using constructed URL:', window.teachableMachineFullURL);
                url = window.teachableMachineFullURL;
            } else if (url && url.trim()) {
                // If no detected project ID, use the block argument
                console.log('Teachable Machine: Using block argument URL:', url);
                url = url.trim();
            } else {
                console.log('Teachable Machine: No URL provided and no project ID detected');
                return;
            }
            
            if (url) {
                console.log('Teachable Machine: Loading model from:', url);
                const success = await loadModel(url);
                if (success) {
                    console.log('Teachable Machine: Model loaded successfully, ready for detection');
                } else {
                    // Error message already shown by loadModel function
                    console.error('Teachable Machine: Failed to load model');
                }
            }
        },

        // This is the key block - it returns a boolean that Scratch continuously checks
        whenModelDetects: function (args, util) {
            const label = args.label;
            
            // Return true if the current prediction matches this label
            // This is what makes the hat block work - Scratch keeps checking this condition
            const matches = isPrediction(label);
            
            return matches;
        },
        
        modelPrediction: function (args, util) {
            if (currentPrediction) {
                return currentPrediction.label;
            }
            return '';
        },
        
        predictionIs: function (args, util) {
            const label = args.label;
            return isPrediction(label);
        },
        
        confidenceFor: function (args, util) {
            const label = args.label;
            return getConfidenceForLabel(label);
        },
        
        turnVideo: async function (args, util) {
            const state = args.state;
            await setVideoState(state);
        },
        
        setVideoTransparency: function (args, util) {
            const value = args.value;
            setVideoTransparency(value);
        }
    };
}

// Extension loaded successfully

// Add utility functions to global scope
window.testTeachableMachineDetection = function(label) {
    return {
        currentPrediction: currentPrediction,
        wouldTrigger: isPrediction(label)
    };
};

window.checkTeachableMachineSetup = function() {
    return {
        modelLoaded: isModelLoaded,
        videoEnabled: videoEnabled,
        detectionActive: isDetecting,
        currentLabels: modelLabels,
        currentPrediction: currentPrediction,
        modelConfidences: modelConfidences,
        runtimeAvailable: !!runtime,
        videoSystemAvailable: !!(runtime && runtime.ioDevices && runtime.ioDevices.video)
    };
};

module.exports = TeachableMachineExtension;

