"""policies API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class PoliciesApi:
    """Registry for policies API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_policies")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_policies")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_policy")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_policy")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_policy")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_policy")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def replace_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("replace_policy")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_replace_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("replace_policy")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def delete_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_policy")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_delete_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_policy")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def update_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_policy")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_update_policy(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_policy")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
