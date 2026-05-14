"""Unit tests for ToolProviderCreateEvent and handler."""

from uuid import uuid4

import pytest

from nexus.audit.models.audit_event import EventCategory, EventSeverity, EventStatus
from nexus.tool_manager.audit.provider_create import (
    ToolProviderCreateEvent,
    ToolProviderCreateHandler,
)
from nexus.tool_manager.models.tool_provider import ProviderStatus


class TestToolProviderCreateHandler:
    """Tests for ToolProviderCreateHandler."""

    def _make_event(self, **overrides: object) -> ToolProviderCreateEvent:
        defaults: dict[str, object] = {
            "provider_id": uuid4(),
            "provider_name": "GitHub MCP",
            "provider_type": "mcp",
            "description": "GitHub integration via MCP",
            "initial_status": ProviderStatus.VALIDATING,
        }
        defaults.update(overrides)
        return ToolProviderCreateEvent(**defaults)  # type: ignore[arg-type]

    def test_success_event(self) -> None:
        """Should produce INFO SYSTEM_OPERATION event for successful creation."""
        handler = ToolProviderCreateHandler()
        event = self._make_event()

        audit_event = handler.handle(event)

        assert audit_event.event_action == "provider_created"
        assert audit_event.event_category == EventCategory.SYSTEM_OPERATION
        assert audit_event.event_severity == EventSeverity.INFO
        assert audit_event.event_status == EventStatus.SUCCESS
        assert audit_event.source_component == "nexus.tool_manager.provider"
        assert audit_event.event_message == "Tool provider created: GitHub MCP"

    def test_error_event(self) -> None:
        """Should produce ERROR event when error_type is set."""
        handler = ToolProviderCreateHandler()
        event = self._make_event(error_type="IntegrityError")

        audit_event = handler.handle(event)

        assert audit_event.event_severity == EventSeverity.ERROR
        assert audit_event.event_status == EventStatus.ERROR
        assert "failed" in audit_event.event_message
        assert audit_event.structured_data.error_type == "IntegrityError"

    def test_resource_fields(self) -> None:
        """Should set resource URN and name correctly."""
        handler = ToolProviderCreateHandler()
        provider_id = uuid4()
        event = self._make_event(provider_id=provider_id, provider_name="Test Provider")

        audit_event = handler.handle(event)

        assert audit_event.resource_urn == f"urn:nexus:tool-provider:{provider_id}"
        assert audit_event.resource_name == "Test Provider"

    def test_structured_data_fields(self) -> None:
        """Should include all relevant fields in structured data."""
        handler = ToolProviderCreateHandler()
        provider_id = uuid4()
        event = self._make_event(
            provider_id=provider_id,
            provider_name="Slack MCP",
            provider_type="mcp",
            description="Slack integration",
            initial_status=ProviderStatus.AVAILABLE,
        )

        audit_event = handler.handle(event)
        data = audit_event.structured_data

        assert data.data_type == "provider-create-context"
        assert data.provider_name == "Slack MCP"  # type: ignore[attr-defined]
        assert data.provider_type == "mcp"  # type: ignore[attr-defined]
        assert data.description == "Slack integration"  # type: ignore[attr-defined]
        assert data.initial_status == "available"  # type: ignore[attr-defined]
        assert data.error_type is None

    def test_none_description(self) -> None:
        """Should handle None description gracefully."""
        handler = ToolProviderCreateHandler()
        event = self._make_event(description=None)

        audit_event = handler.handle(event)

        assert audit_event.structured_data.description is None  # type: ignore[attr-defined]

    @pytest.mark.parametrize(
        "status",
        [ProviderStatus.VALIDATING, ProviderStatus.AVAILABLE, ProviderStatus.ERROR],
    )
    def test_different_initial_statuses(self, status: ProviderStatus) -> None:
        """Should handle different initial statuses."""
        handler = ToolProviderCreateHandler()
        event = self._make_event(initial_status=status)

        audit_event = handler.handle(event)

        assert audit_event.structured_data.initial_status == status.value  # type: ignore[attr-defined]
