"""Tests verifying CompressorService._get_llm reads settings from the runtime settings cache.

Tests cover:
- Lazy init reads compression_temperature from settings
- Lazy init reads compression_max_tokens from settings
- Lazy init passes settings values to get_openrouter_llm
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

import pytest

from nexus.agent_orchestrator.context_manager.compressor import CompressorService

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager

    from tests.conftest import FakeSettingsCache


@pytest.mark.asyncio
async def test_get_llm_reads_temperature_from_settings(
    override_runtime_settings: Callable[..., AbstractContextManager[FakeSettingsCache]],
) -> None:
    """_get_llm() must read compression_temperature from runtime settings."""
    with (
        override_runtime_settings(),
        patch(
            "nexus.agent_orchestrator.context_manager.compressor.get_openrouter_llm",
        ) as mock_llm_factory,
    ):
        mock_llm_factory.return_value = MagicMock(model_name="test-model")
        service = CompressorService()
        await service._get_llm()

    # Catalog default for compression_temperature is 0.3 — verified via the call below
    mock_llm_factory.assert_called_once()
    assert mock_llm_factory.call_args.kwargs["temperature"] == 0.3


@pytest.mark.asyncio
async def test_get_llm_reads_max_tokens_from_settings(
    override_runtime_settings: Callable[..., AbstractContextManager[FakeSettingsCache]],
) -> None:
    """_get_llm() must read compression_max_tokens from runtime settings."""
    with (
        override_runtime_settings(),
        patch(
            "nexus.agent_orchestrator.context_manager.compressor.get_openrouter_llm",
        ) as mock_llm_factory,
    ):
        mock_llm_factory.return_value = MagicMock(model_name="test-model")
        service = CompressorService()
        await service._get_llm()

    mock_llm_factory.assert_called_once()
    assert mock_llm_factory.call_args.kwargs["max_tokens"] == 2000


@pytest.mark.asyncio
async def test_get_llm_passes_settings_values_to_openrouter(
    override_runtime_settings: Callable[..., AbstractContextManager[FakeSettingsCache]],
) -> None:
    """_get_llm() must pass the settings values to get_openrouter_llm()."""
    with (
        override_runtime_settings(),
        patch(
            "nexus.agent_orchestrator.context_manager.compressor.get_openrouter_llm",
        ) as mock_llm_factory,
    ):
        mock_llm_factory.return_value = MagicMock(model_name="test-model")
        service = CompressorService()
        llm = await service._get_llm()

    mock_llm_factory.assert_called_once_with(temperature=0.3, max_tokens=2000)
    assert llm is mock_llm_factory.return_value
    assert service._llm is not None
    assert service._llm.model_name == "test-model"
