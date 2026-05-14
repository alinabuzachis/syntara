"""Unit tests for ToolProviderUpdateEvent and handler."""

from uuid import uuid4

from nexus.audit.models.audit_event import EventCategory, EventSeverity, EventStatus
from nexus.tool_manager.audit.provider_update import (
    ToolProviderUpdateEvent,
    ToolProviderUpdateHandler,
)


class TestToolProviderUpdateHandler:
    """Tests for ToolProviderUpdateHandler."""

    def _make_event(self, **overrides: object) -> ToolProviderUpdateEvent:
        defaults: dict[str, object] = {
            "provider_id": uuid4(),
            "provider_name": "GitHub MCP",
            "updated_fields": ["name", "description"],
            "provider_type": "mcp",
        }
        defaults.update(overrides)
        return ToolProviderUpdateEvent(**defaults)  # type: ignore[arg-type]

    def test_success_event(self) -> None:
        """Should produce INFO SYSTEM_OPERATION event for successful update."""
        handler = ToolProviderUpdateHandler()
        event = self._make_event()

        audit_event = handler.handle(event)

        assert audit_event.event_action == "provider_updated"
        assert audit_event.event_category == EventCategory.SYSTEM_OPERATION
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.source_component == "nexus.tool_manager.provider"
        assert audit_event.event_message == "Tool provider updated: GitHub MCP"

    def test_error_event(self) -> None:
        """Should produce ERROR event when error_type is set."""
        handler = ToolProviderUpdateHandler()
        event = self._make_event(error_type="ToolProviderNotFoundError")

        audit_event = handler.handle(event)

        assert audit_event.event_severity == EventSeverity.ERROR
        assert audit_event.event_status == EventStatus.ERROR
        assert "failed" in audit_event.event_message
        assert audit_event.structured_data.error_type == "ToolProviderNotFoundError"

    def test_resource_fields(self) -> None:
        """Should set resource URN and name correctly."""
        handler = ToolProviderUpdateHandler()
        provider_id = uuid4()
        event = self._make_event(provider_id=provider_id, provider_name="Test Provider")

        audit_event = handler.handle(event)

        assert audit_event.resource_urn == f"urn:nexus:tool-provider:{provider_id}"
        assert audit_event.resource_name == "Test Provider"

    def test_structured_data_fields(self) -> None:
        """Should include all relevant fields in structured data."""
        handler = ToolProviderUpdateHandler()
        event = self._make_event(
            provider_name="Slack MCP",
            updated_fields=["name", "configuration"],
            provider_type="mcp",
        )

        audit_event = handler.handle(event)
        data = audit_event.structured_data

        assert data.data_type == "provider-update-context"
        assert data.provider_name == "Slack MCP"  # type: ignore[attr-defined]
        assert data.updated_fields == ["name", "configuration"]  # type: ignore[attr-defined]
        assert data.provider_type == "mcp"  # type: ignore[attr-defined]
        assert data.error_type is None

    def test_empty_updated_fields(self) -> None:
        """Should handle empty updated_fields list."""
        handler = ToolProviderUpdateHandler()
        event = self._make_event(updated_fields=[])

        audit_event = handler.handle(event)

        assert audit_event.structured_data.updated_fields == []  # type: ignore[attr-defined]

    def test_single_field_update(self) -> None:
        """Should handle single field update."""
        handler = ToolProviderUpdateHandler()
        event = self._make_event(updated_fields=["description"])

        audit_event = handler.handle(event)

        assert audit_event.structured_data.updated_fields == ["description"]  # type: ignore[attr-defined]

    def test_none_provider_type(self) -> None:
        """Should handle None provider_type gracefully."""
        handler = ToolProviderUpdateHandler()
        event = self._make_event(provider_type=None)

        audit_event = handler.handle(event)

        assert audit_event.structured_data.provider_type is None  # type: ignore[attr-defined]
