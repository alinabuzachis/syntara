# Data Model: API Analytics Events

**Feature**: 032-api-analytics-events
**Date**: 2026-02-25
**Status**: Design Phase

This document defines the data structures for per-request API analytics events transmitted to Segment.com. Events follow the Segment Track API format and reuse the `AnalyticsClient` from feature 031-segment-analytics-integration.

---

## Contract Strategy

**Pydantic Models = Source of Truth**

API analytics events are defined as Pydantic models in `/src/nexus/telemetry/events/`. This follows the same strategy established by feature 030-workflow-runtime-telemetry.

**Schema Consistency Rule**:
All event fields are always present in the payload. No optional/conditional keys — every field has a value for every event. This prevents schema validation failures in Segment.

---

## Core Entity

### APICallEvent

**Purpose**: Captures analytics for a single API request.

**Event Name**: `"API Call Executed"` (Title Case per Segment convention)

**Fields**:

| Field Name | Type | Required | Description | Validation Rules |
|---|---|---|---|---|
| `endpoint` | string | Yes | Request path as-is, including resource IDs | Non-empty; e.g., `/api/v1/workflows/550e8400-e29b-41d4-a716-446655440000` |
| `http_method` | string | Yes | HTTP request method | Must be one of: `"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"`, `"OPTIONS"`, `"HEAD"` |
| `status_code` | integer | Yes | HTTP response status code | Range 100-599 |
| `response_time_ms` | integer | Yes | Response time in milliseconds | Minimum 0 |
| `request_payload_size` | integer | Yes | Request body size in bytes from Content-Length header; 0 when absent | Minimum 0 |

**Validation Rules**:
- `endpoint` is the actual request path (e.g., `/api/v1/workflows/550e8400-e29b-41d4-a716-446655440000`). Resource IDs are not considered PII, consistent with other telemetry specs.
- `response_time_ms` measured using `time.monotonic()` for precision; converted to integer milliseconds
- `request_payload_size` derived from the `content-length` request header; defaults to `0` for requests without a body or with chunked transfer encoding

**Example Payload**:
```json
{
  "userId": "ent-550e8400-e29b-41d4-a716-446655440000",
  "event": "API Call Executed",
  "timestamp": "2026-02-25T14:30:05.200Z",
  "properties": {
    "endpoint": "/api/v1/workflows/550e8400-e29b-41d4-a716-446655440000",
    "http_method": "GET",
    "status_code": 200,
    "response_time_ms": 45,
    "request_payload_size": 0
  },
  "context": {
    "app": {
      "name": "nexus",
      "version": "1.0.0"
    }
  }
}
```

**Additional Examples**:

POST with body:
```json
{
  "userId": "ent-550e8400-e29b-41d4-a716-446655440000",
  "event": "API Call Executed",
  "properties": {
    "endpoint": "/api/v1/invocations",
    "http_method": "POST",
    "status_code": 202,
    "response_time_ms": 120,
    "request_payload_size": 1524
  }
}
```

Server error:
```json
{
  "userId": "ent-550e8400-e29b-41d4-a716-446655440000",
  "event": "API Call Executed",
  "properties": {
    "endpoint": "/api/v1/credentials/a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "http_method": "DELETE",
    "status_code": 500,
    "response_time_ms": 8,
    "request_payload_size": 0
  }
}
```

Unmatched route (404):
```json
{
  "userId": "ent-550e8400-e29b-41d4-a716-446655440000",
  "event": "API Call Executed",
  "properties": {
    "endpoint": "/api/v1/nonexistent",
    "http_method": "GET",
    "status_code": 404,
    "response_time_ms": 2,
    "request_payload_size": 0
  }
}
```

---

## Pydantic Model Definition

```python
from typing import Literal

from sqlmodel import Field, SQLModel


class APICallEvent(SQLModel):
    """Analytics event for a single API request."""

    model_config = {"frozen": True}

    endpoint: str = Field(
        min_length=1,
        description="Request path including resource IDs",
    )
    http_method: Literal["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] = Field(
        description="HTTP request method",
    )
    status_code: int = Field(
        ge=100,
        le=599,
        description="HTTP response status code",
    )
    response_time_ms: int = Field(
        ge=0,
        description="Response time in milliseconds",
    )
    request_payload_size: int = Field(
        ge=0,
        description="Request body size in bytes from Content-Length header",
    )

    def to_segment_properties(self) -> dict:
        return {
            "userId": self.entitlement_id,
            "event": "api_event",
            "properties": self.model_dump(),
        }
```

---

## Excluded Endpoints

The following endpoints are excluded from analytics event collection (FR-005):

| Path | Reason |
|---|---|
| `/health` | Health check / readiness probe |
| `/` | Root informational endpoint |
| `/docs` | Swagger UI |
| `/redoc` | ReDoc UI |
| `/openapi.json` | OpenAPI schema |

These are not business API endpoints and would generate noise in analytics data.

---

## Privacy & Sanitization Rules

### Data Included

| Field | Privacy Impact | Notes |
|---|---|---|
| `endpoint` | Safe | Request path with resource IDs; IDs are not PII (consistent with other telemetry specs) |
| `http_method` | Safe | Standard HTTP method string |
| `status_code` | Safe | Integer status code only |
| `response_time_ms` | Safe | Raw duration; no sensitive timing information |
| `request_payload_size` | Safe | Size in bytes only; no body content |

### Data NOT Included

- Request/response bodies
- Query parameter names or values
- Header values (including authentication tokens)
- Client IP addresses
- User identifiers
- Error details or stack traces

---

## Trigger Point & Integration

### Where the Event Is Triggered

The `APICallEvent` is emitted by `AnalyticsMiddleware`, a pure ASGI middleware registered in the FastAPI application setup at `src/nexus/api/main.py`:

```python
# src/nexus/api/main.py — alongside existing CORSMiddleware registration
from nexus.telemetry.middleware import AnalyticsMiddleware

app.add_middleware(
    AnalyticsMiddleware,
    analytics_client=analytics_client,
)
```

The middleware itself lives at `src/nexus/telemetry/middleware.py`. It intercepts every HTTP request, measures timing, captures the status code from the ASGI `http.response.start` message, and emits the event **after** the response has been sent to the client:

```python
# In AnalyticsMiddleware (src/nexus/telemetry/middleware.py), after response is sent:
event = APICallEvent(
    endpoint=endpoint,
    http_method=method,
    status_code=status_code,
    response_time_ms=duration_ms,
    request_payload_size=payload_size,
)
self._client.track(event.to_segment_properties())
```

### AnalyticsClient Responsibilities

The `AnalyticsClient` (from feature 031-segment-analytics-integration) handles:
- Adding `entitlement_id` to the properties
- Setting `userId` for Segment
- Fire-and-forget error handling
- SDK batching and transmission

---

## Data Volume Estimates

See the consolidated estimates in [030-workflow-runtime-telemetry/data-model.md](../030-workflow-runtime-telemetry/data-model.md#data-volume-estimates).

**Per-installation summary**:
- Estimated 5,000 API requests/day per installation (excluding health checks)
- Event size: ~400 bytes per event
- Daily bandwidth per installation: ~2 MB uncompressed, ~200-400 KB compressed

---

## Schema Evolution Strategy

Same strategy as the other telemetry specs (see [030-workflow-runtime-telemetry/data-model.md](../030-workflow-runtime-telemetry/data-model.md)).
