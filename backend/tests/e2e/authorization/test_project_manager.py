"""TC-1.16: Project Manager persona -- global project create/read."""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING, Any
from uuid import UUID

import pytest

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set -- full stack required", allow_module_level=True)

from nexus_api_client.models.project_create import ProjectCreate
from nexus_api_client.models.role_create import RoleCreate
from nexus_api_client.models.user_create import UserCreate

from tests.e2e.conftest import api_for, generate_test_password, unique_name
from tests.e2e.fixtures.factories import (
    ResourceTracker,
    assign_system_role,
    create_system_role,
)

pytestmark = pytest.mark.e2e

_POLICIES = [
    "project:create:any",
    "project:read:any",
]


@pytest.fixture(scope="module")
def project_manager_env(admin_api: NexusApiRegistry, nexus_base_url: str) -> Generator[Any, None, None]:
    """Create user with system-level project manager role."""
    tracker = ResourceTracker(admin_api)

    user_id, name, password = tracker.user("projmgr")

    role_name = create_system_role(admin_api, "projmgr", _POLICIES)
    assign_system_role(admin_api, user_id, role_name)
    user_api = api_for(nexus_base_url, name, password)
    yield user_api, user_id
    tracker.cleanup()


class TestProjectManagerAllowed:
    """Positive: create and list projects."""

    def test_create_project(self, project_manager_env):
        user_api, _user_id = project_manager_env
        resp = user_api.projects.create(body=ProjectCreate(name=unique_name("e2e-rbac-projmgr-new")))
        project = resp.assert_and_get()
        project_id = UUID(str(project.id))
        project_name = str(project.name)
        assert project_id is not None
        assert project_name.startswith("e2e-rbac-")

    def test_list_projects(self, project_manager_env):
        user_api, _user_id = project_manager_env
        resp = user_api.projects.list()
        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None


class TestProjectManagerDenied:
    """Negative: cannot create users or system roles."""

    def test_cannot_create_user(self, project_manager_env):
        user_api, _user_id = project_manager_env
        resp = user_api.users.create(
            body=UserCreate(
                username="should-fail-user",
                email="fail@example.com",
                first_name="Should Fail",
                password=generate_test_password(),
            ),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_cannot_create_system_role(self, project_manager_env):
        user_api, _user_id = project_manager_env
        resp = user_api.roles.create(
            body=RoleCreate(name="should-fail-role", policies=["workflow:read:any"]),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN
