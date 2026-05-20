from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.auth_type import AuthType
from ...models.error_data import ErrorData
from ...models.resources_response_user_read import ResourcesResponseUserRead
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    username: None | str | Unset = UNSET,
    full_name: None | str | Unset = UNSET,
    auth_type: AuthType | None | Unset = UNSET,
    auth_source: None | str | Unset = UNSET,
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

    json_username: None | str | Unset
    if isinstance(username, Unset):
        json_username = UNSET
    else:
        json_username = username
    params["username"] = json_username

    json_full_name: None | str | Unset
    if isinstance(full_name, Unset):
        json_full_name = UNSET
    else:
        json_full_name = full_name
    params["full_name"] = json_full_name

    json_auth_type: None | str | Unset
    if isinstance(auth_type, Unset):
        json_auth_type = UNSET
    elif isinstance(auth_type, AuthType):
        json_auth_type = auth_type.value
    else:
        json_auth_type = auth_type
    params["auth_type"] = json_auth_type

    json_auth_source: None | str | Unset
    if isinstance(auth_source, Unset):
        json_auth_source = UNSET
    else:
        json_auth_source = auth_source
    params["auth_source"] = json_auth_source

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/users",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | ResourcesResponseUserRead | None:
    if response.status_code == 200:
        response_200 = ResourcesResponseUserRead.from_dict(response.json())

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

    if response.status_code == 500:
        response_500 = ErrorData.from_dict(response.json())

        return response_500

    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> Response[ErrorData | ResourcesResponseUserRead]:
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
    username: None | str | Unset = UNSET,
    full_name: None | str | Unset = UNSET,
    auth_type: AuthType | None | Unset = UNSET,
    auth_source: None | str | Unset = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> Response[ErrorData | ResourcesResponseUserRead]:
    """List Users

     List users with visibility filtering and pagination.

    Users with ``user:read:any`` see all users.
    Users with ``user:read:self`` see only themselves.

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        username (None | str | Unset):
        full_name (None | str | Unset):
        auth_type (AuthType | None | Unset):
        auth_source (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ResourcesResponseUserRead]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        username=username,
        full_name=full_name,
        auth_type=auth_type,
        auth_source=auth_source,
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
    username: None | str | Unset = UNSET,
    full_name: None | str | Unset = UNSET,
    auth_type: AuthType | None | Unset = UNSET,
    auth_source: None | str | Unset = UNSET,
) -> ErrorData | ResourcesResponseUserRead | None:
    """List Users

     List users with visibility filtering and pagination.

    Users with ``user:read:any`` see all users.
    Users with ``user:read:self`` see only themselves.

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        username (None | str | Unset):
        full_name (None | str | Unset):
        auth_type (AuthType | None | Unset):
        auth_source (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ResourcesResponseUserRead
    """

    return sync_detailed(
        client=client,
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        username=username,
        full_name=full_name,
        auth_type=auth_type,
        auth_source=auth_source,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    username: None | str | Unset = UNSET,
    full_name: None | str | Unset = UNSET,
    auth_type: AuthType | None | Unset = UNSET,
    auth_source: None | str | Unset = UNSET,
) -> Response[ErrorData | ResourcesResponseUserRead]:
    """List Users

     List users with visibility filtering and pagination.

    Users with ``user:read:any`` see all users.
    Users with ``user:read:self`` see only themselves.

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        username (None | str | Unset):
        full_name (None | str | Unset):
        auth_type (AuthType | None | Unset):
        auth_source (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | ResourcesResponseUserRead]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        username=username,
        full_name=full_name,
        auth_type=auth_type,
        auth_source=auth_source,
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
    username: None | str | Unset = UNSET,
    full_name: None | str | Unset = UNSET,
    auth_type: AuthType | None | Unset = UNSET,
    auth_source: None | str | Unset = UNSET,
) -> ErrorData | ResourcesResponseUserRead | None:
    """List Users

     List users with visibility filtering and pagination.

    Users with ``user:read:any`` see all users.
    Users with ``user:read:self`` see only themselves.

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        username (None | str | Unset):
        full_name (None | str | Unset):
        auth_type (AuthType | None | Unset):
        auth_source (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | ResourcesResponseUserRead
    """

    return (
        await asyncio_detailed(
            client=client,
            limit=limit,
            cursor=cursor,
            sort=sort,
            include_total=include_total,
            username=username,
            full_name=full_name,
            auth_type=auth_type,
            auth_source=auth_source,
        )
    ).parsed
