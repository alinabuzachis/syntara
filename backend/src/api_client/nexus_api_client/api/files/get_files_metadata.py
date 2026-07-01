from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.files_metadata_response import FilesMetadataResponse
from ...types import UNSET, Response


def _get_kwargs(*, file_ids: list[UUID], additional_params: dict[str, Any] | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if isinstance(additional_params, dict):
        params = additional_params

    json_file_ids = []
    for file_ids_item_data in file_ids:
        file_ids_item = str(file_ids_item_data)
        json_file_ids.append(file_ids_item)

    params["file_ids"] = json_file_ids

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/files/metadata",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | FilesMetadataResponse | None:
    if response.status_code == 200:
        response_200 = FilesMetadataResponse.from_dict(response.json())

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

    if response.status_code == 500:
        response_500 = ErrorData.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ErrorData | FilesMetadataResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    *, client: AuthenticatedClient, file_ids: list[UUID], additional_params: dict[str, Any] | None = None
) -> Response[ErrorData | FilesMetadataResponse]:
    """Get Files Metadata (Batch)

     Retrieve metadata for one or more files by their IDs. Returns file information (filename, size, MIME
    type, status) without file content.

    Args:
        file_ids (list[UUID]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | FilesMetadataResponse]
    """

    kwargs = _get_kwargs(file_ids=file_ids, additional_params=additional_params)

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    file_ids: list[UUID],
) -> ErrorData | FilesMetadataResponse | None:
    """Get Files Metadata (Batch)

     Retrieve metadata for one or more files by their IDs. Returns file information (filename, size, MIME
    type, status) without file content.

    Args:
        file_ids (list[UUID]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | FilesMetadataResponse
    """

    return sync_detailed(
        client=client,
        file_ids=file_ids,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    file_ids: list[UUID],
) -> Response[ErrorData | FilesMetadataResponse]:
    """Get Files Metadata (Batch)

     Retrieve metadata for one or more files by their IDs. Returns file information (filename, size, MIME
    type, status) without file content.

    Args:
        file_ids (list[UUID]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | FilesMetadataResponse]
    """

    kwargs = _get_kwargs(
        file_ids=file_ids,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    file_ids: list[UUID],
) -> ErrorData | FilesMetadataResponse | None:
    """Get Files Metadata (Batch)

     Retrieve metadata for one or more files by their IDs. Returns file information (filename, size, MIME
    type, status) without file content.

    Args:
        file_ids (list[UUID]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | FilesMetadataResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            file_ids=file_ids,
        )
    ).parsed
