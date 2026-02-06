# Tasks: Human-in-the-Loop Approval Node

**Input**: Design documents from `/specs/022-approval-node/`
**Prerequisites**: plan.md (required), research.md, data-model.md, quickstart.md

---

## Implementation Status

**Pre-existing artifacts verified against codebase:**

| Artifact                                                      | Status   | Notes                                                                                         |
| ------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `src/nexus/schemas/approvals/approvals-api.yaml`              | COMPLETE | OpenAPI spec fully defined; rename to `openapi.yaml` for Router Discovery Framework          |
| `src/nexus/schemas/workflows/workflow-definition.schema.json` | COMPLETE | approvalActivity is standalone type with onApproved/onRejected                                |
| `packages/nexus-ui/src/routes/approvals/`                     | PARTIAL  | List/detail pages exist with real API + mock fallback; decision submission not yet integrated |
| `packages/nexus-ui/src/routes/builder/`                       | COMPLETE | Approval node fully implemented (ApprovalNode, ApprovalNodeForm, registration, validation)    |
| `packages/nexus-contracts/src/approvals-api.ts`               | MISSING  | Needs generation from approvals-api.yaml; interfaces.ts has TS errors referencing non-existent types |

---

## User Stories (from spec.md)

| ID  | Priority | User Story                                                                                                          |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| US1 | P1       | As an Automation Designer, add Approval steps to workflows to pause branches and require human oversight            |
| US2 | P2       | As an Approver, view pending approval requests in UI and decide whether workflow proceeds on approved/rejected path |

---

## Phase 1: Setup & Foundational (Blocking Prerequisites)

These tasks create the directory structure, models, and shared infrastructure that multiple user stories depend on.

### Directory Structure

- [x] T001 Create approvals component directory structure: `src/nexus/approvals/__init__.py`, `src/nexus/approvals/models/__init__.py`, `src/nexus/approvals/services/__init__.py`, `src/nexus/approvals/clients/__init__.py`, and `tests/unit/approvals/__init__.py`, `tests/contract/approvals/__init__.py`, `tests/integration/approvals/__init__.py`
- [x] T002 [P] ~~Create OpenAPI specification at `src/nexus/schemas/approvals/approvals-api.yaml`~~ (ALREADY EXISTS)

### Tests First (TDD) ⚠️ MUST FAIL BEFORE IMPLEMENTATION

- [x] T003 [P] Add unit tests for ApprovalRequestStatus enum values and ApprovalRequest model (field validation, all valid status transitions pending→approved/rejected/expired/cancelled, verify invalid transitions raise exceptions e.g. approved→pending, filterable/sortable fields, relationship definitions) in `tests/unit/approvals/test_approval_request.py`; create test factory helpers in `tests/helpers/approval.py`

### Model Implementation (make tests pass)

- [x] T004 Create ApprovalRequestStatus enum in `src/nexus/approvals/models/approval_request.py` (sequential with T005 - same file)
- [x] T005 Create ApprovalRequest SQLModel extending BaseResource in `src/nexus/approvals/models/approval_request.py`; include `__filterable_fields__` (execution_id, status, timeout_at) and `__sortable_fields__` (timeout_at, decided_at) class attributes per BaseResource pattern (sequential with T004 - same file)
- [x] T006 [P] Create ApprovalListParams query params model in `src/nexus/approvals/models/query_params.py`
- [x] T007 [P] Create approval exceptions (ApprovalNotFoundError, ApprovalAlreadyDecidedError) in `src/nexus/approvals/exceptions.py`
- [x] ~~T008 Add approval_requests relationship to Execution model in `src/nexus/workflows/models/execution.py`~~ (PR REVIEW - Not required)
- [x] T009 Create Alembic migration for approval_requests table (include approvalrequeststatus enum type, indexes, foreign keys)

---

## Phase 2: User Story 1 - Workflow Designer Adds Approval Nodes [US1]

**Story Goal**: Automation Designers can add Approval nodes to workflows that pause branches and require human oversight.

**Independent Test Criteria**:

