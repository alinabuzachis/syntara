"""Unit tests for agentic activity file_ids handling and heartbeat functionality.

Tests for AAP-60786 - Agentic Activity file_ids Integration.

These tests verify:
- file_ids are extracted from config correctly
- file_ids are passed to Agent Orchestrator via input_data
- Heartbeat loop functionality for long-running LLM calls
- Heartbeat task lifecycle (start/stop/cancel)
"""

import asyncio
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.core.constants import CONTEXT_KEY
from nexus.workflows.workflow_engine.activities.agentic_activity import (
    HEARTBEAT_INTERVAL_SECONDS,
    AgenticActivityError,
    _heartbeat_loop,
    execute_agentic_activity,
)


def generate_valid_uuid() -> str:
    """Generate a valid UUID string."""
    return str(uuid.uuid4())


def generate_valid_uuids(count: int) -> list[str]:
    """Generate a list of valid UUID strings."""
    return [generate_valid_uuid() for _ in range(count)]


def create_mock_response(**kwargs: object) -> dict[str, Any]:
    """Create a standard mock response from Agent Orchestrator."""
    return {
        "id": "inv_test_123",
        "status": "completed",
        "result": {"answer": "Test response"},
        "error_message": None,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:01Z",
        "started_at": "2026-01-01T00:00:00Z",
        "completed_at": "2026-01-01T00:00:01Z",
        "prompt": kwargs.get("prompt", "Test prompt"),
        "session_id": "test-session",
        "created_by": "test-user",
        "updated_by": None,
        CONTEXT_KEY: {},
        "checkpoint_data": None,
        "labels": {},
    }


@pytest.fixture
def mock_agent_client() -> AsyncMock:
    """Create a mock Agent Orchestrator client."""
    mock_instance = AsyncMock()
    mock_instance.invoke_agent = AsyncMock(side_effect=create_mock_response)
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=None)
    return mock_instance


