"""E2E tests for OIDC identity provider integration with a live Keycloak cluster."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest
from nexus_api_client.models.identity_provider_create import IdentityProviderCreate
from nexus_api_client.models.oidc_configuration import OIDCConfiguration
from nexus_api_client.models.oidc_test_request import OIDCTestRequest

if TYPE_CHECKING:
    from uuid import UUID

    from external_services.types import HttpApiService
    from nexus_api_client.api import NexusApiRegistry

pytestmark = [pytest.mark.e2e]

KEYCLOAK_REALM = "nexus"
KEYCLOAK_CLIENT_ID = "nexus"
KEYCLOAK_CLIENT_SECRET = "nexus-secret"  # noqa: S105


def _oidc_config(keycloak_url: str, nexus_base_url: str) -> OIDCConfiguration:
    return OIDCConfiguration(
        issuer_url=f"{keycloak_url}/realms/{KEYCLOAK_REALM}",
        client_id=KEYCLOAK_CLIENT_ID,
        client_secret=KEYCLOAK_CLIENT_SECRET,
        redirect_uri=f"{nexus_base_url}/api/v1/auth/oidc/callback",
        auto_discovery=True,
    )


class TestOIDCProviderLifecycle:
    """OIDC identity provider lifecycle against a live Keycloak cluster."""

    def test_connection_test_succeeds(
        self,
        keycloak_service: HttpApiService,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """POST /identity_providers/test must succeed against Keycloak's OIDC discovery."""
        resp = nexus_api.identity_providers.test(
            body=OIDCTestRequest(
                name="e2e-keycloak-test",
                configuration=_oidc_config(keycloak_service.url, nexus_base_url),
            )
        )
        assert resp.status_code == HTTPStatus.OK
        result = resp.parsed
        assert result is not None
        assert result.success is True, f"OIDC connection test failed: {result.message}"

    def test_create_appears_in_admin_list(
        self,
        keycloak_service: HttpApiService,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """Created provider must appear in the admin identity providers listing."""
        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name="e2e-keycloak-list",
                configuration=_oidc_config(keycloak_service.url, nexus_base_url),
            )
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        provider = create_resp.parsed
        assert provider is not None
        provider_id: UUID = provider.id

        try:
            list_resp = nexus_api.identity_providers.list()
            assert list_resp.status_code == HTTPStatus.OK
            listed = list_resp.parsed
            assert listed is not None
            assert any(p.id == provider_id for p in listed.resources)
        finally:
            nexus_api.identity_providers.delete(provider_id=provider_id)

    def test_enabled_provider_appears_in_public_auth_listing(
        self,
        keycloak_service: HttpApiService,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """An enabled Keycloak provider must appear in the public GET /auth/providers response."""
        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name="e2e-keycloak-public",
                configuration=_oidc_config(keycloak_service.url, nexus_base_url),
            )
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        provider = create_resp.parsed
        assert provider is not None
        provider_id: UUID = provider.id

        try:
            auth_resp = nexus_api.authentication.list_auth_providers()
            assert auth_resp.status_code == HTTPStatus.OK
            auth_data = auth_resp.parsed
            assert auth_data is not None
            provider_names = [p.name for p in (auth_data.providers or [])]
            assert "e2e-keycloak-public" in provider_names
        finally:
            nexus_api.identity_providers.delete(provider_id=provider_id)

    def test_oidc_authorize_redirects_to_keycloak(
        self,
        keycloak_service: HttpApiService,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """GET /auth/oidc/authorize must redirect to Keycloak's authorization endpoint."""
        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name="e2e-keycloak-authorize",
                configuration=_oidc_config(keycloak_service.url, nexus_base_url),
            )
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        provider = create_resp.parsed
        assert provider is not None
        provider_id: UUID = provider.id

        try:
            resp = nexus_api.authentication.oidc_authorize(provider_id=provider_id)
            assert resp.status_code in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT)
            location = resp.headers.get("location", "")
            assert f"/realms/{KEYCLOAK_REALM}/protocol/openid-connect/auth" in location
        finally:
            nexus_api.identity_providers.delete(provider_id=provider_id)

    def test_delete_removes_provider(
        self,
        keycloak_service: HttpApiService,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """Deleting a provider must remove it from the identity providers listing."""
        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name="e2e-keycloak-delete",
                configuration=_oidc_config(keycloak_service.url, nexus_base_url),
            )
        )
        assert create_resp.status_code == HTTPStatus.CREATED
        provider = create_resp.parsed
        assert provider is not None
        provider_id: UUID = provider.id

        delete_resp = nexus_api.identity_providers.delete(provider_id=provider_id)
        assert delete_resp.status_code == HTTPStatus.NO_CONTENT

        list_resp = nexus_api.identity_providers.list()
        assert list_resp.status_code == HTTPStatus.OK
        listed = list_resp.parsed
        assert listed is not None
        assert all(p.id != provider_id for p in listed.resources)
