"""Dynamic CLI for the AAP Orchestrator API — built at runtime from the OpenAPI spec."""

from __future__ import annotations

import typer

from .auth import load_token
from .commands import set_dynamic_commands
from .spec import load_spec

_spec = load_spec()

app = typer.Typer(
    name="ao",
    help="AAP Orchestrator API command-line client.",
    no_args_is_help=True,
)

set_dynamic_commands(app, _spec)


@app.callback()
def main(
    ctx: typer.Context,
    base_url: str = typer.Option(
        None,
        "--base-url",
        envvar="AO_URL",
        help="AAP Orchestrator API base URL.",
    ),
    token: str | None = typer.Option(
        None,
        "--token",
        envvar="AO_TOKEN",
        help="API bearer token.",
    ),
) -> None:
    """AAP Orchestrator API command-line client."""
    ctx.ensure_object(dict)
    resolved_url = base_url or "http://localhost:8000/api/v1"
    ctx.obj["base_url"] = resolved_url
    if token is None:
        token = load_token(resolved_url)
    ctx.obj["token"] = token
