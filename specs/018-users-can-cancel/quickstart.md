# Quickstart: Invocation Cancellation

## Overview
Learn how to cancel running invocations in the Nexus system to stop unwanted or long-running requests.

## Prerequisites
- Nexus API access with valid authentication token
- At least one running invocation that you own
- HTTP client (curl, Postman, etc.) or Nexus SDK

## Quick Start Steps

### 1. Check Running Invocations
First, identify invocations that can be cancelled:

```bash
# List your invocations to find running ones
curl -X GET "https://nexus.example.com/api/v1/invocations" \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json"
```

Look for invocations with `"status": "running"` or `"status": "created"`.

### 2. Cancel an Invocation
Cancel a running invocation using its ID:

```bash
# Cancel with default reason
curl -X POST "https://nexus.example.com/api/v1/invocations/{invocation-id}/cancel" \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"reason": "User cancelled"}'
```

```bash
# Cancel with custom reason
curl -X POST "https://nexus.example.com/api/v1/invocations/{invocation-id}/cancel" \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Request taking too long"}'
```

### 3. Verify Cancellation
Check that the invocation was cancelled successfully:

```bash
# Get invocation status
curl -X GET "https://nexus.example.com/api/v1/invocations/{invocation-id}" \
  -H "Authorization: Bearer your-token-here"
```

Successful cancellation shows:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "cancelled",
  "error_message": "User cancelled: Request taking too long",
  "completed_at": "2025-01-29T10:30:15.123456Z"
}
```

## Response Examples

### Successful Cancellation
```json
{
  "success": true,
  "message": "Invocation 550e8400-e29b-41d4-a716-446655440000 cancelled successfully"
}
```

### Already Completed
```json
{
  "type": "https://nexus.example.com/errors/state-conflict",
  "title": "Operation Not Allowed",
  "status": 409,
  "detail": "Invocation 550e8400-e29b-41d4-a716-446655440000 cannot be cancelled (status: completed)"
}
```

### Not Found/No Access
```json
{
  "type": "https://nexus.example.com/errors/not-found",
  "title": "Resource Not Found",
  "status": 404,
  "detail": "Invocation 550e8400-e29b-41d4-a716-446655440000 not found"
}
```

## Common Use Cases

### Cancel Long-Running Requests
```bash
# When a request is taking longer than expected
curl -X POST "https://nexus.example.com/api/v1/invocations/{id}/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Taking longer than expected"}'
```

### Cancel Incorrect Requests
```bash
# When you realize you made a mistake in your request
curl -X POST "https://nexus.example.com/api/v1/invocations/{id}/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Incorrect parameters provided"}'
```

### Cancel Resource-Intensive Tasks
```bash
# When you need to free up system resources
curl -X POST "https://nexus.example.com/api/v1/invocations/{id}/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Freeing up resources for priority task"}'
```

## Important Notes

### Permissions
- You can only cancel your own invocations
- Admins cannot cancel other users' invocations (security boundary)

### Timing
- Very fast invocations may complete before cancellation takes effect

### Data Safety
- Cancelled invocations produce no partial results
- All data remains consistent after cancellation
- Audit trail preserved for compliance and debugging

### States
**Can Cancel**:
- `created` - Invocation queued but not yet started
- `running` - Invocation currently executing

**Cannot Cancel**:
- `completed` - Invocation finished successfully
- `failed` - Invocation finished with error
- `cancelled` - Already cancelled

## Troubleshooting

### 404 Not Found
- Check invocation ID format (must be valid UUID)
- Verify you own the invocation (cannot see others' invocations)
- Confirm invocation exists

### 409 Conflict
- Invocation may have completed while you were trying to cancel
- Check current status before retrying

### 400 Bad Request
- Verify invocation ID is properly formatted UUID
- Check request body JSON format
- Ensure reason length ≤500 characters

## SDK Examples

### Python SDK (hypothetical)
```python
from nexus_sdk import NexusClient

client = NexusClient(token="your-token")

# Cancel with default reason
response = client.invocations.cancel("550e8400-e29b-41d4-a716-446655440000")

# Cancel with custom reason
response = client.invocations.cancel(
    "550e8400-e29b-41d4-a716-446655440000",
    reason="Request taking too long"
)

print(f"Cancellation successful: {response.success}")
```

### JavaScript/Node.js (hypothetical)
```javascript
const { NexusClient } = require('nexus-sdk');

const client = new NexusClient({ token: 'your-token' });

// Cancel invocation
const response = await client.invocations.cancel(
  '550e8400-e29b-41d4-a716-446655440000',
  { reason: 'Request taking too long' }
);

console.log('Cancellation successful:', response.success);
```

## Testing Your Integration

### 1. Start a Long-Running Request
Create an invocation that will run long enough to cancel:
```bash
# Start a complex request
curl -X POST "https://nexus.example.com/api/v1/invocations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Analyze this large dataset...", "session_id": "test"}'
```

### 2. Cancel Quickly
```bash
# Cancel it while running
curl -X POST "https://nexus.example.com/api/v1/invocations/{id}/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Testing cancellation"}'
```

### 3. Verify Behavior
Check that the invocation shows `cancelled` status and includes your reason in the audit trail.
