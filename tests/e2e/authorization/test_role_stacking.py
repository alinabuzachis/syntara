"""TC-1.8: Role stacking -- group role + direct role combine additively."""

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
    add_to_group,
    assign_role_to_group,
    assign_role_to_user,
    create_credential,
    create_group,
    create_project,
    create_project_role,
    create_user,
    create_workflow,
)

pytestmark = pytest.mark.e2e


class TestRoleStacking:
    """Group role grants workflow:read, direct role grants credential:read + workflow:create.

    Together the user can do all three; neither role alone covers everything.
    """

    def test_group_plus_direct_role_union(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
    ) -> None:
        # -- setup --
        proj_id, _ = create_project(admin_api, "stack")
        user_id, name, password = create_user(admin_api, "stack")
        group_id, _ = create_group(admin_api, "stack")
        add_to_group(admin_api, group_id, user_id)

        # Group role: workflow:read only
        group_role = create_project_role(
            admin_api,
            proj_id,
            "grp-reader",
            ["workflow:read:project"],
        )
        assign_role_to_group(admin_api, proj_id, group_id, group_role)

        # Direct role: credential:read + workflow:create
        direct_role = create_project_role(
            admin_api,
            proj_id,
            "direct-mixed",
            ["credential:read:project", "workflow:create:project"],
        )
        assign_role_to_user(admin_api, proj_id, user_id, direct_role)

        # Seed resources
        create_workflow(admin_api, proj_id, "stack-seed")
        create_credential(admin_api, proj_id, "stack-seed")

        user_api = api_for(nexus_base_url, name, password)

        # -- workflow:read (from group role) --
        resp = user_api.projects.list_workflows(project_id=proj_id)
        assert resp.status_code == HTTPStatus.OK

        # -- credential:read (from direct role) --
        resp = user_api.credentials.list()
        assert resp.status_code == HTTPStatus.OK

        # -- workflow:create (from direct role) --
        resp = user_api.workflows.create(
            body=WorkflowCreate(
                name=unique_name("stack"),
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=proj_id,
            ),
        )
        assert resp.status_code == HTTPStatus.CREATED

    def test_group_role_alone_insufficient(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
    ) -> None:
        """A user with only the group role cannot create workflows or read credentials."""
        proj_id, _ = create_project(admin_api, "stack-grp")
        user_id, name, password = create_user(admin_api, "stack-grp")
        group_id, _ = create_group(admin_api, "stack-grp")
        add_to_group(admin_api, group_id, user_id)

        group_role = create_project_role(
            admin_api,
            proj_id,
            "grp-only",
            ["workflow:read:project"],
        )
        assign_role_to_group(admin_api, proj_id, group_id, group_role)

        user_api = api_for(nexus_base_url, name, password)

        # Can read workflows
        assert user_api.projects.list_workflows(project_id=proj_id).status_code == HTTPStatus.OK

        # Cannot create workflows
        resp = user_api.workflows.create(
            body=WorkflowCreate(
                name="stack-grp-fail",
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=proj_id,
            ),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

        # Cannot read credentials (visibility-filtered -- returns empty, not 403)
        cred_id, _ = create_credential(admin_api, proj_id, "stack-grp-deny")
        cred_resp = user_api.credentials.list()
        assert cred_resp.is_success
        assert cred_resp.parsed is not None
        resource_ids = {str(r.id) for r in cred_resp.parsed.resources}
        assert str(cred_id) not in resource_ids, f"Group-only user should not see credential {cred_id}"

    def test_direct_role_alone_insufficient(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
    ) -> None:
        """A user with only the direct role cannot read workflows (only create)."""
        proj_id, _ = create_project(admin_api, "stack-dir")
        user_id, name, password = create_user(admin_api, "stack-dir")

        direct_role = create_project_role(
            admin_api,
            proj_id,
            "dir-only",
            ["credential:read:project", "workflow:create:project"],
        )
        assign_role_to_user(admin_api, proj_id, user_id, direct_role)

        user_api = api_for(nexus_base_url, name, password)

        # Cannot read workflows (no workflow:read:project)
        resp = user_api.projects.list_workflows(project_id=proj_id)
        assert resp.status_code == HTTPStatus.FORBIDDEN
