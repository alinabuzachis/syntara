"""files API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient, Client
from ...types import Response
from . import upload_files_api_v1_files_post


class FilesApi:
    """Registry for files API endpoints."""

    def __init__(self, client: Client | AuthenticatedClient) -> None:
        self._client = client

    def upload(self, **kwargs: Any) -> Response[Any]:
        return upload_files_api_v1_files_post.sync_detailed(client=self._client, **kwargs)

    async def async_upload(self, **kwargs: Any) -> Response[Any]:
        return await upload_files_api_v1_files_post.asyncio_detailed(client=self._client, **kwargs)
