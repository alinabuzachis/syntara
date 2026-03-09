# Data Model: Workflow Runtime Telemetry

**Feature**: 030-workflow-runtime-telemetry
**Date**: 2026-02-17
**Status**: Design Phase

This document defines the data structures for workflow runtime telemetry events transmitted to Segment.com. All events follow Segment's Track API format with custom properties.

---

## Contract Strategy

**Pydantic Models = Source of Truth**

All telemetry events are defined as Pydantic models in `/src/nexus/telemetry/events/`. JSON schemas in `/src/nexus/schemas/telemetry/` are auto-generated using `model.model_json_schema()` and serve as documentation and external validation.

**Why Pydantic-first?**
- **Single source of truth**: No dual maintenance between Pydantic and JSON schemas
- **Type safety**: Full mypy strict mode compliance, IDE autocomplete, refactoring safety
- **Automatic validation**: Pydantic validates at runtime when events are constructed
- **Developer experience**: Easier to write/maintain Python code than hand-craft JSON schemas
- **Schema evolution**: Change Pydantic model → regenerate schema automatically (CI enforced)

**Schema Consistency Rule**:
All event fields must always be present in the payload, using explicit `null` for optional/conditional values. This prevents schema validation failures in Segment when keys are unexpectedly present or absent, and ensures consistent schema definitions across all events.

**Schema Generation**:
```bash
make generate-telemetry-schemas  # Regenerate JSON schemas from Pydantic models
make validate-telemetry-schemas  # Verify schemas are in sync (runs in `make lint`)
```

**Implementation Location**:
- **Pydantic models** (primary): `/src/nexus/telemetry/events/`
- **JSON schemas** (generated): `/src/nexus/schemas/telemetry/` (per constitution)
- **Generation script**: `python -m src.nexus.api.main --export-openapi`

---

## Core Entities

### 1. WorkflowExecutionStartEvent

**Purpose**: Captures telemetry when a workflow execution begins.

**Event Name**: `"Workflow Execution Started"` (Title Case per Segment convention)

**Fields**:

| Field Name | Type | Required | Description | Validation Rules |
|------------|------|----------|-------------|------------------|
| `entitlement_id` | string | Yes | Unique Nexus installation identifier for anonymized tracking | Non-empty, unique per installation |
| `correlation_id` | string (UUID v4) | Yes | Unique workflow execution identifier linking all related events | Must be valid UUID v4 format |
| `workflow_hash` | string | Yes | SHA-256 hash of workflow definition (anonymized identifier) | 64 character hex string matching `^[a-f0-9]{64}$` |

**Validation Rules**:
- `correlation_id` must be unique per workflow execution
- `workflow_hash` calculated as `SHA256(canonical_json(workflow_definition))`

**Relationships**:
- Parent to multiple `ActivityExecutionEvent` records (via `correlation_id`)
- Links to `WorkflowExecutionCompletedEvent` (via `correlation_id`)

**Example Payload**:
```json
{
  "userId": "ent-550e8400-e29b-41d4-a716-446655440000",
  "event": "Workflow Execution Started",
  "timestamp": "2026-02-17T14:30:00.000Z",
  "properties": {
    "entitlement_id": "ent-550e8400-e29b-41d4-a716-446655440000",
    "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
    "workflow_hash": "a3f5e1c9b4d6a8f2e7c5b1d9a4f8e2c6b7d3a9f5e1c8b4d6a7f2e5c9b1d4a8f3"
  },
  "context": {
    "app": {
      "name": "nexus",
      "version": "1.0.0"
    }
  }
}
```

---

### 2. WorkflowExecutionCompletedEvent

**Purpose**: Captures telemetry when a workflow execution finishes (success, failure, timeout, or cancellation).

**Event Name**: `"Workflow Execution Completed"` (Title Case per Segment convention)

**Fields**:

| Field Name | Type | Required | Description | Validation Rules |
|------------|------|----------|-------------|------------------|
| `entitlement_id` | string | Yes | Nexus installation identifier | Non-empty |
| `correlation_id` | string (UUID v4) | Yes | Links to workflow start event and all activity events | Must match corresponding start event |
| `workflow_hash` | string | Yes | SHA-256 hash of workflow definition | 64 character hex string |
| `status` | enum | Yes | Final execution status | Must be one of: `"success"`, `"failed"`, `"timeout"`, `"cancelled"` |
| `duration_ms` | integer | Yes | Exact workflow execution duration in milliseconds | Minimum 0, used for percentile calculations |
| `activity_count` | integer | Yes | Total number of activities executed in workflow | Minimum 0 |
| `error_count` | integer | Yes | Number of activities that failed during execution | Minimum 0, must be 0 for `status="success"` |
| `error_type` | enum \| null | Yes | Categorized error type if workflow failed, `null` otherwise | Always present; non-null only when `status != "success"` |

