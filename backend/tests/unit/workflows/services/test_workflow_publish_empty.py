"""Unit tests for publish_workflow_version empty-nodes validation."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.workflows.exceptions import WorkflowPublishValidationError
from nexus.workflows.services.workflow_service import WorkflowService


@pytest.fixture
def mock_service() -> WorkflowService:
    """Create a WorkflowService with mocked dependencies."""
    session = AsyncMock()
    user = MagicMock()
    user.id = uuid4()
    service = WorkflowService.__new__(WorkflowService)
    service.session = session
    service.user = user
    return service


class TestPublishEmptyWorkflow:
    """Publish rejects workflows with no steps."""

    @pytest.mark.asyncio
    async def test_publish_rejects_empty_nodes(self, mock_service: WorkflowService) -> None:
        workflow_id = uuid4()
        mock_workflow = MagicMock()
        mock_workflow.id = workflow_id
        mock_workflow.is_builtin = False

        mock_version = MagicMock()
        mock_version.version = 1
        mock_version.workflow_definition = {
            "schema_version": "2.0.0",
            "name": "empty",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [],
            "edges": [],
        }

        with (
            patch.object(mock_service, "_get_workflow_for_update", return_value=mock_workflow),
            patch.object(mock_service, "_get_version_or_none", return_value=mock_version),
            pytest.raises(WorkflowPublishValidationError) as exc_info,
        ):
            await mock_service.publish_workflow_version(workflow_id, version=1)

        assert any("at least one step" in f.message for f in exc_info.value.validation_result.findings)

    @pytest.mark.asyncio
    async def test_publish_allows_workflow_with_nodes(self, mock_service: WorkflowService) -> None:
        workflow_id = uuid4()
        mock_workflow = MagicMock()
        mock_workflow.id = workflow_id
        mock_workflow.is_builtin = False
        mock_workflow.published_version = None
        mock_workflow.current_version = 1
        mock_workflow.name = "test-wf"
        mock_workflow.project_id = uuid4()

        mock_version = MagicMock()
        mock_version.version = 1
        mock_version.workflow_definition = {
            "schema_version": "2.0.0",
            "name": "with-nodes",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [{"id": "n1", "type": "script", "parameters": {"language": "python", "code": "pass"}}],
            "edges": [{"from": "t1", "to": "n1"}],
        }
        mock_version.created_at = None

        mock_result = MagicMock()
        mock_result.one.return_value = 1

        with (
            patch.object(mock_service, "_get_workflow_for_update", return_value=mock_workflow),
            patch.object(mock_service, "_get_version_or_none", return_value=mock_version),
            patch.object(mock_service, "_sync_all_trigger_types", new_callable=AsyncMock),
            patch.object(mock_service, "_sync_scheduled_triggers", new_callable=AsyncMock),
            patch.object(mock_service.session, "exec", new_callable=AsyncMock, return_value=mock_result),
            patch.object(mock_service.session, "commit", new_callable=AsyncMock),
            patch("nexus.workflows.services.workflow_service.AuditEventDispatcher"),
            patch("nexus.workflows.services.workflow_service.WebhookTriggerService"),
        ):
            workflow, _version = await mock_service.publish_workflow_version(workflow_id, version=1)

        assert workflow == mock_workflow
