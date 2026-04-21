"""Request/response schemas for the policies and roles API."""

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from pydantic import Field as PydanticField
from pydantic import computed_field
from sqlmodel import Field, SQLModel

from nexus.core.constants import NAME_PATTERN
from nexus.core.models.base import BaseListParams
from nexus.core.models.pagination import ResourcesResponse

NameField = Annotated[str, PydanticField(min_length=1, max_length=255, pattern=NAME_PATTERN)]
OptionalNameField = Annotated[
    str | None, PydanticField(default=None, min_length=1, max_length=255, pattern=NAME_PATTERN)
]

# ---------------------------------------------------------------------------
# Policy schemas
# ---------------------------------------------------------------------------


class PolicyStatementSchema(SQLModel):
    """A single policy statement."""

    effect: str = Field(description="allow or deny")
    actions: list[str] = Field(description="List of resource_type:action strings")
    scope: str = Field(description="any or self")
    conditions: dict[str, Any] | None = Field(default=None, description="Optional attribute-based conditions")


class PolicyCreate(SQLModel):
    """Request body for creating a policy."""

    name: NameField
    description: str | None = None
    statements: list[PolicyStatementSchema] = Field(min_length=1)
    labels: dict[str, str] = {}
    project_id: UUID | None = None


class PolicyUpdate(SQLModel):
    """Request body for updating a policy (partial)."""

    name: OptionalNameField
    description: str | None = None
    statements: list[PolicyStatementSchema] | None = None
    labels: dict[str, str] | None = None


class PolicyRead(SQLModel):
    """Response body for a policy."""

    id: UUID
    name: str
    description: str | None = None
    statements: list[dict[str, Any]] = []
    is_builtin: bool = False
    is_project_eligible: bool = False
    project_id: UUID | None = None
    labels: dict[str, Any] = {}
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_system_scoped(self) -> bool:
        """True when the policy is not scoped to a specific project."""
        return self.project_id is None


class PolicyListResponse(ResourcesResponse[PolicyRead]):
    """Paginated list response for policies."""


class PolicyListParams(BaseListParams):
    """Query parameters for listing policies."""

    name: str | None = Field(default=None, description="Filter by name")
    is_builtin: bool | None = Field(default=None, description="Filter by builtin status")
    project_id: UUID | None = Field(default=None, description="Filter by project scope")
    project_eligible: bool | None = Field(
        default=None,
        description="When true, return only system-scoped policies eligible for project roles",
    )


# ---------------------------------------------------------------------------
# Role schemas
# ---------------------------------------------------------------------------


class RoleCreate(SQLModel):
    """Request body for creating a role."""

    name: NameField
    description: str | None = None
    policies: list[str] = Field(min_length=1)
    labels: dict[str, str] = {}
    project_id: UUID | None = None


class RoleUpdate(SQLModel):
    """Request body for updating a role (partial)."""

    name: OptionalNameField
    description: str | None = None
    policies: list[str] | None = None
    labels: dict[str, str] | None = None


class RoleRead(SQLModel):
    """Response body for a role."""

    id: UUID
    name: str
    description: str | None = None
    policies: list[str] = []
    is_builtin: bool = False
    project_id: UUID | None = None
    labels: dict[str, Any] = {}
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_system_scoped(self) -> bool:
        """True when the role is not scoped to a specific project."""
        return self.project_id is None


class RoleListResponse(ResourcesResponse[RoleRead]):
    """Paginated list response for roles."""


class RoleListParams(BaseListParams):
    """Query parameters for listing roles."""

    name: str | None = Field(default=None, description="Filter by name")
    is_builtin: bool | None = Field(default=None, description="Filter by builtin status")
    project_id: UUID | None = Field(default=None, description="Filter by project scope")
