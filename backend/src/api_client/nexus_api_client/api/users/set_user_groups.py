from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.error_data import ErrorData
from ...models.user_group_list_response import UserGroupListResponse
from ...models.user_groups_set import UserGroupsSet
from ...types import Response


def _get_kwargs(
    user_id: UUID,
    *,
    body: UserGroupsSet,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "put",
        "url": f"/users/{user_id}/groups",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ErrorData | UserGroupListResponse | None:
    if response.status_code == 200:
        response_200 = UserGroupListResponse.from_dict(response.json())

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
) -> Response[ErrorData | UserGroupListResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
        request=response.request,
        is_success=response.is_success,
    )


def sync_detailed(
    user_id: UUID,
    *,
    client: AuthenticatedClient,
    body: UserGroupsSet,
) -> Response[ErrorData | UserGroupListResponse]:
    """Set User Groups

     Set a user's group memberships declaratively.

    Replace all current memberships with the provided list of group IDs.
    An empty list removes the user from all groups.

    Args:
        user_id (UUID):
        body (UserGroupsSet): Schema for declaratively setting a user's group memberships (PUT
            /users/{id}/groups).

            The provided list replaces all current memberships. An empty list removes
            the user from all groups.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | UserGroupListResponse]
    """

    kwargs = _get_kwargs(
        user_id=user_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    user_id: UUID,
    *,
    client: AuthenticatedClient,
    body: UserGroupsSet,
) -> ErrorData | UserGroupListResponse | None:
    """Set User Groups

     Set a user's group memberships declaratively.

    Replace all current memberships with the provided list of group IDs.
    An empty list removes the user from all groups.

    Args:
        user_id (UUID):
        body (UserGroupsSet): Schema for declaratively setting a user's group memberships (PUT
            /users/{id}/groups).

            The provided list replaces all current memberships. An empty list removes
            the user from all groups.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | UserGroupListResponse
    """

    return sync_detailed(
        user_id=user_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    user_id: UUID,
    *,
    client: AuthenticatedClient,
    body: UserGroupsSet,
) -> Response[ErrorData | UserGroupListResponse]:
    """Set User Groups

     Set a user's group memberships declaratively.

    Replace all current memberships with the provided list of group IDs.
    An empty list removes the user from all groups.

    Args:
        user_id (UUID):
        body (UserGroupsSet): Schema for declaratively setting a user's group memberships (PUT
            /users/{id}/groups).

            The provided list replaces all current memberships. An empty list removes
            the user from all groups.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ErrorData | UserGroupListResponse]
    """

    kwargs = _get_kwargs(
        user_id=user_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    user_id: UUID,
    *,
    client: AuthenticatedClient,
    body: UserGroupsSet,
) -> ErrorData | UserGroupListResponse | None:
    """Set User Groups

     Set a user's group memberships declaratively.

    Replace all current memberships with the provided list of group IDs.
    An empty list removes the user from all groups.

    Args:
        user_id (UUID):
        body (UserGroupsSet): Schema for declaratively setting a user's group memberships (PUT
            /users/{id}/groups).

            The provided list replaces all current memberships. An empty list removes
            the user from all groups.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ErrorData | UserGroupListResponse
    """

    return (
        await asyncio_detailed(
            user_id=user_id,
            client=client,
            body=body,
        )
    ).parsed
