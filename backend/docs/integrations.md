# Integrations

Technical documentation for the integrations feature in Nexus.

---

## Overview

Integrations connect Nexus to external services — MCP servers (tool providers), LLM providers, and AAP Gateways. Each integration record stores connection configuration, a management credential reference, and system-managed discovery results.

Supported integration types:

| Type | Configuration | Discovered Resources |
|------|--------------|---------------------|
| `mcp_server` | `base_url` | Tools (name, description) |
| `llm_provider` | `base_url`, `provider_hint` | Models (name, pricing) — planned |
| `aap_gateway` | `gateway_url` | — planned |

---

## Configuration Schema

Integration configuration has two kinds of fields:

- **Admin-managed** — provided by the administrator when creating/editing (e.g., `base_url`, `provider_hint`, `gateway_url`)
- **System-managed** — populated by health checks (e.g., `discovered_tools`, `discovered_models`)

These are separated using inheritance:

```python
class MCPServerConfigurationInput(SQLModel):
    """Admin-provided fields only."""
    integration_type: Literal["mcp_server"] = "mcp_server"
    base_url: str

class MCPServerConfiguration(MCPServerConfigurationInput):
    """Full configuration including system-managed discovery results."""
    discovered_tools: list[DiscoveredTool] | None = None
```

- `IntegrationCreate` and `IntegrationPatch` use the `Input` variants — system-managed fields are structurally impossible to submit.
- The database model and `IntegrationRead` use the full variants — system-managed fields are visible in API responses.

---

## Credential Resolution

The management credential is persisted on the integration record as `management_credential_id`. Health checks require a management credential — integrations without one cannot be health-checked.

### Credential type validation

Each integration type requires a specific credential type. This is enforced at create and patch time — attaching an incompatible credential type returns HTTP 422:

| Integration Type | Allowed Credential Type |
|---|---|
| `mcp_server` | HTTP Bearer Token |
| `llm_provider` | LLM Provider |
| `aap_gateway` | Ansible Automation Platform |

The mapping is defined in `ALLOWED_CREDENTIAL_TYPES` in `integration_service.py`.

### Credential resolution flow

The service layer resolves credentials before calling the adapter (adapters never resolve credentials themselves). This is a two-step process:

1. **Decrypt** — `SecretService.retrieve_secret(credential.secret_id)` → raw `dict[str, Any]` of plaintext field values
2. **Resolve injectors** — `InjectorResolver.resolve(credential_type.injectors, decrypted_inputs)` → `ResolvedInjectors` with `extra_vars` mapping semantic field names to values

The adapter receives `resolved.extra_vars` — a dict with semantic field names like `bearer_token` or `llm_api_key`, depending on the credential type's injector configuration.

---

## Health Check System

### Adapter Protocol

Each integration type implements the `IntegrationHealthCheckAdapter` protocol. The adapter receives its typed configuration via the constructor. The Protocol defines a single `health_check` method that only takes per-call parameters (resolved credential and timeout).

```python
@runtime_checkable
class IntegrationHealthCheckAdapter(Protocol):
    async def health_check(
        self,
        resolved_credential: dict[str, Any],
        timeout_seconds: int,
    ) -> HealthCheckResult:
        """Run a health check against the external service."""
        ...
```

**Why Protocol over ABC:** No shared adapter behavior exists. Each adapter makes different HTTP calls with different auth mechanisms. Each constructor takes its specific configuration type, so `self._config.base_url` is typed without narrowing.

### Result Type

`HealthCheckResult` carries common status fields plus typed optional fields for each kind of discovered resource. Only the relevant field is populated by each adapter.

```python
class HealthCheckResult(SQLModel):
    success: bool
    checked_at: datetime
    error: str | None = None
    error_type: HealthCheckErrorType | None = None
    discovered_models: list[DiscoveredLLMModel] | None = None
    discovered_tools: list[DiscoveredTool] | None = None
```

**Design trade-off:** Typed optional fields give mypy verification and self-documenting dispatch (`if result.discovered_tools is not None`), at the cost of updating `HealthCheckResult` when adding new integration types with new resource kinds. Since we expect a small number of integration types, this is manageable.

### Factory

A module-level registry maps `IntegrationType` to adapter constructors. Each adapter module registers itself at import time.

