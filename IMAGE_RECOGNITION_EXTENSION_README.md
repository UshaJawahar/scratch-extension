# Comprehensive Image Recognition Scratch Extension

## Overview

This is a complete Scratch extension for image recognition that integrates with the Neural Playground ML backend. The extension provides both image capture capabilities and machine learning functionality for image classification.

## Features

### 🖼️ Images Category (Green Blocks)

1. **costume image** - Returns the current sprite's costume as image data
2. **backdrop image** - Returns the current stage backdrop as image data  
3. **save screenshot to costume** - Captures entire screen and saves as costume
4. **webcam image** - Returns live webcam feed as image data

### 🤖 Dynamic Project Category (Dark Blue with ML Icon)

The category name is dynamically generated from the user's project data (e.g., "Cat vs Dog Classifier", "Emotion Detection").

1. **recognise image [IMAGE] (label)** - Returns predicted label from ML model
2. **recognise image [IMAGE] (confidence)** - Returns confidence score (0-100)
3. **add training data [IMAGE] [LABEL]** - Adds image to training dataset
4. **train new machine learning model** - Initiates ML model training
5. **is the machine learning model ready** - Checks training status
6. **Dynamic Label Blocks** - Auto-generated from project labels (e.g., "dogs", "cats")

### 📝 Text Classification (Existing)

1. **recognise text [TEXT] (label)** - Returns predicted label for text
2. **recognise text [TEXT] (confidence)** - Returns confidence score for text

## Technical Architecture

### Backend Integration

- **Base URL**: `http://localhost:8080`
- **Authentication**: Session-based with `sessionId` and `projectId`
- **Image Recognition**: EfficientNet models stored in Google Cloud Storage
- **Text Classification**: Enhanced logistic regression with exact match detection

### API Endpoints Used

```
POST /api/guests/session/{sessionId}/projects/{projectId}/predict-image
POST /api/guests/session/{sessionId}/projects/{projectId}/predict-image/url
GET  /api/guests/session/{sessionId}/projects/{projectId}/images
POST /api/guests/session/{sessionId}/projects/{projectId}/examples
POST /api/guests/session/{sessionId}/projects/{projectId}/train
GET  /api/guests/session/{sessionId}/projects/{projectId}
```

### Image Processing

- **Formats Supported**: JPEG, PNG, GIF, WebP
- **Size Limit**: 10MB maximum
- **Compression**: Automatic quality adjustment to meet size limits
- **Base64 Encoding**: All images converted to base64 for API transmission

### Camera Integration

- **Resolution**: 640x480 default
- **Permissions**: Automatic permission handling with user-friendly error messages
- **Cleanup**: Automatic camera cleanup on page unload
- **Error Handling**: Graceful fallback when camera unavailable

## Usage Examples

### Basic Image Recognition

```javascript
// Get costume image and recognize it
const image = costumeImage();
const label = recogniseImageLabel(image);
const confidence = recogniseImageConfidence(image);

// Use in Scratch blocks
if (recogniseImageLabel(costumeImage()) === "cat") {
    say("I see a cat!");
}
```

### Training a Model

```javascript
// Add training examples
addTrainingData(costumeImage(), "cat");
addTrainingData(backdropImage(), "dog");
addTrainingData(webcamImage(), "bird");

// Train the model
trainNewMachineLearningModel();

// Check if ready
if (isTheMachineLearningModelReady()) {
    say("Model is ready for predictions!");
}
```

### Dynamic Labels

```javascript
// Labels are automatically generated from your project
// If your project has labels: ["happy", "sad", "angry"]
// These blocks will be available:
const emotion = happy; // Returns "happy"
const mood = sad;      // Returns "sad"
const feeling = angry; // Returns "angry"
```

## Error Handling

The extension includes comprehensive error handling:

- **Network Errors**: User-friendly messages for connection issues
- **Authentication Errors**: Clear guidance for session/project issues
- **Image Validation**: Automatic validation of image data format and size
- **Camera Permissions**: Graceful handling of denied camera access
- **Training Errors**: Detailed feedback for training failures

## Configuration

### Environment Variables

The extension automatically detects session and project data from:

1. **URL Parameters**: `?sessionId=xxx&projectId=yyy`
2. **Local Storage**: `neural_playground_session_id` and `neural_playground_project_id`

### Local Development Setup

For local development, ensure your backend is running:

```bash
# Start the Neural Playground backend
# The extension will automatically connect to http://localhost:8080
```

The extension is configured to work with your local backend at `http://localhost:8080`.

### Backend Configuration

