"""credentials API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import (
    create_credential,
    delete_credential,
    get_credential,
    get_credential_type,
    get_credential_workflows,
    list_credential_types,
    list_credentials,
    update_credential,
)


class CredentialsApi:
    """Registry for credentials API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def list(self, **kwargs: Any) -> Response[Any]:
        return list_credentials.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        return await list_credentials.asyncio_detailed(client=self._client, **kwargs)

    def create(self, **kwargs: Any) -> Response[Any]:
        return create_credential.sync_detailed(client=self._client, **kwargs)

    async def async_create(self, **kwargs: Any) -> Response[Any]:
        return await create_credential.asyncio_detailed(client=self._client, **kwargs)

    def get(self, **kwargs: Any) -> Response[Any]:
        return get_credential.sync_detailed(client=self._client, **kwargs)

    async def async_get(self, **kwargs: Any) -> Response[Any]:
        return await get_credential.asyncio_detailed(client=self._client, **kwargs)

    def delete(self, **kwargs: Any) -> Response[Any]:
        return delete_credential.sync_detailed(client=self._client, **kwargs)

    async def async_delete(self, **kwargs: Any) -> Response[Any]:
        return await delete_credential.asyncio_detailed(client=self._client, **kwargs)

    def update(self, **kwargs: Any) -> Response[Any]:
        return update_credential.sync_detailed(client=self._client, **kwargs)

    async def async_update(self, **kwargs: Any) -> Response[Any]:
        return await update_credential.asyncio_detailed(client=self._client, **kwargs)

    def get_workflows(self, **kwargs: Any) -> Response[Any]:
        return get_credential_workflows.sync_detailed(client=self._client, **kwargs)

    async def async_get_workflows(self, **kwargs: Any) -> Response[Any]:
        return await get_credential_workflows.asyncio_detailed(client=self._client, **kwargs)

    def list_types(self, **kwargs: Any) -> Response[Any]:
        return list_credential_types.sync_detailed(client=self._client, **kwargs)

    async def async_list_types(self, **kwargs: Any) -> Response[Any]:
        return await list_credential_types.asyncio_detailed(client=self._client, **kwargs)

    def get_type(self, **kwargs: Any) -> Response[Any]:
        return get_credential_type.sync_detailed(client=self._client, **kwargs)

    async def async_get_type(self, **kwargs: Any) -> Response[Any]:
        return await get_credential_type.asyncio_detailed(client=self._client, **kwargs)