- Approval activity type is valid in workflow definitions
- Workflow execution pauses at approval node
- Approval request is created with correct context
- Parallel branches continue while approval branch waits
- Timeout expiration follows rejection path

### Schema & Definition Updates

- [x] T010 [US1] ~~Add approvalActivity definition to workflow schema in `src/nexus/schemas/workflows/workflow-definition.schema.json`~~ (ALREADY EXISTS - standalone type with onApproved/onRejected)
- [ ] T011 [US1] Add APPROVAL to ActivityType enum in `src/nexus/workflows/workflow_engine/models/workflow_definition.py`
- [ ] T012 [US1] Add on_approved and on_rejected fields to Activity model in `src/nexus/workflows/workflow_engine/models/workflow_definition.py`
- [ ] T013 [US1] Add validator for approval type requiring on_approved in `src/nexus/workflows/workflow_engine/models/workflow_definition.py`

### Workflow Engine Integration

- [ ] T014 [US1] Create ApprovalResult dataclass in `src/nexus/workflows/workflow_engine/models/approval.py`
- [ ] T015 [US1] Add \_approval_decisions dict to store approval results in DynamicWorkflow; reuse existing `activity_signal` handler (approval uses `approval_node_id` as `activity_id`) in `src/nexus/workflows/workflow_engine/dynamic_workflow.py`
- [ ] T016 [US1] Implement \_execute_approval_activity method in DynamicWorkflow in `src/nexus/workflows/workflow_engine/dynamic_workflow.py`
- [ ] T017 [US1] Create create_approval_request_activity Temporal activity in `src/nexus/workflows/workflow_engine/activities/approval_activity.py`; populate workflow_context with workflow inputs and previous_step output per FR-008
- [ ] T018 [US1] Register create_approval_request_activity with Temporal worker in `src/nexus/workflows/workflow_engine/services/temporal_worker.py`
- [ ] T019 [US1] Add approval case to activity execution switch in DynamicWorkflow in `src/nexus/workflows/workflow_engine/dynamic_workflow.py`
- [ ] T020 [US1] Implement timeout handling with asyncio.TimeoutError in approval execution in `src/nexus/workflows/workflow_engine/dynamic_workflow.py`

### Inter-Component Communication (Workflows -> Approvals)

- [ ] T021 [US1] Create ApprovalsApiClient HTTP client with retry logic (3 retries, exponential backoff per research.md) and async context manager pattern in `src/nexus/workflows/clients/approvals_client.py` (follow AgentOrchestratorClient patterns)
- [ ] T022 [US1] Integrate ApprovalsApiClient into create_approval_request_activity in `src/nexus/workflows/workflow_engine/activities/approval_activity.py`

### Execution Status Computation

- [ ] T023 [US1] Update execution status computation to return PAUSED when all branches waiting for approval and no branches actively executing, return RUNNING when any branch is actively executing per research.md status table in `src/nexus/workflows/services/execution_service.py`

### Workflow Cancellation Integration

- [ ] T024 [US1] Add logic to cancel pending approvals when workflow is cancelled: fetch pending approvals via ApprovalsApiClient, then call batch cancel with notes "Workflow execution was cancelled" per research.md cancellation flow in `src/nexus/workflows/services/execution_service.py`

---

## Phase 3: User Story 2 - Approver Views and Decides Requests [US2]

**Story Goal**: Approvers can view pending requests in the application UI, see context, and approve/reject with notes.

**Independent Test Criteria**:

- List endpoint returns pending approvals with filtering
- Detail endpoint shows full approval context
- PATCH endpoint transitions approval status
- Batch endpoint processes multiple decisions
- Workflow resumes after decision (approved/rejected path)
- Audit trail is complete (decided_by, decided_at, notes)

### Tests First (TDD) ⚠️ MUST FAIL BEFORE IMPLEMENTATION

