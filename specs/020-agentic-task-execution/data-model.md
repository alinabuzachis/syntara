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

### LangChain MCP Client Integration and Tool Loading
1. **Tool Provider Discovery**: ToolManagerClient.get_enabled_tool_providers() → List[ToolProviderWithConfiguration] (includes MCP server URLs)
2. **Tool Metadata Retrieval**: ToolManagerClient.get_enabled_tools() → List[ToolWithParameters] (for filtering enablement)
3. **MCP Client Connection**: LangChain MCP Client connects directly to ToolProvider MCP server URLs from MCPConfiguration
4. **Tool Retrieval**: LangChain MCP Client retrieves all tools from ToolProvider MCP servers → List[BaseTool]
5. **Tool Filtering**: Filter LangChain BaseTools by corresponding ToolWithParameters.enabled status
6. **StateGraph Registration**: Pass filtered BaseTools to LangGraph StateGraph
7. **Error Reporting**: If tool execution fails, use ToolManagerClient.update_tool_status() with refresh_error

### Data Flow Sequence
```
User Request → Agent Orchestrator → ToolManagerClient.get_enabled_tool_providers()
              ↓
ToolProviderWithConfiguration[] (with MCP URLs) → ToolManagerClient.get_enabled_tools()
              ↓
ToolWithParameters[] (enablement status) → LangChain MCP Client.connect(MCP_URLs)
              ↓
LangChain MCP Client.get_tools() → BaseTool[] (from ToolProvider MCP servers)
              ↓
Filter BaseTools by ToolWithParameters.enabled → Filtered BaseTool[]
              ↓
StateGraph(filtered_tools) → LangGraph execution → User Response
              ↓
Tool errors → ToolManagerClient.update_tool_status(refresh_error)
```

## Component Structure

```
src/nexus/agent_orchestrator/
├── tool_manager/
│   ├── __init__.py
│   └── client.py          # Tool Manager HTTP Client
└── orchestrator.py        # Main orchestrator with StateGraph integration
```

## Dependencies

- **API Schemas**: ToolProviderWithConfiguration, ToolWithParameters from Tool Manager OpenAPI specs
- **HTTP Client**: `httpx` for async API calls
- **Retry Logic**: `retry_with_backoff` utility (existing, reads system configuration)
- **LangChain MCP Client**: For connecting to ToolProvider MCP servers → BaseTool[]
- **LangGraph**: StateGraph with filtered BaseTools
- **Tool Status**: Update refresh_error field when tools fail

## Key Design Decisions

1. **No Custom Bridge/Adapter**: Use LangChain native MCP client to connect to existing ToolProvider MCP servers, then filter by enabled status
2. **Reuse Existing Models**: Leverage ToolProviderWithConfiguration and ToolWithParameters from API schemas  
3. **Simple Filtering**: Filter langchain BaseTools list based on ToolWithParameters.enabled field
4. **Error Feedback Loop**: Report tool execution errors back to Tool Manager via refresh_error field
5. **System Configuration**: retry_with_backoff handles retry configuration from system settings
