# Data Model: Workflow Definition

**Feature**: 036-workflow-definition-v2
**Date**: 2026-03-12
**Phase**: 1 - Design & Contracts

## Overview

This document defines the data models for Workflow Definition V2. The **existing** `WorkflowVersion` SQLModel stores workflow definitions in the JSONB `workflow_definition` field. **V2 completely replaces v1** - only `schema_version: "2.0.0"` is supported. All v1 code is removed.

**No new database models are created** - the existing model is adapted to require v2 format only.

## Database Models (SQLModel)

### WorkflowVersion (Existing - Adapted for V2 Only)

**Purpose**: Store workflow definitions in database (v2 format only)

**Location**: `src/nexus/workflows/models/workflow_version.py`

**Inherits From**:

- `BaseResource`: id, created_at, updated_at, labels
- `UserOwnedResource`: created_by, updated_by
- `SoftDeletableResource`: deleted_at, deleted_by

**Direct Fields**:


| Field               | Type                   | Constraints                    | Description                                                    |
| ------------------- | ---------------------- | ------------------------------ | -------------------------------------------------------------- |
| workflow_id         | UUID                   | Foreign Key, NOT NULL, indexed | Reference to parent workflow                                   |
| version             | int                    | NOT NULL, indexed              | Version number (auto-incremented per workflow)                 |
| schema_version      | str                    | NOT NULL, indexed              | Workflow schema version (v2 = "2.0.0")                         |
| workflow_definition | dict[str, Any] (JSONB) | NOT NULL                       | Complete v2 workflow definition with `schema_version: "2.0.0"` |
| change_description  | str                    | None                           | NULL                                                           |


**V2 Changes**:

- **No database schema changes** - existing JSONB `workflow_definition` field stores v2 format
- `workflow_definition` JSONB **must** contain `schema_version: "2.0.0"`
- Validation rejects any workflow with `schema_version` != "2.0.0"
- All v1 validation/execution code removed

**Indexes**:

- Primary: id
- (workflow_id, version) UNIQUE
- name (for lookup)

**Relationships**:

- Belongs to: Workflow (via workflow_id)
- Has many: Execution (via id → workflow_version_id)

**Validation Rules**:

1. workflow_definition MUST contain schema_version "2.0.0" (older versions rejected)
2. workflow_definition MUST validate against src/nexus/schemas/workflows/v2/workflow_definition.schema.json
3. name MUST be unique within organization

**JSON Storage**:

- workflow_definition stored as JSONB

---

### Execution (Existing - Adapted for V2 Only)

**Purpose**: Track workflow execution state and results (v2 only)

**Location**: `src/nexus/workflows/models/execution.py`

**V2 Changes**: No database schema changes. V2 uses graph-based execution and all nodes create ActivityExecution records for uniform tracking.

**Inherits From**:

- `BaseResource`: id, created_at, updated_at, labels
- `UserOwnedResource`: created_by, updated_by
- `SoftDeletableResource`: deleted_at, deleted_by

**Direct Fields**:


| Field                   | Type                   | Constraints                    | Description                                                                |
| ----------------------- | ---------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| workflow_id             | UUID                   | Foreign Key, NOT NULL, indexed | Reference to workflow                                                      |
| workflow_version_id     | UUID                   | Foreign Key, NOT NULL          | Reference to WorkflowVersion executed                                      |
| engine_execution_id     | str                    | NOT NULL, UNIQUE, indexed      | Execution engine ID (currently Temporal workflow ID, engine-agnostic name) |
| status                  | ExecutionStatus        | NOT NULL, default=PENDING      | Current execution status (enum)                                            |
| completed_at            | datetime               | None                           | NULL                                                                       |
| input_data              | dict[str, Any] (JSONB) | NOT NULL                       | Trigger-agnostic output (data from trigger that starts workflow)           |
| error_details           | str                    | None                           | NULL                                                                       |
| last_processed_event_id | int                    | NOT NULL, default=0            | Last engine event ID processed (internal sync tracking)                    |


**Field Changes from V1**:

- **Renamed** `temporal_workflow_id` → `engine_execution_id`: Abstract execution engine (not locked to Temporal, future-proof for engine replacement)
- Field value currently stores Temporal workflow ID, but name doesn't expose implementation detail

**Indexes**:

- Primary: id
- (workflow_id, created_at) DESC (for execution history)
- engine_execution_id UNIQUE (for execution engine integration)
- status (for filtering active executions)

**Relationships**:

- Belongs to: Workflow (via workflow_id)
- Belongs to: WorkflowVersion (via workflow_version_id)
- Has many: ActivityExecution (via id → execution_id)

**State Transitions**:

```
PENDING → RUNNING → COMPLETED
             ↓
           FAILED
             ↓
         CANCELLED
```

---

### ActivityExecution (Existing - Extended for V2 Control Nodes)

**Purpose**: Track individual node (activity) execution within a workflow execution

**Location**: `src/nexus/workflows/models/activity_execution.py`

**V2 Changes**: **All nodes (including control nodes) create ActivityExecution records** via Temporal activities. This differs from v1 where control nodes had no database records.

**Inherits From**:

- `BaseResource`: id, created_at, updated_at, labels

**Direct Fields**:


| Field         | Type                   | Constraints                    | Description                                                            |
| ------------- | ---------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| execution_id  | UUID                   | Foreign Key, NOT NULL, indexed | Reference to parent WorkflowExecution                                  |
| node_id       | str                    | NOT NULL, indexed              | Node ID from workflow definition                                       |
| node_name     | str                    | NOT NULL                       | Node display name from workflow definition                             |
| status        | str                    | NOT NULL                       | PENDING, RUNNING, COMPLETED, FAILED, CANCELLED                         |
| started_at    | datetime | None        | NULL                           | When activity execution started                                        |
| completed_at  | datetime | None        | NULL                           | When activity completed/failed/cancelled                               |
| input_data    | dict[str, Any] (JSONB) | NOT NULL                       | Runtime data from node config (templates resolved, secret values masked) |
| output_data   | dict[str, Any] (JSONB) | NULL                           | Runtime result based on resultSchema or user-extracted outputs         |
| error_details | str | None             | NULL                           | Error message if activity failed                                       |
| retry_count   | int                    | NOT NULL, default=0            | Number of retry attempts                                               |
| iteration     | int | None             | NULL                           | Loop iteration number (for loop nodes, updates from 0 → 1 → 2 → ... N) |


**Field Changes from V1**:

