"""Integration tests for AuditMiddleware context ID extraction.

Tests verify that the middleware correctly extracts execution_id, workflow_id,
and activity_id from URL paths and includes them in emitted audit events.
"""

from collections.abc import Callable
from uuid import uuid4

import pytest
from httpx import AsyncClient

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.events.http_request import HTTPRequestEvent, HTTPRequestHandler
from nexus.audit.services.writer import get_audit_writer
from nexus.core.models.user import User

AUDIT_URL = "/api/v1/audit"


@pytest.fixture(autouse=True)
def ensure_http_request_handler_registered() -> None:
    """Ensure HTTPRequestHandler is registered before each test."""
    AuditEventDispatcher.register({HTTPRequestEvent: HTTPRequestHandler()})


@pytest.mark.asyncio
async def test_middleware_extracts_path_params(
    base_client: AsyncClient,
    admin_user: User,
    create_jwt_for_user: Callable[[User], str],
) -> None:
    """Test that middleware captures execution_id and activity_id from URL path.

    POSTs to /executions/{execution_id}/activities/{activity_id}/signal endpoint,
    which will fail with 404 (no such execution), but the audit middleware should
    still emit a request_completed event with execution_id and activity_id correctly
    captured from the URL path.
    """
    # Create JWT token for admin user
    admin_token = create_jwt_for_user(admin_user)
    auth_headers = {"Authorization": f"Bearer {admin_token}"}

    execution_id = uuid4()
    activity_id = "test-activity-123"
    signal_url = f"/api/v1/executions/{execution_id}/activities/{activity_id}/signal"

    # POST to signal endpoint with Authorization header (will fail with 404, but that's expected)
    response = await base_client.post(
        signal_url,
        json={"signal_data": {"action": "test", "value": 42}},
        headers=auth_headers,
    )

    # The request should fail (no such execution)
    assert response.status_code == 404

    # Drain the audit writer to ensure all events have been written to the database
    _audit_writer = get_audit_writer()
    assert _audit_writer is not None
    await _audit_writer.drain()

    # Query the audit endpoint to retrieve the emitted event
    audit_response = await base_client.get(AUDIT_URL, headers=auth_headers)
    assert audit_response.status_code == 200

    audit_data = audit_response.json()
    # Should have 1 event: the POST to signal
    assert len(audit_data["resources"]) == 1

    # Verify the audit event has the correct context IDs from the URL
    post_event = audit_data["resources"][0]
    assert post_event["actor_id"] == str(admin_user.id)
    assert post_event["actor_username"] == admin_user.username
    assert post_event["actor_type"] == "user"
    assert post_event["execution_id"] == str(execution_id)
    assert post_event["activity_id"] == activity_id
    assert post_event["event_action"] == "request_completed"
    assert post_event["event_status"] == "error"  # 404 response
    assert str(execution_id) in post_event["event_message"]
