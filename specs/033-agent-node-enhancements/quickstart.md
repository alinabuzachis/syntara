# Quickstart: Agentic Node Enhancements Implementation

**Date**: 2026-02-13  
**Feature**: Tool Selection Control and Structured Output Formatting

## Overview

This quickstart guide provides the implementation roadmap for adding tool selection control and structured output formatting capabilities to agentic workflow nodes in the Nexus system.

## Prerequisites

- Python 3.12+ development environment
- Access to nexus and nexus-ui repositories  
- Understanding of LangChain's `with_structured_output()` functionality
- Familiarity with existing agent orchestration pipeline

## Implementation Phases

### Phase 1: Backend Core Changes

#### 1.1 Update Workflow Schema

**File**: `src/nexus/schemas/workflows/workflow-definition.schema.json`

Add new properties to agenticTask configuration:

```json
{
  "agenticTask": {
    "properties": {
      "config": {
        "properties": {
          "toolSelectionStrategy": {
            "type": "string",
            "enum": ["ALL", "NONE", "SELECTED"],
            "default": "ALL",
            "description": "Strategy for tool selection"
          },
          "toolSelections": {
            "type": "array",
            "description": "List of tool IDs when strategy is SELECTED",
            "items": {
              "type": "string",
              "format": "uuid"
            }
          },
          "responseSchema": {
            "type": "object",
            "description": "JSON Schema Draft 2020-12 for structured response output",
            "additionalProperties": true
          }
        }
      }
    }
  }
}
```

#### 1.2 Extend InvocationCreateRequest

**File**: `src/nexus/agent_orchestrator/models/request.py`

```python
class InvocationCreateRequest(SQLModel, populate_by_name=True):
    # Existing fields...
    prompt: str
    session_id: str
    context_data: dict[str, object]

    # Tool selection fields
    tool_selection_strategy: ToolSelectionStrategy = Field(
        default=ToolSelectionStrategy.ALL,
        validation_alias=AliasChoices("toolSelectionStrategy", "tool_selection_strategy"),
        serialization_alias="tool_selection_strategy",
        description="Strategy for tool selection: ALL, NONE, or SELECTED",
    )

    tool_selections: list[str] | None = Field(
        default=None,
        validation_alias=AliasChoices("toolSelections", "tool_selections"),
        serialization_alias="tool_selections",
        description="List of tool IDs when strategy is SELECTED",
    )

    response_schema: dict[str, Any] | None = Field(
        default=None,
        validation_alias=AliasChoices("responseSchema", "response_schema"),
        serialization_alias="response_schema",
        description="JSON Schema Draft 2020-12 for structured response output",
    )
```

#### 1.3 Extend Invocation Model

**File**: `src/nexus/agent_orchestrator/models/invocation.py`

```python
class Invocation(UserOwnedResource, table=True):
    # Existing fields...
    prompt: str
    session_id: str
    context_data: dict[str, object]

    # Tool selection fields
    tool_selection_strategy: ToolSelectionStrategy = Field(
        default=ToolSelectionStrategy.ALL,
        sa_column=postgres_enum_column(
            ToolSelectionStrategy,
            "toolselectionstrategy",
            index=False,
            nullable=False,
        ),
        description="Strategy for tool selection",
    )

    tool_selections: list[str] | None = Field(
        default=None,
        sa_type=JSONB,
        description="List of tool IDs when strategy is SELECTED",
    )

    response_schema: dict[str, Any] | None = Field(
        default=None,
        sa_type=JSONB,
        description="JSON Schema Draft 2020-12 for structured response output",
    )
```

#### 1.4 Extend AgenticExecutorConfig

**File**: `src/nexus/workflows/models/workflow_definition.py`

