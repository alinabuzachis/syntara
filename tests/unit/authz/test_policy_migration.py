"""Unit tests for the route → policy migration generator and scanner.

These tests operate entirely on temporary directories or in-memory objects —
no database, no production migrations directory.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import APIRouter, Depends

from nexus.authz.dependencies import PermissionChecker
from nexus.authz.migration_generator import generate_migration
from nexus.authz.migration_ops import PolicyAdd, RolePolicyAppend
from nexus.authz.migration_scanner import scan_migrations
from nexus.authz.role_conventions import PolicyInfo
from nexus.authz.route_scanner import scan_routes
from nexus.core.nexus_router import NexusRouter
from nexus.core.router_discovery import RouterInfo

_HEAD_REVISION = "deadbeef0000"


@pytest.fixture(autouse=True)
def _skip_if_no_opa() -> None:
    """Override the OPA-gating autouse fixture from conftest — migration tests don't need OPA."""


def _router_info(router: NexusRouter, domain: str = "test") -> RouterInfo:
    return RouterInfo(
        domain=domain,
        module_path=f"nexus.{domain}.router",
        router=router,
        router_prefix="",
        source_file=Path(f"/fake/{domain}/router.py"),
    )


class TestScanRoutes:
    """Unit-level checks for scan_routes against in-memory NexusRouter instances."""

    def test_finds_permission_checker_dependency(self) -> None:
        router = NexusRouter(prefix="/widgets", tags=["widgets"])
        checker = PermissionChecker("widget", "read")

        @router.get("", dependencies=[Depends(checker)])
        async def list_widgets() -> list[str]:
            return []

        policies = scan_routes([_router_info(router)])

        assert len(policies) == 1
        assert policies[0].name == "widget:read:any"

    def test_roles_carried_through_from_permission_checker(self) -> None:
        router = NexusRouter(prefix="/widgets", tags=["widgets"])
        checker = PermissionChecker("widget", "read", roles=["admin", "user"])

        @router.get("", dependencies=[Depends(checker)])
        async def list_widgets() -> list[str]:
            return []

        policies = scan_routes([_router_info(router)])

        assert len(policies) == 1
        assert policies[0].roles == ("admin", "user")

    def test_multiple_routes_distinct_permissions(self) -> None:
        router = NexusRouter(prefix="/widgets", tags=["widgets"])

        @router.get("", dependencies=[Depends(PermissionChecker("widget", "read"))])
        async def list_widgets() -> list[str]:
            return []

        @router.post("", dependencies=[Depends(PermissionChecker("widget", "create"))])
        async def create_widget() -> dict[str, object]:
            return {}

        @router.delete("/{widget_id}", dependencies=[Depends(PermissionChecker("widget", "delete"))])
        async def delete_widget(widget_id: int) -> None:
            return None

        policies = scan_routes([_router_info(router)])

        names = {p.name for p in policies}
        assert names == {"widget:read:any", "widget:create:any", "widget:delete:any"}

    def test_same_permission_on_multiple_routes_deduplicated(self) -> None:
        router = NexusRouter(prefix="/widgets", tags=["widgets"])
        checker = PermissionChecker("widget", "read")

        @router.get("", dependencies=[Depends(checker)])
        async def list_widgets() -> list[str]:
            return []

        @router.get("/{widget_id}", dependencies=[Depends(checker)])
        async def get_widget(widget_id: int) -> dict[str, object]:
            return {}

        policies = scan_routes([_router_info(router)])

        assert len(policies) == 1
        assert policies[0].name == "widget:read:any"

    def test_plain_api_router_is_ignored(self) -> None:
        plain = APIRouter(prefix="/plain")

        @plain.get("", dependencies=[Depends(PermissionChecker("plain", "read"))])
        async def list_plain() -> list[str]:
            return []

        router_info = RouterInfo(
            domain="plain",
            module_path="nexus.plain.router",
            router=plain,
            router_prefix="",
            source_file=Path("/fake/plain/router.py"),
        )

        assert scan_routes([router_info]) == []

    def test_multiple_routers_combined(self) -> None:
        r1 = NexusRouter(prefix="/a")
        r2 = NexusRouter(prefix="/b")

        @r1.get("", dependencies=[Depends(PermissionChecker("resource_a", "read"))])
        async def get_a() -> dict[str, object]:
            return {}

        @r2.post("", dependencies=[Depends(PermissionChecker("resource_b", "create"))])
        async def create_b() -> dict[str, object]:
            return {}

        policies = scan_routes([_router_info(r1, "a"), _router_info(r2, "b")])

        names = {p.name for p in policies}
        assert names == {"resource_a:read:any", "resource_b:create:any"}


