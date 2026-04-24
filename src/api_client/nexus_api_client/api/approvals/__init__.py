"""approvals API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import batch_decide_approvals, create_approval, decide_approval, get_approval, list_approvals


class ApprovalsApi:
    """Registry for approvals API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_approvals.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_approvals.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_approval.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_approval.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_approval.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_approval.asyncio_detailed(client=self._client, **kwargs)

    def decide(self, **kwargs: Any) -> Response[Any]:
        return decide_approval.sync_detailed(client=self._client, **kwargs)

    async def async_decide(self, **kwargs: Any) -> Response[Any]:
        return await decide_approval.asyncio_detailed(client=self._client, **kwargs)

    def batch_decide(self, **kwargs: Any) -> Response[Any]:
        return batch_decide_approvals.sync_detailed(client=self._client, **kwargs)

    async def async_batch_decide(self, **kwargs: Any) -> Response[Any]:
        return await batch_decide_approvals.asyncio_detailed(client=self._client, **kwargs)
