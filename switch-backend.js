#!/usr/bin/env node

/**
 * Backend URL Switcher for ML Extension
 * 
 * This script helps you easily switch between local and production backends
 * by updating the config.js file.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'packages', 'scratch-vm', 'src', 'extensions', 'scratch3_ml', 'config.js');

const BACKENDS = {
    local: 'http://localhost:8080',
    production: 'http://localhost:8080',
    staging: 'https://staging-playgroundai-backend.example.com' // Add your staging URL if you have one
};

function switchBackend(backend) {
    if (!BACKENDS[backend]) {
        console.error(`❌ Unknown backend: ${backend}`);
        console.log('Available backends:', Object.keys(BACKENDS).join(', '));
        process.exit(1);
    }

    try {
        // Read current config
        let configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
        
        // Update the API_BASE_URL
        const newUrl = BACKENDS[backend];
        configContent = configContent.replace(
            /API_BASE_URL:\s*'[^']*'/,
            `API_BASE_URL: '${newUrl}'`
        );
        
        // Write updated config
        fs.writeFileSync(CONFIG_FILE, configContent);
        
        console.log(`✅ Switched to ${backend} backend`);
        console.log(`   URL: ${newUrl}`);
        console.log(`   Config file: ${CONFIG_FILE}`);
        
        if (backend === 'local') {
            console.log('\n🚀 Make sure your local backend is running:');
            console.log('   Backend API: http://localhost:8080');
            console.log('   API Docs: http://localhost:8080/docs');
        }
        
    } catch (error) {
        console.error(`❌ Error switching backend: ${error.message}`);
        process.exit(1);
    }
}

function showCurrentBackend() {
    try {
        const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
        const match = configContent.match(/API_BASE_URL:\s*'([^']*)'/);
        
        if (match) {
            const currentUrl = match[1];
            const backend = Object.entries(BACKENDS).find(([_, url]) => url === currentUrl);
            
            if (backend) {
                console.log(`📍 Current backend: ${backend[0]} (${currentUrl})`);
            } else {
                console.log(`📍 Current backend: Custom (${currentUrl})`);
            }
        } else {
            console.log('❌ Could not determine current backend');
        }
    } catch (error) {
        console.error(`❌ Error reading config: ${error.message}`);
    }
}

function showHelp() {
    console.log(`
🔧 ML Extension Backend Switcher

Usage:
  node switch-backend.js <backend>
  node switch-backend.js status

Available backends:
  local       - http://localhost:8080 (for development)
  production  - http://localhost:8080 (for production)
  staging     - https://staging-playgroundai-backend.example.com (for staging)

Commands:
  status      - Show current backend configuration

Examples:
  node switch-backend.js local
  node switch-backend.js production
  node switch-backend.js status
`);
}

// Main execution
const command = process.argv[2];

if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
} else if (command === 'status') {
    showCurrentBackend();
} else {
    switchBackend(command);
}

