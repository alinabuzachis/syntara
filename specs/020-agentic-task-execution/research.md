# Research: Agent Orchestrator Tool Manager Integration

## HTTP Client Library for Tool Manager Integration

### Decision: httpx for HTTP Client Implementation
**Rationale**:
- httpx provides async/await support aligned with FastAPI ecosystem
- Built-in timeout and retry capabilities
- Strong type safety with Python 3.12
- Existing nexus codebase likely uses httpx for consistency

**Alternatives considered**:
- requests: Synchronous only, would block async workflows
- aiohttp: Different session management patterns, less FastAPI alignment

### Decision: Use existing retry_with_backoff utility
**Rationale**:
- Per feature specification requirement FR-009
- Maintains consistency with existing error handling patterns
- Avoids reinventing retry logic

**Alternatives considered**:
- tenacity library: Would introduce new dependency
- Manual retry logic: Violates DRY principle

## LangGraph Integration Patterns

### Decision: LangChain Native MCP Client with ToolProvider MCP Servers
**Rationale**:
- ToolProviders already have MCP server URLs in their MCPConfiguration
- LangChain's native MCP client can directly connect to these existing MCP servers
- LangChain automatically converts MCP tools to LangGraph BaseTools
- No bridge needed - direct connection: Tool Manager Client → LangChain MCP Client → ToolProvider MCP Servers

**Alternatives considered**:
- Custom MCP bridge/adapter: Unnecessary complexity when ToolProviders already have MCP servers
- Custom tool adapter pattern: Would bypass LangChain's native MCP integration
- Direct REST to LangGraph integration: Would miss benefits of LangChain's MCP tooling

### Decision: Dynamic tool discovery per request
**Rationale**:
- Per clarification: "Every request - always query for current enabled status"
- Ensures tools disabled between discovery and execution are handled gracefully
- Supports runtime configuration changes

**Alternatives considered**:
- Cache tools during initialization: Stale data risk, doesn't handle runtime changes
- Hybrid caching with TTL: Added complexity, unclear cache invalidation strategy

## Error Handling Strategy

### Decision: Custom error handler function for tool execution monitoring
**Rationale**:
- **Updated 2025-12-15**: Use ToolNode's built-in `handle_tool_errors` parameter with custom function
- Custom error handler can detect tool execution failures and report back to Tool Manager
- Per requirement FR-007: Update failed tool status to ERROR with refresh_error field
- Cleaner than subclassing - leverages built-in LangGraph capabilities
- Provides feedback loop to Tool Manager for operational visibility

**Alternatives considered**:
- LangGraph component subclassing: Unnecessary complexity, built-in error handling available
- External monitoring: No direct access to tool execution context
- Silent failure: No operational visibility, harder debugging
- Tool Manager polling: Inefficient, doesn't capture real-time failures

### Decision: Graceful degradation for agent invocation
**Rationale**:
- Allows agent invocation to continue without tool execution when tools fail
- StateGraph should handle tool failures gracefully through LangGraph patterns
- Error reporting happens via custom error handler function

**Alternatives considered**:
- Fail fast on tool errors: Would break entire workflow for single tool failure

## Agent Orchestrator StateGraph Integration

### Decision: Use standard LangGraph ToolNode with custom error handler function
**Rationale**:
- **Updated 2025-12-15**: LangGraph ToolNode accepts custom function for `handle_tool_errors` parameter
- Custom error handler function can directly update Tool Manager status on failures
- No need to subclass ToolNode or parse streamed ToolMessages
- Maintains clean separation: error handling logic isolated in dedicated function
- Allows graceful degradation while providing Tool Manager integration
- Simpler implementation than custom ToolNode subclassing

**Implementation approach**:
- Create custom error handler function that updates Tool Manager on tool failures
- Pass error handler to ToolNode: `ToolNode(tools, handle_tool_errors=custom_error_handler)`
- Error handler receives tool execution context and can report failures to Tool Manager
- Workflow continues gracefully after error reporting

**Alternatives considered**:
- Custom ToolNode subclass: Unnecessary complexity, standard ToolNode supports custom error handlers
- Stream events monitoring: More complex than direct error handler integration
- Embed Tool Manager client directly in StateGraph nodes: Tight coupling

## Data Model Strategy

### Decision: Reuse existing Tool Manager models
**Rationale**:
- ToolProviderWithConfiguration and ToolWithParameters models already exist in Tool Manager
- These models are returned directly from Tool Manager REST API endpoints
- No need to create new models or duplicate existing functionality
- Maintains consistency with Tool Manager's data contracts
- Already follow SQLModel patterns as per architectural decisions

**Alternatives considered**:
- Create new models in Agent Orchestrator: Duplication of existing functionality
- Plain Python dataclasses: Less validation, inconsistent with existing Tool Manager models
- Custom Pydantic models: Would violate DRY principle and create maintenance overhead

## Configuration Management

### Decision: Dependency injection for Tool Manager client configuration
**Rationale**:
- Per constitutional principle IV: Explicit Configuration
- Allows environment-specific API endpoints and credentials
- Supports testing with mock clients

**Alternatives considered**:
- Global configuration: Harder to test, violates dependency injection principle
- Environment variables only: Less flexible for different deployment contexts

## Tool Filtering Strategy

### Decision: Filter BaseTools by Tool.enabled field after MCP retrieval
**Rationale**:
- ToolManagerClient provides Tool.enabled metadata for filtering decisions
- LangChain MCP client retrieves all BaseTools from ToolProvider MCP servers
- Filter BaseTools list based on corresponding Tool.enabled field from REST API
- Maintains clean separation: MCP for tool retrieval, REST API for enablement status

**Implementation approach**:
- Tool Manager Client fetches ToolProviders (with MCP URLs) and Tools (with enabled status)
- LangChain MCP Client connects to ToolProvider MCP server URLs to get all BaseTools
- Filter BaseTools array by matching against Tool.enabled field from REST API response
- Provide filtered BaseTools list to LangGraph StateGraph

**Alternatives considered**:
- Filter at MCP server level: ToolProvider MCP servers don't have Tool Manager enablement context
- Custom BaseTools creation: Would bypass LangChain's proven MCP tool conversion
- Runtime filtering in StateGraph: Better to filter before StateGraph initialization
