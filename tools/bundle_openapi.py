"""Bundle all domain OpenAPI sub-specs into a single merged openapi.yaml.

Reads each domain sub-spec under src/nexus/schemas/*/openapi.yaml (and
*.openapi.yaml variants), resolves all $ref pointers, merges paths and
components, and writes a self-contained YAML document with no external refs.

Usage:
    uv run python tools/bundle_openapi.py
    uv run python tools/bundle_openapi.py -o path/to/output.yaml
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any

import yaml

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMAS_DIR = PROJECT_ROOT / "src" / "nexus" / "schemas"
DEFAULT_OUTPUT = SCHEMAS_DIR / "openapi.yaml"

# Base shared-schemas file whose component schemas are merged into the bundled
# output as named entries (instead of being inlined at every usage site).
_BASE_SHARED_SCHEMAS_FILE = SCHEMAS_DIR / "base" / "shared-resources.openapi.yaml"

# Sub-spec discovery: folders under schemas/ that contain REST OpenAPI files.
# Folders in this set are skipped during discovery.
_SKIP_DIRS = {
    "base",  # shared base schemas, not a domain spec
}

# Files to skip even if they look like OpenAPI specs.
_SKIP_FILES = {
    "shared-schemas.yaml",
    "shared-resources.openapi.yaml",
    "workflow-websocket-api.yaml",
}

# ---------------------------------------------------------------------------
# $ref resolution
# ---------------------------------------------------------------------------

_file_cache: dict[Path, dict[str, Any]] = {}


def _load_yaml(path: Path) -> dict[str, Any]:
    """Load and cache a YAML file."""
    if path not in _file_cache:
        _file_cache[path] = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return _file_cache[path]


def _resolve_json_pointer(data: Any, pointer: str) -> Any:
    """Traverse data using a JSON Pointer (RFC 6901) string like '/components/schemas/Foo'."""
    if not pointer or pointer == "/":
        return data
    parts = pointer.lstrip("/").split("/")
    node = data
    for part in parts:
        part_parsed = part.replace("~1", "/").replace("~0", "~")
        if isinstance(node, dict):
            if part_parsed not in node:
                raise KeyError(f"JSON Pointer segment '{part_parsed}' not found")
            node = node[part_parsed]
        elif isinstance(node, list):
            node = node[int(part_parsed)]
        else:
            raise TypeError(f"Cannot traverse into {type(node)} with key '{part_parsed}'")
    return node


def _circular_ref_error(ref: str, source_file: Path | None = None) -> ValueError:
    location = f" (in {source_file})" if source_file else ""
    return ValueError(f"Circular $ref detected: {ref}{location}. OpenAPI specs must not contain circular references.")


def _resolve_external_ref(
    file_part: str,
    fragment: str,
    ref: str,
    base_path: Path,
    visited: set[str],
    shared_refs: dict[str, str],
) -> Any:
    """Resolve an external file $ref and return the inlined (or shared-ref) result."""
    target_file = (base_path / file_part).resolve()
    visit_key = f"{target_file}#{fragment}"
    if visit_key in shared_refs:
        return {"$ref": shared_refs[visit_key]}
    if visit_key in visited:
        raise _circular_ref_error(ref, base_path)
    target_data = _load_yaml(target_file)
    resolved = _resolve_json_pointer(target_data, fragment) if fragment else target_data
    return _resolve_refs(
        resolved,
        target_file.parent,
        visited | {visit_key},
        root_doc=target_data,
        shared_refs=shared_refs,
        current_file=target_file,
    )


def _resolve_same_file_ref(
    fragment: str,
    ref: str,
    base_path: Path,
    visited: set[str],
    root_doc: Any,
    shared_refs: dict[str, str],
    current_file: Path | None,
) -> Any:
    """Resolve a same-file ``#/…`` $ref and return the inlined (or shared-ref) result."""
    if not fragment:
        # Bare "#" — refers to the whole document; preserve as-is.
        return {"$ref": ref}
    if current_file is not None:
        self_visit_key = f"{current_file}#{fragment}"
        if self_visit_key in shared_refs:
            return {"$ref": shared_refs[self_visit_key]}
    visit_key = f"<self>#{fragment}"
    if visit_key in visited:
        raise _circular_ref_error(ref, base_path)
    try:
        target = _resolve_json_pointer(root_doc, fragment)
    except (KeyError, TypeError, ValueError):
        # Pointer not found — preserve the ref so the caller can diagnose it.
        return {"$ref": ref}
    return _resolve_refs(
        target, base_path, visited | {visit_key}, root_doc=root_doc, shared_refs=shared_refs, current_file=current_file
    )


