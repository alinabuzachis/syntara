from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.approval_request_status import ApprovalRequestStatus
from ...models.http_validation_error import HTTPValidationError
from ...models.resources_response_approval_request import ResourcesResponseApprovalRequest
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    status: ApprovalRequestStatus | None | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if isinstance(additional_params, dict):
        params = additional_params

    params["limit"] = limit

    json_cursor: None | str | Unset
    if isinstance(cursor, Unset):
        json_cursor = UNSET
    else:
        json_cursor = cursor
    params["cursor"] = json_cursor

    json_sort: None | str | Unset
    if isinstance(sort, Unset):
        json_sort = UNSET
    else:
        json_sort = sort
    params["sort"] = json_sort

    params["include_total"] = include_total

    json_status: None | str | Unset
    if isinstance(status, Unset):
        json_status = UNSET
    elif isinstance(status, ApprovalRequestStatus):
        json_status = status.value
    else:
        json_status = status
    params["status"] = json_status

    json_execution_id: None | str | Unset
    if isinstance(execution_id, Unset):
        json_execution_id = UNSET
    elif isinstance(execution_id, UUID):
        json_execution_id = str(execution_id)
    else:
        json_execution_id = execution_id
    params["execution_id"] = json_execution_id

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/v1/approvals",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> HTTPValidationError | ResourcesResponseApprovalRequest | None:
    if response.status_code == 200:
        response_200 = ResourcesResponseApprovalRequest.from_dict(response.json())

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
) -> Response[HTTPValidationError | ResourcesResponseApprovalRequest]:
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
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    status: ApprovalRequestStatus | None | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> Response[HTTPValidationError | ResourcesResponseApprovalRequest]:
    """List Approvals

     List approval requests with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - status: Filter by approval status (status=pending)
    - execution_id: Filter by parent execution ID (execution_id=uuid)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Approval service
        params: Query parameters for pagination and filtering

    Returns:
        ApprovalListResponse with approvals, pagination metadata, and optional total

    Args:
        limit (int | Unset):  Default: 20.
        cursor (None | str | Unset):
        sort (None | str | Unset):
        include_total (bool | Unset):  Default: False.
        status (ApprovalRequestStatus | None | Unset):
        execution_id (None | Unset | UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ResourcesResponseApprovalRequest]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        status=status,
        execution_id=execution_id,
        additional_params=additional_params,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient | Client,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    status: ApprovalRequestStatus | None | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
) -> HTTPValidationError | ResourcesResponseApprovalRequest | None:
    """List Approvals

     List approval requests with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - status: Filter by approval status (status=pending)
    - execution_id: Filter by parent execution ID (execution_id=uuid)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Approval service
        params: Query parameters for pagination and filtering

    Returns:
        ApprovalListResponse with approvals, pagination metadata, and optional total

    Args:
        limit (int | Unset):  Default: 20.
        cursor (None | str | Unset):
        sort (None | str | Unset):
        include_total (bool | Unset):  Default: False.
        status (ApprovalRequestStatus | None | Unset):
        execution_id (None | Unset | UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ResourcesResponseApprovalRequest
    """

    return sync_detailed(
        client=client,
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        status=status,
        execution_id=execution_id,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    status: ApprovalRequestStatus | None | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
) -> Response[HTTPValidationError | ResourcesResponseApprovalRequest]:
    """List Approvals

     List approval requests with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - status: Filter by approval status (status=pending)
    - execution_id: Filter by parent execution ID (execution_id=uuid)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Approval service
        params: Query parameters for pagination and filtering

    Returns:
        ApprovalListResponse with approvals, pagination metadata, and optional total

    Args:
        limit (int | Unset):  Default: 20.
        cursor (None | str | Unset):
        sort (None | str | Unset):
        include_total (bool | Unset):  Default: False.
        status (ApprovalRequestStatus | None | Unset):
        execution_id (None | Unset | UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[HTTPValidationError | ResourcesResponseApprovalRequest]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        status=status,
        execution_id=execution_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    status: ApprovalRequestStatus | None | Unset = UNSET,
    execution_id: None | Unset | UUID = UNSET,
) -> HTTPValidationError | ResourcesResponseApprovalRequest | None:
    """List Approvals

     List approval requests with filtering, sorting, and pagination.

    Supports filtering using query parameters with standard operators:
    - status: Filter by approval status (status=pending)
    - execution_id: Filter by parent execution ID (execution_id=uuid)

    Uses cursor-based pagination for scalability and consistency.

    Args:
        request: FastAPI request object containing query parameters
        service: Approval service
        params: Query parameters for pagination and filtering

    Returns:
        ApprovalListResponse with approvals, pagination metadata, and optional total

    Args:
        limit (int | Unset):  Default: 20.
        cursor (None | str | Unset):
        sort (None | str | Unset):
        include_total (bool | Unset):  Default: False.
        status (ApprovalRequestStatus | None | Unset):
        execution_id (None | Unset | UUID):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        HTTPValidationError | ResourcesResponseApprovalRequest
    """

    return (
        await asyncio_detailed(
            client=client,
            limit=limit,
            cursor=cursor,
            sort=sort,
            include_total=include_total,
            status=status,
            execution_id=execution_id,
        )
    ).parsed
