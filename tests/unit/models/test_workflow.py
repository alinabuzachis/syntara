"""Unit tests for Workflow model.

Tests cover:
- Workflow creation with required fields
- Soft delete behavior
- Labels JSONB operations
- is_enabled toggle
- version increment functionality
- Relationships with User and WorkflowVersion
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.workflows.models import Workflow, WorkflowVersion
from tests.helpers.workflow_fixtures import create_minimal_workflow_definition


@pytest.mark.asyncio
async def test_create_workflow_with_required_fields(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test creating a workflow with required fields only."""
    # Create workflow
    workflow = Workflow(
        id=uuid4(),
        name="test-workflow",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.id is not None
    assert workflow.name == "test-workflow"
    assert workflow.description is None
    assert workflow.labels == {}
    assert workflow.current_version == 1
    assert workflow.is_enabled is True
    assert workflow.created_by == test_user.id
    assert workflow.deleted_at is None
    assert workflow.deleted_by is None
    assert workflow.created_at is not None
    assert workflow.updated_at is not None


@pytest.mark.asyncio
async def test_create_workflow_with_all_fields(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test creating a workflow with all fields."""
    labels = {"environment": "production", "team": "platform"}
    workflow = Workflow(
        id=uuid4(),
        name="full-workflow",
        description="A complete workflow definition",
        labels=labels,
        current_version=2,
        is_enabled=False,
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.description == "A complete workflow definition"
    assert workflow.labels == labels
    assert workflow.current_version == 2
    assert workflow.is_enabled is False


@pytest.mark.asyncio
async def test_workflow_soft_delete(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test soft delete sets deleted_at and deleted_by correctly."""
    # Create workflow
    workflow = Workflow(
        id=uuid4(),
        name="delete-me",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    # Perform soft delete
    now = datetime.now(UTC)
    workflow.deleted_at = now
    workflow.deleted_by = test_user.id
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.deleted_at == now
    assert workflow.deleted_by == test_user.id


@pytest.mark.asyncio
async def test_workflow_labels_jsonb_operations(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test JSONB labels can be queried and updated."""
    # Create workflow with labels
    labels = {"env": "dev", "region": "us-east-1"}
    workflow = Workflow(
        id=uuid4(),
        name="labeled-workflow",
        labels=labels,
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.labels == labels

    # Update labels (all values must be strings per spec 006)
    workflow.labels = {"env": "prod", "region": "us-west-2", "critical": "true"}
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.labels["env"] == "prod"
    assert workflow.labels["critical"] == "true"


@pytest.mark.asyncio
async def test_workflow_is_enabled_toggle(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test toggling is_enabled field."""
    workflow = Workflow(
        id=uuid4(),
        name="toggle-workflow",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.is_enabled is True

    # Disable workflow
    workflow.is_enabled = False
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.is_enabled is False

    # Re-enable workflow
    workflow.is_enabled = True
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.is_enabled is True


@pytest.mark.asyncio
async def test_workflow_increment_version(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test increment_version method."""
    workflow = Workflow(
        id=uuid4(),
        name="version-workflow",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.current_version == 1

    # Increment version
    new_version = workflow.increment_version()
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert new_version == 2
    assert workflow.current_version == 2

    # Increment again
    new_version = workflow.increment_version()
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert new_version == 3
    assert workflow.current_version == 3


@pytest.mark.asyncio
async def test_workflow_relationship_with_user(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test that Workflow tracks created_by user ID."""
    workflow = Workflow(
        id=uuid4(),
        name="relationship-workflow",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    # Verify created_by field references the user
    assert workflow.created_by == test_user.id


@pytest.mark.asyncio
async def test_workflow_relationship_with_versions(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test relationship between Workflow and WorkflowVersion."""
    workflow = Workflow(
        id=uuid4(),
        name="versioned-workflow",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    # Create versions
    version1 = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        workflow_definition=create_minimal_workflow_definition(name="v1"),
        created_by=test_user.id,
    )
    version2 = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=2,
        schema_version="1.0.0",
        workflow_definition=create_minimal_workflow_definition(name="v2"),
        created_by=test_user.id,
    )
    test_db_session.add_all([version1, version2])
    await test_db_session.commit()

    # Access versions from workflow
    await test_db_session.refresh(workflow, ["versions"])
    assert len(workflow.versions) == 2


@pytest.mark.asyncio
async def test_workflow_repr(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test string representation of Workflow."""
    workflow_id = uuid4()
    workflow = Workflow(
        id=workflow_id,
        name="repr-workflow",
        created_by=test_user.id,
        current_version=3,
    )

    repr_str = repr(workflow)
    assert "Workflow" in repr_str
    assert str(workflow_id) in repr_str
    assert "repr-workflow" in repr_str
    assert "3" in repr_str


@pytest.mark.asyncio
async def test_workflow_labels_default(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test that labels defaults to empty dict."""
    workflow = Workflow(
        id=uuid4(),
        name="default-labels",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.labels == {}
    assert isinstance(workflow.labels, dict)


@pytest.mark.asyncio
async def test_workflow_is_enabled_default(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test that is_enabled defaults to True."""
    workflow = Workflow(
        id=uuid4(),
        name="default-enabled",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.is_enabled is True


@pytest.mark.asyncio
async def test_workflow_current_version_default(
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """Test that current_version defaults to 1."""
    workflow = Workflow(
        id=uuid4(),
        name="default-version",
        created_by=test_user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.current_version == 1
