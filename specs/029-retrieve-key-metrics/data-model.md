# Data Model: Script Task Execution Metrics

**Feature**: Script Task Execution Metrics Retrieval
**Date**: 2026-02-13 (Updated)
**Branch**: 029-retrieve-key-metrics

## Overview

This document defines the data model for storing resource consumption metrics from script task executions. The model extends the existing ActivityExecution entity with a new JSONB field for metrics storage, maintaining backward compatibility with existing consumers.

**Data Source**: `systemd-run --wait` stderr output (not `systemctl show`)

---

## Entity: ScriptMetrics (Embedded in ActivityExecution)

**Description**: Metrics collected from `systemd-run --wait` stderr output after script task execution. Property names use systemd D-Bus property naming conventions for consistency across the codebase.

**Storage Strategy**: Embedded as JSONB within ActivityExecution.metrics field (not a separate table).

**Schema Structure** (flattened, using systemd property names):

```json
{
  "DurationMs": number | null,
  "CPUUsageNSec": number | null,
  "MemoryPeak": number | null,
  "MemoryCurrent": number | null,
  "IPIngressBytes": number | null,
  "IPEgressBytes": number | null,
  "IOReadBytes": number | null,
  "IOWriteBytes": number | null
}
```

**Property Descriptions** (systemd property name → stderr source):
- **DurationMs**: Total service runtime in milliseconds (from "Service runtime: 182ms")
- **CPUUsageNSec**: Total CPU time consumed in nanoseconds (from "CPU time consumed: 11ms" × 1,000,000)
- **MemoryPeak**: Peak memory usage in bytes (from "Memory peak: 2.1M")
- **MemoryCurrent**: Current memory usage in bytes (approximate, same as peak from stderr)
- **IPIngressBytes**: Network bytes received (from "IP Traffic: received 1.1K")
- **IPEgressBytes**: Network bytes sent (from "IP Traffic: sent 441B")
- **IOReadBytes**: Disk bytes read (from "IO Bytes: read 600K")
- **IOWriteBytes**: Disk bytes written (from "IO Bytes: write 50K")

**All fields are nullable**. Fields are omitted if not present in stderr output:
- IP Traffic line missing → IPIngressBytes, IPEgressBytes omitted
- IO Bytes line missing → IOReadBytes, IOWriteBytes omitted
- IO Bytes with only "read" → IOWriteBytes omitted

**Empty object `{}`** indicates no metrics were collected (systemd-run unavailable, collection error, or skipped activity).

**Additional metrics available via D-Bus** (not in stderr, requires pystemd):
- `IPIngressPackets`, `IPEgressPackets` (packet counts)
- `IOReadOperations`, `IOWriteOperations` (operation counts)

**Naming Rationale**: Using systemd D-Bus property names (`CPUUsageNSec`, `MemoryPeak`, `IPIngressBytes`) instead of stderr-derived names (`CPUTimeConsumedMs`, `MemoryPeakBytes`, `IPTrafficReceivedBytes`) ensures consistency with systemd documentation and enables seamless transition to D-Bus collection if needed.

---

## Systemd Stderr Output Format

**Example 1: CPU/Memory script**
```
Running as unit: test-unit-1771031190.service
          Finished with result: success
Main processes terminated with: code=exited, status=0/SUCCESS
               Service runtime: 9ms
             CPU time consumed: 4ms
                   Memory peak: 1.2M (swap: 0B)
```

**Example 2: Network I/O script (curl)**
```
Running as unit: test-unit-1771033224.service; invocation ID: c922798ef8594f9c88c65b9ed333ded9
          Finished with result: success
Main processes terminated with: code=exited, status=0/SUCCESS
               Service runtime: 182ms
             CPU time consumed: 11ms
                   Memory peak: 2.1M (swap: 0B)
                    IP Traffic: received 1.1K, sent 441B
                      IO Bytes: read 600K
```

**Example 3: Disk I/O script (dd)**
```
Running as unit: test-unit-1771034567.service
          Finished with result: success
Main processes terminated with: code=exited, status=0/SUCCESS
               Service runtime: 523ms
             CPU time consumed: 15ms
                   Memory peak: 1.8M (swap: 0B)
                      IO Bytes: read 1.0K, write 50M
```

