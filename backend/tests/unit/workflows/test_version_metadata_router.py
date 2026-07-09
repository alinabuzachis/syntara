"""Unit tests for the update_workflow_version_metadata router endpoint."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.workflows.exceptions import WorkflowNotFoundError, WorkflowVersionNotFoundError
from nexus.workflows.models.workflow_version import WorkflowVersionUpdate
from nexus.workflows.router import update_workflow_version_metadata


@pytest.fixture
def mock_service() -> AsyncMock:
    return AsyncMock()


def _make_serialized_version(wf_id: str, **overrides: object) -> dict[str, object]:
    now = datetime.now(UTC).isoformat()
    base = {
        "id": str(uuid4()),
        "workflow_id": wf_id,
        "version": 1,
        "status": "draft",
        "schema_version": "2.0.0",
        "workflow_definition": {"schema_version": "2.0.0", "name": "test"},
        "publish_name": None,
        "change_description": None,
        "created_at": now,
        "updated_at": now,
        "created_by": str(uuid4()),
        "created_by_username": None,
        "deleted_at": None,
        "deleted_by": None,
    }
    base.update(overrides)
    return base


class TestUpdateWorkflowVersionMetadata:
    """Test the PATCH /workflows/{id}/versions/{version} endpoint."""

    @pytest.mark.asyncio
    async def test_calls_service_with_correct_args(self, mock_service: AsyncMock) -> None:
        wf_id = uuid4()
        mock_service.update_version_metadata.return_value = MagicMock()
        request = WorkflowVersionUpdate(publish_name="New Name", change_description="New Desc")

        with patch(
            "nexus.workflows.router.deserialize_workflow_version",
            return_value=_make_serialized_version(str(wf_id), publish_name="New Name", change_description="New Desc"),
        ):
            await update_workflow_version_metadata(workflow_id=wf_id, version=1, request=request, service=mock_service)

        mock_service.update_version_metadata.assert_called_once_with(
            workflow_id=wf_id,
            version=1,
            publish_name="New Name",
            change_description="New Desc",
            fields_set={"publish_name", "change_description"},
        )

    @pytest.mark.asyncio
    async def test_passes_fields_set_for_partial_update(self, mock_service: AsyncMock) -> None:
        wf_id = uuid4()
        mock_service.update_version_metadata.return_value = MagicMock()
        request = WorkflowVersionUpdate.model_validate({"publish_name": "Only Name"})

        with patch(
            "nexus.workflows.router.deserialize_workflow_version",
            return_value=_make_serialized_version(str(wf_id), publish_name="Only Name"),
        ):
            await update_workflow_version_metadata(workflow_id=wf_id, version=1, request=request, service=mock_service)

        call_kwargs = mock_service.update_version_metadata.call_args.kwargs
        assert call_kwargs["fields_set"] == {"publish_name"}

    @pytest.mark.asyncio
    async def test_empty_body_passes_empty_fields_set(self, mock_service: AsyncMock) -> None:
        wf_id = uuid4()
        mock_service.update_version_metadata.return_value = MagicMock()
        request = WorkflowVersionUpdate()

        with patch(
            "nexus.workflows.router.deserialize_workflow_version",
            return_value=_make_serialized_version(str(wf_id)),
        ):
            await update_workflow_version_metadata(workflow_id=wf_id, version=1, request=request, service=mock_service)

        call_kwargs = mock_service.update_version_metadata.call_args.kwargs
        assert call_kwargs["fields_set"] == set()

    @pytest.mark.asyncio
    async def test_workflow_not_found_propagates(self, mock_service: AsyncMock) -> None:
        wf_id = uuid4()
        mock_service.update_version_metadata.side_effect = WorkflowNotFoundError(wf_id)
        request = WorkflowVersionUpdate(publish_name="x")

        with pytest.raises(WorkflowNotFoundError):
            await update_workflow_version_metadata(workflow_id=wf_id, version=1, request=request, service=mock_service)

    @pytest.mark.asyncio
    async def test_version_not_found_propagates(self, mock_service: AsyncMock) -> None:
        wf_id = uuid4()
        mock_service.update_version_metadata.side_effect = WorkflowVersionNotFoundError(wf_id, 99)
        request = WorkflowVersionUpdate(publish_name="x")

        with pytest.raises(WorkflowVersionNotFoundError):
            await update_workflow_version_metadata(workflow_id=wf_id, version=99, request=request, service=mock_service)
