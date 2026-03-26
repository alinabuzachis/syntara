# Quickstart: Tool Metrics Service Layer

**Feature Branch**: `040-tool-metrics-service`
**Date**: 2026-03-24

## What This Feature Does

Adds a service layer and REST API for DB-persisted tool execution metrics. Enables querying aggregated per-tool summaries and browsing execution history. Records tool executions to both the database and the in-memory MetricsRecorder (dual-write).

## Recording Tool Executions

After this feature is implemented, tool executions are recorded through `ToolMetricsService`:

```python
from nexus.tool_manager.services.tool_metrics_service import ToolMetricsService

# In a FastAPI endpoint or service with a DB session:
metrics_service = ToolMetricsService(session, current_user)

await metrics_service.record_tool_execution(
    namespaced_name="github::search_code",
    duration_ms=1500,
    status="success",
)

# Error case:
await metrics_service.record_tool_execution(
    namespaced_name="github::search_code",
    duration_ms=5000,
    status="error",
    error_message="Rate limit exceeded",
    error_code="RATE_LIMIT",
)
```

## Querying Tool Metrics

### Aggregated Summary (All Tools)

```bash
# All-time summary (fast path via UsageCounter)
curl http://localhost:8000/api/v1/tool_manager/metrics/tools

# Time-filtered summary (SQL aggregation path)
curl "http://localhost:8000/api/v1/tool_manager/metrics/tools?start_time=2026-03-01T00:00:00Z"

# Single tool
curl "http://localhost:8000/api/v1/tool_manager/metrics/tools?namespaced_name=github::search_code"
```

Example response:

```json
{
  "resources": [
    {
      "namespaced_name": "github::search_code",
      "total_executions": 150,
      "success_count": 140,
      "error_count": 8,
      "timeout_count": 2,
      "success_rate": 0.933,
      "avg_duration_ms": 1250.5,
      "last_execution_at": "2026-03-24T12:00:00Z"
    }
  ],
  "next": null,
  "prev": null,
  "total": null
}
```

### Execution History

```bash
# All executions (paginated, newest first)
curl http://localhost:8000/api/v1/tool_manager/metrics/executions

# Filter by status
curl "http://localhost:8000/api/v1/tool_manager/metrics/executions?status=error"

# Filter by tool and time range
curl "http://localhost:8000/api/v1/tool_manager/metrics/executions?namespaced_name=github::search_code&start_time=2026-03-24T00:00:00Z"

# Paginate
curl "http://localhost:8000/api/v1/tool_manager/metrics/executions?limit=10&cursor=<cursor_token>"
```

## Dual-Write Behavior

Every `record_tool_execution()` call:
1. Persists a `ToolExecution` record to PostgreSQL
2. Upserts the `UsageCounter` for the tool (atomic increment)
3. Emits `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS` to the spec 025 `MetricsRecorder`

If the database write fails, the MetricsRecorder emission still succeeds (best-effort persistence).

## Development

```bash
# Run tests
make test-all

# Run only tool metrics tests
uv run pytest tests/unit/tool_manager/services/test_tool_metrics_service.py -v
uv run pytest tests/integration/tool_manager/test_metrics_router.py -v

# Run quality checks
make format && make lint && make typecheck
```
