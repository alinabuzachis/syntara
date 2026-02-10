# Quickstart: Human-in-the-Loop Approval Node

**Feature Branch**: `022-approval-node`
**Date**: 2025-12-16

---

## Overview

This quickstart guide demonstrates how to use the Approval Node feature to add human oversight to automated workflows. It covers:

1. Creating a workflow with an approval node
2. Triggering the workflow and viewing pending approvals
3. Approving or rejecting requests
4. Observing workflow branch resumption after decision

---

## End-to-End Approval Flow

The complete approval process involves multiple components communicating via HTTP APIs:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     COMPLETE APPROVAL FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: Workflow Execution Reaches Approval Node (Workflows → Approvals)
─────────────────────────────────────────────────────────────────────────────
• DynamicWorkflow executes activities until it hits an approval activity
• Temporal activity calls approvals API: POST /api/v1/approvals
  Body: {
    execution_id,
    approval_node_id,
    name,
    description,
    timeout_at,
    next_step_approved,
    next_step_rejected,
    workflow_context
  }
• Approvals component creates ApprovalRequest in database, returns approval_id
• Branch pauses at workflow.wait_condition() - parallel branches continue

STEP 2: User Views Pending Approvals (Approvals Component)
─────────────────────────────────────────────────────────────────────────────
• Frontend calls: GET /api/v1/approvals?status=pending
• User sees list of approval requests with context and next steps

STEP 3: User Submits Decision (Approvals Component)
─────────────────────────────────────────────────────────────────────────────
• Frontend calls: PATCH /api/v1/approvals/{approval_id}
  Body: { "status": "approved", "notes": "Reviewed and approved" }
• ApprovalService updates database record

STEP 4: Signal Sent to Workflow Execution (Approvals → Workflows)
─────────────────────────────────────────────────────────────────────────────
• ApprovalService calls: POST /api/v1/executions/{id}/signals/approval-decision
  Body: { approval_id, status, notes }
• ExecutionService receives signal request
• TemporalExecutionService.send_approval_decision() sends Temporal signal

STEP 5: Workflow Resumes (Workflows Component)
─────────────────────────────────────────────────────────────────────────────
• DynamicWorkflow.approval_decision signal handler receives decision
• wait_condition() returns (condition now satisfied)
• Workflow continues executing on approved/rejected path
```

**Key Architectural Points**:

- Components communicate **exclusively via HTTP APIs**, even within the monolith
- The **Approvals component** never directly accesses Temporal
- The **Workflows component** never directly writes to the approvals database
- This retains separation of concerns and enables possible deployment as separate microservices without code changes

---

## Prerequisites

**For API scenarios (1-12)**:

- Temporal server running
- Nexus API server running (`make dev` - includes database migrations)
- API client (curl, httpie, or similar)

**For UI scenarios (13-17)**:

- All of the above
- nexus-ui running (`npm run dev` in nexus-ui repo)

---

## Quick Test Scenarios

### Scenario 1: Create and Execute Workflow with Approval Node

**Goal**: Verify that a workflow pauses at an approval node and creates an approval request.

```bash
# 1. Create a workflow with an approval node
curl -X POST http://localhost:8000/api/v1/workflows/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "approval-demo-workflow",
    "description": "Demonstrates approval node functionality",
    "workflow_definition": {
      "schemaVersion": "1.0.0",
      "version": 1,
      "metadata": {
        "name": "approval-demo-workflow",
        "description": "Demo workflow with approval node"
      },
      "triggers": [{"type": "manual"}],
      "workflow": {
        "activities": [
          {
            "id": "prepare_data",
            "type": "task",
            "name": "Prepare Data",
            "task": {
              "executor": "script",
              "config": {
                "language": "python",
                "code": "print(\"Data prepared\")"
              }
            }
          },
          {
            "id": "review_changes",
            "type": "approval",
            "name": "Review Destructive Changes",
            "timeout": 86400,
            "onApproved": [
              {
                "id": "apply_changes",
                "type": "task",
                "name": "Apply Changes",
                "task": {
                  "executor": "script",
                  "config": {
                    "language": "python",
                    "code": "print(\"Changes applied\")"
                  }
                }
              }
            ],
            "onRejected": []
          }
        ]
      }
    }
  }'

