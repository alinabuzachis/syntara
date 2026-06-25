# Integrations

Technical documentation for the integrations feature in Nexus.

---

## Overview

Integrations connect Nexus to external services — MCP servers (tool providers), LLM providers, and AAP Gateways. Each integration record stores connection configuration, a management credential reference, and system-managed discovery results.

Supported integration types:

| Type | Configuration | Discovered Resources |
|------|--------------|---------------------|
| `mcp_server` | `base_url` | Tools (name, description, parameters) |
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

Integrations use two distinct credential roles with different scopes:

| Credential | Stored on | Used for |
|---|---|---|
| **Management credential** | `Integration.management_credential_id` | Health checks (`validate`, `refresh`), tool discovery only |
| **Execution credential** | `IntegrationConnectionConfig` (per workflow node) | MCP tool calls during agent workflow execution |

The management credential must never be used during workflow execution — it is scoped exclusively to admin-controlled discovery and health checks. Execution credentials are supplied by workflow designers per integration via `integration_connections` on the AI Agent node, and are resolved at execution time by `InvocationExecutor._make_mcp_credential_resolver`. If no execution credential is configured for an integration, tool calls to that integration are made unauthenticated.

Health checks require a management credential — integrations without one cannot be health-checked.

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

## Adapter System

### Adapter Protocol

Each integration type implements the `IntegrationHealthCheckAdapter` protocol. The adapter receives its typed configuration via the constructor. The Protocol defines two methods:

```python
@runtime_checkable
class IntegrationHealthCheckAdapter(Protocol):
    async def validate(
        self,
        resolved_credential: dict[str, Any],
        timeout_seconds: int,
    ) -> ValidateResult:
        """Lightweight connectivity check (ping). No resource discovery."""
        ...

    async def discover(
        self,
        resolved_credential: dict[str, Any],
        timeout_seconds: int,
    ) -> DiscoverResult:
        """Connect and return discovered resources (tools, models)."""
        ...
```

**Why Protocol over ABC:** No shared adapter behavior exists. Each adapter makes different HTTP calls with different auth mechanisms. Each constructor takes its specific configuration type, so `self._config.base_url` is typed without narrowing.

### Result Types

**`ValidateResult`** — returned by `validate()`. Contains only connection-health fields; no resource lists.

```python
class ValidateResult(SQLModel):
    success: bool
    checked_at: datetime
    error: str | None = None
    error_type: HealthCheckErrorType | None = None
```

**`DiscoverResult`** — returned by `discover()`. Extends with typed optional fields for each kind of discovered resource. Only the relevant field is populated by each adapter.

```python
class DiscoverResult(SQLModel):
    success: bool
    checked_at: datetime
    error: str | None = None
    error_type: HealthCheckErrorType | None = None
    discovered_models: list[DiscoveredLLMModel] | None = None
    discovered_tools: list[DiscoveredTool] | None = None
```

`DiscoveredTool` includes full parameter schemas so that `_sync_mcp_tools()` can upsert Tool records from a single external call.

**Design trade-off:** Typed optional fields give mypy verification and self-documenting dispatch (`if result.discovered_tools is not None`), at the cost of updating `DiscoverResult` when adding new integration types with new resource kinds. Since we expect a small number of integration types, this is manageable.

### Factory

A module-level registry maps `IntegrationType` to adapter constructors. Each adapter module registers itself at import time.

```python
register_health_check_adapter(
    IntegrationType.MCP_SERVER,
    lambda c: MCPServerHealthCheck(cast("MCPServerConfiguration", c)),
)
```

The integration router imports adapter modules to trigger registration.

### Endpoints and Flows

Three endpoints cover distinct operations:

**`POST /integrations/discover`** (requires `integration:discover` permission)

Test a connection and discover resources without saving. Used by the creation wizard's "Test Connection" step. Nothing is persisted.

1. **Router** — receives `IntegrationTestConnection` (type + configuration + `credential_id`), checks permission, calls `service.discover()`
2. **Service** — resolves credential, creates adapter via factory, calls `adapter.discover()`
3. **Adapter** — connects, returns `DiscoverResult` with tool/model lists (never raises)
4. **Router** — returns `DiscoverResult` to caller

**`POST /integrations/{id}/validate`** (requires `integration:validate` permission)

Lightweight connectivity ping for a saved integration. Updates integration status; does not sync Tool records.

1. **Router** — receives request, checks permission, calls `service.validate_integration(integration_id)`
2. **Service** — fetches integration, resolves credential, sets `status = VALIDATING`, creates adapter, calls `adapter.validate()`
3. **Adapter** — performs ping, returns `ValidateResult` (never raises)
4. **Service** — sets final status (`AVAILABLE` or `ERROR`), updates `last_validated_at` and `validation_error`, commits
5. **Router** — returns `ValidateResult`

**`POST /integrations/{id}/refresh`** (requires `integration:refresh` permission)

On-demand resource sync for a saved integration. Fetches the current tool/model list from the external service and upserts records in the database.

