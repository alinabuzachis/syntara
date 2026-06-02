"""E2E tests for IdP-scoped session revocation (ANSTRAT-1844 API-38).

Uses ``DELETE /identity_providers/{provider_id}`` only — no admin CLI or subprocess.
Requires the optional ``external_services`` package and Keycloak.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID

import pytest

pytest.importorskip("external_services")

from tests.e2e.conftest import assert_refresh_succeeds, assert_refresh_unauthorized
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
    from external_services.types import HttpApiService
    from nexus_api_client.api import NexusApiRegistry

pytestmark = [pytest.mark.e2e]


class TestAPIIdPScopedSessionRevocation:
    """API-38: Deleting an identity provider revokes only sessions for that IdP."""

    def test_delete_identity_provider_revokes_idp_sessions_only(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        nexus_api_admin_group_id: UUID,
        keycloak_service: HttpApiService,
    ) -> None:
        """DELETE /identity_providers/{id} must revoke refresh sessions for that provider only."""
        add_keycloak_service_admin_user(keycloak_service.url)
        kc_username = get_keycloak_nexus_admin_username()
        kc_password = get_keycloak_nexus_admin_password()

        provider_a = create_oidc_identity_provider(
            nexus_api=nexus_api,
            oidc_config=keycloak_oidc_config(
                keycloak_service.url,
                nexus_base_url,
                nexus_api_admin_group_id,
            ),
        )
        provider_b = create_oidc_identity_provider(
            nexus_api=nexus_api,
            oidc_config=keycloak_oidc_config(
                keycloak_service.url,
                nexus_base_url,
                nexus_api_admin_group_id,
            ),
        )
        assert isinstance(provider_a.id, UUID)
        assert isinstance(provider_b.id, UUID)
        provider_a_id = provider_a.id
        provider_b_id = provider_b.id

        try:
            _, cookies_a1 = create_oidc_login_session(
                nexus_base_url=nexus_base_url,
                nexus_api=nexus_api,
                oidc_provider_id=provider_a_id,
                username=kc_username,
                password=kc_password,
            )
            _, cookies_a2 = create_oidc_login_session(
                nexus_base_url=nexus_base_url,
                nexus_api=nexus_api,
                oidc_provider_id=provider_a_id,
                username=kc_username,
                password=kc_password,
            )
            _, cookies_b = create_oidc_login_session(
                nexus_base_url=nexus_base_url,
                nexus_api=nexus_api,
                oidc_provider_id=provider_b_id,
                username=kc_username,
                password=kc_password,
            )

            assert_refresh_succeeds(nexus_base_url, cookies_a1)
            assert_refresh_succeeds(nexus_base_url, cookies_a2)
            assert_refresh_succeeds(nexus_base_url, cookies_b)

            delete_resp = nexus_api.identity_providers.delete(provider_id=provider_a_id)
            assert delete_resp.status_code == HTTPStatus.NO_CONTENT

            assert_refresh_unauthorized(nexus_base_url, cookies_a1)
            assert_refresh_unauthorized(nexus_base_url, cookies_a2)
            assert_refresh_succeeds(nexus_base_url, cookies_b)
        finally:
            destroy_keycloak_oidc_identity_provider(nexus_api, provider_b_id)
