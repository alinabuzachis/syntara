# Data Model: Post-LLM Token Count Capture

**Feature**: 037-post-llm-token-count
**Date**: 2026-03-23

## Entity Changes

### TokenUsageRecord (Extended)

Five new fields added to the existing `token_usage_records` table:

| Field                    | Type                         | Nullable | Default | Index | Description                                                        |
|--------------------------|------------------------------|----------|---------|-------|--------------------------------------------------------------------|
| `estimated_input_tokens` | `INTEGER` (ge=0)             | Yes      | `NULL`  | No    | Tiktoken estimate recorded before the LLM call (preserved for audit) |
| `prompt_tokens`          | `INTEGER` (ge=0)             | Yes      | `NULL`  | No    | Actual input tokens reported by the provider after the LLM call    |
| `completion_tokens`      | `INTEGER` (ge=0)             | Yes      | `NULL`  | No    | Actual output tokens reported by the provider after the LLM call   |
| `invocation_id`          | `UUID` (FK -> invocations.id)| Yes      | `NULL`  | Yes   | Links record to the originating invocation                         |
| `usage_details`          | `JSONB`                      | Yes      | `NULL`  | No    | Full provider-reported token usage breakdown, preserved as-is      |

**`usage_details` structure** (example after LLM call completes):
```json
{
  "completion_tokens": 150,
  "prompt_tokens": 943,
  "total_tokens": 1093,
  "prompt_tokens_details": {"cached_tokens": 128}
}
```

**Record lifecycle**:

1. **Pre-LLM (record creation)**: `validate_and_record()` creates the record with `token_count` set to the tiktoken estimate and `estimated_input_tokens` set to the same value. Fields `prompt_tokens`, `completion_tokens`, and `usage_details` are `NULL`. The `invocation_id` is set to link the record to the originating invocation.

2. **Post-LLM (record update)**: After the LLM call(s) complete, `InvocationExecutor` updates the existing record with actual token counts:
   - `prompt_tokens` = sum of actual input tokens across all LLM calls
   - `completion_tokens` = sum of actual output tokens across all LLM calls
   - `token_count` = `prompt_tokens + completion_tokens` (actual total replaces the estimate)
   - `usage_details` = full provider-reported usage breakdown

**Multi-call invocations**: A single invocation can trigger multiple LLM calls (e.g., tool-use loops). Token counts (`prompt_tokens`, `completion_tokens`) are aggregated (summed) across all calls before the single UPDATE. The `estimated_input_tokens` preserves the original tiktoken estimate for comparison with the actual `prompt_tokens`. For multi-call invocations, `usage_details` stores a JSON array of per-call breakdowns: `[{call1_usage}, {call2_usage}, ...]`. For single-call invocations, `usage_details` is a plain JSON object.

The `token_count` field holds the budget-relevant value:
- **In-flight requests**: `token_count` = tiktoken estimate (budget reservation)
- **Completed requests**: `token_count` = `prompt_tokens + completion_tokens` (actual total consumption)

**Relationships**:
- `user_id` -> `users.id` (existing FK, unchanged)
- `invocation_id` -> `invocations.id` (new optional FK, `ON DELETE SET NULL` — if an invocation is deleted, the token usage record is preserved and continues to count toward the budget; only the `invocation_id` column is set to `NULL`)

**Indexes** (new):
- `ix_token_usage_records_invocation_id` — for per-invocation queries

### Unchanged Entities

- **UserTokenConfig**: No changes. The `token_limit` and `window_duration_seconds` apply to the sum of all `TokenUsageRecord.token_count` values within the rolling window.
- **Invocation**: No changes. Referenced by the new FK on `TokenUsageRecord`.

## Migration Plan

**Migration file**: `src/nexus/core/database/migrations/versions/<hash>_add_post_llm_token_fields.py`
**Depends on**: `5abf3f93826f` (add_token_counting_tables) -> latest (replace with actual hash at implementation time)

**Steps**:
1. Add `estimated_input_tokens` column as nullable INTEGER to `token_usage_records`
2. Add `prompt_tokens` column as nullable INTEGER to `token_usage_records`
3. Add `completion_tokens` column as nullable INTEGER to `token_usage_records`
4. Add `invocation_id` column as nullable UUID with FK constraint (`ON DELETE SET NULL` — preserves token record if invocation is removed) to `token_usage_records`
5. Add `usage_details` column as nullable JSONB to `token_usage_records`
6. Create index on `invocation_id`

**Downgrade**:
1. Drop index on `invocation_id`
2. Drop columns: `estimated_input_tokens`, `prompt_tokens`, `completion_tokens`, `invocation_id`, `usage_details` from `token_usage_records`

**Existing records**: Pre-existing `TokenUsageRecord` entries remain valid after migration. All new fields default to NULL. The existing `token_count` values are unchanged and continue to represent pre-LLM estimates (FR-010).

## Query Impact

### calculate_current_usage (unchanged query, improved accuracy)

The existing query sums all `token_count` within the rolling window. No query changes are needed:

- **In-flight requests**: Only the tiktoken estimate exists in `token_count` -> budget reservation
- **Completed requests**: `token_count` has been updated to `prompt_tokens + completion_tokens` -> actual total

```sql
-- No changes needed: token_count starts as tiktoken estimate for in-flight,
-- updated to actual total (prompt_tokens + completion_tokens) after completion.
SELECT COALESCE(SUM(token_count), 0)
FROM token_usage_records
WHERE user_id = :user_id
  AND request_timestamp >= :cutoff_time
```

**Implementation note**: Add this rationale as a code comment in `TokenUsageRepository.calculate_current_usage()` so future developers understand the update model.

### New: Per-invocation usage query (future reporting)

```sql
-- Returns estimated vs actual token breakdown for a single invocation
SELECT
    estimated_input_tokens,
    prompt_tokens,
    completion_tokens,
    token_count,
    usage_details
FROM token_usage_records
WHERE invocation_id = :invocation_id
```

### New: Estimation accuracy query (future reporting)

```sql
-- Compare tiktoken estimates to actual input tokens for completed invocations
SELECT
    estimated_input_tokens,
    prompt_tokens,
    ABS(estimated_input_tokens - prompt_tokens) as estimate_delta
FROM token_usage_records
WHERE prompt_tokens IS NOT NULL
  AND estimated_input_tokens IS NOT NULL
ORDER BY ABS(estimated_input_tokens - prompt_tokens) DESC
```

### New: Per-model usage query (future reporting, via JSONB)

```sql
SELECT usage_details->>'model' as model, SUM(token_count) as total_tokens
FROM token_usage_records
WHERE user_id = :user_id
  AND request_timestamp >= :cutoff_time
  AND prompt_tokens IS NOT NULL  -- only completed invocations
GROUP BY usage_details->>'model'
```
