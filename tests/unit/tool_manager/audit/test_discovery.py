"""Unit tests for tool_manager audit handler auto-discovery."""

from nexus.audit.discovery import discover_handlers
from nexus.tool_manager.audit.provider_create import (
    ToolProviderCreateEvent,
    ToolProviderCreateHandler,
)
from nexus.tool_manager.audit.provider_delete import (
    ToolProviderDeleteEvent,
    ToolProviderDeleteHandler,
)
from nexus.tool_manager.audit.provider_refresh import (
    ToolProviderRefreshEvent,
    ToolProviderRefreshHandler,
)
from nexus.tool_manager.audit.provider_update import (
    ToolProviderUpdateEvent,
    ToolProviderUpdateHandler,
)
from nexus.tool_manager.audit.provider_validation import (
    ToolProviderValidationEvent,
    ToolProviderValidationHandler,
)
from nexus.tool_manager.audit.tool_bulk_update import (
    ToolBulkUpdateEvent,
    ToolBulkUpdateHandler,
)
from nexus.tool_manager.audit.tool_update import ToolUpdateEvent, ToolUpdateHandler


class TestToolManagerAuditDiscovery:
    """Tests for automatic discovery of tool_manager audit handlers."""

    def test_discovers_all_handlers(self) -> None:
        """Should discover all 7 tool_manager audit handlers."""
        import nexus.tool_manager.audit

        registry = discover_handlers(nexus.tool_manager.audit)

        assert len(registry) == 7
        assert ToolProviderCreateEvent in registry
        assert ToolProviderUpdateEvent in registry
        assert ToolProviderDeleteEvent in registry
        assert ToolProviderValidationEvent in registry
        assert ToolProviderRefreshEvent in registry
        assert ToolUpdateEvent in registry
        assert ToolBulkUpdateEvent in registry

    def test_discovered_handler_types(self) -> None:
        """Should discover correct handler types for each event."""
        import nexus.tool_manager.audit

        registry = discover_handlers(nexus.tool_manager.audit)

        assert isinstance(registry[ToolProviderCreateEvent], ToolProviderCreateHandler)
        assert isinstance(registry[ToolProviderUpdateEvent], ToolProviderUpdateHandler)
        assert isinstance(registry[ToolProviderDeleteEvent], ToolProviderDeleteHandler)
        assert isinstance(registry[ToolProviderValidationEvent], ToolProviderValidationHandler)
        assert isinstance(registry[ToolProviderRefreshEvent], ToolProviderRefreshHandler)
        assert isinstance(registry[ToolUpdateEvent], ToolUpdateHandler)
        assert isinstance(registry[ToolBulkUpdateEvent], ToolBulkUpdateHandler)