def _resolve_refs(
    node: Any,
    base_path: Path,
    visited: set[str] | None = None,
    root_doc: Any = None,
    shared_refs: dict[str, str] | None = None,
    current_file: Path | None = None,
) -> Any:
    """Recursively resolve all $ref values in *node*, loading external files as needed.

    Args:
        node: The YAML node (dict / list / scalar) to process.
        base_path: Directory of the file that contains *node* (used to resolve
            relative file $refs).
        visited: Set of "file_path#/json/pointer" strings already being resolved
            (guards against infinite recursion on circular refs).
        root_doc: The root document for resolving same-file $refs (e.g.
            ``#/definitions/Foo``).  Defaults to *node* on the first call.
        shared_refs: Mapping of ``"resolved_file_path#fragment"`` to a local
            ``$ref`` string like ``"#/components/schemas/ErrorData"``.  When an
            external or same-file ref (resolved against ``current_file``) matches
            a key in this dict the local ref is returned as-is instead of
            inlining the target schema.  This prevents shared base schemas from
            being duplicated at every usage site.
        current_file: The resolved path of the file currently being processed.
            Used to check same-file ``#/…`` refs against ``shared_refs`` when
            that file is a shared base file.

    Returns:
        A new structure with all $refs resolved inline (except shared_refs).

    """
    if visited is None:
        visited = set()
    if root_doc is None:
        root_doc = node
    if shared_refs is None:
        shared_refs = {}

    if isinstance(node, dict):
        if "$ref" in node and isinstance(node["$ref"], str):
            ref = node["$ref"]
            file_part, fragment = ref.split("#", 1) if "#" in ref else (ref, "")
            if file_part:
                resolved = _resolve_external_ref(file_part, fragment, ref, base_path, visited, shared_refs)
            else:
                resolved = _resolve_same_file_ref(
                    fragment, ref, base_path, visited, root_doc, shared_refs, current_file
                )
            # OpenAPI 3.1 (JSON Schema 2020-12) allows keywords alongside $ref.
            # These "sibling keywords" add constraints/metadata to the referenced schema
            # without modifying it. When the $ref resolves to a named component (stays
            # as a $ref in output), preserve the siblings so the bundled spec stays
            # semantically equivalent.
            siblings = {k: v for k, v in node.items() if k != "$ref"}
            if siblings and isinstance(resolved, dict) and "$ref" in resolved and len(resolved) == 1:
                resolved_siblings = {
                    k: _resolve_refs(v, base_path, visited, root_doc, shared_refs, current_file)
                    for k, v in siblings.items()
                }
                return {**resolved, **resolved_siblings}
            return resolved
        return {k: _resolve_refs(v, base_path, visited, root_doc, shared_refs, current_file) for k, v in node.items()}

    if isinstance(node, list):
        return [_resolve_refs(item, base_path, visited, root_doc, shared_refs, current_file) for item in node]

    return node


# ---------------------------------------------------------------------------
# Sub-spec discovery
# ---------------------------------------------------------------------------


def _discover_sub_specs() -> list[Path]:
    """Find all domain OpenAPI sub-specs under schemas/."""
    found: list[Path] = []
    for domain_dir in sorted(SCHEMAS_DIR.iterdir()):
        if not domain_dir.is_dir():
            continue
        if domain_dir.name in _SKIP_DIRS:
            continue

        for candidate in sorted(domain_dir.glob("*.yaml")) + sorted(domain_dir.glob("*.json")):
            if candidate.name in _SKIP_FILES:
                continue
            if candidate.name.startswith("websocket-"):
                continue  # AsyncAPI specs — skip
            # Only include files that look like OpenAPI specs
            try:
                data = _load_yaml(candidate)
            except yaml.YAMLError:
                continue
            if isinstance(data, dict) and "openapi" in data and "paths" in data:
                found.append(candidate)

    return found


# ---------------------------------------------------------------------------
# Merging
# ---------------------------------------------------------------------------


