// Configuration for the ML Extension
// Update these values to match your backend setup

module.exports = {
    // API Configuration
    API_BASE_URL: 'https://playgroundai-backend-uaaur7no2a-uc.a.run.app',
    
    // Extension Colors - Dark grey as shown in the image
    COLOR_PRIMARY: '#4B5566',
    COLOR_SECONDARY: '#374151',
    
    // Default Project Name
    DEFAULT_PROJECT_NAME: 'test',
    
    // Storage Keys
    STORAGE_KEYS: {
        PROJECT_ID: 'ml_extension_project_id',
        SESSION_ID: 'ml_extension_session_id',
        PROJECT_NAME: 'ml_extension_project_name',
        PROJECT_LABELS: 'ml_extension_project_labels'
    }
};
