# Implementation Plan: Human-in-the-Loop Approval Node

**Branch**: `022-approval-node` | **Date**: 2025-12-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-approval-node/spec.md`

## Execution Flow (/plan command scope)

```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → schemas, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:

- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

Implement a standalone "Approval" node for the workflow engine that allows Automation Designers to pause a workflow branch and require human authorization before proceeding. This is a critical Human-in-the-Loop (HIL) mechanism for organizations to maintain control over automated processes at key decision points.

**Key deliverables:**

**Backend - Approvals Component** (`src/nexus/approvals/`):

1. **ApprovalRequest model** (SQLModel) - tracks pending approvals with state machine (Pending → Approved/Rejected/Expired/Cancelled)
2. **ApprovalService** - business logic for listing, viewing, and deciding approvals
3. **Approval API endpoints** - list, detail, decide, batch; create (internal) (`/api/v1/approvals`)

**Backend - Workflows Component** (modifications):

4. **ActivityType.APPROVAL** - new activity type in workflow engine
5. **`_execute_approval_activity`** - creates approval via HTTP, waits for signal
6. **Temporal signal handler** - `@workflow.signal` for receiving approval decisions
7. **Signal endpoint** - `POST /executions/{id}/signals/approval-decision`
8. **TemporalExecutionService.send_approval_decision** - sends signal to running workflow
9. **Execution status computation** - `paused` when all branches waiting, `running` when any branch active

**Frontend (nexus-ui)**:

10. **Approvals list page** - table view with filtering, search, and batch selection
11. **Approval detail page** - full context display with approve/reject actions
12. **Batch approval toolbar** - approve/reject multiple pending requests at once
13. **API client integration** - typed client generated from OpenAPI schema
14. **Implement approval node in workflow builder** - Create approval node component with proper visual design (1 input handle, 2 output handles for approved/rejected branches similar to condition node), implement bidirectional workflow structure transformation (nested workflow structure ↔ flat React Flow canvas structure), and register node type with `enabled: true`

**Architecture Decision - HTTP-Based Inter-Component Communication:**

Components communicate exclusively via HTTP APIs, even within the monolith:

```text
Workflows → Approvals: POST /api/v1/approvals (create approval request)
Workflows → Approvals: POST /api/v1/approvals/batch (cancel approvals on workflow cancel)
Approvals → Workflows: POST /executions/{id}/signals/approval-decision (signal decision)
```

This enforces true decoupling and enables deployment as separate microservices without code changes.

**Retry Strategy**: Both directions use exponential backoff with configurable retry counts. Approvals → Workflow uses more retries by default (5 vs 3) since the user's action is complete and the signal is critical for workflow resumption. See research.md for details.

**Future extensibility:** The standalone approvals component is designed to support approval requests from multiple sources (workflows, agent orchestrator). See research.md "Future Considerations" section for details.

## Technical Context

**Language/Version**: Python 3.12
**Primary Dependencies**: FastAPI 0.104+, SQLModel 0.0.14+, Pydantic 2.0+, Temporal 1.5+, asyncpg, SQLAlchemy 2.0+
**Storage**: PostgreSQL with SQLModel ORM (async via asyncpg)
**Testing**: pytest 7.4+, pytest-asyncio, pytest-cov (90% coverage required)
**Target Platform**: Linux server (containerized with podman-compose)
**Project Type**: Single project (src/nexus/ structure with component subdirectories)
**Performance Goals**: Workflow resumption after approval/rejection within 5 seconds (per spec)
**Constraints**: Must integrate with existing Temporal workflow orchestration; approvals persist beyond Temporal retention period
**Scale/Scope**: Initial single-approver workflows; batch approval support for multiple pending requests

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Technology Standards Compliance

- [x] **SQLModel for Data Models**: ApprovalRequest model will use SQLModel (extends BaseResource) - consistent with existing Execution, ActivityExecution models

### Code Architecture Compliance

- [x] **DRY Principle**: Will reuse existing base resource patterns (BaseResource, UserOwnedResource), filtering utilities, and pagination infrastructure
- [x] **SOLID Principles**:
  - Single Responsibility: ApprovalService encapsulates business logic and data access (consistent with existing services)
  - Open/Closed: Extend existing activity type system without modifying core workflow engine
  - Dependency Inversion: Inject services via FastAPI Depends
- [x] **Separation of Concerns**: Router → Service pattern consistent with existing executions API
- [x] **Dependency Injection**: FastAPI Depends pattern for database sessions, services, and current user
- [x] **Composition vs Inheritance**: ApprovalRequest extends BaseResource via SQLModel inheritance (valid "is-a" relationship)

### API Specification Standards Compliance

- [x] **OpenAPI/AsyncAPI Compliance**: Approval schemas defined in standalone `src/nexus/schemas/approvals/approvals-api.yaml`
- [x] **Naming Convention**: Will follow snake_case pattern (approval_request, execution_id, etc.)
- [x] **Documentation Completeness**: All endpoints will include descriptions, parameter docs, and examples per existing patterns
- [x] **RFC 9457 Error Format**: Will use existing Error schema from shared-resources.openapi.yaml
- [x] **Error Message Safety**: Error messages follow existing patterns - no internal details exposed
- [x] **API Versioning**: Approvals API at `/api/v1/approvals` - standalone top-level resource
- [x] **API Path Structure**: `/api/v1/approvals` follows `/api/v1/[component]` pattern for standalone component
- [x] **Pagination Support**: List endpoint will support limit/cursor pagination per shared-resources patterns
- [x] **Filtering/Sorting Consistency**: Will use existing filtering infrastructure (status, created_at, execution_id)
- [x] **Security Documentation**: Authenticated endpoints with bearer auth per existing patterns
- [x] **Schema Compatibility**: New schemas - no backward compatibility concerns for initial release

