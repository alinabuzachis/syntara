"""SoftDeletableResource SQLModel definition.

This module contains the SoftDeletableResource SQLModel class that extends BaseResource
with soft deletion tracking capabilities.
"""

from abc import ABC
from datetime import UTC, datetime
from typing import ClassVar
from uuid import UUID

from sqlmodel import DateTime, Field

from nexus.core.models.base import BaseResource


class SoftDeletableResource(BaseResource, ABC):
    """Abstract SQLModel for resources supporting soft deletion tracking.

    Extends BaseResource with fields to track when and by whom a resource
    was soft deleted, enabling data recovery and audit trails.

    This class cannot be instantiated directly and does not create database tables.
    Concrete subclasses must inherit from this class and set table=True.

    Attributes:
        deleted_at: Optional timestamp when resource was soft deleted
        deleted_by: Optional UUID of user who performed the soft delete

    Inherits from BaseResource:
        id: UUID primary key
        created_at: Creation timestamp
        updated_at: Last update timestamp
        labels: Optional key-value metadata

    State Transitions:
        [Active] --soft delete--> [Deleted]
                 deleted_at = now()
                 deleted_by = current_user

        [Deleted] --restore--> [Active]
                  deleted_at = null
                  deleted_by = null

    """

    # Soft deletion tracking
    deleted_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        description="Timestamp when resource was soft deleted",
        index=True,
    )

    deleted_by: UUID | None = Field(
        default=None,
        foreign_key="users.id",
        description="User who performed the soft delete",
        index=True,
    )

    def is_deleted(self) -> bool:
        """Check if the resource is soft deleted.

        Returns:
            True if the resource is soft deleted (deleted_at is set)

        """
        return self.deleted_at is not None

    def soft_delete(self, user_id: UUID, deletion_time: datetime | None = None) -> None:
        """Mark the resource as soft deleted.

        Args:
            user_id: UUID of the user performing the deletion
            deletion_time: Optional timestamp, defaults to current time

        """
        if deletion_time is None:
            deletion_time = datetime.now(UTC)

        self.deleted_at = deletion_time
        self.deleted_by = user_id

    def restore(self) -> None:
        """Restore a soft deleted resource to active state."""
        self.deleted_at = None
        self.deleted_by = None

    # Soft deletion fields extend base fields
    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "deleted_at",
        "deleted_by",
    ]

    # Soft deletion sortable fields extend base fields
    __sortable_fields__: ClassVar[list[str]] = [
        *BaseResource.__sortable_fields__,
        "deleted_at",
    ]