```python
class AgenticExecutorConfig(TemplateAwareBaseModel):
    # Existing fields...

    tool_selection_strategy: ToolSelectionStrategy = Field(
        default=ToolSelectionStrategy.ALL,
        description="Strategy for tool selection: ALL, NONE, or SELECTED",
        alias="toolSelectionStrategy",
    )

    tool_selections: list[str] | None = Field(
        default=None,
        description="List of tool IDs when strategy is SELECTED",
        alias="toolSelections",
    )

    response_schema: dict[str, Any] | None = Field(
        default=None,
        description="JSON Schema Draft 2020-12 for structured response output",
        alias="responseSchema",
    )

    @field_validator("tool_selections")
    @classmethod
    def validate_tool_selections_format(cls, v: list[str] | None, info) -> list[str] | None:
        """Validate tool_selections based on strategy."""
        strategy = info.data.get("tool_selection_strategy", ToolSelectionStrategy.ALL)

        if strategy == ToolSelectionStrategy.SELECTED:
            if v is None or len(v) == 0:
                msg = "tool_selections is required when tool_selection_strategy is 'SELECTED'"
                raise ValueError(msg)
            # Validate each tool_id is a valid UUID format (unless it's a template expression)
            for tool_id in v:
                if isinstance(tool_id, str) and TEMPLATE_PATTERN.search(tool_id):
                    continue
                try:
                    uuid.UUID(tool_id)
                except ValueError as err:
                    msg = f"Invalid tool_id format: '{tool_id}'. Must be a valid UUID."
                    raise ValueError(msg) from err
        else:
            # For ALL or NONE strategies, tool_selections should be null
            if v is not None:
                msg = f"tool_selections must be null when tool_selection_strategy is '{strategy.value}'"
                raise ValueError(msg)

        return v
```

#### 1.5 Update AgentState

**File**: `src/nexus/agent_orchestrator/models/agent_state.py`

```python
class AgentState(TypedDict):
    # Existing fields...

    tool_selection_strategy: ToolSelectionStrategy
    """Strategy for tool selection: ALL, NONE, or SELECTED"""

    tool_selections: list[str] | None
    """List of tool IDs when strategy is SELECTED, null otherwise"""

    response_schema: dict[str, Any] | None  
    """JSON Schema Draft 2020-12 definition for structured agent responses"""
```

#### 1.6 Update AgentStateFactory

**File**: `src/nexus/agent_orchestrator/models/agent_state_factory.py`

```python
@staticmethod
def create_initial_state(
    prompt: str,
    session_id: str,
    invocation_id: UUID,
    correlation_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    # Explicit parameters
    tool_selection_strategy: ToolSelectionStrategy = ToolSelectionStrategy.ALL,
    tool_selections: list[str] | None = None,
    response_schema: dict[str, Any] | None = None,
) -> AgentState:
    return AgentState(
        # Existing fields...
        tool_selection_strategy=tool_selection_strategy,
        tool_selections=tool_selections,
        response_schema=response_schema,
    )
```

#### 1.7 Add User Tool Filtering

**File**: `src/nexus/agent_orchestrator/tool_manager/tool_filtering.py`

```python
def filter_base_tools_by_user_selection(
    enhanced_tools: list[BaseTool],
    tool_selection_strategy: ToolSelectionStrategy,
    tool_selections: list[str] | None = None,
) -> list[BaseTool]:
    """Filter BaseTools by user-specified tool selection.

    Args:
        enhanced_tools: List of BaseTools enhanced with metadata
        tool_selection_strategy: Strategy for tool selection (ALL, NONE, or SELECTED)
        tool_selections: List of tool IDs when strategy is SELECTED

    Returns:
        List of BaseTools filtered to user's selection
    """
    if tool_selection_strategy == ToolSelectionStrategy.ALL:
        # Return all tools
        return enhanced_tools

    if tool_selection_strategy == ToolSelectionStrategy.NONE:
        # No tools allowed
        return []

    if tool_selection_strategy == ToolSelectionStrategy.SELECTED:
        if not tool_selections:
            # No specific tools selected
            return []

        allowed_ids_set = set(tool_selections)
        filtered_tools = []

        for tool in enhanced_tools:
            tool_id = tool.metadata.get("tool_id") if hasattr(tool, "metadata") and tool.metadata else None

            if tool_id and tool_id in allowed_ids_set:
                filtered_tools.append(tool)

        return filtered_tools

    return enhanced_tools  # Fallback case
```

