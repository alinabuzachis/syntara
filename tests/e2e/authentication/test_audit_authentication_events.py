"""E2E tests for API-19: Audit Log — Authentication Events.

Verifies that all authentication events are captured in the audit log
with correct structure:
- Successful local login
- Successful OIDC login
- Failed login with invalid credentials
- Account disabled
- Failed login with disabled account
"""

from __future__ import annotations

import time
from http import HTTPStatus
from typing import TYPE_CHECKING, Any, cast

import pytest

pytest.importorskip("external_services")

from nexus_api_client.api.authentication.login import sync_detailed as login_sync
from nexus_api_client.models.access_token_response import AccessTokenResponse
from nexus_api_client.models.event_category import EventCategory
from nexus_api_client.models.event_severity import EventSeverity
from nexus_api_client.models.event_status import EventStatus
from nexus_api_client.models.login_request import LoginRequest
from nexus_api_client.models.user_update import UserUpdate

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from nexus_api_client import Client
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.audit_event_read import AuditEventRead
    from nexus_api_client.models.user_read import UserRead

pytestmark = [pytest.mark.e2e]

_AUDIT_POLL_TIMEOUT = 10.0
_AUDIT_POLL_INTERVAL = 0.5

_ACTION_LOGIN = "login"
_ACTION_ACCOUNT_DISABLED = "account_disabled"
_METHOD_PASSWORD = "password"  # noqa: S105
_METHOD_OIDC = "oidc"


