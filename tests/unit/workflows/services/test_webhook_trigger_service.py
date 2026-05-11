"""Unit tests for WebhookTriggerService.

Tests verify the business logic for webhook trigger management:
path lookup, sync from workflow definitions, and cascade delete.
"""

from typing import Any
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.workflows.exceptions import (
    TriggerValidationError,
    WebhookTriggerNotFoundError,
    WebhookTriggerPathConflictError,
)
from nexus.workflows.models.webhook_trigger import WebhookTrigger, WebhookTriggerRead
from nexus.workflows.services.webhook_trigger_service import WebhookTriggerService

# ============================================================================
# Helpers
# ============================================================================


def _make_trigger(
    *,
    trigger_node_id: str = "trigger-1",
    webhook_path: str = "test-hook",
    workflow_id: UUID | None = None,
) -> WebhookTrigger:
    """Create a WebhookTrigger instance with sensible defaults."""
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    return WebhookTrigger(
        id=uuid4(),
        webhook_path=webhook_path,
        workflow_id=workflow_id or uuid4(),
        trigger_node_id=trigger_node_id,
        input_schema=None,
        is_enabled=True,
        created_at=now,
        updated_at=now,
    )


def _make_service(
    session: AsyncSession | None = None,
    user: User | None = None,
) -> WebhookTriggerService:
    """Create a WebhookTriggerService with mock session and user."""
    if session is None:
        session = AsyncMock(spec=AsyncSession)
    if user is None:
        user = Mock(spec=User)
        user.id = uuid4()
    return WebhookTriggerService(session=session, user=user)


def _make_workflow_definition(triggers: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Build a minimal workflow definition with optional trigger nodes."""
    return {
        "triggers": triggers or [],
        "activities": [],
    }


# ============================================================================
# Init
# ============================================================================


class TestWebhookTriggerServiceInit:
    """Test WebhookTriggerService initialization."""

    def test_init_with_session_and_user(self) -> None:
        """Test initialization stores session and user."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)
        service = WebhookTriggerService(session=mock_session, user=mock_user)

        assert service.session is mock_session
        assert service.user is mock_user


# ============================================================================
# get_by_webhook_path
# ============================================================================


class TestGetByWebhookPath:
    """Test suite for get_by_webhook_path."""

    @pytest.mark.asyncio
    async def test_returns_trigger_when_found(self) -> None:
        """Test that an enabled trigger is returned for a matching path."""
        mock_session = AsyncMock(spec=AsyncSession)
        trigger = _make_trigger(webhook_path="github-events")

        mock_result = Mock()
        mock_result.one_or_none.return_value = trigger
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)
        result = await service.get_by_webhook_path("github-events")

        assert result is trigger
        mock_session.exec.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_raises_not_found_when_missing(self) -> None:
        """Test that WebhookTriggerNotFoundError is raised when no trigger matches."""
        mock_session = AsyncMock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.one_or_none.return_value = None
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)

        with pytest.raises(WebhookTriggerNotFoundError):
            await service.get_by_webhook_path("nonexistent")

    @pytest.mark.asyncio
    async def test_not_found_error_contains_path(self) -> None:
        """Test that the error contains the webhook path."""
        mock_session = AsyncMock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.one_or_none.return_value = None
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)

        with pytest.raises(WebhookTriggerNotFoundError) as exc_info:
            await service.get_by_webhook_path("my-missing-hook")

        assert exc_info.value.webhook_path == "my-missing-hook"

    @pytest.mark.asyncio
    async def test_raises_not_found_when_workflow_disabled(self) -> None:
        """Trigger for a disabled workflow should return not-found.

        The query joins on the Workflow table and filters on
        Workflow.is_enabled, so a trigger whose parent workflow is
        disabled will not be returned.
        """
        mock_session = AsyncMock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.one_or_none.return_value = None  # join excludes disabled workflow
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)

        with pytest.raises(WebhookTriggerNotFoundError):
            await service.get_by_webhook_path("disabled-workflow-hook")

    @pytest.mark.asyncio
    async def test_raises_not_found_when_workflow_deleted(self) -> None:
        """Trigger for a soft-deleted workflow should return not-found.

        The query joins on the Workflow table and filters on
        Workflow.deleted_at IS NULL, so a trigger whose parent workflow
        is soft-deleted will not be returned.
        """
        mock_session = AsyncMock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.one_or_none.return_value = None  # join excludes deleted workflow
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)

        with pytest.raises(WebhookTriggerNotFoundError):
            await service.get_by_webhook_path("deleted-workflow-hook")


