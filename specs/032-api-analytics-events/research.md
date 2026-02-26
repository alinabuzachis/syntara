# Research: API Analytics Events

**Feature**: 032-api-analytics-events
**Date**: 2026-02-25
**Purpose**: Document research findings and design decisions for per-request API analytics

---

## 1. Middleware Approach

### Decision

Use a **pure ASGI middleware** (not Starlette `BaseHTTPMiddleware`) to intercept API requests and emit analytics events.

### Rationale

- ASGI middleware operates at the lowest level, capturing all HTTP requests before routing
- No dependency on Starlette internals or its `BaseHTTPMiddleware` (which has known issues with streaming responses and exception handling)
- Minimal overhead: just wraps the ASGI call, measures timing, and emits an event after the response is sent
- Follows the same pattern as the existing `CORSMiddleware` registration via `app.add_middleware()`

### Alternatives Considered

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **ASGI middleware** | Lowest overhead, full control, no Starlette issues | Must handle ASGI protocol directly | **Chosen** |
| **Starlette BaseHTTPMiddleware** | Simple API, easy to write | Known streaming/exception issues, extra overhead from request body reading | Rejected |
| **FastAPI dependency** | Familiar pattern, per-route | Requires adding to every route, not centralized | Rejected |
| **FastAPI event handlers** | Built-in hooks | No per-request granularity | Rejected |

### Implementation Notes

```python
class AnalyticsMiddleware:
    """ASGI middleware that emits analytics events for API requests."""

    def __init__(self, app: ASGIApp, analytics_client: AnalyticsClient, excluded_paths: set[str]):
        self.app = app
        self._client = analytics_client
        self._excluded_paths = excluded_paths

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        # ... timing + event emission logic
```

---

## 2. Endpoint Path Capture

### Decision

Use the raw request path from `scope["path"]` directly (e.g., `/api/v1/workflows/550e8400-e29b-41d4-a716-446655440000`). Resource IDs are included as-is — they are not considered PII, consistent with the other telemetry specs (030, 031-segment).

### Rationale

- Resource IDs (UUIDs, numeric IDs) are internal system identifiers, not user-identifying information
- Keeping raw paths provides more useful analytics — analysts can identify specific resource access patterns
- Consistent with spec 030 which includes `workflow_hash` and `correlation_id` (both resource-level identifiers) without anonymization
- Simpler implementation: just read `scope["path"]`, no route template extraction needed

### Implementation Notes

```python
# After response is sent:
endpoint = scope["path"]  # e.g., "/api/v1/workflows/550e8400-..."
```

---

## 3. Health Check Exclusion

### Decision

Exclude the `/health` endpoint (and the root `/` endpoint) from analytics by maintaining a set of excluded path prefixes checked before event emission.

### Rationale

- The `/health` endpoint is the only health/readiness endpoint in the codebase (no `/readiness` or `/liveness` exists)
- The root `/` endpoint is informational and not a business API
- Checking against a small set is O(1) and adds negligible overhead
- Configurable via the excluded paths set passed to the middleware

### Implementation Notes

```python
EXCLUDED_PATHS = {"/health", "/", "/docs", "/redoc", "/openapi.json"}
```

---

## 4. Event Schema Design

### Decision

Define a `APICallEvent` as a frozen Pydantic model following the same pattern as spec 030's workflow telemetry events. Event name: `"API Call Executed"` (Title Case per Segment convention).

### Rationale

- Consistent with the project convention of using `SQLModel` for all data models (per constitution)
- Fields match the spec requirements: endpoint path, response time in milliseconds, HTTP status code, request payload size
- `to_segment_event()` method converts to Segment Track API format, matching the pattern in `WorkflowExecutionCompletedEvent`

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `endpoint` | `str` | Request path (e.g., `/api/v1/workflows/550e8400-...`) |
| `http_method` | `str` | HTTP method (GET, POST, PUT, DELETE, PATCH) |
| `status_code` | `int` | HTTP response status code |
| `response_time_ms` | `int` | Response time in milliseconds |
| `request_payload_size` | `int` | Request body size in bytes (0 for GET/DELETE) |

### Implementation Notes

- `http_method` is included because endpoint popularity analysis needs to distinguish `GET /workflows` from `POST /workflows`
- `response_time_ms` is an integer (millisecond precision is sufficient for API latency analysis)
- Timestamp is not a field — Segment SDK adds it automatically

---

## 5. Performance Impact

### Decision

The middleware adds <1ms overhead per request (well within the <5% NFR-001 requirement).

### Rationale

The middleware performs three operations per request:
1. **Before request**: Record `time.monotonic()` start time (~0ns)
2. **After response**: Compute duration, extract route pattern, build event dict (~0.01ms)
3. **Emit event**: Call `analytics.track()` which just enqueues to an in-memory queue (~0.01ms)

Total overhead: ~0.02ms per request. For a typical API response time of 50-200ms, this is <0.04% overhead.

The Segment SDK handles actual HTTP transmission in a background thread with batching (default: 100 events or 500ms), so no network I/O occurs in the request path.

### Validation Approach

- Unit test: Measure middleware overhead with mock analytics client
- Integration test: Compare response times with and without middleware enabled

---

## 6. AnalyticsClient Reuse

### Decision

Reuse the `AnalyticsClient` from 031-segment-analytics-integration. The API analytics middleware calls `AnalyticsClient.track()` for each request event.

### Rationale

- `AnalyticsClient.track(event_name, properties)` already provides the exact interface needed
- Fire-and-forget semantics are built in (exceptions caught and logged)
- `entitlement_id` is resolved once at client initialization and included in every event
- No need for a separate telemetry client — the existing one handles batching, error handling, and graceful shutdown

### Integration Pattern

```python
# In middleware:
self._client.track("API Call Executed", event.model_dump())
```

---

## 7. Request Payload Size Measurement

### Decision

Use the `content-length` header when available. When not available (chunked transfer encoding), use `0` as the payload size.

### Rationale

- Reading the actual request body to measure size would introduce significant overhead and interfere with streaming
- The `content-length` header is present for most API requests (JSON bodies with known size)
- For chunked transfers (rare in REST APIs), reporting `0` is acceptable since we're measuring typical usage patterns, not exact byte counts
- This approach has zero overhead — just a header lookup

### Implementation Notes

```python
request_payload_size = int(scope.get("headers", {}).get(b"content-length", b"0"))
```

---

## 8. Captured Status Code

### Decision

Capture the HTTP status code from the ASGI response by intercepting the `http.response.start` message.

### Rationale

- The ASGI protocol sends the status code in the `http.response.start` message before the body
- Intercepting `send()` to capture this message is the standard ASGI pattern
- No need to read or buffer the response body

### Implementation Notes

```python
status_code = 0

async def send_wrapper(message: Message) -> None:
    nonlocal status_code
    if message["type"] == "http.response.start":
        status_code = message["status"]
    await send(message)
```

---

## References

- [Segment Python SDK](https://segment.com/docs/connections/sources/catalog/libraries/server/python/)
- [ASGI Specification](https://asgi.readthedocs.io/)
- [Starlette Middleware](https://starlette.dev/middleware/)
- [ANSTRAT-1748](ANSTRAT-1748)
