# Research: Post-LLM Token Count Capture

**Feature**: 037-post-llm-token-count
**Date**: 2026-03-23

## R1: Token Extraction from LLM Responses

> **Superseded by R9 and R13.** This decision explored two options (make `_extract_token_usage()` public, or extract from serialized result dict). R9 resolves extraction in favor of direct `AIMessage` attribute access in GenericAgent. R13 describes how token data is accumulated in AgentState and threaded to InvocationExecutor.

## R2: Where to Hook Post-LLM Recording

**Decision**: Two-part approach — (1) `GenericAgent._execute()` appends per-call token data to `state["llm_token_usage_log"]` after each successful LLM call (no DB access), (2) `InvocationExecutor.execute_invocation()` reads the accumulated log from `result_dict` and updates the existing `TokenUsageRecord` with actual token counts.

**Rationale**: A single invocation can trigger multiple LLM calls via tool-use loops (US2-S2). Each LangGraph iteration through GenericAgent overwrites `state["result"]`, so extracting from the final `result_dict` would only capture the LAST call's metadata. The two-part approach solves this:

- **GenericAgent (collection)**: After each successful LLM call, extracts token usage from the `AIMessage` response and appends it to `state["llm_token_usage_log"]` (see R9 for extraction, R13 for state schema). This is pure data manipulation — no DB access, so agents remain DB-free. The log accumulates across LangGraph iterations because AgentState is shared across graph nodes.
- **OrchestrationService (threading)**: `_build_streaming_result()` includes `llm_token_usage_log` from the final AgentState in the returned `result_dict`.
- **InvocationExecutor (persistence)**: Reads `result_dict["llm_token_usage_log"]`, aggregates token counts across all entries, and performs a single UPDATE on the existing `TokenUsageRecord` — setting `prompt_tokens`, `completion_tokens`, `usage_details`, and updating `token_count` to the actual total (`prompt_tokens + completion_tokens`). All within `session.begin_nested()` (SAVEPOINT) isolation (R6). DB session, user_id, and invocation_id are all already available (R3, R4).

**Retry boundary analysis**: `@retry_with_backoff` wraps `GenericAgent._execute()`. If a retry occurs after a successful LLM call (e.g., during response parsing), the LLM call's tokens were genuinely consumed — accumulating them in state is correct behavior. The retry will make another LLM call and append its own entry. All entries represent real token consumption. Persistence happens once in InvocationExecutor after the full orchestration succeeds.

**Alternatives considered**:
- Extract from `result_dict["metadata"]` in InvocationExecutor — **rejected** because `state["result"]` is overwritten on each LangGraph iteration, losing intermediate LLM call metadata in multi-call invocations (tool-use loops)
- Hook inside `record_llm_call` with a persistence callback — rejected because it mixes metrics (ephemeral) with database persistence concerns and requires plumbing callbacks through multiple layers
- Hook in `OrchestrationService` after graph execution — rejected because OrchestrationService doesn't have a database session
- Record directly in GenericAgent with injected repository — rejected because it breaks the "agents are DB-free" convention and is inside the retry boundary

## R3: Obtaining user_id

**Decision**: Use `invocation.created_by` already loaded in InvocationExecutor

**Rationale**: `InvocationExecutor.execute_invocation()` loads the `Invocation` object from the database at the start of execution. The `created_by` field (inherited from `UserOwnedResource`) contains the user's UUID. No additional query is needed.

**Pre-LLM invocation_id wiring (FR-005)**: For pre-LLM records, `invocation_id` must also reach `validate_and_record()`. `AssemblerService.assemble()` already receives `invocation_id` as a parameter but currently does NOT pass it through to `self.token_service.validate_and_record()`. Implementation must add `invocation_id` as an optional parameter to `validate_and_record()` and wire it from AssemblerService's existing `invocation_id` param. This is a one-line change in each of the two `validate_and_record()` call sites in `assembler_service/service.py` (lines 173 and 404).

