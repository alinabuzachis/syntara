from http import HTTPStatus
from typing import Any, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.csrf_token_response import CsrfTokenResponse
from ...models.error_data import ErrorData
from ...types import Response


def _get_kwargs() -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/auth/csrf_token",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Any | CsrfTokenResponse | ErrorData | None:
    if response.status_code == 200:
        response_200 = CsrfTokenResponse.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = ErrorData.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = ErrorData.from_dict(response.json())

        return response_401

    if response.status_code == 403:
        response_403 = cast(Any, None)
        return response_403

    if response.status_code == 404:
        response_404 = ErrorData.from_dict(response.json())

        return response_404

    if response.status_code == 409:
        response_409 = ErrorData.from_dict(response.json())

        return response_409

    if response.status_code == 422:
        response_422 = ErrorData.from_dict(response.json())

        return response_422

    if response.status_code == 429:
        response_429 = ErrorData.from_dict(response.json())

        return response_429

    if response.status_code == 500:
        response_500 = ErrorData.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[Any | CsrfTokenResponse | ErrorData]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[Any | CsrfTokenResponse | ErrorData]:
    """Get CSRF form token

     Return the CSRF form token derived from the session's CSRF seed cookie.

    The SPA calls this once after login or OIDC redirect to obtain the
    form token, which it then sends in the `X-CSRF-Token` header on
    subsequent state-changing requests (refresh, logout).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | CsrfTokenResponse | ErrorData]
    """

    kwargs = _get_kwargs()

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
) -> Any | CsrfTokenResponse | ErrorData | None:
    """Get CSRF form token

     Return the CSRF form token derived from the session's CSRF seed cookie.

    The SPA calls this once after login or OIDC redirect to obtain the
    form token, which it then sends in the `X-CSRF-Token` header on
    subsequent state-changing requests (refresh, logout).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | CsrfTokenResponse | ErrorData
    """

    return sync_detailed(
        client=client,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
) -> Response[Any | CsrfTokenResponse | ErrorData]:
    """Get CSRF form token

     Return the CSRF form token derived from the session's CSRF seed cookie.

    The SPA calls this once after login or OIDC redirect to obtain the
    form token, which it then sends in the `X-CSRF-Token` header on
    subsequent state-changing requests (refresh, logout).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | CsrfTokenResponse | ErrorData]
    """

    kwargs = _get_kwargs()

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
) -> Any | CsrfTokenResponse | ErrorData | None:
    """Get CSRF form token

     Return the CSRF form token derived from the session's CSRF seed cookie.

    The SPA calls this once after login or OIDC redirect to obtain the
    form token, which it then sends in the `X-CSRF-Token` header on
    subsequent state-changing requests (refresh, logout).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | CsrfTokenResponse | ErrorData
    """

    return (
        await asyncio_detailed(
            client=client,
        )
    ).parsed
