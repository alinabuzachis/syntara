"""authentication API endpoints."""

from __future__ import annotations

from typing import Any

from ...client import AuthenticatedClient
from ...types import Response
from . import get_current_user, list_auth_providers, login, logout, oidc_authorize, oidc_callback, refresh_token


class AuthenticationApi:
    """Registry for authentication API endpoints."""

    def __init__(self, client: AuthenticatedClient) -> None:
        self._client = client

    def login(self, **kwargs: Any) -> Response[Any]:
        return login.sync_detailed(client=self._client, **kwargs)

    async def async_login(self, **kwargs: Any) -> Response[Any]:
        return await login.asyncio_detailed(client=self._client, **kwargs)

    def refresh_token(self, **kwargs: Any) -> Response[Any]:
        return refresh_token.sync_detailed(client=self._client, **kwargs)

    async def async_refresh_token(self, **kwargs: Any) -> Response[Any]:
        return await refresh_token.asyncio_detailed(client=self._client, **kwargs)

    def logout(self, **kwargs: Any) -> Response[Any]:
        return logout.sync_detailed(client=self._client, **kwargs)

    async def async_logout(self, **kwargs: Any) -> Response[Any]:
        return await logout.asyncio_detailed(client=self._client, **kwargs)

    def get_current_user(self, **kwargs: Any) -> Response[Any]:
        return get_current_user.sync_detailed(client=self._client, **kwargs)

    async def async_get_current_user(self, **kwargs: Any) -> Response[Any]:
        return await get_current_user.asyncio_detailed(client=self._client, **kwargs)

    def list_auth_providers(self, **kwargs: Any) -> Response[Any]:
        return list_auth_providers.sync_detailed(client=self._client, **kwargs)

    async def async_list_auth_providers(self, **kwargs: Any) -> Response[Any]:
        return await list_auth_providers.asyncio_detailed(client=self._client, **kwargs)

    def oidc_authorize(self, **kwargs: Any) -> Response[Any]:
        return oidc_authorize.sync_detailed(client=self._client, **kwargs)

    async def async_oidc_authorize(self, **kwargs: Any) -> Response[Any]:
        return await oidc_authorize.asyncio_detailed(client=self._client, **kwargs)

    def oidc_callback(self, **kwargs: Any) -> Response[Any]:
        return oidc_callback.sync_detailed(client=self._client, **kwargs)

    async def async_oidc_callback(self, **kwargs: Any) -> Response[Any]:
        return await oidc_callback.asyncio_detailed(client=self._client, **kwargs)
