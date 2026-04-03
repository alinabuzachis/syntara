from http import HTTPStatus
from typing import Any

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.batch_approval_request import BatchApprovalRequest
from ...models.batch_approval_response import BatchApprovalResponse
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    *,
    body: BatchApprovalRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/approvals/batch",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> BatchApprovalResponse | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = BatchApprovalResponse.from_dict(response.json())

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
) -> Response[BatchApprovalResponse | HTTPValidationError]:
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
    body: BatchApprovalRequest,
) -> Response[BatchApprovalResponse | HTTPValidationError]:
    """Batch Decide Approvals

     Submit decisions for multiple approval requests at once.

    This endpoint processes each decision independently. If some decisions fail,
    the successful ones are still recorded. The response includes detailed results
    for each decision.

    Use cases:
    - Approving multiple related requests at once
    - Bulk rejection of stale or irrelevant requests

    Args:
        request: Batch approval request with multiple decisions
        service: Approval service

    Returns:
        Batch response with individual results and summary counts

    Args:
        body (BatchApprovalRequest): Request payload for submitting multiple approval decisions at
            once.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[BatchApprovalResponse | HTTPValidationError]
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
    body: BatchApprovalRequest,
) -> BatchApprovalResponse | HTTPValidationError | None:
    """Batch Decide Approvals

     Submit decisions for multiple approval requests at once.

    This endpoint processes each decision independently. If some decisions fail,
    the successful ones are still recorded. The response includes detailed results
    for each decision.

    Use cases:
    - Approving multiple related requests at once
    - Bulk rejection of stale or irrelevant requests

    Args:
        request: Batch approval request with multiple decisions
        service: Approval service

    Returns:
        Batch response with individual results and summary counts

    Args:
        body (BatchApprovalRequest): Request payload for submitting multiple approval decisions at
            once.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        BatchApprovalResponse | HTTPValidationError
    """

    return sync_detailed(
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient | Client,
    body: BatchApprovalRequest,
) -> Response[BatchApprovalResponse | HTTPValidationError]:
    """Batch Decide Approvals

     Submit decisions for multiple approval requests at once.

    This endpoint processes each decision independently. If some decisions fail,
    the successful ones are still recorded. The response includes detailed results
    for each decision.

    Use cases:
    - Approving multiple related requests at once
    - Bulk rejection of stale or irrelevant requests

    Args:
        request: Batch approval request with multiple decisions
        service: Approval service

    Returns:
        Batch response with individual results and summary counts

    Args:
        body (BatchApprovalRequest): Request payload for submitting multiple approval decisions at
            once.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[BatchApprovalResponse | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient | Client,
    body: BatchApprovalRequest,
) -> BatchApprovalResponse | HTTPValidationError | None:
    """Batch Decide Approvals

     Submit decisions for multiple approval requests at once.

    This endpoint processes each decision independently. If some decisions fail,
    the successful ones are still recorded. The response includes detailed results
    for each decision.

    Use cases:
    - Approving multiple related requests at once
    - Bulk rejection of stale or irrelevant requests

    Args:
        request: Batch approval request with multiple decisions
        service: Approval service

    Returns:
        Batch response with individual results and summary counts

    Args:
        body (BatchApprovalRequest): Request payload for submitting multiple approval decisions at
            once.

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        BatchApprovalResponse | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
        )
    ).parsed