- [ ] T025 [P] [US2] Add unit tests for ApprovalService methods (list, get, create, decide, batch_decide, cancel_for_execution) in `tests/unit/approvals/test_approval_service.py`
- [ ] T026 [P] [US2] Add contract tests for GET /api/v1/approvals validating OpenAPI schema compliance (response shape, pagination fields, status enum values, filter params) in `tests/contract/approvals/test_list_approvals.py`
- [ ] T027 [P] [US2] Add contract tests for POST /api/v1/approvals validating request/response schema (required fields, UUID formats, ActivitySummary structure) in `tests/contract/approvals/test_create_approval.py`
- [ ] T028 [P] [US2] Add contract tests for GET /api/v1/approvals/{id} validating response schema (all fields present, nullable fields, WorkflowContext structure) in `tests/contract/approvals/test_get_approval.py`
- [ ] T029 [P] [US2] Add contract tests for PATCH /api/v1/approvals/{id} validating request schema (status enum restricted to approved/rejected/cancelled), error responses (400, 404, 409) in `tests/contract/approvals/test_decide_approval.py`
- [ ] T030 [P] [US2] Add contract tests for POST /api/v1/approvals/batch validating BatchApprovalRequest/Response schema (decisions array, results with success/error, counts) in `tests/contract/approvals/test_batch_approval.py`

### Approvals Service Layer (make tests pass)

- [ ] T031 [P] [US2] Create ApprovalService extending BaseService with list method in `src/nexus/approvals/services/approval_service.py` (follow patterns from WorkflowService)
- [ ] T032 [P] [US2] Create ApprovalService.get method in `src/nexus/approvals/services/approval_service.py`
- [ ] T033 [US2] Create ApprovalService.create method (internal) in `src/nexus/approvals/services/approval_service.py`
- [ ] T034 [US2] Create ApprovalService.decide method with state validation in `src/nexus/approvals/services/approval_service.py`
- [ ] T035 [US2] Create ApprovalService.batch_decide method with row-level locking (SKIP LOCKED or FOR UPDATE) to prevent deadlocks in `src/nexus/approvals/services/approval_service.py`
- [ ] T036 [US2] Create ApprovalService.cancel_for_execution method in `src/nexus/approvals/services/approval_service.py`

### Inter-Component Communication (Approvals -> Workflows)

- [ ] T037 [US2] Create WorkflowApiClient HTTP client with retry logic (5 retries, exponential backoff per research.md - higher than workflow→approvals due to signal criticality) and async context manager pattern in `src/nexus/approvals/clients/workflow_api_client.py`; uses existing `POST /executions/{execution_id}/activities/{approval_node_id}/signal` endpoint (follow AgentOrchestratorClient patterns)
- [ ] T038 [US2] Integrate signal sending into ApprovalService.decide: call WorkflowApiClient to send signal with `{"status": "approved"|"rejected", "approval_id": "...", "notes": "..."}` to existing activity signal endpoint; log error and leave approval decided if signal fails (graceful degradation per research.md) in `src/nexus/approvals/services/approval_service.py`

### Schema Cleanup (Workflows Component)

- [ ] T039 [US2] Remove unused `/executions/{execution_id}/signals/approval-decision` endpoint and `ApprovalDecisionSignal` schema from `src/nexus/schemas/workflows/executions_openapi.yaml` (using existing generic activity signal endpoint instead)

### Approvals API Endpoints (make contract tests pass)

- [ ] T041 [P] [US2] Create get_approval_service dependency injection provider and GET /api/v1/approvals list endpoint in `src/nexus/approvals/router.py`
- [ ] T042 [P] [US2] Create POST /api/v1/approvals create endpoint in `src/nexus/approvals/router.py`
- [ ] T043 [P] [US2] Create GET /api/v1/approvals/{id} detail endpoint in `src/nexus/approvals/router.py`
- [ ] T044 [US2] Create PATCH /api/v1/approvals/{id} decide endpoint in `src/nexus/approvals/router.py`
- [ ] T045 [US2] Create POST /api/v1/approvals/batch batch decision endpoint in `src/nexus/approvals/router.py`
- [x] T046 [US2] ~~Register approvals router in FastAPI app~~ (NOT NEEDED - Router Discovery Framework auto-discovers `src/nexus/approvals/router.py`)

### Frontend - API Client & Types

