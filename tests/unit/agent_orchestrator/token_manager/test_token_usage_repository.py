"""Unit tests for TokenUsageRepository."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.token_manager.exceptions import UserTokenConfigNotFoundError
from nexus.agent_orchestrator.token_manager.models import TokenUsageRecord, UserTokenConfig
from nexus.agent_orchestrator.token_manager.repository import TokenUsageRepository


@pytest.fixture
def repository() -> TokenUsageRepository:
    """Create a TokenUsageRepository instance."""
    return TokenUsageRepository()


@pytest_asyncio.fixture
async def user_config(test_db_session: AsyncSession, test_user) -> UserTokenConfig:
    """Create a test user configuration."""
    config = UserTokenConfig(
        user_id=test_user.id,
        token_limit=10000,
        window_duration_seconds=3600,  # 1 hour
    )
    test_db_session.add(config)
    await test_db_session.commit()
    await test_db_session.refresh(config)
    return config


@pytest.mark.asyncio
async def test_get_user_config(
    repository: TokenUsageRepository,
    user_config: UserTokenConfig,
    test_db_session: AsyncSession,
) -> None:
    """Test fetching user configuration by user_id."""
    # Act
    result = await repository.get_user_config(user_config.user_id, test_db_session)

    # Assert
    assert result.id == user_config.id
    assert result.user_id == user_config.user_id
    assert result.token_limit == 10000
    assert result.window_duration_seconds == 3600


@pytest.mark.asyncio
async def test_get_user_config_not_found(
    repository: TokenUsageRepository,
    test_db_session: AsyncSession,
) -> None:
    """Test that UserTokenConfigNotFoundError is raised when config doesn't exist."""
    # Arrange
    non_existent_user_id = uuid4()

    # Act & Assert
    with pytest.raises(UserTokenConfigNotFoundError) as exc_info:
        await repository.get_user_config(non_existent_user_id, test_db_session)

    assert exc_info.value.user_id == non_existent_user_id


@pytest.mark.asyncio
async def test_get_user_config_with_lock(
    repository: TokenUsageRepository,
    user_config: UserTokenConfig,
    test_db_session: AsyncSession,
) -> None:
    """Test fetching user configuration with row-level lock."""
    # Act
    async with test_db_session.begin_nested():
        result = await repository.get_user_config_with_lock(user_config.user_id, test_db_session)

        # Assert
        assert result.id == user_config.id
        assert result.user_id == user_config.user_id
        assert result.token_limit == 10000


@pytest.mark.asyncio
async def test_calculate_current_usage_empty(
    repository: TokenUsageRepository,
    user_config: UserTokenConfig,
    test_db_session: AsyncSession,
) -> None:
    """Test calculating usage for a user with no usage records returns 0."""
    # Act
    usage = await repository.calculate_current_usage(
        user_id=user_config.user_id,
        window_duration_seconds=3600,
        session=test_db_session,
    )

    # Assert
    assert usage == 0


@pytest.mark.asyncio
async def test_calculate_current_usage_within_window(
    repository: TokenUsageRepository,
    user_config: UserTokenConfig,
    test_db_session: AsyncSession,
) -> None:
    """Test that recent usage records are included in calculation."""
    # Arrange - create usage records within the window
    now = datetime.now(UTC)
    records = [
        TokenUsageRecord(
            user_id=user_config.user_id,
            token_count=1000,
            request_timestamp=now - timedelta(minutes=30),
        ),
        TokenUsageRecord(
            user_id=user_config.user_id,
            token_count=2000,
            request_timestamp=now - timedelta(minutes=15),
        ),
    ]
    for record in records:
        test_db_session.add(record)
    await test_db_session.commit()

    # Act
    usage = await repository.calculate_current_usage(
        user_id=user_config.user_id,
        window_duration_seconds=3600,  # 1 hour window
        session=test_db_session,
    )

    # Assert
    assert usage == 3000  # 1000 + 2000


@pytest.mark.asyncio
async def test_calculate_current_usage_excludes_old(
    repository: TokenUsageRepository,
    user_config: UserTokenConfig,
    test_db_session: AsyncSession,
) -> None:
    """Test that old usage records outside the window are excluded."""
    # Arrange - create old and recent records
    now = datetime.now(UTC)
    old_record = TokenUsageRecord(
        user_id=user_config.user_id,
        token_count=5000,
        request_timestamp=now - timedelta(hours=2),  # Outside 1-hour window
    )
    recent_record = TokenUsageRecord(
        user_id=user_config.user_id,
        token_count=1000,
        request_timestamp=now - timedelta(minutes=30),  # Within window
    )
    test_db_session.add(old_record)
    test_db_session.add(recent_record)
    await test_db_session.commit()

    # Act
    usage = await repository.calculate_current_usage(
        user_id=user_config.user_id,
        window_duration_seconds=3600,  # 1 hour window
        session=test_db_session,
    )

    # Assert
    assert usage == 1000  # Only recent record counted


@pytest.mark.asyncio
async def test_record_usage(
    repository: TokenUsageRepository,
    user_config: UserTokenConfig,
    test_db_session: AsyncSession,
) -> None:
    """Test creating a new usage record."""
    # Act
    record = await repository.record_usage(
        user_id=user_config.user_id,
        token_count=2500,
        session=test_db_session,
    )
    await test_db_session.commit()

    # Assert
    assert record.id is not None
    assert record.user_id == user_config.user_id
    assert record.token_count == 2500
    assert record.request_timestamp is not None

    # Verify it's in the database
    result = await test_db_session.exec(select(TokenUsageRecord).where(TokenUsageRecord.id == record.id))
    saved_record = result.one()
    assert saved_record.token_count == 2500


@pytest.mark.asyncio
async def test_update_user_config_existing(
    repository: TokenUsageRepository,
    user_config: UserTokenConfig,
    test_db_session: AsyncSession,
) -> None:
    """Test updating an existing user configuration."""
    # Act
    updated_config = await repository.update_user_config(
        user_id=user_config.user_id,
        token_limit=20000,
        window_duration_seconds=7200,  # 2 hours
        session=test_db_session,
    )
    await test_db_session.commit()

    # Assert
    assert updated_config.id == user_config.id
    assert updated_config.token_limit == 20000
    assert updated_config.window_duration_seconds == 7200

    # Verify in database
    result = await test_db_session.exec(select(UserTokenConfig).where(UserTokenConfig.user_id == user_config.user_id))
    saved_config = result.one()
    assert saved_config.token_limit == 20000


@pytest.mark.asyncio
async def test_update_user_config_create_new(
    repository: TokenUsageRepository,
    test_db_session: AsyncSession,
    test_user,
) -> None:
    """Test creating a new configuration when none exists.

    Note: test_user doesn't have a config yet, so this test creates one.
    """
    # Act - create config for test_user (who has no config yet)
    config = await repository.update_user_config(
        user_id=test_user.id,
        token_limit=15000,
        window_duration_seconds=86400,  # 24 hours
        session=test_db_session,
    )
    await test_db_session.commit()

    # Assert
    assert config.id is not None
    assert config.user_id == test_user.id
    assert config.token_limit == 15000
    assert config.window_duration_seconds == 86400

    # Verify in database
    result = await test_db_session.exec(select(UserTokenConfig).where(UserTokenConfig.user_id == test_user.id))
    saved_config = result.one()
    assert saved_config.token_limit == 15000
