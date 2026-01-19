"""Test fixtures and helpers for workflow tests."""

from typing import Any
from uuid import uuid4

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.workflows.models import Workflow, WorkflowVersion
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
