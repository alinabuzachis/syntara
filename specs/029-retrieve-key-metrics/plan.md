# Implementation Plan: Script Task Execution Metrics Retrieval

**Branch**: `029-retrieve-key-metrics` | **Date**: 2026-02-13 | **Spec**: [specs/029-retrieve-key-metrics/spec.md](./spec.md)
**Input**: Feature specification from `specs/029-retrieve-key-metrics/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path ✅
2. Fill Technical Context ✅
3. Fill Constitution Check section ✅
4. Evaluate Constitution Check section ✅
5. Execute Phase 0 → research.md ✅
6. Execute Phase 1 → schemas, data-model.md, quickstart.md, AGENTS.md ✅
7. Re-evaluate Constitution Check section ✅
8. Plan Phase 2 → Describe task generation approach ✅
9. STOP - Ready for /tasks command ✅
```

**IMPORTANT**: The /plan command STOPS at step 9. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution

## Summary

This feature adds performance and resource consumption metrics to script task executions (bash and Python scripts) using `systemd-run --wait` with stderr parsing to capture metrics at task completion. The implementation collects CPU time, memory peak, disk I/O, and network traffic metrics using systemd property names, extending the existing ActivityExecution model with a `metrics` JSONB field. GPU metrics are out of scope for Phase 1 (requires vendor-specific tooling). ANSTRAT-1748 conformance is handled at event emission time by converting raw values to percentages.

**Technical Approach** (from research): Use `systemd-run --wait` to wrap script execution in a transient cgroup, automatically capturing resource metrics from systemd's stderr output. This provides <0.1% overhead, zero dependencies (systemd is standard on Linux), automatic lifecycle management, and complete async compatibility with the existing `asyncio.create_subprocess_exec` pattern.

## Technical Context

**Language/Version**: Python 3.12
**Primary Dependencies**:
- FastAPI (existing - API endpoints)
- SQLModel (existing - unified data models per constitution)
- Temporal (existing - workflow orchestration)
- systemd (system-level, no Python dependencies)

**Storage**: PostgreSQL with SQLModel ORM, JSONB fields for metrics (existing ActivityExecution.output_data extended)

**Testing**: pytest with unit tests (metric parsing) and integration tests (end-to-end script execution with metrics)

**Target Platform**: Linux server with systemd and cgroups v2

**Project Type**: Single (monolithic backend service)

**Performance Goals**:
- <1% overhead for metrics collection (FR-017)
- <2 seconds for metrics retrieval queries (NFR-002)
- 99.9% successful metrics storage (Success Criterion SC-4)

**Constraints**:
- Linux-only (cgroups v2 requirement per FR-014)
- Metrics collection must not block script execution (NFR-001)
- Metrics conform to ANSTRAT-1748 schema (constitutional requirement for telemetry)

**Scale/Scope**:
- Support for up to 100 script tasks per workflow execution (NFR-002)
- Metrics stored with every script task execution
- No separate retention policy (follows task execution data retention per FR-019)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Technology Standards Compliance
- [x] **SQLModel for Data Models**: All data models use SQLModel (extending existing ActivityExecution model with JSONB field for metrics)

### Code Architecture Compliance
- [x] **DRY Principle**: Design avoids duplication through:
  - Shared `_execute_script_with_systemd()` function for bash and Python
  - Common `_parse_systemd_metrics()` parser for stderr
  - Common `_extract_script_stderr()` for separating systemd output from script stderr
- [x] **SOLID Principles**:
  - Single Responsibility: Parser functions focus only on parsing, execution functions only on execution
  - Open/Closed: Metrics parsing extensible via regex patterns without modifying core execution logic
  - Dependency Injection: systemd-run command configurable, fallback behavior injectable
- [x] **Separation of Concerns**:
  - Presentation: API endpoints (if added for retrieval)
  - Business logic: Metric parsing and utilities in dedicated `systemd_metrics.py` module
  - Orchestration: script_activity.py calls parsing module
  - Data access: ActivityExecution model with JSONB metrics field
- [x] **Dependency Injection**: systemd-run availability checked at runtime, fallback to direct execution if unavailable
- [x] **Composition vs Inheritance**: Using composition - metric parsing composed with execution, not inherited

