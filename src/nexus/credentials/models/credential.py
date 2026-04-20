"""Credential SQLModel definition for database storage.

A named instance of a credential type. Contains metadata (name, description,
labels) and a secret_id FK pointing to the secrets routing table. Encrypted
field values are stored separately in encrypted_secrets via SecretService.
Supports soft-delete.
"""

from datetime import datetime
from typing import Any, ClassVar
from uuid import UUID

from sqlalchemy import Index
from sqlmodel import Field, Relationship, SQLModel

from nexus.core.models.base import Resource
from nexus.core.models.pagination import ResourcesResponse
from nexus.credentials.models.credential_type import CredentialType


class Credential(Resource, table=True):
    """Credential database model.

    Extends Resource with credential-specific fields.
    Encrypted field values are stored in the encrypted_secrets table
    via the secret_id FK → secrets routing table.
    """

    __tablename__ = "credentials"

    credential_type_id: UUID = Field(
        foreign_key="credential_types.id",
        description="ID of the credential type schema",
        index=True,
    )

    secret_id: UUID | None = Field(
        default=None,
        foreign_key="secrets.id",
        description="FK to secret routing record containing encrypted inputs",
        index=True,
    )

    enabled: bool = Field(
        default=True,
        description="Whether this credential is active",
    )

    credential_type: CredentialType | None = Relationship()

    __table_args__ = (
        Index("ix_credentials_name_unique", "name", unique=True, postgresql_where="deleted_at IS NULL"),
        Index("ix_credentials_created_at_id", "created_at", "id"),
    )

    __filterable_fields__: ClassVar[list[str]] = [
        *Resource.__filterable_fields__,
        "credential_type_id",
        "secret_id",
        "enabled",
    ]


class CredentialCreate(SQLModel):
    """Schema for creating a new credential."""

    name: str = Field(min_length=1, max_length=255, description="Human-readable credential name")
    description: str | None = Field(default=None, max_length=2000, description="Optional description")
    credential_type_id: UUID = Field(description="ID of the credential type")
    inputs: dict[str, Any] = Field(default_factory=dict, description="Field values validated against type schema")
    labels: dict[str, str] = Field(default_factory=dict, description="Key-value labels")


class CredentialRead(Resource):
    """Schema for credential API responses. Secret fields masked as $encrypted$."""

    # Override ownership fields: accept username strings or UUIDs (resolved by service layer).
    # Preserves type/format/readOnly/example metadata expected by the spec via FIELD_SCHEMA_EXTRAS.
    created_by: str | UUID | None = Field(description="Username or UUID of the credential creator")  # type: ignore[assignment]
    updated_by: str | UUID | None = Field(default=None, description="Username or UUID of the last modifier")  # type: ignore[assignment]

    FIELD_SCHEMA_EXTRAS: ClassVar[dict[str, dict[str, Any]]] = {
        **Resource.FIELD_SCHEMA_EXTRAS,
        "created_by": {
            **Resource.FIELD_SCHEMA_EXTRAS["created_by"],
            "type": "string",
            "format": "uuid",
        },
    }

    credential_type_id: UUID
    inputs: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    workflow_count: int = Field(default=0, description="Number of workflows referencing this credential")


class CredentialPatch(SQLModel):
    """Schema for partially updating a credential. $encrypted$ preserves existing values."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    inputs: dict[str, Any] | None = None
    enabled: bool | None = None
    labels: dict[str, str] | None = None


class CredentialListResponse(ResourcesResponse[CredentialRead]):
    """Paginated list response for credentials."""


class CredentialWorkflowRef(SQLModel):
    """Reference to a workflow that uses a credential."""

    id: UUID
    name: str
    description: str | None = None
    created_by: str | UUID | None = Field(default=None, description="Username or UUID of the workflow creator")
    node_names: list[str] = Field(default_factory=list, description="Names of nodes using this credential")
    last_execution_at: datetime | None = Field(default=None, description="Timestamp of the most recent execution")
    last_execution_status: str | None = Field(default=None, description="Status of the most recent execution")