```python
register_health_check_adapter(
    IntegrationType.MCP_SERVER,
    lambda c: MCPServerHealthCheck(cast("MCPServerConfiguration", c)),
)
```

The integration router imports adapter modules to trigger registration.

### Health Check Flow

Endpoint: `POST /integrations/{id}/validate` (requires `integration:validate` permission)

1. **Router** — receives request, checks permission, calls `service.validate_integration(integration_id)`
2. **Service** — fetches integration, resolves credential, sets `status = VALIDATING`, creates adapter via factory, calls `health_check()`
3. **Adapter** — connects to external service, returns `HealthCheckResult` (never raises)
4. **Service** — persists discovered resources to configuration JSONB, sets final status (`AVAILABLE` or `ERROR`), commits

### Status Transitions

```
[any status] → VALIDATING → AVAILABLE (success)
                           → ERROR     (failure)
```

`last_validated_at` is set only after the check completes, not during the VALIDATING transition.

---

## Adding a New Integration Type

To add support for a new integration type:

1. **Configuration models** (`integrations/models/integration_configuration.py`):
   - Create `{Type}ConfigurationInput` with admin-managed fields
   - Create `{Type}Configuration` extending it with system-managed discovery fields
   - Add both to the `IntegrationConfigurationInputTypes` and `IntegrationConfigurationTypes` unions

2. **Adapter** (`integrations/adapters/{type_name}.py`):
   - Implement a class satisfying `IntegrationHealthCheckAdapter` protocol
   - Constructor takes the typed configuration (e.g., `{Type}Configuration`)
   - `health_check()` must handle all exceptions internally and always return a `HealthCheckResult`
   - Register at module level: `register_health_check_adapter(IntegrationType.{TYPE}, lambda c: ...)`

3. **Trigger registration** (`integrations/router.py`):
   - Add `import nexus.integrations.adapters.{type_name}  # noqa: F401` to import the module at startup

4. **Discovery fields** (`integrations/adapters/protocol.py`):
   - If the new type discovers a new kind of resource, add a `Discovered{Resource}` model and an optional field to `HealthCheckResult`

5. **Persist results** (`integrations/services/integration_service.py`):
   - Add an `isinstance` branch in `_persist_discovered_resources()` for the new configuration type

---

## MCP Server Adapter

The MCP adapter (`integrations/adapters/mcp_server.py`) performs health checks by calling the MCP protocol's tool listing operation:

- Creates a `MultiServerMCPClient` with `streamable_http` transport
- Calls `client.get_tools()` within `asyncio.wait_for(timeout_seconds)` to verify reachability
- Converts returned LangChain tools to `DiscoveredTool(name, description)` objects
- Handles `ExceptionGroup` patterns from the MCP client (Python 3.11+ `except*` syntax)
- Extracts auth token from resolved credential (`bearer_token` key from the injector output)

### Current Limitations

- **No reconciliation with the `tools` table.** Discovered tools are stored as lightweight metadata in the configuration JSONB. Creating/updating full `Tool` records is follow-up work.
- **No linkage between integration and tool provider.** Auto-creating a linked internal tool provider record is not yet implemented.
- **No schema/parameter capture.** `DiscoveredTool` only has `name` and `description`. Full tool metadata is available from the MCP response but not captured.
- **No diff detection.** The health check overwrites the `discovered_tools` list on every successful check.
- **Pre-save validation endpoint.** `POST /integrations/validate` (test before saving) is not yet implemented.

---

## File Layout

```
src/nexus/integrations/
├── adapters/
│   ├── __init__.py              # Public exports
│   ├── protocol.py              # Protocol, HealthCheckResult, DiscoveredLLMModel, DiscoveredTool
│   ├── factory.py               # Registry + create_health_check_adapter()
│   └── mcp_server.py            # MCP adapter implementation + registration
├── models/
│   ├── integration.py           # Integration model, IntegrationCreate/Read/Patch schemas
│   └── integration_configuration.py  # Config types (Input + full with discovery fields)
├── services/
│   └── integration_service.py   # validate_integration(), _persist_discovered_resources()
├── router.py                    # POST /integrations/{id}/validate endpoint
├── exceptions.py                # IntegrationCredentialRequiredError
└── error_handlers.py            # RFC 9457 error responses
```
