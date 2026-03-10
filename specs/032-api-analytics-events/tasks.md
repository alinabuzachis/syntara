# Tasks: API Analytics Events

**Input**: Design documents from `/specs/032-api-analytics-events/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Included per constitution's TDD requirement (plan.md §Constitution Check II).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/nexus/`, `tests/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the directory structure and module scaffolding required by all user stories

- [X] T001 Create telemetry events package directory with `src/nexus/telemetry/__init__.py` and `src/nexus/telemetry/events/__init__.py`
- [X] T002 [P] Create test directory structure with `tests/unit/telemetry/__init__.py` and `tests/integration/telemetry/__init__.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core event model and excluded-paths constant that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Implement `APICallEvent` Pydantic model in `src/nexus/telemetry/events/api_call.py` with all 5 fields (endpoint, http_method, status_code, response_time_ms, request_payload_size), frozen config, Field validators, and `to_segment_properties()` method per data-model.md
- [X] T004 Define `EXCLUDED_PATHS` constant (`{"/health", "/", "/docs", "/redoc", "/openapi.json"}`) in `src/nexus/telemetry/middleware.py` (file created with constant only; middleware class added in US1)

**Checkpoint**: Foundation ready — event model importable and tested, excluded paths defined

---

## Phase 3: User Story 1 — Automatic API Request Analytics (Priority: P1) 🎯 MVP

**Goal**: Every non-excluded API request emits an analytics event with endpoint, response time, status code, and payload size

**Independent Test**: Make API requests to any Nexus endpoint and verify analytics events are generated with all required fields without affecting API response time or behavior

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T005 [P] [US1] Unit tests for `APICallEvent` model validation (valid construction, field constraints, frozen immutability, to_segment_properties output) in `tests/unit/telemetry/test_api_call_event.py`
- [X] T006 [P] [US1] Unit tests for `AnalyticsMiddleware` (event emission on normal request, status code capture from `http.response.start`, response time measurement via `time.monotonic`, request payload size from content-length header, excluded path skipping) in `tests/unit/telemetry/test_analytics_middleware.py`
- [X] T007 [P] [US1] Integration test for end-to-end middleware behavior with a real FastAPI test app: make requests, verify events emitted with correct fields, verify excluded paths produce no events, in `tests/integration/telemetry/test_api_analytics.py`

### Implementation for User Story 1

- [X] T008 [US1] Implement `AnalyticsMiddleware` ASGI middleware class in `src/nexus/telemetry/middleware.py`: constructor accepts `ASGIApp` and `AnalyticsClient`, `__call__` checks excluded paths, records `time.monotonic()` start, wraps `send` to capture status code from `http.response.start`, computes duration, reads content-length header, builds `APICallEvent`, calls `AnalyticsClient.track()` fire-and-forget after response
- [X] T009 [US1] Register `AnalyticsMiddleware` in `src/nexus/api/main.py` via `app.add_middleware()` after CORS middleware registration, passing the `AnalyticsClient` instance
- [X] T010 [US1] Add structlog logging in `src/nexus/telemetry/middleware.py`: debug log on successful event emission (`analytics_event_sent`), warning log on event emission failure (`analytics_event_failed`)

**Checkpoint**: At this point, every API request (except excluded paths) generates a complete analytics event. User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 — Privacy-Safe Event Collection (Priority: P2)

**Goal**: Analytics events contain only safe metadata — no credentials, PII, request/response bodies, query parameters, or header values

**Independent Test**: Make API requests with sensitive data (auth tokens, request bodies with PII, query parameters) and verify analytics events contain only endpoint path, status code, timing, and size

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T011 [P] [US2] Privacy unit tests in `tests/unit/telemetry/test_analytics_middleware.py`: verify events from requests with Authorization headers, query parameters, and JSON bodies contain only the 5 allowed fields (endpoint, http_method, status_code, response_time_ms, request_payload_size) and no header values, body content, or query parameter values
- [X] T012 [P] [US2] Privacy integration test in `tests/integration/telemetry/test_api_analytics.py`: end-to-end verification that requests with sensitive data produce events with only safe metadata

