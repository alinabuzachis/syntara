"""Execution service layer for business logic.

This service encapsulates execution-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

import logging
from typing import Any
from uuid import UUID, uuid4

import yaml
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import and_, select

from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.workflow_engine.services.execution_service import (
    ExecutionService as TemporalExecutionService,
)

logger = logging.getLogger(__name__)


class WorkflowNotFoundError(Exception):
    """Raised when a workflow is not found."""

    def __init__(self, workflow_id: UUID) -> None:
        """Initialize exception with workflow ID."""
        self.workflow_id = workflow_id
        super().__init__(f"Workflow {workflow_id} not found")


class WorkflowDisabledError(Exception):
    """Raised when attempting to execute a disabled workflow."""

    def __init__(self, workflow_id: UUID) -> None:
        """Initialize exception with workflow ID."""
        self.workflow_id = workflow_id
        super().__init__(f"Workflow {workflow_id} is disabled")


class ExecutionNotFoundError(Exception):
    """Raised when an execution is not found."""

    def __init__(self, execution_id: UUID) -> None:
        """Initialize exception with execution ID."""
        self.execution_id = execution_id
        super().__init__(f"Execution {execution_id} not found")


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

        Args:
            execution_id: Execution ID

        Returns:
            Execution object

        Raises:
            ExecutionNotFoundError: If execution not found

        """
        result = await self.session.execute(
            select(Execution).where(Execution.id == execution_id).where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
        )
        execution = result.scalar_one_or_none()

        if execution is None:
            raise ExecutionNotFoundError(execution_id)

        return execution
