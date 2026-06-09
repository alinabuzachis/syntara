"""TC-1.3: Manager with role-assignment permission can delegate access."""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from nexus_api_client.models.principal_type import PrincipalType
from nexus_api_client.models.role_assignment_create import RoleAssignmentCreate

from tests.e2e.conftest import api_for
from tests.e2e.fixtures.factories import (
    ResourceTracker,
    assign_role_to_user,
    create_project_role,
)

pytestmark = [pytest.mark.e2e]

MANAGER_POLICIES = [
    "role-assignment:assign:project",
    "role-assignment:read:project",
    "project:read:project",
]

VIEWER_POLICIES = [
    "workflow:read:project",
]


@pytest.fixture(scope="module")
def delegated_access_env(admin_api: NexusApiRegistry, nexus_base_url: str):
    """Create project, manager role, viewer role, manager user, newcomer user."""
    tracker = ResourceTracker(admin_api)

    # Create project
    project_id, _ = tracker.project("tc13")

    # Create the viewer role that the manager will assign
    viewer_role = create_project_role(admin_api, project_id, "viewer", VIEWER_POLICIES)

    # Create the manager role with delegation permissions
    manager_role = create_project_role(admin_api, project_id, "manager", MANAGER_POLICIES)

    # Create manager user
    mgr_id, mgr_name, mgr_pass = tracker.user("tc13-mgr")

    # Create newcomer user
    new_id, new_name, new_pass = tracker.user("tc13-new")

    # Assign manager role to manager user (admin does this)
    assign_role_to_user(admin_api, project_id, mgr_id, manager_role)

    # Seed a workflow for the newcomer to read later
    tracker.workflow(project_id, "tc13")

    mgr_api = api_for(nexus_base_url, mgr_name, mgr_pass)
    yield {
        "project_id": project_id,
        "viewer_role": viewer_role,
        "new_id": new_id,
        "new_user": new_name,
        "new_pass": new_pass,
        "mgr_api": mgr_api,
        "base_url": nexus_base_url,
    }
    tracker.cleanup()


class TestDelegatedAccess:
    """TC-1.3: Manager with role-assignment permission can delegate access."""

    # -- Manager delegates the viewer role to the newcomer ---------------------

    def test_manager_can_assign_role(self, delegated_access_env):
        resp = delegated_access_env["mgr_api"].projects.create_role_assignment(
            project_id=delegated_access_env["project_id"],
            body=RoleAssignmentCreate(
                principal_type=PrincipalType.USER,
                principal_id=delegated_access_env["new_id"],
                role_name=delegated_access_env["viewer_role"],
            ),
        )
        assert resp.status_code == HTTPStatus.CREATED

    def test_newcomer_can_read_workflows(self, delegated_access_env):
        # Manager must have already assigned the role (test ordering via module fixture)
        # Re-assign idempotently in case test_manager_can_assign_role is skipped
        delegated_access_env["mgr_api"].projects.create_role_assignment(
            project_id=delegated_access_env["project_id"],
            body=RoleAssignmentCreate(
                principal_type=PrincipalType.USER,
                principal_id=delegated_access_env["new_id"],
                role_name=delegated_access_env["viewer_role"],
            ),
        )
        newcomer_api = api_for(
            delegated_access_env["base_url"],
            delegated_access_env["new_user"],
            delegated_access_env["new_pass"],
        )
        workflows_list = newcomer_api.projects.list_workflows(
            project_id=delegated_access_env["project_id"]
        ).assert_and_get()
        assert len(workflows_list.resources) >= 1

    # -- Manager can list role assignments -------------------------------------

    def test_manager_can_list_assignments(self, delegated_access_env):
        assignments_list = (
            delegated_access_env["mgr_api"]
            .projects.list_role_assignments(
                project_id=delegated_access_env["project_id"],
            )
            .assert_and_get()
        )
        assert len(assignments_list.resources) >= 1