#### 1.8 Update ToolSynchronizer

**File**: `src/nexus/agent_orchestrator/tool_manager/tool_services.py`

```python
async def synchronize_tools(self, tool_selection_strategy: ToolSelectionStrategy = ToolSelectionStrategy.ALL, tool_selections: list[str] | None = None) -> list[BaseTool]:
    """Perform tool synchronization and validation before execution."""
    # Steps 1-4: Existing implementation
    # ... existing code ...

    # NEW: Step 5 - Apply user tool filtering
    enhanced_tools = filter_base_tools_by_user_selection(enhanced_tools, tool_selection_strategy, tool_selections)

    # Steps 6-8: Existing implementation  
    # ... existing code ...

    return enhanced_tools
```

#### 1.9 Update OrchestrationService

**File**: `src/nexus/agent_orchestrator/services/orchestration_service.py`

```python
async def _get_tools(self, invocation_id: UUID, tool_selection_strategy: ToolSelectionStrategy = ToolSelectionStrategy.ALL, tool_selections: list[str] | None = None) -> list[BaseTool]:
    synchronizer = ToolSynchronizer(invocation_id)
    return await synchronizer.synchronize_tools(tool_selection_strategy, tool_selections)

async def _setup_graph(self, state: AgentState) -> CompiledStateGraph[AgentState, None, Any, Any]:
    # ... existing setup ...

    invocation_id: UUID = UUID(state["invocation_id"])
    tool_selection_strategy = state.get("tool_selection_strategy", ToolSelectionStrategy.ALL)
    tool_selections = state.get("tool_selections")
    available_tools: list[BaseTool] = await self._get_tools(invocation_id, tool_selection_strategy, tool_selections)

    # ... rest of setup ...
```

#### 1.10 Update GenericAgent

**File**: `src/nexus/agent_orchestrator/agents/generic_agent.py`

