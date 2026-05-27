"""Dynamic CLI engine — builds Typer/Click commands from the OpenAPI spec at runtime."""

from __future__ import annotations

import importlib
import importlib.util
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable

import click
import typer

from .auth import save_token
from .benchmark import note, phase

# ---------------------------------------------------------------------------
# Helpers (ported from tools/generate_cli.py)
# ---------------------------------------------------------------------------

_HTTP_METHODS = frozenset(("get", "post", "put", "patch", "delete"))
_TYPE_MAP: dict[str, type] = {"integer": int, "number": float, "boolean": bool}


def _snake(name: str) -> str:
    s = re.sub(r"[-\s]+", "_", name)
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", s)
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s)
    return s.lower()


def _tag_to_module(tag: str) -> str:
    return _snake(tag)


def _resolve_ref(spec: dict[str, Any], ref: str) -> tuple[str, dict[str, Any]]:
    parts = ref.lstrip("#/").split("/")
    node = spec
    for p in parts:
        node = node[p]
    return parts[-1], node


def _schema_name_to_module(schema_name: str) -> str:
    return _snake(schema_name)


def _operationid_to_command(operation_id: str, tag_module: str) -> str:
    singular = tag_module.rstrip("s") if tag_module.endswith("s") else tag_module
    name = operation_id

    for suffix in [f"_{tag_module}", f"_{singular}"]:
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break

    for prefix in [f"{tag_module}_", f"{singular}_"]:
        if name.startswith(prefix):
            name = name[len(prefix) :]
            break

    name = name.replace(f"_{singular}_", "_")
    if name.startswith(f"{singular}_"):
        name = name[len(singular) + 1 :]

    return name.replace("_", "-")


def _discover_endpoint_modules() -> dict[str, list[str]]:
    """Return {tag_module: [module_name, ...]} by scanning the generated client package."""
    with phase("startup.discover_endpoint_modules"):
        package_spec = importlib.util.find_spec("nexus_api_client")
        if not package_spec or not package_spec.submodule_search_locations:
            note("endpoint_discovery", "package_missing")
            return {}

        package_dir = Path(next(iter(package_spec.submodule_search_locations)))
        api_dir = package_dir / "api"
        if not api_dir.is_dir():
            note("endpoint_discovery", "api_dir_missing")
            return {}

        note("endpoint_discovery", "package_dir_scan")
        result: dict[str, list[str]] = {}
        for tag_dir in sorted(api_dir.iterdir()):
            if not tag_dir.is_dir() or tag_dir.name.startswith("__"):
                continue
            modules = sorted(f.stem for f in tag_dir.iterdir() if f.suffix == ".py" and f.stem != "__init__")
            result[tag_dir.name] = modules
        return result


def _match_module(operation_id: str, available_modules: list[str]) -> str | None:
    if operation_id in available_modules:
        return operation_id
    return None


# ---------------------------------------------------------------------------
# OpenAPI type mapping (to Click types)
# ---------------------------------------------------------------------------


def _openapi_to_click_type(prop: dict[str, Any]) -> type:
    """Map an OpenAPI property schema to a Click parameter type."""
    if "anyOf" in prop:
        non_null = [t for t in prop["anyOf"] if t.get("type") != "null"]
        if non_null:
            return _openapi_to_click_type(non_null[0])
    return _TYPE_MAP.get(prop.get("type", ""), str)


def _openapi_default(prop: dict[str, Any], *, is_required: bool) -> Any:
    """Derive the default value for a CLI parameter from the OpenAPI schema."""
    if is_required:
        return None
    return prop.get("default")


# ---------------------------------------------------------------------------
# Complex field detection & JSON arg loading
# ---------------------------------------------------------------------------


def _is_complex_field(spec: dict[str, Any], fprop: dict[str, Any]) -> bool:
    if fprop.get("type") in ("object", "array"):
        return True
    if "$ref" in fprop:
        _, target = _resolve_ref(spec, fprop["$ref"])
        if target.get("type") == "string" and "enum" in target:
            return False
        return target.get("type") not in ("string", "integer", "number", "boolean")
    for item in fprop.get("anyOf", []):
        if isinstance(item, dict) and "$ref" in item:
            _, target = _resolve_ref(spec, item["$ref"])
            if target.get("type") == "object" or "properties" in target:
                return True
    # Untyped fields (no type, no $ref, no anyOf) accept arbitrary values — treat as complex
    return "type" not in fprop and "$ref" not in fprop and "anyOf" not in fprop


def _load_json_arg(value: str) -> object:
    """Parse a JSON string or @file.json reference."""
    if value.startswith("@"):
        return json.loads(Path(value[1:]).read_text())
    return json.loads(value)


