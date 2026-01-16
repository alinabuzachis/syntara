# Quickstart: Tool Provider Integration and Tool Management

## Overview
This quickstart guide demonstrates the key workflows for Tool Provider Integration and Tool Management feature. Follow these steps to validate the implementation against the feature specification requirements.

## Prerequisites
- Admin access to the Nexus system
- At least one test Tool Provider available for registration (e.g., MCP server)
- Python environment with required dependencies installed
- PostgreSQL and Valkey services running

## Test Scenarios

### Scenario 1: Tool Provider Registration (SSE Protocol)
**Validates**: FR-001, FR-002, FR-003 (Provider registration and validation)

```bash
# Step 1: Register a new MCP Tool Provider with SSE protocol
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "name": "test-mcp-provider-sse",
    "description": "Test MCP Tool Provider with SSE protocol",
    "configuration": {
      "provider_type": "mcp",
      "base_url": "https://localhost:3000/mcp",
      "api_key": "test-api-key-123"
    }
  }'

# Expected: 201 Created with provider details
# Verify: Provider status should be "validating" initially

# Step 2: Validate provider connection
PROVIDER_ID=$(echo $RESPONSE | jq -r '.id')
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers/$PROVIDER_ID/validate \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with validation results
# Verify: Provider status should change to "active" if validation succeeds
```

### Scenario 2: MCP Streaming HTTP Protocol Support
**Validates**: MCP dual-protocol support with automatic negotiation and fallback

```bash
# Step 1: Register MCP Tool Provider with Streaming HTTP protocol
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "name": "test-mcp-provider-streaming",
    "description": "Test MCP Tool Provider with Streaming HTTP protocol",
    "configuration": {
      "provider_type": "mcp",
      "base_url": "https://localhost:3001/mcp",
      "api_key": "test-streaming-key-456"
    }
  }'

# Expected: 201 Created with provider details
# Verify: Provider uses Streaming HTTP transport

STREAMING_PROVIDER_ID=$(echo $RESPONSE | jq -r '.id')

# Step 2: Test protocol negotiation and fallback
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers/$STREAMING_PROVIDER_ID/validate \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with validation results showing negotiated protocol
# Verify: System successfully negotiates Streaming HTTP or falls back to SSE

# Step 3: Test tool refresh with Streaming HTTP
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers/$STREAMING_PROVIDER_ID/refresh_tools \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with refreshed tools using Streaming HTTP transport
# Verify: Tools discovered successfully via Streaming HTTP protocol

# Step 4: Test concurrent operations with mixed protocols
# Simultaneously refresh tools from both SSE and Streaming HTTP providers
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers/$PROVIDER_ID/refresh_tools \
  -H "Authorization: Bearer <admin-token>" &
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers/$STREAMING_PROVIDER_ID/refresh_tools \
  -H "Authorization: Bearer <admin-token>" &
wait

# Expected: Both requests complete successfully
# Verify: Mixed protocol operations work without conflicts
```

### Scenario 3: Tool Refresh and Management
**Validates**: FR-004, FR-005, FR-006 (Tool refresh and metadata caching)

```bash
# Step 1: Refresh tools from registered provider
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers/$PROVIDER_ID/refresh_tools \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with refresh counts
# Verify: refreshed_count > 0 for test provider with tools

# Step 2: List refreshed tools
curl -X GET "http://localhost:8000/api/v1/tool_manager/tools?provider_id[eq]=$PROVIDER_ID" \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with list of tools
# Verify: Each Tool has namespaced_name format "test-mcp-provider::tool_name"

# Step 3: Get Tool details with parameters
TOOL_ID=$(echo $TOOLS_RESPONSE | jq -r '.resources[0].id')
curl -X GET http://localhost:8000/api/v1/tool_manager/tools/$TOOL_ID \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with detailed Tool information including parameters
# Verify: Tool metadata includes name, description, parameters array
```

### Scenario 4: Tool Enablement Control
**Validates**: FR-021, FR-022, FR-023 (Tool enablement without removal)

