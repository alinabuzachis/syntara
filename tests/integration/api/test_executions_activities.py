"""Integration tests for GET /api/v1/executions/{id}/activities endpoint."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.models.execution import Execution


@pytest.mark.asyncio
async def test_list_execution_activities_empty_when_temporal_unavailable(
    base_client: AsyncClient,
    test_execution: Execution,
) -> None:
    """Test listing activities returns empty list when Temporal is unavailable."""
    response = await base_client.get(f"/api/v1/executions/{test_execution.id}/activities")

    assert response.status_code == 200
    data = response.json()
    # When Temporal is not available and no activities in DB, should return empty list
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_list_execution_activities_returns_persisted_data(
    base_client: AsyncClient,
    test_execution: Execution,
    test_db_session: AsyncSession,
) -> None:
    """Test listing activities returns persisted activities from database.

    Verifies activities are ordered by created_at (T047 requirement).
    """
    # Create activities with explicit created_at timestamps to verify ordering
    base_time = datetime.now(UTC)

    activities = [
        ActivityExecution(
            execution_id=test_execution.id,
            activity_name=f"activity_{i}",
            temporal_activity_id=f"temporal-{i}",
            status=ActivityStatus.COMPLETED,
            started_at=base_time + timedelta(seconds=i),
            completed_at=base_time + timedelta(seconds=i + 1),
        )
        for i in range(3)
    ]

    for activity in activities:
        test_db_session.add(activity)
    await test_db_session.commit()
    await test_db_session.refresh(activities[0])
    await test_db_session.refresh(activities[1])
    await test_db_session.refresh(activities[2])

    # List activities via API
    response = await base_client.get(f"/api/v1/executions/{test_execution.id}/activities")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 3

    # Verify activity structure
    for activity_data in data:
        assert "id" in activity_data
        assert "execution_id" in activity_data
        assert "activity_name" in activity_data
        assert "temporal_activity_id" in activity_data
        assert "status" in activity_data
        assert activity_data["execution_id"] == str(test_execution.id)

    # Verify ordering by created_at (T047 requirement)
    created_at_times = [datetime.fromisoformat(a["created_at"]) for a in data]
    assert created_at_times == sorted(created_at_times), "Activities should be ordered by created_at ascending"


@pytest.mark.asyncio
async def test_list_execution_activities_includes_all_fields(
    base_client: AsyncClient,
    test_execution: Execution,
    test_db_session: AsyncSession,
) -> None:
    """Test that listed activities include all required fields."""
    # Create activity with all fields populated
    now = datetime.now(UTC)
    activity_def = {
        "id": "test_activity",
        "type": "task",
        "task": {"executor": "script", "config": {"code": "print('test')"}},
    }

    activity = ActivityExecution(
        execution_id=test_execution.id,
        activity_name="complete_activity",
        temporal_activity_id="temporal-123",
        status=ActivityStatus.COMPLETED,
        activity_definition=activity_def,
        labels={"environment": "test"},
        started_at=now,
        completed_at=now,
        input_data={"param": "value"},
        output_data={"result": "success"},
        error_details=None,
        retry_count=0,
        iteration=None,
    )

    test_db_session.add(activity)
    await test_db_session.commit()

    # List activities via API
    response = await base_client.get(f"/api/v1/executions/{test_execution.id}/activities")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1

    activity_data = data[0]
    # Verify all fields are present
    assert activity_data["activity_name"] == "complete_activity"
    assert activity_data["temporal_activity_id"] == "temporal-123"
    assert activity_data["status"] == "completed"
    assert activity_data["activity_definition"] == activity_def
    assert activity_data["labels"] == {"environment": "test"}
    assert activity_data["input_data"] == {"param": "value"}
    assert activity_data["output_data"] == {"result": "success"}
    assert activity_data["error_details"] is None
    assert activity_data["retry_count"] == 0
    assert activity_data["iteration"] is None
    assert "started_at" in activity_data
    assert "completed_at" in activity_data
    assert "created_at" in activity_data
    assert "updated_at" in activity_data


@pytest.mark.asyncio
async def test_list_execution_activities_not_found(
    base_client: AsyncClient,
) -> None:
    """Test listing activities for non-existent execution returns 404."""
    non_existent_id = uuid.uuid4()
    response = await base_client.get(f"/api/v1/executions/{non_existent_id}/activities")

    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_list_execution_activities_with_different_statuses(
    base_client: AsyncClient,
    test_execution: Execution,
    test_db_session: AsyncSession,
) -> None:
    """Test listing activities with various status values."""
    # Create activities with different statuses
    statuses = [
        ActivityStatus.PENDING,
        ActivityStatus.RUNNING,
        ActivityStatus.COMPLETED,
        ActivityStatus.FAILED,
        ActivityStatus.RETRYING,
    ]

    for i, status in enumerate(statuses):
        activity = ActivityExecution(
            execution_id=test_execution.id,
            activity_name=f"activity_{status.value}",
            temporal_activity_id=f"temporal-{i}",
            status=status,
        )
        test_db_session.add(activity)

    await test_db_session.commit()

    # List activities via API
    response = await base_client.get(f"/api/v1/executions/{test_execution.id}/activities")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5

    # Verify all statuses are represented
    returned_statuses = {activity["status"] for activity in data}
    expected_statuses = {s.value for s in statuses}
    assert returned_statuses == expected_statuses


@pytest.mark.asyncio
async def test_list_execution_activities_with_nested_activity_definition(
    base_client: AsyncClient,
    test_execution: Execution,
    test_db_session: AsyncSession,
) -> None:
    """Test that complex nested activity definitions are properly returned."""
    # Create activity with complex nested definition
    complex_def = {
        "id": "fetch_data",
        "name": "Fetch Data from API",
        "type": "task",
        "task": {
            "executor": "api",
            "config": {
                "method": "GET",
                "url": "https://api.example.com/data",
                "headers": {
                    "Authorization": "Bearer token",
                    "Content-Type": "application/json",
                },
                "timeout": 30,
            },
        },
        "timeout": "PT5M",
        "retryPolicy": {
            "maxAttempts": 3,
            "backoff": "exponential",
            "initialInterval": "PT2S",
            "retryableErrors": ["NETWORK_ERROR", "TIMEOUT"],
        },
    }

    activity = ActivityExecution(
        execution_id=test_execution.id,
        activity_name="fetch_data",
        temporal_activity_id="temporal-api-1",
        status=ActivityStatus.COMPLETED,
        activity_definition=complex_def,
    )

    test_db_session.add(activity)
    await test_db_session.commit()

    # List activities via API
    response = await base_client.get(f"/api/v1/executions/{test_execution.id}/activities")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1

    # Verify nested structure is preserved
    returned_def = data[0]["activity_definition"]
    assert returned_def == complex_def
    assert returned_def["task"]["config"]["method"] == "GET"
    assert returned_def["retryPolicy"]["maxAttempts"] == 3
    assert len(returned_def["retryPolicy"]["retryableErrors"]) == 2


@pytest.mark.asyncio
async def test_list_execution_activities_multiple_executions_isolated(
    base_client: AsyncClient,
    test_execution: Execution,
    test_db_session: AsyncSession,
) -> None:
    """Test that activities are properly isolated between executions."""
    # Create second execution (using same workflow and version as test_execution)
    execution2 = Execution(
        workflow_id=test_execution.workflow_id,
        workflow_version_id=test_execution.workflow_version_id,
        temporal_workflow_id="workflow-2",
        created_by=test_execution.created_by,
    )
    test_db_session.add(execution2)
    await test_db_session.commit()
    await test_db_session.refresh(execution2)

    # Create activities for first execution
    for i in range(2):
        activity = ActivityExecution(
            execution_id=test_execution.id,
            activity_name=f"exec1_activity_{i}",
            temporal_activity_id=f"temporal-exec1-{i}",
            status=ActivityStatus.COMPLETED,
        )
        test_db_session.add(activity)

    # Create activities for second execution
    for i in range(3):
        activity = ActivityExecution(
            execution_id=execution2.id,
            activity_name=f"exec2_activity_{i}",
            temporal_activity_id=f"temporal-exec2-{i}",
            status=ActivityStatus.RUNNING,
        )
        test_db_session.add(activity)

    await test_db_session.commit()

    # List activities for first execution
    response1 = await base_client.get(f"/api/v1/executions/{test_execution.id}/activities")
    assert response1.status_code == 200
    data1 = response1.json()
    assert len(data1) == 2
    assert all(a["activity_name"].startswith("exec1_") for a in data1)

    # List activities for second execution
    response2 = await base_client.get(f"/api/v1/executions/{execution2.id}/activities")
    assert response2.status_code == 200
    data2 = response2.json()
    assert len(data2) == 3
    assert all(a["activity_name"].startswith("exec2_") for a in data2)
