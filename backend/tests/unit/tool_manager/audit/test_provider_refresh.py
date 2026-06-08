"""Unit tests for ToolProviderRefreshEvent and handler."""

from uuid import uuid4

from nexus.audit.models.audit_event import EventCategory, EventSeverity, EventStatus
from nexus.tool_manager.audit.provider_refresh import (
    ToolProviderRefreshEvent,
    ToolProviderRefreshHandler,
)


class TestToolProviderRefreshHandler:
    """Tests for ToolProviderRefreshHandler."""

    def _make_event(self, **overrides: object) -> ToolProviderRefreshEvent:
        defaults: dict[str, object] = {
            "provider_id": uuid4(),
            "provider_name": "GitHub MCP",
            "refreshed_count": 3,
            "updated_count": 2,
            "disabled_count": 1,
        }
        defaults.update(overrides)
        return ToolProviderRefreshEvent(**defaults)  # type: ignore[arg-type]

    def test_success_event(self) -> None:
        """Should produce INFO SYSTEM_OPERATION event for successful refresh."""
        handler = ToolProviderRefreshHandler()
        event = self._make_event()

        audit_event = handler.handle(event)

        assert audit_event.event_action == "provider_tools_refreshed"
        assert audit_event.event_category == EventCategory.SYSTEM_OPERATION
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.source_component == "nexus.tool_manager.provider"
        assert audit_event.structured_data.total_tools == 5  # type: ignore[attr-defined]
        assert "GitHub MCP" in audit_event.event_message
        assert "completed" in audit_event.event_message

    def test_error_event(self) -> None:
        """Should produce ERROR event when error_type is set."""
        handler = ToolProviderRefreshHandler()
        event = self._make_event(error_type="ToolRefreshError")

        audit_event = handler.handle(event)

        assert audit_event.event_severity == EventSeverity.ERROR
        assert audit_event.event_status == EventStatus.ERROR
        assert "failed" in audit_event.event_message
        assert audit_event.structured_data.error_type == "ToolRefreshError"
        assert audit_event.structured_data.error_message == "Look at the Operational Logs for full diagnosis"

    def test_resource_fields(self) -> None:
        """Should set resource URN and name correctly."""
        handler = ToolProviderRefreshHandler()
        provider_id = uuid4()
        event = self._make_event(provider_id=provider_id, provider_name="Test Provider")

        audit_event = handler.handle(event)

        assert audit_event.resource_urn == f"urn:nexus:tool-provider:{provider_id}"
        assert audit_event.resource_name == "Test Provider"

    def test_structured_data_fields(self) -> None:
        """Should include all relevant fields in structured data."""
        handler = ToolProviderRefreshHandler()
        event = self._make_event(
            provider_name="Slack MCP",
            refreshed_count=10,
            updated_count=5,
            disabled_count=2,
        )

        audit_event = handler.handle(event)
        data = audit_event.structured_data

        assert data.data_type == "provider-refresh-context"
        assert data.provider_name == "Slack MCP"  # type: ignore[attr-defined]
        assert data.refreshed_count == 10  # type: ignore[attr-defined]
        assert data.updated_count == 5  # type: ignore[attr-defined]
        assert data.disabled_count == 2  # type: ignore[attr-defined]
        assert data.total_tools == 15  # type: ignore[attr-defined]
        assert data.error_type is None

    def test_zero_counts(self) -> None:
        """Should handle zero counts gracefully."""
        handler = ToolProviderRefreshHandler()
        event = self._make_event(refreshed_count=0, updated_count=0, disabled_count=0)

        audit_event = handler.handle(event)

        assert audit_event.structured_data.total_tools == 0  # type: ignore[attr-defined]

    def test_only_refreshed_tools(self) -> None:
        """Should handle case where only new tools were added."""
        handler = ToolProviderRefreshHandler()
        event = self._make_event(refreshed_count=5, updated_count=0, disabled_count=0)

        audit_event = handler.handle(event)

        assert audit_event.structured_data.refreshed_count == 5  # type: ignore[attr-defined]
        assert audit_event.structured_data.updated_count == 0  # type: ignore[attr-defined]
        assert audit_event.structured_data.total_tools == 5  # type: ignore[attr-defined]

    def test_only_updated_tools(self) -> None:
        """Should handle case where only existing tools were updated."""
        handler = ToolProviderRefreshHandler()
        event = self._make_event(refreshed_count=0, updated_count=8, disabled_count=0)

        audit_event = handler.handle(event)

        assert audit_event.structured_data.refreshed_count == 0  # type: ignore[attr-defined]
        assert audit_event.structured_data.updated_count == 8  # type: ignore[attr-defined]
        assert audit_event.structured_data.total_tools == 8  # type: ignore[attr-defined]
