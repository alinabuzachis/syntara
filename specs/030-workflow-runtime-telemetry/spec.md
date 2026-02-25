# Feature Specification: Workflow Runtime Telemetry

| Field | Value |
|-------|-------|
| **Feature Branch** | `030-workflow-runtime-telemetry` |
| **Created** | 2026-02-17 |
| **Status** | Draft |
| **Input** | User description: "Telemetry for workflow runtime events to capture execution metrics and send to Red Hat for product improvement" |

## Clarifications

### Session 2026-02-17

- Q: What is the telemetry service endpoint - Segment.com, generic Red Hat service, or AAP Metrics Service? → A: Segment.com with dedicated Nexus account (higher rate limits, aligned with SDP)
- Q: How are installations uniquely identified for anonymization - entitlement_id, random UUID, or hashed system identifier? → A: Use entitlement_id as unique installation identifier (each Nexus installation has unique entitlement)
- Q: How are events correlated within a workflow execution - correlation_id, workflow_id only, or workflow_hash/execution_hash? → A: Use correlation_id to link all events within a single workflow execution
- Q: What telemetry event categories are in scope - workflow only, workflow + resources + system, or all SDP categories? → A: Workflow execution events only (as currently specified), others metrics will be handle in different phase.
- Q: What is the event transmission strategy - fire-and-forget with SDK batching, local persistent retry, or hybrid approach? → A: Fire-and-forget with SDK batching (Segment SDK handles batching/retry, no local persistence, failures logged only)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Platform Telemetry Collection (Priority: P1)

As a platform operator, the system automatically captures workflow execution metrics so that Red Hat can analyze platform usage patterns and identify areas for product improvement without requiring manual data collection or reporting.

**Why this priority**: This is the core functionality that enables all telemetry capabilities. Without automatic data capture, no insights can be generated for product improvement.

**Independent Test**: Can be fully tested by executing a workflow and verifying that telemetry events are generated with required data fields (workflow timing, activity details, execution paths, and success/failure status) without affecting workflow execution.

**Acceptance Scenarios**:

1. **Given** a workflow is about to execute, **When** the workflow starts, **Then** a telemetry event captures the workflow start timestamp
2. **Given** a workflow is executing, **When** the workflow completes (successfully or with failure), **Then** a telemetry event captures the end timestamp, total duration, and success/failure indicator
3. **Given** a workflow contains multiple activities, **When** each activity executes, **Then** telemetry captures the activity type, inbound_activities (predecessor activities), and outbound_activities (successor activities)
4. **Given** a workflow activity is executing, **When** the activity has action parameters, **Then** telemetry captures generic execution metadata without including sensitive customer data

---

### Edge Cases

- What happens when a workflow is terminated mid-execution (timeout, manual cancellation, system failure)?
- How does the system handle workflows with circular or infinite loops that never complete?
- How are workflows with extremely large numbers of activities (100+ activities) handled without overwhelming telemetry systems?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST emit a workflow start telemetry event when workflow execution begins (Segment automatically adds timestamp)
- **FR-002**: System MUST emit a workflow completion telemetry event when workflow execution completes or terminates (Segment automatically adds timestamp)
- **FR-003**: System MUST calculate and record workflow duration_ms (complete_event.timestamp - start_event.timestamp)
- **FR-004**: System MUST record activity type for each executed activity using canonical taxonomy: task, parallel, sequence, condition, loop, converge, approval
- **FR-005**: System MUST record inbound_activities array containing activity hashes of predecessor activities that led to this activity's execution in the workflow execution path
- **FR-006**: System MUST record outbound_activities array containing activity hashes of successor activities triggered by this activity in the workflow execution path
- **FR-007**: System MUST record success or failure indicator for each workflow execution
- **FR-008**: System MUST NOT block or delay workflow execution due to telemetry collection failures
- **FR-009**: System MUST sanitize telemetry data to exclude sensitive customer information (credentials, PII, business-confidential data)
- **FR-010**: System MUST disclose telemetry collection practices in terms of service and product documentation
- **FR-011**: System MUST use entitlement_id as the unique installation identifier for anonymized tracking. The value is exposed by the Nexus installation after the product registration.
- **FR-012**: System MUST include the existing correlation_id ,already assigned to each workflow execution, in all related telemetry events to enable correlation

### Key Entities

- **Workflow Execution Events**: Two events track the complete workflow lifecycle:
  - **WorkflowExecutionStartEvent**: Captures workflow start with entitlement_id (installation identifier), correlation_id (unique execution identifier), workflow_hash, and start timestamp
  - **WorkflowExecutionCompletedEvent**: Captures workflow completion with correlation_id (linking to start event), duration, overall success/failure status, activity count, and error aggregation
- **ActivityExecutionEvent**: Represents telemetry event for execution of a single activity within a workflow, including correlation_id (links to parent workflow execution), activity type, and inbound_activities/outbound_activities arrays

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of workflow executions generate telemetry events with all required data fields (timestamps, duration, success/failure)
- **SC-002**: Telemetry collection adds less than 5% overhead to workflow execution wall-clock duration (measured as: (duration_with_telemetry - duration_without_telemetry) / duration_without_telemetry × 100)
- **SC-003**: Zero workflow execution failures caused by telemetry collection or transmission errors
- **SC-004**: Zero incidents of sensitive customer data being transmitted in telemetry events

## Assumptions

- Nexus has a dedicated Segment.com account with higher rate limits for telemetry data collection
- Segment write API key will be injected at container image build time for zero-configuration deployment
- Network connectivity is generally available but may be intermittent (Segment SDK handles short-term outages via built-in retry; extended outages may result in event loss under fire-and-forget model)
- Each Nexus installation has a unique entitlement_id for anonymized installation-level tracking
- Workflows are uniquely identifiable to enable correlation of telemetry events
- Activities within workflows have standardized type classifications matching data model: task (individual action), parallel (concurrent execution), sequence (sequential steps), condition (if/then/else branching), loop (iteration), converge (wait for multiple branches), approval (human gate)
- Telemetry collection is always-on and disclosed through terms of service and product documentation, following Red Hat's product telemetry policies
- Performance target of <5% overhead is based on typical enterprise workflow orchestration expectations
- Telemetry events are logged locally; transmission to external services is a future enhancement

## Dependencies

- Requires access to the entitlement_id and correlation_id
- Requires Segment.com write API key (injected at container build time)
- Depends on workflow execution infrastructure to provide hooks/events for telemetry collection

## Out of Scope

- Real-time streaming analytics or dashboards for telemetry data (future enhancement)
- Custom or per-customer telemetry configurations (standardized telemetry only)
- Telemetry for non-workflow platform activities (focus is workflow runtime only)
- System resource utilization metrics (CPU, memory, GPU, disk, network) - deferred to future enhancement
- Detailed performance profiling or debugging telemetry (focused on business intelligence metrics)
- User-facing telemetry dashboards or reports (Red Hat internal use only)
- Extension Metadata: the telemetry will be included when the feature is implemented.
- Extension Activity Tracking to identify which ecosystem-developed extensions are being used in workflows (future enhancement)
