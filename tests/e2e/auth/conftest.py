"""Shared helpers for authentication E2E tests (audit correlation, login with request ID)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

from nexus_api_client.api.authentication.login import sync_detailed as login_sync
from nexus_api_client.models.login_request import LoginRequest

if TYPE_CHECKING:
    from nexus_api_client import Client
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.access_token_response import AccessTokenResponse
    from nexus_api_client.models.audit_event_read import AuditEventRead
    from nexus_api_client.models.error_data import ErrorData
    from nexus_api_client.types import Response

REQUEST_ID_HEADER = "X-Request-Id"


def new_request_id() -> str:
    """Generate a UUID request_id for X-Request-Id correlation."""
    return str(uuid4())


def event_request_id(event: AuditEventRead) -> str | None:
    """Return the request_id from audit structured_data, if present."""
    request_id = event.structured_data.additional_properties.get("request_id")
    if request_id is None:
        return None
    return str(request_id)


def audit_events_with_request_id(
    audit_resources: list[AuditEventRead],
    request_id: str,
) -> list[AuditEventRead]:
    """Return audit events correlated to the given X-Request-Id."""
    return [event for event in audit_resources if event_request_id(event) == request_id]


def login_audit_events(audit_resources: list[AuditEventRead]) -> list[AuditEventRead]:
    """Return audit events with event_action login."""
    return [event for event in audit_resources if event.event_action == "login"]


def client_with_request_id(client: Client, request_id: str) -> Client:
    """Return a client that sends the given X-Request-Id header."""
    return client.with_headers({REQUEST_ID_HEADER: request_id})


def api_with_request_id(api: NexusApiRegistry, request_id: str) -> NexusApiRegistry:
    """Return an API registry whose client sends the given X-Request-Id header."""
    from nexus_api_client.api import NexusApiRegistry

    return NexusApiRegistry(api._client.with_headers({REQUEST_ID_HEADER: request_id}))


def login_with_request_id(
    client: Client,
    *,
    username: str,
    password: str,
    request_id: str,
) -> Response[AccessTokenResponse | Any | ErrorData]:
    """Perform login with a correlated X-Request-Id header."""
    return login_sync(
        client=client_with_request_id(client, request_id),
        body=LoginRequest(username=username, password=password),
    )
