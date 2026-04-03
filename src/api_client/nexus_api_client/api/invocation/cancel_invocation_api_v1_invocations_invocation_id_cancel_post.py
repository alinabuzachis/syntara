from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.invocation_cancel_request import InvocationCancelRequest
from ...models.invocation_cancel_response import InvocationCancelResponse
from ...types import Response


def _get_kwargs(
    invocation_id: str,
    *,
    body: InvocationCancelRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": f"/api/v1/invocations/{invocation_id}/cancel",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | InvocationCancelResponse | None:
    if response.status_code == 200:
        response_200 = InvocationCancelResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | InvocationCancelResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    invocation_id: str,
    *,
    client: AuthenticatedClient | Client,
    body: InvocationCancelRequest,
) -> Response[HTTPValidationError | InvocationCancelResponse]:
    """Cancel Invocation

     Cancel a running or pending invocation. Only the invocation owner can cancel it.

    Args:
        invocation_id (str): UUID of the invocation to cancel
        body (InvocationCancelRequest): Request schema for cancelling an invocation.

            Supports multiple field name formats:
            - camelCase (API contract): reason
            - snake_case (internal): reason

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | InvocationCancelResponse]
    """

    kwargs = _get_kwargs(
        invocation_id=invocation_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    invocation_id: str,
    *,
    client: AuthenticatedClient | Client,
    body: InvocationCancelRequest,
) -> HTTPValidationError | InvocationCancelResponse | None:
    """Cancel Invocation

     Cancel a running or pending invocation. Only the invocation owner can cancel it.

    Args:
        invocation_id (str): UUID of the invocation to cancel
        body (InvocationCancelRequest): Request schema for cancelling an invocation.

            Supports multiple field name formats:
            - camelCase (API contract): reason
            - snake_case (internal): reason

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | InvocationCancelResponse
    """

    return sync_detailed(
        invocation_id=invocation_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    invocation_id: str,
    *,
    client: AuthenticatedClient | Client,
    body: InvocationCancelRequest,
) -> Response[HTTPValidationError | InvocationCancelResponse]:
    """Cancel Invocation

     Cancel a running or pending invocation. Only the invocation owner can cancel it.

    Args:
        invocation_id (str): UUID of the invocation to cancel
        body (InvocationCancelRequest): Request schema for cancelling an invocation.

            Supports multiple field name formats:
            - camelCase (API contract): reason
            - snake_case (internal): reason

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | InvocationCancelResponse]
    """

    kwargs = _get_kwargs(
        invocation_id=invocation_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    invocation_id: str,
    *,
    client: AuthenticatedClient | Client,
    body: InvocationCancelRequest,
) -> HTTPValidationError | InvocationCancelResponse | None:
    """Cancel Invocation

     Cancel a running or pending invocation. Only the invocation owner can cancel it.

    Args:
        invocation_id (str): UUID of the invocation to cancel
        body (InvocationCancelRequest): Request schema for cancelling an invocation.

            Supports multiple field name formats:
            - camelCase (API contract): reason
            - snake_case (internal): reason

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | InvocationCancelResponse
    """

    return (
        await asyncio_detailed(
            invocation_id=invocation_id,
            client=client,
            body=body,
        )
    ).parsed