**Alternatives considered**:
- Look up user_id from invocation_id via a separate query — rejected because the invocation is already loaded in InvocationExecutor
- Add user_id to AgentState — rejected because it requires changes across the orchestration pipeline

## R4: Database Session Access

**Decision**: Use the existing database session in InvocationExecutor's `get_async_session_context()`

**Rationale**: `InvocationExecutor.execute_invocation()` already wraps its work in an `async with self.get_async_session_context() as session:` block. The post-LLM recording can use this same session, keeping the recording within the same transaction boundary as the invocation status update. This is simpler and more reliable than creating a separate session.

**Alternatives considered**:
- Create a new short-lived session in GenericAgent — rejected because GenericAgent is intentionally DB-free and adding session creation breaks its design
- Pass session through AgentState — rejected because sessions are not serializable

## R5: TokenType Enum

> **Dropped.** The single-record-per-invocation design (see spec clarification 2026-03-25) eliminates the need for a `token_type` discriminator. Instead of separate `pre_llm` and `post_llm` records, a single `TokenUsageRecord` is created at pre-LLM time with the tiktoken estimate, then updated with actual provider-reported counts after the LLM call completes. Dedicated fields (`estimated_input_tokens`, `prompt_tokens`, `completion_tokens`) distinguish estimated from actual values without requiring a type enum.

## R6: Non-Blocking Recording Strategy

**Decision**: Wrap the post-LLM database update in a `session.begin_nested()` (SAVEPOINT) block with try/except that logs errors but does not raise, ensuring the LLM response is always returned to the caller

**Rationale**: FR-007 requires non-blocking behavior. The update is best-effort: if it fails, the LLM response should still be delivered. A simple try/except alone is insufficient because if `session.flush()` fails inside the update, the SQLAlchemy session enters an invalid state — subsequent operations (storing `invocation.result`, `session.commit()`) would fail with `InvalidRequestError`. Using `session.begin_nested()` creates a SAVEPOINT that isolates the token update; if it fails, the savepoint rolls back cleanly, leaving the session usable for the invocation completion flow. This is the same pattern already used in `TokenValidationService.validate_and_record()` (services.py line 193).

```python
try:
    async with session.begin_nested():
        await repo.update_with_actual_tokens(...)
except Exception:
    logger.warning("Post-LLM token update failed", ...)
```

**Alternatives considered**:
- Simple try/except without SAVEPOINT — rejected because a failed `session.flush()` corrupts the session state, preventing the invocation from being marked as completed
- Background task queue (e.g., asyncio.create_task) — adds complexity for minimal benefit; the DB write is fast (<50ms)
- Separate Temporal activity — over-engineered for a single UPDATE
- Separate database session — viable but unnecessary; SAVEPOINT provides sufficient isolation with less overhead

## R7: Migration Strategy for Existing Records

**Decision**: Add new nullable columns via Alembic migration. Existing records retain their `token_count` values unchanged.

**Rationale**: New fields (`estimated_input_tokens`, `prompt_tokens`, `completion_tokens`, `invocation_id`, `usage_details`) are added as nullable columns. Existing records represent pre-feature estimates — they have valid `token_count` values and the new fields default to NULL, which correctly indicates no post-LLM data was captured. No backfill is needed since there is no `token_type` discriminator to populate.

**Alternatives considered**:
- Create a new table for post-LLM data — rejected because it fragments the budget calculation query and violates DRY
- Backfill `estimated_input_tokens` from `token_count` on existing records — rejected because it's unnecessary; existing records don't need the estimate/actual distinction since they predate this feature

## R8: Concurrent Recording and Budget Integrity

**Decision**: Post-LLM update does not need row-level locking (SELECT FOR UPDATE)

**Rationale**: Unlike pre-LLM validation which checks-then-writes (requiring atomicity), post-LLM recording is a simple UPDATE of an existing record. Only one InvocationExecutor processes a given invocation, so there's no contention. The budget validation (with locking) happens only during pre-LLM validation.

