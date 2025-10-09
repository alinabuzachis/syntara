# Agent Orchestrator API - Quick Start Guide

**Feature**: Agent Orchestrator
**Version**: 1.0.0
**Last Updated**: 2025-10-08

## Overview

This guide demonstrates practical usage of the Agent Orchestrator REST API. The API provides an async-only endpoint for invoking agentic intelligence with support for:

- **Async invocation**: Submit request, receive invocation ID immediately, stream progress via SSE
- **Interactive messaging**: Multi-turn conversations with running agents
- **Process control**: Pause and cancel running agents

## Prerequisites

- API endpoint: `http://localhost:8000/api/v1` (development) or production URL
- Authentication: Bearer token or API key
- HTTP client with SSE support for streaming progress events

## Base URL

```
http://localhost:8000/api/v1
```

All examples use this development URL. Replace with your environment's URL.

---

## Example 1: Async Workflow Generation with SSE Streaming

**Use Case**: UI submits workflow creation request and displays real-time progress

### Step 1: Submit Request

```bash
curl -X POST http://localhost:8000/api/v1/invoke \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "prompt": "Deploy customer service app to production with health checks and rollback on failure",
    "user_id": "user-123",
    "context": {
      "environment": "production",
      "app_id": "customer-svc",
      "deployment_strategy": "blue-green"
    }
  }'
```

**Response (202 ACCEPTED)**:

```json
{
  "invocation_id": "inv-550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "created_at": "2025-10-08T10:30:00Z",
  "stream_url": "/invoke/inv-550e8400-e29b-41d4-a716-446655440000/stream"
}
```

### Step 2: Stream Progress Events (SSE)

```bash
curl -N http://localhost:8000/api/v1/invoke/inv-550e8400-e29b-41d4-a716-446655440000/stream \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**SSE Stream Output**:

```
event: progress
data: {"event_type":"progress","invocation_id":"inv-550e8400","timestamp":"2025-10-08T10:30:01Z","data":{"message":"Analyzing deployment request","progress_percentage":10}}

event: progress
data: {"event_type":"progress","invocation_id":"inv-550e8400","timestamp":"2025-10-08T10:30:03Z","data":{"message":"Evaluating deployment tools and strategies","progress_percentage":35}}

event: log
data: {"event_type":"log","invocation_id":"inv-550e8400","timestamp":"2025-10-08T10:30:05Z","data":{"level":"info","message":"Selected blue-green deployment strategy based on context"}}

event: progress
data: {"event_type":"progress","invocation_id":"inv-550e8400","timestamp":"2025-10-08T10:30:08Z","data":{"message":"Generating deployment workflow","progress_percentage":70}}

event: completion
data: {"event_type":"completion","invocation_id":"inv-550e8400","timestamp":"2025-10-08T10:30:15Z","data":{"result_type":"workflow","workflow_id":"wf-abc123","workflow_url":"/workflows/wf-abc123"}}
```

**Client Implementation (JavaScript)**:

```javascript
const eventSource = new EventSource(
  "http://localhost:8000/api/v1/invoke/inv-550e8400-e29b-41d4-a716-446655440000/stream",
  { headers: { Authorization: "Bearer YOUR_TOKEN" } }
);

eventSource.addEventListener("progress", (event) => {
  const data = JSON.parse(event.data);
  console.log(
    `[${data.data.phase}] ${data.data.message} - ${data.data.progress_percentage}%`
  );
});

eventSource.addEventListener("completion", (event) => {
  const data = JSON.parse(event.data);
  console.log(`Workflow created: ${data.data.workflow_id}`);
  eventSource.close();
});

