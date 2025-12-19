"""Shared fixtures for context_manager integration tests."""

import pytest

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
    await test_db_session.refresh(config)
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
    await test_db_session.refresh(config)
    return config
