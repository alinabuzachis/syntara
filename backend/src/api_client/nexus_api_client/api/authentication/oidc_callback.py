from http import HTTPStatus
from typing import Any, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    state: str,
    code: None | str | Unset = UNSET,
    error: None | str | Unset = UNSET,
    error_description: None | str | Unset = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if isinstance(additional_params, dict):
        params = additional_params

    params["state"] = state

    json_code: None | str | Unset
    if isinstance(code, Unset):
        json_code = UNSET
    else:
        json_code = code
    params["code"] = json_code

    json_error: None | str | Unset
    if isinstance(error, Unset):
        json_error = UNSET
    else:
        json_error = error
    params["error"] = json_error

    json_error_description: None | str | Unset
    if isinstance(error_description, Unset):
        json_error_description = UNSET
    else:
        json_error_description = error_description
    params["error_description"] = json_error_description

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/auth/oidc/callback",
        "params": params,
    }

    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Any | ErrorData | None:
    if response.status_code == 200:
        response_200 = response.json()
        return response_200

    if response.status_code == 302:
        response_302 = cast(Any, None)
        return response_302

    if response.status_code == 400:
        response_400 = ErrorData.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = cast(Any, None)
        return response_401

    if response.status_code == 403:
        response_403 = ErrorData.from_dict(response.json())

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

    if response.status_code == 500:
        response_500 = ErrorData.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[Any | ErrorData]:
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
    state: str,
    code: None | str | Unset = UNSET,
    error: None | str | Unset = UNSET,
    error_description: None | str | Unset = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> Response[Any | ErrorData]:
    """OIDC callback

     Handles the OIDC callback after the user authenticates at the identity provider.
    Exchanges the authorization code for tokens, validates the ID token,
    creates or maps a local user, and establishes a session.

    Args:
        state (str):
        code (None | str | Unset):
        error (None | str | Unset):
        error_description (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorData]
    """

    kwargs = _get_kwargs(
        state=state, code=code, error=error, error_description=error_description, additional_params=additional_params
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
    state: str,
    code: None | str | Unset = UNSET,
    error: None | str | Unset = UNSET,
    error_description: None | str | Unset = UNSET,
) -> Any | ErrorData | None:
    """OIDC callback

     Handles the OIDC callback after the user authenticates at the identity provider.
    Exchanges the authorization code for tokens, validates the ID token,
    creates or maps a local user, and establishes a session.

    Args:
        state (str):
        code (None | str | Unset):
        error (None | str | Unset):
        error_description (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorData
    """

    return sync_detailed(
        client=client,
        state=state,
        code=code,
        error=error,
        error_description=error_description,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    state: str,
    code: None | str | Unset = UNSET,
    error: None | str | Unset = UNSET,
    error_description: None | str | Unset = UNSET,
) -> Response[Any | ErrorData]:
    """OIDC callback

     Handles the OIDC callback after the user authenticates at the identity provider.
    Exchanges the authorization code for tokens, validates the ID token,
    creates or maps a local user, and establishes a session.

    Args:
        state (str):
        code (None | str | Unset):
        error (None | str | Unset):
        error_description (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorData]
    """

    kwargs = _get_kwargs(
        state=state,
        code=code,
        error=error,
        error_description=error_description,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    state: str,
    code: None | str | Unset = UNSET,
    error: None | str | Unset = UNSET,
    error_description: None | str | Unset = UNSET,
) -> Any | ErrorData | None:
    """OIDC callback

     Handles the OIDC callback after the user authenticates at the identity provider.
    Exchanges the authorization code for tokens, validates the ID token,
    creates or maps a local user, and establishes a session.

    Args:
        state (str):
        code (None | str | Unset):
        error (None | str | Unset):
        error_description (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorData
    """

    return (
        await asyncio_detailed(
            client=client,
            state=state,
            code=code,
            error=error,
            error_description=error_description,
        )
    ).parsed
