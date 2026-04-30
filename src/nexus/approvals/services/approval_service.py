"""Approval service layer for business logic.

This service encapsulates approval-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints. It handles all approval request
operations including creating, listing, deciding, and cancelling approvals.
"""

import asyncio
import builtins
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, cast
from uuid import UUID

import structlog
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

if TYPE_CHECKING:
    from sqlalchemy import Select
    from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.approvals.audit.approval import ApprovalDecidedEvent, ApprovalRequestedEvent
from nexus.approvals.clients.workflow_client import WorkflowApiClient
from nexus.approvals.exceptions import ApprovalAlreadyDecidedError, ApprovalAlreadyRequestedError, ApprovalNotFoundError
from nexus.approvals.models import (
    ApprovalCreateRequest,
    ApprovalDecisionRequest,
    ApprovalListResponse,
    ApprovalRequest,
    ApprovalRequestRead,
    ApprovalRequestStatus,
    BatchApprovalDecision,
    BatchApprovalDecisionStatus,
    BatchApprovalRequest,
    BatchApprovalResponse,
    BatchApprovalResult,
    UserReference,
)
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.authz.engine import AllowedProjectsResult
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin, EnrichQueryMixin

logger = structlog.stdlib.get_logger(__name__)


class ApprovalEnrichQuery(EnrichQueryMixin):
    """Eagerly load the decider relationship to avoid lazy-load in async context."""

    def enrich(  # type: ignore[override]
        self,
        query: "Select[tuple[ApprovalRequest]] | SelectOfScalar[tuple[ApprovalRequest]]",
    ) -> "Select[tuple[ApprovalRequest]] | SelectOfScalar[tuple[ApprovalRequest]]":
        """Add selectinload for the decider relationship."""
        return query.options(selectinload(ApprovalRequest.decider))  # type: ignore[arg-type]


class ApprovalServiceConvertResourceMixin(ConvertResourceMixin):
    """Mixin for converting ApprovalRequest resources to ApprovalRequestRead format."""

    def __init__(self, user: User) -> None:
        """Initialize ApprovalServiceConvertResourceMixin with current user."""
        super().__init__()
        self.user = user

    def convert_resource(self, resource: ApprovalRequest) -> ApprovalRequestRead:  # type: ignore[override]
        """Convert ApprovalRequest to ApprovalRequestRead format."""
        # Extract data from the resource, excluding decided_by field
        resource_data = resource.model_dump(exclude={"decided_by"})

        # Create the ApprovalRequestRead instance with the base data
        result = ApprovalRequestRead(**resource_data)

        # Set the decided_by field with UserReference if there's a decider.
        # Check the FK column first to avoid triggering a lazy load (which
        # fails in async context with MissingGreenlet).  The decider
        # relationship may still be None after selectinload if the session
        # state was reset (e.g. after commit in decide()), so fall back to
        # the current user when the decider matches.
        if resource.decided_by is not None:
            decider = getattr(resource, "decider", None)
            if decider is not None:
                decider_name = decider.full_name
            elif resource.decided_by == self.user.id:
                decider_name = self.user.full_name
            else:
                decider_name = ""
            result.decided_by = UserReference(id=resource.decided_by, name=decider_name)

        return result