1. **Router** — receives request, checks permission, calls `service.refresh_integration_resources(integration_id)`
2. **Service** — fetches integration, resolves credential, sets `refresh_status = REFRESHING`, creates adapter, calls `adapter.discover()`
3. **Adapter** — connects, returns `DiscoverResult` with full tool list including parameters (never raises)
4. **Service** — calls `_sync_mcp_tools(integration, discovered_tools)` to upsert Tool records, sets final `refresh_status` (`AVAILABLE` or `ERROR`), updates `last_refreshed_at` and `refresh_error`, commits
5. **Router** — returns `RefreshResult` with sync counts

### Status Transitions

**Integration status** (set by validate):

```
[any status] → VALIDATING → AVAILABLE (success)
                           → ERROR     (failure)
```

`last_validated_at` is set only after the check completes, not during the VALIDATING transition.

**Refresh status** (set by refresh, independent of validate status):

```
[any refresh_status] → REFRESHING → AVAILABLE (success)
                                  → ERROR     (failure)
```

`last_refreshed_at` is set only after the sync completes. `refresh_error` is cleared on success and populated on failure.

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
   - `validate()` must handle all exceptions internally and always return a `ValidateResult`
   - `discover()` must handle all exceptions internally and always return a `DiscoverResult`
   - Register at module level: `register_health_check_adapter(IntegrationType.{TYPE}, lambda c: ...)`

3. **Trigger registration** (`integrations/router.py`):
   - Add `import nexus.integrations.adapters.{type_name}  # noqa: F401` to import the module at startup

4. **Discovery fields** (`integrations/adapters/protocol.py`):
   - If the new type discovers a new kind of resource, add a `Discovered{Resource}` model and an optional field to `DiscoverResult`

---

## MCP Server Adapter

The MCP adapter (`integrations/adapters/mcp_server.py`) implements both protocol methods:

**`validate()`** — intended to use the MCP ping utility ([spec](https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/ping)). Currently a no-op returning success, pending support in `langchain-mcp-adapters`.

**`discover()`** — delegates to `MCPProvider.refresh_tools()` (from `tool_manager/lib/providers/mcp/mcp_provider.py`):

- Calls `client.get_tools()` within `asyncio.wait_for(timeout_seconds)` to verify reachability
- Converts returned LangChain tools to `DiscoveredTool(name, description, parameters)` objects with full parameter schemas
- Handles `ExceptionGroup` patterns from the MCP client (Python 3.11+ `except*` syntax)
- Extracts auth token from resolved credential (`bearer_token` key from the injector output)

Using `MCPProvider` for discovery (rather than `MultiServerMCPClient` directly) ensures a single code path for both the unsaved-connection wizard and the refresh sync, and captures full parameter schemas needed for Tool record upserts.

### Tool Sync (`_sync_mcp_tools`)

Called by `refresh_integration_resources()` with the `DiscoverResult` from `adapter.discover()`. Performs a pure DB upsert — no external call:

- **New tools** — created with `status = AVAILABLE`, `enabled = True`
- **Existing tools** — description and parameters updated, `refresh_error` cleared
- **Missing tools** — marked `enabled = False`, `status = MISSING`

Returns `(synced_count, updated_count, disabled_count)` used to populate `RefreshResult`.

### Current Limitations

- **Tool `namespaced_name` goes stale on rename.** Tool records store `namespaced_name` as `"{integration_name}::{tool_short_name}"`. If the integration is renamed, existing tool records retain the old prefix. The `ToolSynchronizer` matches by `namespaced_name`, so renamed integrations cause all tools to appear MISSING and get disabled until records are corrected. Tracked in AAP-79781. Mitigation: match on `(integration_id, short_name)` instead of the full namespaced string, or update `namespaced_name` on rename/refresh.
- **Tool records linked to integrations at execution time only.** `integration_id` is stored on each Tool record and used at execution time for credential routing, but this linkage is not yet surfaced as a first-class relationship in the API or UI.
- **No diff detection on descriptions.** The sync overwrites tool descriptions on every successful refresh; it does not detect whether the description actually changed before writing.
- **`validate()` is a no-op.** The MCP ping utility is not yet exposed by `langchain-mcp-adapters`. Until it is, validate always returns success without contacting the server.

---

## File Layout

```
src/nexus/integrations/
├── adapters/
│   ├── __init__.py              # Public exports
│   ├── protocol.py              # Protocol, ValidateResult, DiscoverResult, DiscoveredTool, DiscoveredToolParameter
│   ├── factory.py               # Registry + create_health_check_adapter()
│   └── mcp_server.py            # MCP adapter implementation + registration
├── models/
│   ├── integration.py           # Integration model, IntegrationCreate/Read/Patch, RefreshResult schemas
│   └── integration_configuration.py  # Config types (Input + full with discovery fields)
├── services/
│   └── integration_service.py   # discover(), validate_integration(), refresh_integration_resources(), _sync_mcp_tools()
├── router.py                    # POST /integrations/discover, /{id}/validate, /{id}/refresh endpoints
├── exceptions.py                # IntegrationCredentialRequiredError, IntegrationRefreshNotSupportedError, etc.
└── error_handlers.py            # RFC 9457 error responses
```
