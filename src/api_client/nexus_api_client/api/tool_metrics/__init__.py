"""tool_metrics API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import get_tool_executions, get_tool_metrics


class ToolMetricsApi:
    """Registry for tool_metrics API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_tool_metrics.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_tool_metrics.asyncio_detailed(client=self._client, **kwargs)

    def get_tool_executions(self, **kwargs: Any) -> Response[Any]:
        return get_tool_executions.sync_detailed(client=self._client, **kwargs)

    async def async_get_tool_executions(self, **kwargs: Any) -> Response[Any]:
        return await get_tool_executions.asyncio_detailed(client=self._client, **kwargs)