The extension uses a centralized configuration file for easy backend switching:

**File**: `packages/scratch-vm/src/extensions/scratch3_ml/config.js`

```javascript
module.exports = {
    API_BASE_URL: 'http://localhost:8080',  // Change this to switch backends
    COLOR_PRIMARY: '#4B5566',
    COLOR_SECONDARY: '#374151',
    DEFAULT_PROJECT_NAME: 'test',
    STORAGE_KEYS: { /* ... */ }
};
```

**Quick Backend Switching**:

Use the provided script to easily switch between backends:

```bash
# Switch to local development
node switch-backend.js local

# Switch to production
node switch-backend.js production

# Check current backend
node switch-backend.js status
```

### Project Setup

1. Create a project in Neural Playground
2. Add training images with labels
3. Use the extension with your session and project IDs
4. The extension will automatically load your project's labels and create dynamic blocks

## Development

### File Structure

```
packages/scratch-vm/src/extensions/scratch3_ml/
├── index.js                    # Main extension file
└── test-image-recognition-extension.js  # Test suite
```

### Key Classes and Methods

#### ML3Extension Class

- **Constructor**: Initializes extension with runtime
- **getInfo()**: Returns block definitions and menus
- **Image Processing**: Canvas manipulation and format conversion
- **API Integration**: Backend communication methods
- **Error Handling**: User-friendly error management

#### Image Processing Methods

- `captureSpriteCostume(sprite)` - Capture sprite's current costume
- `captureStageBackdrop()` - Capture stage backdrop
- `captureScreen()` - Screen capture using getDisplayMedia
- `captureWebcamImage()` - Capture from webcam
- `canvasToBase64(canvas)` - Convert canvas to base64
- `base64ToBlob(base64)` - Convert base64 to blob for API

#### API Integration Methods

- `predictImage(imageData)` - Send image for prediction
- `predictImageFromUrl(imageUrl)` - Predict from image URL
- `addTrainingExample(imageData, label)` - Add training data
- `trainModel()` - Start model training
- `checkTrainingStatus()` - Check training progress
- `getProjectImages()` - Get project's images and labels

#### Error Handling Methods

- `validateImageData(imageData)` - Validate image format and size
- `handleImagePredictionError(error, context)` - Handle prediction errors
- `handleTrainingError(error, context)` - Handle training errors
- `showUserMessage(message, type)` - Display user feedback

## Testing

Run the test suite to verify functionality:

```bash
node test-image-recognition-extension.js
```

The test suite covers:
- Extension initialization
- Image processing utilities
- Block definitions
- API integration
- Camera functionality
- Error handling
- Dynamic label generation
- Project data management

## Browser Compatibility

- **Chrome**: Full support
- **Firefox**: Full support
- **Safari**: Full support (iOS 11+)
- **Edge**: Full support

### Required APIs

- `navigator.mediaDevices.getUserMedia()` - Camera access
- `navigator.mediaDevices.getDisplayMedia()` - Screen capture
- `Canvas API` - Image processing
- `Blob API` - File handling
- `Fetch API` - HTTP requests

## Security Considerations

- **Image Data**: All images are processed locally before transmission
- **API Keys**: No API keys stored in extension (uses session-based auth)
- **Permissions**: Camera permissions requested only when needed
- **Data Validation**: All inputs validated before processing

## Performance Optimization

- **Image Compression**: Automatic compression to meet size limits
- **Caching**: API responses cached where appropriate
- **Lazy Loading**: Camera only initialized when needed
- **Memory Management**: Proper cleanup of resources

## Troubleshooting

### Common Issues

1. **"No project loaded"** - Check sessionId and projectId are set
2. **"Camera not supported"** - Use HTTPS and modern browser
3. **"Image too large"** - Images automatically compressed
4. **"Network error"** - Check internet connection and API status

### Debug Mode

Enable debug logging by opening browser console. All extension activities are logged with `ML Extension:` prefix.

## Future Enhancements

- **Real-time Video Processing**: Continuous video analysis
- **Batch Training**: Multiple image upload at once
- **Model Comparison**: A/B testing different models
- **Advanced Filters**: Image preprocessing options
- **Export/Import**: Save and load trained models

## License

This extension is part of the Neural Playground project and follows the same licensing terms.

## Support

For issues and questions:
1. Check the browser console for error messages
2. Verify your session and project IDs are correct
3. Ensure you're using a supported browser
4. Check the Neural Playground backend status

---

*This extension provides a complete image recognition solution for Scratch, seamlessly integrating with the Neural Playground ML backend to bring machine learning capabilities to young learners.*
