"""Role model for authorization policy bundles.

Roles group policies together and are assigned to users.
Built-in roles (admin, auditor, user) are seeded via migration.
Policies are linked via the RolePolicyLink join table.
"""

from typing import ClassVar
from uuid import UUID

from sqlalchemy import String, text
from sqlmodel import Field, Index, UniqueConstraint

from nexus.core.constants import FieldLimits
from nexus.core.models.base import BaseResource


class Role(BaseResource, table=True):
    """Role model representing a bundle of policies.

    Policies are linked via the ``RolePolicyLink`` join table rather than
    stored inline, giving referential integrity and simpler queries.

    Attributes:
        id: Primary key UUID (from BaseResource)
        name: Unique role name
        description: Optional role description
        is_builtin: Whether this role is a built-in system role
        created_at: Creation timestamp (from BaseResource)
        updated_at: Last update timestamp (from BaseResource)
        labels: JSONB key-value labels (from BaseResource)

    """

    __tablename__ = "roles"

    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "name",
        "description",
        "is_builtin",
        "project_id",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *BaseResource.__sortable_fields__,
        "name",
        "is_builtin",
    ]

    name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Unique role name",
        index=True,
    )

    description: str | None = Field(
        default=None,
        max_length=FieldLimits.DESCRIPTION_MAX_LENGTH,
        sa_type=String(FieldLimits.DESCRIPTION_MAX_LENGTH),  # type: ignore[call-overload]
        description="Role description",
    )

    is_builtin: bool = Field(
        default=False,
        description="Whether this is a built-in system role",
        index=True,
    )

    project_id: UUID | None = Field(
        default=None,
        foreign_key="projects.id",
        description="Optional project scope (NULL = global role)",
        index=True,
    )

    __table_args__ = (
        Index(
            "ix_roles_name_global_unique",
            "name",
            unique=True,
            postgresql_where=text("project_id IS NULL"),
        ),
        Index(
            "ix_roles_name_project_unique",
            "name",
            "project_id",
            unique=True,
            postgresql_where=text("project_id IS NOT NULL"),
        ),
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<Role(id={self.id}, name={self.name}, is_builtin={self.is_builtin})>"


class RolePolicyLink(BaseResource, table=True):
    """Many-to-many link between roles and policies.

    Attributes:
        role_id: FK to roles table
        policy_id: FK to policies table

    """

    __tablename__ = "role_policies"

    role_id: UUID = Field(
        foreign_key="roles.id",
        description="Role that includes the policy",
        index=True,
    )

    policy_id: UUID = Field(
        foreign_key="policies.id",
        description="Policy included in the role",
        index=True,
    )

    __table_args__ = (UniqueConstraint("role_id", "policy_id", name="uq_role_policies_role_policy"),)

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<RolePolicyLink(role_id={self.role_id}, policy_id={self.policy_id})>"
