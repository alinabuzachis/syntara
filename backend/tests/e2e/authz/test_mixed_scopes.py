"""TC-1.6: Global read + project-scoped create -- scope boundary enforcement."""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set -- full stack required", allow_module_level=True)

from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.e2e.conftest import api_for, unique_name
from tests.e2e.fixtures.constants import MINIMAL_WORKFLOW_DEFINITION
from tests.e2e.fixtures.factories import (
    ResourceTracker,
    assign_role_to_user,
    assign_system_role,
    create_project_role,
    create_system_role,
)

pytestmark = [pytest.mark.e2e]

GLOBAL_READ_POLICIES = [
    "workflow:read:any",
    "credential:read:any",
    "project:read:any",
]

PROJECT_A_WRITE_POLICIES = [
    "workflow:create:project",
]


@pytest.fixture(scope="module")
def mixed_scopes_env(admin_api: NexusApiRegistry, nexus_base_url: str):
    """Two projects; user gets global read + project-a create."""
    tracker = ResourceTracker(admin_api)

    # Create projects
    proj_a_id, _ = tracker.project("tc16-a")
    proj_b_id, _ = tracker.project("tc16-b")

    # Seed workflows
    tracker.workflow(proj_a_id, "tc16a")
    tracker.workflow(proj_b_id, "tc16b")

    # Seed credentials
    tracker.credential(proj_a_id, "tc16a")
    tracker.credential(proj_b_id, "tc16b")

    # Global read role
    global_role = create_system_role(admin_api, "mixed-reader", GLOBAL_READ_POLICIES)

    # Project-a scoped create role
    create_role = create_project_role(admin_api, proj_a_id, "creator", PROJECT_A_WRITE_POLICIES)

    # User
    user_id, name, password = tracker.user("tc16")

    assign_system_role(admin_api, user_id, global_role)
    assign_role_to_user(admin_api, proj_a_id, user_id, create_role)

    user_api = api_for(nexus_base_url, name, password)
    yield {
        "proj_a_id": proj_a_id,
        "proj_b_id": proj_b_id,
        "user_api": user_api,
    }
    tracker.cleanup()


class TestMixedScopes:
    """Global read + project-scoped create -- scope boundary enforcement."""

    # -- Global read works in both projects ------------------------------------

    def test_read_workflows_project_a(self, mixed_scopes_env):
        """Global workflow:read permission allows reading workflows in project A."""
        workflows = (
            mixed_scopes_env["user_api"]
            .projects.list_workflows(project_id=mixed_scopes_env["proj_a_id"])
            .assert_and_get()
        )
        assert len(workflows.resources) >= 1

    def test_read_workflows_project_b(self, mixed_scopes_env):
        """Global workflow:read permission allows reading workflows in project B."""
        workflows = (
            mixed_scopes_env["user_api"]
            .projects.list_workflows(project_id=mixed_scopes_env["proj_b_id"])
            .assert_and_get()
        )
        assert len(workflows.resources) >= 1

    def test_read_credentials_project_a(self, mixed_scopes_env):
        """Global credential:read permission allows reading credentials across all projects."""
        credentials = mixed_scopes_env["user_api"].credentials.list().assert_and_get()
        assert len(credentials.resources) >= 1

    def test_read_credentials_project_b(self, mixed_scopes_env):
        """Global credential:read permission allows reading credentials across all projects."""
        credentials = mixed_scopes_env["user_api"].credentials.list().assert_and_get()
        assert len(credentials.resources) >= 1

    # -- Create scoped to project-a only ---------------------------------------

    def test_create_workflow_project_a_allowed(self, mixed_scopes_env):
        """Project-scoped workflow:create permission allows creating workflows in project A."""
        mixed_scopes_env["user_api"].workflows.create(
            body=WorkflowCreate(
                name=unique_name("mixed-ok"),
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=mixed_scopes_env["proj_a_id"],
            ),
        ).assert_and_get()

    def test_create_workflow_project_b_forbidden(self, mixed_scopes_env):
        """Project-scoped workflow:create permission denies creating workflows in project B."""
        resp = mixed_scopes_env["user_api"].workflows.create(
            body=WorkflowCreate(
                name=unique_name("mixed-deny"),
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=mixed_scopes_env["proj_b_id"],
            ),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN
