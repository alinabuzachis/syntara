"""policies API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import create_policy, delete_policy, get_policy, list_policies, replace_policy, update_policy


class PoliciesApi:
    """Registry for policies API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_policies.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_policies.asyncio_detailed(client=self._client, **kwargs)

    def create_policy(self, **kwargs: Any) -> Response[Any]:
        return create_policy.sync_detailed(client=self._client, **kwargs)

    async def async_create_policy(self, **kwargs: Any) -> Response[Any]:
        return await create_policy.asyncio_detailed(client=self._client, **kwargs)

    def get_policy(self, **kwargs: Any) -> Response[Any]:
        return get_policy.sync_detailed(client=self._client, **kwargs)

    async def async_get_policy(self, **kwargs: Any) -> Response[Any]:
        return await get_policy.asyncio_detailed(client=self._client, **kwargs)

    def replace_policy(self, **kwargs: Any) -> Response[Any]:
        return replace_policy.sync_detailed(client=self._client, **kwargs)

    async def async_replace_policy(self, **kwargs: Any) -> Response[Any]:
        return await replace_policy.asyncio_detailed(client=self._client, **kwargs)

    def delete_policy(self, **kwargs: Any) -> Response[Any]:
        return delete_policy.sync_detailed(client=self._client, **kwargs)

    async def async_delete_policy(self, **kwargs: Any) -> Response[Any]:
        return await delete_policy.asyncio_detailed(client=self._client, **kwargs)

    def update_policy(self, **kwargs: Any) -> Response[Any]:
        return update_policy.sync_detailed(client=self._client, **kwargs)

    async def async_update_policy(self, **kwargs: Any) -> Response[Any]:
        return await update_policy.asyncio_detailed(client=self._client, **kwargs)
