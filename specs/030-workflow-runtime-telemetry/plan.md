# Implementation Plan: Workflow Runtime Telemetry

**Branch**: `030-workflow-runtime-telemetry` | **Date**: 2026-02-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-workflow-runtime-telemetry/spec.md`

## Summary

Implement automated telemetry collection for workflow execution events transmitted to Segment.com for product analytics. The system captures workflow timing, activity execution details, and success/failure indicators using Segment Python SDK with fire-and-forget transmission model. Zero-configuration deployment via build-time API key injection ensures telemetry is enabled by default without impacting workflow execution performance (<5% overhead).

## Technical Context

**Language/Version**: Python 3.12+
**Primary Dependencies**: Segment Analytics Python SDK ([segment-analytics-python](https://github.com/segmentio/analytics-python)), FastAPI, Temporalio, SQLModel
**Storage**: PostgreSQL (for workflow/activity metadata), No local telemetry persistence (fire-and-forget via Segment SDK)
**Testing**: pytest, pytest-asyncio, respx (for Segment API mocking)
**Target Platform**: Linux server (containerized deployment)
**Project Type**: single (monolithic service with modular components)
**Performance Goals**: <5% telemetry overhead, async event transmission, zero workflow execution failures due to telemetry
**Constraints**: Fire-and-forget model (no local persistence), Segment rate limits (dedicated account with higher limits), privacy requirements (no PII/parameter values)
**Scale/Scope**: All workflow executions across all Nexus installations, expected event volume handled by dedicated Segment account

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principles Compliance

- [x] **I. Modular Architecture**: Telemetry module designed as independent component (`/src/nexus/telemetry/`) with clear interfaces. No hidden dependencies on workflow engine internals.
- [x] **II. Test-Driven Development**: All telemetry logic will follow TDD. Unit tests for event construction (Pydantic validation), integration tests for Segment SDK interaction, contract tests for Pydantic model consistency.
- [x] **III. Explicit Configuration**: Segment write key injected at build time (explicit), telemetry enabled by default (documented), no magic values.
- [x] **IV. Observability First**: Telemetry module itself emits structured logs for transmission failures, success rates, performance metrics via existing logging infrastructure.
- [x] **V. API Stability**: Internal telemetry API follows semantic versioning. Event schemas versioned and backward-compatible. Breaking changes require migration.

### Development Standards Compliance

**Code Architecture**:
- [x] **DRY Principle**: Event construction logic centralized in event builder classes, reused across workflow/activity telemetry
- [x] **SOLID Principles**:
  - Single Responsibility: TelemetryCollector (event capture), TelemetryClient (Segment transmission), EventBuilder (event construction)
  - Open/Closed: Event builders extensible for new event types without modifying core logic
  - Dependency Inversion: Workflow engine depends on telemetry abstraction, not concrete Segment implementation
- [x] **Separation of Concerns**: Telemetry module isolated from workflow business logic, injected via hooks/interceptors
- [x] **Dependency Injection**: Segment client accessed via singleton registry pattern (TelemetryClientRegistry), mock-able for testing via registry replacement
- [x] **Composition vs Inheritance**: Event builders use composition (has-a relationship with data sources), not inheritance

**API Specification Standards**:
- [x] **OpenAPI/AsyncAPI**: Not applicable - telemetry is internal service, not exposed via API endpoints. Event contracts defined as Pydantic models; JSON schemas auto-generated for documentation.
- [x] **Error Handling**: Telemetry transmission errors logged (RFC 9457 format) but do not propagate to workflow execution
- [x] **Versioning**: Event schemas include version field for future evolution
- [x] **Security**: Segment write key is build-time secret (not runtime-managed), events sanitized to exclude PII/credentials

**Code Quality**:
- [x] **Linting/Formatting**: Ruff configured in pyproject.toml, all telemetry code passes linting
- [x] **Type Checking**: MyPy strict mode enabled, all telemetry functions fully typed
- [x] **Test Coverage**: Minimum 90% coverage for telemetry module (unit + integration tests)
- [x] **CI Checks**: All CI checks pass before merge (linting, type checking, tests, security scanning)

**Code Style**:
- [x] **Naming**: Descriptive names (e.g., `WorkflowExecutionEventBuilder`, `SegmentTelemetryClient`), no single-letter vars
- [x] **Constants**: Segment endpoint URLs, event names as UPPER_CASE_WITH_UNDERSCORES
- [x] **Documentation**: All public classes/methods documented with docstrings, including SDK usage examples

**Documentation**:
- [x] **Docstrings**: All telemetry classes/methods documented with purpose, parameters, return values, exceptions
- [x] **README**: Telemetry architecture overview in `/docs/telemetry.md`
- [x] **SDP Reference**: Implementation aligned with [ANSTRAT-1748-P1](../../../Documents/RedHat/lightspeed/handbook/The Ansible Engineering Handbook/proposals/ANSTRAT-1748-P1-Agentic-Automation-Telemetry-Observability.md)

### Workflow & Process Compliance

- [x] **Feature Branch**: Working on `030-workflow-runtime-telemetry`
- [x] **Pull Requests**: All changes via PR with CI/CD checks
- [x] **Code Review**: Minimum one approval required, focus on privacy/performance
- [x] **Squash Merge**: Clean history for telemetry feature

### No Violations

All constitution requirements satisfied. No complexity justification needed.

## Project Structure

### Documentation (this feature)

```text
specs/030-workflow-runtime-telemetry/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/nexus/
├── telemetry/                      # NEW: Telemetry module
│   ├── __init__.py
│   ├── client.py                   # SegmentTelemetryClient (Segment SDK wrapper)
│   ├── collector.py                # TelemetryCollector (event capture service)
│   ├── events/                     # Pydantic event models and builders
│   │   ├── __init__.py
│   │   ├── base.py                 # BaseTelemetryEvent (abstract Pydantic base)
│   │   ├── workflow_execution.py  # WorkflowExecutionStartEvent and WorkflowExecutionCompletedEvent (frozen BaseModel) + builders
│   │   └── activity_execution.py  # ActivityExecutionEvent (frozen BaseModel) + builder
│   ├── interceptors/               # Workflow engine hooks
│   │   ├── __init__.py
│   │   ├── workflow_interceptor.py # TelemetryWorkflowInboundInterceptor (workflow lifecycle)
│   │   └── activity_interceptor.py # TelemetryActivityInboundInterceptor (activity execution)
│   └── sanitizers/                 # Data privacy sanitization
│       ├── __init__.py
│       └── data_sanitizer.py       # DataSanitizer (data sanitization)
├── workflows/
│   └── workflow_engine/
│       ├── dynamic_workflow.py     # MODIFIED: Add telemetry hooks
│       └── interceptors/           # EXISTING: Hook registration
└── core/
    └── config/
        └── base.py                  # MODIFIED: Add TelemetrySettings (Pydantic BaseSettings)

