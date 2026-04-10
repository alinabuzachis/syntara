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
from nexus.core.router_discovery import discover_and_register_routers


def build_spec_app() -> FastAPI:
    """Build a minimal FastAPI app with all routers for spec generation."""
    app = FastAPI(
        title="Nexus API",
        description="A distributed multi-agent workflow orchestration system",
        version="0.1.0",
        servers=[{"url": API_V1_PATH_PREFIX, "description": "API v1"}],
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
