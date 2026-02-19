# Tasks: Script Task Execution Metrics Retrieval

**Input**: Design documents from `specs/029-retrieve-key-metrics/`
**Prerequisites**: plan.md, spec.md, data-model.md, quickstart.md
**Branch**: `029-retrieve-key-metrics`

## Overview

This feature adds systemd-based resource properties collection to script task executions (bash and Python scripts) using `systemd-run --wait` with stderr parsing. The implementation extends the existing ActivityExecution model with a JSONB field (`metrics`) storing metrics parsed from systemd stderr output using systemd D-Bus property names (DurationMs, CPUUsageNSec, MemoryPeak, etc.), adds a dedicated `systemd_metrics.py` module for parsing and utilities (called by script_activity.py), and includes comprehensive testing following TDD principles.

**Data Source**: `systemd-run --wait` stderr output (NOT `systemctl show`)
**Storage Format**: Flattened dict using systemd D-Bus property names (DurationMs, CPUUsageNSec, MemoryPeak, IPIngressBytes, etc.)
**Transformation to ANSTRAT-1748**: Handled in separate event emission spec

**Total Tasks**: 29
**Estimated Effort**: 1-2 days
**Testing Approach**: TDD (tests written first, implementation follows)
**Approved Approach**: systemd-run --wait with stderr parsing (50 lines of code, <0.1% overhead, zero dependencies)

---

## Execution Flow
```
1. Phase 1: Setup (database migration, fixtures) → T001-T003
2. Phase 2: Foundational (systemd helpers, parsers) → T004-T008
3. Phase 3: US1 - Basic Metrics Collection → T009-T011
4. Phase 4: US2 - Resource Validation → T012-T013
5. Phase 5: US3 - Multi-Execution Support → T014-T015
6. Phase 6: US4 - Failed Task Metrics → T016-T017
7. Phase 7: US5 - Edge Cases → T018-T021
8. Phase 8: Polish & Validation → T022-T029
```

---

## Phase 1: Setup & Database Migration

**Goal**: Prepare database schema and test infrastructure

- [ ] T001 Add metrics field to ActivityExecution model and generate Alembic migration

**Workflow** (per AGENTS.md - models are the source of truth):
1. Update `ActivityExecution` model to add the `metrics: ScriptMetrics` field
2. Generate migration with `alembic revision --autogenerate -m "add_metrics_to_activity_execution"`
3. Review the generated migration and add GIN index if needed (custom SQL per AGENTS.md guidelines)
4. Validate with `alembic upgrade head && alembic downgrade -1 && alembic upgrade head`

- [ ] T002 [P] Create unit test fixtures for systemd stderr output samples in tests/fixtures/systemd_stderr_samples.py

**Fixtures to create** (based on actual systemd-run --wait stderr output):
```python
SYSTEMD_STDERR_BASIC = """Running as unit: test-unit-1771031190.service
          Finished with result: success
Main processes terminated with: code=exited, status=0/SUCCESS
               Service runtime: 9ms
             CPU time consumed: 4ms
                   Memory peak: 1.2M (swap: 0B)"""

SYSTEMD_STDERR_NETWORK_IO = """Running as unit: test-unit-1771033224.service
          Finished with result: success
Main processes terminated with: code=exited, status=0/SUCCESS
               Service runtime: 182ms
             CPU time consumed: 11ms
                   Memory peak: 2.1M (swap: 0B)
                    IP Traffic: received 1.1K, sent 441B
                      IO Bytes: read 600K"""

SYSTEMD_STDERR_DISK_IO = """Running as unit: test-unit-1771034567.service
          Finished with result: success
Main processes terminated with: code=exited, status=0/SUCCESS
               Service runtime: 523ms
             CPU time consumed: 15ms
                   Memory peak: 1.8M (swap: 0B)
                      IO Bytes: read 1.0K, write 50M"""

SYSTEMD_STDERR_NO_IO = """Running as unit: test-unit-1771035000.service
          Finished with result: success
Main processes terminated with: code=exited, status=0/SUCCESS
               Service runtime: 100ms
             CPU time consumed: 5ms
                   Memory peak: 1.2M (swap: 0B)"""
```

- [ ] T003 [P] Create integration test base class with systemd mock in tests/integration/workflows/base_metrics_test.py

**Base Class Features**:
- `mock_systemd_run()` - returns fake systemd stderr output
- `assert_metrics_structure()` - validates systemd properties dict structure
- `assert_property_names()` - validates property names match systemd property names (DurationMs, CPUUsageNSec, etc.)