tests/
├── unit/
│   └── telemetry/                   # NEW: Telemetry unit tests
│       ├── test_client.py
│       ├── test_collector.py
│       ├── test_events.py
│       └── test_sanitizers.py
├── integration/
│   └── telemetry/                   # NEW: Telemetry integration tests
│       └── test_segment_transmission.py
└── contract/
    └── telemetry/                   # NEW: Event schema validation tests
        └── test_event_schemas.py

src/nexus/schemas/telemetry/         # NEW: Auto-generated JSON schemas (per constitution)
├── workflow_execution_started.json  # Generated from WorkflowExecutionStartEvent
├── workflow_execution_completed.json # Generated from WorkflowExecutionCompletedEvent
└── activity_execution.json          # Generated from ActivityExecutionEvent

scripts/
└── generate_telemetry_schemas.py    # NEW: Schema generation from Pydantic models

docs/
└── telemetry.md                     # NEW: Telemetry architecture documentation
```

**Structure Decision**: Single project structure with new `/src/nexus/telemetry/` module. Telemetry is a cross-cutting concern integrated via workflow engine interceptors (existing pattern in codebase). All telemetry logic isolated in dedicated module following modular architecture principle. Event schemas stored in `src/nexus/schemas/telemetry/` following constitution's API specification standards.

---

## Architecture Flow

### Component Interaction

```
┌─────────────────────────────────────────────────────────────────┐
│ Temporal Worker Process                                         │
│                                                                  │
│  ┌────────────────────┐                                         │
│  │ Workflow Execution │                                         │
│  └────────┬───────────┘                                         │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────┐                        │
│  │ TelemetryWorkflowInboundInterceptor │                        │
│  │  - Captures workflow start          │                        │
│  │  - Generates correlation_id (UUID)  │                        │
│  │  - Stores in workflow context       │                        │
│  │  - Captures workflow completion     │                        │
│  └────────┬────────────────────────────┘                        │
│           │                                                      │
│           │  Creates/Uses                                        │
│           ▼                                                      │
│  ┌─────────────────────────────────────┐                        │
│  │ TelemetryCollector                  │                        │
│  │  - Builds event objects             │                        │
│  │  - Extracts workflow hash           │                        │
│  │  - Extracts activity metadata       │                        │
│  └────────┬────────────────────────────┘                        │
│           │                                                      │
│           │  Sends events to                                     │
│           ▼                                                      │
│  ┌─────────────────────────────────────┐                        │
│  │ TelemetryClientRegistry (Singleton) │                        │
│  │  - get_client() → Segment Client    │                        │
│  └────────┬────────────────────────────┘                        │
│           │                                                      │
│           │  analytics.track()                                   │
│           ▼                                                      │
│  ┌─────────────────────────────────────┐                        │
│  │ Segment Python SDK                  │                        │
│  │  - Background thread batching       │                        │
│  │  - Async transmission               │                        │
│  └────────┬────────────────────────────┘                        │
│           │                                                      │
└───────────┼──────────────────────────────────────────────────────┘
            │
            │  HTTPS POST
            ▼
   ┌─────────────────┐
   │  Segment.com    │
   │  Track API      │
   └─────────────────┘
