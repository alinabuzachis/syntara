# Feature Specification: Segment Analytics Integration (Periodic Metrics)

**Feature Branch**: `031-segment-analytics-integration`
**Created**: 2026-02-12
**Status**: Draft
**Scope**: Periodic/scheduled metrics collection only
**Input**: SDP ANSTRAT-1748 - Agentic Automation - Instrumentation / Telemetry / Observability
**Jira**: [ANSTRAT-1748](ANSTRAT-1748)

---

## Quick Guidelines

- Focus on WHAT analytics data Nexus needs to send to Segment.com via **periodic collection**
- Analytics is for **product insights** (usage patterns, feature adoption), NOT technical KPIs
- Use **periodic aggregation** from database - NOT per-request instrumentation
- No PII or sensitive data should ever be collected

---

## Executive Summary

This feature integrates Segment.com analytics into the Nexus platform to collect anonymized usage metrics for product insights via **periodic scheduled collection**.

### Scope

**In scope for this spec**:
- Core analytics infrastructure (AnalyticsClient, AnalyticsCollector)
- Consuming existing `EntitlementId` and `AnalyticsSettings`
- Periodic database aggregation (workflows, credentials, executions, model usage)
- Feature flag status collection

**Out of scope** (separate SDPs):
- Real-time workflow runtime events (workflow_started, workflow_ended, activity_executed)
- Real-time workflow template events (workflow_copied)
- Real-time authentication/logout events
- Real-time API call events
- Container/system resource metrics

### Key Features

- Zero-configuration analytics enabled by default
- **Periodic aggregation** from database (fixed interval: 5 minutes)
- Stateless snapshots of current DB state (no delta tracking)
- Anonymized data collection (no PII, no workflow content)
- Installation-level tracking via `entitlement_id` persisted to database (not user-level)
- Minimal performance overhead (background task only)

---

## User Scenarios & Testing _(mandatory)_

### Primary User Story

As a **product manager**, I want to understand which workflows, tools, and features are most frequently used so that I can make data-driven decisions about feature development and prioritization.

### Acceptance Scenarios

1. **Given** Nexus is deployed with default configuration, **When** the system starts, **Then** analytics should be enabled automatically with no additional configuration required.

2. **Given** the analytics collection interval elapses (fixed: 5 minutes), **When** the background task runs, **Then** it should query the database for current-state aggregate counts (total workflows, total executions by status, etc.) and send a single stateless analytics event to Segment.

3. **Given** workflows have been created and executed, **When** the analytics event is sent, **Then** it should contain current-state aggregate counts (e.g., "150 total workflows", "200 completed executions") but NO workflow content, parameter values, or user identifiers.

4. **Given** LLM models have been invoked, **When** the analytics event is sent, **Then** it should contain aggregate token counts and model usage counts (e.g., "gpt-4: 5000 tokens, 15 calls") but NO prompt or response content.

5. **Given** Nexus is under load processing many workflows, **When** the analytics task runs, **Then** the performance overhead should be minimal since it only runs periodically (not per-request).

6. **Given** the Segment endpoint is temporarily unavailable, **When** the analytics task fails to send, **Then** the failure should be logged but should not impact platform operations.

### Edge Cases

- What happens if Segment is unreachable? (Event is dropped, logged, next interval retries)
- What happens if database query is slow? (Task has timeout, logs warning, continues)
- How are events handled during system restart? (Counters are based on DB, no state loss)
- What if analytics task fails? (Failures logged, platform operations unaffected)
- What about counts across restarts? (Events are stateless snapshots, no state to lose)

### Resilience / Fault Tolerance

**Collector crash**: The `AnalyticsCollector` runs as an asyncio background task inside the Nexus container. If it crashes, the exception is caught by the collection loop and logged -- the loop continues on the next interval. If the task itself is killed (unhandled `BaseException`), no automatic restart occurs. This is accepted because:
- Analytics is non-critical; lost events do not affect platform operations
- Stateless snapshots mean no data gap accumulates -- the next successful cycle captures the full current state
- Crash logging via structlog is observable by external SIEM/monitoring tools

**Multi-Pod duplication**: If Nexus is scaled to multiple Pods, each Pod runs its own `AnalyticsCollector`, resulting in duplicate events sent to Segment. This is accepted for GA because:
- Segment deduplication or downstream processing can filter by `entitlement_id` + `timestamp`
- Events are identical snapshots, so duplicates carry no conflicting data
- Leader election or singleton scheduling can be added in a future iteration if duplication becomes a concern

**Decision**: The collector is deliberately not fault-tolerant beyond its internal error handling. This is sufficient for GA. A more robust approach (leader election, health checks, k8s sidecar) can be evaluated post-GA if needed.

---

## Requirements _(mandatory)_

### Functional Requirements - Periodic Analytics Collection

#### Core Analytics Infrastructure

