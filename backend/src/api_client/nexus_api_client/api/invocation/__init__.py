"""invocation API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class InvocationApi:
    """Registry for invocation API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def lists(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_invocations")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_lists(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_invocations")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_invocation")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_invocation")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create_chat(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_invocation_chat")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create_chat(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_invocation_chat")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_invocation")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_invocation")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_trace(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_invocation_trace")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_trace(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_invocation_trace")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def cancel(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("cancel_invocation")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_cancel(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("cancel_invocation")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
