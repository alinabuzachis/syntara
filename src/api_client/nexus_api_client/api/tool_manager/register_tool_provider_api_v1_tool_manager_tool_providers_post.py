from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.tool_provider_create import ToolProviderCreate
from ...models.tool_provider_with_configuration import ToolProviderWithConfiguration
from ...types import Response


def _get_kwargs(
    *,
    body: ToolProviderCreate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/tool_manager/tool_providers",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | ToolProviderWithConfiguration | None:
    if response.status_code == 201:
        response_201 = ToolProviderWithConfiguration.from_dict(response.json())

        return response_201

    if response.status_code == 422:
        response_422 = HTTPValidationError.from_dict(response.json())

        return response_422

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[HTTPValidationError | ToolProviderWithConfiguration]:
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
    body: ToolProviderCreate,
) -> Response[HTTPValidationError | ToolProviderWithConfiguration]:
    """Register Tool Provider

     Register a new Tool Provider.

    Creates a new tool provider with the specified configuration.
    The provider starts in 'validating' status.

    Args:
        provider_create: Provider configuration and metadata
        service: Tool provider service

    Returns:
        Created ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 409 for name conflicts, 403 for auth

    Args:
        body (ToolProviderCreate): ToolProviderCreate model for creating new tool providers.

            Contains only the fields needed to create a new tool provider.
            This model is used for API requests when creating new tool providers.

            Attributes:
                name: Human-readable name (required, 1-255 chars)
                description: Optional detailed description (max 2000 chars)
                configuration: Provider configuration (required)

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ToolProviderWithConfiguration]
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
    body: ToolProviderCreate,
) -> HTTPValidationError | ToolProviderWithConfiguration | None:
    """Register Tool Provider

     Register a new Tool Provider.

    Creates a new tool provider with the specified configuration.
    The provider starts in 'validating' status.

    Args:
        provider_create: Provider configuration and metadata
        service: Tool provider service

    Returns:
        Created ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 409 for name conflicts, 403 for auth

    Args:
        body (ToolProviderCreate): ToolProviderCreate model for creating new tool providers.

            Contains only the fields needed to create a new tool provider.
            This model is used for API requests when creating new tool providers.

            Attributes:
                name: Human-readable name (required, 1-255 chars)
                description: Optional detailed description (max 2000 chars)
                configuration: Provider configuration (required)

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ToolProviderWithConfiguration
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: ToolProviderCreate,
) -> Response[HTTPValidationError | ToolProviderWithConfiguration]:
    """Register Tool Provider

     Register a new Tool Provider.

    Creates a new tool provider with the specified configuration.
    The provider starts in 'validating' status.

    Args:
        provider_create: Provider configuration and metadata
        service: Tool provider service

    Returns:
        Created ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 409 for name conflicts, 403 for auth

    Args:
        body (ToolProviderCreate): ToolProviderCreate model for creating new tool providers.

            Contains only the fields needed to create a new tool provider.
            This model is used for API requests when creating new tool providers.

            Attributes:
                name: Human-readable name (required, 1-255 chars)
                description: Optional detailed description (max 2000 chars)
                configuration: Provider configuration (required)

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ToolProviderWithConfiguration]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: ToolProviderCreate,
) -> HTTPValidationError | ToolProviderWithConfiguration | None:
    """Register Tool Provider

     Register a new Tool Provider.

    Creates a new tool provider with the specified configuration.
    The provider starts in 'validating' status.

    Args:
        provider_create: Provider configuration and metadata
        service: Tool provider service

    Returns:
        Created ToolProvider instance

    Raises:
        HTTPException: 400 for validation errors, 409 for name conflicts, 403 for auth

    Args:
        body (ToolProviderCreate): ToolProviderCreate model for creating new tool providers.

            Contains only the fields needed to create a new tool provider.
            This model is used for API requests when creating new tool providers.

            Attributes:
                name: Human-readable name (required, 1-255 chars)
                description: Optional detailed description (max 2000 chars)
                configuration: Provider configuration (required)

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ToolProviderWithConfiguration
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
