# Feature Specification: Tool-Specific Metric Types

**Feature Branch**: `036-tool-metrics`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Extend Spec 025 Metrics Infrastructure with Tool-Specific Metric Types"
**Jira**: [AAP-68759](AAP-68759)
**Parent Story**: AAP-55734

---

## Executive Summary

The Nexus metrics infrastructure (spec 025) provides a system-wide observability layer covering LLM, cache, workflow, agent, and error metrics. However, **MCP tool execution** is not yet instrumented. When agents invoke MCP tools, there is no visibility into how long those executions take, which tools are called, or whether they succeed or fail.

This feature extends the existing metrics infrastructure with a new **tool** metric category so that tool execution duration and status are recorded through the same `MetricsRecorder` and Prometheus pipelines already in place for other metric types. No new endpoints or storage mechanisms are required -- the existing REST API, OpenMetrics endpoint, and in-memory store automatically surface the new metrics once the types and instruments are registered.

### Separation of Concerns

| Component | Responsibility |
|-----------|----------------|
| **This Feature (036)** | Define tool metric types, Prometheus instruments, and recorder dispatch logic |
| **Spec 025 Infrastructure** | MetricsRecorder, MetricsStore, REST API, OpenMetrics endpoint (unchanged) |
| **Spec 032 Analytics Events** | Analytics telemetry for tool usage transmitted to Segment for product analysis |

> **Note:** This spec is an infrastructure extension -- the "users" are developers integrating with the metrics subsystem. Requirements reference specific type names and instruments because those are the public contract this feature exposes to its consumers.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Query Tool Execution Metrics via REST API (Priority: P1)

As a performance test engineer, I want to query tool execution metrics through the existing metrics REST API so that I can measure tool performance alongside other Nexus metrics without needing a separate instrumentation pipeline.

**Why this priority**: This is the core capability -- without registering tool metric types, no tool metrics can flow through the system at all.

**Independent Test**: Can be fully tested by recording tool metrics programmatically through MetricsRecorder and querying them via the `/api/v1/metrics?category=tool` endpoint. Delivers immediate value by proving the full recording-to-query pipeline works for tool metrics.

**Acceptance Scenarios**:

1. **Given** the metrics system is enabled, **When** a tool execution duration metric is recorded with labels (namespaced_name, status), **Then** the metric appears in REST API query results filtered by the "tool" category.

2. **Given** multiple tool executions have been recorded, **When** I query the metrics endpoint with `category=tool` and a time range, **Then** I receive all tool metrics within that window, each with namespaced_name and status labels.

3. **Given** no tool executions have occurred, **When** I query metrics with `category=tool`, **Then** I receive an empty result set (not an error).

---

### User Story 2 - Scrape Tool Metrics via Prometheus (Priority: P1)

As an SRE/DevOps engineer, I want tool execution metrics exposed through the existing Prometheus/OpenMetrics endpoint so that I can build dashboards and alerts for tool performance in Grafana without custom integration.

**Why this priority**: Prometheus integration is equally critical as the REST API -- both are first-class consumers of the metrics infrastructure.

**Independent Test**: Can be tested by recording tool metrics, then scraping the `/api/v1/metrics/openmetrics` endpoint and verifying the `nexus_tool_executions_total` counter and `nexus_tool_execution_duration_seconds` histogram appear with `namespaced_name` and `status` label values.

**Acceptance Scenarios**:

1. **Given** a tool execution duration is recorded, **When** I scrape the OpenMetrics endpoint, **Then** I see both the `nexus_tool_executions_total` counter incremented and the `nexus_tool_execution_duration_seconds` histogram updated -- a single duration recording feeds both instruments.

2. **Given** a tool execution is recorded as failed, **When** I scrape the OpenMetrics endpoint, **Then** the counter reflects the failure with `status="error"` or `status="timeout"` and the histogram records the duration.

