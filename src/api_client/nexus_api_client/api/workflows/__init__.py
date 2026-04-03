"""workflows API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient, Client
from ...types import Response
from . import (
    create_workflow_api_v1_workflows_post,
    delete_workflow_api_v1_workflows_workflow_id_delete,
    get_workflow_api_v1_workflows_workflow_id_get,
    get_workflow_version_api_v1_workflows_workflow_id_versions_version_get,
    list_workflow_versions_api_v1_workflows_workflow_id_versions_get,
    list_workflows_api_v1_workflows_get,
    update_workflow_api_v1_workflows_workflow_id_patch,
)


class WorkflowsApi:
    """Registry for workflows API endpoints."""

    def __init__(self, client: Client | AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_workflows_api_v1_workflows_get.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_workflows_api_v1_workflows_get.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_workflow_api_v1_workflows_post.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_workflow_api_v1_workflows_post.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_workflow_api_v1_workflows_workflow_id_get.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_workflow_api_v1_workflows_workflow_id_get.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        return delete_workflow_api_v1_workflows_workflow_id_delete.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        return await delete_workflow_api_v1_workflows_workflow_id_delete.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        return update_workflow_api_v1_workflows_workflow_id_patch.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        return await update_workflow_api_v1_workflows_workflow_id_patch.asyncio_detailed(client=self._client, **kwargs)

    def list_versions(self, **kwargs: Any) -> Response[Any]:
        return list_workflow_versions_api_v1_workflows_workflow_id_versions_get.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_list_versions(self, **kwargs: Any) -> Response[Any]:
        return await list_workflow_versions_api_v1_workflows_workflow_id_versions_get.asyncio_detailed(
            client=self._client, **kwargs
        )

    def get_version(self, **kwargs: Any) -> Response[Any]:
        return get_workflow_version_api_v1_workflows_workflow_id_versions_version_get.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_get_version(self, **kwargs: Any) -> Response[Any]:
        return await get_workflow_version_api_v1_workflows_workflow_id_versions_version_get.asyncio_detailed(
            client=self._client, **kwargs
        )
