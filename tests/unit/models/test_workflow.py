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
from sqlalchemy.ext.asyncio import AsyncSession

from nexus_api.models.user import User, UserRole
from nexus_api.models.workflow import Workflow
from nexus_api.models.workflow_version import WorkflowVersion


@pytest.mark.asyncio
async def test_create_workflow_with_required_fields(test_db_session: AsyncSession) -> None:
    """Test creating a workflow with required fields only."""
    # Create user first
    user = User(
        id=uuid4(),
        username="creator",
        email="creator@example.com",
        full_name="Creator User",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    # Create workflow
    workflow = Workflow(
        id=uuid4(),
        name="test-workflow",
        created_by=user.id,
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
    assert workflow.created_by == user.id
    assert workflow.deleted_at is None
    assert workflow.deleted_by is None
    assert workflow.created_at is not None
    assert workflow.updated_at is not None


@pytest.mark.asyncio
async def test_create_workflow_with_all_fields(test_db_session: AsyncSession) -> None:
    """Test creating a workflow with all fields."""
    user = User(
        id=uuid4(),
        username="creator2",
        email="creator2@example.com",
        full_name="Creator User 2",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    labels = {"environment": "production", "team": "platform"}
    workflow = Workflow(
        id=uuid4(),
        name="full-workflow",
        description="A complete workflow definition",
        labels=labels,
        current_version=2,
        is_enabled=False,
        created_by=user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.description == "A complete workflow definition"
    assert workflow.labels == labels
    assert workflow.current_version == 2
    assert workflow.is_enabled is False


@pytest.mark.asyncio
async def test_workflow_soft_delete(test_db_session: AsyncSession) -> None:
    """Test soft delete sets deleted_at and deleted_by correctly."""
    # Create users
    creator = User(
        id=uuid4(),
        username="creator3",
        email="creator3@example.com",
        full_name="Creator User 3",
        role=UserRole.CREATOR.value,
    )
    admin = User(
        id=uuid4(),
        username="admin",
        email="admin@example.com",
        full_name="Admin User",
        role=UserRole.ADMINISTRATOR.value,
    )
    test_db_session.add_all([creator, admin])
    await test_db_session.commit()
    await test_db_session.refresh(creator)
    await test_db_session.refresh(admin)

    # Create workflow
    workflow = Workflow(
        id=uuid4(),
        name="delete-me",
        created_by=creator.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    # Perform soft delete
    now = datetime.now(UTC)
    workflow.deleted_at = now
    workflow.deleted_by = admin.id
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.deleted_at == now
    assert workflow.deleted_by == admin.id


@pytest.mark.asyncio
async def test_workflow_labels_jsonb_operations(test_db_session: AsyncSession) -> None:
    """Test JSONB labels can be queried and updated."""
    user = User(
        id=uuid4(),
        username="creator4",
        email="creator4@example.com",
        full_name="Creator User 4",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    # Create workflow with labels
    labels = {"env": "dev", "region": "us-east-1"}
    workflow = Workflow(
        id=uuid4(),
        name="labeled-workflow",
        labels=labels,
        created_by=user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.labels == labels

    # Update labels
    workflow.labels = {"env": "prod", "region": "us-west-2", "critical": True}
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.labels["env"] == "prod"
    assert workflow.labels["critical"] is True


@pytest.mark.asyncio
async def test_workflow_is_enabled_toggle(test_db_session: AsyncSession) -> None:
    """Test toggling is_enabled field."""
    user = User(
        id=uuid4(),
        username="creator5",
        email="creator5@example.com",
        full_name="Creator User 5",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    workflow = Workflow(
        id=uuid4(),
        name="toggle-workflow",
        created_by=user.id,
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
async def test_workflow_increment_version(test_db_session: AsyncSession) -> None:
    """Test increment_version method."""
    user = User(
        id=uuid4(),
        username="creator6",
        email="creator6@example.com",
        full_name="Creator User 6",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    workflow = Workflow(
        id=uuid4(),
        name="version-workflow",
        created_by=user.id,
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
async def test_workflow_relationship_with_user(test_db_session: AsyncSession) -> None:
    """Test relationship between Workflow and User."""
    user = User(
        id=uuid4(),
        username="creator7",
        email="creator7@example.com",
        full_name="Creator User 7",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    workflow = Workflow(
        id=uuid4(),
        name="relationship-workflow",
        created_by=user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    # Access creator relationship
    assert workflow.creator.id == user.id
    assert workflow.creator.username == "creator7"

    # Access workflows from user
    await test_db_session.refresh(user, ["created_workflows"])
    assert len(user.created_workflows) == 1
    assert user.created_workflows[0].id == workflow.id


@pytest.mark.asyncio
async def test_workflow_relationship_with_versions(test_db_session: AsyncSession) -> None:
    """Test relationship between Workflow and WorkflowVersion."""
    user = User(
        id=uuid4(),
        username="creator8",
        email="creator8@example.com",
        full_name="Creator User 8",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    workflow = Workflow(
        id=uuid4(),
        name="versioned-workflow",
        created_by=user.id,
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
        yaml_definition="schemaVersion: '1.0.0'\nname: v1\nactivities: []",
        created_by=user.id,
    )
    version2 = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=2,
        schema_version="1.0.0",
        yaml_definition="schemaVersion: '1.0.0'\nname: v2\nactivities: []",
        created_by=user.id,
    )
    test_db_session.add_all([version1, version2])
    await test_db_session.commit()

    # Access versions from workflow
    await test_db_session.refresh(workflow, ["versions"])
    assert len(workflow.versions) == 2


@pytest.mark.asyncio
async def test_workflow_repr(test_db_session: AsyncSession) -> None:
    """Test string representation of Workflow."""
    user = User(
        id=uuid4(),
        username="creator9",
        email="creator9@example.com",
        full_name="Creator User 9",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    workflow_id = uuid4()
    workflow = Workflow(
        id=workflow_id,
        name="repr-workflow",
        created_by=user.id,
        current_version=3,
    )

    repr_str = repr(workflow)
    assert "Workflow" in repr_str
    assert str(workflow_id) in repr_str
    assert "repr-workflow" in repr_str
    assert "3" in repr_str


@pytest.mark.asyncio
async def test_workflow_labels_default(test_db_session: AsyncSession) -> None:
    """Test that labels defaults to empty dict."""
    user = User(
        id=uuid4(),
        username="creator10",
        email="creator10@example.com",
        full_name="Creator User 10",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    workflow = Workflow(
        id=uuid4(),
        name="default-labels",
        created_by=user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.labels == {}
    assert isinstance(workflow.labels, dict)


@pytest.mark.asyncio
async def test_workflow_is_enabled_default(test_db_session: AsyncSession) -> None:
    """Test that is_enabled defaults to True."""
    user = User(
        id=uuid4(),
        username="creator11",
        email="creator11@example.com",
        full_name="Creator User 11",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    workflow = Workflow(
        id=uuid4(),
        name="default-enabled",
        created_by=user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.is_enabled is True


@pytest.mark.asyncio
async def test_workflow_current_version_default(test_db_session: AsyncSession) -> None:
    """Test that current_version defaults to 1."""
    user = User(
        id=uuid4(),
        username="creator12",
        email="creator12@example.com",
        full_name="Creator User 12",
        role=UserRole.CREATOR.value,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)

    workflow = Workflow(
        id=uuid4(),
        name="default-version",
        created_by=user.id,
    )
    test_db_session.add(workflow)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)

    assert workflow.current_version == 1
