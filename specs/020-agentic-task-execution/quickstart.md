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
INFO: Tool Manager Client discovering tools for invocation {invocation_id}
INFO: Discovered 3 enabled tool providers from Tool Manager
INFO: Loading tools from provider 'dev_tools' using LangChain
INFO: Loaded 8 tools from LangChain for provider dev_tools
INFO: Discovered 5 enabled tools from Tool Manager
INFO: Filtering LangChain tools by enabled status
INFO: Filtered to 5 enabled tools for StateGraph
INFO: Initializing StateGraph with 5 tools for invocation {invocation_id}
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

### 1. Tool Manager Client Integration

**Verify**: Agent Orchestrator can discover tools
```python
# In Agent Orchestrator service logs, look for:
# "Tool Manager Client initialized for invocation {id}"
# "Discovered X enabled tools from Y providers"
# "retry_with_backoff used for Tool Manager API calls"
```

### 2. LangChain Tool Loading

**Verify**: Tools loaded successfully from providers
```python
# In Agent Orchestrator logs:
# "Loading tools from provider '{provider_name}' using LangChain"
# "Loaded X tools from LangChain for provider {provider_name}"
# "Tool loading completed for all enabled providers"
```

### 3. Tool Filtering by Enabled Status

**Verify**: Tools filtered correctly before StateGraph registration
```python
# In Agent Orchestrator logs:
# "Retrieved X tools from Tool Manager API"
# "Filtering LangChain tools by enabled status"
# "Filtered to Y enabled tools for StateGraph"
# "Tool filtering completed: Y/X tools enabled"
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

### Tool Filtering Issues
- **Check**: ToolWithParameters.enabled field matches expected values
- **Check**: LangChain tool loading returns expected BaseTool objects
- **Check**: Tool name matching between LangChain and Tool Manager

### StateGraph Execution Problems
- **Check**: LangGraph receives non-empty filtered tools list
- **Check**: Tool parameter schemas are valid
- **Check**: Tool execution permissions and connectivity

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
