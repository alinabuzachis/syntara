from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.tool_update import ToolUpdate
from ...models.tool_with_parameters import ToolWithParameters
from ...types import Response


def _get_kwargs(
    tool_id: UUID,
    *,
    body: ToolUpdate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "patch",
        "url": f"/api/v1/tool_manager/tools/{tool_id}",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | ToolWithParameters | None:
    if response.status_code == 200:
        response_200 = ToolWithParameters.from_dict(response.json())

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
) -> Response[HTTPValidationError | ToolWithParameters]:
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
    client: AuthenticatedClient | Client,
    body: ToolUpdate,
) -> Response[HTTPValidationError | ToolWithParameters]:
    """Patch Tool

     Update tool status (enable/disable).

    Updates the tool's status to enable or disable it for use.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        tool_id: UUID of the tool to update
        tool_update: Tool update data with status
        service: Tool service

    Returns:
        Updated Tool instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 403 for auth

    Args:
        tool_id (UUID):
        body (ToolUpdate): Model for updating tool configuration.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ToolWithParameters]
    """

    kwargs = _get_kwargs(
        tool_id=tool_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    tool_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: ToolUpdate,
) -> HTTPValidationError | ToolWithParameters | None:
    """Patch Tool

     Update tool status (enable/disable).

    Updates the tool's status to enable or disable it for use.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        tool_id: UUID of the tool to update
        tool_update: Tool update data with status
        service: Tool service

    Returns:
        Updated Tool instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 403 for auth

    Args:
        tool_id (UUID):
        body (ToolUpdate): Model for updating tool configuration.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ToolWithParameters
    """

    return sync_detailed(
        tool_id=tool_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    tool_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: ToolUpdate,
) -> Response[HTTPValidationError | ToolWithParameters]:
    """Patch Tool

     Update tool status (enable/disable).

    Updates the tool's status to enable or disable it for use.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        tool_id: UUID of the tool to update
        tool_update: Tool update data with status
        service: Tool service

    Returns:
        Updated Tool instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 403 for auth

    Args:
        tool_id (UUID):
        body (ToolUpdate): Model for updating tool configuration.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ToolWithParameters]
    """

    kwargs = _get_kwargs(
        tool_id=tool_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    tool_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: ToolUpdate,
) -> HTTPValidationError | ToolWithParameters | None:
    """Patch Tool

     Update tool status (enable/disable).

    Updates the tool's status to enable or disable it for use.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        tool_id: UUID of the tool to update
        tool_update: Tool update data with status
        service: Tool service

    Returns:
        Updated Tool instance

    Raises:
        HTTPException: 400 for validation errors, 404 if not found, 403 for auth

    Args:
        tool_id (UUID):
        body (ToolUpdate): Model for updating tool configuration.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ToolWithParameters
    """

    return (
        await asyncio_detailed(
            tool_id=tool_id,
            client=client,
            body=body,
        )
    ).parsed
