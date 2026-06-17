# OpenAPI Validation Scripts

This directory contains standalone scripts for validating OpenAPI spec changes. These scripts are used by GitHub Actions workflows but can also be run locally for development and debugging.

> **Monorepo note:** The companion PR check (`check-companion-pr.py`) was designed for the
> separate-repo workflow where backend and frontend lived in different repositories. In the
> combined monorepo, backend and frontend changes land in the same PR — run `make gen-contracts`
> from the repo root to regenerate TypeScript types. The companion PR script is kept for
> upstream sync compatibility but is not used in monorepo CI.

## Scripts Overview

### Core Scripts

#### `install-oasdiff.sh`
Installs the `oasdiff` tool with checksum verification to prevent supply chain attacks.

```bash
# Install to /usr/local/bin (default)
./install-oasdiff.sh

# Install to custom directory
./install-oasdiff.sh ~/bin
```

**Environment Variables:**
- `OASDIFF_VERSION` - Version to install (default: 1.18.5)
- `EXPECTED_CHECKSUM` - Expected SHA256 checksum (pinned for version)

#### `check-breaking-changes.py`
Checks for breaking changes in OpenAPI spec using `oasdiff`.

```bash
# Compare current branch against main
./check-breaking-changes.py --base main --head HEAD

# Compare specific spec files
./check-breaking-changes.py --base-spec old.yaml --head-spec new.yaml

# Include PR body for acknowledgment check
./check-breaking-changes.py --base main --head HEAD --pr-body "$(cat pr_description.txt)"

# Output as text instead of JSON
./check-breaking-changes.py --base main --head HEAD --format text
```

**Exit Codes:**
- `0` - No breaking changes OR breaking changes acknowledged
- `1` - Breaking changes detected and not acknowledged
- `2` - Error running oasdiff or processing specs

**Output (JSON):**
```json
{
  "has_breaking_changes": bool,
  "breaking_changes": "oasdiff output...",
  "all_changes": "full changelog...",
  "acknowledged": bool,
  "justification": "justification text",
  "ack_insufficient": bool
}
```

#### `check-companion-pr.py`
Checks PR description for companion UI PR link or exception justification.

```bash
# Check PR description from file
./check-companion-pr.py --pr-body-file pr_description.txt

# Check PR description from string
./check-companion-pr.py --pr-body "syntara-orchestration/syntara-ui#123"

# Output as text instead of JSON
./check-companion-pr.py --pr-body-file pr_description.txt --format text
```

**Exit Codes:**
- Always exits `0` (companion check is informational, not blocking)

**Output (JSON):**
```json
{
  "has_companion": bool,
  "ui_pr_number": "123" | null,
  "has_exception": bool,
  "exception_justification": "text" | null,
  "exception_valid": bool,
  "severity": "notice" | "warning",
  "message": "formatted markdown message"
}
```

### GitHub Integration Scripts

#### `post-breaking-changes-comment.py`
Posts or updates GitHub PR comment with breaking changes check results.

```bash
# Post results to PR
./post-breaking-changes-comment.py \
  --results results.json \
  --pr-number 123

# Specify repository explicitly
./post-breaking-changes-comment.py \
  --results results.json \
  --pr-number 123 \
  --repo syntara-orchestration/syntara
```

**Requirements:**
- `gh` CLI must be installed and authenticated
- Results file from `check-breaking-changes.py`

#### `post-companion-pr-comment.py`
Posts or updates GitHub PR comment with companion PR check results.

```bash
# Post results to PR
./post-companion-pr-comment.py \
  --results results.json \
  --pr-number 123

# Specify repository explicitly
./post-companion-pr-comment.py \
  --results results.json \
  --pr-number 123 \
  --repo syntara-orchestration/syntara
```

**Requirements:**
- `gh` CLI must be installed and authenticated
- Results file from `check-companion-pr.py`

## Local Development Workflow

### 1. Install Dependencies

```bash
# Install oasdiff
./scripts/openapi/install-oasdiff.sh

# Verify installation
oasdiff --version
```

### 2. Check for Breaking Changes

```bash
# Using make (recommended)
make check-openapi-breaking

# Or directly
./scripts/openapi/check-breaking-changes.py \
  --base main \
  --head HEAD \
  --format text
```

