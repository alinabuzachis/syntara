# Quickstart: Workflow Definition

**Feature**: 036-workflow-definition-v2
**Date**: 2026-03-12
**Phase**: 1 - Design & Contracts

## Overview

This guide helps you create and execute your first workflow. Nexus workflows use graph-based definitions with explicit nodes and edges.

## Prerequisites

- Nexus API access with valid Bearer token
- PostgreSQL database configured
- Workflow execution engine configured (currently Temporal)
- Familiarity with workflow concepts (nodes, edges, DAGs)

## Quick Start (5 Minutes)

### Step 1: Create a Simple Sequential Workflow

Create a workflow that performs two steps sequentially:

```bash
curl -X POST https://api.nexus.redhat.com/api/v1/workflows/workflows \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My First Workflow",
    "description": "Deploy application with health check",
    "workflow_definition": {
      "schema_version": "2.0.0",
      "name": "first-workflow",
      "description": "Deploy application with health check",
      "triggers": [
        {
          "id": "start",
          "type": "manual",
          "config": {
            "input_schema": {
              "type": "object",
              "properties": {
                "app_name": {"type": "string"}
              },
              "required": ["app_name"]
            }
          }
        }
      ],
      "nodes": [
        {
          "id": "health_check",
          "name": "Check API Health",
          "type": "http_request",
          "config": {
            "method": "GET",
            "url": "https://api.example.com/health"
          },
          "outputs": {
            "is_healthy": "${result.body.status}"
          }
        },
        {
          "id": "deploy",
          "name": "Deploy Application",
          "type": "aap_job_template",
          "config": {
            "job_template_name": "Deploy App",
            "organization_name": "Default",
            "extra_vars": {
              "app": "${start.app_name}",
              "health_status": "${health_check.is_healthy}"
            }
          }
        }
      ],
      "edges": [
        {"from": "start", "to": "health_check"},
        {"from": "health_check", "to": "deploy"}
      ]
    },
    "is_enabled": true
  }'
```

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "My First Workflow",
  "schema_version": "2.0.0",
  "is_enabled": true,
  "created_at": "2026-03-12T10:00:00Z"
}
```

### Step 2: Trigger the Workflow

Execute the workflow with manual trigger input:

```bash
curl -X POST https://api.nexus.redhat.com/api/v1/workflows/workflows/550e8400-e29b-41d4-a716-446655440000/executions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_type": "manual",
    "trigger_data": {
      "app_name": "my-awesome-app"
    }
  }'
```

**Response**:
```json
{
  "id": "exec-12345",
  "workflow_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "trigger_type": "manual",
  "started_at": "2026-03-12T10:05:00Z",
  "engine_execution_id": "workflow-exec-12345"
}
```

### Step 3: Check Execution Status

Monitor workflow execution progress:

```bash
curl -X GET https://api.nexus.redhat.com/api/v1/workflows/executions/exec-12345 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response**:
```json
{
  "id": "exec-12345",
  "status": "COMPLETED",
  "node_executions": {
    "start": {
      "status": "completed",
      "outputs": {
        "app_name": "my-awesome-app"
      }
    },
    "health_check": {
      "status": "completed",
      "outputs": {
        "is_healthy": "OK"
      }
    },
    "deploy": {
      "status": "completed",
      "outputs": {
        "job_id": 12345,
        "status": "successful"
      }
    }
  },
  "completed_at": "2026-03-12T10:07:00Z"
}
```

## Core Concepts

### Workflow Structure

V2 workflows have four main components:

1. **schema_version**: Always "2.0.0" for v2 workflows
2. **metadata**: Workflow-level configuration (name, timeout, tags)
3. **nodes**: Array of workflow steps (triggers, executors, control flow)
4. **edges**: Array of connections defining execution order

### Node Types (V1 Parity)

**Triggers** (workflow entry points):
- `manual`: User-initiated execution with input form

**Executors** (work performers):
- `aap_job_template`: Launch Ansible Automation Platform job templates
- `http_request`: Make HTTP API calls
- `agentic`: Execute AI agent tasks
- `script`: Run scripts (Python, Bash, etc.)

