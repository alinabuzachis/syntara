from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.execution_read import ExecutionRead
from ...models.http_validation_error import HTTPValidationError
from ...types import UNSET, Response, Unset


def _get_kwargs(
    execution_id: UUID, *, include: None | str | Unset = UNSET, additional_params: dict[str, Any] | None = None
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if isinstance(additional_params, dict):
        params = additional_params

    json_include: None | str | Unset
    if isinstance(include, Unset):
        json_include = UNSET
    else:
        json_include = include
    params["include"] = json_include

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/api/v1/executions/{execution_id}",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ExecutionRead | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = ExecutionRead.from_dict(response.json())

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
) -> Response[ExecutionRead | HTTPValidationError]:
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
    include: None | str | Unset = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> Response[ExecutionRead | HTTPValidationError]:
    """Get Execution

     Get an execution by ID.

    Args:
        execution_id: Execution ID
        include_params: Include parameters (validated by Pydantic)
        service: Execution service (injected by FastAPI)

    Returns:
        Execution details with current status, timestamps, and error details if failed

    Raises:
        HTTPException: 404 if execution not found

    Args:
        execution_id (UUID):
        include (None | str | Unset): Comma-separated list of related data to include. Valid
            values: workflow_definition, activities

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ExecutionRead | HTTPValidationError]
    """

    kwargs = _get_kwargs(execution_id=execution_id, include=include, additional_params=additional_params)

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    execution_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    include: None | str | Unset = UNSET,
) -> ExecutionRead | HTTPValidationError | None:
    """Get Execution

     Get an execution by ID.

    Args:
        execution_id: Execution ID
        include_params: Include parameters (validated by Pydantic)
        service: Execution service (injected by FastAPI)

    Returns:
        Execution details with current status, timestamps, and error details if failed

    Raises:
        HTTPException: 404 if execution not found

    Args:
        execution_id (UUID):
        include (None | str | Unset): Comma-separated list of related data to include. Valid
            values: workflow_definition, activities

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ExecutionRead | HTTPValidationError
    """

    return sync_detailed(
        execution_id=execution_id,
        client=client,
        include=include,
    ).parsed


async def asyncio_detailed(
    execution_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    include: None | str | Unset = UNSET,
) -> Response[ExecutionRead | HTTPValidationError]:
    """Get Execution

     Get an execution by ID.

    Args:
        execution_id: Execution ID
        include_params: Include parameters (validated by Pydantic)
        service: Execution service (injected by FastAPI)

    Returns:
        Execution details with current status, timestamps, and error details if failed

    Raises:
        HTTPException: 404 if execution not found

    Args:
        execution_id (UUID):
        include (None | str | Unset): Comma-separated list of related data to include. Valid
            values: workflow_definition, activities

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ExecutionRead | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        execution_id=execution_id,
        include=include,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    execution_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    include: None | str | Unset = UNSET,
) -> ExecutionRead | HTTPValidationError | None:
    """Get Execution

     Get an execution by ID.

    Args:
        execution_id: Execution ID
        include_params: Include parameters (validated by Pydantic)
        service: Execution service (injected by FastAPI)

    Returns:
        Execution details with current status, timestamps, and error details if failed

    Raises:
        HTTPException: 404 if execution not found

    Args:
        execution_id (UUID):
        include (None | str | Unset): Comma-separated list of related data to include. Valid
            values: workflow_definition, activities

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ExecutionRead | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            execution_id=execution_id,
            client=client,
            include=include,
        )
    ).parsed
