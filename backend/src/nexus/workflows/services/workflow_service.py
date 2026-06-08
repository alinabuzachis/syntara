"""Workflow service layer for business logic.

This service encapsulates workflow-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

import threading
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import structlog
from sqlalchemy.exc import IntegrityError
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.authz.engine import AllowedProjectsResult
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.types import ComponentLabel, MetricType
from nexus.workflows.audit.workflow_version import WorkflowVersionCreatedEvent
from nexus.workflows.exceptions import (
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowNotPublishedError,
    WorkflowVersionNotFoundError,
)
from nexus.workflows.models import Workflow, WorkflowListResponse, WorkflowRead, WorkflowVersion
from nexus.workflows.models.workflow_version import WorkflowVersionStatus
from nexus.workflows.services.webhook_trigger_service import WEBHOOK_TRIGGER_TYPES, WebhookTriggerService
from nexus.workflows.validators import workflow_validator

logger = structlog.stdlib.get_logger(__name__)

# Running counters for workflow creation success rate (FR-010).
_workflow_creation_counts: list[int] = [0, 0]  # [successes, total]

# Thread lock to protect counter from race conditions during concurrent access
_workflow_creation_lock = threading.Lock()


def reset_workflow_creation_counters() -> None:
    """Clear the workflow creation counters (testing helper)."""
    with _workflow_creation_lock:
        _workflow_creation_counts[:] = [0, 0]


class WorkflowConvertResourceMixin(ConvertResourceMixin):
    """Workflow-specific resource conversion to WorkflowRead format."""

    def convert_resource(self, resource: Workflow) -> WorkflowRead:  # type: ignore[override]
        """Convert Workflow to WorkflowRead format."""
        return WorkflowRead.model_validate(resource)


class WorkflowService(BaseService):
    """Service for workflow business logic.

    This service encapsulates all workflow-related business operations,
    including CRUD operations, validation, and version management.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize WorkflowService with database session and user context."""
        super().__init__(session, user, convert_resource_mixin=WorkflowConvertResourceMixin())

    @staticmethod
    def _emit_version_telemetry(workflow: Workflow, version: WorkflowVersion) -> None:
        AuditEventDispatcher.dispatch(
            WorkflowVersionCreatedEvent(
                workflow_id=workflow.id,
                version=version.version,
            )
        )

    async def _sync_all_trigger_types(
        self,
        webhook_service: WebhookTriggerService,
        workflow_id: UUID,
        workflow_definition: dict[str, Any],
        *,
        is_enabled: bool,
    ) -> None:
        for trigger_type in WEBHOOK_TRIGGER_TYPES:
            await webhook_service.sync_webhook_triggers(
                workflow_id=workflow_id,
                workflow_definition=workflow_definition,
                is_enabled=is_enabled,
                trigger_type=trigger_type,
            )

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

    async def _flush_with_duplicate_check(self, workflow_name: str) -> None:
        """Flush pending changes with duplicate name error handling.

        Flushes (but does not commit) so the caller can batch additional
        changes into the same transaction before a single atomic commit.

        Args:
            workflow_name: Name of workflow being created/updated

        Raises:
            WorkflowNameConflictError: If duplicate name constraint violated
            IntegrityError: For other integrity constraint violations

        """
        try:
            await self.session.flush()
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
        workflow_definition: dict[str, Any],
        project_id: UUID | None = None,
    ) -> tuple[Workflow, WorkflowVersion]:
        """Create a new V2 workflow with initial version.

        Args:
            name: Workflow name (must be unique)
            description: Optional workflow description
            labels: Optional key-value labels
            workflow_definition: V2 workflow definition as dict (triggers + nodes + edges)
            project_id: Optional project to assign workflow to

        Returns:
            Tuple of (created workflow, initial version)

        Raises:
            SafeValueError: If workflow definition is invalid (missing required fields)
            WorkflowNameConflictError: If workflow name already exists

        """
        recorder = get_metrics_recorder()
        component = ComponentLabel.WORKFLOW_ENGINE

        with recorder.time(
            MetricType.WORKFLOW_VALIDATION_DURATION,
            labels={"component": component.value, "operation": "create"},
        ):
            workflow_validator.validate_workflow_definition(workflow_definition)

        if project_id is not None:
            from nexus.core.queries.project_queries import assert_project_alive  # noqa: PLC0415

            await assert_project_alive(self.session, project_id)

        schema_version = workflow_definition.get("schema_version")
        workflow_dict = workflow_definition

        # Create workflow
        workflow = Workflow(
            id=uuid4(),
            name=name,
            description=description,
            labels=labels,
            current_version=1,
            created_by=self.user.id,
            is_enabled=False,
            project_id=project_id,
        )

        # Create initial version
        version = WorkflowVersion(
            id=uuid4(),
            workflow_id=workflow.id,
            version=1,
            schema_version=schema_version,
            workflow_definition=workflow_dict,
            created_by=self.user.id,
            change_description="Initial version",
        )

        self.session.add(workflow)
        self.session.add(version)

        # Flush + sync + commit as a single atomic transaction so that a
        # webhook-path conflict rolls back the workflow too.
        try:
            # Flush workflow + version (validates name uniqueness)
            await self._flush_with_duplicate_check(name)
            await self.session.refresh(workflow)
            await self.session.refresh(version)

            # Sync webhook triggers within the same transaction
            webhook_service = WebhookTriggerService(self.session, self.user)
            await self._sync_all_trigger_types(
                webhook_service,
                workflow.id,
                workflow_dict,
                is_enabled=False,
            )

            # Single atomic commit
            await self.session.commit()
        except Exception:
            with _workflow_creation_lock:
                _workflow_creation_counts[1] += 1
                rate = _workflow_creation_counts[0] / _workflow_creation_counts[1]
            recorder.record(
                MetricType.WORKFLOW_CREATION_SUCCESS_RATE,
                rate,
                component=component,
            )
            raise

        # Record success only after the full transaction commits
        with _workflow_creation_lock:
            _workflow_creation_counts[0] += 1
            _workflow_creation_counts[1] += 1
            rate = _workflow_creation_counts[0] / _workflow_creation_counts[1]
        recorder.record(
            MetricType.WORKFLOW_CREATION_SUCCESS_RATE,
            rate,
            component=component,
        )

        self._emit_version_telemetry(workflow, version)

        return workflow, version

    async def list_workflows_cursor(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
        allowed_projects: AllowedProjectsResult | None = None,
    ) -> "WorkflowListResponse":
        """List workflows with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of workflows to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "name", "-created_at")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response
            allowed_projects: Optional project scope filter for authorization

        Returns:
            WorkflowListResponse with workflows, pagination metadata, and optional total

        """
        # Use unified list_resources method with overridden methods
        return await self.list_resources(
            model=Workflow,
            response_type=WorkflowListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",  # Default DESC sort if none provided
            query_params_items=query_params_items,
            include_total=include_total,
            allowed_projects=allowed_projects,
        )

    async def _get_workflow_for_update(self, workflow_id: UUID) -> Workflow:
        """Get a workflow by ID with SELECT FOR UPDATE to prevent concurrent modifications."""
        result = await self.session.exec(
            select(Workflow)
            .filter(
                Workflow.id == workflow_id,  # type: ignore[arg-type]
                Workflow.deleted_at.is_(None),  # type: ignore[union-attr]
            )
            .with_for_update()
        )
        workflow = result.one_or_none()

        if not workflow:
            raise WorkflowNotFoundError(workflow_id)

        return workflow

    async def _demote_published_version(
        self, workflow_id: UUID, version: int, operation: str
    ) -> WorkflowVersion | None:
        """Demote a published version to previously_published."""
        result = await self.session.exec(
            select(WorkflowVersion).filter(
                WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
                WorkflowVersion.version == version,  # type: ignore[arg-type]
                WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        prev_version = result.one_or_none()
        if prev_version:
            prev_version.status = WorkflowVersionStatus.PREVIOUSLY_PUBLISHED
        else:
            logger.warning(
                "Published version record not found during %s",
                operation,
                workflow_id=workflow_id,
                version=version,
            )
        return prev_version

    async def get_workflow_by_id(self, workflow_id: UUID) -> Workflow:
        """Get a workflow by ID.

        Args:
            workflow_id: Workflow UUID

        Returns:
            Workflow instance

        Raises:
            WorkflowNotFoundError: If workflow not found or deleted

        """
        result = await self.session.exec(
            select(Workflow).filter(
                Workflow.id == workflow_id,  # type: ignore[arg-type]
                Workflow.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        workflow = result.one_or_none()

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
        version_result = await self.session.exec(
            select(WorkflowVersion).filter(
                WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
                WorkflowVersion.version == workflow.current_version,  # type: ignore[arg-type]
                WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        current_version = version_result.one_or_none()

        if not current_version:
            raise WorkflowVersionNotFoundError(workflow_id, workflow.current_version)

        return workflow, current_version

    async def update_workflow_metadata(
        self,
        workflow: Workflow,
        name: str | None = None,
        description: str | None = None,
        labels: dict[str, Any] | None = None,
    ) -> None:
        """Update workflow metadata fields.

        Args:
            workflow: Workflow to update
            name: New name (optional)
            description: New description (optional)
            labels: New labels (optional)

        Raises:
            ValueError: If name is empty string

        Note:
            This method updates the workflow in-place. Caller must commit.

        """
        if name is not None:
            workflow_validator.validate_workflow_name(name)
            workflow.name = name

        if description is not None:
            workflow.description = description

        if labels is not None:
            workflow.labels = labels

        # Always update these fields when any metadata changes
        workflow.updated_at = datetime.now(UTC)
        workflow.updated_by = self.user.id

    async def create_workflow_version(
        self,
        workflow: Workflow,
        workflow_definition: dict[str, Any],
        change_description: str | None,
    ) -> WorkflowVersion | None:
        """Create new V2 workflow version from workflow_definition.

        Args:
            workflow: Workflow to create version for
            workflow_definition: New V2 workflow definition as dict
            change_description: Description of changes

        Returns:
            New WorkflowVersion if definition changed, None if unchanged

        Raises:
            SafeValueError: If workflow definition is invalid (missing required fields)

        Note:
            This method compares the new definition with the current version.
            If identical, no new version is created (returns None).

        """
        recorder = get_metrics_recorder()

        with recorder.time(
            MetricType.WORKFLOW_VALIDATION_DURATION,
            labels={"component": ComponentLabel.WORKFLOW_ENGINE.value, "operation": "version_update"},
        ):
            workflow_validator.validate_workflow_definition(workflow_definition)

        schema_version = workflow_definition.get("schema_version")
        workflow_dict = workflow_definition

        # Fetch current version to compare definitions
        current_version_result = await self.session.exec(
            select(WorkflowVersion).filter(
                WorkflowVersion.workflow_id == workflow.id,  # type: ignore[arg-type]
                WorkflowVersion.version == workflow.current_version,  # type: ignore[arg-type]
                WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        current_version = current_version_result.one_or_none()

        # Compare workflow definitions (change detection - dict comparison)
        if current_version and current_version.workflow_definition == workflow_dict:
            # No change detected - skip version creation
            return None

        # Get next version number
        count_result = await self.session.exec(
            select(func.max(WorkflowVersion.version)).filter(
                WorkflowVersion.workflow_id == workflow.id  # type: ignore[arg-type]
            )
        )
        max_version = count_result.one()
        next_version = (max_version or 0) + 1

        # Create new version
        new_version = WorkflowVersion(
            id=uuid4(),
            workflow_id=workflow.id,
            version=next_version,
            schema_version=schema_version,
            workflow_definition=workflow_dict,
            change_description=change_description or f"Update to version {next_version}",
            created_by=self.user.id,
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
        workflow_definition: dict[str, Any] | None = None,
        change_description: str | None = None,
    ) -> tuple[Workflow, WorkflowVersion]:
        """Update workflow metadata and/or create new version.

        Args:
            workflow_id: UUID of workflow to update
            name: New name (optional)
            description: New description (optional)
            labels: New labels (optional)
            workflow_definition: New V2 workflow definition as dict (optional, creates version)
            change_description: Description of changes (for version history)

        Returns:
            Tuple of (updated workflow, current version)

        Raises:
            WorkflowNotFoundError: If workflow not found
            SafeValueError: If workflow definition is invalid
            WorkflowNameConflictError: If new name conflicts
            ValidationError: If workflow definition invalid
            ValueError: If name is empty

        """
        workflow = await self._get_workflow_for_update(workflow_id)

        # Update metadata fields
        if any([name is not None, description is not None, labels is not None]):
            await self.update_workflow_metadata(
                workflow,
                name=name,
                description=description,
                labels=labels,
            )

        # Handle workflow_definition - creates new version
        new_version: WorkflowVersion | None = None
        if workflow_definition is not None:
            new_version = await self.create_workflow_version(
                workflow,
                workflow_definition=workflow_definition,
                change_description=change_description,
            )

        # Flush with name uniqueness check (stays within the same transaction)
        await self._flush_with_duplicate_check(workflow.name)
        await self.session.refresh(workflow)

        if new_version:
            await self.session.refresh(new_version)
            self._emit_version_telemetry(workflow, new_version)

        # Get current version for return
        _, current_version = await self.get_workflow_with_version(workflow_id)

        # Sync webhook triggers using the published version's definition (if published),
        # since webhook_router executes the published version, not the current draft.
        if workflow.published_version is not None:
            pub_result = await self.session.exec(
                select(WorkflowVersion).filter(
                    WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
                    WorkflowVersion.version == workflow.published_version,  # type: ignore[arg-type]
                    WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
                )
            )
            published_ver = pub_result.one_or_none()
            if published_ver:
                sync_definition = published_ver.workflow_definition
            else:
                logger.warning(
                    "Published version record not found during update",
                    workflow_id=workflow_id,
                    version=workflow.published_version,
                )
                sync_definition = current_version.workflow_definition
        else:
            sync_definition = current_version.workflow_definition

        webhook_service = WebhookTriggerService(self.session, self.user)
        await self._sync_all_trigger_types(
            webhook_service,
            workflow.id,
            sync_definition,
            is_enabled=workflow.is_enabled,
        )

        # Single atomic commit (workflow metadata + version + triggers)
        await self.session.commit()

        return workflow, current_version

    async def publish_workflow_version(
        self,
        workflow_id: UUID,
        version: int,
        publish_name: str | None = None,
        change_description: str | None = None,
    ) -> tuple[Workflow, WorkflowVersion]:
        """Publish a specific workflow version."""
        workflow = await self._get_workflow_for_update(workflow_id)

        version_result = await self.session.exec(
            select(WorkflowVersion).filter(
                WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
                WorkflowVersion.version == version,  # type: ignore[arg-type]
                WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        target_version = version_result.one_or_none()
        if not target_version:
            raise WorkflowVersionNotFoundError(workflow_id, version)

        if target_version.status == WorkflowVersionStatus.PUBLISHED and workflow.published_version == version:
            if publish_name is not None:
                target_version.publish_name = publish_name
            if change_description is not None:
                target_version.change_description = change_description
            workflow.updated_at = datetime.now(UTC)
            workflow.updated_by = self.user.id
            await self.session.commit()
            return workflow, target_version

        if workflow.published_version is not None:
            await self._demote_published_version(workflow_id, workflow.published_version, "publish")
            await self.session.flush()

        target_version.status = WorkflowVersionStatus.PUBLISHED
        if publish_name is not None:
            target_version.publish_name = publish_name
        if change_description is not None:
            target_version.change_description = change_description

        workflow.published_version = version
        workflow.is_enabled = True
        workflow.updated_at = datetime.now(UTC)
        workflow.updated_by = self.user.id

        webhook_service = WebhookTriggerService(self.session, self.user)
        await self._sync_all_trigger_types(
            webhook_service,
            workflow.id,
            target_version.workflow_definition,
            is_enabled=True,
        )

        await self.session.commit()
        return workflow, target_version

    async def unpublish_workflow(self, workflow_id: UUID) -> Workflow:
        """Unpublish the currently published version."""
        workflow = await self._get_workflow_for_update(workflow_id)

        if workflow.published_version is None:
            raise WorkflowNotPublishedError(workflow_id)

        published_version = await self._demote_published_version(workflow_id, workflow.published_version, "unpublish")

        workflow.published_version = None
        workflow.is_enabled = False
        workflow.updated_at = datetime.now(UTC)
        workflow.updated_by = self.user.id

        webhook_service = WebhookTriggerService(self.session, self.user)
        if published_version:
            await self._sync_all_trigger_types(
                webhook_service,
                workflow.id,
                published_version.workflow_definition,
                is_enabled=False,
            )

        await self.session.commit()
        return workflow

    async def delete_workflow(self, workflow_id: UUID) -> None:
        """Soft delete a workflow.

        Args:
            workflow_id: UUID of workflow to delete

        Raises:
            WorkflowNotFoundError: If workflow not found

        """
        workflow = await self.get_workflow_by_id(workflow_id)

        # Delete associated webhook triggers before soft-deleting the workflow
        webhook_service = WebhookTriggerService(self.session, self.user)
        await webhook_service.delete_triggers_for_workflow(workflow_id)

        # Soft delete
        workflow.soft_delete(self.user.id)
        await self.session.commit()
