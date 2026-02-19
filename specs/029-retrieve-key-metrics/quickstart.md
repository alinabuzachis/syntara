# Quickstart: Script Task Execution Metrics

**Feature**: Script Task Execution Metrics Retrieval
**Date**: 2026-02-12
**Branch**: 029-retrieve-key-metrics

## Overview

This quickstart guide validates the implementation of resource metrics collection for script tasks. It walks through the primary user scenarios from the feature specification, demonstrating that script executions now capture CPU, memory, and I/O metrics alongside existing output data.

**Target Audience**: QA engineers, developers, performance engineers
**Prerequisites**: Nexus workflow engine running with cgroups v2 support

---

## Scenario 1: Retrieve Metrics for Completed Script Task

**User Story**: As a workflow operator, I need to retrieve detailed metrics from a completed script task execution.

### Setup

Create a simple bash script workflow that performs some work:

```bash
# Create workflow definition via API
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "metrics_test_workflow",
    "activities": [
      {
        "id": "test_script",
        "type": "script",
        "config": {
          "language": "bash",
          "code": "#!/bin/bash\nfor i in {1..1000}; do echo $i; done\nsleep 1\necho 'Complete'",
          "timeout": 30
        }
      }
    ]
  }'
```

**Expected Response**: Workflow created with ID `{workflow_id}`

### Execute Workflow

```bash
# Start workflow execution
curl -X POST http://localhost:8000/api/v1/workflows/{workflow_id}/executions \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response**: Execution started with ID `{execution_id}`

### Retrieve Metrics

Wait for completion (poll status or use WebSocket), then retrieve activity with metrics:

```bash
# Get activities for workflow execution
curl -X GET http://localhost:8000/api/v1/workflows/{execution_id}/activities
```

### Validate Response

**Expected Response Structure**:
```json
{
  "data": [
    {
      "id": "<activity_id>",
      "activity_name": "execute_bash_script",
      "status": "completed",
      "started_at": "2026-02-12T10:00:00.000Z",
      "completed_at": "2026-02-12T10:00:01.500Z",
      "output_data": {
        "stdout": "1\n2\n3\n...\n1000\nComplete\n",
        "stderr": "",
        "return_code": 0
      },
      "metrics": {
        "DurationMs": 1500,
        "CPUUsageNSec": <positive_integer>,
        "MemoryCurrent": <positive_integer>,
        "MemoryPeak": <positive_integer>,
        "IOReadBytes": <non_negative_integer>,
        "IOWriteBytes": <non_negative_integer>,
        "IOReadOperations": <non_negative_integer>,
        "IOWriteOperations": <non_negative_integer>,
        "IPIngressBytes": <non_negative_integer>,
        "IPEgressBytes": <non_negative_integer>,
        "IPIngressPackets": <non_negative_integer>,
        "IPEgressPackets": <non_negative_integer>
      }
    }
  ]
}
```

### Validation Checks

- [ ] **Response contains metrics field** (not null)
- [ ] **DurationMs matches** (completed_at - started_at) within 10ms tolerance
- [ ] **CPUUsageNSec > 0** (script consumed CPU time)
- [ ] **MemoryPeak ≥ MemoryCurrent** (peak is maximum)
- [ ] **MemoryPeak > 0** (script used memory)
- [ ] **IOReadBytes and IOWriteBytes are non-negative** (may be 0 for simple scripts)

---

## Scenario 2: Query Resource Consumption for Multiple Script Tasks

**User Story**: As a performance engineer, I need to query metrics for all script tasks in a workflow execution to identify resource-intensive scripts.

### Setup

Create a workflow with multiple script activities:

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "multi_script_workflow",
    "activities": [
      {
        "id": "light_script",
        "type": "script",
        "config": {
          "language": "bash",
          "code": "echo 'Lightweight task'"
        }
      },
      {
        "id": "heavy_script",
        "type": "script",
        "config": {
          "language": "python",
          "code": "import time\ndata = [i**2 for i in range(1000000)]\ntime.sleep(2)\nprint(sum(data))"
        }
      },
      {
        "id": "io_intensive_script",
        "type": "script",
        "config": {
          "language": "bash",
          "code": "dd if=/dev/zero of=/tmp/testfile bs=1M count=50; rm /tmp/testfile"
        }
      }
    ]
  }'
```