eventSource.addEventListener("error", (event) => {
  const data = JSON.parse(event.data);
  console.error(`Error: ${data.data.error_message}`);
  eventSource.close();
});
```

---

## Example 2: Interactive Messaging with Running Agent

**Use Case**: Agent requests clarification, user provides additional context

### Step 1: Agent Requests Clarification (via SSE)

```
event: message
data: {"event_type":"message","invocation_id":"inv-770e8400","timestamp":"2025-10-08T10:40:05Z","data":{"message":"Should I use canary deployment or blue-green deployment for this service?","requires_response":true,"context":{"available_strategies":["canary","blue-green","rolling"]}}}
```

### Step 2: User Responds with Message

```bash
curl -X POST http://localhost:8000/api/v1/invoke/inv-770e8400-e29b-41d4-a716-446655440002/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Use canary deployment with 10% initial traffic and gradual rollout over 30 minutes",
    "context": {
      "deployment_strategy": "canary",
      "initial_traffic_percentage": 10,
      "rollout_duration_minutes": 30
    }
  }'
```

**Response (202 ACCEPTED)**:

```json
{
  "invocation_id": "inv-770e8400-e29b-41d4-a716-446655440002",
  "message_id": "msg-880e8400-e29b-41d4-a716-446655440003",
  "status": "accepted",
  "acknowledged_at": "2025-10-08T10:40:30Z"
}
```

### Step 3: Agent Resumes with New Context (via SSE)

```
event: log
data: {"event_type":"log","invocation_id":"inv-770e8400","timestamp":"2025-10-08T10:40:31Z","data":{"level":"info","message":"User selected canary deployment strategy, resuming workflow generation"}}

event: progress
data: {"event_type":"progress","invocation_id":"inv-770e8400","timestamp":"2025-10-08T10:40:32Z","data":{"message":"Generating canary deployment workflow","progress_percentage":75}}
```

---

## Example 3: Pause and Resume Agent

**Use Case**: User wants to pause agent to review progress before continuing

### Step 1: Pause Running Agent

```bash
curl -X POST http://localhost:8000/api/v1/invoke/inv-550e8400-e29b-41d4-a716-446655440000/pause \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK)**:

```json
{
  "invocation_id": "inv-550e8400-e29b-41d4-a716-446655440000",
  "action": "pause",
  "status": "acknowledged",
  "current_state": "paused",
  "acknowledged_at": "2025-10-08T10:45:00Z"
}
```

**SSE Event**:

```
event: status_change
data: {"event_type":"status_change","invocation_id":"inv-550e8400","timestamp":"2025-10-08T10:45:00Z","data":{"previous_status":"running","new_status":"paused","checkpoint_phase":"tool_assessment"}}
```

### Step 2: Resume Agent (via Message)

User reviews progress and decides to continue. Resume by sending a message:

```bash
curl -X POST http://localhost:8000/api/v1/invoke/inv-550e8400-e29b-41d4-a716-446655440000/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "message": "Continue with workflow generation",
    "context": {
      "action": "resume"
    }
  }'
```

**Agent Resumes** (SSE):

```
event: status_change
data: {"event_type":"status_change","invocation_id":"inv-550e8400","timestamp":"2025-10-08T10:46:00Z","data":{"previous_status":"paused","new_status":"running","resumed_from_phase":"tool_assessment"}}
```

---

## Example 4: Cancel Running Agent

**Use Case**: User decides to cancel workflow generation

### Cancel Request

```bash
curl -X POST http://localhost:8000/api/v1/invoke/inv-550e8400-e29b-41d4-a716-446655440000/cancel \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK)**:

```json
{
  "invocation_id": "inv-550e8400-e29b-41d4-a716-446655440000",
  "action": "cancel",
  "status": "completed",
  "current_state": "cancelled",
  "acknowledged_at": "2025-10-08T10:50:00Z",
  "message": "Agent cancelled successfully, cleanup completed"
}
```

**SSE Event**:

```
event: status_change
data: {"event_type":"status_change","invocation_id":"inv-550e8400","timestamp":"2025-10-08T10:50:00Z","data":{"previous_status":"running","new_status":"cancelled","phase_at_cancellation":"workflow_generation"}}
```

---

## Example 5: Error Handling

### Invalid Request (400 Bad Request)

```bash
curl -X POST http://localhost:8000/api/v1/invoke \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "prompt": ""
  }'
