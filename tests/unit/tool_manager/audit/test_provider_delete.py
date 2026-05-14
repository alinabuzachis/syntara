"""Unit tests for ToolProviderDeleteEvent and handler."""

from uuid import uuid4

from nexus.audit.models.audit_event import EventCategory, EventSeverity, EventStatus
from nexus.tool_manager.audit.provider_delete import (
    ToolProviderDeleteEvent,
    ToolProviderDeleteHandler,
)


class TestToolProviderDeleteHandler:
    """Tests for ToolProviderDeleteHandler."""

    def _make_event(self, **overrides: object) -> ToolProviderDeleteEvent:
        defaults: dict[str, object] = {
            "provider_id": uuid4(),
            "provider_name": "GitHub MCP",
            "tools_deleted": 5,
        }
        defaults.update(overrides)
        return ToolProviderDeleteEvent(**defaults)  # type: ignore[arg-type]

    def test_success_event(self) -> None:
        """Should produce WARNING SYSTEM_OPERATION event for successful deletion."""
        handler = ToolProviderDeleteHandler()
        event = self._make_event()

        audit_event = handler.handle(event)

        assert audit_event.event_action == "provider_deleted"
        assert audit_event.event_category == EventCategory.SYSTEM_OPERATION
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.source_component == "nexus.tool_manager.provider"
        assert audit_event.event_message == "Tool provider deleted: GitHub MCP"

    def test_error_event(self) -> None:
        """Should produce ERROR event when error_type is set."""
        handler = ToolProviderDeleteHandler()
        event = self._make_event(error_type="ToolProviderNotFoundError")

        audit_event = handler.handle(event)

        assert audit_event.event_severity == EventSeverity.ERROR
        assert audit_event.event_status == EventStatus.ERROR
        assert "failed" in audit_event.event_message
        assert audit_event.structured_data.error_type == "ToolProviderNotFoundError"

    def test_resource_fields(self) -> None:
        """Should set resource URN and name correctly."""
        handler = ToolProviderDeleteHandler()
        provider_id = uuid4()
        event = self._make_event(provider_id=provider_id, provider_name="Test Provider")

        audit_event = handler.handle(event)

        assert audit_event.resource_urn == f"urn:nexus:tool-provider:{provider_id}"
        assert audit_event.resource_name == "Test Provider"

    def test_structured_data_fields(self) -> None:
        """Should include all relevant fields in structured data."""
        handler = ToolProviderDeleteHandler()
        event = self._make_event(
            provider_name="Slack MCP",
            tools_deleted=12,
        )

        audit_event = handler.handle(event)
        data = audit_event.structured_data

        assert data.data_type == "provider-delete-context"
        assert data.provider_name == "Slack MCP"  # type: ignore[attr-defined]
        assert data.tools_deleted == 12  # type: ignore[attr-defined]
        assert data.error_type is None

    def test_zero_tools_deleted(self) -> None:
        """Should handle zero tools deleted gracefully."""
        handler = ToolProviderDeleteHandler()
        event = self._make_event(tools_deleted=0)

        audit_event = handler.handle(event)

        assert audit_event.structured_data.tools_deleted == 0  # type: ignore[attr-defined]

    def test_single_tool_deleted(self) -> None:
        """Should handle single tool deletion."""
        handler = ToolProviderDeleteHandler()
        event = self._make_event(tools_deleted=1)

        audit_event = handler.handle(event)

        assert audit_event.structured_data.tools_deleted == 1  # type: ignore[attr-defined]
