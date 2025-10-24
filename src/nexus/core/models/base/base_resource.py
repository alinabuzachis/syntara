"""BaseResource SQLModel definition.

This module contains the foundational BaseResource SQLModel class that provides
system-managed metadata fields (id, timestamps, labels) for all API resources.
"""

from abc import ABC
from datetime import UTC, datetime
from typing import ClassVar
from uuid import UUID, uuid4

from pydantic import ConfigDict, field_validator
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import DateTime, Field, SQLModel

from nexus.core.constants import ValidationMessages


def _utc_now() -> datetime:
    """Generate UTC timestamp for field defaults."""
    return datetime.now(UTC)


class BaseResource(SQLModel, ABC):
    """Abstract base SQLModel for all API resources with system-managed metadata.

    This abstract class provides the basic structure that all API and database resources should inherit from,
    including UUID identification, automatic timestamps, and key-value labels for
    flexible metadata storage.

    This class cannot be instantiated directly and does not create database tables.
    Concrete subclasses must inherit from this class and SQLModel and set table=True.

    ```
    class MyBaseResource(BaseResource, table=True):
        pass
    ```

    Attributes:
        id: Unique UUID identifier (primary key, auto-generated)
        created_at: Timestamp when resource was created (auto-set)
        updated_at: Timestamp when resource was last updated (auto-updated)
        labels: Optional dictionary of string key-value pairs for metadata

    """

    # Primary key with UUID
    id: UUID = Field(
        default_factory=uuid4, primary_key=True, description="Unique identifier for the resource", index=True
    )

    # Automatic timestamps
    # NOTE: These fields store timezone-aware datetime objects (always UTC).
    created_at: datetime = Field(
        default_factory=_utc_now,
        description="Timestamp when resource was created",
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        index=True,
    )

    updated_at: datetime = Field(
        default_factory=_utc_now,
        description="Timestamp when resource was last updated",
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        index=True,
    )

    # Labels as JSONB column for key-value pairs
    labels: dict[str, str] = Field(
        default_factory=dict, sa_type=JSONB, description="Key-value pairs for resource labeling and filtering"
    )

    @field_validator("labels", mode="before")
    @classmethod
    def validate_labels(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        """Validate that labels dictionary contains only string values."""
        if v is None:
            return v

        if not isinstance(v, dict):
            raise ValueError(ValidationMessages.LABELS_MUST_BE_DICT)  # noqa: TRY004 [field_validator must raise ValueError]

        for key, value in v.items():
            if not isinstance(key, str):
                msg = ValidationMessages.LABELS_KEY_MUST_BE_STRING.format(key=key, type_name=type(key).__name__)  # type: ignore[unreachable]
                raise ValueError(msg)  # noqa: TRY004 [field_validator must raise ValueError]
            if not isinstance(value, str):
                msg = ValidationMessages.LABELS_VALUE_MUST_BE_STRING.format(key=key, type_name=type(value).__name__)  # type: ignore[unreachable]
                raise ValueError(msg)  # noqa: TRY004 [field_validator must raise ValueError]

        return v

    model_config: ClassVar[ConfigDict] = ConfigDict(
        from_attributes=True, validate_by_name=True, validate_assignment=True
    )  # type: ignore[assignment]
