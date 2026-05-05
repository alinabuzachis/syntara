"""OpenAPI spec management — auto-bundle and cache in ``~/.aap/orchestrator/``.

On CLI startup, this module locates the project's schema sources,
hashes them, and re-bundles the OpenAPI spec only when sources have
changed.  The bundled YAML and a manifest of source hashes are both
stored under ``~/.aap/orchestrator/`` so subsequent invocations are instant.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.machinery
import importlib.util
import json
import logging
import sys
from pathlib import Path
from typing import Any

import yaml

_log = logging.getLogger(__name__)

_CONFIG_DIR = Path.home() / ".aap" / "orchestrator"
_CACHED_SPEC = _CONFIG_DIR / "openapi.yaml"
_HASH_MANIFEST = _CONFIG_DIR / "spec-hashes.json"

# ---------------------------------------------------------------------------
# Project root / schemas discovery
# ---------------------------------------------------------------------------

_SCHEMAS_RELATIVE = Path("src") / "nexus" / "schemas"


def _find_project_root() -> Path | None:
    """Walk up from the cli package until we find the project root."""
    candidate = Path(__file__).resolve().parent
    for _ in range(10):
        candidate = candidate.parent
        if (candidate / _SCHEMAS_RELATIVE).is_dir():
            return candidate
    return None


def _find_schemas_dir() -> Path | None:
    root = _find_project_root()
    if root is None:
        return None
    schemas = root / _SCHEMAS_RELATIVE
    return schemas if schemas.is_dir() else None


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------


def _collect_source_files(schemas_dir: Path) -> list[Path]:
    """Return all YAML/JSON files under the schemas directory, sorted for determinism."""
    files: list[Path] = []
    for pattern in ("**/*.yaml", "**/*.yml", "**/*.json"):
        files.extend(schemas_dir.glob(pattern))
    return sorted(set(files))


def _hash_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _build_manifest(source_files: list[Path], schemas_dir: Path) -> dict[str, str]:
    """Return {relative_path: sha256_hex} for each source file."""
    return {str(f.relative_to(schemas_dir)): _hash_file(f) for f in source_files}


def _load_saved_manifest() -> dict[str, str] | None:
    if not _HASH_MANIFEST.exists():
        return None
    try:
        result: dict[str, str] = json.loads(_HASH_MANIFEST.read_text())
    except (json.JSONDecodeError, OSError):
        return None
    return result


def _save_manifest(manifest: dict[str, str]) -> None:
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    _HASH_MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")


# ---------------------------------------------------------------------------
# Bundling
# ---------------------------------------------------------------------------


def _bundle_spec(schemas_dir: Path) -> dict[str, Any]:
    """Run the project's bundle_openapi logic to produce a merged spec dict.

    Tries to import the bundler from the project.  If unavailable, falls
    back to reading the already-bundled ``openapi.yaml`` in the schemas dir.
    """
    bundled_path = schemas_dir / "openapi.yaml"

    project_root = schemas_dir.parent.parent
    tools_dir = project_root / "tools"
    bundler_path = tools_dir / "bundle_openapi.py"

    if bundler_path.exists():
        sys.path.insert(0, str(tools_dir))
        try:
            loader = importlib.machinery.SourceFileLoader("_bundle_openapi", str(bundler_path))
            spec_obj = importlib.util.spec_from_loader("_bundle_openapi", loader)
            if spec_obj is not None and spec_obj.loader is not None:
                mod = importlib.util.module_from_spec(spec_obj)
                spec_obj.loader.exec_module(mod)
                sub_specs = mod._discover_sub_specs()
                if sub_specs:
                    result: dict[str, Any] = mod._build_merged_spec(sub_specs)
                    return result
        except (ImportError, AttributeError, yaml.YAMLError, OSError):
            _log.debug("Failed to run bundler, falling back to pre-bundled spec", exc_info=True)
        finally:
            if str(tools_dir) in sys.path:
                sys.path.remove(str(tools_dir))

    if bundled_path.exists():
        with bundled_path.open() as f:
            spec: dict[str, Any] = yaml.safe_load(f)
            return spec

    msg = f"No OpenAPI spec sources found under {schemas_dir}"
    raise FileNotFoundError(msg)


def _save_cached_spec(spec: dict[str, Any]) -> None:
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    output: str = yaml.dump(
        spec,
        default_flow_style=False,
        allow_unicode=True,
        sort_keys=False,
        width=120,
    )
    _CACHED_SPEC.write_text(output)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def load_spec() -> dict[str, Any]:
    """Load the OpenAPI spec, re-bundling from sources if anything changed.

    Resolution order:
    1. Find the schemas dir in the project tree.
    2. Hash all source files and compare against the saved manifest.
    3. If hashes match and a cached spec exists, load from cache.
    4. Otherwise, re-bundle, save the spec and the new manifest.
    5. If no schemas dir is found (e.g. pip-installed outside the project),
       fall back to the cached spec or the in-package copy.
    """
    schemas_dir = _find_schemas_dir()

    if schemas_dir is not None:
        source_files = _collect_source_files(schemas_dir)
        current_manifest = _build_manifest(source_files, schemas_dir)
        saved_manifest = _load_saved_manifest()

        if current_manifest == saved_manifest and _CACHED_SPEC.exists():
            with _CACHED_SPEC.open() as f:
                cached: dict[str, Any] = yaml.safe_load(f)
                return cached

        spec = _bundle_spec(schemas_dir)
        _save_cached_spec(spec)
        _save_manifest(current_manifest)
        return spec

    if _CACHED_SPEC.exists():
        with _CACHED_SPEC.open() as f:
            cached_fallback: dict[str, Any] = yaml.safe_load(f)
            return cached_fallback

    import nexus_api_client

    fallback = Path(nexus_api_client.__file__).resolve().parent / "openapi.yaml"
    if fallback.exists():
        with fallback.open() as f:
            pkg_spec: dict[str, Any] = yaml.safe_load(f)
            return pkg_spec

    msg = "Cannot find OpenAPI spec: no schemas directory, no cached spec, and no bundled openapi.yaml in the package."
    raise FileNotFoundError(msg)
