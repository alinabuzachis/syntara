"""Request/response schemas for the projects API."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlmodel import SQLModel


class ProjectCreate(SQLModel):
    """Request body for creating a project."""

    name: str
    description: str | None = None
    labels: dict[str, Any] = {}


class ProjectUpdate(SQLModel):
    """Request body for updating a project."""

    name: str | None = None
    description: str | None = None
    labels: dict[str, Any] | None = None


class ProjectRead(SQLModel):
    """Response body for a project."""

    id: UUID
    name: str
    description: str | None = None
    labels: dict[str, Any] = {}
    is_default: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProjectRoleAssignmentCreate(SQLModel):
    """Request body for assigning a role to a user within a project."""

    user_id: UUID
    role_name: str


class ProjectRoleAssignmentRead(SQLModel):
    """Response body for a project role assignment."""

    id: UUID
    user_id: UUID
    username: str = ""
    project_id: UUID
    role_id: UUID
    role_name: str
    created_at: datetime | None = None


class ProjectGroupRoleAssignmentCreate(SQLModel):
    """Request body for assigning a role to a group within a project."""

    group_id: UUID
    role_name: str


class ProjectGroupRoleAssignmentRead(SQLModel):
    """Response body for a project group role assignment."""

    id: UUID
    group_id: UUID
    group_name: str = ""
    project_id: UUID
    role_id: UUID
    role_name: str
    created_at: datetime | None = None
