from http import HTTPStatus
from typing import Any, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.revocation_response import RevocationResponse
from ...types import Response


def _get_kwargs(
    idp_name: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": f"/admin/revocation/identity_providers/{idp_name}",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Any | ErrorData | RevocationResponse | None:
    if response.status_code == 200:
        response_200 = RevocationResponse.from_dict(response.json())

        return response_200

    if response.status_code == 400:
        response_400 = ErrorData.from_dict(response.json())

        return response_400

    if response.status_code == 401:
        response_401 = ErrorData.from_dict(response.json())

        return response_401

    if response.status_code == 403:
        response_403 = ErrorData.from_dict(response.json())

        return response_403

    if response.status_code == 404:
        response_404 = cast(Any, None)
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


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[Any | ErrorData | RevocationResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    idp_name: str,
    *,
    client: AuthenticatedClient,
) -> Response[Any | ErrorData | RevocationResponse]:
    """Revoke sessions for an identity provider

     Revoke all active sessions authenticated via a specific identity provider. Users who authenticated
    via this provider will need to re-authenticate.

    Args:
        idp_name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorData | RevocationResponse]
    """

    kwargs = _get_kwargs(
        idp_name=idp_name,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    idp_name: str,
    *,
    client: AuthenticatedClient,
) -> Any | ErrorData | RevocationResponse | None:
    """Revoke sessions for an identity provider

     Revoke all active sessions authenticated via a specific identity provider. Users who authenticated
    via this provider will need to re-authenticate.

    Args:
        idp_name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorData | RevocationResponse
    """

    return sync_detailed(
        idp_name=idp_name,
        client=client,
    ).parsed


async def asyncio_detailed(
    idp_name: str,
    *,
    client: AuthenticatedClient,
) -> Response[Any | ErrorData | RevocationResponse]:
    """Revoke sessions for an identity provider

     Revoke all active sessions authenticated via a specific identity provider. Users who authenticated
    via this provider will need to re-authenticate.

    Args:
        idp_name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Any | ErrorData | RevocationResponse]
    """

    kwargs = _get_kwargs(
        idp_name=idp_name,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    idp_name: str,
    *,
    client: AuthenticatedClient,
) -> Any | ErrorData | RevocationResponse | None:
    """Revoke sessions for an identity provider

     Revoke all active sessions authenticated via a specific identity provider. Users who authenticated
    via this provider will need to re-authenticate.

    Args:
        idp_name (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Any | ErrorData | RevocationResponse
    """

    return (
        await asyncio_detailed(
            idp_name=idp_name,
            client=client,
        )
    ).parsed
