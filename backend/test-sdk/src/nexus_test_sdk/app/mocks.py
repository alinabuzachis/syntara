"""Mock fixtures for unit and integration tests."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Callable
from typing import Any
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest


@pytest.fixture
def mock_openrouter_llm() -> MagicMock:
    """Mock get_openrouter_llm to avoid requiring OPENROUTER_API_KEY."""
    from langchain_core.messages import AIMessage

    mock_llm = MagicMock()
    mock_llm_with_tools = AsyncMock()
    mock_llm_with_tools.ainvoke = AsyncMock(
        return_value=AIMessage(
            content="Mock LLM response for testing",
            response_metadata={"model": "mock-model", "finish_reason": "stop"},
        )
    )
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)
    mock_llm.model_name = "mock-model"

    mock_compressor = AsyncMock()
    mock_compressor.compress = AsyncMock(return_value="Compressed content for testing")

    with (
        patch(
            "nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm",
            return_value=mock_llm,
        ),
        patch(
            "nexus.agent_orchestrator.context_manager.compressor.CompressorService",
            return_value=mock_compressor,
        ),
        patch(
            "nexus.agent_orchestrator.services.orchestration_service.OrchestrationService._get_tools",
            return_value=[],
        ),
    ):
        yield mock_llm


@pytest.fixture
def mock_session_factory() -> Callable[[], AsyncGenerator[Any, None]]:
    """Provide a mock database session factory for unit tests."""
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)

    async def session_gen() -> AsyncGenerator[Any, None]:
        yield mock_session

    return session_gen


@pytest.fixture
def mock_token_calculator() -> Mock:
    """Create a mock TokenCalculator for testing."""
    from nexus.agent_orchestrator.token_manager.services import TokenCalculator

    return Mock(spec=TokenCalculator)


@pytest.fixture
def mock_compressor() -> AsyncMock:
    """Create a mock CompressorService for testing."""
    return AsyncMock()


@pytest.fixture
def mock_websocket() -> MagicMock:
    """Create a mock WebSocket for testing."""
    websocket = MagicMock()
    websocket.send_json = AsyncMock()
    websocket.close = AsyncMock()
    websocket.client.host = "127.0.0.1"
    websocket.client.port = 12345
    websocket.app.state = MagicMock()
    return websocket
