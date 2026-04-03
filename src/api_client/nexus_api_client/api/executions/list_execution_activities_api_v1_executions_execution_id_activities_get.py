from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.activity_execution import ActivityExecution
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    execution_id: UUID,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/api/v1/executions/{execution_id}/activities",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | list[ActivityExecution] | None:
    if response.status_code == 200:
        response_200 = []
        _response_200 = response.json()
        for response_200_item_data in _response_200:
            response_200_item = ActivityExecution.from_dict(response_200_item_data)

            response_200.append(response_200_item)

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
) -> Response[HTTPValidationError | list[ActivityExecution]]:
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
    *,
    client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | list[ActivityExecution]]:
    """List Execution Activities

     List all activities for a workflow execution.

    Returns persisted activity data from database. Activities are synced from Temporal
    and stored to enable querying after Temporal's retention period expires.

    Args:
        execution_id: Execution ID
        service: Execution service (injected by FastAPI)

    Returns:
        List of activity executions

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 500 if Temporal query fails

    Args:
        execution_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | list[ActivityExecution]]
    """

    kwargs = _get_kwargs(
        execution_id=execution_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    execution_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | list[ActivityExecution] | None:
    """List Execution Activities

     List all activities for a workflow execution.

    Returns persisted activity data from database. Activities are synced from Temporal
    and stored to enable querying after Temporal's retention period expires.

    Args:
        execution_id: Execution ID
        service: Execution service (injected by FastAPI)

    Returns:
        List of activity executions

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 500 if Temporal query fails

    Args:
        execution_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | list[ActivityExecution]
    """

    return sync_detailed(
        execution_id=execution_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    execution_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | list[ActivityExecution]]:
    """List Execution Activities

     List all activities for a workflow execution.

    Returns persisted activity data from database. Activities are synced from Temporal
    and stored to enable querying after Temporal's retention period expires.

    Args:
        execution_id: Execution ID
        service: Execution service (injected by FastAPI)

    Returns:
        List of activity executions

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 500 if Temporal query fails

    Args:
        execution_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | list[ActivityExecution]]
    """

    kwargs = _get_kwargs(
        execution_id=execution_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    execution_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | list[ActivityExecution] | None:
    """List Execution Activities

     List all activities for a workflow execution.

    Returns persisted activity data from database. Activities are synced from Temporal
    and stored to enable querying after Temporal's retention period expires.

    Args:
        execution_id: Execution ID
        service: Execution service (injected by FastAPI)

    Returns:
        List of activity executions

    Raises:
        HTTPException: 404 if execution not found
        HTTPException: 500 if Temporal query fails

    Args:
        execution_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | list[ActivityExecution]
    """

    return (
        await asyncio_detailed(
            execution_id=execution_id,
            client=client,
        )
    ).parsed