**Parsing Strategy**:
- Extract "Service runtime: (\d+)ms" → `DurationMs`
- Extract "CPU time consumed: (\d+)ms" → `CPUUsageNSec` (multiply by 1,000,000)
- Extract "Memory peak: ([\d.]+)([KMGT]?)" → `MemoryPeak`, `MemoryCurrent` (bytes)
- Extract "IP Traffic: received ([\d.]+)([KMGT]?), sent ([\d.]+)([KMGT]?)" → `IPIngressBytes`, `IPEgressBytes`
- Extract "IO Bytes: read ([\d.]+)([KMGT]?)(?:, write ([\d.]+)([KMGT]?))?" → `IOReadBytes`, `IOWriteBytes` (write optional)

---

## Entity: ActivityExecution (Modified)

**Description**: Existing SQLModel entity representing a single execution instance of a workflow activity. This feature extends it with a new field for systemd properties.

**Table**: `activity_execution`

**Modifications**:

### New Field

```python
metrics: ScriptMetrics = Field(
    default_factory=ScriptMetrics,
    sa_column=Column(JSONB),
    description="Metrics from systemd-run --wait stderr (DurationMs, CPUUsageNSec, MemoryPeak, etc.)"
)
```

**Constraints**:
- **Type**: JSONB (PostgreSQL native JSON storage with indexing support)
- **Default**: Empty dict `{}` (indicates no properties collected)
- **Not Nullable**: Field always exists, but may be empty object

### Existing Fields (Reference Only)

For context, these existing fields work with the new systemd properties:

| Field | Type | Description | Relationship to metrics |
|-------|------|-------------|-----------------------------------|
| `started_at` | datetime \| None | Task start timestamp | Independent timing (ActivityExecution level) |
| `completed_at` | datetime \| None | Task completion timestamp | Independent timing (ActivityExecution level) |
| `output_data` | dict \| None (JSONB) | Script output (stdout, stderr, return_code) | Separate from metrics |
| `status` | ActivityStatus enum | Task status (completed, failed, etc.) | Properties only collected for executed activities |
| `activity_name` | str | Activity type identifier | Used to identify script activities |
| `error_details` | str \| None | Error message if failed | Separate from systemd properties (task-level errors vs collection errors) |

**Backward Compatibility**:
- Existing queries not accessing `metrics` remain unaffected
- Migration adds column with default empty dict `{}`
- API responses include `metrics` for all activities (may be empty)

---

## Validation Rules

### State Transitions

**systemd Properties Lifecycle**:

1. **Pre-Execution**: `metrics = {}`
2. **During Execution**: `metrics = {}` (until completion)
3. **Post-Execution (Success)**: `metrics = {...}` (populated from stderr)
4. **Post-Execution (Failure)**: `metrics = {...}` or `{}` (best-effort, may be empty)
5. **Skipped Activity**: `metrics = {}` (never executed, empty object)
6. **Collection Error**: `metrics = {}` (error logged, execution continues)

**Error Handling**: Property collection uses **best-effort** strategy:
- If systemd-run is unavailable → log warning, set `metrics = {}`
- If stderr parsing fails → log error with details, set `metrics = {}`
- Script execution **always continues** regardless of property collection outcome

**State Constraints**:

| ActivityStatus | metrics | Rule |
|----------------|-------------------|------|
| `pending` | `{}` | Not started yet |
| `running` | `{}` | Execution in progress |
| `completed` | `{...}` or `{}` | Populated if systemd available, empty if collection failed |
| `failed` | `{...}` or `{}` | Best-effort collection, empty if unavailable |
| `cancelled` | `{...}` or `{}` | Partial properties if cancelled mid-execution, empty if not captured |
| `skipped` | `{}` | Never executed |
| `retrying` | `{}` | Between retry attempts |

---

## Relationships

**ActivityExecution → ScriptMetrics**: One-to-Zero-or-One (embedded JSONB)
- Each ActivityExecution has at most one ScriptMetrics embedded object
- ScriptMetrics cannot exist independently of ActivityExecution

**ActivityExecution → WorkflowExecution**: Many-to-One (existing relationship)
- Multiple script tasks per workflow execution
- Each task has independent properties

**No New Foreign Keys**: ScriptMetrics is embedded JSONB, not a separate table.

---

## Indexes

### Existing Indexes (No Changes)

- Primary key: `activity_execution.id`
- Foreign key: `activity_execution.workflow_execution_id`
- Index: `activity_execution.temporal_activity_id`

### New Index for JSONB Querying

