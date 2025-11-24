"""Integration tests for context quality validation and grounding score metrics.

Tests that context enhancement provides meaningful quality improvements and metrics.
Based on Scenario 4 from quickstart.md.
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


class TestContextQualityMetrics:
    """Test suite for context quality validation and grounding score accuracy."""

    @pytest_asyncio.fixture
    async def invocation_service(self, test_db_session: AsyncSession, test_user: User) -> InvocationService:
        """Create InvocationService instance for testing."""
        return InvocationService(session=test_db_session, user=test_user)

    @pytest.mark.asyncio
    async def test_grounding_score_reflects_context_quality(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that grounding scores accurately reflect context quality.

        This verifies:
        - Empty context returns grounding_score = 0.0
        - High-quality context returns higher grounding scores
        - Grounding scores are in valid range (0.0-1.0)

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        # Test 1: Empty context (current minimal implementation)
        prompt_empty_context = "Simple greeting that needs no context"
        session_id = "empty-context-test"

        invocation = await invocation_service.create_invocation(prompt=prompt_empty_context, session_id=session_id)

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
        if invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (invocation.error_message or ""):
            # No OpenRouter API key configured (CI environment)
            # Skip context enhancement tests when LLM is not available
            return

        assert invocation.status == InvocationStatus.COMPLETED
        assert invocation.result is not None
        result = invocation.result

        # Empty context should have grounding score 0.0
        assert "grounding_score" in result, "Response must include grounding_score"
        grounding_score = result["grounding_score"]
        assert isinstance(grounding_score, float)
        assert grounding_score == 0.0, "Empty context should have grounding score 0.0"

        # Test 2: Simulate high-quality context (for future when context is populated)
        mock_context_package = ContextPackage(
            correlation_id="test-trace-123",
            payload={
                "relevant_docs": "High-quality contextual information about the query topic",
                "related_examples": "Specific examples relevant to the user's question",
            },
            grounding_score=0.85,  # High quality context
            package_metadata={"test_metadata": "test-trace-123"},
            citations=[{"source": "doc1", "relevance": 0.9}, {"source": "doc2", "relevance": 0.8}],
        )

        with patch.object(ContextManagerPlanner, "plan_request", return_value=mock_context_package):
            prompt_with_context = "Complex technical question requiring context"
            session_id_context = "high-context-test"

            invocation_context = await invocation_service.create_invocation(
                prompt=prompt_with_context, session_id=session_id_context
            )

            # Wait for completion
            waited = 0.0
            while invocation_context.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    pytest.fail(f"Invocation with context timed out after {max_wait}s")

                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation_context)

            # Handle both cases: with and without OpenRouter API key
            if invocation_context.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                invocation_context.error_message or ""
            ):
                # No OpenRouter API key configured (CI environment)
                # Skip context enhancement tests when LLM is not available
                return

            assert invocation_context.status == InvocationStatus.COMPLETED
            assert invocation_context.result is not None
            result_context = invocation_context.result

            # High-quality context should have higher grounding score
            assert "grounding_score" in result_context
            context_grounding_score = result_context["grounding_score"]
            assert isinstance(context_grounding_score, float)
            assert context_grounding_score == 0.85, "Should reflect context package grounding score"

    @pytest.mark.asyncio
    async def test_grounding_score_range_validation(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that grounding scores are always in valid range (0.0-1.0).

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        test_scores = [0.0, 0.25, 0.5, 0.75, 1.0]

        for score in test_scores:
            mock_context_package = ContextPackage(
                correlation_id=f"test-{score}",
                payload={"test": "data"},
                grounding_score=score,
                package_metadata={"test_metadata": f"test-{score}"},
                citations=[],
            )

            with patch.object(ContextManagerPlanner, "plan_request", return_value=mock_context_package):
                prompt = f"Test prompt for score {score}"
                session_id = f"score-test-{score}"

                invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

                # Wait for completion
                max_wait = 10.0
                wait_interval = 0.1
                waited = 0.0

                while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                    if waited >= max_wait:
                        pytest.fail(f"Invocation timed out after {max_wait}s for score {score}")

                    await asyncio.sleep(wait_interval)
                    waited += wait_interval
                    await invocation_service.session.refresh(invocation)

                # Handle both cases: with and without OpenRouter API key
                if invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                    invocation.error_message or ""
                ):
                    # No OpenRouter API key configured (CI environment)
                    # Skip context enhancement tests when LLM is not available
                    return

                assert invocation.status == InvocationStatus.COMPLETED
                assert invocation.result is not None
                result = invocation.result

                assert "grounding_score" in result
                returned_score = result["grounding_score"]
                assert isinstance(returned_score, float)
                assert 0.0 <= returned_score <= 1.0, f"Score {returned_score} must be in range 0.0-1.0"
                assert returned_score == score, f"Should preserve original score {score}"

    @pytest.mark.asyncio
    async def test_context_enhancement_completeness(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that context enhancement provides complete information for quality assessment.

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        mock_context_package = ContextPackage(
            correlation_id="metadata-test-123",
            payload={"context": "test content"},
            grounding_score=0.75,
            package_metadata={
                "context_status": "populated",
                "processing_time": 0.250,
            },
            citations=[
                {"source": "doc1.md", "relevance": 0.8, "snippet": "relevant text"},
                {"source": "api_spec.yaml", "relevance": 0.7, "snippet": "API documentation"},
            ],
        )

        with patch.object(ContextManagerPlanner, "plan_request", return_value=mock_context_package):
            prompt = "Test metadata completeness"
            session_id = "metadata-completeness-test"

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
                # Skip context enhancement tests when LLM is not available
                return

            assert invocation.status == InvocationStatus.COMPLETED
            assert invocation.result is not None
            result = invocation.result

            # Verify core quality metrics
            assert "correlation_id" in result
            assert "grounding_score" in result
            assert result["grounding_score"] == 0.75

            # Verify correlation_id is from context package
            assert result["correlation_id"] == "metadata-test-123"

            # If context_enhancement is exposed in response, verify structure
            if "context_enhancement" in result:
                context_enhancement = result["context_enhancement"]
                assert isinstance(context_enhancement, dict)

                # Should include citations for quality assessment
                if "citations" in context_enhancement:
                    citations = context_enhancement["citations"]
                    assert isinstance(citations, list)
                    assert len(citations) == 2

    @pytest.mark.asyncio
    async def test_empty_vs_populated_context_distinction(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that system can distinguish between empty and populated context scenarios.

        This helps validate that quality metrics are meaningful.

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        # Test 1: Explicitly empty context
        mock_empty_context = ContextPackage(
            correlation_id="empty-test",
            payload={},
            grounding_score=0.0,
            package_metadata={"context_status": "empty"},
            citations=[],
        )

        with patch.object(ContextManagerPlanner, "plan_request", return_value=mock_empty_context):
            invocation_empty = await invocation_service.create_invocation(
                prompt="Test empty context", session_id="empty-context-distinction"
            )

            # Wait and verify
            max_wait = 10.0
            wait_interval = 0.1
            waited = 0.0

            while invocation_empty.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    pytest.fail("Empty context invocation timed out")
                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation_empty)

            # Handle both cases: with and without OpenRouter API key
            if invocation_empty.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                invocation_empty.error_message or ""
            ):
                # No OpenRouter API key configured (CI environment)
                # Skip context enhancement tests when LLM is not available
                return

            assert invocation_empty.result is not None
            result_empty = invocation_empty.result
            assert result_empty["grounding_score"] == 0.0

        # Test 2: Populated context
        mock_populated_context = ContextPackage(
            correlation_id="populated-test",
            payload={"docs": "relevant content"},
            grounding_score=0.6,
            package_metadata={"context_status": "populated"},
            citations=[{"source": "test.md"}],
        )

        with patch.object(ContextManagerPlanner, "plan_request", return_value=mock_populated_context):
            invocation_populated = await invocation_service.create_invocation(
                prompt="Test populated context", session_id="populated-context-distinction"
            )

            # Wait and verify
            waited = 0.0
            while invocation_populated.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    pytest.fail("Populated context invocation timed out")
                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation_populated)

            # Handle both cases: with and without OpenRouter API key
            if invocation_populated.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                invocation_populated.error_message or ""
            ):
                # No OpenRouter API key configured (CI environment)
                # Skip context enhancement tests when LLM is not available
                return

            assert invocation_populated.result is not None
            result_populated = invocation_populated.result
            assert result_populated["grounding_score"] == 0.6

        # Verify distinction is clear
        empty_score = result_empty["grounding_score"]
        populated_score = result_populated["grounding_score"]
        assert isinstance(empty_score, (int, float))
        assert isinstance(populated_score, (int, float))
        assert empty_score < populated_score, "Populated context should have higher grounding score than empty context"

    @pytest.mark.asyncio
    async def test_context_correlation_via_correlation_id(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that correlation_id enables proper correlation between invocation and context.

        This verifies the debugging/observability aspect of context quality.

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        unique_correlation_id = "correlation-test-12345"
        mock_context_package = ContextPackage(
            correlation_id=unique_correlation_id,
            payload={"test": "correlation"},
            grounding_score=0.5,
            package_metadata={"test_metadata": unique_correlation_id},
            citations=[],
        )

        with patch.object(ContextManagerPlanner, "plan_request", return_value=mock_context_package):
            prompt = "Test trace ID correlation"
            session_id = "correlation-test"

            invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

            # Wait for completion
            max_wait = 10.0
            wait_interval = 0.1
            waited = 0.0

            while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
                if waited >= max_wait:
                    pytest.fail("Correlation test invocation timed out")
                await asyncio.sleep(wait_interval)
                waited += wait_interval
                await invocation_service.session.refresh(invocation)

            # Handle both cases: with and without OpenRouter API key
            if invocation.status == InvocationStatus.FAILED and "OPENROUTER_API_KEY" in (
                invocation.error_message or ""
            ):
                # No OpenRouter API key configured (CI environment)
                # Skip context enhancement tests when LLM is not available
                return

            assert invocation.status == InvocationStatus.COMPLETED
            assert invocation.result is not None
            result = invocation.result

            # Verify correlation_id correlation
            assert "correlation_id" in result
            assert result["correlation_id"] == unique_correlation_id

            # Correlation_id should enable correlation between invocation.id and context processing
            # This is essential for debugging and observability
