"""Unit tests for Context Manager service components.

This module tests the individual service classes (CompressorService, AssemblerService) to ensure proper stub behavior.
"""

import math
from unittest.mock import AsyncMock, Mock

import pytest

from nexus.agent_orchestrator.context_manager import (
    AssemblerService,
    CompressorService,
)
from nexus.core.config.base import get_settings


class TestCompressorService:
    """Test the CompressorService stub implementation."""

    def test_compressor_initialization(self) -> None:
        """Test CompressorService initializes correctly."""
        mock_llm = AsyncMock()
        service = CompressorService(llm=mock_llm)
        assert service is not None

    async def test_compress_method_call(self) -> None:
        """Test compress method with valid string data."""
        # Mock dependencies to avoid actual LLM calls
        mock_token_calculator = Mock()
        mock_token_calculator.count_tokens.return_value = 50

        mock_llm = AsyncMock()
        service = CompressorService(token_calculator=mock_token_calculator, llm=mock_llm)
        test_docs = ["test document"]

        # Method should execute and return string content
        result = await service.compress(
            data=test_docs, max_tokens=100, strategy="greedy", correlation_id="test-correlation-789"
        )
        assert isinstance(result, str)
        assert len(result) > 0


class TestAssemblerService:
    """Test the AssemblerService implementation."""

    def test_assembler_initialization(self) -> None:
        """Test AssemblerService initializes correctly with dependencies."""
        token_service = Mock()
        compressor_service = AsyncMock()
        service = AssemblerService(
            token_service=token_service,
            compressor_service=compressor_service,
        )
        assert service is not None
        assert service.token_service is token_service
        assert service.compressor_service is compressor_service

    @pytest.mark.asyncio
    async def test_assemble_method_with_empty_documents(self) -> None:
        """Test assemble method with empty documents returns valid ContextPackage."""
        token_service = Mock()
        compressor_service = AsyncMock()
        service = AssemblerService(
            token_service=token_service,
            compressor_service=compressor_service,
        )

        # Method should execute and return ContextPackage
        result = await service.assemble(
            documents=[],
            correlation_id="test-correlation-101",
            max_tokens=1000,
            compression_loop=0,
        )

        assert result is not None
        assert result.correlation_id == "test-correlation-101"
        assert math.isclose(result.grounding_score, 0.0)

    @pytest.mark.asyncio
    async def test_assemble_with_null_documents(self) -> None:
        """Test assemble method with None documents."""
        token_service = Mock()
        compressor_service = AsyncMock()
        service = AssemblerService(
            token_service=token_service,
            compressor_service=compressor_service,
        )

        # Method should execute without raising exception
        result = await service.assemble(
            documents=None,
            correlation_id="null-docs-correlation",
            max_tokens=1000,
            compression_loop=0,
        )

        assert result is not None
        assert math.isclose(result.grounding_score, 0.0)


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
        assert math.isclose(settings.context_manager_required_grounding_score, 0.7)
        assert math.isclose(settings.context_manager_minimum_grounding_score, 0.5)
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
