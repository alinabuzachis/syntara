from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.role_assignment_list_response import RoleAssignmentListResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    project_id: UUID,
    *,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    principal_id: None | Unset | UUID = UNSET,
    group_id: None | Unset | UUID = UNSET,
    principal_name: None | str | Unset = UNSET,
    role_name: None | str | Unset = UNSET,
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

    json_principal_id: None | str | Unset
    if isinstance(principal_id, Unset):
        json_principal_id = UNSET
    elif isinstance(principal_id, UUID):
        json_principal_id = str(principal_id)
    else:
        json_principal_id = principal_id
    params["principal_id"] = json_principal_id

    json_group_id: None | str | Unset
    if isinstance(group_id, Unset):
        json_group_id = UNSET
    elif isinstance(group_id, UUID):
        json_group_id = str(group_id)
    else:
        json_group_id = group_id
    params["group_id"] = json_group_id

    json_principal_name: None | str | Unset
    if isinstance(principal_name, Unset):
        json_principal_name = UNSET
    else:
        json_principal_name = principal_name
    params["principal_name"] = json_principal_name

    json_role_name: None | str | Unset
    if isinstance(role_name, Unset):
        json_role_name = UNSET
    else:
        json_role_name = role_name
    params["role_name"] = json_role_name

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": f"/projects/{project_id}/role_assignments",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | RoleAssignmentListResponse | None:
    if response.status_code == 200:
        response_200 = RoleAssignmentListResponse.from_dict(response.json())

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
) -> Response[ErrorData | RoleAssignmentListResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    project_id: UUID,
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    principal_id: None | Unset | UUID = UNSET,
    group_id: None | Unset | UUID = UNSET,
    principal_name: None | str | Unset = UNSET,
    role_name: None | str | Unset = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> Response[ErrorData | RoleAssignmentListResponse]:
    """List project role assignments

     List role assignments for a project with policy-driven visibility.

    Users with ``role-assignment:read:any`` see all assignments in the project.
    Users with ``role-assignment:read:project`` for this project see all.
    Users with ``role-assignment:read:self`` see only their own (direct and via groups).

    Args:
        project_id (UUID):
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        principal_id (None | Unset | UUID):
        group_id (None | Unset | UUID):
        principal_name (None | str | Unset):
        role_name (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | RoleAssignmentListResponse]
    """

    kwargs = _get_kwargs(
        project_id=project_id,
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        principal_id=principal_id,
        group_id=group_id,
        principal_name=principal_name,
        role_name=role_name,
        additional_params=additional_params,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    project_id: UUID,
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    principal_id: None | Unset | UUID = UNSET,
    group_id: None | Unset | UUID = UNSET,
    principal_name: None | str | Unset = UNSET,
    role_name: None | str | Unset = UNSET,
) -> ErrorData | RoleAssignmentListResponse | None:
    """List project role assignments

     List role assignments for a project with policy-driven visibility.

    Users with ``role-assignment:read:any`` see all assignments in the project.
    Users with ``role-assignment:read:project`` for this project see all.
    Users with ``role-assignment:read:self`` see only their own (direct and via groups).

    Args:
        project_id (UUID):
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        principal_id (None | Unset | UUID):
        group_id (None | Unset | UUID):
        principal_name (None | str | Unset):
        role_name (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | RoleAssignmentListResponse
    """

    return sync_detailed(
        project_id=project_id,
        client=client,
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        principal_id=principal_id,
        group_id=group_id,
        principal_name=principal_name,
        role_name=role_name,
    ).parsed


async def asyncio_detailed(
    project_id: UUID,
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    principal_id: None | Unset | UUID = UNSET,
    group_id: None | Unset | UUID = UNSET,
    principal_name: None | str | Unset = UNSET,
    role_name: None | str | Unset = UNSET,
) -> Response[ErrorData | RoleAssignmentListResponse]:
    """List project role assignments

     List role assignments for a project with policy-driven visibility.

    Users with ``role-assignment:read:any`` see all assignments in the project.
    Users with ``role-assignment:read:project`` for this project see all.
    Users with ``role-assignment:read:self`` see only their own (direct and via groups).

    Args:
        project_id (UUID):
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        principal_id (None | Unset | UUID):
        group_id (None | Unset | UUID):
        principal_name (None | str | Unset):
        role_name (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | RoleAssignmentListResponse]
    """

    kwargs = _get_kwargs(
        project_id=project_id,
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        principal_id=principal_id,
        group_id=group_id,
        principal_name=principal_name,
        role_name=role_name,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    project_id: UUID,
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    principal_id: None | Unset | UUID = UNSET,
    group_id: None | Unset | UUID = UNSET,
    principal_name: None | str | Unset = UNSET,
    role_name: None | str | Unset = UNSET,
) -> ErrorData | RoleAssignmentListResponse | None:
    """List project role assignments

     List role assignments for a project with policy-driven visibility.

    Users with ``role-assignment:read:any`` see all assignments in the project.
    Users with ``role-assignment:read:project`` for this project see all.
    Users with ``role-assignment:read:self`` see only their own (direct and via groups).

    Args:
        project_id (UUID):
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        principal_id (None | Unset | UUID):
        group_id (None | Unset | UUID):
        principal_name (None | str | Unset):
        role_name (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | RoleAssignmentListResponse
    """

    return (
        await asyncio_detailed(
            project_id=project_id,
            client=client,
            limit=limit,
            cursor=cursor,
            sort=sort,
            include_total=include_total,
            principal_id=principal_id,
            group_id=group_id,
            principal_name=principal_name,
            role_name=role_name,
        )
    ).parsed
