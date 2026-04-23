"""Assignment link tables for role relationships.

UserRoleAssignment: Roles assigned to users (global or project-scoped).
GroupRoleAssignment: Roles assigned to groups (global or project-scoped).

When project_id is NULL the assignment is system-wide (global).
When project_id is set the assignment is scoped to that project.

Resolution chain:
- Global: user → (direct roles + groups → roles) → policies
- Project: user → project role assignments → roles → policies (with project scope)

Roles are referenced by name (not FK) because built-in roles are not
stored in the database — they exist only in ``role_conventions.py``.
"""

from uuid import UUID

from sqlalchemy import String, text
from sqlmodel import Field, Index

from nexus.core.constants import FieldLimits
from nexus.core.models.base import BaseResource


class UserRoleAssignment(BaseResource, table=True):
    """User-to-role assignment, optionally scoped to a project."""

    __tablename__ = "user_role_assignments"

    user_id: UUID = Field(
        foreign_key="users.id",
        description="User receiving the role",
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

    __table_args__ = (
        Index(
            "ix_ura_user_role_global",
            "user_id",
            "role_name",
            unique=True,
            postgresql_where=text("project_id IS NULL"),
        ),
        Index(
            "ix_ura_user_role_project",
            "user_id",
            "role_name",
            "project_id",
            unique=True,
            postgresql_where=text("project_id IS NOT NULL"),
        ),
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<UserRoleAssignment(user_id={self.user_id}, role_name={self.role_name}, project_id={self.project_id})>"


class GroupRoleAssignment(BaseResource, table=True):
    """Group-to-role assignment, optionally scoped to a project.

    All members of the group inherit the role.  When project_id is set,
    the role applies only within that project.
    """

    __tablename__ = "group_role_assignments"

    group_id: UUID = Field(
        foreign_key="groups.id",
        description="Group receiving the role",
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

    __table_args__ = (
        Index(
            "ix_gra_group_role_global",
            "group_id",
            "role_name",
            unique=True,
            postgresql_where=text("project_id IS NULL"),
        ),
        Index(
            "ix_gra_group_role_project",
            "group_id",
            "role_name",
            "project_id",
            unique=True,
            postgresql_where=text("project_id IS NOT NULL"),
        ),
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return (
            f"<GroupRoleAssignment(group_id={self.group_id}, role_name={self.role_name}, project_id={self.project_id})>"
        )
