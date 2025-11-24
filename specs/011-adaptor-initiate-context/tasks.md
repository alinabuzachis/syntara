# Tasks: Invocation Context Integration

**Input**: Design documents from `/specs/011-adaptor-initiate-context/`
**Prerequisites**: plan.md (required), research.md, data-model.md, quickstart.md

## Execution Flow (main)
```
1. Load plan.md from feature directory
   ✅ Found: Python 3.12, FastAPI, SQLModel, Context Manager integration
2. Load optional design documents:
   ✅ data-model.md: Enhanced response structure, no new models needed
   ✅ research.md: Service composition pattern, graceful degradation
   ✅ quickstart.md: 5 validation scenarios for testing
3. Generate tasks by category:
   ✅ Setup: Context Manager imports, utilities
   ✅ Tests: Integration tests, error scenarios
   ✅ Core: InvocationService modification, prompt enhancement
   ✅ Integration: Error handling, response enhancement
4. Apply task rules:
   ✅ Different files = mark [P] for parallel
   ✅ Same file = sequential (no [P])
   ✅ Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   ✅ All requirements have implementation tasks
   ✅ All test scenarios have test tasks
   ✅ Integration points covered
9. Return: SUCCESS (tasks ready for execution)
```

## Task Dependencies and Parallel Execution

```mermaid
graph TD
    subgraph "Phase 1: Foundation"
        T001[T001 Setup imports]
    end

    subgraph "Phase 2: Tests (TDD)"
        T002[T002 Basic integration test]
        T003[T003 Backward compatibility test]
        T004[T004 Error handling test]
        T005[T005 Context quality test]
        T006[T006 Performance test]
    end

    subgraph "Phase 3: Implementation"
        T007[T007 InvocationService integration]
        T008[T008 Error handling implementation]
    end

    subgraph "Phase 4: Validation"
        T009[T009 Integration testing]
        T010[T010 Documentation update]
    end

    %% Dependencies
    T001 --> T002
    T001 --> T003
    T001 --> T004
    T001 --> T005
    T001 --> T006
    T002 --> T007
    T003 --> T007
    T004 --> T008
    T007 --> T009
    T008 --> T009
    T009 --> T010

    %% Parallel markers
    T002 -.->|[P]| T003
    T003 -.->|[P]| T004
    T004 -.->|[P]| T005
    T005 -.->|[P]| T006

    classDef parallel fill:#e8f5e8,stroke:#388e3c
    classDef sequential fill:#fff3e0,stroke:#f57c00
    classDef test fill:#e3f2fd,stroke:#1976d2

    class T002,T003,T004,T005,T006 parallel
    class T001,T007,T008,T009,T010 sequential
    class T002,T003,T004,T005,T006 test
```

## Format: `[ID] [P?] [US?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[US1]**: All tasks serve the primary user story (automatic context enrichment)
- Include exact file paths in descriptions

## Path Conventions
- **Single project**: `src/`, `tests/` at repository root (per plan.md)
- Context Manager already available at `src/nexus/agent_orchestrator/context_manager/`
- Target file: `src/nexus/agent_orchestrator/services/invocation_service.py`

## Phase 1: Setup & Foundation

- [x] T001 [US1] Import Context Manager components in src/nexus/agent_orchestrator/services/invocation_service.py

## Phase 2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE PHASE 3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

- [x] T002 [P] [US1] Integration test for basic context enhancement in tests/integration/api/test_context_enhanced_invocations.py
- [x] T003 [P] [US1] Integration test for error handling and fallback in tests/integration/api/test_context_error_handling.py
- [x] T004 [P] [US1] Integration test for context quality validation in tests/integration/api/test_context_quality_metrics.py
- [x] T005 [P] [US1] Integration test for performance impact assessment in tests/integration/api/test_context_performance_impact.py

## Phase 3: Core Implementation (ONLY after tests are failing)

**Architecture Reminders**:
- Apply DRY principle - extract reusable functions/classes
- Follow SOLID principles - single responsibility per class
- Use dependency injection - inject dependencies via constructors
- Prefer composition over inheritance
- Maintain clear separation of concerns
- **Use SQLModel for all data models** - unified models for database tables and API schemas (not separate Pydantic + SQLAlchemy)

