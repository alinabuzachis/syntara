"""Keycloak external service fixture.

Duplicated from atf_sdk.fixtures.external_services.base (keycloak_service only).
When atf-sdk is added as a dependency, replace this module with the atf-sdk equivalents.
"""

import os
from collections.abc import Callable

import httpx
import pytest
from external_services.k8s.types import K8sProvider
from external_services.plugin import ServiceCatalog
from external_services.types import HttpApiService
from external_services.utils import WaitException

from tests.fixtures.external_services.connectivity_check import verify_service_connectivity

_ADMIN_USERNAME = "admin"
_ADMIN_PASSWORD = "admin"  # noqa: S105
_REALM = os.environ.get("KEYCLOAK_REALM", "nexus")
_CLIENT_ID = os.environ.get("KEYCLOAK_CLIENT_ID", "nexus")
_CLIENT_SECRET = os.environ.get("KEYCLOAK_CLIENT_SECRET", "nexus-secret")


def _get_admin_token(base_url: str) -> str:
    resp = httpx.post(
        f"{base_url}/realms/master/protocol/openid-connect/token",
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": _ADMIN_USERNAME,
            "password": _ADMIN_PASSWORD,
        },
        verify=False,  # noqa: S501
        timeout=30,
    )
    resp.raise_for_status()
    return str(resp.json()["access_token"])


def _setup_nexus_realm(base_url: str) -> None:
    """Create the nexus realm and OIDC client in the freshly deployed Keycloak instance."""
    token = _get_admin_token(base_url)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    realm_resp = httpx.post(
        f"{base_url}/admin/realms",
        json={"realm": _REALM, "enabled": True},
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if realm_resp.status_code not in (201, 409):
        realm_resp.raise_for_status()

    client_resp = httpx.post(
        f"{base_url}/admin/realms/{_REALM}/clients",
        json={
            "clientId": _CLIENT_ID,
            "secret": _CLIENT_SECRET,
            "enabled": True,
            "protocol": "openid-connect",
            "publicClient": False,
            "redirectUris": ["*"],
            "webOrigins": ["*"],
            "standardFlowEnabled": True,
        },
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if client_resp.status_code not in (201, 409):
        client_resp.raise_for_status()


@pytest.fixture(scope="class")
def keycloak_service(
    request: pytest.FixtureRequest,
    gke_ext_service_provider: K8sProvider,
    gke_ext_service_url_retriever: Callable[[HttpApiService], str],
) -> HttpApiService:
    """Start a Keycloak service on GKE, create the nexus realm, and return its HttpApiService handle."""
    service = ServiceCatalog(provider=gke_ext_service_provider).get_service(
        service_name="keycloak", url_retriever=gke_ext_service_url_retriever
    )
    request.addfinalizer(service.stop)  # noqa: PT021
    try:
        service.start()
    except WaitException:
        pytest.skip("Keycloak service not available on GKE (timed out waiting for readiness)")
    verify_service_connectivity("Keycloak", service)
    _setup_nexus_realm(service.url)
    return service
