"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.group_create import GroupCreate
from nexus_api_client.models.group_member_add import GroupMemberAdd

from orchestrator_test_sdk.e2e import unique_name

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
    """Create a test group. Returns ``(group_id, name)``."""
    created: list[tuple[NexusApiRegistry, UUID]] = []

    def _create_group(
        api: NexusApiRegistry, prefix: str | None = None, group_name: str | None = None
    ) -> tuple[UUID, str]:
        prefix = prefix or "test"
        name = group_name or unique_name(f"e2e-rbac-{prefix}")
        resp = api.groups.create(body=GroupCreate(name=name))
        group = resp.assert_and_get()
        group_id = UUID(str(group.id))
        created.append((api, group_id))
        return group_id, str(group.name)

    yield _create_group

    for api, group_id in created:
        try:
            api.groups.delete(group_id=group_id)
        except Exception:
            pass


def add_to_group(api: NexusApiRegistry, group_id: UUID, user_id: UUID) -> None:
    """Add a user to a group."""
    resp = api.groups.add_member(group_id=group_id, body=GroupMemberAdd(user_id=user_id))
    assert resp.status_code == HTTPStatus.CREATED


def remove_from_group(api: NexusApiRegistry, group_id: UUID, user_id: UUID) -> None:
    """Remove a user from a group."""
    resp = api.groups.remove_member(group_id=group_id, user_id=user_id)
    assert resp.status_code in (HTTPStatus.NO_CONTENT, HTTPStatus.NOT_FOUND)