class TestAgenticActivityFileIds:
    """Test suite for file_ids handling in execute_agentic_activity."""

    @pytest.mark.asyncio
    async def test_file_ids_extracted_from_config(self, mock_agent_client: AsyncMock) -> None:
        """Test that file_ids are correctly extracted from config."""
        file_ids = generate_valid_uuids(3)
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Analyze these files",
                "fileIds": file_ids,
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = mock_agent_client

            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={},
            )

            # Verify invoke_agent was called
            mock_agent_client.invoke_agent.assert_called_once()

            # Verify file_ids were included in input_data
            call_kwargs = mock_agent_client.invoke_agent.call_args.kwargs
            assert "input_data" in call_kwargs
            assert "file_ids" in call_kwargs["input_data"]
            assert call_kwargs["input_data"]["file_ids"] == file_ids

    @pytest.mark.asyncio
    async def test_file_ids_empty_not_added_to_input_data(self, mock_agent_client: AsyncMock) -> None:
        """Test that empty file_ids list doesn't add file_ids to input_data."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Process without files",
                # No fileIds specified
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = mock_agent_client

            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={"original_key": "original_value"},
            )

            # Verify input_data was passed without file_ids
            call_kwargs = mock_agent_client.invoke_agent.call_args.kwargs
            input_data = call_kwargs["input_data"]

            # Original data should be preserved
            assert input_data.get("original_key") == "original_value"
            # file_ids should not be present when empty
            assert "file_ids" not in input_data

    @pytest.mark.asyncio
    async def test_file_ids_merged_with_existing_input_data(self, mock_agent_client: AsyncMock) -> None:
        """Test that file_ids are merged with existing input_data."""
        file_ids = generate_valid_uuids(2)
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Process with context",
                "fileIds": file_ids,
            },
        }
        original_input = {
            "user_query": "What's in these files?",
            "context": {"key": "value"},
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = mock_agent_client

            await execute_agentic_activity(
                activity_config=activity_config,
                input_data=original_input,
            )

            # Verify input_data contains both original data and file_ids
            call_kwargs = mock_agent_client.invoke_agent.call_args.kwargs
            input_data = call_kwargs["input_data"]

            assert input_data["user_query"] == "What's in these files?"
            assert input_data["context"] == {"key": "value"}
            assert input_data["file_ids"] == file_ids

    @pytest.mark.asyncio
    async def test_file_ids_max_count_accepted(self, mock_agent_client: AsyncMock) -> None:
        """Test that maximum 10 file_ids are accepted and passed correctly."""
        file_ids = generate_valid_uuids(10)
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Process all 10 files",
                "fileIds": file_ids,
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = mock_agent_client

            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={},
            )

            call_kwargs = mock_agent_client.invoke_agent.call_args.kwargs
            assert len(call_kwargs["input_data"]["file_ids"]) == 10

    @pytest.mark.asyncio
    async def test_file_ids_invalid_rejected_during_config_extraction(self) -> None:
        """Test that invalid file_ids are rejected during config extraction."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test",
                "fileIds": ["not-a-valid-uuid"],
            },
        }

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={},
            )

        assert "Invalid file_id format" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_file_ids_too_many_rejected(self) -> None:
        """Test that more than 10 file_ids are rejected."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test",
                "fileIds": generate_valid_uuids(11),
            },
        }

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={},
            )

        # Should fail with validation error about max length
        assert "validation" in str(exc_info.value).lower() or "at most 10" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_file_count_logged(self, mock_agent_client: AsyncMock) -> None:
        """Test that file count is logged for observability."""
        file_ids = generate_valid_uuids(5)
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test",
                "fileIds": file_ids,
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = mock_agent_client

            with patch("nexus.workflows.workflow_engine.activities.agentic_activity.logger") as mock_logger:
                await execute_agentic_activity(
                    activity_config=activity_config,
                    input_data={},
                )

                # Verify logging includes file_count in the format string and args
                # The logger.info call format: logger.info("..file_count=%d..", ..., len(file_ids))
                info_calls = mock_logger.info.call_args_list
                found_file_count_log = False
                for call in info_calls:
                    args = call[0]  # Positional arguments
                    # Check if file_count is in format string and 5 is in the arguments
                    if len(args) >= 1 and "file_count" in str(args[0]) and 5 in args:
                        found_file_count_log = True
                        break
                assert found_file_count_log, f"Expected file_count=5 in log calls: {info_calls}"


class TestHeartbeatLoop:
    """Test suite for heartbeat loop functionality."""

    @pytest.mark.asyncio
    async def test_heartbeat_interval_constant(self) -> None:
        """Test that heartbeat interval is set to 30 seconds."""
        assert pytest.approx(30.0) == HEARTBEAT_INTERVAL_SECONDS

    @pytest.mark.asyncio
    async def test_heartbeat_loop_sends_heartbeat(self) -> None:
        """Test that heartbeat loop sends activity heartbeats."""
        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.activity") as mock_activity:
            # Run heartbeat loop for a short time
            task = asyncio.create_task(_heartbeat_loop(interval_seconds=0.01))

            # Wait for a few heartbeats
            await asyncio.sleep(0.05)

            # Cancel the task and wait for it to complete
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

            # Verify heartbeats were sent
            assert mock_activity.heartbeat.call_count >= 1

    @pytest.mark.asyncio
    async def test_heartbeat_loop_continues_on_failure(self) -> None:
        """Test that heartbeat loop continues even if heartbeat fails."""
        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.activity") as mock_activity:
            # Make heartbeat raise an exception
            mock_activity.heartbeat.side_effect = RuntimeError("Heartbeat failed")

            # Run heartbeat loop for a short time
            task = asyncio.create_task(_heartbeat_loop(interval_seconds=0.01))

            # Wait for a few iterations
            await asyncio.sleep(0.05)

            # Cancel the task and wait for it to complete
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

            # Verify heartbeats were attempted multiple times despite failures
            assert mock_activity.heartbeat.call_count >= 2

    @pytest.mark.asyncio
    async def test_heartbeat_loop_can_be_cancelled(self) -> None:
        """Test that heartbeat loop can be cleanly cancelled."""
        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.activity"):
            task = asyncio.create_task(_heartbeat_loop(interval_seconds=1.0))

            # Immediately cancel
            task.cancel()

            # Should raise CancelledError
            with pytest.raises(asyncio.CancelledError):
                await task


class TestHeartbeatIntegrationWithActivity:
    """Test heartbeat integration with execute_agentic_activity."""

    @pytest.mark.asyncio
    async def test_heartbeat_not_started_outside_temporal_context(self, mock_agent_client: AsyncMock) -> None:
        """Test that heartbeat is not started outside Temporal context."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test",
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = mock_agent_client

            with patch("nexus.workflows.workflow_engine.activities.agentic_activity.activity") as mock_activity:
                # Simulate not being in Temporal context
                mock_activity.info.side_effect = RuntimeError("Not in activity context")

                await execute_agentic_activity(
                    activity_config=activity_config,
                    input_data={},
                )

                # Heartbeat should not have been called
                mock_activity.heartbeat.assert_not_called()

    @pytest.mark.asyncio
    async def test_heartbeat_started_in_temporal_context(self, mock_agent_client: AsyncMock) -> None:
        """Test that heartbeat is started when in Temporal context.

        This test verifies that when running in a Temporal activity context,
        a heartbeat task is created and properly managed.
        """
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test",
            },
        }

        create_task_called = False
        task_cancelled = False

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = mock_agent_client

            with patch("nexus.workflows.workflow_engine.activities.agentic_activity.activity") as mock_activity:
                # Simulate being in Temporal context
                mock_info = MagicMock()
                mock_info.workflow_id = "test-workflow-id"
                mock_activity.info.return_value = mock_info

                original_create_task = asyncio.create_task

                def tracking_create_task(coro: Any) -> asyncio.Task[Any]:  # noqa: ANN401
                    nonlocal create_task_called
                    create_task_called = True
                    # Create a real task
                    task = original_create_task(coro)

                    # Wrap cancel to track it
                    original_cancel = task.cancel

                    def tracking_cancel(*args: Any, **kwargs: Any) -> bool:  # noqa: ANN401
                        nonlocal task_cancelled
                        task_cancelled = True
                        return original_cancel(*args, **kwargs)

                    task.cancel = tracking_cancel  # type: ignore[method-assign]
                    return task

                with patch("asyncio.create_task", side_effect=tracking_create_task):
                    await execute_agentic_activity(
                        activity_config=activity_config,
                        input_data={},
                    )

                # Verify heartbeat task was created and cancelled
                assert create_task_called, "Heartbeat task should be created in Temporal context"
                assert task_cancelled, "Heartbeat task should be cancelled after completion"

    @pytest.mark.asyncio
    async def test_heartbeat_task_created_and_cancelled(self, mock_agent_client: AsyncMock) -> None:
        """Test that heartbeat task is created in Temporal context and cancelled after completion."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test",
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = mock_agent_client

            with patch("nexus.workflows.workflow_engine.activities.agentic_activity.activity") as mock_activity:
                mock_info = MagicMock()
                mock_info.workflow_id = "test-workflow-id"
                mock_activity.info.return_value = mock_info

                # Track asyncio.create_task calls
                created_tasks: list[asyncio.Task[None]] = []
                original_create_task = asyncio.create_task

                def tracking_create_task(coro: Any) -> asyncio.Task[Any]:  # noqa: ANN401
                    task = original_create_task(coro)
                    created_tasks.append(task)
                    return task

                with patch("asyncio.create_task", side_effect=tracking_create_task):
                    await execute_agentic_activity(
                        activity_config=activity_config,
                        input_data={},
                    )

                # Verify a task was created (the heartbeat task)
                assert len(created_tasks) >= 1, "Expected at least one task to be created"

                # Verify all created tasks are cancelled or done
                for task in created_tasks:
                    assert task.done() or task.cancelled(), "Heartbeat task should be cancelled"

    @pytest.mark.asyncio
    async def test_heartbeat_cancelled_on_error(self, mock_agent_client: AsyncMock) -> None:
        """Test that heartbeat is cancelled even when activity fails."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test",
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = mock_agent_client

            # Make invoke_agent fail
            mock_agent_client.invoke_agent.side_effect = RuntimeError("Agent failed")

            with patch("nexus.workflows.workflow_engine.activities.agentic_activity.activity") as mock_activity:
                mock_info = MagicMock()
                mock_info.workflow_id = "test-workflow-id"
                mock_activity.info.return_value = mock_info

                # Track asyncio.create_task calls
                created_tasks: list[asyncio.Task[None]] = []
                original_create_task = asyncio.create_task

                def tracking_create_task(coro: Any) -> asyncio.Task[Any]:  # noqa: ANN401
                    task = original_create_task(coro)
                    created_tasks.append(task)
                    return task

                with (
                    patch("asyncio.create_task", side_effect=tracking_create_task),
                    pytest.raises(AgenticActivityError),
                ):
                    await execute_agentic_activity(
                        activity_config=activity_config,
                        input_data={},
                    )

                # Verify heartbeat task was still cancelled even on error
                assert len(created_tasks) >= 1, "Expected at least one task to be created"
                for task in created_tasks:
                    assert task.done() or task.cancelled(), "Heartbeat task should be cancelled on error"
