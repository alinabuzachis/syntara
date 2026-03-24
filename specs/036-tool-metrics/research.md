# Research: Tool-Specific Metric Types

**Feature Branch**: `036-tool-metrics`
**Date**: 2026-03-23

## R1: MetricType Enum Name Collision

**Question**: Can we add `TOOL_EXECUTION_DURATION = "tool_execution_duration_ms"` to MetricType when it already exists?

**Decision**: Reuse the existing `MetricType.TOOL_EXECUTION_DURATION` member. Add it to the new `TOOL` category mapping alongside the new `TOOL_EXECUTION_STATUS` member. StrEnum members must be unique — a second member with the same value is invalid.

**Rationale**: `MetricType.TOOL_EXECUTION_DURATION` already exists (line 81 of types.py, value `"tool_execution_duration_ms"`). The existing `METRIC_CATEGORIES` already shows MetricTypes belonging to multiple categories (e.g., `WORKFLOW_DURATION` is in both `workflow` and `workflow_engine`). This is the established pattern.

**Alternatives considered**:
- Create `MCP_TOOL_EXECUTION_DURATION` with a different value: Rejected — diverges from Jira acceptance criteria which specify the exact name `TOOL_EXECUTION_DURATION`.
- Rename existing member: Rejected — breaks backward compatibility (FR-009).

## R2: Evolving Existing Prometheus Instruments

**Question**: The existing `nexus_tool_executions_total` counter uses labels `[component, tool_id]`. The new metrics need labels `[namespaced_name, status]`. Should we create new instruments or evolve the existing ones?

**Decision**: Replace the existing instrument label sets in place. No production code currently records `TOOL_EXECUTION_DURATION` or `TOOL_EXECUTION_COUNT` via the component dispatch path, so the label change is safe. The metric names (`nexus_tool_executions_total`, `nexus_tool_execution_duration_seconds`) are kept.

**Rationale**: Creating parallel instruments with a `_category_` infix would result in two sets of tool metrics that need eventual reconciliation. Since the existing instruments have no production callers, replacing their label sets is simpler and avoids long-term maintenance burden.

**Alternatives considered**:
- Create new instruments with `_category_` infix: Rejected — creates parallel metrics that would need eventual cleanup.
- Use `mcp_` prefix: Rejected — spec is not MCP-specific; any tool type should be recordable through these metrics.

## R3: Dispatch Routing for Tool MetricTypes

**Question**: Since `TOOL_EXECUTION_DURATION` is currently routed to `_dispatch_component` via `_COMPONENT_METRIC_MAP`, how do we route it to the new tool handler?

**Decision**: Remove `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_COUNT` from `_COMPONENT_METRIC_MAP` and add explicit cases in `_dispatch_prometheus` that route to the new `_dispatch_tool_execution` handler. No dual-dispatch path.

**Rationale**: Since the existing Prometheus instruments are being replaced with new label sets (R2), the old `_COMPONENT_METRIC_MAP` entries would point to instruments that no longer exist with the old labels. No production code records these metric types via the component dispatch path, so removing the entries is safe. This eliminates any label-based routing ambiguity.

**Alternatives considered**:
- Label-based routing (check `namespaced_name` vs `component` presence): Rejected — creates implicit dispatch contracts and risks silent misrouting.
- Create a completely new MetricType: Rejected — Jira specifies the exact name.

## R4: Bucket Selection Validation

**Question**: Which latency bucket profile is appropriate for MCP tool execution durations?

**Decision**: `LATENCY_BUCKETS_MEDIUM` (0.1s, 0.25s, 0.5s, 1.0s, 2.5s, 5.0s, 7.5s, 10.0s).

**Rationale**: Most MCP tool invocations complete in sub-second to single-digit-second ranges. `LATENCY_BUCKETS_SLOW` (1s–300s) provides no histogram distribution below 1 second, making it useless for fast MCP tools. 300 seconds is also unrealistically high for MCP tool calls. `LATENCY_BUCKETS_MEDIUM` covers the expected range with good sub-second granularity. Tools exceeding 10 seconds fall into the standard `+Inf` bucket. Per spec FR-005 and Assumptions.

**Alternatives considered**:
- `LATENCY_BUCKETS_SLOW` (1s-300s): Rejected — no distribution below 1s; 300s upper bound is unrealistic for MCP tools.
- Custom buckets: Rejected — adds complexity without clear benefit given the existing bucket profiles.

## R5: Label Set Redesign — `[component, tool_id]` → `[namespaced_name, status]`

**Question**: The existing instruments use `[component, tool_id]`. What should the new label set be?

**Decision**: Replace with `[namespaced_name, status]` (counter) and `[namespaced_name]` (histogram). Drop both `component` and `tool_id`.

**Rationale**:
- `tool_id` is a UUID — not human-readable, useless for PromQL queries and Grafana dashboards. `namespaced_name` (format `"{provider.name}::{tool.name}"`, e.g., `"github::search_code"`) is the canonical tool identifier used throughout the codebase for logging, filtering, and tool lookup.
- `component` is unnecessary — these instruments are exclusively for tool execution metrics. The component dimension adds no analytical value and was inherited from the generic component dispatch pattern.
- `namespaced_name` encodes both provider and tool name in a single label, keeping cardinality bounded by the finite set of registered tools.
- Adding `status` enables per-outcome aggregation (success/failure breakdowns) which was not possible with the old label set.
- No production code currently records metrics with `tool_id` or `component` on these instruments, so the change is safe.

**Alternatives considered**:
- Keep `tool_id` (UUID): Rejected — not human-readable.
- Use separate `tool_name` + `provider_name` labels: Rejected — `namespaced_name` is the established identifier pattern and keeps the label set compact.
- Keep `component` alongside `namespaced_name`: Rejected — `component` adds no value for tool-specific metrics and increases cardinality.

## R6: Status Label Values

**Question**: What status values should be used for tool execution outcomes?

**Decision**: Three constrained values derived from exception types at the tool execution wrapper: `"success"` (no exception raised), `"timeout"` (timeout or connection-level exception), `"error"` (any other exception).

**Rationale**: HTTP status codes are not available at the instrumentation point. Tool execution goes through `create_tool_awrapper()` / `create_tool_wrapper()` in `execution_failure_handler.py`, which calls into langchain → MCP client → MCP server. The wrapper only sees Python exceptions, not HTTP responses. The `retry_with_backoff` decorator in `core/utils/retry.py` already classifies exceptions into timeout-related (`httpx.TimeoutException`, `httpx.ConnectTimeout`, `httpx.ReadTimeout`, `httpx.ConnectError`, `asyncio.TimeoutError`) and other errors — this classification can be reused for the `status` label. Three values keep Prometheus cardinality minimal while distinguishing the operationally relevant failure mode (timeouts vs other errors).

**Alternatives considered**:
- Four values (`success`/`client_error`/`server_error`/`timeout`) derived from HTTP codes: Rejected — HTTP status codes are encapsulated within langchain and not accessible at the wrapper level.
- Two values (`success`/`failure`): Rejected — loses the distinction between timeouts (infrastructure failures) and other errors (tool-side failures).