class ApprovalService(BaseService):
    """Service for approval business logic.

    This service encapsulates all approval-related business operations,
    including CRUD operations, decision processing, and workflow integration.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize ApprovalService with database session and user context."""
        super().__init__(
            session,
            user,
            convert_resource_mixin=ApprovalServiceConvertResourceMixin(user),
            enrich_query_mixin=ApprovalEnrichQuery(),
        )

    async def list(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
        allowed_projects: AllowedProjectsResult | None = None,
    ) -> ApprovalListResponse:
        """List approval requests with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of approval requests to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "name", "-created_at")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response
            allowed_projects: Project scope filter from authorization

        Returns:
            ApprovalListResponse with approval requests, pagination metadata, and optional total

        """
        return await self.list_resources(
            model=ApprovalRequest,
            response_type=ApprovalListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort,
            query_params_items=query_params_items,
            include_total=include_total,
            allowed_projects=allowed_projects,
        )

    async def _get_approval_by_id(self, approval_id: UUID) -> ApprovalRequest | None:
        query = (
            select(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
            .options(selectinload(ApprovalRequest.decider))  # type: ignore[arg-type]
        )
        result = await self.session.exec(query)
        return result.one_or_none()

    async def _get_approval_request(self, execution_id: UUID, approval_node_id: str) -> ApprovalRequest | None:
        query = select(ApprovalRequest).where(
            ApprovalRequest.execution_id == execution_id, ApprovalRequest.approval_node_id == approval_node_id
        )
        result = await self.session.exec(query)
        return result.one_or_none()

    async def get(self, approval_id: UUID) -> ApprovalRequestRead:
        """Get a single approval request by ID.

        Args:
            approval_id: UUID of the approval request

        Returns:
            The approval request

        Raises:
            ApprovalNotFoundError: If approval request not found

        """
        approval: ApprovalRequest | None = await self._get_approval_by_id(approval_id)

        if not approval:
            raise ApprovalNotFoundError(approval_id)

        return cast("ApprovalRequestRead", self.convert_resource_mixin.convert_resource(approval))

    async def _resolve_project_id(self, request: ApprovalCreateRequest) -> UUID | None:
        """Resolve project_id from request or by looking up the execution."""
        if request.project_id is not None:
            return request.project_id

        from nexus.workflows.models.execution import Execution  # noqa: PLC0415

        result = await self.session.exec(select(Execution.project_id).where(Execution.id == request.execution_id))
        return result.first()

    async def create(
        self,
        request: ApprovalCreateRequest,
    ) -> ApprovalRequestRead:
        """Create a new approval request.

        Args:
            request: Typed approval creation request

        Returns:
            Created approval request

        Raises:
            ApprovalAlreadyRequestedError: If approval already exists for this execution and approval node

        """
        # Check if an approval already exists for this execution and approval node
        existing_approval = await self._get_approval_request(request.execution_id, request.approval_node_id)
        if existing_approval is not None:
            raise ApprovalAlreadyRequestedError(request.execution_id, request.approval_node_id)

        # Resolve project_id from request or execution
        project_id = await self._resolve_project_id(request)

        # Convert typed models to dicts for database storage
        next_step_approved_dict = (
            request.next_step_approved.model_dump(mode="json") if request.next_step_approved else None
        )
        next_step_rejected_dict = (
            request.next_step_rejected.model_dump(mode="json") if request.next_step_rejected else None
        )
        workflow_context_dict = request.workflow_context.model_dump(mode="json")

        approval = ApprovalRequest(
            execution_id=request.execution_id,
            approval_node_id=request.approval_node_id,
            name=request.name,
            project_id=project_id,
            status=ApprovalRequestStatus.PENDING,
            timeout_at=request.timeout_at,
            next_step_approved=next_step_approved_dict,
            next_step_rejected=next_step_rejected_dict,
            workflow_context=workflow_context_dict,
        )

        self.session.add(approval)
        await self.session.commit()

        logger.info(
            "Created approval request",
            approval_id=approval.id,
            execution_id=request.execution_id,
            approval_node_id=request.approval_node_id,
        )

        AuditEventDispatcher.dispatch(
            ApprovalRequestedEvent(
                approval_id=approval.id,
                execution_id=request.execution_id,
                approval_node_id=request.approval_node_id,
                name=request.name,
                project_id=project_id,
                timeout_at=request.timeout_at,
            )
        )

        return cast("ApprovalRequestRead", self.convert_resource_mixin.convert_resource(approval))

    async def decide(
        self,
        approval_id: UUID,
        request: ApprovalDecisionRequest,
    ) -> ApprovalRequestRead:
        """Make a decision on an approval request.

        Args:
            approval_id: UUID of the approval request
            request: Typed decision request with status and notes

        Returns:
            Updated approval request

        Raises:
            ApprovalNotFoundError: If approval request not found
            ApprovalAlreadyDecidedError: If approval already has a decision

        """
        # Get the approval request
        approval: ApprovalRequest | None = await self._get_approval_by_id(approval_id)
        if not approval:
            raise ApprovalNotFoundError(approval_id)

        # Check if already decided
        if approval.status != ApprovalRequestStatus.PENDING:
            raise ApprovalAlreadyDecidedError(approval_id, approval.status)

        # Convert decision status enum to approval request status enum
        status_enum = ApprovalRequestStatus(request.status.value)

        # Update the approval with decision
        approval.status = status_enum
        approval.decided_by = self.user.id
        approval.decided_at = datetime.now(UTC)
        approval.decision_notes = request.notes

        await self.session.commit()
        await self.session.refresh(approval, ["decider"])

        logger.info(
            "Approval decision made",
            approval_id=approval_id,
            status=status_enum.value,
            decided_by=self.user.id,
        )

        decided = (approval.decided_at or datetime.now(UTC)).replace(tzinfo=None)
        created = approval.created_at.replace(tzinfo=None)
        wait_time_ms = int((decided - created).total_seconds() * 1000)
        AuditEventDispatcher.dispatch(
            ApprovalDecidedEvent(
                approval_id=approval_id,
                execution_id=approval.execution_id,
                approval_node_id=approval.approval_node_id,
                decision=status_enum.value,
                decided_by=self.user.id,
                decided_at=approval.decided_at,
                wait_time_ms=wait_time_ms,
                decision_notes=request.notes,
            )
        )

        # Send signal to workflow engine (best-effort, never blocks the response)
        try:
            async with WorkflowApiClient() as client:
                await client.send_approval_signal(
                    execution_id=approval.execution_id,
                    approval_node_id=approval.approval_node_id,
                    status=request.status,
                    approval_id=approval_id,
                    notes=request.notes,
                )
        except Exception as e:
            logger.exception(
                "Failed to send approval signal",
                approval_id=approval_id,
                error=str(e),
            )

        # Eagerly load the decider relationship to avoid lazy-load in async context
        await self.session.refresh(approval, ["decider"])

        return cast("ApprovalRequestRead", self.convert_resource_mixin.convert_resource(approval))

    def _process_single_decision(
        self,
        decision: BatchApprovalDecision,
        approvals: dict[UUID, ApprovalRequest],
    ) -> BatchApprovalResult:
        """Process a single approval decision.

        Args:
            decision: Single typed decision data
            approvals: Dictionary of approval objects by ID

        Returns:
            BatchApprovalResult for this decision

        """
        approval_id = decision.approval_id
        decision_status = decision.status
        notes = decision.notes

        approval = approvals.get(approval_id)
        if not approval:
            return BatchApprovalResult(
                approval_id=approval_id,
                success=False,
                error="Approval not found",
            )

        # Check if already decided
        if approval.status != ApprovalRequestStatus.PENDING:
            return BatchApprovalResult(
                approval_id=approval_id,
                success=False,
                error=f"Approval already {approval.status.value}",
            )

        # Convert decision status enum to approval request status enum
        try:
            status = ApprovalRequestStatus(decision_status.value)
        except ValueError:
            return BatchApprovalResult(
                approval_id=approval_id,
                success=False,
                error=f"Invalid status: {decision_status}",
            )

        # Update the approval
        approval.status = status
        approval.decided_by = self.user.id
        approval.decided_at = datetime.now(UTC)
        approval.decision_notes = notes

        logger.info(
            "Batch approval decision made",
            approval_id=approval_id,
            status=status.value,
            decided_by=self.user.id,
        )

        decided = (approval.decided_at or datetime.now(UTC)).replace(tzinfo=None)
        created = approval.created_at.replace(tzinfo=None)
        wait_time_ms = int((decided - created).total_seconds() * 1000)
        AuditEventDispatcher.dispatch(
            ApprovalDecidedEvent(
                approval_id=approval_id,
                execution_id=approval.execution_id,
                approval_node_id=approval.approval_node_id,
                decision=status.value,
                decided_by=self.user.id,
                decided_at=approval.decided_at,
                wait_time_ms=wait_time_ms,
                decision_notes=notes,
            )
        )

        return BatchApprovalResult(
            approval_id=approval_id,
            success=True,
            status=status,
            decided_at=approval.decided_at,
            decided_by=UserReference(id=self.user.id, name=self.user.full_name),
            decision_notes=notes,
        )

    async def _send_workflow_signals(
        self,
        results: builtins.list[BatchApprovalResult],
        decisions: builtins.list[BatchApprovalDecision],
        approvals: dict[UUID, ApprovalRequest],
    ) -> None:
        """Send workflow signals for successful decisions in parallel.

        Args:
            results: List of batch results
            decisions: List of typed decision data
            approvals: Dictionary of approval objects by ID

        """

        async def send_single_signal(workflow_client: WorkflowApiClient, decision: BatchApprovalDecision) -> None:
            """Send a single workflow signal with error handling."""
            try:
                approval_id = decision.approval_id
                approval = approvals[approval_id]
                await workflow_client.send_approval_signal(
                    execution_id=approval.execution_id,
                    approval_node_id=approval.approval_node_id,
                    status=decision.status,
                    approval_id=approval_id,
                    notes=decision.notes,
                )
            except Exception as e:
                logger.exception(
                    "Failed to send approval signal for batch decision",
                    approval_id=decision.approval_id,
                    error=str(e),
                )

        # Collect tasks for successful decisions with approved/rejected status only
        async with WorkflowApiClient() as client:
            tasks = [
                send_single_signal(client, decision)
                for result_obj, decision in zip(results, decisions, strict=False)
                if result_obj.success
                and decision.status in (BatchApprovalDecisionStatus.APPROVED, BatchApprovalDecisionStatus.REJECTED)
            ]

            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    async def batch_decide(self, request: BatchApprovalRequest) -> BatchApprovalResponse:
        """Process multiple approval decisions in batch with row-level locking.

        Args:
            request: Typed batch approval request with decisions

        Returns:
            BatchApprovalResponse with individual results and counts

        Note:
            Uses row-level locking to prevent race conditions during batch operations.

        """
        results: list[BatchApprovalResult] = []
        approval_ids = [decision.approval_id for decision in request.decisions]

        # Fetch all approvals with row-level locking to prevent race conditions
        query = select(ApprovalRequest).where(ApprovalRequest.id.in_(approval_ids)).with_for_update()  # type: ignore[attr-defined]
        result = await self.session.exec(query)
        approvals = {approval.id: approval for approval in result.all()}

        # Process each decision
        for decision in request.decisions:
            try:
                result_obj = self._process_single_decision(decision, approvals)
                results.append(result_obj)
            except Exception as e:
                logger.exception(
                    "Failed to process approval decision",
                    approval_id=decision.approval_id,
                    error=str(e),
                )
                results.append(
                    BatchApprovalResult(
                        approval_id=decision.approval_id,
                        success=False,
                        error=str(e),
                    )
                )

        # Commit all changes at once
        await self.session.commit()

        # Send workflow signals for successful decisions
        await self._send_workflow_signals(results, request.decisions, approvals)

        # Calculate totals and return response
        total_success = sum(1 for r in results if r.success)
        total_failed = len(results) - total_success

        return BatchApprovalResponse(
            results=results,
            total_success=total_success,
            total_failed=total_failed,
        )
