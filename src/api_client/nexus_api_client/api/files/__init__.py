"""files API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import upload_files


class FilesApi:
    """Registry for files API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def upload(self, **kwargs: Any) -> Response[Any]:
        return upload_files.sync_detailed(client=self._client, **kwargs)

    async def async_upload(self, **kwargs: Any) -> Response[Any]:
        return await upload_files.asyncio_detailed(client=self._client, **kwargs)
