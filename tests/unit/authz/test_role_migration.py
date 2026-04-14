"""Unit tests for the role migration generator and scanner.

These tests operate entirely on temporary directories — no database,
no production migrations directory.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from nexus.authz.migration_generator import generate_migration
from nexus.authz.migration_scanner import scan_role_migrations
from nexus.authz.role_conventions import RoleInfo

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture(autouse=True)
def _skip_if_no_opa() -> None:
    """Override the OPA-gating autouse fixture from conftest — migration tests don't need OPA."""


_HEAD_REVISION = "deadbeef0000"


class TestScanRoleMigrations:
    """Unit-level checks for scan_role_migrations."""

    def test_finds_role_add_in_migration(self, tmp_path: Path) -> None:
        role = RoleInfo("analyst", "Read-only analyst role")
        generate_migration([], new_roles=[role], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        ops = scan_role_migrations(tmp_path)

        assert len(ops) == 1
        assert ops[0].name == "analyst"
        assert ops[0].description == "Read-only analyst role"
        assert ops[0].is_builtin is True

    def test_finds_non_builtin_role(self, tmp_path: Path) -> None:
        role = RoleInfo("custom", "A non-builtin role", is_builtin=False)
        generate_migration([], new_roles=[role], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        ops = scan_role_migrations(tmp_path)

        assert len(ops) == 1
        assert ops[0].is_builtin is False

    def test_finds_roles_across_multiple_migrations(self, tmp_path: Path) -> None:
        generate_migration(
            [], new_roles=[RoleInfo("role-a", "Role A")], head_revision=_HEAD_REVISION, migrations_dir=tmp_path
        )
        generate_migration(
            [], new_roles=[RoleInfo("role-b", "Role B")], head_revision="nextrev000000", migrations_dir=tmp_path
        )

        ops = scan_role_migrations(tmp_path)
        names = {op.name for op in ops}

        assert names == {"role-a", "role-b"}

    def test_ignores_migrations_without_role_ops(self, tmp_path: Path) -> None:
        from nexus.authz.role_conventions import PolicyInfo

        generate_migration(
            [PolicyInfo("widget", "read", roles=("admin",))],
            head_revision=_HEAD_REVISION,
            migrations_dir=tmp_path,
        )

        ops = scan_role_migrations(tmp_path)

        assert ops == []

    def test_empty_dir_returns_empty(self, tmp_path: Path) -> None:
        assert scan_role_migrations(tmp_path) == []


class TestGenerateMigrationRoles:
    """Checks for generate_migration output when new_roles are provided."""

    def test_returns_none_when_no_roles_or_policies(self, tmp_path: Path) -> None:
        result = generate_migration([], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)
        assert result is None

    def test_generates_role_ops_constant(self, tmp_path: Path) -> None:
        role = RoleInfo("analyst", "Read-only analyst role")
        result = generate_migration([], new_roles=[role], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        assert result is not None
        content = result.read_text()
        assert "ROLE_OPS" in content
        assert 'RoleAdd("analyst"' in content
        assert "apply_role_ops(ROLE_OPS)" in content
        assert "revert_role_ops(ROLE_OPS)" in content

    def test_generated_file_is_valid_python(self, tmp_path: Path) -> None:
        role = RoleInfo("analyst", "Read-only analyst role")
        result = generate_migration([], new_roles=[role], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        assert result is not None
        compile(result.read_text(), str(result), "exec")

    def test_roles_and_policies_in_same_migration(self, tmp_path: Path) -> None:
        from nexus.authz.role_conventions import PolicyInfo

        role = RoleInfo("analyst", "Analyst role")
        policy = PolicyInfo("report", "read", roles=("analyst",))
        result = generate_migration([policy], new_roles=[role], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        assert result is not None
        content = result.read_text()
        compile(content, str(result), "exec")
        assert "ROLE_OPS" in content
        assert "POLICY_OPS" in content
        assert "apply_role_ops(ROLE_OPS)" in content
        assert "apply_policy_ops(POLICY_OPS)" in content

    def test_non_builtin_role_encodes_is_builtin_false(self, tmp_path: Path) -> None:
        role = RoleInfo("editable", "An editable role", is_builtin=False)
        result = generate_migration([], new_roles=[role], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        assert result is not None
        assert "is_builtin=False" in result.read_text()


class TestRoleMigrationRoundTrip:
    """Full round-trip: registry → generate → scan_role_migrations."""

    def test_new_role_round_trip(self, tmp_path: Path) -> None:
        role = RoleInfo("analyst", "Read-only analyst role")
        generate_migration([], new_roles=[role], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        ops = scan_role_migrations(tmp_path)

        assert len(ops) == 1
        op = ops[0]
        assert op.name == role.name
        assert op.description == role.description
        assert op.is_builtin == role.is_builtin

    def test_existing_roles_not_regenerated(self, tmp_path: Path) -> None:
        role = RoleInfo("analyst", "Read-only analyst role")
        generate_migration([], new_roles=[role], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        existing_names = {op.name for op in scan_role_migrations(tmp_path)}
        new_roles = [r for r in [role] if r.name not in existing_names]

        result = generate_migration([], new_roles=new_roles, head_revision="newrev000000", migrations_dir=tmp_path)
        assert result is None

    def test_new_role_added_generates_migration(self, tmp_path: Path) -> None:
        role_a = RoleInfo("role-a", "Role A")
        generate_migration([], new_roles=[role_a], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        role_b = RoleInfo("role-b", "Role B")
        existing_names = {op.name for op in scan_role_migrations(tmp_path)}
        new_roles = [r for r in [role_a, role_b] if r.name not in existing_names]

        result = generate_migration([], new_roles=new_roles, head_revision="newrev000000", migrations_dir=tmp_path)
        assert result is not None

        all_ops = scan_role_migrations(tmp_path)
        assert {op.name for op in all_ops} == {"role-a", "role-b"}
