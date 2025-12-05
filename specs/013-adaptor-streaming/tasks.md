# Tasks: Adaptor Streaming

**Input**: Design documents from `/specs/013-adaptor-streaming/`
**Prerequisites**: plan.md (required), research.md, data-model.md, src/nexus/schemas/agent_orchestrator/websocket-adaptor_streaming.yaml

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack (Python 3.12+, LangChain/LangGraph, Valkey, FastAPI), structure (backend API enhancement)
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → src/nexus/schemas/agent_orchestrator/websocket-adaptor_streaming.yaml: WebSocket event schemas → contract test tasks
   → research.md: Extract decisions → setup tasks
   → quickstart.md: Integration scenarios → integration test tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests for WebSocket schemas, integration tests for streaming scenarios
   → Core: streaming logic, event publishing, WebSocket handlers
   → Integration: Valkey connection
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All schemas have tests?
   → All entities have model tasks?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Backend API service**: `src/nexus/`, `tests/` at repository root
- Paths follow project structure: agent_orchestrator, core, tests

## Phase 3.1: Setup
- [X] T001 Configure LLM streaming API credentials and LangChain/LangGraph integration
- [X] T002 Set up Valkey connection for event streams in core configuration
- [X] T003 [P] Configure pytest-asyncio for WebSocket streaming tests

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [X] T004 [P] Contract test for StreamingEvent delta schema in tests/contract/test_streaming_events.py
- [X] T005 [P] Contract test for StreamingEvent error schema in tests/contract/test_streaming_events.py
- [X] T006 [P] Contract test for StreamingEvent completion schema in tests/contract/test_streaming_events.py
- [X] T007 [P] Contract test for StreamingEvent cancelled schema in tests/contract/test_streaming_events.py
- [x] T008 [P] Integration test streaming LLM response end-to-end in tests/integration/websocket/test_websocket_streaming.py
- [x] T009 [P] Integration test multi-client streaming synchronization in tests/integration/websocket/test_websocket_streaming.py
- [x] T010 [P] Integration test error handling and cancellation in tests/integration/websocket/test_websocket_streaming.py
  - ✅ Constitution compliance: WebSocket error events follow RFC 9457 Problem Details format
- [x] T011 [P] Integration test historical event replay in tests/integration/websocket/test_websocket_streaming.py

## Phase 3.3: Core Implementation (ONLY after tests are failing)
**Architecture Reminders**:
- Apply DRY principle - extract reusable functions/classes
- Follow SOLID principles - single responsibility per class
- Use dependency injection - inject dependencies via constructors
- Prefer composition over inheritance
- Maintain clear separation of concerns
- **Use SQLModel for all data models** - unified models for database tables and API schemas (not separate Pydantic + SQLAlchemy)

**API Specification Reminders**:
- Document all REST APIs with OpenAPI spec (latest version)
- Document all WebSocket/async APIs with AsyncAPI v3.0.0+
- Use snake_case for all API spec names (parameters, properties, schemas)
- All endpoints must follow path pattern: /api/v1/[component]/[resource]
- Implement RFC 9457 Problem Details for error responses
- All collection endpoints must support pagination (limit and cursor)
- Document security schemes for authenticated endpoints
- Validate schema changes for backward compatibility

- [X] T012 Add new GenericAgent.stream() method with LangChain/LangGraph streaming support (astream()/astream_events()) and remove execute() method in src/nexus/agent_orchestrator/agents/generic_agent.py
- [X] T013 Create WebSocket streaming service in src/nexus/agent_orchestrator/services/streaming_service.py
- [X] T014 [P] Implement Valkey stream client for publishing and reading events in src/nexus/core/valkey/stream.py
- [X] T015 Create WebSocket handler for invocation streaming in src/nexus/ws/agent_orchestrator.py
- [X] T016 Integrate streaming with existing InvocationService in src/nexus/agent_orchestrator/agents/generic_agent.py
- [X] T017 Add invocation status management during streaming lifecycle in src/nexus/agent_orchestrator/services/invocation_service.py
- [X] T018 Add error classification for streaming exceptions in src/nexus/agent_orchestrator/services/error_handler.py
- [X] T019 Implement WebSocket connection lifecycle management in src/nexus/core/websocket/manager.py

## Phase 3.4: Integration
- [x] T020 Configure Valkey stream TTL and cleanup in core configuration

## Phase 3.5: Polish
- [X] T021 [P] Unit tests for streaming service in tests/unit/agent_orchestrator/test_streaming_session.py
- [X] T022 [P] Unit tests for Valkey stream client in tests/unit/core/valkey/test_stream.py
- [X] T023 [P] Unit tests for error classification in tests/unit/agent_orchestrator/test_error_handler.py
- [X] T024 [P] Unit tests for invocation status management in tests/unit/agent_orchestrator/test_invocation_status.py
- [x] T025 Run manual testing scenarios from quickstart.md
- [X] T026 Refactor: Remove duplication (DRY), ensure SOLID compliance across streaming components

## Dependencies
- Tests (T004-T011) before implementation (T012-T019)
- T012 blocks T013, T016
- T014 blocks T015
- T013 blocks T020
- T016 blocks T017 (status management depends on service integration)
- T017 blocks T024 (status management tests)
- T018 blocks T023 (error classification tests)
- T014 blocks T022 (stream client tests)
- Implementation before polish (T021-T026)

