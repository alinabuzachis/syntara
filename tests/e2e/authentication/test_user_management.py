"""E2E tests for Build In Admin User Management (ANSTART-1844)."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest
from nexus_api_client.models.auth_type import AuthType
from nexus_api_client.models.user_update import UserUpdate

from tests.e2e.conftest import built_in_admin_login

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.user_info import UserInfo
    from nexus_api_client.models.user_read import UserRead

pytestmark = [pytest.mark.e2e]


class TestBuiltInAdminManagement:
    """API-16: Disable built-in admin user when Keycloak admin user exists."""

    """API-18: Enable built-in admin user using Keycloak IdP admin user."""

    def test_built_in_admin_keycloak_idp_disable_enable(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_nexus_api: NexusApiRegistry,
        nexus_admin_user: UserInfo,
        nexus_api_admin_group_id: UUID,
    ) -> None:
        """Disable built-in admin user when Keycloak admin user exists."""
        from tests.fixtures.external_services.keycloak import get_keycloak_nexus_admin_username

        """Login as built-in admin user"""
        assert nexus_admin_user.username == "admin"

        """Check for Keycloak admin user exists."""
        list_user_resp = nexus_api.users.list(username=get_keycloak_nexus_admin_username()).parsed
        assert list_user_resp is not None
        assert list_user_resp.resources is not None
        assert len(list_user_resp.resources) == 1
        keycloak_user: UserRead = list_user_resp.resources[0]
        assert keycloak_user.auth_type == AuthType.FEDERATED
        admins_group = nexus_api.groups.list_members(group_id=nexus_api_admin_group_id)
        assert admins_group.parsed is not None
        assert any(gm.id == keycloak_user.id for gm in admins_group.parsed.resources)

        try:
            """Disable built-in admin user."""
            update_resp = nexus_api.users.update(user_id=nexus_admin_user.id, body=UserUpdate(is_enabled=False))
            assert update_resp.status_code == HTTPStatus.OK
            assert update_resp.parsed is not None
            assert not update_resp.parsed.is_enabled

            """Login attempt with disabled built-in admin user."""
            login_attempt_resp = built_in_admin_login(base_url=nexus_base_url)
            assert login_attempt_resp.status_code == HTTPStatus.UNAUTHORIZED

            """Authenticate as Keycloak IdP admin user."""
            keycloak_user_resp = keycloak_nexus_api.authentication.get_current_user()
            assert keycloak_user_resp.status_code == HTTPStatus.OK
            assert keycloak_user_resp.parsed is not None
            assert keycloak_user_resp.parsed.username == get_keycloak_nexus_admin_username()
        finally:
            """Re-enable built-in admin user using Keycloak IdP."""
            enable_update_resp = keycloak_nexus_api.users.update(
                user_id=nexus_admin_user.id, body=UserUpdate(is_enabled=True)
            )
            assert enable_update_resp.status_code == HTTPStatus.OK
            assert enable_update_resp.parsed is not None
            assert enable_update_resp.parsed.is_enabled