**Acceptance Criteria**:
- Migration adds `metrics` JSONB column with default `{}`
- Migration creates GIN index for efficient querying
- Fixture file contains 10+ example systemd stderr outputs matching real output format
- Base test class provides reusable test helpers

---

## Phase 2: Foundational - Systemd Integration Layer

**Goal**: Build core systemd-run wrapper and parsing logic (MUST complete before user stories)

### Unit Tests (TDD - Write First)

- [ ] T004 [P] Write unit tests for `_parse_size()` helper in tests/unit/workflows/test_systemd_parser.py

**Test Cases**:
```python
def test_parse_size_bytes():
    assert _parse_size("1048576", "") == 1048576

def test_parse_size_kilobytes():
    assert _parse_size("3.4", "K") == 3481  # 3.4 * 1024

def test_parse_size_megabytes():
    assert _parse_size("512.5", "M") == 537395200

def test_parse_size_gigabytes():
    assert _parse_size("2.1", "G") == 2254857830
```

- [ ] T005 [P] Write unit tests for `_parse_metrics()` parser in tests/unit/workflows/test_systemd_parser.py

**Test Cases** (based on actual systemd property names):
```python
def test_parse_complete_output(systemd_stderr_network_io):
    properties = _parse_metrics(systemd_stderr_network_io)
    assert "DurationMs" in properties
    assert "CPUUsageNSec" in properties
    assert "MemoryPeak" in properties
    assert "MemoryCurrent" in properties
    assert "IPIngressBytes" in properties
    assert "IPEgressBytes" in properties
    assert "IOReadBytes" in properties
    assert properties["DurationMs"] == 182
    assert properties["CPUUsageNSec"] == 11_000_000  # 11ms in nanoseconds
    assert properties["MemoryPeak"] == 2202009  # 2.1M in bytes
    assert properties["MemoryCurrent"] == 2202009  # Same as peak from stderr

def test_parse_missing_io_line(systemd_stderr_no_io):
    properties = _parse_metrics(systemd_stderr_no_io)
    # IO Bytes line missing means IOReadBytes/IOWriteBytes should be omitted
    assert "IOReadBytes" not in properties
    assert "IOWriteBytes" not in properties

def test_parse_disk_write(systemd_stderr_disk_io):
    properties = _parse_metrics(systemd_stderr_disk_io)
    assert properties["IOReadBytes"] == 1024  # 1.0K
    assert properties["IOWriteBytes"] == 52428800  # 50M

def test_parse_malformed_output():
    properties = _parse_metrics("Invalid output")
    assert properties == {}  # Graceful failure
```

- [ ] T006 [P] Write unit tests for `_extract_script_stderr()` in tests/unit/workflows/test_systemd_parser.py

**Test Cases**:
```python
def test_extract_script_stderr_with_systemd_lines():
    combined = """Some script output
Running as unit: test-unit-123.service
Script error message
Service runtime: 100ms
Another error
CPU time consumed: 5ms"""
    script_stderr = _extract_script_stderr(combined)
    assert "Service runtime" not in script_stderr
    assert "Running as unit" not in script_stderr
    assert "Script error message" in script_stderr
    assert "Another error" in script_stderr
```

### Implementation

- [ ] T007 Implement `parse_size()` helper function in src/nexus/workflows/workflow_engine/activities/systemd_metrics.py

**Function Signature**:
```python
def _parse_size(value: str, unit: str) -> int:
    """Convert size string with unit (K/M/G/T) to bytes.

    Args:
        value: Numeric value as string (e.g., "3.4")
        unit: Unit suffix from systemd output ("", "K", "M", "G", "T")

    Returns:
        Size in bytes (int)

    Examples:
        >>> _parse_size("2.1", "M")
        2202009
        >>> _parse_size("1.1", "K")
        1126
    """
```

**Dependencies**: None
**Validation**: T004 test now PASSES

- [ ] T008 Implement `parse_metrics()` and `extract_script_stderr()` in src/nexus/workflows/workflow_engine/activities/systemd_metrics.py

