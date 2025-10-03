#!/bin/bash

set -e

# Configuration
SSH_HOST="ansibledev.com"
SSH_USER="ec2-user"
SSH_KEY="~/Documents/ec2-user.pem"
REMOTE_DIR="/home/ec2-user"

echo "🏗️  Building Docker image..."
docker build -f packages/frontend/Dockerfile -t next-ui-frontend:latest .

echo "📦 Exporting Docker image..."
docker save next-ui-frontend:latest | gzip > next-ui-frontend.tar.gz

echo "📤 Uploading image and docker-compose.yml to remote server..."
scp -i "$SSH_KEY" next-ui-frontend.tar.gz "$SSH_USER@$SSH_HOST:$REMOTE_DIR/"
scp -i "$SSH_KEY" docker-compose.yml "$SSH_USER@$SSH_HOST:$REMOTE_DIR/"

echo "🐳 Loading image and starting services..."
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" << 'EOF'
cd /home/ec2-user
gunzip -c next-ui-frontend.tar.gz | docker load
docker-compose up -d
rm next-ui-frontend.tar.gz
EOF

echo "🧹 Cleaning up local image archive..."
rm next-ui-frontend.tar.gz

echo "✅ Deployment complete!"