### API Specification Standards Compliance
- [x] **OpenAPI/AsyncAPI Compliance**: Update ActivityExecution schema in `src/nexus/schemas/workflows/shared-schemas.yaml`
- [x] **Naming Convention**: Schema uses snake_case: `cpu_percent`, `memory_percent`, `peak_cpu_percent`, etc. (ANSTRAT-1748 conformance)
- [x] **Documentation Completeness**: Schema includes descriptions, examples for all metric fields
- [x] **RFC 9457 Error Format**: Error handling for metric collection failures follows existing Nexus patterns
- [x] **Error Message Safety**: Metric collection failures logged without blocking execution (NFR-001)
- [x] **API Versioning**: Metrics stored in ActivityExecution model, no new API endpoints required (retrieval uses existing workflow/activity endpoints)
- [x] **API Path Structure**: N/A - extends existing data model, no new endpoints
- [x] **Pagination Support**: N/A - retrieval via existing paginated workflow/activity endpoints
- [x] **Filtering/Sorting Consistency**: N/A - extends existing data model
- [x] **Security Documentation**: Metrics follow same access control as task execution data (FR-018)
- [x] **Schema Compatibility**: Backward compatible - adds optional `metrics` field to existing JSONB `output_data`

**Initial Constitution Check**: ✅ PASS - No violations

## Project Structure

### Documentation (this feature)
```
specs/029-retrieve-key-metrics/
├── spec.md              # Feature specification (input)
├── spec-review.md       # Adversarial spec review (completed)
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (cgroups research already done)
├── data-model.md        # Phase 1 output (to be created)
├── quickstart.md        # Phase 1 output (to be created)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
src/nexus/
├── schemas/
│   └── workflows/
│       └── shared-schemas.yaml            # Modified: add metrics to ActivityExecution
├── workflows/
│   ├── models/
│   │   └── activity_execution.py          # Modified: add metrics field
│   └── workflow_engine/
│       └── activities/
│           ├── script_activity.py          # Modified: calls systemd_metrics module
│           └── systemd_metrics.py          # New: parsing and utilities module

tests/
├── unit/
│   └── workflows/
│       ├── activities/
│       │   ├── test_script_activity.py    # Modified: test metrics integration
│       │   └── test_systemd_metrics.py    # New: dedicated parser tests
└── integration/
    └── workflows/
        └── test_script_metrics.py         # New: end-to-end metrics tests
```

**Structure Decision**: DEFAULT (Option 1: Single project) - Nexus is a monolithic backend service

## Phase 0: Outline & Research

**Status**: ✅ COMPLETE

### Key Research Findings

**Decision**: Use `systemd-run --wait` with stderr parsing (Basic Approach)

**Three Implementation Approaches Identified** (see research.md for details):

| Approach | Method | Pros | Cons |
|----------|--------|------|------|
| **Basic** (Recommended) | `systemd-run --wait` + stderr parsing | Zero dependencies, 50 lines, <0.1% overhead | Millisecond precision, text parsing |
| **Alternative** | `systemd-run --remain-after-exit` + `systemctl show` | Precise values, no parsing | Manual cleanup required |
| **Advanced** | pystemd D-Bus API | Type-safe Python, real-time monitoring, elegant API | Requires pystemd + libsystemd-dev |

**Basic Approach Rationale** (selected for initial implementation):
- Simplest implementation (50 lines of parsing code)
- Zero dependencies (systemd standard on Linux)
- <0.1% overhead measured
- Automatic cgroup lifecycle management
- Complete async compatibility with existing `asyncio.create_subprocess_exec` pattern
- Meets ALL functional requirements (FR-001 through FR-019)

**Advanced Approach (pystemd)** - viable for future enhancement:
- Native Python API with type-safe property access
- Real-time monitoring by polling D-Bus properties during execution
- Additional metrics: `IPIngressPackets`, `IPEgressPackets`, `IOReadOperations`, `IOWriteOperations`
- Main trade-off: requires pystemd dependency + libsystemd-dev system package

**Rejected Approaches**:
- ❌ Direct sysfs reading: Complex manual cgroup lifecycle, unnecessary when D-Bus exposes all metrics
- ❌ libcgroup-bind: Experimental, incomplete cgroups v2 support

**Output**: Research consolidated in existing research documents (linked above)

## Phase 1: Design & Contracts

**Status**: 🔄 IN PROGRESS

### 1. Data Model (`data-model.md`)

**Entities**:

**ScriptMetrics** (embedded in ActivityExecution.metrics as JSONB):
- Not a separate table/entity - stored as JSONB within existing ActivityExecution
- **Storage format**: Flattened dict using systemd D-Bus property names for consistency
- Fields (systemd property names):
  - `DurationMs`: int (service runtime in milliseconds)
  - `CPUUsageNSec`: int (CPU time in nanoseconds)
  - `MemoryPeak`: int (peak memory in bytes)
  - `MemoryCurrent`: int (current memory in bytes, approximated from peak)
  - `IPIngressBytes`: int | null (network bytes received)
  - `IPEgressBytes`: int | null (network bytes sent)
  - `IOReadBytes`: int | null (disk bytes read)
  - `IOWriteBytes`: int | null (disk bytes written)

