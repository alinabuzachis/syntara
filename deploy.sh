#!/bin/bash

set -e

# Configuration
SSH_HOST="ansibledev.com"
SSH_USER="ec2-user"
SSH_KEY="~/Documents/id_rsa.pem"
IMAGE_NAME="frontend:latest"
IMAGE_FILE="frontend-image.tar"
REMOTE_DIR="/home/ec2-user"

echo "🏗️  Building Docker image for linux/amd64..."
podman build --platform linux/amd64/v4 -t "$IMAGE_NAME" -f packages/frontend/Dockerfile .

echo "💾 Saving Docker image to file..."
podman save -o "$IMAGE_FILE" "$IMAGE_NAME"

echo "📦 Compressing image..."
gzip -f "$IMAGE_FILE"

echo "🚀 Creating remote directory..."
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "mkdir -p $REMOTE_DIR"

echo "📤 Copying files to remote server..."
scp -i "$SSH_KEY" "${IMAGE_FILE}.gz" "$SSH_USER@$SSH_HOST:$REMOTE_DIR/"
scp -i "$SSH_KEY" docker-compose.yml "$SSH_USER@$SSH_HOST:$REMOTE_DIR/"

echo "📥 Loading Docker image on remote server..."
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" << 'EOF'
cd /home/ec2-user
gunzip -f frontend-image.tar.gz
docker load -i frontend-image.tar
rm frontend-image.tar
EOF

echo "🐳 Starting services with docker compose..."
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" << 'EOF'
cd /home/ec2-user
docker-compose up -d
EOF

echo "🧹 Cleaning up local files..."
rm -f "${IMAGE_FILE}.gz"

echo "✅ Deployment complete!"
