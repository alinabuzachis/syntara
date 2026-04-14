"""Authorization debug/query endpoints.

Provides three query patterns:
- Can I?   — Check if the current user can perform a specific action
- Who can? — List users who can perform a specific action
- What can I? — List all permissions for the current user
"""

from typing import Annotated, Any
from uuid import UUID

import structlog
from fastapi import Depends
from sqlmodel import Field, SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.dependencies import get_current_user
from nexus.authz.dependencies import PermissionChecker, get_opa_client
from nexus.authz.engine import AuthzRequest, authorize
from nexus.authz.opa_client import OPAClient
from nexus.authz.resolver import resolve_effective_policies
from nexus.core.database.session import get_db
from nexus.core.models.user import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter

logger = structlog.stdlib.get_logger(__name__)

router = NexusRouter(prefix="/authz", tags=["authorization"])


# ============================================================================
# Request/Response Schemas
# ============================================================================


class CanIRequest(SQLModel):
    """Request body for the Can I? endpoint."""

    action: str
    resource_type: str
    resource_id: str = ""
    resource_labels: dict[str, str] = {}
    resource_metadata: dict[str, Any] = {}
    resource_project: str = ""


class CanIResponse(SQLModel):
    """Response body for the Can I? endpoint."""

    allowed: bool
    denied: bool
    matched_policy: str
    denial_reason: str
    denied_by: str


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
    project: str = ""


class WhatCanIResponse(SQLModel):
    """Response body for the What can I? endpoint."""

    permissions: list[PermissionEntry]


# ============================================================================
# Endpoints
# ============================================================================


_authz_query_perm = PermissionChecker("authz", "query", roles=["admin"])


@router.post("/can-i", dependencies=[NO_PERMISSION])
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


@router.post("/who-can", dependencies=[Depends(_authz_query_perm)])
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
                User.is_active.is_(True),  # type: ignore[attr-defined]
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


@router.post("/what-can-i", dependencies=[NO_PERMISSION])
async def what_can_i(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WhatCanIResponse:
    """List all permissions for the current user.

    Resolves the user's effective policies and returns them as a
    flat list of permission entries. No OPA call needed.

    Args:
        current_user: The authenticated user.
        db: Database session.

    Returns:
        List of permission entries.

    """
    effective = await resolve_effective_policies(db, current_user.id)

    permissions = [
        PermissionEntry(
            policy_name=p.get("name", ""),
            effect=p.get("effect", ""),
            actions=p.get("actions", []),
            scope=p.get("scope", ""),
            project=p.get("project", ""),
        )
        for p in effective
    ]

    return WhatCanIResponse(permissions=permissions)