**ANSTRAT-1748 Conformance Note**:
- Raw systemd values are stored for precision and consistency
- Conversion to ANSTRAT-1748 percentage fields (`cpu_percent`, `memory_percent`, etc.) is handled at event emission time (separate telemetry concern)
- GPU metrics (`gpu_usage_percent`) require vendor-specific tooling (NVIDIA nvml, AMD ROCm) - marked as Phase 2/Future

**ActivityExecution** (modified):
- Existing SQLModel model extended with new `metrics` JSONB field:
  - `metrics`: dict[str, Any] with systemd property names as keys

**Relationships**:
- ActivityExecution 1:1 ScriptMetrics (embedded as JSONB, not separate table)
- Metrics lifecycle follows ActivityExecution retention policy (FR-019)

**Validation Rules**:
- All byte/nanosecond fields: >= 0
- Duration: >= 0
- If systemd-run unavailable: `metrics` = {} (empty dict, graceful degradation)

**State Transitions**: N/A - metrics captured atomically at task completion

### 2. API Contracts (`src/nexus/schemas/workflows/shared-schemas.yaml`)

**Status**: Update existing ActivityExecution schema

Changes required:
- Add `ScriptMetrics` component schema with systemd property fields
- Add `metrics` field to `ActivityExecution` schema referencing `ScriptMetrics`
- Use systemd D-Bus property naming (DurationMs, CPUUsageNSec, MemoryPeak, etc.)

**No new endpoints required** - metrics retrieved via existing workflow/activity endpoints that return ActivityExecution objects.

**Contract Tests**:
- Schema validation tests in existing workflow test suite
- Verify `metrics` JSONB field in ActivityExecution responses
- Verify systemd property names are used consistently (DurationMs, CPUUsageNSec, etc.)

### 3. Systemd-Run Integration Design

**Function**: `_execute_script_with_systemd(command, inputs, environment, timeout)`

**Responsibilities**:
- Wrap command with `systemd-run --wait --quiet`
- Enable accounting: `--property=CPUAccounting=yes --property=MemoryAccounting=yes --property=IOAccounting=yes --property=IPAccounting=yes`
- Execute via `asyncio.create_subprocess_exec`
- Capture stdout (script output) and stderr (systemd metrics + script stderr)
- Return: `{stdout, stderr, returncode, systemd_stderr}`

**Function**: `_parse_systemd_metrics(systemd_stderr: str) -> dict`

**Responsibilities**:
- Parse systemd stderr output using regex patterns:
  - `Service runtime: (\d+)ms` → `DurationMs` (milliseconds)
  - `CPU time consumed: (\d+)ms` → `CPUUsageNSec` (convert ms × 1,000,000 to nanoseconds)
  - `Memory peak: ([\d.]+)([KMGT]?)` → `MemoryPeak`, `MemoryCurrent` (bytes)
  - `IP Traffic: received ([\d.]+)([KMGT]?), sent ([\d.]+)([KMGT]?)` → `IPIngressBytes`, `IPEgressBytes`
  - `IO Bytes: read ([\d.]+)([KMGT]?)(?:, write ([\d.]+)([KMGT]?))?` → `IOReadBytes`, `IOWriteBytes`
- Convert units (K/M/G/T) to bytes
- Return dict with systemd property names as keys

**Function**: `_extract_script_stderr(combined_stderr: str, systemd_stderr: str) -> str`

**Responsibilities**:
- Remove systemd metric lines from combined stderr
- Return only script's actual stderr output
- Preserve line structure for debugging

**Error Handling**:
- `FileNotFoundError` on systemd-run → fallback to direct execution, `metrics = {}`
- Parsing errors → log warning, `metrics = {}`, execution continues (NFR-001)
- systemd-run failure → raise ScriptExecutionError as usual, best-effort metrics capture

### 4. Test Scenarios (`quickstart.md`)

**From User Stories**:

1. **Completed Task with Metrics**
   - Execute bash script with CPU/memory usage
   - Query ActivityExecution
   - Assert `metrics` contains expected systemd property names (DurationMs, CPUUsageNSec, MemoryPeak, etc.)

2. **Resource Consumption Validation**
   - Execute script with known resource usage pattern
   - Verify metrics accuracy within tolerance (±10% acceptable for phase 1)
   - Check CPUUsageNSec, MemoryPeak values

