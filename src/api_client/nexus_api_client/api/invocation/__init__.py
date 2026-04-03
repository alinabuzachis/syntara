"""invocation API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient, Client
from ...types import Response
from . import (
    cancel_invocation_api_v1_invocations_invocation_id_cancel_post,
    create_invocation_api_v1_invocations_post,
    get_invocation_api_v1_invocations_invocation_id_get,
    list_invocations_api_v1_invocations_get,
)


class InvocationApi:
    """Registry for invocation API endpoints."""

    def __init__(self, client: Client | AuthenticatedClient) -> None:
        self._client = client

    def lists(self, **kwargs: Any) -> Response[Any]:
        return list_invocations_api_v1_invocations_get.sync_detailed(client=self._client, **kwargs)

    async def async_lists(self, **kwargs: Any) -> Response[Any]:
        return await list_invocations_api_v1_invocations_get.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_invocation_api_v1_invocations_post.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_invocation_api_v1_invocations_post.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_invocation_api_v1_invocations_invocation_id_get.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_invocation_api_v1_invocations_invocation_id_get.asyncio_detailed(client=self._client, **kwargs)

    def cancel(self, **kwargs: Any) -> Response[Any]:
        return cancel_invocation_api_v1_invocations_invocation_id_cancel_post.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_cancel(self, **kwargs: Any) -> Response[Any]:
        return await cancel_invocation_api_v1_invocations_invocation_id_cancel_post.asyncio_detailed(
            client=self._client, **kwargs
        )
