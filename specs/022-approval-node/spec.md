# Feature Specification: Human-in-the-Loop Approval Node

**Feature Branch**: `022-approval-node`
**Created**: 2025-12-11
**Status**: Draft
**Epic**: [AAP-58015](AAP-58015) - Human-in-the-Loop (Approval node)
**Parent Feature**: [ANSTRAT-1665](ANSTRAT-1665) - Agentic Automation - Automation Design

---

## Overview

This feature introduces a standalone "Approval" node that Automation Designers can place anywhere in their workflows to pause the current branch of execution and require human oversight before proceeding. The Approval node is a critical Human-in-the-Loop (HIL) mechanism that enables organizations to maintain control over automated processes by requiring explicit human authorization at key decision points.

---

## Clarifications

### Session 2025-12-11

- Q: Should approval nodes have a required timeout? → A: No, timeout is optional. Designers MAY configure a timeout per-node.
- Q: What states can an approval request transition through? → A: Pending → Approved, Rejected, Expired, or Cancelled (4 terminal states)
- Q: What level of observability/metrics for approvals? → A: Minimal (audit log only) for initial implementation; comprehensive metrics/tracing deferred
- Q: Should approvers see what happens next? → A: Yes, approvers should see the next step(s) in both the "Approved" and "Rejected" paths to understand the consequences of their decision

---

## User Scenarios & Testing

### Primary User Story

As an Automation Designer, I want to add an "Approval" step to my workflow so that I can pause a branch of the automation and require human oversight before proceeding with critical or sensitive operations (e.g., destructive changes, high-cost actions, security-sensitive access, or irreversible modifications).

### Secondary User Story

As an Approver, I want to view pending approval requests in the application UI so that I can review the request details (what action is proposed, why it was flagged, and relevant execution data) and decide whether the workflow should proceed down the "approved" path or the "rejected" path.

### Acceptance Scenarios

1. **Given** I am designing a workflow, **When** I add an "Approval" node to the workflow canvas, **Then** the node is successfully placed and configured as a step that will pause its branch of execution.

2. **Given** a workflow is executing and reaches an Approval node, **When** the workflow encounters the Approval node, **Then** the branch containing the Approval node pauses, an approval request is created, and any parallel branches continue executing.

3. **Given** an approval request exists, **When** a user views the approval UI, **Then** they can see the pending approval request with its name, description, status, timestamps, and a link to the source workflow.

4. **Given** a pending approval request, **When** a user approves the request (with optional notes), **Then** the workflow resumes execution following the approval path defined in the Approval node.

5. **Given** a pending approval request, **When** an approver rejects the request (with optional notes), **Then** the workflow resumes execution following the rejection path defined in the Approval node.

6. **Given** multiple pending approval requests, **When** an approver selects several and submits decisions, **Then** all selected requests are processed as a batch.

### Edge Cases

- What happens when an approval node times out?

  - If a timeout is configured on the node and it expires, the request transitions to "Expired" and the workflow follows the rejection path. Timeout is optional. Escalation to backup approvers is a future enhancement.

- What happens when multiple approvers are required?

  - Initial scope focuses on single-approver workflows; multi-approver support is a future enhancement

- Who can approve a request?

  - Any user can approve any request (until RBAC is implemented); designated approvers and delegation policies are future enhancements

- How do approvers discover pending requests?

  - Approvers must manually check the Approvals table via main navigation. In-app notifications and external notifications are future enhancements.

- Can an approval decision be reversed?

  - No, decisions are final once submitted. All terminal states (Approved, Rejected, Expired, Cancelled) are permanent. To "reverse" a decision, the workflow must be re-run.

- What happens if a workflow is cancelled while an approval is pending?

  - The approval request is transitioned to "Cancelled" status. If an approver attempts to submit a decision, the system rejects it with an error indicating the workflow is no longer active.

- What if no approver identity is available?

  - Decision is recorded with "anonymous" or system-generated identifier until authentication is implemented.

---

## Requirements

### Functional Requirements

#### Workflow Design

