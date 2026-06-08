"""Temporal workflow for audit data export."""

from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from nexus.audit.export.activity import execute_audit_export
    from nexus.audit.export.models import AuditExportInput, AuditExportResult

EXPORT_TIMEOUT = timedelta(minutes=30)


@workflow.defn(name="audit_export_workflow")
class AuditExportWorkflow:
    """Orchestrates a single audit data export job."""

    @workflow.run
    async def run(self, params: AuditExportInput) -> AuditExportResult:
        """Execute the audit export activity."""
        return await workflow.execute_activity(
            execute_audit_export,
            params,
            start_to_close_timeout=EXPORT_TIMEOUT,
        )