## Parallel Execution Examples

```bash
# Launch all contract tests together (different files, no conflicts):
Task: "Contract test for StreamingEvent delta schema in tests/contract/test_streaming_events.py"
Task: "Contract test for StreamingEvent error schema in tests/contract/test_streaming_events.py"
Task: "Contract test for StreamingEvent completion schema in tests/contract/test_streaming_events.py"
Task: "Contract test for StreamingEvent cancelled schema in tests/contract/test_streaming_events.py"
```

```bash
# Launch integration tests in parallel:
Task: "Integration test streaming LLM response end-to-end in tests/integration/websocket/test_websocket_streaming.py"
Task: "Integration test multi-client streaming synchronization in tests/integration/websocket/test_websocket_streaming.py"
Task: "Integration test error handling and cancellation in tests/integration/websocket/test_websocket_streaming.py"
Task: "Integration test historical event replay in tests/integration/websocket/test_websocket_streaming.py"
```

```bash
# Core streaming components (some can be parallel):
Task: "Create WebSocket streaming service in src/nexus/agent_orchestrator/services/streaming_service.py"
Task: "Implement Valkey stream client for publishing and reading events in src/nexus/core/valkey/stream.py" [P]
Task: "Create WebSocket handler for invocation streaming in src/nexus/ws/agent_orchestrator.py"
```

## Mermaid Diagram: Task Dependencies and Parallel Execution

```mermaid
graph TD
    %% Setup Phase
    SETUP[T001-T003: Setup] --> TESTS

    %% Test Phase (TDD)
    TESTS[T004-T011: Contract & Integration Tests]

    %% Core Implementation Phase
    TESTS --> CORE[T012-T019: Core Implementation]

    %% Core tasks with dependencies
    T012[Add GenericAgent.stream()] --> T013[Streaming Service]
    T012 --> T016[InvocationService integration]
    T013 --> T020[WebSocket router]

    T014[Valkey Stream Client] --> T015[WebSocket Handler]
    T014 --> T022[Stream Client Tests]

    T016 --> T017[Status Management]
    T017 --> T024[Status Management Tests]
    T018[Error Handler] --> T023[Error Handler Tests]

    %% Parallel tasks (marked with [P])
    CORE --> PARALLEL_CORE[Parallel Core Tasks]
    PARALLEL_CORE --> T014
    PARALLEL_CORE --> T019[Connection Manager]

    %% Integration Phase
    CORE --> INTEGRATION[T020: Integration]
    T013 --> T020
    INTEGRATION --> POLISH

    %% Polish Phase
    POLISH[T021-T026: Polish]

    %% Parallel polish tasks
    POLISH --> PARALLEL_POLISH[Parallel Polish Tasks]
    PARALLEL_POLISH --> T021
    PARALLEL_POLISH --> T022
    PARALLEL_POLISH --> T023
    PARALLEL_POLISH --> T024
    PARALLEL_POLISH --> T025
    PARALLEL_POLISH --> T026

    %% Styling
    classDef setupClass fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef testClass fill:#fff3e0,stroke:#ef6c00,stroke-width:2px
    classDef coreClass fill:#f3e5f5,stroke:#6a1b9a,stroke-width:2px
    classDef integrationClass fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
    classDef polishClass fill:#fff8e1,stroke:#f9a825,stroke-width:2px
    classDef parallelClass fill:#fce4ec,stroke:#c2185b,stroke-width:2px

    class SETUP setupClass
    class TESTS testClass
    class CORE,T013,T014,T015,T016,T017,T018,T019 coreClass
    class INTEGRATION,T020 integrationClass
    class POLISH,T021,T022,T023,T024,T025,T026 polishClass
    class PARALLEL_CORE,PARALLEL_POLISH parallelClass
```

## Notes
- **[P] tasks** = different files, no dependencies, can run in parallel
- **TDD Critical**: All tests (T004-T011) MUST fail initially before any implementation
- **File Conflicts**: No [P] tasks modify the same files
- **Dependencies**: Sequential tasks within same files, parallel across different files
- **Commit Strategy**: Commit after each completed task
- **Verification**: Run `make test` after each implementation task to ensure tests pass

## Task Generation Rules Applied

1. **From Schemas** (`src/nexus/schemas/agent_orchestrator/websocket-adaptor_streaming.yaml`):
   - Each event type (delta, error, completion, cancelled) → contract test task [P]

2. **From Data Model** (`data-model.md`):
   - StreamingEvent entity → stream client logic
   - WebSocketConnection → connection management

3. **From Quickstart** (`quickstart.md`):
   - Each example scenario → integration test task [P]

4. **From Research** (`research.md`):
   - Error handling decisions → error classification service
   - Valkey integration → stream client service
   - Connection stability → WebSocket manager

## Validation Checklist
*GATE: Checked before task generation completion*

- [x] All WebSocket event schemas have corresponding contract tests
- [x] All data model entities have implementation tasks
- [x] All quickstart scenarios have integration tests
- [x] Tests come before implementation (TDD compliance)
- [x] Parallel tasks are truly independent (different files)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Dependencies properly sequenced (setup → tests → core → integration → polish)
- [x] Mermaid diagram shows task flow and parallel execution opportunities
