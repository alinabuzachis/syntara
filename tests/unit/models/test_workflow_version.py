"""Unit tests for WorkflowVersion model.

Tests cover:
- WorkflowVersion creation with required fields
- Soft delete behavior
- Unique (workflow_id, version) constraint
- YAML definition storage
- change_description field
- Relationships with Workflow and User
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nexus_api.models.user import User, UserRole
from nexus_api.models.workflow import Workflow
from nexus_api.models.workflow_version import WorkflowVersion


@pytest.mark.asyncio
async def test_create_workflow_version_with_required_fields(
    test_db_session: AsyncSession,
) -> None:
    """Test creating a workflow version with required fields only."""
    # Create user and workflow
    user = User(
        id=uuid4(),
        username="creator",
        email="creator@example.com",
        full_name="Creator User",
        role=UserRole.CREATOR.value,
    )
    workflow = Workflow(
        id=uuid4(),
        name="test-workflow",
        created_by=user.id,
    )
    test_db_session.add_all([user, workflow])
    await test_db_session.commit()
    await test_db_session.refresh(user)
    await test_db_session.refresh(workflow)

    # Create version
    yaml_def = """schemaVersion: "1.0.0"
name: test-workflow
activities: []
"""
    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        yaml_definition=yaml_def,
        created_by=user.id,
    )
    test_db_session.add(version)
    await test_db_session.commit()
    await test_db_session.refresh(version)

    assert version.id is not None
    assert version.workflow_id == workflow.id
    assert version.version == 1
    assert version.schema_version == "1.0.0"
    assert version.yaml_definition == yaml_def
    assert version.created_by == user.id
    assert version.change_description is None
    assert version.deleted_at is None
    assert version.deleted_by is None
    assert version.created_at is not None


@pytest.mark.asyncio
async def test_create_workflow_version_with_all_fields(
    test_db_session: AsyncSession,
) -> None:
    """Test creating a workflow version with all fields."""
    user = User(
        id=uuid4(),
        username="creator2",
        email="creator2@example.com",
        full_name="Creator User 2",
        role=UserRole.CREATOR.value,
    )
    workflow = Workflow(
        id=uuid4(),
        name="full-workflow",
        created_by=user.id,
    )
    test_db_session.add_all([user, workflow])
    await test_db_session.commit()
    await test_db_session.refresh(user)
    await test_db_session.refresh(workflow)

    yaml_def = """schemaVersion: "1.0.0"
