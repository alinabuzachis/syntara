# Tasks: Post-LLM Token Count Capture

**Input**: Design documents from `/specs/037-post-llm-token-count/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Included per constitution (TDD required by project constitution).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. US1 and US3 share model/migration infrastructure (Phase 2). Phase 3 covers all pre-LLM record creation changes (estimated_input_tokens + invocation_id wiring) since the post-LLM update in Phase 4 finds records by invocation_id. Phase 4 covers the post-LLM update pipeline. Phase 5 covers invocation correlation verification.

**Task Summary**: 27 tasks total — 5 foundational, 6 US3 (pre-LLM), 10 US1 (post-LLM), 2 US2 (correlation verification), 4 polish.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed — this feature extends the existing `token_manager` module. Phase skipped.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend TokenUsageRecord model, update its contract, and create migration. MUST complete before any user story implementation.

**CRITICAL**: No user story work can begin until this phase is complete.

### Tests for Foundational Phase

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T001 [P] Write unit tests for new TokenUsageRecord fields (estimated_input_tokens, prompt_tokens, completion_tokens, invocation_id, usage_details) in tests/unit/agent_orchestrator/token_manager/test_token_models.py
- [X] T002 [P] Write unit tests for update_with_actual_tokens repository method in tests/unit/agent_orchestrator/token_manager/test_token_usage_repository.py

### Implementation for Foundational Phase

- [X] T003 Add estimated_input_tokens, prompt_tokens, completion_tokens, invocation_id (FK to invocations.id, ON DELETE SET NULL), and usage_details (JSONB) fields to TokenUsageRecord model. Update class docstring to replace "Immutable record... append-only (never updated)" with documentation reflecting the new lifecycle: record is created with estimate at pre-LLM time, then updated with actual token counts after LLM call completes. In src/nexus/agent_orchestrator/token_manager/models.py
- [X] T004 Create Alembic migration adding 5 nullable columns (estimated_input_tokens, prompt_tokens, completion_tokens, invocation_id, usage_details) and ix_token_usage_records_invocation_id index to token_usage_records table in src/nexus/core/database/migrations/versions/
- [X] T005 Add update_with_actual_tokens(invocation_id, prompt_tokens, completion_tokens, token_count, usage_details, session) method to TokenUsageRepository — finds record by invocation_id, updates fields, logs warning if no record found. Include comment on calculate_current_usage explaining the update model (token_count starts as estimate, updated to actual total after LLM call). In src/nexus/agent_orchestrator/token_manager/repository.py

**Checkpoint**: Model extended, migration ready, repository method available. All T001-T002 tests should now pass (green).

---

## Phase 3: User Story 3 - Pre-LLM Record Creation (Priority: P1)

**Goal**: Populate `estimated_input_tokens` and `invocation_id` at record creation time. This phase also wires invocation_id through AssemblerService, which is a prerequisite for the post-LLM update in Phase 4 (update_with_actual_tokens finds records by invocation_id).

**Independent Test**: Query `TokenUsageRecord` — newly created records have `estimated_input_tokens` and `invocation_id` set, with `prompt_tokens`/`completion_tokens` as NULL.

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T006 [P] [US3] Write unit tests for record_usage accepting and storing estimated_input_tokens and invocation_id parameters in tests/unit/agent_orchestrator/token_manager/test_token_usage_repository.py
- [X] T007 [P] [US3] Write unit tests for validate_and_record setting estimated_input_tokens (equal to token_count) and passing invocation_id when creating a record in tests/unit/agent_orchestrator/token_manager/test_token_validation_service.py
- [X] T008 [P] [US3] Write unit tests verifying AssemblerService passes invocation_id to validate_and_record at both call sites in tests/unit/agent_orchestrator/context_manager/test_assembler_service.py

### Implementation for User Story 3

- [X] T009 [US3] Extend record_usage in TokenUsageRepository to accept optional estimated_input_tokens and invocation_id parameters, setting them on the new TokenUsageRecord in src/nexus/agent_orchestrator/token_manager/repository.py
- [X] T010 [US3] Update validate_and_record in TokenValidationService to accept optional invocation_id, pass it plus estimated_input_tokens (set to same value as token_count) to record_usage in src/nexus/agent_orchestrator/token_manager/services.py
- [X] T011 [US3] Wire invocation_id from AssemblerService.assemble to validate_and_record at both call sites (~line 173 and ~line 404) in src/nexus/agent_orchestrator/context_manager/assembler_service/service.py

**Checkpoint**: Pre-LLM records now have `estimated_input_tokens` and `invocation_id` populated. US3-S1 and US2-S1 (partial) acceptance scenarios satisfied. Tests T006-T008 pass.

---

## Phase 4: User Story 1 - Record Provider-Reported Token Consumption (Priority: P1) MVP

**Goal**: Capture actual token counts from LLM provider responses and update `TokenUsageRecord` with `prompt_tokens`, `completion_tokens`, `usage_details`, and updated `token_count`.

**Independent Test**: Make an LLM call, verify the `TokenUsageRecord` is updated with actual `prompt_tokens`, `completion_tokens`, and `token_count = prompt_tokens + completion_tokens`.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] Write unit tests for _build_token_usage_entry helper extracting token data from AIMessage — cover: usage_metadata path, response_metadata["token_usage"] fallback, no-metadata returns None (FR-008), and zero-output-tokens edge case (completion_tokens=0) in tests/unit/agents/test_generic_agent.py
- [X] T013 [US1] Write unit tests for token usage log accumulation across multiple LLM calls in GenericAgent._execute — verify entries accumulate via state and retry behavior appends correctly in tests/unit/agents/test_generic_agent.py
- [X] T014 [P] [US1] Write unit tests for post-LLM token update logic in InvocationExecutor — cover: aggregation of multi-call entries, single-call vs multi-call usage_details (dict vs list), SAVEPOINT isolation, non-blocking on failure, invocation_id from invocation object (UUID not str), structured log output on success and warning-level log on failure (FR-012) in tests/unit/agent_orchestrator/executor/test_invocation_executor_token_update.py
- [X] T015 [P] [US1] Write unit test for OrchestrationService._build_streaming_result including llm_token_usage_log from final_state in result_dict, and handling final_state=None gracefully in tests/unit/services/test_orchestration_service.py
- [X] T016 [P] [US1] Write integration tests for end-to-end post-LLM recording — cover: US1-S1 (record updated with actuals), US1-S3 (no update on LLM failure), FR-007 (update failure non-blocking), FR-008 (no token metadata skips update) in tests/integration/agent_orchestrator/token_manager/test_post_llm_recording.py

### Implementation for User Story 1

- [X] T017 [US1] Add llm_token_usage_log field with Annotated[list[dict[str, Any]], operator.add] to AgentState TypedDict in src/nexus/agent_orchestrator/models/agent_state.py
- [X] T018 [US1] Implement _build_token_usage_entry(result_message: AIMessage) helper in GenericAgent that extracts input_tokens, output_tokens, and usage_details from AIMessage (check usage_metadata first, fallback to response_metadata["token_usage"], return None if neither present) in src/nexus/agent_orchestrator/agents/generic_agent.py
- [X] T019 [US1] Add token usage log append logic after record_llm_call() in GenericAgent._execute — call _build_token_usage_entry and if result is not None, return it in state["llm_token_usage_log"] for LangGraph accumulation in src/nexus/agent_orchestrator/agents/generic_agent.py
- [X] T020 [US1] Update OrchestrationService._build_streaming_result to extract llm_token_usage_log from final_state (using .get() with default []) and include it in result_dict — add extraction in the primary code path (when final_state has result), before calling _enhance_result_with_streaming_metadata. Handle final_state=None by defaulting to empty list. In src/nexus/agent_orchestrator/services/orchestration_service.py
- [X] T021 [US1] Implement post-LLM token update in InvocationExecutor.execute_invocation — pop llm_token_usage_log from result_dict (before storing as invocation.result), aggregate token counts (map extraction names to DB names: input_tokens to prompt_tokens, output_tokens to completion_tokens), build usage_details (single dict for 1 call, list of dicts for multiple calls), call TokenUsageRepository().update_with_actual_tokens within session.begin_nested() with try/except, add structured logging with user_id, invocation_id, prompt_tokens, completion_tokens, token_count for success and warning-level for failure in src/nexus/agent_orchestrator/executor/invocation_executor.py

**Checkpoint**: Full post-LLM pipeline functional. US1-S1, US1-S2, US1-S3 acceptance scenarios satisfied. Tests T012-T016 pass.

---

## Phase 5: User Story 2 - Correlate Token Usage to Invocations (Priority: P2)

**Goal**: Verify end-to-end invocation correlation — each token usage record is queryable by invocation_id with both estimated and actual data.

**Independent Test**: Execute an invocation and query `TokenUsageRecord` by `invocation_id`, verifying the record contains both estimated and actual token data.

**Note**: Implementation of invocation_id wiring was completed in Phase 3 (T009-T011). This phase focuses on integration verification.

### Tests for User Story 2

- [X] T022 [P] [US2] Write integration tests for invocation_id correlation — record has invocation_id set, query by invocation_id returns correct record, multi-call aggregation by invocation_id in tests/integration/agent_orchestrator/token_manager/test_post_llm_recording.py
- [X] T023 [P] [US2] Write integration test verifying budget uses actual token_count for completed invocations and tiktoken estimate for in-flight invocations (US1-S2, US3-S3) in tests/integration/agent_orchestrator/token_manager/test_token_validation_flow.py

**Checkpoint**: Token records are linked to invocations. US2-S1, US2-S2, US2-S3 acceptance scenarios verified. Tests T022-T023 pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Migration validation, full test suite verification, and quality checks

- [X] T024 [P] Write integration tests for remaining acceptance scenarios — verify usage_details is non-null JSONB with expected provider keys (prompt_tokens, completion_tokens, total_tokens) after successful update (FR-011), existing records unchanged after migration with new fields as NULL (FR-010) in tests/integration/agent_orchestrator/token_manager/test_post_llm_recording.py
- [X] T025 Run full test suite (make test-all) and fix any failures
- [X] T026 Run make format, make lint, make typecheck and fix any issues
- [X] T027 Verify quickstart.md validation scenario manually or via integration test

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — can start immediately
- **User Story 3 (Phase 3)**: Depends on Foundational phase (model + repository). Includes invocation_id wiring which is a prerequisite for Phase 4
- **User Story 1 (Phase 4)**: Depends on Phase 3 completion (post-LLM update finds records by invocation_id, which must be set at creation time)
- **User Story 2 (Phase 5)**: Depends on Phase 3 and Phase 4 completion — integration verification of the full flow
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 3 (P1)**: Can start after Foundational (Phase 2) — pre-LLM record creation changes only
- **User Story 1 (P1)**: Must start after Phase 3 — post-LLM pipeline requires invocation_id to be set on records (for update_with_actual_tokens lookup)
- **User Story 2 (P2)**: Depends on Phase 3 + Phase 4 — integration verification requires both pre-LLM and post-LLM flows

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models/state before services
- Services before integration points
- Core implementation before cross-cutting concerns

### Parallel Opportunities

- T001 and T002 (foundational tests) can run in parallel
- T006, T007, T008 (US3 tests) can run in parallel
- T012, T014, T015, T016 (US1 tests on different files) can run in parallel
- T013 follows T012 (same file — tests/unit/agents/test_generic_agent.py)
- T022 and T023 (US2 tests) can run in parallel
- Within US1 implementation: T017 first (AgentState), then T018+T019 (GenericAgent), then T020 (OrchestrationService), then T021 (InvocationExecutor)

---

## Parallel Example: User Story 1

```bash
# Launch tests on different files in parallel:
Task T012: "Unit tests for _build_token_usage_entry in tests/unit/agents/test_generic_agent.py"
Task T014: "Unit tests for InvocationExecutor token update in tests/unit/.../test_invocation_executor_token_update.py"
Task T015: "Unit test for OrchestrationService in tests/unit/services/test_orchestration_service.py"
Task T016: "Integration tests for post-LLM recording in tests/integration/.../test_post_llm_recording.py"

