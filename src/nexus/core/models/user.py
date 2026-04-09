"""User SQLModel for authentication and authorization.

This module provides the User model that combines BaseResource and SoftDeletableResource
for managing platform users with authentication and role-based access control.
"""

from datetime import UTC, datetime
from enum import Enum
from typing import Any, ClassVar

from sqlalchemy import String
from sqlmodel import JSON, DateTime, Field, Index, text

from nexus.core.constants import FieldLimits
from nexus.core.models.base import SoftDeletableResource
from nexus.core.utils.sqlmodel import postgres_enum_column


class UserRole(str, Enum):
    """User role enumeration for access control."""

    CREATOR = "creator"
    APPROVER = "approver"
    ADMINISTRATOR = "administrator"
    VIEWER = "viewer"


class User(SoftDeletableResource, table=True):
    """User model representing platform users.

    Extends SoftDeletableResource (which includes BaseResource) with user-specific
    authentication and profile fields.

    Attributes:
        id: Primary key UUID (from BaseResource)
        created_at: Timestamp of user creation (from BaseResource)
        updated_at: Timestamp of last update (from BaseResource)
        labels: Optional key-value metadata (from BaseResource)
        deleted_at: Soft delete timestamp (from SoftDeletableResource)
        deleted_by: UUID of user who performed soft delete (from SoftDeletableResource)
        username: Unique username for authentication
        email: Unique email address
        full_name: User's display name
        role: User role for access control (UserRole enum)
        password_hash: Argon2id hash for local auth (null for federated-only users)
        is_active: Account activation status
        last_login: Timestamp of last successful login
        preferences: JSON field for user preferences and settings

    """

    __tablename__ = "users"

    # Filterable fields for API list endpoints
    __filterable_fields__: ClassVar[list[str]] = [
        "id",
        "created_at",
        "updated_at",
        "username",
        "email",
        "role",
        "is_active",
    ]

    # Sortable fields for API list endpoints
    __sortable_fields__: ClassVar[list[str]] = [
        "created_at",
        "updated_at",
        "username",
        "email",
    ]

    # Required fields
    username: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Unique username for authentication",
        index=True,
    )

    email: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Unique email address",
        index=True,
    )

    full_name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="User's display name",
    )

    role: UserRole = Field(
        sa_column=postgres_enum_column(
            UserRole,
            "userrole",
            index=True,
            create_constraint=True,
        ),
        description="User role for access control",
    )

    password_hash: str | None = Field(
        default=None,
        exclude=True,
        sa_type=String(255),  # type: ignore[call-overload]
        description="Argon2id password hash for local authentication (null for federated-only users)",
    )

    # Optional fields with defaults
    is_active: bool = Field(
        default=True,
        description="Account activation status",
        index=True,
    )

    last_login: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        description="Timestamp of last successful login",
    )

    preferences: dict[str, Any] = Field(
        default_factory=dict,
        sa_type=JSON,
        description="User preferences and settings as JSON",
    )

    # Table arguments for partial unique constraints
    __table_args__ = (
        # Partial unique index for username (only for non-deleted users)
        Index(
            "ix_users_username_unique",
            "username",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Partial unique index for email (only for non-deleted users)
        Index(
            "ix_users_email_unique",
            "email",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    def __repr__(self) -> str:
        """Return string representation of User.

        Returns:
            String representation

        """
        return f"<User(id={self.id}, username={self.username}, role={self.role.value})>"

    def update_last_login(self) -> None:
        """Update last_login timestamp to current time."""
        self.last_login = datetime.now(UTC)