**Function Signatures**:
```python
def _parse_metrics(systemd_stderr: str) -> dict[str, Any]:
    """Parse systemd-run --wait stderr output into property dict.

    Parses these patterns from stderr (see data-model.md for full details):
    - "Service runtime: (\d+)ms" → DurationMs
    - "CPU time consumed: (\d+)ms" → CPUUsageNSec
    - "Memory peak: ([\d.]+)([KMGT]?) \(swap: ([\d.]+)([KMGT]?)\)" → MemoryPeak, MemoryCurrent
    - "IP Traffic: received ([\d.]+)([KMGT]?), sent ([\d.]+)([KMGT]?)" → IPIngressBytes, IPEgressBytes
    - "IO Bytes: read ([\d.]+)([KMGT]?)(?:, write ([\d.]+)([KMGT]?))?" → IOReadBytes, IOWriteBytes (write optional)

    Returns:
        Dict with property names matching systemd property names:
        - DurationMs: int (milliseconds)
        - CPUUsageNSec: int (nanoseconds, converted from stderr milliseconds × 1,000,000)
        - MemoryPeak: int (bytes)
        - MemoryCurrent: int (bytes)
        - IPIngressBytes: int (bytes, optional)
        - IPEgressBytes: int (bytes, optional)
        - IOReadBytes: int (bytes, optional)
        - IOWriteBytes: int (bytes, optional)

        Empty dict {} if parsing fails.
    """

def _extract_script_stderr(combined_stderr: str) -> str:
    """Remove systemd metric lines from combined stderr output.

    Filters out these systemd-specific lines:
    - "Running as unit: ..."
    - "Finished with result: ..."
    - "Main processes terminated with: ..."
    - "Service runtime: ..."
    - "CPU time consumed: ..."
    - "Memory peak: ..."
    - "IP Traffic: ..."
    - "IO Bytes: ..."

    Returns only the script's actual stderr output.
    """
```

**Dependencies**: T007 (_parse_size used by _parse_metrics)
**Validation**: T005 and T006 tests now PASS

---

## Phase 3: User Story 1 - Basic Metrics Collection [US1]

**User Story**: As a workflow operator, I need to retrieve systemd properties from a completed script task execution.

**Independent Test Criteria**:
- Bash script execution returns metrics with stderr-based property names
- Python script execution returns metrics with DurationMs, CPUUsageNSec, MemoryPeak, etc.
- Properties use systemd property naming convention (matching data-model.md)

### Tests (TDD)

- [ ] T009 [P] [US1] Write integration test for bash script with metrics in tests/integration/workflows/test_script_metrics.py::test_bash_script_basic_metrics

**Test Scenario**:
```python
async def test_bash_script_basic_metrics():
    # Execute: bash script with CPU/memory usage
    result = await execute_bash_script(
        code="for i in {1..1000}; do echo $i; done\nsleep 1",
        inputs={}, environment={}, timeout_seconds=30
    )

    # Assert: metrics exists and has stderr-based property names
    assert result["metrics"] is not None
    assert "DurationMs" in result["metrics"]
    assert "CPUUsageNSec" in result["metrics"]
    assert "MemoryPeak" in result["metrics"]
    assert "MemoryCurrent" in result["metrics"]
    assert isinstance(result["metrics"]["DurationMs"], int)
    assert isinstance(result["metrics"]["CPUUsageNSec"], int)
    assert isinstance(result["metrics"]["MemoryPeak"], int)
```

- [ ] T010 [P] [US1] Write integration test for python script with metrics in tests/integration/workflows/test_script_metrics.py::test_python_script_basic_metrics

### Implementation

- [ ] T011 [US1] Modify `execute_bash_script()` and `execute_python_script()` in src/nexus/workflows/workflow_engine/activities/script_activity.py to call systemd_metrics module

**Implementation Strategy**:
1. Create `_execute_script_with_systemd()` function:
   ```python
   async def _execute_script_with_systemd(
       command: list[str],
       inputs: dict,
       environment: dict,
       timeout_seconds: int
   ) -> dict:
       """Wrap command with systemd-run --wait and capture metrics from stderr.

       Command format (NOTE: --wait WITHOUT --scope):
       systemd-run --wait --quiet \
         --property=CPUAccounting=yes \
         --property=MemoryAccounting=yes \
         --property=IOAccounting=yes \
         --property=IPAccounting=yes \
         {original_command}

       Returns:
           Dict with stdout, stderr (script only), returncode, metrics
       """
   ```

2. Add systemd-run availability check in module-level code:
   ```python
   SYSTEMD_RUN_AVAILABLE = shutil.which("systemd-run") is not None
   ```

