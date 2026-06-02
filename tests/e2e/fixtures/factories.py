"""Reusable factory helpers and pytest fixtures for E2E resource creation.

Provides three layers:

1. **Plain helper functions** — ``create_user``, ``create_project``, etc.
   Callable from any pytest scope; no automatic cleanup.

2. **ResourceTracker** — a plain class that wraps the helpers and tracks
   created IDs for batch cleanup.  Designed for module-scoped fixtures
   that cannot depend on function-scoped factory fixtures.

3. **Pytest factory fixtures** — function-scoped fixtures that yield a
   callable and clean up on teardown.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID

import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.group_create import GroupCreate
from nexus_api_client.models.group_member_add import GroupMemberAdd
from nexus_api_client.models.policy_create import PolicyCreate
from nexus_api_client.models.policy_statement_schema import PolicyStatementSchema
from nexus_api_client.models.principal_type import PrincipalType
from nexus_api_client.models.project_create import ProjectCreate
from nexus_api_client.models.project_role_create import ProjectRoleCreate
from nexus_api_client.models.role_assignment_create import RoleAssignmentCreate
from nexus_api_client.models.role_create import RoleCreate
from nexus_api_client.models.sub_resource_role_assignment_create import SubResourceRoleAssignmentCreate
from nexus_api_client.models.user_create import UserCreate
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.e2e.conftest import _admin_password, _login, generate_test_password, unique_name
from tests.e2e.fixtures.constants import MINIMAL_WORKFLOW_DEFINITION

if TYPE_CHECKING:
    from collections.abc import Generator


# ---------------------------------------------------------------------------
# Credential-type lookup
# ---------------------------------------------------------------------------


def get_bearer_token_type_id(api: NexusApiRegistry) -> UUID:
    """Return the credential type ID for 'HTTP Bearer Token'."""
    resp = api.credentials.list_types()
    assert resp.is_success
    assert resp.parsed is not None
    for ct in resp.parsed.resources:
        if ct.name == "HTTP Bearer Token":
            return UUID(str(ct.id))
    pytest.fail("Preseeded 'HTTP Bearer Token' credential type not found")


# ---------------------------------------------------------------------------
# Layer 1 — Plain helper functions
# ---------------------------------------------------------------------------


def create_user(api: NexusApiRegistry, prefix: str) -> tuple[UUID, str, str]:
    """Create a test user. Returns ``(user_id, username, password)``."""
    name = unique_name(f"e2e-rbac-{prefix}")
    password = generate_test_password()
    resp = api.users.create(
        body=UserCreate(
            username=name,
            email=f"{name}@example.com",
            first_name=f"RBAC Test {prefix}",
            password=password,
        ),
    )
    user = resp.assert_and_get()
    return UUID(str(user.id)), name, password


def create_project(api: NexusApiRegistry, prefix: str) -> tuple[UUID, str]:
    """Create a test project. Returns ``(project_id, name)``."""
    name = unique_name(f"e2e-rbac-{prefix}")
    resp = api.projects.create(body=ProjectCreate(name=name))
    project = resp.assert_and_get()
    return UUID(str(project.id)), str(project.name)


def create_group(api: NexusApiRegistry, prefix: str) -> tuple[UUID, str]:
    """Create a test group. Returns ``(group_id, name)``."""
    name = unique_name(f"e2e-rbac-{prefix}")
    resp = api.groups.create(body=GroupCreate(name=name))
    group = resp.assert_and_get()
    return UUID(str(group.id)), str(group.name)


def create_workflow(
    api: NexusApiRegistry,
    project_id: UUID,
    prefix: str,
) -> tuple[UUID, str]:
    """Create a minimal test workflow. Returns ``(workflow_id, name)``."""
    name = unique_name(f"e2e-rbac-wf-{prefix}")
    resp = api.workflows.create(
        body=WorkflowCreate(
            name=name,
            workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
            project_id=project_id,
        ),
    )
    wf = resp.assert_and_get()
    return UUID(str(wf.id)), str(wf.name)


def create_credential(
    api: NexusApiRegistry,
    project_id: UUID,
    prefix: str,
) -> tuple[UUID, str]:
    """Create an HTTP Bearer Token credential. Returns ``(credential_id, name)``."""
    name = unique_name(f"e2e-rbac-cred-{prefix}")
    type_id = get_bearer_token_type_id(api)
    resp = api.credentials.create(
        body=CredentialCreate(
            name=name,
            credential_type_id=type_id,
            project_id=project_id,
            inputs=CredentialCreateInputs.from_dict({"token": f"test-{name}"}),
        ),
    )
    cred = resp.assert_and_get()
    return UUID(str(cred.id)), str(cred.name)


# ---------------------------------------------------------------------------
# Layer 2 — ResourceTracker
# ---------------------------------------------------------------------------


class ResourceTracker:
    """Track created E2E resources for batch cleanup.

    Usage in a module-scoped fixture::

        @pytest.fixture(scope="module")
        def my_env(admin_api):
            tracker = ResourceTracker(admin_api)
            user_id, name, pw = tracker.user("alice")
            project_id, _ = tracker.project("proj")
            yield {"user_id": user_id, ...}
            tracker.cleanup()
    """

    def __init__(self, api: NexusApiRegistry) -> None:
        """Initialise tracker with an admin API registry."""
        self._api = api
        self._users: list[UUID] = []
        self._projects: list[UUID] = []
        self._groups: list[UUID] = []
        self._workflows: list[UUID] = []
        self._credentials: list[UUID] = []

    def user(self, prefix: str) -> tuple[UUID, str, str]:
        """Create a user and track it for cleanup."""
        uid, name, password = create_user(self._api, prefix)
        self._users.append(uid)
        return uid, name, password

    def project(self, prefix: str) -> tuple[UUID, str]:
        """Create a project and track it for cleanup."""
        pid, name = create_project(self._api, prefix)
        self._projects.append(pid)
        return pid, name

    def group(self, prefix: str) -> tuple[UUID, str]:
        """Create a group and track it for cleanup."""
        gid, name = create_group(self._api, prefix)
        self._groups.append(gid)
        return gid, name

    def workflow(self, project_id: UUID, prefix: str) -> tuple[UUID, str]:
        """Create a workflow and track it for cleanup."""
        wid, name = create_workflow(self._api, project_id, prefix)
        self._workflows.append(wid)
        return wid, name

    def credential(self, project_id: UUID, prefix: str) -> tuple[UUID, str]:
        """Create a credential and track it for cleanup."""
        cid, name = create_credential(self._api, project_id, prefix)
        self._credentials.append(cid)
        return cid, name

    def _delete_each(self, ids: list[UUID], delete_fn: object) -> None:
        """Best-effort delete a list of resources."""
        for rid in ids:
            try:
                delete_fn(rid)  # type: ignore[operator]
            except Exception:
                pass

    def cleanup(self) -> None:
        """Delete all tracked resources in reverse-dependency order."""
        self._delete_each(self._workflows, lambda rid: self._api.workflows.delete(workflow_id=rid))
        self._delete_each(self._credentials, lambda rid: self._api.credentials.delete(credential_id=rid))
        self._delete_each(self._groups, lambda rid: self._api.groups.delete(group_id=rid))
        self._delete_each(self._users, lambda rid: self._api.users.delete(user_id=rid))
        self._delete_each(self._projects, lambda rid: self._api.projects.delete(project_id=rid))


# ---------------------------------------------------------------------------
# Layer 3 — Pytest factory fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def user_factory(
    admin_api: NexusApiRegistry,
) -> Generator[object, None, None]:
    """Factory fixture that creates users with automatic cleanup."""
    tracker = ResourceTracker(admin_api)
    yield tracker.user
    tracker.cleanup()


@pytest.fixture
def project_factory(
    admin_api: NexusApiRegistry,
) -> Generator[object, None, None]:
    """Factory fixture that creates projects with automatic cleanup."""
    tracker = ResourceTracker(admin_api)
    yield tracker.project
    tracker.cleanup()


@pytest.fixture
def group_factory(
    admin_api: NexusApiRegistry,
) -> Generator[object, None, None]:
    """Factory fixture that creates groups with automatic cleanup."""
    tracker = ResourceTracker(admin_api)
    yield tracker.group
    tracker.cleanup()


@pytest.fixture
def authz_workflow_factory(
    admin_api: NexusApiRegistry,
) -> Generator[object, None, None]:
    """Factory fixture that creates workflows with automatic cleanup."""
    tracker = ResourceTracker(admin_api)
    yield tracker.workflow
    tracker.cleanup()


@pytest.fixture
def credential_factory(
    admin_api: NexusApiRegistry,
) -> Generator[object, None, None]:
    """Factory fixture that creates credentials with automatic cleanup."""
    tracker = ResourceTracker(admin_api)
    yield tracker.credential
    tracker.cleanup()


# ---------------------------------------------------------------------------
# Module-scoped admin fixture (fresh token per module — avoids 15-min expiry)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def admin_api(nexus_base_url: str) -> NexusApiRegistry:
    """Admin API registry with a fresh JWT per test module."""
    from tests.e2e.conftest import _make_client

    token = _login(nexus_base_url, "admin", _admin_password())
    return NexusApiRegistry(_make_client(nexus_base_url, token))


# ---------------------------------------------------------------------------
# Role helpers
# ---------------------------------------------------------------------------


def create_project_role(
    api: NexusApiRegistry,
    project_id: UUID,
    prefix: str,
    policies: list[str],
) -> str:
    """Create a project-scoped role. Returns the generated role name."""
    name = unique_name(f"e2e-{prefix}")
    resp = api.projects.create_role(
        project_id=project_id,
        body=ProjectRoleCreate(name=name, policies=policies),
    )
    resp.assert_and_get()
    return name


def create_system_role(
    api: NexusApiRegistry,
    prefix: str,
    policies: list[str],
) -> str:
    """Create a system-scoped role. Returns the generated role name."""
    name = unique_name(f"e2e-{prefix}")
    resp = api.roles.create(body=RoleCreate(name=name, policies=policies))
    resp.assert_and_get()
    return name


# ---------------------------------------------------------------------------
# Role assignment helpers
# ---------------------------------------------------------------------------


def assign_role_to_user(
    api: NexusApiRegistry,
    project_id: UUID,
    user_id: UUID,
    role_name: str,
) -> UUID:
    """Assign a project-scoped role to a user. Returns the assignment id."""
    resp = api.projects.create_role_assignment(
        project_id=project_id,
        body=RoleAssignmentCreate(
            principal_type=PrincipalType.USER,
            principal_id=user_id,
            role_name=role_name,
        ),
    )
    assignment = resp.assert_and_get()
    return UUID(str(assignment.id))


def assign_role_to_group(
    api: NexusApiRegistry,
    project_id: UUID,
    group_id: UUID,
    role_name: str,
) -> UUID:
    """Assign a project-scoped role to a group. Returns the assignment id."""
    resp = api.projects.create_role_assignment(
        project_id=project_id,
        body=RoleAssignmentCreate(
            principal_type=PrincipalType.GROUP,
            principal_id=group_id,
            role_name=role_name,
        ),
    )
    assignment = resp.assert_and_get()
    return UUID(str(assignment.id))


def assign_system_role(
    api: NexusApiRegistry,
    user_id: UUID,
    role_name: str,
) -> None:
    """Assign a system-scoped role to a user."""
    resp = api.users.create_role_assignment(
        user_id=user_id,
        body=SubResourceRoleAssignmentCreate(role_name=role_name),
    )
    assert resp.status_code == HTTPStatus.CREATED


def revoke_project_role(
    api: NexusApiRegistry,
    project_id: UUID,
    assignment_id: UUID,
) -> None:
    """Revoke a project-scoped role assignment."""
    resp = api.projects.delete_role_assignment(
        project_id=project_id,
        assignment_id=assignment_id,
    )
    assert resp.status_code in (HTTPStatus.NO_CONTENT, HTTPStatus.NOT_FOUND)


# ---------------------------------------------------------------------------
# Group membership helpers
# ---------------------------------------------------------------------------


def add_to_group(api: NexusApiRegistry, group_id: UUID, user_id: UUID) -> None:
    """Add a user to a group."""
    resp = api.groups.add_member(group_id=group_id, body=GroupMemberAdd(user_id=user_id))
    assert resp.status_code == HTTPStatus.CREATED


def remove_from_group(api: NexusApiRegistry, group_id: UUID, user_id: UUID) -> None:
    """Remove a user from a group."""
    resp = api.groups.remove_member(group_id=group_id, user_id=user_id)
    assert resp.status_code in (HTTPStatus.NO_CONTENT, HTTPStatus.NOT_FOUND)


# ---------------------------------------------------------------------------
# Deny policy helper
# ---------------------------------------------------------------------------


def create_deny_policy(
    api: NexusApiRegistry,
    project_id: UUID,
    prefix: str,
    actions: list[str],
) -> str:
    """Create a project-scoped deny policy. Returns the policy name."""
    name = unique_name(f"e2e-deny-{prefix}")
    resp = api.policies.create_policy(
        body=PolicyCreate(
            name=name,
            statements=[
                PolicyStatementSchema(
                    effect="deny",
                    actions=actions,
                    scope="project",
                ),
            ],
            project_id=project_id,
        ),
    )
    resp.assert_and_get()
    return name
