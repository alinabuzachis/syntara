#!/usr/bin/env bash
# Initialize a new git worktree with development environment setup
#
# Usage: init-git-worktree.sh <branch> [base_branch] [--python <python_version>]
#
# Arguments:
#   branch          - Name of the branch for the worktree (required)
#   base_branch     - Base branch to create from (default: main)
#   --python        - Python version to use (default: python3.13)
#
# Example:
#   init-git-worktree.sh feature-auth main --python python3.13

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
BASE_BRANCH="main"
PYTHON_VERSION="python3.13"

# Files and directories not versioned to copy from main repository (if they exist)
FILES_TO_COPY=(
    "CLAUDE.local.md"
    ".env"
    ".claude"
    ".gemini"
    ".cursor"
    "Makefile.local"
)

if [ "${WORKTREE_HELPER_FILES_TO_COPY+x}" ]; then
    FILES_TO_COPY=()
    for item in ${WORKTREE_HELPER_FILES_TO_COPY[@]}; do
        FILES_TO_COPY+=("$item")
    done
fi

# Helper functions
info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1" >&2
}

die() {
    error "$1"
    exit 1
}

# Copy optional files and directories from the main repository into the worktree
copy_optional_items() {
    local source_root="$1"
    local dest_root="$2"
    shift 2
    local items=("$@")

    info "Copying optional files and directories from main repository..."
    for item in "${items[@]}"; do
        local source_path="$source_root/$item"

        if [ -f "$source_path" ]; then
            cp "$source_path" "$dest_root/$item"
            success "Copied file: $item"
        elif [ -d "$source_path" ]; then
            cp -r "$source_path" "$dest_root/"
            success "Copied directory: $item"
        else
            info "Skipped (not found): $item"
        fi
    done
}

# Parse arguments
if [ $# -lt 1 ]; then
    error "Usage: $0 <branch> [base_branch] [--python <python_version>]"
    echo ""
    echo "Arguments:"
    echo "  branch          - Name of the branch for the worktree (required)"
    echo "  base_branch     - Base branch to create from (default: main)"
    echo "  --python        - Python version to use (default: python3.13)"
    echo ""
    echo "Example:"
    echo "  $0 feature-auth main --python python3.13"
    exit 1
fi

BRANCH_NAME="$1"
shift

# Parse optional arguments
while [ $# -gt 0 ]; do
    case "$1" in
        --python)
            if [ $# -lt 2 ]; then
                die "Missing value for --python argument"
            fi
            PYTHON_VERSION="$2"
            shift 2
            ;;
        -*)
            die "Unknown option: $1"
            ;;
        *)
            # Assume it's the base branch
            BASE_BRANCH="$1"
            shift
            ;;
    esac
done

# Validate we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    die "Not in a git repository"
fi

# Get repository root
REPO_ROOT=$(git rev-parse --show-toplevel)
info "Repository root: $REPO_ROOT"

# Validate Python version is available
if ! command -v "$PYTHON_VERSION" &> /dev/null; then
    die "Python version '$PYTHON_VERSION' not found. Please install it or specify a different version with --python"
fi

PYTHON_FULL_VERSION=$($PYTHON_VERSION --version)
info "Using Python: $PYTHON_FULL_VERSION"

# Create worktrees directory if it doesn't exist
WORKTREES_DIR="$REPO_ROOT/worktrees"
if [ ! -d "$WORKTREES_DIR" ]; then
    info "Creating worktrees directory: $WORKTREES_DIR"
    mkdir -p "$WORKTREES_DIR"
fi

# Worktree path
WORKTREE_PATH="$WORKTREES_DIR/$BRANCH_NAME"

# Check if worktree already exists
if [ -d "$WORKTREE_PATH" ]; then
    die "Worktree already exists at: $WORKTREE_PATH"
fi

# Check if branch already exists
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    # Branch exists, check it out
    info "Branch '$BRANCH_NAME' already exists, checking it out..."
    git worktree add "$WORKTREE_PATH" "$BRANCH_NAME" || die "Failed to create worktree"
else
    # Branch doesn't exist, create it from base branch
    info "Creating git worktree for branch '$BRANCH_NAME' from '$BASE_BRANCH'..."
    git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" "$BASE_BRANCH" || die "Failed to create worktree"
fi
success "Git worktree created at: $WORKTREE_PATH"

copy_optional_items "$REPO_ROOT" "$WORKTREE_PATH" "${FILES_TO_COPY[@]}"

# Create Python virtual environment
info "Creating Python virtual environment with $PYTHON_VERSION..."
cd "$WORKTREE_PATH"
$PYTHON_VERSION -m venv .venv || die "Failed to create virtual environment"
success "Virtual environment created at: $WORKTREE_PATH/.venv"

# Activate virtual environment and install uv
info "Installing uv in virtual environment..."
# shellcheck disable=SC1091
source .venv/bin/activate

# Install uv
pip install --quiet --upgrade pip
pip install --quiet uv || die "Failed to install uv"
success "uv installed successfully"

# Run make install
info "Running 'make install' to set up the project..."
if ! make install; then
    warning "make install failed, but worktree was created successfully"
    deactivate
    exit 1
fi
success "Project dependencies installed"

# Deactivate virtual environment
deactivate
success "Virtual environment deactivated"

# Print summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Worktree initialized successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "📁 Worktree location: $WORKTREE_PATH"
echo "🌿 Branch: $BRANCH_NAME"
echo "🐍 Python: $PYTHON_FULL_VERSION"
echo ""
echo "Next steps:"
echo "  1. cd $WORKTREE_PATH"
echo "  2. source .venv/bin/activate"
if [ -f "$WORKTREE_PATH/.env" ]; then
    echo "  3. Review and update .env file (ports, PODMAN_PROJECT, etc.)"
    echo "  4. Start coding!"
else
    echo "  3. Start coding!"
fi
echo ""
echo "💡 Tip: Consider updating environment variables in .env:"
echo "   - PODMAN_PROJECT (to isolate containers from other worktrees)"
echo "   - Port variables (to avoid conflicts with other instances)"
echo ""
