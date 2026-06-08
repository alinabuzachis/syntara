# EDA Trigger Integration Guide

This guide explains how to trigger Nexus workflows from Event-Driven Ansible (EDA) webhook events.

## How It Works

Each EDA trigger node in Nexus gets its own unique webhook URL. When an EDA event occurs, it POSTs to that specific URL to trigger the workflow.

### Flow

```
EDA Rulebook → EDA Event → HTTP POST /api/v1/webhooks/eda/{webhook_path} → Nexus
                                                                            ↓
                                                   Find workflow with matching webhook_path
                                                                            ↓
                                                        Start the workflow execution
                                                                            ↓
                                                          Return execution ID
```

## Step 1: Create a Workflow with EDA Trigger

Create a workflow definition with an `eda_trigger` node:

```json
{
  "schema_version": "2.0.0",
  "triggers": [
    {
      "id": "github_webhook",
      "type": "eda_trigger",
      "config": {
        "webhook_path": "github-deployments"
      },
      "outputs": {
        "repo": "${result.payload.repository}",
        "branch": "${result.payload.branch}"
      }
    }
  ],
  "nodes": [
    {
      "id": "deploy",
      "type": "aap_job_template",
      "config": {
        "controller_url": "${secrets.aap_url}",
        "job_template_id": 123,
        "extra_vars": {
          "repository": "${github_webhook.repo}",
          "branch": "${github_webhook.branch}"
        }
      }
    }
  ],
  "edges": [
    {"from": "github_webhook", "to": "deploy"}
  ]
}
```

### Trigger Configuration Options

- **`webhook_path`** (required): A unique name or "slug" to identify this webhook endpoint (e.g., "jira-updates", "github-deployments"). Must be lowercase alphanumeric with hyphens/underscores only. This becomes part of the webhook URL: `/api/v1/webhooks/eda/{webhook_path}`

### Generated Webhook URL

After creating the workflow, the webhook URL will be:
```
https://your-nexus-instance.com/api/v1/webhooks/eda/{webhook_path}
```

For example, with `webhook_path: "github-deployments"`:
```
https://your-nexus-instance.com/api/v1/webhooks/eda/github-deployments
```

## Step 2: Configure EDA Rulebook to Call Nexus

In your EDA rulebook, configure an action to POST to your workflow's specific webhook URL:

```yaml
---
- name: Deployment Rules
  hosts: all
  sources:
    - name: github-webhook
      ansible.eda.webhook:
        port: 5000

  rules:
    - name: Deploy on merge to main
      condition: event.ref == "refs/heads/main" and event.action == "push"
      action:
        post:
          url: "https://nexus.example.com/api/v1/webhooks/eda/github-deployments"
          headers:
            Content-Type: "application/json"
          json:
            repository: "{{ event.repository.full_name }}"
            branch: "{{ event.ref | regex_replace('^refs/heads/', '') }}"
            commit_sha: "{{ event.after }}"
            author: "{{ event.pusher.name }}"
            timestamp: "{{ ansible_date_time.iso8601 }}"
```

The JSON payload can have any structure - Nexus will pass it through to your workflow as-is.

## Step 3: Send a Webhook Event

The EDA webhook endpoint is public (no authentication required), matching the general webhook endpoint pattern. EDA controllers POST directly to the webhook URL:

```bash
curl -X POST https://nexus.example.com/api/v1/webhooks/eda/github-deployments \
  -H "Content-Type: application/json" \
  -d '{
    "repository": "my-org/my-repo",
    "branch": "main",
    "commit_sha": "abc123"
  }'
```

Response (202 Accepted):

```json
{
  "execution_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Workflow execution started from EDA webhook 'github-deployments'"
}
```

## Webhook Payload Format

The webhook accepts any JSON structure. The entire payload will be available in your workflow under the `payload` field:

```json
{
  "any_field": "any_value",
  "nested": {
    "data": "works too"
  }
}
```

## Workflow Matching Logic

Each EDA trigger has a unique `webhook_path`. When a request comes in to `/api/v1/webhooks/eda/{webhook_path}`, Nexus:

1. Finds the active workflow with an `eda_trigger` node that has a matching `webhook_path`
2. Triggers that specific workflow with the webhook payload
3. Returns the execution ID

### Example

**Trigger Configuration:**
```json
{
  "id": "my_trigger",
  "type": "eda_trigger",
  "config": {
    "webhook_path": "jira-updates"
  }
}
```

**Webhook URL:**
```
POST https://nexus.example.com/api/v1/webhooks/eda/jira-updates
```

**Constraint:** Each `webhook_path` must be unique across all active workflows. You cannot have two workflows with the same `webhook_path`.

## Testing

Test the webhook endpoint directly:

```bash
# Create a workflow with EDA trigger first via POST /api/v1/workflows

# Then trigger it using the webhook_path from your trigger config
curl -X POST http://localhost:8000/api/v1/webhooks/eda/your-webhook-path \
  -H "Content-Type: application/json" \
  -d '{
    "test_key": "test_value",
    "another_field": 123
  }'
```

## Accessing Webhook Data in Workflow

The webhook payload is available in workflow expressions under the `payload` field:

- `${trigger_node_id.payload}` - Full webhook payload object (where `trigger_node_id` is the `id` from your trigger definition, e.g., `github_webhook`)
- `${github_webhook.payload.repository}` - Specific payload field
- `${github_webhook.payload.issue_key}` - Another example field
- `${github_webhook.payload.nested.value}` - Access nested fields

## Error Handling

- **No matching workflow**: Returns 404 Not Found
- **Temporal unavailable**: Returns 503 Service Unavailable
- **Workflow start failure**: Returns 500 Internal Server Error
- **Invalid webhook_path format**: Returns 422 Unprocessable Entity

## Monitoring

Check workflow execution status:

```bash
# Get execution details
curl -X GET http://localhost:8000/api/v1/executions/{execution_id}
```
