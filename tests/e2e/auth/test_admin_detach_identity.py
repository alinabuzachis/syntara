"""E2E tests for API-33: Admin Detach Identity.

Verifies that an admin can hard-delete a federated identity from a user:
- The identity is hard-deleted from the user_identities table
- All sessions authenticated via the detached identity are revoked
- An audit log entry is created
"""

from __future__ import annotations

import pytest

from tests.e2e.helpers import poll_audit_events

pytest.importorskip("external_services")

import asyncio
import re
from http import HTTPStatus
from typing import TYPE_CHECKING
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import httpx
from nexus_api_client import Client
from nexus_api_client.api.authentication.get_csrf_token import sync_detailed as csrf_token_sync
from nexus_api_client.api.authentication.refresh_token import sync_detailed as refresh_sync
from nexus_api_client.models.csrf_token_response import CsrfTokenResponse
from nexus_api_client.models.user_identity_attach import UserIdentityAttach

from nexus.core.config.base import get_settings
from tests.fixtures.external_services.oidc_login import _idp_form_user_login

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse

pytestmark = [pytest.mark.e2e]


def _oidc_refresh_client(
    nexus_api: NexusApiRegistry,
    nexus_base_url: str,
    provider_id: UUID,
    username: str,
    password: str,
) -> Client:
    """Re-authenticate via OIDC and return a client configured for refresh calls."""
    auth_resp = nexus_api.authentication.oidc_authorize(provider_id=provider_id)
    assert auth_resp.status_code in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT)

    with httpx.Client(verify=False, follow_redirects=True) as http_client:  # noqa: S501
        idp_resp = _idp_form_user_login(
            client=http_client,
            login_url=auth_resp.headers["location"],
            username=username,
            password=password,
        )
    query_params = parse_qs(urlparse(idp_resp.headers["Location"]).query)

    callback_resp = nexus_api.authentication.oidc_callback(
        state=query_params["state"][0],
        code=query_params["code"][0],
    )
    assert callback_resp.status_code == HTTPStatus.FOUND
    set_cookie = callback_resp.headers["set-cookie"]
    cookie_match = re.search(r"ao_refresh_token=([^;]+)", set_cookie)
    assert cookie_match is not None
    csrf_match = re.search(r"ao_csrf_token=([^;]+)", set_cookie)
    assert csrf_match is not None

    cookies = {
        "ao_refresh_token": cookie_match.group(1),
        "ao_csrf_token": csrf_match.group(1),
    }
    csrf_client = Client(
        base_url=f"{nexus_base_url}/api/v1",
        cookies=cookies,
        verify_ssl=False,
    )
    csrf_resp = csrf_token_sync(client=csrf_client)
    assert csrf_resp.status_code == HTTPStatus.OK
    assert isinstance(csrf_resp.parsed, CsrfTokenResponse)

    return csrf_client.with_headers({"X-CSRF-Token": csrf_resp.parsed.csrf_token})


class TestAdminDetachIdentity:
    """API-33: Verify admin can hard-delete a federated identity from a user."""

    async def test_admin_detach_identity(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """Admin disconnects one of a user's linked identities."""
        username_a, password_a = keycloak_user_factory()
        username_b, password_b = keycloak_user_factory()

        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)

        # Create user A via factory (handles cleanup)
        user_a_api = oidc_user_factory(provider.id, username_a, password_a)
        user_a = user_a_api.authentication.get_current_user().assert_and_get()
        user_a_id = user_a.id

        # Re-authenticate user A to capture refresh token for session revocation check
        user_a_refresh_client = _oidc_refresh_client(nexus_api, nexus_base_url, provider.id, username_a, password_a)
        assert refresh_sync(client=user_a_refresh_client).status_code == HTTPStatus.OK

        # Create user B and attach their identity to user A
        user_b_api = oidc_user_factory(provider.id, username_b, password_b)
        user_b = user_b_api.authentication.get_current_user().assert_and_get()

        user_b_identities_list = user_b_api.users.list_identities(user_id=user_b.id).assert_and_get()
        assert len(user_b_identities_list.resources) == 1
        identity_b_id = user_b_identities_list.resources[0].id

        attach_resp = nexus_api.users.attach_identity(
            user_id=user_a_id, body=UserIdentityAttach(identity_id=identity_b_id)
        )
        assert attach_resp.status_code == HTTPStatus.CREATED

        # Verify user A now has 2 identities
        user_a_identities_before = nexus_api.users.list_identities(user_id=user_a_id).assert_and_get()
        assert len(user_a_identities_before.resources) == 2

        # Re-authenticate user A (sessions were revoked by the attach operation)
        user_a_refresh_client = _oidc_refresh_client(nexus_api, nexus_base_url, provider.id, username_a, password_a)
        assert refresh_sync(client=user_a_refresh_client).status_code == HTTPStatus.OK

        # Admin disconnects the attached identity
        detach_resp = nexus_api.users.detach_identity(user_id=user_a_id, identity_id=identity_b_id)
        assert detach_resp.status_code == HTTPStatus.NO_CONTENT

        # Identity is hard-deleted from the user_identities table
        user_a_identities_after = nexus_api.users.list_identities(user_id=user_a_id).assert_and_get()
        assert len(user_a_identities_after.resources) == 1
        assert user_a_identities_after.resources[0].id != identity_b_id

        # All sessions for the user are revoked
        assert refresh_sync(client=user_a_refresh_client).status_code == HTTPStatus.UNAUTHORIZED

        # Sleep for full poll interval + buffer to ensure worker has run
        settings = get_settings()
        await asyncio.sleep(settings.audit_outbox_poll_interval_seconds * 2)

        # An audit log entry is created for the detach action
        events = poll_audit_events(
            nexus_api,
            "identity_detach",
        )
        assert len(events) >= 1, "No audit event found for identity_detach action"