_Note: The approvals API is a separate OpenAPI spec from the workflows API. Types need to be generated from `openapi.yaml`._

- [ ] T047 [P] [US2] Add `gen:approvals` script to nexus-contracts package.json and generate TypeScript types from `src/nexus/schemas/approvals/openapi.yaml` → `packages/nexus-contracts/src/approvals-api.ts`
- [ ] T048 [P] [US2] Export ApprovalsAPI from index and update interfaces.ts to import Approval/ApprovalStatus from the new approvals-api.ts (fixing existing TS errors)
- [ ] T049 [US2] Create approvalsClient in `packages/nexus-ui/src/client.tsx` using the new ApprovalsAPI types, update Approvals.tsx and ApprovalDetail.tsx to use it, remove VITE_USE_MOCK_APPROVALS fallback code after integration is complete

### Frontend - Approvals List Page

_Note: List page exists but calls `workflowClient` for `/approvals` endpoints that don't exist in workflow-api.ts. Currently works only with mock data via `VITE_USE_MOCK_APPROVALS` flag. T049 will fix this by creating proper approvalsClient._

- [ ] T050 [US2] Add batch selection toolbar to Approvals list page: checkbox column, selection count, "Approve Selected"/"Reject Selected" buttons, confirmation modal with optional notes field (note applies to all selected approvals) in `packages/nexus-ui/src/routes/approvals/Approvals.tsx`
- [x] T051 [US2] ~~Create ApprovalStatusLabel component~~ (ALREADY EXISTS as `ApprovalStatusBadges` in `packages/nexus-ui/src/routes/approvals/approvalUtils.tsx`)
- [x] T052 [US2] ~~Add Approvals and ApprovalDetail routes with lazy imports~~ (ALREADY EXISTS in `packages/nexus-ui/src/app/AppRoute.tsx` and `navigationItems.tsx`)
- [x] T053 [US2] ~~Add Approvals nav item~~ (ALREADY EXISTS in `packages/nexus-ui/src/app/navigationItems.tsx`)

### Frontend - Approval Detail Page

_Note: Detail page exists with UI but decision submission shows "not yet implemented"._

- [ ] T054 [US2] Integrate real API for submitting approval decisions: connect approve/reject buttons to PATCH /api/v1/approvals/{id} endpoint, handle success/error states, redirect to list on success in `packages/nexus-ui/src/routes/approvals/ApprovalDetail.tsx`
- [ ] T055 [US2] Create ApprovalContextViewer component: collapsible JSON viewer for workflow_context (inputs + previous_step), link to workflow execution canvas in `packages/nexus-ui/src/routes/approvals/ApprovalContextViewer.tsx`
- [ ] T056 [US2] Create ApprovalActions component with undo-before-submit (FR-019): radio-button behavior between Approve/Reject, notes textarea, Submit/Cancel buttons (Cancel clears selection without API call per quickstart scenario 19), confirmation before API call in `packages/nexus-ui/src/routes/approvals/ApprovalActions.tsx`

### Frontend - Shared Hooks

- [ ] T057 [US2] Create useApprovalDecision mutation hook for submitting decisions (single and batch) with optimistic updates and error handling in `packages/nexus-ui/src/routes/approvals/useApprovals.tsx`

---

## Phase 4: User Story 1 Extended - Workflow Builder UI [US1]

**Story Goal**: Automation Designers can visually add Approval nodes in the workflow builder canvas.

**Status**: ✅ COMPLETE - All workflow builder integration is already implemented in nexus-ui.

**Implementation Notes**:

- Approval nodes are implemented as `task` activities with `requiresApproval: true` flag
- Node registration uses auto-discovery pattern via `registerAllNodes()`
- Timeout stored as seconds internally, UI breaks down into days/hours/minutes/seconds
- Validation ensures "approved" branch is connected (rejected is optional)

### Workflow Builder Integration