**Alternatives considered**:
- Use the same locking pattern as validate_and_record — rejected because post-LLM recording doesn't validate against limits, it just updates the existing record

## R9: Extracting Token Counts from LLM Responses

**Decision**: Extract token usage from the `AIMessage` object directly in `GenericAgent._execute()`, using the same response attributes that `_extract_token_usage()` uses in the metrics module, and append it to `state["llm_token_usage_log"]` (see R13 for state schema).

**Extraction point**: After `record_llm_call()` returns `result_message` (an `AIMessage`), GenericAgent extracts token data and appends to state:

```python
# In GenericAgent._execute(), after record_llm_call():
usage_entry = _build_token_usage_entry(result_message)
if usage_entry:
    state.setdefault("llm_token_usage_log", []).append(usage_entry)
```

**Extraction path**: LLM providers return token usage in two formats on the AIMessage:

1. **Newer format** (`usage_metadata`): `result_message.usage_metadata` → keys `input_tokens`, `output_tokens`
2. **Older format** (`token_usage`): `result_message.response_metadata.get("token_usage")` → keys `prompt_tokens`, `completion_tokens`

Check `usage_metadata` first (newer), fall back to `token_usage` (older) — same priority as `_extract_token_usage()` in metrics.

**Each log entry contains**:
- `input_tokens`: int — actual input tokens for this call
- `output_tokens`: int — actual output tokens for this call
- `usage_details`: dict — the full provider usage dict, preserved as-is for the JSONB column (R12)

**DRY trade-off**: `_extract_token_usage()` in `metrics/instrumentation.py` extracts from the same `AIMessage` type but returns only `(input_tokens, output_tokens)` — we also need the full usage dict for `usage_details`. Writing a small helper (~8 lines) in GenericAgent that extracts both the counts and the full dict is preferred over refactoring the metrics module's interface for one consumer.

**Alternatives considered**:
- Extract from serialized `result_dict["metadata"]` in InvocationExecutor — **rejected** because `state["result"]` is overwritten per LangGraph iteration, losing intermediate calls in multi-call invocations (see R2)
- Reuse `_extract_token_usage()` directly — rejected because it doesn't return the full usage dict needed for `usage_details`
- Make `_extract_token_usage()` public and extend its return type — rejected because it changes the metrics module's interface for a single consumer and adds coupling

## R10: Repository Pattern Context

**Decision**: Extend the existing `TokenUsageRepository` with a new `update_with_actual_tokens()` method rather than refactoring to the `BaseService` pattern.

**Rationale**: `TokenUsageRepository` is the only repository class in the codebase — all other modules (ToolService, WorkflowService, InvocationService, ExecutionService, ToolProviderService, ApprovalService) use `BaseService` directly for database operations. However, the token_manager module was designed with an explicit repository layer from the start (spec 012), and `TokenValidationService` depends on the repository via constructor injection. Refactoring to BaseService would require rewriting the existing service, tests, and injection patterns — a scope expansion that provides no functional benefit for this feature. Extending the existing repository is the pragmatic choice.

**Alternatives considered**:
- Refactor TokenUsageRepository into TokenUsageService (BaseService) — rejected because it's a large refactoring unrelated to this feature's goals, and the existing pattern works correctly
- Add a second service alongside the repository — rejected because it would fragment the persistence logic

## R11: Storing LLM Model Name on TokenUsageRecord

> **Dropped.** A dedicated `llm_model_name` column was considered but removed because: (1) the LLM model name is already captured in the `usage_details` JSONB and in the invocation's `response_metadata`, making a separate column redundant; (2) `UserTokenConfig.model_name` already exists in the same module with different semantics (tiktoken tokenizer), creating naming confusion. The model name can be queried from `usage_details` JSONB via `usage_details->>'model'` when per-model reporting is needed.

