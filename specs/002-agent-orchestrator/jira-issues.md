# JIRA Issues: Agent Orchestrator Implementation

**Feature**: Agent Orchestrator
**Epic**: NEXUS-002
**Created**: 2025-10-08

## Overview

This document breaks down the Agent Orchestrator implementation into small, independent, testable units of work. Each ticket delivers a complete, mergeable feature with both data models and API endpoints working together.

**Implementation Strategy**: Each ticket includes both data models and API endpoints for a cohesive feature delivery. This approach ensures each PR delivers working, end-to-end functionality that can be tested and demonstrated independently.

---

## Phase 1: Basic Async Invocation

### NEXUS-002-1: Accept Async Invocation Requests

**Title**: Accept and Track Async Workflow Generation Requests
**Type**: Story
**Priority**: Highest
**Estimated Effort**: 5 story points

#### Description
Implement the ability to accept async workflow generation requests and return an invocation ID immediately. No actual workflow generation yet - just request acceptance and invocation tracking.

#### User Story
As a user, I want to submit a workflow generation request in async mode and receive an invocation ID immediately, so I know my request has been accepted.

#### Acceptance Criteria
- [ ] POST /v1/invoke endpoint accepts async workflow generation requests
- [ ] Request validation (required fields: prompt, user_id)
- [ ] Returns invocation_id immediately (<200ms p95)
- [ ] Response includes: invocation_id, status="running", created_at
- [ ] Invocation persisted to database with status tracking
- [ ] GET /v1/invocations endpoint to list invocations (with optional status filter)
- [ ] OpenAPI schema generated and matches contract

#### Technical Implementation
**Models**:
- `InvokeRequest` (prompt, user_id, context, metadata)
- `InvokeResponse` (invocation_id, status, created_at)
- `Invocation` (internal state model with database persistence)

**API Endpoints**:
- `POST /v1/invoke` - Accept request, generate ID, return immediately
- `GET /v1/invocations?status={status}` - List invocations with optional status filter

**Services**:
- `InvocationService` - Create invocation, assign ID, persist to database
- `InvocationRepository` - Database abstraction layer (prepares for future Context Manager migration)

#### Definition of Done
- User can POST to /invoke
- Receives invocation_id in <200ms
- Request validation works (400 errors for invalid requests)
- Invocations persisted to database
- Can list running invocations via GET /v1/invocations?status=running
- All tests pass
- Can be deployed and tested via curl

#### Notes
- Database persistence used initially; will migrate to Context Manager in future iteration
- Repository pattern abstracts persistence to facilitate future migration

#### Dependencies
- None

---

### NEXUS-002-2: WebSocket Progress Streaming

**Title**: Stream Progress Events via WebSocket
**Type**: Story
**Priority**: Highest
**Estimated Effort**: 5 story points

#### Description
Implement WebSocket endpoint to stream progress events for running invocations. Emit basic events (started, completed) without actual workflow generation logic. WebSocket provides bidirectional communication channel for real-time updates.

#### User Story
As a user, I want to stream real-time progress updates for my async invocation via WebSocket, so I can monitor what the agent is doing with low latency and reliable delivery.

#### Acceptance Criteria
- [ ] WS /v1/ws/invoke/{id} endpoint accepts WebSocket connections
- [ ] WebSocket connection established successfully for valid invocation ID
- [ ] 404 error for non-existent invocation ID
- [ ] Emits "started" event when invocation created
- [ ] Emits "completed" event when invocation finishes (mocked for now)
- [ ] Event delivery latency <100ms p95
- [ ] Multiple clients can connect to same invocation concurrently
- [ ] Connection closes gracefully on completion
- [ ] WebSocket ping/pong for connection health monitoring
- [ ] Reconnection handling with exponential backoff
- [ ] JSON message format for all events

#### Technical Implementation
**Models**:
- `ProgressEvent` (event_type, invocation_id, timestamp, data, sequence_number)
- `WebSocketMessage` (type, payload, timestamp)

**API Endpoints**:
- `WS /v1/ws/invoke/{id}` - WebSocket connection for streaming events

**Services**:
- `ProgressTracker` - Emit events to in-memory queue
- `WebSocketManager` - Manage WebSocket connections and broadcasting

