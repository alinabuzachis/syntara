from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.example_item import ExampleItem
from ...models.http_validation_error import HTTPValidationError
from ...models.update_example_request import UpdateExampleRequest
from ...types import Response


def _get_kwargs(
    item_id: int,
    *,
    body: UpdateExampleRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": f"/api/v1/example/{item_id}",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ExampleItem | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = ExampleItem.from_dict(response.json())

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
) -> Response[ExampleItem | HTTPValidationError]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    item_id: int,
    *,
    client: AuthenticatedClient | Client,
    body: UpdateExampleRequest,
) -> Response[ExampleItem | HTTPValidationError]:
    """Update Example

     Update an existing example item.

    Args:
        item_id: Example item ID
        request: The fields to update

    Returns:
        The updated example item

    Args:
        item_id (int):
        body (UpdateExampleRequest): Schema for updating an example item (PUT /example/{item_id}).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ExampleItem | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        item_id=item_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    item_id: int,
    *,
    client: AuthenticatedClient | Client,
    body: UpdateExampleRequest,
) -> ExampleItem | HTTPValidationError | None:
    """Update Example

     Update an existing example item.

    Args:
        item_id: Example item ID
        request: The fields to update

    Returns:
        The updated example item

    Args:
        item_id (int):
        body (UpdateExampleRequest): Schema for updating an example item (PUT /example/{item_id}).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ExampleItem | HTTPValidationError
    """

    return sync_detailed(
        item_id=item_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    item_id: int,
    *,
    client: AuthenticatedClient | Client,
    body: UpdateExampleRequest,
) -> Response[ExampleItem | HTTPValidationError]:
    """Update Example

     Update an existing example item.

    Args:
        item_id: Example item ID
        request: The fields to update

    Returns:
        The updated example item

    Args:
        item_id (int):
        body (UpdateExampleRequest): Schema for updating an example item (PUT /example/{item_id}).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ExampleItem | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        item_id=item_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    item_id: int,
    *,
    client: AuthenticatedClient | Client,
    body: UpdateExampleRequest,
) -> ExampleItem | HTTPValidationError | None:
    """Update Example

     Update an existing example item.

    Args:
        item_id: Example item ID
        request: The fields to update

    Returns:
        The updated example item

    Args:
        item_id (int):
        body (UpdateExampleRequest): Schema for updating an example item (PUT /example/{item_id}).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ExampleItem | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            item_id=item_id,
            client=client,
            body=body,
        )
    ).parsed
