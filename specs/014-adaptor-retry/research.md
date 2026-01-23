# Phase 0: Research & Technology Decisions

**Feature**: LLM Adapter Retry and Recovery Mechanisms
**Date**: 2025-11-24

## Research Questions & Findings

### 1. Retry Mechanism Implementation Patterns

**Decision**: Decorator pattern with async support

**Rationale**:
- LangChain's ChatOpenAI client already uses httpx for HTTP communication
- Existing GenericAgent.execute is async (uses await self.llm.ainvoke())
- Decorator pattern allows adding retry logic without modifying GenericAgent class
- Follows SOLID principles (Open/Closed, Separation of Concerns)
- Python has established patterns for retry decorators (tenacity, backoff libraries)

**Alternatives Considered**:
1. **Built-in LangChain retry** - LangChain does have retry capabilities, but they're tightly coupled to the client configuration and less flexible for our specific requirements (custom error classification, logging format, context creation special handling)
2. **Using tenacity library** - Popular retry library with great async support, but adds external dependency. Since our requirements are simple (exponential backoff, error classification), custom implementation is justified and maintains control
3. **Manual retry loops in GenericAgent** - Would violate DRY principle and make testing harder. Rejected in favor of decorator pattern.

### 2. Error Classification Strategy

**Decision**: HTTP status code-based classification with timeout handling, supporting OpenAI SDK exception hierarchy

**Rationale**:
- GenericAgent uses `langchain-openai`, which has transitive dependency on `openai` package (v2.7.1)
- OpenAI SDK wraps httpx exceptions in its own exception types (APIConnectionError, APITimeoutError, etc.)
- Exception flow: httpx error → OpenAI SDK wraps → LangChain passes through → GenericAgent catches
- HTTP 5xx errors (500, 502, 503, 504) are standard transient failures
- HTTP 429 (Rate Limited) is transient and retryable
- Timeouts are clearly transient (network issues, temporary overload)
- HTTP 4xx errors are permanent (bad request, auth failure, not found)
- Error classifier must handle both OpenAI SDK exceptions (primary) and raw httpx (defensive fallback)

**Error Type Mapping**:
```python
Retryable (OpenAI SDK - primary):
- openai.APIConnectionError (wraps httpx.ConnectError)
- openai.APITimeoutError (wraps httpx.TimeoutException)
- openai.RateLimitError (HTTP 429 rate limiting)
- openai.APIStatusError with status 500, 502, 503, 504

Retryable (httpx - defensive fallback):
- httpx.HTTPStatusError with status 500, 502, 503, 504, 429
- httpx.TimeoutException
- httpx.ConnectTimeout
- httpx.ReadTimeout
- httpx.ConnectError

Retryable (asyncio):
- asyncio.TimeoutError (if wrapped with asyncio.wait_for)

Non-retryable (OpenAI SDK):
- openai.AuthenticationError (HTTP 401)
- openai.BadRequestError (HTTP 400)
- openai.APIStatusError with status 4xx (client errors)

Non-retryable (httpx):
- httpx.HTTPStatusError with status 4xx
- ValueError (invalid configuration)
- Any other exception (unknown failure)
```

**Dependency Chain**:
```
nexus → langchain-openai (direct) → openai==2.7.1 (transitive) → httpx (transitive)
```

**Alternatives Considered**:
1. **Retry all exceptions** - Too aggressive, would retry auth failures and invalid requests. Rejected.
2. **Only retry 503** - Too conservative, misses other transient failures like 500, 502, 504, 429. Rejected.
3. **Only check httpx exceptions** - Incorrect, GenericAgent receives OpenAI SDK exceptions. Rejected.

### 3. Configuration Management Pattern

**Decision**: Pydantic Settings with environment variables (following existing pattern in src/nexus/core/config/base.py)

**Rationale**:
- Existing codebase uses Pydantic Settings (OpenRouterSettings, FileUploadSettings)
- Environment variable pattern established with NEXUS_ prefix
- Configuration is read-only at startup (@lru_cache on get_settings())
- No API endpoints or database tables for configuration (spec explicitly documents this)
- Dependency injection via get_settings() follows existing patterns

