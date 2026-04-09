# Data Model: Tool Metrics Telemetry Integration

**Feature**: 041-tool-metrics-telemetry
**Date**: 2026-04-07

## New Models

### ToolCounts (Telemetry Event Model)

Added to `src/nexus/telemetry/events/system_analytics.py` alongside existing `WorkflowCounts`, `ExecutionCounts`, etc.

```python
class ToolCounts(SQLModel):
    """All-time cumulative tool execution counts (terminal states only)."""

    success_count: int = Field(default=0, description="All-time successful executions")
    error_count: int = Field(default=0, description="All-time failed executions")
    timeout_count: int = Field(default=0, description="All-time timed-out executions")
    distinct_tools: int = Field(default=0, description="Number of distinct tools ever used")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_executions(self) -> int:
        """All-time total tool executions (success + error + timeout)."""
        return self.success_count + self.error_count + self.timeout_count
```

**Relationships**: Embedded in `SystemAnalyticsEvent` as a new `tools` field.

### ToolExecutionTelemetryEvent (Telemetry Event Model)

New file: `src/nexus/telemetry/events/tool_execution.py`

```python
class ToolExecutionTelemetryEvent(BaseTelemetryEvent):
    """Telemetry event emitted for each tool execution reaching a terminal state."""

    namespaced_name: str = Field(description="Tool namespaced name (e.g., mcp::get_greeting)")
    status: ExecutionStatus = Field(description="Execution status: success, error, timeout")  # from nexus.tool_manager.models.tool_execution
    duration_ms: int = Field(ge=0, description="Execution duration in milliseconds")
    workflow_execution_id: UUID | None = Field(default=None, description="Parent workflow execution identifier (UUID v4, from AgentState.execution_id)")
```

**Note**: Inherits `entitlement_id` from `BaseTelemetryEvent`. Event name auto-derived as `tool_execution_telemetry` via `_get_event_name()`. The `workflow_execution_id` links the tool execution to its parent workflow execution for correlation in Segment (sourced from optional `AgentState.execution_id` field, populated by `InvocationExecutor`). When `None`, the field appears as `null` in the Segment payload (consistent with `model_dump()` default behavior). Only emitted for terminal states (success, error, timeout) — "running" state is excluded.

## Modified Models

### SystemAnalyticsEvent

Add new `tools` field:

```python
class SystemAnalyticsEvent(BaseTelemetryEvent):
    workflows: WorkflowCounts = Field(...)
    credentials: CredentialCounts = Field(...)
    executions: ExecutionCounts = Field(...)
    config: ConfigInfo = Field(...)
    tools: ToolCounts = Field(..., description="Tool usage aggregates")  # NEW
```

## No Database Changes

This feature does not create new tables or modify existing schemas. It reads from existing `usage_counters` and `tool_executions` tables (created in PR #504).

## Data Flow

```
Tool Execution (terminal state only: success/error/timeout)
    │
    ├──→ _emit_tool_metrics()          → Prometheus (existing)
    ├──→ _persist_tool_execution_to_db() → PostgreSQL (existing)
    └──→ TelemetryCollector.capture_tool_executed(workflow_execution_id) → Segment (NEW)
                                                        │
                                                        └──→ ToolExecutionTelemetryEvent (includes workflow_execution_id)

Every 5 minutes:
    PeriodicCollector._collect_and_send()
        │
        ├──→ query_workflow_counts()     (existing)
        ├──→ query_execution_counts()    (existing)
        ├──→ query_credential_counts()   (existing)
        ├──→ query_tool_counts()         (NEW) → reads usage_counters table
        └──→ SystemAnalyticsEvent(tools=ToolCounts(...))  → Segment
```
