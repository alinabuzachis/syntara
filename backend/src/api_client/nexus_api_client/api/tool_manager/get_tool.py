from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.tool_with_parameters import ToolWithParameters
from ...types import Response


def _get_kwargs(
    tool_id: UUID,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/tool_manager/tools/{tool_id}",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | ToolWithParameters | None:
    if response.status_code == 200:
        response_200 = ToolWithParameters.from_dict(response.json())

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
) -> Response[ErrorData | ToolWithParameters]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    tool_id: UUID,
    *,
    client: AuthenticatedClient,
) -> Response[ErrorData | ToolWithParameters]:
    """Get Tool

     Get tool details by ID.

    Returns detailed information about a specific tool including
    parameters, status, and metadata.

    Args:
        tool_id: UUID of the tool to retrieve
        service: Tool service

    Returns:
        ToolWithParameters instance with full details

    Raises:
        HTTPException: 404 if tool not found, 403 for auth, 400 for invalid UUID

    Args:
        tool_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ToolWithParameters]
    """

    kwargs = _get_kwargs(
        tool_id=tool_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    tool_id: UUID,
    *,
    client: AuthenticatedClient,
) -> ErrorData | ToolWithParameters | None:
    """Get Tool

     Get tool details by ID.

    Returns detailed information about a specific tool including
    parameters, status, and metadata.

    Args:
        tool_id: UUID of the tool to retrieve
        service: Tool service

    Returns:
        ToolWithParameters instance with full details

    Raises:
        HTTPException: 404 if tool not found, 403 for auth, 400 for invalid UUID

    Args:
        tool_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ToolWithParameters
    """

    return sync_detailed(
        tool_id=tool_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    tool_id: UUID,
    *,
    client: AuthenticatedClient,
) -> Response[ErrorData | ToolWithParameters]:
    """Get Tool

     Get tool details by ID.

    Returns detailed information about a specific tool including
    parameters, status, and metadata.

    Args:
        tool_id: UUID of the tool to retrieve
        service: Tool service

    Returns:
        ToolWithParameters instance with full details

    Raises:
        HTTPException: 404 if tool not found, 403 for auth, 400 for invalid UUID

    Args:
        tool_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ToolWithParameters]
    """

    kwargs = _get_kwargs(
        tool_id=tool_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    tool_id: UUID,
    *,
    client: AuthenticatedClient,
) -> ErrorData | ToolWithParameters | None:
    """Get Tool

     Get tool details by ID.

    Returns detailed information about a specific tool including
    parameters, status, and metadata.

    Args:
        tool_id: UUID of the tool to retrieve
        service: Tool service

    Returns:
        ToolWithParameters instance with full details

    Raises:
        HTTPException: 404 if tool not found, 403 for auth, 400 for invalid UUID

    Args:
        tool_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ToolWithParameters
    """

    return (
        await asyncio_detailed(
            tool_id=tool_id,
            client=client,
        )
    ).parsed
