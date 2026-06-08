"""users API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class UsersApi:
    """Registry for users API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_users")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_users")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_user")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_user")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_user")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_user")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_user")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_user")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_user")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_user")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_groups(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_user_groups")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_groups(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_user_groups")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def set_groups(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("set_user_groups")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_set_groups(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("set_user_groups")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_identities(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_user_identities")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_identities(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_user_identities")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def attach_identity(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("attach_user_identity")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_attach_identity(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("attach_user_identity")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def detach_identity(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("detach_user_identity")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_detach_identity(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("detach_user_identity")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_user_role_assignments")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_role_assignments(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_user_role_assignments")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_user_role_assignment")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create_role_assignment(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_user_role_assignment")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_user_role_assignment")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_delete_role_assignment(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_user_role_assignment")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