**Validation Rules**:
- `duration_ms` calculated from Segment-provided timestamps: `complete_event.timestamp` - `start_event.timestamp` (milliseconds)
- `error_count` = count of `ActivityExecutionEvent` records with `status = "failed"` for the same `correlation_id` (includes retry failures)
- `error_count` = 0 when `status = "success"`
- `error_count` >= 0 when `status = "failed"`
- `error_type` required when `status = "failed"`

**Retry Behavior**:
- Each retry attempt emits a separate `ActivityExecutionEvent`
- Failed retry attempts contribute to `error_count`
- Example: An activity that fails twice before succeeding adds 2 to `error_count`, and the workflow can still complete with `status = "success"` if no unrecoverable failures occur

**Error Types**:
- `ActivityExecutionError` : Any error that occurs

**Relationships**:
- Child of `WorkflowExecutionStartEvent` (via `correlation_id`)
- Aggregates data from multiple `ActivityExecutionEvent` records

**Example Payload**:
```json
{
  "userId": "ent-550e8400-e29b-41d4-a716-446655440000",
  "event": "Workflow Execution Completed",
  "timestamp": "2026-02-17T14:30:12.500Z",
  "properties": {
    "entitlement_id": "ent-550e8400-e29b-41d4-a716-446655440000",
    "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
    "workflow_hash": "a3f5e1c9b4d6a8f2e7c5b1d9a4f8e2c6b7d3a9f5e1c8b4d6a7f2e5c9b1d4a8f3",
    "status": "success",
    "duration_ms": 12500,
    "activity_count": 8,
    "error_count": 0,
    "error_type": null,
    "workflow_complexity_score": 12,
    "workflow_depth": 3
  },
  "context": {
    "app": {
      "name": "nexus",
      "version": "1.0.0"
    }
  }
}
```

---

### 3. ActivityExecutionEvent

**Purpose**: Captures telemetry for individual activity execution within a workflow.

**Event Name**: `"Activity Executed"` (Title Case per Segment convention)

**Fields**:

| Field Name | Type | Required | Description | Validation Rules |
|------------|------|----------|-------------|------------------|
| `entitlement_id` | string | Yes | Nexus installation identifier | Non-empty |
| `correlation_id` | string (UUID v4) | Yes | Links to parent workflow execution | Must match parent workflow |
| `activity_type` | enum | Yes | Type of activity executed | Must be one of: `"task"`, `"parallel"`, `"sequence"`, `"condition"`, `"loop"`, `"converge"`, `"approval"` |
| `activity_hash` | string | Yes | SHA-256 hash of activity definition (anonymized identifier) | 64 character hex string matching `^[a-f0-9]{64}$` |
| `status` | enum | Yes | Activity execution outcome | Must be one of: `"success"`, `"failed"` |
| `action_type` | string | No | Optional action type for task activities | Examples: `"api_call"`, `"bash_script"`, `"python_script"`, `"agentic"`, `"aap_job_template"` |
| `inbound_activities` | array[string] | No | Optional array of activity hashes that led to this activity's execution | Each element must be 64-char hex string |
| `outbound_activities` | array[string] | No | Optional array of activity hashes triggered by this activity | Each element must be 64-char hex string |
| `error_type` | enum \| null | Yes | Categorized error type if activity failed, `null` otherwise | Always present; must be `"ActivityExecutionError"` when `status = "failed"`, `null` otherwise |

**Validation Rules**:
- `activity_hash` calculated as `SHA256(canonical_json(activity_definition))`
- `correlation_id` must link to valid workflow execution
- `extension_metadata` required when `action_type` indicates extension activity
- `error_type` required when `status = "failed"`

**Activity Types**:
- `"task"`: Individual action (API call, script, agent, etc.)
- `"parallel"`: Parallel execution branch
- `"sequence"`: Sequential execution steps
- `"condition"`: If/Then/Else branching
- `"loop"`: ForEach/While iteration
- `"converge"`: Wait for multiple branches
- `"approval"`: Human approval gate

**Relationships**:
- Child of workflow execution (linked via `correlation_id` to both `WorkflowExecutionStartEvent` and `WorkflowExecutionCompletedEvent`)
- Can reference other `ActivityExecutionEvent` records (via `inbound_activities`, `outbound_activities`)
- May contain `ExtensionMetadata` (when extension activity)

