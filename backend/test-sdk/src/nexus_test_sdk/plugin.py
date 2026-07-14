"""Pytest plugin entry point — registers all Nexus factory fixtures and E2E hooks."""

pytest_plugins = [
    "nexus_test_sdk.e2e.hooks",
    "nexus_test_sdk.e2e.factories",
    # app/_hooks.py: logging setup, performance marker, worker_id, cleanup
    "nexus_test_sdk.app._hooks",
    # app submodules — each registers its own fixtures as a pytest plugin
    "nexus_test_sdk.app.database",
    "nexus_test_sdk.app.client",
    "nexus_test_sdk.app.users",
    "nexus_test_sdk.app.groups",
    "nexus_test_sdk.app.temporal",
    "nexus_test_sdk.app.tools",
    "nexus_test_sdk.app.workflows",
    "nexus_test_sdk.app.jwt",
    "nexus_test_sdk.app.mocks",
    "nexus_test_sdk.app.settings",
    "nexus_test_sdk.app.live",
]

from nexus_test_sdk.factories.credentials import create_credential, get_bearer_token_type_id
from nexus_test_sdk.factories.groups import add_to_group, create_group, remove_from_group
from nexus_test_sdk.factories.identity_providers import identity_provider_factory
from nexus_test_sdk.factories.policies import create_policy
from nexus_test_sdk.factories.projects import (
    assign_project_role_to_group,
    assign_project_role_to_user,
    create_project,
    create_project_role,
)
from nexus_test_sdk.factories.roles import create_role
from nexus_test_sdk.factories.users import assign_system_role, create_user
from nexus_test_sdk.factories.workflows import create_workflow

__all__ = [
    "add_to_group",
    "assign_project_role_to_group",
    "assign_project_role_to_user",
    "assign_system_role",
    "create_credential",
    "create_group",
    "create_policy",
    "create_project",
    "create_project_role",
    "create_role",
    "create_user",
    "create_workflow",
    "get_bearer_token_type_id",
    "identity_provider_factory",
    "remove_from_group",
]
