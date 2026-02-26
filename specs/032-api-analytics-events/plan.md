# Implementation Plan: API Analytics Events

**Branch**: `032-api-analytics-events` | **Date**: 2026-02-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/032-api-analytics-events/spec.md`

## Summary

Implement automatic analytics event collection for every Nexus API request via a lightweight ASGI middleware. The middleware captures endpoint paths, response times, HTTP status codes, and request payload sizes, then transmits events to Segment.com using the shared `AnalyticsClient` from feature 031-segment-analytics-integration. Health check and documentation endpoints are excluded. The system uses fire-and-forget transmission with zero impact on API response behavior.

## Technical Context

**Language/Version**: Python 3.12+
**Primary Dependencies**: FastAPI, Starlette (ASGI), Segment Analytics Python SDK (via AnalyticsClient from 031-segment)
**Storage**: N/A (no local persistence; fire-and-forget via Segment SDK)
**Testing**: pytest, pytest-asyncio, respx (for Segment API mocking)
**Target Platform**: Linux server (containerized deployment)
**Project Type**: single (monolithic service with modular components)
**Performance Goals**: <5% overhead on API response time (<1ms actual overhead per request)
**Constraints**: Fire-and-forget (no local persistence), must not affect API responses on failure, must not capture sensitive data
**Scale/Scope**: ~5,000 API requests/day per installation, ~500,000 events/day across 100 installations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Compliance

- [x] **I. Modular Architecture**: Analytics middleware implemented as an independent ASGI middleware class in `/src/nexus/telemetry/`. No hidden dependencies on route handlers or business logic.
- [x] **II. Test-Driven Development**: TDD approach — unit tests for event model validation, middleware behavior (exclusion, timing), and integration tests for Segment transmission.
- [x] **III. Explicit Configuration**: Excluded paths defined as an explicit constant. Analytics enabled/disabled via `AnalyticsSettings` (environment variable). No magic values.
- [x] **IV. Observability First**: Middleware emits structured logs via structlog for event emission success/failure. Debug logging shows all event properties.
- [x] **V. API Stability**: Event schema follows Pydantic model with semantic versioning. No public API endpoints added (middleware is internal infrastructure).

### Development Standards Compliance

**Code Architecture**:
- [x] **DRY Principle**: Reuses `AnalyticsClient.track()` from 031-segment — no duplicate Segment integration code
- [x] **SOLID Principles**:
  - Single Responsibility: `AnalyticsMiddleware` (request interception), `APICallEvent` (event data model) — separate concerns
  - Open/Closed: New excluded paths can be added without modifying middleware logic
  - Dependency Inversion: Middleware depends on `AnalyticsClient` abstraction, injected at construction
- [x] **Separation of Concerns**: Middleware isolated from business logic; route handlers are unaware of analytics
- [x] **Dependency Injection**: `AnalyticsClient` injected into middleware constructor; mock-able for testing
- [x] **Composition vs Inheritance**: Middleware uses composition (has-a `AnalyticsClient`), not inheritance

**API Specification Standards**:
- [x] **OpenAPI/AsyncAPI**: Not applicable — no new API endpoints exposed. Event contract defined as Pydantic model.
- [x] **Error Handling**: Middleware errors logged (structlog) but never propagated to API responses
- [x] **Versioning**: Event schema versioned via `context.app.version` in Segment payload

**Code Quality**:
- [x] **Linting/Formatting**: All code passes ruff linting
- [x] **Type Checking**: MyPy strict mode, all functions fully typed
- [x] **Test Coverage**: Minimum 90% coverage for middleware and event model
- [x] **CI Checks**: All CI checks pass before merge

**Code Style**:
- [x] **Naming**: Descriptive names (`AnalyticsMiddleware`, `APICallEvent`, `EXCLUDED_PATHS`)
- [x] **Constants**: Excluded paths as `EXCLUDED_PATHS` (UPPER_CASE)
- [x] **Documentation**: All public classes/methods documented with docstrings

### Workflow & Process Compliance

- [x] **Feature Branch**: Working on `032-api-analytics-events`
- [x] **Pull Requests**: All changes via PR with CI/CD checks
- [x] **Code Review**: Minimum one approval required
- [x] **Squash Merge**: Clean history for feature

### No Violations

All constitution requirements satisfied. No complexity justification needed.

## Project Structure

### Documentation (this feature)

```text
specs/032-api-analytics-events/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/nexus/
├── telemetry/                          # Telemetry module (from spec 030)
│   ├── __init__.py
│   ├── client.py                       # SegmentTelemetryClient (existing from 030)
│   ├── middleware.py                   # NEW: AnalyticsMiddleware (ASGI middleware)
│   └── events/
│       ├── __init__.py
│       ├── base.py                     # BaseTelemetryEvent (existing from 030)
│       ├── workflow_execution.py       # Workflow events (existing from 030)
│       ├── activity_execution.py       # Activity events (existing from 030)
│       └── api_call.py                 # NEW: APICallEvent (Pydantic model)
├── analytics/                          # Analytics module (from spec 031-segment)
│   ├── client.py                       # AnalyticsClient (existing from 031-segment)
│   └── ...
└── api/
    └── main.py                         # MODIFIED: Register AnalyticsMiddleware

