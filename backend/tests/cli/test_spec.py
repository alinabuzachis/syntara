"""Tests for CLI spec caching behavior."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING

import pytest
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


def test_load_spec_falls_back_to_bundled_package_yaml_when_no_source_tree_or_cache(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Bundled openapi.yaml fallback when no source tree or cache exists.

    Regression test: the previous fallback looked inside the syntara_api_client package directory,
    which does not ship openapi.yaml, causing a FileNotFoundError on every import of
    orchestrator_cli outside the source tree.

    Uses a fake package dir (not the source-tree sibling) so this proves Path(__file__).parent
    lookup the way an installed wheel would resolve it.
    """
    package_dir = tmp_path / "orchestrator_cli"
    package_dir.mkdir()
    bundled = package_dir / "openapi.yaml"
    bundled.write_text("openapi: 3.1.0\ninfo:\n  title: bundled-package-spec\n  version: '0.0.0'\npaths: {}\n")

    monkeypatch.setattr(spec_module, "_CACHED_SPEC_JSON", tmp_path / "openapi.json")
    monkeypatch.setattr(spec_module, "_LEGACY_CACHED_SPEC_YAML", tmp_path / "legacy-openapi.yaml")
    monkeypatch.setattr(spec_module, "_HASH_MANIFEST", tmp_path / "spec-hashes.json")
    monkeypatch.setattr(spec_module, "_find_schemas_dir", lambda: None)
    monkeypatch.setattr(spec_module, "__file__", str(package_dir / "spec.py"))

    spec = spec_module.load_spec()

    assert spec["openapi"] == "3.1.0"
    assert spec["info"]["title"] == "bundled-package-spec"


def test_load_spec_raises_when_no_spec_available(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """FileNotFoundError should be raised with guidance when all fallbacks fail."""
    monkeypatch.setattr(spec_module, "_CACHED_SPEC_JSON", tmp_path / "openapi.json")
    monkeypatch.setattr(spec_module, "_LEGACY_CACHED_SPEC_YAML", tmp_path / "openapi.yaml")
    monkeypatch.setattr(spec_module, "_HASH_MANIFEST", tmp_path / "spec-hashes.json")
    monkeypatch.setattr(spec_module, "_find_schemas_dir", lambda: None)
    monkeypatch.setattr(spec_module, "__file__", str(tmp_path / "spec.py"))

    with pytest.raises(FileNotFoundError, match="orchestrator_cli"):
        spec_module.load_spec()