```sql
-- GIN index for JSONB path operations (optional, for performance)
CREATE INDEX ix_activity_execution_metrics_gin
ON activity_execution
USING GIN (metrics jsonb_path_ops);
```

**Purpose**: Enables efficient queries like:
```sql
-- Find activities with high memory usage (> 1GB)
SELECT * FROM activity_execution
WHERE (metrics->>'MemoryPeak')::bigint > 1073741824;

-- Find activities with long runtime (> 5 seconds)
SELECT * FROM activity_execution
WHERE (metrics->>'DurationMs')::int > 5000;

-- Find activities with high CPU usage (> 1 second of CPU time)
SELECT * FROM activity_execution
WHERE (metrics->>'CPUUsageNSec')::bigint > 1000000000;
```

**Trade-off**: Index adds storage overhead but improves query performance for metrics-based filtering.

---

## SQLModel Models (for API)

### ScriptMetrics (SQLModel)

Flattened model using systemd D-Bus property names:

```python
from sqlmodel import SQLModel, Field

class ScriptMetrics(SQLModel):
    """Metrics from systemd-run --wait stderr output.

    Field names use systemd D-Bus property naming conventions for consistency.
    All fields are nullable - empty object {} indicates no metrics collected.
    """

    # Runtime metrics (always present if systemd-run succeeds)
    DurationMs: int | None = Field(None, ge=0, description="Service runtime in milliseconds")
    CPUUsageNSec: int | None = Field(None, ge=0, description="CPU time consumed in nanoseconds")

    # Memory metrics (always present if systemd-run succeeds)
    MemoryPeak: int | None = Field(None, ge=0, description="Peak memory usage in bytes")
    MemoryCurrent: int | None = Field(None, ge=0, description="Current memory usage in bytes")

    # Network metrics (present only if IP traffic occurred)
    IPIngressBytes: int | None = Field(None, ge=0, description="Network bytes received")
    IPEgressBytes: int | None = Field(None, ge=0, description="Network bytes sent")

    # I/O metrics (present only if I/O activity occurred)
    IOReadBytes: int | None = Field(None, ge=0, description="Disk bytes read")
    IOWriteBytes: int | None = Field(None, ge=0, description="Disk bytes written")
```

### ActivityExecution API Response (Extended)

```python
class ActivityExecutionResponse(SQLModel):
    id: UUID
    activity_name: str
    status: ActivityStatus
    started_at: datetime | None
    completed_at: datetime | None
    output_data: dict[str, Any] | None  # Existing: stdout, stderr, return_code
    metrics: ScriptMetrics  # NEW field
    # ... other existing fields ...
```

---

## Example Data

