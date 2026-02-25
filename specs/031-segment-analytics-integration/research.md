# Research: Segment Analytics Integration

**Feature**: 031-segment-analytics-integration
**Date**: 2026-02-12
**Purpose**: Document research findings and design decisions

---

## 1. Source Document Analysis

### ANSTRAT-1748: Instrumentation / Telemetry / Observability

**Key Requirements from SDP**:
- Anonymized usage metrics for product improvement
- Workflow statistics (creation, modification, execution)
- Model inference usage tracking
- Feature flag usage monitoring
- No PII collection

**Instrumentation Categories**:
1. Workflow Creation/Modification - aggregate counts
2. Trigger Events - counts by type
3. Step Execution - activity type counts
4. Model Inference - calls and token counts by model
5. API Call metrics - aggregate counts
6. Resource Utilization - **deferred to separate SDP**
7. Error Logging - aggregate error counts
8. Feature Flag Usage - enabled flags list
9. Audit Trail - not applicable (no user tracking)

---

## 2. Analytics Platform Selection

### Segment.com

**Decision**: Use Segment.com as the analytics platform.

**Reasons**:
- Already specified in SDP ANSTRAT-1748
- Enterprise-grade with higher rate limits (dedicated account)
- Official Python SDK (`segment-analytics-python`)
- Fire-and-forget pattern with local buffering
- No local persistence required (SDK handles)
- GDPR/privacy compliant infrastructure

**SDK Features**:
```python
import analytics

# Initialize with write key
analytics.write_key = "YOUR_WRITE_KEY"

# Track event (non-blocking, buffered)
analytics.track(
    user_id="installation-123",
    event="system_analytics",
    properties={"workflows": {"total": 10}}
)

# Flush on shutdown
analytics.flush()
```

**Rate Limits** (Dedicated Account):
- 32KB max per event
- 500KB max per batch
- Automatic batching by SDK

---

## 3. Data Collection Approach

### Considered Approaches

| Approach | Description | Pros | Cons | Decision |
|----------|-------------|------|------|----------|
| **Per-request instrumentation** | Hook into every API call | Real-time data | High overhead, complex | Not for this spec |
| **Periodic DB aggregation** | Query DB at intervals | Low overhead, simple | Slight data lag | Chosen |
| **Event sourcing** | Emit events, aggregate later | Flexible | Complex infrastructure | Overkill |
| **Database triggers** | DB-level hooks | No app changes | Hard to maintain | Too fragile |

### Chosen: Periodic Database Aggregation

**Why**:
- Nexus already has all data in PostgreSQL
- Single background task, minimal code changes
- No instrumentation of existing services
- Easy to understand and maintain
- Fixed interval (5 minutes)

**Trade-offs**:
- Data is aggregated, not real-time events
- Cannot track individual user journeys (but we don't want to)
- Relies on existing database schema

---

## 4. Identifier Strategy

### Considered Approaches

| Approach | Privacy | Uniqueness | Persistence | Decision |
|----------|---------|------------|-------------|----------|
| User ID | PII | Yes | Yes | Violates privacy |
| Session ID | Safe | Yes | No | Too transient |
| IP Hash | Risky | Maybe | Maybe | Unreliable |
| **Entitlement ID** | Safe | Yes | Yes | **Chosen** |

### Chosen: EntitlementId

**What it is**:
- UUID generated once per installation
- Persisted to database (survives Pod restarts)
- Used as Segment `userId`

**Why**:
- No PII - just a random identifier
- Persists across restarts (DB-backed)
- Unique per installation
- Cannot be traced back to users

**Implementation**:
```python
class EntitlementId(SQLModel, table=True):
    id: str = Field(
        primary_key=True,
        default_factory=lambda: f"entitlement-{uuid.uuid4().hex[:12]}"
    )

    @classmethod
    def load_or_create(cls, session: Session) -> "EntitlementId":
        existing = session.exec(select(cls)).first()
        if existing:
            return existing
        entitlement = cls()
        session.add(entitlement)
        session.commit()
        return entitlement
```

---

## 5. Segment Write Key Configuration

The Segment write key and analytics configuration (enabled/disabled, collection interval) are managed externally via `AnalyticsSettings`. This spec's analytics module consumes these settings at runtime.

---

## 6. Performance Impact Analysis

### Background Task Overhead

**Collection cycle** (every 5 minutes):
1. Wake up from sleep (~0ms)
2. Execute 5 SQL queries (~50-100ms total)
3. Build event object (~1ms)
4. Enqueue to Segment SDK (~1ms)
5. Return to sleep

**Total**: ~100ms every 5 minutes = 0.03% CPU utilization

### Database Query Impact

**Queries are**:
- Read-only (no locks)
- Use existing indexes
- Run outside request path
- Rely on database-level statement timeouts

**Mitigation**:
- Database-level statement timeout handles runaway queries
- Failures logged but don't crash app

### Network Impact

**Per event**: ~1-2KB JSON
**Per hour**: ~24KB (at 5-minute intervals)
**Per day**: ~576KB

Negligible network overhead.

---

## 7. Privacy Analysis

### Data Classification

| Category | Classification | Notes |
|----------|---------------|-------|
| Workflow counts | Safe | Aggregate only |
| Credential counts | Safe | Count only, no values |
| Execution counts | Safe | Aggregate only |
| Model usage | Safe | Counts and tokens only |
| Feature flags | Safe | Flag names only |
| EntitlementId | Safe | Random UUID |

### Explicitly NOT Collected

- User names, emails, identifiers
- Workflow definitions or content
- Prompt content or LLM responses
- Credential values or secrets
- IP addresses
- Individual execution details

### GDPR Compliance

- No personal data collected
- No tracking across installations
- No user identification possible
- Data aggregated at collection time

---

## 8. Error Handling Strategy

### Design Principle: Fire-and-Forget

Analytics should never impact the main application:

```python
async def _collect_and_send(self) -> None:
    try:
        # ... collection logic ...
        self._client.track(event)
    except Exception as error:
        logger.warning("analytics_collection_failed", error=str(error))
```

### Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| DB query failure | Skip this cycle | Auto-retry next cycle |
| Segment SDK error | Event lost | SDK retries internally |
| Network unavailable | Events buffered | SDK flushes when available |
| Invalid data | Event rejected | Log and continue |

---

## 9. Future Considerations

### Out of Scope for This Spec

1. **Real-time events** - Separate SDPs for:
   - Workflow runtime events (start/end/activity execution)
   - Authentication events
   - API call events

2. **Container resource metrics** - Separate SDP:
   - Different collection mechanism
   - May use systemd-run or other approaches

3. **Air-gapped environments**:
   - May need local aggregation endpoint
   - Deferred to future iteration

4. **User opt-out**:
   - May be required for enterprise customers
   - Can be added via `ANALYTICS_ENABLED=false`

### Potential Enhancements

- Database triggers for real-time counts (if needed)
- Materialized views for complex aggregates
- Custom Segment destination for internal analytics
- A/B test tracking integration

---

## 10. References

- [ANSTRAT-1748](ANSTRAT-1748) - Source SDP
- [Segment Python SDK](https://segment.com/docs/connections/sources/catalog/libraries/server/python/)
- [Segment Track Spec](https://segment.com/docs/connections/spec/track/)
