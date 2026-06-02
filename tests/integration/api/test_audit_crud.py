"""Integration tests for CRUD operation audit events.

Tests verify that database INSERT, UPDATE, and DELETE operations
automatically generate audit events via Postgres triggers.

CRUD events are sent to OTEL (not Postgres), so these tests mock
the OTEL emitter and verify it was called with the correct events.
"""

# mypy: disable-error-code="attr-defined"

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy import text
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.context_managers import actor_context
from nexus.audit.models.audit_event import AuditEvent
from nexus.audit.outbox.worker import get_outbox_worker
from nexus.audit.sanitization import REDACTED
from nexus.core.models.user import User
from nexus.tool_manager.models import MCPConfiguration
from nexus.tool_manager.models.tool_provider import ToolProvider
from tests.helpers.tool_provider import ToolProviderFactory

TOOL_PROVIDER_NAME: str = str(uuid4())


def _find_audit_event(
    mock_otel_emit: MagicMock,
    event_action: str,
    resource_id: str | None = None,
    resource_name: str | None = None,
) -> AuditEvent:
    """Find an audit event in OTEL mock calls by action and optional filters.

    Args:
        mock_otel_emit: The mocked OTEL emit function
        event_action: The event action to filter by (e.g., "toolprovider_create")
        resource_id: Optional resource ID to match in structured_data
        resource_name: Optional resource name to match on the event

    Returns:
        The matching AuditEvent

    Raises:
        AssertionError: If no matching event is found

    """
    for call in mock_otel_emit.call_args_list:
        event: AuditEvent = call[0][0]
        if event.event_action != event_action:
            continue

        if resource_id is not None and event.structured_data.resource_id != resource_id:
            continue

        if resource_name is not None and event.resource_name != resource_name:
            continue

        return event

    filters = f"event_action={event_action}"
    if resource_id:
        filters += f", resource_id={resource_id}"
    if resource_name:
        filters += f", resource_name={resource_name}"
    msg = f"No audit event found matching: {filters}"
    raise AssertionError(msg)


@pytest_asyncio.fixture(autouse=True)
async def audit_metadata_populated(test_db_session: AsyncSession) -> None:
    """Ensure audit_table_metadata is populated for tool_providers.

    While setup_audit_metadata() runs during migrations and creates the metadata,
    the test database uses transaction-based isolation where each test runs in a
    rolled-back transaction. The metadata INSERTs from migrations are committed
    at the session level, but individual test transactions may not see them due
    to isolation. This fixture ensures metadata is visible within each test's
    transaction scope.
    """
    await test_db_session.execute(
        text("""
            INSERT INTO audit_table_metadata (table_name, model_name, audit_level, auditable_fields)
            VALUES ('tool_providers', 'ToolProvider', 'full', NULL)
            ON CONFLICT (table_name) DO NOTHING
        """)
    )
    await test_db_session.commit()


@pytest_asyncio.fixture
async def tool_provider_factory(test_db_session: AsyncSession, test_user: User) -> ToolProviderFactory:
    """Factory for creating tool providers for tests.

    Duplicated in integration tests to ensure the correct test_db_session fixture is used.
    """
    return ToolProviderFactory(test_db_session, test_user)


@pytest_asyncio.fixture
async def tool_provider(tool_provider_factory: ToolProviderFactory, test_user: User) -> ToolProvider:
    """Create a ToolProvider.

    Create as a separate fixture to ensure the session is committed before
    the test exits. Fixture test_db_session commits when the function exits.
    """
    with actor_context(actor=test_user):
        tool_provider = await tool_provider_factory.create(
            name=TOOL_PROVIDER_NAME,
            provider_type="mcp",
            base_url="http://localhost:8000/mcp",
        )
        # Commit the session to trigger the audit trigger
        await tool_provider_factory.session.commit()

    return tool_provider


@pytest.mark.asyncio
@patch("nexus.audit.outbox.worker._emit_otel_log_entry")
async def test_create_generates_audit_event(
    mock_otel_emit: MagicMock,
    tool_provider: ToolProvider,
    session_app: FastAPI,
    test_user: User,
) -> None:
    """Test that creating a ToolProvider generates a CRUD audit event.

    The fixture creates a ToolProvider and commits the session, which triggers
    the CRUD audit trigger. This test verifies that:
    1. A CRUD audit event was generated for the INSERT operation
    2. The audit event contains correct operation type, model name, and actor info
    """
    # Flush all pending AuditEventRecord writes
    await get_outbox_worker().drain()

    # Find the ToolProvider create event among all emitted events
    emitted_event = _find_audit_event(
        mock_otel_emit, event_action="toolprovider_create", resource_name=TOOL_PROVIDER_NAME
    )

    # Verify the audit event has correct fields
    assert emitted_event.actor_id == test_user.id
    assert emitted_event.actor_username == test_user.username
    assert emitted_event.actor_type == "user"
    assert emitted_event.event_action == "toolprovider_create"
    assert emitted_event.event_category == "system_operation"
    assert emitted_event.event_status == "success"
    assert emitted_event.event_message == "ToolProvider created"
    assert emitted_event.source_component == "database.trigger"

    # Verify structured data contains CRUD operation details
    structured_data = emitted_event.structured_data
    assert structured_data.data_type == "crud_operation"
    assert structured_data.operation == "create"
    assert structured_data.model_name == "ToolProvider"
    assert structured_data.resource_id == str(tool_provider.id)

    # For create operations, resource_data should contain a snapshot of the new object
    assert hasattr(structured_data, "resource_data")
    resource_data = structured_data.resource_data
    assert resource_data["name"] == tool_provider.name
    assert resource_data["configuration"]["api_key"] == REDACTED


