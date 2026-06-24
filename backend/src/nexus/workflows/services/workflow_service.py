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
from temporalio.service import RPCError

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.authz.engine import AllowedProjectsResult
from nexus.authz.models import Project
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin
from nexus.credentials.models.credential import Credential
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.types import ComponentLabel, MetricType
from nexus.workflows.audit.workflow_lifecycle import WorkflowAction, WorkflowLifecycleEvent
from nexus.workflows.audit.workflow_version import (
    WorkflowVersionCreatedEvent,
    WorkflowVersionPublishedEvent,
    WorkflowVersionRestoredEvent,
    WorkflowVersionUnpublishedEvent,
)
from nexus.workflows.exceptions import (
    BuiltinWorkflowDeleteError,
    BuiltinWorkflowModifyError,
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowNotPublishedError,
    WorkflowVersionNotFoundError,
)
from nexus.workflows.models import Workflow, WorkflowListResponse, WorkflowRead, WorkflowVersion
from nexus.workflows.models.workflow_definition import WorkflowDefinition
from nexus.workflows.models.workflow_version import WorkflowVersionStatus
from nexus.workflows.services.scheduled_trigger_service import ScheduledTriggerService
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
    def _emit_lifecycle_event(
        *,
        workflow_id: UUID,
        workflow_name: str,
        action: WorkflowAction,
        version: int | None = None,
        project_id: UUID | None = None,
        error_type: str | None = None,
        new_version_created: bool = False,
    ) -> None:
        AuditEventDispatcher.dispatch(
            WorkflowLifecycleEvent(
                workflow_id=workflow_id,
                workflow_name=workflow_name,
                action=action,
                version=version,
                project_id=project_id,
                error_type=error_type,
            )
        )
        if new_version_created and version is not None:
            AuditEventDispatcher.dispatch(
                WorkflowVersionCreatedEvent(
                    workflow_id=workflow_id,
                    workflow_name=workflow_name,
                    version=version,
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

    async def _get_version_or_none(self, workflow_id: UUID, version: int) -> WorkflowVersion | None:
        """Fetch a single workflow version by workflow ID and version number."""
        result = await self.session.exec(
            select(WorkflowVersion).filter(
                WorkflowVersion.workflow_id == workflow_id,  # type: ignore[arg-type]
                WorkflowVersion.version == version,  # type: ignore[arg-type]
                WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        return result.one_or_none()

    async def _create_version_record(
        self,
        workflow: Workflow,
        workflow_definition: dict[str, Any],
        change_description: str | None,
    ) -> WorkflowVersion | None:
        """Create a new version record without validation.

        Includes change detection — skips creation if the definition
        matches the current version. Callers are responsible for
        validation.
        """
        current_version = await self._get_version_or_none(workflow.id, workflow.current_version)

        if current_version:
            try:
                stored_normalized = WorkflowDefinition.model_validate(current_version.workflow_definition).model_dump(
                    exclude_defaults=True
                )
            except Exception:  # noqa: BLE001
                stored_normalized = current_version.workflow_definition
            if stored_normalized == workflow_definition:
                return None

        count_result = await self.session.exec(
            select(func.max(WorkflowVersion.version)).filter(
                WorkflowVersion.workflow_id == workflow.id  # type: ignore[arg-type]
            )
        )
        max_version = count_result.one()
        next_version = (max_version or 0) + 1

        schema_version = workflow_definition.get("schema_version")
        new_version = WorkflowVersion(
            id=uuid4(),
            workflow_id=workflow.id,
            version=next_version,
            schema_version=schema_version,
            workflow_definition=workflow_definition,
            change_description=change_description or f"Version {next_version}",
            created_by=self.user.id,
        )

        workflow.current_version = next_version
        self.session.add(new_version)
        return new_version

    @staticmethod
    async def _sync_scheduled_triggers(
        workflow_id: UUID,
        workflow_definition: dict[str, Any],
    ) -> None:
        """Create/update Temporal Schedules for scheduled trigger nodes.

        Only called on publish.  Unpublish and delete use
        ``ScheduledTriggerService.delete_triggers_for_workflow`` instead.
        """
        scheduled_service = ScheduledTriggerService()
        await scheduled_service.sync_scheduled_triggers(
            workflow_id=str(workflow_id),
            workflow_definition=workflow_definition,
        )

    async def _validate_credential_project_scope(self, workflow_definition: dict[str, Any], project_id: UUID) -> None:
        """Reject credential references that belong to a different project.

        Raises:
            SafeValueError: If any credential_id in the workflow definition does
                not belong to the specified project.

        """
        credential_ids: set[str] = set()
        for node in workflow_definition.get("nodes", []):
            cred_id = node.get("parameters", {}).get("credential_id")
            if cred_id:
                credential_ids.add(cred_id)

        if not credential_ids:
            return

        stmt = select(Credential.id, Credential.project_id).where(
            Credential.id.in_(credential_ids),  # type: ignore[attr-defined]
        )
        result = await self.session.exec(stmt)
        rows = result.all()

        found_ids = {str(row[0]) for row in rows}
        missing = credential_ids - found_ids
        wrong_project = any(row[1] != project_id for row in rows)

        if missing or wrong_project:
            msg = "One or more credential references are invalid or belong to a different project."
            raise SafeValueError(msg)

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

            project = await self.session.get(Project, project_id)
            if project and project.is_builtin:
                from nexus.authz.exceptions import BuiltinProtectionError  # noqa: PLC0415

                msg = f"Cannot create workflows in built-in project '{project.name}'"
                raise BuiltinProtectionError(msg)

            await self._validate_credential_project_scope(workflow_definition, project_id)

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
        except Exception as exc:
            self._emit_lifecycle_event(
                workflow_id=workflow.id,
                workflow_name=workflow.name,
                action=WorkflowAction.CREATED,
                project_id=workflow.project_id,
                error_type=type(exc).__name__,
            )
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

        self._emit_lifecycle_event(
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            action=WorkflowAction.CREATED,
            version=version.version,
            project_id=workflow.project_id,
            new_version_created=True,
        )

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

    async def _get_webhook_sync_definition(
        self, workflow_id: UUID, workflow: Workflow, fallback_definition: dict[str, Any]
    ) -> dict[str, Any]:
        """Determine the workflow definition to sync to webhook triggers."""
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
                return published_ver.workflow_definition
            logger.warning(
                "Published version record not found",
                workflow_id=workflow_id,
                version=workflow.published_version,
            )
        return fallback_definition

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

        Validates the definition before creating the version. For restoring
        previously-validated definitions, use ``_create_version_record`` directly.

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

        if workflow.project_id is not None:
            await self._validate_credential_project_scope(workflow_definition, workflow.project_id)

        return await self._create_version_record(workflow, workflow_definition, change_description)

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

        if workflow.is_builtin:
            raise BuiltinWorkflowModifyError(workflow.name)

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

        # Get current version for return
        _, current_version = await self.get_workflow_with_version(workflow_id)

        sync_definition = await self._get_webhook_sync_definition(
            workflow_id, workflow, current_version.workflow_definition
        )

        webhook_service = WebhookTriggerService(self.session, self.user)
        await self._sync_all_trigger_types(
            webhook_service,
            workflow.id,
            sync_definition,
            is_enabled=workflow.is_enabled,
        )

        # Single atomic commit (workflow metadata + version + triggers)
        try:
            await self.session.commit()
        except Exception as exc:
            self._emit_lifecycle_event(
                workflow_id=workflow.id,
                workflow_name=workflow.name,
                action=WorkflowAction.UPDATED,
                project_id=workflow.project_id,
                error_type=type(exc).__name__,
            )
            raise

        self._emit_lifecycle_event(
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            action=WorkflowAction.UPDATED,
            version=new_version.version if new_version else current_version.version,
            project_id=workflow.project_id,
            new_version_created=new_version is not None,
        )

        return workflow, current_version

    async def publish_workflow_version(
        self,
        workflow_id: UUID,
        version: int,
        publish_name: str | None = None,
        change_description: str | None = None,
        workflow_definition: dict[str, Any] | None = None,
    ) -> tuple[Workflow, WorkflowVersion]:
        """Publish a workflow version by creating a new published copy.

        Always creates a new version record, preserving an immutable audit
        trail. When ``workflow_definition`` is provided, the published copy
        uses that definition directly (allowing save + publish in one call
        without an intermediate draft).
        """
        workflow = await self._get_workflow_for_update(workflow_id)

        if workflow.is_builtin:
            raise BuiltinWorkflowModifyError(workflow.name)

        target_version = await self._get_version_or_none(workflow_id, version)
        if not target_version:
            raise WorkflowVersionNotFoundError(workflow_id, version)

        if workflow.published_version is not None:
            await self._demote_published_version(workflow_id, workflow.published_version, "publish")
            await self.session.flush()

        definition = workflow_definition or target_version.workflow_definition
        if workflow_definition:
            workflow_validator.validate_workflow_definition(workflow_definition)

        count_result = await self.session.exec(
            select(func.max(WorkflowVersion.version)).filter(
                WorkflowVersion.workflow_id == workflow.id  # type: ignore[arg-type]
            )
        )
        max_version = count_result.one()
        next_version = (max_version or 0) + 1

        is_publishing_previous_version = version != workflow.current_version
        full_description: str | None = change_description
        if is_publishing_previous_version:
            date_iso = target_version.created_at.isoformat() if target_version.created_at else None
            source_label = target_version.publish_name or date_iso or f"version {version}"
            source_info = f"Published from {source_label}"
            full_description = f"{source_info}\n{change_description}" if change_description else source_info
        result_version = WorkflowVersion(
            id=uuid4(),
            workflow_id=workflow.id,
            version=next_version,
            schema_version=definition.get("schema_version"),
            workflow_definition=definition,
            change_description=full_description,
            status=WorkflowVersionStatus.PUBLISHED,
            created_by=self.user.id,
            created_at=datetime.now(UTC),
        )
        if publish_name is not None:
            result_version.publish_name = publish_name
        self.session.add(result_version)
        workflow.current_version = next_version

        workflow.published_version = result_version.version
        workflow.is_enabled = True
        workflow.updated_at = datetime.now(UTC)
        workflow.updated_by = self.user.id

        webhook_service = WebhookTriggerService(self.session, self.user)
        await self._sync_all_trigger_types(
            webhook_service,
            workflow.id,
            result_version.workflow_definition,
            is_enabled=True,
        )

        try:
            await self.session.commit()
        except Exception as exc:
            AuditEventDispatcher.dispatch(
                WorkflowVersionPublishedEvent(
                    workflow_id=workflow.id,
                    version=result_version.version,
                    workflow_name=workflow.name,
                    project_id=workflow.project_id,
                    error_type=type(exc).__name__,
                )
            )
            raise

        await self._sync_scheduled_triggers(
            workflow.id,
            result_version.workflow_definition,
        )

        AuditEventDispatcher.dispatch(
            WorkflowVersionPublishedEvent(
                workflow_id=workflow.id,
                version=result_version.version,
                workflow_name=workflow.name,
                project_id=workflow.project_id,
            )
        )

        return workflow, result_version

    async def unpublish_workflow(self, workflow_id: UUID) -> Workflow:
        """Unpublish the currently published version."""
        workflow = await self._get_workflow_for_update(workflow_id)

        if workflow.is_builtin:
            raise BuiltinWorkflowModifyError(workflow.name)

        if workflow.published_version is None:
            raise WorkflowNotPublishedError(workflow_id)

        version_number = workflow.published_version
        published_version = await self._demote_published_version(workflow_id, version_number, "unpublish")

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

        try:
            await self.session.commit()
        except Exception as exc:
            AuditEventDispatcher.dispatch(
                WorkflowVersionUnpublishedEvent(
                    workflow_id=workflow.id,
                    version=version_number,
                    workflow_name=workflow.name,
                    project_id=workflow.project_id,
                    error_type=type(exc).__name__,
                )
            )
            raise

        AuditEventDispatcher.dispatch(
            WorkflowVersionUnpublishedEvent(
                workflow_id=workflow.id,
                version=version_number,
                workflow_name=workflow.name,
                project_id=workflow.project_id,
            )
        )

        # Delete scheduled triggers (best-effort — launcher will fail with
        # WorkflowNotPublishedError if schedules keep firing)
        try:
            scheduled_service = ScheduledTriggerService()
            await scheduled_service.delete_triggers_for_workflow(
                workflow_id=str(workflow.id),
            )
        except (OSError, RuntimeError, RPCError):
            logger.warning("Failed to delete scheduled triggers", workflow_id=str(workflow.id), exc_info=True)

        return workflow

    async def restore_workflow_version(
        self,
        workflow_id: UUID,
        version: int,
    ) -> tuple[Workflow, WorkflowVersion]:
        """Restore a previous workflow version as a new draft.

        Copies the target version's workflow_definition into a new draft version,
        which becomes the latest version.

        Design decisions (see hakbailey review on PR #1063):

        - **No trigger sync**: Restore only creates a draft — it does not change
          the published version. Trigger sync resolves to the published version's
          definition (unaffected by restore) or disables triggers when unpublished.
          Syncing here would be a no-op that adds data-loss risk, since
          ``WebhookTriggerService.sync_webhook_triggers`` calls ``session.rollback()``
          on ``IntegrityError``, which could discard the uncommitted restore.

        - **No re-validation**: The restored definition was validated when originally
          saved. Skipping validation ensures old versions remain restorable even if
          validation rules tighten — restore is a data-recovery operation that should
          not be gated on current-time constraints.

        Args:
            workflow_id: UUID of the workflow
            version: Version number to restore

        Returns:
            Tuple of (workflow, restored version)

        Raises:
            WorkflowNotFoundError: If workflow not found
            WorkflowVersionNotFoundError: If target version not found

        """
        workflow = await self._get_workflow_for_update(workflow_id)

        if workflow.is_builtin:
            raise BuiltinWorkflowModifyError(workflow.name)

        target_version = await self._get_version_or_none(workflow_id, version)
        if not target_version:
            raise WorkflowVersionNotFoundError(workflow_id, version)

        date_iso = target_version.created_at.isoformat() if target_version.created_at else None
        source_label = target_version.publish_name or date_iso or f"version {version}"
        new_version = await self._create_version_record(
            workflow,
            workflow_definition=target_version.workflow_definition,
            change_description=f"Restored from {source_label}",
        )

        if not new_version:
            _, current_version = await self.get_workflow_with_version(workflow_id)
            return workflow, current_version

        workflow.updated_at = datetime.now(UTC)
        workflow.updated_by = self.user.id

        try:
            await self.session.commit()
        except Exception as exc:
            AuditEventDispatcher.dispatch(
                WorkflowVersionRestoredEvent(
                    workflow_id=workflow.id,
                    restored_from_version=version,
                    new_version=new_version.version,
                    workflow_name=workflow.name,
                    project_id=workflow.project_id,
                    error_type=type(exc).__name__,
                )
            )
            raise

        await self.session.refresh(workflow)
        await self.session.refresh(new_version)

        # Intentional dual emission: "created" tracks total versions, "restored" tracks rollbacks
        self._emit_lifecycle_event(
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            action=WorkflowAction.RESTORED,
            version=new_version.version,
            project_id=workflow.project_id,
            new_version_created=True,
        )
        AuditEventDispatcher.dispatch(
            WorkflowVersionRestoredEvent(
                workflow_id=workflow.id,
                restored_from_version=version,
                new_version=new_version.version,
                workflow_name=workflow.name,
                project_id=workflow.project_id,
            )
        )
        return workflow, new_version

    async def delete_workflow(self, workflow_id: UUID) -> None:
        """Soft delete a workflow.

        Args:
            workflow_id: UUID of workflow to delete

        Raises:
            WorkflowNotFoundError: If workflow not found

        """
        workflow = await self.get_workflow_by_id(workflow_id)

        if workflow.is_builtin:
            raise BuiltinWorkflowDeleteError(workflow.name)

        # Delete associated webhook triggers before soft-deleting the workflow
        webhook_service = WebhookTriggerService(self.session, self.user)
        await webhook_service.delete_triggers_for_workflow(workflow_id)

        # Soft delete
        workflow.soft_delete(self.user.id)
        try:
            await self.session.commit()
        except Exception as exc:
            self._emit_lifecycle_event(
                workflow_id=workflow.id,
                workflow_name=workflow.name,
                action=WorkflowAction.DELETED,
                project_id=workflow.project_id,
                error_type=type(exc).__name__,
            )
            raise

        self._emit_lifecycle_event(
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            action=WorkflowAction.DELETED,
            project_id=workflow.project_id,
        )

        # Delete scheduled triggers (Temporal Schedules, outside DB transaction).
        # If this fails, schedules are orphaned — the launcher will fail with
        # WorkflowNotPublishedError on each fire but the schedule won't stop.
        try:
            scheduled_service = ScheduledTriggerService()
            await scheduled_service.delete_triggers_for_workflow(
                workflow_id=str(workflow_id),
            )
        except (OSError, RuntimeError, RPCError):
            logger.warning(
                "Failed to delete scheduled triggers for deleted workflow — "
                "orphaned Temporal Schedules may continue firing",
                workflow_id=str(workflow_id),
                exc_info=True,
            )
