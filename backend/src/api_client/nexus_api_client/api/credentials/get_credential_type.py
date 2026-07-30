from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.credential_type_read import CredentialTypeRead
from ...models.error_data import ErrorData
from ...types import Response


def _get_kwargs(
    credential_type_id: UUID,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/credential_types/{credential_type_id}",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> CredentialTypeRead | ErrorData | None:
    if response.status_code == 200:
        response_200 = CredentialTypeRead.from_dict(response.json())

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
) -> Response[CredentialTypeRead | ErrorData]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    credential_type_id: UUID,
    *,
    client: AuthenticatedClient,
) -> Response[CredentialTypeRead | ErrorData]:
    """Get credential type

     Get a single Credential Type with credential_count.

    Args:
        credential_type_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[CredentialTypeRead | ErrorData]
    """

    kwargs = _get_kwargs(
        credential_type_id=credential_type_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    credential_type_id: UUID,
    *,
    client: AuthenticatedClient,
) -> CredentialTypeRead | ErrorData | None:
    """Get credential type

     Get a single Credential Type with credential_count.

    Args:
        credential_type_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        CredentialTypeRead | ErrorData
    """

    return sync_detailed(
        credential_type_id=credential_type_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    credential_type_id: UUID,
    *,
    client: AuthenticatedClient,
) -> Response[CredentialTypeRead | ErrorData]:
    """Get credential type

     Get a single Credential Type with credential_count.

    Args:
        credential_type_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[CredentialTypeRead | ErrorData]
    """

    kwargs = _get_kwargs(
        credential_type_id=credential_type_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    credential_type_id: UUID,
    *,
    client: AuthenticatedClient,
) -> CredentialTypeRead | ErrorData | None:
    """Get credential type

     Get a single Credential Type with credential_count.

    Args:
        credential_type_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        CredentialTypeRead | ErrorData
    """

    return (
        await asyncio_detailed(
            credential_type_id=credential_type_id,
            client=client,
        )
    ).parsed
