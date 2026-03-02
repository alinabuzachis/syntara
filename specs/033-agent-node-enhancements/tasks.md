# Tasks: Agentic Node Enhancements

**Input**: Design documents from `/specs/033-agent-node-enhancements/`  
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md  

**Tests**: Test tasks are included per specification requirements

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story, with distinct backend and frontend sections.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for both backend and frontend

- [ ] T001 Validate development environment has Python 3.12+ and uv for backend changes
- [ ] T002 [P] Create branch `033-agent-node-enhancements` if not already exists
- [ ] T003 [P] Verify access to nexus repository for backend changes
- [ ] T004 [P] Verify access to nexus-ui repository for frontend changes (note: UX designs pending)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure updates that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend Foundation

- [ ] T005 Update workflow schema to add toolSelectionStrategy and toolSelections and responseSchema properties in `src/nexus/schemas/workflows/workflow-definition.schema.json`
- [ ] T006 Update OpenAPI schema to include tool_selection_strategy, tool_selections, response_schema fields in `src/nexus/schemas/invocations/openapi.yaml`
- [ ] T007 [P] Extend InvocationCreateRequest model with tool_selection_strategy, tool_selections, response_schema fields in `src/nexus/agent_orchestrator/models/request.py`
- [ ] T008 [P] Extend Invocation database model with tool_selection_strategy, tool_selections, response_schema fields in `src/nexus/agent_orchestrator/models/invocation.py`
- [ ] T009 [P] Create Alembic migration to add tool_selection_strategy, tool_selections, response_schema columns to invocations table
- [ ] T010 [P] Extend AgenticExecutorConfig model with new fields in `src/nexus/workflows/models/workflow_definition.py`
- [ ] T011 [P] Update AgentState TypedDict with tool_selection_strategy and tool_selections and response_schema fields in `src/nexus/agent_orchestrator/models/agent_state.py`
- [ ] T012 Update AgentStateFactory to accept tool_selection_strategy, tool_selections, response_schema parameters in `src/nexus/agent_orchestrator/models/agent_state.py`
- [ ] T013 Update InvocationService.create_invocation to handle tool_selection_strategy, tool_selections, response_schema fields in `src/nexus/agent_orchestrator/services/invocation_service.py`
- [ ] T014 Update InvocationsRouter to extract and pass tool_selection_strategy, tool_selections, response_schema fields in `src/nexus/invocations/router.py`
- [ ] T015 Update InvocationExecutor to pass tool_selection_strategy, tool_selections, response_schema fields to OrchestrationService in `src/nexus/agent_orchestrator/executor/invocation_executor.py`
- [ ] T016 Update OrchestrationService.execute to accept and pass tool_selection_strategy, tool_selections, response_schema fields in `src/nexus/agent_orchestrator/services/orchestration_service.py`
- [ ] T017 Update AgentOrchestratorClient to accept and pass tool_selection_strategy, tool_selections, response_schema fields in `src/nexus/workflows/clients/agent_orchestrator_client.py`
- [ ] T018 [P] Add security validation to prevent malicious structured output formats in AgenticExecutorConfig
- [ ] T019 [P] Add input sanitization for schema definitions to prevent code injection

**Checkpoint**: Backend foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Tool Selection Control (Priority: P1) 🎯 MVP

**Goal**: Enable workflow designers to select which subset of available tools agents should use during execution

**Independent Test**: Configure an agent with specific tools, execute workflow, verify only selected tools are available

### Tests for User Story 1 (TDD Approach - WRITE FIRST)

> **CRITICAL: Write these tests FIRST, ensure they FAIL before ANY implementation**

