# JIRA Implementation Mapping for Agent Node Enhancements

This document maps the tasks from [tasks.md](../tasks.md) to the created JIRA tickets for implementing the Agent Node Enhancements feature.

## JIRA Tickets Overview

| JIRA | Title | Phase | Priority | Type |
|------|-------|-------|----------|------|
| [AAP-66970](AAP-66970) | Foundational work | Phase 1+2 | Blocker | Backend |
| [AAP-66971](AAP-66971) | Tool Selection | Phase 3 | P1 MVP | Backend |
| [AAP-66972](AAP-66972) | Structured Output | Phase 4 | P2 | Backend |
| [AAP-66973](AAP-66973) | Configuration Reliability | Phase 5 | P2 | Backend |
| [AAP-66974](AAP-66974) | Enhanced Configuration UI | Phase 6 + Frontend | P3 | Frontend |
| [AAP-66976](AAP-66976) | Configuration Management | Phase 7 | P3 | Backend |
| [AAP-66977](AAP-66977) | Polish & Cross-Cutting Concerns | Phase 8 | P3 | Backend |

---

## AAP-66970: Foundational Work (Phases 1 & 2)

**Epic Parent**: AAP-65666  
**Priority**: Blocker - Must complete before any user story implementation  
**Type**: Backend Infrastructure

### Description
Setup and core infrastructure updates that MUST be complete before ANY user story can be implemented. This includes project setup, schema changes, model extensions, database migrations, and service layer updates.

### Tasks Included

#### Phase 1: Setup Tasks
- [ ] T001 Validate development environment has Python 3.12+ and uv for backend changes
- [ ] T002 [P] Create branch `033-agent-node-enhancements` if not already exists
- [ ] T003 [P] Verify access to nexus repository for backend changes
- [ ] T004 [P] Verify access to nexus-ui repository for frontend changes (note: UX designs pending)

#### Phase 2: Backend Foundation
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

### Acceptance Criteria
- All backend schemas updated with new fields
- Database migration successfully applied  
- All services handle new parameters
- Security validation implemented
- All tests pass after foundation changes

---

## AAP-66971: Tool Selection (Phase 3 - User Story 1)

**Epic Parent**: AAP-65666  
**Priority**: P1 MVP  
**Type**: Backend Implementation

### Description
Enable workflow designers to select which subset of available tools agents should use during execution.

### Goal
Configure an agent with specific tools, execute workflow, verify only selected tools are available.

### Tasks Included

#### Tests for User Story 1 (TDD Approach - WRITE FIRST)
- [ ] T020 [P] [US1] Write failing unit tests for filter_base_tools_by_user_selection function in `tests/unit/agent_orchestrator/tool_manager/test_tool_filtering.py` (must fail initially)
- [ ] T021 [P] [US1] Write failing unit tests for ToolSynchronizer.synchronize_tools with tool_selection_strategy and tool_selections in `tests/unit/agent_orchestrator/tool_manager/test_tool_services.py` (must fail initially)
- [ ] T022 [P] [US1] Write failing integration tests for "no tools" selection workflow in `tests/integration/workflows/test_tool_selection_workflows.py` (must fail initially)
- [ ] T023 [P] [US1] Write failing integration tests for "specific tools" selection workflow in `tests/integration/workflows/test_tool_selection_workflows.py` (must fail initially)
- [ ] T024 [P] [US1] Write failing integration tests for "all tools" selection workflow in `tests/integration/workflows/test_tool_selection_workflows.py` (must fail initially)
- [ ] T025 [P] [US1] Write failing API tests for tool_selection_strategy, tool_selections, response_schema fields in InvocationCreateRequest in `tests/unit/api/test_invocation_explicit_fields.py` (must fail initially)

#### Backend Implementation for User Story 1
- [ ] T026 [P] [US1] Create filter_base_tools_by_user_selection function in `src/nexus/agent_orchestrator/tool_manager/tool_filtering.py`
- [ ] T027 [US1] Update ToolSynchronizer.synchronize_tools method to accept tool_selection_strategy and tool_selections parameters in `src/nexus/agent_orchestrator/tool_manager/tool_services.py`
- [ ] T028 [US1] Update OrchestrationService._get_tools and _setup_graph methods in `src/nexus/agent_orchestrator/services/orchestration_service.py`
- [ ] T029 [US1] Update AgenticActivity to pass tool_selection_strategy, tool_selections, response_schema fields to AgentOrchestratorClient in `src/nexus/workflows/workflow_engine/activities/agentic_activity.py`
- [ ] T030 [US1] Add logging for tool filtering operations with tool counts and selection details in ToolSynchronizer and filter_base_tools_by_user_selection functions

