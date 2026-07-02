"""Service for unified role assignment CRUD operations."""

import builtins
from datetime import datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import case, false, func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.authz.audit.role_assignment import RoleAssignmentEvent
from nexus.authz.exceptions import BuiltinProtectionError
from nexus.authz.models.assignments import RoleAssignment, RolePrincipalType
from nexus.authz.models.project import Project
from nexus.authz.role_conventions import (
    builtin_role_policy_names,
    get_builtin_role,
)
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.group import Group
from nexus.core.utils.cursor import (
    PaginationDirection,
    SortDirection,
    create_cursor_data,
    decode_cursor,
    encode_cursor,
    serialize_sort_value,
)
from nexus.service_accounts.models.service_account import ServiceAccount

logger = structlog.stdlib.get_logger(__name__)

_SORTABLE_FIELDS = {"created_at", "principal_name", "principal_type", "role_name", "project_name"}


def _sort_value_from_row(row: Any, sort_field: str) -> str | None:  # noqa: ANN401
    """Extract the serialized sort value from a joined result row."""
    if sort_field == "created_at":
        return None
    if sort_field == "principal_name":
        return serialize_sort_value(row[1])
    if sort_field == "project_name":
        return serialize_sort_value(row[2])
    return serialize_sort_value(getattr(row[0], sort_field, None))


def _make_cursor_token(
    row: Any,  # noqa: ANN401
    direction: PaginationDirection,
    sort_field: str,
    sort_dir: SortDirection,
) -> str:
    """Build an encoded cursor token from a result row."""
    assignment = row[0]
    return encode_cursor(
        create_cursor_data(
            resource_id=str(assignment.id),
            created_at=assignment.created_at,
            direction=direction,
            sort_field=sort_field,
            sort_direction=sort_dir,
            sort_value=_sort_value_from_row(row, sort_field),
        )
    )


