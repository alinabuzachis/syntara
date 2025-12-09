# Data Model: User Invocation Cancellation

## Overview
The cancellation feature leverages existing data structures with minimal additions. No new database migrations are required as we utilize existing fields creatively.

## Primary Entity: Invocation (Existing)

**Source**: `src/nexus/agent_orchestrator/models/invocation.py`

### Fields Used for Cancellation
- **status**: `InvocationStatus.CANCELLED` (existing enum value)
- **error_message**: Stores cancellation reason (existing TEXT field)
- **completed_at**: Timestamp when cancellation occurred (existing field)
- **checkpoint_data**: JSONB field storing cancellation metadata (existing field)

### Cancellation Metadata Structure
Stored in `checkpoint_data` JSONB field:
```json
{
  "cancelled_at": "2025-01-29T10:30:00Z",
  "cancelled_by": "user-uuid",
  "reason": "User cancelled: Taking too long",
  "cancelled_during": "compression"
}
```

## New Request/Response Models

### InvocationCancelRequest
**Source**: `src/nexus/agent_orchestrator/models/request.py`

```python
class InvocationCancelRequest(SQLModel):
    reason: str = Field(
        default="User cancelled",
        max_length=500,
        description="Optional reason for cancellation"
    )
```

### InvocationCancelResponse
**Source**: `src/nexus/agent_orchestrator/models/request.py`

```python
class InvocationCancelResponse(SQLModel):
    success: bool = Field(
        description="True if cancellation successful, False otherwise"
    )
    message: str = Field(
        description="Human-readable cancellation result message"
    )
```

## State Transitions

### Cancellable States
- `CREATED` → `CANCELLED` ✅
- `RUNNING` → `CANCELLED` ✅

### Non-Cancellable States
- `COMPLETED` → `CANCELLED` ❌ (already finished)
- `FAILED` → `CANCELLED` ❌ (already finished)
- `CANCELLED` → `CANCELLED` ❌ (already cancelled)

## Validation Rules

### Authorization
- Only invocation owner can cancel (`invocation.created_by == current_user.id`)
- Admins cannot cancel other users' invocations (not in scope)

### State Validation
- Invocation must exist in database
- Invocation must be in cancellable state (CREATED or RUNNING)
- Cancellation reason must be ≤500 characters

### Timing Constraints
- Audit trail must be recorded atomically

## Data Integrity

### Atomicity
- Status update and metadata storage happen in single transaction
- No partial cancellation states possible
- Rollback on any failure during cancellation

### Audit Trail
- All cancellation events logged with full context
- Timestamp precision to milliseconds
- User identification preserved
- Processing phase recorded for debugging

### Clean Termination
- No partial results stored on cancellation
- In-progress computations discarded safely
- No orphaned resources or processes
- Uploaded files cleaned up automatically (original files + converted files)
- Background document conversion tasks continue but output is discarded
- Best-effort file cleanup that doesn't prevent successful cancellation
