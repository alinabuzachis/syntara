from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.workflow_read_with_version import WorkflowReadWithVersion
from ...models.workflow_update import WorkflowUpdate
from ...types import Response


def _get_kwargs(
    workflow_id: UUID,
    *,
    body: WorkflowUpdate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "patch",
        "url": f"/api/v1/workflows/{workflow_id}",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | WorkflowReadWithVersion | None:
    if response.status_code == 200:
        response_200 = WorkflowReadWithVersion.from_dict(response.json())

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
) -> Response[HTTPValidationError | WorkflowReadWithVersion]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    workflow_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: WorkflowUpdate,
) -> Response[HTTPValidationError | WorkflowReadWithVersion]:
    """Update Workflow

     Update workflow.

    Supports both metadata-only updates and workflow definition updates:
    - Metadata only (name, description, is_enabled, labels): Updates without creating new version
    - With workflow_definition: Validates definition, compares with current version, creates new
    WorkflowVersion
      only if definition differs (change detection optimization)

    Args:
        workflow_id: Workflow UUID
        request: Update request
        service: Workflow service

    Returns:
        Updated workflow with current version data

    Raises:
        HTTPException: 404 if workflow not found, 400 for validation errors

    Args:
        workflow_id (UUID):
        body (WorkflowUpdate): Schema for updating workflow (PATCH /workflows/{id}).

            All fields are optional for partial updates.
            Supports metadata updates and workflow definition updates (creates new version).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | WorkflowReadWithVersion]
    """

    kwargs = _get_kwargs(
        workflow_id=workflow_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    workflow_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: WorkflowUpdate,
) -> HTTPValidationError | WorkflowReadWithVersion | None:
    """Update Workflow

     Update workflow.

    Supports both metadata-only updates and workflow definition updates:
    - Metadata only (name, description, is_enabled, labels): Updates without creating new version
    - With workflow_definition: Validates definition, compares with current version, creates new
    WorkflowVersion
      only if definition differs (change detection optimization)

    Args:
        workflow_id: Workflow UUID
        request: Update request
        service: Workflow service

    Returns:
        Updated workflow with current version data

    Raises:
        HTTPException: 404 if workflow not found, 400 for validation errors

    Args:
        workflow_id (UUID):
        body (WorkflowUpdate): Schema for updating workflow (PATCH /workflows/{id}).

            All fields are optional for partial updates.
            Supports metadata updates and workflow definition updates (creates new version).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | WorkflowReadWithVersion
    """

    return sync_detailed(
        workflow_id=workflow_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    workflow_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: WorkflowUpdate,
) -> Response[HTTPValidationError | WorkflowReadWithVersion]:
    """Update Workflow

     Update workflow.

    Supports both metadata-only updates and workflow definition updates:
    - Metadata only (name, description, is_enabled, labels): Updates without creating new version
    - With workflow_definition: Validates definition, compares with current version, creates new
    WorkflowVersion
      only if definition differs (change detection optimization)

    Args:
        workflow_id: Workflow UUID
        request: Update request
        service: Workflow service

    Returns:
        Updated workflow with current version data

    Raises:
        HTTPException: 404 if workflow not found, 400 for validation errors

    Args:
        workflow_id (UUID):
        body (WorkflowUpdate): Schema for updating workflow (PATCH /workflows/{id}).

            All fields are optional for partial updates.
            Supports metadata updates and workflow definition updates (creates new version).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | WorkflowReadWithVersion]
    """

    kwargs = _get_kwargs(
        workflow_id=workflow_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    workflow_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: WorkflowUpdate,
) -> HTTPValidationError | WorkflowReadWithVersion | None:
    """Update Workflow

     Update workflow.

    Supports both metadata-only updates and workflow definition updates:
    - Metadata only (name, description, is_enabled, labels): Updates without creating new version
    - With workflow_definition: Validates definition, compares with current version, creates new
    WorkflowVersion
      only if definition differs (change detection optimization)

    Args:
        workflow_id: Workflow UUID
        request: Update request
        service: Workflow service

    Returns:
        Updated workflow with current version data

    Raises:
        HTTPException: 404 if workflow not found, 400 for validation errors

    Args:
        workflow_id (UUID):
        body (WorkflowUpdate): Schema for updating workflow (PATCH /workflows/{id}).

            All fields are optional for partial updates.
            Supports metadata updates and workflow definition updates (creates new version).

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | WorkflowReadWithVersion
    """

    return (
        await asyncio_detailed(
            workflow_id=workflow_id,
            client=client,
            body=body,
        )
    ).parsed