# Save the workflow_id from response
export WORKFLOW_ID="<workflow_id_from_response>"

# 2. Start workflow execution
curl -X POST http://localhost:8000/api/v1/workflows/executions \
  -H "Content-Type: application/json" \
  -d "{\"workflow_id\": \"$WORKFLOW_ID\"}"

# Save the execution_id from response
export EXECUTION_ID="<execution_id_from_response>"

# 3. Verify execution is paused at approval node
curl http://localhost:8000/api/v1/workflows/executions/$EXECUTION_ID
# Expected: status = "paused" (no other branches running)

# 4. List pending approvals
curl "http://localhost:8000/api/v1/approvals?status=pending"
# Expected: One approval request for review_changes node
```

**Expected Results**:

- Workflow execution starts and runs `prepare_data` task
- Execution pauses at `review_changes` approval node
- Approval request is created with status "pending"
- Approval shows next steps for both approved/rejected paths

---

### Scenario 2: Approve a Request and Resume Workflow

**Goal**: Verify that approving a request resumes the workflow on the approval path.

```bash
# 1. Get the approval request ID from previous scenario
export APPROVAL_ID="<approval_id_from_list>"

# 2. View approval details with context
curl http://localhost:8000/api/v1/approvals/$APPROVAL_ID
# Shows: name, description, next_step_approved, next_step_rejected, workflow_context

# 3. Approve the request with notes
curl -X PATCH http://localhost:8000/api/v1/approvals/$APPROVAL_ID \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "notes": "Changes look good, approved after review"
  }'

# Expected: Approval status = "approved", decided_by and decided_at populated

# 4. Verify workflow resumed and completed
sleep 5  # Allow time for workflow to resume
curl http://localhost:8000/api/v1/workflows/executions/$EXECUTION_ID
# Expected: status = "completed"

# 5. Verify apply_changes task executed
curl http://localhost:8000/api/v1/workflows/executions/$EXECUTION_ID/activities
# Expected: prepare_data (completed), review_changes (completed), apply_changes (completed)
```

**Expected Results**:

- Approval request transitions to "approved" status
- Decision metadata (decided_by, decided_at, notes) is recorded
- Workflow resumes within 5 seconds
- `apply_changes` task executes
- Execution completes successfully

---

### Scenario 3: Reject a Request and Follow Rejection Path

**Goal**: Verify that rejecting a request resumes the workflow on the rejection path.

```bash
# 1. Create another execution
curl -X POST http://localhost:8000/api/v1/workflows/executions \
  -H "Content-Type: application/json" \
  -d "{\"workflow_id\": \"$WORKFLOW_ID\"}"

export EXECUTION_ID_2="<execution_id_from_response>"

# 2. Get the new approval request
curl "http://localhost:8000/api/v1/approvals?execution_id=$EXECUTION_ID_2&status=pending"
export APPROVAL_ID_2="<approval_id_from_list>"

# 3. Reject the request
curl -X PATCH http://localhost:8000/api/v1/approvals/$APPROVAL_ID_2 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "rejected",
    "notes": "Insufficient justification for destructive changes"
  }'

# 4. Verify workflow followed rejection path
sleep 5
curl http://localhost:8000/api/v1/workflows/executions/$EXECUTION_ID_2
# Expected: status = "completed" (rejection path has no activities, so workflow ends)
```

**Expected Results**:

- Approval request transitions to "rejected" status
- Workflow resumes on rejection path (no downstream activities in this example)
- Execution completes successfully (rejection path is empty, workflow ends gracefully)

---

### Scenario 4: Batch Approval

**Goal**: Verify that multiple approval requests can be decided at once.

```bash
# 1. Create multiple executions to get multiple pending approvals
for i in 1 2 3; do
  curl -X POST http://localhost:8000/api/v1/workflows/executions \
    -H "Content-Type: application/json" \
    -d "{\"workflow_id\": \"$WORKFLOW_ID\"}"
