# Implementation Plan: Tool Metrics Telemetry Integration

**Branch**: `041-tool-metrics-telemetry` | **Date**: 2026-04-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/041-tool-metrics-telemetry/spec.md`

## Summary

Integrate tool execution metrics into the existing Segment telemetry system. Two deliverables: (1) add a `ToolCounts` section to the periodic `SystemAnalyticsEvent` with all-time cumulative tool usage stats, and (2) emit a new `ToolExecutionTelemetryEvent` to Segment for each tool execution reaching a terminal state, including optional `execution_id` for correlation with parent workflow executions. The `execution_id` is used consistently throughout the codebase (AgentState, function parameters, tool wrappers) and is only mapped to `workflow_execution_id` in the final Segment telemetry event definitions. Only terminal states (success, error, timeout) are counted — "running" state is excluded. Tool names are sent in plaintext (not PII). Both follow existing telemetry patterns (BaseTelemetryEvent, fire-and-forget, TelemetryClientRegistry).

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: FastAPI, SQLModel, segment-analytics-python, structlog
**Storage**: PostgreSQL (existing UsageCounter and ToolExecution tables from PR #504)
**Testing**: pytest (unit + integration)
**Target Platform**: Linux server (containerized)
**Project Type**: Single monolithic Python application
**Performance Goals**: <5ms overhead per telemetry event emission (fire-and-forget)
**Constraints**: Non-blocking — telemetry failures must not affect tool execution
**Scale/Scope**: ~8 files modified/created, ~2 new event models, ~1 query function, threading optional `execution_id` (from new `AgentState.execution_id` field) through tool wrappers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Modular Architecture | PASS | New event models in `telemetry/events/`, query logic in `telemetry/queries.py` — follows existing module boundaries |
| II. Test-Driven Development | PASS | Unit tests for event models + builders, integration tests for periodic collector with tool counts |
| III. Explicit Configuration | PASS | Uses existing `segment_write_key` config — no new config values needed |
| IV. Observability First | PASS | This feature directly enhances observability by adding tool metrics to telemetry |
| V. API Stability | PASS | No public API changes — only telemetry event payloads (internal) |
| DRY Principle | PASS | Reuses existing UsageCounter data, BaseTelemetryEvent pattern, TelemetryClientRegistry |
| SOLID | PASS | Single responsibility: new event models for tool telemetry, collector extended with tool query |
| SQLModel for Data Models | PASS | New event models use SQLModel consistent with existing events |
| Enum over Literal | PASS | Will use existing ExecutionStatus enum, no new Literal usage |
| Code Quality | PASS | Will pass linting, formatting, type checking, 90%+ coverage |

No violations. Gate passed.

## Project Structure

### Documentation (this feature)

```text
specs/041-tool-metrics-telemetry/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/nexus/telemetry/
├── events/
│   ├── system_analytics.py   # MODIFY: add ToolCounts model + tools field on SystemAnalyticsEvent
│   └── tool_execution.py     # NEW: ToolExecutionTelemetryEvent + builder
├── queries.py                 # MODIFY: add query_tool_counts() function
├── collector.py               # MODIFY: add capture_tool_executed method
└── periodic_collector.py      # MODIFY: call query_tool_counts() + include in event

src/nexus/agent_orchestrator/
├── models/
│   └── agent_state.py               # MODIFY: add optional execution_id field (NotRequired[str | None])
├── executor/
│   └── invocation_executor.py       # MODIFY: populate execution_id in AgentState
├── services/
│   └── orchestration_service.py     # MODIFY: thread execution_id through _create_tool_node, add execution_id param to execute()
└── tool_manager/
    └── execution_failure_handler.py  # MODIFY: emit ToolExecutionTelemetryEvent after DB persist (both async and sync wrappers)

tests/
├── unit/telemetry/
│   ├── test_tool_execution_event.py   # NEW: event model + builder tests
│   ├── test_system_analytics_event.py  # MODIFY: add ToolCounts tests
│   ├── test_queries.py                 # MODIFY: add query_tool_counts tests
│   ├── test_collector.py               # MODIFY: add capture_tool_executed tests
│   └── test_periodic_collector.py      # MODIFY: add query_tool_counts mock
├── unit/agent_orchestrator/
│   └── test_agent_state.py             # NEW: AgentState.execution_id tests
├── integration/telemetry/
│   └── test_periodic_analytics.py     # MODIFY: verify tool counts in snapshot
└── e2e/
    └── test_agentic_workflow_tool_metrics.py  # MODIFY: add telemetry event assertions
```

**Structure Decision**: Follows existing telemetry module layout. New event model in `events/` directory, collector and periodic_collector extended in-place. `execution_id` is used consistently throughout the codebase and only mapped to `workflow_execution_id` in the final Segment telemetry event model fields.

## Key Design Decisions

1. **Naming convention**: `execution_id` is used consistently throughout the codebase (AgentState, function parameters, tool wrappers, collector methods) to match the rest of the Nexus codebase. The name `workflow_execution_id` is only used in the final Segment telemetry event model fields, matching existing telemetry event conventions. The mapping from `execution_id` to `workflow_execution_id` happens in the telemetry event builders.

2. **NotRequired field**: `AgentState.execution_id` uses `NotRequired[str | None]` to avoid breaking existing code that constructs `AgentState` without it.

3. **No deleted_at filter**: The `UsageCounter` table does not have a `deleted_at` column (it inherits from `UserOwnedResource` which does not include `SoftDeletable`), so `query_tool_counts()` does not need a soft-delete filter. The research.md R5 SQL query mentioning `deleted_at IS NULL` is inaccurate.

4. **ToolCounts not frozen**: `ToolCounts` does not set `model_config = {"frozen": True}` — matching sibling models `WorkflowCounts`, `ExecutionCounts`, `CredentialCounts` which also don't have it. Only `BaseTelemetryEvent` (and thus event classes that inherit from it) is frozen.

5. **Both wrappers**: Both `create_tool_awrapper()` (async) and `create_tool_wrapper()` (sync) must be updated to thread `execution_id`, since both have `finally` blocks that call `_persist_tool_execution_to_db()`.

6. **Telemetry emission pattern**: Follows `workflow_emitters.py` pattern: get registry via `get_telemetry_registry()`, check `registry.is_initialized()`, then create `TelemetryCollector(registry=registry)`.

## Complexity Tracking

No violations to justify.
