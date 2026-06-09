"""E2E tests for OIDC identity provider integration with Azure AD (Entra ID)."""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest
from nexus_api_client.models.identity_provider_create import IdentityProviderCreate
from nexus_api_client.models.oidc_configuration import OIDCConfiguration
from nexus_api_client.models.oidc_test_request import OIDCTestRequest

from tests.e2e.conftest import unique_name

if TYPE_CHECKING:
    from collections.abc import Callable
    from typing import Any

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
        result = nexus_api.identity_providers.test(
            body=OIDCTestRequest(
                name=unique_name("e2e-azuread-test"),
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
            )
        ).assert_and_get()
        assert result.success is True, f"OIDC connection test failed: {result.message}"

    def test_create_appears_in_admin_list(
        self,
        azure_ad_testset: AzureAuthTestSet,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        identity_provider_factory: Callable[[IdentityProviderCreate], Any],
    ) -> None:
        """Created provider must appear in the admin identity providers listing."""
        provider = identity_provider_factory(
            IdentityProviderCreate(
                name=unique_name("e2e-azuread-list"),
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
            )
        )

        listed = nexus_api.identity_providers.list().assert_and_get()
        assert any(p.id == provider.id for p in listed.resources)

    def test_enabled_provider_appears_in_public_auth_listing(
        self,
        azure_ad_testset: AzureAuthTestSet,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        identity_provider_factory: Callable[[IdentityProviderCreate], Any],
    ) -> None:
        """An enabled Azure AD provider must appear in the public GET /auth/providers response."""
        provider = identity_provider_factory(
            IdentityProviderCreate(
                name=unique_name("e2e-azuread-public"),
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
            )
        )

        auth_data = nexus_api.authentication.list_auth_providers().assert_and_get()
        provider_names = [p.name for p in (auth_data.resources or [])]
        assert provider.name in provider_names

    def test_oidc_authorize_redirects_to_azure(
        self,
        azure_ad_testset: AzureAuthTestSet,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        identity_provider_factory: Callable[[IdentityProviderCreate], Any],
    ) -> None:
        """GET /auth/oidc/authorize must redirect to Azure AD's authorization endpoint."""
        provider = identity_provider_factory(
            IdentityProviderCreate(
                name=unique_name("e2e-azuread-authorize"),
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
            )
        )

        resp = nexus_api.authentication.oidc_authorize(provider_id=provider.id)
        assert resp.status_code in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT)
        location = resp.headers.get("location", "")
        tenant_id = os.environ["AZURE_AD_TENANT_ID"]
        assert f"login.microsoftonline.com/{tenant_id}/oauth2/v2.0/authorize" in location

    def test_delete_removes_provider(
        self,
        azure_ad_testset: AzureAuthTestSet,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        identity_provider_factory: Callable[[IdentityProviderCreate], Any],
    ) -> None:
        """Deleting a provider must remove it from the identity providers listing."""
        provider = identity_provider_factory(
            IdentityProviderCreate(
                name=unique_name("e2e-azuread-delete"),
                configuration=_oidc_config(azure_ad_testset, nexus_base_url),
            )
        )

        delete_resp = nexus_api.identity_providers.delete(provider_id=provider.id)
        assert delete_resp.status_code == HTTPStatus.NO_CONTENT

        listed = nexus_api.identity_providers.list().assert_and_get()
        assert all(p.id != provider.id for p in listed.resources)