@pytest.mark.asyncio
@patch("nexus.audit.outbox.worker._emit_otel_log_entry")
async def test_update_generates_audit_event(
    mock_otel_emit: MagicMock,
    tool_provider: ToolProvider,
    session_app: FastAPI,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test that updating a ToolProvider generates a CRUD audit event with field changes.

    The test updates a ToolProvider's fields and verifies that:
    1. A CRUD audit event was generated for the UPDATE operation
    2. The audit event was sent to the OTEL emitter
    3. The audit event contains the field-level changes (old -> new values)
    """
    # Update the provider's configuration.base_url
    original_base_url = tool_provider.configuration.base_url
    new_base_url = "http://localhost:9000/mcp-updated"

    with actor_context(actor=test_user):
        tool_provider.configuration = MCPConfiguration(provider_type="mcp", api_key="a-secret", base_url=new_base_url)
        test_db_session.add(tool_provider)
        await test_db_session.commit()
        await test_db_session.refresh(tool_provider)

    # Flush all pending AuditEventRecord writes
    await get_outbox_worker().drain()

    # Find the ToolProvider update event among all emitted events
    emitted_event = _find_audit_event(
        mock_otel_emit, event_action="toolprovider_update", resource_id=str(tool_provider.id)
    )

    # Verify the audit event has correct fields
    assert emitted_event.actor_id == test_user.id
    assert emitted_event.actor_username == test_user.username
    assert emitted_event.actor_type == "user"
    assert emitted_event.event_action == "toolprovider_update"
    assert emitted_event.event_category == "system_operation"
    assert emitted_event.event_status == "success"
    assert emitted_event.event_message == "ToolProvider updated"
    assert emitted_event.source_component == "database.trigger"

    # Verify structured data contains CRUD operation details
    structured_data = emitted_event.structured_data
    assert structured_data.data_type == "crud_operation"
    assert structured_data.operation == "update"
    assert structured_data.model_name == "ToolProvider"
    assert structured_data.resource_id == str(tool_provider.id)

    # For update operations, changes should contain field-level changes
    assert hasattr(structured_data, "changes")
    changes = structured_data.changes
    # Triggers return JSON objects, not string representations
    assert changes["configuration"]["old"]["base_url"] == original_base_url
    assert changes["configuration"]["new"]["base_url"] == new_base_url
    assert changes["configuration"]["old"]["api_key"] == REDACTED
    assert changes["configuration"]["new"]["api_key"] == REDACTED

    # UPDATE operations should not have resource_data (or it should be None)
    assert not hasattr(structured_data, "resource_data") or structured_data.resource_data is None


@pytest.mark.asyncio
@patch("nexus.audit.outbox.worker._emit_otel_log_entry")
async def test_delete_generates_audit_event(
    mock_otel_emit: MagicMock,
    tool_provider: ToolProvider,
    session_app: FastAPI,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test that deleting a ToolProvider generates a CRUD audit event with final snapshot.

    The test deletes a ToolProvider and verifies that:
    1. A CRUD audit event was generated for the DELETE operation
    2. The audit event was sent to the OTEL emitter
    3. The audit event contains a snapshot of the deleted object (for forensics)
    """
    # Delete the provider
    with actor_context(actor=test_user):
        await test_db_session.delete(tool_provider)
        await test_db_session.commit()

    # Flush all pending AuditEventRecord writes
    await get_outbox_worker().drain()

    # Find the ToolProvider delete event among all emitted events
    emitted_event = _find_audit_event(
        mock_otel_emit, event_action="toolprovider_delete", resource_id=str(tool_provider.id)
    )

    # Verify the audit event has correct fields
    assert emitted_event.actor_id == test_user.id
    assert emitted_event.actor_username == test_user.username
    assert emitted_event.actor_type == "user"
    assert emitted_event.event_action == "toolprovider_delete"
    assert emitted_event.event_category == "system_operation"
    assert emitted_event.event_status == "success"
    assert emitted_event.event_message == "ToolProvider deleted"
    assert emitted_event.source_component == "database.trigger"

    # Verify structured data contains CRUD operation details
    structured_data = emitted_event.structured_data
    assert structured_data.data_type == "crud_operation"
    assert structured_data.operation == "delete"
    assert structured_data.model_name == "ToolProvider"
    assert structured_data.resource_id == str(tool_provider.id)

    # For delete operations, resource_data should contain final snapshot (for forensics)
    assert hasattr(structured_data, "resource_data")
    resource_data = structured_data.resource_data
    assert resource_data["id"] == str(tool_provider.id)
    assert resource_data["name"] == tool_provider.name
    assert resource_data["configuration"]["api_key"] == REDACTED

    # DELETE operations should not have changes (or it should be None)
    assert not hasattr(structured_data, "changes") or structured_data.changes is None
