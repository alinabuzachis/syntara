# Quickstart Guide: LLM Adapter Retry and Recovery

**Feature**: LLM Adapter Retry and Recovery Mechanisms
**Date**: 2025-11-24

## Overview

This quickstart demonstrates the retry and recovery mechanisms for LLM adapter calls. It covers configuration, expected behavior during transient failures, and validation steps.

## Prerequisites

- Nexus system running locally (via `make dev`)
- OpenRouter API key configured (`NEXUS_OPENROUTER_API_KEY`)
- Access to application logs
- Test tools: curl or Postman for API calls

## Configuration

### Environment Variables

Create or update `.env` file with retry configuration:

```bash
# LLM Adapter Retry Configuration
NEXUS_ADAPTER_MAX_RETRIES=3
NEXUS_ADAPTER_INITIAL_BACKOFF_SECONDS=1.0
NEXUS_ADAPTER_BACKOFF_GROWTH_FACTOR=2.0
NEXUS_ADAPTER_MAX_BACKOFF_SECONDS=10.0
NEXUS_ADAPTER_REQUEST_TIMEOUT_SECONDS=30.0
```

### Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXUS_ADAPTER_MAX_RETRIES` | 3 | Maximum retry attempts (0 disables retries) |
| `NEXUS_ADAPTER_INITIAL_BACKOFF_SECONDS` | 1.0 | Initial delay before first retry |
| `NEXUS_ADAPTER_BACKOFF_GROWTH_FACTOR` | 2.0 | Exponential growth factor (2.0 = doubles each retry) |
| `NEXUS_ADAPTER_MAX_BACKOFF_SECONDS` | 10.0 | Maximum delay cap |
| `NEXUS_ADAPTER_REQUEST_TIMEOUT_SECONDS` | 30.0 | Per-attempt timeout (applies to initial + all retries, prevents unbounded waits) |

**Performance Note**: Worst-case duration with defaults: 4 attempts × 30s per-attempt timeout + 3 backoff periods × 10s max backoff = 150 seconds

**Configuration Note**: All retry settings are loaded at application startup from environment variables. Configuration changes require application restart to take effect (no runtime configuration changes).

### Restart Application

After changing configuration, you MUST stop the running dev server (Ctrl+C) and restart:
```bash
make dev
```

## Test Scenarios

### Scenario 1: Successful Retry After Transient Error

**Objective**: Verify system recovers automatically from transient 503 error

**Steps**:

1. **Ensure dev server is running**: `make dev` (in separate terminal if needed)
2. **Send invocation request**:
   ```bash
   curl -X POST http://localhost:8000/api/v1/invocations \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "What is the weather today?",
       "session_id": "test-session-retry"
     }'
   ```

3. **Monitor logs** for retry attempts:
   ```bash
   docker logs nexus-api 2>&1 | grep -i retry
   ```

**Expected Output**:
```
INFO: Retry attempt 1/3 for invocation_id=<uuid> turn_id=<uuid> after error: HTTPStatusError(503), delay=1.0s
INFO: Retry succeeded on attempt 1/3 for invocation_id=<uuid> turn_id=<uuid>, total_time=1.2s
```

**Success Criteria**:
- [ ] Request eventually succeeds after transient error
- [ ] Retry logged with attempt number, invocation_id, turn_id, and delay
- [ ] Total time includes backoff delay
- [ ] Response contains successful LLM answer

### Scenario 2: Exhausted Retries After Multiple Failures

**Objective**: Verify graceful failure after max retries exceeded

**Steps**:

1. **Simulate persistent 500 errors** (mock or service down)
2. **Send invocation request**:
   ```bash
   curl -X POST http://localhost:8000/api/v1/invocations \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "Test retry exhaustion",
       "session_id": "test-session-exhausted"
     }'
   ```

3. **Monitor logs** for full retry sequence:
   ```bash
   docker logs nexus-api 2>&1 | grep -E "Retry|exhausted"
   ```

