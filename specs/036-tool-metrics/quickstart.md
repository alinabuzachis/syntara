# Quickstart: Tool-Specific Metric Types

**Feature Branch**: `036-tool-metrics`
**Date**: 2026-03-23

## What This Feature Does

Adds a `TOOL` metric category to the Nexus metrics infrastructure so that MCP tool execution duration and status can be recorded and queried through the existing REST API and Prometheus/OpenMetrics endpoint.

## Recording Tool Metrics

After this feature is implemented, tool metrics can be recorded through `MetricsRecorder`:

```python
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

recorder = MetricsRecorder()

# Record a tool execution duration (coupled: updates both histogram and counter)
recorder.record(
    metric_type=MetricType.TOOL_EXECUTION_DURATION,
    value=1500.0,  # milliseconds
    unit="ms",
    labels={
        "namespaced_name": "github::search_code",
        "status": "success",
    },
)

# Record a tool execution status only (updates counter only)
recorder.record(
    metric_type=MetricType.TOOL_EXECUTION_STATUS,
    value=1.0,
    unit="count",
    labels={
        "namespaced_name": "github::search_code",
        "status": "error",
    },
)
```

## Querying Tool Metrics

### REST API

```bash
# Get all tool metrics
curl http://localhost:8000/api/v1/metrics?category=tool

# Get tool metrics in a time range
curl "http://localhost:8000/api/v1/metrics?category=tool&start_time=2026-03-23T00:00:00Z"
```

### Prometheus/OpenMetrics

```bash
# Scrape OpenMetrics endpoint
curl http://localhost:8000/api/v1/metrics/openmetrics
```

Expected output includes:

```
# HELP nexus_tool_executions_total Total tool executions
# TYPE nexus_tool_executions_total counter
nexus_tool_executions_total{namespaced_name="github::search_code",status="success"} 1.0

# HELP nexus_tool_execution_duration_seconds Tool execution duration in seconds
# TYPE nexus_tool_execution_duration_seconds histogram
nexus_tool_execution_duration_seconds_bucket{namespaced_name="github::search_code",le="0.1"} 0.0
nexus_tool_execution_duration_seconds_bucket{namespaced_name="github::search_code",le="0.25"} 0.0
nexus_tool_execution_duration_seconds_bucket{namespaced_name="github::search_code",le="0.5"} 0.0
nexus_tool_execution_duration_seconds_bucket{namespaced_name="github::search_code",le="1.0"} 0.0
nexus_tool_execution_duration_seconds_bucket{namespaced_name="github::search_code",le="2.5"} 1.0
...
```

## Status Values

| Value | Meaning |
|-------|---------|
| `"success"` | No exception raised — tool completed normally |
| `"error"` | Non-timeout exception — tool-side or unexpected failure |
| `"timeout"` | Timeout or connection exception — infrastructure failure |

## Label Defaults

The `status` label defaults to `"unknown"` if omitted. The `namespaced_name` label is mandatory:

```python
# status is defaulted when absent; namespaced_name is required
recorder.record(
    metric_type=MetricType.TOOL_EXECUTION_DURATION,
    value=500.0,
    unit="ms",
    labels={
        "namespaced_name": "github::search_code",
        # status defaults to "unknown"
    },
)
```

## Development

```bash
# Run tests
make test-all

# Run only metrics unit tests
uv run pytest tests/unit/metrics/ -v

# Run quality checks
make format && make lint && make typecheck
```
