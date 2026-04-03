from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.http_validation_error import HTTPValidationError
from ...models.workflow_version_list_response import WorkflowVersionListResponse
from ...types import Response


def _get_kwargs(
    workflow_id: UUID,
) -> dict[str, Any]:
    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/api/v1/workflows/{workflow_id}/versions",
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | WorkflowVersionListResponse | None:
    if response.status_code == 200:
        response_200 = WorkflowVersionListResponse.from_dict(response.json())

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
) -> Response[HTTPValidationError | WorkflowVersionListResponse]:
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
) -> Response[HTTPValidationError | WorkflowVersionListResponse]:
    """List Workflow Versions

     List all versions for a workflow.

    Args:
        workflow_id: Workflow UUID
        db: Database session

    Returns:
        List of versions ordered by version DESC

    Raises:
        HTTPException: 404 if workflow not found

    Args:
        workflow_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | WorkflowVersionListResponse]
    """

    kwargs = _get_kwargs(
        workflow_id=workflow_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    workflow_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | WorkflowVersionListResponse | None:
    """List Workflow Versions

     List all versions for a workflow.

    Args:
        workflow_id: Workflow UUID
        db: Database session

    Returns:
        List of versions ordered by version DESC

    Raises:
        HTTPException: 404 if workflow not found

    Args:
        workflow_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | WorkflowVersionListResponse
    """

    return sync_detailed(
        workflow_id=workflow_id,
        client=client,
    ).parsed


async def asyncio_detailed(
    workflow_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> Response[HTTPValidationError | WorkflowVersionListResponse]:
    """List Workflow Versions

     List all versions for a workflow.

    Args:
        workflow_id: Workflow UUID
        db: Database session

    Returns:
        List of versions ordered by version DESC

    Raises:
        HTTPException: 404 if workflow not found

    Args:
        workflow_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | WorkflowVersionListResponse]
    """

    kwargs = _get_kwargs(
        workflow_id=workflow_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    workflow_id: UUID,
    *,
    client: AuthenticatedClient | Client,
) -> HTTPValidationError | WorkflowVersionListResponse | None:
    """List Workflow Versions

     List all versions for a workflow.

    Args:
        workflow_id: Workflow UUID
        db: Database session

    Returns:
        List of versions ordered by version DESC

    Raises:
        HTTPException: 404 if workflow not found

    Args:
        workflow_id (UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | WorkflowVersionListResponse
    """

    return (
        await asyncio_detailed(
            workflow_id=workflow_id,
            client=client,
        )
    ).parsed
