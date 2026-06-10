"""E2E tests for API-30: Local User Identity Linking and Conversion.

Verifies that:
1. Non-builtin local users can link identities and are converted to federated
2. Password is removed and auth_type changes to FEDERATED
3. Old password no longer works, can authenticate via IdP

Also covers API-34 (Local/Federated Mutual Exclusivity):
- Setting a password on a federated user returns 409 PASSWORD_ON_FEDERATED_USER

Note: Builtin user identity attachment constraint is tested in test_admin_attach_identity.py
"""

from __future__ import annotations

import pytest

pytest.importorskip("external_services")

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID

from nexus_api_client.api.authentication.login import sync_detailed as login_sync
from nexus_api_client.models.access_token_response import AccessTokenResponse
from nexus_api_client.models.auth_type import AuthType
from nexus_api_client.models.login_request import LoginRequest
from nexus_api_client.models.user_identity_attach import UserIdentityAttach
from nexus_api_client.models.user_update import UserUpdate

from tests.e2e.conftest import generate_test_password

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client import Client
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse
    from nexus_api_client.models.user_read import UserRead

pytestmark = [pytest.mark.e2e]


class TestLocalUserConversion:
    """API-30: Verify local user identity linking and conversion behavior."""

    def test_non_builtin_local_user_converts_to_federated(
        self,
        nexus_api: NexusApiRegistry,
        unauthenticated_client: Client,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
        local_user_factory: Callable[..., tuple[UserRead, str]],
    ) -> None:
        """Test that non-builtin local user converts to federated when linking identity."""
        local_user, local_password = local_user_factory()
        local_user_id = local_user.id
        local_username = local_user.username

        local_user_details = nexus_api.users.get(user_id=local_user_id).assert_and_get()
        assert local_user_details.auth_type == AuthType.LOCAL
        assert not local_user_details.is_builtin

        keycloak_username, keycloak_password = keycloak_user_factory()
        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)

        login_resp = login_sync(
            client=unauthenticated_client, body=LoginRequest(username=local_username, password=local_password)
        )
        assert login_resp.status_code == HTTPStatus.OK
        assert isinstance(login_resp.parsed, AccessTokenResponse)

        federated_api = oidc_user_factory(provider.id, keycloak_username, keycloak_password)

        federated_user = federated_api.authentication.get_current_user().assert_and_get()
        federated_user_id = federated_user.id

        identities = federated_api.users.list_identities(user_id=federated_user_id).assert_and_get().resources
        assert len(identities) == 1
        identity_id = identities[0].id

        nexus_api.users.attach_identity(
            user_id=local_user_id, body=UserIdentityAttach(identity_id=identity_id)
        ).assert_and_get()

        converted_user = nexus_api.users.get(user_id=local_user_id).assert_and_get()
        assert converted_user.auth_type == AuthType.FEDERATED

        local_user_identities = nexus_api.users.list_identities(user_id=local_user_id).assert_and_get().resources
        assert len(local_user_identities) == 1

        federated_identities_after = (
            nexus_api.users.list_identities(user_id=federated_user_id).assert_and_get().resources
        )
        assert len(federated_identities_after) == 0

        login_fail_resp = login_sync(
            client=unauthenticated_client, body=LoginRequest(username=local_username, password=local_password)
        )
        assert login_fail_resp.status_code == HTTPStatus.UNAUTHORIZED

        converted_profile = nexus_api.users.get(user_id=local_user_id).assert_and_get()
        assert converted_profile.auth_type == AuthType.FEDERATED

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

        federated_me = federated_api.authentication.get_current_user().assert_and_get()
        federated_user_id = federated_me.id

        federated_user = nexus_api.users.get(user_id=federated_user_id).assert_and_get()
        assert federated_user.auth_type == AuthType.FEDERATED

        new_password = generate_test_password()
        update_resp = nexus_api.users.update(user_id=federated_user_id, body=UserUpdate(password=new_password))
        assert update_resp.status_code == HTTPStatus.CONFLICT

        user_details = nexus_api.users.get(user_id=federated_user_id).assert_and_get()
        assert user_details.auth_type == AuthType.FEDERATED

        federated_api.authentication.get_current_user().assert_and_get()