- **FR-001**: Automation Designers MUST be able to add a standalone "Approval" node to a workflow
- **FR-002**: The Approval node MUST be configurable with a descriptive name/title that appears in approval requests
- **FR-003**: The Approval node MUST support an optional description field to provide context for approvers
- **FR-004**: The Approval node MUST have two distinct output ports: "Approved" and "Rejected". The Approved port MUST have downstream activities. The Rejected port may be left unconnected, in which case the branch simply ends on rejection.
- **FR-005**: The Approval node MUST have exactly one input connection.

#### Workflow Execution

- **FR-006**: When a workflow execution reaches an Approval node, the system MUST pause the branch containing that node while allowing other parallel branches to continue executing
- **FR-007**: The system MUST create an approval request when a branch is paused at an Approval node
- **FR-008**: An approval request MUST include: a link to the source workflow execution, the workflow inputs, the output from the previous step (if any), and the next steps that will execute if approved or rejected
- **FR-009**: The Approval node MAY have an optional timeout configuration. If no timeout is set, the approval request waits indefinitely until acted upon or the workflow is cancelled.
- **FR-010**: When an approval request times out, the system MUST transition the request to "Expired" status, add an automatic note indicating the request was rejected due to timeout, and resume the workflow following the rejection path

#### Approval Management - List View

- **FR-011**: The system MUST provide a list view of all approval requests
- **FR-012**: The approvals list MUST be accessible from the main navigation
- **FR-013**: The approvals list MUST display key details for each request including name, source workflow, timestamps, and status

#### Approval Management - Detail View

- **FR-014**: Users MUST be able to view a detailed approval page by clicking on an approval
- **FR-015**: The approval detail view MUST display the next step(s) in both the "Approved" and "Rejected" paths so approvers understand the consequences of their decision
- **FR-016**: The approval detail view MUST display a summary description of the approval request if present
- **FR-017**: The system MUST support batch approval, allowing users to review and submit multiple approval requests at once
- **FR-018**: Each approval MUST have Approve and Reject actions
- **FR-019**: Users MUST be able to undo an Approve/Reject selection before final submission
- **FR-020**: Users MUST be able to provide notes when approving or rejecting

#### Workflow Resumption

- **FR-021**: When an approval request is approved, the system MUST resume execution following the approval path
- **FR-022**: When an approval request is rejected, the system MUST resume execution following the rejection path
- **FR-023**: The system MUST record the approval decision, approver identifier, timestamp, and any notes

### Key Entities

- **ApprovalNode**: A workflow step that pauses its branch of execution and waits for human authorization before proceeding. Other parallel branches continue to execute. Has two possible outcomes: approved (continue on approval path) or rejected (continue on rejection path).
- **ApprovalRequest**: A pending decision tied to a specific workflow execution. Tracks the request lifecycle from creation through resolution (approved, rejected, expired, or cancelled). All terminal states are final and cannot be reversed.
- **ApprovalDecision**: The recorded outcome of an approval request, including who made the decision, when, and any notes provided.

---

## Success Criteria

- Automation Designers can add Approval nodes to workflows
- Workflow branches pause correctly at Approval nodes while parallel branches continue
- Approvers can view and act on approval requests within the nexus-ui web application
- Pending approval requests are discoverable from the main navigation
- All approval decisions are recorded with full audit trail (approver identifier, timestamp, notes)
- Workflow resumption after approval or rejection occurs within 5 seconds

---

## Assumptions

1. **VERIFIED**: The workflow execution engine supports pause/resume functionality (`ExecutionStatus.PAUSED` exists, Temporal provides checkpoint/resume capability)
2. The UI application (nexus-ui, separate codebase) can accommodate a new approval management section
3. Initial implementation focuses on single-approver workflows (one person decides per request); batch approval refers to one approver acting on multiple pending requests simultaneously, not multiple approvers for one request

---

## Out of Scope

- Multi-approver workflows (requiring multiple approvals to proceed)
- Specifying usernames to notify on Approval node - requires user authentication system
- External approval integrations (email, Slack, Gmail, etc.) - future enhancement
- Notifications for approval alerts - future enhancement; for now approvers must poll the Approvals table
- Comprehensive observability (metrics, distributed tracing) - future enhancement

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
