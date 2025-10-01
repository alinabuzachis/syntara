#!/bin/bash

set -e

# Configuration
SSH_HOST="ansibledev.com"
SSH_USER="ec2-user"
SSH_KEY="~/Documents/id_rsa.pem"
REMOTE_DIR="/home/ec2-user"

echo "🏗️  Building frontend..."
npm run build --prefix packages/frontend

echo "🚀 Creating remote directories..."
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" "mkdir -p $REMOTE_DIR/packages/frontend"

echo "📤 Copying files to remote server..."
scp -i "$SSH_KEY" -r packages/frontend/dist "$SSH_USER@$SSH_HOST:$REMOTE_DIR/packages/frontend/"
scp -i "$SSH_KEY" packages/frontend/.htpasswd "$SSH_USER@$SSH_HOST:$REMOTE_DIR/packages/frontend/"
scp -i "$SSH_KEY" packages/frontend/nginx.conf "$SSH_USER@$SSH_HOST:$REMOTE_DIR/packages/frontend/"
scp -i "$SSH_KEY" docker-compose.yml "$SSH_USER@$SSH_HOST:$REMOTE_DIR/"

echo "🐳 Starting services with docker compose..."
ssh -i "$SSH_KEY" "$SSH_USER@$SSH_HOST" << 'EOF'
cd /home/ec2-user
docker-compose up -d
EOF

echo "✅ Deployment complete!"