done

# 2. List all pending approvals
curl "http://localhost:8000/api/v1/approvals?status=pending"
# Note the approval IDs

# 3. Submit batch decisions
curl -X POST http://localhost:8000/api/v1/approvals/batch \
  -H "Content-Type: application/json" \
  -d '{
    "decisions": [
      {"approval_id": "<id1>", "status": "approved", "notes": "Batch approved"},
      {"approval_id": "<id2>", "status": "rejected", "notes": "Batch rejected"},
      {"approval_id": "<id3>", "status": "approved", "notes": "Batch approved"}
    ]
  }'

# Expected response includes results for each decision
```

**Expected Results**:

- All three decisions are processed
- Response shows success/failure for each
- Total success and total failed counts are correct
- Workflows resume on appropriate paths

---

### Scenario 5: Approval Timeout Expiration

**Goal**: Verify that approvals expire and follow rejection path after timeout.

```bash
# 1. Create a workflow with short timeout (for testing)
curl -X POST http://localhost:8000/api/v1/workflows/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "timeout-demo-workflow",
    "workflow_definition": {
      "schemaVersion": "1.0.0",
      "version": 1,
      "metadata": {"name": "timeout-demo", "description": "Tests timeout"},
      "triggers": [{"type": "manual"}],
      "workflow": {
        "activities": [
          {
            "id": "quick_approval",
            "type": "approval",
            "name": "Quick Approval",
            "timeout": 30,
            "onApproved": [
              {
                "id": "approved_task",
                "type": "task",
                "name": "Approved Task",
                "task": {
                  "executor": "script",
                  "config": {"language": "python", "code": "print(\"Approved\")"}
                }
              }
            ],
            "onRejected": [
              {
                "id": "timeout_task",
                "type": "task",
                "name": "Timeout Task",
                "task": {
                  "executor": "script",
                  "config": {"language": "python", "code": "print(\"Timed out\")"}
                }
              }
            ]
          }
        ]
      }
    }
  }'

export TIMEOUT_WORKFLOW_ID="<workflow_id>"

# 2. Start execution
curl -X POST http://localhost:8000/api/v1/workflows/executions \
  -H "Content-Type: application/json" \
  -d "{\"workflow_id\": \"$TIMEOUT_WORKFLOW_ID\"}"

# 3. Wait for timeout (30+ seconds)
sleep 35

# 4. Check approval status
curl "http://localhost:8000/api/v1/approvals?status=expired"
# Expected: Approval with status "expired"

# 5. Verify automatic note was added
curl http://localhost:8000/api/v1/approvals/<approval_id>
# Expected: decision_notes contains timeout message
```

**Expected Results**:

- Approval expires after 30 seconds
- Status transitions to "expired"
- Automatic note explains timeout
- Workflow follows rejection path

---

### Scenario 6: Cancelled Workflow Cancels Pending Approvals

**Goal**: Verify that cancelling a workflow cancels its pending approvals.

```bash
# 1. Start an execution with approval
curl -X POST http://localhost:8000/api/v1/workflows/executions \
  -H "Content-Type: application/json" \
  -d "{\"workflow_id\": \"$WORKFLOW_ID\"}"

export CANCEL_EXEC_ID="<execution_id>"

# 2. Verify approval is pending
curl "http://localhost:8000/api/v1/approvals?execution_id=$CANCEL_EXEC_ID"

# 3. Cancel the workflow execution
curl -X PATCH http://localhost:8000/api/v1/workflows/executions/$CANCEL_EXEC_ID \
  -H "Content-Type: application/json" \
  -d '{"action": "cancel"}'