## R12: Storing Full Provider Token Usage Details

**Decision**: Add a nullable `usage_details: JSONB` column to `TokenUsageRecord` to store the full provider-reported token usage breakdown, while keeping `token_count` as the single budget-relevant integer.

**Rationale**: LLM providers return a rich token usage structure beyond a single number:

```json
{
  "completion_tokens": 150,
  "prompt_tokens": 943,
  "total_tokens": 1093,
  "prompt_tokens_details": {"cached_tokens": 128}
}
```

Storing only the aggregated total in `token_count` loses valuable data — cached token counts, per-call breakdown, and provider-specific fields. However, adding individual columns for each field is fragile: providers evolve their response format, and new fields (e.g., `reasoning_tokens`, `audio_tokens`) would require schema migrations each time.

A JSONB column provides:
- **Full fidelity**: The entire provider response is preserved as-is
- **Future-proof**: New provider fields are captured automatically without migrations
- **Queryable**: PostgreSQL JSONB supports indexed queries (e.g., `usage_details->>'cached_tokens'`)
- **Non-breaking**: Nullable, so existing records simply have `NULL`

**Budget semantics**: `token_count` remains the single integer used for rolling window budget calculation. When the record is created (pre-LLM), `token_count` is set to the tiktoken estimate. After the LLM call completes, `token_count` is updated to `prompt_tokens + completion_tokens` (actual total). The full breakdown in `usage_details` is for reporting and cost analysis — NOT for budget enforcement.

**Alternatives considered**:
- Multiple typed columns (`input_tokens`, `output_tokens`, `cached_tokens`, `total_tokens`) — rejected because it's rigid, requires migrations when providers add new fields
- Store only the total with no detail — rejected because it discards valuable data that enables reconciliation between tiktoken estimates and provider-reported counts

## R13: AgentState Extension for Token Usage Accumulation

**Decision**: Add an `llm_token_usage_log` field to `AgentState` (TypedDict) that accumulates per-call token usage entries across LangGraph iterations, and thread it through `OrchestrationService._build_streaming_result()` into `result_dict` for InvocationExecutor to consume.

**Field definition**:
```python
# In AgentState TypedDict
llm_token_usage_log: Annotated[list[dict[str, Any]], operator.add]  # Accumulated per-LLM-call token data
```

**LangGraph accumulation**: The `Annotated[list, operator.add]` annotation is required — without it, LangGraph replaces the field value on each node execution instead of accumulating. This is the same pattern used by `messages: Annotated[list[AnyMessage], operator.add]` in the existing AgentState. Each GenericAgent iteration returns `{"llm_token_usage_log": [entry]}` and LangGraph concatenates it with the existing list.

**Each entry structure**:
```python
{
    "input_tokens": 943,         # Actual input tokens for this call
    "output_tokens": 150,        # Actual output tokens for this call
    "usage_details": {           # Full provider breakdown -> usage_details JSONB
        "completion_tokens": 150,
        "prompt_tokens": 943,
        "total_tokens": 1093,
        "prompt_tokens_details": {"cached_tokens": 128}
    }
}
```

**Threading to InvocationExecutor**: `OrchestrationService._build_streaming_result()` already reads from `final_state` to construct `result_dict`. It must include `llm_token_usage_log` from the final state:
```python
result_dict["llm_token_usage_log"] = final_state.get("llm_token_usage_log", [])
```

**Multi-call behavior**: In tool-use loops, LangGraph routes back to GenericAgent multiple times. Each iteration returns `{"llm_token_usage_log": [entry]}` which LangGraph concatenates via `operator.add`. The log grows with each call. InvocationExecutor aggregates all entries: `prompt_tokens = sum(input_tokens)`, `completion_tokens = sum(output_tokens)`, and updates the single `TokenUsageRecord` with the totals. The `usage_details` field stores the full list of per-call details: `[{call1_usage}, {call2_usage}, ...]`. This preserves the complete provider breakdown for every LLM call in the invocation, satisfying FR-011's "full provider-reported token breakdown" requirement.