def _deep_merge_components(
    target: dict[str, Any],
    source: dict[str, Any],
    source_file: Path,
) -> None:
    """Merge *source* components into *target*, erroring on unexpected name collisions."""
    for section, items in source.items():
        if not isinstance(items, dict):
            continue
        if section not in target:
            target[section] = {}
        for name, definition in items.items():
            if name in target[section]:
                if target[section][name] != definition:
                    raise ValueError(
                        f"Component name collision: '{section}/{name}' defined differently "
                        f"in {source_file} and a previously merged spec. "
                        "Rename one of the conflicting definitions."
                    )
                # Same definition — deduplication, OK
            else:
                target[section][name] = definition


def _collect_tags(
    tags: list[dict[str, Any]],
    merged_tags: list[dict[str, Any]],
    seen_tag_names: set[str],
) -> None:
    """Append tags not already seen into *merged_tags*, updating *seen_tag_names*."""
    for tag in tags:
        tag_name = tag.get("name", "")
        if tag_name and tag_name not in seen_tag_names:
            merged_tags.append(tag)
            seen_tag_names.add(tag_name)


def _load_aggregator_metadata() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Return the fixed root info and servers for the merged spec."""
    root_info: dict[str, Any] = {
        "title": "Nexus API",
        "version": "0.1.0",
        "description": "A distributed multi-agent workflow orchestration system",
    }
    root_servers: list[dict[str, Any]] = [{"url": "/api/v1", "description": "API v1"}]
    return root_info, root_servers


def _load_shared_refs(merged_components: dict[str, Any]) -> dict[str, str]:
    """Load base shared schemas into *merged_components* and return a ref map.

    Returns a dict mapping ``"resolved_file_path#fragment"`` keys to local
    ``$ref`` strings (e.g. ``"#/components/schemas/ErrorData"``).  This map is
    passed to ``_resolve_refs`` so that references to base schemas are kept as
    named component refs rather than being inlined at every usage site.
    """
    if not _BASE_SHARED_SCHEMAS_FILE.exists():
        return {}

    base_data = _load_yaml(_BASE_SHARED_SCHEMAS_FILE)
    base_file = _BASE_SHARED_SCHEMAS_FILE.resolve()
    shared_refs: dict[str, str] = {}

    # Only pre-load named schemas, not responses/parameters, to avoid collisions
    # with sub-specs that define their own responses under the same names.
    schemas = base_data.get("components", {}).get("schemas", {})
    if schemas:
        if "schemas" not in merged_components:
            merged_components["schemas"] = {}
        for name, definition in schemas.items():
            merged_components["schemas"][name] = definition
            fragment = f"/components/schemas/{name}"
            shared_refs[f"{base_file}#{fragment}"] = f"#/components/schemas/{name}"

    return shared_refs


def _strip_self_ref_exports(components: dict[str, Any]) -> dict[str, Any]:
    """Remove component entries that are self-referential re-export stubs.

    After shared-ref substitution, a sub-spec entry like::

        components:
          schemas:
            BaseResource:
              $ref: '../base/shared-resources.openapi.yaml#/components/schemas/BaseResource'

    becomes ``BaseResource: {$ref: '#/components/schemas/BaseResource'}``.
    This is a no-op re-export; the schema is already registered under that
    name in the merged output.  Keeping it would cause a false collision in
    ``_deep_merge_components``.
    """
    stripped: dict[str, Any] = {}
    for section, items in components.items():
        if not isinstance(items, dict):
            stripped[section] = items
            continue
        filtered = {
            name: definition
            for name, definition in items.items()
            if not (isinstance(definition, dict) and definition == {"$ref": f"#/components/{section}/{name}"})
        }
        if filtered:
            stripped[section] = filtered
    return stripped


def _merge_sub_spec(
    spec_path: Path,
    merged_paths: dict[str, Any],
    merged_components: dict[str, Any],
    merged_tags: list[dict[str, Any]],
    seen_tag_names: set[str],
    shared_refs: dict[str, str],
) -> None:
    """Resolve and merge a single sub-spec into the accumulated collections."""
    spec_data = _load_yaml(spec_path)
    resolved_spec_path = spec_path.resolve()

    # Extend shared_refs with this spec's own component schemas so that
    # same-file $refs like '#/components/schemas/Foo' are preserved as named
    # component refs in the bundled output instead of being inlined at every
    # usage site.
    local_shared_refs = dict(shared_refs)
    for section, items in spec_data.get("components", {}).items():
        if isinstance(items, dict):
            for name in items:
                fragment = f"/components/{section}/{name}"
                local_shared_refs[f"{resolved_spec_path}#{fragment}"] = f"#/components/{section}/{name}"

    resolved = _resolve_refs(spec_data, spec_path.parent, shared_refs=local_shared_refs, current_file=spec_path)

    for path_key, path_item in resolved.get("paths", {}).items():
        if path_key in merged_paths:
            raise ValueError(f"Path collision: '{path_key}' defined in {spec_path} and a previously merged spec.")
        merged_paths[path_key] = path_item

    components = _strip_self_ref_exports(resolved.get("components", {}))
    _deep_merge_components(merged_components, components, spec_path)
    _collect_tags(resolved.get("tags", []), merged_tags, seen_tag_names)


def _build_merged_spec(sub_specs: list[Path]) -> dict[str, Any]:
    """Load, resolve, and merge all sub-specs into a single OpenAPI document."""
    merged_paths: dict[str, Any] = {}
    merged_components: dict[str, Any] = {}
    merged_tags: list[dict[str, Any]] = []
    seen_tag_names: set[str] = set()

    root_info, root_servers = _load_aggregator_metadata()

    # Pre-load base shared schemas so they appear as named components in the
    # bundled output and are referenced (not inlined) wherever used.
    shared_refs = _load_shared_refs(merged_components)

    for spec_path in sub_specs:
        _merge_sub_spec(spec_path, merged_paths, merged_components, merged_tags, seen_tag_names, shared_refs)

    merged: dict[str, Any] = {
        "openapi": "3.1.0",
        "info": root_info,
        "servers": root_servers,
    }
    if merged_tags:
        merged["tags"] = merged_tags
    merged["paths"] = merged_paths
    if merged_components:
        merged["components"] = merged_components

    return merged


# ---------------------------------------------------------------------------
# YAML output helpers
# ---------------------------------------------------------------------------


class _LiteralStr(str):
    """Marker class for multiline strings to be rendered with literal block style."""

    __slots__ = ()


def _literal_representer(dumper: yaml.Dumper, data: _LiteralStr) -> yaml.ScalarNode:
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")


def _str_representer(dumper: yaml.Dumper, data: str) -> yaml.ScalarNode:
    if "\n" in data:
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", data)


def _build_dumper() -> type[yaml.Dumper]:
    dumper = yaml.Dumper
    dumper.add_representer(_LiteralStr, _literal_representer)
    dumper.add_representer(str, _str_representer)
    return dumper


GENERATED_HEADER = """\
# =============================================================================
# DO NOT EDIT — this file is generated by `make api-spec-bundle`.
#
# Source: tools/bundle_openapi.py
# Sub-specs: src/nexus/schemas/*/openapi.yaml  (and *.openapi.yaml variants)
#
# To update: edit the relevant domain sub-spec, then run:
#   make api-spec-bundle
# =============================================================================
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "-o",
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Output file path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the merged spec to stdout without writing to disk",
    )
    parser.add_argument(
        "--list-specs",
        action="store_true",
        help="List discovered sub-specs and exit",
    )
    return parser.parse_args()


