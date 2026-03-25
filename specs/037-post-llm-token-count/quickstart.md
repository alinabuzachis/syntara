# Quickstart Validation: Post-LLM Token Count Capture

**Feature**: 037-post-llm-token-count
**Date**: 2026-03-23

## Prerequisites

- PostgreSQL running with test database
- Nexus application running locally (`make run` or equivalent)
- A user with `UserTokenConfig` configured

## Validation Scenario

### Step 1: Verify Record Creation (Pre-LLM)

Submit a request through the API that triggers an LLM call:

```bash
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello, what is 2+2?"}'
```

After the request completes, query the database for the token usage record. Verify that the pre-LLM fields are set (the record is created with the estimate before the LLM call, then updated with actuals after):

```sql
SELECT id, user_id, token_count, estimated_input_tokens,
       prompt_tokens, completion_tokens, invocation_id, request_timestamp
FROM token_usage_records
ORDER BY request_timestamp DESC
LIMIT 1;
```

**Expected**: A record with:
- `token_count` = positive integer (tiktoken estimate)
- `estimated_input_tokens` = same value as `token_count`
- `prompt_tokens` = NULL (not yet populated)
- `completion_tokens` = NULL (not yet populated)
- `invocation_id` = UUID of the request

### Step 2: Verify Record Update (Post-LLM)

After the same request completes, query the same record:

```sql
SELECT id, user_id, token_count, estimated_input_tokens,
       prompt_tokens, completion_tokens, usage_details,
       invocation_id, request_timestamp
FROM token_usage_records
ORDER BY request_timestamp DESC
LIMIT 1;
```

**Expected**: The same record now updated with:
- `estimated_input_tokens` = original tiktoken estimate (unchanged)
- `prompt_tokens` = positive integer (provider-reported actual input tokens)
- `completion_tokens` = positive integer (provider-reported actual output tokens)
- `token_count` = `prompt_tokens + completion_tokens` (actual total, replacing the estimate)
- `usage_details` containing the full provider breakdown:
```json
{"completion_tokens": 150, "prompt_tokens": 943, "total_tokens": 1093, "prompt_tokens_details": {"cached_tokens": 128}}
```

### Step 3: Verify Estimation Accuracy

Compare the tiktoken estimate to the actual input tokens:

```sql
SELECT
    estimated_input_tokens as estimate,
    prompt_tokens as actual_input,
    completion_tokens as actual_output,
    token_count as budget_total,
    ABS(estimated_input_tokens - prompt_tokens) as estimate_delta
FROM token_usage_records
WHERE prompt_tokens IS NOT NULL
ORDER BY request_timestamp DESC
LIMIT 5;
```

**Expected**: `estimate_delta` shows the difference between tiktoken's estimate and the provider's actual count. Non-zero deltas are expected (especially with gpt-4 tokenizer estimating for Claude).

### Step 4: Verify Budget Calculation

Query current usage to verify the budget reflects actual consumption:

```sql
SELECT
    COUNT(*) as record_count,
    SUM(token_count) as total_budget_usage,
    SUM(CASE WHEN prompt_tokens IS NOT NULL THEN 1 ELSE 0 END) as completed_count,
    SUM(CASE WHEN prompt_tokens IS NULL THEN 1 ELSE 0 END) as in_flight_count
FROM token_usage_records
WHERE user_id = '<user_id>'
  AND request_timestamp >= NOW() - INTERVAL '1 hour';
```

**Expected**: `total_budget_usage` includes actual totals for completed invocations and tiktoken estimates for in-flight ones.

### Step 5: Verify Migration (Existing Records)

If existing token records were present before migration:

```sql
SELECT COUNT(*) as total,
       COUNT(estimated_input_tokens) as with_estimate,
       COUNT(prompt_tokens) as with_actuals
FROM token_usage_records;
```

**Expected**: Pre-existing records have `estimated_input_tokens = NULL`, `prompt_tokens = NULL`, `completion_tokens = NULL`. Their `token_count` values are unchanged.

### Step 6: Verify No Update on LLM Failure

Submit a request that will cause an LLM failure (e.g., invalid configuration), then verify the record was not updated:

```sql
SELECT token_count, estimated_input_tokens, prompt_tokens, completion_tokens
FROM token_usage_records
ORDER BY request_timestamp DESC
LIMIT 1;
```

**Expected**: The record retains the tiktoken estimate in `token_count`. `prompt_tokens` and `completion_tokens` remain NULL. The original estimate serves as the budget value.

### Step 7: Verify Multi-Call Invocation (Tool-Use Loop)

Submit a request that triggers tool use (requiring multiple LLM calls):

```bash
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Use the search tool to find information about Python asyncio"}'
```

After the request completes, verify that token counts are aggregated across all LLM calls:

```sql
SELECT
    estimated_input_tokens,
    prompt_tokens,
    completion_tokens,
    token_count,
    jsonb_array_length(usage_details::jsonb) as llm_call_count
FROM token_usage_records
ORDER BY request_timestamp DESC
LIMIT 1;
```

**Expected**: For a multi-call invocation:
- `prompt_tokens` = sum of actual input tokens across all LLM calls (larger than estimate)
- `completion_tokens` = sum of actual output tokens across all LLM calls
- `token_count` = `prompt_tokens + completion_tokens`
- `usage_details` is a JSON array with one entry per LLM call (e.g., `llm_call_count >= 2`)

**Note**: If `usage_details` is a plain object (not an array), the invocation made only a single LLM call. Trigger a request requiring tool use to see multi-call behavior.

## Success Criteria

- [ ] Records are created with `estimated_input_tokens` and `token_count` set to tiktoken estimate
- [ ] After LLM call completes, `prompt_tokens`, `completion_tokens`, and `usage_details` are populated
- [ ] `token_count` is updated to `prompt_tokens + completion_tokens` after completion
- [ ] `estimated_input_tokens` preserves the original tiktoken estimate for comparison
- [ ] Records have `invocation_id` linking to the originating invocation
- [ ] Budget calculation (`SUM(token_count)`) reflects actual totals for completed invocations
- [ ] Pre-existing records are unchanged after migration (new fields are NULL)
- [ ] Failed LLM calls leave the record with the estimate (no post-LLM update)