- [x] T058 [US1] ~~Create ApprovalNode React component~~ (ALREADY EXISTS at `packages/nexus-ui/src/routes/automations/canvas/nodes/ApprovalNode.tsx` and `packages/nexus-ui/src/routes/builder/node-details/ApprovalNodeDetails.tsx`)
- [x] T059 [US1] ~~Register approval node type~~ (ALREADY EXISTS at `packages/nexus-ui/src/routes/builder/registry/nodes/registerApprovalNode.ts` with icon, category, and order)
- [x] T060 [US1] ~~Update flattenWorkflow~~ (ALREADY HANDLED - approval branches render as edges with "approved"/"rejected" labels)
- [x] T061 [US1] ~~Update nestWorkflow~~ (ALREADY HANDLED - `createApprovalActivity()` in `packages/nexus-ui/src/stores/workflowFactories.ts`)
- [x] T062 [US1] ~~Create ApprovalConfigPanel~~ (ALREADY EXISTS at `packages/nexus-ui/src/routes/builder/node-forms/ApprovalNodeForm.tsx` with usernames, message, timeout controls)

---

## Phase 5: Integration Tests & Validation

_Note: Unit tests and contract tests are in earlier phases (TDD). This phase runs end-to-end integration tests after all components are implemented._

### Integration Tests (End-to-End Workflows)

- [ ] T063 [P] Add integration tests for complete approval lifecycle: workflow creation → execution pause at approval → decision submission → workflow resumption on correct path → execution completion (scenarios 1-6 from quickstart); include Temporal signal replay safety test (workflow replay should not create duplicate approval requests) in `tests/integration/approvals/test_approval_flow.py`
- [ ] T064 [P] Add integration tests for error scenarios across components: non-existent approval (404), already-decided approval (409), invalid status (400), batch partial failures, verifying error propagation through Workflows↔Approvals integration (scenarios 7-11), verify approval decision persists even if workflow signal delivery fails (graceful degradation) in `tests/integration/approvals/test_approval_errors.py`
- [ ] T065 [P] Add integration tests for edge cases involving multiple components: concurrent approval attempts (race condition handling), parallel branch failure cancelling pending approval, execution status transitions during parallel approval waits (scenarios 12-13) in `tests/integration/approvals/test_approval_edge_cases.py`

---

## Dependencies

### User Story Completion Order

```
Phase 1 (Setup & Tests & Models) → Phase 2 (US1: Workflow Engine) → Phase 3 (Tests & US2: Approvals) → Phase 4 (US1 Extended: Builder) → Phase 5 (Integration Tests)
```

### Critical Dependencies

| Task                          | Blocks                        | Reason                                              |
| ----------------------------- | ----------------------------- | --------------------------------------------------- |
| T003 (Model tests)            | T004-T005 (Model impl)        | TDD: tests must exist before implementation         |
| T004-T005 (Models)            | T009 (Migration)              | Models must exist before autogenerating migration   |
| T005 (ApprovalRequest model)  | T031-T036 (ApprovalService)   | Service operates on model                           |
| T015 (Signal handler)         | T038 (Signal sending)         | Must have handler before sender                     |
| T021 (ApprovalsApiClient)     | T022, T024                    | Client used by activities and cancellation          |
| T025-T030 (Contract tests)    | T041-T045 (API endpoints)     | TDD: contract tests must fail before implementation |
| T037 (WorkflowApiClient)      | T038 (Service signal sending) | Client must exist before service calls it           |
| T033 (ApprovalService.create) | T022 (Activity integration)   | Activity calls service via HTTP                     |
| T033 (ApprovalService.create) | T042 (POST endpoint)          | Endpoint calls service.create                       |
| T041-T045 (API endpoints)     | T050, T054-T057 (Frontend)    | Frontend calls API                                  |

### Parallel Execution Groups

**Phase 1 - Model Tests** (run first):

```
T003 (single test file)
```

**Phase 1 - Model Implementation** (must be sequential - same file):

```
T004, T005 (same file - run sequentially)
```

**Phase 1 - Other Models** (can run together):

```
T006, T007 ([P] - different files)
```

**Phase 2 - Schema Updates** (same file - run sequentially):

```
T011, T012, T013 (same file - run sequentially)
```

