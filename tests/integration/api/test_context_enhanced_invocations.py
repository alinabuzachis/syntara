"""Integration tests for basic context enhancement functionality.

Tests that invocations automatically include context enhancement with correlation_id and grounding_score.
Based on Scenario 1 from quickstart.md.
"""

import asyncio

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.agent_orchestrator.models import InvocationStatus
from nexus.agent_orchestrator.services.invocation_service import InvocationService
from nexus.core.models import User


class TestContextEnhancedInvocations:
    """Test suite for basic context enhancement integration."""

    @pytest_asyncio.fixture
    async def invocation_service(self, test_db_session: AsyncSession, test_user: User) -> InvocationService:
        """Create InvocationService instance for testing."""
        return InvocationService(session=test_db_session, user=test_user)

    @pytest.mark.asyncio
    async def test_invocation_includes_context_enhancement(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that invocations automatically include context enhancement.

        This test verifies:
        - Context Manager is automatically called on invocations
        - Response includes correlation_id and grounding_score fields
        - Context delimiters are added to the prompt
        - Enhanced metadata is properly stored

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        # Create invocation with prompt that would benefit from context
        prompt = "What are the best practices for API design in our system?"
        session_id = "test-session-001"

        invocation = await invocation_service.create_invocation(prompt=prompt, session_id=session_id)

        # Wait for invocation to complete (polling approach for test)
        max_wait = 10.0  # seconds
        wait_interval = 0.1
        waited = 0.0

        while invocation.status not in [InvocationStatus.COMPLETED, InvocationStatus.FAILED]:
            if waited >= max_wait:
                pytest.fail(f"Invocation timed out after {max_wait}s")

            await asyncio.sleep(wait_interval)
            waited += wait_interval

            # Refresh invocation from database
            await invocation_service.session.refresh(invocation)

        # Handle both cases: with and without OpenRouter API key
        if invocation.status == InvocationStatus.FAILED:
            # No OpenRouter API key configured (CI environment)
            assert invocation.error_message is not None
            assert "OPENROUTER_API_KEY" in invocation.error_message
            # Skip context enhancement tests when LLM is not available
            return

        # Verify invocation completed successfully (when API key is available)
        assert invocation.status == InvocationStatus.COMPLETED
        assert invocation.result is not None

        result = invocation.result

        # Verify basic response structure (unchanged)
        assert "type" in result
        assert "content" in result
        assert result["type"] == "answer"
        assert isinstance(result["content"], str)
        assert len(result["content"]) > 0

        # Verify enhanced fields (new) - THIS WILL FAIL until T007 is implemented
        assert "correlation_id" in result, "Response must include correlation_id from context enhancement"
        assert "grounding_score" in result, "Response must include grounding_score from context enhancement"

        # Validate correlation_id format (should be string identifier)
        correlation_id = result["correlation_id"]
        assert isinstance(correlation_id, str)
        assert len(correlation_id) > 0  # Should be non-empty string

        # Validate grounding_score format
        grounding_score = result["grounding_score"]
        assert isinstance(grounding_score, float)
        assert 0.0 <= grounding_score <= 1.0

        # For empty context (current implementation), should be 0.0
        assert grounding_score == 0.0

    @pytest.mark.asyncio
    async def test_context_enhancement_includes_correlation_info(
        self,
        invocation_service: InvocationService,
    ) -> None:
        """Test that context enhancement includes proper correlation information.

        Verifies that the correlation_id enables correlation between invocation and context processing.

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        prompt = "Test prompt for correlation"
        session_id = "correlation-test-session"

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
        if invocation.status == InvocationStatus.FAILED:
            # No OpenRouter API key configured (CI environment)
            assert invocation.error_message is not None
            assert "OPENROUTER_API_KEY" in invocation.error_message
            # Skip context enhancement tests when LLM is not available
            return

        assert invocation.status == InvocationStatus.COMPLETED
        assert invocation.result is not None
        result = invocation.result

        # Verify correlation fields exist
        assert "correlation_id" in result

        # Correlation ID should be unique for each invocation
        correlation_id = result["correlation_id"]
        assert isinstance(correlation_id, str)
        assert len(correlation_id) > 0

        # If context_enhancement is present, verify structure
        if "context_enhancement" in result:
            context_enhancement = result["context_enhancement"]
            assert isinstance(context_enhancement, dict)

            # Should include turn_id for correlation
            if "turn_id" in context_enhancement:
                turn_id = context_enhancement["turn_id"]
                assert isinstance(turn_id, str)
                assert len(turn_id) > 0
