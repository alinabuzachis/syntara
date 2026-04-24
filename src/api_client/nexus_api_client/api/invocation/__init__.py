"""invocation API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import cancel_invocation, create_invocation, create_invocation_chat, get_invocation, list_invocations


class InvocationApi:
    """Registry for invocation API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def lists(self, **kwargs: Any) -> Response[Any]:
        return list_invocations.sync_detailed(client=self._client, **kwargs)

    async def async_lists(self, **kwargs: Any) -> Response[Any]:
        return await list_invocations.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_invocation.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_invocation.asyncio_detailed(client=self._client, **kwargs)

    def create_chat(self, **kwargs: Any) -> Response[Any]:
        return create_invocation_chat.sync_detailed(client=self._client, **kwargs)

    async def async_create_chat(self, **kwargs: Any) -> Response[Any]:
        return await create_invocation_chat.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_invocation.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_invocation.asyncio_detailed(client=self._client, **kwargs)

    def cancel(self, **kwargs: Any) -> Response[Any]:
        return cancel_invocation.sync_detailed(client=self._client, **kwargs)

    async def async_cancel(self, **kwargs: Any) -> Response[Any]:
        return await cancel_invocation.asyncio_detailed(client=self._client, **kwargs)
