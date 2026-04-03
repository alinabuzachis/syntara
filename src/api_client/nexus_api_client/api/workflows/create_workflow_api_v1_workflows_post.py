from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.workflow_create import WorkflowCreate
from ...models.workflow_read import WorkflowRead
from ...types import Response


def _get_kwargs(
    *,
    body: WorkflowCreate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/workflows",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | WorkflowRead | None:
    if response.status_code == 201:
        response_201 = WorkflowRead.from_dict(response.json())

        return response_201

    if response.status_code == 422:
        response_422 = HTTPValidationError.from_dict(response.json())

        return response_422

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[HTTPValidationError | WorkflowRead]:
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
    body: WorkflowCreate,
) -> Response[HTTPValidationError | WorkflowRead]:
    """Create Workflow

     Create a new workflow with initial version.

    Args:
        request: Workflow creation request
        service: Workflow service

    Returns:
        Created workflow

    Raises:
        HTTPException: 400 if validation fails or name already exists

    Args:
        body (WorkflowCreate): Schema for creating a new workflow (POST /workflows).

            Excludes auto-generated fields: id, created_at, updated_at, created_by (set by backend).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | WorkflowRead]
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
    body: WorkflowCreate,
) -> HTTPValidationError | WorkflowRead | None:
    """Create Workflow

     Create a new workflow with initial version.

    Args:
        request: Workflow creation request
        service: Workflow service

    Returns:
        Created workflow

    Raises:
        HTTPException: 400 if validation fails or name already exists

    Args:
        body (WorkflowCreate): Schema for creating a new workflow (POST /workflows).

            Excludes auto-generated fields: id, created_at, updated_at, created_by (set by backend).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | WorkflowRead
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: WorkflowCreate,
) -> Response[HTTPValidationError | WorkflowRead]:
    """Create Workflow

     Create a new workflow with initial version.

    Args:
        request: Workflow creation request
        service: Workflow service

    Returns:
        Created workflow

    Raises:
        HTTPException: 400 if validation fails or name already exists

    Args:
        body (WorkflowCreate): Schema for creating a new workflow (POST /workflows).

            Excludes auto-generated fields: id, created_at, updated_at, created_by (set by backend).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | WorkflowRead]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: WorkflowCreate,
) -> HTTPValidationError | WorkflowRead | None:
    """Create Workflow

     Create a new workflow with initial version.

    Args:
        request: Workflow creation request
        service: Workflow service

    Returns:
        Created workflow

    Raises:
        HTTPException: 400 if validation fails or name already exists

    Args:
        body (WorkflowCreate): Schema for creating a new workflow (POST /workflows).

            Excludes auto-generated fields: id, created_at, updated_at, created_by (set by backend).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | WorkflowRead
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
