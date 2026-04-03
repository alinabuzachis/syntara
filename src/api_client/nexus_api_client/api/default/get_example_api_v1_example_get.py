from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.example_list_response import ExampleListResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(*, limit: int | Unset = 10, additional_params: dict[str, Any] | None = None) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if isinstance(additional_params, dict):
        params = additional_params

    params["limit"] = limit

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/v1/example",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ExampleListResponse | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = ExampleListResponse.from_dict(response.json())

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
) -> Response[ExampleListResponse | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    *, client: AuthenticatedClient | Client, limit: int | Unset = 10, additional_params: dict[str, Any] | None = None
) -> Response[ExampleListResponse | HTTPValidationError]:
    """Get Example

     Get example data.

    Returns a list of example items for demonstration purposes.

    Args:
        limit: Maximum number of items to return (default: 10)

    Returns:
        Dictionary containing list of example items and total count

    Args:
        limit (int | Unset):  Default: 10.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ExampleListResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(limit=limit, additional_params=additional_params)

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
    limit: int | Unset = 10,
) -> ExampleListResponse | HTTPValidationError | None:
    """Get Example

     Get example data.

    Returns a list of example items for demonstration purposes.

    Args:
        limit: Maximum number of items to return (default: 10)

    Returns:
        Dictionary containing list of example items and total count

    Args:
        limit (int | Unset):  Default: 10.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ExampleListResponse | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        limit=limit,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    limit: int | Unset = 10,
) -> Response[ExampleListResponse | HTTPValidationError]:
    """Get Example

     Get example data.

    Returns a list of example items for demonstration purposes.

    Args:
        limit: Maximum number of items to return (default: 10)

    Returns:
        Dictionary containing list of example items and total count

    Args:
        limit (int | Unset):  Default: 10.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ExampleListResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        limit=limit,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    limit: int | Unset = 10,
) -> ExampleListResponse | HTTPValidationError | None:
    """Get Example

     Get example data.

    Returns a list of example items for demonstration purposes.

    Args:
        limit: Maximum number of items to return (default: 10)

    Returns:
        Dictionary containing list of example items and total count

    Args:
        limit (int | Unset):  Default: 10.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ExampleListResponse | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            limit=limit,
        )
    ).parsed
