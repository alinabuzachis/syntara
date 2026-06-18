"""Scheduled workflow launcher for Temporal Schedule integration.

When a Temporal Schedule fires, it starts the ``ScheduledWorkflowLauncher``
workflow which delegates to the ``ScheduledExecutionLauncher`` activity.
The activity replicates the ``ExecutionService.create_execution()`` flow
in the worker context: loads the published workflow definition, starts
NexusWorkflow via Temporal, and creates the Execution record in the database.
"""

from collections.abc import Callable
from datetime import datetime, timedelta
from uuid import UUID

from temporalio import activity, workflow

with workflow.unsafe.imports_passed_through():
    import structlog
    from sqlmodel import and_, select
    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.core.config.base import get_settings
    from nexus.core.models import User
    from nexus.metrics.dependencies import get_metrics_recorder
    from nexus.metrics.types import MetricType
    from nexus.workflows.exceptions import WorkflowNotPublishedError
    from nexus.workflows.models.execution import Execution, ExecutionStatus
    from nexus.workflows.models.workflow import Workflow
    from nexus.workflows.models.workflow_version import WorkflowVersion
    from nexus.workflows.utils.schedule_parser import build_schedule_id
    from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName
    from nexus.workflows.workflow_engine.services.temporal_execution_service import (
        create_temporal_execution_service,
    )

    logger = structlog.stdlib.get_logger(__name__)

# Timeout for the launcher activity. This covers DB queries + Temporal
# workflow start, so 60 seconds provides ample headroom.
_LAUNCHER_ACTIVITY_NAME = "launch_scheduled_execution"
_LAUNCHER_ACTIVITY_TIMEOUT_SECONDS = 60


@workflow.defn(name="scheduled_workflow_launcher")
class ScheduledWorkflowLauncher:
    """Temporal workflow that launches a NexusWorkflow on behalf of a schedule.

    This is the action target for Temporal Schedules. When a schedule fires,
    Temporal starts this workflow which delegates to the launcher activity.
    """

    @workflow.run
    async def run(self, workflow_id: str, trigger_node_id: str) -> dict[str, str]:
        """Launch a scheduled workflow execution.

        Args:
            workflow_id: UUID of the workflow to execute (as string).
            trigger_node_id: Trigger node ID within the workflow definition.

        Returns:
            Dict with execution_id and temporal_workflow_id of the started workflow.

        """
        result: dict[str, str] = await workflow.execute_activity(
            _LAUNCHER_ACTIVITY_NAME,
            args=[workflow_id, trigger_node_id],
            start_to_close_timeout=timedelta(seconds=_LAUNCHER_ACTIVITY_TIMEOUT_SECONDS),
        )
        return result