3. Modify `execute_bash_script()` and `execute_python_script()`:
   - If SYSTEMD_RUN_AVAILABLE: call _execute_script_with_systemd()
   - Else: call existing _execute_script_common(), set metrics = {}

4. Parse stderr with `_parse_metrics()` to extract metrics
5. Use `_extract_script_stderr()` to remove systemd lines from script stderr
6. Store parsed properties in result dict

**File Changes**:
- src/nexus/workflows/workflow_engine/activities/systemd_metrics.py (new module, ~100 lines)
- src/nexus/workflows/workflow_engine/activities/script_activity.py (modified to call systemd_metrics)

**Acceptance Criteria**:
- Bash and Python scripts execute via systemd-run --wait wrapper (NOT --scope)
- Stderr parsed to extract systemd properties and script stderr separately
- Properties stored in result dict with systemd property names (DurationMs, CPUUsageNSec, MemoryPeak, etc.)
- If systemd unavailable: metrics = {}, log warning, execution continues

**Dependencies**: T007-T008 complete → T009-T010 (tests) → T011 (implementation)

---

## Phase 4: User Story 2 - Resource Validation [US2]

**User Story**: As a performance engineer, I need to validate resource consumption patterns match expectations.

**Independent Test Criteria**:
- High-CPU script shows CPUUsageNSec > 1_000_000_000 (1 second in nanoseconds)
- High-memory script shows MemoryPeak > 50MB
- I/O-intensive script shows IOReadBytes + IOWriteBytes > 50MB

### Tests

- [ ] T012 [P] [US2] Write integration test for resource validation in tests/integration/workflows/test_script_metrics.py::test_resource_validation

**Test Scenario**:
```python
async def test_resource_validation():
    # High CPU script
    cpu_result = await execute_python_script(
        code="import time\nfor _ in range(1000000): pass",
        ...
    )
    assert cpu_result["metrics"]["CPUUsageNSec"] > 1_000_000_000  # > 1 second in nanoseconds

    # High memory script
    mem_result = await execute_python_script(
        code="data = [0] * (10**7)",  # ~100MB
        ...
    )
    assert mem_result["metrics"]["MemoryPeak"] > 50 * 1024 * 1024  # > 50MB
```

### Implementation

- [ ] T013 [US2] Add systemd property validation in src/nexus/workflows/workflow_engine/activities/systemd_metrics.py

**Changes**:
1. Add validation logging for systemd properties:
   ```python
   # Validate DurationMs is reasonable (not negative)
   # Validate MemoryPeak is reasonable (not exceeding system total memory)
   # Log warnings for suspicious values
   ```
2. All values stored as-is from stderr (no calculations in storage layer)

**Acceptance Criteria**:
- DurationMs stored as milliseconds (int)
- CPUUsageNSec stored as nanoseconds (int, converted from stderr ms × 1,000,000)
- MemoryPeak stored as bytes (int)
- IO and network values stored as bytes (int)
- Log warning if MemoryPeak exceeds system total memory
- Log warning if any metric is negative (invalid)

**Dependencies**: T011 complete → T012 (test) → T013 (implementation)

---

## Phase 5: User Story 3 - Multi-Execution Support [US3]

**User Story**: As a workflow operator, I need to compare systemd properties across multiple executions for trend analysis.

**Independent Test Criteria**:
- Same script executed 3 times produces comparable properties (within 20% variance)
- Each execution stores independent metrics
- ActivityExecution records show different CPUUsageNSec per run

### Tests

- [ ] T014 [P] [US3] Write integration test for multi-execution consistency in tests/integration/workflows/test_script_metrics.py::test_multi_execution_consistency

**Test Scenario**:
```python
async def test_multi_execution_consistency():
    results = []
    for i in range(3):
        result = await execute_bash_script(code="sleep 1; echo done", ...)
        results.append(result["metrics"]["CPUUsageNSec"])

    # Variance < 20%
    mean = statistics.mean(results)
    stdev = statistics.stdev(results)
    assert stdev < mean * 0.2
```

### Implementation

- [ ] T015 [US3] Ensure metrics independence across executions in src/nexus/workflows/workflow_engine/activities/script_activity.py

**Changes**:
- Systemd unit name includes unique execution ID (automatic with --wait)
- Each subprocess creates new transient service (automatically isolated)
- Verify no state pollution between executions

**Acceptance Criteria**:
- Concurrent executions don't interfere with each other's properties
- Transient systemd services automatically cleaned up after --wait completes
- No cgroup orphans left behind
- Each execution has independent metrics dict

