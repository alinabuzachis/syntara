"""admin API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class AdminApi:
    """Registry for admin API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def get_global_revocation_timestamp(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_global_revocation_timestamp")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_global_revocation_timestamp(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_global_revocation_timestamp")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def revoke_all_sessions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("revoke_all_sessions")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_revoke_all_sessions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("revoke_all_sessions")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def revoke_user_sessions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("revoke_user_sessions")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_revoke_user_sessions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("revoke_user_sessions")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def revoke_idp_sessions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("revoke_idp_sessions")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_revoke_idp_sessions(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("revoke_idp_sessions")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
