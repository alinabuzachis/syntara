"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.principal_type import PrincipalType
from nexus_api_client.models.project_create import ProjectCreate
from nexus_api_client.models.project_role_create import ProjectRoleCreate
from nexus_api_client.models.role_assignment_create import RoleAssignmentCreate

from tests.e2e.conftest import unique_name

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry


class ProjectFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(self, api: NexusApiRegistry, prefix: str) -> tuple[UUID, str]: ...


@pytest.fixture(scope="module")
def create_project() -> Generator[ProjectFactory, None, None]:
    """Create a test project. Returns ``(project_id, name)``."""
    created_project_id = None
    test_api = None

    def _create_project(api: NexusApiRegistry, prefix: str) -> tuple[UUID, str]:
        name = unique_name(f"e2e-rbac-{prefix}")
        resp = api.projects.create(body=ProjectCreate(name=name))
        project = resp.assert_and_get()
        nonlocal created_project_id, test_api
        test_api = api
        created_project_id = UUID(str(project.id))
        return created_project_id, str(project.name)

    yield _create_project
    # cleanup resources
    if created_project_id is not None and test_api is not None:
        try:
            test_api.projects.delete(project_id=created_project_id)
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
    """Create a test project. Returns ``(project_id, name)``."""
    created_role_id = None
    src_project_id = None
    test_api = None

    def _create_project_role(api: NexusApiRegistry, project_id: UUID, prefix: str, policies: list[str]) -> str:
        name = unique_name(f"e2e-{prefix}")
        resp = api.projects.create_role(
            project_id=project_id,
            body=ProjectRoleCreate(name=name, policies=policies),
        )
        role = resp.assert_and_get()
        nonlocal created_role_id, src_project_id, test_api
        test_api = api
        created_role_id = role.id
        src_project_id = project_id
        return name

    yield _create_project_role
    # cleanup resources
    if created_role_id is not None and src_project_id is not None and test_api is not None:
        try:
            test_api.projects.delete_role(project_id=src_project_id, role_id=created_role_id)
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
    """Assign project role to user. Returns ``assignment_id``."""
    assignment_id = None
    test_project_id = None
    test_api = None

    def _assign_role_to_user(
        api: NexusApiRegistry,
        project_id: UUID,
        user_or_group_id: UUID,
        role_name: str,
    ) -> UUID:
        """Assign a project-scoped role to a user. Returns the assignment id."""
        resp = api.projects.create_role_assignment(
            project_id=project_id,
            body=RoleAssignmentCreate(
                principal_type=PrincipalType.USER,
                principal_id=user_or_group_id,
                role_name=role_name,
            ),
        )
        nonlocal test_api, assignment_id, test_project_id
        test_project_id = project_id
        assignment = resp.assert_and_get()
        assignment_id = UUID(str(assignment.id))
        test_api = api
        return assignment_id

    yield _assign_role_to_user

    # clean up
    if assignment_id is not None and test_api is not None and assignment_id is not None:
        try:
            test_api.projects.delete_role_assignment(project_id=test_project_id, assignment_id=assignment_id)
        except Exception:
            pass


@pytest.fixture(scope="module")
def assign_project_role_to_group() -> Generator[AssignProjectRoleFactory, None, None]:
    """Assign project role to user. Returns ``assignment_id``."""
    assignment_id = None
    test_project_id = None
    test_api = None

    def _assign_role_to_user(
        api: NexusApiRegistry,
        project_id: UUID,
        user_or_group_id: UUID,
        role_name: str,
    ) -> UUID:
        """Assign a project-scoped role to a user. Returns the assignment id."""
        resp = api.projects.create_role_assignment(
            project_id=project_id,
            body=RoleAssignmentCreate(
                principal_type=PrincipalType.GROUP,
                principal_id=user_or_group_id,
                role_name=role_name,
            ),
        )
        nonlocal test_api, assignment_id, test_project_id
        test_project_id = project_id
        assignment = resp.assert_and_get()
        assignment_id = UUID(str(assignment.id))
        test_api = api
        return assignment_id

    yield _assign_role_to_user

    # clean up
    if assignment_id is not None and test_api is not None and assignment_id is not None:
        try:
            test_api.projects.delete_role_assignment(project_id=test_project_id, assignment_id=assignment_id)
        except Exception:
            pass