**Control Flow** (execution patterns):
- `condition`: Binary branching (if/else)
- `loop`: Iteration (forEach, while)
- `parallel`: Concurrent execution
- `converge`: Synchronize parallel branches

### Variable Passing

Use template expressions `${...}` to pass data between nodes:

- **Node outputs**: `${node_id.field}`
- **Trigger data**: `${trigger.field}` or `${node_id.field}` for specific trigger
- **Secrets**: `${secret.key_name}` (config only, not outputs)
- **Context**: `${workflow_context.execution_id}`
- **Loop**: `${loop.item}`, `${loop.index}` (within loop body)

**Example**:
```json
{
  "id": "deploy",
  "type": "aap_job_template",
  "config": {
    "extra_vars": {
      "version": "${start.version}",
      "api_token": "${secret.deployment_token}"
    }
  }
}
```

### Selective Outputs

Control which node result fields are accessible to downstream nodes:

```json
{
  "id": "fetch_user",
  "type": "http_request",
  "config": {
    "method": "GET",
    "url": "https://api.example.com/users/123"
  },
  "outputs": {
    "user_name": "${result.body.name}",
    "user_email": "${result.body.email}"
  }
}
```

Downstream nodes can only access `fetch_user.user_name` and `fetch_user.user_email` (plus `status` and `error`). Sensitive fields like `result.body.ssn` are hidden.

## Common Patterns

### Pattern 1: Conditional Execution

Deploy to different environments based on condition:

```json
{
  "nodes": [
    {"id": "start", "type": "manual", "config": {...}},
    {
      "id": "check_env",
      "name": "Check Environment",
      "type": "condition",
      "config": {
        "condition": "${start.environment == 'production'}"
      }
    },
    {"id": "prod_deploy", "type": "aap_job_template", "config": {...}},
    {"id": "nonprod_deploy", "type": "aap_job_template", "config": {...}}
  ],
  "edges": [
    {"from": "start", "to": "check_env"},
    {"from": "check_env", "to": "prod_deploy", "when": true},
    {"from": "check_env", "to": "nonprod_deploy", "when": false}
  ]
}
```

### Pattern 2: Parallel Execution with Converge

Deploy frontend and backend concurrently:

```json
{
  "nodes": [
    {"id": "start", "type": "manual", "config": {...}},
    {
      "id": "parallel_1",
      "type": "parallel",
      "config": {"on_error": "continue"}
    },
    {"id": "deploy_frontend", "type": "aap_job_template", "config": {...}},
    {"id": "deploy_backend", "type": "aap_job_template", "config": {...}},
    {
      "id": "converge_1",
      "type": "converge",
      "config": {
        "strategy": "all",
        "on_error": "stop"
      }
    },
    {"id": "run_tests", "type": "aap_job_template", "config": {...}}
  ],
  "edges": [
    {"from": "start", "to": "parallel_1"},
    {"from": "parallel_1", "to": "deploy_frontend", "branch": "parallel"},
    {"from": "parallel_1", "to": "deploy_backend", "branch": "parallel"},
    {"from": "deploy_frontend", "to": "converge_1"},
    {"from": "deploy_backend", "to": "converge_1"},
    {"from": "converge_1", "to": "run_tests"}
  ]
}
```

### Pattern 3: Loop Iteration

Patch multiple servers:

```json
{
  "nodes": [
    {"id": "start", "type": "manual", "config": {...}},
    {
      "id": "process_servers",
      "type": "loop",
      "config": {
        "type": "forEach",
        "items": "${start.server_list}"
      }
    },
    {
      "id": "patch_server",
      "type": "aap_job_template",
      "config": {
        "extra_vars": {
          "server": "${loop.item}",
          "index": "${loop.index}"
        }
      }
    },
    {"id": "send_summary", "type": "http_request", "config": {...}}
  ],
  "edges": [
    {"from": "start", "to": "process_servers"},
    {"from": "process_servers", "to": "patch_server", "branch": "iterate"},
    {"from": "process_servers", "to": "send_summary", "branch": "complete"}
  ]
}
```