**Dependencies**: T011 complete → T014 (test) → T015 (implementation)

---

## Phase 6: User Story 4 - Failed Task Metrics [US4]

**User Story**: As a developer, I need systemd properties from failed script executions to debug performance issues.

**Independent Test Criteria**:
- Failed script (exit code 1) still has metrics populated
- MemoryError script shows high MemoryPeak before failure
- Properties captured up to point of failure

### Tests

- [ ] T016 [P] [US4] Write integration test for failed script metrics in tests/integration/workflows/test_script_metrics.py::test_failed_script_metrics

**Test Scenario**:
```python
async def test_failed_script_metrics():
    with pytest.raises(ScriptExecutionError):
        result = await execute_python_script(
            code="import sys; sys.exit(1)",
            ...
        )

    # Properties still captured before exception
    assert result["metrics"] is not None
    assert "CPUUsageNSec" in result["metrics"]
```

### Implementation

- [ ] T017 [US4] Ensure metrics collected before raising ScriptExecutionError in src/nexus/workflows/workflow_engine/activities/script_activity.py

**Changes**:
1. Parse stderr and collect properties even when returncode != 0
2. Store properties in result dict before checking exit code
3. Include properties in ScriptExecutionError exception data

**Acceptance Criteria**:
- Properties parsed from stderr regardless of exit code
- ScriptExecutionError raised after properties stored
- ActivityExecution record contains both error_details and metrics

**Dependencies**: T011 complete → T016 (test) → T017 (implementation)

---

## Phase 7: User Story 5 - Edge Cases [US5]

**User Story**: As a workflow operator, I need edge cases handled gracefully (cancelled, skipped, no I/O, systemd unavailable).

**Independent Test Criteria**:
- Cancelled task: metrics may be {} (best-effort)
- Skipped task: metrics = {} (never executed)
- No I/O task: IOReadBytes/IOWriteBytes omitted (missing "IO Bytes" line in stderr)
- systemd unavailable: metrics = {}, execution succeeds

### Tests

- [ ] T018 [P] [US5] Write test for script with no I/O in tests/integration/workflows/test_script_metrics.py::test_no_io_edge_case

**Test Scenario**:
```python
async def test_no_io_edge_case():
    result = await execute_bash_script(code="echo 'Hello World'", ...)
    # No IO Bytes line in stderr means IOReadBytes/IOWriteBytes omitted
    assert "IOReadBytes" not in result["metrics"]
    assert "IOWriteBytes" not in result["metrics"]
```

- [ ] T019 [P] [US5] Write test for cancelled task in tests/integration/workflows/test_script_metrics.py::test_cancelled_task

- [ ] T020 [P] [US5] Write test for systemd unavailable fallback in tests/integration/workflows/test_script_metrics.py::test_systemd_unavailable

**Test Scenario**:
```python
async def test_systemd_unavailable(monkeypatch):
    monkeypatch.setattr("script_activity.SYSTEMD_RUN_AVAILABLE", False)
    result = await execute_bash_script(code="echo test", ...)
    assert result["metrics"] == {}
    assert result["stdout"] == "test\n"  # Execution still works
```

### Implementation

- [ ] T021 [US5] Add comprehensive edge case handling in src/nexus/workflows/workflow_engine/activities/systemd_metrics.py

**Error Handling Strategy** (best-effort properties):
```python
try:
    # Wrap command with systemd-run --wait
    # Parse stderr properties
    # Store in metrics
except FileNotFoundError:
    # systemd-run not found
    logger.warning("systemd-run unavailable, systemd properties not collected")
    metrics = {}
except Exception as e:
    # Parsing errors, systemd failures
    logger.error(f"Systemd property collection failed: {e}")
    metrics = {}
finally:
    # Execution always continues
    return {
        "stdout": stdout,
        "stderr": script_stderr,  # Systemd lines removed
        "return_code": returncode,
        "metrics": metrics
    }
```

**Acceptance Criteria**:
- Missing "IO Bytes" line → IOReadBytes/IOWriteBytes omitted from dict
- Missing "IP Traffic" line → IPIngressBytes/IPEgressBytes omitted from dict
- Cancelled mid-execution → metrics = {} (parsing failed)
- Skipped activity → never calls property collection
- systemd-run unavailable → fallback to direct execution, metrics = {}
- All errors logged but never block execution

