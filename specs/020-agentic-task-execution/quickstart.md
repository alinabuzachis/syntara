# Quickstart: Agent Orchestrator Tool Manager Integration

## Overview

This guide demonstrates the end-to-end integration between Agent Orchestrator and Tool Manager for dynamic tool discovery and execution within LangGraph StateGraph workflows.

## Prerequisites

1. Tool Manager service running with registered tool providers
2. Agent Orchestrator service available
3. At least one enabled tool provider with enabled tools
4. User prompt

## Integration Flow Test

### Step 1: Verify Tool Manager Setup

```bash
# Check available tool providers
curl -X GET "http://localhost:8000/api/v1/tool-providers?enabled=true" \
  -H "Content-Type: application/json"

# Expected: List of enabled ToolProviderWithConfiguration objects
# Verify at least one provider has status: "available"
```

```bash
# Check available tools
curl -X GET "http://localhost:8000/api/v1/tools?enabled=true" \
  -H "Content-Type: application/json"

# Expected: List of enabled ToolWithParameters objects  
# Verify tools have enabled: true and status: "available"
```

### Step 2: Test Agent Orchestrator Tool Discovery via Invocation

```bash
# Create invocation requiring tool execution
curl -X POST "http://localhost:8000/api/v1/invocations" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Search for Python files in the codebase",
    "session_id": "test-session-123"
  }'

# Expected: 202 Accepted with Invocation object
# Contains: id, status, prompt, session_id, created_at
```

### Step 3: Monitor Integration via Log Entries

Since the `/invocations` endpoint returns an Invocation object (not execution results), verify integration through log monitoring:

**Agent Orchestrator Logs** (successful integration):
```
INFO: Starting invocation {invocation_id} for session test-session-123
INFO: Starting tool synchronization for invocation {invocation_id}
INFO: Discovered 3 Tool Providers
INFO: Discovered 5 enabled and 2 disabled Tools (from 7 total)
INFO: Retrieved 8 total tools from 3 providers
INFO: Filtered 5 tools for execution
INFO: Identified 0 tools missing from MCP servers
INFO: Re-enabled 1 previously disabled tools that are now available on MCP servers
INFO: Tool synchronization completed for invocation {invocation_id}
INFO: LLM selected tool: code_search
INFO: Tool execution completed successfully
INFO: Invocation {invocation_id} completed with tool usage
```

**Tool Manager Logs** (error reporting):
```
INFO: Tool status update request received for tool {tool_id}
INFO: Updated tool {tool_id} status to 'error' with refresh_error: 'connection timeout'
```

### Step 4: Verify Invocation Results

```bash
# Get invocation details (for testing/debugging)
curl -X GET "http://localhost:8000/api/v1/invocations/{invocation_id}" \
  -H "Content-Type: application/json"

# Expected: Full Invocation object with result field containing agent response
# Check logs for tool execution patterns
```

## Integration Points Validation

### 1. Tool Synchronization Workflow

**Verify**: ToolSynchronizer orchestrates complete discovery process
```python
# In Agent Orchestrator service logs, look for:
# "Starting tool synchronization for invocation {id}"
# "Discovered X Tool Providers"
# "Discovered Y enabled and Z disabled Tools (from W total)"
# "Tool synchronization completed for invocation {id}"
```

### 2. ProviderFactory Integration

**Verify**: Provider adapters load tools successfully
```python
# In Agent Orchestrator logs:
# "Retrieved X tools from provider {provider_name}"
# "Retrieved Y total tools from Z providers"
# Provider retry logs for disabled ERROR providers:
# "Retry failed for disabled provider {provider_name}: {error}"
```

### 3. Tool Synchronization and Re-enablement

**Verify**: Missing tools and re-enablement handled correctly
```python
# In Agent Orchestrator logs:
# "Filtered X tools for execution"
# "Identified Y tools missing from MCP servers"
# "Re-enabled Z previously disabled tools that are now available on MCP servers"
# "Updated missing tool status: {tool_name}"
```

### 4. LangGraph StateGraph Execution

**Verify**: StateGraph receives filtered tools
```python
# In StateGraph execution logs:
# "StateGraph initialized with Y tools for invocation {id}"
# "LLM tool selection process started"
# "LLM selected tool: {tool_name}"
# "Tool execution in progress: {tool_name}"
```

### 5. Error Feedback Loop

**Verify**: Failed tools reported back to Tool Manager
```python
# In Agent Orchestrator logs:
# "Tool execution failed for {tool_name}: {error_message}"
# "Updating Tool Manager with tool failure status"
# "Tool status update sent to Tool Manager for tool {tool_id}"

# In Tool Manager logs:
# "Tool status update received for tool {tool_id}"
# "Updated tool status to ERROR with refresh_error field"
```

## Common Integration Issues

### Tool Discovery Fails
- **Check**: Tool Manager API connectivity in Agent Orchestrator logs
- **Check**: Tool providers are enabled and status is "available"  
- **Check**: retry_with_backoff retry attempts in logs

### Tool Synchronization Issues
- **Check**: ToolWithParameters.enabled field matches expected values
- **Check**: ProviderFactory returns expected BaseTool objects with correct namespaced names
- **Check**: Tool name matching between ProviderFactory and Tool Manager using namespaced_name
- **Check**: Provider configuration is valid and providers are accessible

### Provider Lifecycle Issues
- **Check**: Disabled ERROR providers are being retried appropriately
- **Check**: Provider re-enablement logs show successful status updates
- **Check**: Missing tools are correctly identified and marked as MISSING status

### StateGraph Execution Problems
- **Check**: LangGraph receives non-empty filtered tools list from ToolSynchronizer
- **Check**: Tool parameter schemas from ProviderFactory match Tool Manager expectations
- **Check**: Tool execution permissions and connectivity through provider adapters

## Success Criteria

✅ Agent Orchestrator discovers enabled tools dynamically per invocation
✅ LangChain loads all tools from enabled providers  
✅ Tools filtered correctly by enabled status
✅ LangGraph StateGraph executes tools when appropriate
✅ Tool execution failures reported back to Tool Manager
✅ Invocation completes with or without tool execution
✅ System gracefully handles Tool Manager API unavailability

## JIRA Feature Coverage

### AAP-55696: Tool Manager HTTP Client
- ✅ Client library wraps Tool Manager REST API endpoints
- ✅ Standardized request/response handling using ToolProviderWithConfiguration and ToolWithParameters
- ✅ retry_with_backoff integration for timeout/retry logic
- ✅ Configuration for API endpoints and credentials

### AAP-60416: Agent Orchestrator Integration  
- ✅ Orchestrator uses client for tool discovery during invocations
- ✅ Runtime identification of enabled tools per request
- ✅ Error handling for missing providers/disabled tools
- ✅ API configuration support

### AAP-60417: Tool Calling Support
- ✅ LangGraph configured with filtered tools from LangChain
- ✅ End-to-end tool calling workflow within invocations
- ✅ Input arguments from prompt context
- ✅ Tool execution handled by LangGraph StateGraph
- ✅ Error handling and status reporting to Tool Manager
