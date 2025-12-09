"""Unit tests for InvocationExecutor cancellation race condition fixes."""

from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.executor.invocation_executor import InvocationExecutor
from nexus.agent_orchestrator.models import InvocationStatus


class TestInvocationExecutorCancellationRaceCondition:
    """Test race condition fixes in InvocationExecutor."""

    @pytest.mark.asyncio
    async def test_execute_invocation_respects_cancellation_during_execution(self) -> None:
        """Test that invocations cancelled during execution are not marked as completed.

        This is the critical race condition test - ensures that if an invocation is
        cancelled while the orchestration service is executing, the final status
        remains CANCELLED and is not overridden to COMPLETED.
        """
        # Arrange
        mock_session = AsyncMock()

        async def mock_session_factory() -> AsyncGenerator[AsyncSession, None]:
            yield mock_session

        executor = InvocationExecutor(session_factory=mock_session_factory)
        invocation_id = uuid4()

        # Create a mock invocation that starts as RUNNING
        mock_invocation = MagicMock()
        mock_invocation.id = invocation_id
        mock_invocation.status = InvocationStatus.RUNNING
        mock_invocation.prompt = "test prompt"
        mock_invocation.session_id = "test-session"
        mock_invocation.context_data = {"correlation_id": str(uuid4())}

        # Mock the invocation being cancelled DURING execution
        # First get() call returns RUNNING invocation
        # refresh() call returns CANCELLED invocation (simulates concurrent cancellation)
        mock_session.get.return_value = mock_invocation

        def simulate_cancellation_during_refresh(*args, **kwargs) -> None:  # noqa: ANN002,ANN003
            """Simulate invocation being cancelled during execution."""
            mock_invocation.status = InvocationStatus.CANCELLED

        mock_session.refresh.side_effect = simulate_cancellation_during_refresh

        with (
            patch("nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm"),
            patch("nexus.agent_orchestrator.executor.invocation_executor.ContextManagerPlanner"),
            patch("nexus.agent_orchestrator.services.orchestration_service.OrchestrationService") as mock_orchestration,
        ):
            # Mock execute as async method
            mock_orchestration.return_value.execute = AsyncMock(return_value={"result": "test response"})

            # Act
            await executor.execute_invocation(invocation_id)

            # Assert
            # 1. The invocation should remain CANCELLED
            assert mock_invocation.status == InvocationStatus.CANCELLED

            # 2. Session should be refreshed to check for cancellation
            mock_session.refresh.assert_called_with(mock_invocation)

            # 3. Session should NOT be committed after cancellation (early return on cancellation)
            # First commit is for marking as RUNNING, but should have no commits after refresh shows cancellation
            assert mock_session.commit.call_count == 1  # Only the initial RUNNING status commit

    @pytest.mark.asyncio
    async def test_execute_invocation_completes_normally_when_not_cancelled(self) -> None:
        """Test that invocations complete normally when not cancelled."""
        # Arrange
        mock_session = AsyncMock()

        async def mock_session_factory() -> AsyncGenerator[AsyncSession, None]:
            yield mock_session

        executor = InvocationExecutor(session_factory=mock_session_factory)
        invocation_id = uuid4()

        # Create a mock invocation that starts as RUNNING and stays RUNNING
        mock_invocation = MagicMock()
        mock_invocation.id = invocation_id
        mock_invocation.status = InvocationStatus.RUNNING
        mock_invocation.prompt = "test prompt"
        mock_invocation.session_id = "test-session"
        mock_invocation.context_data = {"correlation_id": str(uuid4())}

        mock_session.get.return_value = mock_invocation
        # refresh() keeps status as RUNNING (not cancelled)
        mock_session.refresh.return_value = None  # No side effect - stays RUNNING

        with (
            patch("nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm"),
            patch("nexus.agent_orchestrator.executor.invocation_executor.ContextManagerPlanner"),
            patch("nexus.agent_orchestrator.services.orchestration_service.OrchestrationService") as mock_orchestration,
            patch("nexus.agent_orchestrator.executor.invocation_executor.datetime") as mock_datetime,
        ):
            # Mock execute as async method
            mock_orchestration.return_value.execute = AsyncMock(return_value={"result": "test response"})
            mock_datetime.now.return_value = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)

            # Act
            await executor.execute_invocation(invocation_id)

            # Assert
            # 1. The invocation should be marked as COMPLETED
            assert mock_invocation.status == InvocationStatus.COMPLETED

            # 2. Result should be stored
            assert mock_invocation.result == {"result": "test response"}

            # 3. Session should be refreshed to check for cancellation
            mock_session.refresh.assert_called_with(mock_invocation)

            # 4. Session should be committed twice: once for RUNNING, once for COMPLETED
            assert mock_session.commit.call_count == 2

    @pytest.mark.asyncio
    async def test_execute_invocation_handles_pre_execution_cancellation(self) -> None:
        """Test that invocations cancelled before execution don't execute."""
        # Arrange
        mock_session = AsyncMock()

        async def mock_session_factory() -> AsyncGenerator[AsyncSession, None]:
            yield mock_session

        executor = InvocationExecutor(session_factory=mock_session_factory)
        invocation_id = uuid4()

        # Create a mock invocation that is already CANCELLED
        mock_invocation = MagicMock()
        mock_invocation.id = invocation_id
        mock_invocation.status = InvocationStatus.CANCELLED

        mock_session.get.return_value = mock_invocation

        with patch("nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm") as mock_llm:
            # Act
            await executor.execute_invocation(invocation_id)

            # Assert
            # 1. LLM should not be created (early return)
            mock_llm.assert_not_called()

            # 2. Session should not be committed (early return)
            mock_session.commit.assert_not_called()

            # 3. Status should remain CANCELLED
            assert mock_invocation.status == InvocationStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_execute_invocation_handles_invocation_cancelled_error(self) -> None:
        """Test that InvocationCancelledError during execution is handled correctly."""
        # Arrange
        mock_session = AsyncMock()

        async def mock_session_factory() -> AsyncGenerator[AsyncSession, None]:
            yield mock_session

        executor = InvocationExecutor(session_factory=mock_session_factory)
        invocation_id = uuid4()

        # Create a mock invocation that starts as RUNNING
        mock_invocation = MagicMock()
        mock_invocation.id = invocation_id
        mock_invocation.status = InvocationStatus.RUNNING
        mock_invocation.prompt = "test prompt"
        mock_invocation.session_id = "test-session"
        mock_invocation.context_data = {"correlation_id": str(uuid4())}

        mock_session.get.return_value = mock_invocation

        from nexus.agent_orchestrator.exceptions import InvocationCancelledError

        with (
            patch("nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm"),
            patch("nexus.agent_orchestrator.executor.invocation_executor.ContextManagerPlanner"),
            patch("nexus.agent_orchestrator.services.orchestration_service.OrchestrationService") as mock_orchestration,
        ):
            # Simulate InvocationCancelledError being raised during execution
            mock_orchestration.return_value.execute.side_effect = InvocationCancelledError(invocation_id, "test phase")

            # Act
            await executor.execute_invocation(invocation_id)

            # Assert
            # 1. Only one commit should occur (marking as RUNNING), no final commit
            assert mock_session.commit.call_count == 1

            # 2. No status update should occur (exception handled gracefully)
            # The status would be set to CANCELLED by the cancellation service,
            # not by the executor

    @pytest.mark.asyncio
    async def test_execute_invocation_multiple_refresh_calls_safe(self) -> None:
        """Test that multiple refresh calls during execution are safe."""
        # Arrange
        mock_session = AsyncMock()

        async def mock_session_factory() -> AsyncGenerator[AsyncSession, None]:
            yield mock_session

        executor = InvocationExecutor(session_factory=mock_session_factory)
        invocation_id = uuid4()

        mock_invocation = MagicMock()
        mock_invocation.id = invocation_id
        mock_invocation.status = InvocationStatus.RUNNING
        mock_invocation.prompt = "test prompt"
        mock_invocation.session_id = "test-session"
        mock_invocation.context_data = {"correlation_id": str(uuid4())}

        mock_session.get.return_value = mock_invocation

        # Ensure multiple refresh calls work correctly
        refresh_call_count = 0

        def track_refresh_calls(*args, **kwargs) -> None:  # noqa: ANN002,ANN003
            nonlocal refresh_call_count
            refresh_call_count += 1
            # Stay RUNNING for this test

        mock_session.refresh.side_effect = track_refresh_calls

        with (
            patch("nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm"),
            patch("nexus.agent_orchestrator.executor.invocation_executor.ContextManagerPlanner"),
            patch("nexus.agent_orchestrator.services.orchestration_service.OrchestrationService") as mock_orchestration,
        ):
            # Mock execute as async method
            mock_orchestration.return_value.execute = AsyncMock(return_value={"result": "test response"})

            # Act
            await executor.execute_invocation(invocation_id)

            # Assert
            # 1. refresh() should be called at least once (before final status update)
            assert refresh_call_count >= 1

            # 2. Status should be COMPLETED since it was never cancelled
            assert mock_invocation.status == InvocationStatus.COMPLETED