```

**Response (400 Bad Request)**:

```json
{
  "error": "validation_error",
  "message": "Invalid request parameters",
  "details": {
    "prompt": ["Content required"]
  }
}
```

### Invocation Not Found (404 Not Found)

```bash
curl -X POST http://localhost:8000/api/v1/invoke/inv-nonexistent/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"message": "Update"}'
```

**Response (404 Not Found)**:

```json
{
  "error": "not_found",
  "message": "Invocation not found",
  "details": {
    "invocation_id": "inv-nonexistent"
  }
}
```

### Agent Error (via SSE)

```
event: error
data: {"event_type":"error","invocation_id":"inv-550e8400","timestamp":"2025-10-08T10:55:00Z","data":{"error_message":"Failed to connect to Tools Registry","error_code":"external_service_unavailable","phase":"tool_assessment","retryable":true}}
```

---

## Common Patterns

### Pattern 1: UI Workflow Creation Flow

1. User enters prompt in UI
2. UI sends POST /invoke
3. UI receives invocation_id (202 Accepted)
4. UI opens SSE stream to /invoke/{id}/stream
5. UI displays progress updates in real-time
6. On completion event, UI navigates to workflow detail page
7. On message event (clarification needed), UI shows dialog for user input
8. User provides input via POST /invoke/{id}/message
9. Agent resumes, UI continues streaming progress

### Pattern 2: Workflow Engine Agent Node Execution

1. Workflow Engine executes agent node
2. Engine sends POST /invoke
3. Engine receives invocation_id (202 Accepted)
4. Engine opens SSE stream to monitor progress
5. On completion event, extract result and use in workflow
6. On error event, retry or fail workflow based on configuration

### Pattern 3: Long-Running Agent with User Monitoring

1. User submits workflow generation request
2. User receives invocation_id and opens SSE stream
3. User monitors progress via SSE events
4. User pauses agent to review tool selection (POST /invoke/{id}/pause)
5. User reviews agent's planned tools in UI
6. User decides to modify: sends message with updated tool selection
7. Agent resumes with new context, continues generation
8. User cancels if unhappy with direction (POST /invoke/{id}/cancel)

---

## Performance Guidelines

### Response Time Expectations

- **Invocation acceptance**: <200ms p95 (POST /invoke returns immediately)
- **SSE event delivery**: <100ms p95 from agent event to client
- **Control signal acknowledgment**: <500ms p95 (pause/cancel)
- **Message injection**: <500ms p95
- **Agent processing**: Variable based on task complexity (reported via SSE)

### Best Practices

1. **Always use SSE streaming**: All clients should open SSE streams to receive progress and results
2. **Handle SSE reconnection**: Implement exponential backoff for SSE reconnection on connection loss
3. **Correlation IDs**: Include metadata.correlation_id for request tracking across systems
4. **Graceful error handling**: Monitor error events in SSE stream and handle appropriately
5. **Connection management**: Close SSE connections when invocation completes or is cancelled

---

## Authentication Examples

### Bearer Token Authentication

```bash
curl -X POST http://localhost:8000/api/v1/invoke \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Deploy app","user_id":"user-123"}'
```

### API Key Authentication

```bash
curl -X POST http://localhost:8000/api/v1/invoke \
  -H "X-API-Key: sk_live_abc123xyz789" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Deploy app","user_id":"user-123"}'
```

---

## Next Steps

- Review the [API Reference](contracts/agent-orchestrator-api.yaml) for complete endpoint documentation
- Explore the [Data Model](data-model.md) to understand invocation state and relationships
- Read the [Implementation Plan](plan.md) for architecture and technical context
- Check [Research Documentation](research.md) for technical decisions and alternatives considered

---

**Support**: For API issues or questions, contact support@syntara-orchestration.example.com
