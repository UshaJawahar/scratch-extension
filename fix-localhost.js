#!/usr/bin/env node

/**
 * Fix localhost URLs in built JavaScript files
 * Replaces localhost:8000 with production backend URL
 */

const fs = require('fs');
const path = require('path');

// Configuration
const OLD_URL = 'http://localhost:8000';
const NEW_URL = 'http://localhost:8080';

// Files to update with their specific line patterns
const FILES_TO_UPDATE = [
    {
        path: 'packages/scratch-vm/playground/scratch-vm.js',
        pattern: "let apiBaseUrl = 'http://localhost:8000';",
        replacement: "let apiBaseUrl = 'http://localhost:8080';"
    },
    {
        path: 'packages/scratch-vm/playground/benchmark.js',
        pattern: "let apiBaseUrl = 'http://localhost:8000';",
        replacement: "let apiBaseUrl = 'http://localhost:8080';"
    },
    {
        path: 'packages/scratch-vm/dist/web/scratch-vm.js',
        pattern: "let apiBaseUrl = 'http://localhost:8000';",
        replacement: "let apiBaseUrl = 'http://localhost:8080';"
    },
    {
        path: 'packages/scratch-vm/dist/node/scratch-vm.js',
        pattern: "let apiBaseUrl = 'http://localhost:8000';",
        replacement: "let apiBaseUrl = 'http://localhost:8080';"
    }
];

function updateFile(fileInfo) {
    try {
        if (!fs.existsSync(fileInfo.path)) {
            console.log(`❌ File not found: ${fileInfo.path}`);
            return false;
        }

        let content = fs.readFileSync(fileInfo.path, 'utf8');
        
        // Replace the specific pattern
        if (content.includes(fileInfo.pattern)) {
            content = content.replace(fileInfo.pattern, fileInfo.replacement);
            fs.writeFileSync(fileInfo.path, content, 'utf8');
            console.log(`✅ Updated: ${fileInfo.path}`);
            return true;
        } else {
            // Fallback: replace any localhost:8000 occurrence
            if (content.includes(OLD_URL)) {
                content = content.replace(new RegExp(OLD_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), NEW_URL);
                fs.writeFileSync(fileInfo.path, content, 'utf8');
                console.log(`✅ Updated (fallback): ${fileInfo.path}`);
                return true;
            } else {
                console.log(`⚠️  No changes needed: ${fileInfo.path}`);
                return false;
            }
        }
    } catch (error) {
        console.error(`❌ Error updating ${fileInfo.path}:`, error.message);
        return false;
    }
}

function main() {
    console.log('🔧 Fixing localhost URLs in built JavaScript files...');
    console.log(`Replacing: ${OLD_URL}`);
    console.log(`With: ${NEW_URL}`);
    console.log('');

    let updatedCount = 0;
    
    FILES_TO_UPDATE.forEach(fileInfo => {
        if (updateFile(fileInfo)) {
            updatedCount++;
        }
    });

    console.log('');
    console.log(`✅ Fix completed! Updated ${updatedCount} files.`);
    console.log('Now you can deploy without rebuilding.');
}

if (require.main === module) {
    main();
}

module.exports = { updateFile, FILES_TO_UPDATE, OLD_URL, NEW_URL };
