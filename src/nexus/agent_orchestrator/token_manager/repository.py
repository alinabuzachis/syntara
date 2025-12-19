"""Data access layer for token usage and configuration.

This module provides TokenUsageRepository for database operations:
- User token configuration retrieval and updates
- Token usage record creation
- Rolling window usage calculation
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.token_manager.exceptions import UserTokenConfigNotFoundError
from nexus.agent_orchestrator.token_manager.models import TokenUsageRecord, UserTokenConfig
from nexus.core.models import User


class TokenUsageRepository:
    """Repository for token usage and configuration data access.

    Provides methods for:
    - Retrieving and updating user token configurations
    - Recording token usage
    - Calculating current usage within rolling windows

    This repository uses async SQLAlchemy sessions for all database operations.
    """

    async def get_user_config(self, user_id: UUID, session: AsyncSession) -> UserTokenConfig:
        """Get token configuration for a user.

        For development, if no configuration exists and this is the dev-user,
        a default configuration is created automatically.

        Args:
            user_id: The user's UUID
            session: Async database session

        Returns:
            UserTokenConfig for the user

        Raises:
            UserTokenConfigNotFoundError: If no configuration exists for the user
                (except for dev-user, which gets a default config created)

        """
        statement = select(UserTokenConfig).where(UserTokenConfig.user_id == user_id)
        result = await session.exec(statement)
        config = result.one_or_none()

        if config is None:
            # Check if this is the dev-user - if so, create a default config
            user_statement = select(User).where(User.id == user_id)
            user_result = await session.exec(user_statement)
            user = user_result.one_or_none()

            if user and user.username == "dev-user":
                # Create default config for dev-user
                config = UserTokenConfig(
                    user_id=user_id,
                    token_limit=1000000,  # Generous limit for development
                    window_duration_seconds=3600,
                    model_name="gpt-4",
                )
                session.add(config)
                await session.commit()
                await session.refresh(config)
                return config

            # Not dev-user and no config exists
            raise UserTokenConfigNotFoundError(user_id)

        return config

    async def get_user_config_with_lock(self, user_id: UUID, session: AsyncSession) -> UserTokenConfig:
        """Get token configuration for a user with row-level lock.

        This method uses SELECT FOR UPDATE to acquire a row-level lock on the
        user's configuration, preventing concurrent transactions from reading
        stale data during validation. This is critical for preventing race
        conditions when multiple requests validate against the same user's limit.

        Args:
            user_id: The user's UUID
            session: Async database session

        Returns:
            UserTokenConfig for the user

        Raises:
            UserTokenConfigNotFoundError: If no configuration exists for the user

        """
        statement = select(UserTokenConfig).where(UserTokenConfig.user_id == user_id).with_for_update()
        result = await session.exec(statement)
        config = result.one_or_none()

        if config is None:
            raise UserTokenConfigNotFoundError(user_id)

        return config

    async def calculate_current_usage(
        self,
        user_id: UUID,
        window_duration_seconds: int,
        session: AsyncSession,
    ) -> int:
        """Calculate current token usage within the rolling window.

        This method sums all token usage records for the user that fall within
        the rolling time window (now - window_duration_seconds to now).

        Args:
            user_id: The user's UUID
            window_duration_seconds: Rolling window duration in seconds
            session: Async database session

        Returns:
            Total token count within the rolling window (0 if no usage)

        """
        # Calculate the cutoff time (window start)
        cutoff_time = datetime.now(UTC) - timedelta(seconds=window_duration_seconds)

        # Query for sum of token_count within the window
        statement = (
            select(func.coalesce(func.sum(TokenUsageRecord.token_count), 0))
            .where(TokenUsageRecord.user_id == user_id)
            .where(TokenUsageRecord.request_timestamp >= cutoff_time)
        )

        result = await session.exec(statement)
        total = result.one()

        return int(total)

    async def record_usage(
        self,
        user_id: UUID,
        token_count: int,
        session: AsyncSession,
        request_text_hash: str | None = None,
    ) -> TokenUsageRecord:
        """Record a new token usage entry.

        Creates an immutable TokenUsageRecord with the current timestamp.

        Args:
            user_id: The user's UUID
            token_count: Number of tokens in the request
            session: Async database session
            request_text_hash: Optional hash of request text

        Returns:
            The created TokenUsageRecord

        """
        record = TokenUsageRecord(
            user_id=user_id,
            token_count=token_count,
            request_text_hash=request_text_hash,
        )

        session.add(record)
        await session.flush()
        await session.refresh(record)

        return record

    async def update_user_config(
        self,
        user_id: UUID,
        token_limit: int,
        window_duration_seconds: int,
        session: AsyncSession,
    ) -> UserTokenConfig:
        """Update or create user token configuration.

        Args:
            user_id: The user's UUID
            token_limit: New token limit (must be > 0)
            window_duration_seconds: New window duration (must be > 0)
            session: Async database session

        Returns:
            The updated or created UserTokenConfig

        """
        # Try to get existing config
        statement = select(UserTokenConfig).where(UserTokenConfig.user_id == user_id)
        result = await session.exec(statement)
        config = result.one_or_none()

        if config is None:
            # Create new config
            config = UserTokenConfig(
                user_id=user_id,
                token_limit=token_limit,
                window_duration_seconds=window_duration_seconds,
            )
            session.add(config)
        else:
            # Update existing config
            config.token_limit = token_limit
            config.window_duration_seconds = window_duration_seconds

        await session.flush()
        await session.refresh(config)

        return config
