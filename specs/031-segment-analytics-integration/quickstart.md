# Quickstart: Segment Analytics Integration (Periodic Metrics)

**Feature**: 031-segment-analytics-integration
**Date**: 2026-02-12
**Purpose**: Validation scenarios for testing the analytics integration

---

## Prerequisites

1. Nexus development environment running (`make dev`)
2. Test database with sample data (workflows, executions, credentials)
3. Segment write key configured (or mock for testing)

---

## Validation Scenarios

### Scenario 1: Analytics Configuration Loading

**Goal**: Verify analytics settings are correctly loaded from environment/config.

**Steps**:
```bash
# 1. Set environment variables
export ANALYTICS_ENABLED=true
export ANALYTICS_SEGMENT_WRITE_KEY=test_key_abc123

# 2. Start the application
make dev

# 3. Check logs for configuration loading
# Expected: "analytics_collector_started" with interval_seconds=300
```

**Expected Result**:
- Settings are loaded from environment
- Default values used when not specified
- Logs show fixed 300s interval

---

### Scenario 2: Database Aggregation Queries

**Goal**: Verify database queries return correct current-state aggregates.

**Steps**:
```python
# Setup: Create test data
# - 10 workflows (7 enabled, 3 disabled)
# - 5 credentials
# - 20 executions (15 completed, 3 failed, 2 running)
# - 50 model invocations across 2 models

# Run queries
from nexus.analytics.queries import (
    query_workflow_counts,
    query_credential_counts,
    query_execution_counts,
    query_model_usage,
)

async with get_session() as session:
    workflows = await query_workflow_counts(session)
    credentials = await query_credential_counts(session)
    executions = await query_execution_counts(session)
    models = await query_model_usage(session)

print(f"Workflows: {workflows}")
print(f"Credentials: {credentials}")
print(f"Executions: {executions}")
print(f"Models: {models}")
```

**Expected Result**:
```json
{
  "workflows": {"total": 10, "enabled": 7, "disabled": 3},
  "credentials": {"total": 5},
  "executions": {"total": 20, "completed": 15, "failed": 3, "running": 2, "avg_duration_seconds": 125.3},
  "model_usage": {"gpt-4": {"calls": 30, "input_tokens": 15000, "output_tokens": 5000}}
}
```

---

### Scenario 3: AnalyticsClient Event Tracking

**Goal**: Verify events are sent to Segment correctly.

**Steps**:
```python
from nexus.analytics.client import AnalyticsClient
from nexus.core.config import get_settings

# entitlement_id is loaded from DB (created during product registration)
settings = get_settings()
entitlement_id = settings.entitlement_id

# Initialize client
client = AnalyticsClient(settings, entitlement_id)

# Track a test event
client.track("system_analytics", {
    "entitlement_id": entitlement_id,
    "workflows": {"total": 10, "enabled": 7},
    "credentials": {"total": 5},
    "executions": {"total": 20, "avg_duration_seconds": 125.3},
    "model_usage": {},
    "config": {"feature_flags_enabled": ["agent_v2"]},
})

# Flush to ensure delivery
client.flush()
```

**Expected Result**:
- No exceptions raised
- Event logged (in debug mode)
- If using real Segment key, event appears in Segment debugger

---

### Scenario 4: Periodic Collection Loop

**Goal**: Verify collector runs at the fixed interval.

**Steps**:
```bash
# 1. Start application with debug logging
LOG_LEVEL=DEBUG make dev

# 2. Wait and observe logs
# Expected: "analytics_event_sent" every 300 seconds (5 minutes)
```

**Expected Result**:
- First event sent after initial interval
- Subsequent events sent at regular intervals
- Events contain current database state (stateless snapshots)

---

### Scenario 5: Graceful Shutdown

**Goal**: Verify pending events are flushed on shutdown.

**Steps**:
```bash
# 1. Start application
make dev

# 2. Trigger analytics event (wait for interval or manually trigger)

# 3. Send SIGTERM
kill -TERM <pid>

# 4. Check logs
# Expected: "analytics_collector_stopped" after flushing
```

**Expected Result**:
- Collector stops gracefully
- Pending events flushed to Segment
- No data loss on shutdown

---

### Scenario 6: Error Handling - Database Failure

**Goal**: Verify analytics continues after query failures.

**Steps**:
```python
# Simulate database failure during analytics collection
# Expected: Error logged, but collector continues on next cycle
```

**Expected Result**:
- Error logged as warning
- Collector loop continues
- Application remains healthy

---

### Scenario 7: Disabled Analytics

**Goal**: Verify analytics can be disabled completely.

**Steps**:
```bash
# 1. Disable analytics
export ANALYTICS_ENABLED=false

# 2. Start application
make dev

# 3. Check logs
# Expected: "analytics_collection_disabled"
```

**Expected Result**:
- No background task started
- No database queries for analytics
- Zero performance impact

---

## Integration Test Commands

```bash
# Run all analytics unit tests
make test TESTS=tests/unit/analytics/

# Run analytics integration tests
make test TESTS=tests/integration/analytics/

# Run with coverage
make test-cov TESTS=tests/unit/analytics/
```

---

## Troubleshooting

### Event not appearing in Segment

1. Check `ANALYTICS_SEGMENT_WRITE_KEY` is set correctly
2. Verify `ANALYTICS_ENABLED=true`
3. Check network connectivity to Segment API
4. Review logs for SDK errors

### High database load from analytics

1. Check query execution plans for missing indexes
2. Consider read replica for analytics queries

### EntitlementId changes unexpectedly

1. Check database connectivity
2. Verify `entitlement_id` table exists and has data
3. Check database migrations are up to date

---

## Manual Verification Checklist

- [ ] Analytics settings load from environment
- [ ] EntitlementId loaded from DB (created by product registration)
- [ ] Workflow counts match database
- [ ] Credential counts match database
- [ ] Execution counts match database
- [ ] Model usage aggregates correctly
- [ ] Feature flags included in events
- [ ] Events appear in Segment debugger
- [ ] Graceful shutdown flushes events
- [ ] Disabling analytics works
- [ ] Database failures handled gracefully
- [ ] No PII in event payloads