class ScheduledExecutionLauncher:
    """Class-based Temporal activity that launches scheduled workflow executions.

    Receives a ``session_factory`` and ``task_queue`` at construction time
    (injected during worker startup) to avoid creating new DB engines and
    Temporal clients per invocation.

    The activity replicates the three-phase flow from
    ``ExecutionService.create_execution()``:
    1. Load published workflow definition from DB
    2. Start NexusWorkflow via ``TemporalExecutionService``
    3. Create Execution record in DB

    """

    def __init__(
        self,
        session_factory: Callable[..., AsyncSession],
        task_queue: str,
    ) -> None:
        """Initialize with worker-provided dependencies.

        Args:
            session_factory: Async SQLModel session factory (e.g., ``AsyncSessionLocal``).
            task_queue: Temporal task queue name for starting NexusWorkflow.

        """
        self._session_factory = session_factory
        self._task_queue = task_queue

    @activity.defn(name=_LAUNCHER_ACTIVITY_NAME)
    async def run(self, workflow_id_str: str, trigger_node_id: str) -> dict[str, str]:
        """Launch a scheduled workflow execution.

        Loads the published workflow version, starts NexusWorkflow via Temporal,
        and creates the Execution record in the database using the system user.
        Records schedule timing metadata and Prometheus metrics.

        Args:
            workflow_id_str: UUID of the workflow (as string).
            trigger_node_id: Trigger node ID to start from.

        Returns:
            Dict with ``execution_id`` and ``temporal_workflow_id``.

        Raises:
            RuntimeError: If the system user is not found.
            WorkflowNotPublishedError: If the workflow is not published.

        """
        workflow_id = UUID(workflow_id_str)

        # Capture schedule timing from Temporal activity info
        info = activity.info()
        scheduled_at = info.scheduled_time
        triggered_at = info.started_time

        logger.info(
            "Launching scheduled execution",
            workflow_id=workflow_id_str,
            trigger_node_id=trigger_node_id,
            scheduled_at=scheduled_at.isoformat(),
            triggered_at=triggered_at.isoformat(),
        )

        recorder = get_metrics_recorder()

        try:
            result = await self._create_execution(workflow_id, trigger_node_id, scheduled_at, triggered_at)

            try:
                recorder.record(
                    MetricType.SCHEDULED_TRIGGER_FIRES,
                    value=1,
                    labels={"status": "success"},
                )
                latency_ms = (triggered_at - scheduled_at).total_seconds() * 1000
                recorder.record(
                    MetricType.SCHEDULED_TRIGGER_LATENCY,
                    value=latency_ms,
                    labels={},
                )
            except Exception:  # noqa: BLE001
                logger.debug("Failed to record success metric", exc_info=True)

            return result
        except Exception:
            try:
                recorder.record(
                    MetricType.SCHEDULED_TRIGGER_FIRES,
                    value=1,
                    labels={"status": "error"},
                )
            except Exception:  # noqa: BLE001
                logger.debug("Failed to record error metric", exc_info=True)
            raise

    async def _create_execution(
        self,
        workflow_id: UUID,
        trigger_node_id: str,
        scheduled_at: datetime,
        triggered_at: datetime,
    ) -> dict[str, str]:
        """Three-phase execution creation (mirrors ExecutionService.create_execution).

        Phase 1: Load workflow + published version (read session)
        Phase 2: Start NexusWorkflow via Temporal (no DB session held)
        Phase 3: Create Execution record in DB (write session)

        Uses separate sessions for read and write phases so the DB
        connection pool slot is released during the Temporal RPC.

        Not fully idempotent: a process crash between Phase 3 commit and
        return could cause Temporal to retry, creating a duplicate.  The
        window is a few microseconds of logging/dict construction, and
        retries are sequential, so the practical risk is negligible.
        """
        # Phase 1: Load published workflow definition (read-only session)
        async with self._session_factory() as session:
            wf_workflow, wf_version = await self._load_published_workflow(session, workflow_id)
            system_user = await self._get_system_user(session)
            wf_id = wf_workflow.id
            wf_name = wf_workflow.name
            wf_project_id = wf_workflow.project_id
            wf_version_id = wf_version.id
            workflow_def = wf_version.workflow_definition
            system_user_id = system_user.id

        # Phase 2: Start NexusWorkflow via Temporal (no DB session held)
        temporal_service = await create_temporal_execution_service(task_queue=self._task_queue)
        temporal_result = await temporal_service.start_workflow(
            workflow_def=workflow_def,
            workflow_name=wf_name,
            input_data={
                "scheduled_at": scheduled_at.isoformat(),
                "triggered_at": triggered_at.isoformat(),
            },
            workflow_id=str(workflow_id),
            trigger_node_id=trigger_node_id,
        )

        execution_id = UUID(temporal_result.execution_id)

        logger.info(
            "NexusWorkflow started by schedule",
            execution_id=str(execution_id),
            temporal_workflow_id=temporal_result.temporal_workflow_id,
        )

        # Phase 3: Create Execution record in DB with schedule metadata
        async with self._session_factory() as session:
            execution = Execution(
                id=execution_id,
                workflow_id=wf_id,
                workflow_version_id=wf_version_id,
                project_id=wf_project_id,
                temporal_workflow_id=temporal_result.temporal_workflow_id,
                status=ExecutionStatus.PENDING,
                input_data={},
                trigger_node_id=trigger_node_id,
                created_by=system_user_id,
                updated_by=system_user_id,
                execution_metadata={
                    "trigger_type": ActivityName.SCHEDULED_TRIGGER,
                    "schedule_id": build_schedule_id(str(workflow_id), trigger_node_id),
                    "scheduled_at": scheduled_at.isoformat(),
                    "triggered_at": triggered_at.isoformat(),
                },
            )

            session.add(execution)
            await session.commit()

        logger.info(
            "Scheduled execution created",
            execution_id=str(execution_id),
            workflow_id=str(workflow_id),
            trigger_node_id=trigger_node_id,
        )

        return {
            "execution_id": str(execution_id),
            "temporal_workflow_id": temporal_result.temporal_workflow_id,
        }

    @staticmethod
    async def _load_published_workflow(
        session: AsyncSession,
        workflow_id: UUID,
    ) -> tuple[Workflow, WorkflowVersion]:
        """Load workflow and its published version from the database.

        Raises:
            WorkflowNotPublishedError: If the workflow is not found or not published.

        """
        result = await session.exec(
            select(Workflow, WorkflowVersion)
            .join(
                WorkflowVersion,
                and_(
                    WorkflowVersion.workflow_id == Workflow.id,
                    WorkflowVersion.version == Workflow.published_version,
                ),
            )
            .where(Workflow.id == workflow_id)
            .where(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]
            .where(Workflow.is_enabled == True)  # noqa: E712
        )
        row = result.first()
        if row is None:
            raise WorkflowNotPublishedError(workflow_id)
        return row

    @staticmethod
    async def _get_system_user(session: AsyncSession) -> User:
        """Load the system user for scheduled executions."""
        settings = get_settings()
        user = await session.get(User, settings.system_user_id)
        if user is None:
            msg = (
                f"System user {settings.system_user_id} not found. "
                "Run 'uv run python tools/create_system_user.py' to create it."
            )
            raise RuntimeError(msg)
        return user
