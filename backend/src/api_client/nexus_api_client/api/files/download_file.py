from http import HTTPStatus
from typing import Any, cast
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...types import Response


def _get_kwargs(
    file_id: UUID,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/files/{file_id}/download",
    }

    return _kwargs


def _parse_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> ErrorData | str | None:
    if response.status_code == 200:
        response_200 = cast(str, response.content)
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


def _build_response(*, client: AuthenticatedClient | Client, response: httpx.Response) -> Response[ErrorData | str]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    file_id: UUID,
    *,
    client: AuthenticatedClient,
) -> Response[ErrorData | str]:
    """Download file

     Download a file by its ID. Serves the file from whichever storage backend it was uploaded to.

    Args:
        file_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | str]
    """

    kwargs = _get_kwargs(
        file_id=file_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    file_id: UUID,
    *,
    client: AuthenticatedClient,
) -> ErrorData | str | None:
    """Download file

     Download a file by its ID. Serves the file from whichever storage backend it was uploaded to.

    Args:
        file_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | str
    """

    return sync_detailed(
        file_id=file_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    file_id: UUID,
    *,
    client: AuthenticatedClient,
) -> Response[ErrorData | str]:
    """Download file

     Download a file by its ID. Serves the file from whichever storage backend it was uploaded to.

    Args:
        file_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | str]
    """

    kwargs = _get_kwargs(
        file_id=file_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    file_id: UUID,
    *,
    client: AuthenticatedClient,
) -> ErrorData | str | None:
    """Download file

     Download a file by its ID. Serves the file from whichever storage backend it was uploaded to.

    Args:
        file_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | str
    """

    return (
        await asyncio_detailed(
            file_id=file_id,
            client=client,
        )
    ).parsed
