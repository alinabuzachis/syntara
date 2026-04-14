"""CredentialType SQLModel definition for database storage.

Defines the schema (what fields a Credential has) and consumption model
(how values are transformed into configuration for downstream consumers).
Managed types are preseeded and cannot be deleted by users.
"""

from datetime import datetime
from typing import Any, ClassVar
from uuid import UUID

from pydantic import ConfigDict
from sqlalchemy import String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.models.base import BaseResource
from nexus.core.models.pagination import ResourcesResponse


class CredentialType(BaseResource, table=True):
    """CredentialType database model.

    Extends BaseResource with credential-type-specific fields.
    Manages its own name field (no uniqueness constraint from Resource).
    """

    __tablename__ = "credential_types"

    name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Human-readable credential type name",
        index=True,
    )

    description: str | None = Field(
        default=None,
        sa_type=Text(),  # type: ignore[call-overload]
        max_length=FieldLimits.DESCRIPTION_MAX_LENGTH,
        description="Optional description of the credential type",
    )

    inputs: dict[str, Any] = Field(
        default_factory=dict,
        sa_type=JSONB,
        description="Field schema defining credential inputs",
    )

    injectors: dict[str, Any] = Field(
        default_factory=dict,
        sa_type=JSONB,
        description="Consumption mapping templates for downstream consumers",
    )

    managed: bool = Field(
        default=False,
        description="True for preseeded system types that cannot be deleted",
    )

    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "name",
        "managed",
    ]


class CredentialTypeRead(SQLModel):
    """Read schema for credential type API responses."""

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: UUID
    name: str
    description: str | None = None
    inputs: dict[str, Any] = Field(default_factory=dict)
    injectors: dict[str, Any] = Field(default_factory=dict)
    managed: bool = False
    credential_count: int = Field(default=0, description="Number of non-deleted credentials using this type")
    created_at: datetime
    updated_at: datetime


CredentialTypeListResponse = ResourcesResponse[CredentialTypeRead]
