"""settings API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import bulk_update_settings, get_setting, list_categories, list_settings, update_setting


class SettingsApi:
    """Registry for settings API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_settings.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_settings.asyncio_detailed(client=self._client, **kwargs)

    def bulk_update(self, **kwargs: Any) -> Response[Any]:
        return bulk_update_settings.sync_detailed(client=self._client, **kwargs)

    async def async_bulk_update(self, **kwargs: Any) -> Response[Any]:
        return await bulk_update_settings.asyncio_detailed(client=self._client, **kwargs)

    def list_categories(self, **kwargs: Any) -> Response[Any]:
        return list_categories.sync_detailed(client=self._client, **kwargs)

    async def async_list_categories(self, **kwargs: Any) -> Response[Any]:
        return await list_categories.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_setting.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_setting.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        return update_setting.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        return await update_setting.asyncio_detailed(client=self._client, **kwargs)