### Acceptance Criteria
- Tool filtering functionality implemented and tested
- Only selected tools are available to agents during execution
- All tests pass

---

## AAP-66972: Structured Output (Phase 4 - User Story 2)

**Epic Parent**: AAP-65666  
**Priority**: P2  
**Type**: Backend Implementation

### Description
Enable workflow designers to ensure agent responses conform to specific JSON structures.

### Goal
Define a JSON schema for agent output, execute workflow, verify response matches schema structure.

### Tasks Included

#### Tests for User Story 2 (TDD Approach - WRITE FIRST)
- [ ] T033 [P] [US2] Write failing unit tests for _execute_structured_output method with three fallback strategies in `tests/unit/agent_orchestrator/test_structured_output.py` (must fail initially)
- [ ] T034 [P] [US2] Write failing unit tests for _json_schema_to_pydantic helper method in `tests/unit/agent_orchestrator/test_structured_output.py` (must fail initially)
- [ ] T035 [P] [US2] Write failing unit tests for _json_schema_to_response_schemas helper method in `tests/unit/agent_orchestrator/test_structured_output.py` (must fail initially)
- [ ] T036 [P] [US2] Write failing integration tests for native structured output validation in `tests/integration/workflows/test_schema_validation_workflows.py` (must fail initially)
- [ ] T037 [P] [US2] Write failing integration tests for pydantic fallback validation in `tests/integration/workflows/test_schema_validation_workflows.py` (must fail initially)
- [ ] T038 [P] [US2] Write failing integration tests for structured parser fallback validation in `tests/integration/workflows/test_schema_validation_workflows.py` (must fail initially)

#### Backend Implementation for User Story 2
- [ ] T039 [P] [US2] Implement _execute_structured_output method with three-tier cascading fallback in `src/nexus/agent_orchestrator/agents/generic_agent.py` (native→pydantic→structured parser)
- [ ] T040 [P] [US2] Add _json_schema_to_pydantic helper method for PydanticOutputParser fallback strategy in GenericAgent
- [ ] T041 [P] [US2] Add _json_schema_to_response_schemas helper method for StructuredOutputParser fallback strategy in GenericAgent  
- [ ] T042 [P] [US2] Add _add_format_instructions method for prompt engineering fallback in GenericAgent
- [ ] T043 [P] [US2] Add StructuredOutputError exception class with detailed error context in agent_orchestrator exceptions
- [ ] T044 [US2] Update GenericAgent._execute to use _execute_structured_output when response_schema present
- [ ] T045 [US2] Add comprehensive logging for fallback strategy success/failure tracking in _execute_structured_output method

### Acceptance Criteria
- Three-tier fallback system for structured output implemented
- JSON schema validation with detailed error handling
- All tests pass

---

## AAP-66973: Configuration Reliability (Phase 5 - User Story 4)

**Epic Parent**: AAP-65666  
**Priority**: P2  
**Type**: Backend Implementation

### Description
Validate tool selections and handle configuration errors gracefully to prevent workflow failures.

### Goal
Create workflows with invalid tool selections or schemas and verify appropriate error handling.

### Tasks Included

#### Tests for User Story 4 (TDD Approach - WRITE FIRST)
- [ ] T048 [P] [US4] Write failing unit tests for tool ID validation with UUID format checking in `tests/unit/workflows/test_agentic_config_validation.py` (must fail initially)
- [ ] T049 [P] [US4] Write failing unit tests for JSON Schema validation for response_schema field in `tests/unit/workflows/test_agentic_config_validation.py` (must fail initially)
- [ ] T050 [P] [US4] Write failing integration tests for invalid tool selection error handling in `tests/integration/workflows/test_error_handling_workflows.py` (must fail initially)
- [ ] T051 [P] [US4] Write failing integration tests for malformed schema error handling in `tests/integration/workflows/test_error_handling_workflows.py` (must fail initially)
- [ ] T052 [P] [US4] Write failing API tests for tool_selection_strategy, tool_selections, response_schema field validation in InvocationCreateRequest in `tests/unit/api/test_invocation_validation.py` (must fail initially)

#### Backend Implementation for User Story 4
- [ ] T053 [P] [US4] Add comprehensive tool ID validation with UUID format checking in AgenticExecutorConfig validator
- [ ] T054 [P] [US4] Add JSON Schema validation for response_schema field in AgenticExecutorConfig
- [ ] T055 [P] [US4] Add validation for tool_selection_strategy, tool_selections, response_schema fields in InvocationCreateRequest model
- [ ] T056 [US4] Implement detailed error messaging for schema validation failures with field paths and expected formats as required by FR-006
- [ ] T057 [US4] Enhance logging with detailed validation error information and tool availability status in AgenticExecutorConfig validation methods