- **Removed** `temporal_activity_id`: Temporal appends `_1`, `_2` for loop iterations, making it useless since we update the same record
- **Removed** `activity_definition`: Redundant JSONB field (node definition already in WorkflowVersion)
- **Renamed** `activity_name` → `node_id`: More accurate naming (it's the node identifier, not activity name)
- **Added** `node_name`: Human-readable display name from node definition

**Indexes**:

- Primary: id
- (execution_id, node_id) UNIQUE (for querying specific node execution in workflow)
- (execution_id, started_at) DESC (for timeline queries)

**Relationships**:

- Belongs to: WorkflowExecution (via execution_id)

**V2 Uniform Node Tracking**:

**All nodes create ActivityExecution records**, including:

- **Executor nodes**: aap_job_template, http_request, agentic, script, approval
- **Trigger nodes**: manual, scheduled, webhook, eda
- **Control nodes**: condition, switch, loop, parallel, converge, wait

This differs from v1 where control nodes had no database records.

**ActivityExecution Example** (HTTP Request node):

Given this node definition in WorkflowVersion.workflow_definition:

```json
{
  "id": "health_check",
  "name": "Check API Health",
  "type": "http_request",
  "config": {
    "method": "GET",
    "url": "https://api.example.com/users/${start.user_id}"
  },
  "outputs": {
    "user_email": "${result.body.email}",
    "user_status": "${result.body.status}"
  }
}
```

The ActivityExecution record after execution:

```json
{
  "execution_id": "exec-uuid-123",
  "node_id": "health_check",
  "node_name": "Check API Health",
  "status": "completed",
  "started_at": "2026-03-12T10:00:01.000Z",
  "completed_at": "2026-03-12T10:00:02.500Z",
  "input_data": {
    "method": "GET",
    "url": "https://api.example.com/users/42",
    "headers": {},
    "body": null,
    "authentication": null,
    "timeout": 30
  },
  "output_data": {
    "user_email": "john@example.com",
    "user_status": "active",
    "status": "success",
    "error": null
  },
  "error_details": null,
  "retry_count": 0,
  "iteration": null
}
```

**Field Mapping**:

- **input_data**: Runtime config from node definition after template resolution (`${start.user_id}` → `42`)
- **output_data**: Extracted outputs based on `outputs` definition in node (`user_email`, `user_status`) plus reserved fields (`status`, `error`)

**Secret Masking in input_data**:

When template expressions reference secrets (e.g., `${secret.api_key}`), the resolved values in `input_data` are masked/obfuscated before persistence to prevent secret leakage:

```json
// Node config before resolution
{
  "url": "https://api.example.com/data",
  "headers": {
    "Authorization": "Bearer ${secret.api_token}"
  }
}

// input_data after resolution and masking
{
  "url": "https://api.example.com/data",
  "headers": {
    "Authorization": "Bearer ***MASKED***"
  }
}
```

This ensures secrets are injected at runtime for execution but never exposed in database records, execution results, or logs.

**Note**: Node definition details (id, name, type, config, outputs) stored in `WorkflowVersion.workflow_definition` JSONB, not duplicated in ActivityExecution.

**Benefits of Uniform Tracking**:

- **Observability**: All nodes visible in Temporal UI and execution timeline
- **Debugging**: Clear record of control flow decisions (condition results, loop iterations)
- **Monitoring**: Consistent metrics across all node types
- **Audit**: Complete execution history including control logic

---

**V2 Query Pattern**: Query ActivityExecution table to get all node executions for a workflow execution, ordered by started_at. To get node type/config, look up in WorkflowVersion.workflow_definition JSONB.

---

## Workflow Definition Structure

### V2 Format (JSONB in WorkflowVersion.workflow_definition)

**Fields**:

| Field          | Type       | Description                                                   |
| -------------- | ---------- | ------------------------------------------------------------- |
| schema_version | str        | Must be "2.0.0"                                               |
| name           | str        | Workflow name                                                 |
| description    | str        | Workflow description (optional)                               |
| triggers       | List[dict] | Trigger nodes (separate from execution nodes, min 1 required) |
| nodes          | List[dict] | Execution and control flow nodes (excludes triggers)          |
| edges          | List[dict] | Node connections with optional ports                          |

### Node Structure

**Common Fields**: id, name, type, config, outputs (optional), position (optional)

**Node Types** (v1 parity):
- **Triggers**: manual
- **Executors**: aap_job_template, http_request, agentic, script
- **Control Flow**: condition, loop, converge

**Note**: Parallelism is implicit when multiple edges originate from same port - no dedicated parallel node type.

---

### Edge Structure

**Fields**:

| Field     | Type | Description                                                                        |
| --------- | ---- | ---------------------------------------------------------------------------------- |
| from      | str  | Source node or trigger ID                                                          |
| to        | str  | Target node ID                                                                     |
| from_port | str  | Output port (optional). Condition: 'true'/'false', Loop: 'iterate'/'complete' |
| to_port   | str  | Input port (optional). Currently only 'iterate' for loop feedback edges            |

**Notes**:
- from and to must reference existing node/trigger IDs
- from_port values must match source node type
- to_port="iterate" creates loop feedback edge (removed during DAG validation, runtime handles loop iteration)

---

## Validation Models

### ValidationError

**Purpose**: Structured validation error response

**Fields**:


| Field    | Type             | Description                   |
| -------- | ---------------- | ----------------------------- |
| type     | str              | Error type URI (RFC 9457)     |
| title    | str              | Human-readable error category |
| status   | int              | HTTP status code              |
| detail   | str              | Specific error explanation    |
| instance | str              | URI of failed workflow/node   |
| errors   | List[FieldError] | Detailed validation failures  |


**Example**:

```json
{
  "type": "/errors/validation-failed",
  "title": "Workflow Validation Failed",
  "status": 400,
  "detail": "Workflow definition contains 3 validation errors",
  "instance": "/api/v1/workflows/550e8400-e29b-41d4-a716-446655440000",
  "errors": [
    {
      "field": "nodes[2].id",
      "message": "Node ID 'trigger' conflicts with reserved namespace",
      "rule": "FR-005"
    },
    {
      "field": "edges[5]",
      "message": "Edge references non-existent node 'missing_node'",
      "rule": "FR-006"
    },
    {
      "field": "workflow",
      "message": "Circular reference detected: node1 → node2 → node3 → node1",
      "rule": "FR-012a"
    }
  ]
}
```

---

### FieldError

**Purpose**: Individual field validation failure

**Fields**:


| Field   | Type | Description                              |
| ------- | ---- | ---------------------------------------- |
| field   | str  | JSON path to invalid field               |
| message | str  | Human-readable error message             |
| rule    | str  | Violated functional requirement (FR-XXX) |
| value   | Any  | Invalid value (if safe to expose)        |


---

## Entity Relationships

```
Workflow
    ↓ (1:N)
WorkflowVersion (contains workflow_definition JSONB with v2 format)
    ↓ (1:N)
WorkflowExecution
    ├─→ engine_execution_id → Execution Engine (currently Temporal, abstracted)
    └─→ (1:N)
        ActivityExecution (ALL nodes including control nodes in V2)
            ├─ node_id: identifier from workflow definition
            ├─ node_name: display name from workflow definition
            └─ iteration: for loop nodes (updates same record)
```

**Key V2 Changes**:

- WorkflowVersion.workflow_definition stores v2 graph format (triggers + nodes + edges, triggers separate from nodes)
- **ALL nodes** (executors, triggers, control) create ActivityExecution records via execution engine
- Edges use ports (from_port, to_port) instead of labels (when, branch, loop_control) for control flow routing
- Loop feedback edges (to_port="iterate") create cycles in graph, removed for DAG validation. Last node in iterate branch automatically loops back at runtime.
- V1 nested activity tracking removed - V2 uses flat graph execution with uniform tracking
- ActivityExecution simplified: removed `temporal_activity_id` (it is the same as node_id) and `activity_definition` (redundant)
- Node details stored once in WorkflowVersion, ActivityExecution only tracks execution state
- Engine abstraction: `engine_execution_id` hides implementation (currently Temporal, future-proof)

## State Management

### Execution Lifecycle

```
PENDING → RUNNING → COMPLETED
             ↓           ↑
          FAILED    CANCELLED
```

- **PENDING**: Queued for execution
- **RUNNING**: Currently executing (Temporal workflow active)
- **COMPLETED**: Successfully finished
- **FAILED**: Execution failed (error captured)
- **CANCELLED**: User/system cancelled execution

## Data Integrity Rules

1. **Cascade Deletes**: Deleting workflow version cascades to executions (soft delete preferred)
2. **Immutability**: workflow_definition immutable after execution starts (create new WorkflowVersion instead)
3. **Secret Sanitization**: Before persisting node_executions, sanitize any ${secret.*} references
4. **JSONB Validation**: PostgreSQL check constraint ensures workflow_definition is valid JSON
5. **Foreign Key Constraints**: workflow_version_id in WorkflowExecution must reference existing WorkflowVersion
6. **Version Consistency**: schema_version must be "2.0.0" (enforced by validation)

## Schema Version Requirements

The workflow system **only supports v2 format** with `schema_version: "2.0.0"`. All v1 code has been removed.

**Validation**: WorkflowValidator enforces schema_version="2.0.0", validates required fields (triggers, nodes, edges), with comprehensive DAG validation to be added later.

**Execution**: Graph-based execution engine builds WorkflowGraph from definition and executes nodes with asyncio concurrent execution for implicit parallelism.

## Implementation Modules

### New Modules Created

1. **graph_backend.py** - Pluggable backend architecture with IGraphBackend protocol and InMemoryGraphBackend implementation
2. **graph.py** - WorkflowGraph domain model with ActivityNode abstraction, delegating graph operations to backend
3. **namespace_resolver.py** - Template expression resolver with smart loop resolution and context-aware upstream search
4. **output_mapping.py** - Shared utility for selective output extraction in activities
5. **schema_service.py** - Schema discovery with catalog loading and label-based filtering
6. **workflow_schemas_router.py** - FastAPI router for schema discovery endpoints
7. **V2 Activities** - manual (trigger), http_request_activity, condition, loop, converge (all return unified output structure)

### Replaced Modules (V1 → V2)

1. **validators/workflow_definition.py** - V2 validator with WorkflowValidator class (basic validation first, comprehensive later)
2. **workflow_service.py** - Updated to use V2 validator and enforce schema_version="2.0.0" only
3. **dynamic_workflow.py** - V2 graph-based execution engine with asyncio concurrent execution
  - Control node logic moved to individual `activities/` modules (condition.py, loop.py, converge.py)
