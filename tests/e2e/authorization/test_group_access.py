"""TC-1.4: Group role + direct role stacking for two members."""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.e2e.conftest import api_for, unique_name
from tests.e2e.fixtures.constants import MINIMAL_WORKFLOW_DEFINITION
from tests.e2e.fixtures.factories import (
    ResourceTracker,
    add_to_group,
    assign_role_to_group,
    assign_role_to_user,
    create_project_role,
)

pytestmark = pytest.mark.e2e

READ_POLICIES = [
    "workflow:read:project",
    "credential:read:project",
]

WRITE_POLICIES = [
    "workflow:create:project",
    "workflow:update:project",
]


@pytest.fixture(scope="module")
def group_access_env(admin_api: NexusApiRegistry, nexus_base_url: str):
    """Create project, group, two users, and assign roles."""
    tracker = ResourceTracker(admin_api)

    # Create project
    project_id, _ = tracker.project("tc14")

    # Roles
    reader_role = create_project_role(admin_api, project_id, "grp-reader", READ_POLICIES)
    writer_role = create_project_role(admin_api, project_id, "grp-writer", WRITE_POLICIES)

    # Group
    group_id, _ = tracker.group("tc14-grp")

    # User 1 (group only)
    u1_id, u1_name, u1_pass = tracker.user("tc14-grponly")

    # User 2 (group + direct)
    u2_id, u2_name, u2_pass = tracker.user("tc14-grpdirect")

    # Both users in the group
    add_to_group(admin_api, group_id, u1_id)
    add_to_group(admin_api, group_id, u2_id)

    # Group gets read-only role
    assign_role_to_group(admin_api, project_id, group_id, reader_role)

    # User 2 additionally gets direct writer role
    assign_role_to_user(admin_api, project_id, u2_id, writer_role)

    # Seed a workflow for read tests
    tracker.workflow(project_id, "tc14")

    u1_api = api_for(nexus_base_url, u1_name, u1_pass)
    u2_api = api_for(nexus_base_url, u2_name, u2_pass)
    yield {
        "project_id": project_id,
        "u1_api": u1_api,
        "u2_api": u2_api,
    }
    tracker.cleanup()


class TestGroupAccess:
    """TC-1.4: Group role + direct role stacking for two members."""

    # -- User 1 (group only): read OK, create denied ---------------------------

    def test_group_only_can_read_workflows(self, group_access_env):
        resp = group_access_env["u1_api"].projects.list_workflows(
            project_id=group_access_env["project_id"],
        )
        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        assert len(resp.parsed.resources) >= 1

    def test_group_only_cannot_create_workflow(self, group_access_env):
        resp = group_access_env["u1_api"].workflows.create(
            body=WorkflowCreate(
                name="should-fail-grp",
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=group_access_env["project_id"],
            ),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    # -- User 2 (group + direct): read OK, create OK --------------------------

    def test_group_plus_direct_can_read_workflows(self, group_access_env):
        resp = group_access_env["u2_api"].projects.list_workflows(
            project_id=group_access_env["project_id"],
        )
        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        assert len(resp.parsed.resources) >= 1

    def test_group_plus_direct_can_create_workflow(self, group_access_env):
        resp = group_access_env["u2_api"].workflows.create(
            body=WorkflowCreate(
                name=unique_name("grp-direct"),
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=group_access_env["project_id"],
            ),
        )
        assert resp.status_code == HTTPStatus.CREATED
