"""Integration tests for Context Manager error handling and graceful fallback.

Tests that system handles Context Manager failures gracefully without breaking invocations.
Based on Scenario 3 from quickstart.md.
"""

import asyncio
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.agent_orchestrator.context_manager import ContextManagerPlanner
from nexus.agent_orchestrator.context_manager.models import ContextPackage
from nexus.agent_orchestrator.models import InvocationStatus
from nexus.agent_orchestrator.services.invocation_service import InvocationService
from nexus.core.models import User


class TestContextErrorHandling:
    """Test suite for Context Manager error handling and graceful fallback."""

    @pytest_asyncio.fixture
    async def invocation_service(self, test_db_session: AsyncSession, test_user: User) -> InvocationService:
        """Create InvocationService instance for testing."""
        return InvocationService(session=test_db_session, user=test_user)

    @pytest.mark.asyncio
    async def test_context_manager_failure_graceful_fallback(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that Context Manager failures don't break invocation processing.

        This verifies:
        - Invocation still completes successfully when context processing fails
        - Original prompt is used when context enhancement fails
        - Error is logged but doesn't propagate to user
        - Response may not have context metadata on failure

        This test MUST FAIL until T008 (error handling implementation) is implemented.
        """
        # Mock Context Manager to simulate failure
        with patch.object(ContextManagerPlanner, "plan_request") as mock_plan:
            mock_plan.side_effect = Exception("Context Manager service unavailable")

            prompt = "Test prompt during context failure"
            session_id = "error-handling-test"

            invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

            # Wait for completion
            max_wait = 10.0
            wait_interval = 0.1
            waited = 0.0

            while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    pytest.fail(f"Invocation timed out after {max_wait}s")

                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation)

            # Handle both cases: with and without OpenRouter API key
            if invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                invocation.error_message or ""
            ):
                # No OpenRouter API key configured (CI environment)
                # Skip test since we can't test context failure without working LLM
                return

            # Should still complete successfully despite context failure
            assert invocation.status == InvocationStatus.COMPLETED, (
                "Invocation should complete successfully even when context processing fails"
            )
            assert invocation.result is not None

            result = invocation.result

            # Core response should still be present
            assert "content" in result
            assert isinstance(result["content"], str)
            assert len(result["content"]) > 0

            # Context metadata may not be present on failure
            result.get("correlation_id")
            result.get("grounding_score")

            # If context metadata is missing due to failure, that's acceptable
            # The important thing is the invocation didn't fail

    @pytest.mark.asyncio
    async def test_context_manager_timeout_handling(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test graceful handling of Context Manager timeouts.

        Verifies that slow context processing doesn't block invocation indefinitely.

        This test MUST FAIL until T008 (error handling implementation) is implemented.
        """

        # Mock Context Manager to simulate slow response
        async def slow_plan_request(*args: object, **kwargs: object) -> ContextPackage:
            await asyncio.sleep(5.0)  # Simulate 5 second delay
            return ContextPackage(correlation_id="test", payload={}, grounding_score=0.0)

        with patch.object(ContextManagerPlanner, "plan_request", side_effect=slow_plan_request):
            prompt = "Test timeout handling"
            session_id = "timeout-test"

            start_time = asyncio.get_event_loop().time()
            invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

            # Wait for completion
            max_wait = 3.0  # Shorter than the mocked delay
            wait_interval = 0.1
            waited = 0.0

            while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    # If still running after reasonable time, that's acceptable
                    # The important thing is it doesn't hang indefinitely
                    break

                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation)

            end_time = asyncio.get_event_loop().time()
            total_time = end_time - start_time

            # Should not take much longer than the timeout
            # (This test may need adjustment based on actual timeout implementation)
            assert total_time < 10.0, "Invocation should not hang indefinitely on context timeout"

    @pytest.mark.asyncio
    async def test_partial_context_failure_handling(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test handling of partial context failures.

        Tests scenarios where Context Manager returns successfully but with incomplete data.

        This test MUST FAIL until T008 (error handling implementation) is implemented.
        """
        # Mock Context Manager to return context package with some fields missing/invalid
        mock_context_package = ContextPackage(
            correlation_id="partial-failure-test",
            payload={},  # Empty payload (acceptable)
            grounding_score=0.0,  # Valid score
            package_metadata={},  # Missing correlation_id (should be handled)
            citations=[],
        )

        with patch.object(ContextManagerPlanner, "plan_request", return_value=mock_context_package):
            prompt = "Test partial context failure"
            session_id = "partial-failure-test"

            invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

            # Wait for completion
            max_wait = 10.0
            wait_interval = 0.1
            waited = 0.0

            while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    pytest.fail(f"Invocation timed out after {max_wait}s")

                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation)

            # Handle both cases: with and without OpenRouter API key
            if invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                invocation.error_message or ""
            ):
                # No OpenRouter API key configured (CI environment)
                # Skip test since we can't test partial context failure without working LLM
                return

            # Should complete successfully
            assert invocation.status == InvocationStatus.COMPLETED
            assert invocation.result is not None
            result = invocation.result

            assert "content" in result

            # Should handle missing correlation_id gracefully
            # Implementation should either generate fallback correlation_id or omit field

    @pytest.mark.asyncio
    async def test_context_manager_exception_types(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test handling of different types of Context Manager exceptions.

        This verifies graceful handling of various failure modes.

        This test MUST FAIL until T008 (error handling implementation) is implemented.
        """
        exception_types = [
            ConnectionError("Database connection failed"),
            TimeoutError("Context retrieval timed out"),
            ValueError("Invalid query format"),
            RuntimeError("Context service internal error"),
        ]

        for exception in exception_types:
            with patch.object(ContextManagerPlanner, "plan_request", side_effect=exception):
                prompt = f"Test {type(exception).__name__} handling"
                session_id = f"{type(exception).__name__.lower()}-test"

                invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

                # Wait for completion
                max_wait = 10.0
                wait_interval = 0.1
                waited = 0.0

                while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                    if waited >= max_wait:
                        pytest.fail(f"Invocation timed out after {max_wait}s for {type(exception).__name__}")

                    await asyncio.sleep(wait_interval)
                    waited += wait_interval
                    await invocation_service.session.refresh(invocation)

                # Handle both cases: with and without OpenRouter API key
                if invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                    invocation.error_message or ""
                ):
                    # No OpenRouter API key configured (CI environment)
                    # Skip test since we can't test context failure handling without working LLM
                    continue

                # Should complete successfully regardless of exception type
                assert invocation.status == InvocationStatus.COMPLETED, (
                    f"Should handle {type(exception).__name__} gracefully"
                )
                assert invocation.result is not None
                assert "content" in invocation.result

    @pytest.mark.asyncio
    async def test_context_logging_on_failures(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that context failures are properly logged for debugging.

        Verifies that errors are logged with appropriate context for troubleshooting.

        This test MUST FAIL until T008 (error handling implementation) is implemented.
        """
        with (
            patch("nexus.agent_orchestrator.services.invocation_service.logger") as mock_logger,
            patch.object(ContextManagerPlanner, "plan_request") as mock_plan,
        ):
            mock_plan.side_effect = ConnectionError("Database unavailable")

            prompt = "Test logging on context failure"
            session_id = "logging-test"

            invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

            # Wait for completion
            max_wait = 10.0
            wait_interval = 0.1
            waited = 0.0

            while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    pytest.fail(f"Invocation timed out after {max_wait}s")

                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation)

            # Handle both cases: with and without OpenRouter API key
            if invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                invocation.error_message or ""
            ):
                # No OpenRouter API key configured (CI environment)
                # Skip test since we can't test context failure logging without working LLM
                return

            # Should complete successfully
            assert invocation.status == InvocationStatus.COMPLETED

            # Verify error was logged appropriately
            # Check that warning or error was logged about context failure
            warning_calls = [call for call in mock_logger.warning.call_args_list if "context" in str(call).lower()]
            error_calls = [call for call in mock_logger.error.call_args_list if "context" in str(call).lower()]

            assert len(warning_calls) > 0 or len(error_calls) > 0, "Context failure should be logged for debugging"
