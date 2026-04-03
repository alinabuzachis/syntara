from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.tool_provider_create import ToolProviderCreate
from ...models.tool_provider_validation_result import ToolProviderValidationResult
from ...types import Response


def _get_kwargs(
    *,
    body: ToolProviderCreate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/tool_manager/tool_providers/test",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | ToolProviderValidationResult | None:
    if response.status_code == 200:
        response_200 = ToolProviderValidationResult.from_dict(response.json())

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
) -> Response[HTTPValidationError | ToolProviderValidationResult]:
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
) -> Response[HTTPValidationError | ToolProviderValidationResult]:
    """Test Tool Provider

     Test Tool Provider definition without saving to database.

    Validates the provider configuration and tests connectivity using the appropriate adapter.
    This endpoint allows testing provider definitions before registering them.

    Args:
        provider_create: Provider configuration to test
        service: Tool provider service

    Returns:
        ToolProviderValidationResult with test results (always 200)

    Raises:
        HTTPException: 403 for auth, 500 for unexpected errors

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
        Response[HTTPValidationError | ToolProviderValidationResult]
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
) -> HTTPValidationError | ToolProviderValidationResult | None:
    """Test Tool Provider

     Test Tool Provider definition without saving to database.

    Validates the provider configuration and tests connectivity using the appropriate adapter.
    This endpoint allows testing provider definitions before registering them.

    Args:
        provider_create: Provider configuration to test
        service: Tool provider service

    Returns:
        ToolProviderValidationResult with test results (always 200)

    Raises:
        HTTPException: 403 for auth, 500 for unexpected errors

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
        HTTPValidationError | ToolProviderValidationResult
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: ToolProviderCreate,
) -> Response[HTTPValidationError | ToolProviderValidationResult]:
    """Test Tool Provider

     Test Tool Provider definition without saving to database.

    Validates the provider configuration and tests connectivity using the appropriate adapter.
    This endpoint allows testing provider definitions before registering them.

    Args:
        provider_create: Provider configuration to test
        service: Tool provider service

    Returns:
        ToolProviderValidationResult with test results (always 200)

    Raises:
        HTTPException: 403 for auth, 500 for unexpected errors

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
        Response[HTTPValidationError | ToolProviderValidationResult]
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
) -> HTTPValidationError | ToolProviderValidationResult | None:
    """Test Tool Provider

     Test Tool Provider definition without saving to database.

    Validates the provider configuration and tests connectivity using the appropriate adapter.
    This endpoint allows testing provider definitions before registering them.

    Args:
        provider_create: Provider configuration to test
        service: Tool provider service

    Returns:
        ToolProviderValidationResult with test results (always 200)

    Raises:
        HTTPException: 403 for auth, 500 for unexpected errors

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
        HTTPValidationError | ToolProviderValidationResult
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
