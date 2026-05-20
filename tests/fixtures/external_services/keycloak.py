"""Keycloak external service fixture.

Duplicated from atf_sdk.fixtures.external_services.base (keycloak_service only).
When atf-sdk is added as a dependency, replace this module with the atf-sdk equivalents.
"""

import os
import secrets
from collections.abc import Callable, Generator
from uuid import UUID, uuid4

import httpx
import pytest
from external_services.k8s.types import K8sProvider
from external_services.plugin import ServiceCatalog
from external_services.types import HttpApiService
from external_services.utils import WaitException
from nexus_api_client import AuthenticatedClient
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.oidc_configuration import OIDCConfiguration
from nexus_api_client.models.oidc_group_mapping_entry import OIDCGroupMappingEntry

from tests.fixtures.external_services.connectivity_check import verify_service_connectivity
from tests.fixtures.external_services.oidc_login import create_oidc_auth_client, create_oidc_identity_provider

_ADMIN_USERNAME = "admin"
_ADMIN_PASSWORD = "admin"  # noqa: S105
_REALM = os.environ.get("KEYCLOAK_REALM", "nexus")
_CLIENT_ID = os.environ.get("KEYCLOAK_CLIENT_ID", "nexus")
_CLIENT_SECRET = os.environ.get("KEYCLOAK_CLIENT_SECRET", "nexus-secret")

_KEYCLOAK_NEXUS_UID = uuid4().hex[:8]
_KEYCLOAK_NEXUS_ADMIN_USERNAME = f"keycloak-nexus-admin-{_KEYCLOAK_NEXUS_UID}"
_KEYCLOAK_NEXUS_ADMIN_PASSWORD = secrets.token_urlsafe(16)
_KEYCLOAK_NEXUS_ADMIN_EMAIL = f"{_KEYCLOAK_NEXUS_ADMIN_USERNAME}@example.com"
_KEYCLOAK_NEXUS_ADMIN_GROUP = f"keycloak-nexus-admin-{_KEYCLOAK_NEXUS_UID}"


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