**Dependencies**:
- FastAPI WebSocket support (built-in)

#### Definition of Done
- User can connect via WebSocket client
- Receives started and completed events in JSON format
- Multiple clients can connect simultaneously
- Connection closes properly on completion
- Ping/pong keeps connections alive
- All tests pass

#### Notes
**Event Architecture (MVP approach):**
- Agents emit progress events directly to ProgressTracker (in-memory event queue)
- LLM streaming responses are converted to WebSocket progress events
- Events stored in-memory per invocation for concurrent client streaming
- WebSocket used for server→client streaming only (Phase 1)
- Control operations (pause, cancel, message) remain as HTTP POST endpoints for simplicity
- Future iterations will integrate with Context Manager for event persistence and replay (NEXUS-002-13)
- Context Manager integration will enable event history retrieval and cross-service event coordination

**WebSocket Message Format:**
```json
{
  "event_type": "progress",
  "invocation_id": "inv_123",
  "timestamp": "2025-10-10T12:00:00Z",
  "data": {...},
  "sequence_number": 42
}
```

#### Dependencies
- NEXUS-002-1 (invocation creation)

---

### NEXUS-002-3: Simple Workflow Generation

**Title**: Generate Basic Workflow from User Prompt
**Type**: Story
**Priority**: Highest
**Estimated Effort**: 8 story points

#### Description
Implement LLM-based workflow generation that analyzes user prompts and generates workflow definitions. Uses an LLM to understand user intent, query available tools, and generate structured workflow files. Emit progress events during generation.

#### User Story
As a user, I want the agent to generate a workflow definition from my natural language request, so I can review and use the workflow.

#### Acceptance Criteria
- [ ] Background task processes invocation after acceptance
- [ ] LLM-based workflow generation agent with 3 phases:
  - Phase 1: Request analysis (LLM analyzes user intent and requirements from prompt)
  - Phase 2: Tool assessment (LLM queries mocked Tools Registry to identify required tools)
  - Phase 3: Workflow creation (LLM generates structured workflow file and definition)
- [ ] Progress events emitted for each phase (progress, log events)
- [ ] Workflow file generated and persisted
- [ ] Workflow definition includes: phases, tools, approval_gates
- [ ] Workflow stored via mocked Workflow System client
- [ ] Completion event includes workflow_id and workflow file reference
- [ ] Invocation status transitions: running → completed
- [ ] Error handling: failures transition to failed status

#### Technical Implementation
**Models**:
- `WorkflowDefinition` (phases, tools, approval_gates, visualization)
- `WorkflowPhase` (phase_id, name, type, activities)
- `ToolReference` (tool_id, parameters, dependencies)
- `ApprovalGate` (gate_id, type, description)
- `WorkflowFile` (file_path, content, format)

**Services**:
- `AsyncExecutor` - Run background tasks
- `WorkflowGeneratorAgent` - LLM-based workflow generation
- `LLMService` - Interface to LLM for prompt analysis and workflow generation
- Mocked external clients (Tools Registry, Workflow System)

#### Definition of Done
- User submits async workflow request
- Streams progress events showing 3 phases
- Receives workflow_id in completion event
- Workflow definition is generated and stored
- Quickstart Scenario 1 works end-to-end
- All tests pass

#### Notes
**Runtime Architecture (MVP approach):**
- Agent Orchestrator runs as a single FastAPI service
- Each invocation spawns an asyncio background task within the same process (simple spawn-per-request)
- No separate queue/worker mechanism or pod-per-invocation for Phase 1
- Background tasks use Python's `asyncio.create_task()` for concurrent execution
- Future iterations can add queue-based processing (e.g., Celery, RabbitMQ) or pod-per-invocation if scalability requires it

#### Dependencies
- NEXUS-002-2 (WebSocket streaming)

---

## Phase 2: Agent Routing

### NEXUS-002-4: Generic Agent for Information Queries

**Title**: Answer Information Queries Without Workflow Generation
**Type**: Story
**Priority**: High
**Estimated Effort**: 5 story points

#### Description
Implement basic routing logic and generic agent to answer information queries directly without generating workflows.

#### User Story
As a user, I want to ask information queries like "What tools are available?" and get direct answers, so I don't have to wait for unnecessary workflow generation.

