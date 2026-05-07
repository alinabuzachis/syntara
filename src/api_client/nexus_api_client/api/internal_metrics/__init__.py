"""internal_metrics API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class InternalMetricsApi:
    """Registry for internal_metrics API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def get_summary(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_internal_metrics_summary")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_summary(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_internal_metrics_summary")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_records(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_internal_metrics_records")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_records(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_internal_metrics_records")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_kpis(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_internal_metrics_kpis")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_kpis(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_internal_metrics_kpis")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_component_kpis(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_internal_metrics_component_kpis")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_component_kpis(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_internal_metrics_component_kpis")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def reset_store(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("reset_internal_metrics_store")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_reset_store(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("reset_internal_metrics_store")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
