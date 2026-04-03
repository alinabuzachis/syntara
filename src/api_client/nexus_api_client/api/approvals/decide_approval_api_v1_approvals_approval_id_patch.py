from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.approval_decision_request import ApprovalDecisionRequest
from ...models.approval_request_read import ApprovalRequestRead
from ...models.http_validation_error import HTTPValidationError
from ...types import Response


def _get_kwargs(
    approval_id: UUID,
    *,
    body: ApprovalDecisionRequest,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}

    _kwargs: dict[str, Any] = {
        "method": "patch",
        "url": f"/api/v1/approvals/{approval_id}",
    }

    _kwargs["json"] = body.to_dict()

    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: AuthenticatedClient | Client, response: httpx.Response
) -> ApprovalRequestRead | HTTPValidationError | None:
    if response.status_code == 200:
        response_200 = ApprovalRequestRead.from_dict(response.json())

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
    approval_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: ApprovalDecisionRequest,
) -> Response[ApprovalRequestRead | HTTPValidationError]:
    """Decide Approval

     Submit an approval decision (approve or reject).

    Only pending approval requests can be decided. Attempting to modify an approval
    that is already approved, rejected, expired, or cancelled will return an error.

    When a decision is submitted:
    1. The approval request status is updated
    2. The decided_by, decided_at, and decision_notes fields are populated
    3. A signal is sent to the workflow to resume execution on the appropriate path

    Args:
        approval_id: Approval request UUID
        request: Decision request with status and notes
        service: Approval service

    Returns:
        Updated approval request

    Args:
        approval_id (UUID):
        body (ApprovalDecisionRequest): Request payload for submitting an approval decision.

            Status values:
            - approved: Approver grants the request, workflow continues on approval path
            - rejected: Approver denies the request, workflow continues on rejection path
            - cancelled: Internal use only - set by workflow engine when parent workflow is cancelled

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApprovalRequestRead | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        approval_id=approval_id,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    approval_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: ApprovalDecisionRequest,
) -> ApprovalRequestRead | HTTPValidationError | None:
    """Decide Approval

     Submit an approval decision (approve or reject).

    Only pending approval requests can be decided. Attempting to modify an approval
    that is already approved, rejected, expired, or cancelled will return an error.

    When a decision is submitted:
    1. The approval request status is updated
    2. The decided_by, decided_at, and decision_notes fields are populated
    3. A signal is sent to the workflow to resume execution on the appropriate path

    Args:
        approval_id: Approval request UUID
        request: Decision request with status and notes
        service: Approval service

    Returns:
        Updated approval request

    Args:
        approval_id (UUID):
        body (ApprovalDecisionRequest): Request payload for submitting an approval decision.

            Status values:
            - approved: Approver grants the request, workflow continues on approval path
            - rejected: Approver denies the request, workflow continues on rejection path
            - cancelled: Internal use only - set by workflow engine when parent workflow is cancelled

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApprovalRequestRead | HTTPValidationError
    """

    return sync_detailed(
        approval_id=approval_id,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    approval_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: ApprovalDecisionRequest,
) -> Response[ApprovalRequestRead | HTTPValidationError]:
    """Decide Approval

     Submit an approval decision (approve or reject).

    Only pending approval requests can be decided. Attempting to modify an approval
    that is already approved, rejected, expired, or cancelled will return an error.

    When a decision is submitted:
    1. The approval request status is updated
    2. The decided_by, decided_at, and decision_notes fields are populated
    3. A signal is sent to the workflow to resume execution on the appropriate path

    Args:
        approval_id: Approval request UUID
        request: Decision request with status and notes
        service: Approval service

    Returns:
        Updated approval request

    Args:
        approval_id (UUID):
        body (ApprovalDecisionRequest): Request payload for submitting an approval decision.

            Status values:
            - approved: Approver grants the request, workflow continues on approval path
            - rejected: Approver denies the request, workflow continues on rejection path
            - cancelled: Internal use only - set by workflow engine when parent workflow is cancelled

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ApprovalRequestRead | HTTPValidationError]
    """

    kwargs = _get_kwargs(
        approval_id=approval_id,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    approval_id: UUID,
    *,
    client: AuthenticatedClient | Client,
    body: ApprovalDecisionRequest,
) -> ApprovalRequestRead | HTTPValidationError | None:
    """Decide Approval

     Submit an approval decision (approve or reject).

    Only pending approval requests can be decided. Attempting to modify an approval
    that is already approved, rejected, expired, or cancelled will return an error.

    When a decision is submitted:
    1. The approval request status is updated
    2. The decided_by, decided_at, and decision_notes fields are populated
    3. A signal is sent to the workflow to resume execution on the appropriate path

    Args:
        approval_id: Approval request UUID
        request: Decision request with status and notes
        service: Approval service

    Returns:
        Updated approval request

    Args:
        approval_id (UUID):
        body (ApprovalDecisionRequest): Request payload for submitting an approval decision.

            Status values:
            - approved: Approver grants the request, workflow continues on approval path
            - rejected: Approver denies the request, workflow continues on rejection path
            - cancelled: Internal use only - set by workflow engine when parent workflow is cancelled

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ApprovalRequestRead | HTTPValidationError
    """

    return (
        await asyncio_detailed(
            approval_id=approval_id,
            client=client,
            body=body,
        )
    ).parsed
