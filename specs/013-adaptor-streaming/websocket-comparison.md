# WebSocket API Comparison: Spec 002 vs Spec 013

**Date**: 2025-11-13
**Purpose**: Compare existing Agent Orchestrator WebSocket design (Spec 002) with proposed streaming implementation (Spec 013)

## Executive Summary

Spec 002 and Spec 013 serve different but complementary purposes:
- **Spec 002**: Agent progress tracking during workflow/tool execution
- **Spec 013**: Real-time delta streaming of LLM responses

The designs are incompatible and should coexist as separate WebSocket endpoints.

## Detailed Comparison

### Path & Purpose

| Aspect | Spec 002 (Progress Events) | Spec 013 (Streaming) |
|--------|---------------------------|---------------------|
| **Path** | `/ws/invocations/{invocationId}` | `/ws/agent_orchestrator/v1/invocations/{invocationId}` |
| **Purpose** | Progress updates during agent execution | Delta-by-delta LLM response streaming |
| **Trigger** | Agent processing workflow/tools | LLM generating response |
| **Frequency** | Low (state changes, major milestones) | High (every delta, ~50-100ms) |

### Event Types Comparison

| Spec 002 Event Types | Spec 013 Event Types | Key Differences |
|---------------------|---------------------|-----------------|
| `progress` - Agent making progress | `delta` - Individual LLM delta | 002: High-level progress, 013: Granular delta delivery |
| `log` - Agent log messages | ❌ (No equivalent) | 002: Debug logging, 013: Focused on content delivery |
| `status_change` - Invocation status | ❌ (No equivalent) | 002: State management, 013: Focus on streaming |
| `message` - Agent requesting clarification | ❌ (No equivalent) | 002: Interactive messaging, 013: One-way streaming |
| `completion` - Agent completed successfully | `completion` - LLM streaming finished | Different completion semantics |
| `error` - Agent encountered error | `error` - Streaming failures | 013: More specific error types |
| ❌ (No equivalent) | `cancelled` - Stream cancelled | 013: Explicit cancellation handling |

### Message Schema Differences

#### Spec 002 ProgressEvent Schema:
```yaml
ProgressEvent:
  required: [eventType, invocationId, timestamp, data]
  properties:
    eventType: enum[progress, log, status_change, message, completion, error]
    invocationId: string(uuid)  # camelCase
    timestamp: date-time
    data: object(additionalProperties: true)  # Flexible JSON
    sequenceNumber: integer   # Optional sequence
```

#### Spec 013 StreamingEvent Schema:
```yaml
StreamingEvent:
  required: [event_type, invocation_id, timestamp, event_id, data]
  properties:
    event_type: enum[delta, error, cancelled, completion]
    invocation_id: string(uuid)  # snake_case
    timestamp: date-time
    event_id: string            # Valkey event ID for resumption
    data:                       # Strictly typed
      oneOf: [DeltaEventData, ErrorEventData, CancelledEventData, CompletionEventData]
```

### Event Data Structures

#### Spec 002 Data Structures (Flexible):
- **progress**: `{phase, message, progress_percentage?}`
- **log**: `{level, message}`
- **status_change**: `{previous_status, new_status, reason?}`
- **message**: `{message, requires_response}`
- **completion**: `{result_type, workflow_id?, result}`
- **error**: `{error_message, error_code?, phase}`

#### Spec 013 Data Structures (Strict):
- **delta**: `{delta}` (minimal payload)
- **error**: `{error_type, message, code?, retryable?}` (structured error info)
- **cancelled**: `{reason}` (enum: user_cancelled, timeout, server_shutdown, llm_error)
- **completion**: `{}` (empty object - event_type indicates completion)

## Key Architectural Differences

### 1. Granularity
- **002**: High-level progress updates (workflow phases, tool execution)
- **013**: Real-time delta streaming (every LLM delta, ~50-100ms intervals)

### 2. Schema Typing
- **002**: Flexible `additionalProperties: true` (loose typing)
- **013**: Strict `oneOf` validation (strong typing)

### 3. Resumption Support
- **002**: No resumption mechanism mentioned
- **013**: Built-in `event_id` + `last_event_id` parameter for perfect resumption

### 4. Naming Convention
- **002**: camelCase (`eventType`, `invocationId`)
- **013**: snake_case (`event_type`, `invocation_id`)

### 5. Event Ordering
- **002**: Optional `sequenceNumber` field
- **013**: Required `event_id` (Valkey-generated) + application-level ordering

## Compatibility Assessment

### Coexistence Strategy
The two designs can coexist because they serve different purposes:

1. **Spec 002** (`/ws/invocations/{id}`): Agent progress during execution
   - Used by: Workflow Engine, UI for high-level status
   - Frequency: Low (seconds/minutes between events)
   - Purpose: Monitor agent workflow execution

2. **Spec 013** (`/ws/agent_orchestrator/v1/invocations/{id}`): LLM streaming
   - Used by: UI for real-time text streaming
   - Frequency: High (deltas every 50-100ms)
   - Purpose: Display LLM responses as they're generated

### Implementation Impact
- **No conflicts**: Different paths, different event types
- **Shared infrastructure**: Both use same WebSocket router and Valkey streams
- **Independent scaling**: Can deploy streaming endpoint separately

## Recommendations

1. **Maintain both endpoints** for different use cases
2. **Document clear usage guidelines**:
   - Use Spec 002 for agent progress monitoring
   - Use Spec 013 for LLM response streaming
3. **Consider migration path** if Spec 002 becomes obsolete
4. **Ensure component ownership** via `/ws/{component}/v1/{resource}` routing pattern

## Migration Considerations

If teams prefer unified approach:
- **Option A**: Extend Spec 002 to include streaming events
- **Option B**: Replace Spec 002 progress events with Spec 013 streaming
- **Option C**: Maintain separate endpoints (recommended for MVP)

## Conclusion

Spec 002 and Spec 013 are fundamentally different designs serving complementary needs. Both should coexist to support the full range of real-time communication requirements in the Nexus platform.
