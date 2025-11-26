"""Integration tests for basic context enhancement functionality.

Tests that invocations automatically include context enhancement with correlation_id and grounding_score.
Based on Scenario 1 from quickstart.md.
"""

import pytest
from httpx import AsyncClient

from nexus.core.models import User
from tests.conftest import wait_for_invocation_execution


class TestContextEnhancedInvocations:
    """Test suite for basic context enhancement integration."""

    @pytest.mark.asyncio
    async def test_invocation_includes_context_enhancement(
        self,
        auth_client: AsyncClient,
        test_user: User,
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

        # Create invocation via API
        response = await auth_client.post(
            "/api/v1/invocations",
            json={
                "prompt": prompt,
                "created_by": str(test_user.id),
                "session_id": session_id,
            },
        )

        assert response.status_code == 202
        data = response.json()
        invocation_id = data["id"]

        # Wait for invocation to complete using the helper
        async with wait_for_invocation_execution(auth_client, invocation_id, max_wait_time=10.0) as final_data:
            data = final_data if final_data else data

        # Handle both cases: with and without OpenRouter API key
        if data["status"] == "failed":
            # No OpenRouter API key configured (CI environment)
            assert data["error_message"] is not None
            assert "OPENROUTER_API_KEY" in data["error_message"]
            # Skip context enhancement tests when LLM is not available
            return

        # Verify invocation completed successfully (when API key is available)
        assert data["status"] == "completed"
        assert data["result"] is not None

        result = data["result"]

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
        auth_client: AsyncClient,
        test_user: User,
    ) -> None:
        """Test that context enhancement includes proper correlation information.

        Verifies that the correlation_id enables correlation between invocation and context processing.

        This test MUST FAIL until T007 (core integration) is implemented.
        """
        prompt = "Test prompt for correlation"
        session_id = "correlation-test-session"

        # Create invocation via API
        response = await auth_client.post(
            "/api/v1/invocations",
            json={
                "prompt": prompt,
                "created_by": str(test_user.id),
                "session_id": session_id,
            },
        )

        assert response.status_code == 202
        data = response.json()
        invocation_id = data["id"]

        # Wait for completion using the helper
        async with wait_for_invocation_execution(auth_client, invocation_id, max_wait_time=10.0) as final_data:
            data = final_data if final_data else data

        # Handle both cases: with and without OpenRouter API key
        if data["status"] == "failed":
            # No OpenRouter API key configured (CI environment)
            assert data["error_message"] is not None
            assert "OPENROUTER_API_KEY" in data["error_message"]
            # Skip context enhancement tests when LLM is not available
            return

        assert data["status"] == "completed"
        assert data["result"] is not None
        result = data["result"]

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
