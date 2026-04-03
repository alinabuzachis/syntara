from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.approval_create_request import ApprovalCreateRequest
from ...models.approval_request_read import ApprovalRequestRead
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    *,
    body: ApprovalCreateRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/approvals",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ApprovalRequestRead | HTTPValidationError | None:
    if response.status_code == 201:
        response_201 = ApprovalRequestRead.from_dict(response.json())

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
) -> Response[ApprovalRequestRead | HTTPValidationError]:
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
    body: ApprovalCreateRequest,
) -> Response[ApprovalRequestRead | HTTPValidationError]:
    """Create Approval

     Create a new approval request.

    This is an internal endpoint called by the Workflows component when
    a workflow execution reaches an approval node. It should not be called
    directly by end users.

    Args:
        request: Approval creation request
        service: Approval service

    Returns:
        Created approval request

    Args:
        body (ApprovalCreateRequest): Request payload for creating an approval request.

            This is an internal schema used by the Workflows component.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApprovalRequestRead | HTTPValidationError]
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
    body: ApprovalCreateRequest,
) -> ApprovalRequestRead | HTTPValidationError | None:
    """Create Approval

     Create a new approval request.

    This is an internal endpoint called by the Workflows component when
    a workflow execution reaches an approval node. It should not be called
    directly by end users.

    Args:
        request: Approval creation request
        service: Approval service

    Returns:
        Created approval request

    Args:
        body (ApprovalCreateRequest): Request payload for creating an approval request.

            This is an internal schema used by the Workflows component.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApprovalRequestRead | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: ApprovalCreateRequest,
) -> Response[ApprovalRequestRead | HTTPValidationError]:
    """Create Approval

     Create a new approval request.

    This is an internal endpoint called by the Workflows component when
    a workflow execution reaches an approval node. It should not be called
    directly by end users.

    Args:
        request: Approval creation request
        service: Approval service

    Returns:
        Created approval request

    Args:
        body (ApprovalCreateRequest): Request payload for creating an approval request.

            This is an internal schema used by the Workflows component.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApprovalRequestRead | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: ApprovalCreateRequest,
) -> ApprovalRequestRead | HTTPValidationError | None:
    """Create Approval

     Create a new approval request.

    This is an internal endpoint called by the Workflows component when
    a workflow execution reaches an approval node. It should not be called
    directly by end users.

    Args:
        request: Approval creation request
        service: Approval service

    Returns:
        Created approval request

    Args:
        body (ApprovalCreateRequest): Request payload for creating an approval request.

            This is an internal schema used by the Workflows component.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApprovalRequestRead | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
