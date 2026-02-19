# Feature Specification: Script Task Execution Metrics Retrieval

**Feature Branch**: `029-retrieve-key-metrics`
**Created**: 2026-02-11
**Status**: Draft
**Input**: User description: "Retrieve key metrics from task execution" (scope: script tasks only)

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

---

## Executive Summary

This feature adds performance and resource consumption metrics to script task executions within workflows. Currently, script tasks already capture basic output data (stdout, stderr, exit code, start/end timestamps, retry count, iteration number) as part of their execution results. This feature complements that existing data by adding:

- **Timing metrics**: execution duration (calculated from existing start/end timestamps)
- **Resource consumption**: CPU, memory, GPU, disk I/O, network throughput (average and peak values)

These metrics provide visibility into script execution performance characteristics and support performance monitoring, debugging, optimization, and compliance with performance targets defined in related specifications.

This feature focuses specifically on **script task execution metrics** (bash and Python scripts executed via script_activity.py) rather than API calls, agent invocations, workflow-level metrics, or system-level metrics.

### What's New vs. What Already Exists

**Already Captured** (in script_activity.py and ActivityExecution model):
- ✅ stdout content
- ✅ stderr content
- ✅ exit code (return_code)
- ✅ Basic task status (pending, running, completed, failed, etc.)
- ✅ Start timestamp (started_at)
- ✅ End timestamp (completed_at)
- ✅ Retry count (retry_count)
- ✅ Iteration number for loops (iteration)

**NEW - Being Added by This Feature**:
- 🆕 Timing: execution duration in milliseconds (calculated from existing timestamps)
- 🆕 Resource consumption: CPU%, memory%, GPU%, disk I/O, network throughput (all with peak values)

### ANSTRAT-1748 Conformance

This feature implements the `resource_utilization` event schema defined in ANSTRAT-1748 (Analytic Events Specification) at **script task execution granularity**.

**Key Alignment Points**:
- ANSTRAT-1748 defines workflow-level resource metrics (1 event per workflow execution with aggregated metrics)
- This spec captures the **same metric schema** at individual script task level to enable task-level performance analysis
- Metric field names conform to ANSTRAT-1748 schema: `cpu_percent`, `memory_percent`, `peak_cpu_percent`, `peak_memory_percent`, `gpu_usage_percent`, `disk_io_bytes`, `network_throughput_bytes`
- Collection methodology: Metrics are captured **at script task completion** using OS resource accounting (e.g., cgroups v2 on Linux)
- Performance requirement aligns with ANSTRAT-1748: metrics collection must have no measurable impact on execution performance

**Relationship to ANSTRAT-1748**:
- ANSTRAT-1748: Workflow-level telemetry for business intelligence and operational monitoring
- Spec 028 (this spec): Task-level granularity of same metrics for performance engineering and debugging
- Both specs use identical metric definitions to ensure consistency across aggregation levels

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story

As a workflow operator or performance engineer, I need to retrieve detailed metrics from script task executions so that I can monitor script performance, identify resource-intensive scripts, debug script failures, and verify that scripts meet performance targets.

### Acceptance Scenarios

**Note**: Script tasks already capture stdout, stderr, exit code, start/end timestamps, retry count, and iteration number. These scenarios focus on the NEW metrics being added.

1. **Given** a script task has completed execution, **When** I query the task's metrics, **Then** I receive NEW metrics including execution duration and resource consumption data.

2. **Given** a script task has completed, **When** I query its resource consumption metrics, **Then** I receive CPU percentage, memory percentage, peak CPU, peak memory, disk I/O bytes, and network throughput bytes.

3. **Given** I need to analyze script performance over time, **When** I query metrics for a specific script task across multiple workflow executions, **Then** I receive comparable metrics for trend analysis.

4. **Given** a script task has failed, **When** I query its metrics, **Then** I receive timing and resource metrics to aid debugging.

5. **Given** I am monitoring workflow performance, **When** I query metrics for all script tasks in a workflow execution, **Then** I receive individual script metrics for each task.

6. **Given** I need to optimize resource usage, **When** I compare resource metrics across script executions, **Then** I can identify resource-intensive scripts and optimization opportunities.

### Edge Cases

- **Cancelled tasks**: When a script task is cancelled before completion, system captures execution duration up to cancellation and resource consumption from OS accounting if available (per FR-015)
- **Timeout tasks**: When a script task times out, system captures execution duration up to timeout and resource consumption from OS accounting if available (per FR-015)
- **Skipped tasks**: When a script task is skipped due to conditional logic, no resource consumption metrics are recorded (only task status)
- **Crashed tasks**: When a script crashes, system captures execution duration and resource metrics from OS accounting if the accounting data persists after crash (per FR-015)
- **Unavailable metrics**: When specific resource metrics are unavailable (e.g., GPU on non-GPU systems), those metrics are omitted from results (per FR-016)
- **Storage capacity**: System handles metrics storage failures without blocking script execution (per NFR-001)

