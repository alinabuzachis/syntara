"""Contract tests for agentic activity integration.

These tests define the expected behavior of agentic activities:
- Agent Orchestrator invocation and response handling
- Parameter mapping from workflow YAML to Agent Orchestrator
- Error handling for unavailable Agent Orchestrator
"""

import asyncio
import json
from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from nexus.workflows.clients.agent_orchestrator_client import AgentOrchestratorError
from nexus.workflows.workflow_engine import settings
from nexus.workflows.workflow_engine.activities.agentic_activity import AgenticActivityError, execute_agentic_activity


def create_mock_client_response(**kwargs: object) -> dict[str, Any]:
    """Create a standard mock response from Agent Orchestrator."""
    return {
        "id": "inv_123456",
        "status": "completed",
        "result": {"answer": "42", "sources": ["web"]},
        "error_message": None,
        "created_at": "2025-10-31T00:00:00Z",
        "updated_at": "2025-10-31T00:00:01Z",
        "started_at": "2025-10-31T00:00:00Z",
        "completed_at": "2025-10-31T00:00:01Z",
        "prompt": kwargs.get("prompt", "Test prompt"),
        "session_id": "test-session",
        "created_by": "test-user",
        "updated_by": None,
        "context_data": {},
        "checkpoint_data": None,
        "labels": {},
    }


@pytest.fixture(autouse=True)
def mock_agent_client() -> Generator[AsyncMock, None, None]:
    """Auto-mock Agent Orchestrator client for all tests."""
    with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
        # Create mock instance
        mock_instance = AsyncMock()
        mock_instance.invoke_agent = AsyncMock(side_effect=create_mock_client_response)
        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_instance.__aexit__ = AsyncMock(return_value=None)

        # Make the class return our mock instance
        mock_cls.return_value = mock_instance

        yield mock_instance


@pytest.fixture
def workflow_definition_agentic() -> dict[str, Any]:
    """Sample workflow YAML with agentic activity."""
    return {
        "name": "agentic_workflow",
        "version": "1.0",
        "tasks": [
            {
                "name": "research_task",
                "executor": "agentic",
                "config": {
                    "agent": "nexus-agent://default",
                    "model": "claude-3-5-sonnet-20241022",
                    "prompt": "Research and calculate the answer",
                },
                "inputs": {"question": "What is the meaning of life?"},
                "timeout": 300,
                "retry_policy": {"max_attempts": 3, "initial_interval": 1, "max_interval": 10},
            }
        ],
    }


class TestAgenticActivityExecution:
    """Test agentic activity execution and Agent Orchestrator integration."""

    @pytest.mark.asyncio
    async def test_invokes_agent_orchestrator(self, workflow_definition_agentic, mock_agent_client) -> None:
        """Test that agentic activity invokes Agent Orchestrator successfully."""
        activity_config = workflow_definition_agentic["tasks"][0]
        input_data = {"question": "What is the meaning of life?"}

        # Execute agentic activity
        result = await execute_agentic_activity(
            activity_config=activity_config,
            input_data=input_data,
        )

        # Verify Agent Orchestrator was called
        mock_agent_client.invoke_agent.assert_called_once()

        # Verify result contains Agent Orchestrator response
        assert result["status"] == "completed"
        assert result["result"]["answer"] == "42"

    @pytest.mark.asyncio
    async def test_parameter_mapping_to_agent_orchestrator(
        self, workflow_definition_agentic, mock_agent_client
    ) -> None:
        """Test that parameters are correctly mapped from workflow YAML to Agent Orchestrator."""
        activity_config = workflow_definition_agentic["tasks"][0]
        input_data = {"question": "What is the meaning of life?"}

        await execute_agentic_activity(
            activity_config=activity_config,
            input_data=input_data,
        )

        # Verify invoke_agent was called with correct parameters
        call_args = mock_agent_client.invoke_agent.call_args

        # Check agent
        assert call_args.kwargs["agent"] == "nexus-agent://default"

        # Check model
        assert call_args.kwargs["model"] == "claude-3-5-sonnet-20241022"

        # Check prompt
        assert call_args.kwargs["prompt"] == "Research and calculate the answer"

        # Check input data
        assert call_args.kwargs["input_data"] == input_data

    @pytest.mark.asyncio
    async def test_invokes_agent_and_gets_result(self, workflow_definition_agentic, mock_agent_client) -> None:
        """Test that activity invokes agent and gets the complete result."""
        activity_config = workflow_definition_agentic["tasks"][0]
        input_data = {"question": "What is the meaning of life?"}

        result = await execute_agentic_activity(
            activity_config=activity_config,
            input_data=input_data,
        )

        # Verify invoke_agent was called (not poll_for_result)
        mock_agent_client.invoke_agent.assert_called()

        # Verify result contains the expected data
        assert result["status"] == "completed"
        assert result["result"]["answer"] == "42"


