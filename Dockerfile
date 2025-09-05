# Multi-stage build for scratch-editor
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY packages/scratch-gui/package*.json ./packages/scratch-gui/
COPY packages/scratch-vm/package*.json ./packages/scratch-vm/
COPY packages/scratch-render/package*.json ./packages/scratch-render/
COPY packages/scratch-svg-renderer/package*.json ./packages/scratch-svg-renderer/

# Copy source code first (needed for prepare script)
COPY . .

# Install all dependencies (including dev dependencies needed for build)
RUN npm ci

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/packages/scratch-gui/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 8080 (Cloud Run requirement)
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
