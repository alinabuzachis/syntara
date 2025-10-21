# Data Model: Agent Orchestrator

**Feature**: Agent Orchestrator (002-agent-orchestrator)
**Date**: 2025-10-08
**Phase**: 1 - Design & Contracts

## Overview

The Agent Orchestrator data model defines entities for the async-only REST API that enables all clients (UI, Workflow Engine, etc.) to invoke agentic intelligence. The model supports:

- Async-only invocation mode (returns invocation ID immediately)
- Interactive multi-turn conversations with running agents
- Pause/cancel control signals
- Real-time progress streaming via WebSocket
- Integration with external components (Guidance, Context Manager, Tools Registry, Workflow System)

**Key Design Principles:**

- **Read-only operations**: Agent Orchestrator does NOT store workflows or tool metadata (FR-016, FR-017)
- **External storage**: All persistence handled by Context Manager, Workflow System, and Tools Registry
- **Stateless invocations**: Invocation state maintained in Context Manager for horizontal scaling
- **Async-only API**: Single POST /invoke endpoint returns immediately; all clients use WebSocket for progress/results

---

## Core Entities

### Invocation

Runtime instance of an agent request with current state and conversation history. Stored in Context Manager (external component). All invocations are async - they return immediately and stream progress via WebSocket.

**Fields:**

- `invocation_id`: UUID (Primary Key) - **Auto-generated**
- `prompt`: Text - **Required** (Natural language user request, 1-10,000 characters)
- `user_id`: String - **Required** (User identifier for policy and authorization)
- `status`: Enum - **Auto-set** (defaults to `running`, values: running, paused, cancelled, completed, failed)
- `created_at`: Timestamp - **Auto-generated**
- `started_at`: Timestamp - **Auto-set** (When agent began processing)
- `completed_at`: Timestamp - **Auto-set** (defaults to null, when invocation reached terminal state)
- `updated_at`: Timestamp - **Auto-updated**
- `context_data`: JSON - **Optional** (defaults to `{}`, additional request context provided by caller)
- `result`: JSON - **Auto-set** (defaults to null, final result when status=completed)
- `error_message`: Text - **Auto-set** (defaults to null, error details when status=failed)
- `checkpoint_data`: JSON - **Auto-set** (defaults to null, LangGraph checkpoint for pause/resume)

**Relationships:**

- `conversation_messages` ← ConversationMessage (One-to-Many)
- `progress_events` ← ProgressEvent (One-to-Many)
- `routing_decision` ← RoutingDecision (One-to-One)
- `workflow_result` ← WorkflowResult (One-to-One, if workflow generated)

**Validation Rules:**

- `prompt` must be 1-10,000 characters
- `started_at` must be after `created_at`
- `completed_at` must be after `started_at` (if both present)
- `status` transitions must follow valid state machine

**State Transitions:**

- running → paused (via pause control signal)
- running → cancelled (via cancel control signal)
- running → completed (agent finishes successfully)
- running → failed (agent encounters error)
- paused → running (via resume/message injection)
- paused → cancelled (via cancel control signal)

**Storage Location:** Context Manager (working memory)

### ConversationMessage

Individual message in agent conversation history for an invocation.

**Fields:**

- `message_id`: UUID (Primary Key) - **Auto-generated**
- `invocation_id`: UUID (Foreign Key to Invocation) - **Required**
- `role`: Enum - **Required** (values: user, agent, system)
- `content`: Text - **Required** (Message content)
- `timestamp`: Timestamp - **Auto-generated**
- `sequence_number`: Integer - **Auto-incremented** (Message order within conversation, starting from 1)
- `metadata`: JSON - **Optional** (defaults to `{}`, additional message metadata)

**Relationships:**

- `invocation_id` → Invocation (Many-to-One)

**Validation Rules:**

- `role` must be "user", "agent", or "system"
- `sequence_number` must be unique and monotonically increasing per invocation
- `content` must not be empty
- `timestamp` must be >= invocation.created_at

**Message Roles:**

- **user**: Messages from the user (initial prompt or follow-up via POST /invoke/:id/message)
- **agent**: Messages from the Agent Orchestrator (responses, clarifications, updates)
- **system**: System-generated messages (pause/cancel notifications, errors)

**Storage Location:** Context Manager (working memory → short-term memory after completion)

### ProgressEvent

Real-time progress update emitted during agent execution. Streamed via WebSocket to all clients.

**Fields:**

