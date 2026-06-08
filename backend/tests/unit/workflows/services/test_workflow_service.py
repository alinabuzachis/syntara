"""Unit tests for WorkflowService.

These tests verify the business logic layer for workflow management.
Tests use real database fixtures to test actual database interactions.
"""

import base64
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.workflows.exceptions import (
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowNotPublishedError,
    WorkflowVersionNotFoundError,
)
from nexus.workflows.models import Workflow, WorkflowListResponse, WorkflowRead, WorkflowVersion
from nexus.workflows.models.workflow_version import WorkflowVersionStatus
from nexus.workflows.services.workflow_service import WorkflowConvertResourceMixin, WorkflowService


class TestWorkflowServiceBase:
    """Base test class with helper methods for WorkflowService tests."""

    def _create_test_workflow(
        self,
        workflow_id: UUID | None = None,
        name: str = "test-workflow",
        description: str | None = "Test workflow",
        labels: dict[str, Any] | None = None,
        current_version: int = 1,
        created_by: UUID | None = None,
        *,
        is_enabled: bool = True,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
        deleted_at: datetime | None = None,
    ) -> Workflow:
        """Create a test Workflow object."""
        now = datetime.now(UTC)
        return Workflow(
            id=workflow_id or uuid4(),
            name=name,
            description=description,
            labels=labels or {},
            current_version=current_version,
            created_by=created_by or uuid4(),
            is_enabled=is_enabled,
            published_version=current_version if is_enabled else None,
            created_at=created_at or now,
            updated_at=updated_at or now,
            deleted_at=deleted_at,
        )

    def _create_test_workflow_version(
        self,
        version_id: UUID | None = None,
        workflow_id: UUID | None = None,
        version: int = 1,
        schema_version: str = "2.0.0",
        workflow_definition: dict[str, Any] | None = None,
        created_by: UUID | None = None,
        change_description: str = "Initial version",
        created_at: datetime | None = None,
        deleted_at: datetime | None = None,
    ) -> WorkflowVersion:
        """Create a test WorkflowVersion object."""
        return WorkflowVersion(
            id=version_id or uuid4(),
            workflow_id=workflow_id or uuid4(),
            version=version,
            schema_version=schema_version,
            workflow_definition=workflow_definition or self._create_minimal_workflow_definition(),
            created_by=created_by or uuid4(),
            change_description=change_description,
            created_at=created_at or datetime.now(UTC),
            deleted_at=deleted_at,
        )

    def _create_minimal_workflow_definition(self) -> dict[str, Any]:
        """Create a minimal valid V2 workflow definition."""
        return {
            "schema_version": "2.0.0",
            "name": "test-workflow",
            "description": "Test workflow",
            "triggers": [
                {
                    "id": "trigger_manual",
                    "type": "manual_trigger",
                }
            ],
            "nodes": [
                {
                    "id": "task1",
                    "name": "Task 1",
                    "type": "script",
                    "config": {
                        "language": "python",
                        "code": "print('hello')",
                    },
                }
            ],
            "edges": [
                {"from": "trigger_manual", "to": "task1"},
            ],
        }

    def _create_workflow_definition(self, **overrides: dict[str, Any]) -> dict[str, Any]:
        """Create a workflow definition dict with optional overrides."""
        definition = self._create_minimal_workflow_definition()
        for key, value in overrides.items():
            if "." in key:
                keys = key.split(".")
                target = definition
                for k in keys[:-1]:
                    target = target[k]
                target[keys[-1]] = value
            else:
                definition[key] = value
        return definition


class TestWorkflowServiceInit(TestWorkflowServiceBase):
    """Test WorkflowService initialization."""

    @pytest.mark.asyncio
    async def test_init_sets_session_and_user(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test that WorkflowService initialization sets session and user correctly."""
        service = WorkflowService(test_db_session, test_user)

        assert service.session == test_db_session
        assert service.user == test_user
        assert service.convert_resource_mixin is not None


class TestWorkflowServiceDuplicateDetection(TestWorkflowServiceBase):
    """Test duplicate name detection logic."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("statement", "args", "expected"),
        [
            (
                "duplicate key value violates unique constraint",
                (
                    "(psycopg2.errors.UniqueViolation) duplicate key value violates unique "
                    'constraint "ix_workflows_name_unique"',
                ),
                True,
            ),
            (
                "constraint error",
                ("workflows.name constraint violated",),
                True,
            ),
            (
                "error",
                ("DUPLICATE KEY constraint violated",),
                True,
            ),
            (
                "foreign key constraint",
                (),
                False,
            ),
        ],
    )
    async def test_is_duplicate_name_error_parameterized(
        self, test_db_session: AsyncSession, test_user: User, statement: str, args: tuple[str, ...], *, expected: bool
    ) -> None:
        """Test duplicate detection with various error messages and args."""
        service = WorkflowService(test_db_session, test_user)

        error = IntegrityError(statement, "SELECT", None)  # type: ignore[arg-type]
        error.args = args

        result = service._is_duplicate_name_error(error)
        assert result is expected


