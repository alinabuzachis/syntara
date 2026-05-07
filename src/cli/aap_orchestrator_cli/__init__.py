"""Dynamic CLI for the AAP Orchestrator API — built at runtime from the OpenAPI spec."""

from __future__ import annotations

from .benchmark import note, phase

with phase("startup.import.typer"):
    import typer

with phase("startup.import.auth"):
    from .auth import load_token

with phase("startup.import.commands"):
    from .commands import set_dynamic_commands

with phase("startup.import.spec"):
    from .spec import load_spec

with phase("startup.load_spec"):
    _spec = load_spec()

with phase("startup.create_app"):
    app = typer.Typer(
        name="ao",
        help=(
            "AAP Orchestrator API command-line client.\n\n"
            "Set AO_BENCHMARK=1 to print per-phase execution timings to stderr "
            "for a single invocation."
        ),
        no_args_is_help=True,
    )

with phase("startup.set_dynamic_commands"):
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
    with phase("startup.main_callback"):
        ctx.ensure_object(dict)
        resolved_url = base_url or "http://localhost:8000/api/v1"
        ctx.obj["base_url"] = resolved_url
        note("base_url", resolved_url)
        if token is None:
            with phase("startup.load_token"):
                token = load_token(resolved_url)
        else:
            note("token_source", "option_or_env")
        ctx.obj["token"] = token