### Execute and Retrieve

```bash
# Execute workflow
curl -X POST http://localhost:8000/api/v1/workflows/{workflow_id}/executions

# Wait for completion, then retrieve all activities
curl -X GET http://localhost:8000/api/v1/workflows/{execution_id}/activities
```

### Validate Response

**Expected**: Response contains 3 activities, each with metrics

```json
{
  "data": [
    {
      "id": "light_script",
      "activity_name": "execute_bash_script",
      "status": "completed",
      "started_at": "2026-02-13T10:30:00.000Z",
      "completed_at": "2026-02-13T10:30:00.015Z",
      "output_data": {
        "stdout": "Lightweight task\n",
        "stderr": "",
        "return_code": 0
      },
      "metrics": {
        "DurationMs": 15,
        "CPUUsageNSec": 5000000,
        "MemoryPeak": 1258291,
        "MemoryCurrent": 1258291
      }
    },
    {
      "id": "heavy_script",
      "activity_name": "execute_python_script",
      "status": "completed",
      "started_at": "2026-02-13T10:30:00.020Z",
      "completed_at": "2026-02-13T10:30:02.520Z",
      "output_data": {
        "stdout": "333332833333500000\n",
        "stderr": "",
        "return_code": 0
      },
      "metrics": {
        "DurationMs": 2500,
        "CPUUsageNSec": 1200000000000,
        "MemoryPeak": 78643200,
        "MemoryCurrent": 78643200
      }
    },
    {
      "id": "io_intensive_script",
      "activity_name": "execute_bash_script",
      "status": "completed",
      "started_at": "2026-02-13T10:30:02.525Z",
      "completed_at": "2026-02-13T10:30:03.100Z",
      "output_data": {
        "stdout": "50+0 records in\n50+0 records out\n",
        "stderr": "",
        "return_code": 0
      },
      "metrics": {
        "DurationMs": 575,
        "CPUUsageNSec": 25000000,
        "MemoryPeak": 2097152,
        "MemoryCurrent": 2097152,
        "IOReadBytes": 1024,
        "IOWriteBytes": 52428800
      }
    }
  ]
}
```

### Comparative Analysis

Extract metrics for comparison:

```python
# Example validation script (run after receiving response)
import json

response = json.load(open('response.json'))
activities = {a['id']: a for a in response['data']}

# Light script should have low resource usage
assert activities['light_script']['metrics']['CPUUsageNSec'] < 100_000_000_000  # < 100ms CPU (in nsec)
assert activities['light_script']['metrics']['MemoryPeak'] < 10*1024*1024  # < 10 MB

# Heavy script should have higher CPU and memory
assert activities['heavy_script']['metrics']['CPUUsageNSec'] > 1_000_000_000_000  # > 1s CPU (in nsec)
assert activities['heavy_script']['metrics']['MemoryPeak'] > 50*1024*1024  # > 50 MB

# I/O intensive script should have high I/O metrics
assert activities['io_intensive_script']['metrics']['IOWriteBytes'] > 50*1024*1024  # > 50 MB written
```

### Validation Checks

- [ ] **All 3 activities have metrics** (not null)
- [ ] **heavy_script uses more CPU than light_script** (CPUUsageNSec comparison)
- [ ] **heavy_script uses more memory than light_script** (MemoryPeak comparison)
- [ ] **io_intensive_script has higher IOWriteBytes** than other scripts
- [ ] **Metrics are independently collected** (not shared between activities)

---

## Scenario 3: Analyze Performance Trend Across Multiple Executions

**User Story**: As a workflow operator, I need to analyze script performance over time to identify degradation.

### Setup

Execute the same workflow multiple times:

```bash
# Execute workflow 5 times
for i in {1..5}; do
  curl -X POST http://localhost:8000/api/v1/workflows/{workflow_id}/executions
  sleep 5  # Wait between executions
done
```

### Retrieve Metrics for Each Execution

```bash
# For each execution ID, retrieve activities
curl -X GET http://localhost:8000/api/v1/workflows/{execution_id_1}/activities
curl -X GET http://localhost:8000/api/v1/workflows/{execution_id_2}/activities
# ... repeat for all 5 executions
```