class TestWorkflowServiceFlushWithDuplicateCheck(TestWorkflowServiceBase):
    """Test flush with duplicate check functionality."""

    @pytest.mark.asyncio
    async def test_flush_with_duplicate_check_raises_workflow_name_conflict(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test flush raises WorkflowNameConflictError for duplicate name."""
        service = WorkflowService(test_db_session, test_user)

        # Create a workflow first
        workflow = self._create_test_workflow(name="duplicate-name", created_by=test_user.id)
        test_db_session.add(workflow)
        await test_db_session.commit()

        # Now try to create another with the same name using direct SQL to trigger IntegrityError
        with patch.object(test_db_session, "flush") as mock_flush:
            duplicate_error = IntegrityError("duplicate", "SELECT", None)  # type: ignore[arg-type]
            duplicate_error.args = ("ix_workflows_name_unique constraint violated",)
            mock_flush.side_effect = duplicate_error

            with pytest.raises(WorkflowNameConflictError) as exc_info:
                await service._flush_with_duplicate_check("duplicate-name")

            assert str(exc_info.value) == "Workflow with name 'duplicate-name' already exists"


class TestWorkflowServiceCreateWorkflow(TestWorkflowServiceBase):
    """Test create_workflow functionality."""

    @pytest.mark.asyncio
    async def test_create_workflow_success(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test successful workflow creation."""
        service = WorkflowService(test_db_session, test_user)

        workflow_definition = self._create_workflow_definition()

        # Mock validator to accept the definition without error
        with patch("nexus.workflows.services.workflow_service.workflow_validator") as mock_validator:
            mock_validator.validate_workflow_definition.return_value = None

            result = await service.create_workflow(
                name="test-workflow",
                description="Test description",
                labels={"env": "test"},
                workflow_definition=workflow_definition,
            )

            workflow, version = result
            assert workflow.name == "test-workflow"
            assert workflow.description == "Test description"
            assert workflow.labels == {"env": "test"}
            assert workflow.current_version == 1
            assert workflow.created_by == test_user.id
            assert workflow.is_enabled is False

            assert version.workflow_id == workflow.id
            assert version.version == 1
            assert version.schema_version == "2.0.0"
            assert version.workflow_definition == workflow_definition
            assert version.created_by == test_user.id
            assert version.change_description == "Initial version"

            # Verify workflow exists in database
            db_workflow = await test_db_session.get(Workflow, workflow.id)
            assert db_workflow is not None
            assert db_workflow.name == "test-workflow"

    @pytest.mark.asyncio
    async def test_create_workflow_validation_error(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test workflow creation with invalid definition."""
        service = WorkflowService(test_db_session, test_user)

        workflow_definition = self._create_workflow_definition()

        # Mock validator to raise SafeValueError (what V2 validator raises)
        with patch("nexus.workflows.services.workflow_service.workflow_validator") as mock_validator:
            mock_validator.validate_workflow_definition.side_effect = SafeValueError("Invalid definition")

            with pytest.raises(SafeValueError):
                await service.create_workflow(
                    name="invalid-workflow",
                    description=None,
                    labels={},
                    workflow_definition=workflow_definition,
                )

            # Verify no workflow was created in database
            workflows = await test_db_session.exec(select(Workflow))
            assert len(workflows.all()) == 0

    @pytest.mark.asyncio
    async def test_create_workflow_duplicate_name(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test workflow creation with duplicate name."""
        service = WorkflowService(test_db_session, test_user)

        # First, create a workflow with a specific name
        workflow_definition = self._create_workflow_definition()

        with patch("nexus.workflows.services.workflow_service.workflow_validator"):
            # Create first workflow
            await service.create_workflow(
                name="duplicate-workflow",
                description=None,
                labels={},
                workflow_definition=workflow_definition,
            )

        # Now try to create another with the same name
        with (
            patch("nexus.workflows.services.workflow_service.workflow_validator"),
            pytest.raises(WorkflowNameConflictError),
        ):
            await service.create_workflow(
                name="duplicate-workflow",
                description=None,
                labels={},
                workflow_definition=workflow_definition,
            )


class TestWorkflowServiceGetWorkflow(TestWorkflowServiceBase):
    """Test get workflow functionality."""

    @pytest.mark.asyncio
    async def test_get_workflow_by_id_success(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test successful workflow retrieval by ID."""
        service = WorkflowService(test_db_session, test_user)

        # Create a workflow in the database
        workflow = self._create_test_workflow(name="test-workflow", created_by=test_user.id)
        test_db_session.add(workflow)
        await test_db_session.commit()

        result = await service.get_workflow_by_id(workflow.id)

        assert result.id == workflow.id
        assert result.name == workflow.name

    @pytest.mark.asyncio
    async def test_get_workflow_by_id_not_found(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test workflow retrieval when workflow not found."""
        service = WorkflowService(test_db_session, test_user)

        workflow_id = uuid4()

        with pytest.raises(WorkflowNotFoundError) as exc_info:
            await service.get_workflow_by_id(workflow_id)

        assert str(exc_info.value) == f"Workflow {workflow_id} not found"

    @pytest.mark.asyncio
    async def test_get_workflow_with_version_success(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test successful workflow and version retrieval."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflow and version in database
        workflow = self._create_test_workflow(name="test-workflow", current_version=2, created_by=test_user.id)
        test_db_session.add(workflow)

        version = self._create_test_workflow_version(workflow_id=workflow.id, version=2, created_by=test_user.id)
        test_db_session.add(version)
        await test_db_session.commit()

        result_workflow, result_version = await service.get_workflow_with_version(workflow.id)

        assert result_workflow.id == workflow.id
        assert result_version.id == version.id
        assert result_version.version == 2

    @pytest.mark.asyncio
    async def test_get_workflow_with_version_not_found(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test workflow with version when version not found."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflow but not its version
        workflow = self._create_test_workflow(name="test-workflow", current_version=2, created_by=test_user.id)
        test_db_session.add(workflow)
        await test_db_session.commit()

        with pytest.raises(WorkflowVersionNotFoundError) as exc_info:
            await service.get_workflow_with_version(workflow.id)

        assert str(exc_info.value) == f"Workflow {workflow.id} version 2 not found"


class TestWorkflowServiceUpdateMetadata(TestWorkflowServiceBase):
    """Test update workflow metadata functionality."""

    @pytest.mark.asyncio
    async def test_update_workflow_metadata_all_fields(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test updating all metadata fields."""
        service = WorkflowService(test_db_session, test_user)

        workflow = self._create_test_workflow(name="original-name", created_by=test_user.id)
        original_updated_at = workflow.updated_at

        await service.update_workflow_metadata(
            workflow,
            name="updated-name",
            description="Updated description",
            labels={"env": "prod"},
        )

        assert workflow.name == "updated-name"
        assert workflow.description == "Updated description"
        assert workflow.labels == {"env": "prod"}
        assert workflow.updated_by == test_user.id
        assert workflow.updated_at > original_updated_at

    @pytest.mark.asyncio
    async def test_update_workflow_metadata_partial_fields(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test updating only some metadata fields."""
        service = WorkflowService(test_db_session, test_user)

        workflow = self._create_test_workflow(
            name="original-name",
            description="Original description",
            labels={"env": "dev"},
            is_enabled=True,
            created_by=test_user.id,
        )

        await service.update_workflow_metadata(
            workflow,
            name="updated-name",
            description=None,  # Should not change
            labels=None,  # Should not change
        )

        assert workflow.name == "updated-name"
        assert workflow.description == "Original description"  # Unchanged
        assert workflow.labels == {"env": "dev"}  # Unchanged
        assert workflow.updated_by == test_user.id

    @pytest.mark.asyncio
    async def test_update_workflow_metadata_empty_name_error(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test updating with empty name raises SafeValueError."""
        service = WorkflowService(test_db_session, test_user)

        workflow = self._create_test_workflow(created_by=test_user.id)

        with pytest.raises(SafeValueError, match="Workflow name cannot be empty"):
            await service.update_workflow_metadata(workflow, name="")


class TestWorkflowServiceCreateVersion(TestWorkflowServiceBase):
    """Test create workflow version functionality."""

    @pytest.mark.asyncio
    async def test_create_workflow_version_success(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test successful version creation with new definition."""
        service = WorkflowService(test_db_session, test_user)

        workflow = self._create_test_workflow(name="test-workflow", current_version=1, created_by=test_user.id)
        test_db_session.add(workflow)

        # Create current version in database
        current_version = self._create_test_workflow_version(
            workflow_id=workflow.id, version=1, workflow_definition={"original": "definition"}, created_by=test_user.id
        )
        test_db_session.add(current_version)
        await test_db_session.commit()

        new_definition = self._create_workflow_definition(description="Updated workflow")  # type: ignore[arg-type]

        # Mock validator to accept the definition
        with patch("nexus.workflows.services.workflow_service.workflow_validator") as mock_validator:
            mock_validator.validate_workflow_definition.return_value = None

            result = await service.create_workflow_version(
                workflow,
                new_definition,
                "Updated description",
            )

            assert result is not None
            assert result.workflow_id == workflow.id
            assert result.version == 2
            assert result.schema_version == "2.0.0"
            assert result.workflow_definition == new_definition
            assert result.change_description == "Updated description"
            assert result.created_by == test_user.id
            assert workflow.current_version == 2

            # Verify version was added to session
            await test_db_session.commit()
            db_version = await test_db_session.get(WorkflowVersion, result.id)
            assert db_version is not None

    @pytest.mark.asyncio
    async def test_create_workflow_version_no_change(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test version creation when definition hasn't changed."""
        service = WorkflowService(test_db_session, test_user)

        same_definition = self._create_workflow_definition()

        workflow = self._create_test_workflow(name="test-workflow", current_version=1, created_by=test_user.id)
        test_db_session.add(workflow)

        # Create current version in database with same definition
        current_version = self._create_test_workflow_version(
            workflow_id=workflow.id, version=1, workflow_definition=same_definition, created_by=test_user.id
        )
        test_db_session.add(current_version)
        await test_db_session.commit()

        # Mock validator to accept the definition
        with patch("nexus.workflows.services.workflow_service.workflow_validator") as mock_validator:
            mock_validator.validate_workflow_definition.return_value = None

            result = await service.create_workflow_version(
                workflow,
                same_definition,
                "No actual changes",
            )

            assert result is None  # No new version created
            assert workflow.current_version == 1  # Version unchanged

    @pytest.mark.asyncio
    async def test_create_workflow_version_validation_error(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test version creation with invalid definition."""
        service = WorkflowService(test_db_session, test_user)

        workflow = self._create_test_workflow(created_by=test_user.id)
        invalid_definition = self._create_workflow_definition()

        # Mock validator to raise SafeValueError (what V2 validator raises)
        with patch("nexus.workflows.services.workflow_service.workflow_validator") as mock_validator:
            mock_validator.validate_workflow_definition.side_effect = SafeValueError("Invalid definition")

            with pytest.raises(SafeValueError):
                await service.create_workflow_version(
                    workflow,
                    invalid_definition,
                    "Invalid update",
                )

            # Verify no new version was created
            versions = await test_db_session.exec(select(WorkflowVersion))
            assert len(versions.all()) == 0


class TestWorkflowServiceUpdateWorkflow(TestWorkflowServiceBase):
    """Test update workflow functionality."""

    @pytest.mark.asyncio
    async def test_update_workflow_metadata_only(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test updating workflow metadata without creating new version."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflow and version in database
        workflow = self._create_test_workflow(name="test-workflow", created_by=test_user.id)
        test_db_session.add(workflow)

        version = self._create_test_workflow_version(workflow_id=workflow.id, created_by=test_user.id)
        test_db_session.add(version)
        await test_db_session.commit()

        result = await service.update_workflow(
            workflow.id,
            name="updated-name",
            description="Updated description",
            labels={"env": "prod"},
        )

        result_workflow, result_version = result
        assert result_workflow.id == workflow.id
        assert result_workflow.name == "updated-name"
        assert result_workflow.description == "Updated description"
        assert result_workflow.labels == {"env": "prod"}
        assert result_version.id == version.id

    @pytest.mark.asyncio
    async def test_update_workflow_with_definition(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test updating workflow with new definition creates version."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflow and version in database
        workflow = self._create_test_workflow(name="test-workflow", current_version=1, created_by=test_user.id)
        test_db_session.add(workflow)

        version = self._create_test_workflow_version(workflow_id=workflow.id, version=1, created_by=test_user.id)
        test_db_session.add(version)
        await test_db_session.commit()

        new_definition = self._create_workflow_definition(description="Updated workflow with new features")  # type: ignore[arg-type]

        with patch("nexus.workflows.services.workflow_service.workflow_validator") as mock_validator:
            mock_validator.validate_workflow_definition.return_value = None

            result = await service.update_workflow(
                workflow.id,
                name="updated-name",
                workflow_definition=new_definition,
                change_description="Added new features",
            )

            result_workflow, result_version = result
            assert result_workflow.id == workflow.id
            assert result_workflow.name == "updated-name"
            assert result_workflow.current_version == 2  # Version should be incremented
            assert result_version.version == 2

    @pytest.mark.asyncio
    async def test_update_workflow_not_found(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test updating non-existent workflow raises error."""
        service = WorkflowService(test_db_session, test_user)

        workflow_id = uuid4()

        with pytest.raises(WorkflowNotFoundError):
            await service.update_workflow(workflow_id, name="new-name")


class TestWorkflowServiceDeleteWorkflow(TestWorkflowServiceBase):
    """Test delete workflow functionality."""

    @pytest.mark.asyncio
    async def test_delete_workflow_success(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test successful workflow soft deletion."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflow in database
        workflow = self._create_test_workflow(name="test-workflow", created_by=test_user.id)
        test_db_session.add(workflow)
        await test_db_session.commit()

        await service.delete_workflow(workflow.id)

        # Verify workflow is soft deleted
        await test_db_session.refresh(workflow)
        assert workflow.deleted_at is not None
        assert workflow.deleted_by == test_user.id

    @pytest.mark.asyncio
    async def test_delete_workflow_not_found(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test deleting non-existent workflow raises error."""
        service = WorkflowService(test_db_session, test_user)

        workflow_id = uuid4()

        with pytest.raises(WorkflowNotFoundError):
            await service.delete_workflow(workflow_id)


class TestWorkflowServiceListWorkflows(TestWorkflowServiceBase):
    """Test list workflows functionality."""

    @pytest.mark.asyncio
    async def test_list_workflows_cursor_uses_base_method(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test that list_workflows_cursor delegates to base list_resources method."""
        service = WorkflowService(test_db_session, test_user)

        # Create some workflows for testing
        workflow1 = self._create_test_workflow(name="workflow-1", created_by=test_user.id)
        workflow2 = self._create_test_workflow(name="workflow-2", created_by=test_user.id)
        test_db_session.add_all([workflow1, workflow2])
        await test_db_session.commit()

        result = await service.list_workflows_cursor(
            limit=10,
            cursor=None,
            sort="name",
            query_params_items=[("is_enabled", "true")],
            include_total=True,
        )

        assert result.__class__ == WorkflowListResponse
        assert len(result.resources) == 2
        assert result.total == 2

        # Verify the actual workflows are returned
        returned_names = {w.name for w in result.resources}
        expected_names = {"workflow-1", "workflow-2"}
        assert returned_names == expected_names

        # Verify all returned workflows are enabled
        assert all(w.is_enabled for w in result.resources)

    @pytest.mark.asyncio
    async def test_list_workflows_cursor_default_sort(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test that list_workflows_cursor uses default sort when none provided."""
        service = WorkflowService(test_db_session, test_user)

        result = await service.list_workflows_cursor()

        assert result.__class__ == WorkflowListResponse
        # Should work even with empty result
        assert len(result.resources) == 0

    @pytest.mark.asyncio
    async def test_list_workflows_cursor_boundary_limit_zero(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test cursor pagination with zero limit."""
        service = WorkflowService(test_db_session, test_user)

        # Create test workflow
        workflow = self._create_test_workflow(name="test-workflow", created_by=test_user.id)
        test_db_session.add(workflow)
        await test_db_session.commit()

        result = await service.list_workflows_cursor(limit=0)

        assert result.__class__ == WorkflowListResponse
        assert len(result.resources) == 0

    @pytest.mark.asyncio
    async def test_list_workflows_cursor_boundary_large_limit(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test cursor pagination with very large limit."""
        service = WorkflowService(test_db_session, test_user)

        # Create multiple workflows
        workflows = [self._create_test_workflow(name=f"workflow-{i}", created_by=test_user.id) for i in range(5)]
        test_db_session.add_all(workflows)
        await test_db_session.commit()

        result = await service.list_workflows_cursor(limit=1000)

        assert result.__class__ == WorkflowListResponse
        assert len(result.resources) == 5

        # Verify all created workflows are returned
        returned_names = {w.name for w in result.resources}
        expected_names = {f"workflow-{i}" for i in range(5)}
        assert returned_names == expected_names

    @pytest.mark.asyncio
    async def test_list_workflows_cursor_with_valid_cursor(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test pagination with valid cursor token."""
        service = WorkflowService(test_db_session, test_user)

        # Create multiple workflows for pagination
        workflows = [self._create_test_workflow(name=f"workflow-{i:02d}", created_by=test_user.id) for i in range(10)]
        test_db_session.add_all(workflows)
        await test_db_session.commit()

        # Get first page
        first_page = await service.list_workflows_cursor(limit=3, sort="name")

        assert len(first_page.resources) == 3
        assert first_page.next is not None

        # Verify the first page contains the expected workflows (sorted by name)
        first_page_names = [w.name for w in first_page.resources]
        expected_first_names = ["workflow-00", "workflow-01", "workflow-02"]
        assert first_page_names == expected_first_names

        # Get second page using cursor
        second_page = await service.list_workflows_cursor(limit=3, cursor=first_page.next, sort="name")

        assert len(second_page.resources) == 3
        assert second_page.prev is not None

        # Verify the second page contains the expected workflows
        second_page_names = [w.name for w in second_page.resources]
        expected_second_names = ["workflow-03", "workflow-04", "workflow-05"]
        assert second_page_names == expected_second_names

        # Verify different results
        first_names = {w.name for w in first_page.resources}
        second_names = {w.name for w in second_page.resources}
        assert first_names.isdisjoint(second_names)

    @pytest.mark.asyncio
    async def test_list_workflows_cursor_empty_results_with_cursor(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test cursor pagination when result set is empty."""
        service = WorkflowService(test_db_session, test_user)

        # Create a valid base64 cursor that points to a non-existent record
        cursor_data = {"id": str(uuid4()), "direction": "next"}
        valid_cursor = base64.b64encode(json.dumps(cursor_data).encode("utf-8")).decode("ascii")

        result = await service.list_workflows_cursor(limit=10, cursor=valid_cursor, sort="name")

        assert result.__class__ == WorkflowListResponse
        assert len(result.resources) == 0
        assert result.next is None
        assert result.prev is None

    @pytest.mark.asyncio
    async def test_list_workflows_cursor_different_sort_orders(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test cursor pagination with different sort orders."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflows with different timestamps
        base_time = datetime.now(UTC)
        workflows = []
        for i in range(3):
            workflow = self._create_test_workflow(
                name=f"workflow-{i}", created_by=test_user.id, created_at=base_time + timedelta(hours=i)
            )
            workflows.append(workflow)

        test_db_session.add_all(workflows)
        await test_db_session.commit()

        # Test ascending sort
        asc_result = await service.list_workflows_cursor(sort="created_at")
        assert len(asc_result.resources) == 3

        # Verify ascending order by created_at
        asc_names = [w.name for w in asc_result.resources]
        assert asc_names == ["workflow-0", "workflow-1", "workflow-2"]

        # Test descending sort (default)
        desc_result = await service.list_workflows_cursor(sort="-created_at")
        assert len(desc_result.resources) == 3

        # Verify descending order by created_at
        desc_names = [w.name for w in desc_result.resources]
        assert desc_names == ["workflow-2", "workflow-1", "workflow-0"]

        # Test name sort
        name_result = await service.list_workflows_cursor(sort="name")
        assert len(name_result.resources) == 3

        # Verify alphabetical order by name
        name_names = [w.name for w in name_result.resources]
        assert name_names == ["workflow-0", "workflow-1", "workflow-2"]

    @pytest.mark.asyncio
    async def test_list_workflows_cursor_with_include_total(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test cursor pagination with total count included."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflows
        workflows = [self._create_test_workflow(name=f"workflow-{i}", created_by=test_user.id) for i in range(7)]
        test_db_session.add_all(workflows)
        await test_db_session.commit()

        # Test without total
        without_total = await service.list_workflows_cursor(limit=3, include_total=False)
        assert without_total.total is None

        # Test with total
        with_total = await service.list_workflows_cursor(limit=3, include_total=True)
        assert with_total.total == 7
        assert len(with_total.resources) == 3

        # Verify the first 3 workflows are returned (default sort)
        returned_names = {w.name for w in with_total.resources}
        all_workflow_names = {f"workflow-{i}" for i in range(7)}
        assert returned_names.issubset(all_workflow_names)


class TestWorkflowServiceLabelFiltering(TestWorkflowServiceBase):
    """Test label filtering functionality in workflow list operations."""

    @pytest.mark.asyncio
    async def test_list_workflows_filter_by_label_key_value(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test filtering workflows by specific label key-value pair."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflows with different labels
        prod_workflow = self._create_test_workflow(
            name="prod-workflow", labels={"environment": "production", "team": "backend"}, created_by=test_user.id
        )
        dev_workflow = self._create_test_workflow(
            name="dev-workflow", labels={"environment": "development", "team": "frontend"}, created_by=test_user.id
        )
        staging_workflow = self._create_test_workflow(
            name="staging-workflow", labels={"environment": "staging", "team": "backend"}, created_by=test_user.id
        )

        test_db_session.add_all([prod_workflow, dev_workflow, staging_workflow])
        await test_db_session.commit()

        # Filter by environment=production (key-value filtering)
        result = await service.list_workflows_cursor(query_params_items=[("labels[environment]", "production")])

        assert len(result.resources) == 1
        assert result.resources[0].name == "prod-workflow"
        assert result.resources[0].labels["environment"] == "production"
        assert result.resources[0].labels["team"] == "backend"

    @pytest.mark.asyncio
    async def test_list_workflows_filter_by_label_key_existence(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test filtering workflows by label key existence (without specific value)."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflows with and without specific labels
        with_team_workflow = self._create_test_workflow(
            name="with-team", labels={"team": "backend", "environment": "prod"}, created_by=test_user.id
        )
        without_team_workflow = self._create_test_workflow(
            name="without-team", labels={"environment": "dev"}, created_by=test_user.id
        )

        test_db_session.add_all([with_team_workflow, without_team_workflow])
        await test_db_session.commit()

        # Filter by team key existence (should match workflow with any team value)
        result = await service.list_workflows_cursor(
            query_params_items=[("labels[team]", "")]  # Empty value means key existence check
        )

        assert len(result.resources) == 1
        assert result.resources[0].name == "with-team"
        assert "team" in result.resources[0].labels
        assert result.resources[0].labels["team"] == "backend"

    @pytest.mark.asyncio
    async def test_list_workflows_filter_multiple_labels(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test filtering workflows with multiple label criteria (AND logic)."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflows with various label combinations
        exact_match = self._create_test_workflow(
            name="exact-match",
            labels={"environment": "production", "team": "backend", "priority": "high"},
            created_by=test_user.id,
        )
        partial_match1 = self._create_test_workflow(
            name="partial-match-1",
            labels={"environment": "production", "team": "frontend"},  # Missing team=backend
            created_by=test_user.id,
        )
        partial_match2 = self._create_test_workflow(
            name="partial-match-2",
            labels={"team": "backend", "priority": "low"},  # Missing environment=production
            created_by=test_user.id,
        )

        test_db_session.add_all([exact_match, partial_match1, partial_match2])
        await test_db_session.commit()

        # Filter by multiple criteria (environment=production AND team=backend)
        result = await service.list_workflows_cursor(
            query_params_items=[("labels[environment]", "production"), ("labels[team]", "backend")]
        )

        assert len(result.resources) == 1
        assert result.resources[0].name == "exact-match"
        assert result.resources[0].labels["environment"] == "production"
        assert result.resources[0].labels["team"] == "backend"

    @pytest.mark.asyncio
    async def test_list_workflows_filter_nonexistent_label_key(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test filtering by nonexistent label key returns empty results."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflow without the 'nonexistent' label
        workflow = self._create_test_workflow(
            name="test-workflow", labels={"environment": "prod", "team": "backend"}, created_by=test_user.id
        )
        test_db_session.add(workflow)
        await test_db_session.commit()

        # Filter by nonexistent label key
        result = await service.list_workflows_cursor(query_params_items=[("labels[nonexistent]", "any-value")])

        assert len(result.resources) == 0

    @pytest.mark.asyncio
    async def test_list_workflows_filter_nonmatching_label_value(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test filtering by label key with non-matching value."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflow with specific label value
        workflow = self._create_test_workflow(
            name="prod-workflow", labels={"environment": "production"}, created_by=test_user.id
        )
        test_db_session.add(workflow)
        await test_db_session.commit()

        # Filter by same key but different value
        result = await service.list_workflows_cursor(query_params_items=[("labels[environment]", "staging")])

        assert len(result.resources) == 0

    @pytest.mark.asyncio
    async def test_list_workflows_filter_empty_label_values(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test filtering workflows with empty label values."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflows with empty and non-empty label values
        empty_value_workflow = self._create_test_workflow(
            name="empty-value", labels={"environment": "", "team": "backend"}, created_by=test_user.id
        )
        normal_workflow = self._create_test_workflow(
            name="normal", labels={"environment": "production", "team": "backend"}, created_by=test_user.id
        )

        test_db_session.add_all([empty_value_workflow, normal_workflow])
        await test_db_session.commit()

        # Filter by empty value - the implementation treats this as key existence check
        result = await service.list_workflows_cursor(query_params_items=[("labels[environment]", "")])

        # Should return exactly 2 results: both workflows that have the environment key
        assert len(result.resources) == 2

        # Verify both workflows are returned
        returned_names = {w.name for w in result.resources}
        assert returned_names == {"empty-value", "normal"}

        # Verify each workflow has the environment key (with different values)
        for workflow in result.resources:
            assert "environment" in workflow.labels
            if workflow.name == "empty-value":
                assert workflow.labels["environment"] == ""
                assert workflow.labels["team"] == "backend"
            elif workflow.name == "normal":
                assert workflow.labels["environment"] == "production"
                assert workflow.labels["team"] == "backend"

    @pytest.mark.asyncio
    async def test_list_workflows_filter_special_characters_in_labels(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test filtering with special characters in label keys and values."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflow with special characters in labels
        special_workflow = self._create_test_workflow(
            name="special-chars",
            labels={"app.name": "my-app", "version": "v1.0.0-beta", "owner": "team@company.com"},
            created_by=test_user.id,
        )
        normal_workflow = self._create_test_workflow(name="normal", labels={"app": "simple"}, created_by=test_user.id)

        test_db_session.add_all([special_workflow, normal_workflow])
        await test_db_session.commit()

        # Filter by label key with dots
        result = await service.list_workflows_cursor(query_params_items=[("labels[app.name]", "my-app")])

        assert len(result.resources) == 1
        assert result.resources[0].name == "special-chars"
        assert result.resources[0].labels["app.name"] == "my-app"

    @pytest.mark.asyncio
    async def test_list_workflows_filter_case_sensitivity(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test label filtering case sensitivity."""
        service = WorkflowService(test_db_session, test_user)

        # Create workflow with specific case labels
        workflow = self._create_test_workflow(
            name="case-test", labels={"Environment": "Production", "TEAM": "Backend"}, created_by=test_user.id
        )
        test_db_session.add(workflow)
        await test_db_session.commit()

        # Test exact case match
        exact_result = await service.list_workflows_cursor(query_params_items=[("labels[Environment]", "Production")])
        assert len(exact_result.resources) == 1
        assert exact_result.resources[0].name == "case-test"
        assert exact_result.resources[0].labels["Environment"] == "Production"

        # Test different case (should not match)
        wrong_case_result = await service.list_workflows_cursor(
            query_params_items=[("labels[environment]", "production")]
        )
        assert len(wrong_case_result.resources) == 0

    @pytest.mark.asyncio
    async def test_list_workflows_filter_combined_with_pagination(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test label filtering combined with cursor pagination."""
        service = WorkflowService(test_db_session, test_user)

        # Create multiple workflows with same label for pagination testing
        workflows = []
        for i in range(7):
            workflow = self._create_test_workflow(
                name=f"prod-workflow-{i:02d}",
                labels={"environment": "production", "index": str(i)},
                created_by=test_user.id,
            )
            workflows.append(workflow)

        # Add one workflow with different environment
        dev_workflow = self._create_test_workflow(
            name="dev-workflow", labels={"environment": "development"}, created_by=test_user.id
        )
        workflows.append(dev_workflow)

        test_db_session.add_all(workflows)
        await test_db_session.commit()

        # Get first page with label filter
        first_page = await service.list_workflows_cursor(
            limit=3, sort="name", query_params_items=[("labels[environment]", "production")]
        )

        assert len(first_page.resources) == 3
        assert first_page.next is not None
        # Verify all results have production environment and correct names
        first_page_names = [w.name for w in first_page.resources]
        expected_first_names = ["prod-workflow-00", "prod-workflow-01", "prod-workflow-02"]
        assert first_page_names == expected_first_names
        for workflow_read in first_page.resources:
            assert workflow_read.labels.get("environment") == "production"

        # Get second page with same filter
        second_page = await service.list_workflows_cursor(
            limit=3, cursor=first_page.next, sort="name", query_params_items=[("labels[environment]", "production")]
        )

        assert len(second_page.resources) == 3
        # Verify second page has correct workflows
        second_page_names = [w.name for w in second_page.resources]
        expected_second_names = ["prod-workflow-03", "prod-workflow-04", "prod-workflow-05"]
        assert second_page_names == expected_second_names
        for workflow_read in second_page.resources:
            assert workflow_read.labels.get("environment") == "production"

    @pytest.mark.asyncio
    async def test_list_workflows_filter_mixed_with_other_params(
        self, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Test label filtering combined with other query parameters."""
        service = WorkflowService(test_db_session, test_user)

        # Create enabled and disabled workflows
        enabled_workflow = self._create_test_workflow(
            name="enabled-prod", labels={"environment": "production"}, is_enabled=True, created_by=test_user.id
        )
        disabled_workflow = self._create_test_workflow(
            name="disabled-prod", labels={"environment": "production"}, is_enabled=False, created_by=test_user.id
        )

        test_db_session.add_all([enabled_workflow, disabled_workflow])
        await test_db_session.commit()

        # Filter by both label and enabled status
        result = await service.list_workflows_cursor(
            query_params_items=[("labels[environment]", "production"), ("is_enabled", "true")]
        )

        assert len(result.resources) == 1
        assert result.resources[0].name == "enabled-prod"
        assert result.resources[0].is_enabled is True
        assert result.resources[0].labels["environment"] == "production"


class TestWorkflowConvertResourceMixin(TestWorkflowServiceBase):
    """Test WorkflowConvertResourceMixin functionality."""

    def test_convert_resource_returns_workflow_read(self) -> None:
        """Test that convert_resource returns WorkflowRead object."""
        mixin = WorkflowConvertResourceMixin()
        workflow = self._create_test_workflow()

        result = mixin.convert_resource(workflow)

        assert isinstance(result, WorkflowRead)
        assert result.id == workflow.id
        assert result.name == workflow.name
        assert result.description == workflow.description


class TestPublishWorkflowVersion(TestWorkflowServiceBase):
    """Test publish_workflow_version method."""

    @pytest.mark.asyncio
    async def test_publish_version_success(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test publishing a version sets status and workflow state."""
        service = WorkflowService(test_db_session, test_user)
        workflow_def = self._create_workflow_definition()

        with patch("nexus.workflows.services.workflow_service.workflow_validator"):
            workflow, _ = await service.create_workflow(
                name="publish-test",
                description=None,
                labels={},
                workflow_definition=workflow_def,
            )

        mock_wh_svc = MagicMock()
        mock_wh_svc.return_value.sync_webhook_triggers = AsyncMock()
        with patch("nexus.workflows.services.workflow_service.WebhookTriggerService", mock_wh_svc):
            result_workflow, result_version = await service.publish_workflow_version(
                workflow_id=workflow.id,
                version=1,
                publish_name="v1.0",
                change_description="Initial release",
            )

        assert result_version.status == WorkflowVersionStatus.PUBLISHED
        assert result_version.publish_name == "v1.0"
        assert result_version.change_description == "Initial release"
        assert result_workflow.published_version == 1
        assert result_workflow.is_enabled is True

    @pytest.mark.asyncio
    async def test_publish_demotes_previous(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test publishing a new version demotes the previous."""
        service = WorkflowService(test_db_session, test_user)
        workflow_def = self._create_workflow_definition()

        with patch("nexus.workflows.services.workflow_service.workflow_validator"):
            workflow, v1 = await service.create_workflow(
                name="demote-test",
                description=None,
                labels={},
                workflow_definition=workflow_def,
            )

        mock_wh_svc = MagicMock()
        mock_wh_svc.return_value.sync_webhook_triggers = AsyncMock()
        with patch("nexus.workflows.services.workflow_service.WebhookTriggerService", mock_wh_svc):
            await service.publish_workflow_version(workflow_id=workflow.id, version=1)

        # Create v2
        v2_def = self._create_workflow_definition()
        v2_def["description"] = "v2"
        with patch("nexus.workflows.services.workflow_service.workflow_validator"):
            v2 = await service.create_workflow_version(workflow, v2_def, "v2 changes")

        assert v2 is not None

        mock_wh_svc2 = MagicMock()
        mock_wh_svc2.return_value.sync_webhook_triggers = AsyncMock()
        with patch("nexus.workflows.services.workflow_service.WebhookTriggerService", mock_wh_svc2):
            await service.publish_workflow_version(workflow_id=workflow.id, version=2)

        await test_db_session.refresh(v1)
        assert v1.status == WorkflowVersionStatus.PREVIOUSLY_PUBLISHED

    @pytest.mark.asyncio
    async def test_publish_idempotent(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test republishing the same version is a no-op."""
        service = WorkflowService(test_db_session, test_user)
        workflow_def = self._create_workflow_definition()

        with patch("nexus.workflows.services.workflow_service.workflow_validator"):
            workflow, _ = await service.create_workflow(
                name="idempotent-test",
                description=None,
                labels={},
                workflow_definition=workflow_def,
            )

        mock_wh_svc = MagicMock()
        mock_wh_svc.return_value.sync_webhook_triggers = AsyncMock()
        with patch("nexus.workflows.services.workflow_service.WebhookTriggerService", mock_wh_svc):
            await service.publish_workflow_version(workflow_id=workflow.id, version=1)
            result_workflow, result_version = await service.publish_workflow_version(workflow_id=workflow.id, version=1)

        assert result_version.status == WorkflowVersionStatus.PUBLISHED
        assert result_workflow.published_version == 1

    @pytest.mark.asyncio
    async def test_publish_nonexistent_version_raises(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test publishing a nonexistent version raises error."""
        service = WorkflowService(test_db_session, test_user)
        workflow_def = self._create_workflow_definition()

        with patch("nexus.workflows.services.workflow_service.workflow_validator"):
            workflow, _ = await service.create_workflow(
                name="nonexistent-version-test",
                description=None,
                labels={},
                workflow_definition=workflow_def,
            )

        with pytest.raises(WorkflowVersionNotFoundError):
            await service.publish_workflow_version(workflow_id=workflow.id, version=99)

    @pytest.mark.asyncio
    async def test_publish_nonexistent_workflow_raises(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test publishing on a nonexistent workflow raises error."""
        service = WorkflowService(test_db_session, test_user)
        fake_id = uuid4()

        with pytest.raises(WorkflowNotFoundError):
            await service.publish_workflow_version(workflow_id=fake_id, version=1)


class TestUnpublishWorkflow(TestWorkflowServiceBase):
    """Test unpublish_workflow method."""

    @pytest.mark.asyncio
    async def test_unpublish_success(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test unpublishing sets workflow state correctly."""
        service = WorkflowService(test_db_session, test_user)
        workflow_def = self._create_workflow_definition()

        with patch("nexus.workflows.services.workflow_service.workflow_validator"):
            workflow, v1 = await service.create_workflow(
                name="unpublish-test",
                description=None,
                labels={},
                workflow_definition=workflow_def,
            )

        mock_wh_svc = MagicMock()
        mock_wh_svc.return_value.sync_webhook_triggers = AsyncMock()
        with patch("nexus.workflows.services.workflow_service.WebhookTriggerService", mock_wh_svc):
            await service.publish_workflow_version(workflow_id=workflow.id, version=1)
            result = await service.unpublish_workflow(workflow_id=workflow.id)

        assert result.published_version is None
        assert result.is_enabled is False

        await test_db_session.refresh(v1)
        assert v1.status == WorkflowVersionStatus.PREVIOUSLY_PUBLISHED

    @pytest.mark.asyncio
    async def ***REMOVED***(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test unpublishing when no version is published raises error."""
        service = WorkflowService(test_db_session, test_user)
        workflow_def = self._create_workflow_definition()

        with patch("nexus.workflows.services.workflow_service.workflow_validator"):
            workflow, _ = await service.create_workflow(
                name="unpublish-error-test",
                description=None,
                labels={},
                workflow_definition=workflow_def,
            )

        with pytest.raises(WorkflowNotPublishedError):
            await service.unpublish_workflow(workflow_id=workflow.id)

    @pytest.mark.asyncio
    async def test_unpublish_nonexistent_workflow_raises(self, test_db_session: AsyncSession, test_user: User) -> None:
        """Test unpublishing a nonexistent workflow raises error."""
        service = WorkflowService(test_db_session, test_user)
        fake_id = uuid4()

        with pytest.raises(WorkflowNotFoundError):
            await service.unpublish_workflow(workflow_id=fake_id)
