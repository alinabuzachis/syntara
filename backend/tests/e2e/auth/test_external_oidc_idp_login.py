"""E2E tests for IdP configuration — Gateway & external OIDC (ANSTRAT-1844)."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import httpx
import pytest
from nexus_api_client.models.identity_provider_create import IdentityProviderCreate

pytest.importorskip("external_services")

from tests.fixtures.external_services.keycloak import (
    add_keycloak_service_admin_user,
    destroy_keycloak_oidc_identity_provider,
    get_keycloak_nexus_admin_email,
    get_keycloak_nexus_admin_password,
    get_keycloak_nexus_admin_username,
    keycloak_oidc_config,
)
from tests.fixtures.external_services.oidc_login import (
    create_oidc_auth_client,
    create_oidc_identity_provider,
)

if TYPE_CHECKING:
    from external_services.types import HttpApiService
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.user_info import UserInfo

pytestmark = [pytest.mark.e2e]


class TestKeycloakOIDCAuthentication:
    """Test API 4-7: Keycloak OIDC authentication tests."""

    def test_keycloak_oidc_idp_config(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        nexus_admin_user: UserInfo,
        nexus_api_admin_group_id: UUID,
        keycloak_service: HttpApiService,
    ) -> None:
        """Verify external keycloak OIDC IdP configuration and subsequent login via API."""
        """Logged in as built-in admin user"""
        assert nexus_admin_user.username == "admin"

        """Create an IdP with Keycloak OIDC."""
        add_keycloak_service_admin_user(keycloak_service.url)
        provider = create_oidc_identity_provider(
            nexus_api=nexus_api,
            oidc_config=keycloak_oidc_config(
                keycloak_url=keycloak_service.url,
                nexus_base_url=nexus_base_url,
                admins_group_id=nexus_api_admin_group_id,
            ),
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id

        try:
            """Verify created Keycloak IdP appears in list."""
            identity_providers = nexus_api.identity_providers.list().assert_and_get()
            assert any(p.id == provider_id for p in identity_providers.resources)

            """Verify .well-known/openid-configuration is reachable"""
            config_resp = httpx.get(
                url=f"{provider.configuration.issuer_url}/.well-known/openid-configuration",
                verify=False,  # noqa: S501
            )
            assert config_resp.status_code == HTTPStatus.OK

            """Authenticate a user via the OIDC flow."""
            auth_client = create_oidc_auth_client(
                nexus_base_url=nexus_base_url,
                nexus_api=nexus_api,
                oidc_provider_id=provider_id,
                username=get_keycloak_nexus_admin_username(),
                password=get_keycloak_nexus_admin_password(),
            )
            assert auth_client is not None
            assert auth_client.token is not None
        finally:
            destroy_keycloak_oidc_identity_provider(nexus_api, provider_id)

    def test_keycloak_oidc_idp_manual_config(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        nexus_admin_user: UserInfo,
        nexus_api_admin_group_id: UUID,
        keycloak_service: HttpApiService,
    ) -> None:
        """Verify external keycloak OIDC IdP manual configuration and subsequent login via API."""
        """Logged in as built-in admin user"""
        assert nexus_admin_user.username == "admin"

        """Create an IdP with Keycloak OIDC."""
        add_keycloak_service_admin_user(keycloak_service.url)
        provider = create_oidc_identity_provider(
            nexus_api=nexus_api,
            oidc_config=keycloak_oidc_config(
                keycloak_url=keycloak_service.url,
                nexus_base_url=nexus_base_url,
                admins_group_id=nexus_api_admin_group_id,
                auto_discovery=False,
                pass_token_endpoint=True,
            ),
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id

        try:
            """Verify created Keycloak IdP appears in list."""
            identity_providers = nexus_api.identity_providers.list().assert_and_get()
            assert any(p.id == provider_id for p in identity_providers.resources)

            """Verify .well-known/openid-configuration is reachable"""
            config_resp = httpx.get(
                url=f"{provider.configuration.issuer_url}/.well-known/openid-configuration",
                verify=False,  # noqa: S501
            )
            assert config_resp.status_code == HTTPStatus.OK

            """Authenticate a user via the OIDC flow."""
            auth_client = create_oidc_auth_client(
                nexus_base_url=nexus_base_url,
                nexus_api=nexus_api,
                oidc_provider_id=provider_id,
                username=get_keycloak_nexus_admin_username(),
                password=get_keycloak_nexus_admin_password(),
            )
            assert auth_client is not None
            assert auth_client.token is not None
        finally:
            destroy_keycloak_oidc_identity_provider(nexus_api, provider_id)

    def test_keycloak_oidc_idp_manual_config_missing_endpoints(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        nexus_admin_user: UserInfo,
        nexus_api_admin_group_id: UUID,
        keycloak_service: HttpApiService,
    ) -> None:
        """Verify external keycloak OIDC IdP manual configuration fails with missing token endpoint."""
        """Logged in as built-in admin user"""
        assert nexus_admin_user.username == "admin"

        """Create an IdP with Keycloak OIDC."""
        idp_create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name=f"e2e-oidc-provider-{uuid4().hex[:8]}",
                configuration=keycloak_oidc_config(
                    keycloak_url=keycloak_service.url,
                    nexus_base_url=nexus_base_url,
                    admins_group_id=nexus_api_admin_group_id,
                    auto_discovery=False,
                    pass_token_endpoint=False,
                ),
            )
        )
        assert idp_create_resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
        assert idp_create_resp.parsed is not None
        assert (
            idp_create_resp.parsed.detail
            == "Validation failed: root: token_endpoint is required when auto_discovery is disabled"
        )

    def test_enterprise_sso_login(
        self,
        keycloak_nexus_api: NexusApiRegistry,
    ) -> None:
        """API-7: Verify enterprise sso login via API."""
        keycloak_user = keycloak_nexus_api.authentication.get_current_user().assert_and_get()
        assert keycloak_user.username == get_keycloak_nexus_admin_username()
        assert keycloak_user.email == get_keycloak_nexus_admin_email()
        assert "admins" in keycloak_user.groups
