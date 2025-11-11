"""Execution service layer for business logic.

This service encapsulates execution-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

import logging
from collections.abc import Iterable
from typing import Any
from uuid import UUID, uuid4

import yaml
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import and_, select

from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    WorkflowDisabledError,
    WorkflowNotFoundError,
)
from nexus.workflows.models.execution import Execution, ExecutionListResponse, ExecutionRead, ExecutionStatus
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.services.utilities import sync_execution_status_from_temporal
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

logger = logging.getLogger(__name__)


class ExecutionService(BaseService):
    """Service for execution business logic.

    This service encapsulates all execution-related business operations,
    including creation, status management, and Temporal integration.
    """

    def __init__(
        self,
        session: AsyncSession,
        user: User,
        temporal_service: TemporalExecutionService | None = None,
    ) -> None:
        """Initialize service with database session.

        Args:
            session: Database session for queries
            user: Current authenticated user
            temporal_service: Optional Temporal execution service for workflow operations

        """
        super().__init__(session, user)
        self.temporal_service = temporal_service

    async def create_execution(
        self,
        workflow_id: UUID,
        input_data: dict[str, Any],
    ) -> Execution:
        """Create and start a new workflow execution.

        This follows a two-phase creation process:
        1. Start Temporal workflow FIRST (external system validation)
        2. Create database record ONLY after Temporal accepts workflow

        This ensures no orphaned database records if Temporal rejects the workflow.

        Args:
            workflow_id: ID of workflow to execute
            input_data: Input parameters for the workflow

        Returns:
            Created execution with status=PENDING

        Raises:
            WorkflowNotFoundError: If workflow not found
            WorkflowDisabledError: If workflow is disabled
            Exception: If Temporal workflow start fails

        """
        logger.info("Creating execution for workflow %s by user %s", workflow_id, self.user.id)

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
            created_by=self.user.id,
            updated_by=self.user.id,
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

    async def list_executions(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> "ExecutionListResponse":
        """List executions with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of executions to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "created_at", "-status")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response

        Returns:
            ExecutionListResponse with executions, pagination metadata, and optional total

        """

        async def sync_from_temporal(executions: list[Execution]) -> None:
            """Sync execution status from Temporal."""
            if self.temporal_service is not None:
                changes = [
                    await sync_execution_status_from_temporal(
                        execution, self.temporal_service, session=None, persist=False
                    )
                    for execution in executions
                ]
                # Commit all changes together if any execution status changed
                if any(changes):
                    await self.session.commit()

        # Use unified list_resources method with converter for ExecutionRead
        return await self.list_resources(
            model=Execution,
            response_type=ExecutionListResponse,
            response_type_converter=lambda execution: ExecutionRead.model_validate(execution),
            post_query_callback=sync_from_temporal,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",  # Default DESC sort if none provided
            query_params_items=query_params_items,
            include_total=include_total,
        )
