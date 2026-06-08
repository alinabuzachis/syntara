# How EDA Triggers Are Activated

This document explains the complete flow of how Event-Driven Ansible (EDA) triggers activate workflows in Nexus.

## Overview

Unlike **manual triggers** which are activated by users calling `POST /api/v1/executions` with `workflow_id` and `input_data`, **EDA triggers** are activated automatically when external events arrive from Event-Driven Ansible systems via dedicated webhook URLs.

Each EDA trigger gets its own unique webhook URL based on the `webhook_path` configured in the trigger. This provides a simple one-to-one mapping between webhook endpoints and workflows.

## Activation Flow

```
┌─────────────────┐
│                 │
│  EDA Rulebook   │  ← Event occurs (GitHub push, JIRA update, etc.)
│                 │
└────────┬────────┘
         │
         │ HTTP POST
         ↓
┌─────────────────────────────────────────────────────────┐
│  POST /api/v1/webhooks/eda/{webhook_path}                │
│  {                                                      │
│    "issue_key": "PROJ-123",                            │
│    "status": "Done",                                   │
│    "any_field": "any_value"                            │
│  }                                                     │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│  WebhookTriggerService.get_by_webhook_path()            │
│                                                         │
│  1. Look up trigger in webhook_triggers table           │
│     (indexed by trigger_type + webhook_path)            │
│  2. Wrap payload in trigger input structure             │
│  3. Call ExecutionService.create_execution()            │
│     - Pass trigger_node_id for precise targeting        │
│     - Pass wrapped payload as input_data                │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│  ExecutionService.create_execution()                    │
│                                                         │
│  1. Load workflow definition                            │
│  2. Start Temporal workflow with payload                │
│  3. Create execution record in database                 │
└────────┬────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────┐
│  Temporal: NexusWorkflow.run()                          │
│                                                         │
│  1. Find trigger node (eda_trigger) by trigger_node_id  │
│  2. Execute eda_trigger activity with payload           │
│  3. Continue executing rest of workflow                 │
└─────────────────────────────────────────────────────────┘
```

## Implementation Components

### 1. Webhook Router (`src/nexus/workflows/webhook_router.py`)

**Endpoint**: `POST /api/v1/webhooks/eda/{webhook_path}`

**Purpose**: Receives incoming EDA events via unique webhook paths and initiates workflow triggering

**Key Files**:
- Router: `src/nexus/workflows/webhook_router.py`
- Service: `src/nexus/workflows/services/webhook_trigger_service.py`

**Request Format**:
The endpoint accepts any JSON payload structure:
```json
{
  "any_field": "any_value",
  "issue_key": "PROJ-123",
  "status": "Done",
  "nested": {
    "data": "also works"
  }
}
```

**Response Format** (202 Accepted):
```json
{
  "execution_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Workflow execution started from EDA webhook 'github-deployments'"
}
```

**Features**:
- **No Authentication**: Public endpoint (same as general webhook endpoint)
- **Payload Size Check**: Rejects payloads exceeding 1MB via Content-Length header
- **Webhook Path Validation**: Only lowercase alphanumeric, hyphens, and underscores allowed

### 2. Webhook Trigger Lookup (`src/nexus/workflows/services/webhook_trigger_service.py`)

**Method**: `get_by_webhook_path(webhook_path, trigger_type="eda_trigger")`

**Purpose**: Look up the EDA trigger by webhook path using the indexed `webhook_triggers` table

**Lookup**: The `webhook_triggers` table stores a row for each trigger node with a `webhook_path`. The composite unique index on `(trigger_type, webhook_path)` provides O(1) lookup. Rows are auto-synced from workflow definitions when workflows are created, updated, or deleted.

**Example**:

Given this trigger configuration:
```json
{
  "id": "jira_webhook",
  "type": "eda_trigger",
  "config": {
    "webhook_path": "jira-updates"
  }
}
```

When a request arrives at `POST /api/v1/webhooks/eda/jira-updates`:
- The `webhook_triggers` table is queried for `trigger_type="eda_trigger"` and `webhook_path="jira-updates"`
- The matching row provides `workflow_id` and `trigger_node_id`
- If no row matches, a 404 is returned

### 3. EDA Trigger Activity (`src/nexus/workflows/workflow_engine/activities/eda_trigger.py`)

**Activity**: `@activity.defn(name="eda_trigger")`

**Purpose**: Temporal activity that receives the webhook payload and makes it available to the workflow

**Input**: Wrapped payload structure:
```python
{
    "payload": {  # The actual webhook payload
        "any_field": "any_value",
        ...
    }
}
```

**Output**: Payload with completion status:
```python
{
    "payload": {...},  # Original payload
    "status": "completed"
}
```

The activity is executed automatically by Temporal when the workflow starts. The payload is then accessible in workflow expressions via `${trigger_id.payload.field_name}`.

### 4. Workflow Engine (`src/nexus/workflows/workflow_engine/dynamic_workflow.py`)

**Method**: `_execute_trigger()`

**Change Made**: Fixed hardcoded "manual_trigger" to use dynamic `trigger_node.type`

```python
# Before (only worked with manual_trigger):
trigger_result = await workflow.execute_activity(
    "manual_trigger",  # ❌ Hardcoded!
    args=[trigger_inputs, trigger_node.outputs],
    ...
)

# After (works with any trigger type):
trigger_result = await workflow.execute_activity(
    trigger_node.type,  # ✅ Dynamic! (eda_trigger, manual_trigger, future triggers)
    args=[trigger_inputs, trigger_node.outputs],
    ...
)
```

For end-to-end examples (creating workflows, configuring EDA rulebooks, sending
test requests), see the [EDA Trigger Integration Guide](eda-trigger-integration.md).

## Comparison: Manual vs EDA Triggers

| Aspect | Manual Trigger | EDA Trigger |
|--------|----------------|-------------|
| **Activation** | User calls `POST /executions` with `workflow_id` | EDA system calls `POST /webhooks/eda/{webhook_path}` |
| **Target** | Specific workflow by ID | Specific workflow by unique webhook path |
| **Input** | User-provided `input_data` | Webhook payload from EDA |
| **Use Case** | On-demand execution | Event-driven automation |
| **Endpoint** | `/api/v1/executions` | `/api/v1/webhooks/eda/{webhook_path}` |
| **Mapping** | One workflow per request | One-to-one: webhook path → workflow |

## Router Auto-Discovery

The EDA webhook endpoint is part of `webhook_router.py`, which is automatically discovered and registered because:

1. It's located at `src/nexus/workflows/webhook_router.py`
2. It matches the pattern `*/*router.py` used by router discovery
3. It exports a `router` variable

The EDA endpoint is registered as `/eda/{webhook_path}` under the `/webhooks` prefix, alongside the general-purpose webhook endpoint.

## See Also

- [EDA Trigger Integration Guide](eda-trigger-integration.md) — user-facing guide for configuring EDA triggers and rulebooks