### Implementation for User Story 2

- [X] T013 [US2] Verify and enforce in `src/nexus/telemetry/middleware.py` that `scope["query_string"]` is never read, request body is never consumed, and only `scope["path"]`, `scope["method"]`, content-length header, and intercepted status code are used — add code comments documenting the privacy boundary

**Checkpoint**: Privacy guarantees verified. Events never leak sensitive data regardless of request content.

---

## Phase 5: User Story 3 — Event Transmission to Segment (Priority: P3)

**Goal**: Collected API analytics events are transmitted to Segment.com via fire-and-forget with batching, with no impact on API operation if transmission fails

**Independent Test**: Generate API analytics events and verify they are transmitted to Segment; simulate Segment failures and verify the API continues operating normally

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T014 [P] [US3] Unit tests for fire-and-forget behavior in `tests/unit/telemetry/test_analytics_middleware.py`: verify that when `AnalyticsClient.track()` raises an exception, the API response is unaffected and the failure is logged as a warning
- [X] T015 [P] [US3] Integration test for error resilience in `tests/integration/telemetry/test_api_analytics.py`: use a failing mock AnalyticsClient, make API requests, assert responses are normal (correct status codes, normal response times)

### Implementation for User Story 3

- [X] T016 [US3] Wrap `AnalyticsClient.track()` call in `src/nexus/telemetry/middleware.py` with try/except that catches all exceptions, logs the failure via structlog warning (`analytics_event_failed`), and never re-raises — ensuring FR-004 (no API impact) and FR-007 (log failures)

**Checkpoint**: All user stories are independently functional. Analytics events are collected, privacy-safe, and transmitted with zero API impact.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality checks and validation across all user stories

- [X] T017 Run `make format` and `make lint` to verify code formatting and linting pass for all new files
- [X] T018 Run `make typecheck` to verify mypy strict mode passes for all new files in `src/nexus/telemetry/`
- [X] T019 Run `make test-all` to verify all existing and new tests pass
- [X] T020 Run quickstart.md validation scenarios (Scenarios 1-7) against the running dev server

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) — core middleware implementation
- **User Story 2 (Phase 4)**: Depends on User Story 1 (Phase 3) — privacy verification builds on working middleware
- **User Story 3 (Phase 5)**: Depends on User Story 1 (Phase 3) — error resilience builds on working middleware
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — no dependencies on other stories
- **User Story 2 (P2)**: Depends on US1 — privacy tests verify the middleware's data handling
- **User Story 3 (P3)**: Depends on US1 — error resilience tests verify the middleware's failure handling
- **User Story 2 and 3**: Can run in parallel once US1 is complete (they modify different aspects of the same middleware)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation follows test guidance
- Story complete before moving to next priority

### External Dependency

- **AnalyticsClient** from feature 031-segment-analytics-integration must be available. If not yet implemented, US1 tests should use a mock/protocol that matches the expected `track(properties: dict)` interface.

### Parallel Opportunities

- T001 and T002 can run in parallel (different directories)
- T005, T006, T007 can run in parallel (different test files)
- T011 and T012 can run in parallel (different test files)
- T014 and T015 can run in parallel (different test files)
- US2 and US3 can run in parallel after US1 completes

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit tests for APICallEvent model in tests/unit/telemetry/test_api_call_event.py"
Task: "Unit tests for AnalyticsMiddleware in tests/unit/telemetry/test_analytics_middleware.py"
Task: "Integration test for middleware in tests/integration/telemetry/test_api_analytics.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (event model + excluded paths)
3. Complete Phase 3: User Story 1 (middleware + registration + logging)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Privacy verified
4. Add User Story 3 → Test independently → Error resilience verified
5. Each story adds confidence without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The `AnalyticsClient` dependency may need a mock/protocol if 031-segment-analytics-integration is not yet implemented
