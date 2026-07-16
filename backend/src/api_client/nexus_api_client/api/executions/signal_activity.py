from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.activity_signal_payload import ActivitySignalPayload
from ...models.error_data import ErrorData
from ...models.signal_response import SignalResponse
from ...types import Response


def _get_kwargs(
    execution_id: UUID,
    activity_id: str,
    *,
    body: ActivitySignalPayload,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": f"/executions/{execution_id}/activities/{activity_id}/signal",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | SignalResponse | None:
    if response.status_code == 200:
        response_200 = SignalResponse.from_dict(response.json())

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

    if response.status_code == 429:
        response_429 = ErrorData.from_dict(response.json())

        return response_429

    if response.status_code == 500:
        response_500 = ErrorData.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ErrorData | SignalResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    execution_id: UUID,
    activity_id: str,
    *,
    client: AuthenticatedClient,
    body: ActivitySignalPayload,
) -> Response[ErrorData | SignalResponse]:
    """Send signal to activity in workflow

     Send a signal to a specific activity within a running workflow execution.

    Args:
        execution_id (UUID):
        activity_id (str):
        body (ActivitySignalPayload): Generic signal payload for sending arbitrary data to a
            specific activity within a running workflow execution.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | SignalResponse]
    """

    kwargs = _get_kwargs(
        execution_id=execution_id,
        activity_id=activity_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    execution_id: UUID,
    activity_id: str,
    *,
    client: AuthenticatedClient,
    body: ActivitySignalPayload,
) -> ErrorData | SignalResponse | None:
    """Send signal to activity in workflow

     Send a signal to a specific activity within a running workflow execution.

    Args:
        execution_id (UUID):
        activity_id (str):
        body (ActivitySignalPayload): Generic signal payload for sending arbitrary data to a
            specific activity within a running workflow execution.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | SignalResponse
    """

    return sync_detailed(
        execution_id=execution_id,
        activity_id=activity_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    execution_id: UUID,
    activity_id: str,
    *,
    client: AuthenticatedClient,
    body: ActivitySignalPayload,
) -> Response[ErrorData | SignalResponse]:
    """Send signal to activity in workflow

     Send a signal to a specific activity within a running workflow execution.

    Args:
        execution_id (UUID):
        activity_id (str):
        body (ActivitySignalPayload): Generic signal payload for sending arbitrary data to a
            specific activity within a running workflow execution.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | SignalResponse]
    """

    kwargs = _get_kwargs(
        execution_id=execution_id,
        activity_id=activity_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    execution_id: UUID,
    activity_id: str,
    *,
    client: AuthenticatedClient,
    body: ActivitySignalPayload,
) -> ErrorData | SignalResponse | None:
    """Send signal to activity in workflow

     Send a signal to a specific activity within a running workflow execution.

    Args:
        execution_id (UUID):
        activity_id (str):
        body (ActivitySignalPayload): Generic signal payload for sending arbitrary data to a
            specific activity within a running workflow execution.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | SignalResponse
    """

    return (
        await asyncio_detailed(
            execution_id=execution_id,
            activity_id=activity_id,
            client=client,
            body=body,
        )
    ).parsed
