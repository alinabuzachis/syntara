"""groups API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class GroupsApi:
    """Registry for groups API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_groups")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_groups")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_group")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_group")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_group")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_group")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_group")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_group")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_group")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_group")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_members(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_members")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_members(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_members")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def add_member(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("add_member")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_add_member(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("add_member")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def remove_member(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("remove_member")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_remove_member(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("remove_member")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_group_role_assignments")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_group_role_assignments")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_group_role_assignment")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_group_role_assignment")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_group_role_assignment")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_group_role_assignment")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
