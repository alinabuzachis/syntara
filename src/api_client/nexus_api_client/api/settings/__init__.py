"""settings API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class SettingsApi:
    """Registry for settings API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_settings")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_settings")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def bulk_update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("bulk_update_settings")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_bulk_update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("bulk_update_settings")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_categories(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_categories")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_categories(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_categories")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_setting")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_setting")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_setting")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_setting")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
