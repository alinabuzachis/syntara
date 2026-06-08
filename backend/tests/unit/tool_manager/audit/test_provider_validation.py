"""Unit tests for ToolProviderValidationEvent and handler."""

from uuid import uuid4

from nexus.audit.models.audit_event import EventCategory, EventSeverity, EventStatus
from nexus.tool_manager.audit.provider_validation import (
    ToolProviderValidationEvent,
    ToolProviderValidationHandler,
)
from nexus.tool_manager.models.tool_provider import ProviderStatus


class TestToolProviderValidationHandler:
    """Tests for ToolProviderValidationHandler."""

    def _make_event(self, **overrides: object) -> ToolProviderValidationEvent:
        defaults: dict[str, object] = {
            "provider_name": "GitHub MCP",
            "provider_type": "mcp",
            "provider_id": uuid4(),
            "timeout": False,
            "result_status": ProviderStatus.AVAILABLE,
            "is_definition_validation": False,
            "error_type": None,
        }
        defaults.update(overrides)
        return ToolProviderValidationEvent(**defaults)  # type: ignore[arg-type]

    def test_success_provider_validation(self) -> None:
        """Should produce INFO event for successful provider validation."""
        handler = ToolProviderValidationHandler()
        event = self._make_event()

        audit_event = handler.handle(event)

        assert audit_event.event_action == "provider_validated"
        assert audit_event.event_category == EventCategory.SYSTEM_OPERATION
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.source_component == "nexus.tool_manager.provider"
        assert "GitHub MCP" in audit_event.event_message
        assert "successful" in audit_event.event_message

    def test_success_definition_validation(self) -> None:
        """Should produce INFO event for successful definition validation."""
        handler = ToolProviderValidationHandler()
        event = self._make_event(is_definition_validation=True, provider_id=None, result_status=None)

        audit_event = handler.handle(event)

        assert audit_event.event_action == "provider_definition_validated"
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.resource_urn is None

    def test_validation_failure(self) -> None:
        """Should produce WARNING ERROR event for validation failure."""
        handler = ToolProviderValidationHandler()
        event = self._make_event(
            error_type="ValidationError",
            result_status=ProviderStatus.ERROR,
        )

        audit_event = handler.handle(event)

        assert audit_event.event_severity == EventSeverity.WARNING
        assert audit_event.event_status == EventStatus.ERROR
        assert "failed" in audit_event.event_message
        assert audit_event.structured_data.error_message == "Look at the Operational Logs for full diagnosis"
        assert audit_event.structured_data.error_type == "ValidationError"

    def test_validation_timeout(self) -> None:
        """Should produce WARNING ERROR event for validation timeout."""
        handler = ToolProviderValidationHandler()
        event = self._make_event(
            error_type="TimeoutError",
            timeout=True,
        )

        audit_event = handler.handle(event)

        assert audit_event.event_severity == EventSeverity.WARNING
        assert audit_event.event_status == EventStatus.ERROR
        assert "timeout" in audit_event.event_message
        assert audit_event.structured_data.timeout is True  # type: ignore[attr-defined]

    def test_resource_fields_with_provider_id(self) -> None:
        """Should set resource URN when provider_id is present."""
        handler = ToolProviderValidationHandler()
        provider_id = uuid4()
        event = self._make_event(provider_id=provider_id, provider_name="Test Provider")

        audit_event = handler.handle(event)

        assert audit_event.resource_urn == f"urn:nexus:tool-provider:{provider_id}"
        assert audit_event.resource_name == "Test Provider"

    def test_resource_fields_without_provider_id(self) -> None:
        """Should not set resource URN for definition validation."""
        handler = ToolProviderValidationHandler()
        event = self._make_event(provider_id=None, is_definition_validation=True)

        audit_event = handler.handle(event)

        assert audit_event.resource_urn is None
        assert audit_event.resource_name == "GitHub MCP"

    def test_structured_data_fields(self) -> None:
        """Should include all relevant fields in structured data."""
        handler = ToolProviderValidationHandler()
        event = self._make_event(
            provider_name="Slack MCP",
            provider_type="mcp",
            timeout=False,
            result_status=ProviderStatus.AVAILABLE,
            is_definition_validation=False,
        )

        audit_event = handler.handle(event)
        data = audit_event.structured_data

        assert data.data_type == "provider-validation-context"
        assert data.provider_name == "Slack MCP"  # type: ignore[attr-defined]
        assert data.provider_type == "mcp"  # type: ignore[attr-defined]
        assert data.timeout is False  # type: ignore[attr-defined]
        assert data.result_status == "available"  # type: ignore[attr-defined]
        assert data.is_definition_validation is False  # type: ignore[attr-defined]
        assert data.error_type is None
        assert data.error_message is None

    def test_none_result_status(self) -> None:
        """Should handle None result_status for definition validation."""
        handler = ToolProviderValidationHandler()
        event = self._make_event(result_status=None, is_definition_validation=True)

        audit_event = handler.handle(event)

        assert audit_event.structured_data.result_status is None  # type: ignore[attr-defined]
