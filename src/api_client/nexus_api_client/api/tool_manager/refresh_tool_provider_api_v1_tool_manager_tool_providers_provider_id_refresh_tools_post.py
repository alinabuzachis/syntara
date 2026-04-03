from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.tool_provider_refresh_result import ToolProviderRefreshResult
from ...types import Response


def _get_kwargs(
    provider_id: UUID,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": f"/api/v1/tool_manager/tool_providers/{provider_id}/refresh_tools",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | ToolProviderRefreshResult | None:
    if response.status_code == 200:
        response_200 = ToolProviderRefreshResult.from_dict(response.json())

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
) -> Response[HTTPValidationError | ToolProviderRefreshResult]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    provider_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | ToolProviderRefreshResult]:
    """Refresh Tool Provider

     Refresh tools from Tool Provider.

    Connects to the tool provider and refreshes the list of available tools.
    Creates new tools, updates existing ones, and disables missing tools.

    Args:
        provider_id: UUID of the provider to refresh
        service: Tool provider service

    Returns:
        Refresh statistics including counts and timestamp

    Raises:
        HTTPException: 400 for refresh failure, 404 if not found, 403 for auth

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ToolProviderRefreshResult]
    """

    kwargs = _get_kwargs(
        provider_id=provider_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    provider_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | ToolProviderRefreshResult | None:
    """Refresh Tool Provider

     Refresh tools from Tool Provider.

    Connects to the tool provider and refreshes the list of available tools.
    Creates new tools, updates existing ones, and disables missing tools.

    Args:
        provider_id: UUID of the provider to refresh
        service: Tool provider service

    Returns:
        Refresh statistics including counts and timestamp

    Raises:
        HTTPException: 400 for refresh failure, 404 if not found, 403 for auth

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ToolProviderRefreshResult
    """

    return sync_detailed(
        provider_id=provider_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    provider_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | ToolProviderRefreshResult]:
    """Refresh Tool Provider

     Refresh tools from Tool Provider.

    Connects to the tool provider and refreshes the list of available tools.
    Creates new tools, updates existing ones, and disables missing tools.

    Args:
        provider_id: UUID of the provider to refresh
        service: Tool provider service

    Returns:
        Refresh statistics including counts and timestamp

    Raises:
        HTTPException: 400 for refresh failure, 404 if not found, 403 for auth

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ToolProviderRefreshResult]
    """

    kwargs = _get_kwargs(
        provider_id=provider_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    provider_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | ToolProviderRefreshResult | None:
    """Refresh Tool Provider

     Refresh tools from Tool Provider.

    Connects to the tool provider and refreshes the list of available tools.
    Creates new tools, updates existing ones, and disables missing tools.

    Args:
        provider_id: UUID of the provider to refresh
        service: Tool provider service

    Returns:
        Refresh statistics including counts and timestamp

    Raises:
        HTTPException: 400 for refresh failure, 404 if not found, 403 for auth

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ToolProviderRefreshResult
    """

    return (
        await asyncio_detailed(
            provider_id=provider_id,
            client=client,
        )
    ).parsed
