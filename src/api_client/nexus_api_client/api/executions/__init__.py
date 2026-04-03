"""executions API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient, Client
from ...types import Response
from . import (
    create_execution_api_v1_executions_post,
    get_execution_api_v1_executions_execution_id_get,
    list_execution_activities_api_v1_executions_execution_id_activities_get,
    list_executions_api_v1_executions_get,
    signal_activity_api_v1_executions_execution_id_activities_activity_id_signal_post,
)


class ExecutionsApi:
    """Registry for executions API endpoints."""

    def __init__(self, client: Client | AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_executions_api_v1_executions_get.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_executions_api_v1_executions_get.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_execution_api_v1_executions_post.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_execution_api_v1_executions_post.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_execution_api_v1_executions_execution_id_get.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_execution_api_v1_executions_execution_id_get.asyncio_detailed(client=self._client, **kwargs)

    def list_activities(self, **kwargs: Any) -> Response[Any]:
        return list_execution_activities_api_v1_executions_execution_id_activities_get.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_list_activities(self, **kwargs: Any) -> Response[Any]:
        return await list_execution_activities_api_v1_executions_execution_id_activities_get.asyncio_detailed(
            client=self._client, **kwargs
        )

    def signal_activity(self, **kwargs: Any) -> Response[Any]:
        return signal_activity_api_v1_executions_execution_id_activities_activity_id_signal_post.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_signal_activity(self, **kwargs: Any) -> Response[Any]:
        return await signal_activity_api_v1_executions_execution_id_activities_activity_id_signal_post.asyncio_detailed(
            client=self._client, **kwargs
        )