- `event_id`: UUID (Primary Key) - **Auto-generated**
- `invocation_id`: UUID (Foreign Key to Invocation) - **Required**
- `event_type`: Enum - **Required** (values: progress, log, status_change, message, completion, error)
- `timestamp`: Timestamp - **Auto-generated**
- `sequence_number`: Integer - **Auto-incremented** (Event order within invocation)
- `data`: JSON - **Required** (Event-specific payload)

**Relationships:**

- `invocation_id` → Invocation (Many-to-One)

**Validation Rules:**

- `event_type` must be valid enum value
- `sequence_number` must be unique and monotonically increasing per invocation
- `data` structure must match event_type schema

**Event Types:**

- **progress**: Agent is making progress (e.g., "Analyzing request", "Consulting Guidance")
  - `data`: `{phase, message, progress_percentage?}`
- **log**: Agent generated a log message
  - `data`: `{level, message}`
- **status_change**: Invocation status changed
  - `data`: `{previous_status, new_status, reason?}`
- **message**: Agent is requesting user input or providing clarification
  - `data`: `{message, requires_response}`
- **completion**: Agent completed successfully
  - `data`: `{result_type, workflow_id?, result}`
- **error**: Agent encountered an error
  - `data`: `{error_message, error_code?, phase}`

**Storage Location:** Context Manager (working memory, TTL 1 hour after completion)

### RoutingDecision

Orchestration agent's decision on which specialized agent to invoke.

**Fields:**

- `decision_id`: UUID (Primary Key) - **Auto-generated**
- `invocation_id`: UUID (Foreign Key to Invocation) - **Required**
- `target_agent`: Enum - **Required** (values: workflow_generator, generic_agent)
- `confidence`: Float - **Required** (0.0-1.0, confidence score)
- `reasoning`: Text - **Required** (Explanation for routing decision)
- `request_analysis`: JSON - **Required** (Analysis of user request)
- `decided_at`: Timestamp - **Auto-generated**

**Relationships:**

- `invocation_id` → Invocation (Many-to-One, typically One-to-One)

**Validation Rules:**

- `target_agent` must be "workflow_generator" or "generic_agent"
- `confidence` must be 0.0-1.0
- `reasoning` must not be empty (for audit trail)
- `request_analysis` must contain keys: `intent`, `entities`, `complexity`

**Target Agents:**

- **workflow_generator**: Request requires creating an executable workflow
- **generic_agent**: Request is informational/analytical, no workflow needed

**Storage Location:** Context Manager (audit trail for organizational learning)

### WorkflowResult

Reference to workflow generated by workflow_generator agent. The actual workflow definition is stored in the Workflow System (external component).

**Fields:**

- `workflow_result_id`: UUID (Primary Key) - **Auto-generated**
- `invocation_id`: UUID (Foreign Key to Invocation) - **Required**
- `workflow_id`: String - **Required** (Workflow ID from Workflow System)
- `workflow_url`: String - **Required** (URL to retrieve workflow from Workflow System)
- `workflow_name`: String - **Required** (Human-readable workflow name)
- `workflow_description`: Text - **Required** (Workflow purpose)
- `activities_count`: Integer - **Required** (Number of workflow phases)
- `tools_referenced`: JSON Array - **Required** (List of tool IDs referenced in workflow)
- `generated_at`: Timestamp - **Auto-generated**

**Relationships:**

- `invocation_id` → Invocation (Many-to-One, typically One-to-One)

**Validation Rules:**

- `workflow_id` must match ID returned by Workflow System
- `workflow_url` must be valid URL
- `phases_count` must be > 0
- `tools_referenced` must be array of tool IDs from Tool Manager

**Integration Boundary:**

- Agent Orchestrator generates workflow definition and sends to Workflow System via API (FR-016, FR-017)
- Workflow System stores the definition and returns workflow_id
- This entity stores metadata only; full definition lives in Workflow System
- User approves/rejects workflow via UI, which interacts with Workflow System

**Storage Location:** Context Manager (for invocation result tracking)

---

## Supporting Entities

### GuidanceRecommendation

Policy-driven recommendation from external Guidance component. Retrieved during agent execution.

**Fields:**

- `recommendation_id`: String (Primary Key) - **Provided by Guidance component**
- `priority`: Enum - **Required** (values: required, recommended, optional)
- `category`: String - **Required** (e.g., "tool_selection", "security", "compliance")
- `recommendation_text`: Text - **Required** (Guidance recommendation)
- `rationale`: Text - **Required** (Why this recommendation applies)
- `applicable_tools`: JSON Array - **Optional** (defaults to `[]`, tool IDs this guidance applies to)
- `constraints`: JSON - **Optional** (defaults to `{}`, specific constraints to enforce)
- `source`: String - **Required** (Source of guidance: policy_id, domain_expert, etc.)

