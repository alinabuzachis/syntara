"""approvals API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient, Client
from ...types import Response
from . import (
    batch_decide_approvals_api_v1_approvals_batch_post,
    create_approval_api_v1_approvals_post,
    decide_approval_api_v1_approvals_approval_id_patch,
    get_approval_api_v1_approvals_approval_id_get,
    list_approvals_api_v1_approvals_get,
)


class ApprovalsApi:
    """Registry for approvals API endpoints."""

    def __init__(self, client: Client | AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_approvals_api_v1_approvals_get.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_approvals_api_v1_approvals_get.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_approval_api_v1_approvals_post.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_approval_api_v1_approvals_post.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_approval_api_v1_approvals_approval_id_get.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_approval_api_v1_approvals_approval_id_get.asyncio_detailed(client=self._client, **kwargs)

    def decide(self, **kwargs: Any) -> Response[Any]:
        return decide_approval_api_v1_approvals_approval_id_patch.sync_detailed(client=self._client, **kwargs)

    async def async_decide(self, **kwargs: Any) -> Response[Any]:
        return await decide_approval_api_v1_approvals_approval_id_patch.asyncio_detailed(client=self._client, **kwargs)

    def batch_decide(self, **kwargs: Any) -> Response[Any]:
        return batch_decide_approvals_api_v1_approvals_batch_post.sync_detailed(client=self._client, **kwargs)

    async def async_batch_decide(self, **kwargs: Any) -> Response[Any]:
        return await batch_decide_approvals_api_v1_approvals_batch_post.asyncio_detailed(client=self._client, **kwargs)
