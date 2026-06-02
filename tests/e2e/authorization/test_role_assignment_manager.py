"""TC-1.17: Role Assignment Manager persona — assign/revoke project roles."""

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
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from nexus_api_client.models.principal_type import PrincipalType
from nexus_api_client.models.role_assignment_create import RoleAssignmentCreate
from nexus_api_client.models.sub_resource_role_assignment_create import SubResourceRoleAssignmentCreate
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.e2e.conftest import api_for
from tests.e2e.fixtures.constants import MINIMAL_WORKFLOW_DEFINITION
from tests.e2e.fixtures.factories import (
    ResourceTracker,
    assign_role_to_user,
    create_project_role,
)

pytestmark = pytest.mark.e2e

_POLICIES = [
    "role-assignment:assign:project",
    "role-assignment:read:project",
    "role-assignment:revoke:project",
]


@pytest.fixture(scope="module")
def role_assignment_manager_env(admin_api: NexusApiRegistry, nexus_base_url: str) -> Generator[Any, None, None]:
    """Create project, manager user, target user, and a role to assign."""
    tracker = ResourceTracker(admin_api)

    project_id, _ = tracker.project("rolemgr")

    # Manager user — can assign/revoke roles in the project
    mgr_id, mgr_name, mgr_pass = tracker.user("rolemgr")

    mgr_role = create_project_role(admin_api, project_id, "rolemgr", _POLICIES)
    assign_role_to_user(admin_api, project_id, mgr_id, mgr_role)
    mgr_api = api_for(nexus_base_url, mgr_name, mgr_pass)

    # Target user — will receive/lose the "project-user" built-in role
    target_id, target_name, target_pass = tracker.user("roletgt")

    yield mgr_api, project_id, mgr_id, target_id, nexus_base_url, target_name, target_pass
    tracker.cleanup()


class TestRoleAssignmentManagerAllowed:
    """Positive: assign, list, and revoke project roles."""

    def test_assign_list_revoke_cycle(self, role_assignment_manager_env):
        mgr_api, project_id, _mgr_id, target_id, base_url, target_user, target_pass = role_assignment_manager_env

        # 1. Assign "project-user" to target
        assign_resp = mgr_api.projects.create_role_assignment(
            project_id=project_id,
            body=RoleAssignmentCreate(
                principal_type=PrincipalType.USER,
                principal_id=target_id,
                role_name="project-user",
            ),
        )
        assert assign_resp.status_code in (HTTPStatus.OK, HTTPStatus.CREATED), (
            f"Expected assignment to succeed, got {assign_resp.status_code}"
        )
        assignment = assign_resp.parsed
        assignment_id = UUID(str(assignment.id))

        # 2. List assignments — should include the one we just created
        list_resp = mgr_api.projects.list_role_assignments(project_id=project_id)
        assert list_resp.status_code == HTTPStatus.OK
        ids = [str(a.id) for a in list_resp.parsed.resources]
        assert str(assignment_id) in ids

        # 3. Target user should now have access (can list workflows in project)
        target_api = api_for(base_url, target_user, target_pass)
        wf_resp = target_api.projects.list_workflows(project_id=project_id)
        assert wf_resp.status_code == HTTPStatus.OK

        # 4. Revoke the assignment
        del_resp = mgr_api.projects.delete_role_assignment(
            project_id=project_id,
            assignment_id=assignment_id,
        )
        assert del_resp.status_code in (HTTPStatus.NO_CONTENT, HTTPStatus.OK)

        # 5. Target user should lose access
        target_api2 = api_for(base_url, target_user, target_pass)
        wf_resp2 = target_api2.projects.list_workflows(project_id=project_id)
        assert wf_resp2.status_code == HTTPStatus.FORBIDDEN


class TestRoleAssignmentManagerDenied:
    """Negative: cannot assign system roles or create workflows."""

    def test_cannot_assign_system_role(self, role_assignment_manager_env):
        mgr_api, _project_id, _mgr_id, target_id, _base_url, _tu, _tp = role_assignment_manager_env
        resp = mgr_api.users.create_role_assignment(
            user_id=target_id,
            body=SubResourceRoleAssignmentCreate(role_name="admin"),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_cannot_create_workflow(self, role_assignment_manager_env):
        mgr_api, project_id, *_ = role_assignment_manager_env
        resp = mgr_api.workflows.create(
            body=WorkflowCreate(
                name="should-fail",
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=project_id,
            ),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN
