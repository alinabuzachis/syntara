"""Integration tests for the role registry → migration pipeline.

Tests here assert invariants against the real production migrations directory.
Generator/scanner unit tests live in tests/unit/authz/test_role_migration.py.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from nexus.authz.migration_scanner import find_untracked_roles, scan_role_migrations
from nexus.authz.role_conventions import BUILTIN_ROLES_REGISTRY, RoleInfo

if TYPE_CHECKING:
    from nexus.authz.migration_ops import RoleAdd


class TestBuiltinRolesRegistry:
    """Verify BUILTIN_ROLES_REGISTRY is consistent with migration tracking."""

    def test_all_registry_roles_tracked_in_migrations(self) -> None:
        """Every role in BUILTIN_ROLES_REGISTRY must appear in an existing migration ROLE_OPS."""
        existing_names = {op.name for op in scan_role_migrations()}
        registry_names = {r.name for r in BUILTIN_ROLES_REGISTRY}

        untracked = registry_names - existing_names
        assert not untracked, (
            f"Roles in BUILTIN_ROLES_REGISTRY not tracked in any migration ROLE_OPS: {untracked}. "
            "Run `alembic revision --autogenerate` to generate the missing migration."
        )

    def test_registry_addition_detected_as_untracked(self) -> None:
        """Adding a role to BUILTIN_ROLES_REGISTRY is detected as untracked by the migration pipeline."""
        new_role = RoleInfo("test-sentinel-role", "Transient test role")
        augmented = [*BUILTIN_ROLES_REGISTRY, new_role]

        untracked = find_untracked_roles(augmented)

        assert any(r.name == new_role.name for r in untracked)

    def test_registry_role_descriptions_match_migrations(self) -> None:
        """Role descriptions in the registry must match what the migration declares."""
        migration_roles: dict[str, RoleAdd] = {op.name: op for op in scan_role_migrations()}
        for role_info in BUILTIN_ROLES_REGISTRY:
            if role_info.name in migration_roles:
                migration_op = migration_roles[role_info.name]
                assert migration_op.description == role_info.description, (
                    f"Role '{role_info.name}' description mismatch: "
                    f"registry={role_info.description!r}, migration={migration_op.description!r}"
                )