3. **Given** tool executions from multiple tools and providers, **When** I scrape Prometheus, **Then** the counter has distinct label combinations allowing per-tool and per-provider aggregation.

---

### User Story 3 - Filter Tool Metrics by Category (Priority: P2)

As a developer building a monitoring dashboard, I want to filter metrics by the "tool" category so that I can isolate tool-specific data from LLM, workflow, and other metric categories.

**Why this priority**: Category filtering is an existing capability in the metrics API. Ensuring tool metrics participate correctly is important but depends on the metric types being registered first (P1).

**Independent Test**: Can be tested by recording metrics across multiple categories (tool, workflow, llm) and verifying that filtering by "tool" returns only tool metrics.

**Acceptance Scenarios**:

1. **Given** both tool and workflow metrics have been recorded, **When** I query with `category=tool`, **Then** only tool-related metrics are returned.

2. **Given** the category filter supports the "tool" value, **When** I query with an invalid category, **Then** the system returns a validation error (existing behavior, unchanged).

---

### Edge Cases

- What happens when a tool metric is recorded with a missing `status` label? The recorder defaults to `"unknown"` for the missing `status` label value, consistent with existing behavior for workflow and LLM metrics.
- What happens when a tool metric is recorded without `namespaced_name`? The recorder raises a `ValueError` and skips the recording. The label is mandatory (FR-008).
- What happens when metrics recording is disabled? Tool metrics are silently skipped, consistent with the existing `enabled` flag on MetricsRecorder.
- How are very long tool executions handled in the histogram? The histogram uses medium-profile latency buckets (0.1s to 10s). MCP tool invocations exceeding 10 seconds fall into the `+Inf` bucket, which is standard Prometheus behavior.
- What happens when a caller records only a duration metric without a separate status metric? The duration dispatch also increments the execution counter (matching the existing workflow metrics pattern), so a single `TOOL_EXECUTION_DURATION` recording is sufficient to get both histogram and counter data.
- What happens when a tool invocation fails at the transport level (DNS resolution failure, connection timeout, TLS handshake failure)? These failures raise timeout or connection exceptions in the wrapper and are mapped to `status="timeout"`.
- What happens when a tool invocation fails with a non-timeout exception? Any exception that is not a timeout or connection error is mapped to `status="error"`. The spec does not distinguish between client and server errors because HTTP status codes are not accessible at the instrumentation point (the MCP transport is encapsulated within langchain).

---

## Requirements *(mandatory)*

### Functional Requirements

#### Tool Metric Type Registration

- **FR-001**: System MUST define a `TOOL_EXECUTION_DURATION` metric type that records tool execution duration in milliseconds.
- **FR-002**: System MUST define a `TOOL_EXECUTION_STATUS` metric type that records the outcome of tool executions. This type is used for cases where a status is known but duration is not available (e.g., pre-invocation validation failures). When duration is available, FR-006's coupled dispatch already captures status alongside duration.
- **FR-003**: System MUST define and register a `TOOL` metric category that groups the tool-specific metric types and participates in existing category-based filtering and querying.

#### Prometheus Instrument Registration

- **FR-004**: System MUST replace the label set on the existing `nexus_tool_executions_total` Prometheus counter from `[component, tool_id]` to `[namespaced_name, status]`, tracking the total number of tool executions. The `namespaced_name` label uses the format `"{provider.name}::{tool.name}"` (e.g., `"github::search_code"`).
- **FR-005**: System MUST replace the label set on the existing `nexus_tool_execution_duration_seconds` Prometheus histogram from `[component, tool_id]` to `[namespaced_name]`, using medium-profile latency buckets (0.1s to 10s range). The `status` label is intentionally omitted from the histogram because duration distributions do not require per-status segmentation.

#### Metrics Recorder Dispatch

