"""Unit tests for Context Manager service components.

This module tests the individual service classes (RetrieverService,
CompressorService, AssemblerService) to ensure proper stub behavior.
"""

from nexus.agent_orchestrator.context_manager import (
    AssemblerService,
    CompressorService,
    RetrieverService,
    get_default_config,
    get_required_grounding_score,
)


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


class TestConfigurationFunctions:
    """Test the configuration helper functions."""

    def test_get_default_config(self) -> None:
        """Test get_default_config returns expected structure."""
        config = get_default_config()

        assert isinstance(config, dict)

        # Verify required keys exist
        required_keys = [
            "required_grounding_score",
            "minimum_grounding_score",
            "max_total_tokens",
            "max_context_tokens",
            "default_k",
            "enable_hybrid_search",
            "compression_mode",
        ]

        for key in required_keys:
            assert key in config

        # Verify specific values
        assert config["required_grounding_score"] == 0.7
        assert config["minimum_grounding_score"] == 0.5
        assert config["max_total_tokens"] == 4000
        assert config["compression_mode"] == "extractive"
        assert config["enable_hybrid_search"] is True

    def test_get_required_grounding_score(self) -> None:
        """Test get_required_grounding_score returns correct value."""
        score = get_required_grounding_score()

        assert isinstance(score, float)
        assert score == 0.7

    def test_config_is_copy(self) -> None:
        """Test that get_default_config returns a copy, not reference."""
        config1 = get_default_config()
        config2 = get_default_config()

        # Modify one config
        config1["required_grounding_score"] = 0.9

        # Other config should be unchanged
        assert config2["required_grounding_score"] == 0.7