**Initial Constitution Check: PASS** - All gates satisfied. Design aligns with existing patterns.

## Project Structure

### Documentation (this feature)

```
specs/022-approval-node/
├── plan.md              # This file - planning output
├── research.md          # Phase 0 - decisions, rationale, UI research
├── data-model.md        # Phase 1 - entities, schemas, SQLModel code
├── quickstart.md        # Phase 1 - test scenarios
└── tasks.md             # Phase 2 - implementation tasks (created by /tasks)
```

### Backend (nexus)

```
src/nexus/
├── approvals/                    # NEW: Approvals component
│   ├── __init__.py
│   ├── models/
│   │   └── approval_request.py   # ApprovalRequest SQLModel
│   ├── services/
│   │   └── approval_service.py   # Business logic and data access
│   └── clients/
│       └── workflow_api_client.py  # Signal workflows
├── api/
│   └── v1/
│       └── approvals.py          # NEW: /api/v1/approvals endpoints
├── workflows/
│   ├── workflow_engine/
│   │   └── dynamic_workflow.py   # MODIFY: Add approval signal handler
│   └── clients/
│       └── approvals_client.py         # NEW: HTTP client for approvals API
├── schemas/
│   └── approvals/
│       └── approvals-api.yaml    # NEW: OpenAPI specification
└── core/
    ├── database/         # Database management
    │   └── migrations/   # Database migrations
    │       └── versions/
    │           └── xxx_add_approval_requests.py  # NEW: Migration
    └── models/
        └── base/                 # Reuse BaseResource

tests/
├── unit/approvals/               # NEW: Unit tests
├── integration/approvals/        # NEW: Integration tests
└── contract/approvals/           # NEW: Contract tests
```

### Frontend (nexus-ui)

```
packages/nexus-ui/src/
├── app/
│   ├── AppRoute.tsx              # MODIFY: Add approval routes
│   └── navigationItems.tsx       # MODIFY: Add Approvals nav item
├── client.tsx                    # MODIFY: Add approvalsClient
└── routes/approvals/             # NEW: Approval pages
    ├── Approvals.tsx             # List view
    ├── ApprovalDetail.tsx        # Detail view
    └── components/
        ├── ApprovalStatusLabel.tsx
        ├── ApprovalActions.tsx
        └── ApprovalContextViewer.tsx

packages/nexus-contracts/src/
├── approvals-api.ts              # NEW: Generated from OpenAPI
└── index.ts                      # MODIFY: Export ApprovalsAPI
```

## Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:

   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts

_Prerequisites: research.md complete_

1. **Extract entities from feature spec** → `data-model.md`:

   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:

   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/AsyncAPI schema to `src/nexus/schemas/[component]/`
   - Note: Schemas are stored as package data files in src/nexus/schemas/, NOT at project root or within the specs folder

3. **Generate contract tests** from contracts:

   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:

   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md (with UI component specs), src/nexus/schemas/[component]/\*, failing tests, quickstart.md (with UI scenarios), agent-specific file

## Phase 2: Task Planning Approach

_This section describes what the /tasks command will do - DO NOT execute during /plan_

**Task Generation Strategy**:

- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (schemas, data model, quickstart)
- Each schema → contract test task [P]
- Each entity → model creation task [P]
- Each user story → integration test task
- Implementation tasks to make tests pass

**Ordering Strategy**:

- TDD order: Tests before implementation
- Dependency order: Models before services before UI
- Mark [P] for parallel execution (independent files)

**Estimated Output**: 25-30 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation

_These phases are beyond the scope of the /plan command_

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking

_Two constitution deviations documented with justifications. See research.md sections 10-11 for full rationale._

| Violation             | Why Needed                                                               | Simpler Alternative Rejected Because                                                                                                |
| --------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| RFC 9457 Error Format | Project consistency - existing Error schema used across all Nexus APIs   | Implementing RFC 9457 for approvals only creates inconsistent error handling; project-wide migration recommended as separate effort |
| API Path Structure    | Approvals is single-resource component; resource IS the approval request | Adding `/requests` suffix to `/api/v1/approvals` is redundant; path extensible if new resource types added later                    |

## Progress Tracking

_This checklist is updated during execution flow_

**Phase Status**:

- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:

- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS (verified below)
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none required)

### Post-Design Constitution Check

Re-evaluated after Phase 1 design completion:

**Technology Standards Compliance**:

- [x] ApprovalRequest model uses SQLModel, extends BaseResource

**Code Architecture Compliance**:

- [x] DRY: Reuses base resource patterns, filtering utilities, pagination
- [x] SOLID: ApprovalService encapsulates business logic and data access, extends activity types
- [x] Separation of Concerns: Router → Service pattern
- [x] Dependency Injection: FastAPI Depends pattern throughout
- [x] Composition over Inheritance: Valid "is-a" for ApprovalRequest extends BaseResource

**API Specification Standards Compliance**:

- [x] OpenAPI spec in standalone `src/nexus/schemas/approvals/approvals-api.yaml`
- [x] snake_case naming convention in all schemas
- [x] Full documentation for all new endpoints and schemas
- [x] Error responses use existing Error schema (RFC 9457 compatible)
- [x] API path: `/api/v1/approvals` as standalone top-level resource
- [x] Pagination: list endpoint supports limit/cursor
- [x] Security: bearer auth documented

**Post-Design Constitution Check: PASS** - No new violations introduced.

---

_Based on Constitution v1.2.0 - See `.specify/memory/constitution.md`_
