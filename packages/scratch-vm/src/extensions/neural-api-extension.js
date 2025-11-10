/**
 * TheNeural API Extension for Scratch
 * Provides blocks to interact with TheNeural backend APIs
 */

const NeuralApiExtension = {
    id: 'neuralapi',
    name: 'TheNeural API',
    color1: '#4CAF50',
    color2: '#45a049',
    blocks: [
        {
            opcode: 'createProject',
            text: 'create project [name] with description [description]',
            arguments: {
                name: {
                    type: 'string',
                    defaultValue: 'My ML Project'
                },
                description: {
                    type: 'string',
                    defaultValue: 'A machine learning project'
                }
            }
        },
        {
            opcode: 'startTraining',
            text: 'start training project [projectId] with [epochs] epochs',
            arguments: {
                projectId: {
                    type: 'string',
                    defaultValue: 'project123'
                },
                epochs: {
                    type: 'number',
                    defaultValue: 100
                }
            }
        },
        {
            opcode: 'getTrainingStatus',
            text: 'get training status of project [projectId]',
            arguments: {
                projectId: {
                    type: 'string',
                    defaultValue: 'project123'
                }
            }
        },
        {
            opcode: 'getPrediction',
            text: 'get prediction for [input] using project [projectId]',
            arguments: {
                input: {
                    type: 'string',
                    defaultValue: 'Hello World'
                },
                projectId: {
                    type: 'string',
                    defaultValue: 'project123'
                }
            }
        },
        {
            opcode: 'uploadData',
            text: 'upload training data [data] to project [projectId]',
            arguments: {
                data: {
                    type: 'string',
                    defaultValue: '{"text": "example", "label": "positive"}'
                },
                projectId: {
                    type: 'string',
                    defaultValue: 'project123'
                }
            }
        },
        {
            opcode: 'getProjects',
            text: 'get all projects',
            arguments: {}
        },
        {
            opcode: 'getDemoProjects',
            text: 'get demo projects with category [category]',
            arguments: {
                category: {
                    type: 'string',
                    defaultValue: 'text'
                }
            }
        },
        // Guest project blocks
        {
            opcode: 'createGuestProject',
            text: 'create guest project [name] with description [description] in session [sessionId]',
            arguments: {
                name: {
                    type: 'string',
                    defaultValue: 'My Guest Project'
                },
                description: {
                    type: 'string',
                    defaultValue: 'A machine learning project'
                },
                sessionId: {
                    type: 'string',
                    defaultValue: 'session123'
                }
            }
        },
        {
            opcode: 'getGuestProjects',
            text: 'get all projects in session [sessionId]',
            arguments: {
                sessionId: {
                    type: 'string',
                    defaultValue: 'session123'
                }
            }
        },
        {
            opcode: 'startGuestTraining',
            text: 'start training guest project [projectId] in session [sessionId] with [epochs] epochs',
            arguments: {
                projectId: {
                    type: 'string',
                    defaultValue: 'project123'
                },
                sessionId: {
                    type: 'string',
                    defaultValue: 'session123'
                },
                epochs: {
                    type: 'number',
                    defaultValue: 100
                }
            }
        },
        {
            opcode: 'getGuestTrainingStatus',
            text: 'get training status of guest project [projectId] in session [sessionId]',
            arguments: {
                projectId: {
                    type: 'string',
                    defaultValue: 'project123'
                },
                sessionId: {
                    type: 'string',
                    defaultValue: 'session123'
                }
            }
        },
        {
            opcode: 'getGuestPrediction',
            text: 'get prediction for [input] using guest project [projectId] in session [sessionId]',
            arguments: {
                input: {
                    type: 'string',
                    defaultValue: 'Hello World'
                },
                projectId: {
                    type: 'string',
                    defaultValue: 'project123'
                },
                sessionId: {
                    type: 'string',
                    defaultValue: 'session123'
                }
            }
        },
        {
            opcode: 'uploadGuestExamples',
            text: 'upload examples [examples] to guest project [projectId] in session [sessionId]',
            arguments: {
                examples: {
                    type: 'string',
                    defaultValue: '[{"text": "example", "label": "positive"}]'
                },
                projectId: {
                    type: 'string',
                    defaultValue: 'project123'
                },
                sessionId: {
                    type: 'string',
                    defaultValue: 'session123'
                }
            }
        }
    ],

    menus: {
        categories: {
            acceptReporters: true,
            items: [
                {text: 'text', value: 'text'},
                {text: 'image', value: 'image'},
                {text: 'audio', value: 'audio'},
                {text: 'tabular', value: 'tabular'}
            ]
        }
    }
};

