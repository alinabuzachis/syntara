"""Integration tests for GenericAgent retry behavior.

These tests validate the end-to-end retry functionality when GenericAgent
makes LLM calls through the retry decorator.
"""

# ruff: noqa: ANN401, TRY003, EM101

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import openai
import pytest

from nexus.agent_orchestrator.agents.generic_agent import GenericAgent
from nexus.agent_orchestrator.models.agent_state import AgentState
from nexus.core.config import AdapterRetrySettings


@pytest.fixture
def retry_settings_fast() -> AdapterRetrySettings:
    """Create retry settings with fast delays for testing."""
    return AdapterRetrySettings(
        adapter_max_retries=3,
        adapter_initial_backoff_seconds=0.1,  # Fast for testing
        adapter_backoff_growth_factor=2.0,
        adapter_max_backoff_seconds=1.0,
        adapter_request_timeout_seconds=5.0,
    )


@pytest.fixture
def retry_settings_disabled() -> AdapterRetrySettings:
    """Create retry settings with retries disabled."""
    return AdapterRetrySettings(
        adapter_max_retries=0,
        adapter_initial_backoff_seconds=1.0,
        adapter_backoff_growth_factor=2.0,
        adapter_max_backoff_seconds=10.0,
        adapter_request_timeout_seconds=30.0,
    )


@pytest.fixture
def sample_agent_state() -> AgentState:
    """Create a sample agent state for testing."""
    return AgentState(
        prompt="What is the weather today?",
        original_prompt="What is the weather today?",
        session_id="test-session",
        correlation_id=str(uuid4()),
        invocation_id=str(uuid4()),
        context_package=None,
        current_agent="generic_agent",
        result=None,
    )


class TestSuccessfulRetryAfterTransientError:
    """Test scenario: successful retry after transient 503 error."""

    @pytest.mark.asyncio
    async def test_retry_succeeds_after_503_error(
        self,
        retry_settings_fast: AdapterRetrySettings,
        sample_agent_state: AgentState,
    ) -> None:
        """Test that GenericAgent retries and succeeds after 503 error."""
        # Create mock LLM
        mock_llm = AsyncMock()

        call_count = 0

        async def mock_ainvoke(messages: Any) -> Any:
            nonlocal call_count
            call_count += 1

            if call_count == 1:
                # First call fails with 503
                response = MagicMock()
                response.status_code = 503
                raise openai.APIStatusError(
                    message="Service unavailable",
                    response=response,
                    body=None,
                )

            # Second call succeeds
            mock_response = MagicMock()
            mock_response.text = "I am Malenia, blade of Miquella."
            mock_response.response_metadata = {"model": "test-model", "tokens": 10}
            return mock_response

        mock_llm.ainvoke = mock_ainvoke

        # Create agent
        agent = GenericAgent(llm=mock_llm)

        # Execute with patched settings
        with patch("nexus.agent_orchestrator.utils.retry.get_settings", return_value=retry_settings_fast):
            result = await agent._execute(sample_agent_state)

            # Verify success
            assert result.content == "I am Malenia, blade of Miquella."
            assert call_count == 2  # Initial + 1 retry
            assert "model" in result.response_metadata

    @pytest.mark.asyncio
    async def test_retry_succeeds_after_connection_error(
        self,
        retry_settings_fast: AdapterRetrySettings,
        sample_agent_state: AgentState,
    ) -> None:
        """Test that GenericAgent retries and succeeds after APIConnectionError."""
        mock_llm = AsyncMock()

        call_count = 0

        async def mock_ainvoke(messages: Any) -> Any:
            nonlocal call_count
            call_count += 1

            if call_count == 1:
                raise openai.APIConnectionError(request=MagicMock())

            mock_response = MagicMock()
            mock_response.text = "Success after connection error."
            mock_response.response_metadata = {"model": "test-model"}
            return mock_response

        mock_llm.ainvoke = mock_ainvoke

        agent = GenericAgent(llm=mock_llm)

        with patch("nexus.agent_orchestrator.utils.retry.get_settings", return_value=retry_settings_fast):
            result = await agent._execute(sample_agent_state)

            assert result.content == "Success after connection error."
            assert call_count == 2


