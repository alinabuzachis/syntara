"""Unit tests for Context Manager Planner.

This module tests the ContextManagerPlanner orchestration logic
and ensures proper workflow execution and error handling with the
new RetrieverService framework.
"""

from collections.abc import Callable
from contextlib import AbstractContextManager
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest

from nexus.agent_orchestrator.context_manager import (
    ContextManagerPlanner,
    ContextPackage,
)
from nexus.agent_orchestrator.context_manager.compressor import get_compressor_service
from nexus.agent_orchestrator.context_manager.retriever_service.services import get_retriever_service
from nexus.core.database.session import get_db
from nexus.core.models import User
from tests.conftest import FakeSettingsCache


class TestContextManagerPlanner:
    """Test the ContextManagerPlanner orchestration logic."""

    @pytest.fixture(autouse=True)
    def _mock_runtime_settings(  # type: ignore[misc]
        self, override_runtime_settings: Callable[..., AbstractContextManager[FakeSettingsCache]]
    ) -> None:
        """Auto-mock get_runtime_settings for all planner tests."""
        with override_runtime_settings():
            yield

    @pytest.fixture
    def mock_user(self) -> User:
        """Create a mock user for testing."""
        return User(
            id=uuid4(),
            username="testuser",
            email="testuser@example.com",
            full_name="Test User",
        )

    def test_planner_initialization(self) -> None:
        """Test that ContextManagerPlanner initializes with correct default factories."""
        planner = ContextManagerPlanner()

        assert planner.session_factory is get_db
        assert planner.retriever_service_factory is get_retriever_service
        assert planner.compressor_service_factory is get_compressor_service

    @pytest.mark.asyncio
    async def test_plan_request_successful_workflow(self, mock_user: User, mock_compressor) -> None:
        """Test plan_request executes the full workflow successfully with new AssemblerService."""
        # Mock the RetrieverService
        mock_retrieve_service = AsyncMock()
        mock_retrieve_service.retrieve_relevant_documents.return_value = []

        def mock_retriever_factory(session_factory) -> AsyncMock:
            return mock_retrieve_service

        # Mock AssemblerService to return a ContextPackage
        mock_context_package = ContextPackage(
            correlation_id="test-run-123",
            payload={"documents": []},
            grounding_score=0.0,
            citations=[],
            package_metadata={
                "compression_applied": False,
                "compression_retry_count": 0,
                "original_token_count": 0,
                "final_token_count": 0,
            },
        )

        planner = ContextManagerPlanner(
            retriever_service_factory=mock_retriever_factory,
            compressor_service_factory=lambda: mock_compressor,
        )

        with patch(
            "nexus.agent_orchestrator.context_manager.planner.AssemblerService.assemble",
            new_callable=AsyncMock,
            return_value=mock_context_package,
        ) as mock_assemble:
            result = await planner.plan_request(
                correlation_id="test-run-123",
                session_id="test-session",
                query="test query",
                user_id=mock_user.id,
            )

        # Verify return type and structure
        assert isinstance(result, ContextPackage)
        assert result.correlation_id == "test-run-123"
        assert result.grounding_score == pytest.approx(0.0)
        assert result.id is not None  # UUID generated

        # Verify AssemblerService.assemble was called with correct parameters
        mock_assemble.assert_called_once()
        call_kwargs = mock_assemble.call_args.kwargs
        assert call_kwargs["correlation_id"] == "test-run-123"
        assert call_kwargs["documents"] == []
        assert "max_tokens" in call_kwargs
        assert "compression_loop" in call_kwargs
        assert call_kwargs["user_id"] == mock_user.id
        assert "session" in call_kwargs

        # Verify RetrieverService.retrieve_relevant_documents was called
        mock_retrieve_service.retrieve_relevant_documents.assert_called_once()

    @pytest.mark.asyncio
    async def test_plan_request_with_different_parameters(self, mock_user: User, mock_compressor) -> None:
        """Test plan_request with different parameter combinations."""
        mock_context_package = ContextPackage(
            correlation_id="different-run",
            payload={},
            grounding_score=0.0,
            citations=[],
            package_metadata={},
        )

        planner = ContextManagerPlanner(compressor_service_factory=lambda: mock_compressor)

        with patch(
            "nexus.agent_orchestrator.context_manager.planner.AssemblerService.assemble",
            new_callable=AsyncMock,
            return_value=mock_context_package,
        ):
            result = await planner.plan_request(
                correlation_id="different-run",
                session_id="different-session",
                query="different query",
                user_id=mock_user.id,
            )

        assert result.correlation_id == "different-run"

    @pytest.mark.asyncio
    async def test_plan_request_timing_metadata(self, mock_user: User, mock_compressor) -> None:
        """Test that timing metadata is properly recorded in AssemblerService."""
        mock_context_package = ContextPackage(
            correlation_id="timing-test",
            payload={},
            grounding_score=0.0,
            citations=[],
            package_metadata={
                "compression_applied": False,
                "compression_retry_count": 0,
                "original_token_count": 100,
                "final_token_count": 100,
            },
        )

        planner = ContextManagerPlanner(compressor_service_factory=lambda: mock_compressor)

        with patch(
            "nexus.agent_orchestrator.context_manager.planner.AssemblerService.assemble",
            new_callable=AsyncMock,
            return_value=mock_context_package,
        ):
            result = await planner.plan_request(
                correlation_id="timing-test",
                session_id="test-session",
                query="timing query",
                user_id=mock_user.id,
            )

        # Verify metadata from AssemblerService is present
        metadata = result.package_metadata
        assert "compression_applied" in metadata
        assert "compression_retry_count" in metadata
        assert metadata["compression_applied"] is False
        assert metadata["compression_retry_count"] == 0

    @pytest.mark.asyncio
    async def test_plan_request_with_service_exceptions(
        self, mock_user: User, mock_session_factory, mock_compressor
    ) -> None:
        """Test plan_request handles retrieval exceptions gracefully."""
        # Mock retrieval service to raise exception
        mock_retrieve_service = AsyncMock()
        mock_retrieve_service.retrieve_relevant_documents.side_effect = Exception("Retrieval failed")

        def mock_retriever_factory(session_factory) -> AsyncMock:
            return mock_retrieve_service

        # Mock AssemblerService to return a valid package (called even after retrieval fails)
        mock_context_package = ContextPackage(
            correlation_id="error-test",
            payload={},
            grounding_score=0.0,
            citations=[],
            package_metadata={},
        )

        planner = ContextManagerPlanner(
            session_factory=mock_session_factory,
            retriever_service_factory=mock_retriever_factory,
            compressor_service_factory=lambda: mock_compressor,
        )

        with patch(
            "nexus.agent_orchestrator.context_manager.planner.AssemblerService.assemble",
            new_callable=AsyncMock,
            return_value=mock_context_package,
        ) as mock_assemble:
            # Should not raise exception despite retrieval failure
            result = await planner.plan_request(
                correlation_id="error-test",
                session_id="test-session",
                query="error query",
                invocation_id=UUID("12345678-1234-5678-1234-567812345678"),
                user_id=mock_user.id,
            )

            # Verify planner still returns a result despite retrieval error
            assert isinstance(result, ContextPackage)
            assert result.correlation_id == "error-test"

            # Verify AssemblerService was still called (with empty documents)
            assert mock_assemble.called

            # Verify RetrieverService.retrieve_relevant_documents was called
            mock_retrieve_service.retrieve_relevant_documents.assert_called_once()

    @pytest.mark.asyncio
    async def test_plan_request_passes_config_to_assembler(self, mock_user: User, mock_compressor) -> None:
        """Test that planner passes configuration values to AssemblerService."""
        mock_context_package = ContextPackage(
            correlation_id="config-test",
            payload={},
            grounding_score=0.0,
            citations=[],
            package_metadata={},
        )

        planner = ContextManagerPlanner(compressor_service_factory=lambda: mock_compressor)

        with patch(
            "nexus.agent_orchestrator.context_manager.planner.AssemblerService.assemble",
            new_callable=AsyncMock,
            return_value=mock_context_package,
        ) as mock_assemble:
            await planner.plan_request(
                correlation_id="config-test",
                session_id="test-session",
                query="config query",
                user_id=mock_user.id,
            )

            # Verify AssemblerService received config values
            call_kwargs = mock_assemble.call_args.kwargs
            assert call_kwargs["max_tokens"] == 4000  # From settings
            assert "compression_loop" in call_kwargs  # Default: 3
            assert call_kwargs["user_id"] == mock_user.id
            assert "session" in call_kwargs

    @pytest.mark.asyncio
    async def test_plan_request_reads_max_total_tokens_from_settings(
        self,
        mock_compressor,
        override_runtime_settings: Callable[..., AbstractContextManager[FakeSettingsCache]],
    ) -> None:
        """plan_request() must read context_manager.max_total_tokens from runtime settings."""
        mock_context_package = ContextPackage(
            correlation_id="cache-test",
            payload={},
            grounding_score=0.0,
            citations=[],
            package_metadata={},
        )

        with (
            override_runtime_settings({"context_manager.max_total_tokens": 8000}),
            patch(
                "nexus.agent_orchestrator.context_manager.planner.AssemblerService.assemble",
                new_callable=AsyncMock,
                return_value=mock_context_package,
            ) as mock_assemble,
        ):
            planner = ContextManagerPlanner(compressor_service_factory=lambda: mock_compressor)
            await planner.plan_request(correlation_id="cache-test", session_id="test-session", query="cache query")

        call_kwargs = mock_assemble.call_args.kwargs
        assert call_kwargs["max_tokens"] == 8000

    def test_context_package_model_validation(self) -> None:
        """Test ContextPackage model validation."""
        # Test valid ContextPackage creation
        package = ContextPackage(
            correlation_id="validation-test",
            payload={"test": "data"},
            grounding_score=0.5,
            citations=["file-id-1"],  # Updated to use file_id strings
            package_metadata={"key": "value"},
        )

        assert package.correlation_id == "validation-test"
        assert package.payload == {"test": "data"}
        assert package.grounding_score == pytest.approx(0.5)
        assert len(package.citations) == 1
        assert package.citations[0] == "file-id-1"
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