- [ ] T020 [P] [US1] Write failing unit tests for filter_base_tools_by_user_selection function in `tests/unit/agent_orchestrator/tool_manager/test_tool_filtering.py` (must fail initially)
- [ ] T021 [P] [US1] Write failing unit tests for ToolSynchronizer.synchronize_tools with tool_selection_strategy and tool_selections in `tests/unit/agent_orchestrator/tool_manager/test_tool_services.py` (must fail initially)
- [ ] T022 [P] [US1] Write failing integration tests for "no tools" selection workflow in `tests/integration/workflows/test_tool_selection_workflows.py` (must fail initially)
- [ ] T023 [P] [US1] Write failing integration tests for "specific tools" selection workflow in `tests/integration/workflows/test_tool_selection_workflows.py` (must fail initially)
- [ ] T024 [P] [US1] Write failing integration tests for "all tools" selection workflow in `tests/integration/workflows/test_tool_selection_workflows.py` (must fail initially)
- [ ] T025 [P] [US1] Write failing API tests for tool_selection_strategy, tool_selections, response_schema fields in InvocationCreateRequest in `tests/unit/api/test_invocation_explicit_fields.py` (must fail initially)

### Backend Implementation for User Story 1

- [ ] T026 [P] [US1] Create filter_base_tools_by_user_selection function in `src/nexus/agent_orchestrator/tool_manager/tool_filtering.py`
- [ ] T027 [US1] Update ToolSynchronizer.synchronize_tools method to accept tool_selection_strategy and tool_selections parameters in `src/nexus/agent_orchestrator/tool_manager/tool_services.py`
- [ ] T028 [US1] Update OrchestrationService._get_tools and _setup_graph methods in `src/nexus/agent_orchestrator/services/orchestration_service.py`
- [ ] T029 [US1] Update AgenticActivity to pass tool_selection_strategy, tool_selections, response_schema fields to AgentOrchestratorClient in `src/nexus/workflows/workflow_engine/activities/agentic_activity.py`
- [ ] T030 [US1] Add logging for tool filtering operations with tool counts and selection details in ToolSynchronizer and filter_base_tools_by_user_selection functions

### Frontend Foundation for User Story 1

**Note**: Interim implementation approach - advanced UI features deferred to UX-driven iteration

- [ ] T031 [P] [US1] Extend AgenticTaskConfig interface to include toolSelectionStrategy and toolSelections in `nexus-ui/src/routes/automations/canvas/nodes/TaskNode.tsx`
- [ ] T032 [US1] Add basic tool selection dropdown with "All Tools", "No Tools", "Select Specific" options using ToolSelectionStrategy enum in TaskNode component (interim implementation)

**Checkpoint**: At this point, User Story 1 backend should be fully functional and testable independently

---

## Phase 4: User Story 2 - Structured Output Schema (Priority: P2)

**Goal**: Enable workflow designers to ensure agent responses conform to specific JSON structures

**Independent Test**: Define a JSON schema for agent output, execute workflow, verify response matches schema structure

### Tests for User Story 2 (TDD Approach - WRITE FIRST)

> **CRITICAL: Write these tests FIRST, ensure they FAIL before ANY implementation**

- [ ] T033 [P] [US2] Write failing unit tests for _execute_structured_output method with three fallback strategies in `tests/unit/agent_orchestrator/test_structured_output.py` (must fail initially)
- [ ] T034 [P] [US2] Write failing unit tests for _json_schema_to_pydantic helper method in `tests/unit/agent_orchestrator/test_structured_output.py` (must fail initially)
- [ ] T035 [P] [US2] Write failing unit tests for _json_schema_to_response_schemas helper method in `tests/unit/agent_orchestrator/test_structured_output.py` (must fail initially)
- [ ] T036 [P] [US2] Write failing integration tests for native structured output validation in `tests/integration/workflows/test_schema_validation_workflows.py` (must fail initially)
- [ ] T037 [P] [US2] Write failing integration tests for pydantic fallback validation in `tests/integration/workflows/test_schema_validation_workflows.py` (must fail initially)
- [ ] T038 [P] [US2] Write failing integration tests for structured parser fallback validation in `tests/integration/workflows/test_schema_validation_workflows.py` (must fail initially)

### Backend Implementation for User Story 2

