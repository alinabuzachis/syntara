"""authorization API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class AuthorizationApi:
    """Registry for authorization API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def can_i(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("can_i")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_can_i(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("can_i")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def who_can(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("who_can")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_who_can(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("who_can")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def what_can_i(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("what_can_i")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_what_can_i(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("what_can_i")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_resource_actions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_resource_actions")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_resource_actions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_resource_actions")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def validate_name(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("validate_name")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_validate_name(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("validate_name")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