### 3. Check Companion PR Requirement

```bash
# Create a test PR description
cat > /tmp/pr_body.txt << 'EOF'
This PR adds new endpoints to the API.

syntara-orchestration/syntara-ui#456
EOF

# Check it
./scripts/openapi/check-companion-pr.py \
  --pr-body-file /tmp/pr_body.txt \
  --format text
```

### 4. Test Full Workflow Locally

```bash
# 1. Check for breaking changes with PR body
PR_BODY="breaking-change-ack: This change is necessary for the new feature"

./scripts/openapi/check-breaking-changes.py \
  --base main \
  --head HEAD \
  --pr-body "$PR_BODY" \
  --output /tmp/breaking-results.json

# 2. Check companion PR
./scripts/openapi/check-companion-pr.py \
  --pr-body "$PR_BODY" \
  --output /tmp/companion-results.json

# 3. View results
cat /tmp/breaking-results.json | jq
cat /tmp/companion-results.json | jq
```

## Makefile Targets

### `make check-openapi-breaking-pre-commit`
Pre-commit hook target: skips when `openapi.yaml` is unchanged vs `main`, otherwise runs `check-openapi-breaking`.

### `make check-openapi-breaking`
Checks OpenAPI spec for breaking changes against the main branch.

```bash
make check-openapi-breaking
```

Auto-installs `oasdiff` if not present.

### `make check-openapi-companion`
Checks if a companion UI PR is referenced in the PR description.

```bash
make check-openapi-companion PR_BODY='syntara-orchestration/syntara-ui#123'
```

### `make check-openapi`
Alias for `check-openapi-breaking` (the primary local check).

```bash
make check-openapi
```

## Integration with CI

These scripts are used by the monorepo CI workflow (`.github/workflows/ci-backend.yml`):

- **Breaking changes (blocking):** `check-openapi-breaking-pre-commit` pre-commit hook, enforced by the CI `pre-commit` job
- **PR comments (informational):** `openapi-breaking-changes` CI job posts breaking-change results on pull requests when `backend/src/nexus/schemas/openapi.yaml` changes

The CI `pre-commit` job:
1. Fetches `main` for OpenAPI baseline comparison
2. Passes `OPENAPI_PR_BODY` from the pull request for breaking-change acknowledgment

The `openapi-breaking-changes` job:
1. Detects changes to `backend/src/nexus/schemas/openapi.yaml`
2. Runs `check-breaking-changes.py` and posts results via `post-breaking-changes-comment.py`

> The companion PR check is not used in monorepo CI — see note at the top of this file.

## Security Features

All scripts include:
- **Markdown/HTML escaping** to prevent injection attacks in comments
- **Checksum verification** for downloaded binaries (oasdiff)
- **Input validation** for PR body content and justifications

## Troubleshooting

### `oasdiff` not found
```bash
# Install it
./scripts/openapi/install-oasdiff.sh

# Or use make which auto-installs
make check-openapi-breaking
```

### Checksum verification failed
The pinned checksum doesn't match the downloaded file. This could indicate:
- Supply chain attack (binary was modified)
- Wrong version specified
- Network corruption

**DO NOT** bypass the check. Instead:
1. Verify you're using the correct version
2. Check the official checksums at https://github.com/oasdiff/oasdiff/releases
3. Update `EXPECTED_CHECKSUM` in the script if upgrading versions

### `gh` CLI not authenticated
```bash
# Login to GitHub CLI
gh auth login

# Verify
gh auth status
```

## Adding New Checks

To add a new OpenAPI validation:

1. Create a new script in this directory (e.g., `check-something.py`)
2. Follow the existing pattern:
   - Accept CLI arguments for input
   - Output JSON with structured results
   - Include `--format text` option for human-readable output
   - Exit with appropriate codes
3. Add a posting script if it needs PR comments
4. Wire into pre-commit and/or the CI `openapi-pr-feedback` job as appropriate
5. Add a Makefile target for local execution
6. Document in this README

## References

- [oasdiff documentation](https://github.com/oasdiff/oasdiff)
- [Breaking Changes Detection](../../docs/openapi-breaking-changes.md)
- [Companion PR Process](AAP-77399)