```bash
# Step 1: Disable a Tool
curl -X PATCH http://localhost:8000/api/v1/tool_manager/tools/$TOOL_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"enabled": false}'

# Expected: 200 OK with updated Tool
# Verify: enabled field is false, but Tool still exists

# Step 2: List enabled Tools for selection
curl -X GET http://localhost:8000/api/v1/tool_manager/tools?enabled[eq]=true&status[eq]=available \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with list excluding disabled Tool
# Verify: Tool must be both enabled=true AND status=available to be usable

# Step 3: Re-enable the Tool
curl -X PATCH http://localhost:8000/api/v1/tool_manager/tools/$TOOL_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"enabled": true}'

# Expected: 200 OK with updated Tool
# Verify: Tool appears in enabled Tools list again
```

### Scenario 5: Rate Limiting Configuration
**Validates**: FR-018, FR-020 (Rate limiting and alert generation)

```bash
# Step 1: Create rate limit for Tool
curl -X POST http://localhost:8000/api/v1/rate-limits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "target_type": "tool",
    "target_id": "'$TOOL_ID'",
    "requests_per_window": 10,
    "window_duration_seconds": 60,
    "burst_allowance": 2
  }'

# Expected: 201 Created with rate limit configuration
# Verify: Rate limit is active and properly configured

# Step 2: Test rate limit enforcement (simulate multiple requests)
for i in {1..12}; do
  curl -X POST http://localhost:8000/api/v1/tool_manager/tools/$TOOL_ID/execute \
    -H "Authorization: Bearer <user-token>" \
    -d '{"parameters": {}}' &
done
wait

# Expected: First 12 requests succeed (10 + 2 burst), subsequent requests fail
# Verify: Rate limit exceeded error after limit reached
```

### Scenario 6: Usage Metrics Collection
**Validates**: FR-016, FR-017, FR-019 (Metrics tracking and querying)

```bash
# Step 1: Execute Tool to generate metrics
curl -X POST http://localhost:8000/api/v1/tool_manager/tools/$TOOL_ID/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <user-token>" \
  -d '{"parameters": {"input": "test"}}'

# Expected: 200 OK with Tool execution results
# Verify: Execution completes successfully

# Step 2: Query Tool metrics
curl -X GET "http://localhost:8000/api/v1/metrics/tools?tool_id[eq]=$TOOL_ID&time_window[eq]=day" \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with metrics data
# Verify: Metrics show execution count, success rate, duration statistics

# Step 3: Query detailed execution logs
curl -X GET "http://localhost:8000/api/v1/metrics/executions?tool_id[eq]=$TOOL_ID&limit=10" \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with execution logs
# Verify: Logs include timestamp, duration, status, user_id
```

### Scenario 7: Provider Configuration Updates
**Validates**: Configuration management with PUT and PATCH operations

```bash
# Step 1: Update provider configuration using PUT (complete replacement)
curl -X PUT http://localhost:8000/api/v1/tool_manager/tool_providers/$PROVIDER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "name": "updated-mcp-provider",
    "description": "Updated MCP Tool Provider",
    "configuration": {
      "provider_type": "mcp",
      "base_url": "https://localhost:3001/mcp",
      "api_key": "updated-api-key-789"
    },
    "enabled": true
  }'

# Expected: 200 OK with completely updated provider
# Verify: All configuration fields are replaced

# Step 2: Partially update provider using PATCH
curl -X PATCH http://localhost:8000/api/v1/tool_manager/tool_providers/$PROVIDER_ID \
  -H "Content-Type: application/merge-patch+json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "description": "Partially updated MCP provider",
    "configuration": {
      "provider_type": "mcp",
      "api_key": "partially-updated-key"
    }
  }'

# Expected: 200 OK with merged configuration
# Verify: Only specified fields updated, others preserved

# Step 3: Disable provider with minimal PATCH
curl -X PATCH http://localhost:8000/api/v1/tool_manager/tool_providers/$PROVIDER_ID \
  -H "Content-Type: application/merge-patch+json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{"enabled": false}'

# Expected: 200 OK with provider disabled
# Verify: Only enabled field changed, configuration preserved
```

### Scenario 8: Provider Management and Tool Lifecycle
**Validates**: FR-008, FR-026 (Provider removal and missing Tool handling)

