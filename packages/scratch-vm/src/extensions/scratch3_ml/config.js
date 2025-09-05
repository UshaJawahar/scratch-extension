// Configuration for the ML Extension
// Update these values to match your backend setup

module.exports = {
    API_BASE_URL: 'https://playgroundai-backend-uaaur7no2a-uc.a.run.app',
    DEFAULT_PROJECT_NAME: 'sample', // Default name matching your image
    COLOR_PRIMARY: '#4B5566',
    COLOR_SECONDARY: '#374151',
    STORAGE_KEYS: {
        SESSION_ID: 'ml_extension_session_id',
        PROJECT_ID: 'ml_extension_project_id',
        PROJECT_NAME: 'ml_extension_project_name'
    },
    ENDPOINTS: {
        PROJECT: '/api/guests/session/{session_id}/projects/{project_id}', // GET endpoint for project info
        EXAMPLES: '/api/guests/session/{session_id}/projects/{project_id}/examples',
        TRAIN: '/api/guests/session/{session_id}/projects/{project_id}/train',
        PREDICT: '/api/guests/session/{session_id}/projects/{project_id}/predict'
    },
    ERROR_MESSAGES: {
        NO_SESSION_ID: 'Session ID not available',
        NO_PROJECT_ID: 'Project ID not available',
        API_CALL_FAILED: 'API call failed',
        FETCH_PROJECT_NAME_FAILED: 'Failed to fetch project name'
    }
};
