"""identity_providers API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import (
    create_identity_provider,
    delete_identity_provider,
    get_identity_provider,
    list_identity_providers,
    patch_identity_provider,
    test_identity_provider,
)


class IdentityProvidersApi:
    """Registry for identity_providers API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_identity_providers.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_identity_providers.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_identity_provider.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_identity_provider.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_identity_provider.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_identity_provider.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        return delete_identity_provider.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        return await delete_identity_provider.asyncio_detailed(client=self._client, **kwargs)

    def patch(self, **kwargs: Any) -> Response[Any]:
        return patch_identity_provider.sync_detailed(client=self._client, **kwargs)

    async def async_patch(self, **kwargs: Any) -> Response[Any]:
        return await patch_identity_provider.asyncio_detailed(client=self._client, **kwargs)

    def test(self, **kwargs: Any) -> Response[Any]:
        return test_identity_provider.sync_detailed(client=self._client, **kwargs)

    async def async_test(self, **kwargs: Any) -> Response[Any]:
        return await test_identity_provider.asyncio_detailed(client=self._client, **kwargs)