**Example Payload**:
```json
{
  "userId": "ent-550e8400-e29b-41d4-a716-446655440000",
  "event": "Activity Executed",
  "timestamp": "2026-02-17T14:30:05.200Z",
  "properties": {
    "entitlement_id": "ent-550e8400-e29b-41d4-a716-446655440000",
    "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
    "activity_type": "task",
    "activity_hash": "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2",
    "status": "success",
    "error_type": null,
    "action_type": "api_call",
    "inbound_activities": ["a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"],
    "outbound_activities": ["c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4"]
  },
  "context": {
    "app": {
      "name": "nexus",
      "version": "1.0.0"
    }
  }
}
```

---

### 4. ExtensionMetadata

**Purpose**: Embedded object identifying partner/customer/ecosystem-developed activities.

**Embedded In**: `ActivityExecutionEvent.extension_metadata`

**Fields**:

| Field Name | Type | Required | Description | Validation Rules |
|------------|------|----------|-------------|------------------|
| `source` | enum | Yes | Extension source category | Must be one of: `"partner"`, `"customer"`, `"ecosystem"`, `"native"` |
| `identifier` | string | Yes | Extension unique identifier | Max 255 characters, no PII, alphanumeric + hyphen/underscore only |
| `version` | string | No | Optional semantic version of extension | Must match semver format if provided: `^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$` |

**Validation Rules**:
- `source` must be valid enum value
- `identifier` must NOT contain personally identifiable information
- `identifier` must NOT contain business-confidential data
- `version` follows semantic versioning when provided
- Entire object required when activity is extension type

**Source Categories**:
- `"partner"`: Extensions developed by Red Hat partners
- `"customer"`: Custom extensions developed by customers
- `"ecosystem"`: Community/open-source extensions
- `"native"`: Built-in Nexus platform activities (use when extension is actually native)

**Example**:
```json
{
  "source": "partner",
  "identifier": "acme-corp-data-validator",
  "version": "2.1.0"
}
```

---

## State Transitions

### Workflow Execution Lifecycle

```
[Workflow Created]
       ↓
[WorkflowExecutionStartEvent emitted]
       ↓
[Multiple ActivityExecutionEvent emitted]
       ↓
[WorkflowExecutionCompletedEvent emitted]
       ↓
[Workflow Completed]
```

**State Flow**:
1. **Workflow Started**: `WorkflowExecutionStartEvent` emitted with `correlation_id`
2. **Activities Executing**: One `ActivityExecutionEvent` per activity execution, all sharing `correlation_id`
3. **Workflow Completed**: `WorkflowExecutionCompletedEvent` emitted with aggregated data

**Temporal Ordering**:
- Segment-provided timestamps guarantee ordering: start event < activity events < completion event
- Events may arrive out-of-order at Segment (fire-and-forget transmission), but timestamps reflect true execution order

### Activity Execution Lifecycle

```
[Activity Scheduled]
       ↓
[Activity Executing]
       ↓
[ActivityExecutionEvent emitted] (status: success/failed)
       ↓
[Activity Completed]
```

**Single Event Per Activity Attempt**: Unlike workflow lifecycle (start + complete), activities emit only ONE event per execution attempt. Each retry attempt is a separate execution and emits its own `ActivityExecutionEvent`. For example, if an activity fails twice before succeeding on the third attempt, three `ActivityExecutionEvent` records are emitted (two with `status="failed"`, one with `status="success"`), and `error_count` in the `WorkflowExecutionCompletedEvent` would include those two failures.

---

## Data Volume Estimates

### Event Frequency

**Assumptions**:
- Average workflow: 10 activities
- Average API calls per workflow: 30
- Workflow execution rate: 100 workflows/day per installation
- Number of installations: 100 (initial estimate)

**Daily Event Volume**:
- Workflow Start Events: 100 workflows/day × 100 installations = **10,000 events/day**
- Workflow Complete Events: 100 workflows/day × 100 installations = **10,000 events/day**
- Activity Events: 100 workflows/day × 10 activities/workflow × 100 installations = **100,000 events/day**
- API Call Events: 100 workflows/day × 30 API calls/workflow × 100 installations = **300,000 events/day**
- **Total**: ~**420,000 events/day** across all installations

**Segment Rate Limits**:
- Dedicated Nexus Segment account with higher rate limits
- Expected to handle 420k events/day without sampling
- Monitor actual volume post-deployment for capacity planning

### Event Size Estimates

**Average Event Sizes**:
- Workflow Start Event: ~500 bytes (minimal fields)
- Workflow Complete Event: ~800 bytes (includes aggregations)
- Activity Event: ~800 bytes
- API Call Event: ~600 bytes (endpoint, status, timing)

