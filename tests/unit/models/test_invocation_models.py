"""Unit tests for Invocation ORM model.

Tests cover:
- Invocation creation with required fields
- Status transitions
- JSONB field operations (context_data, result, checkpoint_data)
- Timestamp field behavior (created_at, started_at, completed_at, updated_at)
- Field validation and constraints
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.api.models.invocation import Invocation


@pytest.mark.asyncio
async def test_create_invocation_with_required_fields(test_db_session: AsyncSession) -> None:
    """Test creating an invocation with required fields only."""
    invocation = Invocation(
        prompt="Deploy customer service app to production",
        user_id="user-123",
        session_id="session-001",
        status="running",
    )

    test_db_session.add(invocation)
    await test_db_session.commit()
    await test_db_session.refresh(invocation)

    # Verify required fields
    assert invocation.id is not None
    assert invocation.prompt == "Deploy customer service app to production"
    assert invocation.user_id == "user-123"
    assert invocation.session_id == "session-001"
    assert invocation.status == "running"

    # Verify auto-generated fields
    assert invocation.created_at is not None
    assert invocation.updated_at is not None

    # Verify optional fields are None/empty
    assert invocation.started_at is None
    assert invocation.completed_at is None
    assert invocation.context_data == {}
    assert invocation.result is None
    assert invocation.error_message is None
    assert invocation.checkpoint_data is None


@pytest.mark.asyncio
async def test_create_invocation_with_all_fields(test_db_session: AsyncSession) -> None:
    """Test creating an invocation with all fields populated."""
    now = datetime.now(UTC)

    invocation = Invocation(
        prompt="Analyze production metrics",
        user_id="user-456",
        session_id="session-002",
        status="completed",
        started_at=now,
        completed_at=now,
        context_data={"environment": "production", "app_id": "app-1"},
        result={"workflow_id": "wf-123", "status": "success"},
        error_message=None,
        checkpoint_data={"phase": "complete", "step": 5},
    )

    test_db_session.add(invocation)
    await test_db_session.commit()
    await test_db_session.refresh(invocation)

    # Verify all fields
    assert invocation.prompt == "Analyze production metrics"
    assert invocation.user_id == "user-456"
    assert invocation.session_id == "session-002"
    assert invocation.status == "completed"
    assert invocation.started_at == now
    assert invocation.completed_at == now
    assert invocation.context_data == {"environment": "production", "app_id": "app-1"}
    assert invocation.result == {"workflow_id": "wf-123", "status": "success"}
    assert invocation.checkpoint_data == {"phase": "complete", "step": 5}


@pytest.mark.asyncio
async def test_invocation_status_transitions(test_db_session: AsyncSession) -> None:
    """Test invocation status can be updated."""
    invocation = Invocation(
        prompt="Test workflow",
        user_id="user-789",
        session_id="session-003",
        status="running",
    )

    test_db_session.add(invocation)
    await test_db_session.commit()
    await test_db_session.refresh(invocation)

    # Update status to paused
    invocation.status = "paused"
    await test_db_session.commit()
    await test_db_session.refresh(invocation)
    assert invocation.status == "paused"

    # Update status to cancelled
    invocation.status = "cancelled"
    await test_db_session.commit()
    await test_db_session.refresh(invocation)
    assert invocation.status == "cancelled"


@pytest.mark.asyncio
async def test_invocation_timestamps(test_db_session: AsyncSession) -> None:
    """Test timestamp fields behavior."""
    invocation = Invocation(
        prompt="Test timestamps",
        user_id="user-100",
        session_id="session-100",
        status="running",
    )

    test_db_session.add(invocation)
    await test_db_session.commit()
    await test_db_session.refresh(invocation)

    created_at = invocation.created_at
    updated_at = invocation.updated_at

    # Verify timestamps are set
    assert created_at is not None
    assert updated_at is not None

    # Update the invocation
    invocation.status = "completed"
    invocation.completed_at = datetime.now(UTC)
    await test_db_session.commit()
    await test_db_session.refresh(invocation)

    # created_at should not change, updated_at should
    assert invocation.created_at == created_at
    assert invocation.updated_at >= updated_at


@pytest.mark.asyncio
async def test_invocation_jsonb_fields(test_db_session: AsyncSession) -> None:
    """Test JSONB fields can store complex data."""
    complex_context = {
        "environment": "production",
        "region": "us-east-1",
        "metadata": {
            "tags": ["deployment", "critical"],
            "version": "1.2.3",
        },
    }

    invocation = Invocation(
        prompt="Complex JSONB test",
        user_id="user-200",
        session_id="session-200",
        status="running",
        context_data=complex_context,
    )

    test_db_session.add(invocation)
    await test_db_session.commit()
    await test_db_session.refresh(invocation)

    # Verify JSONB data is preserved
    assert invocation.context_data == complex_context
    assert invocation.context_data["metadata"]["tags"] == ["deployment", "critical"]


@pytest.mark.asyncio
async def test_query_invocations_by_status(test_db_session: AsyncSession) -> None:
    """Test querying invocations by status."""
    # Create multiple invocations with different statuses
    invocation1 = Invocation(
        prompt="Running task 1",
        user_id="user-300",
        session_id="session-300",
        status="running",
    )
    invocation2 = Invocation(
        prompt="Running task 2",
        user_id="user-300",
        session_id="session-300",
        status="running",
    )
    invocation3 = Invocation(
        prompt="Completed task",
        user_id="user-300",
        session_id="session-300",
        status="completed",
    )

    test_db_session.add_all([invocation1, invocation2, invocation3])
    await test_db_session.commit()

    # Query for running invocations
    result = await test_db_session.execute(select(Invocation).where(Invocation.status == "running"))
    running_invocations = result.scalars().all()

    assert len(running_invocations) == 2
    assert all(inv.status == "running" for inv in running_invocations)


@pytest.mark.asyncio
async def test_query_invocations_by_user(test_db_session: AsyncSession) -> None:
    """Test querying invocations by user_id."""
    # Create invocations for different users
    invocation1 = Invocation(
        prompt="User 1 task",
        user_id="user-400",
        session_id="session-400",
        status="running",
    )
    invocation2 = Invocation(
        prompt="User 2 task",
        user_id="user-500",
        session_id="session-500",
        status="running",
    )

    test_db_session.add_all([invocation1, invocation2])
    await test_db_session.commit()

    # Query for user-400's invocations
    result = await test_db_session.execute(select(Invocation).where(Invocation.user_id == "user-400"))
    user_invocations = result.scalars().all()

    assert len(user_invocations) == 1
    assert user_invocations[0].user_id == "user-400"


@pytest.mark.asyncio
async def test_invocation_repr(test_db_session: AsyncSession) -> None:
    """Test __repr__ method."""
    invocation = Invocation(
        prompt="Test repr",
        user_id="user-600",
        session_id="session-600",
        status="running",
    )

    test_db_session.add(invocation)
    await test_db_session.commit()
    await test_db_session.refresh(invocation)

    repr_str = repr(invocation)
    assert "Invocation" in repr_str
    assert str(invocation.id) in repr_str
    assert "running" in repr_str
