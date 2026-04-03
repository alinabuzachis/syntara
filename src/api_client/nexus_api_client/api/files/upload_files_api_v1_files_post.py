from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.body_upload_files_api_v1_files_post import BodyUploadFilesApiV1FilesPost
from ...models.file_upload_response import FileUploadResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    *,
    body: BodyUploadFilesApiV1FilesPost,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/files",
    }

    _kwargs["files"] = body.to_multipart()

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> FileUploadResponse | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = FileUploadResponse.from_dict(response.json())

        return response_200

    if response.status_code == 422:
        response_422 = HTTPValidationError.from_dict(response.json())

        return response_422

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[FileUploadResponse | HTTPValidationError]:
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
    body: BodyUploadFilesApiV1FilesPost,
) -> Response[FileUploadResponse | HTTPValidationError]:
    """Upload Files (Design Time)

     Upload files independently of invocations for later use in agent execution. Returns file_ids that
    can be stored in workflow configuration and passed to invocations. Files are validated, stored, and
    queued for document conversion.

    Args:
        body (BodyUploadFilesApiV1FilesPost):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[FileUploadResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
    body: BodyUploadFilesApiV1FilesPost,
) -> FileUploadResponse | HTTPValidationError | None:
    """Upload Files (Design Time)

     Upload files independently of invocations for later use in agent execution. Returns file_ids that
    can be stored in workflow configuration and passed to invocations. Files are validated, stored, and
    queued for document conversion.

    Args:
        body (BodyUploadFilesApiV1FilesPost):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        FileUploadResponse | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: BodyUploadFilesApiV1FilesPost,
) -> Response[FileUploadResponse | HTTPValidationError]:
    """Upload Files (Design Time)

     Upload files independently of invocations for later use in agent execution. Returns file_ids that
    can be stored in workflow configuration and passed to invocations. Files are validated, stored, and
    queued for document conversion.

    Args:
        body (BodyUploadFilesApiV1FilesPost):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[FileUploadResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: BodyUploadFilesApiV1FilesPost,
) -> FileUploadResponse | HTTPValidationError | None:
    """Upload Files (Design Time)

     Upload files independently of invocations for later use in agent execution. Returns file_ids that
    can be stored in workflow configuration and passed to invocations. Files are validated, stored, and
    queued for document conversion.

    Args:
        body (BodyUploadFilesApiV1FilesPost):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        FileUploadResponse | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
