"""authorization API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import can_i, get_resource_actions, validate_name, what_can_i, who_can


class AuthorizationApi:
    """Registry for authorization API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def can_i(self, **kwargs: Any) -> Response[Any]:
        return can_i.sync_detailed(client=self._client, **kwargs)

    async def async_can_i(self, **kwargs: Any) -> Response[Any]:
        return await can_i.asyncio_detailed(client=self._client, **kwargs)

    def who_can(self, **kwargs: Any) -> Response[Any]:
        return who_can.sync_detailed(client=self._client, **kwargs)

    async def async_who_can(self, **kwargs: Any) -> Response[Any]:
        return await who_can.asyncio_detailed(client=self._client, **kwargs)

    def what_can_i(self, **kwargs: Any) -> Response[Any]:
        return what_can_i.sync_detailed(client=self._client, **kwargs)

    async def async_what_can_i(self, **kwargs: Any) -> Response[Any]:
        return await what_can_i.asyncio_detailed(client=self._client, **kwargs)

    def get_resource_actions(self, **kwargs: Any) -> Response[Any]:
        return get_resource_actions.sync_detailed(client=self._client, **kwargs)

    async def async_get_resource_actions(self, **kwargs: Any) -> Response[Any]:
        return await get_resource_actions.asyncio_detailed(client=self._client, **kwargs)

    def validate_name(self, **kwargs: Any) -> Response[Any]:
        return validate_name.sync_detailed(client=self._client, **kwargs)

    async def async_validate_name(self, **kwargs: Any) -> Response[Any]:
        return await validate_name.asyncio_detailed(client=self._client, **kwargs)