class TestExhaustedRetriesAfterMultipleFailures:
    """Test scenario: exhausted retries after persistent errors."""

    @pytest.mark.asyncio
    async def test_fails_after_max_retries_with_500_errors(
        self,
        retry_settings_fast: AdapterRetrySettings,
        sample_agent_state: AgentState,
    ) -> None:
        """Test that GenericAgent fails after exhausting retries with 500 errors."""
        mock_llm = AsyncMock()

        call_count = 0

        async def mock_ainvoke(messages: Any) -> Any:
            nonlocal call_count
            call_count += 1

            # Always fail with 500
            response = MagicMock()
            response.status_code = 500
            raise openai.APIStatusError(
                message="Internal server error",
                response=response,
                body=None,
            )

        mock_llm.ainvoke = mock_ainvoke

        agent = GenericAgent(llm=mock_llm)

        import time

        start_time = time.time()

        with patch("nexus.agent_orchestrator.utils.retry.get_settings", return_value=retry_settings_fast):
            with pytest.raises(openai.APIStatusError) as exc_info:
                await agent._execute(sample_agent_state)

            elapsed = time.time() - start_time

            # Verify retries exhausted
            assert call_count == 4  # Initial + 3 retries
            assert "Internal server error" in str(exc_info.value)

            # Verify delays applied (0.1s, 0.2s, 0.4s with jitter)
            # Total should be ~0.7s + jitter + execution time
            assert 0.5 <= elapsed <= 1.5

    @pytest.mark.asyncio
    async def test_fails_after_max_retries_with_different_errors(
        self,
        retry_settings_fast: AdapterRetrySettings,
        sample_agent_state: AgentState,
    ) -> None:
        """Test that retry continues with different error types."""
        mock_llm = AsyncMock()

        call_count = 0
        errors = [503, 500, 502, 504]

        async def mock_ainvoke(messages: Any) -> Any:
            nonlocal call_count
            response = MagicMock()
            response.status_code = errors[call_count]
            call_count += 1
            raise openai.APIStatusError(
                message=f"Error {errors[call_count - 1]}",
                response=response,
                body=None,
            )

        mock_llm.ainvoke = mock_ainvoke

        agent = GenericAgent(llm=mock_llm)

        with patch("nexus.agent_orchestrator.utils.retry.get_settings", return_value=retry_settings_fast):
            with pytest.raises(openai.APIStatusError):
                await agent._execute(sample_agent_state)

            # All errors should have been tried
            assert call_count == 4


class TestNonRetryableErrorFailsImmediately:
    """Test scenario: non-retryable errors fail without retry."""

    @pytest.mark.asyncio
    async def test_authentication_error_fails_immediately(
        self,
        retry_settings_fast: AdapterRetrySettings,
        sample_agent_state: AgentState,
    ) -> None:
        """Test that authentication errors fail without retry."""
        mock_llm = AsyncMock()

        call_count = 0

        async def mock_ainvoke(messages: Any) -> Any:
            nonlocal call_count
            call_count += 1

            raise openai.AuthenticationError(
                message="Invalid API key",
                response=MagicMock(),
                body=None,
            )

        mock_llm.ainvoke = mock_ainvoke

        agent = GenericAgent(llm=mock_llm)

        with patch("nexus.agent_orchestrator.utils.retry.get_settings", return_value=retry_settings_fast):
            with pytest.raises(openai.AuthenticationError) as exc_info:
                await agent._execute(sample_agent_state)

            # No retries
            assert call_count == 1
            assert "Invalid API key" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_bad_request_error_fails_immediately(
        self,
        retry_settings_fast: AdapterRetrySettings,
        sample_agent_state: AgentState,
    ) -> None:
        """Test that bad request errors fail without retry."""
        mock_llm = AsyncMock()

        call_count = 0

        async def mock_ainvoke(messages: Any) -> Any:
            nonlocal call_count
            call_count += 1

            raise openai.BadRequestError(
                message="Invalid request format",
                response=MagicMock(),
                body=None,
            )

        mock_llm.ainvoke = mock_ainvoke

        agent = GenericAgent(llm=mock_llm)

        with patch("nexus.agent_orchestrator.utils.retry.get_settings", return_value=retry_settings_fast):
            with pytest.raises(openai.BadRequestError):
                await agent._execute(sample_agent_state)

            assert call_count == 1