---

## Requirements *(mandatory)*

### Functional Requirements

#### Core Metrics Capture

**Note**: Start/end timestamps, status, retry count, and iteration number are already captured by ActivityExecution model. The following are NEW metrics:

- **FR-001**: System MUST calculate and store task execution duration in milliseconds (time from started_at to completed_at)

#### Resource Consumption Metrics

**Collection Methodology**: All resource metrics are captured at script task completion by reading OS resource accounting (e.g., cgroups v2 on Linux). No continuous sampling during execution is required.

- **FR-002**: System MUST capture CPU utilization percentage (`cpu_percent` per ANSTRAT-1748 resource_utilization event schema) from OS resource accounting at script task completion
- **FR-003**: System MUST capture memory utilization percentage (`memory_percent` per ANSTRAT-1748) from OS resource accounting at script task completion
- **FR-004**: System MUST capture peak CPU utilization percentage (`peak_cpu_percent` per ANSTRAT-1748) for each task from OS resource accounting at completion
- **FR-005**: System MUST capture peak memory utilization percentage (`peak_memory_percent` per ANSTRAT-1748) for each task from OS resource accounting at completion
- **FR-006**: System MUST capture GPU usage percentage (`gpu_usage_percent` per ANSTRAT-1748) when script tasks utilize GPU resources, from OS resource accounting at completion
- **FR-007**: System MUST capture disk I/O in bytes (`disk_io_bytes` per ANSTRAT-1748) from OS resource accounting at script task completion
- **FR-008**: System MUST capture network throughput in bytes (`network_throughput_bytes` per ANSTRAT-1748) from OS resource accounting at script task completion

#### Metrics Retrieval

- **FR-009**: System MUST provide ability to retrieve metrics for a specific script task execution by task identifier
- **FR-010**: System MUST provide ability to retrieve metrics for all script tasks within a workflow execution
- **FR-011**: System MUST provide ability to filter metrics by task status
- **FR-012**: System MUST provide ability to retrieve metrics for a specific script task across multiple workflow executions
- **FR-013**: System MUST return metrics in a structured, queryable format

#### Platform and Edge Case Handling

- **FR-014**: System MUST collect resource metrics using cgroups v2 on Linux
- **FR-015**: System MUST capture resource metrics for tasks that terminate abnormally (cancelled, timeout, crash) if OS resource accounting data is available at termination time
- **FR-016**: When OS resource accounting is unavailable for a specific resource type (e.g., GPU on non-GPU systems), System MUST omit that metric rather than reporting zero or error values

**Platform Support Note**: Initial implementation supports Linux via cgroups v2. Support for additional platforms (Windows, macOS) may be added in future releases when Nexus platform support expands beyond Linux.

#### Performance and Storage

- **FR-017**: Metrics collection MUST NOT add more than 1% overhead to script execution time (aligns with ANSTRAT-1748 "no measurable impact" requirement)
- **FR-018**: Metrics MUST be available for retrieval for the same duration as task execution results
- **FR-019**: Metrics retention MUST follow the same retention policy as task execution data

### Non-Functional Requirements

- **NFR-001**: Metrics collection failures MUST NOT prevent script task execution or affect task success/failure status
- **NFR-002**: Metrics retrieval queries MUST return results within 2 seconds for single workflow execution (up to 100 script tasks)
- **NFR-003**: System MUST accurately record metrics for all script tasks regardless of parallel execution (no data loss or corruption from concurrent writes)

---

## Success Criteria *(mandatory)*

The feature is successful when:

1. **Metrics Coverage**: All script task executions (bash and Python) capture complete NEW metrics including timing and resource consumption
2. **Performance**: Metrics collection adds less than 1% overhead to script execution time
3. **Query Performance**: Users can retrieve script task metrics for a workflow execution in under 2 seconds
4. **Reliability**: 99.9% of script task executions successfully store NEW metrics alongside existing output data
5. **Usability**: Performance engineers can identify slow scripts, resource-intensive scripts, and bottlenecks from captured metrics
6. **Debugging Value**: Failed script task metrics provide sufficient context to diagnose performance issues (timing, resource usage)
7. **Resource Visibility**: Resource consumption metrics accurately reflect script CPU, memory, disk I/O, and network usage

---

## Key Entities *(mandatory)*