def _create_keycloak_group(base_url: str) -> None:
    """Create a nexus-admin group in the Keycloak nexus realm via the admin API."""
    token = _get_admin_token(base_url)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    group_resp = httpx.post(
        f"{base_url}/admin/realms/{_REALM}/groups",
        json={"name": _KEYCLOAK_NEXUS_ADMIN_GROUP},
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if group_resp.status_code not in (201, 409):
        group_resp.raise_for_status()


def _create_realm_user(base_url: str) -> None:
    """Create a user in the Keycloak nexus realm via the admin API."""
    token = _get_admin_token(base_url)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = httpx.post(
        f"{base_url}/admin/realms/{_REALM}/users",
        json={
            "username": _KEYCLOAK_NEXUS_ADMIN_USERNAME,
            "email": _KEYCLOAK_NEXUS_ADMIN_EMAIL,
            "firstName": "Nexus",
            "lastName": "User",
            "enabled": True,
            "credentials": [{"type": "password", "value": _KEYCLOAK_NEXUS_ADMIN_PASSWORD, "temporary": False}],
        },
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if resp.status_code not in (201, 409):
        resp.raise_for_status()


def _get_realm_user_id(base_url: str) -> str:
    token = _get_admin_token(base_url)
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(
        f"{base_url}/admin/realms/{_REALM}/users",
        params={"username": _KEYCLOAK_NEXUS_ADMIN_USERNAME, "exact": "true"},
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    resp.raise_for_status()
    users = resp.json()
    if not users:
        msg = f"User {_KEYCLOAK_NEXUS_ADMIN_USERNAME!r} not found in realm {_REALM!r}"
        raise RuntimeError(msg)
    return str(users[0]["id"])


def _add_user_to_realm_group(base_url: str) -> None:
    token = _get_admin_token(base_url)
    headers = {"Authorization": f"Bearer {token}"}
    user_id = _get_realm_user_id(base_url)
    groups = httpx.get(
        f"{base_url}/admin/realms/{_REALM}/groups",
        params={"search": _KEYCLOAK_NEXUS_ADMIN_GROUP},
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    groups.raise_for_status()
    group_id = groups.json()[0]["id"]
    resp = httpx.put(
        f"{base_url}/admin/realms/{_REALM}/users/{user_id}/groups/{group_id}",
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if resp.status_code not in (204, 409):
        resp.raise_for_status()


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


def add_keycloak_service_admin_user(keycloak_service_url: str) -> None:
    """Create a keycloak admin user and add it to the keycloak service."""
    _create_keycloak_group(keycloak_service_url)
    _create_realm_user(keycloak_service_url)
    _add_user_to_realm_group(keycloak_service_url)


def keycloak_oidc_config(
    keycloak_url: str,
    nexus_base_url: str,
    admins_group_id: UUID,
    *,
    auto_discovery: bool = True,
    pass_token_endpoint: bool = False,
) -> OIDCConfiguration:
    """Keycloak OIDC Configuration for IdP creation."""
    keycloak_config: OIDCConfiguration = OIDCConfiguration(
        issuer_url=f"{keycloak_url}/realms/{_REALM}",
        client_id=_CLIENT_ID,
        client_secret=_CLIENT_SECRET,
        redirect_uri=f"{nexus_base_url}/api/v1/auth/oidc/callback",
        auto_discovery=auto_discovery,
        group_jmespath_expression="groups[*]",
        group_mapping_entries=[
            OIDCGroupMappingEntry(
                idp_group_value="*",
                nexus_group_id=admins_group_id,
            )
        ],
    )

    if not auto_discovery:
        keycloak_config.authorization_endpoint = f"{keycloak_url}/realms/{_REALM}/protocol/openid-connect/auth"
        keycloak_config.jwks_uri = f"{keycloak_url}/realms/{_REALM}/protocol/openid-connect/certs"

    if pass_token_endpoint:
        keycloak_config.token_endpoint = f"{keycloak_url}/realms/{_REALM}/protocol/openid-connect/token"

    return keycloak_config


def destroy_keycloak_oidc_identity_provider(nexus_api: NexusApiRegistry, oidc_provider_id: UUID) -> None:
    """Teardown keycloak OIDC identity provider and created IdP User."""
    list_user_resp = nexus_api.users.list(username=_KEYCLOAK_NEXUS_ADMIN_USERNAME)
    if list_user_resp.parsed is not None and len(list_user_resp.parsed.resources) == 1:
        nexus_api.users.delete(user_id=list_user_resp.parsed.resources[0].id)
    nexus_api.identity_providers.delete(provider_id=oidc_provider_id)


@pytest.fixture
def keycloak_auth_client(
    keycloak_service: HttpApiService,
    nexus_api: NexusApiRegistry,
    nexus_base_url: str,
    nexus_api_admin_group_id: UUID,
) -> Generator["AuthenticatedClient", None, None]:
    """Keycloak OIDC identity provider Authenticated Client."""
    add_keycloak_service_admin_user(keycloak_service.url)
    provider = create_oidc_identity_provider(
        nexus_api=nexus_api,
        oidc_config=keycloak_oidc_config(keycloak_service.url, nexus_base_url, nexus_api_admin_group_id),
    )
    assert isinstance(provider.id, UUID)
    provider_id = provider.id
    auth_client = create_oidc_auth_client(
        nexus_base_url=nexus_base_url,
        nexus_api=nexus_api,
        oidc_provider_id=provider_id,
        username=_KEYCLOAK_NEXUS_ADMIN_USERNAME,
        password=_KEYCLOAK_NEXUS_ADMIN_PASSWORD,
    )
    yield auth_client
    destroy_keycloak_oidc_identity_provider(nexus_api, provider_id)


@pytest.fixture
def keycloak_nexus_api(
    keycloak_auth_client: AuthenticatedClient,
) -> NexusApiRegistry:
    """NexusAPIRegistry authenticated using Keycloak OIDC identity provider."""
    return NexusApiRegistry(keycloak_auth_client)


def get_keycloak_nexus_admin_username() -> str:
    """Getter for Keycloak Nexus admin username."""
    return _KEYCLOAK_NEXUS_ADMIN_USERNAME


def get_keycloak_nexus_admin_password() -> str:
    """Getter for Keycloak Nexus admin password."""
    return _KEYCLOAK_NEXUS_ADMIN_PASSWORD
