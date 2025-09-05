# Deploy scratch-editor to Cloud Run for TheNeural Project
# Project ID: theneural

Write-Host "Deploying scratch-editor to Cloud Run..." -ForegroundColor Blue

$ProjectId = "playgroundai-470111"
$ServiceName = "scratch-editor"
$Region = "us-central1"
$ImageName = "gcr.io/$ProjectId/$ServiceName"

Write-Host "Project ID: $ProjectId" -ForegroundColor Cyan
Write-Host "Region: $Region" -ForegroundColor Cyan

# Build Docker image
Write-Host "Building Docker image..." -ForegroundColor Yellow
docker build --no-cache -t $ImageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker build failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Push to Container Registry
Write-Host "Pushing image to Container Registry..." -ForegroundColor Yellow
docker push $ImageName

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to push image" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Deploy to Cloud Run
Write-Host "Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName --image $ImageName --platform managed --region $Region --allow-unauthenticated --port 8080 --memory 1Gi --cpu 1 --max-instances 10 --set-env-vars NODE_ENV=production

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Get service URL
$ServiceUrl = gcloud run services describe $ServiceName --platform managed --region $Region --format "value(status.url)"

Write-Host "Deployment successful!" -ForegroundColor Green
Write-Host "Service URL: $ServiceUrl" -ForegroundColor Green
Write-Host "Monitor: https://console.cloud.google.com/run/detail/$Region/$ServiceName?project=$ProjectId" -ForegroundColor Cyan

Read-Host "Press Enter to exit"
