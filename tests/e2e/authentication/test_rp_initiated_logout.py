"""E2E tests for RP-initiated logout (ANSTRAT-1844 API-42-44).

Requires the optional ``external_services`` package and a reachable Keycloak instance.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID

import pytest

pytest.importorskip("external_services")

from nexus_api_client.models.identity_provider_create import IdentityProviderCreate

from tests.e2e.conftest import logout_response_body, logout_with_session
from tests.fixtures.external_services.keycloak import (
    add_keycloak_service_admin_user,
    destroy_keycloak_oidc_identity_provider,
    get_keycloak_nexus_admin_password,
    get_keycloak_nexus_admin_username,
    keycloak_oidc_config,
)
from tests.fixtures.external_services.oidc_login import (
    create_oidc_identity_provider,
    create_oidc_login_session,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from external_services.types import HttpApiService
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse

pytestmark = [pytest.mark.e2e]


class TestAPIRpInitiatedLogout:
    """API-42: RP-initiated logout returns IdP end-session redirect when enabled."""

    def test_logout_returns_redirect_url_when_enabled(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        nexus_api_admin_group_id: UUID,
        keycloak_service: HttpApiService,
    ) -> None:
        """Federated logout must include redirect_url to the IdP end-session endpoint."""
        add_keycloak_service_admin_user(keycloak_service.url)
        provider = create_oidc_identity_provider(
            nexus_api=nexus_api,
            oidc_config=keycloak_oidc_config(
                keycloak_url=keycloak_service.url,
                nexus_base_url=nexus_base_url,
                admins_group_id=nexus_api_admin_group_id,
                enable_rp_initiated_logout=True,
            ),
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id

        try:
            token, cookies = create_oidc_login_session(
                nexus_base_url=nexus_base_url,
                nexus_api=nexus_api,
                oidc_provider_id=provider_id,
                username=get_keycloak_nexus_admin_username(),
                password=get_keycloak_nexus_admin_password(),
            )
            body = logout_response_body(logout_with_session(nexus_base_url, token, cookies))
            assert "redirect_url" in body
            assert "auth_error" not in body
            redirect_url = body["redirect_url"]
            assert "openid-connect/logout" in redirect_url or "end_session" in redirect_url
            assert "id_token_hint" in redirect_url or "post_logout_redirect_uri" in redirect_url
        finally:
            destroy_keycloak_oidc_identity_provider(nexus_api, provider_id)


class TestAPIRpInitiatedLogoutDisabled:
    """API-43: RP-initiated logout disabled — orchestrator logout only."""

    def test_logout_has_no_redirect_when_disabled(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
        keycloak_user_factory: Callable[[], tuple[str, str]],
    ) -> None:
        """Logout must succeed without redirect_url when RP-initiated logout is off."""
        username, password = keycloak_user_factory()
        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)
        oidc_user_factory(provider.id, username, password)

        list_resp = nexus_api.users.list(username=username)
        assert list_resp.parsed is not None
        assert len(list_resp.parsed.resources) == 1
        user_id = list_resp.parsed.resources[0].id

        token, cookies = create_oidc_login_session(
            nexus_base_url=nexus_base_url,
            nexus_api=nexus_api,
            oidc_provider_id=provider.id,
            username=username,
            password=password,
        )
        body = logout_response_body(logout_with_session(nexus_base_url, token, cookies))
        assert "redirect_url" not in body
        assert "auth_error" not in body

        nexus_api.users.delete(user_id=user_id)


class TestAPIRpInitiatedLogoutMissingEndSession:
    """API-44: RP-initiated logout enabled but end-session endpoint unavailable."""

    def test_logout_returns_auth_error_without_end_session_endpoint(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        nexus_api_admin_group_id: UUID,
        keycloak_service: HttpApiService,
        keycloak_user_factory: Callable[[], tuple[str, str]],
    ) -> None:
        """Logout must return auth_error when end_session_endpoint cannot be resolved."""
        add_keycloak_service_admin_user(keycloak_service.url)
        username, password = keycloak_user_factory()
        keycloak_url = keycloak_service.url

        config = keycloak_oidc_config(
            keycloak_url=keycloak_url,
            nexus_base_url=nexus_base_url,
            admins_group_id=nexus_api_admin_group_id,
            auto_discovery=False,
            pass_token_endpoint=True,
            enable_rp_initiated_logout=True,
            end_session_endpoint=None,
        )
        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(name=f"e2e-rp-missing-end-{username}", configuration=config),
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        assert create_resp.parsed is not None
        provider_id = create_resp.parsed.id

        try:
            token, cookies = create_oidc_login_session(
                nexus_base_url=nexus_base_url,
                nexus_api=nexus_api,
                oidc_provider_id=provider_id,
                username=username,
                password=password,
            )
            body = logout_response_body(logout_with_session(nexus_base_url, token, cookies))
            assert "redirect_url" not in body
            assert "auth_error" in body
        finally:
            destroy_keycloak_oidc_identity_provider(nexus_api, provider_id)
