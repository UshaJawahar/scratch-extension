# Deploying Scratch Editor to Google Cloud Run

This guide will help you deploy your forked scratch-editor repository to Google Cloud Run.

## Prerequisites

1. **Google Cloud Project**: You need a GCP project with billing enabled
2. **Google Cloud CLI**: Install and configure `gcloud` CLI
3. **Docker**: Install Docker Desktop or Docker Engine
4. **Node.js**: Version 18 or higher (for local development)

## Setup Steps

### 1. Install and Configure Google Cloud CLI

```bash
# Install gcloud CLI (if not already installed)
# Download from: https://cloud.google.com/sdk/docs/install

# Login to your Google account
gcloud auth login

# Set your project ID
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 2. Configure Docker for Google Container Registry

```bash
# Configure Docker to use gcloud as a credential helper
gcloud auth configure-docker
```

## Deployment Options

### Option 1: Automated Deployment with Cloud Build (Recommended)

1. **Push your code to GitHub** (if not already done)
2. **Connect your repository to Cloud Build**:
   - Go to [Cloud Build > Triggers](https://console.cloud.google.com/cloud-build/triggers)
   - Click "Connect Repository"
   - Select your GitHub repository
   - Create a trigger that uses the `cloudbuild.yaml` file

3. **Manual trigger** (for testing):
```bash
gcloud builds submit --config cloudbuild.yaml .
```

### Option 2: Manual Deployment

#### Using the deployment script:

**Windows:**
```cmd
deploy.bat
```

**Linux/Mac:**
```bash
chmod +x deploy.sh
./deploy.sh
```

#### Using gcloud commands directly:

```bash
# Build and push the image
docker build -t gcr.io/YOUR_PROJECT_ID/scratch-editor .
docker push gcr.io/YOUR_PROJECT_ID/scratch-editor

# Deploy to Cloud Run
gcloud run deploy scratch-editor \
    --image gcr.io/YOUR_PROJECT_ID/scratch-editor \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --port 8080 \
    --memory 1Gi \
    --cpu 1 \
    --max-instances 10
```

## Configuration

### Environment Variables

You can set environment variables for your ML extension:

```bash
gcloud run services update scratch-editor \
    --region us-central1 \
    --set-env-vars \
    ML_API_URL=http://localhost:8080,\
    ML_API_KEY=your-api-key
```

### Custom Domain

To use a custom domain:

1. **Map your domain**:
```bash
gcloud run domain-mappings create \
    --service scratch-editor \
    --domain your-domain.com \
    --region us-central1
```

2. **Update DNS records** as instructed by the command output

## Monitoring and Scaling

### View Logs
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=scratch-editor" --limit 50
```

### Monitor Performance
- Visit [Cloud Run Console](https://console.cloud.google.com/run)
- Select your service
- View metrics, logs, and performance data

### Scaling Configuration

The service is configured with:
- **Memory**: 1GB
- **CPU**: 1 vCPU
- **Max Instances**: 10
- **Min Instances**: 0 (scales to zero when not in use)

Adjust these settings based on your needs:

```bash
gcloud run services update scratch-editor \
    --region us-central1 \
    --memory 2Gi \
    --cpu 2 \
    --max-instances 20
```

## Troubleshooting

### Common Issues

1. **Build fails**: Check the Dockerfile and ensure all dependencies are properly specified
2. **Service won't start**: Check logs for errors in the nginx configuration
3. **Permission denied**: Ensure your gcloud account has the necessary IAM roles

### Debug Commands

```bash
# Check service status
gcloud run services describe scratch-editor --region us-central1

# View recent logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=scratch-editor" --limit 10

# Test the service
curl https://your-service-url.run.app/health
```

## Cost Optimization

- **Scale to zero**: Services automatically scale to zero when not in use
- **Memory optimization**: Start with 1GB and adjust based on usage
- **Region selection**: Choose a region close to your users for better performance

## Security

- **HTTPS**: Automatically enabled by Cloud Run
- **Authentication**: Currently set to allow unauthenticated access
- **Security headers**: Configured in nginx.conf for basic security

To restrict access, you can require authentication:
```bash
gcloud run services update scratch-editor \
    --region us-central1 \
    --no-allow-unauthenticated
```

## Next Steps

After deployment:
1. Test your ML extension functionality
2. Set up monitoring and alerting
3. Configure custom domains if needed
4. Set up CI/CD pipeline for automatic deployments
5. Monitor costs and optimize resource usage

## Support

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Google Cloud Support](https://cloud.google.com/support)