## Validation

### Pre-Flight Validation

Validate workflow without saving:

```bash
curl -X POST https://api.nexus.redhat.com/api/v1/workflows/workflows/validate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_definition": {
      "schema_version": "2.0.0",
      "metadata": {"name": "test"},
      "nodes": [...],
      "edges": [...]
    }
  }'
```

**Success Response**:
```json
{
  "valid": true,
  "message": "Workflow definition valid"
}
```

**Failure Response** (400):
```json
{
  "type": "/errors/validation-failed",
  "title": "Workflow Validation Failed",
  "status": 400,
  "detail": "Workflow definition contains 2 validation errors",
  "errors": [
    {
      "field": "edges[3]",
      "message": "Edge references non-existent node 'missing_node'",
      "rule": "FR-006"
    },
    {
      "field": "workflow",
      "message": "Circular reference detected: node1 → node2 → node1",
      "rule": "FR-012a"
    }
  ]
}
```

### Validation Rules

The system enforces 30+ validation rules including:

- **JSON Schema compliance**: All fields match type/format requirements
- **Node ID uniqueness**: No duplicate node IDs
- **Reserved namespaces**: Node IDs can't be trigger, loop, result, secret, workflow_context, env
- **Edge references**: All edges reference existing nodes
- **Trigger constraints**: Trigger nodes have no incoming edges, at least one trigger exists
- **DAG structural**: No cycles (after removing display_only edges), no orphaned/unreachable nodes
- **Parallel-converge**: Parallel branches must connect to converge node
- **Loop structure**: Loop nodes have exactly one iterate branch, zero or one complete branch
- **Secret safety**: Secrets not referenced in outputs definitions

## Troubleshooting

### Common Errors

**Error**: "Node ID 'trigger' conflicts with reserved namespace"
- **Cause**: Node ID uses reserved name
- **Fix**: Rename node to avoid: trigger, loop, result, secret, workflow_context, env

**Error**: "Circular reference detected: node1 → node2 → node1"
- **Cause**: Edges form a cycle
- **Fix**: Remove or redirect edges to break the cycle

**Error**: "Edge references non-existent node 'xyz'"
- **Cause**: Edge from/to references missing node
- **Fix**: Ensure all edge node IDs match actual node IDs (check spelling)

**Error**: "Template expression undefined: ${missing.field}"
- **Cause**: Referenced node hasn't executed or field doesn't exist
- **Fix**: Check execution order (edges) and node outputs definition

### Debugging Workflow Executions

1. **Review node_executions** in execution detail response
2. **Check execution engine** using engine_execution_id (currently Temporal workflow ID)
3. **Verify template resolution** by inspecting node outputs
4. **Test nodes individually** before combining in complex workflows

## Next Steps

- **Learn advanced patterns**: See [proposal appendix](pull/1220) for full validation rules
- **Visual workflow builder**: Use UI for drag-and-drop workflow creation
- **Workflow patterns**: See [research.md](research.md) for structural patterns (sequential, parallel, conditional, loop)

## Schema Version Requirements

All workflows must use schema_version "2.0.0".

- All workflows must use `"schema_version": "2.0.0"`
- Workflows with other schema versions are rejected during validation

**Example Error** (if schema_version is wrong):
```json
{
  "type": "/errors/validation-failed",
  "title": "Workflow Validation Failed",
  "status": 400,
  "detail": "Unsupported schema version: 1.0.0. Only version 2.0.0 is supported.",
  "errors": [
    {
      "field": "schema_version",
      "message": "Schema version must be '2.0.0'",
      "rule": "FR-001"
    }
  ]
}
```

## Support

- **Documentation**: [Feature spec](spec.md), [Implementation plan](plan.md)
- **Data Models**: [Database and runtime models](data-model.md)
- **Issues**: GitHub issues or Jira epic AAP-67063

**Note**: Workflow API endpoints unchanged - existing `/api/v1/workflows` API used with graph-based `workflow_definition` content.