**Dependencies**: T011 complete → T018-T020 (tests in parallel) → T021 (implementation)

---

## Phase 8: Polish & Cross-Cutting Concerns

**Goal**: Documentation, performance validation, systemd property validation

### Documentation

- [ ] T022 [P] Add module docstring to src/nexus/workflows/workflow_engine/activities/systemd_metrics.py

**Docstring to add**:
```python
"""Script task execution activities with resource metrics collection.

This module provides bash and Python script execution capabilities with automatic
resource consumption metrics collection via systemd-run --wait.

Property Collection:
    - Uses systemd-run --wait to wrap script execution
    - Parses stderr output for systemd properties (DurationMs, CPUUsageNSec, MemoryPeak, etc.)
    - Stores property names matching systemd property names exactly (see data-model.md)
    - Transformation to ANSTRAT-1748 happens in separate event emission spec
    - Best-effort collection: execution never fails due to property collection errors

Data Source:
    - systemd-run --wait stderr output (NOT systemctl show)
    - Properties appear at end of stderr after command completes
    - Format documented in systemd.resource-control(5)

Requirements:
    - Linux with systemd (properties unavailable on other platforms)
    - cgroups v2 accounting enabled (CPUAccounting, MemoryAccounting, etc.)

Fallback Behavior:
    - If systemd-run unavailable: direct subprocess execution, metrics={}
    - If parsing fails: log error, set metrics={}, continue execution
"""
```

- [ ] T023 [P] Add inline documentation for metric parsing regex patterns in src/nexus/workflows/workflow_engine/activities/systemd_metrics.py

**Comments to add**:
```python
# Regex patterns for systemd-run --wait stderr output
# Format documented in systemd.resource-control(5) and data-model.md

PATTERN_RUNTIME = r"Service runtime: (\d+)ms"  # Total execution duration
PATTERN_CPU = r"CPU time consumed: (\d+)ms"     # Total CPU time (user + system)
PATTERN_MEMORY = r"Memory peak: ([\d.]+)([KMGT]?) \(swap: ([\d.]+)([KMGT]?)\)"  # Peak RSS and swap
PATTERN_NETWORK = r"IP Traffic: received ([\d.]+)([KMGT]?), sent ([\d.]+)([KMGT]?)"  # Network rx/tx
PATTERN_IO = r"IO Bytes: read ([\d.]+)([KMGT]?)(?:, write ([\d.]+)([KMGT]?))?"  # Disk I/O (write optional)
```

- [ ] T024 [P] Update AGENTS.md via `.specify/scripts/bash/update-agent-context.sh claude`

**Execution**:
```bash
.specify/scripts/bash/update-agent-context.sh claude
```

**Expected Updates**:
- Add note: "Script activities collect systemd properties via systemd-run --wait (Linux only)"
- Add note: "Properties stored with systemd property naming (DurationMs, CPUUsageNSec, MemoryPeak, etc.)"
- Add note: "Data source: systemd-run --wait stderr output (NOT systemctl show)"
- Preserve manual additions between markers

### OpenAPI Schema

- [ ] T025 [P] Update ActivityExecution schema in src/nexus/schemas/workflows/shared-schemas.yaml

**Changes required**:
- Add `ScriptMetrics` component schema with systemd property fields (DurationMs, CPUUsageNSec, MemoryPeak, etc.)
- Add `metrics` field to `ActivityExecution` schema referencing `ScriptMetrics`

### Schema Validation

- [ ] T026 [P] Write schema validation test for ActivityExecution.metrics in tests/unit/models/test_activity_execution.py

**Test Coverage**:
```python
def test_metrics_schema():
    """Verify metrics uses stderr-based property names."""
    properties = {
        "DurationMs": 1250,
        "CPUUsageNSec": 987,
        "MemoryPeak": 20971520,
        "MemoryCurrent": 0,
        "IPIngressBytes": 18900,
        "IPEgressBytes": 3200,
        "IOReadBytes": 1048576,
        "IOWriteBytes": 524288
    }

    # Expected property names (matching systemd property names exactly)
    expected_properties = [
        "DurationMs", "CPUUsageNSec",
        "MemoryPeak", "MemoryCurrent",
        "IPIngressBytes", "IPEgressBytes",
        "IOReadBytes", "IOWriteBytes"
    ]

    # Field types correct (all integers in milliseconds or bytes)
    assert isinstance(properties["DurationMs"], int)
    assert isinstance(properties["CPUUsageNSec"], int)
    assert isinstance(properties["MemoryPeak"], int)
    assert isinstance(properties["IOReadBytes"], int)
```

