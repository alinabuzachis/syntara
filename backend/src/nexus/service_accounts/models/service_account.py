"""ServiceAccount SQLModel definition.

OAuth 2.0 service account for machine-to-machine authentication via the
client credentials grant flow.  Stores a hashed client secret (Argon2id)
with support for secret rotation through a grace-period window.
"""

from datetime import datetime
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from sqlalchemy import Index, String, Text
from sqlmodel import CheckConstraint, DateTime, Field

from nexus.core.models.base.base_resource import AuditLevel
from nexus.core.models.base.named import NamedResource
from nexus.core.models.base.soft_deletable import SoftDeletableResource
from nexus.core.models.base.user_owned import UserOwnedResource


class ServiceAccountStatus(StrEnum):
    """Operational status of a service account."""

    ACTIVE = "active"
    DISABLED = "disabled"


class ServiceAccount(NamedResource, SoftDeletableResource, UserOwnedResource, table=True):
    """OAuth 2.0 service account for programmatic API access."""

    __tablename__ = "service_accounts"

    client_id: str = Field(
        sa_type=String(64),  # type: ignore[call-overload]
        description="Public OAuth 2.0 client identifier",
        index=True,
    )

    hashed_secret: str = Field(
        sa_type=Text,
        description="Argon2id hash of the client secret",
    )

    old_hashed_secret: str | None = Field(
        default=None,
        sa_type=Text,
        description="Previous secret hash, valid during rotation grace period",
    )

    old_secret_valid_until: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        description="Expiry timestamp for the old secret during rotation",
    )

    grace_period_seconds: int = Field(
        default=3600,
        ge=0,
        le=86400,
        description="Duration (seconds) that the old secret remains valid after rotation",
    )

    status: ServiceAccountStatus = Field(
        default=ServiceAccountStatus.ACTIVE,
        sa_type=String(10),  # type: ignore[call-overload]
        description="Operational status of the service account",
        index=True,
    )

    project_id: UUID = Field(
        foreign_key="projects.id",
        description="Project namespace for resource isolation",
        index=True,
    )

    last_authenticated_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        description="Timestamp of the most recent successful authentication",
    )

    __table_args__ = (
        Index("ix_service_accounts_client_id_unique", "client_id", unique=True),
        Index("ix_service_accounts_created_at_id", "created_at", "id"),
        CheckConstraint(
            "status IN ('active', 'disabled')",
            name="ck_service_accounts_status_valid",
        ),
        CheckConstraint(
            "grace_period_seconds BETWEEN 0 AND 86400",
            name="ck_service_accounts_grace_period_range",
        ),
    )

    __filterable_fields__: ClassVar[list[str]] = list(
        dict.fromkeys(
            [
                *NamedResource.__filterable_fields__,
                *SoftDeletableResource.__filterable_fields__,
                *UserOwnedResource.__filterable_fields__,
                "client_id",
                "status",
                "project_id",
                "last_authenticated_at",
            ]
        )
    )

    __sortable_fields__: ClassVar[list[str]] = list(
        dict.fromkeys(
            [
                *NamedResource.__sortable_fields__,
                *SoftDeletableResource.__sortable_fields__,
                *UserOwnedResource.__sortable_fields__,
                "last_authenticated_at",
            ]
        )
    )

    __auditable__: ClassVar[AuditLevel] = AuditLevel.META
    __auditable_fields__: ClassVar[list[str]] = [
        "name",
        "description",
        "client_id",
        "status",
        "project_id",
        "grace_period_seconds",
        "last_authenticated_at",
        "created_by",
        "updated_by",
    ]
