"""groups API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import (
    add_member,
    create_group,
    create_group_role_assignment,
    delete_group,
    delete_group_role_assignment,
    get_group,
    list_group_role_assignments,
    list_groups,
    list_members,
    remove_member,
    update_group,
)


class GroupsApi:
    """Registry for groups API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_groups.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_groups.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_group.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_group.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_group.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_group.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        return delete_group.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        return await delete_group.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        return update_group.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        return await update_group.asyncio_detailed(client=self._client, **kwargs)

    def list_members(self, **kwargs: Any) -> Response[Any]:
        return list_members.sync_detailed(client=self._client, **kwargs)

    async def async_list_members(self, **kwargs: Any) -> Response[Any]:
        return await list_members.asyncio_detailed(client=self._client, **kwargs)

    def add_member(self, **kwargs: Any) -> Response[Any]:
        return add_member.sync_detailed(client=self._client, **kwargs)

    async def async_add_member(self, **kwargs: Any) -> Response[Any]:
        return await add_member.asyncio_detailed(client=self._client, **kwargs)

    def remove_member(self, **kwargs: Any) -> Response[Any]:
        return remove_member.sync_detailed(client=self._client, **kwargs)

    async def async_remove_member(self, **kwargs: Any) -> Response[Any]:
        return await remove_member.asyncio_detailed(client=self._client, **kwargs)

    def list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        return list_group_role_assignments.sync_detailed(client=self._client, **kwargs)

    async def async_list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        return await list_group_role_assignments.asyncio_detailed(client=self._client, **kwargs)

    def create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return create_group_role_assignment.sync_detailed(client=self._client, **kwargs)

    async def async_create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return await create_group_role_assignment.asyncio_detailed(client=self._client, **kwargs)

    def delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return delete_group_role_assignment.sync_detailed(client=self._client, **kwargs)

    async def async_delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return await delete_group_role_assignment.asyncio_detailed(client=self._client, **kwargs)