- [ ] T039 [P] [US2] Implement _execute_structured_output method with three-tier cascading fallback in `src/nexus/agent_orchestrator/agents/generic_agent.py` (native→pydantic→structured parser)
- [ ] T040 [P] [US2] Add _json_schema_to_pydantic helper method for PydanticOutputParser fallback strategy in GenericAgent
- [ ] T041 [P] [US2] Add _json_schema_to_response_schemas helper method for StructuredOutputParser fallback strategy in GenericAgent  
- [ ] T042 [P] [US2] Add _add_format_instructions method for prompt engineering fallback in GenericAgent
- [ ] T043 [P] [US2] Add StructuredOutputError exception class with detailed error context in agent_orchestrator exceptions
- [ ] T044 [US2] Update GenericAgent._execute to use _execute_structured_output when response_schema present
- [ ] T045 [US2] Add comprehensive logging for fallback strategy success/failure tracking in _execute_structured_output method

### Frontend Foundation for User Story 2

**Note**: Interim implementation approach - advanced UI features deferred to UX-driven iteration

- [ ] T046 [P] [US2] Extend AgenticTaskConfig interface to include responseSchema (string) in `nexus-ui/src/routes/automations/canvas/nodes/TaskNode.tsx`
- [ ] T047 [US2] Add basic JSON schema textarea with validation feedback in TaskNode component (interim implementation)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 4 - Configuration Reliability (Priority: P2)

**Goal**: Validate tool selections and handle configuration errors gracefully to prevent workflow failures

**Independent Test**: Create workflows with invalid tool selections or schemas and verify appropriate error handling

### Tests for User Story 4 (TDD Approach - WRITE FIRST)

> **CRITICAL: Write these tests FIRST, ensure they FAIL before ANY implementation**

- [ ] T048 [P] [US4] Write failing unit tests for tool ID validation with UUID format checking in `tests/unit/workflows/test_agentic_config_validation.py` (must fail initially)
- [ ] T049 [P] [US4] Write failing unit tests for JSON Schema validation for response_schema field in `tests/unit/workflows/test_agentic_config_validation.py` (must fail initially)
- [ ] T050 [P] [US4] Write failing integration tests for invalid tool selection error handling in `tests/integration/workflows/test_error_handling_workflows.py` (must fail initially)
- [ ] T051 [P] [US4] Write failing integration tests for malformed schema error handling in `tests/integration/workflows/test_error_handling_workflows.py` (must fail initially)
- [ ] T052 [P] [US4] Write failing API tests for tool_selection_strategy, tool_selections, response_schema field validation in InvocationCreateRequest in `tests/unit/api/test_invocation_validation.py` (must fail initially)

### Backend Implementation for User Story 4

- [ ] T053 [P] [US4] Add comprehensive tool ID validation with UUID format checking in AgenticExecutorConfig validator
- [ ] T054 [P] [US4] Add JSON Schema validation for response_schema field in AgenticExecutorConfig
- [ ] T055 [P] [US4] Add validation for tool_selection_strategy, tool_selections, response_schema fields in InvocationCreateRequest model
- [ ] T056 [US4] Implement detailed error messaging for schema validation failures with field paths and expected formats as required by FR-006 (schema field path, validation failure type, expected format)
- [ ] T057 [US4] Enhance logging with detailed validation error information and tool availability status in AgenticExecutorConfig validation methods

**Checkpoint**: Configuration reliability should be robust with clear error handling

---

## Phase 6: User Story 3 - Enhanced Configuration UI (Priority: P3)

**Goal**: Provide intuitive UI controls with guidance for configuring agent tool selection and output schemas

**Independent Test**: Navigate agent configuration interface and verify all controls work as expected

**Note**: This phase heavily depends on UX team collaboration and designs

### Frontend Implementation for User Story 3

**Note**: All frontend tasks are best-effort approximations pending UX designs**