#### Acceptance Criteria
- [ ] Routing logic analyzes request type:
  - Workflow generation keywords → WorkflowGeneratorAgent
  - Information/question keywords → GenericAgent
- [ ] GenericAgent queries mocked Tools Registry
- [ ] Generates natural language response (simple template-based)
- [ ] Returns result type "answer" instead of "workflow"
- [ ] Routing decision persisted in invocation state

#### Technical Implementation
**Models**:
- `RoutingDecision` (decision_type: workflow_generation | generic, rationale)
- `GenericResponse` (type: "answer", content: string)

**Services**:
- `RoutingService` - Analyze request and route to agent
- `GenericAgent` - Handle information queries

#### Definition of Done
- User asks "What tools are available?"
- Receives direct answer without workflow
- Routing correctly directs workflow vs query requests
- Quickstart Scenario 2 works end-to-end
- All tests pass

#### Dependencies
- NEXUS-002-3 (workflow generation working)

---

## Phase 3: Interactive Messaging

### NEXUS-002-5: Conversation History Management

**Title**: Track Conversation Messages for Invocations
**Type**: Story
**Priority**: High
**Estimated Effort**: 3 story points

#### Description
Implement conversation history storage and retrieval for invocations. Foundation for interactive messaging.

#### User Story
As a developer, I want conversation messages tracked with proper sequencing, so we can support multi-turn conversations.

#### Acceptance Criteria
- [ ] Conversation messages stored with role (user/agent/system)
- [ ] Messages have sequence numbers for ordering
- [ ] Initial user prompt stored as first message
- [ ] Agent responses stored as messages
- [ ] Conversation retrievable by invocation_id
- [ ] Messages persisted to database (consistent with invocation persistence)

#### Technical Implementation
**Models**:
- `ConversationMessage` (message_id, invocation_id, role, content, timestamp, sequence_number)

**Services**:
- `ConversationService` - Add/retrieve messages

#### Definition of Done
- Conversation messages stored correctly
- Sequence numbering works
- Messages retrievable by invocation_id
- All tests pass

#### Dependencies
- NEXUS-002-1 (invocation tracking)

---

### NEXUS-002-6: Send Messages to Running Agents

**Title**: Inject User Messages into Running Invocations
**Type**: Story
**Priority**: High
**Estimated Effort**: 5 story points

#### Description
Implement POST /invoke/{id}/message endpoint to send messages to running agents. Messages are added to conversation history.

#### User Story
As a user, I want to send additional context to a running agent, so I can guide the workflow generation with more information.

#### Acceptance Criteria
- [ ] POST /v1/invoke/{id}/message endpoint implemented
- [ ] Request body: `{message: string, context: object}`
- [ ] Response: `{invocation_id, message_id, status: "accepted"}`
- [ ] Message acknowledgment <500ms p95
- [ ] Message added to conversation history
- [ ] Works only for running/paused invocations (400 for completed/cancelled)
- [ ] Message triggers agent to incorporate new context

#### Technical Implementation
**Models**:
- `MessageRequest` (message, context, metadata)
- `MessageResponse` (invocation_id, message_id, status, acknowledged_at)

**API Endpoints**:
- `POST /v1/invoke/{id}/message`

**Services**:
- `MessageHandler` - Validate and store messages

#### Definition of Done
- User can POST message to running invocation
- Receives acknowledgment quickly
- Message stored in conversation history
- Invalid state transitions rejected
- All tests pass

#### Dependencies
- NEXUS-002-5 (conversation history)

---

## Phase 4: External Integration

### NEXUS-002-7: External Component HTTP Clients

**Title**: Implement HTTP Clients for External Components
**Type**: Story
**Priority**: High
**Estimated Effort**: 8 story points

#### Description
Replace mocked external components with real HTTP clients for Guidance, Context Manager, Tools Registry, and Workflow System. This integration is needed early to enable real-world testing and development.

#### User Story
As an operator, I want the Agent Orchestrator to communicate with real external components, so the system works in production environments.