```bash
# Step 1: List all providers
curl -X GET http://localhost:8000/api/v1/tool_manager/tool_providers \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with provider list including test provider
# Verify: Provider appears with correct status and Tool count

# Step 2: Simulate Tool removal from Tool Provider (stop Tool service)
# Then refresh Tool metadata
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers/$PROVIDER_ID/refresh_tools \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with disabled_count > 0 if tools were removed
# Verify: Missing tools are automatically disabled and marked as "missing"

# Step 3: Remove provider completely
curl -X DELETE http://localhost:8000/api/v1/tool_manager/tool_providers/$PROVIDER_ID \
  -H "Authorization: Bearer <admin-token>"

# Expected: 204 No Content
# Verify: Provider and all associated tools are removed from system
```

### Scenario 9: Error Handling and Validation
**Validates**: FR-003, FR-009 (Error handling and graceful failures)

```bash
# Step 1: Test invalid provider registration
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "name": "invalid-provider",
    "configuration": {
      "provider_type": "mcp",
      "base_url": "https://nonexistent.example.com:9999/mcp",
      "api_key": "invalid-key"
    }
  }'

# Expected: 201 Created (provider registered but validation will fail)
# Verify: Provider status becomes "error" with clear validation_error message

# Step 2: Test duplicate provider name
curl -X POST http://localhost:8000/api/v1/tool_manager/tool_providers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "name": "invalid-provider",
    "configuration": {
      "provider_type": "mcp",
      "base_url": "https://localhost:3001/mcp",
      "api_key": "duplicate-test-key"
    }
  }'

# Expected: 409 Conflict with clear error message
# Verify: Duplicate names are rejected with appropriate error
```

### Scenario 10: Advanced Filtering with Bracket Notation
**Validates**: Advanced query filtering and search capabilities

```bash
# Step 1: Filter providers by status and created date range
curl -X GET "http://localhost:8000/api/v1/tool_manager/tool_providers?status[eq]=available&created_at[gte]=2025-01-01" \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with providers matching status and date criteria

# Step 2: Search tools by name pattern and filter by status and enabled state
curl -X GET "http://localhost:8000/api/v1/tool_manager/tools?name[contains]=search&status[eq]=available&enabled[eq]=true" \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with tools containing "search" in name that are available

# Step 3: Filter metrics by multiple criteria
curl -X GET "http://localhost:8000/api/v1/metrics/executions?status[eq]=success&duration_ms[between]=100,5000&execution_start[gte]=2025-10-01T00:00:00Z" \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with successful executions within duration and time range

# Step 4: Filter rate limits by multiple targets
curl -X GET "http://localhost:8000/api/v1/rate-limits?target_type[eq]=tool&enabled[eq]=true" \
  -H "Authorization: Bearer <admin-token>"

# Expected: 200 OK with enabled rate limits for tools
```

## Success Criteria

### Functional Validation
- [x] Provider registration with validation
- [x] Tool refresh and metadata caching
- [x] Tool enablement control separate from registration
- [x] Rate limiting enforcement with configurable limits
- [x] Metrics collection and querying
- [x] Graceful error handling for unreachable providers
- [x] Admin-only access control throughout

### Performance Validation
- [x] Fast rate limit responses
- [x] Tool metadata caching reduces Tool Provider load
- [x] Concurrent Tool operations don't block system
- [x] Database queries perform well with hundreds of tools

### Data Integrity Validation
- [x] Tool namespacing prevents naming conflicts
- [x] Provider removal cascades to associated tools
- [x] Missing tools are automatically disabled
- [x] Metrics data is consistent and accurate

## Cleanup

```bash
# Remove test data after validation
curl -X DELETE http://localhost:8000/api/v1/tool_manager/tool_providers/$PROVIDER_ID \
  -H "Authorization: Bearer <admin-token>"

# Verify: Clean removal without data corruption
```

## Troubleshooting

### Common Issues
1. **Provider validation fails**: Check Tool Provider is running and accessible
2. **Tool refresh returns 0 tools**: Verify Tool Provider exposes tools correctly
3. **Rate limit not enforced**: Check Valkey connection and configuration
4. **Metrics not collecting**: Verify PostgreSQL connection and table creation
5. **Bracket notation not working**: Ensure proper URL encoding for complex queries

### Debug Commands
```bash
# Check MCP provider connectivity
curl -v http://localhost:3000/mcp/tools

# Verify database tables
psql -d nexus -c "\dt tool_*"

# Check Valkey rate limit keys
valkey-cli KEYS "rate_limit:*"
```

This quickstart validates all major user scenarios from the feature specification and ensures the implementation meets constitutional requirements for observability, error handling, and data integrity.
