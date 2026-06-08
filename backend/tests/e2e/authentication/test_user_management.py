"""E2E tests for Build In Admin User Management (ANSTART-1844)."""

from __future__ import annotations

import json
from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID

import pytest
from nexus_api_client.models.auth_type import AuthType
from nexus_api_client.models.user_update import UserUpdate

from tests.e2e.conftest import local_user_login

if TYPE_CHECKING:
    from collections.abc import Callable

    from click.testing import Result
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse
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
            updated_user = nexus_api.users.update(
                user_id=nexus_admin_user.id, body=UserUpdate(is_enabled=False)
            ).assert_and_get()
            assert not updated_user.is_enabled

            """Login attempt with disabled built-in admin user."""
            login_attempt_resp = local_user_login(base_url=nexus_base_url)
            assert login_attempt_resp.status_code == HTTPStatus.UNAUTHORIZED

            """Authenticate as Keycloak IdP admin user."""
            keycloak_curr_user = keycloak_nexus_api.authentication.get_current_user().assert_and_get()
            assert keycloak_curr_user.username == get_keycloak_nexus_admin_username()
        finally:
            """Re-enable built-in admin user using Keycloak IdP."""
            enabled_user = keycloak_nexus_api.users.update(
                user_id=nexus_admin_user.id, body=UserUpdate(is_enabled=True)
            ).assert_and_get()
            assert enabled_user.is_enabled


class TestUserManagementUsingCLI:
    """Test API-40: Re-enable Disabled Account Without Application Access."""

    def test_re_enable_disabled_local_account_without_application_access(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        ao_authenticated_cli: Callable[[list[str]], Result],
        local_user_factory: Callable[..., tuple[UserRead, str]],
    ) -> None:
        """Verify a disabled local user with no group memberships can be re-enabled via CLI."""
        user, password = local_user_factory()
        username = user.username
        user_id = user.id

        disabled_user = nexus_api.users.update(user_id=user_id, body=UserUpdate(is_enabled=False)).assert_and_get()
        assert disabled_user.is_enabled is False

        local_user_login(base_url=nexus_base_url, username=username, password=password).assert_error()

        enable_resp = ao_authenticated_cli(["users", "update", str(user_id), "--is-enabled", "true"])
        assert enable_resp.exit_code == 0

        output = json.loads(enable_resp.output)
        assert output["is_enabled"] is True

        login_attempt = local_user_login(base_url=nexus_base_url, username=username, password=password).assert_and_get()
        assert login_attempt.access_token is not None

    def test_re_enable_disabled_keycloak_account_without_application_access(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        ao_authenticated_cli: Callable[[list[str]], Result],
        nexus_api_admin_group_id: UUID,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_provider_factory: Callable[[], IdentityProviderResponse],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
    ) -> None:
        """Verify a disabled keycloak user with no group memberships can be re-enabled via CLI."""
        from tests.fixtures.external_services.oidc_login import assert_oidc_login_denied

        # Set up OIDC provider and Keycloak test user
        provider = oidc_provider_factory()
        assert isinstance(provider.id, UUID)
        kc_username, kc_password = keycloak_user_factory()
        kc_user_api = oidc_user_factory(provider.id, kc_username, kc_password)

        # Get Nexus user id
        current_user = kc_user_api.authentication.get_current_user().assert_and_get()
        user_id = current_user.id

        # Disable user
        disabled_user = nexus_api.users.update(user_id=user_id, body=UserUpdate(is_enabled=False)).assert_and_get()
        assert disabled_user.is_enabled is False

        # Verify OIDC login denied
        assert_oidc_login_denied(
            nexus_api=nexus_api,
            nexus_base_url=nexus_base_url,
            oidc_provider_id=provider.id,
            username=kc_username,
            password=kc_password,
        )

        # Re-enable via CLI
        enable_resp = ao_authenticated_cli(["users", "update", str(user_id), "--is-enabled", "true"])
        assert enable_resp.exit_code == 0

        output = json.loads(enable_resp.output)
        assert output["is_enabled"] is True

        kc_user_api_retry = oidc_user_factory(provider.id, kc_username, kc_password)
        kc_user_api_retry.authentication.get_current_user().assert_successful()
