"""Execution service layer for business logic.

This service encapsulates execution-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

import logging
from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import yaml
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import and_, or_, select

if TYPE_CHECKING:
    from sqlmodel.sql.expression import SelectOfScalar

from nexus.core.utils.cursor import (
    PaginationDirection,
    SortDirection,
    decode_cursor,
    extract_pagination_from_cursor,
)
from nexus.core.utils.labels import apply_label_filters
from nexus.core.utils.sorting import apply_sorting, parse_sort
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    WorkflowDisabledError,
    WorkflowNotFoundError,
)
from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.services.utilities import sync_execution_status_from_temporal
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

logger = logging.getLogger(__name__)


class ExecutionService:
    """Service for execution business logic.

    This service encapsulates all execution-related business operations,
    including creation, status management, and Temporal integration.
    """

    def __init__(
        self,
        session: AsyncSession,
        temporal_service: TemporalExecutionService | None = None,
    ) -> None:
        """Initialize service with database session.

        Args:
            session: Database session for queries
            temporal_service: Optional Temporal execution service for workflow operations

        """
        self.session = session
        self.temporal_service = temporal_service

    async def create_execution(
        self,
        workflow_id: UUID,
        input_data: dict[str, Any],
        created_by: UUID,
    ) -> Execution:
        """Create and start a new workflow execution.

        This follows a two-phase creation process:
        1. Start Temporal workflow FIRST (external system validation)
        2. Create database record ONLY after Temporal accepts workflow

        This ensures no orphaned database records if Temporal rejects the workflow.

        Args:
            workflow_id: ID of workflow to execute
            input_data: Input parameters for the workflow
            created_by: UUID of user creating the execution

        Returns:
            Created execution with status=PENDING

        Raises:
            WorkflowNotFoundError: If workflow not found
            WorkflowDisabledError: If workflow is disabled
            Exception: If Temporal workflow start fails

        """
        logger.info("Creating execution for workflow %s by user %s", workflow_id, created_by)

        # Step 1: Validate workflow exists and is enabled
        result = await self.session.execute(
            select(Workflow, WorkflowVersion)
            .join(
                WorkflowVersion,
                and_(
                    WorkflowVersion.workflow_id == Workflow.id,
                    WorkflowVersion.version == Workflow.current_version,
                ),
            )
            .where(Workflow.id == workflow_id)
            .where(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]
        )
        row = result.first()

        if row is None:
            raise WorkflowNotFoundError(workflow_id)

        workflow, workflow_version = row

        if not workflow.is_enabled:
            raise WorkflowDisabledError(workflow_id)

        logger.info(
            "Workflow validated: %s (version %d, schema %s)",
            workflow.name,
            workflow_version.version,
            workflow_version.schema_version,
        )

        # Step 2: Start Temporal workflow FIRST (if temporal_service is available)
        temporal_workflow_id = None
        if self.temporal_service is not None:
            # Convert workflow definition to YAML for Temporal
            workflow_yaml = yaml.dump(workflow_version.workflow_definition)

            logger.info("Starting Temporal workflow for execution...")
            temporal_result = await self.temporal_service.start_yaml_workflow(
                workflow_yaml=workflow_yaml,
                workflow_name=workflow.name,
                input_data=input_data,
            )
            temporal_workflow_id = temporal_result.temporal_workflow_id
            logger.info(
                "Temporal workflow started: %s (run_id: %s)",
                temporal_result.temporal_workflow_id,
                temporal_result.temporal_run_id,
            )
        else:
            # For testing without Temporal, generate a stub ID
            temporal_workflow_id = f"exec-{uuid4()}"
            logger.warning("No Temporal service available, using stub workflow ID: %s", temporal_workflow_id)

        # Step 3: Create execution record in database ONLY after Temporal accepts workflow
        execution = Execution(
            workflow_id=workflow.id,
            workflow_version_id=workflow_version.id,
            temporal_workflow_id=temporal_workflow_id,
            status=ExecutionStatus.PENDING,
            input_data=input_data,
            created_by=created_by,
            updated_by=created_by,
        )

        self.session.add(execution)
        await self.session.commit()
        await self.session.refresh(execution)

        logger.info(
            "Execution created successfully: %s (temporal_workflow_id: %s)",
            execution.id,
            execution.temporal_workflow_id,
        )

        return execution

    async def get_execution(self, execution_id: UUID) -> Execution:
        """Get an execution by ID.

        Always syncs execution status from Temporal before returning to ensure
        the returned execution has the most up-to-date status.

        Args:
            execution_id: Execution ID

        Returns:
            Execution object with current status from Temporal

        Raises:
            ExecutionNotFoundError: If execution not found

        """
        result = await self.session.execute(
            select(Execution).where(Execution.id == execution_id).where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
        )
        execution = result.scalar_one_or_none()

        if execution is None:
            raise ExecutionNotFoundError(execution_id)

        # Sync status from Temporal if available
        if self.temporal_service is not None:
            await sync_execution_status_from_temporal(
                execution, self.temporal_service, session=self.session, persist=True
            )

        return execution

    def _apply_cursor_pagination(
        self,
        query: "SelectOfScalar[Execution]",
        cursor: str,
        sort_direction: SortDirection,
    ) -> "SelectOfScalar[Execution]":
        """Apply cursor-based pagination to query.

        Args:
            query: SQLAlchemy query to apply pagination to
            cursor: Base64-encoded pagination cursor
            sort_direction: Sort direction for pagination

        Returns:
            Query with cursor pagination applied

        """
        cursor_data = decode_cursor(cursor)
        resource_id, created_at_str, direction = extract_pagination_from_cursor(cursor_data)

        if not resource_id or not created_at_str:
            return query

        cursor_id = UUID(resource_id)
        cursor_created_at = datetime.fromisoformat(created_at_str)

        # Apply cursor filtering based on sort direction and pagination direction
        if direction == PaginationDirection.NEXT:
            if sort_direction == SortDirection.DESC:
                return query.where(
                    or_(
                        Execution.created_at < cursor_created_at,
                        and_(Execution.created_at == cursor_created_at, Execution.id < cursor_id),
                    )
                )
            return query.where(
                or_(
                    Execution.created_at > cursor_created_at,
                    and_(Execution.created_at == cursor_created_at, Execution.id > cursor_id),
                )
            )
        if sort_direction == SortDirection.DESC:
            return query.where(
                or_(
                    Execution.created_at > cursor_created_at,
                    and_(Execution.created_at == cursor_created_at, Execution.id > cursor_id),
                )
            )
        return query.where(
            or_(
                Execution.created_at < cursor_created_at,
                and_(Execution.created_at == cursor_created_at, Execution.id < cursor_id),
            )
        )

    async def list_executions_cursor(
        self,
        *,
        workflow_id: UUID | None = None,
        created_by: UUID | None = None,
        status: ExecutionStatus | None = None,
        labels_filter: dict[str, str] | None = None,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
    ) -> list[Execution]:
        """List executions using cursor-based pagination.

        Args:
            workflow_id: Filter by workflow ID
            created_by: Filter by user who created the execution
            status: Filter by execution status
            labels_filter: Filter by labels (key-value pairs)
            limit: Maximum number of results to return
            cursor: Base64-encoded pagination cursor
            sort: Sort parameter (e.g., "created_at" or "-created_at")

        Returns:
            List of executions for the current page

        """
        # Build base query with soft delete filter
        query = select(Execution).where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]

        # Apply field filters
        if workflow_id:
            query = query.where(Execution.workflow_id == workflow_id)

        if created_by:
            query = query.where(Execution.created_by == created_by)

        if status:
            query = query.where(Execution.status == status)

        # Apply label filters using core utility
        if labels_filter:
            query = apply_label_filters(query, labels_filter, Execution)  # type: ignore[assignment]

        # Parse and apply sorting
        allowed_sort_fields = ["created_at", "updated_at", "completed_at", "status"]
        sort_field, sort_direction = parse_sort(
            sort, allowed_sort_fields, default_field="created_at", default_direction=SortDirection.DESC
        )

        # Apply cursor-based pagination
        if cursor:
            query = self._apply_cursor_pagination(query, cursor, sort_direction)

        # Apply sorting with tie-breaker
        query = apply_sorting(query, [(sort_field, sort_direction), ("id", sort_direction)], Execution)  # type: ignore[assignment]

        # Limit results
        query = query.limit(limit)

        # Execute query
        result = await self.session.execute(query)
        executions = list(result.scalars().all())

        # Sync status from Temporal for each execution if available
        if self.temporal_service is not None:
            changes = [
                await sync_execution_status_from_temporal(execution, self.temporal_service, session=None, persist=False)
                for execution in executions
            ]

            # Commit all changes together if any execution status changed
            if any(changes):
                await self.session.commit()

        return executions

    async def count_executions(
        self,
        *,
        workflow_id: UUID | None = None,
        created_by: UUID | None = None,
        status: ExecutionStatus | None = None,
        labels_filter: dict[str, str] | None = None,
    ) -> int:
        """Count executions matching filters.

        Args:
            workflow_id: Filter by workflow ID
            created_by: Filter by user who created the execution
            status: Filter by execution status
            labels_filter: Filter by labels (key-value pairs)

        Returns:
            Total count of matching executions

        """
        # Build count query with same filters as list
        query = select(func.count()).select_from(Execution).where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]

        if workflow_id:
            query = query.where(Execution.workflow_id == workflow_id)

        if created_by:
            query = query.where(Execution.created_by == created_by)

        if status:
            query = query.where(Execution.status == status)

        if labels_filter:
            query = apply_label_filters(query, labels_filter, Execution)  # type: ignore[assignment]

        result = await self.session.execute(query)
        return result.scalar_one()