- **FR-001**: System MUST integrate the official Segment Python SDK ([segment-analytics-python](https://github.com/segmentio/analytics-python))
- **FR-002**: System MUST enable analytics collection by default with zero configuration required
- **FR-003**: System MUST use the `entitlement_id` (created during product registration) as the `userId` for all events
- **FR-004**: System MUST use `AnalyticsSettings` (Segment write key, enabled flag) for configuration
- **FR-005**: System MUST provide an `AnalyticsClient` that can be reused by future real-time event specs

#### Periodic Aggregation from Database

- **FR-006**: System MUST implement a periodic background task (fixed interval: 5 minutes)
- **FR-007**: System MUST query the database for current-state workflow counts:
  - Total workflows (enabled, disabled)
- **FR-008**: System MUST query the database for credential counts:
  - Total number of credentials configured
- **FR-009**: System MUST query the database for current-state execution counts:
  - Total executions (completed, failed, cancelled, running)
  - Average execution duration (float, in seconds, calculated from `completed_at - created_at`)
- **FR-010**: System MUST query the database for model inference aggregate counts:
  - Total LLM calls by model name
  - Aggregate token counts (input/output) by model
- **FR-011**: System MUST emit stateless events (current-state snapshots, no delta tracking)
- **FR-012**: System MUST include current active workflow count in periodic events

#### Configuration Events (Periodic)

- **FR-013**: System MUST include enabled feature flags in periodic events

#### Data Privacy and Anonymization

- **FR-014**: System MUST NOT collect personally identifiable information (PII)
- **FR-015**: System MUST NOT collect workflow definitions, inputs, outputs, or customer-configured variables
- **FR-016**: System MUST NOT collect prompt content or LLM response content
- **FR-017**: System MUST NOT collect credential values, tokens, API keys, or secrets (only counts)
- **FR-018**: System MUST NOT collect user identifiers (use installation `entitlement_id` only)
- **FR-019**: System MUST validate event payloads contain only explicitly defined properties

#### Error Handling and Storage

- **FR-020**: System MUST log analytics failures without impacting platform operations
- **FR-021**: System MUST NOT block any user operations if analytics fails
- **FR-022**: System MUST handle Segment SDK failures gracefully (fire-and-forget pattern)
- **FR-023**: System MUST rely on database-level statement timeouts for query protection
- **FR-024**: System MUST NOT persist telemetry data locally (Segment SDK handles buffering)
- **FR-025**: System MUST implement data cleanup to prevent disk space issues (no local persistence)

### Non-Functional Requirements

- **NFR-001**: Periodic analytics collection MUST NOT have measurable impact on application performance
- **NFR-002**: All analytics event emission MUST be asynchronous and non-blocking
- **NFR-003**: Database queries for periodic aggregation MUST NOT lock tables or impact user operations
- **NFR-004**: System MUST support the dedicated Segment account with higher rate limits
- **NFR-005**: Segment SDK batching MUST be used (default: 100 events or 0.5s)

---

## Key Entities _(include if feature involves data)_

### Core Components

- **AnalyticsClient**: Wrapper around Segment Python SDK for event emission
- **AnalyticsCollector**: Background task for periodic database aggregation
- **EntitlementId**: Unique installation/deployment identifier persisted to database, used as `userId`
- **AnalyticsSettings**: Configuration for enabled/disabled and Segment write key

### Periodic Event: `system_analytics`

A single stateless event (current-state snapshot) sent at each collection interval containing:

| Section | Properties |
|---------|------------|
| `workflows` | total, enabled, disabled |
| `credentials` | total |
| `executions` | total, completed, failed, cancelled, running, avg_duration_seconds |
| `model_usage` | calls, input_tokens, output_tokens per model |
| `config` | feature_flags_enabled |

### Periodic Aggregation (from Database)

| Table | Aggregation |
|-------|-------------|
| `workflow` | Count by status (enabled/disabled) |
| `credential` | Total count of credentials |
| `execution` | Count by status (completed/failed/cancelled/running), average duration (float) |
| `invocation` | Count by model, aggregate token counts |
| `feature_flag` | List of enabled feature flags |

---

## Future Work
- **Tool usage tracking**: Deferred; covered by [AAP-55734](AAP-55734)
- **Air-gapped environments**: Deferred to post-Tech Preview
- **AAP Metrics Service integration**: Deferred; use Segment first
- **User opt-out mechanism**: May be added based on customer feedback
- **Real-time analytics dashboard**: Segment data analyzed separately
- **Query optimization**: Consider using materialized views for complex aggregates if needed

---

## Review & Acceptance Checklist

### Content Quality

- [x] Focused on WHAT analytics to collect, not HOW to implement
- [x] Privacy-first design with explicit data handling requirements
- [x] Requirements are testable and unambiguous

### Requirement Completeness

- [x] All aggregate categories covered (workflow, execution, model, tool, system)
- [x] Privacy requirements explicitly defined (aggregates only, no content)
- [x] Performance requirements specified (<5% overhead, non-blocking)
- [x] Error handling requirements defined
- [x] Database query requirements identified

---

## References

- **SDP**: [ANSTRAT-1748 PR #1159](pull/1159)
- **Proposal**: ANSTRAT-1748-P1 - Analytic Events Integration with Segment
- **Segment Python SDK**: [github.com/segmentio/analytics-python](https://github.com/segmentio/analytics-python)