**Daily Bandwidth** (uncompressed):
- 10k start × 500 bytes = 5 MB
- 10k complete × 800 bytes = 8 MB
- 100k activity × 800 bytes = 80 MB
- 300k API calls × 600 bytes = 180 MB
- **Total**: ~**273 MB/day uncompressed**

**With gzip compression** (70-80% reduction):
- **Compressed**: ~**25-35 MB/day**

---

## Privacy & Sanitization Rules

### Data Exclusion Rules

**NEVER Include**:
1. **Credentials**: API keys, tokens, passwords, secrets
2. **PII**: Names, emails, phone numbers, addresses, SSN
3. **Business Confidential**: Customer names, contract details, pricing
4. **Actual Parameter Values**: Never include parameter values in telemetry

**ALWAYS Include**:
1. **Anonymized Identifiers**: `entitlement_id`, `correlation_id`, hashes
2. **Structural Information**: Activity types, workflow structure, edge relationships
3. **Aggregated Metrics**: Counts, durations, success/failure rates
4. **Execution Metadata**: Activity types, action types, execution paths

### Hash Calculation

**Workflow Hash**:
```python
import hashlib
import json

def calculate_workflow_hash(workflow_definition: dict) -> str:
    """Calculate SHA-256 hash of workflow definition."""
    canonical_json = json.dumps(workflow_definition, sort_keys=True)
    return hashlib.sha256(canonical_json.encode()).hexdigest()
```

**Activity Hash**:
```python
def calculate_activity_hash(activity_definition: dict) -> str:
    """Calculate SHA-256 hash of activity definition."""
    canonical_json = json.dumps(activity_definition, sort_keys=True)
    return hashlib.sha256(canonical_json.encode()).hexdigest()
```

**Privacy Guarantee**: Hashes are one-way (cannot reverse to original workflow/activity definition).

---

## Event Correlation

### Correlation via correlation_id

All events for a single workflow execution share the same `correlation_id` (UUID v4).

### Installation-Level Tracking

All events include `entitlement_id` for installation-level analytics.

---

## Schema Evolution Strategy

### Version Management

**Schema Versions** (in `$id` URI):
```
v1.0.0 - Initial release (GA)
v1.0.1 - Added optional field (backward compatible)
v1.1.0 - Added required field with default (backward compatible)
v2.0.0 - Breaking change (requires migration)
```

**Event Payload Versioning**:
Schema version is tracked via the Nexus version in the `context.app.version` field:

```json
{
  "event": "Workflow Execution Completed",
  "properties": {
    ...
  },
  "context": {
    "app": {
      "name": "nexus",
      "version": "1.0.0"
    }
  }
}
```

### Backward Compatibility Rules

**Allowed Changes** (MINOR version bump):
1. Add optional field
2. Add required field with default value
3. Expand enum with new values
4. Relax validation (increase max length, remove pattern)

**Breaking Changes** (MAJOR version bump):
1. Remove field
2. Rename field
3. Change field type
4. Add required field without default
5. Restrict enum values

### Deprecation Process

1. **Announce**: Mark field as deprecated in schema description
2. **Parallel Support**: Support both old and new fields for 6 months
3. **Remove**: Remove deprecated field in next major version

---

## Implementation References

### Pydantic Models (Primary Contracts)

Events are represented as Pydantic models in `/src/nexus/telemetry/events/`, following the established Nexus convention for non-database DTOs and event payloads.

**These models are the source of truth** - JSON schemas are auto-generated from these definitions:

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkflowExecutionCompletedEvent(BaseModel):
    """Workflow execution completion telemetry event."""

    model_config = ConfigDict(frozen=True)

    entitlement_id: str
    correlation_id: str
    workflow_hash: str
    status: Literal["success", "failed", "timeout", "cancelled"]
    duration_ms: int = Field(ge=0)
    activity_count: int = Field(ge=0)
    error_count: int = Field(ge=0)
    workflow_depth: int | None = None
    error_type: Literal["ActivityExecutionError"] | None = None

    def to_segment_event(self) -> dict:
        """Convert to Segment Track API format.

        Note: Segment automatically adds timestamp when event is sent.
        All keys are always present for schema consistency (null values not excluded).
        """
        return {
            "userId": self.entitlement_id,
            "event": "Workflow Execution Completed",
            "properties": self.model_dump(),
        }
```

---

## Summary

**Entity Count**: 3 primary events + 1 embedded object
**Relationships**: Parent-child via `correlation_id`, aggregation from activities to workflow
**Privacy**: Hashing for anonymization, no PII/credentials
**Volume**: ~120k events/day (initial estimate), ~25-35 MB/day compressed
**Versioning**: Semantic versioning with backward compatibility guarantees
