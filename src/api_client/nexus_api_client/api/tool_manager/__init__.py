"""tool_manager API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import (
    bulk_update_tools,
    delete_tool_provider,
    get_tool,
    get_tool_provider,
    get_tool_providers,
    get_tools,
    patch_tool,
    patch_tool_provider,
    refresh_tool_provider,
    register_tool_provider,
    test_tool_provider,
    update_tool_provider,
    validate_tool_provider,
)


class ToolManagerApi:
    """Registry for tool_manager API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def get_tools(self, **kwargs: Any) -> Response[Any]:
        return get_tools.sync_detailed(client=self._client, **kwargs)

    async def async_get_tools(self, **kwargs: Any) -> Response[Any]:
        return await get_tools.asyncio_detailed(client=self._client, **kwargs)

    def get_tool(self, **kwargs: Any) -> Response[Any]:
        return get_tool.sync_detailed(client=self._client, **kwargs)

    async def async_get_tool(self, **kwargs: Any) -> Response[Any]:
        return await get_tool.asyncio_detailed(client=self._client, **kwargs)

    def patch_tool(self, **kwargs: Any) -> Response[Any]:
        return patch_tool.sync_detailed(client=self._client, **kwargs)

    async def async_patch_tool(self, **kwargs: Any) -> Response[Any]:
        return await patch_tool.asyncio_detailed(client=self._client, **kwargs)

    def bulk_update_tools(self, **kwargs: Any) -> Response[Any]:
        return bulk_update_tools.sync_detailed(client=self._client, **kwargs)

    async def async_bulk_update_tools(self, **kwargs: Any) -> Response[Any]:
        return await bulk_update_tools.asyncio_detailed(client=self._client, **kwargs)

    def get_tool_providers(self, **kwargs: Any) -> Response[Any]:
        return get_tool_providers.sync_detailed(client=self._client, **kwargs)

    async def async_get_tool_providers(self, **kwargs: Any) -> Response[Any]:
        return await get_tool_providers.asyncio_detailed(client=self._client, **kwargs)

    def register_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return register_tool_provider.sync_detailed(client=self._client, **kwargs)

    async def async_register_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await register_tool_provider.asyncio_detailed(client=self._client, **kwargs)

    def get_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return get_tool_provider.sync_detailed(client=self._client, **kwargs)

    async def async_get_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await get_tool_provider.asyncio_detailed(client=self._client, **kwargs)

    def update_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return update_tool_provider.sync_detailed(client=self._client, **kwargs)

    async def async_update_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await update_tool_provider.asyncio_detailed(client=self._client, **kwargs)

    def delete_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return delete_tool_provider.sync_detailed(client=self._client, **kwargs)

    async def async_delete_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await delete_tool_provider.asyncio_detailed(client=self._client, **kwargs)

    def patch_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return patch_tool_provider.sync_detailed(client=self._client, **kwargs)

    async def async_patch_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await patch_tool_provider.asyncio_detailed(client=self._client, **kwargs)

    def validate_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return validate_tool_provider.sync_detailed(client=self._client, **kwargs)

    async def async_validate_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await validate_tool_provider.asyncio_detailed(client=self._client, **kwargs)

    def refresh_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return refresh_tool_provider.sync_detailed(client=self._client, **kwargs)

    async def async_refresh_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await refresh_tool_provider.asyncio_detailed(client=self._client, **kwargs)

    def test_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return test_tool_provider.sync_detailed(client=self._client, **kwargs)

    async def async_test_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await test_tool_provider.asyncio_detailed(client=self._client, **kwargs)
