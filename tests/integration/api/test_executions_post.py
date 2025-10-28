"""Integration tests for POST /api/v1/executions endpoint."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.models import User
from nexus.workflows.models import Workflow


@pytest.mark.asyncio
async def test_create_execution_success(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test successful execution creation."""
    response = await auth_client.post(
        "/api/v1/executions",
        json={
            "workflow_id": str(test_workflow.id),
            "input_data": {"key": "value"},
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["workflow_id"] == str(test_workflow.id)
    assert data["status"] == "pending"
    assert data["created_by"] == str(test_user.id)  # Updated from started_by
    assert data["input_data"] == {"key": "value"}
    assert "temporal_workflow_id" in data
    assert data["labels"] == {}
    assert data["current_activities"] == []


@pytest.mark.asyncio
async def test_create_execution_with_default_input_data(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test execution creation with default empty input_data."""
    response = await auth_client.post(
        "/api/v1/executions",
        json={
            "workflow_id": str(test_workflow.id),
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["input_data"] == {}


@pytest.mark.asyncio
async def test_create_execution_workflow_not_found(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test execution creation with non-existent workflow."""
    non_existent_id = uuid.uuid4()
    response = await auth_client.post(
        "/api/v1/executions",
        json={
            "workflow_id": str(non_existent_id),
            "input_data": {},
        },
    )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_execution_workflow_disabled(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow: Workflow,
) -> None:
    """Test execution creation with disabled workflow."""
    # Disable the workflow
    test_workflow.is_enabled = False
    await test_db_session.commit()

    response = await auth_client.post(
        "/api/v1/executions",
        json={
            "workflow_id": str(test_workflow.id),
            "input_data": {},
        },
    )

    assert response.status_code == 400
    assert "disabled" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_execution_invalid_workflow_id(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test execution creation with invalid UUID format."""
    response = await auth_client.post(
        "/api/v1/executions",
        json={
            "workflow_id": "not-a-uuid",
            "input_data": {},
        },
    )

    assert response.status_code == 422  # Validation error