- [ ] T058 [P] [US3] Design tool selection interface component with multi-select capability (requires UX collaboration)
- [ ] T059 [P] [US3] Implement "all tools", "no tools", "specific tools" selection options (awaiting UX designs)
- [ ] T060 [P] [US3] Create JSON schema editor component with syntax highlighting (requires UX collaboration)
- [ ] T061 [US3] Add real-time validation feedback for schema syntax within 2 seconds (awaiting UX designs)
- [ ] T062 [US3] Implement tooltips and warnings for tool selection impact and performance (requires UX collaboration)
- [ ] T063 [US3] Add tool count display and easy selection/deselection controls (awaiting UX designs)

**Checkpoint**: UI enhancements should provide intuitive configuration experience

---

## Phase 7: User Story 5 - Configuration Management (Priority: P3)

**Goal**: Ensure persistent tool selections and schema configurations for consistency across workflow edits

**Independent Test**: Configure tools/schemas, save workflow, reopen, verify configurations persist

### Tests for User Story 5 (TDD Approach)

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T064 [P] [US5] Add unit tests for configuration persistence in `tests/unit/workflows/test_configuration_persistence.py` (write first, ensure fails)
- [ ] T065 [P] [US5] Add unit tests for tool_selection_strategy, tool_selections, response_schema field persistence in database in `tests/unit/models/test_invocation_persistence.py` (write first, ensure fails)

### Backend Implementation for User Story 5

- [ ] T066 [P] [US5] Verify configuration persistence through workflow save/load mechanisms
- [ ] T067 [P] [US5] Add validation that saved configurations are correctly restored on workflow load
- [ ] T068 [P] [US5] Verify tool_selection_strategy, tool_selections, response_schema field persistence in Invocation model database operations

### Frontend Implementation for User Story 5

**Note**: Persistence handling pending UX designs**

- [ ] T069 [P] [US5] Ensure frontend properly saves tool selections and schema configurations (awaiting UX designs)
- [ ] T070 [US5] Verify configuration data is correctly displayed when workflow is reopened (requires UX collaboration)

**Checkpoint**: All user stories should now be independently functional with persistent configurations

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and final validation

### Missing Requirements Coverage

- [ ] T071 [P] [FR-008] Add tool usage display functionality in execution results to show which tools were actually used
- [ ] T072 [P] [FR-008] Update agent response model to include used_tools field with tool names and usage counts

### Backend Polish

- [ ] T073 [P] Add comprehensive error handling for edge cases across all components
- [ ] T074 [P] Optimize tool filtering performance for large tool sets
- [ ] T075 [P] Add comprehensive logging for all tool usage and schema validation operations in orchestration_service.py and generic_agent.py methods
- [ ] T076 [P] Run backend quality checks: make format, make lint, make typecheck, make test-all
- [ ] T077 Validate quickstart.md examples work end-to-end with implemented backend

### Frontend Polish

**Note**: Frontend polish tasks require UX team designs to be finalized**

- [ ] T078 [P] Implement final UI polish based on UX team designs (requires collaboration)
- [ ] T079 [P] Add comprehensive frontend testing for configuration components (awaiting UX designs)
- [ ] T080 [P] Ensure accessibility compliance for all new UI components (requires UX collaboration)
- [ ] T081 Run frontend quality checks per nexus-ui repository standards

### Edge Case Coverage (from "Edge Cases" section)

- [ ] T082 [P] Add malformed JSON schema validation with specific error messages in AgenticExecutorConfig
- [ ] T083 [P] Implement agent execution failure handling for schema constraint violations
- [ ] T084 [P] Add graceful handling when no tools available but user hasn't selected "no tools"
- [ ] T085 [P] Handle schema validation failures during execution with immediate fallback trigger (per FR-005 clarification)
- [ ] T086 [P] Accept all schemas that validate at save time without complexity limits (Edge Cases section)
- [ ] T087 [P] Filter unavailable tools between save/execution and log changes (Tool Selection Edge Cases)
- [ ] T088 [P] Report invalid tool selections at runtime and proceed with valid tools (Tool Selection Edge Cases)

### Integration Testing