```python
async def _execute(self, state: AgentState) -> AgentState:
    """Execute GenericAgent with optional structured output."""

    # Configure LLM with tools
    llm_with_tools = self.llm.bind_tools(self.available_tools)

    # Prepare messages
    messages: list[AnyMessage] = [
        SystemMessage(content="..."),  # existing system message
    ] + state["messages"]

    # Execute with structured output fallback if schema provided
    if state.get("response_schema"):
        try:
            structured_content = await self._execute_structured_output(state, messages)
            response_model = GenericAgentResponse(
                content=json.dumps(structured_content, indent=2),
                response_metadata={
                    "structured_output": structured_content,
                    "schema_applied": True,
                }
            )
            # Create mock message for state consistency
            result_message = AIMessage(content=json.dumps(structured_content, indent=2))
        except StructuredOutputError:
            # Fallback to unstructured output per "User Story 2, Acceptance Criteria 3"
            logger.warning("Structured output failed, falling back to unstructured output")
            result_message = await llm_with_tools.ainvoke(messages)
            response_model = GenericAgentResponse(
                content=str(result_message.content),
                response_metadata=getattr(result_message, "response_metadata", {})
            )
    else:
        # Regular text response
        result_message = await llm_with_tools.ainvoke(messages)
        response_model = GenericAgentResponse(
            content=str(result_message.content),
            response_metadata=getattr(result_message, "response_metadata", {})
        )

    # Update state
    state["messages"] = [result_message]
    state["result"] = response_model.model_dump(by_alias=True)

    return state

async def _execute_structured_output(self, state: AgentState, messages: list[AnyMessage]) -> dict:
    """Execute with structured output using cascading fallback strategies.

    Separates schema validation failures from runtime exceptions:
    - Schema validation failures: Immediate fallback to next strategy
    - Runtime exceptions: Retry with @retry_with_backoff mechanism
    - Strategy exhaustion: Raises non-retryable StructuredOutputError
    """
    schema = state["response_schema"]
    strategies = [
        ("native", self._try_native_structured_output),
        ("pydantic", self._try_pydantic_parser),
        ("structured_parser", self._try_structured_parser)
    ]

    for strategy_name, strategy_func in strategies:
        try:
            result = await strategy_func(schema, messages)
            if self._validate_schema_compliance(result, schema):
                logger.debug(f"Structured output succeeded with {strategy_name} strategy")
                return result
            else:
                logger.info(f"Schema validation failed for {strategy_name} strategy, trying next strategy")
                continue
        except Exception as e:
            # Runtime exceptions (LLM service errors, network issues) should be retried
            logger.error(f"Runtime exception in {strategy_name} strategy: {e}")
            raise  # Let @retry_with_backoff handle this

    # All strategies failed schema validation - this is NOT retryable
    raise StructuredOutputError(
        f"All structured output strategies failed schema validation. "
        f"Schema: {schema.get('title', 'Unnamed')}. Consider fallback to unstructured output."
    )

@retry_with_backoff
async def _try_native_structured_output(self, schema: dict, messages: list[AnyMessage]) -> dict:
    """Try native structured output with runtime exception retry."""
    llm_with_structure = self.llm.bind_tools(self.available_tools).with_structured_output(
        schema, method="json_schema"
    )
    result = await llm_with_structure.ainvoke(messages)
    return result

@retry_with_backoff  
async def _try_pydantic_parser(self, schema: dict, messages: list[AnyMessage]) -> dict:
    """Try Pydantic output parser with runtime exception retry."""
    from langchain_core.output_parsers import PydanticOutputParser
    pydantic_model = self._json_schema_to_pydantic(schema)
    parser = PydanticOutputParser(pydantic_object=pydantic_model)

    llm_with_parser = self.llm.bind_tools(self.available_tools) | parser
    result = await llm_with_parser.ainvoke(messages)
    return result.dict()

@retry_with_backoff
async def _try_structured_parser(self, schema: dict, messages: list[AnyMessage]) -> dict:
    """Try structured output parser with runtime exception retry."""
    from langchain_core.output_parsers import StructuredOutputParser
    response_schemas = self._json_schema_to_response_schemas(schema)
    parser = StructuredOutputParser.from_response_schemas(response_schemas)

    enhanced_messages = self._add_format_instructions(messages, parser)
    llm_with_parser = self.llm.bind_tools(self.available_tools) | parser
    result = await llm_with_parser.ainvoke(enhanced_messages)
    return result

def _validate_schema_compliance(self, result: dict, schema: dict) -> bool:
    """Validate that the LLM response conforms to the required schema."""
    try:
        import jsonschema
        jsonschema.validate(result, schema)
        return True
    except jsonschema.exceptions.ValidationError as e:
        logger.debug(f"Schema validation failed: {e}")
        return False
```

#### 1.11 Update AgenticActivity

**File**: `src/nexus/workflows/workflow_engine/activities/agentic_activity.py`

```python
# Update agent client call to pass explicit fields
invocation_id = await agent_client.invoke_agent_async(
    prompt=config.prompt,
    user_id=user_id,
    agent=config.agent,
    model=config.model,
    input_data=input_data,
    file_ids=file_ids,
    metadata=agent_metadata,
    correlation_id=correlation_id,
    # Pass explicit fields from activity_config
    tool_selection_strategy=activity_config.get("tool_selection_strategy", ToolSelectionStrategy.ALL),
    tool_selections=activity_config.get("tool_selections"),
    response_schema=activity_config.get("response_schema"),
)
```

#### 1.12 Update Agent Orchestrator Client

**File**: `src/nexus/workflows/clients/agent_orchestrator_client.py`

