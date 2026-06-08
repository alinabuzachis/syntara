#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(cd "$REPO_DIR/.." && pwd)"

BACKEND_CLONE="$WORK_DIR/nexus"
FRONTEND_CLONE="$WORK_DIR/nexus-ui"

# Orphaned paths that we deleted from the subtrees (upstream keeps modifying them)
ORPHANED_PATHS=(
    backend/.github
    backend/.tekton
    frontend/.github
    frontend/.tekton
    frontend/.husky
    frontend/.cursor
    frontend/.coderabbit.yaml
)

# Root config files that may need manual updates when upstream changes them
ROOT_CONFIG_WATCH=(
    .env.example
    podman-compose.yml
    renovate.json
)

die() { echo "ERROR: $*" >&2; exit 1; }

cd "$REPO_DIR"

# Verify we're in the right repo
[[ -d backend && -d frontend ]] || die "Not in syntara repo"
[[ -d "$BACKEND_CLONE/.git" ]] || die "Backend clone not found at $BACKEND_CLONE"
[[ -d "$FRONTEND_CLONE/.git" ]] || die "Frontend clone not found at $FRONTEND_CLONE"

# Record current subtree HEADs before sync
BACKEND_BEFORE=$(cd "$BACKEND_CLONE" && git rev-parse HEAD)
FRONTEND_BEFORE=$(cd "$FRONTEND_CLONE" && git rev-parse HEAD)

echo "=== Fetching upstream changes ==="

echo "Updating backend clone..."
(cd "$BACKEND_CLONE" && git fetch origin main && git checkout main -q && git pull origin main --ff-only)

echo "Updating frontend clone..."
(cd "$FRONTEND_CLONE" && git fetch origin main && git checkout main -q && git pull origin main --ff-only)

BACKEND_AFTER=$(cd "$BACKEND_CLONE" && git rev-parse HEAD)
FRONTEND_AFTER=$(cd "$FRONTEND_CLONE" && git rev-parse HEAD)

# Check what changed upstream in root config files
check_root_config_changes() {
    local clone_dir=$1 prefix=$2 old_rev=$3 new_rev=$4
    if [[ "$old_rev" == "$new_rev" ]]; then
        return
    fi
    for f in "${ROOT_CONFIG_WATCH[@]}"; do
        if (cd "$clone_dir" && git diff --name-only "$old_rev..$new_rev" -- "$f" 2>/dev/null | grep -q .); then
            echo "  WARNING: upstream $prefix modified $f — review and update root $f if needed"
        fi
    done
}

resolve_orphaned_conflicts() {
    local has_conflicts=false
    for path in "${ORPHANED_PATHS[@]}"; do
        if [[ -e "$path" ]] && git ls-files --unmerged -- "$path" 2>/dev/null | grep -q .; then
            has_conflicts=true
            git rm -rf "$path" >/dev/null 2>&1 || true
        elif [[ -e "$path" ]] && ! git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
            rm -rf "$path"
        fi
    done
    echo "$has_conflicts"
}

pull_subtree() {
    local prefix=$1 clone_dir=$2 old_rev=$3 new_rev=$4

    if [[ "$old_rev" == "$new_rev" ]]; then
        echo "$prefix: already up to date"
        return
    fi

    local count
    count=$(cd "$clone_dir" && git rev-list --count "$old_rev..$new_rev")
    echo "$prefix: pulling $count new commits ($old_rev -> $new_rev)"

    if git subtree pull --prefix "$prefix" "$clone_dir" main \
        -m "feat: update $prefix subtree ($count new commits to ${new_rev:0:8})" 2>&1; then
        echo "$prefix: merged cleanly"
    else
        echo "$prefix: resolving orphaned CI directory conflicts..."
        resolve_orphaned_conflicts
        if git diff --cached --quiet 2>/dev/null && ! git ls-files --unmerged 2>/dev/null | grep -q .; then
            echo "$prefix: no changes after conflict resolution, completing merge"
        fi
        git commit --no-edit || die "$prefix: failed to complete merge — unresolved conflicts remain"
        echo "$prefix: merge completed with conflict resolution"
    fi
}

echo ""
echo "=== Pulling subtree updates ==="
pull_subtree backend "$BACKEND_CLONE" "$BACKEND_BEFORE" "$BACKEND_AFTER"
echo ""
pull_subtree frontend "$FRONTEND_CLONE" "$FRONTEND_BEFORE" "$FRONTEND_AFTER"

echo ""
echo "=== Root config check ==="
check_root_config_changes "$BACKEND_CLONE" "backend" "$BACKEND_BEFORE" "$BACKEND_AFTER"
check_root_config_changes "$FRONTEND_CLONE" "frontend" "$FRONTEND_BEFORE" "$FRONTEND_AFTER"

echo ""
echo "=== Summary ==="
echo "Backend:  ${BACKEND_BEFORE:0:8} -> ${BACKEND_AFTER:0:8}"
echo "Frontend: ${FRONTEND_BEFORE:0:8} -> ${FRONTEND_AFTER:0:8}"
echo ""
echo "Done. Review any warnings above, then 'git push' when ready."