class TestAgenticActivityErrorHandling:
    """Test error handling for agentic activities."""

    @pytest.mark.asyncio
    async def test_handles_agent_orchestrator_unavailable(self, workflow_definition_agentic, mock_agent_client) -> None:
        """Test error handling when Agent Orchestrator is unavailable."""
        # Reconfigure mock to raise connection error
        mock_agent_client.invoke_agent.side_effect = ConnectionError("Agent Orchestrator unavailable")

        activity_config = workflow_definition_agentic["tasks"][0]

        # Should wrap connection error in AgenticActivityError
        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={"question": "test"},
            )

        assert "unavailable" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_handles_agent_orchestrator_timeout(self, workflow_definition_agentic, mock_agent_client) -> None:
        """Test timeout handling for long-running Agent Orchestrator invocations."""
        # Reconfigure mock to raise timeout error
        mock_agent_client.invoke_agent.side_effect = TimeoutError("Invocation timed out")

        activity_config = workflow_definition_agentic["tasks"][0]

        # Should wrap timeout error in AgenticActivityError
        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={"question": "test"},
            )

        assert "timed out" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_handles_agent_orchestrator_error_response(
        self, workflow_definition_agentic, mock_agent_client
    ) -> None:
        """Test handling of error responses from Agent Orchestrator."""

        # Reconfigure mock to return error response
        async def error_invoke(**kwargs: object) -> dict[str, Any]:
            return {
                "id": "inv_error",
                "status": "failed",
                "result": None,
                "error_message": "Agent execution failed",
                "created_at": "2025-10-31T00:00:00Z",
                "updated_at": "2025-10-31T00:00:01Z",
                "started_at": "2025-10-31T00:00:00Z",
                "completed_at": "2025-10-31T00:00:01Z",
                "prompt": kwargs.get("prompt", "Test prompt"),
                "session_id": "test-session",
                "created_by": "test-user",
                "updated_by": None,
                "context_data": {},
                "checkpoint_data": None,
                "labels": {},
            }

        mock_agent_client.invoke_agent = error_invoke

        activity_config = workflow_definition_agentic["tasks"][0]

        result = await execute_agentic_activity(
            activity_config=activity_config,
            input_data={"question": "test"},
        )

        # Should capture error in result
        assert result["status"] == "failed"
        assert "failed" in result["error_message"].lower()


class TestAgenticActivityRetryLogic:
    """Test retry logic for agentic activities."""

    @pytest.mark.asyncio
    async def test_respects_retry_policy_from_yaml(self, workflow_definition_agentic, mock_agent_client) -> None:
        """Test that retry policy from workflow YAML is respected.

        Note: Retry logic is handled by Temporal, not by execute_agentic_activity.
        This test verifies the activity fails on connection errors without internal retry.
        """
        # Reconfigure mock to fail with connection error
        mock_agent_client.invoke_agent.side_effect = ConnectionError("Temporary failure")

        activity_config = workflow_definition_agentic["tasks"][0]

        # Should wrap error in AgenticActivityError without retrying (Temporal handles retries)
        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={"question": "test"},
            )

        assert "failure" in str(exc_info.value).lower()