```

### Initialization Sequence

1. **Worker Startup**: `TelemetryClientRegistry().initialize(segment_key)`
2. **Worker Shutdown**: `TelemetryClientRegistry().shutdown()` flushes events

---

## Phase 0: Research

**Status**: ✅ Complete
**Output**: `research.md` (see file for decisions)

### Research Tasks

1. **Segment Python SDK Integration Patterns**
   - **Question**: What are best practices for integrating Segment Analytics Python SDK in async Python applications?
   - **Focus Areas**:
     - SDK initialization patterns (singleton vs dependency injection)
     - Async/await compatibility and thread safety
     - Batching configuration (default: 100 events or 0.5s)
     - Error handling and retry mechanisms
     - Memory limits and queue overflow behavior
   - **Decision Needed**: SDK client lifecycle management (application startup vs lazy initialization)

2. **Workflow Execution Interception Points**
   - **Question**: How to inject telemetry hooks into Temporalio workflow engine without modifying core business logic?
   - **Focus Areas**:
     - Temporalio interceptor patterns (workflow/activity interceptors)
     - Existing `/src/nexus/workflows/workflow_engine/interceptors/` patterns
     - Event extraction from `DynamicWorkflow` execution context
     - Activity-level vs workflow-level hook granularity
   - **Decision Needed**: Interceptor registration location and telemetry event trigger points

3. **Build-Time Secret Injection for Container Images**
   - **Question**: How to securely inject Segment write key into container image at build time for zero-configuration deployment?
   - **Focus Areas**:
     - Dockerfile ARG vs ENV vs build secrets
     - Security implications of embedded keys (write-only, shared across installations)
     - Key rotation strategy (image rebuild required)
     - Reference implementation from aap-mcp-server (SDP alignment)
   - **Decision Needed**: Build process modifications and key storage location in image

4. **Workflow Telemetry Event Schema Design**
   - **Question**: How to structure telemetry events to capture workflow execution details while ensuring privacy and performance?
   - **Focus Areas**:
     - Event field naming conventions (snake_case per constitution)
     - Required fields: entitlement_id, correlation_id, timestamps, status
     - Optional fields: activity_count, error_count, workflow_complexity_score, workflow_depth
     - Extension metadata structure (source, identifier, version)
     - Execution metadata extraction (types only, no values)
   - **Decision Needed**: JSON Schema format and versioning strategy

5. **Async Telemetry Performance Monitoring**
   - **Question**: How to measure and validate <5% telemetry overhead requirement in production?
   - **Focus Areas**:
     - Workflow execution timing instrumentation (start/end timestamps)
     - Telemetry overhead calculation (with/without telemetry comparison)
     - Performance test scenarios (small/large workflows, high-frequency execution)
     - Metric collection for observability (telemetry success rate, latency)
   - **Decision Needed**: Performance testing approach and acceptance criteria validation

### Consolidation Format

For each research task, `research.md` will document:

```markdown
## [Research Task Name]

