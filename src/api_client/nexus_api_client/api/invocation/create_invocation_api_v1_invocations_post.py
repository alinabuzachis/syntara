from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.body_create_invocation_api_v1_invocations_post import BodyCreateInvocationApiV1InvocationsPost
from ...models.http_validation_error import HTTPValidationError
from ...models.invocation import Invocation
from ...types import Response, Unset


def _get_kwargs(
    *,
    body: BodyCreateInvocationApiV1InvocationsPost | Unset,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/invocations",
    }

    if not isinstance(body, Unset):
        _kwargs["files"] = body.to_multipart()

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | Invocation | None:
    if response.status_code == 202:
        response_202 = Invocation.from_dict(response.json())

        return response_202

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
    *,
    client: AuthenticatedClient | Client,
    body: BodyCreateInvocationApiV1InvocationsPost | Unset,
) -> Response[HTTPValidationError | Invocation]:
    """Create Invocation (Async)

     Accept async agent invocation request and return invocation ID immediately. Supports both
    application/json and multipart/form-data with optional file uploads.

    Args:
        body (BodyCreateInvocationApiV1InvocationsPost | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | Invocation]
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
    body: BodyCreateInvocationApiV1InvocationsPost | Unset,
) -> HTTPValidationError | Invocation | None:
    """Create Invocation (Async)

     Accept async agent invocation request and return invocation ID immediately. Supports both
    application/json and multipart/form-data with optional file uploads.

    Args:
        body (BodyCreateInvocationApiV1InvocationsPost | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | Invocation
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: BodyCreateInvocationApiV1InvocationsPost | Unset,
) -> Response[HTTPValidationError | Invocation]:
    """Create Invocation (Async)

     Accept async agent invocation request and return invocation ID immediately. Supports both
    application/json and multipart/form-data with optional file uploads.

    Args:
        body (BodyCreateInvocationApiV1InvocationsPost | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | Invocation]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: BodyCreateInvocationApiV1InvocationsPost | Unset,
) -> HTTPValidationError | Invocation | None:
    """Create Invocation (Async)

     Accept async agent invocation request and return invocation ID immediately. Supports both
    application/json and multipart/form-data with optional file uploads.

    Args:
        body (BodyCreateInvocationApiV1InvocationsPost | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | Invocation
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