**Configuration Parameters** (field names include 'adapter_' prefix):
```python
# Field names in AdapterRetrySettings:
adapter_max_retries: int = 3  # 0 disables retries
adapter_initial_backoff_seconds: float = 1.0
adapter_backoff_growth_factor: float = 2.0
adapter_max_backoff_seconds: float = 10.0
adapter_request_timeout_seconds: float = 30.0  # Per-attempt timeout to prevent hangs

# Environment variables (automatically mapped by Pydantic):
NEXUS_ADAPTER_MAX_RETRIES
NEXUS_ADAPTER_INITIAL_BACKOFF_SECONDS
NEXUS_ADAPTER_BACKOFF_GROWTH_FACTOR
NEXUS_ADAPTER_MAX_BACKOFF_SECONDS
NEXUS_ADAPTER_REQUEST_TIMEOUT_SECONDS
```

**Performance Bounds**:
- Worst-case duration: 4 attempts × 30s per-attempt timeout + 3 backoff periods × 10s max backoff = 150 seconds
- Per-attempt timeout prevents individual requests from hanging indefinitely
- Typical OpenRouter response time: 2-10 seconds (30s allows for slow responses)

**Alternatives Considered**:
1. **API endpoints for configuration** - Not found in codebase, against established patterns. Rejected.
2. **Database-stored configuration** - Adds complexity, not needed for application-scoped settings. Rejected.
3. **Per-request configuration** - Too complex, would require changes to all caller sites. Rejected.

### 4. Exponential Backoff Implementation

**Decision**: Standard exponential backoff with jitter and cap

**Rationale**:
- Formula: `delay = min(initial * (growth_factor ** attempt), max_cap)`
- With defaults: 1s, 2s, 4s, 8s... (capped at 10s)
- Adding small random jitter (±10%) prevents thundering herd
- asyncio.sleep() for non-blocking delays
- Cap prevents excessive delays during prolonged outages

**Implementation**:
```python
import random
import asyncio

async def calculate_backoff(attempt: int, settings: RetrySettings) -> float:
    """Calculate exponential backoff with jitter."""
    base_delay = settings.initial_backoff_seconds * (settings.backoff_growth_factor ** attempt)
    capped_delay = min(base_delay, settings.max_backoff_seconds)
    jitter = capped_delay * random.uniform(-0.1, 0.1)
    return capped_delay + jitter

# Usage in retry loop
delay = await calculate_backoff(attempt_number, settings)
await asyncio.sleep(delay)
```

**Alternatives Considered**:
1. **Fixed delay** - Not resilient to varying load conditions. Rejected.
2. **Linear backoff** - Less effective at spreading load during recovery. Rejected.
3. **No jitter** - Can cause thundering herd when multiple requests retry simultaneously. Rejected.

### 5. Logging and Observability

**Decision**: Formatted logging with Python logging module at INFO/WARNING levels

**Rationale**:
- Existing codebase uses Python's logging module (logger = logging.getLogger(__name__))
- Log each retry attempt with: attempt number, error type, delay, invocation_id (mandatory), turn_id (will be mandatory, not yet implemented)
- Final outcome: success after retries, or failure with attempt count
- Use existing logger in GenericAgent (already configured)
- Metrics tracked: total_attempts, success/failure, total_time_spent
- Using formatted string logging (not JSON-based structured logging)

**Log Format** (invocation_id is mandatory, turn_id will be mandatory once added to function signature):
```
# Expected format (once turn_id is added to function signature - both IDs mandatory):
INFO: Retry attempt 1/3 for invocation_id=<uuid> turn_id=<uuid> after error: <error_type>, delay=1.0s
INFO: Retry attempt 2/3 for invocation_id=<uuid> turn_id=<uuid> after error: <error_type>, delay=2.0s
WARNING: All retries exhausted for invocation_id=<uuid> turn_id=<uuid>, attempts=3, total_time=7.5s, final_error=<error>
INFO: Retry succeeded on attempt 2/3 for invocation_id=<uuid> turn_id=<uuid>

# Transition format (current state - turn_id not yet in signature):
INFO: Retry attempt 1/3 for invocation_id=<uuid> after error: <error_type>, delay=1.0s
INFO: Retry attempt 2/3 for invocation_id=<uuid> after error: <error_type>, delay=2.0s
WARNING: All retries exhausted for invocation_id=<uuid>, attempts=3, total_time=7.5s, final_error=<error>
INFO: Retry succeeded on attempt 2/3 for invocation_id=<uuid>
```

**Alternatives Considered**:
1. **Custom metrics library** - Adds complexity, Python logging sufficient for MVP. Can add later.
2. **DEBUG level logging** - Too verbose for production. INFO/WARNING more appropriate.
3. **No logging** - Unacceptable for debugging and monitoring. Rejected.

### 6. Per-Request Timeout Configuration