```python
async def invoke_agent_async(
    self,
    prompt: str,
    user_id: str,
    session_id: str | None = None,
    agent: str | None = None,
    model: str | None = None,
    input_data: dict[str, Any] | None = None,
    file_ids: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
    correlation_id: str | None = None,
    # Explicit parameters
    tool_selection_strategy: ToolSelectionStrategy = ToolSelectionStrategy.ALL,
    tool_selections: list[str] | None = None,
    response_schema: dict[str, Any] | None = None,
) -> str:
    payload = {
        "prompt": prompt,
        "createdBy": user_id,
        "sessionId": session_id,
        "contextData": {/* existing context fields */},
        # Explicit fields at top level
        "toolSelectionStrategy": tool_selection_strategy.value,
        "toolSelections": tool_selections,
        "responseSchema": response_schema,
    }
    # Remove null fields (except toolSelectionStrategy which is always present)
    payload = {k: v for k, v in payload.items() if v is not None or k == "toolSelectionStrategy"}
```

#### 1.13 Update Invocation Router

**File**: `src/nexus/invocations/router.py`

```python
async def create_invocation(
    request: InvocationCreateRequest,
    files: list[UploadFile] | None = None,
    invocation_service: InvocationService = Depends(get_invocation_service_with_background_tasks),
) -> Invocation:
    return await invocation_service.create_invocation(
        prompt=request.prompt,
        session_id=request.session_id,
        context_data=request.context_data,
        files=files,
        # Pass explicit fields
        tool_selection_strategy=request.tool_selection_strategy,
        tool_selections=request.tool_selections,
        response_schema=request.response_schema,
    )
```

#### 1.14 Update Invocation Service

**File**: `src/nexus/agent_orchestrator/services/invocation_service.py`

```python
async def create_invocation(
    self,
    prompt: str,
    session_id: str,
    context_data: dict[str, object] | None = None,
    files: list[UploadFile] | None = None,
    # Explicit parameters
    tool_selection_strategy: ToolSelectionStrategy = ToolSelectionStrategy.ALL,
    tool_selections: list[str] | None = None,
    response_schema: dict[str, Any] | None = None,
) -> Invocation:
    # Create invocation with explicit fields
    invocation = Invocation(
        id=invocation_id,
        prompt=prompt,
        created_by=self.user.id,
        session_id=session_id,
        status=InvocationStatus.CREATED,
        context_data=final_context_data,
        # Store explicit fields
        tool_selection_strategy=tool_selection_strategy,
        tool_selections=tool_selections,
        response_schema=response_schema,
    )
```

#### 1.15 Update Invocation Executor

**File**: `src/nexus/agent_orchestrator/executor/invocation_executor.py`

```python
# Pass explicit fields to orchestration service
result_dict = await orchestration_service.execute(
    prompt=invocation.prompt,
    session_id=invocation.session_id,
    invocation_id=exec_invocation_id,
    correlation_id=correlation_id,
    metadata=invocation.context_data,
    # Pass explicit fields from database
    tool_selection_strategy=invocation.tool_selection_strategy,
    tool_selections=invocation.tool_selections,
    response_schema=invocation.response_schema,
)
```

#### 1.16 Create Database Migration

**File**: Create new Alembic migration

```bash
# Generate migration
alembic revision --autogenerate -m "Add explicit tool selection and response schema fields to invocations"

# Migration will add:
# - tool_selection_strategy ENUM column with default 'ALL'
# - tool_selections JSONB column (nullable)
# - response_schema JSONB column (nullable)
```

### Phase 2: Frontend UI Changes

#### 2.1 Update TaskNode Component

**File**: `nexus-ui/src/routes/automations/canvas/nodes/TaskNode.tsx`

Add configuration UI for tool selection and schema definition:

```typescript
// Add to TaskActivityDetails component
const agentConfig = props.data.task.executor === 'agentic' ?
  (props.data.task.config as AgenticTaskConfig) : undefined

// Extend AgenticTaskConfig type
type AgenticTaskConfig = {
  tools?: string[]
  toolSelectionStrategy?: 'ALL' | 'NONE' | 'SELECTED'
  toolSelections?: string[]
  responseSchema?: object
}

// Add rendering for new fields
{props.data.task.executor === 'agentic' && (
  <>
    {renderToolSelection('Tool Selection', agentConfig?.toolSelectionStrategy, agentConfig?.toolSelections)}
    {renderSchemaEditor('Response Schema', agentConfig?.responseSchema)}
  </>
)}
```

