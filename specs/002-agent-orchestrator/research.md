# Research: Agent Orchestrator Implementation

**Feature**: Agent Orchestrator
**Date**: 2025-10-08
**Phase**: 0 - Technical Research

## Research Areas

### 1. Async-Only REST API

**Decision**: Use FastAPI with a single POST /invoke endpoint that returns immediately with an invocation ID (async-only)

**Rationale**:

- Simpler API surface - single async endpoint serves all clients (UI, Workflow Engine, etc.)
- Non-blocking design - all operations return immediately and stream progress via SSE
- Consistent invocation IDs across all operations (pause, cancel, message, streaming)
- Better scalability - no long-running HTTP connections blocking server resources
- Cleaner architecture - separation of invocation (POST) from result retrieval (SSE stream)

**Implementation Approach**:

- FastAPI endpoint with Pydantic model validation
- `InvokeRequest` model without mode parameter (always async)
- Immediately return `{"invocation_id": "uuid", "stream_url": "/invoke/{id}/stream"}` and process in background
- Clients use SSE stream to monitor progress and receive results
- Background task queue handles agent processing

**Alternatives Considered**:

- Dual mode API (async and sync) - Rejected to simplify API and avoid blocking operations
- Separate endpoints for different clients - Rejected due to artificial separation
- Polling instead of SSE - Rejected due to inefficiency and added latency

---

### 2. Server-Sent Events (SSE) for Progress Streaming

**Decision**: Use FastAPI's StreamingResponse with SSE for async mode progress updates

**Rationale**:

- SSE provides unidirectional real-time updates from server to client
- Built-in browser support, no need for WebSocket complexity
- Automatic reconnection handling in browsers
- Simple implementation with FastAPI's async generators
- Efficient for progress updates, logs, and status changes

**Implementation Approach**:

- GET /invoke/:id/stream endpoint returns SSE stream
- Agents emit progress events to a pub/sub mechanism (Redis Streams or in-memory queue)
- FastAPI async generator reads from queue and yields SSE events
- Event types: progress, log, status_change, completion, error
- Client library handles reconnection and event parsing

**Alternatives Considered**:

- WebSockets - Rejected as bidirectional communication not needed for progress streaming
- Long polling - Rejected due to inefficiency and added server load
- HTTP/2 Server Push - Rejected due to limited browser support and complexity

---

### 3. Interactive Messaging Architecture

**Decision**: Implement message injection into running agent conversations based on LangGraph's interrupt/resume mechanism

**Rationale**:

- Enables multi-turn conversations within a single invocation
- Supports agent requests for clarification or additional context
- Provides human-in-the-loop capabilities during agent execution
- LangGraph checkpointing allows pausing and resuming with new messages

**Implementation Approach**:

- POST /invoke/:id/message accepts user message
- Message injected into agent's conversation history via LangGraph checkpoint
- Agent resumes from last checkpoint with new message in context
- Response delivered via SSE stream (async) or synchronous return
- Conversation history persisted in Context Manager

**Alternatives Considered**:

- Restart agent with full conversation history - Rejected due to performance and state loss
- Separate chat session - Rejected due to loss of invocation context
- Message queue with polling - Rejected in favor of direct injection

---

### 4. Pause/Cancel Control Signal Mechanism

**Decision**: Use LangGraph interrupt mechanism with agent checkpoints for pause/cancel

**Rationale**:

- LangGraph provides built-in interruption support via checkpoints
- Agents can check for control signals at defined checkpoint locations
- Graceful state preservation on pause allows resuming later
- Cancel signal terminates agent cleanly with proper cleanup

**Implementation Approach**:

- POST /invoke/:id/pause sets pause flag in invocation state
- POST /invoke/:id/cancel sets cancel flag in invocation state
- Agents check control flags at checkpoints (before external calls, between phases)
- Pause: Agent saves state to checkpoint and enters waiting state
- Cancel: Agent performs cleanup and transitions to cancelled state
- Control response: <500ms acknowledgment with current state

**Alternatives Considered**:

- Thread interruption - Rejected due to unsafe state and resource leaks
- Polling-based control - Rejected due to latency concerns
- External process management - Rejected as agents run within Python runtime

---

### 5. LangChain Agent Protocol (Internal Orchestration)

**Decision**: Use LangChain's Agent Protocol as internal orchestration layer (not exposed externally)

**Rationale**:

- Provides standardized interface for agent coordination
- Built-in support for structured inputs/outputs via Pydantic models
- Integrates naturally with LangGraph for routing logic
- Supports streaming and async execution patterns
- Well-maintained by LangChain community

**Implementation Approach**:

- REST API receives requests and creates AgentInvokeRequest (LangChain format)
- Internal orchestration agent processes via LangChain Agent Protocol
- Protocol handles message passing between orchestrator and specialized agents
- Results translated back to REST API response format

**Alternatives Considered**:

- Expose LangChain protocol directly - Rejected to maintain API stability and flexibility
- Custom agent protocol - Rejected due to reinventing well-tested patterns
- Direct function calls - Rejected due to lack of standardization and composability

---

### 6. A2A Protocol (Internal Inter-Agent Communication)

**Decision**: Implement Agent-to-Agent (A2A) Protocol for internal communication between orchestrator and specialized agents

**Rationale**:

- Decouples agent implementations from orchestration logic
- Enables independent scaling and deployment of specialized agents
- Supports both synchronous and asynchronous agent interactions
- Provides standard message envelope for requests, responses, and errors

**Implementation Approach**:

