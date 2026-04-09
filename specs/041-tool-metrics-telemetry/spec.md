# Feature Specification: Tool Metrics Telemetry Integration

**Feature Branch**: `041-tool-metrics-telemetry`
**Created**: 2026-04-07
**Status**: Draft
**Jira**: AAP-70388
**Input**: User description: "Include the new tool metrics in the analytics telemetry events (from PR #504 ToolMetricsService)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tool Usage in Periodic Analytics Snapshots (Priority: P1)

As a product analytics team member, I want the periodic system analytics events (sent every 5 minutes to Segment) to include aggregated tool usage statistics so that I can understand how tools are being used across all Nexus installations without requiring access to each instance.

**Why this priority**: The periodic system_analytics event already exists and is the primary mechanism for understanding installation-level usage patterns. Adding tool metrics here gives immediate visibility into tool adoption and health across the fleet with minimal effort.

**Independent Test**: Can be tested by running the PeriodicCollector and verifying the system_analytics Segment event payload now includes tool usage counts and error rates.

**Acceptance Scenarios**:

1. **Given** the periodic analytics collector runs its 5-minute collection cycle, **When** it gathers system statistics, **Then** the system_analytics event includes all-time cumulative tool metrics (total tool executions, success/error/timeout counts, number of distinct tools used).
2. **Given** no tool executions have ever occurred, **When** the periodic collector runs, **Then** the tool metrics section is present with zero counts (not omitted).
3. **Given** multiple tools have been executed over time, **When** the periodic collector gathers statistics, **Then** the event includes the cumulative count of distinct tools used and total executions across all tools.

---

### User Story 2 - Tool Execution Events in Segment (Priority: P2)

As a product analytics team member, I want individual tool execution events sent to Segment so that I can analyze tool usage patterns, identify popular tools, and detect reliability trends across installations.

**Why this priority**: Per-execution events enable detailed analytics (e.g., which tool types fail most, average durations by tool category) that aggregated snapshots cannot provide. However, the periodic snapshot (P1) delivers most of the immediate value.

**Independent Test**: Can be tested by executing a tool and verifying a corresponding event appears in the Segment event stream with the expected fields.

**Acceptance Scenarios**:

1. **Given** a tool execution reaches a terminal state (success, error, or timeout), **When** the result is recorded, **Then** a tool_execution telemetry event is sent to Segment containing: tool namespaced name (plaintext), execution status, duration in milliseconds, workflow execution ID, and entitlement ID.
2. **Given** a tool execution is still in "running" state, **When** the telemetry system checks, **Then** no telemetry event is emitted — only terminal states produce events.
3. **Given** the Segment write key is not configured, **When** a tool execution completes, **Then** no telemetry event is sent and no errors are logged.

---

### Edge Cases

- What happens when the telemetry system is disabled (no Segment write key)? Tool metrics recording to the database continues normally; only the Segment event emission is skipped.
- What happens when the database has no tool execution records? The periodic snapshot includes tool metrics with zero counts.
- What happens when tool execution recording fails? The telemetry event emission should not block or fail the tool execution itself — it is fire-and-forget.
- What happens when `workflow_execution_id` is not available in the orchestration context? The telemetry event is still emitted with `workflow_execution_id: null` in the payload.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The periodic system_analytics event MUST include a tool usage summary section with: all-time total tool executions, success count, error count, timeout count, and distinct tools used (cumulative, not windowed). Only terminal states (success, error, timeout) are counted — executions still in "running" state are excluded.
- **FR-002**: The tool usage summary in the periodic event MUST query data from the existing UsageCounter and ToolExecution tables (introduced in PR #504) rather than duplicating storage.
- **FR-003**: A new telemetry event MUST be emitted to Segment for each tool execution that reaches a terminal state (success, error, or timeout), containing: tool namespaced name (plaintext, not hashed — tool names are not PII), execution status, duration in milliseconds, workflow execution ID (optional, linking to the parent workflow execution via new `AgentState.execution_id` field populated by `InvocationExecutor`), and entitlement ID. Executions still in "running" state MUST NOT produce a telemetry event.
- **FR-004**: Telemetry event emission MUST be non-blocking — failures to send events MUST NOT affect tool execution outcomes.
- **FR-005**: When telemetry is disabled (no Segment write key), tool metric events MUST be silently skipped with no errors.

### Key Entities

- **ToolExecutionEvent**: A Segment telemetry event representing a single tool execution. Contains tool namespaced name, execution status, duration, workflow execution ID, and entitlement ID.
- **ToolCounts**: An aggregate data structure included in the periodic system_analytics event. Contains all-time cumulative counts of executions, successes, errors, timeouts, and distinct tools.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All tool executions that reach a terminal state (success, error, timeout) produce a corresponding telemetry event when Segment is configured.
- **SC-002**: The periodic system_analytics event includes accurate all-time cumulative tool usage counts that match the database records.
- **SC-003**: Tool names (namespaced_name) are included in plaintext in telemetry events. No user-identifiable information appears in any telemetry event payload sent to Segment.
- **SC-004**: Telemetry event emission adds less than 5ms of overhead to tool execution latency (fire-and-forget, per FR-004).
- **SC-005**: The system continues to function normally when Segment is not configured — no errors, no degraded tool execution behavior (per FR-005).

## Clarifications

### Session 2026-04-07

- Q: Should the periodic system_analytics tool usage summary report only new executions within the collection window, or all-time cumulative totals? → A: All-time cumulative totals, no windowing system.
- Q: Should high-volume tool execution scenarios include rate-limiting or batching for telemetry events? → A: Out of scope — no rate-limiting planned at this stage; will be addressed later if needed.
- Q: Should tool names be anonymized (hashed) in telemetry events? → A: No. Tool names are not PII and can be included in plaintext.

### Session 2026-04-08

- Q: What identifier should the tool execution telemetry event use to link to the parent workflow execution? → A: Use `workflow_execution_id` (the Execution model UUID). Add a new optional field `execution_id: str | None` to `AgentState`, populated by `InvocationExecutor` before calling orchestration. The field is optional because not all orchestration contexts may have a workflow execution. When `None`, the telemetry event emits `workflow_execution_id: null`.

## Out of Scope

- Rate-limiting or batching of per-execution telemetry events under high volume — will be addressed later if needed.
- Per-tool breakdowns in the periodic snapshot (e.g., "tool X had N executions") — only global aggregates are included.
- Performance optimization for large UsageCounter datasets (e.g., materialized views, caching) — the current query is sufficient for expected data volumes.
- Telemetry events for tool executions in "running" state — only terminal states are reported.

## Assumptions

- The existing Segment client (TelemetryClientRegistry) handles batching and buffering, so individual event sends are lightweight.
- The existing UsageCounter and ToolExecution tables from PR #504 are the source of truth for tool metrics data.
- Tool names (namespaced_name) are not considered PII and can be sent in plaintext in telemetry events.
- The periodic collection interval (default 5 minutes) is appropriate for tool usage snapshots — no separate collection cadence is needed. Each snapshot reports all-time cumulative totals.

## Dependencies

- PR #504 (merged): ToolMetricsService, ToolExecution model, UsageCounter model, metrics recording infrastructure.
- Existing telemetry system: TelemetryClientRegistry, TelemetryCollector, PeriodicCollector, event builders.
