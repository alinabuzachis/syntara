"""Keycloak external service fixture.

Duplicated from atf_sdk.fixtures.external_services.base (keycloak_service only).
When atf-sdk is added as a dependency, replace this module with the atf-sdk equivalents.
"""

import logging
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
from nexus_api_client.models.identity_provider_response import IdentityProviderResponse
from nexus_api_client.models.oidc_configuration import OIDCConfiguration
from nexus_api_client.models.oidc_group_mapping_entry import OIDCGroupMappingEntry

from tests.fixtures.external_services.connectivity_check import verify_service_connectivity
from tests.fixtures.external_services.oidc_login import create_oidc_auth_client, create_oidc_identity_provider

logger = logging.getLogger(__name__)

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


def _get_realm_user_id(base_url: str, username: str | None = None) -> str:
    """Return Keycloak user id for ``username``, or the fixture admin user when omitted."""
    lookup_username = username if username is not None else _KEYCLOAK_NEXUS_ADMIN_USERNAME
    token = _get_admin_token(base_url)
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(
        f"{base_url}/admin/realms/{_REALM}/users",
        params={"username": lookup_username, "exact": "true"},
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    resp.raise_for_status()
    users = resp.json()
    if not users:
        msg = f"User {lookup_username!r} not found in realm {_REALM!r}"
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


def generate_test_user_credentials() -> tuple[str, str]:
    """Generate unique Keycloak user credentials for tests."""
    username = f"test-user-{uuid4().hex[:8]}"
    password = secrets.token_urlsafe(16)
    return username, password


def create_test_user(keycloak_url: str, username: str, password: str, realm: str = "nexus") -> None:
    """Create a test user in Keycloak realm for e2e tests."""
    token = _get_admin_token(keycloak_url)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    user_resp = httpx.post(
        f"{keycloak_url}/admin/realms/{realm}/users",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "firstName": "Test",
            "lastName": "User",
            "enabled": True,
            "credentials": [{"type": "password", "value": password, "temporary": False}],
        },
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if user_resp.status_code not in (201, 409):
        user_resp.raise_for_status()


def delete_test_user(keycloak_url: str, username: str, realm: str = "nexus") -> None:
    """Delete a test user from Keycloak realm for test cleanup."""
    token = _get_admin_token(keycloak_url)
    headers = {"Authorization": f"Bearer {token}"}
    users_resp = httpx.get(
        f"{keycloak_url}/admin/realms/{realm}/users",
        params={"username": username, "exact": "true"},
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if users_resp.status_code == 200:
        users = users_resp.json()
        if users:
            user_id = users[0]["id"]
            delete_resp = httpx.delete(
                f"{keycloak_url}/admin/realms/{realm}/users/{user_id}",
                headers=headers,
                verify=False,  # noqa: S501
                timeout=30,
            )
            if delete_resp.status_code not in (204, 404):
                delete_resp.raise_for_status()


@pytest.fixture
def keycloak_user_factory(
    keycloak_service: HttpApiService,
) -> Generator[Callable[[], tuple[str, str]], None, None]:
    """Factory that creates Keycloak test users with automatic cleanup."""
    created_users: list[str] = []

    def _create() -> tuple[str, str]:
        username, password = generate_test_user_credentials()
        create_test_user(keycloak_service.url, username, password)
        created_users.append(username)
        return username, password

    yield _create

    for username in created_users:
        try:
            delete_test_user(keycloak_service.url, username)
        except Exception:
            logger.warning("Failed to clean up Keycloak test user %s", username, exc_info=True)


@pytest.fixture
def oidc_provider_factory(
    nexus_api: NexusApiRegistry,
    keycloak_service: HttpApiService,
    nexus_base_url: str,
    nexus_api_admin_group_id: UUID,
) -> Generator[Callable[[], IdentityProviderResponse], None, None]:
    """Factory that creates OIDC identity providers with automatic cleanup."""
    created_provider_ids: list[UUID] = []

    def _create() -> IdentityProviderResponse:
        provider = create_oidc_identity_provider(
            nexus_api=nexus_api,
            oidc_config=keycloak_oidc_config(keycloak_service.url, nexus_base_url, nexus_api_admin_group_id),
        )
        assert isinstance(provider.id, UUID)
        created_provider_ids.append(provider.id)
        return provider

    yield _create

    for provider_id in created_provider_ids:
        try:
            nexus_api.identity_providers.delete(provider_id=provider_id)
        except Exception:
            logger.warning("Failed to clean up OIDC provider %s", provider_id, exc_info=True)


@pytest.fixture
def group_mapping_provider_factory(
    nexus_api: NexusApiRegistry,
    keycloak_service: HttpApiService,
    nexus_base_url: str,
) -> Generator[Callable[..., IdentityProviderResponse], None, None]:
    """Factory that creates group-mapping OIDC providers with automatic cleanup."""
    created_provider_ids: list[UUID] = []

    def _create(
        *,
        group_jmespath_expression: str | None = "groups[*]",
        group_mapping_entries: list[OIDCGroupMappingEntry] | None = None,
        allow_all_authenticated: bool = False,
    ) -> IdentityProviderResponse:
        from tests.e2e.authentication.group_mapping_helpers import create_group_mapping_provider
        from tests.fixtures.external_services.keycloak_groups import ensure_groups_claim_mapper

        ensure_groups_claim_mapper(keycloak_service.url)
        provider = create_group_mapping_provider(
            nexus_api,
            keycloak_service.url,
            nexus_base_url,
            group_jmespath_expression=group_jmespath_expression,
            group_mapping_entries=group_mapping_entries,
            allow_all_authenticated=allow_all_authenticated,
        )
        assert isinstance(provider.id, UUID)
        created_provider_ids.append(provider.id)
        return provider

    yield _create

    for provider_id in created_provider_ids:
        try:
            nexus_api.identity_providers.delete(provider_id=provider_id)
        except Exception:
            logger.warning("Failed to clean up group-mapping OIDC provider %s", provider_id, exc_info=True)


@pytest.fixture
def nexus_group_factory(
    nexus_api: NexusApiRegistry,
) -> Generator[Callable[[str], UUID], None, None]:
    """Factory that creates Nexus groups with automatic cleanup (group-mapping E2E tests)."""
    from tests.e2e.authentication.group_mapping_helpers import create_nexus_group, delete_nexus_group

    created_group_ids: list[UUID] = []

    def _create(name: str) -> UUID:
        group_id = create_nexus_group(nexus_api, name)
        created_group_ids.append(group_id)
        return group_id

    yield _create

    for group_id in created_group_ids:
        try:
            delete_nexus_group(nexus_api, group_id)
        except Exception:
            logger.warning("Failed to clean up Nexus group %s", group_id, exc_info=True)


@pytest.fixture
def oidc_user_factory(
    nexus_base_url: str,
    nexus_api: NexusApiRegistry,
) -> Generator[Callable[[UUID, str, str], NexusApiRegistry], None, None]:
    """Factory that authenticates a user via OIDC and returns a NexusApiRegistry."""
    created_user_ids: list[str] = []

    def _authenticate(provider_id: UUID, username: str, password: str) -> NexusApiRegistry:
        client = create_oidc_auth_client(
            nexus_base_url=nexus_base_url,
            nexus_api=nexus_api,
            oidc_provider_id=provider_id,
            username=username,
            password=password,
        )
        user_api = NexusApiRegistry(client)
        me_resp = user_api.authentication.get_current_user()
        if me_resp.parsed is not None:
            created_user_ids.append(str(me_resp.parsed.id))
        return user_api

    yield _authenticate

    for user_id in created_user_ids:
        try:
            nexus_api.users.delete(user_id=user_id)
        except Exception:
            logger.warning("Failed to clean up Nexus user %s", user_id, exc_info=True)
