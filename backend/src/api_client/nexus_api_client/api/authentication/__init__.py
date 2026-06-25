"""authentication API endpoints."""

from __future__ import annotations

import importlib
from typing import Any, Protocol, cast

from ...client import AuthenticatedClient
from ...types import Response


class _EndpointModule(Protocol):
    def sync_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...

    async def asyncio_detailed(self, *, client: AuthenticatedClient, **kwargs: Any) -> Response[Any]: ...


class AuthenticationApi:
    """Registry for authentication API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def _load_endpoint_module(self, module_name: str) -> _EndpointModule:
        return cast(_EndpointModule, importlib.import_module(f"{__name__}.{module_name}"))

    def login(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("login")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_login(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("login")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def token(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("token")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_token(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("token")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_csrf_token(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_csrf_token")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_csrf_token(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_csrf_token")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def refresh_token(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("refresh_token")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_refresh_token(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("refresh_token")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def logout(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("logout")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_logout(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("logout")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def get_current_user(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_current_user")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_get_current_user(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("get_current_user")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def list_auth_providers(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_auth_providers")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_list_auth_providers(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("list_auth_providers")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def oidc_authorize(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("oidc_authorize")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_oidc_authorize(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("oidc_authorize")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)

    def oidc_callback(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("oidc_callback")
        return endpoint_module.sync_detailed(client=self._client, **kwargs)

    async def async_oidc_callback(self, **kwargs: Any) -> Response[Any]:
        endpoint_module = self._load_endpoint_module("oidc_callback")
        return await endpoint_module.asyncio_detailed(client=self._client, **kwargs)