**API Specification Reminders**:
- Document all REST APIs with OpenAPI spec (latest version)
- Use snake_case for all API spec names (parameters, properties, schemas)
- All endpoints must follow path pattern: /api/v1/[component]/[resource]
- Implement RFC 9457 Problem Details for error responses
- All collection endpoints must support pagination (limit and cursor)
- Validate schema changes for backward compatibility

- [x] T007 [US1] Integrate Context Manager in InvocationService._execute_invocation() method in src/nexus/agent_orchestrator/services/invocation_service.py
- [x] T008 [US1] Implement error handling and graceful fallback logic in src/nexus/agent_orchestrator/services/invocation_service.py

## Phase 4: Integration & Validation

- [x] T009 [US1] Run full integration test suite and validate all quickstart scenarios
- [x] T010 [US1] Update API documentation for enhanced response fields in existing OpenAPI spec

## Implementation Strategy

### MVP Scope (Recommended First Release)
- **Primary Focus**: Tasks T001-T009 (core context integration)
- **Success Criteria**:
  - Context Manager automatically called on invocations
  - Enhanced responses include correlation_id and grounding_score
  - Backward compatibility maintained
  - Graceful fallback on Context Manager failures

### Parallel Execution Examples

**Phase 1** - Foundation:
```bash
# Terminal 1: Setup imports (T001)
```

**Phase 2** - Test Development (All in parallel):
```bash
# Terminal 1: Basic integration test (T002)
# Terminal 2: Backward compatibility test (T003)
# Terminal 3: Error handling test (T004)
# Terminal 4: Context quality test (T005)
# Terminal 5: Performance test (T006)
```

**Phase 3** - Implementation (Sequential):
```bash
# Must complete T007 before T008 (both modify same file)
# T007: Context Manager integration (includes inline prompt formatting)
# T008: Error handling (depends on T007 integration points)
```

## User Story Mapping

### US1: Automatic Context Enrichment
**Goal**: API users receive context-enriched responses automatically without manual context provision

**Tasks**: T001-T010 (all tasks serve this user story)

**Acceptance Criteria** (from spec.md):
- [x] FR-001: Automatic context building (T001, T007)
- [x] FR-002: Prompt enrichment (T007)
- [x] FR-003: Enhanced response metadata (T007)
- [x] FR-004: Unique trace ID provision (T007)
- [x] FR-005: Grounding score inclusion (T007)
- [x] FR-006: Backward compatibility (T003, T007)
- [x] FR-007: Graceful error handling (T004, T008)
- [x] FR-008: Original prompt preservation (T007)
- [x] FR-009: Context formatting optimization (T007)
- [x] FR-010: Response and metadata access (T007)

**Independent Test Criteria**:
- ✅ Context enhancement works end-to-end (T002)
- ✅ Existing clients unaffected (T003)
- ✅ System resilient to Context Manager failures (T004)
- ✅ Context quality measurable via grounding scores (T005)
- ✅ Performance impact acceptable (T006)

## Dependencies Summary

**External Dependencies**:
- ✅ Context Manager scaffolding (PR #162) - Already available
- ✅ Existing InvocationService - Target for modification
- ✅ GenericAgent - No changes needed
- ✅ FastAPI/SQLModel infrastructure - Leverages existing

**Task Dependencies**:
- **Blocking**: T001 must complete before T007 (imports needed)
- **Sequential**: T007 must complete before T008 (same file modifications)
- **Parallel Opportunities**: T002-T006 (independent test files)
- **Prerequisites**: All Phase 2 tests must fail before Phase 3 implementation

## Task Completeness Validation

✅ **All functional requirements mapped to tasks**
✅ **All test scenarios from quickstart.md covered**
✅ **Error handling requirements addressed**
✅ **Performance monitoring included**
✅ **Documentation updates planned**
✅ **Backward compatibility verified**
✅ **Integration points identified**

**Total Tasks**: 10 tasks
**Parallel Tasks**: 5 tasks (T002-T006)
**Sequential Tasks**: 5 tasks (T001, T007-T010)
**Test Tasks**: 5 tasks (T002-T006)
**Implementation Tasks**: 3 tasks (T001, T007-T008)
**Integration Tasks**: 2 tasks (T009-T010)
