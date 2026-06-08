"""E2E tests for OIDC identity provider integration with Azure AD (Entra ID)."""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest
from nexus_api_client.models.identity_provider_create import IdentityProviderCreate
from nexus_api_client.models.oidc_configuration import OIDCConfiguration
from nexus_api_client.models.oidc_test_request import OIDCTestRequest

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

    from tests.fixtures.external_services.azuread import AzureAuthTestSet

pytestmark = [pytest.mark.e2e]


def _oidc_config(testset: AzureAuthTestSet, nexus_base_url: str) -> OIDCConfiguration:
    tenant_id = os.environ["AZURE_AD_TENANT_ID"]
    return OIDCConfiguration(
        issuer_url=f"https://login.microsoftonline.com/{tenant_id}/v2.0",
        client_id=testset.client_id,
        client_secret=testset.secret,
        redirect_uri=f"{nexus_base_url}/api/v1/auth/oidc/callback",
        auto_discovery=True,
    )


class TestAzureADProviderLifecycle:
    """OIDC identity provider lifecycle against a live Azure AD (Entra ID) tenant."""

    def test_connection_test_succeeds(
        self,
        azure_ad_testset: AzureAuthTestSet,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """POST /identity_providers/test must succeed against Azure AD's OIDC discovery."""
        resp = nexus_api.identity_providers.test(
            body=OIDCTestRequest(
                name="e2e-azuread-test",
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
            )
        )
        assert resp.status_code == HTTPStatus.OK
        result = resp.parsed
        assert result is not None
        assert result.success is True, f"OIDC connection test failed: {result.message}"

    def test_create_appears_in_admin_list(
        self,
        azure_ad_testset: AzureAuthTestSet,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """Created provider must appear in the admin identity providers listing."""
        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name="e2e-azuread-list",
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
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
        azure_ad_testset: AzureAuthTestSet,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """An enabled Azure AD provider must appear in the public GET /auth/providers response."""
        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name="e2e-azuread-public",
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
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
            assert "e2e-azuread-public" in provider_names
        finally:
            nexus_api.identity_providers.delete(provider_id=provider_id)

    def test_oidc_authorize_redirects_to_azure(
        self,
        azure_ad_testset: AzureAuthTestSet,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """GET /auth/oidc/authorize must redirect to Azure AD's authorization endpoint."""
        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name="e2e-azuread-authorize",
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
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
            tenant_id = os.environ["AZURE_AD_TENANT_ID"]
            assert f"login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize" in location
        finally:
            nexus_api.identity_providers.delete(provider_id=provider_id)

    def test_delete_removes_provider(
        self,
        azure_ad_testset: AzureAuthTestSet,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """Deleting a provider must remove it from the identity providers listing."""
        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name="e2e-azuread-delete",
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
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