- **ScriptMetrics**: Represents NEW performance and resource metrics that complement existing script execution data. Conforms to ANSTRAT-1748 resource_utilization event schema. Stored alongside existing output data:
  - **Existing data** (already captured): stdout content, stderr content, exit code, status, start timestamp (started_at), end timestamp (completed_at), retry count, iteration number
  - **NEW - Timing information**: execution duration in milliseconds
  - **NEW - Resource consumption** (per ANSTRAT-1748 schema): cpu_percent, memory_percent, peak_cpu_percent, peak_memory_percent, gpu_usage_percent (if applicable), disk_io_bytes, network_throughput_bytes

- **ActivityExecution**: Represents a single execution instance of a script task:
  - Parent workflow execution identifier (existing)
  - Task definition from workflow (activity ID, script code hash) (existing)
  - Input parameters passed as environment variables (existing)
  - **output_data** (existing): stdout, stderr, return_code, parsed output
  - **metrics** (NEW): separate JSONB field containing ScriptMetrics (performance and resource metrics)
  - Correlation identifiers for distributed tracing

---

## Scope and Boundaries

### In Scope
- **Adding performance and resource metrics** to complement existing script execution data (stdout, stderr, exit code, start/end timestamps)
- Capturing resource consumption metrics (CPU, memory, GPU, disk I/O, network throughput) with peak values
- Timing metric: execution duration calculated from existing timestamps
- Storing metrics with task execution results
- Providing query capabilities for script task metrics
- Supporting performance monitoring, debugging, and optimization use cases

### Already Exists (Not New)
- Script execution output capture (stdout, stderr, exit code) - already implemented in script_activity.py
- Basic task status tracking (pending, running, completed, failed, retrying, skipped, cancelled) - already in ActivityExecution model
- Start and end timestamps (started_at, completed_at) - already in ActivityExecution model
- Retry count tracking (retry_count) - already in ActivityExecution model
- Loop iteration tracking (iteration) - already in ActivityExecution model

### Out of Scope
- **API task metrics** (HTTP requests, API response times) - separate feature
- **Agent task metrics** (agent selection, invocation timing) - covered by spec 025
- **Model inference metrics** (token counts, LLM latency) - covered by spec 025
- Workflow-level aggregated metrics (covered by ANSTRAT-1748 and separate feature)
- Real-time streaming of metrics during execution (may be separate feature)
- Alerting based on metric thresholds (external monitoring responsibility)
- Custom metric definitions by users
- Modifying existing stdout/stderr/exit code capture (already works)

---

## Dependencies and Assumptions

### Dependencies
- **ANSTRAT-1748 Analytic Events Specification**: Defines resource_utilization event schema that this feature implements at task level
- **Existing script execution framework** (script_activity.py with execute_bash_script and execute_python_script)
  - Already captures: stdout, stderr, exit code via _process_script_result()
  - Already returns: `{stdout, stderr, return_code, output?}` from _execute_script_common()
  - This feature extends the result structure with additional metrics
- **Workflow orchestration** (dynamic_workflow.py)
- **ActivityExecution database model** for persistence - already stores output_data as JSONB
- **Subprocess execution infrastructure** (asyncio.create_subprocess_exec)
- **Linux with cgroups v2**: Required for reading resource consumption metrics at task completion

### Assumptions
- Script tasks execute within a workflow context with unique identifiers
- Database storage is available for persistent metric storage
- Metrics are stored as part of task execution records (ActivityExecution.metrics) and follow the same lifecycle
- Existing metrics JSONB field can be extended with additional metric fields without breaking existing consumers
- Metrics retention follows task execution data retention policies (no separate retention mechanism needed)
- Nexus runs on Linux with cgroups v2 enabled and accessible at script task completion
- Reading cgroups v2 resource accounting at task completion has negligible performance impact (<1% overhead)
- Metrics conform to ANSTRAT-1748 schema to enable aggregation to workflow-level telemetry

---

## Related Features

- **ANSTRAT-1748 Analytic Events Specification**: Parent specification defining resource_utilization event schema for workflow-level telemetry; this spec implements the same schema at script task granularity
- **script_activity.py**: Current implementation of script execution (execute_bash_script, execute_python_script) that will be extended to capture metrics at task completion
- **ActivityExecution Model**: Database schema for persisting activity execution state and metrics
- **Spec 025 (LLM/Agent Performance Metrics Exposure)**: Covers metrics for non-script tasks (API, agent, model inference)
- **Spec 027 (Nexus Component Performance KPIs)**: Extends MetricsRecorder for component-level metrics; may provide shared infrastructure for metrics storage

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---
