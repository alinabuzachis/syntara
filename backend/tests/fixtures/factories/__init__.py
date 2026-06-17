"""Factory fixtures for E2E tests."""

from __future__ import annotations

from tests.fixtures.factories.credential_factories import CredentialFactory, get_bearer_token_type_id
from tests.fixtures.factories.group_factories import GroupFactory, add_to_group, remove_from_group
from tests.fixtures.factories.policy_factories import PolicyFactory
from tests.fixtures.factories.project_factories import (
    AssignProjectRoleFactory,
    ProjectFactory,
    ProjectRoleFactory,
)
from tests.fixtures.factories.role_factories import RoleFactory
from tests.fixtures.factories.user_factories import UserFactory, UserRoleAssignmentFactory
from tests.fixtures.factories.workflow_factories import WorkflowFactory

__all__ = [
    "AssignProjectRoleFactory",
    "CredentialFactory",
    "GroupFactory",
    "PolicyFactory",
    "ProjectFactory",
    "ProjectRoleFactory",
    "RoleFactory",
    "UserFactory",
    "UserRoleAssignmentFactory",
    "WorkflowFactory",
    "add_to_group",
    "get_bearer_token_type_id",
    "remove_from_group",
]