def main() -> None:
    """Discover sub-specs, merge them, and write the bundled OpenAPI document."""
    args = _parse_args()

    sub_specs = _discover_sub_specs()

    if args.list_specs:
        print("Discovered sub-specs:")
        for p in sub_specs:
            print(f"  {p.relative_to(PROJECT_ROOT)}")
        return

    if not sub_specs:
        sys.exit("No sub-specs found under src/nexus/schemas/. Nothing to bundle.")

    print(f"Bundling {len(sub_specs)} sub-spec(s)...")
    for p in sub_specs:
        print(f"  {p.relative_to(PROJECT_ROOT)}")

    merged = _build_merged_spec(sub_specs)

    output_yaml = yaml.dump(
        merged,
        Dumper=_build_dumper(),
        default_flow_style=False,
        allow_unicode=True,
        sort_keys=False,
        width=120,
    )
    # Strip trailing whitespace from each line (yaml.dump can leave it)
    output_yaml = re.sub(r"\s+$", "", output_yaml, flags=re.MULTILINE)

    full_output = GENERATED_HEADER + output_yaml

    if args.dry_run:
        print(full_output)
        return

    output_path = Path(args.output).resolve()
    output_path.write_text(full_output, encoding="utf-8")
    print(f"\nBundled spec written to: {output_path.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
