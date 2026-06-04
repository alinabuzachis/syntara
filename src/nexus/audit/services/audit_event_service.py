"""Audit event service for read-only queries.

Read operations are served by :meth:`BaseService.list_resources` using the
:class:`AuditEventConvertMixin` for ``AuditEventRecord`` → ``AuditEventRead``
conversion.  Write operations are handled by the transactional outbox pattern
(:mod:`nexus.audit.outbox`).
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import structlog
from temporalio.client import Client, WorkflowExecutionDescription, WorkflowHandle
from temporalio.service import RPCError, RPCStatusCode

from nexus.audit.exceptions import AuditExportNotFoundError, AuditExportNotReadyError
from nexus.audit.export.models import AuditExportCreate, AuditExportInput, AuditExportRead, ExportStatus
from nexus.audit.export.workflow import AuditExportWorkflow
from nexus.audit.models.schemas import AuditEventRead
from nexus.core.config.base import get_settings
from nexus.core.exceptions import SafeValueError
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.audit.models.audit_event_record import AuditEventRecord
    from nexus.core.models import User

logger = structlog.stdlib.get_logger(__name__)

_TERMINAL_FAILURE_STATUSES: frozenset[str] = frozenset({"timed_out", "cancelled", "terminated"})


async def _get_temporal_client() -> Client:
    """Create a Temporal client for export workflow operations."""
    settings = get_settings()
    return await Client.connect(
        settings.temporal_address,
        namespace=settings.temporal_namespace,
    )


class AuditEventConvertMixin(ConvertResourceMixin):
    """Convert AuditEventRecord to AuditEventRead response format."""

    def convert_resource(self, resource: AuditEventRecord) -> AuditEventRead:  # type: ignore[override]
        """Convert an AuditEventRecord to an AuditEventRead response."""
        return AuditEventRead.model_validate(resource)


class AuditEventService(BaseService):
    """Read-only service for audit event queries.

    Methods inherited from ``BaseService`` (notably ``list_resources``)
    handle request-scoped read operations.  Write operations are handled by
    the transactional outbox pattern (:mod:`nexus.audit.outbox`).
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with an audit database session."""
        super().__init__(session, user, convert_resource_mixin=AuditEventConvertMixin())

    async def start_export(self, request: AuditExportCreate) -> AuditExportRead:
        """Start an asynchronous audit event export job.

        Args:
            request: Export parameters including filters and format.

        Returns:
            Export response with job ID and initial status.

        """
        settings = get_settings()
        export_id = uuid4()
        temporal_workflow_id = f"audit-export-{export_id}"

        client = await _get_temporal_client()

        export_input = AuditExportInput(
            export_id=str(export_id),
            created_at_gte=request.created_at_gte.isoformat() if request.created_at_gte else None,
            created_at_lte=request.created_at_lte.isoformat() if request.created_at_lte else None,
            event_category=request.event_category,
            event_severity=request.event_severity,
            event_status=request.event_status,
            event_action=request.event_action,
            actor_id=str(request.actor_id) if request.actor_id else None,
            actor_type=request.actor_type,
            source_component=request.source_component,
            workflow_id=str(request.workflow_id) if request.workflow_id else None,
            activity_id=request.activity_id,
            execution_id=str(request.execution_id) if request.execution_id else None,
            export_format=request.export_format,
        )

        await client.start_workflow(
            AuditExportWorkflow.run,
            args=[export_input],
            id=temporal_workflow_id,
            task_queue=settings.audit_export_task_queue,
        )

        logger.info("Audit export started", export_id=str(export_id), user_id=str(self.user.id))

        return AuditExportRead(
            id=export_id,
            status=ExportStatus.PENDING,
        )

    async def get_export_status(self, export_id: UUID) -> AuditExportRead:
        """Check the status of an audit export job.

        Args:
            export_id: The export job identifier.

        Returns:
            Export response with current status and metadata.

        """
        temporal_workflow_id = f"audit-export-{export_id}"
        client = await _get_temporal_client()
        handle: WorkflowHandle[Any, Any] = client.get_workflow_handle(temporal_workflow_id)

        try:
            description: WorkflowExecutionDescription = await handle.describe()
        except RPCError as e:
            if e.status == RPCStatusCode.NOT_FOUND:
                raise AuditExportNotFoundError(str(export_id)) from e
            raise

        status_name = (description.status.name if description.status else "unknown").lower()

        if status_name == "completed":
            result = await handle.result()
            if result.get("status") == "failed":
                return AuditExportRead(
                    id=export_id,
                    status=ExportStatus.FAILED,
                    error=result.get("error"),
                )
            return AuditExportRead(
                id=export_id,
                status=ExportStatus.COMPLETED,
                file_name=f"audit-export-{export_id}.csv",
                row_count=result.get("row_count"),
            )

        if status_name == "failed":
            return AuditExportRead(
                id=export_id,
                status=ExportStatus.FAILED,
                error="Export workflow failed",
            )

        if status_name in _TERMINAL_FAILURE_STATUSES:
            return AuditExportRead(
                id=export_id,
                status=ExportStatus.FAILED,
                error=f"Export job ended with status: {status_name}",
            )

        return AuditExportRead(
            id=export_id,
            status=ExportStatus.RUNNING,
        )

    async def get_export_file_path(self, export_id: UUID) -> Path:
        """Get the file path for a completed export.

        The activity writes to a ``<name>.csv.tmp`` file and performs an atomic
        rename to ``<name>.csv`` only after all rows are flushed.  File existence
        therefore implies the export completed successfully.

        When the file is absent, the method consults Temporal to surface a
        precise error:

        - Still running → :exc:`AuditExportNotReadyError` (409 Conflict)
        - Failed / not found → :exc:`AuditExportNotFoundError` (404 Not Found)

        Args:
            export_id: The export job identifier.

        Returns:
            Path to the export CSV file.

        Raises:
            AuditExportNotReadyError: If the export is still in progress.
            AuditExportNotFoundError: If the export does not exist or failed.

        """
        settings = get_settings()
        export_dir = Path(settings.audit_export_dir).resolve()
        file_name = f"audit-export-{export_id}.csv"
        file_path = (export_dir / file_name).resolve()

        # Ensure the resolved path is within the export directory
        if not file_path.is_relative_to(export_dir):
            msg = "Invalid export_id: path traversal detected"
            raise SafeValueError(msg)

        # Happy path: file exists → export is complete (atomic rename guarantees this).
        if file_path.is_file():
            return file_path

        # File absent — ask Temporal why so we can return a useful status code.
        export_status = await self.get_export_status(export_id)
        if export_status.status == ExportStatus.RUNNING:
            raise AuditExportNotReadyError(str(export_id))

        # FAILED, NOT_FOUND, or any other terminal state → 404.
        raise AuditExportNotFoundError(str(export_id))
