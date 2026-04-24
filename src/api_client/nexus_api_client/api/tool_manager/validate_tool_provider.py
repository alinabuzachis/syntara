from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.tool_provider_validation_result import ToolProviderValidationResult
from ...types import Response


def _get_kwargs(
    provider_id: UUID,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": f"/tool_manager/tool_providers/{provider_id}/validate",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | ToolProviderValidationResult | None:
    if response.status_code == 200:
        response_200 = ToolProviderValidationResult.from_dict(response.json())

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
) -> Response[ErrorData | ToolProviderValidationResult]:
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
) -> Response[ErrorData | ToolProviderValidationResult]:
    """Validate Tool Provider

     Validate Tool Provider connection and capabilities.

    Tests the connection to the tool provider and validates compatibility.
    Updates the provider status based on validation results.

    Args:
        provider_id: UUID of the provider to validate
        service: Tool provider service

    Returns:
        Validation result with status and capability details (always 200)

    Raises:
        HTTPException: 404 if not found, 403 for auth, 500 for unexpected errors

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ToolProviderValidationResult]
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
) -> ErrorData | ToolProviderValidationResult | None:
    """Validate Tool Provider

     Validate Tool Provider connection and capabilities.

    Tests the connection to the tool provider and validates compatibility.
    Updates the provider status based on validation results.

    Args:
        provider_id: UUID of the provider to validate
        service: Tool provider service

    Returns:
        Validation result with status and capability details (always 200)

    Raises:
        HTTPException: 404 if not found, 403 for auth, 500 for unexpected errors

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ToolProviderValidationResult
    """

    return sync_detailed(
        provider_id=provider_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    provider_id: UUID,
    *,
    client: AuthenticatedClient,
) -> Response[ErrorData | ToolProviderValidationResult]:
    """Validate Tool Provider

     Validate Tool Provider connection and capabilities.

    Tests the connection to the tool provider and validates compatibility.
    Updates the provider status based on validation results.

    Args:
        provider_id: UUID of the provider to validate
        service: Tool provider service

    Returns:
        Validation result with status and capability details (always 200)

    Raises:
        HTTPException: 404 if not found, 403 for auth, 500 for unexpected errors

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ToolProviderValidationResult]
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
) -> ErrorData | ToolProviderValidationResult | None:
    """Validate Tool Provider

     Validate Tool Provider connection and capabilities.

    Tests the connection to the tool provider and validates compatibility.
    Updates the provider status based on validation results.

    Args:
        provider_id: UUID of the provider to validate
        service: Tool provider service

    Returns:
        Validation result with status and capability details (always 200)

    Raises:
        HTTPException: 404 if not found, 403 for auth, 500 for unexpected errors

    Args:
        provider_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ToolProviderValidationResult
    """

    return (
        await asyncio_detailed(
            provider_id=provider_id,
            client=client,
        )
    ).parsed
