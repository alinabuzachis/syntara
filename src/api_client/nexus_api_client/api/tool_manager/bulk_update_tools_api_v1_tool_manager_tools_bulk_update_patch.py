from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.bulk_update_tools_api_v1_tool_manager_tools_bulk_update_patch_response_bulk_update_tools_api_v1_tool_manager_tools_bulk_update_patch import (
    BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch,
)
from ...models.http_validation_error import HTTPValidationError
from ...models.tool_bulk_update import ToolBulkUpdate
from ...types import Response


def _get_kwargs(
    *,
    body: ToolBulkUpdate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "patch",
        "url": "/api/v1/tool_manager/tools/bulk_update",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> (
    BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch
    | HTTPValidationError
    | None
):
    if response.status_code == 200:
        response_200 = BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch.from_dict(
            response.json()
        )

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
) -> Response[
    BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch
    | HTTPValidationError
]:
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
    body: ToolBulkUpdate,
) -> Response[
    BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch
    | HTTPValidationError
]:
    """Bulk Update Tools

     Bulk update tool status (enable/disable multiple tools).

    Updates the status of multiple tools in a single operation.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        bulk_update: Bulk update request with tool IDs and status
        service: Tool service

    Returns:
        Dictionary with update statistics and timestamp

    Raises:
        HTTPException: 400 for validation errors, 403 for auth

    Args:
        body (ToolBulkUpdate): Request model for bulk updating tool status.

            Attributes:
                tool_ids: List of tool UUIDs to update (max 50)
                enabled: Enable or disable the Tool.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch | HTTPValidationError]
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
    body: ToolBulkUpdate,
) -> (
    BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch
    | HTTPValidationError
    | None
):
    """Bulk Update Tools

     Bulk update tool status (enable/disable multiple tools).

    Updates the status of multiple tools in a single operation.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        bulk_update: Bulk update request with tool IDs and status
        service: Tool service

    Returns:
        Dictionary with update statistics and timestamp

    Raises:
        HTTPException: 400 for validation errors, 403 for auth

    Args:
        body (ToolBulkUpdate): Request model for bulk updating tool status.

            Attributes:
                tool_ids: List of tool UUIDs to update (max 50)
                enabled: Enable or disable the Tool.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: ToolBulkUpdate,
) -> Response[
    BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch
    | HTTPValidationError
]:
    """Bulk Update Tools

     Bulk update tool status (enable/disable multiple tools).

    Updates the status of multiple tools in a single operation.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        bulk_update: Bulk update request with tool IDs and status
        service: Tool service

    Returns:
        Dictionary with update statistics and timestamp

    Raises:
        HTTPException: 400 for validation errors, 403 for auth

    Args:
        body (ToolBulkUpdate): Request model for bulk updating tool status.

            Attributes:
                tool_ids: List of tool UUIDs to update (max 50)
                enabled: Enable or disable the Tool.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: ToolBulkUpdate,
) -> (
    BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch
    | HTTPValidationError
    | None
):
    """Bulk Update Tools

     Bulk update tool status (enable/disable multiple tools).

    Updates the status of multiple tools in a single operation.
    Only admin-controllable status changes are allowed (available/disabled).

    Args:
        bulk_update: Bulk update request with tool IDs and status
        service: Tool service

    Returns:
        Dictionary with update statistics and timestamp

    Raises:
        HTTPException: 400 for validation errors, 403 for auth

    Args:
        body (ToolBulkUpdate): Request model for bulk updating tool status.

            Attributes:
                tool_ids: List of tool UUIDs to update (max 50)
                enabled: Enable or disable the Tool.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        BulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatchResponseBulkUpdateToolsApiV1ToolManagerToolsBulkUpdatePatch | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
