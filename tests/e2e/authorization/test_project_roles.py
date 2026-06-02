"""TC-1.1: Project-scoped custom role grants read-only access."""

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

from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.e2e.conftest import api_for
from tests.e2e.fixtures.constants import MINIMAL_WORKFLOW_DEFINITION
from tests.e2e.fixtures.factories import (
    ResourceTracker,
    assign_role_to_user,
    create_project_role,
)

pytestmark = pytest.mark.e2e

READ_ONLY_POLICIES = [
    "workflow:read:project",
    "credential:read:project",
    "execution:read:project",
]


@pytest.fixture(scope="module")
def project_roles_env(admin_api: NexusApiRegistry, nexus_base_url: str) -> Generator[Any, None, None]:
    """Create project, role, user, resources, and assign role."""
    tracker = ResourceTracker(admin_api)

    user_id, name, password = tracker.user("tc11")
    project_id, _ = tracker.project("tc11-proj")

    # Create role and assign
    role_name = create_project_role(admin_api, project_id, "reader", READ_ONLY_POLICIES)
    assignment_id = assign_role_to_user(admin_api, project_id, user_id, role_name)

    # Seed a workflow and credential
    tracker.workflow(project_id, "tc11")
    tracker.credential(project_id, "tc11")

    limited_api = api_for(nexus_base_url, name, password)
    yield {
        "project_id": project_id,
        "role_name": role_name,
        "user_id": user_id,
        "assignment_id": assignment_id,
        "limited_api": limited_api,
        "admin_api": admin_api,
    }
    tracker.cleanup()


class TestProjectRoles:
    """TC-1.1: Project-scoped custom role grants read-only access."""

    # -- Read access granted by custom role ------------------------------------

    def test_can_read_workflows(self, project_roles_env):
        resp = project_roles_env["limited_api"].projects.list_workflows(
            project_id=project_roles_env["project_id"],
        )
        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        assert len(resp.parsed.resources) >= 1

    def test_can_read_credentials(self, project_roles_env):
        resp = project_roles_env["limited_api"].credentials.list()
        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        assert len(resp.parsed.resources) >= 1

    # -- Write access denied ---------------------------------------------------

    def test_cannot_create_workflow(self, project_roles_env):
        resp = project_roles_env["limited_api"].workflows.create(
            body=WorkflowCreate(
                name="should-fail",
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=project_roles_env["project_id"],
            ),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    # -- Role appears in project role/assignment listings -----------------------

    def test_role_listed_in_roles(self, project_roles_env):
        resp = project_roles_env["admin_api"].roles.list()
        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        role_names = [r.name for r in resp.parsed.resources]
        assert project_roles_env["role_name"] in role_names

    def test_assignment_listed_in_project(self, project_roles_env):
        resp = project_roles_env["admin_api"].projects.list_role_assignments(
            project_id=project_roles_env["project_id"],
        )
        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        assignment_ids = [str(a.id) for a in resp.parsed.resources]
        assert str(project_roles_env["assignment_id"]) in assignment_ids