**Validation Rules:**

- `priority` must be "required", "recommended", or "optional"
- `priority=required` means immutable security/compliance rule (FR-005)
- `priority=recommended` means should be followed unless justification provided
- `priority=optional` means suggestions only

**Hierarchical Priorities:** Organizational policies > domain expertise > user preferences

**Storage Location:** External Guidance component (read-only access by Agent Orchestrator)

### ContextEntry

Contextual information from Context Manager used to inform agent decisions.

**Fields:**

- `entry_id`: String (Primary Key) - **Provided by Context Manager**
- `context_type`: Enum - **Required** (values: working_memory, short_term, long_term)
- `key`: String - **Required** (Context key)
- `value`: JSON - **Required** (Context data)
- `relevance_score`: Float - **Required** (0.0-1.0, relevance to current request)
- `created_at`: Timestamp
- `accessed_at`: Timestamp - **Auto-updated** (Last access time)
- `ttl_seconds`: Integer - **Optional** (Time-to-live for context entry)
- `metadata`: JSON - **Optional** (defaults to `{}`)

**Validation Rules:**

- `context_type` must be "working_memory", "short_term", or "long_term"
- `relevance_score` must be 0.0-1.0
- `ttl_seconds` only applicable for working_memory and short_term

**Context Types:**

- **working_memory**: Active decision context for current invocation (TTL: 1 hour)
- **short_term**: Recent interactions and patterns (TTL: 24 hours)
- **long_term**: Historical workflow patterns for organizational learning (persistent)

**Storage Location:** External Context Manager component

### ToolInfo

**Reference**: Tool Manager component (external)

Tool information is retrieved from the **Tool Manager** component during the tool assessment phase. The Agent Orchestrator does NOT store tool metadata locally (FR-016).

**Integration:**

- Agent queries Tool Manager with required capabilities
- Tool Manager returns matching tools with availability status
- Agent selects appropriate tools based on capabilities and guidance
- Tool Manager validates availability before workflow generation (FR-011)

**Data Model**: See Tool Manager specification for complete ToolInfo schema including:
- Tool identification (tool_id, name, version)
- Capabilities and parameters schema
- Permissions and rate limits
- Availability status

**Storage Location:** External Tool Manager component (read-only access by Agent Orchestrator)

---

## Internal Protocol Entities

### A2AMessage

Agent-to-Agent protocol message for internal communication between orchestrator and specialized agents.

**Fields:**

- `message_id`: UUID (Primary Key) - **Auto-generated**
- `message_type`: Enum - **Required** (values: request, response, error, heartbeat)
- `correlation_id`: UUID - **Optional** (defaults to null, for linking request/response)
- `sender_id`: String - **Required** (Agent ID)
- `receiver_id`: String - **Required** (Target agent ID)
- `timestamp`: Timestamp - **Auto-generated**
- `payload`: JSON - **Required** (Message-specific data)
- `timeout_seconds`: Integer - **Optional** (defaults to 30)

**Validation Rules:**

- `correlation_id` required for response and error message types
- `sender_id` and `receiver_id` must be valid agent identifiers
- `message_type` must be valid enum value
- `timeout_seconds` must be 1-300

**Message Flow:**

1. **Request**: Orchestrator → Specialized Agent (workflow_generator or generic_agent)
2. **Response**: Specialized Agent → Orchestrator (result or streaming updates)
3. **Error**: Any agent → Orchestrator (error notification)
4. **Heartbeat**: Long-running agents → Orchestrator (keep-alive)

**Performance Target:** <500ms p95 per message exchange (research.md)

**Storage Location:** In-memory message bus (Valkey or internal queue)

---

## Entity Relationships

### Primary Relationships

```
Invocation (1) ← (M) ConversationMessage
Invocation (1) ← (M) ProgressEvent
Invocation (1) ← (1) RoutingDecision
Invocation (1) ← (1) WorkflowResult [optional, only if workflow generated]
```

### External Component Integrations

```
Invocation → Guidance Component (read GuidanceRecommendations)
Invocation → Context Manager (read ContextEntries, write InvocationState)
Invocation → Tool Manager (read ToolInfo)
Invocation → Workflow System (write WorkflowDefinition, receive workflow_id)
```

### Internal Protocol

```
Orchestrator Agent ← (M) A2AMessage
Workflow Generator Agent ← (M) A2AMessage
Generic Agent ← (M) A2AMessage
```

---

## State Machines

### Invocation Status States

```
running → paused
running → cancelled
running → completed
running → failed

paused → running
paused → cancelled

[Terminal states: cancelled, completed, failed]
```