### Validate Trend Analysis

**Expected**: Metrics should be comparable across executions (same script code)

```python
# Example validation: Extract duration and memory for same activity across executions
executions = [...]  # List of 5 execution responses

durations = [e['data'][0]['metrics']['DurationMs'] for e in executions]
peak_memories = [e['data'][0]['metrics']['MemoryPeak'] for e in executions]

import statistics

# Validate consistency (standard deviation should be low relative to mean)
assert statistics.stdev(durations) < statistics.mean(durations) * 0.2  # <20% variance
assert statistics.stdev(peak_memories) < statistics.mean(peak_memories) * 0.2  # <20% variance
```

### Validation Checks

- [ ] **Metrics collected for all 5 executions** (metrics not null)
- [ ] **Duration variance < 20%** (consistent execution time)
- [ ] **Memory variance < 20%** (consistent memory usage)
- [ ] **Metrics available for trend analysis** (comparable structure across executions)

---

## Scenario 4: Retrieve Metrics for Failed Script Task

**User Story**: As a developer debugging a failed script, I need metrics to understand resource constraints that may have caused the failure.

### Setup

Create a script that fails due to error:

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "failing_script_workflow",
    "activities": [
      {
        "id": "memory_error_script",
        "type": "script",
        "config": {
          "language": "python",
          "code": "import sys\ndata = [0] * (10**9)\nprint(data)"
        }
      }
    ]
  }'
```

### Execute and Retrieve

```bash
# Execute workflow (expect failure)
curl -X POST http://localhost:8000/api/v1/workflows/{workflow_id}/executions

# Wait for failure, then retrieve activity
curl -X GET http://localhost:8000/api/v1/workflows/{execution_id}/activities
```

### Validate Response

**Expected Response**:
```json
{
  "data": [
    {
      "id": "<activity_id>",
      "activity_name": "execute_python_script",
      "status": "failed",
      "started_at": "2026-02-12T10:05:00.000Z",
      "completed_at": "2026-02-12T10:05:00.500Z",
      "output_data": {
        "stdout": "",
        "stderr": "MemoryError: ...\n",
        "return_code": 1
      },
      "metrics": {
        "DurationMs": 500,
        "CPUUsageNSec": <value>,
        "MemoryCurrent": <high_value>,
        "MemoryPeak": <high_value>,
        "IOReadBytes": <value>,
        "IOWriteBytes": <value>
      },
      "error_details": "Script execution failed with exit code 1"
    }
  ]
}
```

### Validation Checks

- [ ] **status is "failed"** (script did not complete successfully)
- [ ] **metrics is present** (metrics collected even for failed execution)
- [ ] **MemoryPeak is high** (indicates memory pressure)
- [ ] **output_data.stderr contains error message** (MemoryError visible)
- [ ] **error_details describes failure** (exit code 1)
- [ ] **DurationMs < timeout** (script failed before timeout)

**Debugging Insight**: High MemoryPeak combined with MemoryError indicates script exceeded available memory.

---

## Scenario 5: Handle Skipped Activity (Conditional Logic)

**User Story**: As a workflow operator, I need to verify that skipped activities do not have metrics (never executed).

### Setup

Create workflow with conditional branch:

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "conditional_workflow",
    "activities": [
      {
        "id": "decision",
        "type": "script",
        "config": {
          "language": "bash",
          "code": "echo false"
        }
      },
      {
        "id": "conditional_script",
        "type": "script",
        "config": {
          "language": "bash",
          "code": "echo Should not run"
        },
        "condition": "${decision.output == \"true\"}"
      }
    ]
  }'
```

### Execute and Retrieve

```bash
curl -X POST http://localhost:8000/api/v1/workflows/{workflow_id}/executions
curl -X GET http://localhost:8000/api/v1/workflows/{execution_id}/activities
```

### Validate Response

**Expected**: conditional_script activity has status "skipped" and metrics is null

