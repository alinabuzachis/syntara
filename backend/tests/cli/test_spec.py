"""Tests for CLI spec caching behavior."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

from orchestrator_cli import spec as spec_module

if TYPE_CHECKING:
    from pathlib import Path


def test_load_spec_prefers_json_cache_when_manifest_matches(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """The JSON cache should win when the source manifest still matches."""
    schemas_dir = tmp_path / "schemas"
    schemas_dir.mkdir()

    cached_json = tmp_path / "openapi.json"
    legacy_yaml = tmp_path / "openapi.yaml"
    manifest_path = tmp_path / "spec-hashes.json"

    json_spec = {"openapi": "3.1.0", "info": {"title": "json-cache"}}
    cached_json.write_text(json.dumps(json_spec))
    legacy_yaml.write_text("openapi: 3.1.0\ninfo:\n  title: yaml-cache\n")
    manifest_path.write_text(json.dumps({"users/openapi.yaml": "abc"}))

    monkeypatch.setattr(spec_module, "_CACHED_SPEC_JSON", cached_json)
    monkeypatch.setattr(spec_module, "_LEGACY_CACHED_SPEC_YAML", legacy_yaml)
    monkeypatch.setattr(spec_module, "_HASH_MANIFEST", manifest_path)
    monkeypatch.setattr(spec_module, "_find_schemas_dir", lambda: schemas_dir)
    monkeypatch.setattr(spec_module, "_collect_source_files", lambda _: [schemas_dir / "users.openapi.yaml"])
    monkeypatch.setattr(spec_module, "_build_manifest", lambda *_: {"users/openapi.yaml": "abc"})

    spec = spec_module.load_spec()

    assert spec == json_spec


def test_load_spec_falls_back_to_legacy_yaml_cache_when_json_cache_is_invalid(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """An invalid JSON cache should fall back to legacy YAML and rewrite JSON."""
    schemas_dir = tmp_path / "schemas"
    schemas_dir.mkdir()

    cached_json = tmp_path / "openapi.json"
    legacy_yaml = tmp_path / "openapi.yaml"
    manifest_path = tmp_path / "spec-hashes.json"

    cached_json.write_text("{not valid json")
    legacy_yaml.write_text("openapi: 3.1.0\ninfo:\n  title: yaml-cache\n")
    manifest_path.write_text(json.dumps({"users/openapi.yaml": "abc"}))

    monkeypatch.setattr(spec_module, "_CACHED_SPEC_JSON", cached_json)
    monkeypatch.setattr(spec_module, "_LEGACY_CACHED_SPEC_YAML", legacy_yaml)
    monkeypatch.setattr(spec_module, "_HASH_MANIFEST", manifest_path)
    monkeypatch.setattr(spec_module, "_find_schemas_dir", lambda: schemas_dir)
    monkeypatch.setattr(spec_module, "_collect_source_files", lambda _: [schemas_dir / "users.openapi.yaml"])
    monkeypatch.setattr(spec_module, "_build_manifest", lambda *_: {"users/openapi.yaml": "abc"})

    spec = spec_module.load_spec()

    assert spec["info"]["title"] == "yaml-cache"
    assert json.loads(cached_json.read_text())["info"]["title"] == "yaml-cache"
