from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.tool_provider_create import ToolProviderCreate
from ...models.tool_provider_with_configuration import ToolProviderWithConfiguration
from ...types import Response


def _get_kwargs(
    provider_id: UUID,
    *,
    body: ToolProviderCreate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": f"/tool_manager/tool_providers/{provider_id}",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
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
    body: ToolProviderCreate,
) -> Response[ErrorData | ToolProviderWithConfiguration]:
    """Update Tool Provider

     Update Tool Provider configuration (complete replacement).

    Args:
        provider_id (UUID):
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
        Response[ErrorData | ToolProviderWithConfiguration]
    """

    kwargs = _get_kwargs(
        provider_id=provider_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    provider_id: UUID,
    *,
    client: AuthenticatedClient,
    body: ToolProviderCreate,
) -> ErrorData | ToolProviderWithConfiguration | None:
    """Update Tool Provider

     Update Tool Provider configuration (complete replacement).

    Args:
        provider_id (UUID):
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
        ErrorData | ToolProviderWithConfiguration
    """

    return sync_detailed(
        provider_id=provider_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    provider_id: UUID,
    *,
    client: AuthenticatedClient,
    body: ToolProviderCreate,
) -> Response[ErrorData | ToolProviderWithConfiguration]:
    """Update Tool Provider

     Update Tool Provider configuration (complete replacement).

    Args:
        provider_id (UUID):
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
        Response[ErrorData | ToolProviderWithConfiguration]
    """

    kwargs = _get_kwargs(
        provider_id=provider_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    provider_id: UUID,
    *,
    client: AuthenticatedClient,
    body: ToolProviderCreate,
) -> ErrorData | ToolProviderWithConfiguration | None:
    """Update Tool Provider

     Update Tool Provider configuration (complete replacement).

    Args:
        provider_id (UUID):
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
        ErrorData | ToolProviderWithConfiguration
    """

    return (
        await asyncio_detailed(
            provider_id=provider_id,
            client=client,
            body=body,
        )
    ).parsed