# ---------------------------------------------------------------------------
# Body field extraction
# ---------------------------------------------------------------------------


def _extract_body_ref(details: dict[str, Any]) -> str | None:
    if "requestBody" not in details:
        return None
    schema = details["requestBody"].get("content", {}).get("application/json", {}).get("schema", {})
    ref: str | None = schema.get("$ref")
    if ref:
        return ref
    for item in schema.get("allOf", []):
        if "$ref" in item:
            return item["$ref"]  # type: ignore[no-any-return]
    return None


def _extract_body_fields(spec: dict[str, Any], body_ref: str | None) -> list[dict[str, Any]]:
    if not body_ref:
        return []
    _, schema = _resolve_ref(spec, body_ref)
    required_set = set(schema.get("required", []))
    props = schema.get("properties", {})
    fields = []
    for fname, fprop in props.items():
        is_required = fname in required_set
        desc = fprop.get("description", "")
        if "$ref" in fprop:
            _, target = _resolve_ref(spec, fprop["$ref"])
            if target.get("enum"):
                vals = ", ".join(str(v) for v in target["enum"])
                desc = desc or fname.replace("_", " ").title()
                desc += f" (one of: {vals})"
        fields.append(
            {
                "name": fname,
                "click_type": _openapi_to_click_type(fprop),
                "default": _openapi_default(fprop, is_required=is_required),
                "required": is_required,
                "description": desc,
                "is_complex": _is_complex_field(spec, fprop),
            }
        )
    return fields


# ---------------------------------------------------------------------------
# Spec parsing
# ---------------------------------------------------------------------------


