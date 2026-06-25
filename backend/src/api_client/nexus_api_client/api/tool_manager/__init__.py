"""tool_manager API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class ToolManagerApi:
    """Registry for tool_manager API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def get_tools(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_tools")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_tools(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_tools")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_tool(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_tool")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_tool(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_tool")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def patch_tool(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("patch_tool")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_patch_tool(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("patch_tool")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def bulk_update_tools(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("bulk_update_tools")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_bulk_update_tools(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("bulk_update_tools")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
