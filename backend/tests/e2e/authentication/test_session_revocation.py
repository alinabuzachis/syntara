"""E2E tests for user-scoped session revocation (ANSTRAT-1844, API-37).

All assertions use public REST APIs (``nexus_api_client`` and ``/api/v1/auth/*``).
No admin CLI, subprocess, or direct calls into application Python modules.

API mapping:
- API-37: ``PATCH /users/{user_id}`` with ``is_enabled=false`` or ``password`` (revokes all user sessions)
- API-38: ``test_session_revocation_idp.py`` (``DELETE /identity_providers/{provider_id}``)
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest
from nexus_api_client.models.user_create import UserCreate
from nexus_api_client.models.user_update import UserUpdate

from tests.e2e.conftest import (
    assert_refresh_succeeds,
    assert_refresh_unauthorized,
    generate_test_password,
    local_login_session,
    unique_name,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = [pytest.mark.e2e]


class TestAPIUserScopedSessionRevocation:
    """API-37: Revoking all sessions for one user does not affect other users."""

    def test_disable_user_revokes_all_sessions(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """PATCH user with is_enabled=false must invalidate every refresh session for that user."""
        username = unique_name("e2e-revoke")
        password = generate_test_password()
        other_username = unique_name("e2e-other")
        other_password = generate_test_password()

        user_resp = nexus_api.users.create(
            body=UserCreate(
                username=username,
                email=f"{username}@example.com",
                first_name="Revoke",
                last_name="Target",
                password=password,
            ),
        )
        assert user_resp.status_code == HTTPStatus.CREATED
        assert user_resp.parsed is not None
        user_id = user_resp.parsed.id

        other_resp = nexus_api.users.create(
            body=UserCreate(
                username=other_username,
                email=f"{other_username}@example.com",
                first_name="Other",
                last_name="User",
                password=other_password,
            ),
        )
        assert other_resp.status_code == HTTPStatus.CREATED

        try:
            _, cookies_a1 = local_login_session(nexus_base_url, username, password)
            _, cookies_a2 = local_login_session(nexus_base_url, username, password)
            _, cookies_other = local_login_session(nexus_base_url, other_username, other_password)

            assert_refresh_succeeds(nexus_base_url, cookies_a1)
            assert_refresh_succeeds(nexus_base_url, cookies_a2)

            disable_resp = nexus_api.users.update(
                user_id=user_id,
                body=UserUpdate(is_enabled=False),
            )
            assert disable_resp.status_code == HTTPStatus.OK

            assert_refresh_unauthorized(nexus_base_url, cookies_a1)
            assert_refresh_unauthorized(nexus_base_url, cookies_a2)
            assert_refresh_succeeds(nexus_base_url, cookies_other)
        finally:
            nexus_api.users.delete(user_id=user_id)
            if other_resp.parsed is not None:
                nexus_api.users.delete(user_id=other_resp.parsed.id)

    def test_password_change_revokes_all_sessions(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """PATCH user with a new password must invalidate existing refresh sessions."""
        username = unique_name("e2e-pwd-revoke")
        password = generate_test_password()
        new_password = generate_test_password()

        user_resp = nexus_api.users.create(
            body=UserCreate(
                username=username,
                email=f"{username}@example.com",
                first_name="Password",
                last_name="Revoke Target",
                password=password,
            ),
        )
        assert user_resp.status_code == HTTPStatus.CREATED
        assert user_resp.parsed is not None
        user_id = user_resp.parsed.id

        try:
            _, cookies_before = local_login_session(nexus_base_url, username, password)
            assert_refresh_succeeds(nexus_base_url, cookies_before)

            update_resp = nexus_api.users.update(
                user_id=user_id,
                body=UserUpdate(password=new_password),
            )
            assert update_resp.status_code == HTTPStatus.OK

            assert_refresh_unauthorized(nexus_base_url, cookies_before)

            _, cookies_after = local_login_session(nexus_base_url, username, new_password)
            assert_refresh_succeeds(nexus_base_url, cookies_after)
        finally:
            nexus_api.users.delete(user_id=user_id)