# 4. Verify approval was cancelled
curl "http://localhost:8000/api/v1/approvals?execution_id=$CANCEL_EXEC_ID"
# Expected: status = "cancelled"

# 5. Attempt to approve cancelled request (should fail)
curl -X PATCH http://localhost:8000/api/v1/approvals/<approval_id> \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'
# Expected: 409 Conflict - Approval already decided or workflow cancelled
```

**Expected Results**:

- Approval transitions to "cancelled" when workflow is cancelled
- Attempting to decide cancelled approval returns 409 Conflict
- Error message explains the approval is no longer actionable

---

### Scenario 7: Error Handling - Approval Not Found

**Goal**: Verify that requesting a non-existent approval returns 404.

```bash
# Attempt to get non-existent approval
curl -w "\n%{http_code}\n" http://localhost:8000/api/v1/approvals/00000000-0000-0000-0000-000000000000

# Expected: 404 Not Found with error response
# {
#   "error": "not_found",
#   "message": "Approval request not found",
#   "details": "No approval request exists with id '00000000-0000-0000-0000-000000000000'"
# }
```

**Expected Results**:

- Returns HTTP 404 status code
- Error response includes `error`, `message`, and `details` fields

---

### Scenario 8: Error Handling - Already Decided Approval

**Goal**: Verify that deciding an already-decided approval returns 409 Conflict.

```bash
# 1. Get a pending approval and approve it
export APPROVAL_ID="<approval_id_from_pending_list>"

curl -X PATCH http://localhost:8000/api/v1/approvals/$APPROVAL_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "approved", "notes": "First approval"}'

# 2. Attempt to approve again
curl -w "\n%{http_code}\n" -X PATCH http://localhost:8000/api/v1/approvals/$APPROVAL_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "rejected", "notes": "Second attempt"}'

# Expected: 409 Conflict
# {
#   "error": "conflict",
#   "message": "Approval already decided",
#   "details": "Approval request is in 'approved' status and cannot be modified"
# }
```

**Expected Results**:

- Second decision attempt returns HTTP 409 status code
- Error message clearly indicates the approval was already decided
- Original decision (approved) is preserved

---

### Scenario 9: Error Handling - Invalid Decision Status

**Goal**: Verify that submitting an invalid status returns 400 Bad Request.

```bash
# Attempt to submit invalid status
curl -w "\n%{http_code}\n" -X PATCH http://localhost:8000/api/v1/approvals/$APPROVAL_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "maybe", "notes": "Not sure"}'

# Expected: 400 Bad Request
# {
#   "error": "validation_error",
#   "message": "Invalid status value",
#   "details": "Status must be 'approved' or 'rejected'"
# }
```

**Expected Results**:

- Returns HTTP 400 status code
- Error indicates the valid status values

---

### Scenario 10: Error Handling - Batch Partial Failure

**Goal**: Verify that batch approval handles partial failures gracefully.

```bash
# Submit batch with one valid and one invalid approval ID
curl -X POST http://localhost:8000/api/v1/approvals/batch \
  -H "Content-Type: application/json" \
  -d '{
    "decisions": [
      {"approval_id": "<valid_pending_id>", "status": "approved", "notes": "Valid"},
      {"approval_id": "00000000-0000-0000-0000-000000000000", "status": "approved", "notes": "Invalid ID"}
    ]
  }'

# Expected: 200 OK with partial success
# {
#   "results": [
#     {"approval_id": "<valid_id>", "success": true, "status": "approved", "decided_at": "2024-..."},
#     {"approval_id": "00000000-...", "success": false, "error": "Approval request not found"}
#   ],
#   "total_success": 1,
#   "total_failed": 1
# }
```

**Expected Results**:

- Returns HTTP 200 (not 4xx) even with partial failures
- Successful decisions are processed and committed
- Failed decisions include error messages
- Counts accurately reflect success/failure

---

### Scenario 11: Edge Case - Concurrent Approval Attempt

**Goal**: Verify that only one of two concurrent approval attempts succeeds.

```bash
# This test requires two terminals or parallel execution

