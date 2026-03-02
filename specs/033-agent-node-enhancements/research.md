# Research: Agentic Node Enhancements Implementation

**Date**: 2026-02-13  
**Feature**: Tool Selection Control and Structured Output Formatting

## Overview

This research consolidates findings from existing analysis of implementing user-based tool filtering and structured output capabilities in the Nexus agent orchestration system. Both features integrate with the existing metadata pipeline and tool synchronization infrastructure.

## Decision 1: Tool Filtering Implementation

**Decision**: Implement user-based tool filtering through existing agent_orchestrator/tool_manager infrastructure

**Rationale**:
- Extensive support already exists in `src/nexus/agent_orchestrator/tool_manager`
- ToolSynchronizer provides robust filtering pipeline (Discovery → Provider Processing → System Filtering → Enhancement)
- Integration point identified in ToolSynchronizer.synchronize_tools() as Step 5: User Filtering
- Metadata pipeline already supports passing tool selection config from workflow to agent

**Key Implementation Points**:
- Add `tool_selection_strategy` and `tool_selections` to AgentState and AgentStateFactory
- Extend ToolSynchronizer.synchronize_tools() with user filtering parameter
- Create `filter_base_tools_by_user_selection()` function in tool_filtering.py
- Maintain O(1) lookup performance using set-based tool ID checking

**Alternatives Considered**:
- Tool name-based filtering: Rejected due to non-unique names across providers
- Provider-based filtering: Rejected as too coarse-grained  
- Post-execution filtering: Rejected due to security concerns

## Decision 2: Structured Output Implementation

**Decision**: Use cascading fallback strategies with three LangChain approaches for maximum reliability

**Rationale**:
- Multiple strategies significantly improve success rates across different LLM providers
- Encapsulated complexity - workflow designers only specify `response_schema`
- Leverages LangChain's built-in capabilities without custom parsing logic
- Automatic fallback provides transparency while handling model limitations
- Compatible with existing `bind_tools()` functionality and metadata pipeline

**Key Implementation Points**:
- **Strategy 1**: `with_structured_output(method="json_schema")` - native provider support
- **Strategy 2**: `PydanticOutputParser` - tool-calling based fallback  
- **Strategy 3**: `StructuredOutputParser` - prompt engineering fallback
- Add helper methods for JSON schema conversion to Pydantic models and ResponseSchemas
- Comprehensive logging to track which strategy succeeds for different models
- StructuredOutputError with detailed context for total failures

**Alternatives Considered**:
- Single strategy with simple retry: Rejected due to poor reliability across model types
- Configuration-exposed fallbacks: Rejected to maintain interface simplicity
- Custom parsing implementation: Rejected in favor of proven LangChain approaches

## Decision 3: Schema Fallback Mechanism  

**Decision**: Implement automatic cascading fallback with clear separation between schema validation failures and runtime exceptions

