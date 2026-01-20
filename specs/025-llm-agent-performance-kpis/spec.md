# Feature Specification: LLM/Agent Performance Metrics Exposure

**Feature Branch**: `025-llm-agent-performance-kpis`
**Created**: 2025-12-17
**Status**: Draft
**Input**: User description: "Expose metrics from Nexus via API endpoints so that KPIs can be measured by external performance tests. Nexus does not calculate KPIs internally - it exposes raw metric data."

---

## Quick Guidelines

- Focus on WHAT metrics Nexus needs to expose
- KPI targets are for external performance tests, not Nexus implementation
- Nexus exposes raw data; external tools calculate p95, aggregations, etc.

---

## Executive Summary

This feature defines the **metrics that Nexus must expose** via API endpoints to enable external performance testing. The KPI calculations (p95, averages, aggregations, threshold checks) are performed by **separate performance tests**, not by Nexus itself.

### Separation of Concerns

| Component | Responsibility |
|-----------|----------------|
| **Nexus** | Expose raw metrics data via API endpoints |
| **Performance Tests** | Query metrics, calculate KPIs (p95, etc.), validate against targets |
| **External Monitoring** | Prometheus/Grafana scraping, alerting, dashboards |

### Key Metrics to Expose

- LLM request/response timing and token counts
- Cache hit/miss counts and lookup times (see [Cache Definition](#cache-definition) below)
- Agent routing and execution timing
- Workflow execution timing and status
- Error counts and types

### Cache Definition

In this specification, "cache" refers to any caching layer implemented in Nexus, including:
- **LLM Response Cache**: Caching identical LLM requests to avoid redundant API calls
- **Context/Embedding Cache**: Caching computed embeddings for RAG retrieval
- **Semantic Cache**: Caching responses for semantically similar queries

The specific cache implementation will be defined when those features are built. This spec ensures we have the metrics infrastructure ready to instrument whichever caching layers exist.

---

## User Scenarios & Testing _(mandatory)_

### Primary User Story

As a performance test engineer, I want Nexus to expose raw metrics via API endpoints so that I can run performance tests to measure KPIs like p95 latency, throughput, and error rates.

### Acceptance Scenarios

1. **Given** I am running performance tests against Nexus, **When** I query the metrics endpoint after LLM calls, **Then** I should receive raw timing data (start time, end time, duration) and token counts for each call.

2. **Given** I need to measure cache effectiveness, **When** I query cache metrics, **Then** I should receive cache hit count, miss count, and lookup duration for each cache operation.

3. **Given** I need to measure system overhead, **When** I query request metrics, **Then** I should receive both total request duration and LLM-only duration so I can calculate overhead externally.

4. **Given** I need to validate error rate KPIs, **When** I query error metrics, **Then** I should receive error counts categorized by type (timeout, rate limit, validation, etc.).

5. **Given** I am running load tests, **When** I make concurrent requests to Nexus, **Then** metrics should be recorded for each request without significant performance degradation (<1% overhead).

6. **Given** I need historical data for a test run, **When** I query metrics with a time range, **Then** I should receive all metrics recorded within that window (subject to retention period - see NFR-003).

### Metrics Retention

**Default retention: 24 hours** for raw metrics in the REST API (configurable via `NEXUS_METRICS_RETENTION_SECONDS`). Prometheus metrics are retained by the external Prometheus server, not by Nexus.

### Edge Cases

- What happens if metrics storage fills up? (Oldest metrics are evicted, configurable retention)
- How does metrics collection affect request latency? (Must add <1% overhead)
- What if metrics endpoint is queried during high load? (Metrics queries should not block request processing)

---

## Requirements _(mandatory)_

### Functional Requirements - Metrics Exposure

#### Core Metrics Endpoint

- **FR-001**: System MUST expose a REST API endpoint for querying raw metrics (JSON format)
- **FR-002**: System MUST support time-range filtering on metrics queries (start_time, end_time)
- **FR-003**: System MUST support filtering metrics by type (llm, cache, workflow, agent, error)
- **FR-004**: System MUST return metrics in a structured format suitable for analysis (JSON)

#### LLM Metrics

- **FR-005**: System MUST record and expose LLM request duration (milliseconds)
- **FR-006**: System MUST record and expose input token count per LLM request
- **FR-007**: System MUST record and expose output token count per LLM request
- **FR-008**: System MUST record and expose model name/provider for each LLM request
- **FR-009**: System MUST record and expose Time To First Token (TTFT) for streaming responses
- **FR-010**: System MUST record and expose LLM request success/failure status

#### Cache Metrics

- **FR-011**: System MUST record and expose cache hit/miss for each cacheable request
- **FR-012**: System MUST record and expose cache lookup duration (milliseconds)
- **FR-013**: System MUST expose current cache memory utilization

#### Workflow Metrics

- **FR-014**: System MUST record and expose workflow execution start time and end time
- **FR-015**: System MUST record and expose per-activity execution duration
- **FR-016**: System MUST record and expose workflow success/failure status
- **FR-017**: System MUST record and expose workflow_id and execution_id for correlation

#### Agent Metrics

- **FR-018**: System MUST record and expose agent routing/selection duration
- **FR-019**: System MUST record and expose agent invocation duration
- **FR-020**: System MUST record and expose agent invocation success/failure status

#### System Overhead Metrics

- **FR-021**: System MUST record total request duration (user request to response)
- **FR-022**: System MUST record LLM-only duration (time spent in LLM API calls)
- **FR-023**: System MUST record component timing breakdown (routing, context prep, tool execution, caching)

#### Error Metrics

- **FR-024**: System MUST record and expose error counts by type (timeout, rate_limit, validation, internal)
- **FR-025**: System MUST record and expose error timestamps and correlation IDs

#### Prometheus/OpenMetrics Support

> **Reference**: [OpenMetrics Specification](https://github.com/OpenObservability/OpenMetrics/blob/main/specification/OpenMetrics.md)

**User Story**: As an SRE/DevOps engineer, I want to scrape metrics from Nexus using Prometheus so that I can build dashboards and alerts in Grafana without custom integration.

**Why Two Endpoints?**
| Endpoint | Format | Purpose |
|----------|--------|---------|
| REST API | JSON | Detailed per-request metrics with labels, for performance test analysis |
| Prometheus | OpenMetrics (text) | Aggregated metrics for Prometheus scraping, dashboards, and alerts |

**Prometheus Metric Types Explained**:
- **Counter**: A value that only increases (e.g., total requests, total errors)
- **Histogram**: Tracks distribution of values across configurable buckets, enabling percentile calculations (p50, p95, p99)
- **Gauge**: A value that can go up or down (e.g., active workflows, cache utilization ratio)

- **FR-026**: System MUST expose a Prometheus-compatible metrics endpoint in [OpenMetrics format](https://github.com/OpenObservability/OpenMetrics/blob/main/specification/OpenMetrics.md)
- **FR-027**: System MUST expose counters for: requests_total, errors_total, cache_hits_total, cache_misses_total
- **FR-028**: System MUST expose histograms for: request_duration_seconds, llm_duration_seconds, ttft_seconds (enables p95/p99 calculations)
- **FR-029**: System MUST expose gauges for: cache_utilization_ratio, active_workflows

#### Authentication/Authorization

- **FR-030**: Metrics endpoints MUST respect the authentication/authorization mechanisms implemented in Nexus (to be defined in auth feature)

### Non-Functional Requirements

- **NFR-001**: Metrics collection MUST add less than 1% overhead to request latency
- **NFR-002**: Metrics MUST be recorded asynchronously to avoid blocking requests
- **NFR-003**: Metrics retention period MUST be configurable (default: 24 hours for raw metrics)

---

## KPI Reference for Performance Tests

The following KPIs are **targets for external performance tests** to validate against. Nexus exposes the raw data; tests calculate the KPIs.

| Component | KPI | Target | Metric to Query |
|-----------|-----|--------|-----------------|
| Model Latency | Response Time p95 | <200ms | `llm_duration_ms` |
| Model Latency | Error Rate | <1% | `error_count / total_count` |
| Model Latency | Throughput | 20+ RPS | `requests in time window` |
| Nexus Overhead | Response Time p95 | <300ms | `total_duration_ms` |
| Nexus Overhead | Overhead Ratio | <30% | `(total - llm) / llm` |
| RAG System | Response Time p95 | <3s | `total_duration_ms` (with RAG) |
| RAG System | TTFT p95 | ≤300ms | `ttft_ms` |
| Chat Window | Response Time p95 | <300ms | `total_duration_ms` |
| Chat Window | TTFT p95 | ≤200ms | `ttft_ms` |
| Caching | Cache Hit Rate | >40% | `cache_hits / (hits + misses)` |
| Caching | Latency Reduction | >80% | `cache_hit_latency vs miss_latency` |
| Caching | Lookup Latency p95 | <5ms | `cache_lookup_ms` |
| Agent Orchestration | Selection Accuracy | >90% | `successful_routes / total_routes` |
| Agent Orchestration | Coordination Overhead | <500ms | `agent_routing_ms` |
| Agent Orchestration | Success Rate | >95% | `agent_success / total_agents` |
| E2E Workflows | Latency p95 | <60s | `workflow_duration_ms` |
| E2E Workflows | Success Rate | >85% | `completed / total` |

---

## Key Entities _(include if feature involves data)_

- **MetricRecord**: Individual metric data point with timestamp, type, value, and labels
- **MetricType**: Enum of metric categories (llm, cache, workflow, agent, error)
- **Labels**: Key-value pairs for filtering/grouping (workflow_id, model_name, etc.)

---

## Future Work

- Integration with external monitoring systems (Prometheus, Grafana, DataDog)
- Custom metric definitions via API
- Metric export to external time-series databases

---

## Review & Acceptance Checklist

### Content Quality

- [x] Focused on metrics EXPOSURE, not KPI calculation
- [x] Clear separation: Nexus exposes data, tests calculate KPIs
- [x] Requirements are testable and unambiguous

### Requirement Completeness

- [x] All metric types covered (LLM, cache, workflow, agent, error)
- [x] Prometheus/OpenMetrics format supported
- [x] Performance impact constrained (<1% overhead)

---
