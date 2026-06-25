#!/usr/bin/env bash
set -euo pipefail

# Install oasdiff with checksum verification to prevent supply chain attacks
#
# Usage:
#   ./install-oasdiff.sh [install_dir]
#
# Environment variables:
#   OASDIFF_VERSION    - Version to install (default: 1.18.5)
#   EXPECTED_CHECKSUM  - Expected SHA256 checksum (default: pinned per-platform values for 1.18.5)

OASDIFF_VERSION="${OASDIFF_VERSION:-1.18.5}"

# Per-platform checksums for v1.18.5 tar.gz assets — update when bumping OASDIFF_VERSION
# See checksums.txt in: https://github.com/oasdiff/oasdiff/releases/tag/v1.18.5
declare -A CHECKSUMS=(
    ["darwin_all"]="d58c1ec0d4db99503c644cc2d97df828e6f87291acad621bc1e5c2cc05291bc3"
    ["linux_amd64"]="9352233c1234bf5baf4d983078f7afff7bab4941abc253a14914f13ea31a3bf4"
    ["linux_arm64"]="c51e143726e657c1f1a82ce22c1f0e4d0d5bcecc8e9415fca2259d2443aac9d3"
)

INSTALL_DIR="${1:-/usr/local/bin}"

echo "Installing oasdiff ${OASDIFF_VERSION}..."

# Determine platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
    darwin)
        # asset for macOS is a universal binary (arm64 + x86_64)
        ARCH="all"
        ;;
    linux)
        case "$ARCH" in
            x86_64)  ARCH="amd64" ;;
            aarch64|arm64) ARCH="arm64" ;;
            *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
        esac
        ;;
    *)
        echo "Unsupported OS: $OS"; exit 1 ;;
esac

PLATFORM="${OS}_${ARCH}"
ASSET="oasdiff_${OASDIFF_VERSION}_${PLATFORM}.tar.gz"
BASE_URL="https://github.com/oasdiff/oasdiff/releases/download/v${OASDIFF_VERSION}"

EXPECTED_CHECKSUM="${EXPECTED_CHECKSUM:-${CHECKSUMS[$PLATFORM]:-}}"
if [ -z "$EXPECTED_CHECKSUM" ]; then
    echo "ERROR: No checksum registered for platform ${PLATFORM}; set EXPECTED_CHECKSUM to override"
    exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# Download
echo "Downloading ${ASSET}..."
curl -fsSL "${BASE_URL}/${ASSET}" -o "${WORK_DIR}/${ASSET}"

# Verify checksum
echo "Verifying checksum..."
ACTUAL=$(sha256sum "${WORK_DIR}/${ASSET}" | awk '{print $1}')
if [ "${EXPECTED_CHECKSUM}" != "${ACTUAL}" ]; then
    echo "ERROR: Checksum verification failed for ${ASSET}"
    echo "Expected: ${EXPECTED_CHECKSUM}"
    echo "Actual:   ${ACTUAL}"
    exit 1
fi

# Extract and install
echo "Extracting..."
tar -xzf "${WORK_DIR}/${ASSET}" -C "${WORK_DIR}"

# Install to target directory
if [ -w "$INSTALL_DIR" ]; then
    mv "${WORK_DIR}/oasdiff" "${INSTALL_DIR}/"
else
    echo "Insufficient permissions for ${INSTALL_DIR}, using sudo..."
    sudo mv "${WORK_DIR}/oasdiff" "${INSTALL_DIR}/"
fi

# Verify installation
echo "Verifying installation..."
"${INSTALL_DIR}/oasdiff" --version

echo "oasdiff installed successfully to ${INSTALL_DIR}/oasdiff"
