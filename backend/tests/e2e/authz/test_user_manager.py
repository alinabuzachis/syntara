"""TC-1.18: User Manager persona — global user create/read/update."""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from nexus_api_client.models.role_create import RoleCreate
from nexus_api_client.models.sub_resource_role_assignment_create import SubResourceRoleAssignmentCreate
from nexus_api_client.models.user_create import UserCreate
from nexus_api_client.models.user_update import UserUpdate

from tests.e2e.conftest import api_for, generate_test_password
from tests.e2e.fixtures.factories import (
    ResourceTracker,
    assign_system_role,
    create_system_role,
)

pytestmark = [pytest.mark.e2e]

_POLICIES = [
    "user:create:any",
    "user:read:any",
    "user:update:any",
]


@pytest.fixture(scope="module")
def user_manager_env(admin_api: NexusApiRegistry, nexus_base_url: str) -> Generator[Any, None, None]:
    """Create user with system-level user manager role."""
    tracker = ResourceTracker(admin_api)

    user_id, name, password = tracker.user("usermgr")

    role_name = create_system_role(admin_api, "usermgr", _POLICIES)
    assign_system_role(admin_api, user_id, role_name)

    user_api = api_for(nexus_base_url, name, password)
    yield user_api, user_id
    tracker.cleanup()


class TestUserManagerAllowed:
    """Positive: create, list, and update users."""

    def test_create_user(self, user_manager_env):
        from uuid import uuid4

        user_api, _user_id = user_manager_env
        suffix = uuid4().hex[:6]
        resp = user_api.users.create(
            body=UserCreate(
                username=f"e2e-rbac-usermgr-{suffix}",
                email=f"usermgr-{suffix}@example.com",
                first_name="Target User",
                password=generate_test_password(),
            ),
        )
        assert resp.status_code in (HTTPStatus.OK, HTTPStatus.CREATED), (
            f"Expected user creation to succeed, got {resp.status_code}"
        )
        created_user = resp.parsed
        assert created_user is not None

        # Store for later tests
        TestUserManagerAllowed._created_user_id = str(created_user.id)

    def test_list_users(self, user_manager_env):
        user_api, _user_id = user_manager_env
        user_api.users.list().assert_and_get()

    def test_update_user_first_name(self, user_manager_env):
        user_api, _user_id = user_manager_env
        target_id = getattr(TestUserManagerAllowed, "_created_user_id", None)
        if target_id is None:
            pytest.skip("Depends on test_create_user having run first")

        user_api.users.update(
            user_id=target_id,
            body=UserUpdate(first_name="Updated Name"),
        ).assert_and_get()


class TestUserManagerDenied:
    """Negative: cannot create system roles or assign roles."""

    def test_cannot_create_system_role(self, user_manager_env):
        user_api, _user_id = user_manager_env
        resp = user_api.roles.create(
            body=RoleCreate(name="should-fail-role", policies=["workflow:read:any"]),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_cannot_assign_role_to_user(self, user_manager_env):
        user_api, _user_id = user_manager_env
        target_id = getattr(TestUserManagerAllowed, "_created_user_id", None)
        if target_id is None:
            pytest.skip("Depends on test_create_user having run first")

        resp = user_api.users.create_role_assignment(
            user_id=target_id,
            body=SubResourceRoleAssignmentCreate(role_name="admin"),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN
