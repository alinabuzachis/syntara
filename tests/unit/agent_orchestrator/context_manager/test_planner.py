"""Unit tests for Context Manager Planner.

This module tests the ContextManagerPlanner orchestration logic
and ensures proper workflow execution and error handling with the
new RetrieverService framework.
"""

from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest

from nexus.agent_orchestrator.context_manager import (
    ContextManagerPlanner,
    ContextPackage,
)


class TestContextManagerPlanner:
    """Test the ContextManagerPlanner orchestration logic."""

    def test_planner_initialization(self) -> None:
        """Test that ContextManagerPlanner initializes correctly."""
        planner = ContextManagerPlanner()

        assert planner.settings is not None
        assert hasattr(planner.settings, "context_manager_required_grounding_score")
        assert planner.settings.context_manager_required_grounding_score == pytest.approx(0.7)

    @pytest.mark.asyncio
    async def test_plan_request_successful_workflow(self) -> None:
        """Test plan_request executes the full workflow successfully."""
        # Mock the new RetrieverService
        mock_retrieve_service = AsyncMock()
        mock_retrieve_service.retrieve_relevant_documents.return_value = []

        # For parallel execution, we need to directly verify behavior rather than log capture
        # since caplog has issues with pytest-xdist worker processes
        service_calls: list[str] = []

        def mock_retriever_factory(session_factory) -> AsyncMock:
            return mock_retrieve_service

        def mock_compress(
            data: object,
            max_tokens: int,
            strategy: str = "greedy",
            goal: object = None,
            correlation_id: str = "unknown",
        ) -> str:
            service_calls.append(f"compress:{correlation_id}")
            return "mocked compressed content"

        def mock_assemble(sections: object, correlation_id: str) -> None:
            service_calls.append(f"assemble:{correlation_id}")

        planner = ContextManagerPlanner(retriever_service_factory=mock_retriever_factory)

        with (
            patch(
                "nexus.agent_orchestrator.context_manager.planner.CompressorService.compress", side_effect=mock_compress
            ),
            patch(
                "nexus.agent_orchestrator.context_manager.planner.AssemblerService.assemble", side_effect=mock_assemble
            ),
        ):
            result = await planner.plan_request(
                correlation_id="test-run-123", session_id="test-session", query="test query"
            )

        # Verify return type and structure
        assert isinstance(result, ContextPackage)
        assert result.correlation_id == "test-run-123"
        assert result.grounding_score == pytest.approx(0.0)  # MVP default
        assert result.payload == {}  # MVP empty
        assert result.citations == []  # MVP empty
        assert result.id is not None  # UUID generated

        # Verify metadata structure
        assert "session_id" in result.package_metadata
        assert "query" in result.package_metadata
        assert "retrieval_time_ms" in result.package_metadata
        assert "compression_time_ms" in result.package_metadata
        assert "assembly_time_ms" in result.package_metadata
        assert "total_time_ms" in result.package_metadata

        assert result.package_metadata["session_id"] == "test-session"
        assert result.package_metadata["query"] == "test query"
        # correlation_id is stored in the model field, not package_metadata
        assert result.correlation_id == "test-run-123"

        # Verify all services were called through mock tracking
        # Compression is skipped when retrieved_docs is None (current stub behavior)
        assert "compress:test-run-123" not in service_calls
        assert "assemble:test-run-123" in service_calls

        # Verify RetrieverService.retrieve_relevant_documents was called
        mock_retrieve_service.retrieve_relevant_documents.assert_called_once()

    @pytest.mark.asyncio
    async def test_plan_request_with_different_parameters(self) -> None:
        """Test plan_request with different parameter combinations."""
        planner = ContextManagerPlanner()

        result = await planner.plan_request(
            correlation_id="different-run", session_id="different-session", query="different query"
        )

        assert result.correlation_id == "different-run"
        assert result.package_metadata["session_id"] == "different-session"
        assert result.package_metadata["query"] == "different query"

    @pytest.mark.asyncio
    async def test_plan_request_timing_metadata(self) -> None:
        """Test that timing metadata is properly recorded."""
        planner = ContextManagerPlanner()

        result = await planner.plan_request(
            correlation_id="timing-test", session_id="test-session", query="timing query"
        )

        # Verify timing fields exist and are reasonable
        metadata = result.package_metadata
        assert isinstance(metadata["retrieval_time_ms"], int)
        assert isinstance(metadata["compression_time_ms"], int)
        assert isinstance(metadata["assembly_time_ms"], int)
        assert isinstance(metadata["total_time_ms"], int)

        # Timing should be non-negative and reasonable for MVP stubs
        assert metadata["retrieval_time_ms"] >= 0
        assert metadata["compression_time_ms"] >= 0
        assert metadata["assembly_time_ms"] >= 0
        assert metadata["total_time_ms"] >= 0

        # Total time should be at least the sum of phases
        total_phases = metadata["retrieval_time_ms"] + metadata["compression_time_ms"] + metadata["assembly_time_ms"]
        assert metadata["total_time_ms"] >= total_phases

    @pytest.mark.asyncio
    async def test_plan_request_with_service_exceptions(self) -> None:
        """Test plan_request handles service exceptions gracefully."""
        # Mock services to raise exceptions
        mock_retrieve_service = AsyncMock()
        mock_retrieve_service.retrieve_relevant_documents.side_effect = Exception("Retrieval failed")

        def mock_retriever_factory(session_factory) -> AsyncMock:
            return mock_retrieve_service

        planner = ContextManagerPlanner(retriever_service_factory=mock_retriever_factory)

        with (
            patch("nexus.agent_orchestrator.context_manager.planner.CompressorService.compress") as mock_compress,
            patch("nexus.agent_orchestrator.context_manager.planner.AssemblerService.assemble") as mock_assemble,
        ):
            mock_compress.side_effect = Exception("Compression failed")
            mock_assemble.side_effect = Exception("Assembly failed")

            # Should not raise exception despite service failures
            result = await planner.plan_request(
                correlation_id="error-test",
                session_id="test-session",
                query="error query",
                invocation_id=UUID("12345678-1234-5678-1234-567812345678"),
            )

            # Verify planner still returns a result despite errors
            assert isinstance(result, ContextPackage)
            assert result.correlation_id == "error-test"

            # Compression is only called if retrieval succeeds and returns documents
            # In this test, retrieval fails, so compression is skipped - this is correct behavior
            assert mock_assemble.called

            # Verify RetrieverService.retrieve_relevant_documents was called
            mock_retrieve_service.retrieve_relevant_documents.assert_called_once()

            # Verify timing metadata still recorded
            assert "retrieval_time_ms" in result.package_metadata
            assert "compression_time_ms" in result.package_metadata
            assert "assembly_time_ms" in result.package_metadata

    @pytest.mark.asyncio
    async def test_plan_request_config_in_metadata(self) -> None:
        """Test that configuration values are included in metadata."""
        planner = ContextManagerPlanner()

        result = await planner.plan_request(
            correlation_id="config-test", session_id="test-session", query="config query"
        )

        # Verify config values are in metadata
        assert "config_used" in result.package_metadata
        config_used = result.package_metadata["config_used"]

        assert "required_grounding_score" in config_used
        assert "max_total_tokens" in config_used
        assert config_used["required_grounding_score"] == pytest.approx(0.7)
        assert config_used["max_total_tokens"] == 4000

    def test_context_package_model_validation(self) -> None:
        """Test ContextPackage model validation."""
        # Test valid ContextPackage creation
        package = ContextPackage(
            correlation_id="validation-test",
            payload={"test": "data"},
            grounding_score=0.5,
            citations=[{"id": "1", "uri": "test://example"}],
            package_metadata={"key": "value"},
        )

        assert package.correlation_id == "validation-test"
        assert package.payload == {"test": "data"}
        assert package.grounding_score == pytest.approx(0.5)
        assert len(package.citations) == 1
        # Check the expected metadata
        assert "key" in package.package_metadata
        assert package.package_metadata["key"] == "value"
        assert package.id is not None  # UUID auto-generated

    def test_context_package_grounding_score_validation(self) -> None:
        """Test ContextPackage grounding score validation bounds."""
        # Test valid grounding scores
        package1 = ContextPackage(correlation_id="test", grounding_score=0.0)
        assert package1.grounding_score == pytest.approx(0.0)

        package2 = ContextPackage(correlation_id="test", grounding_score=1.0)
        assert package2.grounding_score == pytest.approx(1.0)

        # Test invalid grounding scores (should be caught by pydantic validation)
        with pytest.raises(Exception, match=r"ensure this value is greater than or equal to|validation error"):
            ContextPackage(correlation_id="test", grounding_score=-0.1)

        with pytest.raises(Exception, match=r"ensure this value is less than or equal to|validation error"):
            ContextPackage(correlation_id="test", grounding_score=1.1)