### Acceptance Criteria
- Configuration validation is robust with clear error handling
- Invalid tool selections are caught with helpful error messages
- Malformed schemas are validated with specific guidance
- All tests pass

---

## AAP-66976: Configuration Management (Phase 7 - User Story 5)

**Epic Parent**: AAP-65666  
**Priority**: P3  
**Type**: Backend Implementation

### Description
Ensure persistent tool selections and schema configurations for consistency across workflow edits.

### Goal
Configure tools/schemas, save workflow, reopen, verify configurations persist.

### Tasks Included

#### Tests for User Story 5 (TDD Approach - WRITE FIRST)
- [ ] T064 [P] [US5] Add unit tests for configuration persistence in `tests/unit/workflows/test_configuration_persistence.py` (write first, ensure fails)
- [ ] T065 [P] [US5] Add unit tests for tool_selection_strategy, tool_selections, response_schema field persistence in database in `tests/unit/models/test_invocation_persistence.py` (write first, ensure fails)

#### Backend Implementation for User Story 5
- [ ] T066 [P] [US5] Verify configuration persistence through workflow save/load mechanisms
- [ ] T067 [P] [US5] Add validation that saved configurations are correctly restored on workflow load
- [ ] T068 [P] [US5] Verify tool_selection_strategy, tool_selections, response_schema field persistence in Invocation model database operations

### Acceptance Criteria
- Configurations persist through workflow save/load cycles
- All field persistence validated in database operations
- All tests pass

---

## AAP-66977: Polish & Cross-Cutting Concerns (Phase 8)

**Epic Parent**: AAP-65666  
**Priority**: P3  
**Type**: Backend Implementation

### Description
Final improvements, edge case handling, and cross-cutting concerns that affect multiple user stories.

### Goal
All edge cases handled gracefully, performance requirements met, and all success criteria validated.

### Tasks Included

#### Missing Requirements Coverage
- [ ] T071 [P] [FR-008] Add tool usage display functionality in execution results to show which tools were actually used
- [ ] T072 [P] [FR-008] Update agent response model to include used_tools field with tool names and usage counts

#### Backend Polish
- [ ] T073 [P] Add comprehensive error handling for edge cases across all components
- [ ] T074 [P] Optimize tool filtering performance for large tool sets
- [ ] T075 [P] Add comprehensive logging for all tool usage and schema validation operations in orchestration_service.py and generic_agent.py methods
- [ ] T076 [P] Run backend quality checks: make format, make lint, make typecheck, make test-all
- [ ] T077 Validate quickstart.md examples work end-to-end with implemented backend

#### Edge Case Coverage
- [ ] T082 [P] Add malformed JSON schema validation with specific error messages in AgenticExecutorConfig
- [ ] T083 [P] Implement agent execution failure handling for schema constraint violations
- [ ] T084 [P] Add graceful handling when no tools available but user hasn't selected "no tools"
- [ ] T085 [P] Handle schema validation failures during execution with immediate fallback trigger (per FR-005 clarification)
- [ ] T086 [P] Accept all schemas that validate at save time without complexity limits (Edge Cases section)
- [ ] T087 [P] Filter unavailable tools between save/execution and log changes (Tool Selection Edge Cases)
- [ ] T088 [P] Report invalid tool selections at runtime and proceed with valid tools (Tool Selection Edge Cases)

#### Integration Testing
- [ ] T089 [P] Run comprehensive end-to-end testing of combined tool selection and structured output
- [ ] T090 [P] Validate performance requirements: <2s schema validation, cascading fallback mechanism
- [ ] T091 [P] Test tool_selection_strategy, tool_selections, response_schema field validation throughout entire pipeline from API to AgentState
- [ ] T092 [P] Test database migration with tool_selection_strategy, tool_selections, response_schema fields
- [ ] T093 Validate all success criteria from specification are met

### Acceptance Criteria
- All edge cases handled gracefully
- Performance requirements met (<2s schema validation)
- Comprehensive end-to-end testing completed
- All success criteria from specification validated
- Backend quality checks pass

---

## AAP-66974: Enhanced Configuration UI (All Frontend Work)

**Epic Parent**: AAP-65666  
**Priority**: P3  
**Type**: Frontend Implementation

### Description
Provide intuitive UI controls with guidance for configuring agent tool selection and output schemas, plus configuration persistence and polish. This JIRA covers ALL frontend work for the Agent Node Enhancements feature.

### Goal
Navigate agent configuration interface, verify all controls work, and ensure configurations persist across workflow edits.

### Tasks Included

