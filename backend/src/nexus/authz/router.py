"""Authorization debug/query endpoints.

Provides three query patterns:
- Can I?   — Check if the current user can perform a specific action
- Who can? — List users who can perform a specific action
- What can I? — List all permissions for the current user
- Resource actions — List all available resource types and their valid actions
"""

import asyncio
import re
from collections.abc import Sequence
from typing import Annotated, Any, ClassVar, Literal
from uuid import UUID

import structlog
from fastapi import Depends, Query, Request
from pydantic import ConfigDict
from pydantic import Field as PydanticField
from sqlalchemy import Select
from sqlmodel import Field, SQLModel, col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.dependencies import get_current_user
from nexus.authz.dependencies import PermissionChecker, get_opa_client
from nexus.authz.engine import AuthzRequest, authorize, resolve_readable_project_ids
from nexus.authz.models.project import Project
from nexus.authz.opa_client import OPAClient
from nexus.authz.resolver import resolve_effective_policies, resolve_user_groups
from nexus.core.constants import NAME_PATTERN, FieldLimits
from nexus.core.database.session import get_db
from nexus.core.exceptions import SafeValueError
from nexus.core.models.base.query_params import BasePaginatedRequest
from nexus.core.models.pagination import ResourcesResponse
from nexus.core.models.user import User
from nexus.core.nexus_router import NO_PERMISSION, NexusRouter
from nexus.core.utils.cursor import (
    PaginationDirection,
    SortDirection,
    create_cursor_data,
    decode_cursor,
    encode_cursor,
    extract_pagination_from_cursor,
    extract_sort_from_cursor,
)
from nexus.core.utils.sorting import apply_sorting, parse_sort

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
    resource_project: str = Field(
        default="", title=None, description="Project scope of the resource (project name or UUID)"
    )


class CanIResponse(SQLModel):
    """Authorization decision result."""

    model_config: ClassVar[ConfigDict] = ConfigDict(title="Can I Response")  # type: ignore[assignment]

    allowed: bool = Field(title=None, description="Whether the action is allowed")
    denied: bool = Field(title=None, description="Whether the action is explicitly denied")
    matched_policy: str = Field(title=None, description="Name of the policy that matched")
    denial_reason: str = Field(title=None, description="Reason for denial (empty if allowed)")
    denied_by: str = Field(title=None, description="Name of the deny policy (empty if allowed)")


class WhoCanRequest(BasePaginatedRequest):
    """Request body for the Who can? endpoint."""

    action: str = PydanticField(json_schema_extra={"x-query-param": True})
    resource_type: str = PydanticField(json_schema_extra={"x-query-param": True})
    resource_id: str = PydanticField(default="", json_schema_extra={"x-query-param": True})
    resource_labels: dict[str, str] = PydanticField(default_factory=dict, json_schema_extra={"x-query-param": True})
    resource_metadata: dict[str, Any] = PydanticField(default_factory=dict, json_schema_extra={"x-query-param": True})
    resource_project: str = PydanticField(
        default="",
        description="Project scope of the resource (project name or UUID)",
        json_schema_extra={"x-query-param": True},
    )


class WhoCanUser(SQLModel):
    """A user who can perform the requested action."""

    id: UUID
    username: str


class WhoCanResponse(ResourcesResponse[WhoCanUser]):
    """Paginated response body for the Who can? endpoint."""


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


