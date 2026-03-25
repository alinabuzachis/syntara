# Feature Specification: Post-LLM Token Count Capture

**Feature Branch**: `037-post-llm-token-count`
**Created**: 2026-03-23
**Status**: Draft
**Input**: User description: "Capture and store real LLM token consumption as returned by the provider in the database, correlated to workflow and activity executions. Define the extension for the TokenUsageRecord."

## Clarifications

### Session 2026-03-25
- Q: Should the system use two records per invocation (pre_llm + post_llm with a token_type enum) or a single record with dedicated fields for estimated and actual tokens? → A: Single record per invocation with dedicated fields (`estimated_input_tokens`, `prompt_tokens`, `completion_tokens`). The existing `token_count` field serves as the budget value — starts as tiktoken estimate, updated to actual total after LLM call. No `token_type` enum needed.
- Q: Is `total_tokens` needed alongside `token_count`? → A: No — `token_count` already exists and serves as the budget-relevant total. `total_tokens` is redundant with `prompt_tokens + completion_tokens`.

### Session 2026-03-24
- Q: US1-S1 mixes record creation with budget explanation — should the budget context stay in S1 or be trimmed? → A: Trim — the budget explanation belongs in US1-S3 and US3-S3; S1 should focus only on what gets persisted

### Session 2026-03-23
- Q: Where does tiktoken fit in the pre-LLM vs post-LLM flow? → A: tiktoken is pre-LLM only — used for local input token estimation before the call; post-LLM counts come directly from the provider's response metadata without local tokenization

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record Provider-Reported Token Consumption (Priority: P1)

As a platform operator managing LLM costs, I need the system to capture the actual token counts reported by the LLM provider after each call and persist them to the database, so that I have an accurate record of real consumption rather than relying solely on pre-call estimates.

Currently, the system estimates input tokens before the LLM call using tiktoken and records them in `TokenUsageRecord`. After the call, the LLM provider returns actual input and output token counts via response metadata, but these are only sent to ephemeral Prometheus metrics (24-hour retention). This story closes that gap by updating the existing record with provider-reported token counts.

**Why this priority**: Without persistent storage of actual consumption, cost tracking is incomplete and inaccurate. Output tokens are often the larger cost component and are entirely untracked in the database today.

**Independent Test**: Can be fully tested by making an LLM call and verifying that the `TokenUsageRecord` is updated with actual `prompt_tokens`, `completion_tokens`, and an accurate `token_count`.

**Acceptance Scenarios**:

1. **Given** a user submits a request that passes pre-LLM token validation, **When** the LLM responds successfully with usage metadata reporting 943 input tokens and 500 output tokens, **Then** the system updates the existing `TokenUsageRecord` with `prompt_tokens=943`, `completion_tokens=500`, and `token_count=1443` (actual total replacing the estimate)
2. **Given** a user has a token limit of 10,000 and current usage of 8,000 (from completed invocations with actual token counts), **When** they submit a new request estimated at 2,500 input tokens, **Then** the pre-LLM validation raises `TokenLimitExceededError` because 8,000 + 2,500 = 10,500 > 10,000
3. **Given** an LLM call fails with an error, **When** the response contains no token usage metadata, **Then** the `TokenUsageRecord` is not updated (retains the tiktoken estimate) and the failure is logged

---

### User Story 2 - Correlate Token Usage to Invocations (Priority: P2)

As a platform operator analyzing per-invocation costs, I need each token usage record linked to the invocation that triggered it, so that I can attribute token consumption to specific user requests and understand cost drivers.

**Why this priority**: Without correlation, token records are an anonymous stream of numbers. Linking to invocations enables per-request cost analysis, debugging, and chargeback reporting.

**Independent Test**: Can be tested by executing an invocation and querying `TokenUsageRecord` filtered by `invocation_id`, verifying the record contains both estimated and actual token data.

**Acceptance Scenarios**:

1. **Given** an invocation triggers an LLM call, **When** the call completes, **Then** the `TokenUsageRecord` has `invocation_id` set and contains both the original estimate (`estimated_input_tokens`) and actual counts (`prompt_tokens`, `completion_tokens`)
2. **Given** an invocation triggers multiple LLM calls (e.g., tool-use loop), **When** all calls complete, **Then** the single `TokenUsageRecord` contains the aggregated actual tokens across all calls
3. **Given** a query for token usage by `invocation_id`, **When** results are returned, **Then** each record shows the estimated vs actual token breakdown for that invocation

---

### User Story 3 - Distinguish Estimated and Actual Token Counts (Priority: P1)

As a platform operator reviewing token usage reports, I need to see both the pre-LLM estimate and the post-LLM actual token counts on each usage record, so that I can understand estimation accuracy and identify cost optimization opportunities.

**Why this priority**: Comparing estimates to actuals reveals tiktoken accuracy and helps identify cases where the estimation model should be updated.

**Independent Test**: Can be tested by querying `TokenUsageRecord` and verifying that completed records have both `estimated_input_tokens` and `prompt_tokens`/`completion_tokens` populated.

**Acceptance Scenarios**:

1. **Given** pre-LLM token validation creates a usage record, **When** the record is persisted, **Then** it has `estimated_input_tokens` set and `prompt_tokens`/`completion_tokens` as NULL
2. **Given** the LLM returns token counts, **When** the record is updated, **Then** it has `prompt_tokens`, `completion_tokens` populated alongside the original `estimated_input_tokens`
3. **Given** a user queries their current usage within the rolling window, **When** the usage is calculated, **Then** `token_count` reflects the actual total for completed invocations and the estimate for in-flight invocations

---

### Edge Cases

**Handled in MVP**:
- **LLM response with no token metadata**: Any provider that omits usage metadata in its response (or returns an error without usage data) triggers a warning log. The system skips updating the record and the estimate remains as the budget value.
- **LLM response with zero output tokens**: If the provider reports 0 output tokens (e.g., empty response), the record is still updated with `prompt_tokens` and `completion_tokens=0` since the actual input consumption is valuable.
- **Database unavailability during post-LLM update**: The post-LLM token update must not block or fail the LLM response delivery to the user. If the update fails, the error is logged and the response is still returned. The estimate remains as the budget value.
- **Streaming responses**: When the LLM streams tokens, the usage metadata is available only after the full response is aggregated (final chunk or post-stream summary). The system captures token counts from the aggregated response object after streaming completes, so streaming does not require special handling.
- **Concurrent updates to the same record**: Each invocation is processed by a single `InvocationExecutor` instance, so concurrent UPDATEs to the same `TokenUsageRecord` cannot occur under normal operation. If orchestration-level retries create duplicate processing, the last UPDATE wins (idempotent — same actual token values).

**Deferred to Future Releases**: See Out of Scope section below.

---

## Out of Scope

- Cost calculation using provider-specific pricing per token type
- Workflow and activity execution correlation (IDs not propagated through orchestration layer)
- Reporting APIs, dashboards, or user-facing query endpoints for token usage data
- Size validation or truncation of provider-reported `usage_details` content
- Fixing the hard-coded `gpt-4` tiktoken model in `UserTokenConfig` (pre-existing issue, separate fix)

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST update the existing `TokenUsageRecord` with actual token counts (`prompt_tokens`, `completion_tokens`) reported by the LLM provider after each successful invocation
- **FR-002**: System MUST add `estimated_input_tokens`, `prompt_tokens`, and `completion_tokens` fields to `TokenUsageRecord`
- **FR-003**: System MUST set `estimated_input_tokens` when creating the record during pre-LLM validation (existing `validate_and_record()` flow)
- **FR-004**: System MUST update `token_count` from the tiktoken estimate to the actual total (`prompt_tokens + completion_tokens`) after the LLM call completes
- **FR-005**: System MUST correlate each token usage record with the invocation that triggered it by setting `invocation_id` at record creation time during pre-LLM validation
- **FR-006**: The rolling window budget calculation MUST use `SUM(token_count)` — which reflects estimates for in-flight invocations and actual totals for completed invocations
- **FR-007**: System MUST NOT block or fail the LLM response delivery if the post-LLM token update fails; failures MUST be logged at WARNING level and the response returned to the user
- **FR-008**: System MUST skip the post-LLM update when the LLM response contains no token usage metadata
- **FR-009**: All schema changes to `TokenUsageRecord` MUST be managed through an Alembic migration
- **FR-010**: Existing `TokenUsageRecord` entries (created before this feature) MUST remain valid after migration, with new fields defaulting to null and `token_count` unchanged
- **FR-011**: System MUST store the full provider-reported token usage breakdown in a `usage_details` JSONB field on `TokenUsageRecord`, preserving the provider's response structure as-is
- **FR-012**: System MUST emit structured log entries for both successful post-LLM updates and failures, including `user_id`, `invocation_id`, and token counts, to enable operational monitoring of update reliability

