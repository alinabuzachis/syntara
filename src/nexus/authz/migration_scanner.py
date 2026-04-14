"""Scan Alembic migration files for policy and role operations.

Finds ops declared as module-level ``POLICY_OPS`` / ``ROLE_OPS`` constants
or passed inline to ``apply_policy_ops()`` / ``apply_role_ops()`` calls
inside ``upgrade()``.  The latter is the format produced by
``alembic revision --autogenerate`` with the Nexus hook.

Used by the policy/role migration generator to understand which policies
and roles already exist in the migration chain, and by the test seeder
to replay all ops without running full migrations.
"""

from __future__ import annotations

import ast
import importlib
import importlib.util
import logging
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from nexus.authz.migration_ops import PolicyAdd, RoleAdd, RolePolicyAppend
    from nexus.authz.role_conventions import PolicyInfo, RoleInfo

logger = logging.getLogger(__name__)

# Namespace used to eval extracted AST list expressions.
_EVAL_NS: dict[str, object] | None = None


def _get_eval_ns() -> dict[str, object]:
    """Lazily build the namespace for evaluating migration op expressions."""
    global _EVAL_NS  # noqa: PLW0603
    if _EVAL_NS is None:
        from nexus.authz.migration_ops import PolicyAdd, RoleAdd, RolePolicyAppend  # noqa: PLC0415

        _EVAL_NS = {
            "PolicyAdd": PolicyAdd,
            "RoleAdd": RoleAdd,
            "RolePolicyAppend": RolePolicyAppend,
        }
    return _EVAL_NS


def _extract_inline_ops(source: str, func_name: str) -> list[Any]:
    """Parse *source* and eval the list arg of every ``func_name([...])`` call in ``upgrade()``."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    results: list[Any] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or node.name != "upgrade":
            continue
        for child in ast.walk(node):
            if (
                isinstance(child, ast.Call)
                and isinstance(child.func, ast.Name)
                and child.func.id == func_name
                and child.args
                and isinstance(child.args[0], ast.List)
            ):
                expr = ast.Expression(body=child.args[0])
                ast.fix_missing_locations(expr)
                try:
                    results.extend(eval(compile(expr, "<migration>", "eval"), _get_eval_ns()))  # noqa: S307
                except Exception:  # noqa: BLE001
                    logger.debug("Failed to eval %s list in migration", func_name, exc_info=True)
    return results


def _get_module_source(mod: object) -> str | None:
    """Return the source text of a migration module, or ``None`` if unavailable."""
    if hasattr(mod, "__spec__") and mod.__spec__ and mod.__spec__.origin:
        path = Path(mod.__spec__.origin)
    else:
        file_attr = getattr(mod, "__file__", None)
        if not file_attr:
            return None
        path = Path(str(file_attr))
    try:
        return path.read_text()
    except OSError:
        return None


def _load_migration_modules(migrations_dir: Path) -> list[object]:
    """Load and return all migration modules from *migrations_dir*."""
    modules: list[object] = []
    for py_file in sorted(migrations_dir.glob("*.py")):
        if py_file.name == "__init__.py":
            continue
        module_name = f"_migration_scan_{py_file.stem}"
        if module_name in sys.modules:
            modules.append(sys.modules[module_name])
        else:
            spec = importlib.util.spec_from_file_location(module_name, py_file)
            if spec is None or spec.loader is None:
                continue
            mod = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
            except Exception:  # noqa: BLE001
                logger.debug("Failed to load migration %s", py_file.name, exc_info=True)
                continue
            modules.append(mod)
    return modules


def _get_migrations_dir() -> Path:
    from nexus.core.database.migrations import versions  # noqa: PLC0415

    return Path(versions.__file__).parent


def scan_migrations(
    migrations_dir: Path | None = None,
) -> list[PolicyAdd | RolePolicyAppend]:
    """Collect every ``PolicyAdd`` / ``RolePolicyAppend`` from all migration files.

    Checks module-level ``POLICY_OPS`` first, then falls back to parsing
    inline ``apply_policy_ops([...])`` calls in ``upgrade()``.
    """
    if migrations_dir is None:
        migrations_dir = _get_migrations_dir()

    all_ops: list[PolicyAdd | RolePolicyAppend] = []
    for mod in _load_migration_modules(migrations_dir):
        policy_ops = getattr(mod, "POLICY_OPS", None)
        if isinstance(policy_ops, list):
            all_ops.extend(policy_ops)
            continue
        source = _get_module_source(mod)
        if source:
            all_ops.extend(_extract_inline_ops(source, "apply_policy_ops"))
    return all_ops


def scan_role_migrations(
    migrations_dir: Path | None = None,
) -> list[RoleAdd]:
    """Collect every ``RoleAdd`` op from all migration files.

    Checks module-level ``ROLE_OPS`` first, then falls back to parsing
    inline ``apply_role_ops([...])`` calls in ``upgrade()``.
    """
    if migrations_dir is None:
        migrations_dir = _get_migrations_dir()

    from nexus.authz.migration_ops import RoleAdd  # noqa: PLC0415

    all_ops: list[RoleAdd] = []
    for mod in _load_migration_modules(migrations_dir):
        role_ops = getattr(mod, "ROLE_OPS", None)
        if isinstance(role_ops, list):
            all_ops.extend(o for o in role_ops if isinstance(o, RoleAdd))
            continue
        source = _get_module_source(mod)
        if source:
            all_ops.extend(o for o in _extract_inline_ops(source, "apply_role_ops") if isinstance(o, RoleAdd))
    return all_ops


def find_untracked_roles(
    registry: list[RoleInfo],
    migrations_dir: Path | None = None,
) -> list[RoleInfo]:
    """Return roles in *registry* not yet tracked by any migration ROLE_OPS."""
    existing_names = {op.name for op in scan_role_migrations(migrations_dir)}
    return [r for r in registry if r.name not in existing_names]


def find_untracked_policies(
    extra_policies: list[PolicyInfo],
    migrations_dir: Path | None = None,
) -> list[PolicyInfo]:
    """Return policies from *extra_policies* (and routes) not yet tracked in migrations."""
    from nexus.authz.migration_ops import PolicyAdd  # noqa: PLC0415
    from nexus.authz.route_scanner import discover_all_policies  # noqa: PLC0415

    existing_names = {op.name for op in scan_migrations(migrations_dir) if isinstance(op, PolicyAdd)}
    return [p for p in discover_all_policies(extra_policies) if p.name not in existing_names]
