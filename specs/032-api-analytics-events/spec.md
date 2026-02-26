# Feature Specification: API Analytics Events

**Feature Branch**: `032-api-analytics-events`
**Created**: 2026-02-18
**Status**: Draft
**Input**: SDP ANSTRAT-1748 - Agentic Automation - Instrumentation / Telemetry / Observability
**Jira**: [ANSTRAT-1748](ANSTRAT-1748)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic API Request Analytics (Priority: P1)

As a Red Hat product analyst, the system automatically captures analytics events for every API request so that I can understand API usage patterns, identify popular endpoints, and detect error trends across Nexus installations.

**Why this priority**: This is the core functionality. Without API request event capture, no API usage insights can be generated. This covers the `api_call` event type defined in ANSTRAT-1748.

**Independent Test**: Can be fully tested by making API requests to any Nexus endpoint and verifying that analytics events are generated with the required fields (endpoint, response time, status code, payload size) without affecting API response time or behavior.

**Acceptance Scenarios**:

1. **Given** any API request is received, **When** the request completes (success or failure), **Then** an analytics event is generated with the endpoint path, response time in milliseconds, status code, and request payload size
2. **Given** an API request fails with a server error, **When** the failure is recorded, **Then** the analytics event captures the error status code without including error details or stack traces
3. **Given** analytics event generation fails, **When** the failure occurs, **Then** the API request continues unaffected and the failure is logged

---

### User Story 2 - Privacy-Safe Event Collection (Priority: P2)

As a Nexus platform operator, analytics events must not contain any sensitive information (credentials, PII, request/response bodies, query parameters) so that data privacy requirements from ANSTRAT-1748 are met.

**Why this priority**: Privacy compliance is essential for any data leaving the installation. The system must exclude sensitive data (credentials, PII, request/response bodies) before transmission, conforming to ANSTRAT-1748 privacy requirements.

**Independent Test**: Can be tested by making API requests with sensitive data (authentication tokens, request bodies with PII) and verifying that analytics events contain only safe metadata (endpoint path, status code, timing, size) with no sensitive content.

**Acceptance Scenarios**:

1. **Given** an API request includes authentication headers, **When** the analytics event is generated, **Then** the event does not contain any authentication tokens, API keys, or credentials
2. **Given** an API request includes a request body with user data, **When** the analytics event is generated, **Then** the event contains only the payload size in bytes, not the body content
3. **Given** an API request includes query parameters, **When** the analytics event is generated, **Then** the event does not include query parameter values

---

### User Story 3 - Event Transmission to Segment (Priority: P3)

As a Red Hat data platform engineer, collected API analytics events must be transmitted to Segment.com so that they can be aggregated with other Nexus telemetry data for product analysis.

**Why this priority**: Transmission is the delivery mechanism but is secondary to correct data collection. Events can be collected and transmitted later if the Segment infrastructure is not yet available.

**Independent Test**: Can be tested by generating API analytics events and verifying they are transmitted to Segment using the fire-and-forget pattern.

**Acceptance Scenarios**:

1. **Given** API analytics events have been captured, **When** the system has network connectivity, **Then** events are transmitted to Segment.com via the Nexus account
2. **Given** Segment transmission fails, **When** the failure occurs, **Then** the API continues operating normally, the failure is logged, and the event is discarded (fire-and-forget)
3. **Given** multiple API requests occur in rapid succession, **When** events are generated, **Then** events are batched for efficient transmission

---

### Edge Cases

- What happens when an API request is cancelled by the client before the response is sent?
- Health check and readiness probe requests are excluded from analytics (FR-005)
- What happens when an API request results in a redirect?
- WebSocket upgrade requests are out of scope (see Out of Scope section)
- What happens when the request payload is extremely large (>100MB)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate an analytics event for every API request that completes (success or failure)
- **FR-002**: Each analytics event MUST include: endpoint path, response time in milliseconds, HTTP status code, and request payload size in bytes
- **FR-003**: System MUST NOT include request/response bodies, query parameter values, header values, or authentication tokens in analytics events
- **FR-004**: System MUST NOT block or delay API responses due to analytics event collection or transmission failures
- **FR-005**: System MUST exclude internal health check and readiness probe endpoints from analytics event collection
- **FR-006**: System MUST transmit events to Segment.com using fire-and-forget pattern with batching
- **FR-007**: System MUST log analytics collection or transmission failures without affecting API operation
- **FR-008**: System MUST conform to the `api_call` event schema defined in ANSTRAT-1748

### Non-Functional Requirements

- **NFR-001**: Analytics event collection MUST add less than 5% overhead to API response time (aligned with ANSTRAT-1748 performance requirements)
- **NFR-002**: Analytics event collection MUST use asynchronous, non-blocking operations
- **NFR-003**: Analytics events MUST be batched for transmission (aligned with Segment SDK capabilities)

### Key Entities

- **APIAnalyticsEvent**: Represents an analytics event for a single API request, conforming to the ANSTRAT-1748 `api_call` schema. Contains: endpoint path, response time in milliseconds, HTTP status code, request payload size, and timestamp

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of API requests (excluding health checks) generate analytics events with all required data fields
- **SC-002**: Analytics event collection adds less than 5% overhead to API response time
- **SC-003**: Zero incidents of sensitive data (credentials, PII, request bodies, query parameters) appearing in analytics events
- **SC-004**: Zero API failures caused by analytics event collection or transmission errors
- **SC-005**: Product analysts can query API usage patterns (endpoint popularity, error rates, response time distributions) within 48 hours of API activity

## Scope and Boundaries

### In Scope

- Collecting analytics events from Nexus API HTTP requests
- Transmitting events to Segment.com using fire-and-forget pattern
- ANSTRAT-1748 `api_call` event schema conformance

### Out of Scope

- WebSocket connection analytics (separate concern)
- Detailed request/response payload inspection or logging
- Real-time API monitoring dashboards
- Rate limiting or throttling based on analytics data
- API performance profiling or debugging telemetry
- Analytics for internal service-to-service calls
- Custom per-installation analytics configurations

## Dependencies

- Depends on `AnalyticsClient` and `AnalyticsSettings` established by feature 031-segment-analytics-integration (Segment SDK wrapper, write key configuration)
- Requires `entitlement_id` as the installation identifier for Segment `userId` (shared dependency across all telemetry specs)
- Uses the same Segment.com write API key shared across all analytics specs (030, 031-segment, 032-api)
- ANSTRAT-1748 `api_call` event schema definition

## Assumptions

- The `AnalyticsClient` from feature 031-segment-analytics-integration is available for reuse (provides `track()` method for real-time events)
- API endpoints follow RESTful conventions
- Health check and readiness probe endpoints are distinguishable from business API endpoints
- Analytics collection is always-on and disclosed through terms of service (consistent with features 030 and 031-segment)

## Related Features

- **031-segment-analytics-integration**: Defines the `AnalyticsClient` (Segment SDK wrapper) and `AnalyticsSettings` (configuration). This feature reuses `AnalyticsClient.track()` for per-request API event emission.
- **030-workflow-runtime-telemetry**: Defines workflow lifecycle telemetry events (start, activity, complete). Shares the same Segment account and `AnalyticsClient`. The `correlation_id` concept from spec 030 is specific to workflow execution correlation and does not apply to API analytics events.
- **ANSTRAT-1748**: Parent specification defining the `api_call` event schema and privacy requirements.

## References

- **SDP**: [ANSTRAT-1748 PR #1159](pull/1159)
- **Segment Python SDK**: [github.com/segmentio/analytics-python](https://github.com/segmentio/analytics-python)