class TestZeroRetriesConfiguration:
    """Test scenario: retry disabled with max_retries=0."""

    @pytest.mark.asyncio
    async def test_zero_retries_fails_immediately_on_503(
        self,
        retry_settings_disabled: AdapterRetrySettings,
        sample_agent_state: AgentState,
    ) -> None:
        """Test that retry is disabled when max_retries=0."""
        mock_llm = AsyncMock()

        call_count = 0

        async def mock_ainvoke(messages: Any) -> Any:
            nonlocal call_count
            call_count += 1

            response = MagicMock()
            response.status_code = 503
            raise openai.APIStatusError(
                message="Service unavailable",
                response=response,
                body=None,
            )

        mock_llm.ainvoke = mock_ainvoke

        agent = GenericAgent(llm=mock_llm)

        with patch("nexus.agent_orchestrator.utils.retry.get_settings", return_value=retry_settings_disabled):
            with pytest.raises(openai.APIStatusError):
                await agent._execute(sample_agent_state)

            # No retries despite retryable error
            assert call_count == 1


class TestConcurrentRequestsWithIndependentState:
    """Test scenario: concurrent requests maintain isolated retry state."""

    @pytest.mark.asyncio
    async def test_concurrent_requests_independent_retry_counters(
        self, retry_settings_fast: AdapterRetrySettings
    ) -> None:
        """Test that concurrent requests have independent retry state."""
        call_counts = {"a": 0, "b": 0, "c": 0}

        def create_mock_llm(request_id: str) -> AsyncMock:
            """Create a mock LLM with specific behavior for each request."""
            mock_llm = AsyncMock()

            async def mock_ainvoke(messages: Any) -> Any:
                call_counts[request_id] += 1

                if request_id == "a":
                    # Request A: succeeds immediately
                    mock_response = MagicMock()
                    mock_response.text = "Success A"
                    mock_response.response_metadata = {"model": "test"}
                    return mock_response

                if request_id == "b" and call_counts[request_id] == 1:
                    # Request B: fails once, then succeeds
                    response = MagicMock()
                    response.status_code = 503
                    raise openai.APIStatusError(
                        message="Service unavailable",
                        response=response,
                        body=None,
                    )
                if request_id == "b":
                    mock_response = MagicMock()
                    mock_response.text = "Success B"
                    mock_response.response_metadata = {"model": "test"}
                    return mock_response

                if request_id == "c":
                    # Request C: always fails
                    response = MagicMock()
                    response.status_code = 500
                    raise openai.APIStatusError(
                        message="Internal server error",
                        response=response,
                        body=None,
                    )

                raise RuntimeError("Unexpected request ID")

            mock_llm.ainvoke = mock_ainvoke
            return mock_llm

        # Create agents with different mock LLMs
        agent_a = GenericAgent(llm=create_mock_llm("a"))
        agent_b = GenericAgent(llm=create_mock_llm("b"))
        agent_c = GenericAgent(llm=create_mock_llm("c"))

        # Create states
        state_a = AgentState(
            prompt="Query A",
            original_prompt="Query A",
            session_id="session-a",
            correlation_id=str(uuid4()),
            invocation_id=str(uuid4()),
            context_package=None,
            current_agent="generic_agent",
            result=None,
        )

        state_b = AgentState(
            prompt="Query B",
            original_prompt="Query B",
            session_id="session-b",
            correlation_id=str(uuid4()),
            invocation_id=str(uuid4()),
            context_package=None,
            current_agent="generic_agent",
            result=None,
        )

        state_c = AgentState(
            prompt="Query C",
            original_prompt="Query C",
            session_id="session-c",
            correlation_id=str(uuid4()),
            invocation_id=str(uuid4()),
            context_package=None,
            current_agent="generic_agent",
            result=None,
        )

        # Run concurrently
        with patch("nexus.agent_orchestrator.utils.retry.get_settings", return_value=retry_settings_fast):
            results = await asyncio.gather(
                agent_a._execute(state_a),
                agent_b._execute(state_b),
                agent_c._execute(state_c),
                return_exceptions=True,
            )

            # Request A: 1 call (immediate success)
            assert not isinstance(results[0], BaseException)
            assert results[0].content == "Success A"
            assert call_counts["a"] == 1

            # Request B: 2 calls (1 failure + 1 success)
            assert not isinstance(results[1], BaseException)
            assert results[1].content == "Success B"
            assert call_counts["b"] == 2

            # Request C: 4 calls (initial + 3 retries)
            assert isinstance(results[2], openai.APIStatusError)
            assert call_counts["c"] == 4
