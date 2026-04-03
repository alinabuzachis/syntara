"""default API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient, Client
from ...types import Response
from . import (
    create_example_api_v1_example_post,
    delete_example_api_v1_example_item_id_delete,
    get_example_api_v1_example_get,
    get_example_by_id_api_v1_example_item_id_get,
    update_example_api_v1_example_item_id_put,
)


class DefaultApi:
    """Registry for default API endpoints."""

    def __init__(self, client: Client | AuthenticatedClient) -> None:
        self._client = client

    def get_example(self, **kwargs: Any) -> Response[Any]:
        return get_example_api_v1_example_get.sync_detailed(client=self._client, **kwargs)

    async def async_get_example(self, **kwargs: Any) -> Response[Any]:
        return await get_example_api_v1_example_get.asyncio_detailed(client=self._client, **kwargs)

    def create_example(self, **kwargs: Any) -> Response[Any]:
        return create_example_api_v1_example_post.sync_detailed(client=self._client, **kwargs)

    async def async_create_example(self, **kwargs: Any) -> Response[Any]:
        return await create_example_api_v1_example_post.asyncio_detailed(client=self._client, **kwargs)

    def get_example_by_id(self, **kwargs: Any) -> Response[Any]:
        return get_example_by_id_api_v1_example_item_id_get.sync_detailed(client=self._client, **kwargs)

    async def async_get_example_by_id(self, **kwargs: Any) -> Response[Any]:
        return await get_example_by_id_api_v1_example_item_id_get.asyncio_detailed(client=self._client, **kwargs)

    def update_example(self, **kwargs: Any) -> Response[Any]:
        return update_example_api_v1_example_item_id_put.sync_detailed(client=self._client, **kwargs)

    async def async_update_example(self, **kwargs: Any) -> Response[Any]:
        return await update_example_api_v1_example_item_id_put.asyncio_detailed(client=self._client, **kwargs)

    def delete_example(self, **kwargs: Any) -> Response[Any]:
        return delete_example_api_v1_example_item_id_delete.sync_detailed(client=self._client, **kwargs)

    async def async_delete_example(self, **kwargs: Any) -> Response[Any]:
        return await delete_example_api_v1_example_item_id_delete.asyncio_detailed(client=self._client, **kwargs)