```json
{
  "data": [
    {
      "id": "<decision_activity_id>",
      "activity_name": "execute_bash_script",
      "status": "completed",
      "metrics": { ... }
    },
    {
      "id": "<conditional_activity_id>",
      "activity_name": "execute_bash_script",
      "status": "skipped",
      "started_at": null,
      "completed_at": null,
      "output_data": null,
      "metrics": null
    }
  ]
}
```

### Validation Checks

- [ ] **Skipped activity has status "skipped"**
- [ ] **Skipped activity has metrics = null** (no execution)
- [ ] **Skipped activity has started_at = null** (never started)
- [ ] **Skipped activity has output_data = null** (no output)
- [ ] **Completed activity has metrics present** (normal execution)

---

## Scenario 6: Filter Activities by Status with Metrics

**User Story**: As a performance engineer, I need to filter completed script tasks and retrieve only their metrics.

### Setup

Execute workflow from Scenario 2 (multiple scripts, some may fail or be skipped)

### Filter by Status

```bash
# Retrieve only completed activities
curl -X GET "http://localhost:8000/api/v1/workflows/{execution_id}/activities?filter[status]=completed"

# Retrieve only failed activities
curl -X GET "http://localhost:8000/api/v1/workflows/{execution_id}/activities?filter[status]=failed"
```

### Validate Response

**Expected for completed filter**:
- Only activities with status "completed" returned
- All returned activities have metrics (not null)

**Expected for failed filter**:
- Only activities with status "failed" returned
- Failed activities may have partial metrics

### Validation Checks

- [ ] **Filter parameter works correctly** (only requested status returned)
- [ ] **metrics present for completed activities** (metrics collected)
- [ ] **Pagination works with filters** (limit/cursor parameters respected)
- [ ] **Total count reflects filtered results** (not total activities)

---

## Scenario 7: Pagination with Large Activity Lists

**User Story**: As a workflow operator, I need to paginate through activities in workflows with many script tasks.

### Setup

Create workflow with 100 script activities:

```bash
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "large_workflow",
    "activities": [
      # 100 script activities (generated programmatically)
    ]
  }'
```

### Retrieve with Pagination

```bash
# First page (limit 20)
curl -X GET "http://localhost:8000/api/v1/workflows/{execution_id}/activities?limit=20"

# Second page (using cursor from first response)
curl -X GET "http://localhost:8000/api/v1/workflows/{execution_id}/activities?limit=20&cursor={next_cursor}"
```

### Validate Pagination

**Expected First Page Response**:
```json
{
  "data": [ /* 20 activities */ ],
  "pagination": {
    "next_cursor": "<cursor_value>",
    "total_count": 100
  }
}
```

**Expected Second Page Response**:
```json
{
  "data": [ /* 20 activities */ ],
  "pagination": {
    "next_cursor": "<cursor_value>",
    "total_count": 100
  }
}
```

### Validation Checks

- [ ] **First page returns 20 activities** (limit respected)
- [ ] **next_cursor is present** (more pages available)
- [ ] **total_count is 100** (total activities)
- [ ] **All activities have metrics** (metrics not omitted due to pagination)
- [ ] **Subsequent pages return different activities** (no duplicates)
- [ ] **Final page has next_cursor = null** (end of results)

---

## Scenario 8: Performance Validation (<1% Overhead)

**User Story**: As a platform engineer, I need to verify that metrics collection adds less than 1% overhead to script execution time.

### Setup

Create two identical workflows, one with metrics collection enabled (default), one with metrics disabled (if feature flag exists):

```bash
# Baseline: Execute script 10 times without metrics (if possible)
# Comparison: Execute script 10 times with metrics (default)
```

### Measure Overhead

```python
# Pseudocode for validation
import statistics

baseline_durations = [...]  # Extract from executions without metrics
metrics_durations = [...]   # Extract from executions with metrics

baseline_mean = statistics.mean(baseline_durations)
metrics_mean = statistics.mean(metrics_durations)

overhead_percent = ((metrics_mean - baseline_mean) / baseline_mean) * 100
```

### Validation Checks

- [ ] **Overhead < 1%** (metrics_mean - baseline_mean < 1% of baseline_mean)
- [ ] **Metrics do not block execution** (scripts complete normally)
- [ ] **No timeout failures due to overhead** (all scripts complete within timeout)

