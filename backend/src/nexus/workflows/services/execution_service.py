"""Execution service layer for business logic.

This service encapsulates execution-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import structlog
from sqlalchemy.orm import selectinload
from sqlmodel import and_, select
from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio.exceptions import ApplicationError

from nexus.authz.engine import AllowedProjectsResult
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.emission import emit_completion_metrics
from nexus.metrics.types import ComponentLabel, MetricType
from nexus.workflows.exceptions import (
    ExecutionInTerminalStateError,
    ExecutionNotFoundError,
    TemporalUnavailableError,
    WorkflowNotFoundError,
    WorkflowNotPublishedError,
)
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityExecutionListResponse
from nexus.workflows.models.execution import (
    TERMINAL_EXECUTION_STATUSES,
    ActivityData,
    Execution,
    ExecutionInclude,
    ExecutionListResponse,
    ExecutionMode,
    ExecutionRead,
    ExecutionStatus,
    PreResolvedNodeOutput,
)
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_definition import WorkflowDefinition
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

logger = structlog.stdlib.get_logger(__name__)

MAX_CALLBACK_ERROR_MSG_LENGTH = 500


class ExecutionsConvertResourceMixin(ConvertResourceMixin):
    """Execution-specific resource conversion to ExecutionRead format."""

    def __init__(self, include: set[ExecutionInclude] | None = None) -> None:
        """Initialize ExecutionsConvertResourceMixin with optional include parameter."""
        super().__init__()
        self.include = include

    def convert_resource(self, resource: Execution) -> ExecutionRead:  # type: ignore[override]
        """Convert Execution to ExecutionRead format."""
        result = ExecutionRead(
            id=resource.id,
            workflow_id=resource.workflow_id,
            workflow_version_id=resource.workflow_version_id,
            project_id=resource.project_id,
            temporal_workflow_id=resource.temporal_workflow_id,
            status=resource.status,
            created_by=resource.created_by,
            created_at=resource.created_at,
            completed_at=resource.completed_at,
            updated_at=resource.updated_at,
            updated_by=resource.updated_by,
            input_data=resource.input_data,
            trigger_node_id=resource.trigger_node_id,
            error_details=resource.error_details,
            labels=resource.labels,
            deleted_at=resource.deleted_at,
            deleted_by=resource.deleted_by,
            mode=resource.mode,
            execution_metadata=resource.execution_metadata,
        )

        if self.include and len(self.include) > 0:
            # Only include workflow_definition if explicitly requested
            if ExecutionInclude.WORKFLOW_DEFINITION in self.include:
                result.workflow_definition = WorkflowDefinition.model_validate(
                    resource.workflow_version.workflow_definition
                )

            # Only include activities if explicitly requested
            if ExecutionInclude.ACTIVITIES in self.include:
                result.activities = [
                    ActivityData(
                        activity_id=activity.activity_name,
                        status=activity.status.value if activity.status else "unknown",
                        error_details=activity.error_details,
                        output_data=activity.output_data,
                        started_at=activity.started_at,
                        completed_at=activity.completed_at,
                    )
                    for activity in resource.activities
                ]

        return result


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
        super().__init__(
            session,
            user,
            convert_resource_mixin=ExecutionsConvertResourceMixin(),
        )
        self.temporal_service = temporal_service

    async def _resolve_user_display_name(self, user_id: UUID) -> str:
        """Resolve a user ID to a display name, falling back to UUID string."""
        try:
            result = await self.session.exec(select(User).where(User.id == user_id))
            user = result.first()
            if user and hasattr(user, "display_name"):
                return user.display_name
        except Exception:  # noqa: BLE001
            logger.debug("Could not resolve user display name", user_id=str(user_id))
        return str(user_id)

    async def create_execution(
        self,
        workflow_id: UUID,
        input_data: dict[str, Any],
        trigger_node_id: str | None = None,
        *,
        use_published: bool = False,
    ) -> ExecutionRead:
        """Create and start a new workflow execution.

        This follows a two-phase creation process:
        1. Start Temporal workflow FIRST (external system validation)
        2. Create database record ONLY after Temporal accepts workflow

        This ensures no orphaned database records if Temporal rejects the workflow.

        Args:
            workflow_id: ID of workflow to execute
            input_data: Input parameters for the workflow
            trigger_node_id: Optional trigger node ID to start from (defaults to first trigger)
            use_published: If True, use the published version instead of current version

        Returns:
            Created execution with status=PENDING

        Raises:
            WorkflowNotFoundError: If workflow not found
            WorkflowNotPublishedError: If use_published=True and no published version
            Exception: If Temporal workflow start fails

        """
        logger.info("Creating execution for workflow by user", workflow_id=workflow_id, user_id=self.user.id)

        recorder = get_metrics_recorder()
        component = ComponentLabel.EXECUTION_SERVICE

        # Step 1: Validate workflow exists and resolve version
        version_field = Workflow.published_version if use_published else Workflow.current_version
        result = await self.session.exec(
            select(Workflow, WorkflowVersion)
            .join(
                WorkflowVersion,
                and_(
                    WorkflowVersion.workflow_id == Workflow.id,
                    WorkflowVersion.version == version_field,
                ),
            )
            .where(Workflow.id == workflow_id)
            .where(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]
        )
        row = result.first()

        if row is None:
            if use_published:
                wf_check = await self.session.exec(
                    select(Workflow).where(Workflow.id == workflow_id).where(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]
                )
                if wf_check.first() is not None:
                    raise WorkflowNotPublishedError(workflow_id)
            raise WorkflowNotFoundError(workflow_id)

        workflow, workflow_version = row

        logger.info(
            "Workflow validated",
            workflow_name=workflow.name,
            version=workflow_version.version,
            schema_version=workflow_version.schema_version,
        )

        # Step 2: Build workflow context for expression resolution.
        # Uses the reserved "workflow_context" namespace per the handbook proposal (P3).
        # "now" and "today" are NOT included here — they are resolved dynamically by the
        # workflow engine at each node execution so they reflect the current wall-clock time.
        # Users who need the execution start time can reference ${workflow_context.execution.created_at}.
        pre_generated_execution_id = str(uuid4())
        now = datetime.now(UTC)
        workflow_author = await self._resolve_user_display_name(workflow.created_by)
        workflow_metadata: dict[str, Any] = {
            "workflow_context": {
                "workflow": {
                    "name": workflow.name,
                    "id": str(workflow.id),
                    "version": workflow_version.version,
                    "published": workflow.published_version is not None,
                    "author": workflow_author,
                    "project_id": str(workflow.project_id) if workflow.project_id else None,
                },
                "execution": {
                    "id": pre_generated_execution_id,
                    "mode": "standard",
                    "created_by": self.user.display_name,
                    "created_at": now.isoformat(),
                    "workflow_version_id": str(workflow_version.id),
                },
            },
        }

        # Step 3: Start Temporal workflow FIRST (if temporal_service is available)
        from nexus.audit.emitter import request_id_context_var  # noqa: PLC0415

        if self.temporal_service is not None:
            logger.info("Starting Temporal workflow for execution...")
            with recorder.time(
                MetricType.WORKFLOW_START_LATENCY,
                labels={"component": component.value},
            ):
                temporal_result = await self.temporal_service.start_workflow(
                    workflow_def=workflow_version.workflow_definition,
                    workflow_name=workflow.name,
                    input_data=input_data,
                    workflow_id=str(workflow.id),
                    request_id=request_id_context_var.get(),
                    trigger_node_id=trigger_node_id,
                    workflow_metadata=workflow_metadata,
                    execution_id=pre_generated_execution_id,
                )
            temporal_workflow_id = temporal_result.temporal_workflow_id
            execution_id = UUID(temporal_result.execution_id)
            logger.info(
                "Temporal workflow started",
                temporal_workflow_id=temporal_result.temporal_workflow_id,
                temporal_run_id=temporal_result.temporal_run_id,
                execution_id=execution_id,
            )
        else:
            # For testing without Temporal, use the pre-generated ID
            execution_id = UUID(pre_generated_execution_id)
            temporal_workflow_id = f"exec-{execution_id}"
            logger.warning(
                "No Temporal service available, using stub workflow ID", temporal_workflow_id=temporal_workflow_id
            )

        # Step 3: Create execution record in database ONLY after Temporal accepts workflow
        execution = Execution(
            id=execution_id,
            workflow_id=workflow.id,
            workflow_version_id=workflow_version.id,
            project_id=workflow.project_id,
            temporal_workflow_id=temporal_workflow_id,
            status=ExecutionStatus.PENDING,
            input_data=input_data,
            trigger_node_id=trigger_node_id,
            created_by=self.user.id,
            updated_by=self.user.id,
        )

        self.session.add(execution)
        await self.session.commit()

        logger.info(
            "Execution created successfully",
            execution_id=execution.id,
            temporal_workflow_id=execution.temporal_workflow_id,
        )

        recorder.record(
            MetricType.WORKFLOW_STATUS,
            value=1,
            labels={
                "workflow_id": str(workflow.id),
                "execution_id": str(execution.id),
                "status": "started",
                "workflow_type": workflow.name,
            },
        )
        recorder.increment("total_workflows")
        recorder.increment_gauge("active_workflows")

        return self.convert_resource_mixin.convert_resource(execution)  # type: ignore[no-any-return]

    @staticmethod
    def _validate_pre_resolved_nodes(
        pre_resolved_nodes: dict[str, "PreResolvedNodeOutput"],
        target_node_id: str,
        node_ids: set[str],
        all_nodes: list[dict[str, Any]],
        workflow_def: dict[str, Any],
        *,
        execute_target: bool = True,
    ) -> None:
        """Validate pre_resolved_nodes against the workflow definition."""
        from nexus.core.exceptions import SafeValueError  # noqa: PLC0415

        trigger_ids = {t["id"] for t in workflow_def.get("triggers", []) if "id" in t}
        invalid_pre_resolved = set(pre_resolved_nodes.keys()) - node_ids
        if invalid_pre_resolved:
            trigger_refs = invalid_pre_resolved & trigger_ids
            non_trigger_refs = invalid_pre_resolved - trigger_ids
            parts = []
            if trigger_refs:
                parts.append(f"trigger nodes cannot be pre-resolved: {sorted(trigger_refs)}")
            if non_trigger_refs:
                parts.append(f"unknown node IDs: {sorted(non_trigger_refs)}")
            msg = f"pre_resolved_nodes contains invalid entries: {'; '.join(parts)}"
            raise SafeValueError(msg)

        if execute_target and target_node_id in pre_resolved_nodes:
            msg = (
                f"target_node_id '{target_node_id}' must not appear in "
                "pre_resolved_nodes — it would be skipped instead of executed"
            )
            raise SafeValueError(msg)

        control_flow_types = {"condition", "loop", "approval"}
        for node_id, node_output in pre_resolved_nodes.items():
            node_def = next((n for n in all_nodes if n.get("id") == node_id), None)
            if (
                node_def
                and node_def.get("type") in control_flow_types
                and (not node_output.control or "next_port" not in node_output.control)
            ):
                msg = (
                    f"Pre-resolved node '{node_id}' is a {node_def['type']} node "
                    "and requires control.next_port for routing"
                )
                raise SafeValueError(msg)

    async def create_test_execution(
        self,
        workflow_id: UUID,
        target_node_id: str,
        pre_resolved_nodes: dict[str, "PreResolvedNodeOutput"],
        trigger_inputs: dict[str, Any],
        *,
        execute_target: bool = True,
    ) -> ExecutionRead:
        """Create and start a test execution for a single node.

        Test executions use mocked outputs for predecessor nodes and stop after the target node completes.

        Args:
            workflow_id: ID of workflow to execute
            target_node_id: The node to execute for real
            pre_resolved_nodes: Mock outputs for predecessor nodes
            trigger_inputs: Input data for the trigger node
            execute_target: When False, run predecessors but skip the target node

        Returns:
            Created execution with mode=TEST and status=PENDING

        Raises:
            WorkflowNotFoundError: If workflow not found
            SafeValueError: If target_node_id not found in workflow definition
            Exception: If Temporal workflow start fails

        """
        from nexus.core.exceptions import SafeValueError  # noqa: PLC0415

        logger.info(
            "Creating test execution for workflow",
            workflow_id=workflow_id,
            user_id=self.user.id,
            target_node_id=target_node_id,
        )

        recorder = get_metrics_recorder()
        component = ComponentLabel.EXECUTION_SERVICE

        # Step 1: Validate workflow exists (is_enabled intentionally not checked —
        # users may test nodes in disabled/draft workflows during development)
        result = await self.session.exec(
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

        logger.info(
            "Workflow validated for test execution",
            workflow_name=workflow.name,
            version=workflow_version.version,
            schema_version=workflow_version.schema_version,
        )

        # Step 2: Validate target_node_id exists in workflow definition
        workflow_def = workflow_version.workflow_definition
        all_nodes = workflow_def.get("nodes", [])
        node_ids = {node["id"] for node in all_nodes if "id" in node}

        if target_node_id not in node_ids:
            msg = (
                f"Target node '{target_node_id}' not found in workflow. "
                f"Available nodes: {sorted(node_ids)}. "
                "Note: trigger nodes are not valid test targets."
            )
            raise SafeValueError(msg)

        self._validate_pre_resolved_nodes(
            pre_resolved_nodes,
            target_node_id,
            node_ids,
            all_nodes,
            workflow_def,
            execute_target=execute_target,
        )

        # Convert PreResolvedNodeOutput objects to dicts for Temporal and metadata
        pre_resolved_dicts = {node_id: output.model_dump() for node_id, output in pre_resolved_nodes.items()}

        # When execute_target is False, add the target to pre_resolved so it's
        # skipped by Temporal while predecessors still run. The target will still
        # be scheduled and "complete" (returning pre-resolved output immediately),
        # which triggers stop_after_nodes and prevents successor execution.
        if not execute_target and target_node_id not in pre_resolved_dicts:
            pre_resolved_dicts[target_node_id] = {"output": {}, "control": None}

        # Step 3: Build workflow context for expression resolution (test mode).
        # "now" and "today" are resolved dynamically per-node by the workflow engine.
        pre_generated_execution_id = str(uuid4())
        now = datetime.now(UTC)
        workflow_author = await self._resolve_user_display_name(workflow.created_by)
        workflow_metadata: dict[str, Any] = {
            "workflow_context": {
                "workflow": {
                    "name": workflow.name,
                    "id": str(workflow.id),
                    "version": workflow_version.version,
                    "published": workflow.published_version is not None,
                    "author": workflow_author,
                    "project_id": str(workflow.project_id) if workflow.project_id else None,
                },
                "execution": {
                    "id": pre_generated_execution_id,
                    "mode": "test",
                    "created_by": self.user.display_name,
                    "created_at": now.isoformat(),
                    "workflow_version_id": str(workflow_version.id),
                },
            },
        }

        # Step 4: Start Temporal workflow with test parameters (if temporal_service is available)
        from nexus.audit.emitter import request_id_context_var  # noqa: PLC0415

        if self.temporal_service is not None:
            logger.info("Starting Temporal workflow for test execution...")
            with recorder.time(
                MetricType.WORKFLOW_START_LATENCY,
                labels={"component": component.value},
            ):
                temporal_result = await self.temporal_service.start_workflow(
                    workflow_def=workflow_def,
                    workflow_name=workflow.name,
                    input_data=trigger_inputs,
                    workflow_id=str(workflow.id),
                    request_id=request_id_context_var.get(),
                    trigger_node_id=None,  # Use default trigger for test executions
                    pre_resolved_outputs=pre_resolved_dicts,
                    stop_after_nodes=[target_node_id],
                    include_node_results=True,  # Include results in response for test executions
                    workflow_metadata=workflow_metadata,
                    execution_id=pre_generated_execution_id,
                )
            temporal_workflow_id = temporal_result.temporal_workflow_id
            execution_id = UUID(temporal_result.execution_id)
            logger.info(
                "Temporal test workflow started",
                temporal_workflow_id=temporal_result.temporal_workflow_id,
                temporal_run_id=temporal_result.temporal_run_id,
                execution_id=execution_id,
            )
        else:
            # For testing without Temporal, use the pre-generated ID
            execution_id = UUID(pre_generated_execution_id)
            temporal_workflow_id = f"test-exec-{execution_id}"
            logger.warning(
                "No Temporal service available, using stub workflow ID", temporal_workflow_id=temporal_workflow_id
            )

        # Step 4: Create execution record in database with TEST mode
        execution = Execution(
            id=execution_id,
            workflow_id=workflow.id,
            workflow_version_id=workflow_version.id,
            project_id=workflow.project_id,
            temporal_workflow_id=temporal_workflow_id,
            status=ExecutionStatus.PENDING,
            mode=ExecutionMode.TEST,
            input_data=trigger_inputs,
            trigger_node_id=None,  # Test executions use default trigger
            execution_metadata={
                "target_node_id": target_node_id,
                "pre_resolved_nodes": pre_resolved_dicts,
                "execute_target": execute_target,
            },
            created_by=self.user.id,
            updated_by=self.user.id,
        )

        self.session.add(execution)
        await self.session.commit()

        logger.info(
            "Test execution created successfully",
            execution_id=execution.id,
            temporal_workflow_id=execution.temporal_workflow_id,
            mode="test",
        )

        recorder.record(
            MetricType.WORKFLOW_STATUS,
            value=1,
            labels={
                "workflow_id": str(workflow.id),
                "execution_id": str(execution.id),
                "status": "started",
                "workflow_type": workflow.name,
                "execution_mode": "test",
            },
        )

        # Intentionally omitting total_workflows/active_workflows gauge increments
        # to avoid skewing production metrics with test executions

        return self.convert_resource_mixin.convert_resource(execution)  # type: ignore[no-any-return]

    async def get_execution(self, execution_id: UUID, *, include: set[ExecutionInclude] | None = None) -> ExecutionRead:
        """Get an execution by ID.

        Args:
            execution_id: Execution ID
            include: Optional set of related data to include (workflow_definition, activities)

        Returns:
            ExecutionRead object

        Raises:
            ExecutionNotFoundError: If execution not found

        """
        # Build query with conditional eager loading based on include parameter
        query = (
            select(Execution)
            .where(Execution.id == execution_id)
            .where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
            .options(selectinload(Execution.workflow))  # type: ignore[arg-type]
        )

        # Eagerly load workflow_version if workflow_definition is requested
        if include and ExecutionInclude.WORKFLOW_DEFINITION in include:
            query = query.options(selectinload(Execution.workflow_version))  # type: ignore[arg-type]

        # Eagerly load activities if activities is requested
        if include and ExecutionInclude.ACTIVITIES in include:
            query = query.options(selectinload(Execution.activities))  # type: ignore[arg-type]

        result = await self.session.exec(query)
        execution = result.one_or_none()

        if execution is None:
            raise ExecutionNotFoundError(execution_id)

        await self._emit_completion_metrics(execution)

        # We need to use an "include"-aware instance of ExecutionsConvertResourceMixin
        mixin: ExecutionsConvertResourceMixin = ExecutionsConvertResourceMixin(include)
        return mixin.convert_resource(execution)

    async def list_executions(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
        allowed_projects: AllowedProjectsResult | None = None,
    ) -> "ExecutionListResponse":
        """List executions with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of executions to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "created_at", "-status")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response
            allowed_projects: Optional project scope filter for authorization

        Returns:
            ExecutionListResponse with executions, pagination metadata, and optional total

        """
        # Use unified list_resources method with overridden methods
        return await self.list_resources(
            model=Execution,
            response_type=ExecutionListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",  # Default DESC sort if none provided
            query_params_items=query_params_items,
            include_total=include_total,
            allowed_projects=allowed_projects,
        )

    async def list_execution_activities(
        self,
        execution_id: UUID,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> ActivityExecutionListResponse:
        """List activities for an execution with cursor-based pagination.

        Activities are automatically synced to the database in real-time by the
        ActivitySyncService running in the Temporal worker. This method queries
        the database for the current state with pagination support.

        Args:
            execution_id: Execution ID
            limit: Maximum number of activities to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "created_at", "-created_at")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response

        Returns:
            ActivityExecutionListResponse with activities and pagination metadata

        Raises:
            ExecutionNotFoundError: If execution not found

        """
        # Verify execution exists
        exec_result = await self.session.exec(
            select(Execution).where(Execution.id == execution_id).where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
        )
        if exec_result.one_or_none() is None:
            raise ExecutionNotFoundError(execution_id)

        # Inject execution_id as a filter param alongside any caller-supplied params
        execution_filter = [("execution_id", str(execution_id))]
        if query_params_items:
            execution_filter.extend(query_params_items)

        # Pass identity converter — the service's default mixin converts to ExecutionRead,
        # but ActivityExecution is used directly as the response model.
        return await self.list_resources(
            model=ActivityExecution,
            response_type=ActivityExecutionListResponse,
            response_type_converter=lambda a: a,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",
            query_params_items=execution_filter,
            include_total=include_total,
        )

    async def _emit_completion_metrics(self, execution: Execution) -> None:
        """Emit workflow and activity metrics on first terminal-state read.

        Delegates to ``emission.emit_completion_metrics`` which owns the
        dedup set, terminal-state check and all metric recording.
        """
        recorder = get_metrics_recorder()
        await emit_completion_metrics(self.session, execution, recorder)

    async def handle_activity_callback(
        self,
        execution_id: UUID,
        activity_id: str,
        signal_data: dict[str, Any],
    ) -> None:
        """Handle an external callback for an async-completion activity.

        Routes the callback to either complete or fail the Temporal activity
        based on the signal_data status field.

        Args:
            execution_id: Execution ID
            activity_id: Activity ID from workflow definition
            signal_data: Callback payload (must contain "status" field)

        Raises:
            ExecutionNotFoundError: If execution not found
            TemporalUnavailableError: If Temporal service unavailable

        """
        execution = await self.get_execution(execution_id)

        if self.temporal_service is None:
            operation = "activity callback"
            raise TemporalUnavailableError(operation)

        logger.info(
            "Handling activity callback",
            activity_id=activity_id,
            execution_id=execution_id,
            temporal_workflow_id=execution.temporal_workflow_id,
            status=signal_data.get("status"),
        )

        status = signal_data.get("status")
        if status == "failed":
            error_info = signal_data.get("error", {})
            if isinstance(error_info, dict):
                error_msg = str(error_info.get("message", "Activity execution failed"))[:MAX_CALLBACK_ERROR_MSG_LENGTH]
                error_type = str(error_info.get("error_type", "UnknownError"))
            else:
                error_msg = (str(error_info) if error_info else "Activity execution failed")[
                    :MAX_CALLBACK_ERROR_MSG_LENGTH
                ]
                error_type = "UnknownError"

            error = ApplicationError(
                f"{error_type}: {error_msg}",
                type=error_type,
                non_retryable=True,
            )
            await self.temporal_service.fail_async_activity(
                temporal_workflow_id=execution.temporal_workflow_id,
                activity_id=activity_id,
                error=error,
            )
        else:
            # Fail-open: any non-"failed" status (including "approved", "rejected",
            # "completed") completes the activity. The workflow routes based on the
            # output data (e.g., approval decision), not the Temporal activity state.
            await self.temporal_service.complete_async_activity(
                temporal_workflow_id=execution.temporal_workflow_id,
                activity_id=activity_id,
                result={"output": signal_data},
            )

        logger.info(
            "Activity callback handled",
            activity_id=activity_id,
            execution_id=execution_id,
            status=status,
        )

    async def cancel_execution(self, execution_id: UUID) -> None:
        """Cancel a running workflow execution.

        Requests Temporal to cancel the workflow. The actual status update
        to CANCELLED happens asynchronously via activity_sync_service.

        Args:
            execution_id: Execution ID to cancel

        Raises:
            ExecutionNotFoundError: If execution not found
            ExecutionInTerminalStateError: If execution is in a terminal state
            TemporalUnavailableError: If Temporal service is unavailable

        """
        query = select(Execution).where(Execution.id == execution_id).where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
        result = await self.session.exec(query)
        execution = result.one_or_none()

        if execution is None:
            raise ExecutionNotFoundError(execution_id)

        if execution.status in TERMINAL_EXECUTION_STATUSES:
            raise ExecutionInTerminalStateError(
                execution_id=execution_id,
                status=execution.status.value,
                operation="cancel",
            )

        if self.temporal_service is None:
            operation = "workflow cancellation"
            raise TemporalUnavailableError(operation)

        logger.info(
            "Requesting workflow cancellation",
            execution_id=execution_id,
            temporal_workflow_id=execution.temporal_workflow_id,
            current_status=execution.status.value,
        )

        await self.temporal_service.cancel_workflow(temporal_workflow_id=execution.temporal_workflow_id)
