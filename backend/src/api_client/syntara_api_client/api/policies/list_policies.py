from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.policy_list_response import PolicyListResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    name: None | str | Unset = UNSET,
    is_builtin: bool | None | Unset = UNSET,
    project_id: None | Unset | UUID = UNSET,
    project_eligible: bool | None | Unset = UNSET,
    scope: None | str | Unset = UNSET,
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

    json_name: None | str | Unset
    if isinstance(name, Unset):
        json_name = UNSET
    else:
        json_name = name
    params["name"] = json_name

    json_is_builtin: bool | None | Unset
    if isinstance(is_builtin, Unset):
        json_is_builtin = UNSET
    else:
        json_is_builtin = is_builtin
    params["is_builtin"] = json_is_builtin

    json_project_id: None | str | Unset
    if isinstance(project_id, Unset):
        json_project_id = UNSET
    elif isinstance(project_id, UUID):
        json_project_id = str(project_id)
    else:
        json_project_id = project_id
    params["project_id"] = json_project_id

    json_project_eligible: bool | None | Unset
    if isinstance(project_eligible, Unset):
        json_project_eligible = UNSET
    else:
        json_project_eligible = project_eligible
    params["project_eligible"] = json_project_eligible

    json_scope: None | str | Unset
    if isinstance(scope, Unset):
        json_scope = UNSET
    else:
        json_scope = scope
    params["scope"] = json_scope

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/policies",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | PolicyListResponse | None:
    if response.status_code == 200:
        response_200 = PolicyListResponse.from_dict(response.json())

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
) -> Response[ErrorData | PolicyListResponse]:
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
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    name: None | str | Unset = UNSET,
    is_builtin: bool | None | Unset = UNSET,
    project_id: None | Unset | UUID = UNSET,
    project_eligible: bool | None | Unset = UNSET,
    scope: None | str | Unset = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> Response[ErrorData | PolicyListResponse]:
    """List policies

     List policies with filtering and pagination.

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        name (None | str | Unset):
        is_builtin (bool | None | Unset):
        project_id (None | Unset | UUID):
        project_eligible (bool | None | Unset):
        scope (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | PolicyListResponse]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        name=name,
        is_builtin=is_builtin,
        project_id=project_id,
        project_eligible=project_eligible,
        scope=scope,
        additional_params=additional_params,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    name: None | str | Unset = UNSET,
    is_builtin: bool | None | Unset = UNSET,
    project_id: None | Unset | UUID = UNSET,
    project_eligible: bool | None | Unset = UNSET,
    scope: None | str | Unset = UNSET,
) -> ErrorData | PolicyListResponse | None:
    """List policies

     List policies with filtering and pagination.

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        name (None | str | Unset):
        is_builtin (bool | None | Unset):
        project_id (None | Unset | UUID):
        project_eligible (bool | None | Unset):
        scope (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | PolicyListResponse
    """

    return sync_detailed(
        client=client,
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        name=name,
        is_builtin=is_builtin,
        project_id=project_id,
        project_eligible=project_eligible,
        scope=scope,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    name: None | str | Unset = UNSET,
    is_builtin: bool | None | Unset = UNSET,
    project_id: None | Unset | UUID = UNSET,
    project_eligible: bool | None | Unset = UNSET,
    scope: None | str | Unset = UNSET,
) -> Response[ErrorData | PolicyListResponse]:
    """List policies

     List policies with filtering and pagination.

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        name (None | str | Unset):
        is_builtin (bool | None | Unset):
        project_id (None | Unset | UUID):
        project_eligible (bool | None | Unset):
        scope (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | PolicyListResponse]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        name=name,
        is_builtin=is_builtin,
        project_id=project_id,
        project_eligible=project_eligible,
        scope=scope,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    name: None | str | Unset = UNSET,
    is_builtin: bool | None | Unset = UNSET,
    project_id: None | Unset | UUID = UNSET,
    project_eligible: bool | None | Unset = UNSET,
    scope: None | str | Unset = UNSET,
) -> ErrorData | PolicyListResponse | None:
    """List policies

     List policies with filtering and pagination.

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        name (None | str | Unset):
        is_builtin (bool | None | Unset):
        project_id (None | Unset | UUID):
        project_eligible (bool | None | Unset):
        scope (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | PolicyListResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            limit=limit,
            cursor=cursor,
            sort=sort,
            include_total=include_total,
            name=name,
            is_builtin=is_builtin,
            project_id=project_id,
            project_eligible=project_eligible,
            scope=scope,
        )
    ).parsed