def _parse_endpoints(spec: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    by_tag: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for path, methods in spec.get("paths", {}).items():
        for method, details in methods.items():
            if method not in _HTTP_METHODS:
                continue
            operation_id = details.get("operationId")
            if not operation_id:
                continue

            params = details.get("parameters", [])
            query_param_details: dict[str, dict[str, Any]] = {}
            for p in params:
                if p.get("in") == "query":
                    info = dict(p.get("schema", {}))
                    info.setdefault("description", p.get("description", ""))
                    query_param_details[p["name"]] = info

            ep = {
                "method": method,
                "path": path,
                "operation_id": operation_id,
                "summary": details.get("summary", ""),
                "path_params": [p["name"] for p in params if p.get("in") == "path"],
                "query_params": [p["name"] for p in params if p.get("in") == "query"],
                "query_param_details": query_param_details,
                "body_ref": _extract_body_ref(details),
            }
            for tag in details.get("tags", ["default"]):
                by_tag[_tag_to_module(tag)].append(ep)

    return dict(by_tag)


# ---------------------------------------------------------------------------
# Dynamic command building
# ---------------------------------------------------------------------------


def _create_client(base_url: str, token: str | None, *, needs_auth: bool) -> object:
    """Instantiate the appropriate API client."""
    with phase("request.create_client.import_client_module"):
        client_mod = importlib.import_module("nexus_api_client.client")
    with phase("request.create_client.instantiate"):
        api_url = f"{base_url}/api/v1"
        if needs_auth:
            if not token:
                typer.echo("Error: --token or AO_TOKEN required", err=True)
                raise typer.Exit(1)
            return client_mod.AuthenticatedClient(base_url=api_url, token=token, verify_ssl=False)
        return client_mod.Client(base_url=api_url, verify_ssl=False)


def _build_body_data(
    kwargs: dict[str, Any],
    body_fields: list[dict[str, Any]],
    body_field_names: list[str],
    complex_field_names: set[str],
    path_param_set: set[str],
) -> dict[str, Any]:
    """Extract and transform body fields from CLI kwargs into a dict for the model."""
    body_data: dict[str, Any] = {}
    for fn in body_field_names:
        if fn in path_param_set:
            continue
        val = kwargs.get(fn)
        if fn in complex_field_names and val is not None:
            val = _load_json_arg(val)
        field_meta = next(f for f in body_fields if f["name"] == fn)
        if field_meta["required"] or val is not None:
            body_data[fn] = val
    return body_data


def _format_response(response: Any) -> dict[str, Any] | None:
    """Print the response body and return the parsed dict (if any)."""
    if response.parsed is not None and hasattr(response.parsed, "to_dict"):
        parsed_dict: dict[str, Any] = response.parsed.to_dict()
        typer.echo(json.dumps(parsed_dict, indent=2, default=str))
        return parsed_dict
    if response.content:
        try:
            parsed_dict = json.loads(response.content)
        except (json.JSONDecodeError, UnicodeDecodeError):
            typer.echo(response.content.decode())
            return None
        typer.echo(json.dumps(parsed_dict, indent=2, default=str))
        return parsed_dict
    return None


def _make_command_callback(  # noqa: PLR0915
    ep: dict[str, Any],
    tag_module: str,
    endpoint_module: str,
    body_fields: list[dict[str, Any]],
    body_ref: str | None,
    spec: dict[str, Any],
) -> Callable[..., None]:
    """Create a closure that serves as the Click command callback."""
    needs_auth = ep["operation_id"] != "login"
    path_param_names = ep["path_params"]
    query_param_names = ep["query_params"]

    model_class_name: str | None = None
    model_module_name: str | None = None
    if body_ref:
        model_class_name, _ = _resolve_ref(spec, body_ref)
        model_module_name = _schema_name_to_module(model_class_name)

    body_field_names = [f["name"] for f in body_fields]
    complex_field_names = {f["name"] for f in body_fields if f["is_complex"]}
    path_param_set = set(path_param_names)

    is_login = ep["operation_id"] == "login"

    def callback(**kwargs: Any) -> None:
        ctx = click.get_current_context()
        note("command", ctx.command_path)
        note("operation_id", ep["operation_id"])
        with phase("request.command_total"):
            base_url: str = ctx.obj["base_url"]
            with phase("request.create_client"):
                client = _create_client(base_url, ctx.obj.get("token"), needs_auth=needs_auth)

            api_kwargs: dict[str, Any] = {}
            with phase("request.build_path_params"):
                for pp in path_param_names:
                    api_kwargs[pp] = kwargs[pp]

            if body_fields and model_class_name and model_module_name:
                with phase("request.build_body_data"):
                    body_data = _build_body_data(
                        kwargs,
                        body_fields,
                        body_field_names,
                        complex_field_names,
                        path_param_set,
                    )
                with phase("request.import_model_module"):
                    mod = importlib.import_module(f"nexus_api_client.models.{model_module_name}")
                with phase("request.model_from_dict"):
                    model_cls = getattr(mod, model_class_name)
                    api_kwargs["body"] = model_cls.from_dict(body_data)

            with phase("request.build_query_params"):
                for qp in query_param_names:
                    val = kwargs.get(qp)
                    if val is not None:
                        api_kwargs[qp] = val

            with phase("request.import_endpoint_module"):
                ep_mod = importlib.import_module(f"nexus_api_client.api.{tag_module}.{endpoint_module}")
            with phase("request.api_call"):
                response = ep_mod.sync_detailed(client=client, **api_kwargs)

            if not response.is_success:
                with phase("request.parse_error"):
                    try:
                        err = json.loads(response.content)
                    except (json.JSONDecodeError, UnicodeDecodeError):
                        err = response.content.decode()
                typer.echo(
                    json.dumps({"error": err, "status": response.status_code.value}, indent=2),
                    err=True,
                )
                raise typer.Exit(1)

            with phase("request.format_response"):
                parsed_dict = _format_response(response)

            if is_login and parsed_dict and "access_token" in parsed_dict:
                with phase("request.save_token"):
                    path = save_token(
                        base_url,
                        parsed_dict["access_token"],
                        parsed_dict.get("expires_in"),
                    )
                typer.echo(f"\nToken saved to {path}", err=True)

    return callback


def _make_option(opt_name: str, param_type: type, default: Any, help_text: str) -> typer.core.TyperOption:
    """Build a single Typer option, handling boolean flags."""
    kwargs: dict[str, Any] = {
        "param_decls": [f"--{opt_name}"],
        "type": param_type,
        "default": default,
        "show_default": default is not None and default is not False,
        "required": False,
        "help": help_text,
    }
    if param_type is bool and default is False:
        kwargs["is_flag"] = True
        del kwargs["type"]
    return typer.core.TyperOption(**kwargs)


def _build_body_params(body_fields: list[dict[str, Any]], used: set[str]) -> list[click.Parameter]:
    """Build Typer options for request body fields."""
    params: list[click.Parameter] = []
    for field in body_fields:
        if field["name"] in used:
            continue
        used.add(field["name"])
        opt_name = field["name"].replace("_", "-")
        help_text = field["description"] or field["name"].replace("_", " ").title()
        if field["is_complex"]:
            help_text += " (JSON string or @file.json)"
        param_type = str if field["is_complex"] else field["click_type"]
        if field["required"]:
            params.append(
                typer.core.TyperOption(
                    param_decls=[f"--{opt_name}"],
                    type=param_type,
                    required=True,
                    help=help_text,
                )
            )
        else:
            params.append(_make_option(opt_name, param_type, field["default"], help_text))
    return params


def _build_query_params(ep: dict[str, Any], used: set[str]) -> list[click.Parameter]:
    """Build Typer options for query parameters."""
    params: list[click.Parameter] = []
    for qp in ep["query_params"]:
        if qp in used:
            continue
        used.add(qp)
        qp_info = ep["query_param_details"].get(qp, {})
        opt_name = qp.replace("_", "-")
        desc = qp_info.get("description", qp.replace("_", " ").title())
        desc = desc.replace("\n", " ").strip() or qp.replace("_", " ").title()
        default = _openapi_default(qp_info, is_required=False)
        params.append(_make_option(opt_name, _openapi_to_click_type(qp_info), default, desc))
    return params


def _build_click_command(
    ep: dict[str, Any],
    tag_module: str,
    endpoint_module: str,
    spec: dict[str, Any],
) -> click.Command:
    """Build a Click Command from an OpenAPI endpoint descriptor."""
    with phase("startup.build_click_command"):
        cmd_name = _operationid_to_command(ep["operation_id"], tag_module)
        body_fields = _extract_body_fields(spec, ep["body_ref"])
        callback = _make_command_callback(ep, tag_module, endpoint_module, body_fields, ep["body_ref"], spec)

        used: set[str] = set()

        path_params: list[click.Parameter] = []
        for pp in ep["path_params"]:
            used.add(pp)
            path_params.append(
                typer.core.TyperArgument(
                    param_decls=[pp],
                    type=str,
                    required=True,
                    help=pp.replace("_", " ").title(),
                )
            )

        params: list[click.Parameter] = [
            *path_params,
            *_build_body_params(body_fields, used),
            *_build_query_params(ep, used),
        ]

        return typer.core.TyperCommand(
            name=cmd_name,
            callback=callback,
            params=params,
            help=ep["summary"] or cmd_name,
        )


# ---------------------------------------------------------------------------
# Assembly: build the full CLI onto a Typer app
# ---------------------------------------------------------------------------


class _OrderedTyperGroup(typer.core.TyperGroup):
    """A TyperGroup that preserves insertion order instead of sorting."""

    def list_commands(self, ctx: click.Context) -> list[str]:  # noqa: ARG002
        """Return commands in insertion order."""
        return list(self.commands)


class DynamicTyperGroup(typer.core.TyperGroup):
    """TyperGroup subclass that merges dynamically-built commands from the spec."""

    def list_commands(self, ctx: click.Context) -> list[str]:  # noqa: ARG002
        """Return commands sorted alphabetically."""
        return sorted(self.commands)

    def get_command(self, ctx: click.Context, cmd_name: str) -> click.Command | None:  # noqa: ARG002
        """Look up a command by name."""
        return self.commands.get(cmd_name)


def _build_dynamic_commands(spec: dict[str, Any]) -> dict[str, click.Command]:
    """Parse the OpenAPI spec and return a dict of group_name -> click.Group."""
    with phase("startup.build_dynamic_commands"):
        with phase("startup.parse_endpoints"):
            endpoints_by_tag = _parse_endpoints(spec)
        available_modules = _discover_endpoint_modules()

        groups: dict[str, click.Command] = {}

        with phase("startup.assemble_command_groups"):
            for tag_module in sorted(endpoints_by_tag):
                endpoints = endpoints_by_tag[tag_module]
                tag_avail = available_modules.get(tag_module, [])
                if not tag_avail:
                    continue

                tag_display = tag_module
                for t in spec.get("tags", []):
                    if _tag_to_module(t["name"]) == tag_module:
                        tag_display = t["name"]
                        break

                group_name = tag_module.replace("_", "-")
                group = _OrderedTyperGroup(
                    name=group_name,
                    help=f"{tag_display} operations.",
                )

                for ep in endpoints:
                    endpoint_module = _match_module(ep["operation_id"], tag_avail)
                    if endpoint_module is None:
                        continue
                    cmd = _build_click_command(ep, tag_module, endpoint_module, spec)
                    group.add_command(cmd)

                if group.commands:
                    groups[group_name] = group

        note("dynamic_command_group_count", len(groups))
        return groups


def set_dynamic_commands(app: typer.Typer, spec: dict[str, Any]) -> None:
    """Pre-compute the dynamic commands and stash them for DynamicTyperGroup.

    Since Typer creates a new TyperGroup on every ``get_group()`` call, we cannot
    attach commands to a specific instance.  Instead we set a custom ``cls`` via
    ``app.info`` so that every new group instance merges in the dynamic commands.
    """
    dynamic_commands = _build_dynamic_commands(spec)

    class _BoundDynamic(DynamicTyperGroup):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, **kwargs)
            self.commands.update(dynamic_commands)

    app.info.cls = _BoundDynamic
