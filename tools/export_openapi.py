"""Export OpenAPI specification without starting the server.

Creates a lightweight FastAPI app, discovers and registers all routers,
then exports the combined OpenAPI JSON spec. No database or external
services are required.

Usage:
    uv run python tools/export_openapi.py [--output PATH]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from fastapi import FastAPI

from nexus.api.constants import API_V1_PATH_PREFIX
from nexus.core.router_discovery import discover_and_register_routers


def build_spec_app() -> FastAPI:
    """Build a minimal FastAPI app with all routers for spec generation."""
    app = FastAPI(
        title="Nexus API",
        description="A distributed multi-agent workflow orchestration system",
        version="0.1.0",
    )

    discover_and_register_routers(
        app=app,
        prefix=API_V1_PATH_PREFIX,
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
    args = parser.parse_args()

    app = build_spec_app()
    spec = app.openapi()

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
