"""example API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import create_example, delete_example, get_example, get_example_by_id, update_example


class ExampleApi:
    """Registry for example API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_example.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_example.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_example.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_example.asyncio_detailed(client=self._client, **kwargs)

    def get_by_id(self, **kwargs: Any) -> Response[Any]:
        return get_example_by_id.sync_detailed(client=self._client, **kwargs)

    async def async_get_by_id(self, **kwargs: Any) -> Response[Any]:
        return await get_example_by_id.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        return update_example.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        return await update_example.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        return delete_example.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        return await delete_example.asyncio_detailed(client=self._client, **kwargs)