// API configuration
const API_CONFIG = {
    baseUrl: 'http://localhost:8080', // Local development backend URL
    endpoints: {
        // Regular projects (for authenticated users)
        projects: '/projects',
        training: '/projects/{id}/train',
        status: '/projects/{id}/training-status',
        prediction: '/projects/{id}/predict',
        upload: '/projects/{id}/upload',
        demoProjects: '/demo-projects',
        
        // Guest projects (for unauthenticated users)
        guestProjects: '/api/guests/session/{sessionId}/projects',
        guestTraining: '/api/guests/session/{sessionId}/projects/{id}/train',
        guestStatus: '/api/guests/session/{id}/train',
        guestPrediction: '/api/guests/session/{sessionId}/projects/{id}/predict',
        guestExamples: '/api/guests/session/{sessionId}/projects/{id}/examples'
    }
};

// Helper function to make API calls
async function makeApiCall(endpoint, options = {}) {
    try {
        const url = `${API_CONFIG.baseUrl}${endpoint}`;
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Extension methods
NeuralApiExtension.createProject = async function(args, util) {
    try {
        const projectData = {
            name: args.name,
            description: args.description,
            user_id: 'scratch_user', // You might want to get this from context
            status: 'created'
        };

        const response = await makeApiCall(API_CONFIG.endpoints.projects, {
            method: 'POST',
            body: JSON.stringify(projectData)
        });

        if (response.success) {
            util.runtime.emitProjectChanged();
            return `Project created with ID: ${response.data.id}`;
        } else {
            return `Failed to create project: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.startTraining = async function(args, util) {
    try {
        const trainingConfig = {
            epochs: args.epochs,
            batch_size: 32,
            learning_rate: 0.001
        };

        const endpoint = API_CONFIG.endpoints.training.replace('{id}', args.projectId);
        const response = await makeApiCall(endpoint, {
            method: 'POST',
            body: JSON.stringify(trainingConfig)
        });

        if (response.success) {
            return `Training started for project ${args.projectId}`;
        } else {
            return `Failed to start training: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.getTrainingStatus = async function(args, util) {
    try {
        const endpoint = API_CONFIG.endpoints.status.replace('{id}', args.projectId);
        const response = await makeApiCall(endpoint);

        if (response.success) {
            const status = response.data;
            return `Status: ${status.status}, Progress: ${status.progress || 0}%`;
        } else {
            return `Failed to get status: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.getPrediction = async function(args, util) {
    try {
        const predictionData = {
            input: args.input
        };

        const endpoint = API_CONFIG.endpoints.prediction.replace('{id}', args.projectId);
        const response = await makeApiCall(endpoint, {
            method: 'POST',
            body: JSON.stringify(predictionData)
        });

        if (response.success) {
            return `Prediction: ${response.data.prediction}`;
        } else {
            return `Failed to get prediction: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.uploadData = async function(args, util) {
    try {
        let data;
        try {
            data = JSON.parse(args.data);
        } catch (e) {
            data = { text: args.data };
        }

        const endpoint = API_CONFIG.endpoints.upload.replace('{id}', args.projectId);
        const response = await makeApiCall(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (response.success) {
            return `Data uploaded successfully`;
        } else {
            return `Failed to upload data: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.getProjects = async function(args, util) {
    try {
        const response = await makeApiCall(API_CONFIG.endpoints.projects);

        if (response.success && response.data) {
            const projectNames = response.data.map(p => p.name).join(', ');
            return `Projects: ${projectNames || 'No projects found'}`;
        } else {
            return `Failed to get projects: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.getDemoProjects = async function(args, util) {
    try {
        const endpoint = `${API_CONFIG.endpoints.demoProjects}?category=${args.category}`;
        const response = await makeApiCall(endpoint);

        if (response.success && response.data) {
            const projectNames = response.data.map(p => p.name).join(', ');
            return `Demo projects: ${projectNames || 'No demo projects found'}`;
        } else {
            return `Failed to get demo projects: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

// Guest project methods
NeuralApiExtension.createGuestProject = async function(args, util) {
    try {
        const projectData = {
            name: args.name,
            description: args.description,
            type: 'text',
            status: 'created'
        };

        const endpoint = API_CONFIG.endpoints.guestProjects.replace('{sessionId}', args.sessionId);
        const response = await makeApiCall(endpoint, {
            method: 'POST',
            body: JSON.stringify(projectData)
        });

        if (response.success) {
            util.runtime.emitProjectChanged();
            return `Guest project created with ID: ${response.data.id}`;
        } else {
            return `Failed to create guest project: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.getGuestProjects = async function(args, util) {
    try {
        const endpoint = API_CONFIG.endpoints.guestProjects.replace('{sessionId}', args.sessionId);
        const response = await makeApiCall(endpoint);

        if (response.success && response.data) {
            const projectNames = response.data.map(p => p.name).join(', ');
            return `Guest projects: ${projectNames || 'No guest projects found'}`;
        } else {
            return `Failed to get guest projects: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.startGuestTraining = async function(args, util) {
    try {
        const trainingConfig = {
            epochs: args.epochs,
            batch_size: 32,
            learning_rate: 0.001
        };

        const endpoint = API_CONFIG.endpoints.guestTraining
            .replace('{sessionId}', args.sessionId)
            .replace('{id}', args.projectId);
        
        const response = await makeApiCall(endpoint, {
            method: 'POST',
            body: JSON.stringify(trainingConfig)
        });

        if (response.success) {
            return `Guest training started for project ${args.projectId}`;
        } else {
            return `Failed to start guest training: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.getGuestTrainingStatus = async function(args, util) {
    try {
        const endpoint = API_CONFIG.endpoints.guestStatus
            .replace('{id}', args.sessionId);
        
        const response = await makeApiCall(endpoint);

        if (response.success) {
            const status = response.data;
            return `Guest training status: ${status.status}, Progress: ${status.progress || 0}%`;
        } else {
            return `Failed to get guest training status: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.getGuestPrediction = async function(args, util) {
    try {
        const predictionData = {
            text: args.input
        };

        const endpoint = API_CONFIG.endpoints.guestPrediction
            .replace('{sessionId}', args.sessionId)
            .replace('{id}', args.projectId);
        
        const response = await makeApiCall(endpoint, {
            method: 'POST',
            body: JSON.stringify(predictionData)
        });

        if (response.success) {
            return `Guest prediction: ${response.data.label}`;
        } else {
            return `Failed to get guest prediction: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

NeuralApiExtension.uploadGuestExamples = async function(args, util) {
    try {
        let examples;
        try {
            examples = JSON.parse(args.examples);
        } catch (e) {
            examples = [{ text: args.examples, label: 'positive' }];
        }

        const endpoint = API_CONFIG.endpoints.guestExamples
            .replace('{sessionId}', args.sessionId)
            .replace('{id}', args.projectId);
        
        const response = await makeApiCall(endpoint, {
            method: 'POST',
            body: JSON.stringify(examples)
        });

        if (response.success) {
            return `Guest examples uploaded successfully`;
        } else {
            return `Failed to upload guest examples: ${response.error}`;
        }
    } catch (error) {
        return `Error: ${error.message}`;
    }
};

// Export the extension
module.exports = NeuralApiExtension;
