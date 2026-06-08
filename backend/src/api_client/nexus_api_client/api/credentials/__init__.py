"""credentials API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class CredentialsApi:
    """Registry for credentials API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_credentials")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_credentials")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_credential")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("create_credential")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_credential")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_credential")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_credential")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("delete_credential")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_credential")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("update_credential")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_workflows(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_credential_workflows")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_workflows(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_credential_workflows")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_types(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_credential_types")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_types(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_credential_types")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_type(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_credential_type")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_type(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_credential_type")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