### Performance & Conformance

- [ ] T027 Run quickstart.md Scenario 8 (performance validation <1% overhead)

**Execution**:
1. Follow quickstart.md Scenario 8 instructions
2. Execute script 10 times with systemd-run metrics
3. Execute same script 10 times without systemd-run (if possible via feature flag)
4. Calculate overhead percentage
5. Verify overhead < 1%

**Expected Benchmark**:
- 100ms script: +0.2ms overhead (0.2%)
- 1s script: +1ms overhead (0.1%)
- 10s script: +5ms overhead (0.05%)

**Acceptance Criteria**: Overhead < 1% for scripts > 100ms duration

- [ ] T028 Validate systemd property naming conformance

**Validation Checklist**:
- [ ] Property field names match systemd property names exactly: `DurationMs`, `CPUUsageNSec`, `MemoryPeak`, etc.
- [ ] Field names use CamelCase (matching stderr output, not snake_case)
- [ ] All collected properties present in metrics dict
- [ ] Collection methodology: "at task completion via systemd-run --wait stderr parsing" (not continuous sampling, not systemctl show)
- [ ] Properties source: systemd resource accounting (cgroups v2)

- [ ] T029 Run all quickstart.md scenarios (1-7) and verify success criteria

**Validation Checklist**:
- [ ] Scenario 1: ✅ Completed task has metrics with stderr-based property names
- [ ] Scenario 2: ✅ Multi-script workflow shows resource differences
- [ ] Scenario 3: ✅ Trend analysis across 5 executions (variance < 20%)
- [ ] Scenario 4: ✅ Failed task properties captured before failure
- [ ] Scenario 5: ✅ Skipped task has metrics = {}
- [ ] Scenario 6: ✅ Status filter works with metrics
- [ ] Scenario 7: ✅ Pagination works (100 activities)

**Dependencies**: All implementation tasks complete → T022-T026 (parallel) → T027-T029 (sequential validation)

---

## Dependencies Summary

**Critical Path** (Sequential):
```
T001 → T007 → T008 → T011 → T021 → T027 → T028 → T029
```
**Length**: 8 tasks

**Parallel Clusters**:
1. **Setup Phase** (after T001): T002, T003 (2 tasks)
2. **Unit Tests** (after foundational): T004, T005, T006 (3 tasks)
3. **User Story Tests** (after T011): T009, T010, T012, T014, T016, T018, T019, T020 (8 tasks)
4. **Documentation** (after T021): T022, T023, T024, T025, T026 (5 tasks)

**Total Parallelizable**: 18 of 29 tasks (62%)

---

## Parallel Execution Opportunities

### Setup Phase (2 tasks in parallel)
```bash
# After T001 migration completes
Task T002: "Create systemd stderr fixtures"
Task T003: "Create base metrics test class"
```

### Foundational Tests (3 tasks in parallel)
```bash
Task T004: "Unit tests for _parse_size()"
Task T005: "Unit tests for _parse_metrics()"
Task T006: "Unit tests for _extract_script_stderr()"
```

### User Story Tests (8 tasks in parallel after T011)
```bash
Task T009: "Bash script integration test"
Task T010: "Python script integration test"
Task T012: "Resource validation test"
Task T014: "Multi-execution consistency test"
Task T016: "Failed script metrics test"
Task T018: "No I/O edge case test"
Task T019: "Cancelled task test"
Task T020: "Systemd unavailable test"
```

### Documentation (4 tasks in parallel)
```bash
Task T022: "Add systemd_metrics.py docstring"
Task T023: "Add parsing regex comments"
Task T024: "Update AGENTS.md"
Task T026: "Schema conformance test"
```

---

## Implementation Strategy

### MVP Scope (Minimum Viable Product)
**Estimated**: 1 day
- **Tasks**: T001-T011 (11 tasks)
- **Deliverable**: Basic metrics collection for bash/python scripts
- **Demo**: Execute script via Temporal workflow, retrieve ActivityExecution with metrics

**Scope**:
- Database migration applied
- Parsing functions implemented
- systemd-run integration working
- Properties stored in ActivityExecution.metrics

**Out of MVP**:
- Edge case handling (systemd unavailable fallback)
- Performance validation
- Comprehensive documentation

