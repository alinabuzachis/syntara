"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.sub_resource_role_assignment_create import SubResourceRoleAssignmentCreate
from nexus_api_client.models.user_create import UserCreate

from nexus_test_sdk.helpers import generate_test_password, unique_name

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry


class UserFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(
        self,
        api: NexusApiRegistry,
        prefix: str | None = None,
        user_name: str | None = None,
        email: str | None = None,
        first_name: str | None = None,
        password: str | None = None,
    ) -> tuple[UUID, str, str]: ...


@pytest.fixture(scope="module")
def create_user() -> Generator[UserFactory, None, None]:
    """Create test users. Returns ``(user_id, username, password)``."""
    created: list[tuple[NexusApiRegistry, UUID]] = []

    def _create_user(
        api: NexusApiRegistry,
        prefix: str | None = None,
        user_name: str | None = None,
        email: str | None = None,
        first_name: str | None = None,
        password: str | None = None,
    ) -> tuple[UUID, str, str]:
        prefix = prefix or "test"
        name = user_name or unique_name(f"e2e-rbac-{prefix}")
        password = password or generate_test_password()
        resp = api.users.create(
            body=UserCreate(
                username=name,
                email=email or f"{name}@example.com",
                first_name=first_name or f"RBAC Test {prefix}",
                password=password,
            ),
        )
        user = resp.assert_and_get()
        user_id = UUID(str(user.id))
        created.append((api, user_id))
        return user_id, name, password

    yield _create_user

    for api, user_id in reversed(created):
        try:
            api.users.delete(user_id=user_id)
        except Exception:
            pass


class UserRoleAssignmentFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(self, api: NexusApiRegistry, user_id: UUID, role_name: str) -> UUID: ...


@pytest.fixture(scope="module")
def assign_system_role() -> Generator[UserRoleAssignmentFactory, None, None]:
    """Assign a system-scoped role to a user. Returns the assignment id."""
    created: list[tuple[NexusApiRegistry, UUID, UUID]] = []

    def _create_user_role_assignment(api: NexusApiRegistry, user_id: UUID, role_name: str) -> UUID:
        resp = api.users.create_role_assignment(
            user_id=user_id,
            body=SubResourceRoleAssignmentCreate(role_name=role_name),
        )
        assert resp.status_code == HTTPStatus.CREATED
        assignment = resp.assert_and_get()
        assignment_id = UUID(str(assignment.id))
        created.append((api, user_id, assignment_id))
        return assignment_id

    yield _create_user_role_assignment

    for api, user_id, assignment_id in created:
        try:
            api.users.delete_role_assignment(user_id=user_id, assignment_id=assignment_id)
        except Exception:
            pass
