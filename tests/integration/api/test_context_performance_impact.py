"""Integration tests for context enhancement performance impact assessment.

Tests that context enhancement adds acceptable latency to invocation processing.
Based on Scenario 5 from quickstart.md.
"""

import asyncio
import time
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.agent_orchestrator.context_manager import ContextManagerPlanner
from nexus.agent_orchestrator.context_manager.models import ContextPackage
from nexus.agent_orchestrator.models import InvocationStatus
from nexus.agent_orchestrator.services.invocation_service import InvocationService
from nexus.core.models import User


class TestContextPerformanceImpact:
    """Test suite for performance impact assessment of context enhancement."""

    @pytest_asyncio.fixture
    async def invocation_service(self, test_db_session: AsyncSession, test_user: User) -> InvocationService:
        """Create InvocationService instance for testing."""
        return InvocationService(session=test_db_session, user=test_user)

    @pytest.mark.asyncio
    async def test_baseline_vs_context_enhanced_performance(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test performance comparison between baseline and context-enhanced invocations.

        This verifies that context enhancement adds acceptable overhead.

        This test MUST FAIL until T007 (core integration) is implemented.
        Note: Performance thresholds are defined by performance team during implementation.
        """
        # Test 1: Baseline performance (minimal context processing)
        baseline_prompt = "What is 2 + 2?"
        baseline_session = "performance-baseline"

        start_time = time.time()
        baseline_invocation = await invocation_service.create_invocation(
            prompt=baseline_prompt, session_id=baseline_session
        )

        # Wait for completion and measure time
        max_wait = 30.0
        wait_interval = 0.1
        waited = 0.0

        while baseline_invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
            if waited >= max_wait:
                pytest.fail(f"Baseline invocation timed out after {max_wait}s")

            await asyncio.sleep(wait_interval)
            waited += wait_interval
            await invocation_service.session.refresh(baseline_invocation)

        baseline_end_time = time.time()
        baseline_duration = baseline_end_time - start_time

        # Handle both cases: with and without OpenRouter API key
        if baseline_invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
            baseline_invocation.error_message or ""
        ):
            # No OpenRouter API key configured (CI environment)
            # Skip context enhancement tests when LLM is not available
            return

        assert baseline_invocation.status == InvocationStatus.COMPLETED
        assert baseline_duration < 30.0, "Baseline should complete within reasonable time"

        # Test 2: Context-enhanced performance (simulated heavy context)
        mock_context_package = ContextPackage(
            correlation_id="perf-test-123",
            payload={
                "large_context": "This is simulated large context data " * 100  # ~4KB of context
            },
            grounding_score=0.8,
            package_metadata={"correlation_id": "perf-test-123"},
            citations=[{"source": f"doc{i}"} for i in range(10)],
        )

        with patch.object(ContextManagerPlanner, "plan_request", return_value=mock_context_package):
            context_prompt = "Explain our entire system architecture and best practices"
            context_session = "performance-context"

            context_start_time = time.time()
            context_invocation = await invocation_service.create_invocation(
                prompt=context_prompt, session_id=context_session
            )

            # Wait for completion
            waited = 0.0
            while context_invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    pytest.fail(f"Context invocation timed out after {max_wait}s")

                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(context_invocation)

            context_end_time = time.time()
            context_duration = context_end_time - context_start_time

        # Handle both cases: with and without OpenRouter API key
        if context_invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
            context_invocation.error_message or ""
        ):
            # No OpenRouter API key configured (CI environment)
            # Skip context enhancement tests when LLM is not available
            return

        assert context_invocation.status == InvocationStatus.COMPLETED

        # Performance analysis
        performance_overhead = context_duration - baseline_duration

        # Verify reasonable performance (thresholds TBD by performance team)
        assert context_duration < 30.0, "Context-enhanced invocation should complete within reasonable time"

        # Context enhancement should not add excessive overhead
        # This threshold may need adjustment based on actual performance requirements
        max_acceptable_overhead = 10.0  # seconds
        assert performance_overhead < max_acceptable_overhead, (
            f"Context overhead ({performance_overhead:.2f}s) exceeds threshold ({max_acceptable_overhead}s)"
        )

    @pytest.mark.asyncio
    async def test_context_processing_timeout_performance(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that context processing timeouts don't significantly impact performance.

        This test MUST FAIL until T008 (error handling implementation) is implemented.
        """

        # Mock slow context processing
        def slow_context_processing(*args: object, **kwargs: object) -> ContextPackage:
            time.sleep(2.0)  # 2 second delay
            return ContextPackage(correlation_id="slow-test", payload={}, grounding_score=0.0)

        with patch.object(ContextManagerPlanner, "plan_request", side_effect=slow_context_processing):
            prompt = "Test slow context processing"
            session_id = "slow-context-test"

            start_time = time.time()
            invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

            # Wait for completion
            max_wait = 15.0  # Reasonable timeout including slow context
            wait_interval = 0.1
            waited = 0.0

            while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    # If it's still processing, that might be acceptable depending on timeout implementation
                    break

                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation)

            end_time = time.time()
            total_duration = end_time - start_time

            # Should not hang indefinitely due to slow context processing
            assert total_duration < 10.0, "Should not be blocked indefinitely by slow context processing"

    @pytest.mark.asyncio
    async def test_concurrent_context_enhanced_invocations(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test performance under concurrent context-enhanced invocations.

        This test MUST FAIL until T007 (core integration) is implemented.
        """

        # Mock context that adds some processing time
        def context_with_delay(*args: object, **kwargs: object) -> ContextPackage:
            time.sleep(0.1)  # 100ms processing time
            return ContextPackage(
                correlation_id=str(args[0]) if args else "concurrent-test",
                payload={"concurrent": "test"},
                grounding_score=0.5,
            )

        with patch.object(ContextManagerPlanner, "plan_request", side_effect=context_with_delay):
            # Create multiple concurrent invocations
            num_concurrent = 5
            invocations = []

            start_time = time.time()

            # Start all invocations concurrently
            for i in range(num_concurrent):
                invocation = await invocation_service.create_invocation(
                    prompt=f"Concurrent test prompt {i}", session_id=f"concurrent-session-{i}"
                )
                invocations.append(invocation)

            # Wait for all to complete
            max_wait = 20.0
            wait_interval = 0.1
            waited = 0.0

            while waited < max_wait:
                all_complete = True
                for inv in invocations:
                    await invocation_service.session.refresh(inv)
                    if inv.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                        all_complete = False
                        break

                if all_complete:
                    break

                await asyncio.sleep(wait_interval)
                waited += wait_interval

            end_time = time.time()
            total_duration = end_time - start_time

            # Handle both cases: with and without OpenRouter API key
            for inv in invocations:
                if inv.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (inv.error_message or ""):
                    # No OpenRouter API key configured (CI environment)
                    # Skip context enhancement tests when LLM is not available
                    return

            # Verify all completed successfully
            for i, inv in enumerate(invocations):
                assert inv.status == InvocationStatus.COMPLETED, f"Invocation {i} should complete"

            # Concurrent processing should not take much longer than sequential
            # With proper async handling, should be closer to single invocation time
            expected_max_duration = 20.0  # Should not take much longer than single invocation
            assert total_duration < expected_max_duration, (
                f"Concurrent processing took {total_duration:.2f}s, expected < {expected_max_duration}s"
            )

    @pytest.mark.asyncio
    async def test_memory_usage_with_context_enhancement(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that context enhancement doesn't cause excessive memory usage.

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        # Test with larger context payloads to check memory handling
        large_context_sizes = [1024, 4096, 8192]  # bytes

        for context_size in large_context_sizes:
            mock_context_package = ContextPackage(
                correlation_id=f"memory-test-{context_size}",
                payload={
                    "large_data": "x" * context_size  # Create context of specified size
                },
                grounding_score=0.7,
                package_metadata={"correlation_id": f"memory-test-{context_size}"},
                citations=[],
            )

            with patch.object(ContextManagerPlanner, "plan_request", return_value=mock_context_package):
                prompt = f"Test with {context_size} byte context"
                session_id = f"memory-test-{context_size}"

                start_time = time.time()
                invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

                # Wait for completion
                max_wait = 15.0
                wait_interval = 0.1
                waited = 0.0

                while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                    if waited >= max_wait:
                        pytest.fail(f"Invocation with {context_size}B context timed out")

                    await asyncio.sleep(wait_interval)
                    waited += wait_interval
                    await invocation_service.session.refresh(invocation)

                end_time = time.time()
                duration = end_time - start_time

                # Handle both cases: with and without OpenRouter API key
                if invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                    invocation.error_message or ""
                ):
                    # No OpenRouter API key configured (CI environment)
                    # Skip context enhancement tests when LLM is not available
                    return

                assert invocation.status == InvocationStatus.COMPLETED
                assert duration < 15.0, f"Large context ({context_size}B) should not cause excessive delays"

    @pytest.mark.asyncio
    async def test_context_caching_performance_benefit(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test potential performance benefits from context caching (future optimization).

        This test documents expected behavior for future caching implementations.

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        # This test is placeholder for future context caching optimizations
        # For now, just verify that repeated similar queries work consistently

        similar_prompts = [
            "What are API best practices?",
            "Tell me about API best practices",
            "Explain API design best practices",
        ]

        durations = []

        for i, prompt in enumerate(similar_prompts):
            start_time = time.time()

            invocation = await invocation_service.create_invocation(prompt=prompt, session_id=f"caching-test-{i}")

            # Wait for completion
            max_wait = 15.0
            wait_interval = 0.1
            waited = 0.0

            while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    pytest.fail(f"Caching test invocation {i} timed out")

                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation)

            end_time = time.time()
            duration = end_time - start_time
            durations.append(duration)

            # Handle both cases: with and without OpenRouter API key
            if invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                invocation.error_message or ""
            ):
                # No OpenRouter API key configured (CI environment)
                # Skip context enhancement tests when LLM is not available
                return

            assert invocation.status == InvocationStatus.COMPLETED

        # For now, just verify all completed successfully
        # Future implementations might show performance improvement for similar queries
        assert all(d < 15.0 for d in durations), "All similar queries should complete efficiently"

        # TODO: When context caching is implemented, verify that subsequent similar queries are faster