#### Frontend Foundation Tasks (from User Stories 1 & 2)
- [ ] T031 [P] [US1] Extend AgenticTaskConfig interface to include toolSelectionStrategy and toolSelections in `nexus-ui/src/routes/automations/canvas/nodes/TaskNode.tsx`
- [ ] T032 [US1] Add basic tool selection dropdown with "All Tools", "No Tools", "Select Specific" options using ToolSelectionStrategy enum in TaskNode component (interim implementation)
- [ ] T046 [P] [US2] Extend AgenticTaskConfig interface to include responseSchema (string) in `nexus-ui/src/routes/automations/canvas/nodes/TaskNode.tsx`
- [ ] T047 [US2] Add basic JSON schema textarea with validation feedback in TaskNode component (interim implementation)

#### Phase 6: Enhanced Configuration UI (User Story 3)
**Note**: All tasks require UX collaboration and designs
- [ ] T058 [P] [US3] Design tool selection interface component with multi-select capability (requires UX collaboration)
- [ ] T059 [P] [US3] Implement "all tools", "no tools", "specific tools" selection options (awaiting UX designs)
- [ ] T060 [P] [US3] Create JSON schema editor component with syntax highlighting (requires UX collaboration)
- [ ] T061 [US3] Add real-time validation feedback for schema syntax within 2 seconds (awaiting UX designs)
- [ ] T062 [US3] Implement tooltips and warnings for tool selection impact and performance (requires UX collaboration)
- [ ] T063 [US3] Add tool count display and easy selection/deselection controls (awaiting UX designs)

#### Frontend Implementation for User Story 5 (Configuration Management)
- [ ] T069 [P] [US5] Ensure frontend properly saves tool selections and schema configurations (awaiting UX designs)
- [ ] T070 [US5] Verify configuration data is correctly displayed when workflow is reopened (requires UX collaboration)

#### Frontend Polish
- [ ] T078 [P] Implement final UI polish based on UX team designs (requires collaboration)
- [ ] T079 [P] Add comprehensive frontend testing for configuration components (awaiting UX designs)
- [ ] T080 [P] Ensure accessibility compliance for all new UI components (requires UX collaboration)
- [ ] T081 Run frontend quality checks per nexus-ui repository standards

### Acceptance Criteria
- Intuitive tool selection interface with multi-select
- JSON schema editor with syntax highlighting and real-time validation
- Comprehensive tooltips and guidance
- Configurations persist across workflow edits
- All edge cases handled gracefully
- Performance requirements met
- All success criteria validated

---

## Task Coverage Summary

### Total Tasks: 93
- **Phase 1 (Setup)**: T001-T004 → **AAP-66970**
- **Phase 2 (Foundation)**: T005-T019 → **AAP-66970**
- **Phase 3 (US1 Backend)**: T020-T030 → **AAP-66971**
- **Phase 4 (US2 Backend)**: T033-T045 → **AAP-66972**
- **Phase 5 (US4)**: T048-T057 → **AAP-66973**
- **Phase 6 (US3 Frontend)**: T031-T032, T046-T047, T058-T063, T069-T070, T078-T081 → **AAP-66974**
- **Phase 7 (US5 Backend)**: T064-T068 → **AAP-66976**
- **Phase 8 (Backend Polish)**: T071-T077, T082-T093 → **AAP-66977**

### Implementation Priority Order
1. **AAP-66970** (Blocker) - Must complete first
2. **AAP-66971** (P1 MVP) - Tool Selection Control
3. **AAP-66972** (P2) - Structured Output Schema
4. **AAP-66973** (P2) - Configuration Reliability
5. **AAP-66974** (P3) - Enhanced Configuration UI (Frontend)
6. **AAP-66976** (P3) - Configuration Management (Backend)
7. **AAP-66977** (P3) - Polish & Cross-Cutting Concerns (Backend)

### Dependencies
- All user stories depend on AAP-66970 completion
- AAP-66974 requires UX team collaboration for UI components
- AAP-66976 and AAP-66977 can run in parallel with other backend work after core user stories complete

---

## Notes
- [P] tasks can run in parallel within their phase constraints
- **Backend tasks**: Well-defined and ready for implementation
  - AAP-66970: 19 tasks (Setup + Foundation)
  - AAP-66971: 11 tasks (Tool Selection backend)
  - AAP-66972: 13 tasks (Structured Output backend)
  - AAP-66973: 10 tasks (Configuration Reliability)
  - AAP-66976: 5 tasks (Configuration Management backend)
  - AAP-66977: 19 tasks (Backend Polish + Cross-cutting concerns)
- **Frontend tasks**: ALL consolidated in AAP-66974 (16 tasks), require UX collaboration for detailed designs
- Each user story should be independently completable and testable
- Tests should be written first (TDD approach) and must fail before implementation begins
- All tasks from tasks.md are covered across the 7 JIRA tickets