async def _resolve_project_input(db: AsyncSession, resource_project: str) -> str:
    """Resolve resource_project: if it's a valid UUID, look up the project name."""
    if not resource_project:
        return ""
    try:
        project_id = UUID(resource_project)
    except ValueError:
        return resource_project
    result = await db.exec(
        select(Project.name).where(
            Project.id == project_id,
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    return result.first() or resource_project


async def _ids_to_names(db: AsyncSession, project_ids: set[UUID]) -> set[str]:
    """Map project UUIDs to their names."""
    projects_result = await db.exec(
        select(Project.name).where(
            Project.id.in_(list(project_ids)),  # type: ignore[attr-defined]
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    return set(projects_result.all())


# who_can can't use BaseService for pagination because authorization is determined
# per-user via OPA, not by SQL filters. We must scan users in batches, check each
# against OPA, and paginate the filtered results manually.
_WHO_CAN_SORTABLE_FIELDS: list[str] = ["id", "username"]
_WHO_CAN_DB_BATCH_SIZE = 200
_WHO_CAN_MAX_TOTAL_SCAN = 10_000
_WHO_CAN_OPA_CONCURRENCY = 20


def _flip_sort_direction(sort_direction: SortDirection) -> SortDirection:
    """Return the opposite sort direction."""
    return SortDirection.ASC if sort_direction == SortDirection.DESC else SortDirection.DESC


def _extract_batch_sort_value(item: User, sort_field: str) -> str | None:
    """Get the sort field value from a user row for cursor positioning."""
    if sort_field == "id":
        return None
    return str(getattr(item, sort_field))


async def _check_user_authorized(
    db: AsyncSession,
    opa_client: OPAClient,
    user: User,
    body: WhoCanRequest,
    resource_project: str,
) -> bool:
    """Check if a single user is authorized for the requested action."""
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
            resource_project=resource_project,
            user_labels=user.labels,
            user_metadata=user.authz_metadata,
        ),
    )
    return result.allowed


def _apply_who_can_cursor_filter(
    query: Select[tuple[User]],
    *,
    sort_field: str,
    sort_direction: SortDirection,
    direction: PaginationDirection,
    cursor_id: UUID,
    cursor_sort_value: str | None,
) -> Select[tuple[User]]:
    """Apply cursor boundary filter for who_can pagination.

    Uses keyset pagination: filters on (sort_field, id) so we resume
    exactly where the previous page left off without offset-based skipping.
    For example, sorting by username ASC with a forward cursor produces:
        WHERE (username > cursor_val) OR (username = cursor_val AND id > cursor_id)
    """
    sort_attr = getattr(User, sort_field)

    # When sorting by id alone, the compound comparison simplifies to a single condition.
    # forward + ASC or backward + DESC → use ">", otherwise "<"
    if sort_field == "id":
        if (direction == PaginationDirection.NEXT) == (sort_direction == SortDirection.ASC):
            return query.where(col(User.id) > cursor_id)
        return query.where(col(User.id) < cursor_id)

    # No sort value means we can't position the cursor on the secondary field
    if cursor_sort_value is None:
        return query

    # Compound comparison: use the sort field as primary, id as tiebreaker.
    # This ensures stable ordering even when multiple rows share the same sort value.
    if (direction == PaginationDirection.NEXT) == (sort_direction == SortDirection.ASC):
        return query.where(
            (col(sort_attr) > cursor_sort_value) | ((col(sort_attr) == cursor_sort_value) & (col(User.id) > cursor_id))
        )
    return query.where(
        (col(sort_attr) < cursor_sort_value) | ((col(sort_attr) == cursor_sort_value) & (col(User.id) < cursor_id))
    )


async def _check_batch_authorization(
    db: AsyncSession,
    opa_client: OPAClient,
    batch: Sequence[User],
    body: WhoCanRequest,
    resource_project: str,
    authorized: list[WhoCanUser],
    checked_ids: set[UUID],
    target_count: int,
) -> None:
    """Check each user in a batch against OPA, appending authorized ones."""
    for user in batch:
        checked_ids.add(user.id)
        if await _check_user_authorized(db, opa_client, user, body, resource_project):
            authorized.append(WhoCanUser(id=user.id, username=user.username))
            if len(authorized) >= target_count:
                return


async def _scan_authorized_users(
    db: AsyncSession,
    opa_client: OPAClient,
    body: WhoCanRequest,
    resource_project: str,
    *,
    cursor_id: UUID | None,
    cursor_sort_value: str | None,
    direction: PaginationDirection,
    sort_field: str,
    sort_direction: SortDirection,
    target_count: int,
) -> tuple[list[WhoCanUser], set[UUID]]:
    """Scan users in batches and return those authorized for the action.

    Checks each user against OPA one at a time and stops as soon as
    target_count authorized users are found or all matching users have
    been checked.

    Returns:
        Tuple of (authorized_users, checked_user_ids). The checked set
        includes all users evaluated against OPA (authorized or not),
        allowing callers to skip redundant OPA checks.

    """
    authorized: list[WhoCanUser] = []
    checked_ids: set[UUID] = set()
    batch_cursor_id = cursor_id
    batch_sort_value = cursor_sort_value
    is_backward = direction == PaginationDirection.PREV
    actual_direction = _flip_sort_direction(sort_direction) if is_backward else sort_direction

    while len(authorized) < target_count:
        query = select(User).where(
            User.is_enabled.is_(True),  # type: ignore[attr-defined]
            User.deleted_at.is_(None),  # type: ignore[union-attr]
        )
        if batch_cursor_id is not None:
            query = _apply_who_can_cursor_filter(  # type: ignore[assignment]
                query,
                sort_field=sort_field,
                sort_direction=sort_direction,
                direction=direction,
                cursor_id=batch_cursor_id,
                cursor_sort_value=batch_sort_value,
            )
        query = apply_sorting(  # type: ignore[assignment]
            query,
            [(sort_field, actual_direction), ("id", actual_direction)],
            User,
        )
        query = query.limit(_WHO_CAN_DB_BATCH_SIZE)

        users_result = await db.exec(query)
        batch = users_result.all()
        if not batch:
            break

        await _check_batch_authorization(
            db, opa_client, batch, body, resource_project, authorized, checked_ids, target_count
        )

        last = batch[-1]
        batch_cursor_id = last.id
        batch_sort_value = _extract_batch_sort_value(last, sort_field)

    if is_backward:
        authorized.reverse()
    return authorized, checked_ids


def _build_opa_input(
    user: User,
    body: WhoCanRequest,
    resource_project: str,
    groups: list[dict[str, Any]],
    effective: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the OPA evaluation input for a single user."""
    return {
        "user": {"id": str(user.id), "metadata": user.authz_metadata, "labels": user.labels},
        "action": body.action,
        "resource": {
            "type": body.resource_type,
            "id": body.resource_id,
            "project": resource_project,
            "metadata": body.resource_metadata,
            "labels": body.resource_labels,
        },
        "groups": groups,
        "effective_policies": effective,
    }


async def _count_authorized_users(
    db: AsyncSession,
    opa_client: OPAClient,
    body: WhoCanRequest,
    resource_project: str,
    *,
    skip_ids: set[UUID] | None = None,
    initial_count: int = 0,
) -> int | None:
    """Count all users authorized for the action.

    Scans all active users and checks each against OPA. Capped at
    _WHO_CAN_MAX_TOTAL_SCAN users to prevent runaway queries on
    large user bases. Returns None when the cap is reached, signaling
    that the total is indeterminate.

    Each DB batch is processed in two phases: policy and group
    resolution runs sequentially (DB-bound), then OPA evaluations
    run concurrently bounded by ``_WHO_CAN_OPA_CONCURRENCY``.

    When ``skip_ids`` is provided, users already evaluated by a prior
    scan are skipped to avoid redundant OPA calls. ``initial_count``
    seeds the counter with authorized users already known.
    """
    count = initial_count
    users_scanned = 0
    scan_cursor: UUID | None = None
    already_checked = skip_ids or set()
    semaphore = asyncio.Semaphore(_WHO_CAN_OPA_CONCURRENCY)

    async def _eval_opa(opa_input: dict[str, Any]) -> bool:
        async with semaphore:
            result = await opa_client.evaluate(opa_input)
            return bool(result.get("allow", False))

    while True:
        query = (
            select(User)
            .where(
                User.is_enabled.is_(True),  # type: ignore[attr-defined]
                User.deleted_at.is_(None),  # type: ignore[union-attr]
            )
            .order_by(col(User.id))
            .limit(_WHO_CAN_DB_BATCH_SIZE)
        )
        if scan_cursor:
            query = query.where(col(User.id) > scan_cursor)

        users_result = await db.exec(query)
        batch = users_result.all()
        if not batch:
            break

        opa_inputs: list[dict[str, Any]] = []
        for user in batch:
            users_scanned += 1
            if users_scanned > _WHO_CAN_MAX_TOTAL_SCAN:
                logger.warning(
                    "who_can total count scan exceeded safety cap",
                    cap=_WHO_CAN_MAX_TOTAL_SCAN,
                    count_so_far=count,
                )
                return None
            if user.id in already_checked:
                continue
            effective = await resolve_effective_policies(db, user.id)
            groups = await resolve_user_groups(db, user.id)
            opa_inputs.append(_build_opa_input(user, body, resource_project, groups, effective))

        if opa_inputs:
            results = await asyncio.gather(*[_eval_opa(inp) for inp in opa_inputs])
            count += sum(1 for allowed in results if allowed)

        scan_cursor = batch[-1].id

    return count


def _build_page_cursors(
    results: list[WhoCanUser],
    *,
    direction: PaginationDirection,
    has_more: bool,
    cursor_id: UUID | None,
    sort_field: str,
    sort_direction: SortDirection,
) -> tuple[str | None, str | None]:
    """Build next/prev cursor strings from a page of results.

    Emits a next cursor when there are more results ahead, and a prev
    cursor when there are results behind (i.e., we didn't start from
    the beginning). Each cursor encodes the boundary user's sort value,
    id, sort field, sort direction, and navigation direction.
    """
    if not results:
        return None, None

    is_forward = direction == PaginationDirection.NEXT

    def _make_cursor(boundary: WhoCanUser, nav_direction: PaginationDirection) -> str:
        # created_at carries the sort value (e.g. username) — this is a CursorData
        # convention where created_at is the generic secondary sort value field
        sort_value = str(getattr(boundary, sort_field)) if sort_field != "id" else None
        return encode_cursor(
            create_cursor_data(
                resource_id=boundary.id,
                created_at=sort_value,
                direction=nav_direction,
                sort_field=sort_field,
                sort_direction=sort_direction,
            )
        )

    # next cursor: emit when forward and there are more rows, or backward and
    # we know there are rows ahead (because we started from a cursor, not the beginning)
    if (is_forward and has_more) or (not is_forward and cursor_id is not None):
        next_cursor = _make_cursor(results[-1], PaginationDirection.NEXT)
    else:
        next_cursor = None

    # prev cursor: emit when forward and we started from a cursor (not page 1),
    # or backward and there are more rows behind us
    if (is_forward and cursor_id is not None) or (not is_forward and has_more):
        prev_cursor = _make_cursor(results[0], PaginationDirection.PREV)
    else:
        prev_cursor = None

    return next_cursor, prev_cursor


# ============================================================================
# Endpoints
# ============================================================================


_authz_query_perm = PermissionChecker("authz", "query")


@router.post(
    "/can_i",
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
    resource_project = await _resolve_project_input(db, body.resource_project)

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
            resource_project=resource_project,
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
    "/who_can",
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
    """List users who can perform a specific action."""
    resource_project = await _resolve_project_input(db, body.resource_project)

    if body.cursor:
        cursor_data = decode_cursor(body.cursor)
        resource_id, cursor_sort_value, direction = extract_pagination_from_cursor(cursor_data)
        cursor_id = UUID(resource_id) if resource_id else None
        sort_field, sort_direction = extract_sort_from_cursor(cursor_data)
        if sort_field not in _WHO_CAN_SORTABLE_FIELDS:
            msg = f"Invalid sort field in cursor: {sort_field}"
            raise SafeValueError(msg)
    else:
        sort_field, sort_direction = parse_sort(
            body.sort, _WHO_CAN_SORTABLE_FIELDS, default_field="id", default_direction=SortDirection.ASC
        )
        cursor_id, cursor_sort_value, direction = None, None, PaginationDirection.NEXT

    results, checked_ids = await _scan_authorized_users(
        db,
        opa_client,
        body,
        resource_project,
        cursor_id=cursor_id,
        cursor_sort_value=cursor_sort_value,
        direction=direction,
        sort_field=sort_field,
        sort_direction=sort_direction,
        target_count=body.limit + 1,
    )

    page_authorized_count = len(results)
    has_more = len(results) > body.limit
    if has_more:
        results = results[1:] if direction == PaginationDirection.PREV else results[: body.limit]

    next_cursor, prev_cursor = _build_page_cursors(
        results,
        direction=direction,
        has_more=has_more,
        cursor_id=cursor_id,
        sort_field=sort_field,
        sort_direction=sort_direction,
    )

    total_count: int | None = None
    if body.include_total:
        logger.info(
            "who_can include_total requested — scanning up to %d users",
            _WHO_CAN_MAX_TOTAL_SCAN,
            action=body.action,
            resource_type=body.resource_type,
        )
        total_count = await _count_authorized_users(
            db,
            opa_client,
            body,
            resource_project,
            skip_ids=checked_ids,
            initial_count=page_authorized_count,
        )

    return WhoCanResponse(
        resources=results,
        next=next_cursor,
        prev=prev_cursor,
        total=total_count,
    )


@router.post(
    "/what_can_i",
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
    "/resource_actions",
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
    """Response body for the validate_name endpoint."""

    valid: bool
    name: str
    reason: str = ""


@router.get("/validate_name", dependencies=[NO_PERMISSION], operation_id="validate_name")
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
