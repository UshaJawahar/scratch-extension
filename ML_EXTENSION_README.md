# ML Extension - Dynamic Project Names

This extension automatically fetches project names from your API instead of showing "sample" as the category name.

## What Changed

The extension now:
1. **Automatically fetches project names** from `/api/guests/session/{session_id}/projects/{project_id}`
2. **Updates the category name** from "sample" to the actual project name
3. **Stores project names** in localStorage for persistence
4. **Provides manual refresh functions** for testing and debugging

## How It Works

### 1. Automatic Project Name Fetching
When the extension loads or when session/project IDs are set, it automatically calls your API to get the project name:

```javascript
// API endpoint used
GET /api/guests/session/{session_id}/projects/{project_id}
```

### 2. Dynamic Category Naming
The extension category name (previously "sample") now dynamically shows the actual project name from your API.

### 3. Persistent Storage
Project names are stored in localStorage and automatically restored when the extension reloads.

## Usage

### Setting Session and Project IDs

#### Method 1: Using the "set session and project" block
1. Drag the "set session [SESSION_ID] and project [PROJECT_ID]" block to your workspace
2. Enter your session ID (e.g., `session_aa3bffbf72c444c5`)
3. Enter your project ID (e.g., `eff8a1b8-4998-442a-a3a2-2e386ddbc9b8`)
4. Run the block

#### Method 2: From URL parameters
The extension automatically extracts session and project IDs from URLs containing:
- `?sessionId=...&projectId=...`
- `?session=...&project=...`
- `/session/.../projects/...`

#### Method 3: Using browser console
```javascript
// Set IDs manually
MLExtension.setIds('session_aa3bffbf72c444c5', 'eff8a1b8-4998-442a-a3a2-2e386ddbc9b8')

// Check current status
MLExtension.getIds()
```

### Managing Project Names

#### Refresh Project Name
```javascript
// Fetch latest project name from API
MLExtension.refreshProjectName()
```

#### Check Project Name Status
```javascript
// See if current name matches API
MLExtension.checkProjectNameStatus()
```

#### Force UI Refresh
```javascript
// Refresh Scratch workspace to show new name
MLExtension.forceUIRefresh()
```

#### Set Project Name Manually
```javascript
// Set project name manually (for testing)
MLExtension.setProjectName('My Project Name')
```

### Testing and Debugging

#### Test API Connection
```javascript
// Test if API is accessible
MLExtension.testConnection()
```

#### Clear All Data
```javascript
// Clear stored session, project, and name data
MLExtension.clearStorage()
```

## API Response Format

Your API should return project data in this format:

```json
{
  "name": "My Project Name",
  "description": "Optional project description",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Important**: The extension looks for the `name` field directly in the response, not nested under `data.name`.

## Troubleshooting

### Project Name Not Updating
1. **Check API response**: Ensure your API returns the project name in the `name` field
2. **Verify IDs**: Make sure session and project IDs are correctly set
3. **Force refresh**: Use `MLExtension.forceUIRefresh()` to update the UI
4. **Check console**: Look for error messages in the browser console

### Extension Shows "sample"
1. **No IDs set**: Set session and project IDs first
2. **API error**: Check if the API endpoint is accessible
3. **CORS issues**: Ensure your backend allows requests from the Scratch editor
4. **Manual override**: Use `MLExtension.setProjectName()` to set a custom name

### Console Errors
Common errors and solutions:

```
"Session ID or Project ID not available"
→ Set the IDs using MLExtension.setIds()

"API call failed: 404"
→ Check if the API endpoint exists and IDs are correct

"CORS error detected"
→ Configure your backend to allow cross-origin requests
```

## Testing

Use the included `test-ml-extension.html` file to test the extension functionality:

1. Open the HTML file in your browser
2. Load the ML extension in Scratch
3. Use the test interface to verify all functions work correctly

## Configuration

The extension configuration is in `config.js`:

```javascript
module.exports = {
    API_BASE_URL: 'http://localhost:8080',  // Your backend URL
    DEFAULT_PROJECT_NAME: 'sample',          // Fallback name
    COLOR_PRIMARY: '#4B5566',               // Extension colors
    COLOR_SECONDARY: '#374151'
};
```

## Browser Console Functions

All functions are available in the browser console when the extension is loaded:

- `MLExtension.setIds(sessionId, projectId)`
- `MLExtension.getIds()`
- `MLExtension.refreshProjectName()`
- `MLExtension.checkProjectNameStatus()`
- `MLExtension.forceUIRefresh()`
- `MLExtension.setProjectName(name)`
- `MLExtension.testConnection()`
- `MLExtension.clearStorage()`
- `MLExtension.initFromUrl()`

## Notes

- **UI Updates**: The extension name change may require a page refresh or workspace refresh to be visible
- **Persistence**: Project names are stored in localStorage and persist between browser sessions
- **Error Handling**: The extension gracefully falls back to the default name if API calls fail
- **Async Operations**: Most functions are asynchronous and return promises

## Example Workflow

1. **Load the extension** in Scratch
2. **Set session and project IDs** using the block or console
3. **Extension automatically fetches** the project name from your API
4. **Category name updates** from "sample" to the actual project name
5. **Use the ML blocks** with your project-specific data
6. **Refresh as needed** using the provided functions
