"""Request/response schemas for the projects API."""

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import Field as PydanticField
from sqlmodel import Field, SQLModel

from nexus.authz.schemas import PolicyStatementSchema
from nexus.core.constants import NAME_PATTERN
from nexus.core.models.base import BaseResource

NameField = Annotated[str, PydanticField(min_length=1, max_length=255, pattern=NAME_PATTERN)]
OptionalNameField = Annotated[
    str | None, PydanticField(default=None, min_length=1, max_length=255, pattern=NAME_PATTERN)
]


class ProjectCreate(SQLModel):
    """Request body for creating a project."""

    name: NameField
    description: str | None = None
    labels: dict[str, Any] = {}


class ProjectUpdate(SQLModel):
    """Request body for updating a project."""

    name: OptionalNameField
    description: str | None = None
    labels: dict[str, Any] | None = None


class ProjectRead(BaseResource):
    """Response body for a project."""

    name: str
    description: str | None = None
    is_default: bool = False


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
    role_name: str
    created_at: datetime | None = None


class ProjectRoleCreate(SQLModel):
    """Request body for creating a project-scoped role (project_id comes from URL path)."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    policies: list[str] = Field(min_length=1)
    labels: dict[str, str] = {}


class ProjectPolicyCreate(SQLModel):
    """Request body for creating a project-scoped policy (project_id comes from URL path)."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    statements: list[PolicyStatementSchema] = Field(min_length=1)
    labels: dict[str, str] = {}
