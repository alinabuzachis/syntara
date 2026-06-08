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
from nexus.workflows.models import Workflow, WorkflowVersion, WorkflowVersionStatus
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
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
        node["config"] = {"language": "python", "code": "print('hello')"}

    return {
        "schema_version": "2.0.0",
        "name": name,
        "description": description,
        "triggers": [{"id": trigger_id, "type": "manual_trigger"}],
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
        "triggers": [{"id": trigger_id, "type": "manual_trigger"}],
        "nodes": activities,
        "edges": edges,
    }


_WF_DEF_TEMPLATE: dict[str, object] = {
    "schemaVersion": "1.0.0",
    "version": 1,
    "metadata": {"name": "placeholder"},
    "triggers": [{"type": "manual"}],
    "workflow": {"activities": []},
}


def _wf_def(name: str) -> dict[str, object]:
    """Build a minimal workflow definition dict."""
    return {**_WF_DEF_TEMPLATE, "metadata": {"name": name}}


class WorkflowFactory:
    """Factory for creating workflows with versions."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and user."""
        self.session = session
        self.user = user

    async def create(
        self,
        name: str | None = None,
        *,
        is_enabled: bool = True,
    ) -> tuple[Workflow, WorkflowVersion]:
        """Create a workflow with a version. Returns (workflow, version)."""
        name = name or f"wf-{uuid4().hex[:8]}"
        wf = Workflow(
            name=name,
            created_by=self.user.id,
            is_enabled=is_enabled,
            published_version=1 if is_enabled else None,
            current_version=1,
        )
        self.session.add(wf)
        version = WorkflowVersion(
            workflow_id=wf.id,
            version=1,
            schema_version="1.0.0",
            workflow_definition=_wf_def(name),
            created_by=self.user.id,
            status=WorkflowVersionStatus.PUBLISHED if is_enabled else WorkflowVersionStatus.DRAFT,
        )
        self.session.add(version)
        await self.session.flush()
        return wf, version

    async def create_many(
        self,
        count: int,
        *,
        is_enabled: bool = True,
        prefix: str = "wf",
    ) -> list[tuple[Workflow, WorkflowVersion]]:
        """Create multiple workflows. Returns list of (workflow, version) tuples."""
        results = []
        for i in range(count):
            results.append(await self.create(f"{prefix}-{i}-{uuid4().hex[:6]}", is_enabled=is_enabled))
        return results


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