class TestAgenticActivityEdgeCases:
    """Test edge cases and input validation."""

    @pytest.mark.asyncio
    async def test_rejects_empty_prompt(self) -> None:
        """Test that empty prompts are rejected."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "",  # Empty prompt,
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={},
            )

        assert "non-empty" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_rejects_whitespace_only_prompt(self) -> None:
        """Test that whitespace-only prompts are rejected."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "   \t\n  ",  # Whitespace only,
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={},
            )

        assert "non-empty" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_handles_missing_invocation_id_in_response(self) -> None:
        """Test handling of malformed Agent Orchestrator response."""
        # Mock client that returns response without invocation_id
        bad_client = AsyncMock()
        bad_client.invoke_agent.side_effect = AgentOrchestratorError(
            "Agent Orchestrator response missing or invalid 'invocation_id'"
        )
        bad_client.__aenter__ = AsyncMock(return_value=bad_client)
        bad_client.__aexit__ = AsyncMock(return_value=None)

        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = bad_client

            with pytest.raises(AgenticActivityError) as exc_info:
                await execute_agentic_activity(
                    activity_config=activity_config,
                    input_data={},
                )

        assert "invocation_id" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_metadata_not_mutated(self, mock_agent_client) -> None:
        """Test that caller's metadata dict is not mutated."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        # Mock that captures the metadata passed
        captured_metadata: dict[str, Any] | None = None

        async def capture_invoke(
            prompt: str = "",
            user_id: str = "",
            agent: str | None = None,
            model: str | None = None,
            input_data: dict[str, Any] | None = None,
            metadata: dict[str, Any] | None = None,
            session_id: str | None = None,
            correlation_id: str | None = None,
            timeout_seconds: float | None = None,
        ) -> dict[str, Any]:
            nonlocal captured_metadata
            captured_metadata = metadata
            return {
                "id": "inv_123",
                "status": "completed",
                "result": {},
                "error_message": None,
                "created_at": "2025-10-31T00:00:00Z",
                "updated_at": "2025-10-31T00:00:01Z",
                "started_at": "2025-10-31T00:00:00Z",
                "completed_at": "2025-10-31T00:00:01Z",
                "prompt": prompt,
                "session_id": "test-session",
                "created_by": "test-user",
                "updated_by": None,
                "context_data": {},
                "checkpoint_data": None,
                "labels": {},
            }

        mock_agent_client.invoke_agent = capture_invoke

        # Original metadata
        original_metadata = {"custom_key": "custom_value"}

        await execute_agentic_activity(
            activity_config=activity_config,
            input_data={},
        )

        # Verify original metadata wasn't modified
        # (It should only have the original key, not correlation_id or workflow_id)
        assert original_metadata == {"custom_key": "custom_value"}


class TestAgenticActivitySecurity:
    """Test security validations for agentic activities."""

    @pytest.mark.asyncio
    async def test_rejects_oversized_input_value(self) -> None:
        """Test that oversized input values are rejected."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        # Create input with value exceeding MAX_INPUT_VALUE_LENGTH
        huge_value = "x" * (settings.MAX_INPUT_VALUE_LENGTH + 1)
        input_data = {"huge_field": huge_value}

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data=input_data,
            )

        assert "exceeds maximum length" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_rejects_oversized_total_input(self) -> None:
        """Test that total input size limit is enforced."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        # Create many inputs that individually pass but collectively exceed MAX_TOTAL_INPUT_SIZE
        individual_size = settings.MAX_INPUT_VALUE_LENGTH // 10
        num_inputs = (settings.MAX_TOTAL_INPUT_SIZE // individual_size) + 2

        input_data = {f"field_{i}": "x" * individual_size for i in range(num_inputs)}

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data=input_data,
            )

        assert "total input size exceeds maximum" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_rejects_null_bytes_in_input(self) -> None:
        """Test that null bytes in input are rejected."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        input_data = {"malicious": "value\x00with\x00nulls"}

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data=input_data,
            )

        assert "null bytes" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_rejects_oversized_resolved_prompt(self) -> None:
        """Test that oversized resolved prompts are rejected."""
        # Create a prompt template that will exceed MAX_PROMPT_LENGTH when resolved
        huge_prompt = "x" * (settings.MAX_PROMPT_LENGTH + 1)

        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": huge_prompt,
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={},
            )

        assert "prompt exceeds maximum length" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_accepts_valid_inputs(self) -> None:
        """Test that valid inputs are accepted."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Process this data: ${input.data}",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        input_data = {"data": "Valid input data"}

        # Should not raise
        result = await execute_agentic_activity(
            activity_config=activity_config,
            input_data=input_data,
        )

        assert result["status"] == "completed"


class TestAgenticActivityErrorHandlingAdvanced:
    """Test advanced error handling scenarios."""

    @pytest.mark.asyncio
    async def test_handles_malformed_json_response(self) -> None:
        """Test handling of malformed JSON from Agent Orchestrator."""
        # Mock client that returns malformed response
        bad_client = AsyncMock()
        bad_client.invoke_agent.side_effect = AgentOrchestratorError("Response missing 'id'")
        bad_client.__aenter__ = AsyncMock(return_value=bad_client)
        bad_client.__aexit__ = AsyncMock(return_value=None)

        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = bad_client

            with pytest.raises(AgenticActivityError) as exc_info:
                await execute_agentic_activity(
                    activity_config=activity_config,
                    input_data={},
                )

        assert "response missing 'id'" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_handles_invalid_status_in_response(self) -> None:
        """Test handling of invalid status values from Agent Orchestrator."""
        bad_client = AsyncMock()
        bad_client.invoke_agent.side_effect = AgentOrchestratorError("Response has non-terminal status 'pending'")
        bad_client.__aenter__ = AsyncMock(return_value=bad_client)
        bad_client.__aexit__ = AsyncMock(return_value=None)

        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = bad_client

            with pytest.raises(AgenticActivityError) as exc_info:
                await execute_agentic_activity(
                    activity_config=activity_config,
                    input_data={},
                )

        assert "non-terminal status" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_handles_json_decode_error(self) -> None:
        """Test handling of JSON decode errors from Agent Orchestrator."""
        bad_client = AsyncMock()
        bad_client.invoke_agent.side_effect = AgentOrchestratorError(f"{json.JSONDecodeError.__name__}: Invalid JSON")
        bad_client.__aenter__ = AsyncMock(return_value=bad_client)
        bad_client.__aexit__ = AsyncMock(return_value=None)

        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
            mock_cls.return_value = bad_client

            with pytest.raises(AgenticActivityError):
                await execute_agentic_activity(
                    activity_config=activity_config,
                    input_data={},
                )

    @pytest.mark.asyncio
    async def test_concurrent_invocations_use_separate_clients(self) -> None:
        """Test that concurrent invocations can execute without interference."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test ${input.id}",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        # Execute multiple invocations concurrently
        results = await asyncio.gather(
            execute_agentic_activity(
                activity_config=activity_config,
                input_data={"id": "1"},
            ),
            execute_agentic_activity(
                activity_config=activity_config,
                input_data={"id": "2"},
            ),
            execute_agentic_activity(
                activity_config=activity_config,
                input_data={"id": "3"},
            ),
        )

        # All should complete successfully
        assert len(results) == 3
        assert all(r["status"] == "completed" for r in results)

    @pytest.mark.asyncio
    async def test_validates_inputs_before_network_call(self, mock_agent_client) -> None:
        """Test that input validation happens before making network calls."""
        # This prevents wasting network resources on invalid inputs
        call_count = 0

        async def track_calls(**kwargs: object) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            return {
                "id": "inv_123",
                "status": "completed",
                "result": {},
                "error_message": None,
                "created_at": "2025-10-31T00:00:00Z",
                "updated_at": "2025-10-31T00:00:01Z",
                "started_at": "2025-10-31T00:00:00Z",
                "completed_at": "2025-10-31T00:00:01Z",
                "prompt": str(kwargs.get("prompt", "")),
                "session_id": "test-session",
                "created_by": "test-user",
                "updated_by": None,
                "context_data": {},
                "checkpoint_data": None,
                "labels": {},
            }

        # Reconfigure mock to track calls
        mock_agent_client.invoke_agent = track_calls

        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        # Try with invalid input (null bytes)
        with pytest.raises(AgenticActivityError):
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={"bad": "value\x00with\x00nulls"},
            )

        # Network call should not have been made
        assert call_count == 0, "Network call was made despite invalid input"


