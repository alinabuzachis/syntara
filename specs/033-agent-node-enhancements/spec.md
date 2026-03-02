# Feature Specification: Agentic Node Enhancements

**Feature Branch**: `033-agent-node-enhancements`  
**Created**: 2026-02-13  
**Status**: Draft  
**Input**: User description: "Read and understand the requirements and acceptance criteria in AAP-65666"

## Overview

This feature enhances agentic workflow nodes with two key capabilities: tool selection control and structured output formatting. Workflow designers can select which subset of available tools agents should use during execution, improving performance and cost control. They can also define structured output formats to ensure agent responses conform to specific data structures required by downstream workflow steps.

The enhancement addresses common challenges in agent-based automation where unrestricted tool access leads to unpredictable behavior, excessive costs, and outputs that cannot be reliably processed by subsequent workflow components.

## Clarifications

### Session 2026-02-13

- Q: When should tool access restrictions be enforced in the system? → A: No access restrictions - all _enabled_ tools are available to all users at design-time and runtime, selection is for workflow optimization only
- Q: Which JSON Schema specification version should be supported for structured output validation? → A: [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- Q: When an agent produces output that doesn't conform to the specified schema, what should happen? → A: System uses 3-phase fallback strategy (native→pydantic→structured parser) with a single global retry budget across all fallbacks; if all strategies fail schema validation, the agent fails
- Q: When a user has selected tools that no longer exist in the system, what should happen? → A: Tool selection constrained to available tools; existing runtime failure handling covers unavailable tools
- Q: What should the warning threshold be for tool selection count? → A: No count-based threshold - warn that greater number of tools could affect performance
- Q: How should the three tool selection options ("all tools", "no tools", "specific tools") be represented? → A: Use two discrete fields: tool_selection_strategy enum (ALL, NONE, SELECTED) and tool_selections array (required only when strategy is SELECTED)

### Session 2026-02-26

- Q: When all three fallback strategies (native→pydantic→structured parser) fail to produce schema-compliant output, what should happen? → A: System marks agent as failed and logs all attempted strategies with detailed error information
- Q: What happens when selected tools become unavailable between workflow save and execution? → A: Filter to available tools, log changes
- Q: How should the system handle JSON schemas with excessive complexity that could cause performance issues? → A: Accept all schemas validated at save-time
- Q: How should workflows without tool selection configuration behave? → A: Tool selection defaults to "all tools" mode
- Q: How does the system handle multiple agents trying to use the same tool simultaneously when tool selection is constrained? → A: Tools handle concurrent access independently

## User Scenarios & Testing

### User Story 1 - Tool Selection Control (Priority: P1)

A workflow designer wants to restrict which tools an agent can use to ensure predictable, focused behavior and reduce execution time and costs.

**Why this priority**: Core functionality that provides immediate value by giving users control over agent capabilities and reducing risk of unwanted tool usage.

**Independent Test**: Can be fully tested by configuring an agent with specific tools, executing the workflow, and verifying only selected tools are available to the agent.

**Acceptance Scenarios**:

1. **Given** a workflow with an agentic node, **When** user selects "no tools" option, **Then** agent executes without any tool calls
2. **Given** a workflow with an agentic node, **When** user selects 2 specific tools from available list, **Then** agent only has access to those 2 tools during execution
3. **Given** a workflow with an agentic node, **When** user selects "all tools" toggle, **Then** agent has access to all system-enabled tools

---

### User Story 2 - Structured Output Schema (Priority: P2)

A workflow designer wants to ensure agent responses conform to a specific JSON structure for downstream processing and integration.

**Why this priority**: Enables reliable workflow automation by ensuring predictable agent output format for subsequent workflow steps.

**Independent Test**: Can be fully tested by defining a JSON schema for agent output, executing the workflow, and verifying the response matches the schema structure.

**Acceptance Scenarios**:

1. **Given** a workflow with an agentic node and defined output schema, **When** workflow executes, **Then** agent output conforms to the specified JSON structure
2. **Given** an invalid output schema, **When** user attempts to save workflow, **Then** system displays clear validation errors
3. **Given** an agent that cannot produce schema-compliant output, **When** workflow executes, **Then** system marks workflow as failed and returns error message with validation details

---

### User Story 3 - Enhanced Configuration UI (Priority: P3)

A workflow designer wants intuitive UI controls with guidance to effectively configure agent tool selection and output schemas.

**Why this priority**: Improves user experience but core functionality can work without advanced UI features.

**Independent Test**: Can be fully tested by navigating the agent configuration interface and verifying all controls work as expected.

**Acceptance Scenarios**:

1. **Given** agent configuration dialog, **When** user views tool selection, **Then** system displays tools with human-readable names and descriptions
2. **Given** agent configuration dialog, **When** user enters JSON schema, **Then** system provides real-time validation feedback
3. **Given** user selects "all tools" or leaves schema empty, **When** configuration is displayed, **Then** system shows warning message "Using all tools may significantly increase execution time"

---

---

### User Story 4 - Configuration Reliability (Priority: P2)

A workflow designer wants the system to validate tool selections and handle configuration errors gracefully to prevent workflow failures.

**Why this priority**: Critical for production reliability - workflows should fail gracefully with clear error messages rather than mysteriously breaking.

**Independent Test**: Can be fully tested by creating workflows with invalid tool selections or schemas and verifying appropriate error handling.

**Acceptance Scenarios**:

1. **Given** a workflow definition with tools that are no longer available at workflow execution (missing from tool manager, remote server unavailable etc), **When** execution begins, **Then** system reports which specific tools are unavailable and gracefully continues execution using only the valid tools
2. **Given** a workflow with a malformed schema, **When** user attempts to save, **Then** system displays error messages containing JSON line number, syntax error type, and correction suggestion
3. **Given** a workflow without tool selection or schema configuration, **When** executed, **Then** workflow continues to function using default settings

---

### User Story 5 - Configuration Management (Priority: P3)

A workflow designer wants persistent tool selections and schema configurations to maintain consistency across workflow edits and team collaboration.

**Why this priority**: Usability enhancement that supports team workflows and reduces configuration overhead.

**Independent Test**: Can be fully tested by configuring tools/schemas, saving workflow, reopening, and verifying configurations persist.

**Acceptance Scenarios**:

1. **Given** a workflow with configured tool selections, **When** workflow is saved and reopened, **Then** tool selections are preserved exactly as configured
2. **Given** a workflow with configured output schema, **When** workflow is saved and reopened, **Then** schema configuration is preserved
3. **Given** a configured workflow shared with team members, **When** they view the workflow, **Then** they can see which tools and schemas are configured

---

### Edge Cases

**Schema and Validation Edge Cases:**
- How does system handle malformed JSON schemas? → System validates schemas at save time; malformed schemas prevent workflow save with detailed error messages
- What occurs when agent execution fails due to schema constraint violations? → System applies 3-phase fallback strategy; if all strategies fail, agent is marked as failed with detailed logging of all attempted strategies
- How does system handle schema validation failures during agent execution? → Schema validation failures immediately trigger next fallback strategy without retries (retries from FR-005 apply only to runtime exceptions within each strategy, not to schema validation failures)
- How does system handle JSON schemas with excessive complexity? → System accepts all schemas that validate successfully at save time without imposing complexity limits
- How does system prevent malicious structured output formats from compromising agent security? → System validates schema definitions to prevent malicious schema injection that could compromise agent behavior
- What happens when structured output formats contain executable code or dangerous instructions? → Schema validation prevents execution of embedded code through proper sanitization and validation

**Tool Selection Edge Cases:**
- How does system behave when no tools are available but user hasn't explicitly selected "no tools"? → Agent execution proceeds with available tools; if zero tools available, agent operates in text-only mode
- What happens when selected tools become unavailable between workflow save and execution? → System filters selected tools to only include currently available/enabled tools and logs which tools were removed
- How does system handle multiple agents trying to use the same tool simultaneously? → Tools handle concurrent access independently; tool selection constraints don't affect concurrent usage capabilities
- What occurs when a workflow has invalid tool selections at execution time? → System reports which specific tools are invalid and proceeds with remaining valid tools

## Requirements

### Functional Requirements

#### Backend Requirements

- **FR-001**: System MUST allow workflow designers to select which subset of available tools agents should use, and filter available tools to only include user-specified tools during agent execution *(supports User Story 1)*
- **FR-002**: System MUST allow workflow designers to define [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) structured output formats for agent responses *(supports User Story 2)*
- **FR-003**: System MUST validate that selected tools exist and are enabled at workflow save time (with warnings) and at execution start time (with failure) *(supports User Story 4)*
- **FR-004**: System MUST ensure agent responses conform to user-defined structure when output format is specified *(supports User Story 2)*
- **FR-005**: System MUST implement automatic cascading fallback strategies (native→pydantic→structured parser) for structured output, with a single global retry budget applied across all fallback attempts; runtime exceptions trigger retries within each strategy, while schema validation failures immediately trigger the next fallback strategy *(supports User Story 2)*
- **FR-006**: System MUST provide error messages containing schema field path, validation failure type, and expected format when agent output fails schema validation *(supports User Story 4)*
- **FR-007**: System MUST log tool invocation count, tool execution duration, schema validation success/failure status, and validation error details in execution records *(supports User Story 4)*
- **FR-008**: System MUST display which tools were actually used during agent execution in workflow execution results *(supports User Story 1)*

#### Frontend Requirements

- **FR-009**: UI MUST provide tool selection interface showing all available tools with multi-select capability *(supports User Story 3)*
- **FR-010**: UI MUST provide "all tools" (tool_selection_strategy: ALL), "no tools" (tool_selection_strategy: NONE), and "specific tools" (tool_selection_strategy: SELECTED with tool_selections array) selection options *(supports User Story 3)*
- **FR-011**: UI MUST allow users to define structured output formats with syntax validation *(supports User Story 3)*
- **FR-012**: UI MUST display validation feedback for structured output format syntax errors *(supports User Story 3)*
- **FR-013**: UI MUST display tooltips explaining tool selection impact and warnings that greater number of tools could affect performance for "all tools" configuration *(supports User Story 3)*
- **FR-014**: UI MUST persist tool selections and schema configurations when workflow is saved *(supports User Story 5)*
- **FR-015**: UI MUST display tool count and provide easy selection/deselection controls *(supports User Story 5)*
- **FR-016**: System MUST validate structured output format definitions to prevent malicious schema injection that could compromise agent behavior *(supports User Story 4)*

### Key Entities

- **Tool Selection**: User-specified subset of available tools (tool IDs, selection mode)
- **Output Schema**: JSON schema definition for structured agent responses (schema object, validation rules)
- **Agent Configuration**: Extended agentic node configuration (allowed tools, response schema, validation settings)
- **Execution Record**: Enhanced execution tracking (schema validation results, re-tries)


## Out of Scope

The following capabilities are explicitly excluded from this feature:

- **Tool versioning and compatibility management**: Managing different versions of tools or compatibility matrices between tools
- **Dynamic tool discovery**: Adding new tools to the system or auto-discovering available tools during runtime
- **Tool performance optimization**: Improving the execution speed or resource usage of individual tools
- **Schema template library**: Pre-built schema templates for common use cases (may be added in future iterations)
- **Multi-agent coordination**: Coordinating tool usage or schemas across multiple agentic nodes in the same workflow
- **Tool access analytics beyond basic logging**: Advanced analytics, recommendations, or usage optimization features
- **Role-based tool access control**: Permission-based restrictions on which users can access which tools (handled by existing authorization system)

## Dependencies & Assumptions

### Dependencies
- LangChain `with_structured_output` functionality for schema enforcement
- Existing tool synchronization infrastructure for filtering
- Alembic database migration system for adding explicit fields to Invocation model
- SQLModel/Pydantic validation for explicit field validation in API layer
- User authentication and authorization system for basic access control
- Tool registration and discovery system for available tool enumeration
- JSON Schema validation library for output format validation
- Agent execution framework for explicit field handling and configuration passing
- Workflow definition storage system for persisting tool selections and schemas
- Database schema updates for explicit tool_selection_strategy, tool_selections, and response_schema fields

### Assumptions
- Users can define structured output formats with assistance from validation feedback and error messages provided by the system
- Tool identifiers remain stable across workflow definition and execution within reasonable timeframes
- Agent LLM models support structured output constraints (validated during implementation)
- Database schema changes can be deployed during active development phase
- API clients can handle explicit fields with clear API contracts
- Current invocation pipeline can be extended with explicit parameter passing without performance degradation
- Tools are independent with no dependencies on other tools
