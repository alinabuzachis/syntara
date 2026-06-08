"""audit_events API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class AuditEventsApi:
    """Registry for audit_events API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_audit_events")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_audit_events")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def start_audit_export(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("start_audit_export")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_start_audit_export(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("start_audit_export")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_audit_export_status(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_audit_export_status")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_audit_export_status(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_audit_export_status")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def download_audit_export(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("download_audit_export")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_download_audit_export(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("download_audit_export")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