### Decision
[What was chosen as the implementation approach]

### Rationale
[Why this approach was selected - technical justification]

### Alternatives Considered
[Other options evaluated and reasons for rejection]

### Implementation Notes
[Specific code examples, configuration values, or patterns to apply]
```

## Phase 1: Design & Contracts

**Status**: ✅ Complete
**Prerequisites**: `research.md` complete with all decisions resolved ✅
**Outputs**: `data-model.md`, `quickstart.md`, `.specify/memory/claude.md` (updated)

### 1. Data Model Design

**Goal**: Define telemetry event data structures and relationships

`data-model.md` will include:

#### Core Entities

**WorkflowExecutionStartEvent and WorkflowExecutionCompletedEvent**
- **Purpose**: Represent telemetry for workflow lifecycle (start and completion events)
- **Fields** (WorkflowExecutionStartEvent):
  - `entitlement_id` (string, required): Unique Nexus installation identifier
  - `correlation_id` (string, required): Unique workflow execution identifier (UUID v4)
  - `workflow_hash` (string, required): SHA-256 hash of workflow definition
- **Fields** (WorkflowExecutionCompletedEvent):
  - `workflow_hash` (string, required): SHA-256 hash of workflow definition
  - `status` (enum, required): "success" | "failed" | "timeout" | "cancelled"
  - `duration_ms` (integer, required): Duration in milliseconds
  - `activity_count` (integer, required): Total number of activities executed
  - `error_count` (integer, required): Number of activities that failed
  - `workflow_complexity_score` (integer, optional): Complexity metric
  - `workflow_depth` (integer, optional): Maximum nesting level
  - `error_type` (enum, optional): `ActivityExecutionError` (when status is "failed")
- **Timestamp Handling**: Segment automatically adds timestamps; not included in event properties
- **Validation Rules**:
  - `duration_ms` calculated from Segment timestamps: `complete_event.timestamp - start_event.timestamp`
  - `error_count` = 0 when `status = "success"`
- **Relationships**: Both events link to ActivityExecutionEvents via `correlation_id`

#### State Transitions

**Workflow Execution Lifecycle**:
1. `Workflow Execution Started` event → workflow begins
2. Multiple `Activity Executed` events → activities execute
3. `Workflow Execution Completed` event → workflow completes (success/failed/timeout/cancelled)

### 2. API Contracts

**Note**: Telemetry events are defined as Pydantic models (single source of truth). JSON schemas are auto-generated for documentation and external validation purposes.

#### Primary Contracts (Source of Truth)

**Location**: `/src/nexus/telemetry/events/`

**Files**:
- `workflow_execution.py` - WorkflowExecutionStartEvent, WorkflowExecutionCompletedEvent (Pydantic models)
- `activity_execution.py` - ActivityExecutionEvent (Pydantic model)

#### Generated JSON Schemas (Derived)

**Location**: `/src/nexus/schemas/telemetry/` (per constitution)

**Files** (auto-generated from Pydantic models):
1. `workflow_execution_started.json` - Generated from WorkflowExecutionStartEvent
2. `workflow_execution_completed.json` - Generated from WorkflowExecutionCompletedEvent
3. `activity_execution.json` - Generated from ActivityExecutionEvent

**Schema Generation Workflow**:
```bash
# Regenerate schemas after Pydantic model changes
make generate-schemas

# CI validates schemas are in sync with Pydantic models
make validate-schemas
```

**Pydantic Model Example**:

```python
from pydantic import BaseModel, ConfigDict, Field

