# Tasks: Workflow Definition V2 Implementation

**Input**: Design documents from `/specs/036-workflow-definition-v2/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml

**Tests**: Following TDD approach - tests written before implementation per constitution requirement

**Organization**: Tasks grouped by functional area and user story priority

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, US3, etc.)
- All paths relative to repository root

---

## Phase 1: Setup

- [ ] T001 Verify Python 3.12 environment and dependencies (FastAPI, SQLModel, Pydantic v2, Temporal, jsonschema, NetworkX, httpx, pytest)
- [ ] T002 [P] Verify v2 JSON schemas exist in src/nexus/schemas/workflows/v2/
- [ ] T003 [P] Review WorkflowVersion SQLModel for v2 compatibility

---

## Phase 2: Foundation (Core Infrastructure)

**⚠️ CRITICAL**: Must complete before user story implementation

### V1 Cleanup

- [ ] T004 Delete v1 schema directory src/nexus/schemas/workflows/v1/
- [ ] T005 Delete obsolete v1 files: workflow_engine/activities/api_activity.py, workflow_engine/yaml_workflow_parser.py
- [ ] T006 Phase out utils/activity_traversal.py (reduce to minimal compatibility)

### Graph Domain Model

- [ ] T007 Implement graph_backend.py with IGraphBackend protocol and InMemoryGraphBackend class supporting node/edge storage, successor/predecessor queries, and outgoing edge retrieval with attributes
- [ ] T008 Implement graph.py with WorkflowGraph domain model, ActivityNode abstraction, from_dict() factory, loop feedback edge removal (to_port="iterate"), and port-based navigation methods
- [ ] T009 [P] Write unit tests for graph module

### Namespace & Template System

- [ ] T010 Implement namespace_resolver.py with NamespaceResolver class supporting ${...} template resolution, smart loop resolution (auto-find upstream loop), context-aware upstream search, and recursive dict resolution
- [ ] T011 [P] Write unit tests for NamespaceResolver

---

## Phase 3: User Story 1 - Validation (Priority: P1) 🎯 MVP

**Goal**: Accept and validate V2 workflow definitions

### Tests First

- [ ] T012 [P] Write validator unit tests (schema version, required fields, future: DAG validation)
- [ ] T013 [P] Write API integration tests (POST /api/v1/workflows with valid/invalid v2 workflows)

### Implementation

- [ ] T014 Implement validators/workflow_definition.py with WorkflowValidator class enforcing schema_version="2.0.0" and required fields (triggers, nodes, edges)
- [ ] T015 Update workflow_service.py to use WorkflowValidator with clear V2-only error messages
- [ ] T016 Add RFC 9457 ProblemDetails error formatting in router.py
- [ ] T017 Implement NetworkXBackend in graph_backend.py for advanced graph algorithms (cycles, topological sort, reachability)
- [ ] T018 Add comprehensive validation rules to WorkflowValidator: duplicate node IDs, invalid edge references, reserved namespace names, trigger validation (at least one, no incoming edges), DAG validation (cycles except loop feedback edges, orphaned/unreachable nodes), loop structure (from_port/to_port requirements), converge patterns, and secret reference validation (reject ${secret.*} in outputs)

---

## Phase 4: User Story 2 - Execution (Priority: P1) 🎯 MVP

**Goal**: Execute V2 workflows with graph traversal, concurrent execution, control flow, and variable passing

### Tests First

- [ ] T019 [P] Write execution integration tests (sequential, concurrent, condition, loop, variable resolution)

### V2 Activities (Unified Output Structure)

- [ ] T020 Implement activities/output_mapping.py with apply_output_mapping() utility handling None/{}/field extraction and skipping failed results
- [ ] T021 [P] Implement activities/manual_trigger.py returning {"output": mapped_result}
- [ ] T022 [P] Implement activities/http_request_activity.py using httpx for async HTTP requests with output mapping
- [ ] T023 [P] Implement activities/condition.py evaluating expressions and returning {"output": mapped, "control": {"next_port": "true"|"false"}}
- [ ] T024 [P] Implement activities/loop.py supporting for_each/do_while and returning {"output": mapped, "control": {"next_port": "iterate"|"complete", loop_state}}
- [ ] T025 [P] Implement activities/converge.py merging predecessor results and returning {"output": mapped}
- [ ] T026 [P] Update existing executors (aap_job_template, agentic, script, approval) to V2 output structure
- [ ] T027 [P] Write unit tests for all V2 activities

### Workflow Execution Engine

- [ ] T028 Rewrite dynamic_workflow.py for V2 graph-based execution: build WorkflowGraph, initialize NamespaceResolver, execute trigger, implement asyncio concurrent execution with _schedule_successors(), port-based routing with _determine_output_port(), skipped node tracking for conditions, loop namespace management (loop.{loop_node_id}.item/index), converge synchronization, activity signal handling, and get_skipped_nodes() query
- [ ] T029 Update temporal_execution_service.py and temporal_worker.py for V2 workflow execution
- [ ] T030 Update activity_sync_service.py for V2 graph structure (monitor via workflow queries, handle skipped nodes)

---

## Phase 5: User Story 6 - Schema Discovery APIs (Priority: P2)

**Goal**: Enable visual builders to discover node types dynamically

### Tests First

- [ ] T031 [P] Write schema discovery API tests (discover endpoint, label filtering, schema retrieval)

### Implementation

- [ ] T032 Implement services/schema_service.py with catalog loading from node_type_catalog.json and label-based filtering (AND logic)
- [ ] T033 Implement api/workflow_schemas_router.py with GET /api/v1/workflow-schemas/v2/discover and schema retrieval endpoints
- [ ] T034 Update contracts/openapi.yaml with schema discovery endpoints
- [ ] T035 [P] Write contract tests for OpenAPI compliance

---

## Phase 6: User Story 8-9 - UI Workflow Builder (Priority: P1) 🎯 MVP

**Goal**: Visual workflow builder for creating/editing V2 workflows

**Note**: UI implementation in separate repository `/Users/billwei/redhat/bzwei/nexus-ui`

### Backend Verification

- [ ] T036 Verify POST/GET /api/v1/workflows handles V2 format with actionable validation errors

### UI Implementation (nexus-ui repository)

- [ ] T037 Simplify workflowTransform.ts for V2 (implement v2ToXYFlow and xyFlowToV2 - minimal transform since V2 is flat)
- [ ] T038 Update EdgeFactory.ts to create V2 edges with from_port/to_port attributes
- [ ] T039 Update validateConnection.ts for V2 edge validation rules
- [ ] T040 Update node configuration forms (ConditionNodeForm, LoopNodeForm, etc.) for V2 config schemas
- [ ] T041 Update BuilderFlow.tsx and useWorkflowStore.ts for V2 workflow structure
- [ ] T042 Verify dagre auto-layout integration works with V2 workflows
- [ ] T043 Add E2E tests with Playwright for workflow builder (create, edit, save operations)

---

## Phase 7: Testing & Documentation

### Sample Workflows

- [ ] T044 Convert v1 sample workflows to v2 format in tests/fixtures/
- [ ] T045 Verify behavioral equivalence through test execution
- [ ] T046 Add v2 samples as reference implementations

### Documentation

- [ ] T047 Update README.md with v2 workflow examples and format overview
- [ ] T048 Add v2 workflow creation guide and schema discovery API documentation
- [ ] T049 Update quickstart.md with v2 examples

### Comprehensive Testing

- [ ] T050 Run full test suite (unit + integration + contract + E2E)
- [ ] T051 Verify 90%+ code coverage
- [ ] T052 Performance testing for validation and execution

---
