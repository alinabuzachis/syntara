"""Shared helpers for workflow tests."""

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
    activity_type: str = "script",
) -> dict[str, Any]:
    """Create a minimal valid V2 workflow definition for testing.

    Returns a dict matching the V2 workflow definition schema with
    schema_version, triggers, nodes, and edges.

    Args:
        name: Workflow name
        description: Workflow description
        activity_id: Activity ID for the node
        activity_type: V2 node type (script, http_request, agentic, aap_job_template,
                       condition, loop, converge, approval)

    Returns:
        Dict with V2 workflow definition structure ready for validation

    """
    trigger_id = "trigger_manual"
    node: dict[str, Any] = {
        "id": activity_id,
        "name": f"Activity {activity_id}",
        "type": activity_type,
    }

    if activity_type == "script":
        node["parameters"] = {"language": "python", "code": "print('hello')"}
    elif "parameters" not in node:
        node["parameters"] = {}

    return {
        "schema_version": "2.0.0",
        "name": name,
        "description": description,
        "triggers": [{"id": trigger_id, "type": "manual_trigger", "parameters": {}}],
        "nodes": [node],
        "edges": [{"from": trigger_id, "to": activity_id}],
    }


def create_workflow_definition_with_activities(
    name: str,
    description: str,
    activities: list[dict[str, object]],
) -> dict[str, Any]:
    """Create a V2 workflow definition with custom activities as nodes.

    Args:
        name: Workflow name
        description: Workflow description
        activities: List of activity/node definitions

    Returns:
        Dict with V2 workflow definition structure

    """
    trigger_id = "trigger_manual"
    edges: list[dict[str, str]] = [{"from": trigger_id, "to": str(activities[0]["id"])}] if activities else []
    # Chain activities sequentially
    for i in range(len(activities) - 1):
        edges.append({"from": str(activities[i]["id"]), "to": str(activities[i + 1]["id"])})

    return {
        "schema_version": "2.0.0",
        "name": name,
        "description": description,
        "triggers": [{"id": trigger_id, "type": "manual_trigger", "parameters": {}}],
        "nodes": activities,
        "edges": edges,
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
                project_id=self.workflow.project_id,
            )
            for _ in range(count)
        ]
        self.session.add_all(executions)
        await self.session.commit()
        return executions