#### 2.2 Add Tool Selection UI

Create multi-select component with:
- "All tools", "No tools", "Specific tools" options
- Tool search and filtering
- Selection counts and easy controls

#### 2.3 Add Schema Editor UI  

Create JSON schema editor with:
- Syntax highlighting and validation
- Real-time validation feedback
- Common schema templates and examples

### Phase 3: Testing & Validation

#### 3.1 Unit Tests

**Files**:
- `tests/unit/agent_orchestrator/test_tool_filtering.py`
- `tests/unit/agent_orchestrator/test_structured_output.py`
- `tests/unit/workflows/test_agentic_activity.py`

Test scenarios:
- Tool filtering with valid/invalid tool IDs
- Schema validation and structured output generation
- Optional configuration for workflows
- Error handling for invalid configurations

#### 3.2 Integration Tests

**Files**:
- `tests/integration/workflows/test_enhanced_agentic_workflows.py`

Test end-to-end flows:
- Tool-filtered workflow execution
- Structured output workflow execution  
- Combined tool filtering + structured output
- Performance impact validation

## Quick Development Setup

### 1. Environment Setup

```bash
# Clone repositories
git clone <nexus-repo> nexus
git clone <nexus-ui-repo> nexus-ui

# Setup Python environment
cd nexus
uv sync
```

### 2. Development Workflow

```bash
# Make changes
# Run formatting
make format

# Run linting  
make lint

# Run tests
make test-all

# Run type checking
make typecheck
```

### 3. Testing Checklist

- [ ] Tool filtering works with different strategies (ALL, NONE, SELECTED)
- [ ] Invalid tool strategies and selections are handled gracefully
- [ ] Structured output conforms to provided schemas
- [ ] Schema validation failures trigger retry mechanism
- [ ] Optional configuration working
- [ ] Frontend UI allows tool selection and schema definition
- [ ] End-to-end workflow execution successful

## Key Configuration Examples

### Tool Selection Configuration

```json
{
  "task": {
    "executor": "agentic",
    "config": {
      "model": "gpt-4",
      "toolSelectionStrategy": "SELECTED",
      "toolSelections": [
        "550e8400-e29b-41d4-a716-446655440001",
        "550e8400-e29b-41d4-a716-446655440002"
      ]
    }
  }
}
```

### Structured Output Configuration

```json
{
  "task": {
    "executor": "agentic",
    "config": {
      "model": "gpt-4",
      "responseSchema": {
        "type": "object",
        "properties": {
          "summary": {"type": "string"},
          "priority": {"type": "string", "enum": ["low", "medium", "high"]}
        },
        "required": ["summary", "priority"]
      }
    }
  }
}
```

### Combined Configuration

```json
{
  "task": {
    "executor": "agentic",
    "config": {
      "model": "gpt-4",
      "toolSelectionStrategy": "SELECTED",
      "toolSelections": ["550e8400-e29b-41d4-a716-446655440001"],
      "responseSchema": {
        "type": "object",
        "properties": {
          "analysis": {"type": "string"},
          "confidence": {"type": "number", "minimum": 0, "maximum": 1}
        },
        "required": ["analysis"]
      }
    }
  }
}
```

## Expected Outcomes

- Users can configure tool selection for agentic nodes in under 30 seconds
- Agent execution focuses on user-selected tools only
- 95% of workflows with defined output schemas produce compliant responses
- New optional features for workflows
- JSON schema validation provides feedback within 2 seconds
- Enhanced logging captures tool usage and schema validation results

This implementation provides comprehensive tool selection control and structured output formatting using optional configuration properties for agentic workflow functionality.