class RoleAssignmentService:
    """Unified service for managing role assignments (user and group)."""

    def __init__(self, session: AsyncSession, current_user: User) -> None:  # noqa: D107
        self.session = session
        self.current_user = current_user

    async def assign(
        self,
        *,
        principal_type: RolePrincipalType,
        principal_id: UUID,
        role_name: str,
        project_id: UUID | None = None,
    ) -> dict[str, Any]:
        """Create a role assignment.

        Returns:
            Assignment dict with resolved principal_name and project_name.

        Raises:
            SafeValueError: If principal not found, role unknown, or already assigned.

        """
        if project_id is not None:
            from nexus.core.queries.project_queries import assert_project_alive  # noqa: PLC0415

            await assert_project_alive(self.session, project_id)

        principal_name = await self._validate_principal(principal_type, principal_id)
        await self._validate_role(role_name, project_id)

        existing = await self.session.exec(
            select(RoleAssignment).where(
                RoleAssignment.principal_type == principal_type,
                RoleAssignment.principal_id == principal_id,
                RoleAssignment.role_name == role_name,
                RoleAssignment.project_id == project_id,
            )
        )
        if existing.first():
            msg = f"Role '{role_name}' is already assigned to {principal_type.value} '{principal_name}'"
            raise SafeValueError(msg)

        assignment = RoleAssignment(
            principal_type=principal_type,
            principal_id=principal_id,
            role_name=role_name,
            project_id=project_id,
        )
        self.session.add(assignment)
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            msg = f"Role '{role_name}' is already assigned to {principal_type.value} '{principal_name}'"
            raise SafeValueError(msg) from None
        await self.session.refresh(assignment)

        project_name = await self._resolve_project_name(project_id) if project_id else None

        logger.info(
            "Assigned role",
            principal_type=principal_type.value,
            principal_id=str(principal_id),
            principal_name=principal_name,
            role_name=role_name,
            project_id=str(project_id) if project_id else None,
        )
        AuditEventDispatcher.dispatch(
            RoleAssignmentEvent(
                assignment_id=assignment.id,
                principal_type=principal_type.value,
                principal_id=principal_id,
                principal_name=principal_name,
                role_name=role_name,
                action="assigned",
                project_id=project_id,
            ),
        )
        result = self._to_dict(assignment, principal_name, project_name)
        await self._enrich_with_role_info([result])
        return result

    async def get(self, assignment_id: UUID) -> dict[str, Any]:
        """Fetch a single role assignment by ID.

        Returns:
            Assignment dict with resolved names and role info.

        Raises:
            SafeValueError: If assignment not found.

        """
        row = await self._query_one(assignment_id)
        if not row:
            msg = f"Role assignment {assignment_id} not found"
            raise SafeValueError(msg)
        await self._enrich_with_role_info([row])
        return row

    async def list(  # noqa: C901, PLR0912, PLR0915
        self,
        *,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        principal_type: str | None = None,
        principal_id: UUID | None = None,
        principal_name: str | None = None,
        principal_name_contains: str | None = None,
        role_name: str | None = None,
        role_name_contains: str | None = None,
        project_id: UUID | None = None,
        include_total: bool = False,
        restrict_user_id: UUID | None = None,
        restrict_group_ids: builtins.list[UUID] | None = None,
        allowed_project_ids: builtins.list[UUID] | None = None,
    ) -> dict[str, Any]:
        """Return a paginated, filtered, sorted list of role assignments.

        Visibility is controlled by restrict_user_id / restrict_group_ids /
        allowed_project_ids.  When all are None the caller sees everything.
        """
        principal_name_col = self._principal_name_col()
        base = self._base_assignment_query()

        # Visibility filter
        if restrict_user_id is not None or restrict_group_ids is not None or allowed_project_ids is not None:
            visibility_clauses: builtins.list[Any] = []
            if restrict_user_id is not None:
                visibility_clauses.append(
                    RoleAssignment.principal_type.in_(  # type: ignore[attr-defined]
                        [RolePrincipalType.USER, RolePrincipalType.SERVICE_ACCOUNT]
                    )
                    & (RoleAssignment.principal_id == restrict_user_id)
                )
            if restrict_group_ids:
                visibility_clauses.append(
                    (RoleAssignment.principal_type == RolePrincipalType.GROUP)
                    & (RoleAssignment.principal_id.in_(restrict_group_ids))  # type: ignore[attr-defined]
                )
            if allowed_project_ids:
                visibility_clauses.append(
                    RoleAssignment.project_id.in_(allowed_project_ids)  # type: ignore[union-attr]
                )
            base = base.where(or_(*visibility_clauses)) if visibility_clauses else base.where(false())

        # Attribute filters
        if principal_type is not None:
            base = base.where(RoleAssignment.principal_type == principal_type)
        if principal_id is not None:
            base = base.where(RoleAssignment.principal_id == principal_id)
        if principal_name is not None:
            base = base.where(principal_name_col == principal_name)
        if principal_name_contains is not None:
            base = base.where(principal_name_col.ilike(f"%{principal_name_contains}%"))
        if role_name is not None:
            base = base.where(RoleAssignment.role_name == role_name)
        if role_name_contains is not None:
            base = base.where(RoleAssignment.role_name.ilike(f"%{role_name_contains}%"))  # type: ignore[attr-defined]
        if project_id is not None:
            base = base.where(RoleAssignment.project_id == project_id)

        total: int | None = None
        if include_total:
            count_result = await self.session.exec(select(func.count()).select_from(base.subquery()))
            total = count_result.one()

        sort_field, descending = self._parse_sort(sort)
        if sort_field == "principal_name":
            sort_col = principal_name_col
        elif sort_field == "project_name":
            sort_col = Project.name
        else:
            sort_col = getattr(RoleAssignment, sort_field)

        id_col = RoleAssignment.id
        created_at_col = RoleAssignment.created_at

        base, is_backward = self._apply_cursor(base, cursor, sort_col, created_at_col, id_col, descending, sort_field)

        effective_desc = descending ^ is_backward
        if effective_desc:
            base = base.order_by(sort_col.desc(), created_at_col.desc(), id_col.desc())  # type: ignore[attr-defined]
        else:
            base = base.order_by(sort_col.asc(), created_at_col.asc(), id_col.asc())  # type: ignore[attr-defined]

        base = base.limit(limit + 1)
        result = await self.session.exec(base)
        rows = list(result.all())

        if is_backward:
            rows.reverse()

        has_more = len(rows) > limit
        if has_more:
            rows = rows[1:] if is_backward else rows[:limit]

        resources = [self._to_dict(a, pn, prn) for a, pn, prn in rows]
        await self._enrich_with_role_info(resources)

        return {
            "resources": resources,
            **self._build_cursors(
                rows,
                has_more=has_more,
                cursor=cursor,
                is_backward=is_backward,
                sort_field=sort_field,
                descending=descending,
            ),
            "total": total,
        }

    async def revoke(self, assignment_id: UUID, *, project_id: UUID | None = None) -> None:
        """Remove a role assignment.

        Args:
            assignment_id: The assignment to remove.
            project_id: If provided, validates the assignment belongs to this project.

        Raises:
            SafeValueError: If assignment not found.

        """
        stmt = select(RoleAssignment).where(RoleAssignment.id == assignment_id)
        if project_id is not None:
            stmt = stmt.where(RoleAssignment.project_id == project_id)
        result = await self.session.exec(stmt)
        assignment = result.first()
        if not assignment:
            msg = f"Role assignment {assignment_id} not found"
            raise SafeValueError(msg)

        if assignment.is_builtin:
            msg = "Cannot revoke built-in role assignment"
            raise BuiltinProtectionError(msg)

        # Capture fields before delete for audit dispatch
        _principal_type = (
            assignment.principal_type.value
            if isinstance(assignment.principal_type, RolePrincipalType)
            else str(assignment.principal_type)
        )
        _principal_id = assignment.principal_id
        _role_name = assignment.role_name
        _project_id = assignment.project_id

        await self.session.delete(assignment)
        await self.session.commit()

        logger.info("Revoked role assignment", assignment_id=str(assignment_id))
        AuditEventDispatcher.dispatch(
            RoleAssignmentEvent(
                assignment_id=assignment_id,
                principal_type=_principal_type,
                principal_id=_principal_id,
                principal_name="",  # not resolved in revoke path
                role_name=_role_name,
                action="revoked",
                project_id=_project_id,
            ),
        )

    # ------------------------------------------------------------------
    # Visibility helper for GET detail
    # ------------------------------------------------------------------

    def is_visible(
        self,
        assignment: dict[str, Any],
        *,
        all_projects: bool,
        user_id: UUID,
        group_ids: builtins.list[UUID],
        allowed_project_ids: builtins.list[UUID],
    ) -> bool:
        """Check if a single assignment is visible to the caller."""
        if all_projects:
            return True
        a_principal_type = assignment["principal_type"]
        a_principal_id = assignment["principal_id"]
        a_project_id = assignment.get("project_id")
        _direct_types = {RolePrincipalType.USER.value, RolePrincipalType.SERVICE_ACCOUNT.value}
        if a_principal_type in _direct_types and a_principal_id == user_id:
            return True
        if a_principal_type == RolePrincipalType.GROUP.value and a_principal_id in group_ids:
            return True
        return bool(a_project_id and a_project_id in allowed_project_ids)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _principal_name_col() -> Any:  # noqa: ANN401
        """CASE expression that resolves a principal's display name from joined tables."""
        return case(
            (RoleAssignment.principal_type == RolePrincipalType.USER, User.username),  # type: ignore[arg-type]
            (RoleAssignment.principal_type == RolePrincipalType.GROUP, Group.name),  # type: ignore[arg-type]
            (RoleAssignment.principal_type == RolePrincipalType.SERVICE_ACCOUNT, ServiceAccount.name),  # type: ignore[arg-type]
            else_=None,
        ).label("principal_name")

    @staticmethod
    def _base_assignment_query() -> Any:  # noqa: ANN401
        """Build the base SELECT with principal name resolution and outerjoins.

        Returns a Select with columns (RoleAssignment, principal_name, project_name).
        Used by both ``list()`` and ``_query_one()`` to avoid duplication.
        """
        return (
            select(
                RoleAssignment,
                RoleAssignmentService._principal_name_col(),
                Project.name.label("project_name"),  # type: ignore[attr-defined]
            )
            .outerjoin(
                User,
                (RoleAssignment.principal_type == RolePrincipalType.USER)
                & (RoleAssignment.principal_id == User.id)
                & (User.deleted_at.is_(None)),  # type: ignore[union-attr]
            )
            .outerjoin(
                Group,
                (RoleAssignment.principal_type == RolePrincipalType.GROUP)
                & (RoleAssignment.principal_id == Group.id)
                & (Group.deleted_at.is_(None)),  # type: ignore[union-attr]
            )
            .outerjoin(
                ServiceAccount,
                (RoleAssignment.principal_type == RolePrincipalType.SERVICE_ACCOUNT)
                & (RoleAssignment.principal_id == ServiceAccount.id)
                & (ServiceAccount.deleted_at.is_(None)),  # type: ignore[union-attr]
            )
            .outerjoin(Project, RoleAssignment.project_id == Project.id)  # type: ignore[arg-type]
        )

    async def _query_one(self, assignment_id: UUID) -> dict[str, Any] | None:
        """Fetch a single assignment with resolved names."""
        stmt = self._base_assignment_query().where(RoleAssignment.id == assignment_id)
        result = await self.session.exec(stmt)
        row = result.first()
        if not row:
            return None
        assignment, pn, prn = row
        return self._to_dict(assignment, pn, prn)

    async def _validate_principal(self, principal_type: RolePrincipalType, principal_id: UUID) -> str:
        """Validate the principal exists and return its name."""
        if principal_type == RolePrincipalType.USER:
            entity = await self.session.get(User, principal_id)
            if not entity:
                msg = f"User {principal_id} not found"
                raise SafeValueError(msg)
            return entity.username
        if principal_type == RolePrincipalType.GROUP:
            group = await self.session.get(Group, principal_id)
            if not group:
                msg = f"Group {principal_id} not found"
                raise SafeValueError(msg)
            return group.name
        if principal_type == RolePrincipalType.SERVICE_ACCOUNT:
            sa = await self.session.get(ServiceAccount, principal_id)
            if not sa:
                msg = f"Service account {principal_id} not found"
                raise SafeValueError(msg)
            return sa.name
        msg = f"Unsupported principal type: {principal_type}"  # type: ignore[unreachable]
        raise SafeValueError(msg)

    async def _enrich_with_role_info(self, resources: builtins.list[dict[str, Any]]) -> None:
        """Batch-resolve role_description and role_policies for a list of assignment dicts."""
        role_names = {r["role_name"] for r in resources}
        role_info: dict[str, tuple[str, builtins.list[str]]] = {}

        for rn in role_names:
            builtin = get_builtin_role(rn)
            if builtin:
                role_info[rn] = (builtin.description, builtin_role_policy_names(rn))
            else:
                role_info[rn] = ("", [])

        custom_names = [rn for rn in role_names if rn not in role_info or role_info[rn] == ("", [])]
        if custom_names:
            from nexus.authz.models.role import Role  # noqa: PLC0415

            result = await self.session.exec(select(Role).where(Role.name.in_(custom_names)))  # type: ignore[attr-defined]
            for role in result.all():
                role_info[role.name] = (role.description or "", list(role.policy_names))

        for r in resources:
            desc, policies = role_info.get(r["role_name"], ("", []))
            r["role_description"] = desc
            r["role_policies"] = policies

    async def _validate_role(self, role_name: str, project_id: UUID | None) -> None:
        """Validate the role exists and its scope matches the assignment context."""
        builtin = get_builtin_role(role_name)
        if builtin:
            is_project_role = builtin.scope == "project"
            if project_id and not is_project_role:
                msg = f"Role '{role_name}' is a system role and cannot be assigned to a project"
                raise SafeValueError(msg)
            if not project_id and is_project_role:
                msg = f"Role '{role_name}' is a project role and requires a project_id"
                raise SafeValueError(msg)
            return
        from nexus.authz.models.role import Role  # noqa: PLC0415

        stmt = select(Role).where(Role.name == role_name)
        if project_id is not None:
            stmt = stmt.where(or_(Role.project_id == project_id, Role.project_id.is_(None)))  # type: ignore[union-attr, arg-type]
        result = await self.session.exec(stmt)
        role = result.first()
        if not role:
            msg = f"Role '{role_name}' not found"
            raise SafeValueError(msg)
        if project_id and role.scope != "project":
            msg = f"Role '{role_name}' is a system role and cannot be assigned to a project"
            raise SafeValueError(msg)
        if not project_id and role.scope == "project":
            msg = f"Role '{role_name}' is a project role and requires a project_id"
            raise SafeValueError(msg)

    async def _resolve_project_name(self, project_id: UUID) -> str | None:
        result = await self.session.exec(
            select(Project.name).where(
                Project.id == project_id,
                Project.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        return result.first()

    @staticmethod
    def _to_dict(assignment: RoleAssignment, principal_name: str | None, project_name: str | None) -> dict[str, Any]:
        return {
            "id": assignment.id,
            "principal_type": assignment.principal_type.value
            if isinstance(assignment.principal_type, RolePrincipalType)
            else str(assignment.principal_type),
            "principal_id": assignment.principal_id,
            "principal_name": principal_name or "",
            "role_name": assignment.role_name,
            "project_id": assignment.project_id,
            "project_name": project_name,
            "created_at": assignment.created_at,
        }

    @staticmethod
    def _parse_sort(sort: str | None) -> tuple[str, bool]:
        if not sort:
            return "created_at", True
        descending = sort.startswith("-")
        field = sort.lstrip("-")
        if field not in _SORTABLE_FIELDS:
            return "created_at", True
        return field, descending

    @staticmethod
    def _apply_cursor(
        stmt: Any,  # noqa: ANN401
        cursor: str | None,
        sort_col: Any,  # noqa: ANN401
        created_at_col: Any,  # noqa: ANN401
        id_col: Any,  # noqa: ANN401
        descending: bool,  # noqa: FBT001
        sort_field: str = "created_at",
    ) -> tuple[Any, bool]:
        is_backward = False
        if not cursor:
            return stmt, is_backward

        cursor_data = decode_cursor(cursor)
        rid = cursor_data.get("id")
        cat = cursor_data.get("created_at")
        cursor_sv = cursor_data.get("sort_value")
        cursor_sort_field = cursor_data.get("sort_field")
        direction = cursor_data.get("direction", "next")
        is_backward = direction == PaginationDirection.PREV.value

        # New-style cursor with sort_value: 3-column keyset (sort_col, created_at, id)
        use_sort_col = (
            cursor_sv is not None
            and cursor_sort_field is not None
            and cursor_sort_field == sort_field
            and cursor_sort_field != "created_at"
        )

        if rid and cat:
            cursor_dt = datetime.fromisoformat(cat)
            go_forward = descending ^ is_backward

            if use_sort_col:
                if go_forward:
                    stmt = stmt.where(
                        (sort_col < cursor_sv)
                        | ((sort_col == cursor_sv) & (created_at_col < cursor_dt))
                        | ((sort_col == cursor_sv) & (created_at_col == cursor_dt) & (id_col < rid))
                    )
                else:
                    stmt = stmt.where(
                        (sort_col > cursor_sv)
                        | ((sort_col == cursor_sv) & (created_at_col > cursor_dt))
                        | ((sort_col == cursor_sv) & (created_at_col == cursor_dt) & (id_col > rid))
                    )
            elif go_forward:
                stmt = stmt.where((created_at_col < cursor_dt) | ((created_at_col == cursor_dt) & (id_col < rid)))
            else:
                stmt = stmt.where((created_at_col > cursor_dt) | ((created_at_col == cursor_dt) & (id_col > rid)))

        return stmt, is_backward

    @staticmethod
    def _build_cursors(
        rows: builtins.list[Any],
        *,
        has_more: bool,
        cursor: str | None,
        is_backward: bool,
        sort_field: str = "created_at",
        descending: bool = True,
    ) -> dict[str, str | None]:
        if not rows:
            return {"next": None, "prev": None}

        sort_dir = SortDirection.DESC if descending else SortDirection.ASC
        next_cursor = None
        prev_cursor = None

        if is_backward:
            if cursor is not None:
                next_cursor = _make_cursor_token(rows[-1], PaginationDirection.NEXT, sort_field, sort_dir)
            if has_more:
                prev_cursor = _make_cursor_token(rows[0], PaginationDirection.PREV, sort_field, sort_dir)
        else:
            if has_more:
                next_cursor = _make_cursor_token(rows[-1], PaginationDirection.NEXT, sort_field, sort_dir)
            if cursor is not None:
                prev_cursor = _make_cursor_token(rows[0], PaginationDirection.PREV, sort_field, sort_dir)

        return {"next": next_cursor, "prev": prev_cursor}
