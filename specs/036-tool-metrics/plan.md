# Implementation Plan: Tool-Specific Metric Types

**Branch**: `036-tool-metrics` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/036-tool-metrics/spec.md`

## Summary

Extend the Nexus metrics infrastructure (spec 025) with a dedicated `TOOL` metric category containing two metric types (`TOOL_EXECUTION_DURATION`, `TOOL_EXECUTION_STATUS`) and their corresponding Prometheus instruments. The implementation follows existing patterns — adding enum members, category mappings, Prometheus counter/histogram, and dispatch logic — with no new endpoints, storage, or API changes required.

**Key design decision**: The existing tool Prometheus instruments (`nexus_tool_executions_total`, `nexus_tool_execution_duration_seconds`) are evolved from `[component, tool_id]` to `[namespaced_name, status]` / `[namespaced_name]`. No parallel instruments are created.

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: FastAPI, prometheus_client, SQLModel, structlog
**Storage**: In-memory (MetricsStore with 24h retention, 1M max records)
**Testing**: pytest (unit tests in `tests/unit/metrics/`, integration tests in `tests/integration/metrics/`)
**Target Platform**: Linux server
**Project Type**: Single Python package (`src/nexus/`)
**Performance Goals**: <1% additional latency per recording (per spec 025 NFR-001)
**Constraints**: No new API endpoints; existing tool metric instrument label sets are replaced (not extended)
**Scale/Scope**: 3 source files modified, 3 test files modified; ~150 lines of production code, ~200 lines of tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Modular Architecture | PASS | Changes scoped to `src/nexus/metrics/`. No new modules needed. |
| II. Test-Driven Development | PASS | Unit tests for types, Prometheus instruments, and recorder dispatch. |
| III. Explicit Configuration | PASS | No new configuration. Bucket selection uses named constant `LATENCY_BUCKETS_MEDIUM`. |
| IV. Observability First | PASS | This feature *is* observability — adding MCP tool execution metrics. |
| V. API Stability | PASS | No existing REST API contracts change. Tool Prometheus instrument label sets are replaced (no production callers). |
| Enum over Literal | PASS | `MetricsCategoryType` is a `StrEnum`. New `TOOL` member follows this pattern. |
| DRY Principle | PASS | New dispatch follows the coupled pattern already used for `WORKFLOW_DURATION`. |
| SOLID - Open/Closed | PASS | Extending enums and dispatch — open for extension, no modification of existing behavior. |
| Code Quality | PASS | Must pass `make format`, `make lint`, `make typecheck`, `make test-all`. |
| Documentation Standards | PASS | Docstrings required for new dispatch method. |

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/036-tool-metrics/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files to modify)

```text
src/nexus/metrics/
├── types.py             # MODIFY: Add TOOL_EXECUTION_STATUS to MetricType;
│                        #         Add TOOL to MetricsCategoryType;
│                        #         Add "tool" to METRIC_CATEGORIES
├── prometheus.py        # MODIFY: Replace tool_executions_total counter labels
│                        #         from [component, tool_id] to [namespaced_name, status];
│                        #         Replace tool_execution_duration_seconds histogram labels
│                        #         from [component, tool_id] to [namespaced_name]
└── recorder.py          # MODIFY: Add _dispatch_tool_execution static method;
                         #         Add TOOL_EXECUTION_DURATION and TOOL_EXECUTION_STATUS
                         #         cases to _dispatch_prometheus

tests/unit/metrics/
├── test_types.py        # MODIFY: Tests for new MetricType member, TOOL category,
│                        #         MetricsCategoryType.TOOL
├── test_prometheus.py   # MODIFY: Tests for replaced tool counter and histogram label sets
└── test_recorder.py     # MODIFY: Tests for tool metric dispatch (duration → histogram+counter,
                         #         status → counter, missing label defaults)
