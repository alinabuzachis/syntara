"""Tests for apply_output_mapping (task 6.1).

Tests cover:
- None config (no mapping, return full result)
- Empty config (suppress all outputs, return only status)
- Field mappings (extract specific fields)
- Failed status bypass (output mapping skipped on failures)
"""

from typing import Any

import pytest
from temporalio.exceptions import ApplicationError

from nexus.workflows.workflow_engine.activities.output_mapping import apply_output_mapping

# ---------------------------------------------------------------------------
# None config — no mapping
# ---------------------------------------------------------------------------


class TestOutputMappingNoneConfig:
    """When output_config is None, result is returned unchanged."""

    def test_returns_full_result(self) -> None:
        result: dict[str, Any] = {"status": "completed", "output": {"key": "value"}, "extra": 42}
        mapped = apply_output_mapping(result, None)
        assert mapped == result

    def test_returns_same_dict_object(self) -> None:
        result: dict[str, Any] = {"status": "completed", "data": "x"}
        mapped = apply_output_mapping(result, None)
        assert mapped is result


# ---------------------------------------------------------------------------
# Empty config — suppress all output
# ---------------------------------------------------------------------------


class TestOutputMappingEmptyConfig:
    """When output_config is {}, only status is returned."""

    def test_returns_only_status(self) -> None:
        result: dict[str, Any] = {"status": "completed", "output": {"big": "data"}, "extra": True}
        mapped = apply_output_mapping(result, {})
        assert mapped == {"status": "completed"}

    def test_original_fields_stripped(self) -> None:
        result: dict[str, Any] = {"status": "completed", "output": {"a": 1}, "b": 2}
        mapped = apply_output_mapping(result, {})
        assert "output" not in mapped
        assert "b" not in mapped


# ---------------------------------------------------------------------------
# Field mappings — extract specific fields
# ---------------------------------------------------------------------------


class TestOutputMappingFieldMappings:
    """When output_config has mappings, only mapped fields + status are returned."""

    def test_single_field_mapping(self) -> None:
        result: dict[str, Any] = {"status": "completed", "response_code": 200, "body": "hello"}
        mapped = apply_output_mapping(result, {"code": "${result.response_code}"})
        assert mapped["status"] == "completed"
        assert mapped["code"] == 200
        assert "body" not in mapped
        assert "response_code" not in mapped

    def test_multiple_field_mappings(self) -> None:
        result: dict[str, Any] = {"status": "completed", "a": 1, "b": 2, "c": 3}
        mapped = apply_output_mapping(result, {"x": "${result.a}", "y": "${result.b}"})
        assert mapped == {"status": "completed", "x": 1, "y": 2}

    def test_nested_field_mapping(self) -> None:
        result: dict[str, Any] = {"status": "completed", "output": {"nested": {"val": 42}}}
        mapped = apply_output_mapping(result, {"deep": "${result.output.nested.val}"})
        assert mapped == {"status": "completed", "deep": 42}

    def test_string_interpolation_in_mapping(self) -> None:
        result: dict[str, Any] = {"status": "completed", "code": 200}
        mapped = apply_output_mapping(result, {"msg": "status=${result.code}"})
        assert mapped["msg"] == "status=200"


# ---------------------------------------------------------------------------
# Non-completed status bypass
# ---------------------------------------------------------------------------


class TestOutputMappingNonCompletedBypass:
    """Output mapping is skipped when status is not 'completed'."""

    def test_non_completed_status_returns_unchanged(self) -> None:
        """manual_trigger can produce non-completed status via user-supplied input."""
        result: dict[str, Any] = {"status": "override", "data": "x"}
        mapped = apply_output_mapping(result, {"data": "${result.data}"})
        assert mapped == result

    def test_non_completed_with_empty_config_returns_unchanged(self) -> None:
        result: dict[str, Any] = {"status": "override", "data": "x"}
        mapped = apply_output_mapping(result, {})
        assert mapped == result

    def test_non_completed_with_none_config_returns_unchanged(self) -> None:
        result: dict[str, Any] = {"status": "override", "data": "x"}
        mapped = apply_output_mapping(result, None)
        assert mapped == result

    def test_non_completed_returns_same_object(self) -> None:
        result: dict[str, Any] = {"status": "override"}
        mapped = apply_output_mapping(result, {"x": "${result.status}"})
        assert mapped is result


# ---------------------------------------------------------------------------
# Error paths in field mappings
# ---------------------------------------------------------------------------


class TestOutputMappingErrors:
    """Error paths for apply_output_mapping."""

    def test_mapping_referencing_missing_field_raises(self) -> None:
        """Template referencing non-existent field raises ApplicationError."""
        result: dict[str, Any] = {"status": "completed", "a": 1}
        with pytest.raises(ApplicationError) as exc_info:
            apply_output_mapping(result, {"x": "${result.nonexistent}"})
        assert exc_info.value.type == "OutputMappingError"
        assert exc_info.value.non_retryable is True

    def test_mapping_preserves_status_completed(self) -> None:
        """Mapped result always includes status=completed."""
        result: dict[str, Any] = {"status": "completed", "a": 1}
        mapped = apply_output_mapping(result, {"x": "${result.a}"})
        assert mapped["status"] == "completed"
        assert len(mapped) == 2  # status + x only