**Alternatives considered**:
- Single accumulated total in AgentState — rejected because it loses per-call granularity needed for US2-S2
- Separate key per call (e.g., `token_usage_call_1`) — rejected because it requires knowing the call count upfront and complicates iteration
- Store in `state["result"]["metadata"]` — rejected because `state["result"]` is overwritten on each LangGraph iteration

## R14: Updating TokenUsageRecord with Actual Token Counts

**Decision**: After all LLM calls complete, update the existing `TokenUsageRecord` with provider-reported actual token counts (`prompt_tokens`, `completion_tokens`) and set `token_count` to the actual total.

**Rationale**: The tiktoken estimate (stored at record creation) can diverge significantly from actual tokens — especially when the tiktoken model (`gpt-4` default in `UserTokenConfig`) doesn't match the actual LLM (`anthropic/claude-3.5-sonnet` via OpenRouter). This causes budget inaccuracies:
- **Underestimate**: User appears to have headroom but has actually consumed more
- **Overestimate**: User blocked by false positive → poor experience

Updating the record with actual tokens after the call completes ensures the budget reflects real consumption. The record serves dual purposes: (1) budget reservation during in-flight processing (using the estimate), and (2) accurate total tracking after completion (using actuals).

**Implementation**:
```python
# In InvocationExecutor, after orchestration completes:
llm_token_usage_log = result_dict.get("llm_token_usage_log", [])
if llm_token_usage_log:
    total_input = sum(entry["input_tokens"] for entry in llm_token_usage_log)
    total_output = sum(entry["output_tokens"] for entry in llm_token_usage_log)
    # Preserve all per-call usage details as a list
    all_usage_details = [entry.get("usage_details", {}) for entry in llm_token_usage_log]
    # For single-call invocations, unwrap to a plain dict for simplicity
    usage_details = all_usage_details[0] if len(all_usage_details) == 1 else all_usage_details

    try:
        async with session.begin_nested():
            await repo.update_with_actual_tokens(
                invocation_id=invocation.id,
                prompt_tokens=total_input,
                completion_tokens=total_output,
                token_count=total_input + total_output,
                usage_details=usage_details,
                session=session,
            )
    except Exception:
        logger.warning("Post-LLM token update failed", ...)
```

**Repository method**: `TokenUsageRepository.update_with_actual_tokens(invocation_id, prompt_tokens, completion_tokens, token_count, usage_details, session)` — finds the record by `invocation_id` and updates it. If no record is found (edge case), logs a warning and skips.

**Multi-call aggregation**: When an invocation triggers N LLM calls (tool-use loops), each call has different input/output tokens. The record is updated with the **sum** of all calls' tokens, reflecting total consumption across the invocation.

**Non-blocking**: The update is wrapped in `session.begin_nested()` (SAVEPOINT) with try/except. If the update fails, the estimate remains as `token_count` — degraded accuracy but no failure.

**Single-record rationale**: Using one record per invocation (created at pre-LLM, updated post-LLM) is simpler than the multi-record alternative because:
- No `token_type` enum needed
- Budget query (`SUM(token_count)`) works unchanged
- Single UPDATE vs N INSERTs + 1 UPDATE
- `estimated_input_tokens` preserves the original estimate for audit/comparison

**Alternatives considered**:
- Keep the estimate unchanged — rejected because tiktoken estimates using the wrong model (gpt-4 tokenizer for Claude) produce unreliable budget calculations
- Two records per invocation (pre_llm + post_llm with token_type enum) — rejected because it adds schema complexity (enum, type column, index) without proportional benefit; dedicated fields on a single record are simpler and achieve the same goal
- Only count post-LLM actuals in budget — rejected because in-flight requests would have zero budget impact, allowing concurrent request flooding
