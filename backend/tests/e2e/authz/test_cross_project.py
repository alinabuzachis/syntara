"""TC-1.7: Cross-project isolation — roles on one project do not leak to another."""

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
    assign_role_to_user,
    create_project,
    create_project_role,
    create_user,
    create_workflow,
)

pytestmark = [pytest.mark.e2e]


class TestCrossProjectIsolation:
    """User with different roles on two projects gets correct access on each."""

    def test_writer_on_alpha_reader_on_beta(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
    ) -> None:
        # -- setup --
        alpha_id, _ = create_project(admin_api, "alpha")
        beta_id, _ = create_project(admin_api, "beta")
        user_id, user_name, user_pass = create_user(admin_api, "cross")

        # Writer role: read + create workflows
        writer_role = create_project_role(
            admin_api,
            alpha_id,
            "writer",
            ["workflow:read:project", "workflow:create:project"],
        )
        assign_role_to_user(admin_api, alpha_id, user_id, writer_role)

        # Reader role: read-only workflows
        reader_role = create_project_role(
            admin_api,
            beta_id,
            "reader",
            ["workflow:read:project"],
        )
        assign_role_to_user(admin_api, beta_id, user_id, reader_role)

        # Seed a workflow in each project so reads return data
        create_workflow(admin_api, alpha_id, "alpha-seed")
        create_workflow(admin_api, beta_id, "beta-seed")

        user_api = api_for(nexus_base_url, user_name, user_pass)

        # -- can read workflows in alpha --
        user_api.projects.list_workflows(project_id=alpha_id).assert_successful()

        # -- can create workflow in alpha --
        user_api.workflows.create(
            body=WorkflowCreate(
                name=unique_name("cross-alpha"),
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=alpha_id,
            ),
        ).assert_successful()

        # -- can read workflows in beta --
        user_api.projects.list_workflows(project_id=beta_id).assert_successful()

        # -- cannot create workflow in beta --
        resp_beta_create = user_api.workflows.create(
            body=WorkflowCreate(
                name=unique_name("cross-beta"),
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=beta_id,
            ),
        )
        assert resp_beta_create.status_code == HTTPStatus.FORBIDDEN