**Expected Output**:
```
INFO: Retry attempt 1/3 for invocation_id=<uuid> turn_id=<uuid> after error: HTTPStatusError(500), delay=1.0s
INFO: Retry attempt 2/3 for invocation_id=<uuid> turn_id=<uuid> after error: HTTPStatusError(500), delay=2.0s
INFO: Retry attempt 3/3 for invocation_id=<uuid> turn_id=<uuid> after error: HTTPStatusError(500), delay=4.0s
WARNING: All retries exhausted for invocation_id=<uuid> turn_id=<uuid>, attempts=4, total_time=~12.0s, final_error=HTTP 500 Internal Server Error
```

**Success Criteria**:
- [ ] System retries exactly 3 times (4 total attempts: initial + 3 retries)
- [ ] Backoff delays follow exponential pattern (1s, 2s, 4s)
- [ ] Final error message includes attempt count and total time
- [ ] Response contains user-friendly error message (no stack traces)

### Scenario 3: Non-Retryable Error Fails Immediately

**Objective**: Verify non-retryable errors (4xx) fail without retry

**Simulation Note**: This scenario requires mocking/testing tools to simulate 401/403 errors. For manual validation, you can temporarily set an invalid OpenRouter API key. For automated validation, this is covered by integration test T010.

**Steps**:

1. **Send request with invalid API key** to trigger authentication error:
   ```bash
   # Stop current server (Ctrl+C)
   # Temporarily set invalid key in .env
   NEXUS_OPENROUTER_API_KEY="invalid-key-for-testing"

   # Restart with invalid key
   make dev

   curl -X POST http://localhost:8000/api/v1/invocations \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "Test non-retryable error",
       "session_id": "test-session-nonretryable"
     }'
   ```

2. **Monitor logs**:
   ```bash
   docker logs nexus-api 2>&1 | grep -i "invocation_id"
   ```

**Expected Output**:
```
WARNING: LLM error (invocation_id=<uuid> turn_id=<uuid>): HTTPStatusError(401)
# NO retry attempts logged
```

**Success Criteria**:
- [ ] No retry attempts occur
- [ ] Error logged immediately at WARNING level
- [ ] Response contains user-friendly error (e.g., "configuration issue")
- [ ] Total time minimal (no backoff delays)

### Scenario 4: Retry with Zero Configuration (Disabled)

**Objective**: Verify retry can be disabled via configuration

**Steps**:

1. **Update configuration** to disable retries:
   ```bash
   # Update .env
   NEXUS_ADAPTER_MAX_RETRIES=0

   # Stop dev server (Ctrl+C) and restart
   make dev
   ```

2. **Trigger retryable error** (simulate 503):
   ```bash
   curl -X POST http://localhost:8000/api/v1/invocations \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "Test disabled retry",
       "session_id": "test-session-disabled"
     }'
   ```

3. **Monitor logs**:
   ```bash
   docker logs nexus-api 2>&1 | grep -E "Retry|error"
   ```

**Expected Output**:
```
WARNING: LLM error (invocation_id=<uuid> turn_id=<uuid>): HTTPStatusError(503)
# NO retry attempts logged
```

**Success Criteria**:
- [ ] No retry attempts occur despite retryable error
- [ ] Error returned immediately
- [ ] Configuration change takes effect

### Scenario 5: Concurrent Requests with Independent Retry State

**Objective**: Verify concurrent requests maintain isolated retry state

**Steps**:

1. **Send multiple concurrent requests**:
   ```bash
   # Terminal 1
   curl -X POST http://localhost:8000/api/v1/invocations \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Request A", "session_id": "concurrent-a"}' &

   # Terminal 2
   curl -X POST http://localhost:8000/api/v1/invocations \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Request B", "session_id": "concurrent-b"}' &

   # Terminal 3
   curl -X POST http://localhost:8000/api/v1/invocations \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Request C", "session_id": "concurrent-c"}' &
   ```

2. **Monitor logs** for different invocation_ids:
   ```bash
   docker logs nexus-api 2>&1 | grep -i "invocation_id" | sort
   ```