class TestGenerateMigration:
    """Checks for generate_migration output correctness and syntax validity."""

    def test_returns_none_for_empty_policy_list(self, tmp_path: Path) -> None:
        result = generate_migration([], head_revision=_HEAD_REVISION, migrations_dir=tmp_path)
        assert result is None

    def test_generates_file_with_correct_revision_chain(self, tmp_path: Path) -> None:
        router = NexusRouter(prefix="/widgets")

        @router.get("", dependencies=[Depends(PermissionChecker("widget", "read"))])
        async def list_widgets() -> list[str]:
            return []

        policies = scan_routes([_router_info(router)])
        result = generate_migration(policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        assert result is not None
        assert result.exists()
        content = result.read_text()
        assert f'down_revision: str | Sequence[str] | None = "{_HEAD_REVISION}"' in content

    def test_single_policy_produces_valid_python(self, tmp_path: Path) -> None:
        router = NexusRouter(prefix="/widgets")

        @router.get("", dependencies=[Depends(PermissionChecker("widget", "read"))])
        async def list_widgets() -> list[str]:
            return []

        policies = scan_routes([_router_info(router)])
        result = generate_migration(policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        assert result is not None
        content = result.read_text()
        # Must be valid Python — compile() raises SyntaxError if not
        compile(content, str(result), "exec")

    def test_multiple_policies_produce_valid_python(self, tmp_path: Path) -> None:
        router = NexusRouter(prefix="/widgets")

        @router.get("", dependencies=[Depends(PermissionChecker("widget", "read"))])
        async def list_widgets() -> list[str]:
            return []

        @router.post("", dependencies=[Depends(PermissionChecker("widget", "create"))])
        async def create_widget() -> dict[str, object]:
            return {}

        @router.delete("/{widget_id}", dependencies=[Depends(PermissionChecker("widget", "delete"))])
        async def delete_widget(widget_id: int) -> None:
            return None

        policies = scan_routes([_router_info(router)])
        assert len(policies) == 3

        result = generate_migration(policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        assert result is not None
        content = result.read_text()
        compile(content, str(result), "exec")


class TestPolicyMigrationPipeline:
    """Full round-trip: route → scan → generate → scan_migrations."""

    def test_single_policy_round_trip(self, tmp_path: Path) -> None:
        router = NexusRouter(prefix="/widgets")

        @router.get("", dependencies=[Depends(PermissionChecker("widget", "read"))])
        async def list_widgets() -> list[str]:
            return []

        policies = scan_routes([_router_info(router)])
        generate_migration(policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        ops = scan_migrations(tmp_path)

        assert len(ops) == 1
        assert isinstance(ops[0], PolicyAdd)
        assert ops[0].name == "widget:read:any"

    def test_multiple_policies_round_trip(self, tmp_path: Path) -> None:
        router = NexusRouter(prefix="/widgets")

        @router.get("", dependencies=[Depends(PermissionChecker("widget", "read"))])
        async def list_widgets() -> list[str]:
            return []

        @router.post("", dependencies=[Depends(PermissionChecker("widget", "create"))])
        async def create_widget() -> dict[str, object]:
            return {}

        @router.delete("/{widget_id}", dependencies=[Depends(PermissionChecker("widget", "delete"))])
        async def delete_widget(widget_id: int) -> None:
            return None

        policies = scan_routes([_router_info(router)])
        generate_migration(policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        ops = scan_migrations(tmp_path)

        names = {op.name for op in ops if isinstance(op, PolicyAdd)}
        assert names == {"widget:read:any", "widget:create:any", "widget:delete:any"}

    def test_existing_policies_not_regenerated(self, tmp_path: Path) -> None:
        """Simulates running the tool twice: second run should produce no new migration."""
        router = NexusRouter(prefix="/widgets")

        @router.get("", dependencies=[Depends(PermissionChecker("widget", "read"))])
        async def list_widgets() -> list[str]:
            return []

        policies = scan_routes([_router_info(router)])

        # First run — generates migration
        generate_migration(policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        # Filter out already-known policies (as the alembic hook does)
        existing_ops = scan_migrations(tmp_path)
        existing_names = {op.name for op in existing_ops if isinstance(op, PolicyAdd)}
        new_policies = [p for p in policies if p.name not in existing_names]

        # Second run — nothing new
        result = generate_migration(new_policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)
        assert result is None

    def test_new_policy_added_to_existing_router_generates_migration(self, tmp_path: Path) -> None:
        """Adding a new permission to an existing router produces exactly one new PolicyAdd."""
        router = NexusRouter(prefix="/widgets")

        @router.get("", dependencies=[Depends(PermissionChecker("widget", "read"))])
        async def list_widgets() -> list[str]:
            return []

        policies = scan_routes([_router_info(router)])
        generate_migration(policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        # Now "add" a new route with a new permission
        @router.post("", dependencies=[Depends(PermissionChecker("widget", "create"))])
        async def create_widget() -> dict[str, object]:
            return {}

        all_policies = scan_routes([_router_info(router)])
        existing_names = {op.name for op in scan_migrations(tmp_path) if isinstance(op, PolicyAdd)}
        new_policies = [p for p in all_policies if p.name not in existing_names]

        assert len(new_policies) == 1
        assert new_policies[0].name == "widget:create:any"

        result = generate_migration(new_policies, head_revision="newrev000000", migrations_dir=tmp_path)
        assert result is not None

        all_ops = scan_migrations(tmp_path)
        all_names = {op.name for op in all_ops if isinstance(op, PolicyAdd)}
        assert all_names == {"widget:read:any", "widget:create:any"}

    def test_generates_role_appends_for_new_policy(self, tmp_path: Path) -> None:
        """RolePolicyAppend ops are emitted for roles declared on the new PolicyInfo."""
        new = [PolicyInfo("widget", "read", roles=("auditor", "user"))]

        result = generate_migration(new, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)

        assert result is not None
        content = result.read_text()
        # Generated file must be valid Python
        compile(content, str(result), "exec")
        # Must contain RolePolicyAppend imports and entries
        assert "RolePolicyAppend" in content
        assert 'RolePolicyAppend("auditor", "widget:read:any")' in content
        assert 'RolePolicyAppend("user", "widget:read:any")' in content

    def test_role_appends_match_declared_roles(self, tmp_path: Path) -> None:
        """RolePolicyAppend ops in the generated migration exactly match PolicyInfo.roles."""
        declared_roles = ("admin", "project-admin", "project-user")
        new_policies = [PolicyInfo("widget", "frobnicate", roles=declared_roles)]

        result = generate_migration(new_policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)
        assert result is not None

        ops = scan_migrations(tmp_path)
        appended_roles = {
            op.role_name for op in ops if isinstance(op, RolePolicyAppend) and op.policy_name == "widget:frobnicate:any"
        }

        assert appended_roles == set(declared_roles)

    def test_no_role_appends_when_roles_empty(self, tmp_path: Path) -> None:
        """A PolicyInfo with no roles produces only a PolicyAdd, no RolePolicyAppend."""
        new_policies = [PolicyInfo("widget", "secret")]  # roles defaults to ()

        result = generate_migration(new_policies, head_revision=_HEAD_REVISION, migrations_dir=tmp_path)
        assert result is not None

        ops = scan_migrations(tmp_path)
        assert all(isinstance(op, PolicyAdd) for op in ops)