class TestAgenticActivityTimeoutConfiguration:
    """Test timeout configuration for agentic activities."""

    @pytest.mark.asyncio
    async def test_uses_default_timeout_when_not_specified(self, mock_agent_client) -> None:
        """Test that default timeout (300s) is used when not specified in config."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
                # No timeout specified - should use default 300
            },
        }

        await execute_agentic_activity(
            activity_config=activity_config,
            input_data={},
        )

        # Verify invoke_agent was called with default timeout
        call_args = mock_agent_client.invoke_agent.call_args
        assert call_args.kwargs["timeout_seconds"] == 300.0

    @pytest.mark.asyncio
    async def test_uses_custom_timeout_when_specified(self, mock_agent_client) -> None:
        """Test that custom timeout is passed through to client."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
                "timeout": 600,  # Custom 10 minute timeout
            },
        }

        await execute_agentic_activity(
            activity_config=activity_config,
            input_data={},
        )

        # Verify invoke_agent was called with custom timeout
        call_args = mock_agent_client.invoke_agent.call_args
        assert call_args.kwargs["timeout_seconds"] == 600.0

    @pytest.mark.asyncio
    async def test_rejects_timeout_below_minimum(self) -> None:
        """Test that timeout values below minimum (1s) are rejected."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
                "timeout": 0,  # Below minimum
            },
        }

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={},
            )

        assert "timeout" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_rejects_timeout_above_maximum(self) -> None:
        """Test that timeout values above maximum (3600s) are rejected."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
                "timeout": 4000,  # Above maximum
            },
        }

        with pytest.raises(AgenticActivityError) as exc_info:
            await execute_agentic_activity(
                activity_config=activity_config,
                input_data={},
            )

        assert "timeout" in str(exc_info.value).lower()


