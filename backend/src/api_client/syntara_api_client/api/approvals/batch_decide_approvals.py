from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.batch_approval_request import BatchApprovalRequest
from ...models.batch_approval_response import BatchApprovalResponse
from ...models.error_data import ErrorData
from ...types import Response


def _get_kwargs(
    *,
    body: BatchApprovalRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/approvals/batch",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> BatchApprovalResponse | ErrorData | None:
    if response.status_code == 200:
        response_200 = BatchApprovalResponse.from_dict(response.json())

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
) -> Response[BatchApprovalResponse | ErrorData]:
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
    body: BatchApprovalRequest,
) -> Response[BatchApprovalResponse | ErrorData]:
    """Batch approve/reject multiple requests

     Submit decisions for multiple approval requests at once.

    Authorization is validated per-approval: Each approval is checked for project-scoped
    approval:decide permission AND approver list membership. Users with project-scoped
    permissions can batch approve requests within their authorized projects.

    This endpoint processes each decision independently. If some decisions fail due to
    authorization or validation errors, the successful ones are still recorded. The
    response includes detailed results for each decision.

    Use cases:
    - Approving multiple related requests at once
    - Bulk rejection of stale or irrelevant requests

    Args:
        body (BatchApprovalRequest): Request payload for submitting multiple approval decisions at
            once.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[BatchApprovalResponse | ErrorData]
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
    body: BatchApprovalRequest,
) -> BatchApprovalResponse | ErrorData | None:
    """Batch approve/reject multiple requests

     Submit decisions for multiple approval requests at once.

    Authorization is validated per-approval: Each approval is checked for project-scoped
    approval:decide permission AND approver list membership. Users with project-scoped
    permissions can batch approve requests within their authorized projects.

    This endpoint processes each decision independently. If some decisions fail due to
    authorization or validation errors, the successful ones are still recorded. The
    response includes detailed results for each decision.

    Use cases:
    - Approving multiple related requests at once
    - Bulk rejection of stale or irrelevant requests

    Args:
        body (BatchApprovalRequest): Request payload for submitting multiple approval decisions at
            once.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        BatchApprovalResponse | ErrorData
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: BatchApprovalRequest,
) -> Response[BatchApprovalResponse | ErrorData]:
    """Batch approve/reject multiple requests

     Submit decisions for multiple approval requests at once.

    Authorization is validated per-approval: Each approval is checked for project-scoped
    approval:decide permission AND approver list membership. Users with project-scoped
    permissions can batch approve requests within their authorized projects.

    This endpoint processes each decision independently. If some decisions fail due to
    authorization or validation errors, the successful ones are still recorded. The
    response includes detailed results for each decision.

    Use cases:
    - Approving multiple related requests at once
    - Bulk rejection of stale or irrelevant requests

    Args:
        body (BatchApprovalRequest): Request payload for submitting multiple approval decisions at
            once.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[BatchApprovalResponse | ErrorData]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: BatchApprovalRequest,
) -> BatchApprovalResponse | ErrorData | None:
    """Batch approve/reject multiple requests

     Submit decisions for multiple approval requests at once.

    Authorization is validated per-approval: Each approval is checked for project-scoped
    approval:decide permission AND approver list membership. Users with project-scoped
    permissions can batch approve requests within their authorized projects.

    This endpoint processes each decision independently. If some decisions fail due to
    authorization or validation errors, the successful ones are still recorded. The
    response includes detailed results for each decision.

    Use cases:
    - Approving multiple related requests at once
    - Bulk rejection of stale or irrelevant requests

    Args:
        body (BatchApprovalRequest): Request payload for submitting multiple approval decisions at
            once.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        BatchApprovalResponse | ErrorData
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
