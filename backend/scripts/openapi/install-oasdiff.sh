#!/usr/bin/env bash
set -euo pipefail

# Install oasdiff with checksum verification to prevent supply chain attacks
#
# Usage:
#   ./install-oasdiff.sh [install_dir]
#
# Environment variables:
#   OASDIFF_VERSION - Version to install (default: 1.18.5)
#   EXPECTED_CHECKSUM - Expected SHA256 checksum (default: pinned for 1.18.5)

OASDIFF_VERSION="${OASDIFF_VERSION:-1.18.5}"
# Pin checksum in-repo; update when bumping OASDIFF_VERSION (see release checksums.txt)
# See: https://github.com/oasdiff/oasdiff/releases/tag/v1.18.5
EXPECTED_CHECKSUM="${EXPECTED_CHECKSUM:-9352233c1234bf5baf4d983078f7afff7bab4941abc253a14914f13ea31a3bf4}"

INSTALL_DIR="${1:-/usr/local/bin}"

echo "Installing oasdiff ${OASDIFF_VERSION}..."

# Determine platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

ASSET="oasdiff_${OASDIFF_VERSION}_${OS}_${ARCH}.tar.gz"
BASE_URL="https://github.com/oasdiff/oasdiff/releases/download/v${OASDIFF_VERSION}"

# Download
echo "Downloading ${ASSET}..."
curl -fsSL "${BASE_URL}/${ASSET}" -o "${ASSET}"

# Verify checksum
echo "Verifying checksum..."
ACTUAL=$(sha256sum "${ASSET}" | awk '{print $1}')
if [ "${EXPECTED_CHECKSUM}" != "${ACTUAL}" ]; then
    echo "ERROR: Checksum verification failed for ${ASSET}"
    echo "Expected: ${EXPECTED_CHECKSUM}"
    echo "Actual:   ${ACTUAL}"
    rm -f "${ASSET}"
    exit 1
fi

# Extract and install
echo "Extracting..."
tar -xzf "${ASSET}"

# Install to target directory
if [ -w "$INSTALL_DIR" ]; then
    mv oasdiff "${INSTALL_DIR}/"
else
    echo "Insufficient permissions for ${INSTALL_DIR}, using sudo..."
    sudo mv oasdiff "${INSTALL_DIR}/"
fi

# Cleanup
rm -f "${ASSET}"

# Verify installation
echo "Verifying installation..."
"${INSTALL_DIR}/oasdiff" --version

echo "oasdiff installed successfully to ${INSTALL_DIR}/oasdiff"
