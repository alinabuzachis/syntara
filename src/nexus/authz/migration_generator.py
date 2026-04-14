"""Generate an Alembic migration file that adds new policies and/or roles.

Compares the policies declared by routes (``route_scanner``) and extras
against policies already tracked in existing migrations
(``migration_scanner``).  If there are new policies or roles, emits a
migration file with ``POLICY_OPS`` and/or ``ROLE_OPS`` constants, including
``RolePolicyAppend`` operations derived from the explicit ``roles`` declared
on each ``PolicyInfo``.
"""

from __future__ import annotations

import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from nexus.authz._ast_codegen import build_policy_ops_list, build_role_ops_list
from nexus.authz.migration_ops import PolicyAdd, RoleAdd, RolePolicyAppend

if TYPE_CHECKING:
    from nexus.authz.role_conventions import PolicyInfo, RoleInfo


def generate_migration(
    new_policies: list[PolicyInfo],
    *,
    head_revision: str,
    migrations_dir: Path,
    message: str = "add new policies",
    new_roles: list[RoleInfo] | None = None,
) -> Path | None:
    """Write a migration file for *new_policies* and/or *new_roles*.

    Returns the path of the written file, or ``None`` if there is nothing to
    emit (both lists empty).

    Args:
        new_policies: Policies not yet tracked by any existing migration.
        head_revision: Current head revision ID for the down_revision chain.
        migrations_dir: Directory where the migration file will be written.
        message: Human-readable message embedded in the migration docstring.
        new_roles: Roles not yet tracked by any existing migration.

    """
    role_ops = [RoleAdd(r.name, r.description, r.is_builtin) for r in (new_roles or [])]
    policy_ops: list[PolicyAdd | RolePolicyAppend] = [
        PolicyAdd(p.name, p.description, p.statements) for p in new_policies
    ]
    policy_ops.extend(_compute_role_append_ops(new_policies))

    if not policy_ops and not role_ops:
        return None

    rev_id = _make_revision_id()
    slug = message.replace(" ", "_").replace("-", "_")[:40]
    filename = f"{rev_id}_{slug}.py"
    filepath = migrations_dir / filename

    # Build import line and POLICY_OPS block
    policy_section = ""
    if policy_ops:
        has_role_appends = any(isinstance(op, RolePolicyAppend) for op in policy_ops)
        if has_role_appends:
            policy_import = (
                "from nexus.authz.migration_ops import PolicyAdd, RolePolicyAppend, apply_policy_ops, revert_policy_ops"
            )
            policy_ops_type = "list[PolicyAdd | RolePolicyAppend]"
        else:
            policy_import = "from nexus.authz.migration_ops import PolicyAdd, apply_policy_ops, revert_policy_ops"
            policy_ops_type = "list[PolicyAdd]"
        ops_block = build_policy_ops_list(policy_ops)
        policy_section = f"{policy_import}\n\nPOLICY_OPS: {policy_ops_type} = {ops_block}\n"

    role_section = ""
    if role_ops:
        role_import = "from nexus.authz.migration_ops import RoleAdd, apply_role_ops, revert_role_ops"
        role_ops_block = build_role_ops_list(role_ops)
        role_section = f"{role_import}\n\nROLE_OPS: list[RoleAdd] = {role_ops_block}\n"

    # Combine imports (deduplicate if both sections import from the same module)
    imports_block = "\n".join(s for s in (policy_section.rstrip(), role_section.rstrip()) if s)

    upgrade_calls = "\n    ".join(
        c
        for c in (
            "apply_policy_ops(POLICY_OPS)" if policy_ops else "",
            "apply_role_ops(ROLE_OPS)" if role_ops else "",
        )
        if c
    )
    downgrade_calls = "\n    ".join(
        c
        for c in (
            "revert_role_ops(ROLE_OPS)" if role_ops else "",
            "revert_policy_ops(POLICY_OPS)" if policy_ops else "",
        )
        if c
    )

    now = datetime.now(tz=UTC).strftime("%Y-%m-%d %H:%M:%S.%f")
    content = f'''\
"""{message}

Revision ID: {rev_id}
Revises: {head_revision}
Create Date: {now}

"""

from collections.abc import Sequence

{imports_block}

# revision identifiers, used by Alembic.
revision: str = "{rev_id}"
down_revision: str | Sequence[str] | None = "{head_revision}"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    {upgrade_calls}


def downgrade() -> None:
    """Downgrade schema."""
    {downgrade_calls}
'''

    filepath.write_text(content)
    _ruff_format(filepath)
    return filepath


def _compute_role_append_ops(new_policies: list[PolicyInfo]) -> list[RolePolicyAppend]:
    """Return ``RolePolicyAppend`` objects derived from each policy's declared roles."""
    result: list[RolePolicyAppend] = [RolePolicyAppend(role, p.name) for p in new_policies for role in p.roles]
    return sorted(result, key=lambda op: (op.role_name, op.policy_name))


def _ruff_format(filepath: Path) -> None:
    """Format *filepath* with ``ruff format`` if ruff is available."""
    ruff = Path(sys.executable).parent / "ruff"
    if ruff.exists():
        subprocess.run([str(ruff), "format", str(filepath)], check=False, capture_output=True)  # noqa: S603


def _make_revision_id() -> str:
    """Generate a short hex revision id (12 chars)."""
    import secrets  # noqa: PLC0415

    return secrets.token_hex(6)