name: full-workflow
activities: []
"""
    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        yaml_definition=yaml_def,
        created_by=user.id,
        change_description="Initial version",
    )
    test_db_session.add(version)
    await test_db_session.commit()
    await test_db_session.refresh(version)

    assert version.change_description == "Initial version"


@pytest.mark.asyncio
async def test_workflow_version_soft_delete(test_db_session: AsyncSession) -> None:
    """Test soft delete sets deleted_at and deleted_by correctly."""
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
    workflow = Workflow(
        id=uuid4(),
        name="version-delete-test",
        created_by=creator.id,
    )
    test_db_session.add_all([creator, admin, workflow])
    await test_db_session.commit()
    await test_db_session.refresh(creator)
    await test_db_session.refresh(admin)
    await test_db_session.refresh(workflow)

    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        yaml_definition="schemaVersion: '1.0.0'\nname: test\nactivities: []",
        created_by=creator.id,
    )
    test_db_session.add(version)
    await test_db_session.commit()
    await test_db_session.refresh(version)

    # Perform soft delete
    now = datetime.now(UTC)
    version.deleted_at = now
    version.deleted_by = admin.id
    await test_db_session.commit()
    await test_db_session.refresh(version)

    assert version.deleted_at == now
    assert version.deleted_by == admin.id


@pytest.mark.asyncio
async def test_workflow_version_unique_workflow_version_constraint(
    test_db_session: AsyncSession,
) -> None:
    """Test that (workflow_id, version) must be unique."""
    user = User(
        id=uuid4(),
        username="creator4",
        email="creator4@example.com",
        full_name="Creator User 4",
        role=UserRole.CREATOR.value,
    )
    workflow = Workflow(
        id=uuid4(),
        name="unique-test",
        created_by=user.id,
    )
    test_db_session.add_all([user, workflow])
    await test_db_session.commit()
    await test_db_session.refresh(user)
    await test_db_session.refresh(workflow)

    # Create first version
    version1 = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        yaml_definition="schemaVersion: '1.0.0'\nname: v1\nactivities: []",
        created_by=user.id,
    )
    test_db_session.add(version1)
    await test_db_session.commit()

    # Try to create duplicate version
    version2 = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,  # Same version number
        schema_version="1.0.0",
        yaml_definition="schemaVersion: '1.0.0'\nname: v1-duplicate\nactivities: []",
        created_by=user.id,
    )
    test_db_session.add(version2)

    with pytest.raises(IntegrityError):
        await test_db_session.commit()

    await test_db_session.rollback()


@pytest.mark.asyncio
async def test_workflow_version_multiple_versions_same_workflow(
    test_db_session: AsyncSession,
) -> None:
    """Test creating multiple versions for the same workflow."""
    user = User(
        id=uuid4(),
        username="creator5",
        email="creator5@example.com",
        full_name="Creator User 5",
        role=UserRole.CREATOR.value,
    )
    workflow = Workflow(
        id=uuid4(),
        name="multi-version",
        created_by=user.id,
    )
    test_db_session.add_all([user, workflow])
    await test_db_session.commit()
    await test_db_session.refresh(user)
    await test_db_session.refresh(workflow)

    # Create multiple versions
    for i in range(1, 4):
        version = WorkflowVersion(
            id=uuid4(),
            workflow_id=workflow.id,
            version=i,
            schema_version="1.0.0",
            yaml_definition=f"schemaVersion: '1.0.0'\nname: v{i}\nactivities: []",
            created_by=user.id,
            change_description=f"Version {i}",
        )
        test_db_session.add(version)

    await test_db_session.commit()

    # Query all versions
    result = await test_db_session.execute(
        select(WorkflowVersion).filter(
            WorkflowVersion.workflow_id == workflow.id,
            WorkflowVersion.deleted_at.is_(None),
        )
    )
    versions = list(result.scalars().all())

    assert len(versions) == 3
    assert {v.version for v in versions} == {1, 2, 3}


@pytest.mark.asyncio
async def test_workflow_version_relationship_with_workflow(
    test_db_session: AsyncSession,
) -> None:
    """Test relationship between WorkflowVersion and Workflow."""
    user = User(
        id=uuid4(),
        username="creator6",
        email="creator6@example.com",
        full_name="Creator User 6",
        role=UserRole.CREATOR.value,
    )
    workflow = Workflow(
        id=uuid4(),
        name="relationship-test",
        created_by=user.id,
    )
    test_db_session.add_all([user, workflow])
    await test_db_session.commit()
    await test_db_session.refresh(user)
    await test_db_session.refresh(workflow)

    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        yaml_definition="schemaVersion: '1.0.0'\nname: test\nactivities: []",
        created_by=user.id,
    )
    test_db_session.add(version)
    await test_db_session.commit()
    await test_db_session.refresh(version)

    # Access workflow relationship
    assert version.workflow.id == workflow.id
    assert version.workflow.name == "relationship-test"

    # Access versions from workflow
    await test_db_session.refresh(workflow, ["versions"])
    assert len(workflow.versions) == 1
    assert workflow.versions[0].id == version.id


@pytest.mark.asyncio
async def test_workflow_version_relationship_with_user(
    test_db_session: AsyncSession,
) -> None:
    """Test relationship between WorkflowVersion and User."""
    user = User(
        id=uuid4(),
        username="creator7",
        email="creator7@example.com",
        full_name="Creator User 7",
        role=UserRole.CREATOR.value,
    )
    workflow = Workflow(
        id=uuid4(),
        name="user-relationship-test",
        created_by=user.id,
    )
    test_db_session.add_all([user, workflow])
    await test_db_session.commit()
    await test_db_session.refresh(user)
    await test_db_session.refresh(workflow)

    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        yaml_definition="schemaVersion: '1.0.0'\nname: test\nactivities: []",
        created_by=user.id,
    )
    test_db_session.add(version)
    await test_db_session.commit()
    await test_db_session.refresh(version)

    # Access creator relationship
    assert version.creator.id == user.id
    assert version.creator.username == "creator7"


@pytest.mark.asyncio
async def test_workflow_version_repr(test_db_session: AsyncSession) -> None:
    """Test string representation of WorkflowVersion."""
    user = User(
        id=uuid4(),
        username="creator8",
        email="creator8@example.com",
        full_name="Creator User 8",
        role=UserRole.CREATOR.value,
    )
    workflow = Workflow(
        id=uuid4(),
        name="repr-test",
        created_by=user.id,
    )
    test_db_session.add_all([user, workflow])
    await test_db_session.commit()
    await test_db_session.refresh(user)
    await test_db_session.refresh(workflow)

    version_id = uuid4()
    version = WorkflowVersion(
        id=version_id,
        workflow_id=workflow.id,
        version=2,
        schema_version="1.0.0",
        yaml_definition="schemaVersion: '1.0.0'\nname: test\nactivities: []",
        created_by=user.id,
    )

    repr_str = repr(version)
    assert "WorkflowVersion" in repr_str
    assert str(version_id) in repr_str
    assert str(workflow.id) in repr_str
    assert "2" in repr_str


@pytest.mark.asyncio
async def test_workflow_version_yaml_definition_storage(
    test_db_session: AsyncSession,
) -> None:
    """Test that large YAML definitions are stored correctly."""
    user = User(
        id=uuid4(),
        username="creator9",
        email="creator9@example.com",
        full_name="Creator User 9",
        role=UserRole.CREATOR.value,
    )
    workflow = Workflow(
        id=uuid4(),
        name="large-yaml-test",
        created_by=user.id,
    )
    test_db_session.add_all([user, workflow])
    await test_db_session.commit()
    await test_db_session.refresh(user)
    await test_db_session.refresh(workflow)

    # Create a larger YAML definition
    large_yaml = """schemaVersion: "1.0.0"
name: large-workflow
description: A workflow with many activities
activities:
  - id: activity_1
    name: Activity 1
    type: task
    config:
      param1: value1
      param2: value2
  - id: activity_2
    name: Activity 2
    type: task
    config:
      param1: value1
      param2: value2
transitions:
  - from: activity_1
    to: activity_2
"""

    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        yaml_definition=large_yaml,
        created_by=user.id,
    )
    test_db_session.add(version)
    await test_db_session.commit()
    await test_db_session.refresh(version)

    assert version.yaml_definition == large_yaml
    assert "activity_1" in version.yaml_definition
    assert "activity_2" in version.yaml_definition
