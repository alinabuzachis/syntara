"""Data models for token counting and validation.

This module defines SQLModel entities for token usage tracking:
- UserTokenConfig: Per-user token limit configuration
- TokenUsageRecord: Immutable records of token usage

Both models inherit from BaseResource for consistent system-managed metadata.
"""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, Column, text
from sqlmodel import Field

from nexus.core.models.base.base_resource import BaseResource


class UserTokenConfig(BaseResource, table=True):
    """Per-user token limit configuration.

    Each user has their own token limit and rolling window duration.
    The rolling window determines the time period over which token usage is tracked.

    Inherits from BaseResource:
        - id: UUID (primary key, auto-generated)
        - created_at: datetime (UTC, auto-managed)
        - updated_at: datetime (UTC, auto-managed)
        - labels: dict[str, str] (JSONB, for metadata)

    Attributes:
        user_id: Foreign key to User table (unique - one config per user)
        token_limit: Maximum tokens allowed within the rolling window (must be > 0)
        window_duration_seconds: Rolling window size in seconds (must be > 0)
        model_name: Tiktoken model name for token counting (defaults to "gpt-4")

    """

    __tablename__ = "user_token_configs"

    # Domain-specific fields (BaseResource fields inherited automatically)
    user_id: UUID = Field(foreign_key="users.id", unique=True, index=True)

    # Token limit within the rolling window
    token_limit: int = Field(gt=0, description="Maximum tokens allowed within window")

    # Rolling window duration in seconds
    window_duration_seconds: int = Field(
        gt=0,
        description="Rolling window duration in seconds (e.g., 3600 for 1 hour, 86400 for 24 hours)",
    )

    # Tiktoken model name for token encoding
    model_name: str = Field(
        default="gpt-4",
        sa_column_kwargs={"server_default": text("'gpt-4'")},
        description="Tiktoken model name for token counting (e.g., 'gpt-4', 'gpt-3.5-turbo')",
    )


class TokenUsageRecord(BaseResource, table=True):
    """Immutable record of token usage for a user's request.

    These records are used to calculate cumulative usage within the rolling time window.
    Records are append-only (never updated).

    Inherits from BaseResource:
        - id: UUID (primary key, auto-generated)
        - created_at: datetime (when record was inserted into DB, UTC, auto-managed)
        - updated_at: datetime (UTC, auto-managed, same as created_at for immutable records)
        - labels: dict[str, str] (JSONB, for metadata)

    Note:
        request_timestamp is separate from created_at. It represents when the actual
        request was made, while created_at represents when the record was persisted
        to the database.

    Attributes:
        user_id: Foreign key to User table
        token_count: Number of tokens in this request (must be >= 0)
        request_timestamp: When the request was made (used for rolling window calculation)
        request_text_hash: Optional SHA-256 hash of request text (for debugging/deduplication)

    """

    __tablename__ = "token_usage_records"

    # Domain-specific fields (BaseResource fields inherited automatically)
    user_id: UUID = Field(foreign_key="users.id", index=True)

    # Token count for this specific request
    token_count: int = Field(ge=0, description="Number of tokens in this request")

    # When the request was made (used for rolling window calculation)
    request_timestamp: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        sa_column=Column(TIMESTAMP(timezone=True), index=True),
        description="When the request was made (for rolling window filtering)",
    )

    # Optional: hash of request text for deduplication/debugging
    request_text_hash: str | None = Field(default=None, max_length=64)