def _find_audit_event(
    api: NexusApiRegistry,
    event_action: str,
    *,
    event_category: EventCategory | None = None,
    event_status: EventStatus | None = None,
    actor_username: str | None = None,
    structured_data: dict[str, str] | None = None,
    timeout: float = _AUDIT_POLL_TIMEOUT,
) -> AuditEventRead | None:
    """Poll the audit API until an event matching all criteria appears, or timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        time.sleep(_AUDIT_POLL_INTERVAL)

        kwargs: dict[str, Any] = {
            "event_action": event_action,
            "sort": "-created_at",
            "limit": 20,
        }
        if event_category is not None:
            kwargs["event_category"] = event_category
        if actor_username is not None:
            kwargs["actor_username"] = actor_username

        resp = api.audit_events.list(**kwargs)
        if resp.status_code == HTTPStatus.SERVICE_UNAVAILABLE:
            detail = resp.content.decode() if resp.content else "no detail"
            pytest.fail(f"Audit database unavailable (503): {detail}")
        if resp.status_code != HTTPStatus.OK or resp.parsed is None:
            continue

        for event in resp.parsed.resources:
            if event_status is not None and event.event_status != event_status:
                continue
            if structured_data:
                props = event.structured_data.additional_properties
                if not all(props.get(k) == v for k, v in structured_data.items()):
                    continue
            return cast("AuditEventRead", event)
    return None


@pytest.mark.skip(reason="Needs to be updated following introduction of AuditOutboxWorker part of AAP-73776")
class TestAuditAuthenticationEvents:
    """API-19: Verify authentication events are captured in the audit log."""

    def test_login_audit_events(
        self,
        nexus_api: NexusApiRegistry,
        unauthenticated_client: Client,
        local_user_factory: Callable[..., tuple[UserRead, str]],
    ) -> None:
        """Verify audit events for local login success, failure, disable, and disabled login."""
        local_user, password = local_user_factory()
        user_id = local_user.id
        username = local_user.username

        # 1. Successful local login
        login_resp = login_sync(
            client=unauthenticated_client,
            body=LoginRequest(username=username, password=password),
        )
        assert login_resp.status_code == HTTPStatus.OK
        assert isinstance(login_resp.parsed, AccessTokenResponse)

        success_event = _find_audit_event(
            nexus_api,
            _ACTION_LOGIN,
            event_category=EventCategory.USER_ACTION,
            event_status=EventStatus.SUCCESS,
            actor_username=username,
            structured_data={"method": _METHOD_PASSWORD},
        )
        assert success_event is not None, f"No successful login audit event for {username}"
        assert success_event.event_action == _ACTION_LOGIN
        assert success_event.event_severity == EventSeverity.INFO
        assert success_event.created_at is not None

        # 2. Failed login with bad credentials
        bad_login_resp = login_sync(
            client=unauthenticated_client,
            body=LoginRequest(username=username, password="WrongPassword!123"),  # noqa: S106
        )
        assert bad_login_resp.status_code == HTTPStatus.UNAUTHORIZED

        bad_creds_event = _find_audit_event(
            nexus_api,
            _ACTION_LOGIN,
            event_category=EventCategory.SECURITY_EVENT,
            event_status=EventStatus.ERROR,
            actor_username=username,
            structured_data={"method": _METHOD_PASSWORD},
        )
        assert bad_creds_event is not None, f"No failed-login audit event for {username}"
        assert bad_creds_event.event_severity == EventSeverity.WARNING
        assert isinstance(bad_creds_event.structured_data.error_message, str)

        # 3. Disable the user account
        try:
            disable_resp = nexus_api.users.update(
                user_id=user_id,
                body=UserUpdate(is_enabled=False),
            )
            assert disable_resp.status_code == HTTPStatus.OK

            disable_event = _find_audit_event(
                nexus_api,
                _ACTION_ACCOUNT_DISABLED,
                event_category=EventCategory.SECURITY_EVENT,
                structured_data={"target_username": username},
            )
            assert disable_event is not None, f"No account_disabled audit event for {username}"
            assert disable_event.event_status == EventStatus.SUCCESS
            assert disable_event.created_at is not None

            # 4. Failed login with disabled account
            disabled_login_resp = login_sync(
                client=unauthenticated_client,
                body=LoginRequest(username=username, password=password),
            )
            assert disabled_login_resp.status_code == HTTPStatus.UNAUTHORIZED

            disabled_event = _find_audit_event(
                nexus_api,
                _ACTION_LOGIN,
                event_category=EventCategory.SECURITY_EVENT,
                event_status=EventStatus.ERROR,
                actor_username=username,
                structured_data={"method": _METHOD_PASSWORD},
            )
            assert disabled_event is not None, f"No disabled-login audit event for {username}"
            assert disabled_event.event_severity in (EventSeverity.WARNING, EventSeverity.ERROR)
            assert isinstance(disabled_event.structured_data.error_message, str)
            assert "inactive_account" in disabled_event.structured_data.error_message
        finally:
            nexus_api.users.update(user_id=user_id, body=UserUpdate(is_enabled=True))


@pytest.mark.skip(reason="Needs to be updated following introduction of AuditOutboxWorker part of AAP-73776")
class TestAuditOidcLoginEvent:
    """API-19: Verify OIDC authentication events are captured in the audit log."""

    def test_oidc_login_audit_event(
        self,
        nexus_api: NexusApiRegistry,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], Any],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """Verify audit event is created for successful OIDC login."""
        username, password = keycloak_user_factory()
        provider = oidc_provider_factory()

        oidc_api = oidc_user_factory(provider.id, username, password)
        me_resp = oidc_api.authentication.get_current_user()
        assert me_resp.status_code == HTTPStatus.OK
        assert me_resp.parsed is not None
        oidc_username = me_resp.parsed.username

        oidc_event = _find_audit_event(
            nexus_api,
            _ACTION_LOGIN,
            event_category=EventCategory.USER_ACTION,
            event_status=EventStatus.SUCCESS,
            actor_username=oidc_username,
            structured_data={"method": _METHOD_OIDC},
        )
        assert oidc_event is not None, f"No OIDC login audit event for {oidc_username}"
        assert oidc_event.event_action == _ACTION_LOGIN
        assert oidc_event.event_severity == EventSeverity.INFO
        assert oidc_event.created_at is not None
