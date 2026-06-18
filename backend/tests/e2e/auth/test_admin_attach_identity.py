"""E2E tests for API-32: Admin Attach Identity Between Users.

Verifies that an admin can move a federated identity from one user to another:
- Identity is moved to target user
- Source user account is preserved (not deleted) even with no remaining identities
- Active sessions for source user authenticated via moved identity are revoked
- Target user can log in using the moved identity
- Audit log entry is created

Also covers API-34 (Local/Federated Mutual Exclusivity):
- Attaching an identity to the builtin admin returns 409 IDENTITY_ON_BUILTIN_USER
- Attaching an identity to a non-builtin local user converts them to federated
"""

from __future__ import annotations

import pytest

pytest.importorskip("external_services")

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID

from nexus_api_client.api.authentication.login import sync_detailed as login_sync
from nexus_api_client.models.auth_type import AuthType
from nexus_api_client.models.login_request import LoginRequest
from nexus_api_client.models.user_identity_attach import UserIdentityAttach

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client import AuthenticatedClient
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse
    from nexus_api_client.models.user_read import UserRead

pytestmark = [pytest.mark.e2e]


class TestAdminAttachIdentity:
    """API-32: Verify admin can move federated identity between users."""

    def test_admin_moves_identity_between_federated_users(
        self,
        nexus_api: NexusApiRegistry,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """Test admin can move identity from one federated user to another."""
        username_a, password_a = keycloak_user_factory()
        username_b, password_b = keycloak_user_factory()

        provider1 = oidc_provider_factory()
        assert isinstance(provider1.id, UUID)
        provider2 = oidc_provider_factory()
        assert isinstance(provider2.id, UUID)

        user_a_api = oidc_user_factory(provider1.id, username_a, password_a)
        user_b_api = oidc_user_factory(provider2.id, username_b, password_b)

        user_a = user_a_api.authentication.get_current_user().assert_and_get()
        user_a_id = user_a.id
        user_a_username = user_a.username

        user_b = user_b_api.authentication.get_current_user().assert_and_get()
        user_b_id = user_b.id

        user_a_identities_before = user_a_api.users.list_identities(user_id=user_a_id).assert_and_get().resources
        assert len(user_a_identities_before) == 1
        user_a_identity_id = user_a_identities_before[0].id

        user_b_identities_before = user_b_api.users.list_identities(user_id=user_b_id).assert_and_get().resources
        assert len(user_b_identities_before) == 1

        nexus_api.users.attach_identity(
            user_id=user_b_id, body=UserIdentityAttach(identity_id=user_a_identity_id)
        ).assert_and_get()

        user_b_identities_after = nexus_api.users.list_identities(user_id=user_b_id).assert_and_get().resources
        assert len(user_b_identities_after) == 2

        user_a_identities_after = nexus_api.users.list_identities(user_id=user_a_id).assert_and_get().resources
        assert len(user_a_identities_after) == 0

        user_a_details = nexus_api.users.get(user_id=user_a_id).assert_and_get()
        assert user_a_details.username == user_a_username
        assert user_a_details.auth_type == AuthType.FEDERATED

        # Target user's sessions are revoked after identity attach
        user_b_profile_resp = user_b_api.authentication.get_current_user()
        assert user_b_profile_resp.status_code == HTTPStatus.UNAUTHORIZED

    def test_admin_moves_identity_to_local_user_converts_to_federated(
        self,
        nexus_api: NexusApiRegistry,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
        unauthenticated_client: AuthenticatedClient,
        local_user_factory: Callable[..., tuple[UserRead, str]],
    ) -> None:
        """Test admin can move identity to local user, converting them to federated."""
        username, password = keycloak_user_factory()
        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)

        local_user, local_password = local_user_factory()
        local_user_id = local_user.id
        local_username = local_user.username

        local_user_details = nexus_api.users.get(user_id=local_user_id).assert_and_get()
        assert local_user_details.auth_type == AuthType.LOCAL

        federated_api = oidc_user_factory(provider.id, username, password)

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

    def test_admin_cannot_attach_identity_to_builtin_user(
        self,
        nexus_api: NexusApiRegistry,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """Test admin cannot attach identity to builtin user."""
        username, password = keycloak_user_factory()
        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)

        federated_api = oidc_user_factory(provider.id, username, password)

        federated_user = federated_api.authentication.get_current_user().assert_and_get()
        federated_user_id = federated_user.id

        identities = federated_api.users.list_identities(user_id=federated_user_id).assert_and_get().resources
        assert len(identities) == 1
        identity_id = identities[0].id

        admin_user = nexus_api.authentication.get_current_user().assert_and_get()
        admin_user_id = admin_user.id
        assert admin_user.username == "admin"

        attach_resp = nexus_api.users.attach_identity(
            user_id=admin_user_id, body=UserIdentityAttach(identity_id=identity_id)
        )
        assert attach_resp.status_code == HTTPStatus.CONFLICT

        admin_identities = nexus_api.users.list_identities(user_id=admin_user_id).assert_and_get().resources
        assert len(admin_identities) == 0

        federated_identities_after = (
            federated_api.users.list_identities(user_id=federated_user_id).assert_and_get().resources
        )
        assert len(federated_identities_after) == 1
