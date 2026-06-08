"""Tests for newly added settings catalog entries (AAP-70887)."""

import pytest

from nexus.settings.catalog import SETTINGS_CATALOG, SettingDefinition
from nexus.settings.models.runtime_setting import SettingCategory, SettingValueType

_NEW_KEYS = [
    "document_conversion.timeout_seconds",
    "document_conversion.overwrite_existing",
    "retriever.llm_model",
    "workflow_engine.max_loop_iterations",
    "workflow_engine.script_timeout_seconds",
    "workflow_engine.agentic_timeout_seconds",
    "workflow_engine.max_prompt_length",
]

_catalog_by_key = {d.key: d for d in SETTINGS_CATALOG}


class TestNewCatalogEntries:
    """Verify new settings are present with correct metadata."""

    @pytest.mark.parametrize("key", _NEW_KEYS)
    def test_key_exists_in_catalog(self, key: str) -> None:
        assert key in _catalog_by_key, f"Missing catalog entry: {key}"

    @pytest.mark.parametrize("key", _NEW_KEYS)
    def test_entries_are_setting_definitions(self, key: str) -> None:
        assert isinstance(_catalog_by_key[key], SettingDefinition)

    def test_document_conversion_timeout(self) -> None:
        d = _catalog_by_key["document_conversion.timeout_seconds"]
        assert d.category == SettingCategory.APPLICATION
        assert d.value_type == SettingValueType.INTEGER
        assert d.default_value == 30
        assert d.validation_schema == {"min": 1, "max": 300}

    def test_document_conversion_overwrite(self) -> None:
        d = _catalog_by_key["document_conversion.overwrite_existing"]
        assert d.category == SettingCategory.APPLICATION
        assert d.value_type == SettingValueType.BOOLEAN
        assert d.default_value is False

    def test_retriever_llm_model(self) -> None:
        d = _catalog_by_key["retriever.llm_model"]
        assert d.category == SettingCategory.AI_LLM
        assert d.value_type == SettingValueType.STRING
        assert d.default_value == "anthropic/claude-3.5-sonnet"
        assert d.requires_restart is True

    def test_only_retriever_requires_restart(self) -> None:
        for key in _NEW_KEYS:
            d = _catalog_by_key[key]
            if key == "retriever.llm_model":
                assert d.requires_restart is True
            else:
                assert d.requires_restart is False, f"{key} should not require restart"

    def test_workflow_settings_have_min_constraint(self) -> None:
        keys = [
            "workflow_engine.max_loop_iterations",
            "workflow_engine.script_timeout_seconds",
            "workflow_engine.agentic_timeout_seconds",
            "workflow_engine.max_prompt_length",
        ]
        for key in keys:
            d = _catalog_by_key[key]
            assert d.validation_schema is not None
            assert d.validation_schema.get("min") is not None, f"{key} missing min constraint"

    def test_removed_settings_not_in_catalog(self) -> None:
        removed = [
            "workflow_engine.api_timeout_seconds",
            "workflow_engine.max_duration_hours",
            "workflow_engine.max_duration_minutes",
            "workflow_engine.max_duration_seconds",
            "workflow_engine.max_input_value_length",
            "workflow_engine.max_total_input_size",
        ]
        for key in removed:
            assert key not in _catalog_by_key, f"{key} should have been removed from catalog"
