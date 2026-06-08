"""Shared E2E test fixtures — constants, factory helpers, and pytest fixtures."""

from tests.e2e.fixtures.constants import MINIMAL_WORKFLOW_DEFINITION
from tests.e2e.fixtures.factories import (
    ResourceTracker,
    add_to_group,
    assign_role_to_group,
    assign_role_to_user,
    assign_system_role,
    create_credential,
    create_deny_policy,
    create_group,
    create_project,
    create_project_role,
    create_system_role,
    create_user,
    create_workflow,
    get_bearer_token_type_id,
    remove_from_group,
    revoke_project_role,
)

__all__ = [
    "MINIMAL_WORKFLOW_DEFINITION",
    "ResourceTracker",
    "add_to_group",
    "assign_role_to_group",
    "assign_role_to_user",
    "assign_system_role",
    "create_credential",
    "create_deny_policy",
    "create_group",
    "create_project",
    "create_project_role",
    "create_system_role",
    "create_user",
    "create_workflow",
    "get_bearer_token_type_id",
    "remove_from_group",
    "revoke_project_role",
]