#### Acceptance Criteria
- [ ] Guidance component client: fetch policy recommendations
- [ ] Context Manager client: store/retrieve state, query memory, create audit records
- [ ] Tools Registry client: query tools by capability, validate availability
- [ ] Workflow System client: store workflow definitions, receive workflow ID
- [ ] All clients use `httpx.AsyncClient` with connection pooling
- [ ] Configuration via environment variables
- [ ] All existing scenarios work with real components (integration tests)

#### Technical Implementation
**Dependencies**:
- `httpx` for async HTTP

**Services**:
- `GuidanceClient`
- `ContextManagerClient`
- `ToolsRegistryClient`
- `WorkflowSystemClient`

#### Definition of Done
- All mocked components replaced with real HTTP clients
- Integration tests pass against staging environment
- Configuration documented
- All tests pass

#### Dependencies
- External components deployed (001, 003, 004)
- NEXUS-002-6 (message sending for integration testing)

---

## Phase 5: Process Control

### NEXUS-002-8: Agent Checkpoint Infrastructure

**Title**: Implement Agent Checkpoint and State Management
**Type**: Story
**Priority**: High
**Estimated Effort**: 5 story points

#### Description
Implement checkpoint mechanism allowing agents to save and restore state at strategic points during execution. This provides the foundation for pause/resume and interactive multi-turn conversations.

#### User Story
As a developer, I want agents to checkpoint their state at key points, so we can support pause/resume and interactive messaging features.

#### Acceptance Criteria
- [ ] Agent checkpoints created at strategic points:
  - Before each phase
  - Before external service calls
  - When checking for control signals
- [ ] Checkpoint includes full agent state and conversation history
- [ ] CheckpointService can save checkpoints to database
- [ ] CheckpointService can restore agent state from checkpoint
- [ ] Checkpoint data includes: state_snapshot, conversation_history, current_phase, metadata
- [ ] All tests pass

#### Technical Implementation
**Models**:
- `Checkpoint` (checkpoint_id, invocation_id, state_snapshot, conversation_history, current_phase, timestamp, metadata)

**Services**:
- `CheckpointService` - Create/restore checkpoints with database persistence
- Update `WorkflowGeneratorAgent` - Add checkpoint logic at strategic points

#### Definition of Done
- Agents create checkpoints at strategic points
- Checkpoints stored to database
- Agent state can be restored from checkpoint
- All tests pass

#### Dependencies
- NEXUS-002-5 (conversation history)

---

### NEXUS-002-9: Pause Running Invocations

**Title**: Pause Agent Invocations with State Preservation
**Type**: Story
**Priority**: Medium
**Estimated Effort**: 5 story points

#### Description
Implement POST /invoke/{id}/pause to pause running agents. Agent saves checkpoint and enters paused state.

#### User Story
As a user, I want to pause a running workflow generation to review progress before continuing, so I can control expensive operations.

#### Acceptance Criteria
- [ ] POST /v1/invoke/{id}/pause endpoint implemented
- [ ] Response: `{invocation_id, action: "pause", status: "acknowledged", current_state: "paused"}`
- [ ] Acknowledgment <500ms p95
- [ ] Pause flag stored in invocation state
- [ ] Agent checks for pause at checkpoints
- [ ] On pause: saves checkpoint, transitions to "paused"
- [ ] WebSocket broadcasts status_change event to all connected clients
- [ ] State transitions: running → paused

#### Technical Implementation
**Models**:
- `ControlSignal` (signal_type: pause | cancel, timestamp)
- `ControlResponse` (invocation_id, action, status, current_state, acknowledged_at)

**API Endpoints**:
- `POST /v1/invoke/{id}/pause`

**Services**:
- `ControlHandler` - Process control signals
- Update agents to check control signals at checkpoints

#### Definition of Done
- User can pause running invocation
- Agent saves state and enters paused state
- WebSocket broadcasts status_change event
- State transition validated
- All tests pass

#### Dependencies
- NEXUS-002-8 (checkpoints working)

---

### NEXUS-002-10: Resume and Cancel Invocations

**Title**: Resume Paused Invocations and Cancel Any Invocation
**Type**: Story
**Priority**: Medium
**Estimated Effort**: 5 story points

#### Description
Implement resume (via message) and cancel functionality. Resume continues from checkpoint, cancel is irreversible cleanup.

#### User Story
As a user, I want to resume a paused invocation by sending a message, or permanently cancel an invocation if I decide not to continue.

