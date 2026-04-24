"""workflows API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import (
    create_workflow,
    delete_workflow,
    get_workflow,
    get_workflow_version,
    list_workflow_versions,
    list_workflows,
    update_workflow,
)


class WorkflowsApi:
    """Registry for workflows API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_workflows.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_workflows.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_workflow.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_workflow.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_workflow.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_workflow.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        return delete_workflow.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        return await delete_workflow.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        return update_workflow.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        return await update_workflow.asyncio_detailed(client=self._client, **kwargs)

    def list_versions(self, **kwargs: Any) -> Response[Any]:
        return list_workflow_versions.sync_detailed(client=self._client, **kwargs)

    async def async_list_versions(self, **kwargs: Any) -> Response[Any]:
        return await list_workflow_versions.asyncio_detailed(client=self._client, **kwargs)

    def get_version(self, **kwargs: Any) -> Response[Any]:
        return get_workflow_version.sync_detailed(client=self._client, **kwargs)

    async def async_get_version(self, **kwargs: Any) -> Response[Any]:
        return await get_workflow_version.asyncio_detailed(client=self._client, **kwargs)
