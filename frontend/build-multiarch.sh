#!/bin/bash
set -e

# Multi-architecture image build script using Podman
# Note: Docker buildx is only used in CI/CD (GitHub Actions)
#
# Usage:
#   ./build-multiarch.sh [push]
#
# Examples:
#   ./build-multiarch.sh        # Build with podman, don't push
#   ./build-multiarch.sh push   # Build with podman and push

BUILDER="podman"
PUSH_IMAGES=${1:-}
REGISTRY=${REGISTRY:-ghcr.io}
REPOSITORY_OWNER=${REPOSITORY_OWNER:-syntara-orchestration}
PLATFORMS="linux/amd64,linux/arm64"

echo "Building multi-architecture images with Podman..."
echo "Platforms: ${PLATFORMS}"
echo "Registry: ${REGISTRY}/${REPOSITORY_OWNER}"

# Ensure podman is available
if ! command -v podman &> /dev/null; then
    echo "Error: Podman is not installed or not in PATH"
    echo "Please install Podman: https://podman.io/getting-started/installation"
    exit 1
fi

# Clean up any existing manifests
podman manifest rm syntara-ui:multiarch 2>/dev/null || true
podman manifest rm syntara-mock-api:multiarch 2>/dev/null || true

# Create manifests
podman manifest create syntara-ui:multiarch
podman manifest create syntara-mock-api:multiarch

# Build for each platform
for PLATFORM in ${PLATFORMS//,/ }; do
    echo "Building for platform: ${PLATFORM}..."

    # Build syntara-ui
    echo "  Building syntara-ui for ${PLATFORM}..."
    podman build \
        --platform ${PLATFORM} \
        -f packages/syntara-ui/Containerfile \
        -t syntara-ui:${PLATFORM//\//-} \
        .
    podman manifest add syntara-ui:multiarch syntara-ui:${PLATFORM//\//-}

    # Build syntara-mock-api
    echo "  Building syntara-mock-api for ${PLATFORM}..."
    podman build \
        --platform ${PLATFORM} \
        -f packages/syntara-mock-api/Containerfile \
        -t syntara-mock-api:${PLATFORM//\//-} \
        .
    podman manifest add syntara-mock-api:multiarch syntara-mock-api:${PLATFORM//\//-}
done

# Tag manifests
podman tag syntara-ui:multiarch ${REGISTRY}/${REPOSITORY_OWNER}/syntara-ui:latest
podman tag syntara-mock-api:multiarch ${REGISTRY}/${REPOSITORY_OWNER}/syntara-mock-api:latest

# Push if requested
if [ "$PUSH_IMAGES" = "push" ]; then
    echo "Pushing manifests to registry..."
    podman manifest push syntara-ui:multiarch ${REGISTRY}/${REPOSITORY_OWNER}/syntara-ui:latest
    podman manifest push syntara-mock-api:multiarch ${REGISTRY}/${REPOSITORY_OWNER}/syntara-mock-api:latest
fi

echo "Build complete!"
if [ "$PUSH_IMAGES" != "push" ]; then
    echo "Images built locally. Run with 'push' argument to push to registry."
fi
