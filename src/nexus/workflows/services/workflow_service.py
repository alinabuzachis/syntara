"""Workflow service layer for business logic.

This service encapsulates workflow-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import and_, func, or_, select

from nexus.api.validators import WorkflowDefinitionValidator
from nexus.core.utils.cursor import PaginationDirection, decode_cursor
from nexus.workflows.models import Workflow, WorkflowVersion
from nexus.workflows.workflow_engine.models import WorkflowDefinition


class WorkflowNameConflictError(Exception):
    """Raised when a workflow name already exists."""

    def __init__(self, name: str) -> None:
        """Initialize exception with workflow name."""
        self.name = name
        super().__init__(f"Workflow with name '{name}' already exists")


class WorkflowNotFoundError(Exception):
    """Raised when a workflow is not found."""

    def __init__(self, workflow_id: UUID) -> None:
        """Initialize exception with workflow ID."""
        self.workflow_id = workflow_id
        super().__init__(f"Workflow {workflow_id} not found")


class WorkflowVersionNotFoundError(Exception):
    """Raised when a workflow version is not found."""

    def __init__(self, workflow_id: UUID, version: int) -> None:
        """Initialize exception with workflow ID and version."""
        self.workflow_id = workflow_id
        self.version = version
        super().__init__(f"Workflow {workflow_id} version {version} not found")


def parse_labels_query(labels: str) -> dict[str, str]:
    """Parse labels query parameter from key-value format.

    Supports two formats:
    - "key=value,key2=value2" - filters by key-value pairs
    - "key,key2" - filters by key existence

    Args:
        labels: Labels query string

    Returns:
        Dictionary of label filters

    Examples:
        >>> parse_labels_query("environment=production,team=data")
        {"environment": "production", "team": "data"}
        >>> parse_labels_query("environment,team")
        {"environment": "", "team": ""}

    """
    result: dict[str, str] = {}
    if not labels:
        return result

    for pair_raw in labels.split(","):
        pair = pair_raw.strip()
        if "=" in pair:
            key, value = pair.split("=", 1)
            result[key.strip()] = value.strip()
        else:
            # Key existence check - use empty string as placeholder
            result[pair] = ""

    return result


class WorkflowService:
    """Service for workflow business logic.

    This service encapsulates all workflow-related business operations,
    including CRUD operations, validation, and version management.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize service with database session.

        Args:
            session: Database session for queries

        """
        self.session = session

    def _is_duplicate_name_error(self, e: IntegrityError) -> bool:
        """Check if IntegrityError is due to duplicate workflow name.

        Args:
            e: The IntegrityError to check

        Returns:
            True if error is due to duplicate workflow name constraint

        """
        error_str = str(e)
        return (
            "ix_workflows_name_unique" in error_str
            or "workflows.name" in error_str
            or "duplicate key" in error_str.lower()
        )

    async def _commit_with_duplicate_check(self, workflow_name: str) -> None:
        """Commit database transaction with duplicate name error handling.

        Args:
            workflow_name: Name of workflow being created/updated

        Raises:
            WorkflowNameConflictError: If duplicate name constraint violated
            IntegrityError: For other integrity constraint violations

        """
        try:
            await self.session.commit()
        except IntegrityError as e:
            await self.session.rollback()
            if self._is_duplicate_name_error(e):
                raise WorkflowNameConflictError(workflow_name) from e
            raise

    async def create_workflow(
        self,
        name: str,
        description: str | None,
        labels: dict[str, Any],
        workflow_definition: WorkflowDefinition,
        is_enabled: bool,  # noqa: FBT001
        created_by: UUID,
    ) -> tuple[Workflow, WorkflowVersion]:
        """Create a new workflow with initial version.

        Args:
            name: Workflow name (must be unique)
            description: Optional workflow description
            labels: Optional key-value labels
            workflow_definition: Workflow definition (will be validated)
            is_enabled: Whether workflow is enabled for execution
            created_by: UUID of user creating the workflow

        Returns:
            Tuple of (created workflow, initial version)

        Raises:
            ValidationError: If workflow definition is invalid
            WorkflowNameConflictError: If workflow name already exists

        """
        # Validate workflow definition
        _, schema_version, workflow_dict = WorkflowDefinitionValidator.validate(workflow_definition)

        # Create workflow
        workflow = Workflow(
            id=uuid4(),
            name=name,
            description=description,
            labels=labels,
            current_version=1,
            created_by=created_by,
            is_enabled=is_enabled,
        )

        # Create initial version
        version = WorkflowVersion(
            id=uuid4(),
            workflow_id=workflow.id,
            version=1,
            schema_version=schema_version,
            workflow_definition=workflow_dict,
            created_by=created_by,
            change_description="Initial version",
        )

        self.session.add(workflow)
        self.session.add(version)

        # Commit changes with duplicate name check
        await self._commit_with_duplicate_check(name)
        await self.session.refresh(workflow)
        await self.session.refresh(version)

        return workflow, version

    async def list_workflows_cursor(
        self,
        *,
        created_by: UUID | None = None,
        is_enabled: bool | None = None,
        labels_filter: dict[str, str] | None = None,
        limit: int = 20,
        cursor: str | None = None,
    ) -> list[Workflow]:
        """List workflows using cursor-based pagination.

        Args:
            created_by: Filter by creator user ID
            is_enabled: Filter by enabled status
            labels_filter: Filter by labels (key-value pairs)
            limit: Maximum number of results to return
            cursor: Base64-encoded pagination cursor

        Returns:
            List of workflows for the current page

        """
        # Build base query with filters
        query = select(Workflow).filter(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]

        if created_by:
            query = query.filter(Workflow.created_by == created_by)  # type: ignore[arg-type]

        if is_enabled is not None:
            query = query.filter(Workflow.is_enabled == is_enabled)  # type: ignore[arg-type]

        if labels_filter:
            for key, value in labels_filter.items():
                if value:
                    # Filter by exact key-value match
                    query = query.filter(Workflow.labels[key].astext == value)  # type: ignore[attr-defined]
                else:
                    # Filter by key existence
                    query = query.filter(Workflow.labels.has_key(key))  # type: ignore[attr-defined]

        # Apply cursor-based filtering
        if cursor:
            cursor_data = decode_cursor(cursor)
            cursor_id = UUID(cursor_data["id"])
            # Parse created_at from ISO format string to datetime
            cursor_created_at = datetime.fromisoformat(cursor_data["created_at"])
            direction = cursor_data.get("direction", PaginationDirection.NEXT)

            if direction == PaginationDirection.NEXT:
                # Get items after cursor (created before, since we sort DESC)
                query = query.filter(
                    or_(
                        Workflow.created_at < cursor_created_at,
                        and_(
                            Workflow.created_at == cursor_created_at,
                            Workflow.id < cursor_id,
                        ),
                    )
                )
            else:  # PREV
                # Get items before cursor (created after, since we sort DESC)
                query = query.filter(
                    or_(
                        Workflow.created_at > cursor_created_at,
                        and_(
                            Workflow.created_at == cursor_created_at,
                            Workflow.id > cursor_id,
                        ),
                    )
                )

        # Order by created_at DESC, id DESC for consistent cursor ordering
        query = query.order_by(Workflow.created_at.desc(), Workflow.id.desc())  # type: ignore[attr-defined]

        # Limit results
        query = query.limit(limit)

        # Execute query
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_workflows(
        self,
        *,
        created_by: UUID | None = None,
        is_enabled: bool | None = None,
        labels_filter: dict[str, str] | None = None,
    ) -> int:
        """Count total workflows matching filters.

        Only called when include_total=true to avoid unnecessary computation.

        Args:
            created_by: Filter by creator user ID
            is_enabled: Filter by enabled status
            labels_filter: Filter by labels (key-value pairs)

        Returns:
            Total count of workflows matching filters

        """
        query = select(func.count()).select_from(Workflow).filter(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]

        if created_by:
            query = query.filter(Workflow.created_by == created_by)  # type: ignore[arg-type]

        if is_enabled is not None:
            query = query.filter(Workflow.is_enabled == is_enabled)  # type: ignore[arg-type]

        if labels_filter:
            for key, value in labels_filter.items():
                if value:
                    query = query.filter(Workflow.labels[key].astext == value)  # type: ignore[attr-defined]
                else:
                    query = query.filter(Workflow.labels.has_key(key))  # type: ignore[attr-defined]

        result = await self.session.execute(query)
        return result.scalar() or 0

    async def get_workflow_by_id(self, workflow_id: UUID) -> Workflow:
        """Get a workflow by ID.

        Args:
            workflow_id: Workflow UUID

        Returns:
            Workflow instance

        Raises:
            WorkflowNotFoundError: If workflow not found or deleted

        """
        result = await self.session.execute(
            select(Workflow).filter(
                Workflow.id == workflow_id,  # type: ignore[arg-type]
                Workflow.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        workflow = result.scalar_one_or_none()

        if not workflow:
            raise WorkflowNotFoundError(workflow_id)

        return workflow

    async def get_workflow_with_version(self, workflow_id: UUID) -> tuple[Workflow, WorkflowVersion]:
        """Get a workflow with its current active version.

        Args:
            workflow_id: Workflow UUID

        Returns:
            Tuple of (workflow, current version)

        Raises:
            WorkflowNotFoundError: If workflow not found or deleted
            WorkflowVersionNotFoundError: If current version not found

        """
        # Get workflow
        workflow = await self.get_workflow_by_id(workflow_id)

        # Get current version
        version_result = await self.session.execute(
            select(WorkflowVersion).filter(
                WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
                WorkflowVersion.version == workflow.current_version,  # type: ignore[arg-type]
                WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        current_version = version_result.scalar_one_or_none()

        if not current_version:
            raise WorkflowVersionNotFoundError(workflow_id, workflow.current_version)

        return workflow, current_version

    async def update_workflow_metadata(
        self,
        workflow: Workflow,
        name: str | None = None,
        description: str | None = None,
        labels: dict[str, Any] | None = None,
        *,
        is_enabled: bool | None = None,
        updated_by: UUID | None = None,
    ) -> None:
        """Update workflow metadata fields.

        Args:
            workflow: Workflow to update
            name: New name (optional)
            description: New description (optional)
            labels: New labels (optional)
            is_enabled: New enabled status (optional)
            updated_by: UUID of user making the update

        Raises:
            ValueError: If name is empty string

        Note:
            This method updates the workflow in-place. Caller must commit.

        """
        if name is not None:
            if not name:
                msg = "Workflow name cannot be empty"
                raise ValueError(msg)
            workflow.name = name

        if description is not None:
            workflow.description = description

        if labels is not None:
            workflow.labels = labels

        if is_enabled is not None:
            workflow.is_enabled = is_enabled

        # Always update these fields when any metadata changes
        workflow.updated_at = datetime.now(UTC)
        if updated_by:
            workflow.updated_by = updated_by

    async def create_workflow_version(
        self,
        workflow: Workflow,
        workflow_definition: WorkflowDefinition,
        change_description: str | None,
        created_by: UUID,
    ) -> WorkflowVersion | None:
        """Create new workflow version from workflow_definition.

        Args:
            workflow: Workflow to create version for
            workflow_definition: New workflow definition (will be validated)
            change_description: Description of changes
            created_by: UUID of user creating the version

        Returns:
            New WorkflowVersion if definition changed, None if unchanged

        Raises:
            ValidationError: If workflow definition is invalid

        Note:
            This method compares the new definition with the current version.
            If identical, no new version is created (returns None).

        """
        # Validate workflow definition
        _, schema_version, workflow_dict = WorkflowDefinitionValidator.validate(workflow_definition)

        # Fetch current version to compare definitions
        current_version_result = await self.session.execute(
            select(WorkflowVersion).filter(
                WorkflowVersion.workflow_id == workflow.id,  # type: ignore[arg-type]
                WorkflowVersion.version == workflow.current_version,  # type: ignore[arg-type]
                WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        current_version = current_version_result.scalar_one_or_none()

        # Compare workflow definitions (change detection - dict comparison)
        if current_version and current_version.workflow_definition == workflow_dict:
            # No change detected - skip version creation
            return None

        # Get next version number
        count_result = await self.session.execute(
            select(func.max(WorkflowVersion.version)).filter(
                WorkflowVersion.workflow_id == workflow.id  # type: ignore[arg-type]
            )
        )
        max_version = count_result.scalar()
        next_version = (max_version or 0) + 1

        # Create new version
        new_version = WorkflowVersion(
            id=uuid4(),
            workflow_id=workflow.id,
            version=next_version,
            schema_version=schema_version,
            workflow_definition=workflow_dict,
            change_description=change_description or f"Update to version {next_version}",
            created_by=created_by,
        )

        # Update workflow's current version
        workflow.current_version = next_version
        self.session.add(new_version)

        return new_version

    async def update_workflow(
        self,
        workflow_id: UUID,
        name: str | None = None,
        description: str | None = None,
        labels: dict[str, Any] | None = None,
        *,
        is_enabled: bool | None = None,
        workflow_definition: WorkflowDefinition | None = None,
        change_description: str | None = None,
        updated_by: UUID | None = None,
    ) -> tuple[Workflow, WorkflowVersion]:
        """Update workflow metadata and/or create new version.

        Args:
            workflow_id: UUID of workflow to update
            name: New name (optional)
            description: New description (optional)
            labels: New labels (optional)
            is_enabled: New enabled status (optional)
            workflow_definition: New workflow definition (optional, creates version)
            change_description: Description of changes (for version history)
            updated_by: UUID of user making the update

        Returns:
            Tuple of (updated workflow, current version)

        Raises:
            WorkflowNotFoundError: If workflow not found
            WorkflowNameConflictError: If new name conflicts
            ValidationError: If workflow definition invalid
            ValueError: If name is empty

        """
        # Get workflow
        workflow = await self.get_workflow_by_id(workflow_id)

        # Update metadata fields
        if any([name is not None, description is not None, labels is not None, is_enabled is not None]):
            await self.update_workflow_metadata(
                workflow,
                name=name,
                description=description,
                labels=labels,
                is_enabled=is_enabled,
                updated_by=updated_by,
            )

        # Handle workflow_definition - creates new version
        if workflow_definition is not None:
            await self.create_workflow_version(
                workflow,
                workflow_definition=workflow_definition,
                change_description=change_description,
                created_by=updated_by or workflow.created_by,
            )

        # Commit changes with duplicate name check (use workflow.name since it may have been updated)
        await self._commit_with_duplicate_check(workflow.name)
        await self.session.refresh(workflow)

        # Get current version for return
        _, current_version = await self.get_workflow_with_version(workflow_id)

        return workflow, current_version

    async def delete_workflow(self, workflow_id: UUID, deleted_by: UUID) -> None:
        """Soft delete a workflow.

        Args:
            workflow_id: UUID of workflow to delete
            deleted_by: UUID of user performing the deletion

        Raises:
            WorkflowNotFoundError: If workflow not found

        """
        workflow = await self.get_workflow_by_id(workflow_id)

        # Soft delete
        workflow.soft_delete(deleted_by)
        await self.session.commit()
