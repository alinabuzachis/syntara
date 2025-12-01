"""Shared pytest fixtures for model unit tests."""

from uuid import uuid4

import pytest_asyncio
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.workflows.models import Workflow, WorkflowVersion
from nexus.workflows.models.execution import Execution


@pytest_asyncio.fixture
async def test_workflow_minimal(
    test_db_session: AsyncSession,
    test_user: User,
) -> Workflow:
    """Create a minimal test workflow.

    Args:
        test_db_session: Test database session
        test_user: Test user

    Returns:
        Workflow: Minimal test workflow instance

    """
    workflow = Workflow(
        id=uuid4(),
        name="test-workflow",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)
    return workflow


@pytest_asyncio.fixture
async def test_workflow_version_minimal(
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow_minimal: Workflow,
) -> WorkflowVersion:
    """Create a minimal test workflow version.

    Args:
        test_db_session: Test database session
        test_user: Test user
        test_workflow_minimal: Test workflow

    Returns:
        WorkflowVersion: Minimal test workflow version instance

    """
    workflow_version = WorkflowVersion(
        id=uuid4(),
        workflow_id=test_workflow_minimal.id,
        version=1,
        schema_version="1.0.0",
        workflow_definition={"test": "definition"},
        created_by=test_user.id,
    )
    test_db_session.add(workflow_version)
    await test_db_session.commit()
    await test_db_session.refresh(workflow_version)
    return workflow_version


@pytest_asyncio.fixture
async def test_execution_minimal(
    test_db_session: AsyncSession,
    test_user: User,
    test_workflow_minimal: Workflow,
    test_workflow_version_minimal: WorkflowVersion,
) -> Execution:
    """Create a minimal test execution.

    Args:
        test_db_session: Test database session
        test_user: Test user
        test_workflow_minimal: Test workflow
        test_workflow_version_minimal: Test workflow version

    Returns:
        Execution: Minimal test execution instance

    """
    execution = Execution(
        id=uuid4(),
        workflow_id=test_workflow_minimal.id,
        workflow_version_id=test_workflow_version_minimal.id,
        temporal_workflow_id="test-workflow-123",
        created_by=test_user.id,
    )
    test_db_session.add(execution)
    await test_db_session.commit()
    await test_db_session.refresh(execution)
    return execution
