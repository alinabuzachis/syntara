"""Integration tests for ContextManagerPlanner with AssemblerService.

This module tests the planner integration with the real AssemblerService,
verifying proper dependency injection and parameter passing.
"""

import contextlib
import math
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from unittest.mock import AsyncMock, patch

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.context_manager.compressor import CompressorService
from nexus.agent_orchestrator.context_manager.file_manager import FileMetadata
from nexus.agent_orchestrator.context_manager.models import ContextPackage
from nexus.agent_orchestrator.context_manager.planner import ContextManagerPlanner
from nexus.agent_orchestrator.context_manager.retriever_service.models.relevant_document import (
    RelevantDocument,
)
from nexus.agent_orchestrator.context_manager.retriever_service.services import RetrieverService
from nexus.core.models import User


def create_test_document(
    content: str,
    relevancy_score: float,
    file_id: str = "file-1",
    filename: str = "test1.txt",
) -> RelevantDocument:
    """Create a test RelevantDocument with common defaults."""
    return RelevantDocument(
        content=content,
        relevancy_score=relevancy_score,
        file_metadata=FileMetadata(
            file_id=file_id,
            filename=filename,
            size_bytes=100,
            mime_type="text/plain",
            file_path=f"/path/to/{filename}",
        ),
        source_type="uploaded_file",
    )


def create_mock_retriever(docs: list[RelevantDocument]) -> AsyncMock:
    """Create a mocked RetrieverService that returns the given documents."""
    mock_retriever = AsyncMock()
    mock_retriever.retrieve_relevant_documents.return_value = docs
    return mock_retriever


def create_retriever_factory(
    mock_retriever: AsyncMock,
) -> Callable[[Callable[[], AsyncGenerator[AsyncSession, None]]], RetrieverService]:
    """Create a retriever factory that returns the mocked retriever."""

    def factory(
        session_factory: Callable[[], AsyncGenerator[AsyncSession, None]],
    ) -> RetrieverService:
        return mock_retriever

    return factory


def create_compressor_factory(mock_compressor: AsyncMock | None = None) -> Callable[[], CompressorService]:
    """Create a compressor factory that returns a mocked compressor."""
    if mock_compressor is None:
        mock_compressor = AsyncMock()

    def factory() -> CompressorService:
        return mock_compressor

    return factory


async def execute_planner_request(
    planner: ContextManagerPlanner,
    test_db_session: AsyncSession,
    test_user: User,
    correlation_id: str,
) -> ContextPackage:
    """Execute plan_request with standard mocking setup.

    This helper reduces duplication by encapsulating the common pattern of:
    - Creating async session context manager
    - Patching get_async_session_context
    - Patching get_current_user
    - Executing plan_request
    """

    @contextlib.asynccontextmanager
    async def mock_session_context() -> AsyncIterator[AsyncSession]:
        yield test_db_session

    with (
        patch.object(planner, "get_async_session_context", mock_session_context),
        patch(
            "nexus.agent_orchestrator.context_manager.planner.get_current_user",
            new_callable=AsyncMock,
            return_value=test_user,
        ),
    ):
        return await planner.plan_request(
            correlation_id=correlation_id,
            session_id="test-session",
            query="test query",
        )


@pytest.mark.asyncio
class TestPlannerAssemblerIntegration:
    """Integration tests for planner with AssemblerService."""

    @pytest.mark.usefixtures("test_user_token_config")
    async def test_planner_invokes_assembler_with_compression_loop(
        self,
        test_db_session,
        test_user,
    ) -> None:
        """Test planner passes compression_loop parameter correctly to AssemblerService."""
        docs = [create_test_document("Test document content", 0.8)]

        mock_retriever = create_mock_retriever(docs)
        planner = ContextManagerPlanner(
            retriever_service_factory=create_retriever_factory(mock_retriever),
            compressor_service_factory=create_compressor_factory(),
        )

        result = await execute_planner_request(planner, test_db_session, test_user, "test-integration")

        # Verify ContextPackage was returned
        assert result is not None
        assert result.correlation_id == "test-integration"

        # Verify package_metadata contains compression info
        assert "compression_applied" in result.package_metadata
        assert "compression_retry_count" in result.package_metadata

        # Verify retriever was called
        mock_retriever.retrieve_relevant_documents.assert_called_once()

    @pytest.mark.usefixtures("test_user_token_config")
    async def test_planner_injects_dependencies_into_assembler(
        self,
        test_db_session,
        test_user,
    ) -> None:
        """Test planner injects TokenValidationService and CompressorService into AssemblerService."""
        docs = [create_test_document("Short document", 0.9)]

        mock_retriever = create_mock_retriever(docs)
        planner = ContextManagerPlanner(
            retriever_service_factory=create_retriever_factory(mock_retriever),
            compressor_service_factory=create_compressor_factory(),
        )

        result = await execute_planner_request(planner, test_db_session, test_user, "test-dependencies")

        # Verify result is valid
        assert result is not None
        assert result.correlation_id == "test-dependencies"

        # Verify grounding score was computed (indicates AssemblerService worked)
        assert math.isclose(result.grounding_score, 0.9)

        # Verify citations were extracted
        assert len(result.citations) == 1
        assert result.citations[0] == "file-1"

    @pytest.mark.usefixtures("test_user_token_config")
    async def test_planner_calls_assembler_with_injected_compressor(
        self,
        test_db_session,
        test_user,
    ) -> None:
        """Test planner injects CompressorService into AssemblerService correctly."""
        docs = [create_test_document("Test content", 0.8)]

        # Mock compressor to verify it gets injected
        mock_compressor = AsyncMock()
        mock_compressor.compress = AsyncMock(return_value="Compressed content")

        mock_retriever = create_mock_retriever(docs)
        planner = ContextManagerPlanner(
            retriever_service_factory=create_retriever_factory(mock_retriever),
            compressor_service_factory=create_compressor_factory(mock_compressor),
        )

        result = await execute_planner_request(planner, test_db_session, test_user, "test-compression")

        # Verify result is valid
        assert result is not None
        assert result.correlation_id == "test-compression"

    @pytest.mark.usefixtures("test_user_token_config")
    async def test_planner_returns_context_package_directly_from_assembler(
        self,
        test_db_session,
        test_user,
    ) -> None:
        """Test planner returns ContextPackage directly from AssemblerService without rebuilding."""
        docs = [
            create_test_document("Document 1", 0.7, "file-1", "test1.txt"),
            create_test_document("Document 2", 0.9, "file-2", "test2.txt"),
        ]

        mock_retriever = create_mock_retriever(docs)
        planner = ContextManagerPlanner(
            retriever_service_factory=create_retriever_factory(mock_retriever),
            compressor_service_factory=create_compressor_factory(),
        )

        result = await execute_planner_request(planner, test_db_session, test_user, "test-direct-return")

        # Verify ContextPackage has all AssemblerService-generated fields
        assert result.correlation_id == "test-direct-return"
        assert math.isclose(result.grounding_score, 0.8)  # (0.7 + 0.9) / 2

        # Verify citations from AssemblerService
        assert len(result.citations) == 2
        assert "file-1" in result.citations
        assert "file-2" in result.citations

        # Verify payload was built by AssemblerService
        assert result.payload is not None
        assert "documents" in result.payload
        assert len(result.payload["documents"]) == 2
