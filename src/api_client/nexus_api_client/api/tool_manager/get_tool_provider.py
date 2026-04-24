from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.tool_provider_with_configuration import ToolProviderWithConfiguration
from ...types import Response


def _get_kwargs(
    provider_id: UUID,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/tool_manager/tool_providers/{provider_id}",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | ToolProviderWithConfiguration | None:
    if response.status_code == 200:
        response_200 = ToolProviderWithConfiguration.from_dict(response.json())

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
) -> Response[ErrorData | ToolProviderWithConfiguration]:
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
    client: AuthenticatedClient,
) -> Response[ErrorData | ToolProviderWithConfiguration]:
    """Get Tool Provider

     Get Tool Provider details by ID.

    Returns detailed information about a specific Tool Provider including
    configuration, status, and metadata.

    Args:
        provider_id: UUID of the provider to retrieve
        service: Tool provider service

    Returns:
        ToolProvider instance with full details

    Raises:
        HTTPException: 404 if provider not found, 403 for auth, 400 for invalid UUID

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ToolProviderWithConfiguration]
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
    client: AuthenticatedClient,
) -> ErrorData | ToolProviderWithConfiguration | None:
    """Get Tool Provider

     Get Tool Provider details by ID.

    Returns detailed information about a specific Tool Provider including
    configuration, status, and metadata.

    Args:
        provider_id: UUID of the provider to retrieve
        service: Tool provider service

    Returns:
        ToolProvider instance with full details

    Raises:
        HTTPException: 404 if provider not found, 403 for auth, 400 for invalid UUID

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ToolProviderWithConfiguration
    """

    return sync_detailed(
        provider_id=provider_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    provider_id: UUID,
    *,
    client: AuthenticatedClient,
) -> Response[ErrorData | ToolProviderWithConfiguration]:
    """Get Tool Provider

     Get Tool Provider details by ID.

    Returns detailed information about a specific Tool Provider including
    configuration, status, and metadata.

    Args:
        provider_id: UUID of the provider to retrieve
        service: Tool provider service

    Returns:
        ToolProvider instance with full details

    Raises:
        HTTPException: 404 if provider not found, 403 for auth, 400 for invalid UUID

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ToolProviderWithConfiguration]
    """

    kwargs = _get_kwargs(
        provider_id=provider_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    provider_id: UUID,
    *,
    client: AuthenticatedClient,
) -> ErrorData | ToolProviderWithConfiguration | None:
    """Get Tool Provider

     Get Tool Provider details by ID.

    Returns detailed information about a specific Tool Provider including
    configuration, status, and metadata.

    Args:
        provider_id: UUID of the provider to retrieve
        service: Tool provider service

    Returns:
        ToolProvider instance with full details

    Raises:
        HTTPException: 404 if provider not found, 403 for auth, 400 for invalid UUID

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ToolProviderWithConfiguration
    """

    return (
        await asyncio_detailed(
            provider_id=provider_id,
            client=client,
        )
    ).parsed
