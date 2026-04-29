"""Dynamic registry of resource types and their valid actions.

Instead of maintaining a static dictionary, this module builds the
resource-actions catalog at startup by introspecting the FastAPI route
dependencies (``PermissionChecker``, ``ProjectScopeFilter``) and merging
with ``BUILTIN_POLICIES``.  The result is stored in a module-level holder
and on ``app.state.resource_actions`` so both request-scoped code and the
policy service can access it.
"""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = structlog.stdlib.get_logger(__name__)

# ---------------------------------------------------------------------------
# Module-level registry holder
# ---------------------------------------------------------------------------

_registry: dict[str, list[str]] | None = None
_all_pairs: frozenset[str] = frozenset()


def _set_registry(resource_actions: dict[str, list[str]]) -> None:
    """Install the dynamic registry (called once at startup)."""
    global _registry, _all_pairs  # noqa: PLW0603
    _registry = resource_actions
    _all_pairs = frozenset(f"{rt}:{action}" for rt, actions in resource_actions.items() for action in actions)


def get_resource_actions() -> dict[str, list[str]]:
    """Return the resource-actions catalog.

    Raises:
        RuntimeError: If called before ``build_resource_actions`` has run.

    """
    if _registry is None:
        msg = "Resource-actions registry not initialized. Call build_resource_actions(app) during startup."
        raise RuntimeError(msg)
    return _registry


def get_all_resource_action_pairs() -> frozenset[str]:
    """Return every valid ``resource_type:action`` pair as a flat set."""
    if _registry is None:
        msg = "Resource-actions registry not initialized. Call build_resource_actions(app) during startup."
        raise RuntimeError(msg)
    return _all_pairs


def validate_statements(statements: list[dict[str, Any]]) -> list[str]:
    """Validate that all action strings in policy statements reference registered pairs.

    Wildcards (``resource_type:*``) are allowed if the resource type is registered.

    Returns a list of invalid action strings (empty if all valid).
    """
    registry = get_resource_actions()
    pairs = _all_pairs
    invalid: list[str] = []
    for stmt in statements:
        for action_str in stmt.get("actions", []):
            if ":" not in action_str:
                invalid.append(action_str)
                continue
            resource_type, action = action_str.split(":", 1)
            if action == "*":
                if resource_type not in registry:
                    invalid.append(action_str)
            elif action_str not in pairs:
                invalid.append(action_str)
    return invalid


# ---------------------------------------------------------------------------
# Scanner — builds the registry from live FastAPI routes + BUILTIN_POLICIES
# ---------------------------------------------------------------------------


def _get_dep_instance(dep: object) -> object | None:
    """Extract the underlying dependency instance from a Depends or Dependant."""
    inner: object | None = getattr(dep, "dependency", None)
    if inner is not None:
        return inner
    result: object | None = getattr(dep, "call", None)
    return result


def _iter_route_deps(route: object) -> list[object]:
    """Collect dependency objects from a route (route-level + param-level)."""
    deps: list[object] = []
    deps.extend(getattr(route, "dependencies", []) or [])
    dependant = getattr(route, "dependant", None)
    if dependant:
        deps.extend(getattr(dependant, "dependencies", []) or [])
    return deps


def build_resource_actions(app: FastAPI) -> dict[str, list[str]]:
    """Build the resource-actions catalog by introspecting the app.

    Sources:
    1. ``PermissionChecker`` / ``ProjectScopeFilter`` instances attached to
       registered ``APIRoute`` dependencies.
    2. ``BUILTIN_POLICIES`` entries (captures pairs like ``role-assignment:read``
       that are enforced via inline ``authorize()`` calls rather than route deps).

    The result is sorted (resource types alphabetically, actions within each
    resource type alphabetically) to produce a deterministic, API-friendly
    output.

    After building, the registry is installed in the module-level holder
    (via ``_set_registry``) and returned so the caller can also store it
    on ``app.state``.
    """
    from fastapi.routing import APIRoute  # noqa: PLC0415

    from nexus.authz.dependencies import PermissionChecker, ProjectScopeFilter  # noqa: PLC0415
    from nexus.authz.role_conventions import BUILTIN_POLICIES  # noqa: PLC0415

    pairs: set[tuple[str, str]] = set()

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for dep in _iter_route_deps(route):
            inner = _get_dep_instance(dep)
            if isinstance(inner, (PermissionChecker, ProjectScopeFilter)):
                pairs.add((inner.resource_type, inner.action))

    for policy in BUILTIN_POLICIES:
        pairs.add((policy.resource, policy.action))

    grouped: dict[str, set[str]] = defaultdict(set)
    for resource_type, action in pairs:
        grouped[resource_type].add(action)

    result = {rt: sorted(actions) for rt, actions in sorted(grouped.items())}

    _set_registry(result)
    logger.info(
        "Resource-actions registry built",
        resource_types=len(result),
        total_pairs=sum(len(a) for a in result.values()),
    )
    return result