class WorkflowExecutionStartEvent(BaseModel):
    """Telemetry event emitted when workflow execution begins."""

    entitlement_id: str = Field(
        min_length=1,
        description="Unique Nexus installation identifier for anonymized tracking"
    )
    correlation_id: str = Field(
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        description="Unique workflow execution identifier (UUID v4 format)"
    )
    workflow_hash: str = Field(
        pattern=r"^[a-f0-9]{64}$",
        description="SHA-256 hash of workflow definition"
    )
```

**Validation Strategy**:
- **Runtime**: Pydantic validates events when constructed (automatic)
- **Build-time**: JSON schemas generated via `model.model_json_schema()` (see `scripts/generate_telemetry_schemas.py`)
- **Tests**: Contract tests verify Pydantic models produce valid JSON schemas
- **CI**: Automated check ensures schemas stay synchronized with Pydantic models

**Why Pydantic-First?**
- Single source of truth (no dual maintenance)
- Type safety and IDE support (mypy strict mode)
- Automatic runtime validation
- Easier refactoring (rename in Python → all references update)
- Aligns with existing Nexus patterns (Pydantic BaseSettings)

### 3. Quickstart Guide

**Output**: `/specs/030-workflow-runtime-telemetry/quickstart.md`

**Content Outline**:

```markdown
# Workflow Runtime Telemetry - Quickstart

## Overview
Brief explanation of telemetry feature, Segment integration, always-on default behavior.

## Architecture
- Telemetry module (`/src/nexus/telemetry/`)
- Workflow engine integration (interceptors)
- Event flow diagram (workflow → telemetry → Segment)

## Development Setup

### Prerequisites
- Segment write API key (for testing, use test key)
- Running Nexus development environment

### Configuration
- Segment key injection (build-time vs dev environment variable)
- Enabling/disabling telemetry for local development

### Running Tests
```bash
# Unit tests
make test-unit module=telemetry

# Integration tests (requires Segment mock)
make test-integration module=telemetry

# Contract tests (event schema validation)
make test-contract module=telemetry
```

## Testing Telemetry Locally

### Mock Segment Endpoint
How to use respx to mock Segment API for local testing

### Verifying Event Transmission
How to inspect telemetry events sent to Segment (logs, debug mode)

### Performance Testing
How to run performance tests to validate <5% overhead

## Troubleshooting

### Common Issues
- Segment SDK connection failures
- Event schema validation errors
- Performance overhead exceeds target

### Debug Mode
How to enable telemetry debug logging

## References
- [Feature Spec](./spec.md)
- [Implementation Plan](./plan.md)
- [SDP: ANSTRAT-1748-P1](...)
```

### 4. Agent Context Update

**Action**: Run `.specify/scripts/bash/update-agent-context.sh claude`

**Expected Changes**:
- Add Segment Python SDK to technology list in `.specify/memory/claude.md`
- Add telemetry architecture context (fire-and-forget, event-driven)
- Add privacy/sanitization requirements for future reference
- Preserve existing manual additions between markers

## Phase 2: Task Generation

**Status**: ✅ Complete
**Output**: `tasks.md` (see file for task breakdown)

---

## Next Steps

1. **Review this plan**: Ensure technical approach aligns with SDP and project requirements
2. **Run Phase 0 research**: Execute research tasks to resolve all "NEEDS CLARIFICATION" items
3. **Complete Phase 1 design**: Generate data models, contracts, and quickstart guide
4. **Generate tasks**: Run `/speckit.tasks` to create actionable task breakdown
5. **Begin implementation**: Follow TDD workflow per constitution

## References

- **Parent SDP**: [ANSTRAT-1748-Agentic-Automation-Telemetry-Observability](../../../Documents/RedHat/lightspeed/handbook/The Ansible Engineering Handbook/System Design Plans/ANSTRAT-1748-Agentic-Automation-Telemetry-Observability.md)
- **Proposal**: [ANSTRAT-1748-P1-Agentic-Automation-Telemetry-Observability](../../../Documents/RedHat/lightspeed/handbook/The Ansible Engineering Handbook/proposals/ANSTRAT-1748-P1-Agentic-Automation-Telemetry-Observability.md)
- **Segment SDK**: [segment-analytics-python](https://github.com/segmentio/analytics-python)
- **Nexus Constitution**: [.specify/memory/constitution.md](../../.specify/memory/constitution.md)
