"""Unit tests for agentic activity file_ids handling.

Tests for AAP-60786 - Agentic Activity file_ids Integration.

These tests verify:
- file_ids are extracted from config correctly
- file_ids are passed to Agent Orchestrator as a dedicated parameter
- file_ids validation (max count, format, etc.)
"""

import uuid
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from nexus.core.constants import CONTEXT_KEY
from nexus.workflows.workflow_engine.activities.agentic_activity import (
    AgenticActivityError,
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
    # New async pattern returns invocation_id immediately
    mock_instance.invoke_agent_async = AsyncMock(return_value="inv_test_123")
    mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
    mock_instance.__aexit__ = AsyncMock(return_value=None)
    return mock_instance


class TestAgenticActivityFileIds:
    """Test suite for file_ids handling in execute_agentic_activity."""

    @pytest.mark.asyncio
    async def test_file_ids_extracted_from_config(self, mock_agent_client: AsyncMock) -> None:
        """Test that file_ids are correctly extracted from config and passed as parameter."""
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

            # Verify invoke_agent_async was called
            mock_agent_client.invoke_agent_async.assert_called_once()

            # Verify file_ids were passed as a parameter, NOT in input_data
            call_kwargs = mock_agent_client.invoke_agent_async.call_args.kwargs
            assert "file_ids" in call_kwargs
            assert call_kwargs["file_ids"] == file_ids
            # Ensure file_ids is NOT in input_data
            assert "file_ids" not in call_kwargs.get("input_data", {})

    @pytest.mark.asyncio
    async def test_file_ids_empty_not_added_to_input_data(self, mock_agent_client: AsyncMock) -> None:
        """Test that when no file_ids specified, empty list is passed as parameter."""
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

            # Verify file_ids was passed as empty list parameter
            call_kwargs = mock_agent_client.invoke_agent_async.call_args.kwargs
            assert "file_ids" in call_kwargs
            assert call_kwargs["file_ids"] == []

            # Original input_data should be preserved without file_ids
            input_data = call_kwargs["input_data"]
            assert input_data.get("original_key") == "original_value"
            assert "file_ids" not in input_data

    @pytest.mark.asyncio
    async def test_file_ids_merged_with_existing_input_data(self, mock_agent_client: AsyncMock) -> None:
        """Test that file_ids are passed as separate parameter, not merged with input_data."""
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

            # Verify file_ids passed as separate parameter
            call_kwargs = mock_agent_client.invoke_agent_async.call_args.kwargs
            assert "file_ids" in call_kwargs
            assert call_kwargs["file_ids"] == file_ids

            # Verify input_data contains only original data, NOT file_ids
            input_data = call_kwargs["input_data"]
            assert input_data["user_query"] == "What's in these files?"
            assert input_data["context"] == {"key": "value"}
            assert "file_ids" not in input_data

    @pytest.mark.asyncio
    async def test_file_ids_max_count_accepted(self, mock_agent_client: AsyncMock) -> None:
        """Test that maximum 10 file_ids are accepted and passed correctly as parameter."""
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

            call_kwargs = mock_agent_client.invoke_agent_async.call_args.kwargs
            assert "file_ids" in call_kwargs
            assert len(call_kwargs["file_ids"]) == 10

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