# Terminal 1: Approve the request
curl -X PATCH http://localhost:8000/api/v1/approvals/$APPROVAL_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "approved", "notes": "From terminal 1"}' &

# Terminal 2: Reject the same request (run simultaneously)
curl -X PATCH http://localhost:8000/api/v1/approvals/$APPROVAL_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "rejected", "notes": "From terminal 2"}' &

wait

# One should succeed (200), one should fail (409)
```

**Expected Results**:

- Exactly one request succeeds with HTTP 200
- The other request fails with HTTP 409 Conflict
- The approval has a consistent final state
- No data corruption or race condition errors

---

### Scenario 12: Edge Case - Parallel Branch Failure During Approval

**Goal**: Verify behavior when a parallel branch fails while an approval is pending in another branch.

```bash
# 1. Create a workflow with parallel branches: one with approval, one that fails
curl -X POST http://localhost:8000/api/v1/workflows/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "parallel-failure-demo",
    "workflow_definition": {
      "schemaVersion": "1.0.0",
      "version": 1,
      "metadata": {"name": "parallel-failure-demo", "description": "Tests parallel branch failure"},
      "triggers": [{"type": "manual"}],
      "workflow": {
        "activities": [
          {
            "id": "parallel_block",
            "type": "parallel",
            "name": "Parallel Execution",
            "branches": [
              {
                "activities": [
                  {
                    "id": "approval_branch",
                    "type": "approval",
                    "name": "Approval Branch",
                    "timeout": 86400,
                    "onApproved": [
                      {
                        "id": "approved_task",
                        "type": "task",
                        "name": "Approved Task",
                        "task": {
                          "executor": "script",
                          "config": {"language": "python", "code": "print(\"Approved\")"}
                        }
                      }
                    ]
                  }
                ]
              },
              {
                "activities": [
                  {
                    "id": "failing_task",
                    "type": "task",
                    "name": "Failing Task",
                    "task": {
                      "executor": "script",
                      "config": {"language": "python", "code": "raise Exception(\"Intentional failure\")"}
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  }'

export PARALLEL_WORKFLOW_ID="<workflow_id>"

# 2. Start execution
curl -X POST http://localhost:8000/api/v1/workflows/executions \
  -H "Content-Type: application/json" \
  -d "{\"workflow_id\": \"$PARALLEL_WORKFLOW_ID\"}"

export PARALLEL_EXEC_ID="<execution_id>"

# 3. Wait for the failing branch to fail
sleep 5

# 4. Check execution status
curl http://localhost:8000/api/v1/workflows/executions/$PARALLEL_EXEC_ID
# Expected: status = "failed" (fail-fast behavior)

# 5. Check approval status
curl "http://localhost:8000/api/v1/approvals?execution_id=$PARALLEL_EXEC_ID"
# Expected: status = "cancelled" (approval cancelled when workflow failed)
```

**Expected Results (Fail-Fast Behavior)**:

- When parallel branch fails, workflow transitions to "failed" status
- Pending approval in other branch is cancelled (status = "cancelled")
- Approval decision_notes indicates cancellation reason
- Attempting to approve/reject the cancelled approval returns 409 Conflict

**Note**: This follows the standard `asyncio.gather()` behavior where failure in one branch cancels others.

---

### Scenario 13: Edge Case - Execution Status During Parallel Approval Wait

**Goal**: Verify execution status is "running" when one branch waits for approval while another branch is still executing.

```bash
# 1. Create a workflow with parallel branches: one with approval, one with long-running task
curl -X POST http://localhost:8000/api/v1/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "parallel-status-demo",
    "workflow_definition": {
      "schemaVersion": "1.0.0",
      "version": 1,
      "metadata": {"name": "parallel-status-demo", "description": "Tests execution status during parallel approval"},
      "triggers": [{"type": "manual"}],
      "workflow": {
        "activities": [
          {
            "id": "parallel_block",
            "type": "parallel",
            "name": "Parallel Execution",
            "branches": [
              {
                "activities": [
                  {
                    "id": "approval_branch",
                    "type": "approval",
                    "name": "Approval Branch",
                    "timeout": 86400,
                    "onApproved": [
                      {
                        "id": "approved_task",
                        "type": "task",
                        "name": "Approved Task",
                        "task": {
                          "executor": "script",
                          "config": {"language": "python", "code": "print(\"Approved\")"}
                        }
                      }
                    ]
                  }
                ]
              },
              {
                "activities": [
                  {
                    "id": "slow_task",
                    "type": "task",
                    "name": "Slow Task",
                    "task": {
                      "executor": "script",
                      "config": {"language": "python", "code": "import time; time.sleep(10); print(\"Done\")"}
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  }'

export PARALLEL_STATUS_WORKFLOW_ID="<workflow_id>"

# 2. Start execution
curl -X POST http://localhost:8000/api/v1/workflows/executions \
  -H "Content-Type: application/json" \
  -d "{\"workflow_id\": \"$PARALLEL_STATUS_WORKFLOW_ID\"}"

export PARALLEL_STATUS_EXEC_ID="<execution_id>"

# 3. Immediately check execution status (while slow task is running)
curl http://localhost:8000/api/v1/workflows/executions/$PARALLEL_STATUS_EXEC_ID
# Expected: status = "running" (slow task branch still executing)

# 4. Verify approval is pending
curl "http://localhost:8000/api/v1/approvals?execution_id=$PARALLEL_STATUS_EXEC_ID"
# Expected: One pending approval

# 5. Wait for slow task to complete, then check status
sleep 12
curl http://localhost:8000/api/v1/workflows/executions/$PARALLEL_STATUS_EXEC_ID
# Expected: status = "paused" (now only the approval branch is waiting)

# 6. Approve the request
curl -X PATCH http://localhost:8000/api/v1/approvals/<approval_id> \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'

# 7. Verify execution completes
sleep 2
curl http://localhost:8000/api/v1/workflows/executions/$PARALLEL_STATUS_EXEC_ID
# Expected: status = "completed"
```

**Expected Results**:

- While slow task is running: execution status = "running"
- After slow task completes but approval pending: execution status = "paused"
- After approval: execution status = "completed"

---

## UI Flow Validation Scenarios

### Scenario 14: UI - List and Filter Approvals

**Goal**: Verify the Approvals list page displays correctly with filtering.

**Steps**:

1. Navigate to `/approvals` in the nexus-ui
2. Verify table displays with columns: Name, Workflow, Status, Created At, Timeout At
3. Use status filter to show only "Pending" approvals
4. Use search to filter by name
5. Verify pagination works (if more than page limit)

**Expected Results**:

- Approvals table renders with correct data
- Status filter updates table contents
- Search filters by name in real-time
- Each row links to detail view

---

### Scenario 15: UI - View Approval Detail and Decide

**Goal**: Verify approval detail page shows context and allows decisions.

**Steps**:

1. Click on a pending approval in the list
2. Verify detail page shows: name, status badge, **"View Workflow Execution" link**
3. Click the workflow execution link - verify it navigates to `/executions/{execution_id}`
4. Navigate back to approval detail
5. Verify workflow context is displayed: inputs and previous step output (JSON viewer)
6. Verify next steps show both Approved and Rejected paths
7. Click "Approve" button
8. Enter notes in modal
9. Submit decision

**Expected Results**:

- Detail page displays all approval information
- **Workflow execution link is prominently placed** and navigates to the live execution view
- Context JSON shows workflow inputs and previous step output (readable and collapsible)
- Modal appears with notes field
- After submission, redirects to list with success toast
- Approval status now shows "Approved"

---

### Scenario 16: UI - Batch Approval

**Goal**: Verify batch approval of multiple pending requests.

**Steps**:

1. Navigate to `/approvals` with multiple pending approvals
2. Check checkboxes for 3 pending approvals
3. Verify batch toolbar appears with count
4. Click "Approve Selected"
5. Enter notes in confirmation modal
6. Submit batch

**Expected Results**:

- Batch toolbar appears when items selected
- Count shows "3 items selected"
- Confirmation modal shows before submission
- All three approvals transition to "approved"
- Toast shows "3 approvals processed"

---

### Scenario 17: UI - View Already-Decided Approval

**Goal**: Verify decided approval shows decision history instead of action buttons.

**Steps**:

1. Navigate to an already-approved approval detail
2. Verify action buttons are NOT shown
3. Verify "Decision" section shows: decided_by, decided_at, notes

**Expected Results**:

- No Approve/Reject buttons for decided approvals
- Decision history section displays who, when, and notes
- Status badge reflects the decision (Approved/Rejected/Expired/Cancelled)

---

### Scenario 18: UI - Accessibility Check

**Goal**: Verify approvals UI meets accessibility requirements.

**Checks**:

- [ ] All buttons have appropriate ARIA labels
- [ ] Modal traps focus and supports Escape to close
- [ ] Table supports keyboard navigation
- [ ] Status colors have sufficient contrast (WCAG AA)
- [ ] Icons accompanied by text labels

---

### Scenario 19: UI - Undo Selection Before Submission (FR-019)

**Goal**: Verify user can change their decision before final submission.

**Steps**:

1. Navigate to a pending approval detail page
2. Click "Approve" button
3. Verify: Approve is visually selected, Submit button is enabled
4. Click "Reject" button (changing selection)
5. Verify: Reject is now selected, Approve is deselected
6. Optionally add notes
7. Click "Submit"

**Expected Results**:

- UI allows switching between Approve/Reject before submitting
- Only one selection is active at a time (radio-button behavior)
- Final selection ("Rejected") is the one sent to the API
- API receives PATCH with `status: "rejected"`
- Approval transitions to "rejected" status

**Alternative Flow - Cancel**:

1. Click "Approve"
2. Click "Cancel" or close modal
3. Verify: No API call made, approval still "pending"

---

## Validation Checklist

Run through these scenarios to validate the implementation:

**Happy Path Scenarios (1-6)**:

- [ ] Workflow with approval node pauses at the approval step
- [ ] Approval request is visible in `/approvals` list endpoint
- [ ] Approval detail shows next steps for both paths
- [ ] Approval detail shows workflow context (inputs, previous step output)
- [ ] Approval detail has prominent "View Workflow Execution" link to live execution canvas
- [ ] Approving resumes workflow on approval path
- [ ] Rejecting resumes workflow on rejection path
- [ ] Workflow resumption happens within 5 seconds
- [ ] Batch approval processes all decisions
- [ ] Timeout expiration works correctly
- [ ] Cancelled workflows cancel pending approvals
- [ ] All decisions are audited (decided_by, decided_at, notes)

**Error Handling Scenarios (7-11)**:

- [ ] Non-existent approval returns 404 with clear error message
- [ ] Already-decided approval returns 409 Conflict
- [ ] Invalid status value returns 400 Bad Request
- [ ] Batch partial failure returns 200 with individual error details
- [ ] Concurrent approval attempts: one succeeds, one fails with 409

**Edge Case Scenarios (12-13)**:

- [ ] Parallel branch failure cancels pending approval in other branch
- [ ] Execution status is "running" while parallel branches active, "paused" when only approvals waiting

**UI Scenarios (14-18)**:

- [ ] Approvals list page displays with filtering and search
- [ ] Approval detail page shows context and allows decisions
- [ ] Batch approval works for multiple selections
- [ ] Decided approvals show history instead of action buttons
- [ ] Accessibility requirements met (focus, keyboard nav, contrast)

---

_Ready for implementation. Use these scenarios as integration test cases._
