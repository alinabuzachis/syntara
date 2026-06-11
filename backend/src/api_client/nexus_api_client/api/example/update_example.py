from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.example_item import ExampleItem
from ...models.example_update import ExampleUpdate
from ...types import Response


def _get_kwargs(
    item_id: int,
    *,
    body: ExampleUpdate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": f"/example/{item_id}",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | ExampleItem | None:
    if response.status_code == 200:
        response_200 = ExampleItem.from_dict(response.json())

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
) -> Response[ErrorData | ExampleItem]:
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
    body: ExampleUpdate,
) -> Response[ErrorData | ExampleItem]:
    """Update example item

     Updates an existing example item

    Args:
        item_id (int): Example item ID
        body (ExampleUpdate): Schema for updating an example item (PUT /example/{item_id}).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ExampleItem]
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
    body: ExampleUpdate,
) -> ErrorData | ExampleItem | None:
    """Update example item

     Updates an existing example item

    Args:
        item_id (int): Example item ID
        body (ExampleUpdate): Schema for updating an example item (PUT /example/{item_id}).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ExampleItem
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
    body: ExampleUpdate,
) -> Response[ErrorData | ExampleItem]:
    """Update example item

     Updates an existing example item

    Args:
        item_id (int): Example item ID
        body (ExampleUpdate): Schema for updating an example item (PUT /example/{item_id}).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ExampleItem]
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
    body: ExampleUpdate,
) -> ErrorData | ExampleItem | None:
    """Update example item

     Updates an existing example item

    Args:
        item_id (int): Example item ID
        body (ExampleUpdate): Schema for updating an example item (PUT /example/{item_id}).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ExampleItem
    """

    return (
        await asyncio_detailed(
            item_id=item_id,
            client=client,
            body=body,
        )
    ).parsed
