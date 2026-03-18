"""Test fixtures and helpers for workflow tests."""

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.workflows.models import Workflow, WorkflowVersion
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.models.execution import Execution, ExecutionStatus


def create_minimal_workflow_definition(
    name: str = "test-workflow",
    description: str = "Test workflow description",
    activity_id: str = "test_activity",
    activity_type: str = "task",
) -> dict[str, Any]:
    """Create a minimal valid workflow definition for testing.

    Returns a dict with camelCase keys matching the WorkflowDefinition schema.
    Useful for creating test workflows with minimal required fields.

    Args:
        name: Workflow name
        description: Workflow description
        activity_id: Activity ID
        activity_type: Activity type (task, parallel, sequence, condition, loop, join)

    Returns:
        Dict with workflow definition structure ready for validation

    """
    # Base workflow structure
    workflow_def: dict[str, Any] = {
        "schemaVersion": "1.0.0",
        "version": 1,
        "metadata": {"name": name, "description": description},
        "triggers": [{"type": "manual"}],
        "workflow": {"activities": []},
    }

    # Add activity based on type
    if activity_type == "task":
        workflow_def["workflow"]["activities"] = [
            {
                "id": activity_id,
                "name": f"Activity {activity_id}",
                "type": "task",
                "task": {
                    "executor": "script",
                    "config": {"language": "python", "code": "print('hello')"},
                },
            }
        ]
    else:
        # For non-task types, create minimal activity
        workflow_def["workflow"]["activities"] = [
            {
                "id": activity_id,
                "name": f"Activity {activity_id}",
                "type": activity_type,
            }
        ]

    return workflow_def


def create_workflow_definition_with_activities(
    name: str,
    description: str,
    activities: list[dict[str, object]],
) -> dict[str, Any]:
    """Create a workflow definition with custom activities as dict.

    Args:
        name: Workflow name
        description: Workflow description
        activities: List of activity definitions

    Returns:
        Dict matching WorkflowDefinition schema

    """
    return {
        "schemaVersion": "1.0.0",
        "version": 1,
        "metadata": {"name": name, "description": description},
        "triggers": [{"type": "manual"}],
        "workflow": {"activities": activities},
    }


class ExecutionsFactory:
    """Factory class for creating test executions with configurable properties."""

    def __init__(self, session: AsyncSession, workflow: Workflow, user: User) -> None:
        """Initialize the ExecutionsFactory with database session and required entities.

        Args:
            session: AsyncSession for database operations
            workflow: Workflow instance to associate with created executions
            user: User instance to set as creator of executions

        """
        self.session = session
        self.workflow = workflow
        self.user = user

    async def create_executions(
        self,
        count: int,
        status: ExecutionStatus = ExecutionStatus.PENDING,
        labels: dict[str, str] | None = None,
    ) -> list[Execution]:
        """Create multiple test executions.

        Args:
            count: Number of executions to create
            status: Status for all executions (default: PENDING)
            labels: Labels to apply to all executions (optional)

        Returns:
            List of created Execution objects

        """
        # Get the workflow version ID by querying WorkflowVersion
        result = await self.session.exec(
            select(WorkflowVersion.id).where(
                WorkflowVersion.workflow_id == self.workflow.id,
                WorkflowVersion.version == self.workflow.current_version,
            )
        )
        version_id = result.one()

        executions = [
            Execution(
                workflow_id=self.workflow.id,
                workflow_version_id=version_id,
                temporal_workflow_id=f"exec-{uuid4()}",
                status=status,
                created_by=self.user.id,
                input_data={},
                labels=labels or {},
            )
            for _ in range(count)
        ]
        self.session.add_all(executions)
        await self.session.commit()
        return executions


class ActivitiesFactory:
    """Factory class for creating test activity executions.

    Unlike ``ExecutionsFactory``, the parent ``Execution`` is passed to
    ``create_activities`` so that a single injected factory can create
    activities for different executions.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialise with a database session."""
        self.session = session

    async def create_activities(
        self,
        execution: Execution,
        names: list[str],
        *,
        status: ActivityStatus = ActivityStatus.COMPLETED,
        duration_seconds: float = 1.5,
    ) -> list[ActivityExecution]:
        """Create activity executions with timing data.

        Args:
            execution: Parent execution to attach activities to.
            names: Activity names to create.
            status: Status for all activities (default: COMPLETED).
            duration_seconds: Duration of each activity.

        Returns:
            List of created ActivityExecution objects.

        """
        now = datetime.now(UTC)
        is_terminal = status in {
            ActivityStatus.COMPLETED,
            ActivityStatus.FAILED,
            ActivityStatus.SKIPPED,
            ActivityStatus.CANCELLED,
        }
        activities = [
            ActivityExecution(
                execution_id=execution.id,
                activity_name=name,
                temporal_activity_id=f"temporal-{uuid4()}",
                status=status,
                activity_definition={"id": name, "type": "task"},
                started_at=now - timedelta(seconds=duration_seconds),
                completed_at=now if is_terminal else None,
                input_data={},
                output_data={},
            )
            for name in names
        ]
        self.session.add_all(activities)
        await self.session.commit()
        return activities


@asynccontextmanager
async def wait_for_execution_status(
    client: AsyncClient,
    execution_id: str,
    target_status: str,
    max_wait_time: float = 30.0,
    wait_interval: float = 0.5,
) -> AsyncGenerator[dict[str, Any] | None, None]:
    """Context manager that waits for an execution to reach target status.

    This ensures consistent testing patterns with invocation helpers and
    provides clean resource management.

    Args:
        client: The HTTP client to use for polling
        execution_id: Execution ID to poll
        target_status: Target status to wait for (e.g., "COMPLETED", "FAILED")
        max_wait_time: Maximum time to wait in seconds (default: 30.0)
        wait_interval: Time between polls in seconds (default: 0.5)

    Yields:
        The final execution data after reaching target status or timeout

    Example:
        async with wait_for_execution_status(
            client, exec_id, "COMPLETED", max_wait_time=10.0
        ) as execution:
            assert execution["status"] == "COMPLETED"

    """
    elapsed_time = 0.0
    final_data: dict[str, Any] | None = None

    while elapsed_time < max_wait_time:
        response = await client.get(f"/api/v1/executions/{execution_id}")
        if response.status_code == 200:
            data = response.json()
            if data["status"] == target_status:
                final_data = data
                break

        await asyncio.sleep(wait_interval)
        elapsed_time += wait_interval

    # If we didn't reach target status, get final state for timeout case
    if final_data is None:
        response = await client.get(f"/api/v1/executions/{execution_id}")
        if response.status_code == 200:
            final_data = response.json()

    yield final_data
