"""User API request/response schemas.

This module provides schemas for user management endpoints following the
SQLModel Pattern 1 (separate models with table=False), consistent with
the Group model pattern.
"""

from datetime import datetime
from typing import ClassVar
from uuid import UUID

from pydantic import ConfigDict, EmailStr, SecretStr
from sqlmodel import Field, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.models.base.query_params import BaseListParams
from nexus.core.models.group import MembershipSource
from nexus.core.models.pagination import ResourcesResponse
from nexus.core.models.user import AuthType


class UserCreate(SQLModel):
    """Schema for creating a new local user (POST /users).

    Excludes auto-generated fields: id, created_at, updated_at, last_login, preferences.
    """

    username: str = Field(..., min_length=1, max_length=FieldLimits.NAME_MAX_LENGTH, description="Unique username")
    email: EmailStr | None = Field(default=None, max_length=FieldLimits.NAME_MAX_LENGTH, description="Email address")
    full_name: str = Field(..., min_length=1, max_length=FieldLimits.NAME_MAX_LENGTH, description="User's display name")
    password: SecretStr = Field(..., min_length=8, description="Plaintext password (will be hashed)")
    is_enabled: bool = Field(default=True, description="Whether the user account is enabled")


class UserUpdate(SQLModel):
    """Schema for updating a user (PATCH /users/{id}).

    All fields are optional for partial updates.
    """

    username: str | None = Field(
        None, min_length=1, max_length=FieldLimits.NAME_MAX_LENGTH, description="Update username"
    )
    full_name: str | None = Field(
        None, min_length=1, max_length=FieldLimits.NAME_MAX_LENGTH, description="Update display name"
    )
    email: EmailStr | None = Field(None, max_length=FieldLimits.NAME_MAX_LENGTH, description="Update email address")
    password: SecretStr | None = Field(
        None, description="New password (will be hashed). Omit to keep current password."
    )
    is_enabled: bool | None = Field(None, description="Enable or disable user account")


class UserRead(SQLModel):
    """Schema for user response (GET /users/{id}).

    Includes all user fields except sensitive data (password_hash, preferences).
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: UUID
    username: str
    email: str | None = None
    full_name: str
    is_enabled: bool
    is_builtin: bool = False
    auth_type: AuthType = AuthType.LOCAL
    last_login: datetime | None = None
    created_at: datetime
    updated_at: datetime


class GroupMemberRead(UserRead):
    """User response with membership source info for a specific group."""

    membership_sources: list[MembershipSource] = Field(
        default_factory=list, description="How this user was assigned to this group"
    )


# ============================================================================
# List Response
# ============================================================================

UserListResponse = ResourcesResponse[UserRead]
GroupMemberListResponse = ResourcesResponse[GroupMemberRead]


class UserListParams(BaseListParams):
    """Query parameters for listing users."""

    username: str | None = Field(default=None, description="Filter by username")
    full_name: str | None = Field(default=None, description="Filter by full name")