# Then T013 (same file as T012, must follow):
Task T013: "Unit tests for token log accumulation in tests/unit/agents/test_generic_agent.py"

# Then implement sequentially (dependency chain):
Task T017: "Add llm_token_usage_log to AgentState"
Task T018: "Implement _build_token_usage_entry helper"
Task T019: "Add append logic in GenericAgent._execute" — depends on T017, T018
Task T020: "Update OrchestrationService._build_streaming_result"
Task T021: "Implement post-LLM update in InvocationExecutor" — depends on T020
```

---

## Implementation Strategy

### MVP First (User Story 3 + User Story 1)

1. Complete Phase 2: Foundational (model, migration, repository)
2. Complete Phase 3: User Story 3 (pre-LLM record creation with estimated_input_tokens + invocation_id)
3. Complete Phase 4: User Story 1 (post-LLM update pipeline)
4. **STOP and VALIDATE**: Test US1 + US3 independently — records should have both estimated and actual fields
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Foundational → Model and migration ready
2. Add User Story 3 → Pre-LLM records have estimated_input_tokens and invocation_id → Test independently
3. Add User Story 1 → Post-LLM pipeline updates records with actuals → Test independently (MVP!)
4. Add User Story 2 → Invocation correlation verified end-to-end → Test independently
5. Polish → Full suite green, quality checks pass

### Parallel Team Strategy

With multiple developers:

1. Team completes Foundational together
2. Once Foundational is done:
   - Developer A: User Story 3 (pre-LLM changes + invocation_id wiring)
   - Developer B: User Story 1 tests (T012-T016, can start while US3 is in progress)
3. After US3 completes:
   - Developer B continues: User Story 1 implementation (T017-T021)
4. After US1 completes:
   - Either developer: User Story 2 (integration verification only)
5. Polish phase

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- TDD is required per project constitution — Red-Green-Refactor cycle
- `invocation_id` is `str` in AgentState but `UUID` in TokenUsageRecord — InvocationExecutor has the Invocation object with `.id` (UUID), use that directly
- Field name mapping between layers: AIMessage extraction uses `input_tokens`/`output_tokens`, DB fields use `prompt_tokens`/`completion_tokens` — the mapping happens in InvocationExecutor (T021) during aggregation