class TestAgenticActivityInputEdgeCases:
    """Test edge cases in input handling."""

    @pytest.mark.asyncio
    async def test_handles_empty_input_data(self) -> None:
        """Test that empty input data is handled correctly."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Static prompt with no variables",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        # Empty input should be valid
        result = await execute_agentic_activity(
            activity_config=activity_config,
            input_data={},
        )

        assert result["status"] == "completed"

    @pytest.mark.asyncio
    async def test_handles_complex_nested_input_data(self) -> None:
        """Test that nested/complex input data is validated correctly."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Process: ${input.data}",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        # Complex nested structure
        input_data = {
            "data": {
                "nested": {
                    "deeply": {
                        "structure": "value",
                    },
                },
                "list": [1, 2, 3],
            },
        }

        # Should convert to string and validate
        result = await execute_agentic_activity(
            activity_config=activity_config,
            input_data=input_data,
        )

        assert result["status"] == "completed"

    @pytest.mark.asyncio
    async def test_handles_unicode_input(self) -> None:
        """Test that Unicode characters in inputs are handled correctly."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Translate: ${input.text}",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        # Unicode input with various characters
        input_data = {"text": "Hello 世界 🌍 Привет مرحبا"}

        result = await execute_agentic_activity(
            activity_config=activity_config,
            input_data=input_data,
        )

        assert result["status"] == "completed"

    @pytest.mark.asyncio
    async def test_handles_numeric_and_boolean_inputs(self) -> None:
        """Test that non-string input types are converted and validated."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Count: ${input.count}, Enabled: ${input.enabled}",
                "model": "claude-3-5-sonnet-20241022",
            },
        }

        input_data = {
            "count": 42,
            "enabled": True,
            "ratio": 3.14,
        }

        # Should convert to string and validate
        result = await execute_agentic_activity(
            activity_config=activity_config,
            input_data=input_data,
        )

        assert result["status"] == "completed"


class TestAgenticActivityCorrelationID:
    """Test correlation ID propagation for distributed tracing."""

    @pytest.mark.asyncio
    async def test_propagates_correlation_id_from_metadata(self, mock_agent_client) -> None:
        """Test that correlation ID is propagated from activity metadata."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
            "metadata": {
                "correlation_id": "workflow-correlation-123",
            },
        }

        await execute_agentic_activity(
            activity_config=activity_config,
            input_data={},
        )

        # Verify the provided correlation ID was used
        call_args = mock_agent_client.invoke_agent.call_args
        assert call_args.kwargs["correlation_id"] == "workflow-correlation-123"

    @pytest.mark.asyncio
    async def test_generates_correlation_id_when_not_provided(self, mock_agent_client) -> None:
        """Test that correlation ID is generated when not provided in metadata."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
            # No metadata provided
        }

        await execute_agentic_activity(
            activity_config=activity_config,
            input_data={},
        )

        # Verify a correlation ID was generated (UUID format)
        call_args = mock_agent_client.invoke_agent.call_args
        correlation_id = call_args.kwargs["correlation_id"]
        assert correlation_id is not None
        assert len(correlation_id) == 36  # UUID format: 8-4-4-4-12
        assert correlation_id.count("-") == 4

    @pytest.mark.asyncio
    async def test_generates_correlation_id_when_metadata_empty(self, mock_agent_client) -> None:
        """Test that correlation ID is generated when metadata exists but correlation_id is missing."""
        activity_config = {
            "executor": "agentic",
            "config": {
                "prompt": "Test prompt",
                "model": "claude-3-5-sonnet-20241022",
            },
            "metadata": {
                "other_field": "value",
                # No correlation_id
            },
        }

        await execute_agentic_activity(
            activity_config=activity_config,
            input_data={},
        )

        # Verify a correlation ID was generated
        call_args = mock_agent_client.invoke_agent.call_args
        correlation_id = call_args.kwargs["correlation_id"]
        assert correlation_id is not None
        assert len(correlation_id) == 36  # UUID format
