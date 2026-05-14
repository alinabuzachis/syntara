"""Integration tests for audit event emission from ToolProviderService.

These tests verify that service methods correctly dispatch domain events
which are then converted to AuditEvents by the registered handlers.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.models.audit_event import AuditEvent, EventCategory, EventSeverity, EventStatus
from nexus.audit.models.structured_data import AuditContextData
from nexus.core.models import User
from nexus.tool_manager.exceptions import ProviderNotFoundError, ToolRefreshError
from nexus.tool_manager.models.tool_provider import (
    ProviderStatus,
    ToolProvider,
    ToolProviderCreate,
    ToolProviderPatch,
)
from nexus.tool_manager.models.tool_provider_validation_result import ToolProviderValidationResult
from nexus.tool_manager.services.tool_provider_service import ToolProviderService


class TestToolProviderServiceAuditEvents:
    """Tests for audit event emission from ToolProviderService methods.

    These tests use a real AuditEventDispatcher with real handlers (no mock
    fixtures) so the full event pipeline runs end-to-end. Events are captured
    at the lowest level (_do_emit_audit_event) to verify correct emission.
    """

    def setup_method(self) -> None:
        """Register tool_manager audit handlers before each test."""
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

        AuditEventDispatcher.reset()
        AuditEventDispatcher.register(
            {
                ToolProviderCreateEvent: ToolProviderCreateHandler(),
                ToolProviderUpdateEvent: ToolProviderUpdateHandler(),
                ToolProviderDeleteEvent: ToolProviderDeleteHandler(),
                ToolProviderValidationEvent: ToolProviderValidationHandler(),
                ToolProviderRefreshEvent: ToolProviderRefreshHandler(),
            }
        )

    def teardown_method(self) -> None:
        """Reset dispatcher after each test."""
        AuditEventDispatcher.reset()

    @pytest.mark.asyncio
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_create_provider_success_emits_audit_event(
        self,
        mock_do_emit: AsyncMock,
        test_tool_provider_service: ToolProviderService,
    ) -> None:
        """Successful create_provider should emit ToolProviderCreateEvent."""
        provider_create = ToolProviderCreate(
            name="Slack MCP",
            description="Slack integration",
            configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "secret"},
        )

        await test_tool_provider_service.create_provider(provider_create)

        # Verify audit event was emitted
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_created"
        assert event.event_category == EventCategory.SYSTEM_OPERATION
        assert event.event_severity == EventSeverity.INFO
        assert event.event_status == EventStatus.SUCCESS
        assert event.source_component == "nexus.tool_manager.provider"
        assert event.event_message == "Tool provider created: Slack MCP"
        assert isinstance(event.structured_data, AuditContextData)
        assert event.structured_data.provider_name == "Slack MCP"  # type: ignore[attr-defined]
        assert event.structured_data.provider_type == "mcp"  # type: ignore[attr-defined]
        assert event.structured_data.initial_status == "validating"  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_create_provider_integrity_error_emits_audit_event(
        self,
        mock_do_emit: AsyncMock,
        test_tool_provider_service: ToolProviderService,
    ) -> None:
        """IntegrityError during create_provider should emit error audit event."""
        provider_create = ToolProviderCreate(
            name="Duplicate Provider",
            description="This name already exists",
            configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test"},
        )

        # Create first provider
        await test_tool_provider_service.create_provider(provider_create)
        mock_do_emit.reset_mock()

        # Try to create duplicate - should emit error event
        from nexus.tool_manager.exceptions import ProviderNameConflictError

        with pytest.raises(ProviderNameConflictError):
            await test_tool_provider_service.create_provider(provider_create)

        # Verify error audit event was emitted
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_created"
        assert event.event_severity == EventSeverity.ERROR
        assert event.event_status == EventStatus.ERROR
        assert event.structured_data.error_type == "IntegrityError"

    @pytest.mark.asyncio
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_update_provider_success_emits_audit_event(
        self,
        mock_do_emit: AsyncMock,
        test_tool_provider: ToolProvider,
        test_tool_provider_service: ToolProviderService,
    ) -> None:
        """Successful update_provider should emit ToolProviderUpdateEvent with tracked fields."""
        provider_update = ToolProviderCreate(
            name="Updated Name",
            description="Updated description",
            configuration={"provider_type": "mcp", "base_url": "http://localhost:9090", "api_key": "new-key"},
        )

        await test_tool_provider_service.update_provider(test_tool_provider.id, provider_update)

        # Verify audit event was emitted
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_updated"
        assert event.event_category == EventCategory.SYSTEM_OPERATION
        assert event.event_severity == EventSeverity.INFO
        assert event.event_status == EventStatus.SUCCESS
        assert event.event_message == "Tool provider updated: Updated Name"
        assert isinstance(event.structured_data, AuditContextData)
        assert event.structured_data.provider_name == "Updated Name"  # type: ignore[attr-defined]
        assert event.structured_data.updated_fields == ["name", "description", "configuration"]  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_patch_provider_tracks_only_modified_fields(
        self,
        mock_do_emit: AsyncMock,
        test_tool_provider: ToolProvider,
        test_tool_provider_service: ToolProviderService,
    ) -> None:
        """patch_provider should emit audit event with only the fields that were patched."""
        # Only patch description
        provider_patch = ToolProviderPatch(description="Updated description only")

        await test_tool_provider_service.patch_provider(test_tool_provider.id, provider_patch)

        # Verify audit event was emitted with only "description" in updated_fields
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_updated"
        assert event.structured_data.updated_fields == ["description"]  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_delete_provider_success_emits_audit_event(
        self,
        mock_do_emit: AsyncMock,
        test_tool_provider: ToolProvider,
        test_tool_provider_service: ToolProviderService,
    ) -> None:
        """Successful delete_provider should emit ToolProviderDeleteEvent with tool count."""
        await test_tool_provider_service.delete_provider(test_tool_provider.id)

        # Verify audit event was emitted
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_deleted"
        assert event.event_category == EventCategory.SYSTEM_OPERATION
        assert event.event_severity == EventSeverity.INFO  # Deletion is INFO
        assert event.event_status == EventStatus.SUCCESS
        assert event.event_message == f"Tool provider deleted: {test_tool_provider.name}"
        assert isinstance(event.structured_data, AuditContextData)
        assert event.structured_data.tools_deleted == 0  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_delete_provider_not_found_emits_error_audit_event(
        self,
        mock_do_emit: AsyncMock,
        test_tool_provider_service: ToolProviderService,
    ) -> None:
        """delete_provider should emit error audit event when provider not found."""
        non_existent_id = uuid4()

        with pytest.raises(ProviderNotFoundError):
            await test_tool_provider_service.delete_provider(non_existent_id)

        # Verify error audit event was emitted
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_deleted"
        assert event.event_severity == EventSeverity.ERROR
        assert event.event_status == EventStatus.ERROR
        assert event.structured_data.error_type == "ProviderNotFoundError"

    @pytest.mark.asyncio
    @patch("nexus.tool_manager.lib.providers.mcp.MCPProvider.validate_connection")
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_validate_provider_success_emits_audit_event(
        self,
        mock_do_emit: AsyncMock,
        mock_validate: AsyncMock,
        test_tool_provider: ToolProvider,
        test_tool_provider_service: ToolProviderService,
    ) -> None:
        """Successful validate_provider should emit ToolProviderValidationEvent."""
        mock_validate.return_value = ToolProviderValidationResult(
            valid=True,
            provider_type="mcp",
            validated_at=datetime.now(UTC),
        )

        await test_tool_provider_service.validate_provider(test_tool_provider.id)

        # Verify audit event was emitted
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_validated"
        assert event.event_severity == EventSeverity.INFO
        assert event.event_status == EventStatus.SUCCESS
        assert isinstance(event.structured_data, AuditContextData)
        assert event.structured_data.error_type is None
        assert event.structured_data.is_definition_validation is False  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    @patch("nexus.tool_manager.lib.providers.mcp.MCPProvider.validate_connection")
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_validate_provider_definition_success_emits_audit_event(
        self,
        mock_do_emit: AsyncMock,
        mock_validate: AsyncMock,
        test_tool_provider_service: ToolProviderService,
    ) -> None:
        """Successful validate_provider_definition should emit audit event with is_definition_validation=True."""
        provider_create = ToolProviderCreate(
            name="New Provider",
            description="Test",
            configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test"},
        )

        mock_validate.return_value = ToolProviderValidationResult(
            valid=True,
            provider_type="mcp",
            validated_at=datetime.now(UTC),
        )

        await test_tool_provider_service.validate_provider_definition(provider_create)

        # Verify audit event was emitted
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_definition_validated"
        assert event.event_severity == EventSeverity.INFO
        assert event.event_status == EventStatus.SUCCESS
        assert event.structured_data.is_definition_validation is True  # type: ignore[attr-defined]
        assert event.resource_urn is None  # No provider_id for definition validation

    @pytest.mark.asyncio
    @patch("nexus.tool_manager.lib.providers.factory.ProviderFactory.create_provider_instance")
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_refresh_tools_success_emits_audit_event(
        self,
        mock_do_emit: AsyncMock,
        mock_create_provider: AsyncMock,
        test_tool_provider: ToolProvider,
        test_db_session: AsyncSession,
        test_tool_provider_service: ToolProviderService,
        test_user: User,
    ) -> None:
        """Successful refresh_tools should emit ToolProviderRefreshEvent with counts."""
        from unittest.mock import AsyncMock as MockAsync

        from nexus.tool_manager.models.tool import Tool

        # Set provider to AVAILABLE status
        test_tool_provider.status = ProviderStatus.AVAILABLE
        await test_db_session.commit()

        # Mock refresh returning Tool metadata objects
        # 5 new tools, 3 existing tools that will be updated, 1 tool not in refresh (will be disabled)
        new_tools = [Tool(name=f"new-tool-{i}", description=f"New tool {i}", parameters=[]) for i in range(5)]
        updated_tools = [
            Tool(name=f"existing-tool-{i}", description=f"Updated tool {i}", parameters=[]) for i in range(3)
        ]

        # Create existing tools in DB first so they will be "updated"
        for tool_metadata in updated_tools:
            existing_tool = Tool(
                provider_id=test_tool_provider.id,
                name=tool_metadata.name,
                namespaced_name=f"{test_tool_provider.name}::{tool_metadata.name}",
                description="Old description",
                enabled=True,
                created_by=test_user.id,
                updated_by=test_user.id,
            )
            test_db_session.add(existing_tool)

        # Create one tool that won't be in the refresh (will be disabled)
        missing_tool = Tool(
            provider_id=test_tool_provider.id,
            name="missing-tool",
            namespaced_name=f"{test_tool_provider.name}::missing-tool",
            description="This tool will be disabled",
            enabled=True,
            created_by=test_user.id,
            updated_by=test_user.id,
        )
        test_db_session.add(missing_tool)
        await test_db_session.commit()

        # Mock the provider factory to return a mock adapter with mocked refresh_tools
        mock_adapter = MockAsync()
        mock_adapter.refresh_tools = MockAsync(return_value=new_tools + updated_tools)
        mock_create_provider.return_value = mock_adapter

        await test_tool_provider_service.refresh_tools(test_tool_provider.id)

        # Verify audit event was emitted
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_tools_refreshed"
        assert event.event_category == EventCategory.SYSTEM_OPERATION
        assert event.event_severity == EventSeverity.INFO
        assert event.event_status == EventStatus.SUCCESS
        assert isinstance(event.structured_data, AuditContextData)
        assert event.structured_data.refreshed_count == 5  # type: ignore[attr-defined]
        assert event.structured_data.updated_count == 3  # type: ignore[attr-defined]
        assert event.structured_data.disabled_count == 1  # type: ignore[attr-defined]
        assert event.structured_data.total_tools == 8  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    @patch("nexus.audit.emitter._do_emit_audit_event")
    async def test_refresh_tools_not_available_emits_error_audit_event(
        self,
        mock_do_emit: AsyncMock,
        test_tool_provider: ToolProvider,
        test_db_session: AsyncSession,
        test_tool_provider_service: ToolProviderService,
    ) -> None:
        """refresh_tools should emit error audit event when provider is not available."""
        # Set provider to ERROR status
        test_tool_provider.status = ProviderStatus.ERROR
        await test_db_session.commit()

        with pytest.raises(ToolRefreshError):
            await test_tool_provider_service.refresh_tools(test_tool_provider.id)

        # Verify error audit event was emitted
        assert mock_do_emit.call_count == 1
        event: AuditEvent = mock_do_emit.call_args.args[0]

        assert event.event_action == "provider_tools_refreshed"
        assert event.event_severity == EventSeverity.ERROR
        assert event.event_status == EventStatus.ERROR
        assert event.structured_data.error_type == "ToolRefreshError"