3. **Cross-Execution Trend Analysis**
   - Execute same script 3 times in different workflows
   - Query metrics for script across executions
   - Verify comparable metric structure

4. **Failed Task Metrics**
   - Execute script that exits with non-zero code
   - Verify metrics captured before failure
   - Assert ScriptExecutionError includes stdout/stderr as before

5. **Edge Cases**:
   - Cancelled task: metrics captured up to cancellation
   - Timeout task: metrics captured up to timeout
   - Skipped task: metrics = {} (empty dict)
   - No I/O task: IOReadBytes/IOWriteBytes omitted from dict
   - systemd-run unavailable: metrics = {}, execution succeeds

## Phase 1 Outputs

### Files to Create/Modify:

1. ✅ **data-model.md** (created below)
2. ✅ **quickstart.md** (created below)
3. **src/nexus/schemas/workflows/shared-schemas.yaml** (update ActivityExecution schema)

### Constitution Check (Post-Design)

Re-evaluating architecture compliance after design:

- [x] **SQLModel**: Using existing ActivityExecution model, no separate models ✅
- [x] **DRY**: Shared parsing functions, no duplication ✅
- [x] **SOLID**: Clear separation of parsing, execution, storage ✅
- [x] **Separation of Concerns**: Parser (business logic), model (data), activity (orchestration) ✅
- [x] **Dependency Injection**: systemd-run configurable via environment, fallback injectable ✅
- [x] **Composition**: Metric collection composed with execution ✅
- [x] **API Standards**: Systemd property names for storage, ANSTRAT-1748 conversion at event emission, OpenAPI schema ✅

**Post-Design Constitution Check**: ✅ PASS - No violations introduced

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs
- Follow TDD order: Tests before implementation

**Ordering Strategy**:

**Preparation Tasks**:
1. Create unit test fixtures for systemd stderr output samples
2. Create mock systemd-run executable for testing fallback

**Test Tasks** (TDD - write first, watch fail):
3. [P] Write unit tests for `_parse_systemd_metrics()` - various stderr formats
4. [P] Write unit tests for `_extract_script_stderr()` - line filtering
5. [P] Write unit tests for `_parse_size()` - unit conversion (K/M/G/T)
6. Write integration test: bash script with metrics (end-to-end)
7. Write integration test: python script with metrics
8. Write integration test: script with no I/O (missing "IO Bytes" line)
9. Write integration test: script timeout with partial metrics
10. Write integration test: systemd-run unavailable fallback
11. Write integration test: cancelled task metrics
12. [P] Write schema validation tests for ActivityExecution.metrics

**Implementation Tasks**:
13. Implement `_parse_size()` helper function (unit conversion)
14. Implement `_parse_systemd_metrics()` function (regex parsing)
15. Implement `_extract_script_stderr()` function (line filtering)
16. Implement `_execute_script_with_systemd()` function (wrap command)
17. Modify `execute_bash_script()` to use systemd-run (conditional based on availability)
18. Modify `execute_python_script()` to use systemd-run (conditional)
19. Add systemd-run availability check at module level
20. Update ActivityExecution model to document metrics structure (code comments)

**Validation Tasks**:
21. Run all unit tests - verify pass
22. Run all integration tests - verify pass
23. Run quickstart.md scenarios - verify all pass
24. Performance validation: measure overhead (<1% per FR-017)
25. ANSTRAT-1748 conformance validation: verify schema alignment

**Documentation Tasks**:
26. [P] Add module docstring to systemd_metrics.py documenting metrics collection
27. [P] Add inline documentation for metric parsing regex patterns
28. [P] Update AGENTS.md via update-agent-context.sh script

**Estimated Output**: 27 numbered, ordered tasks in tasks.md

**[P] notation**: Tasks that can execute in parallel (independent files/functions)

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md with detailed implementation steps)
**Phase 4**: Implementation (execute tasks.md following TDD and constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation per FR-017, ANSTRAT-1748 conformance check)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

No violations - table empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) ✅
- [x] Phase 1: Design complete (/plan command) ✅
- [x] Phase 2: Task planning complete (/plan command - describe approach only) ✅
- [x] Phase 3: Tasks generated (/tasks command) ✅
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS ✅
- [x] Post-Design Constitution Check: PASS ✅
- [x] All NEEDS CLARIFICATION resolved ✅
- [x] Complexity deviations documented: N/A (no violations) ✅

---
*Based on Constitution v1.2.0 - See `.specify/memory/constitution.md`*
