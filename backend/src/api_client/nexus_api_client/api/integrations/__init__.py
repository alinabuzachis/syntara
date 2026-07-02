"""integrations API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class IntegrationsApi:
    """Registry for integrations API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_integrations")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_integrations")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_integration")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_integration")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_integration")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_integration")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_integration")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_integration")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_integration")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_integration")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def discover_connection(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("discover_integration_connection")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_discover_connection(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("discover_integration_connection")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def update_status(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_integration_status")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_update_status(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_integration_status")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def validate(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("validate_integration")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_validate(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("validate_integration")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def refresh_resources(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("refresh_resources")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_refresh_resources(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("refresh_resources")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_models(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_integration_models")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_models(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_integration_models")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_model(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_integration_model")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_model(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_integration_model")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def update_model(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_integration_model")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_update_model(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_integration_model")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def bulk_update_models(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("bulk_update_integration_models")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_bulk_update_models(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("bulk_update_integration_models")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