- **FR-006**: System MUST dispatch `TOOL_EXECUTION_DURATION` metrics to both the Prometheus histogram (converting milliseconds to seconds) and the Prometheus counter (incrementing the execution count). This matches the existing workflow metrics pattern where a single duration recording updates both instruments. Callers MUST provide the `namespaced_name` label with every recording.
- **FR-007**: System MUST dispatch `TOOL_EXECUTION_STATUS` metrics to the Prometheus counter with `namespaced_name` and `status` labels. The `status` label MUST be derived from the exception type observed at the tool execution wrapper and constrained to the following values: `"success"` (no exception raised), `"timeout"` (timeout or connection-level exception), or `"error"` (any other exception). HTTP status codes are not available at the instrumentation point because the MCP transport is encapsulated within langchain.
- **FR-008**: System MUST default to `"unknown"` for the missing `status` label value when dispatching tool metrics to Prometheus. The `namespaced_name` label is mandatory; if absent, the system MUST raise a `ValueError` and skip the recording.

#### Backward Compatibility

- **FR-009**: System MUST NOT alter the behavior of existing metric types (LLM, cache, workflow, agent, error).
- **FR-010**: System MUST NOT change existing REST API endpoint contracts or response formats.
- **FR-011**: System MUST NOT change existing Prometheus metric names or label sets, **except** for the tool-specific instruments (`nexus_tool_executions_total`, `nexus_tool_execution_duration_seconds`) whose label sets are replaced by this feature (FR-004, FR-005). The existing `TOOL_MANAGER` component-level dispatch entries that fed these instruments are superseded.

### Key Entities

- **MetricType (extended)**: Enum of metric categories -- extended with `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS` values for tool execution instrumentation.
- **MetricsCategoryType (extended)**: Enum of category names -- extended with `TOOL` to group tool-specific metrics.
- **METRIC_CATEGORIES (extended)**: Category-to-types mapping -- extended with a `"tool"` entry containing the two new metric types.
- **NexusPrometheusMetrics (modified)**: Prometheus instrument container -- existing `tool_executions_total` counter and `tool_execution_duration_seconds` histogram are re-registered with new label sets (`[namespaced_name, status]` and `[namespaced_name]` respectively).
- **MetricsRecorder (modified)**: Central recording service -- dispatch logic updated to route tool metrics through a dedicated handler using `namespaced_name` labels.
- **`namespaced_name` (label)**: The canonical tool identifier in format `"{provider.name}::{tool.name}"` (e.g., `"github::search_code"`). Encodes both the tool provider and tool name. Values come from the finite set of registered tools in the Nexus tool manager.

---

## Assumptions

- Tool execution metrics follow the same coupled recording pattern as workflow metrics: recording a duration both observes the histogram and increments the counter in a single dispatch.
- The label set `[namespaced_name, status]` is sufficient for tool metric cardinality. The `namespaced_name` values come from a finite set of registered tools, keeping Prometheus label cardinality manageable (expected fewer than 1,000 unique combinations in deployments with up to 50 tool providers averaging 20 tools each). Additional labels (e.g., `execution_id`, `workflow_id`) can be added in the MetricRecord labels dict without changing Prometheus instruments.
- `LATENCY_BUCKETS_MEDIUM` (0.1s to 10s) is used for tool execution durations instead of `LATENCY_BUCKETS_SLOW` (1s to 300s) because: (a) most MCP tool invocations complete in sub-second to single-digit-second ranges, and `LATENCY_BUCKETS_SLOW` provides no histogram distribution below 1 second; (b) 300 seconds is an unrealistically high upper bound for MCP tool calls. Tools exceeding 10 seconds fall into the standard `+Inf` bucket.
- The `status` label uses a constrained set of three values (`"success"`, `"error"`, `"timeout"`) derived from exception types at the tool execution wrapper. HTTP status codes are not available because the MCP transport is encapsulated within langchain.

---

## Out of Scope