**Expected Output**:
```
INFO: GenericAgent executing query (invocation_id=<uuid-a> turn_id=<uuid-a1>)
INFO: GenericAgent executing query (invocation_id=<uuid-b> turn_id=<uuid-b1>)
INFO: GenericAgent executing query (invocation_id=<uuid-c> turn_id=<uuid-c1>)
# Each request has independent retry counters and state
```

**Success Criteria**:
- [ ] Each request has unique invocation_id and turn_id
- [ ] Retry attempts tracked independently per request
- [ ] No shared state interference between concurrent requests
- [ ] All requests complete successfully or fail independently

### ~~Scenario 6: Context Creation Retry Behavior~~ (NOT APPLICABLE)

**Investigation Result**: Context creation does NOT use LLM calls.

**Finding**:
- Examined `src/nexus/agent_orchestrator/context_manager/planner.py`
- ContextManagerPlanner is pure orchestration with no LLM invocation:
  - Retrieval phase: document retrieval (no LLM)
  - Compression phase: content compression (no LLM)
  - Assembly phase: package assembly (no LLM)
- **Conclusion**: Retry logic does not apply to context creation

**Note**: This scenario was included in the original spec based on the assumption that context creation uses LLM. Investigation confirmed this is not the case. If future changes add LLM calls to context creation, retry logic can be applied at that time.

## Validation Checklist

After completing all applicable scenarios (1-5), verify:

- [ ] Retry configuration loaded from environment variables
- [ ] Transient errors (500, 502, 503, 504, timeouts) trigger retries
- [ ] Non-retryable errors (4xx) fail immediately
- [ ] Exponential backoff applied correctly (1s, 2s, 4s, ...)
- [ ] Max retries enforced (default: 3 retries = 4 total attempts)
- [ ] Backoff cap enforced (default: 10s maximum)
- [ ] Retry attempts logged with invocation_id, error_type, delay
- [ ] Final outcomes logged (success after retry, or exhaustion)
- [ ] Concurrent requests maintain isolated retry state
- [ ] Zero retries configuration disables retry behavior
- [ ] ~~Context creation follows same retry behavior~~ (N/A - context creation doesn't use LLM)

## Troubleshooting

### Issue: Retries not occurring

**Check**:
1. Verify `NEXUS_ADAPTER_MAX_RETRIES > 0` in `.env`
2. Restart application after config change (stop with Ctrl+C, then `make dev`)
3. Check error is retryable (5xx or timeout, not 4xx)

### Issue: Too many retries

**Check**:
1. Verify `NEXUS_ADAPTER_MAX_RETRIES` value
2. Check if multiple retry layers exist (shouldn't happen)
3. Review logs for retry attempt numbers

### Issue: Delays too long

**Check**:
1. Reduce `NEXUS_ADAPTER_MAX_BACKOFF_SECONDS` (default: 10s)
2. Reduce `NEXUS_ADAPTER_BACKOFF_GROWTH_FACTOR` (default: 2.0)
3. Consider if delays are necessary for recovery

### Issue: Errors not classified correctly

**Check**:
1. Review error classification logic in `retry.py`
2. Verify error types from LangChain/httpx match expected
3. Add logging for error classification decisions

## Cleanup

Reset configuration to defaults:
```bash
# Remove custom retry config from .env or reset to defaults
NEXUS_ADAPTER_MAX_RETRIES=3
NEXUS_ADAPTER_INITIAL_BACKOFF_SECONDS=1.0
NEXUS_ADAPTER_BACKOFF_GROWTH_FACTOR=2.0
NEXUS_ADAPTER_MAX_BACKOFF_SECONDS=10.0
NEXUS_ADAPTER_REQUEST_TIMEOUT_SECONDS=30.0

# Stop dev server (Ctrl+C) and restart
make dev
```

## Next Steps

- Monitor retry metrics in production logs
- Adjust retry configuration based on provider behavior
- Add custom alerts for high retry rates
- Consider adding retry metrics dashboard