tests/
├── unit/
│   └── telemetry/
│       ├── test_api_call_event.py      # NEW: APICallEvent model tests
│       └── test_analytics_middleware.py # NEW: Middleware unit tests
└── integration/
    └── telemetry/
        └── test_api_analytics.py       # NEW: End-to-end middleware tests
```

**Structure Decision**: Single project structure. The middleware lives in `/src/nexus/telemetry/` alongside the existing telemetry module from spec 030. The event model lives in `/src/nexus/telemetry/events/` following the established pattern. No new top-level modules are needed — this feature adds files to existing directories.

---

## Architecture Flow

### Request Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│ FastAPI Application                                              │
│                                                                  │
│  ┌────────────────────────────┐                                  │
│  │ Incoming HTTP Request      │                                  │
│  └──────────┬─────────────────┘                                  │
│             │                                                    │
│             ▼                                                    │
│  ┌────────────────────────────┐                                  │
│  │ AnalyticsMiddleware        │                                  │
│  │  1. Check excluded paths   │                                  │
│  │  2. Record start time      │                                  │
│  │  3. Intercept status code  │                                  │
│  └──────────┬─────────────────┘                                  │
│             │                                                    │
│             ▼                                                    │
│  ┌────────────────────────────┐                                  │
│  │ CORSMiddleware             │                                  │
│  └──────────┬─────────────────┘                                  │
│             │                                                    │
│             ▼                                                    │
│  ┌────────────────────────────┐                                  │
│  │ Route Handler              │                                  │
│  │  (business logic)          │                                  │
│  └──────────┬─────────────────┘                                  │
│             │                                                    │
│             ▼                                                    │
│  ┌────────────────────────────┐                                  │
│  │ Response sent to client    │                                  │
│  └──────────┬─────────────────┘                                  │
│             │                                                    │
│             ▼                                                    │
│  ┌────────────────────────────────────────────────────┐          │
│  │ AnalyticsMiddleware (post-response)                │          │
│  │  4. Calculate response_time_ms                     │          │
│  │  5. Extract endpoint from scope["path"]             │          │
│  │  6. Build APICallEvent                             │          │
│  │  7. Call AnalyticsClient.track() (fire-and-forget) │          │
│  └────────────────────────────────────────────────────┘          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Middleware Registration

In `src/nexus/api/main.py`:

```python
from nexus.telemetry.middleware import AnalyticsMiddleware

# Register analytics middleware (outermost = first to execute)
app.add_middleware(
    AnalyticsMiddleware,
    analytics_client=analytics_client,
)
```

Note: Middleware added via `app.add_middleware()` executes in reverse order of registration. The analytics middleware should be registered after CORS so it wraps the entire request lifecycle.

---

## Phase 0: Research

**Status**: Complete
**Output**: [research.md](./research.md)

### Research Tasks Completed

1. **Middleware Approach**: Pure ASGI middleware chosen over Starlette BaseHTTPMiddleware (performance, streaming compatibility)
2. **Endpoint Path Capture**: Use `scope["path"]` for raw request path (resource IDs are not PII)
3. **Health Check Exclusion**: Exclude `/health`, `/`, `/docs`, `/redoc`, `/openapi.json`
4. **Event Schema Design**: `APICallEvent` Pydantic model with 5 fields
5. **Performance Impact**: <0.04% overhead per request (enqueue-only, no I/O in request path)
6. **AnalyticsClient Reuse**: Direct reuse of `AnalyticsClient.track()` from 031-segment
7. **Request Payload Size**: Use `content-length` header (zero overhead)
8. **Status Code Capture**: Intercept `http.response.start` ASGI message

---

## Phase 1: Design & Contracts

**Status**: Complete
**Prerequisites**: `research.md` complete with all decisions resolved
**Outputs**: `data-model.md`, `quickstart.md`

### 1. Data Model Design

**Output**: [data-model.md](./data-model.md)

Single entity: `APICallEvent` with 5 fields:
- `endpoint` (string): Request path
- `http_method` (string): HTTP method
- `status_code` (integer): Response status code
- `response_time_ms` (integer): Duration in milliseconds
- `request_payload_size` (integer): Body size in bytes

### 2. API Contracts

No new API endpoints are exposed. The analytics middleware is internal infrastructure. The event contract is defined by the `APICallEvent` Pydantic model in `data-model.md`.

### 3. Quickstart Guide

**Output**: [quickstart.md](./quickstart.md)

7 validation scenarios covering: middleware registration, event fields, endpoint path capture, health check exclusion, privacy verification, error resilience, and unmatched routes.

---

## Phase 2: Task Generation

**Status**: Pending
**Output**: `tasks.md` (generated by `/speckit.tasks` command)

---

## Next Steps

1. **Review this plan**: Ensure technical approach aligns with the spec and related features (030, 031-segment)
2. **Generate tasks**: Run `/speckit.tasks` to create the actionable task breakdown
3. **Begin implementation**: Follow TDD workflow per constitution

## References

- **Parent SDP**: [ANSTRAT-1748](ANSTRAT-1748)
- **Segment Python SDK**: [github.com/segmentio/analytics-python](https://github.com/segmentio/analytics-python)
- **Related Specs**: [030-workflow-runtime-telemetry](../030-workflow-runtime-telemetry/spec.md), [031-segment-analytics-integration](../031-segment-analytics-integration/spec.md)
