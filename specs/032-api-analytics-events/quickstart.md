# API Analytics Events - Quickstart

## Overview

This feature adds automatic analytics event collection for every Nexus API request. A lightweight ASGI middleware captures endpoint paths, response times, status codes, and payload sizes, then transmits them to Segment.com via the shared `AnalyticsClient`.

Analytics is enabled by default and requires no additional configuration beyond the Segment write key (shared with features 030 and 031-segment).

## Validation Scenarios

### Scenario 1: Middleware Registration

**Purpose**: Verify the analytics middleware is registered and active.

**Steps**:
1. Start the Nexus development server
2. Make any API request (e.g., `GET /api/v1/workflows`)
3. Check application logs for analytics event emission

**Expected**:
- Log entry: `analytics_event_sent` with `event="API Call Executed"`
- No errors in logs related to analytics

---

### Scenario 2: Event Fields

**Purpose**: Verify all required fields are present in the emitted event.

**Steps**:
1. Make a POST request with a JSON body to `/api/v1/invocations`
2. Inspect the analytics event properties (via debug logging or Segment debugger)

**Expected**:
```json
{
  "endpoint": "/api/v1/invocations",
  "http_method": "POST",
  "status_code": 202,
  "response_time_ms": 120,
  "request_payload_size": 1524
}
```

All five fields must be present with non-null values.

---

### Scenario 3: Endpoint Path Capture

**Purpose**: Verify that endpoint paths include actual resource IDs.

**Steps**:
1. Create a workflow and note its ID (e.g., `550e8400-e29b-41d4-a716-446655440000`)
2. Make a request: `GET /api/v1/workflows/550e8400-e29b-41d4-a716-446655440000`
3. Inspect the analytics event

**Expected**:
- `endpoint` is `/api/v1/workflows/550e8400-e29b-41d4-a716-446655440000` (the actual path)
- Resource IDs are included — they are not considered PII

---

### Scenario 4: Health Check Exclusion

**Purpose**: Verify health checks don't generate analytics events.

**Steps**:
1. Make a request to `GET /health`
2. Make a request to `GET /`
3. Check logs for analytics events

**Expected**:
- No analytics events for `/health` or `/`
- No errors related to excluded paths

---

### Scenario 5: Privacy Verification

**Purpose**: Verify no sensitive data appears in analytics events.

**Steps**:
1. Make a request with an `Authorization` header
2. Make a request with a JSON body containing user data
3. Make a request with query parameters (e.g., `?name=John&token=secret`)
4. Inspect all generated analytics events

**Expected**:
- No header values in events
- No request body content (only `request_payload_size` in bytes)
- No query parameter names or values
- No path parameter values (only `{param}` templates)

---

### Scenario 6: Error Resilience

**Purpose**: Verify analytics failures don't affect API operation.

**Steps**:
1. Configure an invalid Segment write key or disable analytics
2. Make API requests
3. Verify API responses are normal

**Expected**:
- API requests succeed with normal response times
- Analytics failures logged as warnings (not errors)
- No impact on HTTP status codes or response bodies

---

### Scenario 7: Unmatched Routes

**Purpose**: Verify 404 responses still generate analytics events.

**Steps**:
1. Make a request to a nonexistent endpoint: `GET /api/v1/nonexistent`
2. Inspect the analytics event

**Expected**:
- Event generated with `status_code: 404`
- `endpoint` is the requested path

---

## Development Setup

### Running Tests

```bash
# Unit tests for analytics middleware
make test-unit module=telemetry

# Integration tests
make test-integration module=telemetry

# All tests
make test-all
```

### Debug Logging

Enable debug-level logging to see all analytics events:

```bash
NEXUS_LOG_LEVEL=DEBUG make run
```

Look for log entries with:
- `analytics_event_sent` — successful event emission
- `analytics_event_failed` — failed event emission (with error details)

### Segment Debugger

Use the [Segment Debugger](https://app.segment.com/) to verify events are arriving at the Segment endpoint with the correct schema.

## References

- [Feature Spec](./spec.md)
- [Research](./research.md)
- [Data Model](./data-model.md)
- [030 Workflow Runtime Telemetry](../030-workflow-runtime-telemetry/spec.md)
- [031 Segment Analytics Integration](../031-segment-analytics-integration/spec.md)