### Phase 1 Complete (Production-Ready)
**Estimated**: 2 days
- **Tasks**: T001-T021 (21 tasks)
- **Deliverable**: All user stories implemented with edge case handling
- **Demo**: All quickstart scenarios 1-5 pass

**Added in Phase 1**:
- US2: Resource validation
- US3: Multi-execution support
- US4: Failed task metrics
- US5: Edge case handling

### Full Feature Complete
**Estimated**: 2-3 days
- **Tasks**: T001-T029 (all 29 tasks)
- **Deliverable**: Validated, documented, production-ready feature
- **Demo**: All 8 quickstart scenarios pass, <1% overhead confirmed

**Added in Final Phase**:
- Complete documentation
- Schema conformance validation
- Performance benchmarking
- All quickstart scenarios passing

---

## Validation Checklist

*GATE: All must pass before marking feature complete*

- [ ] **All tests pass**: `make test-all` exits 0
- [ ] **Code quality**: `make lint` exits 0
- [ ] **Type checking**: `make typecheck` exits 0
- [ ] **Database migration**: `alembic upgrade head` succeeds without errors
- [ ] **Quickstart scenarios**: All 8 scenarios in quickstart.md pass
- [ ] **Performance**: T027 confirms <1% overhead (target: <0.1% per research)
- [ ] **Stderr naming**: T028 confirms property names match systemd property names (DurationMs, CPUUsageNSec, MemoryPeak, etc.)
- [ ] **Constitution compliance**:
  - SQLModel used for ActivityExecution extension ✓
  - DRY: Shared parsing functions ✓
  - SOLID: Single responsibility per function ✓
  - Dependency Injection: systemd availability runtime-checked ✓
- [ ] **No breaking changes**: Existing ActivityExecution tests still pass
- [ ] **Backward compatibility**: Old records work (metrics defaults to {})

---

## Notes

**[P] Marker**: Task can run in parallel (different files, no dependencies)

**TDD Workflow**:
1. Write test (RED phase - must fail initially)
2. Implement minimal code to pass test (GREEN phase)
3. Refactor for quality (REFACTOR phase - DRY, SOLID)
4. Commit with message: `feat(028): [Task ID] Description`

**File Paths**:
- Models: `src/nexus/workflows/models/activity_execution.py`
- Metrics module: `src/nexus/workflows/workflow_engine/activities/systemd_metrics.py`
- Activities: `src/nexus/workflows/workflow_engine/activities/script_activity.py`
- Migrations: `src/nexus/migrations/versions/`
- Unit tests: `tests/unit/workflows/`
- Integration tests: `tests/integration/workflows/`
- Fixtures: `tests/fixtures/`

**Architecture Principles** (from constitution):
- **SQLModel**: Extend existing ActivityExecution model (no separate Pydantic models)
- **DRY**: Extract `_parse_metrics()` shared by bash and python execution paths
- **SOLID**: Parser functions have single responsibility (parsing only, not execution)
- **Dependency Injection**: systemd-run availability checked at runtime, fallback injectable
- **Composition**: Property collection composed with execution, not inherited

**Approved Approach**:
- **Method**: systemd-run --wait with stderr parsing (NOT --scope, NOT systemctl show)
- **Overhead**: <0.1% measured (target <1%)
- **Complexity**: 50 lines of parsing code
- **Dependencies**: Zero (systemd is standard on Linux)
- **Data Source**: systemd-run --wait stderr output at task completion

**Avoid**:
- ❌ Using `systemd-run --scope --wait` (flags are mutually exclusive - use --wait only)
- ❌ Using `systemctl show` (returns `[not set]` even with accounting enabled)
- ❌ Direct cgroup file reading (unnecessary complexity, systemd handles this)
- ❌ Separate Pydantic models (use SQLModel's unified approach)
- ❌ Skipping tests (TDD required per constitution)
- ❌ Vague tasks like "Add metrics support"
- ❌ Same file conflicts (mark same-file tasks sequential, not [P])

---

**Generated**: 2026-02-13
**Total Tasks**: 29
**User Stories**: 5 (US1-US5)
**Estimated Effort**: 1-2 days (single developer, per approved research)
**Critical Path Length**: 8 tasks
**Parallel Opportunities**: 17 tasks (61%)
**Approved Approach**: systemd-run --wait with stderr parsing

**Tasks ready for execution. Next: Begin with T001 (database migration) or execute MVP scope (T001-T011) for rapid delivery.**
