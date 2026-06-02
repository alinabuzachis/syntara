"""TC-1.12: Credentials Manager persona — project-scoped credential CRUD."""

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

pytestmark = pytest.mark.e2e

# Policies that define the "credentials manager" persona
_POLICIES = [
    "credential:create:project",
    "credential:read:project",
    "credential:update:project",
    "credential:delete:project",
]


@pytest.fixture(scope="module")
def credentials_manager_env(admin_api: NexusApiRegistry, nexus_base_url: str) -> Generator[Any, None, None]:
    """Create project, user, role, assignment and return the user's API."""
    tracker = ResourceTracker(admin_api)

    user_id, name, password = tracker.user("credmgr")
    project_id, _ = tracker.project("credmgr")

    role_name = create_project_role(admin_api, project_id, "credmgr", _POLICIES)
    assign_role_to_user(admin_api, project_id, user_id, role_name)

    user_api = api_for(nexus_base_url, name, password)
    yield user_api, project_id
    tracker.cleanup()


class TestCredentialsManagerAllowed:
    """Positive: credential CRUD within the project."""

    def test_create_and_list_credential(self, credentials_manager_env, admin_api: NexusApiRegistry):
        user_api, project_id = credentials_manager_env
        cred_name = unique_name("e2e-rbac-cred-credmgr")
        type_id = get_bearer_token_type_id(admin_api)
        resp = user_api.credentials.create(
            body=CredentialCreate(
                name=cred_name,
                credential_type_id=type_id,
                project_id=project_id,
                inputs=CredentialCreateInputs.from_dict({"token": f"test-{cred_name}"}),
            ),
        )
        cred = resp.assert_and_get()
        assert cred.id is not None

        cred_list = user_api.credentials.list().assert_and_get()
        listed_names = [str(c.name) for c in cred_list.resources]
        assert cred_name in listed_names


class TestCredentialsManagerDenied:
    """Negative: actions outside the credential scope."""

    def test_cannot_create_workflow(self, credentials_manager_env):
        user_api, project_id = credentials_manager_env
        resp = user_api.workflows.create(
            body=WorkflowCreate(
                name="should-fail",
                workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
                project_id=project_id,
            ),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN
