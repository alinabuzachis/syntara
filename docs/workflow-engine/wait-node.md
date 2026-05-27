# Wait Node

## Overview

The **Wait node** is a control-flow node that pauses workflow execution for a specified duration before continuing to the next node. It uses a Temporal durable timer internally, meaning the wait survives workflow replays, worker restarts, and deployments.

## Configuration

The wait node accepts a duration split into four fields:

| Field     | Type    | Range   | Default | Description              |
|-----------|---------|---------|---------|--------------------------|
| `days`    | integer | 0+      | 0       | Number of days to wait   |
| `hours`   | integer | 0–23    | 0       | Number of hours to wait  |
| `minutes` | integer | 0–59    | 0       | Number of minutes to wait|
| `seconds` | integer | 0–59    | 0       | Number of seconds to wait|

The total duration must be greater than zero. All fields must be non-negative integers.

### Example

```yaml
nodes:
  - id: wait_before_retry
    type: wait
    config:
      days: 0
      hours: 1
      minutes: 30
      seconds: 0

edges:
  - from: previous_node
    to: wait_before_retry
  - from: wait_before_retry
    to: next_node
```

This pauses the workflow for 1 hour and 30 minutes before proceeding to `next_node`.

## Edge Routing

The wait node uses default edge routing (no explicit output ports). After the wait duration elapses, execution continues to the next connected node via standard edges.

## Execution Flow

1. **Async completion activity** — The `wait` Temporal activity validates the duration config, then calls `activity.raise_complete_async()`. This puts the activity in STARTED state, deferring completion to an external call.
2. **Durable timer** — The workflow engine sleeps for the computed duration using `workflow.sleep()`, which creates a Temporal durable timer that survives worker restarts without consuming resources.
3. **Completion** — After the timer fires, a local activity completes the async wait activity via the Temporal client. The node returns `status: "completed"`.

## Result Schema

On success:

```json
{
  "status": "completed"
}
```

On configuration error, the activity raises a non-retryable `ApplicationError` with `type="ConfigError"`:

```
ApplicationError("Total wait duration must be greater than zero", type="ConfigError", non_retryable=True)
```

## Validation Rules

- All four fields (`days`, `hours`, `minutes`, `seconds`) must be non-negative integers
- The total duration (`days*86400 + hours*3600 + minutes*60 + seconds`) must be > 0
- Float, string, or null values are rejected with a `ConfigError`

## Maximum Duration

The maximum total wait duration is controlled by the global setting:

- **Key**: `workflow_engine.max_wait_duration_seconds`
- **Default**: 2,592,000 seconds (30 days)
- **Changeable by**: Admins via the Settings UI or API

If a wait node's configured duration exceeds this limit, the activity fails with a non-retryable `ConfigError`.

## Limitations

- **Interval-only** — Only duration-based waiting is supported. Waiting until a specific date/time (`specified_time`) is deferred to a future release due to timezone and `workflow.now()` edge cases.
- **Skip mechanism** — The ability to skip a waiting node early is not yet implemented. It depends on activity signaling infrastructure that is being redesigned (see PR #960).

## Related Files

| File | Purpose |
|------|---------|
| `src/nexus/schemas/workflows/v2/control-nodes/wait.schema.json` | JSON Schema for config and result |
| `src/nexus/schemas/workflows/v2/catalog/node_type_catalog.json` | Node type registry entry |
| `src/nexus/workflows/workflow_engine/activities/wait_activity.py` | Async completion activity + local completion activity |
| `src/nexus/workflows/workflow_engine/dynamic_workflow.py` | Workflow dispatch and durable timer |
| `src/nexus/workflows/workflow_engine/services/activity_sync_service.py` | WAITING status handling |
| `tests/unit/workflows/workflow_engine/activities/test_wait_activity.py` | Unit tests |