#### Acceptance Criteria
- [ ] Paused invocation resumes when message sent
- [ ] State transition: paused → running
- [ ] Agent continues from last checkpoint
- [ ] POST /v1/invoke/{id}/cancel endpoint implemented
- [ ] Cancel response: `{invocation_id, action: "cancel", status: "completed", current_state: "cancelled"}`
- [ ] Cancellation performs cleanup (release resources)
- [ ] Cancellation is irreversible (cannot resume)
- [ ] WebSocket broadcasts status_change event for both resume and cancel to all connected clients
- [ ] State transitions: running → cancelled, paused → cancelled
- [ ] Invalid transitions rejected (completed → *, cancelled → *)

#### Technical Implementation
**API Endpoints**:
- `POST /v1/invoke/{id}/cancel`

**Services**:
- Update `MessageHandler` - Resume on message to paused invocation
- Update `ControlHandler` - Cancel logic
- Update agents - Cleanup on cancel

#### Definition of Done
- User resumes paused invocation via message
- Agent continues from checkpoint
- User cancels running/paused invocation
- Cancellation is irreversible
- Invalid state transitions rejected
- Quickstart Scenarios 5 & 6 work end-to-end
- All tests pass

#### Dependencies
- NEXUS-002-9 (pause working)

---

## Phase 6: Advanced Orchestration

### NEXUS-002-11: LangGraph Orchestration Foundation

**Title**: Implement LangGraph-Based Agent Orchestration
**Type**: Story
**Priority**: Medium
**Estimated Effort**: 8 story points

#### Description
Replace simple routing with LangGraph-based orchestration. Implement graph with nodes for orchestrator, workflow_generator, and generic_agent with conditional edges.

#### User Story
As a developer, I want sophisticated agent coordination using LangGraph, so the system can handle complex multi-agent workflows in the future.

#### Acceptance Criteria
- [ ] LangGraph graph defined with 3 nodes:
  - Orchestrator (routing/coordination)
  - Workflow Generator
  - Generic Agent
- [ ] Conditional edges based on routing decision
- [ ] Checkpoints at each node (LangGraph built-in)
- [ ] All existing scenarios continue to work (no regression)
- [ ] Performance maintained (routing <500ms p95)

#### Technical Implementation
**Dependencies**:
- LangGraph
- LangChain (internal only)

**Services**:
- `OrchestrationService` - LangGraph graph management
- `OrchestratorAgent` - Central coordination node

#### Definition of Done
- LangGraph orchestration replaces simple routing
- All previous quickstart scenarios pass
- No performance regression
- Code more maintainable and extensible
- All tests pass

#### Dependencies
- NEXUS-002-10 (all basic features working)

---

### NEXUS-002-12: A2A Protocol for Inter-Agent Communication

**Title**: Implement Agent-to-Agent Communication Protocol
**Type**: Story
**Priority**: Medium
**Estimated Effort**: 5 story points

#### Description
Implement A2A protocol for clean internal communication between orchestrator and specialized agents.

#### User Story
As a developer, I want clean inter-agent communication via A2A protocol, so adding new specialized agents is straightforward.

#### Acceptance Criteria
- [ ] A2A message structure defined
- [ ] Message routing between agents via A2A
- [ ] Correlation IDs for request-response tracking
- [ ] All agent communication uses A2A protocol
- [ ] No functional changes (internal refactoring)
- [ ] All existing scenarios continue to work

#### Technical Implementation
**Models**:
- `A2AMessage` (sender_id, receiver_id, message_type, payload, correlation_id)

**Services**:
- `A2AProtocol` - Message handling and routing

#### Definition of Done
- A2A protocol handles all inter-agent communication
- Correlation tracking works
- All scenarios pass without regression
- Code cleaner and more maintainable
- All tests pass

#### Dependencies
- NEXUS-002-11 (LangGraph orchestration)

---

## Phase 7: Production Readiness

### NEXUS-002-13: Observability (Logging & Metrics)

**Title**: Implement Structured Logging and Metrics
**Type**: Story
**Priority**: Medium
**Estimated Effort**: 5 story points

#### Description
Implement comprehensive observability with structured logging and Prometheus metrics.

