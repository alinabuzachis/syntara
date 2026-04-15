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
from nexus.core.models.pagination import ResourcesResponse


class UserCreate(SQLModel):
    """Schema for creating a new local user (POST /users).

    Excludes auto-generated fields: id, created_at, updated_at, last_login, preferences.
    """

    username: str = Field(..., min_length=1, max_length=FieldLimits.NAME_MAX_LENGTH, description="Unique username")
    email: EmailStr = Field(..., max_length=FieldLimits.NAME_MAX_LENGTH, description="Unique email address")
    full_name: str = Field(..., min_length=1, max_length=FieldLimits.NAME_MAX_LENGTH, description="User's display name")
    password: SecretStr = Field(..., min_length=8, description="Plaintext password (will be hashed)")
    is_active: bool = Field(default=True, description="Account activation status")


class UserUpdate(SQLModel):
    """Schema for updating a user (PATCH /users/{id}).

    All fields are optional for partial updates.
    """

    full_name: str | None = Field(
        None, min_length=1, max_length=FieldLimits.NAME_MAX_LENGTH, description="Update display name"
    )
    email: EmailStr | None = Field(None, max_length=FieldLimits.NAME_MAX_LENGTH, description="Update email address")
    password: SecretStr | None = Field(
        None, description="New password (will be hashed). Omit to keep current password."
    )
    is_active: bool | None = Field(None, description="Enable or disable user account")


class UserRead(SQLModel):
    """Schema for user response (GET /users/{id}).

    Includes all user fields except sensitive data (password_hash, preferences).
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: UUID
    username: str
    email: str
    full_name: str
    is_active: bool
    last_login: datetime | None = None
    created_at: datetime
    updated_at: datetime


# ============================================================================
# List Response
# ============================================================================


class UserListResponse(ResourcesResponse[UserRead]):
    """Paginated list response for users."""


class UserListParams(BaseListParams):
    """Query parameters for listing users."""
