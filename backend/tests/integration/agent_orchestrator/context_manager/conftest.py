"""Shared fixtures for context_manager integration tests."""

from collections.abc import Generator
from unittest.mock import AsyncMock, patch

import pytest
from langchain_core.messages import AIMessage

from nexus.agent_orchestrator.token_manager.models import UserTokenConfig


@pytest.fixture
async def test_user_token_config(test_db_session, test_user) -> UserTokenConfig:
    """Create token configuration for test user with high limit.

    Note: This fixture explicitly depends on test_user to ensure proper
    ordering and avoid foreign key constraint violations.
    """
    config = UserTokenConfig(
        user_id=test_user.id,
        token_limit=1000000,  # High limit
        window_duration_seconds=3600,
        model_name="gpt-4",
    )
    test_db_session.add(config)
    await test_db_session.commit()
    return config


@pytest.fixture
async def test_user_low_token_config(test_db_session, test_user) -> UserTokenConfig:
    """Create token configuration for test user with low limit.

    Note: This fixture explicitly depends on test_user to ensure proper
    ordering and avoid foreign key constraint violations.
    """
    config = UserTokenConfig(
        user_id=test_user.id,
        token_limit=100,  # Very low limit to trigger compression
        window_duration_seconds=3600,
        model_name="gpt-4",
    )
    test_db_session.add(config)
    await test_db_session.commit()
    return config


@pytest.fixture
def mock_relevancy_checker() -> Generator[AsyncMock, None, None]:
    """Mock LLMRelevancyChecker to return high relevancy scores."""
    with patch(
        "nexus.agent_orchestrator.context_manager.retriever_service.checkers.llm_relevancy_checker.get_openrouter_llm"
    ) as mock_get_checker_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Relevancy Score: 0.85\n\nHighly relevant document.")
        mock_get_checker_llm.return_value = mock_llm
        yield mock_llm