### Successful Bash Script Execution

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "activity_name": "execute_bash_script",
  "status": "completed",
  "started_at": "2026-02-13T10:30:00.000Z",
  "completed_at": "2026-02-13T10:30:01.250Z",
  "output_data": {
    "stdout": "Processing complete\n",
    "stderr": "",
    "return_code": 0
  },
  "metrics": {
    "DurationMs": 1250,
    "CPUUsageNSec": 987000000,
    "MemoryPeak": 20971520,
    "MemoryCurrent": 20971520,
    "IPIngressBytes": 18900,
    "IPEgressBytes": 3200,
    "IOReadBytes": 1048576,
    "IOWriteBytes": 524288
  }
}
```

### Failed Python Script with Partial Metrics

```json
{
  "id": "223e4567-e89b-12d3-a456-426614174001",
  "activity_name": "execute_python_script",
  "status": "failed",
  "started_at": "2026-02-13T10:35:00.000Z",
  "completed_at": "2026-02-13T10:35:00.500Z",
  "output_data": {
    "stdout": "",
    "stderr": "MemoryError: Unable to allocate array\n",
    "return_code": 1
  },
  "metrics": {
    "DurationMs": 500,
    "CPUUsageNSec": 123000000,
    "MemoryPeak": 1073741824,
    "MemoryCurrent": 1073741824
  },
  "error_details": "Script execution failed with exit code 1"
}
```

### Skipped Activity (No Properties)

```json
{
  "id": "323e4567-e89b-12d3-a456-426614174002",
  "activity_name": "execute_bash_script",
  "status": "skipped",
  "started_at": null,
  "completed_at": null,
  "output_data": null,
  "metrics": {}
}
```

### Fallback Execution (systemd-run Unavailable)

When systemd-run is unavailable, the script execution proceeds normally with `metrics` set to an empty object.

```json
{
  "id": "423e4567-e89b-12d3-a456-426614174003",
  "activity_name": "execute_bash_script",
  "status": "completed",
  "started_at": "2026-02-13T10:40:00.000Z",
  "completed_at": "2026-02-13T10:40:02.000Z",
  "output_data": {
    "stdout": "Result: 42\n",
    "stderr": "",
    "return_code": 0
  },
  "metrics": {}
}
```

**Note**: `metrics: {}` indicates properties were not collected (either due to fallback execution, systemd unavailability, or collection errors).

---

## Database Migration

### Migration Script (Alembic)

```python
"""Add metrics to activity_execution

Revision ID: 20260213_add_metrics
Revises: <previous_revision>
Create Date: 2026-02-13 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = '20260213_add_metrics'
down_revision = '<previous_revision>'
branch_labels = None
depends_on = None

def upgrade() -> None:
    """Add metrics JSONB column to activity_execution table."""
    # Add column (nullable for backward compatibility)
    op.add_column(
        'activity_execution',
        sa.Column(
            'metrics',
            JSONB,
            nullable=True,
            server_default='{}',
            comment='Metrics from systemd-run --wait stderr (DurationMs, CPUUsageNSec, MemoryPeak, etc.)'
        )
    )

    # Add GIN index for efficient JSONB querying (optional, recommended for analytics)
    op.create_index(
        'ix_activity_execution_metrics_gin',
        'activity_execution',
        ['metrics'],
        unique=False,
        postgresql_using='gin',
        postgresql_ops={'metrics': 'jsonb_path_ops'}
    )

def downgrade() -> None:
    """Remove metrics column and index from activity_execution table."""
    # Drop index first
    op.drop_index('ix_activity_execution_metrics_gin', table_name='activity_execution')

    # Drop column
    op.drop_column('activity_execution', 'metrics')
```

**Migration Safety**:
- **Zero Downtime**: Adding nullable column is non-blocking in PostgreSQL
- **Backward Compatible**: Existing queries not accessing metrics work unchanged
- **Rollback Safe**: Downgrade removes column without affecting other data
- **No Data Loss**: Existing activity_execution rows get `{}` for metrics (valid state)

---

## Summary

**Key Design Decisions**:

1. **Stderr Parsing Instead of systemctl show**:
   - **Rationale**: `systemctl show` returns `[not set]` for properties, deprecated CPUAccounting
   - **Benefit**: Simple, reliable, no race conditions, single command
   - **Trade-off**: Limited property set compared to D-Bus queries

2. **Systemd D-Bus Property Names**:
   - **Rationale**: Using systemd property names (`CPUUsageNSec`, `MemoryPeak`, `IPIngressBytes`) for consistency
   - **Benefit**: Consistent naming across codebase, matches systemd documentation
   - **Trade-off**: Requires unit conversion from stderr (ms → ns for CPU)

3. **Nullable Fields Based on Stderr Presence**:
   - **Rationale**: Not all scripts generate all metrics (e.g., no I/O → no IO Bytes line)
   - **Benefit**: Accurate representation of what was actually measured
   - **Example**: Script with no network → IPIngressBytes, IPEgressBytes omitted

4. **Empty Dict for Collection Failure**:
   - **Rationale**: Distinguish "no data" from "data not applicable"
   - **Benefit**: Queries can check `metrics != {}` for successful collection
   - **Alternative**: Could use `null`, but `{}` is more explicit

5. **Nanosecond Storage for CPU**:
   - **Rationale**: Stderr provides milliseconds, converted to nanoseconds for `CPUUsageNSec`
   - **Benefit**: Consistent with systemd D-Bus property (CPUUsageNSec uses nanoseconds)
   - **Trade-off**: Precision is still millisecond-level, but storage format matches D-Bus

**Validation Strategy**: Pydantic models enforce constraints at API boundary, database stores raw JSONB (flexible).

**Querying Strategy**:
- **Single activity**: Direct JSONB field access (fast)
- **Filtering by metrics**: GIN index for JSONB path operations (acceptable performance)
- **Aggregations**: May require denormalization in future if performance issues arise

**Extensibility**:
- Adding new metric fields: Backward compatible (existing records have empty or partial data)
- Changing metric format: Requires migration script and version handling
- Replacing JSONB with table: Schema allows future refactoring without API changes

---

**Next Phase**: API Contracts (OpenAPI schema for metrics endpoints - may already exist)
