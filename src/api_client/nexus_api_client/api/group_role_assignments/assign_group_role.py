from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.group_role_assignment_create import GroupRoleAssignmentCreate
from ...models.group_role_assignment_read import GroupRoleAssignmentRead
from ...types import Response


def _get_kwargs(
    *,
    body: GroupRoleAssignmentCreate,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/group-role-assignments",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | GroupRoleAssignmentRead | None:
    if response.status_code == 201:
        response_201 = GroupRoleAssignmentRead.from_dict(response.json())

        return response_201

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
) -> Response[ErrorData | GroupRoleAssignmentRead]:
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
    body: GroupRoleAssignmentCreate,
) -> Response[ErrorData | GroupRoleAssignmentRead]:
    """Assign Group Role

     Assign a role to a group (system-level). Requires: admin permission.

    Args:
        body (GroupRoleAssignmentCreate): Request body for assigning a role to a group.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | GroupRoleAssignmentRead]
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
    client: AuthenticatedClient,
    body: GroupRoleAssignmentCreate,
) -> ErrorData | GroupRoleAssignmentRead | None:
    """Assign Group Role

     Assign a role to a group (system-level). Requires: admin permission.

    Args:
        body (GroupRoleAssignmentCreate): Request body for assigning a role to a group.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | GroupRoleAssignmentRead
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: GroupRoleAssignmentCreate,
) -> Response[ErrorData | GroupRoleAssignmentRead]:
    """Assign Group Role

     Assign a role to a group (system-level). Requires: admin permission.

    Args:
        body (GroupRoleAssignmentCreate): Request body for assigning a role to a group.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | GroupRoleAssignmentRead]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: GroupRoleAssignmentCreate,
) -> ErrorData | GroupRoleAssignmentRead | None:
    """Assign Group Role

     Assign a role to a group (system-level). Requires: admin permission.

    Args:
        body (GroupRoleAssignmentCreate): Request body for assigning a role to a group.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | GroupRoleAssignmentRead
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
