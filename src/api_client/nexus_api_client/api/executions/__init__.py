"""executions API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import create_execution, get_execution, list_execution_activities, list_executions, signal_activity


class ExecutionsApi:
    """Registry for executions API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_executions.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_executions.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_execution.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_execution.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_execution.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_execution.asyncio_detailed(client=self._client, **kwargs)

    def list_activities(self, **kwargs: Any) -> Response[Any]:
        return list_execution_activities.sync_detailed(client=self._client, **kwargs)

    async def async_list_activities(self, **kwargs: Any) -> Response[Any]:
        return await list_execution_activities.asyncio_detailed(client=self._client, **kwargs)

    def signal_activity(self, **kwargs: Any) -> Response[Any]:
        return signal_activity.sync_detailed(client=self._client, **kwargs)

    async def async_signal_activity(self, **kwargs: Any) -> Response[Any]:
        return await signal_activity.asyncio_detailed(client=self._client, **kwargs)
