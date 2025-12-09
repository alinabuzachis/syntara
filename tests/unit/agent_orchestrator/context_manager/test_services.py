"""Unit tests for Context Manager service components.

This module tests the individual service classes (RetrieverService,
CompressorService, AssemblerService) to ensure proper stub behavior.
"""

from nexus.agent_orchestrator.context_manager import (
    AssemblerService,
    CompressorService,
    RetrieverService,
)
from nexus.core.config import get_settings


class TestRetrieverService:
    """Test the RetrieverService stub implementation."""

    def test_retriever_initialization(self) -> None:
        """Test RetrieverService initializes correctly."""
        service = RetrieverService()
        assert service is not None

    def test_retrieve_method_call(self) -> None:
        """Test retrieve method executes and returns None."""
        service = RetrieverService()

        # Method should execute without raising exception
        service.retrieve("test query", "test-correlation-456")

    def test_retrieve_with_different_parameters(self) -> None:
        """Test retrieve method with different parameter values."""
        service = RetrieverService()

        # Method should execute without raising exception
        service.retrieve("different query", "different-correlation")


class TestCompressorService:
    """Test the CompressorService stub implementation."""

    def test_compressor_initialization(self) -> None:
        """Test CompressorService initializes correctly."""
        service = CompressorService()
        assert service is not None

    def test_compress_method_call(self) -> None:
        """Test compress method executes and returns None."""
        service = CompressorService()
        test_docs = [{"id": "1", "text": "test document"}]

        # Method should execute without raising exception
        service.compress(test_docs, "test-correlation-789")

    def test_compress_with_none_docs(self) -> None:
        """Test compress method with None documents."""
        service = CompressorService()

        # Method should execute without raising exception
        service.compress(None, "none-docs-correlation")


class TestAssemblerService:
    """Test the AssemblerService stub implementation."""

    def test_assembler_initialization(self) -> None:
        """Test AssemblerService initializes correctly."""
        service = AssemblerService()
        assert service is not None

    def test_assemble_method_call(self) -> None:
        """Test assemble method executes and returns None."""
        service = AssemblerService()
        test_sections = {"section1": "content1", "section2": "content2"}

        # Method should execute without raising exception
        service.assemble(test_sections, "test-correlation-101")

    def test_assemble_with_empty_sections(self) -> None:
        """Test assemble method with empty sections dict."""
        service = AssemblerService()

        # Method should execute without raising exception
        service.assemble({}, "empty-sections-correlation")


class TestContextManagerSettings:
    """Test the Context Manager settings integration."""

    def test_context_manager_settings_accessible(self) -> None:
        """Test Context Manager settings are accessible via get_settings()."""
        settings = get_settings()

        # Verify grounding score settings
        assert hasattr(settings, "context_manager_required_grounding_score")
        assert hasattr(settings, "context_manager_minimum_grounding_score")
        assert isinstance(settings.context_manager_required_grounding_score, float)
        assert isinstance(settings.context_manager_minimum_grounding_score, float)

    def test_context_manager_default_values(self) -> None:
        """Test Context Manager settings have expected default values."""
        settings = get_settings()

        # Verify specific default values
        assert settings.context_manager_required_grounding_score == 0.7
        assert settings.context_manager_minimum_grounding_score == 0.5
        assert settings.context_manager_max_total_tokens == 4000
        assert settings.context_manager_max_context_tokens == 3000
        assert settings.context_manager_default_k == 10
        assert settings.context_manager_enable_hybrid_search is True
        assert settings.context_manager_compression_mode == "extractive"

    def test_context_manager_settings_cached(self) -> None:
        """Test that get_settings() returns the same instance (cached)."""
        settings1 = get_settings()
        settings2 = get_settings()

        # Should be the same cached instance
        assert settings1 is settings2
