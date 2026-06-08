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
podman manifest rm nexus-ui:multiarch 2>/dev/null || true
podman manifest rm nexus-mock-api:multiarch 2>/dev/null || true

# Create manifests
podman manifest create nexus-ui:multiarch
podman manifest create nexus-mock-api:multiarch

# Build for each platform
for PLATFORM in ${PLATFORMS//,/ }; do
    echo "Building for platform: ${PLATFORM}..."

    # Build nexus-ui
    echo "  Building nexus-ui for ${PLATFORM}..."
    podman build \
        --platform ${PLATFORM} \
        -f packages/nexus-ui/Containerfile \
        -t nexus-ui:${PLATFORM//\//-} \
        .
    podman manifest add nexus-ui:multiarch nexus-ui:${PLATFORM//\//-}

    # Build nexus-mock-api
    echo "  Building nexus-mock-api for ${PLATFORM}..."
    podman build \
        --platform ${PLATFORM} \
        -f packages/nexus-mock-api/Containerfile \
        -t nexus-mock-api:${PLATFORM//\//-} \
        .
    podman manifest add nexus-mock-api:multiarch nexus-mock-api:${PLATFORM//\//-}
done

# Tag manifests
podman tag nexus-ui:multiarch ${REGISTRY}/${REPOSITORY_OWNER}/nexus-ui:latest
podman tag nexus-mock-api:multiarch ${REGISTRY}/${REPOSITORY_OWNER}/nexus-mock-api:latest

# Push if requested
if [ "$PUSH_IMAGES" = "push" ]; then
    echo "Pushing manifests to registry..."
    podman manifest push nexus-ui:multiarch ${REGISTRY}/${REPOSITORY_OWNER}/nexus-ui:latest
    podman manifest push nexus-mock-api:multiarch ${REGISTRY}/${REPOSITORY_OWNER}/nexus-mock-api:latest
fi

echo "Build complete!"
if [ "$PUSH_IMAGES" != "push" ]; then
    echo "Images built locally. Run with 'push' argument to push to registry."
fi
