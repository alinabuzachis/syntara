"""User model for authentication and authorization."""

from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import JSON, Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import DateTime, Uuid

from nexus_api.models.base import Base, SoftDeleteMixin, TimestampMixin, generate_uuid

if TYPE_CHECKING:
    from nexus_api.models.workflow import Workflow


class UserRole(str, Enum):
    """User role enumeration."""

    CREATOR = "creator"
    APPROVER = "approver"
    ADMINISTRATOR = "administrator"
    VIEWER = "viewer"


class User(Base, TimestampMixin, SoftDeleteMixin):
    """User model representing platform users.

    Attributes:
        id: Primary key UUID
        username: Unique username
        email: Unique email address
        full_name: Display name
        role: User role (creator, approver, administrator, viewer)
        is_active: Account status
        created_at: Timestamp of user creation
        last_login: Timestamp of last login
        preferences: JSON field for user preferences
        deleted_at: Soft delete timestamp
        deleted_by: User who performed the soft delete

    Relationships:
        created_workflows: Workflows created by this user

    """

    __tablename__ = "users"

    # Primary key
    id: Mapped[UUID] = mapped_column(
        Uuid,
        primary_key=True,
        default=generate_uuid,
    )

    # Required fields
    username: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=False,  # Uniqueness enforced via partial index
    )

    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=False,  # Uniqueness enforced via partial index
    )

    full_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    # Optional fields with defaults
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    last_login: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )

    preferences: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
    )

    # Soft delete foreign key (self-referencing)
    deleted_by: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        default=None,
    )

    # Relationships
    created_workflows: Mapped[list["Workflow"]] = relationship(
        "Workflow",
        foreign_keys="Workflow.created_by",
        back_populates="creator",
        lazy="select",
    )

    # Indexes - using string names for columns in partial indexes
    __table_args__ = (
        # Index for role-based queries
        Index("ix_users_role", "role"),
        # Index for active user queries
        Index("ix_users_is_active", "is_active"),
    )

    def __repr__(self) -> str:
        """Return string representation of User.

        Returns:
            String representation

        """
        return f"<User(id={self.id}, username={self.username}, role={self.role})>"

    def update_last_login(self) -> None:
        """Update last_login timestamp to current time."""
        self.last_login = datetime.now(UTC)
