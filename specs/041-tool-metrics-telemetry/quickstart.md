# Quickstart: Tool Metrics Telemetry Integration

**Feature**: 041-tool-metrics-telemetry
**Date**: 2026-04-07

## What This Feature Does

Adds tool execution metrics to the Nexus telemetry system (Segment):
1. **Periodic snapshots**: The existing 5-minute `system_analytics` event now includes all-time cumulative tool usage counts.
2. **Per-execution events**: Each tool execution emits a `tool_execution_telemetry` event to Segment with tool name, status, and duration.

## Prerequisites

- Nexus stack running with telemetry enabled (`APP_SEGMENT_WRITE_KEY` set)
- Tool metrics infrastructure from PR #504 (ToolMetricsService, UsageCounter, ToolExecution tables)

## How to Verify

### 1. Periodic Tool Counts

Wait for the next periodic collection cycle (every 5 minutes) or restart the service. Check Segment debugger for a `system_analytics` event — it should now include a `tools` section:

```json
{
  "tools": {
    "total_executions": 10,
    "success_count": 8,
    "error_count": 1,
    "timeout_count": 1,
    "distinct_tools": 3
  }
}
```

### 2. Per-Execution Events

Execute any tool (e.g., via an agentic workflow) and check Segment for a `tool_execution_telemetry` event:

```json
{
  "namespaced_name": "mcp::get_greeting",
  "status": "success",
  "duration_ms": 142,
  "workflow_execution_id": "550e8400-e29b-41d4-a716-446655440000",
  "entitlement_id": "your-entitlement-id"
}
```

> **Note**: `workflow_execution_id` is optional. When the orchestration context has no associated workflow execution, this field will be `null` in the payload.

### 3. Telemetry Disabled

Unset `APP_SEGMENT_WRITE_KEY` and verify:
- Tool executions still work normally
- No telemetry errors in logs
- Database metrics recording continues

### 4. E2E Test

Run the existing e2e agentic workflow test, which now also verifies telemetry events:

```bash
uv run pytest tests/e2e/test_agentic_workflow_tool_metrics.py -m e2e
```

This test runs an agentic workflow that calls the `mcp::get_greeting` tool and verifies that both DB metrics and telemetry events are recorded correctly.

## Files Changed

| File | Change |
| ---- | ------ |
| `src/nexus/telemetry/events/system_analytics.py` | Add `ToolCounts` model, add `tools` field to `SystemAnalyticsEvent` |
| `src/nexus/telemetry/events/tool_execution.py` | New `ToolExecutionTelemetryEvent` + builder |
| `src/nexus/telemetry/collector.py` | Add `capture_tool_executed()` method |
| `src/nexus/telemetry/periodic_collector.py` | Add `query_tool_counts()`, include in snapshot |
| `src/nexus/agent_orchestrator/models/agent_state.py` | Add optional `execution_id` field to `AgentState` |
| `src/nexus/agent_orchestrator/executor/invocation_executor.py` | Populate `execution_id` in `AgentState` |
| `src/nexus/agent_orchestrator/services/orchestration_service.py` | Thread `execution_id` through `_create_tool_node` |
| `src/nexus/agent_orchestrator/tool_manager/execution_failure_handler.py` | Emit telemetry event after DB persist (both async and sync wrappers) |
| `tests/e2e/test_agentic_workflow_tool_metrics.py` | Add telemetry event assertions to e2e test |
