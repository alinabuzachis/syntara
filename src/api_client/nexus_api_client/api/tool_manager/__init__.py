"""tool_manager API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient, Client
from ...types import Response
from . import (
    bulk_update_tools_api_v1_tool_manager_tools_bulk_update_patch,
    delete_tool_provider_api_v1_tool_manager_tool_providers_provider_id_delete,
    get_tool_api_v1_tool_manager_tools_tool_id_get,
    get_tool_provider_api_v1_tool_manager_tool_providers_provider_id_get,
    get_tool_providers_api_v1_tool_manager_tool_providers_get,
    get_tools_api_v1_tool_manager_tools_get,
    patch_tool_api_v1_tool_manager_tools_tool_id_patch,
    patch_tool_provider_api_v1_tool_manager_tool_providers_provider_id_patch,
    refresh_tool_provider_api_v1_tool_manager_tool_providers_provider_id_refresh_tools_post,
    register_tool_provider_api_v1_tool_manager_tool_providers_post,
    test_tool_provider_api_v1_tool_manager_tool_providers_test_post,
    update_tool_provider_api_v1_tool_manager_tool_providers_provider_id_put,
    validate_tool_provider_api_v1_tool_manager_tool_providers_provider_id_validate_post,
)


class ToolManagerApi:
    """Registry for tool_manager API endpoints."""

    def __init__(self, client: Client | AuthenticatedClient) -> None:
        self._client = client

    def get_tools(self, **kwargs: Any) -> Response[Any]:
        return get_tools_api_v1_tool_manager_tools_get.sync_detailed(client=self._client, **kwargs)

    async def async_get_tools(self, **kwargs: Any) -> Response[Any]:
        return await get_tools_api_v1_tool_manager_tools_get.asyncio_detailed(client=self._client, **kwargs)

    def get_tool(self, **kwargs: Any) -> Response[Any]:
        return get_tool_api_v1_tool_manager_tools_tool_id_get.sync_detailed(client=self._client, **kwargs)

    async def async_get_tool(self, **kwargs: Any) -> Response[Any]:
        return await get_tool_api_v1_tool_manager_tools_tool_id_get.asyncio_detailed(client=self._client, **kwargs)

    def patch_tool(self, **kwargs: Any) -> Response[Any]:
        return patch_tool_api_v1_tool_manager_tools_tool_id_patch.sync_detailed(client=self._client, **kwargs)

    async def async_patch_tool(self, **kwargs: Any) -> Response[Any]:
        return await patch_tool_api_v1_tool_manager_tools_tool_id_patch.asyncio_detailed(client=self._client, **kwargs)

    def bulk_update_tools(self, **kwargs: Any) -> Response[Any]:
        return bulk_update_tools_api_v1_tool_manager_tools_bulk_update_patch.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_bulk_update_tools(self, **kwargs: Any) -> Response[Any]:
        return await bulk_update_tools_api_v1_tool_manager_tools_bulk_update_patch.asyncio_detailed(
            client=self._client, **kwargs
        )

    def get_tool_providers(self, **kwargs: Any) -> Response[Any]:
        return get_tool_providers_api_v1_tool_manager_tool_providers_get.sync_detailed(client=self._client, **kwargs)

    async def async_get_tool_providers(self, **kwargs: Any) -> Response[Any]:
        return await get_tool_providers_api_v1_tool_manager_tool_providers_get.asyncio_detailed(
            client=self._client, **kwargs
        )

    def register_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return register_tool_provider_api_v1_tool_manager_tool_providers_post.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_register_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await register_tool_provider_api_v1_tool_manager_tool_providers_post.asyncio_detailed(
            client=self._client, **kwargs
        )

    def get_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return get_tool_provider_api_v1_tool_manager_tool_providers_provider_id_get.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_get_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await get_tool_provider_api_v1_tool_manager_tool_providers_provider_id_get.asyncio_detailed(
            client=self._client, **kwargs
        )

    def update_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return update_tool_provider_api_v1_tool_manager_tool_providers_provider_id_put.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_update_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await update_tool_provider_api_v1_tool_manager_tool_providers_provider_id_put.asyncio_detailed(
            client=self._client, **kwargs
        )

    def delete_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return delete_tool_provider_api_v1_tool_manager_tool_providers_provider_id_delete.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_delete_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await delete_tool_provider_api_v1_tool_manager_tool_providers_provider_id_delete.asyncio_detailed(
            client=self._client, **kwargs
        )

    def patch_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return patch_tool_provider_api_v1_tool_manager_tool_providers_provider_id_patch.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_patch_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await patch_tool_provider_api_v1_tool_manager_tool_providers_provider_id_patch.asyncio_detailed(
            client=self._client, **kwargs
        )

    def validate_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return validate_tool_provider_api_v1_tool_manager_tool_providers_provider_id_validate_post.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_validate_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return (
            await validate_tool_provider_api_v1_tool_manager_tool_providers_provider_id_validate_post.asyncio_detailed(
                client=self._client, **kwargs
            )
        )

    def test_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return test_tool_provider_api_v1_tool_manager_tool_providers_test_post.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_test_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await test_tool_provider_api_v1_tool_manager_tool_providers_test_post.asyncio_detailed(
            client=self._client, **kwargs
        )

    def refresh_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return refresh_tool_provider_api_v1_tool_manager_tool_providers_provider_id_refresh_tools_post.sync_detailed(
            client=self._client, **kwargs
        )

    async def async_refresh_tool_provider(self, **kwargs: Any) -> Response[Any]:
        return await refresh_tool_provider_api_v1_tool_manager_tool_providers_provider_id_refresh_tools_post.asyncio_detailed(
            client=self._client, **kwargs
        )