**Note**: If metrics collection cannot be disabled, compare DurationMs from metrics against started_at/completed_at timestamps to verify timing accuracy.

---

## Integration Test Summary

### Pre-Flight Checks

Before running quickstart scenarios, verify:

- [ ] **Nexus workflow engine running** (`curl http://localhost:8000/health`)
- [ ] **cgroups v2 available** (`ls /sys/fs/cgroup/cgroup.controllers` shows controllers)
- [ ] **systemd-run available** (`which systemd-run` returns path)
- [ ] **Database migrations applied** (`alembic current` shows latest revision)
- [ ] **API authentication configured** (bearer token available if required)

### Success Criteria Validation

After running all scenarios, validate that:

1. **✅ Metrics Coverage**: All script task executions (bash and Python) capture complete metrics
2. **✅ Performance**: Metrics collection adds <1% overhead to script execution time
3. **✅ Query Performance**: Metrics retrieval queries return in <2 seconds for single workflow execution
4. **✅ Reliability**: 99.9% of script task executions successfully store metrics
5. **✅ Usability**: Performance engineers can identify slow scripts, resource-intensive scripts, and bottlenecks from captured metrics
6. **✅ Debugging Value**: Failed script task metrics provide sufficient context to diagnose performance issues
7. **✅ Resource Visibility**: Resource consumption metrics accurately reflect script CPU, memory, disk I/O usage

### Known Limitations (Phase 1)

- **Network metrics**: Always null (cgroups v2 does not provide network controller)
- **GPU metrics**: Always null (requires vendor-specific tooling)
- **Real-time metrics**: Collected post-execution only (no live streaming during execution)
- **Fallback systems**: If cgroups v2 unavailable, metrics may be null

---

## Troubleshooting

### Metrics are null despite successful execution

**Possible Causes**:
1. cgroups v2 not available on system (`cat /proc/filesystems | grep cgroup`)
2. systemd-run command not found (`which systemd-run`)
3. Insufficient permissions to read cgroup files
4. Fallback to direct subprocess execution

**Resolution**: Check logs for specific error messages.

### Metrics seem inaccurate (e.g., CPU usage too low)

**Possible Causes**:
1. Script executed too quickly (<10ms) for accurate measurement
2. Cgroup accounting not enabled (CPUAccounting, MemoryAccounting)
3. Metrics read before cgroup files updated (race condition)

**Resolution**: Ensure systemd-run uses `-p CPUAccounting=1 -p MemoryAccounting=1`.

### Query performance slower than 2 seconds

**Possible Causes**:
1. GIN index not created on metrics JSONB field
2. Large number of activities (>1000) without pagination
3. Database query not optimized for JSONB field access

**Resolution**:
- Check index exists: `\d activity_execution` in psql
- Use pagination parameters (limit/cursor)
- Ensure database has sufficient resources

---

## Appendix: Example Response (Complete)

```json
{
  "data": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174001",
      "activity_name": "execute_bash_script",
      "temporal_activity_id": "activity-123456",
      "status": "completed",
      "started_at": "2026-02-12T10:30:00.000Z",
      "completed_at": "2026-02-12T10:30:01.250Z",
      "input_data": {
        "INPUT_NAME": "test"
      },
      "output_data": {
        "stdout": "Processing complete\n",
        "stderr": "",
        "return_code": 0
      },
      "metrics": {
        "DurationMs": 1250,
        "CPUUsageNSec": 987654000,
        "MemoryCurrent": 10485760,
        "MemoryPeak": 20971520,
        "IOReadBytes": 1048576,
        "IOWriteBytes": 524288,
        "IOReadOperations": 100,
        "IOWriteOperations": 50,
        "IPIngressBytes": 19351,
        "IPEgressBytes": 3182,
        "IPIngressPackets": 16,
        "IPEgressPackets": 23
      },
      "error_details": null,
      "retry_count": 0,
      "iteration": null,
      "workflow_execution_id": "123e4567-e89b-12d3-a456-426614174000"
    }
  ],
  "pagination": {
    "next_cursor": null,
    "total_count": 1
  }
}
```

---

**Quickstart Complete**: All primary user scenarios validated. Feature ready for integration testing.
