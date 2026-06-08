"""E2E tests for API-29: Self-Service Identity — Duplicate Identity Conflict.

Verifies that when a user tries to link an OIDC identity that is already linked
to another user, the system returns a conflict error via the link callback redirect.
"""

from __future__ import annotations

import pytest

pytest.importorskip("external_services")

import re
from http import HTTPStatus
from typing import TYPE_CHECKING
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import httpx
from nexus_api_client import Client
from nexus_api_client.api.authentication.get_csrf_token import sync_detailed as csrf_token_sync
from nexus_api_client.api.authentication.oidc_authorize import sync_detailed as oidc_authorize_sync
from nexus_api_client.api.authentication.oidc_callback import sync_detailed as oidc_callback_sync
from nexus_api_client.api.authentication.refresh_token import sync_detailed as refresh_sync
from nexus_api_client.models.access_token_response import AccessTokenResponse
from nexus_api_client.models.csrf_token_response import CsrfTokenResponse
from nexus_api_client.models.oidc_authorize_flow_type_0 import OidcAuthorizeFlowType0

from tests.fixtures.external_services.oidc_login import _idp_form_user_login

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse

pytestmark = [pytest.mark.e2e]


class TestDuplicateIdentityConflict:
    """API-29: Verify linking identity already linked to another user returns conflict."""

    def test_link_flow_rejects_identity_already_linked_to_another_user(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """User B tries to link User A's Keycloak identity — system returns link_error."""
        username_a, password_a = keycloak_user_factory()
        username_b, password_b = keycloak_user_factory()

        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)
        provider_id = provider.id

        # Step 1: User A authenticates via OIDC — creates Nexus user + identity
        oidc_user_factory(provider_id, username_a, password_a)

        # Step 2: User B authenticates via OIDC — creates a separate Nexus user.
        #         We create via factory first for cleanup, then re-authenticate
        #         to capture the refresh_token cookie needed for the link flow.
        oidc_user_factory(provider_id, username_b, password_b)
        user_b_auth = nexus_api.authentication.oidc_authorize(provider_id=provider_id)
        assert user_b_auth.status_code in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT)
        oidc_auth_url = user_b_auth.headers["location"]

        with httpx.Client(verify=False, follow_redirects=True) as http_client:  # noqa: S501
            idp_resp = _idp_form_user_login(
                client=http_client,
                login_url=oidc_auth_url,
                username=username_b,
                password=password_b,
            )
        idp_parsed = urlparse(idp_resp.headers["Location"])
        query_params = parse_qs(idp_parsed.query)

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

        user_b_cookies = {
            "ao_refresh_token": cookie_match.group(1),
            "ao_csrf_token": csrf_match.group(1),
        }

        # Obtain CSRF form token, then verify User B can refresh
        csrf_client = Client(
            base_url=f"{nexus_base_url}/api/v1",
            cookies=user_b_cookies,
            verify_ssl=False,
        )
        csrf_resp = csrf_token_sync(client=csrf_client)
        assert csrf_resp.status_code == HTTPStatus.OK
        assert isinstance(csrf_resp.parsed, CsrfTokenResponse)

        user_b_client = csrf_client.with_headers({"X-CSRF-Token": csrf_resp.parsed.csrf_token})
        refresh_resp = refresh_sync(client=user_b_client)
        assert refresh_resp.status_code == HTTPStatus.OK
        assert isinstance(refresh_resp.parsed, AccessTokenResponse)

        # Step 3: User B initiates a link flow with their session cookie,
        #         then authenticates at Keycloak with User A's credentials.
        link_authorize_resp = oidc_authorize_sync(
            client=user_b_client,
            provider_id=provider_id,
            flow=OidcAuthorizeFlowType0.LINK,
        )
        assert link_authorize_resp.status_code in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT)
        link_auth_url = link_authorize_resp.headers["location"]

        # Submit User A's credentials at the Keycloak login form
        with httpx.Client(verify=False, follow_redirects=True) as idp_link_client:  # noqa: S501
            idp_link_resp = _idp_form_user_login(
                client=idp_link_client,
                login_url=link_auth_url,
                username=username_a,
                password=password_a,
            )
        idp_link_parsed = urlparse(idp_link_resp.headers["Location"])
        link_query_params = parse_qs(idp_link_parsed.query)

        # Follow the callback — Nexus should detect the duplicate and redirect with link_error
        link_callback_resp = oidc_callback_sync(
            client=user_b_client,
            state=link_query_params["state"][0],
            code=link_query_params["code"][0],
        )

        assert link_callback_resp.status_code in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT)
        callback_location = link_callback_resp.headers["location"]
        callback_parsed = urlparse(callback_location)
        callback_params = parse_qs(callback_parsed.query)
        assert "link_error" in callback_params or "auth_error" in callback_params
