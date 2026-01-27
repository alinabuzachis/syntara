# Implementation Plan: Extend Metrics Collection for All Nexus Components

**Branch**: `027-nexus-component-performance-kpi`
**Date**: 2026-01-21
**Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/027-nexus-component-performance-kpi/spec.md`

## Summary

Extend the existing MetricsRecorder class from spec 025-llm-agent-performance-kpis to add metrics collection capabilities for all 9 Nexus component categories. The MetricsRecorder service is enhanced with new methods to query component-specific metrics endpoints (`/api/v1/{component}/metrics`) and store all component metrics in the metrics store for external performance testing and KPI evaluation.

**Note on External Performance Testing Tools**: Locust (load testing), RAGAS (quality metrics), and Guidellm (LLM evaluation) are imdependent external tools.

## Technical Context
**Language/Version**: Python 3.12
**Primary Dependencies**: FastAPI, SQLModel (for unified data models)
**Storage**: In-memory metrics store (extends spec 025 MetricsRecorder), not persisted to database
**Testing**: pytest with async support
**Target Platform**: Linux server (Nexus backend service)
**Project Type**: single (backend service extension)
**Performance Goals**: Metrics collection adds <1% overhead to component operations, metrics available within 10 seconds of collection
**Constraints**: Metrics recording must be asynchronous and non-blocking (MetricsRecorder from spec 025 already supports this)
**Scale/Scope**: 9 component categories, support for concurrent collection from all components, storage of component metrics

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Technology Standards Compliance
- [x] **SQLModel for Data Models**: All data models use SQLModel (not separate Pydantic + SQLAlchemy) - extends existing MetricRecord from spec 025

### Code Architecture Compliance
- [x] **DRY Principle**: Design avoids code duplication through proper abstraction - extends existing MetricsRecorder, reuses infrastructure
- [x] **SOLID Principles**: Design follows Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion - extends existing class with new methods
- [x] **Separation of Concerns**: Clear boundaries between layers (presentation, business logic, data access) - MetricsRecorder queries and stores, components expose
- [x] **Dependency Injection**: Dependencies are explicitly injected via constructors - MetricsRecorder injected into components
- [x] **Composition vs Inheritance**: Design uses composition over inheritance unless clear "is-a" relationship exists - extends MetricsRecorder (is-a relationship)

### API Specification Standards Compliance
- [x] **OpenAPI/AsyncAPI Compliance**: REST APIs use latest OpenAPI spec; WebSocket/async APIs use AsyncAPI v3.0.0+ - unified metrics endpoint uses OpenAPI (from spec 025)
- [x] **Naming Convention**: API specs follow snake_case pattern for all names
- [x] **Documentation Completeness**: All endpoints/operations fully documented with descriptions, parameters, examples
- [x] **RFC 9457 Error Format**: Error responses follow Problem Details standard with type, title, status, detail, instance
- [x] **Error Message Safety**: Error messages are actionable and don't expose internal implementation details
- [x] **API Versioning**: APIs implement semantic versioning with clear version communication (URL path or header) - uses /api/v1/
- [x] **API Path Structure**: All endpoints follow pattern /api/v1/[component]/[resource] - unified metrics endpoint: /api/v1/metrics (from spec 025)
- [x] **Pagination Support**: All collection endpoints support pagination with limit and cursor parameters - extends existing query capabilities
- [x] **Filtering/Sorting Consistency**: Filtering and sorting parameters follow consistent patterns across endpoints - extends existing filtering
- [x] **Security Documentation**: Authenticated endpoints document security schemes, authentication requirements, and scopes
- [x] **Schema Compatibility**: Schema changes validated for backward compatibility; breaking changes require major version bump - extends existing endpoint

## Project Structure

### Documentation (this feature)
```
specs/027-nexus-component-performance-kpi/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
src/nexus/metrics/
├── recorder.py          # MetricsRecorder class (from spec 025, used as-is)
└── types.py             # MetricType enum (extends spec 025 with component types)


tests/
├── unit/metrics/
│   └── test_types.py    # Test MetricType extensions
└── integration/metrics/
    └── test_component_metrics.py  # Test component metrics recording and filtering
```

**Structure Decision**: Option 1 (single project) - backend service extension

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - Component instrumentation patterns
   - Component endpoint implementation
   - Component label validation requirements

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all technical decisions documented

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Extend MetricType enum with component-specific metric types
   - Document component label requirements

2. **Verify API contracts** from functional requirements:
   - Unified `/api/v1/metrics` endpoint (from spec 025) already supports label filtering including component labels

3. **Generate integration tests** for component metrics:
   - Test component metrics recording with component labels
   - Test unified endpoint filtering by component label
   - Tests verify component label filtering works correctly

4. **Extract test scenarios** from user stories:
   - Component instrumentation scenarios (recording with component labels)
   - Unified endpoint query scenarios (filtering by component label)
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, src/nexus/schemas/metrics/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (schemas, data model, quickstart)
- Each schema → contract test task [P]
- Component instrumentation → guidance/documentation tasks
- Integration tests for component recording and unified endpoint filtering

**Ordering Strategy**:
- TDD order: Tests before implementation
- Dependency order: MetricType extensions → Component instrumentation → Integration tests
- Mark [P] for parallel execution (independent files)


## Progress Tracking

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented
