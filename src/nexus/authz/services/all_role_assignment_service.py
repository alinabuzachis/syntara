"""Service for querying all role assignments (user + group) as a unified list."""

from datetime import datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import String, func, literal, union_all
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import GroupRoleAssignment, UserRoleAssignment
from nexus.core.models import User
from nexus.core.models.group import Group
from nexus.core.utils.cursor import (
    PaginationDirection,
    create_cursor_data,
    decode_cursor,
    encode_cursor,
)

logger = structlog.stdlib.get_logger(__name__)

_PROJECT_MODEL: Any = None


def _get_project_model() -> Any:  # noqa: ANN401
    global _PROJECT_MODEL  # noqa: PLW0603
    if _PROJECT_MODEL is None:
        from nexus.authz.models.project import Project  # noqa: PLC0415

        _PROJECT_MODEL = Project
    return _PROJECT_MODEL


_SORTABLE_FIELDS = {"created_at", "principal_name", "principal_type", "role_name", "project_name"}


class AllRoleAssignmentService:
    """Queries user and group role assignments as a single paginated stream."""

    def __init__(self, session: AsyncSession, current_user: User) -> None:  # noqa: D107
        self.session = session
        self.current_user = current_user

    async def list_all(
        self,
        *,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        principal_type: str | None = None,
        principal_name: str | None = None,
        role_name: str | None = None,
        project_id: UUID | None = None,
        include_total: bool = False,
        restrict_user_id: UUID | None = None,
        restrict_group_ids: list[UUID] | None = None,
    ) -> dict[str, Any]:
        """Return a paginated, filtered, sorted list of all role assignments."""
        combined = self._build_union(principal_type, restrict_user_id, restrict_group_ids)

        stmt = select(  # type: ignore[call-overload]
            combined.c.id,
            combined.c.created_at,
            combined.c.principal_id,
            combined.c.principal_name,
            combined.c.principal_type,
            combined.c.role_name,
            combined.c.project_id,
            combined.c.project_name,
        )

        stmt = self._apply_filters(stmt, combined, principal_name, role_name, project_id)

        total: int | None = None
        if include_total:
            count_result = await self.session.exec(select(func.count()).select_from(stmt.subquery()))
            total = count_result.one()

        sort_field, descending = self._parse_sort(sort)
        sort_col = combined.c[sort_field]
        id_col = combined.c.id

        stmt, is_backward = self._apply_cursor(stmt, cursor, sort_col, id_col, descending)

        effective_desc = descending ^ is_backward
        if effective_desc:
            stmt = stmt.order_by(sort_col.desc(), id_col.desc())
        else:
            stmt = stmt.order_by(sort_col.asc(), id_col.asc())

        stmt = stmt.limit(limit + 1)
        result = await self.session.exec(stmt)
        rows = list(result.all())

        if is_backward:
            rows.reverse()

        has_more = len(rows) > limit
        if has_more:
            rows = rows[1:] if is_backward else rows[:limit]

        resources = [
            {
                "id": str(r.id),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "principal_id": str(r.principal_id),
                "principal_name": r.principal_name,
                "principal_type": r.principal_type,
                "role_name": r.role_name,
                "project_id": str(r.project_id) if r.project_id else None,
                "project_name": r.project_name,
            }
            for r in rows
        ]

        return {
            "resources": resources,
            **self._build_cursors(rows, has_more=has_more, cursor=cursor, is_backward=is_backward),
            "total": total,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_union(
        self,
        principal_type: str | None,
        restrict_user_id: UUID | None,
        restrict_group_ids: list[UUID] | None,
    ) -> Any:  # noqa: ANN401
        """Build the UNION ALL subquery from user and group assignment tables."""
        project_model = _get_project_model()

        user_q = (
            select(  # type: ignore[call-overload]
                UserRoleAssignment.id.label("id"),  # type: ignore[attr-defined]
                UserRoleAssignment.created_at.label("created_at"),  # type: ignore[attr-defined]
                UserRoleAssignment.user_id.label("principal_id"),  # type: ignore[attr-defined]
                User.username.label("principal_name"),  # type: ignore[attr-defined]
                literal("user", type_=String).label("principal_type"),
                UserRoleAssignment.role_name.label("role_name"),  # type: ignore[attr-defined]
                UserRoleAssignment.project_id.label("project_id"),  # type: ignore[union-attr]
                project_model.name.label("project_name"),
            )
            .join(User, UserRoleAssignment.user_id == User.id)
            .outerjoin(project_model, UserRoleAssignment.project_id == project_model.id)
        )
        if restrict_user_id is not None:
            user_q = user_q.where(UserRoleAssignment.user_id == restrict_user_id)

        group_q = (
            select(  # type: ignore[call-overload]
                GroupRoleAssignment.id.label("id"),  # type: ignore[attr-defined]
                GroupRoleAssignment.created_at.label("created_at"),  # type: ignore[attr-defined]
                GroupRoleAssignment.group_id.label("principal_id"),  # type: ignore[attr-defined]
                Group.name.label("principal_name"),  # type: ignore[attr-defined]
                literal("group", type_=String).label("principal_type"),
                GroupRoleAssignment.role_name.label("role_name"),  # type: ignore[attr-defined]
                GroupRoleAssignment.project_id.label("project_id"),  # type: ignore[union-attr]
                project_model.name.label("project_name"),
            )
            .join(Group, GroupRoleAssignment.group_id == Group.id)
            .outerjoin(project_model, GroupRoleAssignment.project_id == project_model.id)
        )
        if restrict_group_ids is not None:
            group_q = group_q.where(GroupRoleAssignment.group_id.in_(restrict_group_ids))  # type: ignore[attr-defined]

        if principal_type == "user":
            return user_q.subquery("combined")
        if principal_type == "group":
            return group_q.subquery("combined")
        return union_all(user_q, group_q).subquery("combined")

    @staticmethod
    def _apply_filters(
        stmt: Any,  # noqa: ANN401
        combined: Any,  # noqa: ANN401
        principal_name: str | None,
        role_name: str | None,
        project_id: UUID | None,
    ) -> Any:  # noqa: ANN401
        if principal_name is not None:
            stmt = stmt.where(combined.c.principal_name == principal_name)
        if role_name is not None:
            stmt = stmt.where(combined.c.role_name == role_name)
        if project_id is not None:
            stmt = stmt.where(combined.c.project_id == project_id)
        return stmt

    @staticmethod
    def _apply_cursor(
        stmt: Any,  # noqa: ANN401
        cursor: str | None,
        sort_col: Any,  # noqa: ANN401
        id_col: Any,  # noqa: ANN401
        descending: bool,  # noqa: FBT001
    ) -> tuple[Any, bool]:
        is_backward = False
        if not cursor:
            return stmt, is_backward

        cursor_data = decode_cursor(cursor)
        rid = cursor_data.get("id")
        cat = cursor_data.get("created_at")
        direction = cursor_data.get("direction", "next")
        is_backward = direction == PaginationDirection.PREV.value

        if rid and cat:
            cursor_dt = datetime.fromisoformat(cat)
            if descending ^ is_backward:
                stmt = stmt.where((sort_col < cursor_dt) | ((sort_col == cursor_dt) & (id_col < rid)))
            else:
                stmt = stmt.where((sort_col > cursor_dt) | ((sort_col == cursor_dt) & (id_col > rid)))

        return stmt, is_backward

    @staticmethod
    def _build_cursors(
        rows: list[Any], *, has_more: bool, cursor: str | None, is_backward: bool
    ) -> dict[str, str | None]:
        next_cursor = None
        prev_cursor = None

        if has_more and rows:
            last = rows[-1]
            next_cursor = encode_cursor(
                create_cursor_data(
                    resource_id=str(last.id), created_at=last.created_at, direction=PaginationDirection.NEXT
                )
            )

        if cursor is not None and rows:
            is_first = is_backward and not has_more
            if not is_first:
                first = rows[0]
                prev_cursor = encode_cursor(
                    create_cursor_data(
                        resource_id=str(first.id), created_at=first.created_at, direction=PaginationDirection.PREV
                    )
                )

        return {"next": next_cursor, "prev": prev_cursor}

    @staticmethod
    def _parse_sort(sort: str | None) -> tuple[str, bool]:
        """Return ``(field, descending)`` from a sort string like ``-created_at``."""
        if not sort:
            return "created_at", True
        descending = sort.startswith("-")
        field = sort.lstrip("-")
        if field not in _SORTABLE_FIELDS:
            return "created_at", True
        return field, descending