**Control Signals:**

- **Pause**: Sets invocation.status = paused, saves checkpoint_data
- **Cancel**: Sets invocation.status = cancelled, performs cleanup
- **Resume**: Sets invocation.status = running (from paused), loads checkpoint_data
- **Message**: If paused, injects message and resumes; if running, queues message

---

## Storage Architecture

### External Storage (Context Manager)

- **Invocation state**: Working memory (1 hour TTL after completion)
- **Conversation history**: Working memory → short-term (24 hour TTL)
- **Progress events**: Working memory (1 hour TTL after completion)
- **Routing decisions**: Long-term (audit trail, persistent)
- **Workflow results**: Long-term (audit trail, persistent)

### External Storage (Workflow System)

- **Workflow definitions**: Persistent storage managed by Workflow System
- Agent Orchestrator writes workflow definition via API, receives workflow_id
- Does NOT store workflow definitions locally (FR-016, FR-017)

### External Storage (Tool Manager)

- **Tool catalog**: Persistent storage managed by Tool Manager
- Agent Orchestrator queries for tool information (read-only, FR-016)
- Does NOT store tool metadata locally

### Agent Orchestrator Internal State

- **Minimal in-memory state**: Active invocation processing (transient)
- **No persistent storage**: All persistence via Context Manager
- **Stateless design**: Enables horizontal scaling
- **Message bus**: Valkey Streams or in-memory queue for A2A messages (ephemeral)

---

## Database Schema Considerations

### Indexes (Context Manager)

- `Invocation`: (invocation_id) primary key, (user_id, status), (status, created_at)
- `ConversationMessage`: (invocation_id, sequence_number), (message_id) primary key
- `ProgressEvent`: (invocation_id, sequence_number), (event_id) primary key
- `RoutingDecision`: (invocation_id), (decision_id) primary key
- `WorkflowResult`: (invocation_id), (workflow_result_id) primary key, (workflow_id)

### Constraints

**Unique Constraints:**

- `Invocation.invocation_id` - UUID primary key
- `ConversationMessage.(invocation_id, sequence_number)` - Unique sequence per invocation
- `ProgressEvent.(invocation_id, sequence_number)` - Unique sequence per invocation

**Foreign Key Cascade Rules:**

- `ConversationMessage.invocation_id` → Invocation: CASCADE (delete messages with invocation)
- `ProgressEvent.invocation_id` → Invocation: CASCADE (delete events with invocation)
- `RoutingDecision.invocation_id` → Invocation: CASCADE (delete decision with invocation)
- `WorkflowResult.invocation_id` → Invocation: CASCADE (delete result with invocation)

**Check Constraints:**

- `Invocation.started_at` >= `Invocation.created_at` (if not null)
- `Invocation.completed_at` > `Invocation.started_at` (if both not null)
- `Invocation.mode` IN ('async', 'sync')
- `Invocation.status` IN ('running', 'paused', 'cancelled', 'completed', 'failed')
- `Invocation.timeout_seconds` BETWEEN 1 AND 300 (if not null, sync mode only)
- `ConversationMessage.role` IN ('user', 'agent', 'system')
- `ConversationMessage.sequence_number` > 0
- `ProgressEvent.sequence_number` > 0
- `RoutingDecision.confidence` BETWEEN 0.0 AND 1.0
- `RoutingDecision.target_agent` IN ('workflow_generator', 'generic_agent')

### Performance Optimizations

- TTL-based automatic cleanup of working memory in Context Manager
- Connection pooling for external component API calls (Guidance, Context Manager, Tool Manager, Workflow System)
- WebSocket connection management for real-time event streaming
- LangGraph checkpointing for efficient pause/resume
- Async I/O throughout the stack for non-blocking operations

---

## Data Model Validation Checklist

- [x] All entities from spec Key Entities section mapped
- [x] REST API models defined (InvokeRequest, InvokeResponse, MessageRequest, MessageResponse, ProgressEvent, ControlResponse)
- [x] Core models defined (Invocation, ConversationMessage, RoutingDecision, WorkflowResult)
- [x] Supporting models defined (GuidanceRecommendation, ContextEntry, ToolInfo)
- [x] Internal protocol models defined (A2AMessage)
- [x] Relationships between entities documented
- [x] Validation rules specified
- [x] State transitions documented
- [x] External component boundaries clear (Guidance, Context Manager, Tool Manager, Workflow System)
- [x] Read-only constraint enforced (FR-016, FR-017) - no workflow or tool storage
- [x] Storage strategy aligned with constitution (explicit configuration, external persistence)
- [x] Performance and scaling considerations documented
