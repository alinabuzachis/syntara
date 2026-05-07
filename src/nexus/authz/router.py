"""Authorization debug/query endpoints.

Provides three query patterns:
- Can I?   — Check if the current user can perform a specific action
- Who can? — List users who can perform a specific action
- What can I? — List all permissions for the current user
- Resource actions — List all available resource types and their valid actions
"""

import re
from typing import Annotated, Any, ClassVar, Literal
from uuid import UUID

import structlog
from fastapi import Depends, Query, Request
from pydantic import ConfigDict
from sqlmodel import Field, SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.dependencies import get_current_user
from nexus.authz.dependencies import PermissionChecker, get_opa_client
from nexus.authz.engine import AuthzRequest, authorize, resolve_readable_project_ids
from nexus.authz.models.project import Project
from nexus.authz.opa_client import OPAClient
from nexus.authz.resolver import resolve_effective_policies, resolve_user_groups
from nexus.core.constants import NAME_PATTERN, FieldLimits
from nexus.core.database.session import get_db
from nexus.core.models.user import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

logger = structlog.stdlib.get_logger(__name__)

router = NexusRouter(prefix="/authz", tags=["Authorization"])


# ============================================================================
# Request/Response Schemas
# ============================================================================


class CanIRequest(SQLModel):
    """Request body for the Can I? authorization check."""

    model_config: ClassVar[ConfigDict] = ConfigDict(title="Can I Request")  # type: ignore[assignment]

    action: str = Field(title=None, description='The action to check (e.g., "read", "create", "delete")')
    resource_type: str = Field(title=None, description='The type of resource (e.g., "workflow", "project")')
    resource_id: str = Field(default="", title=None, description="Optional specific resource ID")
    resource_labels: Annotated[dict[str, str], Field(description="Labels on the target resource")] = {}
    resource_metadata: Annotated[
        dict[str, Any], Field(description="Additional metadata about the target resource")
    ] = {}
    resource_project: str = Field(default="", title=None, description="Project scope of the resource")


class CanIResponse(SQLModel):
    """Authorization decision result."""

    model_config: ClassVar[ConfigDict] = ConfigDict(title="Can I Response")  # type: ignore[assignment]

    allowed: bool = Field(title=None, description="Whether the action is allowed")
    denied: bool = Field(title=None, description="Whether the action is explicitly denied")
    matched_policy: str = Field(title=None, description="Name of the policy that matched")
    denial_reason: str = Field(title=None, description="Reason for denial (empty if allowed)")
    denied_by: str = Field(title=None, description="Name of the deny policy (empty if allowed)")


class WhoCanRequest(SQLModel):
    """Request body for the Who can? endpoint."""

    action: str
    resource_type: str
    resource_id: str = ""
    resource_labels: dict[str, str] = {}
    resource_metadata: dict[str, Any] = {}
    resource_project: str = ""
    limit: int = Field(default=20, gt=0, le=100, description="Maximum number of results per page")
    cursor: UUID | None = None


class WhoCanUser(SQLModel):
    """A user who can perform the requested action."""

    id: UUID
    username: str


class WhoCanResponse(SQLModel):
    """Response body for the Who can? endpoint."""

    users: list[WhoCanUser]
    next_cursor: UUID | None = None


class PermissionEntry(SQLModel):
    """A single permission from a policy statement."""

    policy_name: str
    effect: str
    actions: list[str]
    scope: str
    project: str = Field(default="", description="Project scope (empty for system-level)")


class WhatCanIResponse(SQLModel):
    """Response body for the What can I? endpoint."""

    permissions: list[PermissionEntry]


class ResourceActionsResponse(SQLModel):
    """Available resource types and their valid actions."""

    model_config: ClassVar[ConfigDict] = ConfigDict(title="Resource Actions Response")  # type: ignore[assignment]

    resource_actions: dict[str, list[str]] = Field(description="Map of resource types to their valid actions")


# ============================================================================
# Helpers
# ============================================================================


