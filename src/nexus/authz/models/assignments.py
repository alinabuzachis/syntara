"""Unified role assignment model.

RoleAssignment links a principal (user or group) to a role, optionally
scoped to a project.

When project_id is NULL the assignment is system-wide (global).
When project_id is set the assignment is scoped to that project.

Resolution chain:
- Global: user -> (direct roles + groups -> roles) -> policies
- Project: user -> project role assignments -> roles -> policies (with project scope)

Roles are referenced by name (not FK) because built-in roles are not
stored in the database -- they exist only in ``role_conventions.py``.
"""

from enum import StrEnum
from uuid import UUID

from sqlalchemy import String, text
from sqlmodel import Field, Index

from nexus.core.constants import FieldLimits
from nexus.core.models.base import BaseResource


class PrincipalType(StrEnum):
    """Type of principal receiving a role assignment."""

    USER = "user"
    GROUP = "group"


class RoleAssignment(BaseResource, table=True):
    """Principal-to-role assignment, optionally scoped to a project."""

    __tablename__ = "role_assignments"

    principal_type: PrincipalType = Field(
        sa_type=String(10),  # type: ignore[call-overload]
        description="Type of principal: 'user' or 'group'",
        index=True,
    )

    principal_id: UUID = Field(
        description="UUID of the user or group receiving the role",
        index=True,
    )

    role_name: str = Field(
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Name of the assigned role",
        index=True,
    )

    project_id: UUID | None = Field(
        default=None,
        foreign_key="projects.id",
        description="Project scope (NULL = global assignment)",
        index=True,
    )

    is_builtin: bool = Field(
        default=False,
        description="Whether this is a seed-level assignment that cannot be revoked",
        index=True,
    )

    __table_args__ = (
        Index(
            "ix_ra_principal_role_global",
            "principal_type",
            "principal_id",
            "role_name",
            unique=True,
            postgresql_where=text("project_id IS NULL"),
        ),
        Index(
            "ix_ra_principal_role_project",
            "principal_type",
            "principal_id",
            "role_name",
            "project_id",
            unique=True,
            postgresql_where=text("project_id IS NOT NULL"),
        ),
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"<RoleAssignment(principal_type={self.principal_type}, "
            f"principal_id={self.principal_id}, role_name={self.role_name}, "
            f"project_id={self.project_id})>"
        )