- [ ] T089 [P] Run comprehensive end-to-end testing of combined tool selection and structured output
- [ ] T090 [P] Validate performance requirements: <2s schema validation, cascading fallback mechanism
- [ ] T091 [P] Test tool_selection_strategy, tool_selections, response_schema field validation throughout entire pipeline from API to AgentState
- [ ] T092 [P] Test database migration with tool_selection_strategy, tool_selections, response_schema fields
- [ ] T093 Validate all success criteria from specification are met

---

## Backend vs Frontend Task Distribution

### Backend Tasks (Nexus Repository)
**Total: 77 tasks** - Well-defined and ready for implementation
- **Core Implementation**: T005-T019 (foundational schema changes, models, services, API layer, database migration, security)
- **Tool Filtering**: T020-T030 (User Story 1 implementation including tests)
- **Structured Output**: T033-T045 (User Story 2 implementation including tests)  
- **Error Handling**: T048-T057 (User Story 4 implementation including tests)
- **Configuration Persistence**: T064-T068 (User Story 5 backend implementation including tests)
- **Requirements Coverage**: T071-T072 (FR-008 tool usage display)
- **Quality & Polish**: T073-T077 (backend polish and validation)
- **Edge Cases**: T082-T088 (comprehensive edge case coverage)
- **Integration Testing**: T089-T093 (end-to-end validation)

### Frontend Tasks (Nexus-UI Repository)  
**Total: 16 tasks** - Interim implementations and UX-dependent features
- **Foundation**: T031-T032, T046-T047 (basic interface extensions for US1 and US2)
- **UI Components**: T058-T063 (User Story 3 - requires UX collaboration)
- **Persistence**: T069-T070 (User Story 5 frontend - awaiting UX designs)
- **Polish**: T078-T081 (requires UX finalization)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories  
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed) or sequentially by priority
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational - Independent of US1 but can combine
- **User Story 4 (P2)**: Can start after Foundational - Enhances US1 and US2 reliability  
- **User Story 3 (P3)**: Can start after backend foundation - Requires UX collaboration
- **User Story 5 (P3)**: Can start after any implemented user story - Adds persistence

### Backend vs Frontend Coordination

- **Backend development**: Can proceed immediately with clear requirements
- **Frontend development**: Should coordinate with UX team for detailed designs
- **Integration**: Backend provides data/APIs, frontend consumes (standard separation)

### Parallel Opportunities

- All [P] marked tasks can run in parallel within their constraints
- Backend and frontend teams can work simultaneously after Phase 2
- User stories can be implemented in parallel by different developers
- Testing tasks can run parallel to implementation tasks within each story

---

## Implementation Strategy

### MVP First (Backend-Heavy Approach)

1. Complete Phase 1: Setup  
2. Complete Phase 2: Foundational (backend schema and model changes)
3. Complete Phase 3: User Story 1 backend implementation
4. Complete Phase 4: User Story 2 backend implementation  
5. **STOP and VALIDATE**: Test both stories work independently via API/backend
6. Deploy backend changes for validation

### Frontend Integration Strategy

1. **Immediate**: Complete backend MVP (Stories 1 & 2)
2. **Parallel**: UX team designs configuration interfaces  
3. **Implementation**: Frontend team implements based on final UX designs
4. **Integration**: Connect frontend to working backend APIs

### Quality Gates

- **After Phase 2**: All tests pass, schemas validate correctly
- **After each User Story**: Independent story testing confirms functionality
- **Before Phase 8**: All functional requirements demonstrated
- **Final**: All success criteria met, performance requirements satisfied

---

## Notes

- [P] tasks = different files, no dependencies within phase
- [Story] label maps task to specific user story for traceability  
- Backend tasks are well-defined and ready for immediate implementation
- Frontend tasks require UX team collaboration for detailed specifications
- Each user story should be independently completable and testable
- Tests are included per specification requirements for comprehensive validation
- Backend changes use optional configuration fields for new functionality
- Tool filtering uses existing infrastructure per research decisions
- Structured output leverages LangChain's with_structured_output per research