**Phase 3 - Tests First** (can run together):

```
T025, T026, T027, T028, T029, T030 ([P] - different test files)
```

**Phase 3 - Service Methods** (list/get can run together):

```
T031, T032 ([P] - independent read methods)
```

**Phase 3 - API Endpoints** (read endpoints can run together):

```
T041, T042, T043 ([P] - independent endpoints)
```

**Phase 5 - Integration Tests** (all can run together):

```
T063, T064, T065 ([P] - different test files)
```

---

## Implementation Strategy

### MVP Scope (Recommended)

For minimal viable product, implement in order:

1. **Phase 1**: Setup, tests, and foundational models (TDD)
2. **Phase 2**: Core workflow engine integration (T010-T024)
3. **Phase 3 (partial)**: Tests first, then backend API only (T025-T046)
4. **Validate**: Test via curl/API (quickstart scenarios 1-6)

This enables testing the core approval flow without UI.

### Incremental Delivery

1. **Increment 1**: Backend complete (Phases 1-2, T025-T046)
2. **Increment 2**: Frontend decision submission (T050, T054-T057) - workflow builder already complete
3. **Increment 3**: Integration tests and validation (Phase 5)

---

## Validation Checklist

- [ ] All schemas have corresponding model tasks (approvals-api.yaml → T005)
- [ ] All entities have model tasks (ApprovalRequest → T005, ApprovalRequestStatus → T004)
- [ ] All API endpoints have contract tests (T026-T030) before implementation (T041-T045)
- [ ] Each task specifies exact file path
- [ ] Parallel tasks are truly independent (different files, no data dependencies)
- [ ] No task modifies same file as another [P] task (T004-T005 are sequential, not parallel)
- [ ] User stories are independently testable
- [ ] All quickstart scenarios (1-13) are covered by integration tests (T063-T065)
- [ ] TDD ordering: tests precede implementation in each phase

---

## Task Count Summary

| Phase     | Description                    | Task Count | Completed |
| --------- | ------------------------------ | ---------- | --------- |
| 1         | Setup, Tests & Models (TDD)    | 9          | 9         |
| 2         | US1 - Workflow Engine          | 15         | 1         |
| 3         | Tests & US2 - Approvals (TDD)  | 32         | 3         |
| 4         | US1 Extended - Builder         | 5          | 5         |
| 5         | Integration Tests              | 3          | 0         |
| **Total** |                                | **64**     | **18**    |

**Remaining Tasks: 46**

### Per User Story

| User Story | Task Count | Completed | Remaining | Description                                              |
| ---------- | ---------- | --------- | --------- | -------------------------------------------------------- |
| US1        | 20         | 6         | 14        | Workflow designer adds approval nodes (builder complete) |
| US2        | 32         | 3         | 29        | Approver views and decides requests                      |
| Shared     | 12         | 9         | 3         | Setup, foundational, integration tests                   |

### Test Tasks (TDD)

| Category          | Task IDs   | Count  |
| ----------------- | ---------- | ------ |
| Unit tests        | T003, T025 | 2      |
| Contract tests    | T026-T030  | 5      |
| Integration tests | T063-T065  | 3      |
| **Total Tests**   |            | **10** |

### Pre-existing Work (Marked Complete)

The following were already implemented before task generation:

**Backend (nexus)**:

- OpenAPI specification (`approvals-api.yaml`) - complete
- Workflow JSON schema (`approvalActivity` as standalone type) - complete

**Frontend (nexus-ui)**:

- ApprovalStatusBadges component (T051) - complete
- Routes and navigation (T052-T053) - complete
- Workflow builder integration (T058-T062) - complete
  - ApprovalNode canvas component
  - ApprovalNodeForm configuration panel
  - Node registration with auto-discovery
  - Workflow structure transforms
  - Connection validation

**Frontend - Partial (needs work)**:

- Approval types - **NOT generated yet** (T047-T049 still needed; interfaces.ts has TS errors)
- Approvals list page - exists but uses incorrect client; needs T047-T049 for proper API integration
- Approval detail page UI - exists but decision submission not implemented
