# Data Model: Agent Orchestrator Tool Manager Integration

## Core Components

### Tool Manager Client
**Purpose**: HTTP client wrapper for Tool Manager REST API endpoints
**Location**: `src/nexus/agent_orchestrator/tool_manager/client.py`

**Fields**:
- `base_url: str` - Tool Manager API base URL  
- `timeout: float` - Request timeout in seconds
- `session: httpx.AsyncClient` - HTTP session for connection pooling

**Methods**:
- `get_enabled_tool_providers() -> List[ToolProviderWithConfiguration]` - Fetch enabled tool providers
- `get_enabled_tools() -> List[ToolWithParameters]` - Fetch enabled tools (filtered by enabled=true)
- `update_tool_status(tool_id: str, status: ToolStatus, refresh_error: Optional[str])` - Update tool refresh_error field
- `close()` - Cleanup resources

**Relationships**:
- Consumes Tool Manager REST API
- Uses retry_with_backoff utility (reads system configuration automatically)
- Returns ToolProviderWithConfiguration and ToolWithParameters from OpenAPI schemas
- Injected into Agent Orchestrator

## API Response Models (from OpenAPI)

### ToolProviderWithConfiguration
**Location**: Tool Manager OpenAPI schema `tool-providers.yaml`
**Usage**: Response payload from `/tool-providers` endpoint
**Contains**: Provider configuration, enabled status, validation status

### ToolWithParameters  
**Location**: Tool Manager OpenAPI schema `tools.yaml`
**Usage**: Response payload from `/tools` endpoint
**Contains**:
- Tool metadata (id, name, description, namespaced_name)
- Provider relationship (provider_id)
- Enablement status (enabled field)
- Tool parameters array (ToolParameter objects)
- Status and refresh information

### ToolParameter
**Location**: Tool Manager OpenAPI schema `tools.yaml`
**Usage**: Parameter definition within ToolWithParameters
**Contains**: Parameter schema for tool execution (name, type, description, required, default_value)

## Integration Flow

### ProviderFactory Integration and Tool Loading
1. **Tool Provider Discovery**: ToolSynchronizer → ToolManagerClient.get_all_tool_providers() → List[ToolProviderWithConfiguration]
2. **Tool Metadata Retrieval**: ToolSynchronizer → ToolManagerClient.get_all_tools() → (enabled_tools, disabled_tools)
3. **Provider Processing**: ProviderFactory creates provider adapters from ToolProviderWithConfiguration
4. **Tool Retrieval**: Provider adapters call get_base_tools() → List[BaseTool] with namespaced names
5. **Tool Filtering**: Filter BaseTools by ToolWithParameters.enabled status using namespaced_name matching
6. **Tool Synchronization**: Update missing tools to MISSING status, re-enable MISSING→AVAILABLE tools
7. **StateGraph Registration**: Pass filtered BaseTools to LangGraph StateGraph
8. **Error Reporting**: If tool execution fails, use ToolManagerClient.update_tool_status() with refresh_error

### Simplified Integration Flow
```
User Request → OrchestrationService → ToolSynchronizer(invocation_id)
                                   ↓
                              synchronize_tools() → Filtered BaseTool[]
                                   ↓  
                              StateGraph(tools) → Execution
```

## Tool Synchronization Component

### ToolSynchronizer Class
**Purpose**: Stateful orchestration of tool discovery, validation, and synchronization
**Location**: `src/nexus/agent_orchestrator/tool_manager/tool_services.py`

**Fields**:
- `invocation_id: UUID` - Unique identifier for this synchronization session
- `all_providers: List[ToolProviderWithConfiguration]` - Discovered providers (enabled and disabled)
- `enabled_tools: List[ToolWithParameters]` - Tools with enabled=True from Tool Manager
- `disabled_tools: List[ToolWithParameters]` - Tools with enabled=False from Tool Manager  
- `namespaced_tools: List[NamespacedBaseTool]` - Tools retrieved from ProviderFactory

**Methods**:
- `synchronize_tools() -> List[BaseTool]` - Complete synchronization workflow
- Handles provider discovery, tool retrieval, filtering, missing tool updates, and re-enablement

**Integration**: Replaces direct ToolManagerClient usage in OrchestrationService._get_tools()

## Component Structure

```
src/nexus/agent_orchestrator/
├── tool_manager/
│   ├── __init__.py
│   ├── tool_manager_client.py    # HTTP Client (T008-T011)
│   ├── tool_services.py          # Integration & Sync (T017-T020)
│   ├── tool_filtering.py         # Filtering Logic (T018)
│   └── types.py                  # Type Definitions
└── orchestrator.py              # Main orchestrator with StateGraph integration
```

## Dependencies

- **API Schemas**: ToolProviderWithConfiguration, ToolWithParameters from Tool Manager OpenAPI specs
- **HTTP Client**: `httpx` for async API calls
- **Retry Logic**: `retry_with_backoff` utility (existing, reads system configuration)
- **ProviderFactory**: For creating provider adapters and retrieving BaseTools from configured providers
- **LangGraph**: StateGraph with filtered BaseTools
- **Tool Status**: Update refresh_error field when tools fail

## Key Design Decisions

1. **ProviderFactory Integration**: Use existing ProviderFactory pattern to connect to configured providers, leveraging existing adapter infrastructure
2. **Reuse Existing Models**: Leverage ToolProviderWithConfiguration and ToolWithParameters from API schemas  
3. **Namespaced Tool Filtering**: Filter BaseTools by ToolWithParameters.enabled field using namespaced_name matching
4. **Tool Synchronization**: Comprehensive sync workflow including missing tool detection and re-enablement
5. **Error Feedback Loop**: Report tool execution errors back to Tool Manager via refresh_error field
6. **Provider Lifecycle Management**: Automatic retry and re-enablement of ERROR providers and MISSING tools