- **Tool metric emission logic**: The code that actually calls `recorder.record()` at tool invocation sites is out of scope and will be addressed in a separate task.
- **Shared collection layer**: A single instrumentation point that feeds both the metrics pipeline (this spec) and the analytics telemetry pipeline (spec 032) is a future architectural concern (see Future Work).
- **Per-tool histogram bucket configuration**: All tools share the same histogram bucket boundaries. Per-tool tuning is not part of this feature.
- **New REST API endpoints or response format changes**: This feature extends existing types only; no endpoint changes are needed.
- **Removal of remaining TOOL_MANAGER metric types**: This feature replaces the Prometheus instruments and dispatch entries for `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_COUNT`. The remaining `TOOL_MANAGER`-only metric types (`TOOL_EXECUTION_SUCCESS_RATE`, `TOOL_PROVIDER_AVAILABILITY`, `TOOL_ERROR_RATE`) are out of scope and may be removed in a follow-up task.

---

## Dependencies

- **Spec 025 - LLM/Agent Performance Metrics Exposure**: This feature extends the MetricType, MetricsCategoryType, METRIC_CATEGORIES, NexusPrometheusMetrics, and MetricsRecorder defined in spec 025. The spec 025 infrastructure must be fully implemented.

---

## Future Work

- **Shared collection layer with spec 032**: A single instrumentation point at tool invocation sites that feeds both the metrics pipeline (spec 025/036, via MetricsRecorder) and the analytics telemetry pipeline (spec 032, via AnalyticsClient). This avoids duplicating instrumentation and ensures consistent data across both consumers.
- **Per-tool histogram tuning**: If real-world data shows the medium-profile buckets are not optimal for certain tool categories, per-tool bucket configuration could be introduced.
- **Removal of remaining TOOL_MANAGER metrics**: Formally remove the remaining `TOOL_MANAGER`-only metric types (`TOOL_EXECUTION_SUCCESS_RATE`, `TOOL_PROVIDER_AVAILABILITY`, `TOOL_ERROR_RATE`) once confirmed unused.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All tool metric recordings are queryable through the existing REST API within the standard retention period, with no additional endpoint configuration required.
- **SC-002**: Tool execution counter and histogram are visible in the Prometheus/OpenMetrics scrape output after at least one tool metric is recorded.
- **SC-003**: Filtering by the "tool" category in the metrics REST API returns only tool-specific metrics and excludes all other categories.
- **SC-004**: Existing metric types (LLM, cache, workflow, agent, error) continue to function identically -- no regressions in existing test suites.
- **SC-005**: Metrics recording overhead for tool metrics is consistent with existing metric types (less than 1% additional latency per recording, per NFR-001 in spec 025).

---

## Related Specs

- [025 - LLM/Agent Performance Metrics Exposure](../025-llm-agent-performance-kpis/spec.md): Parent metrics infrastructure that this spec extends. Defines MetricType, MetricRecord, MetricsRecorder, NexusPrometheusMetrics, MetricsStore, and the REST/OpenMetrics endpoints that tool metrics flow through.
- [032 - API Analytics Events](../032-api-analytics-events/spec.md): Tool usage will also be captured as analytics events transmitted to Segment for product analysis. A future shared collection layer (see Future Work) should feed both the metrics pipeline (this spec) and the analytics telemetry pipeline (spec 032) from a single instrumentation point.

---

## Review & Acceptance Checklist

### Content Quality

- [x] Focused on WHAT metrics Nexus needs to expose for tools, not HOW
- [x] Clear separation: this spec extends types/instruments, not emission sites
- [x] Requirements are testable and unambiguous

### Requirement Completeness

- [x] All tool metric types defined (duration, status)
- [x] Prometheus instruments specified (counter, histogram)
- [x] Recorder dispatch behavior specified
- [x] Backward compatibility requirements explicit
- [x] Edge cases identified with expected behavior
- [x] Transport-level failure handling specified
- [x] Replacement of existing tool Prometheus instruments explicitly specified
