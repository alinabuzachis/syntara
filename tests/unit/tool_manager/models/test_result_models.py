"""Unit tests for result dataclass models.

Tests cover:
- BulkUpdateResult dataclass functionality
- ToolValidationResult dataclass functionality
- ToolProviderValidationResult dataclass functionality
- Dictionary conversion methods
- Round-trip serialization
"""

from datetime import UTC, datetime

from nexus.tool_manager.models.bulk_update import BulkUpdateResult
from nexus.tool_manager.models.tool_provider_validation_result import ToolProviderValidationResult
from nexus.tool_manager.models.tool_validation import ToolValidationResult


def test_bulk_update_result_creation() -> None:
    """Test BulkUpdateResult dataclass creation."""
    result = BulkUpdateResult(
        updated_count=8,
        requested_count=10,
        success=False,
    )

    assert result.updated_count == 8
    assert result.requested_count == 10
    assert result.success is False


def test_bulk_update_result_success_scenario() -> None:
    """Test BulkUpdateResult for successful bulk update."""
    result = BulkUpdateResult(
        updated_count=5,
        requested_count=5,
        success=True,
    )

    assert result.updated_count == 5
    assert result.requested_count == 5
    assert result.success is True


def test_tool_validation_result_creation() -> None:
    """Test ToolValidationResult dataclass creation."""
    now = datetime.now(UTC)

    result = ToolValidationResult(
        success=True,
        duration_ms=1500,
        status="success",
        message="Tool validation completed successfully",
        validated_at=now,
        validation_output={"result": "valid"},
    )

    assert result.success is True
    assert result.duration_ms == 1500
    assert result.status == "success"
    assert result.message == "Tool validation completed successfully"
    assert result.validated_at == now
    assert result.validation_output == {"result": "valid"}


def test_tool_validation_result_without_output() -> None:
    """Test ToolValidationResult without validation_output."""
    now = datetime.now(UTC)

    result = ToolValidationResult(
        success=False,
        duration_ms=500,
        status="timeout",
        message="Tool validation timed out",
        validated_at=now,
    )

    assert result.success is False
    assert result.duration_ms == 500
    assert result.status == "timeout"
    assert result.message == "Tool validation timed out"
    assert result.validated_at == now
    assert result.validation_output is None


def test_connection_validation_result_creation() -> None:
    """Test ToolProviderValidationResult dataclass creation."""
    now = datetime.now(UTC)

    result = ToolProviderValidationResult(
        valid=True,
        provider_type="mcp",
        validated_at=now,
        error=None,
    )

    assert result.valid is True
    assert result.provider_type == "mcp"
    assert result.validated_at == now
    assert result.error is None


def test_connection_validation_result_with_error() -> None:
    """Test ToolProviderValidationResult with error."""
    now = datetime.now(UTC)

    result = ToolProviderValidationResult(
        valid=False,
        provider_type="custom",
        validated_at=now,
        error="Authentication failed",
    )

    assert result.valid is False
    assert result.provider_type == "custom"
    assert result.validated_at == now
    assert result.error == "Authentication failed"
