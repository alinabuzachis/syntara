from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.activity_signal_payload import ActivitySignalPayload
from ...models.http_validation_error import HTTPValidationError
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
        "url": f"/api/v1/executions/{execution_id}/activities/{activity_id}/signal",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | SignalResponse | None:
    if response.status_code == 200:
        response_200 = SignalResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | SignalResponse]:
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
    client: AuthenticatedClient | Client,
    body: ActivitySignalPayload,
) -> Response[HTTPValidationError | SignalResponse]:
    """Signal Activity

     Send a signal to a specific activity in a workflow execution.

    This endpoint allows external systems to send arbitrary signals to
    activities that are waiting for external events. The activity must be
    designed to handle signals via the workflow's signal handler.

    Args:
        execution_id: Execution ID
        activity_id: Activity ID from workflow definition
        payload: Signal payload containing signal_data
        service: Execution service (injected by FastAPI)

    Returns:
        Signal response confirming delivery

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 503 if Temporal unavailable
        HTTPException: 500 if signal fails

    Args:
        execution_id (UUID):
        activity_id (str):
        body (ActivitySignalPayload): Generic signal payload for sending arbitrary data to a
            specific activity within a running workflow execution.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SignalResponse]
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
    client: AuthenticatedClient | Client,
    body: ActivitySignalPayload,
) -> HTTPValidationError | SignalResponse | None:
    """Signal Activity

     Send a signal to a specific activity in a workflow execution.

    This endpoint allows external systems to send arbitrary signals to
    activities that are waiting for external events. The activity must be
    designed to handle signals via the workflow's signal handler.

    Args:
        execution_id: Execution ID
        activity_id: Activity ID from workflow definition
        payload: Signal payload containing signal_data
        service: Execution service (injected by FastAPI)

    Returns:
        Signal response confirming delivery

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 503 if Temporal unavailable
        HTTPException: 500 if signal fails

    Args:
        execution_id (UUID):
        activity_id (str):
        body (ActivitySignalPayload): Generic signal payload for sending arbitrary data to a
            specific activity within a running workflow execution.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SignalResponse
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
    client: AuthenticatedClient | Client,
    body: ActivitySignalPayload,
) -> Response[HTTPValidationError | SignalResponse]:
    """Signal Activity

     Send a signal to a specific activity in a workflow execution.

    This endpoint allows external systems to send arbitrary signals to
    activities that are waiting for external events. The activity must be
    designed to handle signals via the workflow's signal handler.

    Args:
        execution_id: Execution ID
        activity_id: Activity ID from workflow definition
        payload: Signal payload containing signal_data
        service: Execution service (injected by FastAPI)

    Returns:
        Signal response confirming delivery

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 503 if Temporal unavailable
        HTTPException: 500 if signal fails

    Args:
        execution_id (UUID):
        activity_id (str):
        body (ActivitySignalPayload): Generic signal payload for sending arbitrary data to a
            specific activity within a running workflow execution.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | SignalResponse]
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
    client: AuthenticatedClient | Client,
    body: ActivitySignalPayload,
) -> HTTPValidationError | SignalResponse | None:
    """Signal Activity

     Send a signal to a specific activity in a workflow execution.

    This endpoint allows external systems to send arbitrary signals to
    activities that are waiting for external events. The activity must be
    designed to handle signals via the workflow's signal handler.

    Args:
        execution_id: Execution ID
        activity_id: Activity ID from workflow definition
        payload: Signal payload containing signal_data
        service: Execution service (injected by FastAPI)

    Returns:
        Signal response confirming delivery

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 503 if Temporal unavailable
        HTTPException: 500 if signal fails

    Args:
        execution_id (UUID):
        activity_id (str):
        body (ActivitySignalPayload): Generic signal payload for sending arbitrary data to a
            specific activity within a running workflow execution.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | SignalResponse
    """

    return (
        await asyncio_detailed(
            execution_id=execution_id,
            activity_id=activity_id,
            client=client,
            body=body,
        )
    ).parsed
