"""TC-1.13: Workflow Manager persona — project-scoped workflow CRUD."""

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

from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.e2e.conftest import api_for, unique_name
from tests.e2e.fixtures.constants import MINIMAL_WORKFLOW_DEFINITION
from tests.e2e.fixtures.factories import (
    ResourceTracker,
    assign_role_to_user,
    create_project_role,
    get_bearer_token_type_id,
)

pytestmark = [pytest.mark.e2e]

_POLICIES = [
    "workflow:create:project",
    "workflow:read:project",
    "workflow:update:project",
    "workflow:delete:project",
]


@pytest.fixture(scope="module")
def workflow_manager_env(admin_api: NexusApiRegistry, nexus_base_url: str) -> Generator[Any, None, None]:
    """Create project, user, role, assignment and return the user's API."""
    tracker = ResourceTracker(admin_api)

    user_id, name, password = tracker.user("wfmgr")
    project_id, _ = tracker.project("wfmgr")

    role_name = create_project_role(admin_api, project_id, "wfmgr", _POLICIES)
    assign_role_to_user(admin_api, project_id, user_id, role_name)

    user_api = api_for(nexus_base_url, name, password)
    yield user_api, project_id
    tracker.cleanup()


class TestWorkflowManagerAllowed:
    """Positive: workflow CRUD within the project."""

    def test_create_workflow(self, workflow_manager_env):
        user_api, project_id = workflow_manager_env
        wf_name = unique_name("e2e-rbac-wf-wfmgr")
        resp = user_api.workflows.create(
            body=WorkflowCreate(
                name=wf_name,
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=project_id,
            ),
        )
        wf = resp.assert_and_get()
        assert wf.id is not None
        assert str(wf.name).startswith("e2e-rbac-wf-")

    def test_list_workflows(self, workflow_manager_env):
        user_api, project_id = workflow_manager_env
        resp = user_api.projects.list_workflows(project_id=project_id)
        assert resp.status_code == HTTPStatus.OK


class TestWorkflowManagerDenied:
    """Negative: actions outside the workflow scope."""

    def test_cannot_create_credential(self, workflow_manager_env, admin_api: NexusApiRegistry):
        user_api, project_id = workflow_manager_env
        # Fetch a valid credential type id via admin so the failure is purely authz
        type_id = get_bearer_token_type_id(admin_api)

        resp = user_api.credentials.create(
            body=CredentialCreate(
                name="should-fail",
                credential_type_id=type_id,
                project_id=project_id,
                inputs=CredentialCreateInputs.from_dict({"token": "nope"}),
            ),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN
