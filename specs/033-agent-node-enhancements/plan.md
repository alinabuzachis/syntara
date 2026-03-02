# Implementation Plan: Agentic Node Enhancements

**Branch**: `033-agent-node-enhancements` | **Date**: 2026-02-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/033-agent-node-enhancements/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Enhance agentic workflow nodes with tool selection control and structured output formatting capabilities. Users can select which subset of available tools agents should use during execution (for performance and cost optimization) and define [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) structured output formats to ensure agent responses conform to specific data structures required by downstream workflow steps.

## Technical Context

**Language/Version**: Python 3.12+  
**Primary Dependencies**: FastAPI, SQLModel, LangChain, Temporalio, Alembic, Pydantic  
**Storage**: PostgreSQL with SQLAlchemy/Alembic migrations  
**Testing**: pytest (from dependencies)  
**Target Platform**: Linux server  
**Project Type**: web (backend API with separate frontend UI)  
**Performance Goals**: <2s JSON schema validation, agent retry mechanism with single attempt  
**Constraints**: [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) compliance  
**Scale/Scope**: Enterprise workflow automation, multi-agent coordination system

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Modular Architecture**: ✅ PASS - Feature extends existing agentic node components with clear boundaries  
**Test-Driven Development**: ✅ PASS - Specification includes comprehensive test scenarios  
**Explicit Configuration**: ✅ PASS - Tool selections and schemas are explicitly configured  
**Observability First**: ✅ PASS - FR-007 requires detailed logging of tool usage and validation, FR-008 requires tool usage display  
**API Stability**: ✅ PASS - New optional configuration fields maintain API stability  
**Code Architecture Principles**: ✅ PASS - Extends existing SQLModel patterns  
**API Specification Standards**: ✅ PASS - Will follow OpenAPI with /api/v1/ structure  
**Code Quality Requirements**: ✅ PASS - Implementation follows existing patterns with comprehensive testing planned

**Post-Design Re-evaluation**: All constitution requirements satisfied with detailed implementation plan covering modular architecture, TDD approach, explicit configuration, comprehensive observability, and API stability maintenance.

## Project Structure

### Documentation (this feature)

```text
specs/033-agent-node-enhancements/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (Backend - nexus repository)

```text
src/nexus/
├── agent_orchestrator/                      # Agent execution and state management
│   ├── models/                              # AgentState, Invocation, Request model extensions
│   │   ├── invocation.py                    # Add explicit fields to Invocation model
│   │   ├── request.py                       # Add explicit fields to InvocationCreateRequest
│   │   └── agent_state.py                   # Add explicit fields to AgentState
│   ├── services/                            # Service layer updates
│   │   ├── invocation_service.py            # Update to handle explicit fields
│   │   └── orchestration_service.py         # Update to pass explicit fields
│   ├── executor/                            # Executor updates
│   │   └── invocation_executor.py           # Update to pass explicit fields
│   └── tool_manager/                        # Tool synchronization and filtering updates
├── invocations/                             # API layer updates
│   └── router.py                            # Update to extract explicit fields
├── schemas/
│   ├── workflows/                           # JSON Schema definitions
│   │   └── workflow-definition.schema.json  # Workflow schema updates
│   └── invocations/                         # API schema updates
│       └── openapi.yaml                     # Add explicit fields to API spec
├── workflows/                               # Workflow execution engine
│   ├── clients/                             # Client updates
│   │   └── agent_orchestrator_client.py     # Update to pass explicit fields
│   └── workflow_engine/
│       └── activities/
│           └── agentic_activity.py          # AgenticActivity updates for explicit fields

tests/
├── unit/                                    # Unit tests for individual components
│   ├── agent_orchestrator/                  # Agent state and tool manager tests
│   └── workflows/                           # Workflow activity tests
├── integration/                             # End-to-end workflow tests
│   └── workflows/                           # Tool filtering and schema validation tests
└── contract/                                # API contract tests
```

### Source Code (Frontend - nexus-ui repository)

```text
nexus-ui/src/
├── components/                     # Shared UI components
│   └── forms/                      # Form components for schema editor
├── routes/automations/             # Workflow automation UI
│   ├── canvas/                     # Workflow canvas components
│   │   └── nodes/                  # Node type components
│   │       ├── TaskNode.tsx        # Agentic node configuration UI updates
│   │       └── common/             # Shared node components
│   └── hooks/                      # Workflow-related hooks
└── stores/                         # State management
    └── workflows/                  # Workflow state management
```

**Structure Decision**: Using the existing Nexus backend monolithic Python structure with explicit field support throughout the invocation pipeline. Database migration required for new columns. Frontend UI changes focused on TaskNode component for agentic node configuration. Separate repositories maintained for backend (nexus) and frontend (nexus-ui).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