#### User Story
As an operator, I want structured logs and metrics, so I can monitor system health and troubleshoot issues effectively.

#### Acceptance Criteria
- [ ] Structured logging (JSON format, correlation IDs, contextual info)
- [ ] Log levels: DEBUG, INFO, WARNING, ERROR
- [ ] Prometheus metrics:
  - Invocation count by mode
  - Invocation duration histograms
  - External component call latency
  - Error rate counters
  - Active invocations gauge
  - Control signal counters
- [ ] Metrics endpoint: GET /v1/metrics

#### Technical Implementation
**Dependencies**:
- `structlog` for structured logging
- `prometheus-client` for metrics

**Services**:
- `LoggingService` - Centralized logging
- `MetricsService` - Metrics instrumentation

#### Definition of Done
- Structured logging implemented throughout
- Prometheus metrics exported at /metrics
- Logs include correlation IDs
- All tests pass

#### Dependencies
- NEXUS-002-7 (external clients implemented)

---

## Dependency Graph

```
Phase 1: Basic Async
  NEXUS-002-1 (Accept Requests)
      ↓
  NEXUS-002-2 (WebSocket Streaming)
      ↓
  NEXUS-002-3 (Workflow Generation)

Phase 2: Agent Routing
  NEXUS-002-4 (Generic Agent) → depends on 002-3

Phase 3: Interactive Messaging
  NEXUS-002-5 (Conversation History) → depends on 002-1
      ↓
  NEXUS-002-6 (Send Messages) → depends on 002-5

Phase 4: External Integration
  NEXUS-002-7 (HTTP Clients) → depends on 002-6 + external components deployed

Phase 5: Process Control
  NEXUS-002-8 (Checkpoint Infrastructure) → depends on 002-5
      ↓
  NEXUS-002-9 (Pause) → depends on 002-8
      ↓
  NEXUS-002-10 (Resume & Cancel) → depends on 002-9

Phase 6: Advanced Orchestration
  NEXUS-002-11 (LangGraph) → depends on 002-10
      ↓
  NEXUS-002-12 (A2A Protocol) → depends on 002-11

Phase 7: Production Readiness
  NEXUS-002-13 (Observability) → depends on 002-7
```

## Estimation Summary

| Ticket | Story Points | Cumulative | Phase |
|--------|-------------|-----------|-------|
| NEXUS-002-1 | 5 | 5 | Phase 1 |
| NEXUS-002-2 | 5 | 10 | Phase 1 |
| NEXUS-002-3 | 8 | 18 | Phase 1 |
| NEXUS-002-4 | 5 | 23 | Phase 2 |
| NEXUS-002-5 | 3 | 26 | Phase 3 |
| NEXUS-002-6 | 5 | 31 | Phase 3 |
| NEXUS-002-7 | 8 | 39 | Phase 4 |
| NEXUS-002-8 | 5 | 44 | Phase 5 |
| NEXUS-002-9 | 5 | 49 | Phase 5 |
| NEXUS-002-10 | 5 | 54 | Phase 5 |
| NEXUS-002-11 | 8 | 62 | Phase 6 |
| NEXUS-002-12 | 5 | 67 | Phase 6 |
| NEXUS-002-13 | 5 | 72 | Phase 7 |

**Total Effort**: 72 story points

**Estimated Timeline** (assuming 2-week sprints, 20 points per sprint):
- ~4 sprints (8 weeks) with single developer
- ~2 sprints (4 weeks) with 2 developers working in parallel where possible

## Key Benefits of This Breakdown

1. **Small, mergeable tickets**: Each 3-8 story points (except one 8-pointer for checkpoint logic)
2. **Complete features**: Every ticket includes models + API + tests for working functionality
3. **Independently testable**: Each PR can be tested and demonstrated via curl/Postman
4. **Clear progression**: Natural flow from basic → advanced features
5. **Early value**: Phase 1 delivers MVP async workflow generation in 3 tickets
6. **Parallel opportunities**: Some tickets within phases can run in parallel

## Notes

- Each ticket is independently deployable (with prior dependencies met)
- All tickets follow TDD: tests before implementation
- Constitution compliance validated at each PR review
- Performance targets validated through testing in each ticket
- Production readiness achieved through NEXUS-002-13 (Observability)
