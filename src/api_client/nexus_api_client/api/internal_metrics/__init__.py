"""internal_metrics API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import (
    get_internal_metrics_component_kpis,
    get_internal_metrics_kpis,
    get_internal_metrics_records,
    get_internal_metrics_summary,
    reset_internal_metrics_store,
)


class InternalMetricsApi:
    """Registry for internal_metrics API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def get_summary(self, **kwargs: Any) -> Response[Any]:
        return get_internal_metrics_summary.sync_detailed(client=self._client, **kwargs)

    async def async_get_summary(self, **kwargs: Any) -> Response[Any]:
        return await get_internal_metrics_summary.asyncio_detailed(client=self._client, **kwargs)

    def get_records(self, **kwargs: Any) -> Response[Any]:
        return get_internal_metrics_records.sync_detailed(client=self._client, **kwargs)

    async def async_get_records(self, **kwargs: Any) -> Response[Any]:
        return await get_internal_metrics_records.asyncio_detailed(client=self._client, **kwargs)

    def get_kpis(self, **kwargs: Any) -> Response[Any]:
        return get_internal_metrics_kpis.sync_detailed(client=self._client, **kwargs)

    async def async_get_kpis(self, **kwargs: Any) -> Response[Any]:
        return await get_internal_metrics_kpis.asyncio_detailed(client=self._client, **kwargs)

    def get_component_kpis(self, **kwargs: Any) -> Response[Any]:
        return get_internal_metrics_component_kpis.sync_detailed(client=self._client, **kwargs)

    async def async_get_component_kpis(self, **kwargs: Any) -> Response[Any]:
        return await get_internal_metrics_component_kpis.asyncio_detailed(client=self._client, **kwargs)

    def reset_store(self, **kwargs: Any) -> Response[Any]:
        return reset_internal_metrics_store.sync_detailed(client=self._client, **kwargs)

    async def async_reset_store(self, **kwargs: Any) -> Response[Any]:
        return await reset_internal_metrics_store.asyncio_detailed(client=self._client, **kwargs)
