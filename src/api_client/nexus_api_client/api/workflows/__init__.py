"""workflows API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class WorkflowsApi:
    """Registry for workflows API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_workflows")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_workflows")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_workflow")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_workflow")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_workflow")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_workflow")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_workflow")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_workflow")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_workflow")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_workflow")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def test_node(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("test_workflow_node")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_test_node(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("test_workflow_node")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_versions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_workflow_versions")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_versions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_workflow_versions")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_version(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_workflow_version")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_version(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_workflow_version")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
