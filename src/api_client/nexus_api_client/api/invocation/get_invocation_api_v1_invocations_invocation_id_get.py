from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.invocation import Invocation
from ...types import Response


def _get_kwargs(
    invocation_id: str,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/api/v1/invocations/{invocation_id}",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | Invocation | None:
    if response.status_code == 200:
        response_200 = Invocation.from_dict(response.json())

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
) -> Response[HTTPValidationError | Invocation]:
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
) -> Response[HTTPValidationError | Invocation]:
    """Get Invocation Details (Testing/Debug)

     Retrieve full invocation details including the result. NOTE: This endpoint is for testing and
    debugging. Production systems should use WebSockets for real-time results.

    Args:
        invocation_id (str): UUID of the invocation to retrieve

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | Invocation]
    """

    kwargs = _get_kwargs(
        invocation_id=invocation_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    invocation_id: str,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | Invocation | None:
    """Get Invocation Details (Testing/Debug)

     Retrieve full invocation details including the result. NOTE: This endpoint is for testing and
    debugging. Production systems should use WebSockets for real-time results.

    Args:
        invocation_id (str): UUID of the invocation to retrieve

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | Invocation
    """

    return sync_detailed(
        invocation_id=invocation_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    invocation_id: str,
    *,
    client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | Invocation]:
    """Get Invocation Details (Testing/Debug)

     Retrieve full invocation details including the result. NOTE: This endpoint is for testing and
    debugging. Production systems should use WebSockets for real-time results.

    Args:
        invocation_id (str): UUID of the invocation to retrieve

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | Invocation]
    """

    kwargs = _get_kwargs(
        invocation_id=invocation_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    invocation_id: str,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | Invocation | None:
    """Get Invocation Details (Testing/Debug)

     Retrieve full invocation details including the result. NOTE: This endpoint is for testing and
    debugging. Production systems should use WebSockets for real-time results.

    Args:
        invocation_id (str): UUID of the invocation to retrieve

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | Invocation
    """

    return (
        await asyncio_detailed(
            invocation_id=invocation_id,
            client=client,
        )
    ).parsed
