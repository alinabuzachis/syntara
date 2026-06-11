"""E2E tests for API-28: Self-Service Identity — Last Identity Block.

Verifies that the system prevents disconnecting a user's last remaining identity
to avoid account lockout scenarios.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID

import pytest

pytest.importorskip("external_services")

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse

pytestmark = [pytest.mark.e2e]


class TestLastIdentityBlock:
    """API-28: Self-Service Identity — Last Identity Block.

    Verify system prevents disconnecting last remaining identity to avoid account lockout scenarios.
    """

    def test_cannot_disconnect_last_identity_self_service(
        self,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """API-28: Test user cannot disconnect their only remaining identity via self-service."""
        username, password = keycloak_user_factory()
        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)

        user_api = oidc_user_factory(provider.id, username, password)

        current_user = user_api.authentication.get_current_user().assert_and_get()
        user_id = current_user.id

        identities = user_api.users.list_identities(user_id=user_id).assert_and_get().resources
        assert len(identities) == 1
        identity_id = identities[0].id

        disconnect_resp = user_api.users.detach_identity(
            user_id=user_id,
            identity_id=identity_id,
        )
        assert disconnect_resp.status_code == HTTPStatus.CONFLICT

        identities_after = user_api.users.list_identities(user_id=user_id).assert_and_get().resources
        assert len(identities_after) == 1
        assert identities_after[0].id == identity_id

        profile = user_api.authentication.get_current_user().assert_and_get()
        assert profile.id == user_id
