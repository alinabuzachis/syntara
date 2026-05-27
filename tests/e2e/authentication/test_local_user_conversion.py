"""E2E tests for API-30: Local User Identity Linking and Conversion.

Verifies that:
1. Builtin users cannot link OIDC identities (returns IdentityOnBuiltinUserError)
2. Non-builtin local users can link identities and are converted to federated
3. Password is removed and auth_type changes to FEDERATED
4. Old password no longer works, can authenticate via IdP
"""

from __future__ import annotations

import pytest

pytest.importorskip("external_services")

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest
from nexus_api_client.api.authentication.login import sync_detailed as login_sync
from nexus_api_client.models.access_token_response import AccessTokenResponse
from nexus_api_client.models.auth_type import AuthType
from nexus_api_client.models.login_request import LoginRequest
from nexus_api_client.models.user_create import UserCreate
from nexus_api_client.models.user_identity_attach import UserIdentityAttach
from nexus_api_client.models.user_update import UserUpdate

from tests.e2e.conftest import generate_test_password

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client import Client
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse

pytestmark = [pytest.mark.e2e]


class TestLocalUserConversion:
    """API-30: Verify local user identity linking and conversion behavior."""

    def test_builtin_admin_cannot_link_identity(
        self,
        nexus_api: NexusApiRegistry,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """Test that builtin admin cannot link OIDC identities."""
        username, password = keycloak_user_factory()
        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)

        federated_api = oidc_user_factory(provider.id, username, password)

        federated_user_resp = federated_api.authentication.get_current_user()
        assert federated_user_resp.status_code == HTTPStatus.OK
        assert federated_user_resp.parsed is not None
        federated_user_id = federated_user_resp.parsed.id

        federated_identities_resp = federated_api.users.list_identities(user_id=federated_user_id)
        assert federated_identities_resp.status_code == HTTPStatus.OK
        assert federated_identities_resp.parsed is not None
        identities = federated_identities_resp.parsed.resources
        assert len(identities) == 1
        identity_id = identities[0].id

        admin_user_resp = nexus_api.authentication.get_current_user()
        assert admin_user_resp.status_code == HTTPStatus.OK
        assert admin_user_resp.parsed is not None
        admin_user_id = admin_user_resp.parsed.id
        assert admin_user_resp.parsed.username == "admin"

        attach_resp = nexus_api.users.attach_identity(
            user_id=admin_user_id, body=UserIdentityAttach(identity_id=identity_id)
        )
        assert attach_resp.status_code == HTTPStatus.CONFLICT

        admin_identities_resp = nexus_api.users.list_identities(user_id=admin_user_id)
        assert admin_identities_resp.status_code == HTTPStatus.OK
        assert admin_identities_resp.parsed is not None
        admin_identities = admin_identities_resp.parsed.resources
        assert len(admin_identities) == 0

        federated_identities_after_resp = federated_api.users.list_identities(user_id=federated_user_id)
        assert federated_identities_after_resp.status_code == HTTPStatus.OK
        assert federated_identities_after_resp.parsed is not None
        federated_identities_after = federated_identities_after_resp.parsed.resources
        assert len(federated_identities_after) == 1

    def test_non_builtin_local_user_converts_to_federated(  # noqa: PLR0915
        self,
        nexus_api: NexusApiRegistry,
        unauthenticated_client: Client,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """Test that non-builtin local user converts to federated when linking identity."""
        local_username = f"local-user-{uuid4().hex[:8]}"
        local_password = generate_test_password()

        local_user_resp = nexus_api.users.create(
            body=UserCreate(
                username=local_username,
                email=f"{local_username}@example.com",
                full_name="Test Local User",
                password=local_password,
                is_enabled=True,
            )
        )
        assert local_user_resp.status_code == HTTPStatus.CREATED
        assert local_user_resp.parsed is not None
        local_user_id = local_user_resp.parsed.id

        local_user_details_resp = nexus_api.users.get(user_id=local_user_id)
        assert local_user_details_resp.status_code == HTTPStatus.OK
        assert local_user_details_resp.parsed is not None
        assert local_user_details_resp.parsed.auth_type == AuthType.LOCAL
        assert not local_user_details_resp.parsed.is_builtin

        keycloak_username, keycloak_password = keycloak_user_factory()
        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)

        login_resp = login_sync(
            client=unauthenticated_client, body=LoginRequest(username=local_username, password=local_password)
        )
        assert login_resp.status_code == HTTPStatus.OK
        assert isinstance(login_resp.parsed, AccessTokenResponse)

        federated_api = oidc_user_factory(provider.id, keycloak_username, keycloak_password)

        federated_user_resp = federated_api.authentication.get_current_user()
        assert federated_user_resp.status_code == HTTPStatus.OK
        assert federated_user_resp.parsed is not None
        federated_user_id = federated_user_resp.parsed.id

        federated_identities_resp = federated_api.users.list_identities(user_id=federated_user_id)
        assert federated_identities_resp.status_code == HTTPStatus.OK
        assert federated_identities_resp.parsed is not None
        identities = federated_identities_resp.parsed.resources
        assert len(identities) == 1
        identity_id = identities[0].id

        attach_resp = nexus_api.users.attach_identity(
            user_id=local_user_id, body=UserIdentityAttach(identity_id=identity_id)
        )
        assert attach_resp.status_code == HTTPStatus.CREATED
        assert attach_resp.parsed is not None

        converted_user_resp = nexus_api.users.get(user_id=local_user_id)
        assert converted_user_resp.status_code == HTTPStatus.OK
        assert converted_user_resp.parsed is not None
        assert converted_user_resp.parsed.auth_type == AuthType.FEDERATED

        local_user_identities_resp = nexus_api.users.list_identities(user_id=local_user_id)
        assert local_user_identities_resp.status_code == HTTPStatus.OK
        assert local_user_identities_resp.parsed is not None
        local_user_identities = local_user_identities_resp.parsed.resources
        assert len(local_user_identities) == 1

        federated_identities_after_resp = nexus_api.users.list_identities(user_id=federated_user_id)
        assert federated_identities_after_resp.status_code == HTTPStatus.OK
        assert federated_identities_after_resp.parsed is not None
        federated_identities_after = federated_identities_after_resp.parsed.resources
        assert len(federated_identities_after) == 0

        login_fail_resp = login_sync(
            client=unauthenticated_client, body=LoginRequest(username=local_username, password=local_password)
        )
        assert login_fail_resp.status_code == HTTPStatus.UNAUTHORIZED

        converted_profile_resp = nexus_api.users.get(user_id=local_user_id)
        assert converted_profile_resp.status_code == HTTPStatus.OK
        assert converted_profile_resp.parsed is not None
        assert converted_profile_resp.parsed.auth_type == AuthType.FEDERATED

    def test_password_on_federated_user_blocked(
        self,
        nexus_api: NexusApiRegistry,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """Test that setting password on federated user returns PasswordOnFederatedUserError."""
        username, password = keycloak_user_factory()
        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)

        federated_api = oidc_user_factory(provider.id, username, password)

        federated_me_resp = federated_api.authentication.get_current_user()
        assert federated_me_resp.status_code == HTTPStatus.OK
        assert federated_me_resp.parsed is not None
        federated_user_id = federated_me_resp.parsed.id

        federated_user_resp = nexus_api.users.get(user_id=federated_user_id)
        assert federated_user_resp.status_code == HTTPStatus.OK
        assert federated_user_resp.parsed is not None
        assert federated_user_resp.parsed.auth_type == AuthType.FEDERATED

        new_password = generate_test_password()
        update_resp = nexus_api.users.update(user_id=federated_user_id, body=UserUpdate(password=new_password))
        assert update_resp.status_code == HTTPStatus.CONFLICT

        user_details_resp = nexus_api.users.get(user_id=federated_user_id)
        assert user_details_resp.status_code == HTTPStatus.OK
        assert user_details_resp.parsed is not None
        assert user_details_resp.parsed.auth_type == AuthType.FEDERATED

        profile_resp = federated_api.authentication.get_current_user()
        assert profile_resp.status_code == HTTPStatus.OK
        assert profile_resp.parsed is not None
