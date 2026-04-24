from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.invocation_list_response import InvocationListResponse
from ...models.invocation_status import InvocationStatus
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    status: InvocationStatus | None | Unset = UNSET,
    created_by: None | Unset | UUID = UNSET,
    session_id: None | str | Unset = UNSET,
    prompt: None | str | Unset = UNSET,
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
    elif isinstance(status, InvocationStatus):
        json_status = status.value
    else:
        json_status = status
    params["status"] = json_status

    json_created_by: None | str | Unset
    if isinstance(created_by, Unset):
        json_created_by = UNSET
    elif isinstance(created_by, UUID):
        json_created_by = str(created_by)
    else:
        json_created_by = created_by
    params["created_by"] = json_created_by

    json_session_id: None | str | Unset
    if isinstance(session_id, Unset):
        json_session_id = UNSET
    else:
        json_session_id = session_id
    params["session_id"] = json_session_id

    json_prompt: None | str | Unset
    if isinstance(prompt, Unset):
        json_prompt = UNSET
    else:
        json_prompt = prompt
    params["prompt"] = json_prompt

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/invocations",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | InvocationListResponse | None:
    if response.status_code == 200:
        response_200 = InvocationListResponse.from_dict(response.json())

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
) -> Response[ErrorData | InvocationListResponse]:
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
    status: InvocationStatus | None | Unset = UNSET,
    created_by: None | Unset | UUID = UNSET,
    session_id: None | str | Unset = UNSET,
    prompt: None | str | Unset = UNSET,
    additional_params: dict[str, Any] | None = None,
) -> Response[ErrorData | InvocationListResponse]:
    """List Invocations

     List invocations with cursor-based pagination and filtering

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        status (InvocationStatus | None | Unset):
        created_by (None | Unset | UUID):
        session_id (None | str | Unset):
        prompt (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | InvocationListResponse]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        status=status,
        created_by=created_by,
        session_id=session_id,
        prompt=prompt,
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
    status: InvocationStatus | None | Unset = UNSET,
    created_by: None | Unset | UUID = UNSET,
    session_id: None | str | Unset = UNSET,
    prompt: None | str | Unset = UNSET,
) -> ErrorData | InvocationListResponse | None:
    """List Invocations

     List invocations with cursor-based pagination and filtering

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        status (InvocationStatus | None | Unset):
        created_by (None | Unset | UUID):
        session_id (None | str | Unset):
        prompt (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | InvocationListResponse
    """

    return sync_detailed(
        client=client,
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        status=status,
        created_by=created_by,
        session_id=session_id,
        prompt=prompt,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    limit: int | Unset = 20,
    cursor: None | str | Unset = UNSET,
    sort: None | str | Unset = UNSET,
    include_total: bool | Unset = False,
    status: InvocationStatus | None | Unset = UNSET,
    created_by: None | Unset | UUID = UNSET,
    session_id: None | str | Unset = UNSET,
    prompt: None | str | Unset = UNSET,
) -> Response[ErrorData | InvocationListResponse]:
    """List Invocations

     List invocations with cursor-based pagination and filtering

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        status (InvocationStatus | None | Unset):
        created_by (None | Unset | UUID):
        session_id (None | str | Unset):
        prompt (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | InvocationListResponse]
    """

    kwargs = _get_kwargs(
        limit=limit,
        cursor=cursor,
        sort=sort,
        include_total=include_total,
        status=status,
        created_by=created_by,
        session_id=session_id,
        prompt=prompt,
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
    status: InvocationStatus | None | Unset = UNSET,
    created_by: None | Unset | UUID = UNSET,
    session_id: None | str | Unset = UNSET,
    prompt: None | str | Unset = UNSET,
) -> ErrorData | InvocationListResponse | None:
    """List Invocations

     List invocations with cursor-based pagination and filtering

    Args:
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | str | Unset): Pagination cursor from previous response
        sort (None | str | Unset): Sort parameter (e.g., 'name', '-created_at')
        include_total (bool | Unset): Include total count in response (expensive) Default: False.
        status (InvocationStatus | None | Unset):
        created_by (None | Unset | UUID):
        session_id (None | str | Unset):
        prompt (None | str | Unset):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | InvocationListResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            limit=limit,
            cursor=cursor,
            sort=sort,
            include_total=include_total,
            status=status,
            created_by=created_by,
            session_id=session_id,
            prompt=prompt,
        )
    ).parsed