**Rationale**:
- **Schema validation failures** (LLM response doesn't match schema): Immediately fallback to next strategy
- **Runtime exceptions** (LLM service errors, network issues): Retry with `@retry_with_backoff` mechanism
- **Strategy exhaustion** (all strategies fail schema validation): Triggers non-retryable exception for "User Story 2, Acceptance Criteria 3"
- No external configuration needed - completely transparent to workflow designers
- Clear distinction prevents unnecessary retries for schema mismatches while handling transient failures appropriately
- Comprehensive error logging differentiates between validation failures and runtime errors

**Implementation**:
- `_execute_structured_output` method with three strategies (native→pydantic→structured parser)
- Each strategy validates LLM response against schema before proceeding
- Schema validation failures immediately trigger next strategy (no retry)
- Runtime exceptions wrapped with `@retry_with_backoff` for transient error handling
- Strategy exhaustion raises non-retryable `StructuredOutputError` that triggers fallback to unstructured output
- Detailed logging distinguishes validation failures from runtime exceptions

## Decision 4: Backend/Frontend Architecture

**Decision**: Backend changes in nexus repository, frontend changes in nexus-ui repository

**Rationale**:
- Maintains existing separation of concerns
- Backend handles tool filtering and schema validation logic
- Frontend provides configuration UI for tool selection and schema definition
- TaskNode.tsx provides existing pattern for agentic node configuration
- Builds upon existing research documents for tool filtering and structured output
- Leverages established metadata pipeline and tool synchronization infrastructure

**Backend Implementation Architecture**:
Based on existing research documents ([research/structured-output.md](research/structured-output.md) and [research/user-tool-filtering.md](research/user-tool-filtering.md)):

1. **Workflow Schema Updates**: Add `tool_selection_strategy`, `tool_selections`, and `response_schema` properties to workflow definition schema
2. **Configuration Models**: Extend `AgenticExecutorConfig` with new fields and validation
3. **Activity Integration**: Update `AgenticActivity` to pass tool filtering and schema configuration via metadata
4. **State Management**: Enhance `AgentState` and `AgentStateFactory` to handle new configuration
5. **Tool Filtering**: Implement user-based tool filtering in `ToolSynchronizer`
6. **Structured Output**: Apply JSON schema constraints in `GenericAgent` using LangChain's `with_structured_output`
7. **Validation & Logging**: Add schema validation and enhanced execution tracking

**Frontend Implementation Architecture**:
Based on existing UI structure in `TaskNode.tsx`:

1. **Configuration Dialog**: Extend agentic node configuration with tool selection and schema definition sections
2. **Tool Selection UI**: Multi-select component with "all/none/specific" options, tool search, and selection counts
3. **Schema Editor**: JSON schema input with syntax highlighting, validation, and error display
4. **User Guidance**: Tooltips, warnings, and help text for configuration options
5. **Validation Feedback**: Real-time validation for tool selections and schema syntax
6. **Persistence**: Save/load tool selections and schemas as part of workflow configuration

**Key Integration Points**:
- Backend: AgenticActivity, AgentStateFactory, ToolSynchronizer, GenericAgent
- Frontend: TaskNode configuration dialog with tool selection and schema editor UI
- Schema: workflow-definition.schema.json updates for toolSelectionStrategy, toolSelections, and responseSchema
- Frontend and backend changes can be developed in parallel due to clear API boundaries
- Existing metadata pipeline handles configuration passing without modification

## Decision 5: Performance Optimization

**Decision**: Apply user filtering after system filtering to minimize processing load

**Rationale**:
- User filtering operates on already-enhanced tools (typically 10-50 tools)
- O(n) filtering complexity with O(1) set-based tool ID lookup
- Applied at optimal point in existing synchronization pipeline
- Maintains efficient memory usage patterns

## Decision 6: Backward Compatibility Approach

**Decision**: Additive enhancement using optional configuration fields

**Rationale**:
- When tool_selection_strategy is ALL, all system-enabled tools available
- When tool_selection_strategy is NONE, no tools available
- When tool_selection_strategy is SELECTED, only tools in tool_selections available
- When response_schema is null/missing, behavior unchanged  
- Existing invocations continue working without modification

## Technical Architecture Summary

### Metadata Flow (Tool Filtering)
```
Workflow → AgenticActivity → AgentOrchestratorClient → InvocationsRouter →
InvocationService → InvocationExecutor → OrchestrationService →
AgentStateFactory → ToolSynchronizer → GenericAgent
```

### Metadata Flow (Structured Output)  
```
Workflow → AgenticActivity → [same pipeline] → AgentStateFactory →
GenericAgent._execute() → llm.with_structured_output()
```

### Key Files Modified
- **Backend**: workflow-definition.schema.json, agentic_activity.py, agent_state.py, tool_filtering.py, generic_agent.py
- **Frontend**: TaskNode.tsx (configuration UI for tool selection and schema editor)

## Security Considerations

- Tool ID validation with UUID format checking (template expressions supported)
- User filtering provides additional security layer over system filtering
- Schema injection prevention through validation
- Cannot override system-level disabled tools

## Performance Impact

- User filtering: O(n) where n = enhanced tools, optimized with set-based lookup
- Schema validation: <2s response time requirement
- Memory: Additional fields in AgentState, potentially smaller filtered tool lists
- Caching: Tool synchronization results cacheable by (invocation_id, tool_selection_strategy, tool_selections) tuple

This research provides the foundation for implementing both tool selection control and structured output formatting as cohesive enhancements to the existing agentic workflow system.
