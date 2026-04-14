"""Declarative policy and role operations for Alembic migrations.

Each migration that adds or modifies policies declares a module-level
``POLICY_OPS`` list.  Each migration that adds system roles declares a
module-level ``ROLE_OPS`` list.  The helpers ``apply_policy_ops`` /
``revert_policy_ops`` and ``apply_role_ops`` / ``revert_role_ops`` are
called from the migration's ``upgrade`` / ``downgrade`` functions.

All four functions accept an optional ``conn`` parameter.  When omitted
they use Alembic's ``op.get_bind()`` (migration context).  When provided
they use that connection directly, making them usable outside migrations
(e.g. in the test seeder).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

if TYPE_CHECKING:
    from collections.abc import Sequence as ABCSequence

    from sqlalchemy.engine import Connection


@dataclass(frozen=True)
class PolicyAdd:
    """Declare a policy to be inserted during ``upgrade``."""

    name: str
    description: str
    statements: list[dict[str, Any]]


@dataclass(frozen=True)
class RolePolicyAppend:
    """Link a policy to a role via the ``role_policies`` join table.

    Idempotent: uses INSERT … ON CONFLICT DO NOTHING (when using a
    connection) or bulk_insert (in migration context where conflicts
    cannot occur because the data is being created for the first time).
    """

    role_name: str
    policy_name: str


@dataclass(frozen=True)
class RoleAdd:
    """Declare a system role to be created during ``upgrade``.

    ``apply_role_ops`` is idempotent — it skips rows whose ``name`` already
    exists, so this op is safe to run on existing installations where the role
    was created by an earlier migration's raw SQL.
    """

    name: str
    description: str
    is_builtin: bool = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_policies_table = sa.table(
    "policies",
    sa.column("id", sa.Uuid()),
    sa.column("name", sa.String()),
    sa.column("description", sa.String()),
    sa.column("statements", postgresql.JSONB()),
    sa.column("is_builtin", sa.Boolean()),
    sa.column("labels", postgresql.JSONB()),
)

_roles_table = sa.table(
    "roles",
    sa.column("id", sa.Uuid()),
    sa.column("name", sa.String()),
    sa.column("description", sa.String()),
    sa.column("is_builtin", sa.Boolean()),
    sa.column("labels", postgresql.JSONB()),
)

_role_policies_table = sa.table(
    "role_policies",
    sa.column("id", sa.Uuid()),
    sa.column("role_id", sa.Uuid()),
    sa.column("policy_id", sa.Uuid()),
    sa.column("labels", postgresql.JSONB()),
)


def apply_policy_ops(
    ops: ABCSequence[PolicyAdd | RolePolicyAppend],
    conn: Connection | None = None,
) -> None:
    """Apply a sequence of policy operations (used in ``upgrade``).

    When *conn* is ``None`` (the default), uses Alembic's ``op.get_bind()``
    and ``op.bulk_insert`` — suitable only inside a migration context.
    When *conn* is provided, uses it directly with idempotent SQL, making
    this safe to call from outside a migration (e.g. the test seeder).
    """
    adds = [o for o in ops if isinstance(o, PolicyAdd)]
    role_appends = [o for o in ops if isinstance(o, RolePolicyAppend)]

    if adds:
        if conn is not None:
            for a in adds:
                conn.execute(
                    sa.text(
                        "INSERT INTO policies (id, name, description, statements, is_builtin, labels)"
                        " VALUES (:id, :name, :description, CAST(:statements AS jsonb),"
                        "         :is_builtin, '{}'::jsonb)"
                        " ON CONFLICT (name) WHERE project_id IS NULL DO NOTHING"
                    ),
                    {
                        "id": str(uuid4()),
                        "name": a.name,
                        "description": a.description,
                        "statements": json.dumps(a.statements),
                        "is_builtin": True,
                    },
                )
        else:
            op.bulk_insert(
                _policies_table,
                [
                    {
                        "id": uuid4(),
                        "name": a.name,
                        "description": a.description,
                        "statements": a.statements,
                        "is_builtin": True,
                        "labels": {},
                    }
                    for a in adds
                ],
            )

    # Link policies to roles via the role_policies join table
    _conn = conn if conn is not None else op.get_bind()
    for ra in role_appends:
        _conn.execute(
            sa.text(
                "INSERT INTO role_policies (id, role_id, policy_id, labels)"
                " SELECT :id, r.id, p.id, '{}'::jsonb"
                " FROM roles r, policies p"
                " WHERE r.name = CAST(:role_name AS varchar)"
                "   AND p.name = CAST(:policy_name AS varchar)"
                "   AND r.project_id IS NULL"
                "   AND p.project_id IS NULL"
                " ON CONFLICT (role_id, policy_id) DO NOTHING"
            ),
            {
                "id": str(uuid4()),
                "role_name": ra.role_name,
                "policy_name": ra.policy_name,
            },
        )


def revert_policy_ops(
    ops: ABCSequence[PolicyAdd | RolePolicyAppend],
    conn: Connection | None = None,
) -> None:
    """Revert a sequence of policy operations (used in ``downgrade``)."""
    _conn = conn if conn is not None else op.get_bind()

    adds = [o for o in ops if isinstance(o, PolicyAdd)]
    role_appends = [o for o in ops if isinstance(o, RolePolicyAppend)]

    # Remove role-policy links (reverse order for safety)
    for ra in reversed(role_appends):
        _conn.execute(
            sa.text(
                "DELETE FROM role_policies"
                " WHERE role_id = ("
                "   SELECT id FROM roles"
                "   WHERE name = CAST(:role_name AS varchar)"
                "     AND project_id IS NULL"
                " )"
                " AND policy_id = ("
                "   SELECT id FROM policies"
                "   WHERE name = CAST(:policy_name AS varchar)"
                "     AND project_id IS NULL"
                " )"
            ),
            {"role_name": ra.role_name, "policy_name": ra.policy_name},
        )

    # Remove added policies (reverse order for safety)
    for a in reversed(adds):
        _conn.execute(sa.text("DELETE FROM policies WHERE name = :name"), {"name": a.name})


def apply_role_ops(ops: ABCSequence[RoleAdd], conn: Connection | None = None) -> None:
    """Create system roles declared in ``ROLE_OPS`` (used in ``upgrade``).

    Idempotent: roles whose ``name`` already exists in the database are
    skipped, so this is safe to run on installations where the role was
    previously created by raw SQL in an earlier migration.
    """
    _conn = conn if conn is not None else op.get_bind()
    for r in ops:
        _conn.execute(
            sa.text(
                "INSERT INTO roles (id, name, description, is_builtin, labels)"
                " SELECT :id, :name, :description, :is_builtin, '{}'::jsonb"
                " WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = CAST(:name AS varchar))"
            ),
            {
                "id": str(uuid4()),
                "name": r.name,
                "description": r.description,
                "is_builtin": r.is_builtin,
            },
        )


def revert_role_ops(ops: ABCSequence[RoleAdd], conn: Connection | None = None) -> None:
    """Remove system roles declared in ``ROLE_OPS`` (used in ``downgrade``).

    Only deletes roles whose ``name`` matches — project-scoped roles with
    the same name are unaffected.
    """
    _conn = conn if conn is not None else op.get_bind()
    for r in reversed(list(ops)):
        _conn.execute(
            sa.text("DELETE FROM roles WHERE name = :name AND project_id IS NULL"),
            {"name": r.name},
        )
