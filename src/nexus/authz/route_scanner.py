"""Scan NexusRouter routes for permission declarations.

Inspects ``PermissionChecker`` / ``ProjectScopeFilter`` dependencies
on each route to extract ``(resource_type, action)`` pairs, which are
returned as ``PolicyInfo`` objects.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from nexus.authz.role_conventions import PolicyInfo

if TYPE_CHECKING:
    from nexus.core.router_discovery import RouterInfo

logger = logging.getLogger(__name__)


def _extract_permission_checker_args(dep: object) -> tuple[str, str, tuple[str, ...]] | None:
    """Return ``(resource_type, action, roles)`` if *dep* wraps a PermissionChecker."""
    from nexus.authz.dependencies import PermissionChecker  # noqa: PLC0415

    # Depends(PermissionChecker(...))  -- dep.dependency is the instance
    inner = getattr(dep, "dependency", None)
    if isinstance(inner, PermissionChecker):
        return (inner.resource_type, inner.action, inner.roles)
    return None


def _extract_project_scope_filter_args(dep: object) -> tuple[str, str] | None:
    """Return ``(resource_type, action)`` if *dep* wraps a ProjectScopeFilter."""
    from nexus.authz.dependencies import ProjectScopeFilter  # noqa: PLC0415

    inner = getattr(dep, "dependency", None)
    if isinstance(inner, ProjectScopeFilter):
        return (inner.resource_type, inner.action)
    return None


def _collect_deps(router_info: RouterInfo) -> list[object]:
    """Return all dependency objects across all routes in *router_info*."""
    deps: list[object] = []
    for route in router_info.router.routes:
        deps.extend(getattr(route, "dependencies", []) or [])
        dependant = getattr(route, "dependant", None)
        if dependant:
            deps.extend(getattr(dependant, "dependencies", []) or [])
    return deps


def _scan_router_deps(
    router_info: RouterInfo,
    pc_policies: dict[tuple[str, str], tuple[str, ...]],
    psf_pairs: set[tuple[str, str]],
) -> None:
    """Extract permission policies from a single router's dependencies."""
    for dep in _collect_deps(router_info):
        pc = _extract_permission_checker_args(dep)
        if pc:
            pc_policies.setdefault((pc[0], pc[1]), pc[2])
            continue
        psf = _extract_project_scope_filter_args(dep)
        if psf:
            psf_pairs.add(psf)


def scan_routes(routers: list[RouterInfo]) -> list[PolicyInfo]:
    """Return deduplicated ``PolicyInfo`` list derived from all NexusRouter routes.

    Scans each ``RouterInfo.router`` directly (rather than a fully-bootstrapped
    ``FastAPI`` app) so that routes are available without running the app lifespan.
    Only routers whose ``.router`` is a ``NexusRouter`` instance are inspected.

    ``PermissionChecker`` declarations take precedence over ``ProjectScopeFilter``
    for the same ``(resource_type, action)`` pair, ensuring that explicit ``roles``
    annotations are preserved even when a ``ProjectScopeFilter`` for the same pair
    appears first in the dependency list.
    """
    from nexus.core.nexus_router import NexusRouter  # noqa: PLC0415

    pc_policies: dict[tuple[str, str], tuple[str, ...]] = {}
    psf_pairs: set[tuple[str, str]] = set()

    for router_info in routers:
        if isinstance(router_info.router, NexusRouter):
            _scan_router_deps(router_info, pc_policies, psf_pairs)

    result: list[PolicyInfo] = [PolicyInfo(resource=r, action=a, roles=roles) for (r, a), roles in pc_policies.items()]
    for r, a in psf_pairs:
        if (r, a) not in pc_policies:
            result.append(PolicyInfo(resource=r, action=a))

    return result


def discover_all_policies(extra: list[PolicyInfo]) -> list[PolicyInfo]:
    """Return all known policies: *extra* merged with route-scanner results.

    Seeds from *extra* first, then overlays with policies discovered by
    scanning all NexusRouter routes via ``discover_routers``.  Falls back
    to *extra* only if route scanning fails (e.g. during migrations or
    partial-bootstrap contexts).
    """
    policies: dict[str, PolicyInfo] = {p.name: p for p in extra}
    try:
        from pathlib import Path  # noqa: PLC0415

        import nexus as _nexus  # noqa: PLC0415
        from nexus.core.router_discovery import discover_routers  # noqa: PLC0415

        nexus_root = Path(_nexus.__file__).resolve().parent
        for p in scan_routes(discover_routers([nexus_root])):
            policies[p.name] = p
    except Exception:  # noqa: BLE001
        logger.debug("Could not scan routes for policies", exc_info=True)
    return list(policies.values())