**Decision**: Enforce configurable timeout per retry attempt using asyncio.wait_for

**Rationale**:
- Without per-request timeouts, individual retry attempts could hang indefinitely
- LangChain/httpx may have default timeouts, but they should be explicitly configured
- Typical OpenRouter response time: 2-10 seconds
- 30 second default allows for slow responses while preventing hangs
- Bounds worst-case duration: 4 attempts × 30s per-attempt timeout + 3 backoff periods × 10s max backoff = 150 seconds

**Implementation**:
```python
import asyncio

async def retry_with_backoff(func):
    settings = get_settings()
    timeout = settings.adapter_request_timeout_seconds

    # Wrap each retry attempt with timeout
    try:
        result = await asyncio.wait_for(func(), timeout=timeout)
        return result
    except asyncio.TimeoutError:
        # Classify as retryable error, apply backoff, retry
        ...
```

**Performance Analysis**:
- Without timeout: Worst case unbounded (could hang indefinitely)
- With timeout (30s default): Worst case 150s (4 attempts × 30s per-attempt timeout + 3 backoff periods × 10s max backoff)
- Acceptable for LLM queries which are naturally slow operations
- Configurable to accommodate different provider characteristics

**Alternatives Considered**:
1. **No explicit timeout** - Relies on httpx defaults (typically 5-60s), less predictable. Rejected.
2. **Fixed 60s timeout** - Too long for most cases, delays error detection. Rejected.
3. **Shared timeout across all retries** - More complex to implement, doesn't bound per-attempt duration. Rejected.

### 7. Context Creation Error Handling

**Decision**: Context creation does NOT use LLM - retry decorator NOT applicable to ContextManagerPlanner

**Investigation Result**:
- Examined `src/nexus/agent_orchestrator/context_manager/planner.py`
- ContextManagerPlanner is pure orchestration with NO LLM calls:
  - Retrieval phase: document retrieval (no LLM)
  - Compression phase: content compression (no LLM)
  - Assembly phase: package assembly (no LLM)
- Current MVP implementation returns stub data (no external service calls)
- **Conclusion**: No retry logic needed for context creation

**Spec Requirements Update**:
- Original spec mentioned context creation retry based on assumption it uses LLM
- Investigation confirms this assumption is incorrect
- Requirements FR-010, FR-011, FR-013, FR-023 refer to context creation but are not applicable
- These requirements should be considered out of scope for this feature

**Future Consideration**:
- If context creation later adds LLM calls (e.g., for semantic compression), retry logic can be added at that time
- Retry decorator pattern established here can be applied to any future async LLM calls

### 8. Testing Strategy

**Decision**: Unit tests with respx for HTTP mocking, integration tests with real scenarios

**Rationale**:
- respx library already in dev dependencies (tests mock HTTP responses)
- Can simulate 500/502/503/504 responses and timeouts
- Test cases:
  - Successful retry after transient error
  - Failure after max retries exhausted
  - Non-retryable error fails immediately
  - Exponential backoff timing validation
  - Concurrent requests maintain independent state
  - Zero retries configuration (immediate failure)
  - Error type changes between attempts
  - Backoff interruption handling

**Test Structure**:
```
tests/unit/agent_orchestrator/test_retry_decorator.py
  - test_successful_retry_after_transient_error
  - test_failure_after_max_retries
  - test_non_retryable_error_fails_immediately
  - test_exponential_backoff_delays
  - test_concurrent_requests_isolated
  - test_zero_retries_disabled
  - test_error_type_changes_between_attempts

tests/integration/agent_orchestrator/test_generic_agent_retry.py
  - test_generic_agent_retry_end_to_end
  - test_context_creation_retry_behavior
```

**Alternatives Considered**:
1. **No mocking, only integration tests** - Too slow, too brittle. Rejected.
2. **Only unit tests, no integration** - Wouldn't catch wiring issues. Rejected.

## Implementation Summary

**Technology Stack**:
- Python 3.12 with async/await
- Decorator pattern for retry logic
- Pydantic Settings for configuration
- Python logging for observability
- respx for HTTP mocking in tests

**Key Components**:
1. `AdapterRetrySettings` class in `src/nexus/core/config/base.py`
2. Retry decorator in `src/nexus/agent_orchestrator/utils/retry.py`
3. Apply decorator to `GenericAgent.execute()` and context creation calls
4. Unit tests and integration tests

**All clarifications resolved** - 15 clarification questions answered in spec.md, all technical decisions resolved based on spec clarifications and codebase patterns.
