#!/usr/bin/env bash
# Generate requirements-build.txt with pybuild-deps for hermetic Konflux builds.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYBUILD_CACHE="${XDG_CACHE_HOME:-${HOME}/.cache}/pybuild-deps"
SHELVE_CACHE="${PYBUILD_CACHE}/find-build-deps"

cd "${REPO_ROOT}"

if ! python -c "import pybuild_deps" 2>/dev/null; then
	echo "ERROR: pybuild-deps is not installed. Run: uv pip install pybuild-deps" >&2
	exit 1
fi

if [[ -f "${SHELVE_CACHE}" ]]; then
	if ! python3 - <<PY
import shelve
from pathlib import Path
with shelve.open(str(Path("${SHELVE_CACHE}"))) as cache:
    pass
PY
	then
		echo "Removing incompatible pybuild-deps cache at ${SHELVE_CACHE}" >&2
		rm -f "${SHELVE_CACHE}" "${SHELVE_CACHE}.db" "${SHELVE_CACHE}.dat" "${SHELVE_CACHE}.dir" 2>/dev/null || true
	fi
fi

if [[ ! -f requirements.txt ]]; then
	echo "ERROR: requirements.txt not found. Run: make sync-requirements" >&2
	exit 1
fi

echo "Generating requirements-build.txt (this may take several minutes)..." >&2

set +e
python tools/ci/run_pybuild_deps_compile.py compile \
	--generate-hashes \
	--output-file=requirements-build.txt \
	requirements-build-constraints.in \
	requirements.txt
status=$?
set -e

if [[ ${status} -ne 0 ]]; then
	exit "${status}"
fi

if [[ -f requirements-build-extras.in ]]; then
	echo "Merging build extras from requirements-build-extras.in..." >&2
	extras_tmp="$(mktemp)"
	uv pip compile --generate-hashes --python-version 3.12 \
		--output-file="${extras_tmp}" requirements-build-extras.in
	grep -Ev '^(#|$)' "${extras_tmp}" >> requirements-build.txt
	rm -f "${extras_tmp}"
fi

echo "Wrote requirements-build.txt ($(wc -l < requirements-build.txt) lines)" >&2
