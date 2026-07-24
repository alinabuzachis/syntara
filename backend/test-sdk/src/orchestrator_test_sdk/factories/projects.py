"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.project_create import ProjectCreate
from nexus_api_client.models.project_role_create import ProjectRoleCreate
from nexus_api_client.models.role_assignment_create import RoleAssignmentCreate

from orchestrator_test_sdk.e2e import unique_name

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry


class ProjectFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(
        self, api: NexusApiRegistry, prefix: str | None = None, name: str | None = None
    ) -> tuple[UUID, str]: ...


@pytest.fixture(scope="module")
def create_project() -> Generator[ProjectFactory, None, None]:
    """Create test projects. Returns ``(project_id, name)``.

    Tracks every project created during the module and deletes them all on teardown.
    Project deletion cascades to roles, role-assignments, and other child resources.
    """
    created: list[tuple[NexusApiRegistry, UUID]] = []

    def _create_project(api: NexusApiRegistry, prefix: str | None = None, name: str | None = None) -> tuple[UUID, str]:
        name = name or unique_name(f"e2e-rbac-{prefix or 'test'}")
        resp = api.projects.create(body=ProjectCreate(name=name))
        project = resp.assert_and_get()
        project_id = UUID(str(project.id))
        created.append((api, project_id))
        return project_id, str(project.name)

    yield _create_project

    for api, project_id in reversed(created):
        try:
            api.projects.delete(project_id=project_id)
        except Exception:
            pass


class ProjectRoleFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(
        self,
        api: NexusApiRegistry,
        project_id: UUID,
        prefix: str,
        policies: list[str],
    ) -> str: ...


@pytest.fixture(scope="module")
def create_project_role() -> Generator[ProjectRoleFactory, None, None]:
    """Create a project-scoped role. Returns the generated role name."""
    created: list[tuple[NexusApiRegistry, UUID, UUID]] = []

    def _create_project_role(api: NexusApiRegistry, project_id: UUID, prefix: str, policies: list[str]) -> str:
        name = unique_name(f"e2e-{prefix}")
        resp = api.projects.create_role(
            project_id=project_id,
            body=ProjectRoleCreate(name=name, policies=policies),
        )
        role = resp.assert_and_get()
        created.append((api, project_id, role.id))
        return name

    yield _create_project_role

    for api, project_id, role_id in created:
        try:
            api.projects.delete_role(project_id=project_id, role_id=role_id)
        except Exception:
            pass


class AssignProjectRoleFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(
        self,
        api: NexusApiRegistry,
        project_id: UUID,
        user_or_group_id: UUID,
        role_name: str,
    ) -> UUID: ...


@pytest.fixture(scope="module")
def assign_project_role_to_user() -> Generator[AssignProjectRoleFactory, None, None]:
    """Assign a project-scoped role to a user. Returns the assignment id."""
    created: list[tuple[NexusApiRegistry, UUID, UUID]] = []

    def _assign(api: NexusApiRegistry, project_id: UUID, user_or_group_id: UUID, role_name: str) -> UUID:
        resp = api.projects.create_role_assignment(
            project_id=project_id,
            body=RoleAssignmentCreate(
                principal_id=user_or_group_id,
                role_name=role_name,
            ),
        )
        assignment = resp.assert_and_get()
        assignment_id = UUID(str(assignment.id))
        created.append((api, project_id, assignment_id))
        return assignment_id

    yield _assign

    for api, project_id, assignment_id in created:
        try:
            api.projects.delete_role_assignment(project_id=project_id, assignment_id=assignment_id)
        except Exception:
            pass


@pytest.fixture(scope="module")
def assign_project_role_to_group() -> Generator[AssignProjectRoleFactory, None, None]:
    """Assign a project-scoped role to a group. Returns the assignment id."""
    created: list[tuple[NexusApiRegistry, UUID, UUID]] = []

    def _assign(api: NexusApiRegistry, project_id: UUID, user_or_group_id: UUID, role_name: str) -> UUID:
        resp = api.projects.create_role_assignment(
            project_id=project_id,
            body=RoleAssignmentCreate(
                group_id=user_or_group_id,
                role_name=role_name,
            ),
        )
        assignment = resp.assert_and_get()
        assignment_id = UUID(str(assignment.id))
        created.append((api, project_id, assignment_id))
        return assignment_id

    yield _assign

    for api, project_id, assignment_id in created:
        try:
            api.projects.delete_role_assignment(project_id=project_id, assignment_id=assignment_id)
        except Exception:
            pass
