"""Tests for ScheduledTriggerService.

Covers:
- Sync scheduled triggers on publish (create, update, stale deletion)
- Delete all triggers for workflow (prefix scan)
- Graceful Temporal unavailability
- Non-scheduled triggers ignored
- Validation errors
"""

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from temporalio.service import RPCError, RPCStatusCode

from nexus.workflows.exceptions import TriggerValidationError
from nexus.workflows.services.scheduled_trigger_service import ScheduledTriggerService


def _make_workflow_definition(
    triggers: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build a minimal workflow definition with trigger nodes."""
    return {
        "schema_version": "2.0.0",
        "name": "test-workflow",
        "triggers": triggers or [],
        "nodes": [],
        "edges": [],
    }


def _make_scheduled_trigger(
    node_id: str = "trigger_1",
    schedule_type: str = "cron",
    cron: str = "0 9 * * *",
    **kwargs: str | None,
) -> dict[str, Any]:
    """Build a scheduled trigger node."""
    config: dict[str, str | None] = {"schedule_type": schedule_type}
    if schedule_type == "cron":
        config["cron"] = cron
    if schedule_type == "interval":
        config["interval"] = kwargs.get("interval", "R/2024-01-01T00:00:00Z/P1D")
    config.update(kwargs)
    return {
        "id": node_id,
        "type": "scheduled_trigger",
        "parameters": config,
    }


async def _empty_async_iter() -> AsyncIterator[Any]:
    """Yield nothing — used as default for list_schedules."""
    return
    yield  # type: ignore[unreachable]


def _make_schedule_list_entry(schedule_id: str) -> MagicMock:
    """Create a mock schedule list entry with a given ID."""
    entry = MagicMock()
    entry.id = schedule_id
    return entry


async def _async_iter_from(items: list[Any]) -> AsyncIterator[Any]:
    """Create an async iterator from a list."""
    for item in items:
        yield item


def _make_mock_client() -> MagicMock:
    """Create a mock Temporal client with schedule handle methods."""
    client = MagicMock()

    # Mock schedule handle
    handle = AsyncMock()
    handle.describe = AsyncMock(side_effect=RPCError("Schedule not found", RPCStatusCode.NOT_FOUND, b""))
    handle.delete = AsyncMock()
    handle.update = AsyncMock()

    client.get_schedule_handle = MagicMock(return_value=handle)
    client.create_schedule = AsyncMock()
    client.list_schedules = AsyncMock(return_value=_empty_async_iter())

    return client


class TestSyncScheduledTriggers:
    """Tests for sync_scheduled_triggers method."""

    async def test_sync_creates_new_schedule(self) -> None:
        """Should create a Temporal Schedule for new scheduled trigger nodes."""
        client = _make_mock_client()
        service = ScheduledTriggerService(temporal_client=client)

        definition = _make_workflow_definition(triggers=[_make_scheduled_trigger("trigger_1")])

        count = await service.sync_scheduled_triggers(
            workflow_id="wf-123",
            workflow_definition=definition,
        )

        assert count == 1
        client.create_schedule.assert_called_once()
        # Verify the schedule ID convention
        call_args = client.create_schedule.call_args
        assert call_args[0][0] == "nexus-sched-wf-123-trigger_1"

    async def test_sync_updates_existing_schedule(self) -> None:
        """Should update an existing Temporal Schedule when trigger config changes."""
        client = _make_mock_client()
        # Simulate existing schedule by making create raise ALREADY_EXISTS
        client.create_schedule = AsyncMock(side_effect=RPCError("already exists", RPCStatusCode.ALREADY_EXISTS, b""))
        handle = client.get_schedule_handle.return_value

        service = ScheduledTriggerService(temporal_client=client)

        definition = _make_workflow_definition(triggers=[_make_scheduled_trigger("trigger_1")])

        count = await service.sync_scheduled_triggers(
            workflow_id="wf-123",
            workflow_definition=definition,
        )

        assert count == 1
        client.create_schedule.assert_called_once()
        handle.update.assert_called_once()

    async def ***REMOVED***(self) -> None:
        """Non-scheduled trigger nodes should be ignored."""
        client = _make_mock_client()
        service = ScheduledTriggerService(temporal_client=client)

        definition = _make_workflow_definition(
            triggers=[
                {"id": "trigger_1", "type": "manual_trigger", "parameters": {}},
                {"id": "trigger_2", "type": "webhook_trigger", "parameters": {"webhook_path": "test"}},
            ]
        )

        count = await service.sync_scheduled_triggers(
            workflow_id="wf-123",
            workflow_definition=definition,
        )

        assert count == 0
        client.create_schedule.assert_not_called()

    async def test_sync_multiple_triggers(self) -> None:
        """Should handle multiple scheduled triggers in one workflow."""
        client = _make_mock_client()
        service = ScheduledTriggerService(temporal_client=client)

        definition = _make_workflow_definition(
            triggers=[
                _make_scheduled_trigger("trigger_1", cron="0 9 * * *"),
                _make_scheduled_trigger("trigger_2", cron="0 17 * * *"),
            ]
        )

        count = await service.sync_scheduled_triggers(
            workflow_id="wf-123",
            workflow_definition=definition,
        )

        assert count == 2
        assert client.create_schedule.call_count == 2

    async def test_sync_rejects_invalid_config(self) -> None:
        """Should raise TriggerValidationError for invalid trigger config."""
        client = _make_mock_client()
        service = ScheduledTriggerService(temporal_client=client)

        definition = _make_workflow_definition(
            triggers=[
                {
                    "id": "trigger_1",
                    "type": "scheduled_trigger",
                    "parameters": {"schedule_type": "cron"},  # Missing 'cron' field
                }
            ]
        )

        with pytest.raises(TriggerValidationError):
            await service.sync_scheduled_triggers(
                workflow_id="wf-123",
                workflow_definition=definition,
            )

    async def test_sync_interval_trigger(self) -> None:
        """Should handle interval-type scheduled triggers."""
        client = _make_mock_client()
        service = ScheduledTriggerService(temporal_client=client)

        definition = _make_workflow_definition(
            triggers=[
                _make_scheduled_trigger(
                    "trigger_1",
                    schedule_type="interval",
                    interval="R/2024-01-01T00:00:00Z/P1D",
                )
            ]
        )

        count = await service.sync_scheduled_triggers(
            workflow_id="wf-123",
            workflow_definition=definition,
        )

        assert count == 1
        client.create_schedule.assert_called_once()

    async def test_sync_deletes_removed_triggers(self) -> None:
        """Should delete Temporal Schedules for trigger nodes removed from the definition."""
        client = _make_mock_client()
        # Simulate an existing schedule for a trigger node no longer in the definition
        client.list_schedules = AsyncMock(
            return_value=_async_iter_from(
                [
                    _make_schedule_list_entry("nexus-sched-wf-123-trigger_1"),
                    _make_schedule_list_entry("nexus-sched-wf-123-trigger_old"),
                ]
            )
        )
        handle = client.get_schedule_handle.return_value
        handle.delete = AsyncMock()

        service = ScheduledTriggerService(temporal_client=client)

        # Definition only has trigger_1 — trigger_old was removed
        definition = _make_workflow_definition(triggers=[_make_scheduled_trigger("trigger_1")])

        await service.sync_scheduled_triggers(
            workflow_id="wf-123",
            workflow_definition=definition,
        )

        # Should request handle for the stale schedule and delete it
        client.get_schedule_handle.assert_any_call("nexus-sched-wf-123-trigger_old")
        handle.delete.assert_called_once()

    async def test_sync_skips_trigger_with_missing_id(self) -> None:
        """Trigger node without id should be skipped without error."""
        client = _make_mock_client()
        service = ScheduledTriggerService(temporal_client=client)

        definition = _make_workflow_definition(
            triggers=[
                {"type": "scheduled_trigger", "parameters": {"schedule_type": "cron", "cron": "0 9 * * *"}},
            ]
        )

        count = await service.sync_scheduled_triggers(
            workflow_id="wf-123",
            workflow_definition=definition,
        )

        assert count == 0
        client.create_schedule.assert_not_called()

    async def test_sync_connection_error_invalidates_cache(self) -> None:
        """UNAVAILABLE RPCError should invalidate client cache and re-raise."""
        client = _make_mock_client()
        client.create_schedule = AsyncMock(side_effect=RPCError("unavailable", RPCStatusCode.UNAVAILABLE, b""))

        service = ScheduledTriggerService(temporal_client=client)
        definition = _make_workflow_definition(triggers=[_make_scheduled_trigger("trigger_1")])

        with (
            patch("nexus.workflows.services.scheduled_trigger_service._invalidate_client_cache") as mock_invalidate,
            pytest.raises(RPCError),
        ):
            await service.sync_scheduled_triggers(
                workflow_id="wf-123",
                workflow_definition=definition,
            )

        mock_invalidate.assert_called_once()

    async def test_list_schedules_returns_empty_set(self) -> None:
        """Empty schedule list should return empty set."""
        client = _make_mock_client()
        client.list_schedules = AsyncMock(return_value=_empty_async_iter())

        service = ScheduledTriggerService(temporal_client=client)
        result = await service._list_workflow_schedules(client, "wf-123")

        assert result == set()


class TestDeleteTriggersForWorkflow:
    """Tests for delete_triggers_for_workflow method."""

    async def test_deletes_temporal_schedules(self) -> None:
        """Should delete all Temporal Schedules found by prefix scan."""
        client = _make_mock_client()
        client.list_schedules = AsyncMock(
            return_value=_async_iter_from(
                [
                    _make_schedule_list_entry("nexus-sched-wf-123-trigger_1"),
                    _make_schedule_list_entry("nexus-sched-wf-123-trigger_2"),
                ]
            )
        )
        handle = client.get_schedule_handle.return_value
        handle.delete = AsyncMock()

        service = ScheduledTriggerService(temporal_client=client)

        deleted = await service.delete_triggers_for_workflow(
            workflow_id="wf-123",
        )

        assert deleted == 2
        assert handle.delete.call_count == 2

    async def ***REMOVED***(self) -> None:
        """Should handle case where schedule doesn't exist."""
        client = _make_mock_client()
        client.list_schedules = AsyncMock(
            return_value=_async_iter_from(
                [
                    _make_schedule_list_entry("nexus-sched-wf-123-trigger_1"),
                ]
            )
        )
        handle = client.get_schedule_handle.return_value
        handle.delete = AsyncMock(side_effect=RPCError("Schedule not found", RPCStatusCode.NOT_FOUND, b""))

        service = ScheduledTriggerService(temporal_client=client)

        deleted = await service.delete_triggers_for_workflow(
            workflow_id="wf-123",
        )

        assert deleted == 0


class TestGracefulTemporalUnavailability:
    """Tests for graceful handling of Temporal unavailability."""

    async def test_sync_skips_when_temporal_unavailable(self) -> None:
        """Should skip sync gracefully when Temporal is unavailable."""
        service = ScheduledTriggerService(temporal_client=None)

        with patch.object(service, "_get_client", return_value=None):
            count = await service.sync_scheduled_triggers(
                workflow_id="wf-123",
                workflow_definition=_make_workflow_definition(triggers=[_make_scheduled_trigger("trigger_1")]),
            )

        assert count == 0

    async def test_delete_skips_when_temporal_unavailable(self) -> None:
        """Should skip deletion gracefully when Temporal is unavailable."""
        service = ScheduledTriggerService(temporal_client=None)

        with patch.object(service, "_get_client", return_value=None):
            deleted = await service.delete_triggers_for_workflow(
                workflow_id="wf-123",
            )

        assert deleted == 0
