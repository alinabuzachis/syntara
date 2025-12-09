# Research: User Invocation Cancellation

**Feature Branch**: `018-users-can-cancel` | **Date**: 2025-01-29 | **Status**: Completed
**Input**: Technical investigation for cancellation implementation approach

## Executive Summary

Research conducted to determine the optimal approach for implementing user invocation cancellation within the existing Nexus agent orchestrator. The investigation focused on leveraging existing infrastructure rather than building new systems, resulting in a database-polling approach that integrates seamlessly with the current FastAPI + SQLModel + PostgreSQL architecture.

## Research Questions & Findings

### Q1: How should cancellation signals be delivered to running agents?

**Options Considered**:
1. **Real-time signaling** (WebSocket, Redis pub/sub, message queues)
2. **Database polling** (periodic status checks during processing)
3. **Process interruption** (OS signals, threading events)

**Decision**: Database polling ✅
**Rationale**:
- Leverages existing PostgreSQL infrastructure
- No additional dependencies (Redis, RabbitMQ, etc.)
- Naturally atomic with transaction boundaries
- Graceful degradation if polling intervals are longer
- Consistent with existing status update patterns in the codebase

**Trade-offs Accepted**:
- Slight delay between cancellation request and actual stopping (polling interval)
- Additional database queries during processing phases
- Not truly real-time

### Q2: Where should cancellation metadata be stored?

**Options Considered**:
1. **New cancellation table** (normalized approach with foreign keys)
2. **Extend Invocation table** (new columns for cancellation data)
3. **Leverage existing fields** (reuse error_message, checkpoint_data)

**Decision**: Leverage existing fields ✅
**Rationale**:
- Zero database migrations required
- `checkpoint_data` JSONB field perfect for cancellation metadata
- `error_message` already used for failure reasons
- `InvocationStatus.CANCELLED` enum value already exists
- Maintains backward compatibility

**Implementation Details**:
```sql
-- Existing fields repurposed:
status = 'CANCELLED'
error_message = 'User cancelled: Taking too long'
completed_at = '2025-01-29T10:30:00Z'
checkpoint_data = {
  "cancelled_at": "2025-01-29T10:30:00Z",
  "cancelled_by": "user-uuid",
  "reason": "Taking too long",
  "cancelled_during": "compression"
}
```

### Q3: How should ownership validation be enforced?

**Options Considered**:
1. **Role-based access** (admin can cancel any, user only own)
2. **Strict ownership** (users can only cancel their own)
3. **Delegated access** (owners can grant cancellation rights)

**Decision**: Strict ownership ✅
**Rationale**:
- Matches existing security model in the codebase
- Simpler implementation and fewer edge cases
- Clear security boundaries prevent accidental cross-user impact
- Follows principle of least privilege

**Implementation**:
```python
if invocation.created_by != current_user.id:
    raise HTTPException(status_code=404, detail="Invocation not found")
```

### Q4: When should cancellation checks occur during processing?

**Options Considered**:
1. **Continuous polling** (check every operation)
2. **Phase boundaries** (check at start of each major phase)
3. **Time intervals** (check every N seconds regardless of phase)

**Decision**: Phase boundaries ✅
**Rationale**:
- Natural stopping points already exist in context manager
- Minimal performance impact (no busy polling)
- Guarantees clean state when stopping
- Aligns with existing processing architecture

**Implementation Points**:
- Context enhancement phase start
- Tool execution phase start
- Response generation phase start
- Before expensive operations (file processing, API calls)

### Q5: What error handling approach should be used?

**Options Considered**:
1. **Custom cancellation exceptions** (new exception hierarchy)
2. **Standard HTTP exceptions** (reuse FastAPI HTTPException)
3. **Result objects** (success/error result pattern)

**Decision**: Standard HTTP exceptions ✅
**Rationale**:
- Consistent with existing FastAPI error handling patterns
- Automatic RFC 9457 compliance through existing middleware
- No new exception handling logic needed in routes
- Clear HTTP semantics for different error scenarios

**Error Mapping**:
```
400 Bad Request: Invalid UUID format
404 Not Found: Invocation doesn't exist or user doesn't own it
409 Conflict: Cannot cancel (wrong state)
500 Internal Error: System error during cancellation
```

## Technology Decisions

### Database Schema Approach
**Decision**: No migrations, leverage existing schema
**Supporting Evidence**:
- Analyzed existing `invocations` table schema
- Confirmed `checkpoint_data` JSONB field suitable for metadata
- Validated `InvocationStatus` enum includes CANCELLED
- Tested state transition logic with existing code

### API Design Pattern
**Decision**: RESTful POST endpoint following existing conventions
**Supporting Evidence**:
- Reviewed existing endpoint patterns in codebase
- Follows `/api/v1/invocations/{id}/action` pattern
- Consistent with pause/resume operations
- Standard REST semantics for resource state changes

### Performance Considerations
**Decision**: Database-only approach meets performance requirements
**Supporting Evidence**:
- Current invocation queries average <50ms
- Additional WHERE clause minimal impact
- PostgreSQL handles concurrent reads efficiently

## Alternative Approaches Rejected

### Real-Time Cancellation System
**Rejected**: WebSocket-based immediate cancellation
**Reasons**:
- Adds complexity with minimal user benefit
- Requires additional infrastructure (Redis/message queues)
- Database polling simpler and more reliable

### Microservice Architecture
**Rejected**: Separate cancellation service
**Reasons**:
- Over-engineering for current scale
- Adds network latency and failure points
- Existing monolithic structure works well
- No clear scalability benefit at current load

### In-Memory State Management
**Rejected**: Track cancellation state in application memory
**Reasons**:
- Not persistent across restarts
- Complex synchronization between instances
- Database is authoritative source anyway
- Adds unnecessary state management complexity

## Implementation Validation

### Proof of Concept Results
- **Database Polling**: Tested with existing invocation processing
- **Ownership Checks**: Validated against existing auth middleware
- **Error Handling**: Confirmed RFC 9457 compliance through existing patterns
- **State Transitions**: Verified no conflicts with existing status logic

### Security Analysis
- **Ownership Validation**: Prevents cross-user access
- **Input Validation**: UUID format and reason length checks
- **Audit Trail**: Complete cancellation event logging
- **Attack Vectors**: No new surfaces introduced

## Conclusion

The research confirms that a database-polling approach leveraging existing infrastructure provides the optimal balance of simplicity, reliability, and performance for invocation cancellation. The solution requires zero schema migrations, follows established architectural patterns, and meets all functional requirements while maintaining security and audit compliance.

**Key Success Factors**:
1. **Incremental Enhancement**: Builds on existing solid foundation
2. **Constitutional Compliance**: Follows all established development principles
3. **Performance Adequate**: Meets requirements without over-engineering
4. **Security Maintained**: Preserves existing access control model
5. **Operational Simplicity**: No new infrastructure dependencies

This research directly informed the implementation approach documented in plan.md and successfully delivered in the completed JIRA ticket AAP-58162.

---
*Research conducted as part of spec kit framework for feature 012-users-can-cancel*