- A2A message structure: `{sender_id, receiver_id, message_type, payload, correlation_id}`
- Orchestrator creates A2ARequest for routing decisions
- Specialized agents (workflow_generator, generic_agent) respond with A2AResponse
- Message routing via internal bus (in-memory queue or Redis)
- Correlation IDs track request-response pairs

**Alternatives Considered**:

- Direct method calls - Rejected due to tight coupling
- HTTP between agents - Rejected as overkill for internal communication
- Shared state - Rejected due to concurrency and consistency issues

---

### 7. LangGraph for Routing with Control Signal Support

**Decision**: Use LangGraph for orchestration routing logic with interrupt/resume for control signals

**Rationale**:

- Graph-based routing models complex agent coordination patterns
- Built-in checkpointing enables pause/resume functionality
- Conditional edges support dynamic routing based on request analysis
- Interrupt mechanism allows clean signal handling
- State management handles message injection naturally

**Implementation Approach**:

- Define LangGraph with nodes: orchestrator, workflow_generator, generic_agent
- Conditional edges route based on request type and context
- Checkpoints after each node for pause/cancel detection
- Interrupts signal pause or cancel to currently executing node
- State includes conversation history for message injection

**Alternatives Considered**:

- Simple if/else routing - Rejected due to lack of visibility and complexity handling
- Workflow engine for routing - Rejected as too heavyweight for internal routing
- State machine library - Rejected in favor of LangGraph's agent-specific features

---

## Technology Stack Summary

### Core Technologies

- **FastAPI**: REST API framework with async support and automatic OpenAPI generation
- **Pydantic**: Data validation and serialization for all models
- **LangChain**: Agent Protocol implementation for internal orchestration
- **LangGraph**: Graph-based routing with checkpointing for control signals
- **Python 3.11+**: Modern Python with async/await and typing support

### Supporting Technologies

- **SSE-Starlette** or **FastAPI StreamingResponse**: Server-Sent Events for progress streaming
- **Redis**: Caching for sync mode results and pub/sub for SSE events
- **Uvicorn**: ASGI server for FastAPI
- **pytest**: Testing framework with async support
- **httpx**: Async HTTP client for external component integration

### External Dependencies

- **Guidance Component**: Policy recommendations (external service)
- **Context Manager**: Working/short-term/long-term memory (external service)
- **Tools Registry**: Tool information and discovery (external service)
- **Workflow System**: Workflow definition storage (external service)

---

## Performance Considerations

### API Response Times

- **Invocation acceptance**: <200ms p95 for POST /invoke (immediate return with ID)
- **Streaming**: <100ms p95 latency from agent event to client delivery via SSE
- **Control signals**: <500ms p95 for pause/cancel acknowledgment
- **Message injection**: <500ms p95 for message routing to agent
- **Agent processing**: Variable based on task complexity (reported via SSE progress events)

### Optimization Strategies

- Connection pooling for external component clients
- Redis caching for frequently accessed data
- Async I/O throughout the stack
- Background task queue for async mode processing
- Rate limiting and backpressure for external component calls

---

## Security & Compliance

### Read-Only Constraint

- Agent Orchestrator executes ONLY read operations (FR-016)
- All write operations handled by Workflow Engine (FR-017)
- Enforcement via code review and integration tests
- External components (Tools Registry, Workflow System) handle persistence

### External Component Authentication

- Service-to-service authentication for Guidance, Context Manager, Tools Registry, Workflow System
- API keys or mTLS for secure communication
- No credential storage in Agent Orchestrator
- All authentication delegated to external systems

### Audit Trail

- All agent decisions logged to Context Manager
- Invocation tracking with correlation IDs
- Control signal events (pause/cancel) recorded
- Integration with organizational compliance systems

---

## Best Practices

### API Design

- RESTful principles with resource-oriented URLs
- Consistent error responses with standard HTTP status codes
- API versioning in URL path (e.g., /v1/invoke)
- Comprehensive OpenAPI documentation auto-generated from Pydantic models

### Agent Development

- Checkpoint locations at all external service calls
- Graceful degradation when external components unavailable
- Retry logic with exponential backoff
- Structured logging with correlation IDs

### Testing Strategy

- Contract tests for REST API and external component interactions
- Unit tests for all Pydantic models and validation logic
- Integration tests for end-to-end flows (async/sync modes, control signals, messaging)
- Load testing for performance goal validation

---

## Open Questions Resolved

1. **How to provide a simple, scalable API for all clients?**

   - **Resolution**: Async-only POST /invoke endpoint that returns invocation ID immediately. All clients use SSE streaming for progress and results. This provides better scalability and simpler architecture.

2. **How to enable interactive chat with running agents?**

   - **Resolution**: POST /invoke/:id/message endpoint injects messages into agent conversation via LangGraph checkpoints. Agent resumes with new context.

3. **How to implement pause/resume and cancel?**

   - **Resolution**: LangGraph interrupt mechanism with checkpoints. Agents check control signals at defined points, save state on pause, cleanup on cancel.

4. **Should LangChain Agent Protocol be exposed externally?**

   - **Resolution**: No. LangChain and A2A are internal implementation details. REST API provides stable public interface that can evolve independently.

5. **Where should workflow definitions be stored?**

   - **Resolution**: External Workflow System handles storage. Agent Orchestrator generates definitions and sends via API, receives workflow ID in return.

6. **Where should tool metadata be stored?**
   - **Resolution**: Tools Registry is external source of truth. Agent Orchestrator queries for tool information, does not store tool metadata.

---

**Research Complete**: All technical decisions documented with rationale and implementation approach. Ready for Phase 1 (Design & Contracts).