```

**Structure Decision**: All changes are within the existing `src/nexus/metrics/` module. No new files needed.

## Design Decisions

### D1: Evolve Existing Prometheus Instruments

**Decision**: **Replace** the label sets on the existing Prometheus instruments rather than creating parallel instruments.

**Rationale**: The existing instruments have no production callers. Replacing their label sets avoids creating duplicate instruments and eliminates the need for eventual deprecation/cleanup.

**Instrument changes**:
- `nexus_tool_executions_total` — labels change from `[component, tool_id]` to `[namespaced_name, status]`
- `nexus_tool_execution_duration_seconds` — labels change from `[component, tool_id]` to `[namespaced_name]`, buckets remain `LATENCY_BUCKETS_MEDIUM`

The corresponding `_COMPONENT_METRIC_MAP` entries for `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_COUNT` are removed.

### D2: Dispatch Pattern — Dedicated Handler

**Decision**: Add a new `_dispatch_tool_execution` static method (following the pattern of `_dispatch_latency` and `_dispatch_llm_event`), with explicit cases in `_dispatch_prometheus` for `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS`.

**Rationale**: The existing `_COMPONENT_METRIC_MAP` entries for tool metrics are removed (D1), so explicit dispatch cases are needed. A dedicated handler keeps the dispatch clean.

### D3: Coupled Dispatch for Duration

**Decision**: When `TOOL_EXECUTION_DURATION` is recorded, dispatch to **both** the histogram (`.observe(value / 1000)`) and the counter (`.inc()`), extracting `status` from labels.

**Rationale**: Matches the existing `WORKFLOW_DURATION` coupled pattern (recorder.py lines 318-322).

### D4: Bucket Selection — `LATENCY_BUCKETS_MEDIUM`

**Decision**: Use `LATENCY_BUCKETS_MEDIUM` (0.1s, 0.25s, 0.5s, 1.0s, 2.5s, 5.0s, 7.5s, 10.0s) for the tool execution histogram.

**Rationale**: Most MCP tool invocations complete in sub-second to single-digit-second ranges. `LATENCY_BUCKETS_SLOW` (1s–300s) provides no histogram distribution below 1 second, and 300 seconds is unrealistically high for MCP tools. Per spec FR-005 and Assumptions.

### D5: MetricType Enum — Reuse Existing + Add New

**Decision**: Reuse the existing `MetricType.TOOL_EXECUTION_DURATION` member (value `"tool_execution_duration_ms"`) and move it from `TOOL_MANAGER` to the new `TOOL` category. Add a new `TOOL_EXECUTION_STATUS` member (value `"tool_execution_status"`).

**Rationale**: `TOOL_EXECUTION_DURATION` already exists in the `TOOL_MANAGER` category. A StrEnum cannot have duplicate values. Since the Prometheus instruments are replaced (D1), the metric type now routes exclusively through the new `_dispatch_tool_execution` handler.

### D6: `namespaced_name` as Tool Identifier Label

**Decision**: Use `namespaced_name` (format `"{provider.name}::{tool.name}"`, e.g., `"github::search_code"`) as the single tool identifier label on Prometheus instruments.

**Rationale**: `namespaced_name` is the canonical tool identifier used throughout the codebase (`tool_services.py`, `tool_filtering.py`, `mcp_provider.py`). It encodes both provider and tool name in a single label, keeping the label set compact while enabling per-tool and per-provider aggregation via PromQL regex matching (e.g., `namespaced_name=~"github::.*"`).

## Implementation Approach

### Step 1: Extend types.py

1. Add `TOOL_EXECUTION_STATUS = "tool_execution_status"` to `MetricType` enum
2. Add `TOOL = "tool"` to `MetricsCategoryType` enum
3. Add `MetricsCategoryType.TOOL` entry to `METRIC_CATEGORIES` with `[MetricType.TOOL_EXECUTION_DURATION, MetricType.TOOL_EXECUTION_STATUS]`

### Step 2: Modify prometheus.py

1. Replace `tool_executions_total` Counter labels from `["component", "tool_id"]` to `["namespaced_name", "status"]`
2. Replace `tool_execution_duration_seconds` Histogram labels from `["component", "tool_id"]` to `["namespaced_name"]` (buckets remain `LATENCY_BUCKETS_MEDIUM`)

### Step 3: Modify recorder.py

1. Remove `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_COUNT` entries from `_COMPONENT_METRIC_MAP`
2. Add `_dispatch_tool_execution` static method:
   - For `TOOL_EXECUTION_DURATION`: observe histogram (ms→s) + increment counter with status
   - For `TOOL_EXECUTION_STATUS`: increment counter only
   - Extract `namespaced_name` (mandatory), `status` with `"unknown"` default
3. Update `_dispatch_prometheus`:
   - Add explicit `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS` cases routing to `_dispatch_tool_execution`

### Step 4: Tests

1. **test_types.py**: Verify `TOOL_EXECUTION_STATUS` exists, `MetricsCategoryType.TOOL` exists, `METRIC_CATEGORIES[MetricsCategoryType.TOOL]` contains both metric types
2. **test_prometheus.py**: Verify new counter increments with correct labels, histogram observes with correct labels and `LATENCY_BUCKETS_MEDIUM` buckets
3. **test_recorder.py**: Verify `TOOL_EXECUTION_DURATION` dispatches to tool handler (histogram + counter), verify `TOOL_EXECUTION_STATUS` dispatches to counter, verify missing `namespaced_name` raises an error, verify missing `status` defaults to `"unknown"`

## Complexity Tracking

No constitution violations to justify. All changes follow established patterns.
