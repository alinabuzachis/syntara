"""users API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import (
    create_user,
    create_user_role_assignment,
    delete_user,
    delete_user_role_assignment,
    get_user,
    list_user_groups,
    list_user_role_assignments,
    list_users,
    set_user_groups,
    update_user,
)


class UsersApi:
    """Registry for users API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_users.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_users.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_user.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_user.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_user.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_user.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        return delete_user.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        return await delete_user.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        return update_user.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        return await update_user.asyncio_detailed(client=self._client, **kwargs)

    def list_groups(self, **kwargs: Any) -> Response[Any]:
        return list_user_groups.sync_detailed(client=self._client, **kwargs)

    async def async_list_groups(self, **kwargs: Any) -> Response[Any]:
        return await list_user_groups.asyncio_detailed(client=self._client, **kwargs)

    def set_groups(self, **kwargs: Any) -> Response[Any]:
        return set_user_groups.sync_detailed(client=self._client, **kwargs)

    async def async_set_groups(self, **kwargs: Any) -> Response[Any]:
        return await set_user_groups.asyncio_detailed(client=self._client, **kwargs)

    def list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        return list_user_role_assignments.sync_detailed(client=self._client, **kwargs)

    async def async_list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        return await list_user_role_assignments.asyncio_detailed(client=self._client, **kwargs)

    def create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return create_user_role_assignment.sync_detailed(client=self._client, **kwargs)

    async def async_create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return await create_user_role_assignment.asyncio_detailed(client=self._client, **kwargs)

    def delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return delete_user_role_assignment.sync_detailed(client=self._client, **kwargs)

    async def async_delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        return await delete_user_role_assignment.asyncio_detailed(client=self._client, **kwargs)