# ============================================================================
# sync_webhook_triggers
# ============================================================================


class TestSyncWebhookTriggers:
    """Test suite for sync_webhook_triggers."""

    @pytest.mark.asyncio
    async def test_creates_new_trigger(self) -> None:
        """Test that a new trigger is created for a webhook node not in the DB."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []  # No existing triggers
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()

        service = _make_service(session=mock_session)

        workflow_id = uuid4()
        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "new-hook"},
                }
            ]
        )

        results = await service.sync_webhook_triggers(workflow_id, definition)

        assert len(results) == 1
        assert isinstance(results[0], WebhookTriggerRead)
        assert results[0].webhook_path == "new-hook"
        mock_session.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_updates_existing_trigger(self) -> None:
        """Test that an existing trigger is updated when the node still exists."""
        existing = _make_trigger(
            trigger_node_id="trigger-1",
            webhook_path="old-path",
        )

        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = [existing]
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "new-path"},
                }
            ]
        )

        results = await service.sync_webhook_triggers(existing.workflow_id, definition)

        assert len(results) == 1
        assert results[0].webhook_path == "new-path"

    @pytest.mark.asyncio
    async def test_deletes_removed_trigger(self) -> None:
        """Test that triggers whose nodes were removed are deleted."""
        existing = _make_trigger(trigger_node_id="old-trigger")

        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = [existing]
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.delete = AsyncMock()
        mock_session.flush = AsyncMock()

        service = _make_service(session=mock_session)

        # Definition with no triggers — old-trigger should be deleted
        definition = _make_workflow_definition(triggers=[])

        results = await service.sync_webhook_triggers(existing.workflow_id, definition)

        assert len(results) == 0
        mock_session.delete.assert_awaited_once_with(existing)

    @pytest.mark.asyncio
    async def test_path_conflict_extracts_conflicting_path(self) -> None:
        """Test that the actual conflicting path is extracted from PostgreSQL DETAIL."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock(
            side_effect=IntegrityError(
                "INSERT",
                {},
                Exception(
                    'duplicate key value violates unique constraint "ix_webhook_triggers_webhook_path_unique"\n'
                    "DETAIL:  Key (webhook_path)=(duplicate-path) already exists."
                ),
            )
        )
        mock_session.rollback = AsyncMock()

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "duplicate-path"},
                },
                {
                    "id": "trigger-2",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "innocent-path"},
                },
            ]
        )

        with pytest.raises(WebhookTriggerPathConflictError) as exc_info:
            await service.sync_webhook_triggers(uuid4(), definition)

        # Only the conflicting path is reported, not all paths
        assert exc_info.value.webhook_path == "duplicate-path"
        mock_session.rollback.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_path_conflict_fallback_when_detail_unparseable(self) -> None:
        """Test that fallback to '<unknown>' is used when DETAIL cannot be parsed."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock(
            side_effect=IntegrityError(
                "INSERT",
                {},
                Exception("ix_webhook_triggers_webhook_path_unique"),
            )
        )
        mock_session.rollback = AsyncMock()

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "some-path"},
                }
            ]
        )

        with pytest.raises(WebhookTriggerPathConflictError) as exc_info:
            await service.sync_webhook_triggers(uuid4(), definition)

        assert exc_info.value.webhook_path == "<unknown>"
        mock_session.rollback.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_non_webhook_triggers_ignored(self) -> None:
        """Test that non-webhook trigger nodes are ignored."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "manual_trigger",
                    "config": {},
                },
                {
                    "id": "trigger-2",
                    "type": "schedule_trigger",
                    "config": {},
                },
            ]
        )

        results = await service.sync_webhook_triggers(uuid4(), definition)

        assert len(results) == 0
        mock_session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_definition(self) -> None:
        """Test sync with a definition that has no triggers at all."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()

        service = _make_service(session=mock_session)

        definition: dict[str, Any] = {"activities": []}

        results = await service.sync_webhook_triggers(uuid4(), definition)

        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_non_path_integrity_error_reraises(self) -> None:
        """Test that IntegrityError not related to webhook_path is re-raised as-is."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock(
            side_effect=IntegrityError(
                "INSERT",
                {},
                Exception("some_other_constraint"),
            )
        )
        mock_session.rollback = AsyncMock()

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "test"},
                }
            ]
        )

        with pytest.raises(IntegrityError):
            await service.sync_webhook_triggers(uuid4(), definition)

    @pytest.mark.asyncio
    async def test_create_and_update_mixed(self) -> None:
        """Test sync with both new and existing trigger nodes."""
        existing = _make_trigger(
            trigger_node_id="trigger-1",
            webhook_path="existing-path",
        )

        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = [existing]
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "updated-path"},
                },
                {
                    "id": "trigger-2",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "brand-new"},
                },
            ]
        )

        results = await service.sync_webhook_triggers(existing.workflow_id, definition)

        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_input_schema_stored_on_create(self) -> None:
        """Test that input_schema from the config is stored on the new trigger."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()

        service = _make_service(session=mock_session)

        schema = {"type": "object", "required": ["event"]}
        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "with-schema", "input_schema": schema},
                }
            ]
        )

        results = await service.sync_webhook_triggers(uuid4(), definition)

        assert len(results) == 1
        assert results[0].input_schema == schema

    @pytest.mark.asyncio
    async def test_missing_webhook_path_raises_validation_error(self) -> None:
        """Test that a trigger config with no webhook_path raises TriggerValidationError."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {},
                }
            ]
        )

        with pytest.raises(TriggerValidationError, match="trigger-1"):
            await service.sync_webhook_triggers(uuid4(), definition)

        mock_session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_webhook_path_raises_validation_error(self) -> None:
        """Test that a trigger config with empty webhook_path raises TriggerValidationError."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": ""},
                }
            ]
        )

        with pytest.raises(TriggerValidationError, match="trigger-1"):
            await service.sync_webhook_triggers(uuid4(), definition)

        mock_session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_invalid_webhook_path_pattern_raises_validation_error(self) -> None:
        """Test that a trigger config with invalid path pattern raises TriggerValidationError."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {"webhook_path": "-invalid-path-"},
                }
            ]
        )

        with pytest.raises(TriggerValidationError, match="trigger-1"):
            await service.sync_webhook_triggers(uuid4(), definition)

        mock_session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_schema_with_ref_raises_validation_error(self) -> None:
        """Test that a schema containing $ref is rejected at definition time."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {
                        "webhook_path": "test-hook",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "data": {"$ref": "http://internal/schema"},
                            },
                        },
                    },
                }
            ]
        )

        with pytest.raises(TriggerValidationError, match="trigger-1"):
            await service.sync_webhook_triggers(uuid4(), definition)

        mock_session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_schema_with_dangerous_pattern_raises_validation_error(self) -> None:
        """Test that a schema with a ReDoS pattern is rejected at definition time."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger-1",
                    "type": "webhook_trigger",
                    "config": {
                        "webhook_path": "test-hook",
                        "input_schema": {
                            "type": "object",
                            "properties": {
                                "data": {"type": "string", "pattern": "(a+)+$"},
                            },
                        },
                    },
                }
            ]
        )

        with pytest.raises(TriggerValidationError, match="trigger-1"):
            await service.sync_webhook_triggers(uuid4(), definition)

        mock_session.add.assert_not_called()


# ============================================================================
# delete_triggers_for_workflow
# ============================================================================


class TestDeleteTriggersForWorkflow:
    """Test suite for delete_triggers_for_workflow."""

    @pytest.mark.asyncio
    async def test_deletes_existing_triggers(self) -> None:
        """Test deletion of all triggers for a workflow."""
        workflow_id = uuid4()
        triggers = [
            _make_trigger(workflow_id=workflow_id, trigger_node_id="t1"),
            _make_trigger(workflow_id=workflow_id, trigger_node_id="t2"),
        ]

        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = triggers
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.delete = AsyncMock()
        mock_session.flush = AsyncMock()

        service = _make_service(session=mock_session)
        count = await service.delete_triggers_for_workflow(workflow_id)

        assert count == 2
        assert mock_session.delete.await_count == 2
        mock_session.flush.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_triggers(self) -> None:
        """Test that zero is returned when no triggers exist for the workflow."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = _make_service(session=mock_session)
        count = await service.delete_triggers_for_workflow(uuid4())

        assert count == 0
        mock_session.delete.assert_not_called()
        mock_session.flush.assert_not_called()