async def _ids_to_names(db: AsyncSession, project_ids: set[UUID]) -> set[str]:
    """Map project UUIDs to their names."""
    projects_result = await db.exec(
        select(Project.name).where(
            Project.id.in_(list(project_ids)),  # type: ignore[attr-defined]
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    return set(projects_result.all())


# ============================================================================
# Endpoints
# ============================================================================


_authz_query_perm = PermissionChecker("authz", "query")


@router.post(
    "/can-i",
    dependencies=[NO_PERMISSION],
    operation_id="can_i",
    summary="Check if the current user can perform an action",
    description=(
        "Evaluates the current user's effective policies against OPA to determine if a specific action"
        " is allowed on a resource."
    ),
    response_description="Authorization decision",
)
async def can_i(
    body: CanIRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    opa_client: Annotated[OPAClient, Depends(get_opa_client)],
) -> CanIResponse:
    """Check if the current user can perform a specific action.

    Evaluates the user's effective policies against OPA.

    Args:
        body: The authorization query.
        current_user: The authenticated user.
        db: Database session.
        opa_client: OPA client.

    Returns:
        Authorization decision.

    """
    result = await authorize(
        db,
        opa_client,
        AuthzRequest(
            user_id=current_user.id,
            action=body.action,
            resource_type=body.resource_type,
            resource_id=body.resource_id,
            resource_labels=body.resource_labels,
            resource_metadata=body.resource_metadata,
            resource_project=body.resource_project,
            user_labels=current_user.labels,
            user_metadata=current_user.authz_metadata,
        ),
    )

    return CanIResponse(
        allowed=result.allowed,
        denied=result.denied,
        matched_policy=result.matched_policy,
        denial_reason=result.denial_reason,
        denied_by=result.denied_by,
    )


@router.post(
    "/who-can",
    dependencies=[Depends(_authz_query_perm)],
    operation_id="who_can",
    summary="List users who can perform an action",
    description=(
        "Iterates all active users, resolves their policies, and checks each against OPA. This is a debugging endpoint."
    ),
    response_description="List of authorized users",
)
async def who_can(
    body: WhoCanRequest,
    _current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    opa_client: Annotated[OPAClient, Depends(get_opa_client)],
) -> WhoCanResponse:
    """List users who can perform a specific action.

    Iterates active users in batches, resolves their policies, and checks
    each against OPA. Returns paginated results with a cursor for the next page.

    Args:
        body: The authorization query (includes limit and cursor for pagination).
        _current_user: The authenticated user (for auth check).
        db: Database session.
        opa_client: OPA client.

    Returns:
        Paginated list of authorized users with next_cursor.

    """
    limit = body.limit
    db_batch_size = 200

    authorized_users: list[WhoCanUser] = []
    cursor = body.cursor

    while len(authorized_users) < limit:
        query = (
            select(User)
            .where(
                User.is_enabled.is_(True),  # type: ignore[attr-defined]
                User.deleted_at.is_(None),  # type: ignore[union-attr]
            )
            .order_by(User.id)  # type: ignore[arg-type]
            .limit(db_batch_size)
        )
        if cursor:
            query = query.where(User.id > cursor)

        users_result = await db.exec(query)
        batch = users_result.all()
        if not batch:
            return WhoCanResponse(users=authorized_users, next_cursor=None)

        for user in batch:
            result = await authorize(
                db,
                opa_client,
                AuthzRequest(
                    user_id=user.id,
                    action=body.action,
                    resource_type=body.resource_type,
                    resource_id=body.resource_id,
                    resource_labels=body.resource_labels,
                    resource_metadata=body.resource_metadata,
                    resource_project=body.resource_project,
                    user_labels=user.labels,
                    user_metadata=user.authz_metadata,
                ),
            )
            if result.allowed:
                authorized_users.append(WhoCanUser(id=user.id, username=user.username))
                if len(authorized_users) >= limit:
                    return WhoCanResponse(users=authorized_users, next_cursor=user.id)

        cursor = batch[-1].id

    return WhoCanResponse(users=authorized_users, next_cursor=None)


@router.post(
    "/what-can-i",
    dependencies=[NO_PERMISSION],
    operation_id="what_can_i",
    summary="List all permissions for the current user",
    description=(
        "Resolves the current user's effective policies and returns them as a flat list of permission entries."
        " No OPA call needed."
    ),
    response_description="List of permission entries",
)
async def what_can_i(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WhatCanIResponse:
    """List all permissions for the current user.

    Resolves the user's effective policies and returns them as a
    flat list of permission entries. No OPA call needed.

    Args:
        request: The HTTP request.
        current_user: The authenticated user.
        db: Database session.

    Returns:
        List of permission entries.

    """
    effective = await resolve_effective_policies(db, current_user.id)
    groups = await resolve_user_groups(db, current_user.id)

    opa_client = get_opa_client(request)
    readable_ids = await resolve_readable_project_ids(
        db,
        opa_client,
        current_user.id,
        effective,
        groups,
        current_user.labels,
        current_user.authz_metadata,
    )
    readable_names: set[str] | None = None
    if readable_ids is not None:
        readable_names = await _ids_to_names(db, readable_ids) if readable_ids else set()

    permissions = [
        PermissionEntry(
            policy_name=p.get("name", ""),
            effect=p.get("effect", ""),
            actions=p.get("actions", []),
            scope=p.get("scope", ""),
            project=p.get("project", "") if readable_names is None or p.get("project", "") in readable_names else "",
        )
        for p in effective
    ]

    return WhatCanIResponse(permissions=permissions)


@router.get(
    "/resource-actions",
    dependencies=[NO_PERMISSION],
    operation_id="get_resource_actions",
    summary="List available resource types and actions",
    description="Returns the catalog of all resource types and the actions that can be performed on each.",
    response_description="Map of resource types to their valid actions",
)
async def get_resource_actions(request: Request) -> ResourceActionsResponse:
    """Return the canonical resource-type -> actions catalog.

    Built dynamically at startup from route dependencies and built-in policies.
    """
    return ResourceActionsResponse(resource_actions=request.app.state.resource_actions)


# ============================================================================
# Name validation
# ============================================================================

_NAME_RE = re.compile(NAME_PATTERN)


class ValidateNameResponse(SQLModel):
    """Response body for the validate-name endpoint."""

    valid: bool
    name: str
    reason: str = ""


@router.get("/validate-name", dependencies=[NO_PERMISSION], operation_id="validate_name")
async def validate_name(
    name: Annotated[str, Query(description="Name to validate")],
    resource_type: Annotated[  # noqa: ARG001
        Literal["project", "policy", "role"],
        Query(description="Resource type"),
    ] = "project",
) -> ValidateNameResponse:
    """Validate a resource name against naming rules.

    Returns whether the name is valid and, if not, why.
    Intended for real-time UI validation.
    """
    if not name:
        return ValidateNameResponse(valid=False, name=name, reason="Name must not be empty")
    if len(name) > FieldLimits.NAME_MAX_LENGTH:
        return ValidateNameResponse(
            valid=False, name=name, reason=f"Name must be {FieldLimits.NAME_MAX_LENGTH} characters or fewer"
        )
    if not _NAME_RE.match(name):
        return ValidateNameResponse(
            valid=False,
            name=name,
            reason="Name must start and end with a letter or digit, "
            "and may contain letters, digits, colons, hyphens, and underscores",
        )

    return ValidateNameResponse(valid=True, name=name)
