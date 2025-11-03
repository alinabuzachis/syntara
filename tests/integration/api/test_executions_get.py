"""Integration tests for GET /api/v1/executions endpoint."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from nexus.core.models import User
from nexus.workflows.models import Execution, Workflow, WorkflowVersion
from nexus.workflows.models.execution import ExecutionStatus

# ============================================================================
# Helper Functions
# ============================================================================


async def create_executions(
    session: AsyncSession,
    workflow: Workflow,
    user: User,
    count: int,
    status: ExecutionStatus = ExecutionStatus.PENDING,
    labels: dict[str, str] | None = None,
) -> list[Execution]:
    """Create multiple test executions.

    Args:
        session: Database session
        workflow: Workflow to create executions for
        user: User who created executions
        count: Number of executions to create
        status: Status for all executions (default: PENDING)
        labels: Labels to apply to all executions (optional)

    Returns:
        List of created Execution objects

    """
    # Get the workflow version ID by querying WorkflowVersion
    result = await session.execute(
        select(WorkflowVersion.id).where(
            WorkflowVersion.workflow_id == workflow.id,
            WorkflowVersion.version == workflow.current_version,
        )
    )
    version_id = result.scalar_one()

    executions = [
        Execution(
            workflow_id=workflow.id,
            workflow_version_id=version_id,
            temporal_workflow_id=f"exec-{uuid.uuid4()}",
            status=status,
            created_by=user.id,
            input_data={},
            labels=labels or {},
        )
        for _ in range(count)
    ]
    session.add_all(executions)
    await session.commit()
    return executions


# ============================================================================
# Tests
# ============================================================================


@pytest.mark.asyncio
async def test_list_executions_success(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test successful listing of all executions."""
    # Create multiple executions
    await create_executions(test_db_session, test_workflow, test_user, count=3)

    response = await auth_client.get("/api/v1/executions")

    assert response.status_code == 200
    data = response.json()
    assert "resources" in data
    assert isinstance(data["resources"], list)
    assert len(data["resources"]) == 3
    # total is always present but null when include_total=false
    assert "total" in data
    assert data["total"] is None


@pytest.mark.asyncio
async def test_list_executions_with_include_total(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test listing executions with total count."""
    await create_executions(test_db_session, test_workflow, test_user, count=5)

    response = await auth_client.get("/api/v1/executions?include_total=true")

    assert response.status_code == 200
    data = response.json()
    assert "resources" in data
    assert "total" in data
    assert data["total"] == 5


@pytest.mark.asyncio
async def test_list_executions_filter_by_workflow_id(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test filtering executions by workflow_id."""
    await create_executions(test_db_session, test_workflow, test_user, count=2)

    response = await auth_client.get(f"/api/v1/executions?workflow_id={test_workflow.id}")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    for item in data["resources"]:
        assert item["workflow_id"] == str(test_workflow.id)


@pytest.mark.asyncio
async def test_list_executions_filter_by_status(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test filtering executions by status."""
    # Create executions with different statuses
    await create_executions(test_db_session, test_workflow, test_user, count=2, status=ExecutionStatus.PENDING)
    await create_executions(test_db_session, test_workflow, test_user, count=2, status=ExecutionStatus.RUNNING)

    response = await auth_client.get("/api/v1/executions?status=pending")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    for item in data["resources"]:
        assert item["status"] == "pending"


@pytest.mark.asyncio
async def test_list_executions_filter_by_created_by(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test filtering executions by created_by (user who created execution)."""
    await create_executions(test_db_session, test_workflow, test_user, count=2)

    response = await auth_client.get(f"/api/v1/executions?created_by={test_user.id}")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    for item in data["resources"]:
        assert item["created_by"] == str(test_user.id)


@pytest.mark.asyncio
async def test_list_executions_with_label_filtering(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test filtering executions by labels using JSONB containment."""
    # Create executions with different labels
    await create_executions(
        test_db_session,
        test_workflow,
        test_user,
        count=2,
        labels={"environment": "production", "team": "backend"},
    )
    await create_executions(
        test_db_session,
        test_workflow,
        test_user,
        count=2,
        labels={"environment": "staging"},
    )

    # Filter by single label
    response = await auth_client.get("/api/v1/executions?labels[environment]=production")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    for item in data["resources"]:
        assert item["labels"].get("environment") == "production"


@pytest.mark.asyncio
async def test_list_executions_pagination_with_limit(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test pagination with limit parameter."""
    await create_executions(test_db_session, test_workflow, test_user, count=10)

    response = await auth_client.get("/api/v1/executions?limit=3")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 3


@pytest.mark.asyncio
async def test_list_executions_pagination_with_cursor(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test cursor-based pagination."""
    await create_executions(test_db_session, test_workflow, test_user, count=10)

    # Get first page
    response = await auth_client.get("/api/v1/executions?limit=3")
    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 3

    # If there's a next cursor, fetch next page
    if data.get("next"):
        next_response = await auth_client.get(f"/api/v1/executions?cursor={data['next']}&limit=3")
        assert next_response.status_code == 200
        next_data = next_response.json()
        assert "resources" in next_data
        # Ensure different results (not same as first page)
        assert data["resources"][0]["id"] != next_data["resources"][0]["id"]


@pytest.mark.asyncio
async def test_list_executions_sorting(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test sorting executions by created_at."""
    await create_executions(test_db_session, test_workflow, test_user, count=5)

    # Sort descending (newest first)
    response = await auth_client.get("/api/v1/executions?sort=-created_at&limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 5

    # Verify descending order
    for i in range(len(data["resources"]) - 1):
        assert data["resources"][i]["created_at"] >= data["resources"][i + 1]["created_at"]


@pytest.mark.asyncio
async def test_list_executions_empty(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test listing executions when none exist for a workflow."""
    # Use a non-existent workflow_id to ensure empty result
    non_existent_id = uuid.uuid4()
    response = await auth_client.get(f"/api/v1/executions?workflow_id={non_existent_id}&include_total=true")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["resources"] == []


@pytest.mark.asyncio
async def test_list_executions_multiple_filters(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test combining multiple filters (AND logic)."""
    await create_executions(
        test_db_session,
        test_workflow,
        test_user,
        count=2,
        status=ExecutionStatus.PENDING,
        labels={"environment": "production"},
    )
    await create_executions(
        test_db_session,
        test_workflow,
        test_user,
        count=2,
        status=ExecutionStatus.RUNNING,
        labels={"environment": "production"},
    )

    # Filter by workflow_id, status, and labels
    response = await auth_client.get(
        f"/api/v1/executions?workflow_id={test_workflow.id}&status=pending&labels[environment]=production"
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    for item in data["resources"]:
        assert item["workflow_id"] == str(test_workflow.id)
        assert item["status"] == "pending"
        assert item["labels"].get("environment") == "production"