### Key Entities

- **TokenUsageRecord (extended)**: The existing token usage record, extended with:
  - `estimated_input_tokens`: The tiktoken estimate recorded before the LLM call (preserved for audit/comparison)
  - `prompt_tokens`: Actual input tokens reported by the provider after the LLM call
  - `completion_tokens`: Actual output tokens reported by the provider after the LLM call
  - `invocation_id`: Reference to the invocation that triggered this token usage
  - `usage_details`: Optional JSONB storing the full provider-reported token usage breakdown, preserved as-is from the provider's response
  - `token_count` (existing): Budget-relevant value — starts as tiktoken estimate, updated to `prompt_tokens + completion_tokens` after the LLM call

- **Invocation (existing, unchanged)**: The existing invocation entity referenced by the new `invocation_id` field on `TokenUsageRecord`

---

## Dependencies

- **Spec 012 (Token Counting)**: This feature extends the `TokenUsageRecord` and `TokenUsageRepository` created by spec 012. The existing pre-LLM token validation flow (`validate_and_record()`) must be deployed and functional.
- **LangChain AIMessage interface**: Token extraction depends on `AIMessage.usage_metadata` and `AIMessage.response_metadata["token_usage"]` attributes remaining stable across LangChain versions.

---

## Assumptions

- The LLM provider returns token usage metadata in the response (via LangChain's `usage_metadata` or `response_metadata["token_usage"]`). Extraction logic for `AIMessage` objects exists in the codebase (metrics module). No local tokenization (tiktoken) is needed for actual token counts — tiktoken is used exclusively for the pre-LLM input estimation.
- The single-record-per-invocation model is appropriate: one `TokenUsageRecord` is created at pre-LLM time and updated with actuals after the LLM call completes. For multi-call invocations (tool-use loops), actual tokens are aggregated across all calls.
- The `invocation_id` is available in the agent execution context at the point where LLM calls are made. The `user_id` can be retrieved from the invocation's creator field.
- Workflow and activity execution correlation is deferred because those IDs are not currently propagated through the agent orchestration layer to the LLM call point.
- Existing records without actual token fields represent pre-LLM estimates only and should retain their `token_count` values unchanged in the migration.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful invocations result in their `TokenUsageRecord` being updated with actual `prompt_tokens` and `completion_tokens` within the same request lifecycle
- **SC-002**: Every `TokenUsageRecord` created after deployment has `estimated_input_tokens` populated
- **SC-003**: Token usage queries by `invocation_id` return a single record with both estimated and actual token data for completed invocations
- **SC-004**: The rolling window budget correctly reflects actual token consumption for completed invocations and estimates for in-flight invocations
- **SC-005**: Post-LLM token update adds less than 50ms p95 latency overhead to the LLM response delivery path, measured from update initiation to completion (database write within SAVEPOINT isolation)
- **SC-006**: Zero data loss for existing `TokenUsageRecord` entries during migration — all pre-existing records retain their `token_count` values
- **SC-007**: 100% of updated records contain a non-null `usage_details` JSONB with the full provider-reported token breakdown
