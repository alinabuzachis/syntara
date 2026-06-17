"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.group_create import GroupCreate
from nexus_api_client.models.group_member_add import GroupMemberAdd

from tests.e2e.conftest import unique_name

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry


class GroupFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(
        self, api: NexusApiRegistry, prefix: str | None = None, group_name: str | None = None
    ) -> tuple[UUID, str]: ...


@pytest.fixture(scope="module")
def create_group() -> Generator[GroupFactory, None, None]:
    """Create test users. Returns ``(user_id, username, password)``."""
    created_group_id = None
    test_api = None

    def _create_group(
        api: NexusApiRegistry, prefix: str | None = None, group_name: str | None = None
    ) -> tuple[UUID, str]:
        """Create a test group. Returns ``(group_id, name)``."""
        prefix = prefix or "test"
        name = group_name or unique_name(f"e2e-rbac-{prefix}")
        resp = api.groups.create(body=GroupCreate(name=name))
        group = resp.assert_and_get()
        nonlocal created_group_id, test_api
        test_api = api
        created_group_id = UUID(str(group.id))
        return created_group_id, str(group.name)

    yield _create_group

    # delete user
    if created_group_id is not None and test_api is not None:
        try:
            test_api.groups.delete(group_id=created_group_id)
        except Exception:
            pass  # Best effort cleanup


def add_to_group(api: NexusApiRegistry, group_id: UUID, user_id: UUID) -> None:
    """Add a user to a group."""
    resp = api.groups.add_member(group_id=group_id, body=GroupMemberAdd(user_id=user_id))
    assert resp.status_code == HTTPStatus.CREATED


def remove_from_group(api: NexusApiRegistry, group_id: UUID, user_id: UUID) -> None:
    """Remove a user from a group."""
    resp = api.groups.remove_member(group_id=group_id, user_id=user_id)
    assert resp.status_code in (HTTPStatus.NO_CONTENT, HTTPStatus.NOT_FOUND)
