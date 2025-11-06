"""Integration tests for GET /api/v1/executions/{id} endpoint."""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.workflows.models.execution import Execution, ExecutionStatus


@pytest.mark.skip(reason="AAP-57818: Fixture 'client' not available - needs to be fixed")
@pytest.mark.asyncio
async def test_get_execution_by_id_success(
    client: AsyncClient,
    test_execution: Execution,
) -> None:
    """Test successfully retrieving an execution by ID."""
    response = await client.get(f"/api/v1/executions/{test_execution.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(test_execution.id)
    assert data["workflow_id"] == str(test_execution.workflow_id)
    assert data["status"] == ExecutionStatus.PENDING.value
    assert "created_at" in data
    assert "updated_at" in data


@pytest.mark.skip(reason="AAP-57818: Fixture 'client' not available - needs to be fixed")
@pytest.mark.asyncio
async def test_get_execution_by_id_not_found(
    client: AsyncClient,
) -> None:
    """Test retrieving a non-existent execution returns 404."""
    non_existent_id = uuid.uuid4()
    response = await client.get(f"/api/v1/executions/{non_existent_id}")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.skip(reason="AAP-57818: Fixture 'client' not available - needs to be fixed")
@pytest.mark.asyncio
async def test_get_execution_with_error_details(
    client: AsyncClient,
    session: AsyncSession,
    test_execution: Execution,
) -> None:
    """Test retrieving a failed execution includes error details."""
    # Update execution to failed status with error details
    test_execution.status = ExecutionStatus.FAILED
    test_execution.error_details = "Connection timeout to external service"
    await session.commit()
    await session.refresh(test_execution)

    # Fetch the execution
    response = await client.get(f"/api/v1/executions/{test_execution.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == ExecutionStatus.FAILED.value
    assert data["error_details"] == "Connection timeout to external service"


@pytest.mark.skip(reason="AAP-57818: Fixture 'client' not available - needs to be fixed")
@pytest.mark.asyncio
async def test_get_execution_with_completed_at(
    client: AsyncClient,
    session: AsyncSession,
    test_execution: Execution,
) -> None:
    """Test retrieving a completed execution includes completed_at timestamp."""
    # Update execution to completed status with timestamp
    test_execution.status = ExecutionStatus.COMPLETED
    test_execution.completed_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(test_execution)

    # Fetch the execution
    response = await client.get(f"/api/v1/executions/{test_execution.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == ExecutionStatus.COMPLETED.value
    assert "completed_at" in data
    assert data["completed_at"] is not None
