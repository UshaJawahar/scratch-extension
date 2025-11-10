@echo off
echo Building ML Extension for testing...
echo.

cd /d "%~dp0"

echo Step 1: Installing dependencies...
call npm install

echo.
echo Step 2: Building the extension...
call npm run build

echo.
echo Step 3: Starting development server...
echo.
echo The extension should now be available in your Scratch editor.
echo Look for the "ML Extension" category in the blocks palette.
echo.
echo To test pose detection:
echo 1. Add the "turn video on" block
echo 2. Add the "use model" block with your Teachable Machine URL
echo 3. Add the "when model detects" blocks
echo 4. You should see a green video window with pose keypoints overlaid
echo.

pause
