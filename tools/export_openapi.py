"""Export OpenAPI specification without starting the server.

Creates a lightweight FastAPI app, discovers and registers all routers,
then exports the combined OpenAPI JSON or YAML spec. No database or external
services are required.

Usage:
    uv run python tools/export_openapi.py [--output PATH] [--format {json,yaml}]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml
from fastapi import FastAPI

from nexus.api.constants import API_V1_PATH_PREFIX
from nexus.core.error_handlers import apply_rfc9457_media_types, problem_details_response_map
from nexus.core.router_discovery import discover_and_register_routers


def _get_dep_instance(dep: object) -> object | None:
    """Extract the underlying dependency instance from a Depends or Dependant object."""
    # route-level: Depends(instance) → dep.dependency is the instance
    inner = getattr(dep, "dependency", None)
    if inner is not None:
        return inner
    # param-level: Dependant wraps → dep.call is the instance
    return getattr(dep, "call", None)


def _iter_route_deps(route: object) -> list[object]:
    """Collect dependency objects from a route (both route-level and param-level)."""
    deps: list[object] = []
    deps.extend(getattr(route, "dependencies", []) or [])
    dependant = getattr(route, "dependant", None)
    if dependant:
        deps.extend(getattr(dependant, "dependencies", []) or [])
    return deps


def _extract_route_permission(route: object) -> dict[str, object] | None:
    """Extract x-app-permission dict from a route's dependencies, or None."""
    from nexus.authz.dependencies import PermissionChecker, ProjectScopeFilter

    for dep in _iter_route_deps(route):
        inner = _get_dep_instance(dep)
        if isinstance(inner, PermissionChecker):
            return {"resource": inner.resource_type, "action": inner.action}
        if isinstance(inner, ProjectScopeFilter):
            return {"resource": inner.resource_type, "action": inner.action}
    return None


def _inject_permission_metadata(app: FastAPI, spec: dict) -> None:
    """Add x-app-permission to spec operations from PermissionChecker deps.

    Walks the assembled FastAPI routes, extracts PermissionChecker and
    ProjectScopeFilter instances, and injects x-app-permission into the
    corresponding spec operations.  This makes the exported spec include
    permission metadata derived from runtime code, enabling the drift
    checker to catch mismatches between code and hand-written sub-specs.
    """
    from fastapi.routing import APIRoute

    paths = spec.get("paths", {})
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        permission = _extract_route_permission(route)
        if permission is None:
            permission = {"resource": None, "action": None}

        path = route.path
        if path not in paths:
            continue

        for method in route.methods or []:
            method_lower = method.lower()
            if method_lower in paths[path]:
                paths[path][method_lower]["x-app-permission"] = permission


def build_spec_app() -> FastAPI:
    """Build a minimal FastAPI app with all routers for spec generation."""
    app = FastAPI(
        title="Nexus API",
        description="A distributed multi-agent workflow orchestration system",
        version="0.1.0",
        servers=[{"url": API_V1_PATH_PREFIX, "description": "API v1"}],
        responses=problem_details_response_map(),
    )

    discover_and_register_routers(
        app=app,
        prefix="",
        enable_validation=False,
    )

    return app


def main() -> int:
    """Export OpenAPI spec to file or stdout."""
    parser = argparse.ArgumentParser(description="Export OpenAPI specification")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Output file path (default: stdout)",
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=["json", "yaml"],
        default="yaml",
        help="Output format (default: yaml)",
    )
    args = parser.parse_args()

    app = build_spec_app()
    spec = app.openapi()
    apply_rfc9457_media_types(spec)
    _inject_permission_metadata(app, spec)

    if args.format == "yaml":
        content = yaml.dump(spec, default_flow_style=False, allow_unicode=True, sort_keys=False)
    else:
        content = json.dumps(spec, indent=2) + "\n"

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content, encoding="utf-8")
        sys.stderr.write(f"OpenAPI spec exported to {args.output}\n")
    else:
        sys.stdout.write(content)

    return 0


if __name__ == "__main__":
    sys.exit(main())
