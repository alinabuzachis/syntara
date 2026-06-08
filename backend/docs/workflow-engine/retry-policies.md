# Workflow Engine: Retry Policies

## Overview

Retry policies control automatic retry behavior for workflow activities that fail due to transient errors. The Nexus workflow engine uses a **whitelist approach** for retry decisions, where only errors with specific error codes trigger retries.

This document explains:
- How retry policies work
- Default retryable error codes
- Custom error code configuration
- Error code extraction behavior
- Fail-fast vs retry decision logic

## Quick Start

### Basic Retry Policy

```yaml
nodes:
  - id: api_call
    type: http_request
    config:
      method: GET
      url: https://api.example.com/data
    retry_policy:
      max_attempts: 3
      backoff: exponential
      initial_interval: 1
      max_interval: 60
```

**Behavior**: Uses default retryable error codes `[408, 429, 500, 502, 503, 504]`
- Retries on: Request Timeout (408), Rate Limiting (429), Server Errors (5xx)
- Fails immediately on: Auth errors (401, 403), Not Found (404), Bad Request (400)

### Custom Retry Policy

```yaml
nodes:
  - id: api_call
    type: http_request
    config:
      method: POST
      url: https://api.example.com/submit
    retry_policy:
      max_attempts: 5
      backoff: exponential
      initial_interval: 5
      max_interval: 300
      multiplier: 2.0
      retryable_errors:
        - 429  # Only retry on rate limiting
        - 503  # Only retry on service unavailable
```

**Behavior**: Only retries on errors with codes 429 or 503
- Retries on: 429 (Too Many Requests), 503 (Service Unavailable)
- Fails immediately on: All other errors (400, 401, 500, 502, etc.)

## Retry Policy Fields

### Required Fields

None - all fields are optional. If you omit the `retry_policy` entirely, nodes use Temporal's default retry behavior.

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_attempts` | integer | 3 | Maximum number of retry attempts (including initial attempt) |
| `backoff` | string | `"exponential"` | Backoff strategy: `exponential`, `fixed`, or `linear` |
| `initial_interval` | integer | `1` | Initial delay before first retry in seconds |
| `max_interval` | integer | `null` | Maximum delay between retries in seconds (caps exponential growth) |
| `multiplier` | float | `2.0` | Backoff multiplier for exponential strategy |
| `retryable_errors` | array of integers | `[408, 429, 500, 502, 503, 504]` | Error codes that trigger retries (whitelist) |

### Interval Values

Intervals are specified as integers representing seconds:

- `1` - 1 second
- `30` - 30 seconds
- `60` - 1 minute
- `300` - 5 minutes
- `3600` - 1 hour
- `5400` - 1 hour 30 minutes

## Backoff Strategies

### Exponential Backoff (Default)

Each retry interval is multiplied by the `multiplier` value, up to `max_interval`.

```yaml
retry_policy:
  backoff: exponential
  initial_interval: 1      # 1 second
  max_interval: 60         # 60 seconds (1 minute)
  multiplier: 2.0
  max_attempts: 5
```

**Retry intervals**: 1s → 2s → 4s → 8s → 16s

**Use case**: Most common strategy. Prevents overwhelming services during outages.

### Fixed Backoff

Same interval between all retries.

```yaml
retry_policy:
  backoff: fixed
  initial_interval: 10
  max_attempts: 3
```

**Retry intervals**: 10s → 10s → 10s

**Use case**: Predictable retry timing, testing, or when you know recovery time.

### Linear Backoff

Each retry interval increases by `initial_interval`.

```yaml
retry_policy:
  backoff: linear
  initial_interval: 5
  max_interval: 30
  max_attempts: 4
```

**Retry intervals**: 5s → 10s → 15s → 20s

**Use case**: Gradual backoff without exponential growth.

## Whitelist Approach

The workflow engine uses a **whitelist approach** for retry decisions:

- **✅ Retryable**: Error code is **IN** the `retryable_errors` list
- **❌ Non-retryable**: Error code is **NOT IN** the `retryable_errors` list
- **❌ Non-retryable**: No error code extracted from error message

### Decision Flowchart

```
Activity Fails
   ↓
Extract Error Code from Message
   ↓
┌─────────────────────────┐
│ Error Code Extracted?   │
└─────────────────────────┘
   ↓              ↓
  YES            NO
   ↓              ↓
┌────────────────┐   ┌──────────────────┐
│ Code in List?  │   │ Non-Retryable    │
└────────────────┘   │ Fail Immediately │
   ↓         ↓       └──────────────────┘
  YES       NO
   ↓         ↓
┌─────────┐ ┌──────────────────┐
│ Retry   │ │ Non-Retryable    │
│         │ │ Fail Immediately │
└─────────┘ └──────────────────┘
   ↓
Check max_attempts
   ↓
Apply Backoff
   ↓
Retry Activity
```

### Why Whitelist?

**Advantages**:
1. **Explicit Control**: You explicitly list which errors should retry
2. **Fail-Fast**: Permanent errors (auth, validation) fail immediately without wasting retries
3. **Resource Efficiency**: Avoids unnecessary compute on errors that won't succeed
4. **Industry Standard**: Matches Kubernetes retry patterns and HTTP client libraries
5. **Predictable Behavior**: Clear understanding of retry vs fail-fast decisions

**Alternative (Blacklist)**: Would retry ALL errors except those in a list
- **Problem**: Unknown errors would retry by default (risky)
- **Problem**: Must enumerate all non-retryable codes (tedious)
- **Problem**: Wastes resources on errors that won't succeed

## Default Retryable Error Codes

If you **omit** the `retryable_errors` field, the system uses these defaults:

```yaml
# Implicit default
retryable_errors:
  - 408  # Request Timeout
  - 429  # Too Many Requests (rate limiting)
  - 500  # Internal Server Error
  - 502  # Bad Gateway
  - 503  # Service Unavailable
  - 504  # Gateway Timeout
```

### Why These Codes?

| Code | Name | Why Retryable? |
|------|------|----------------|
| **408** | Request Timeout | Client timeout - often transient, may succeed if given more time |
| **429** | Too Many Requests | Rate limiting - retry with backoff allows rate limit window to pass |
| **500** | Internal Server Error | Temporary server issue - often resolves quickly |
| **502** | Bad Gateway | Upstream server error - gateway may recover or reroute |
| **503** | Service Unavailable | Service temporarily down (maintenance, overload) - usually recovers |
| **504** | Gateway Timeout | Upstream timeout - may succeed if given more time |

### Codes NOT in Default List

These codes indicate **permanent failures** that won't succeed on retry:

| Code | Name | Why Non-Retryable? |
|------|------|-------------------|
| **400** | Bad Request | Invalid request format - won't succeed without fixing request |
| **401** | Unauthorized | Authentication required - won't succeed without new credentials |
| **403** | Forbidden | Permission denied - won't succeed without fixing permissions |
| **404** | Not Found | Resource doesn't exist - won't succeed unless resource is created |
| **405** | Method Not Allowed | Wrong HTTP method - won't succeed without changing method |
| **409** | Conflict | Resource conflict (e.g., duplicate) - requires manual resolution |
| **422** | Unprocessable Entity | Validation error - won't succeed without fixing data |

## Custom Error Code Configuration

### When to Customize

**Use defaults when**:
- General API integrations with standard HTTP services
- No special retry requirements
- Want standard Kubernetes-style retry behavior

**Customize when**:
- Need to retry only specific codes (e.g., only 429 for rate limiting)
- Using custom exit codes in scripts
- Need strict fail-fast behavior (empty list)
- Domain-specific error codes
- Know which errors are transient for your specific service

### Example: Rate Limiting Only

```yaml
retry_policy:
  max_attempts: 5
  backoff: exponential
  initial_interval: 5
  max_interval: 300
  retryable_errors:
    - 429  # Only retry on rate limiting
```

**Behavior**:
- 429 errors retry with exponential backoff
- All other errors (500, 503, etc.) fail immediately

**Use case**: Third-party API with strict rate limits but reliable servers.

### Example: Custom Script Exit Codes

```yaml
nodes:
  - id: run_script
    type: script
    config:
      language: bash
      code: |
        #!/bin/bash
        # Check if resource is available
        if ! check_resource; then
          echo "Resource temporarily unavailable"
          exit 2  # Will trigger retry
        fi

        # Process resource
        if ! process_resource; then
          echo "Processing failed"
          exit 1  # Will NOT trigger retry (not in list)
        fi

        exit 0  # Success
    retry_policy:
      max_attempts: 3
      retryable_errors:
        - 2  # Custom: temporary resource unavailable
        - 3  # Custom: retry recommended
        - 4  # Custom: rate limit reached
```

**Behavior**:
- Exit code 2 → Retries (in whitelist)
- Exit code 3 → Retries (in whitelist)
- Exit code 4 → Retries (in whitelist)
- Exit code 1 → Fails immediately (not in whitelist)
- Exit code 0 → Success (no retry needed)

### Example: No Retries (Fail-Fast)

```yaml
retry_policy:
  max_attempts: 1
  retryable_errors: []  # Empty list = no retries
```

**Behavior**: ALL errors fail immediately without retries

**Use case**: Activities where retries are harmful (e.g., one-time operations, irreversible actions).

### Example: Retry All Server Errors

```yaml
retry_policy:
  max_attempts: 3
  retryable_errors:
    - 500
    - 501
    - 502
    - 503
    - 504
    - 505
    - 506
    - 507
    - 508
    - 509
    - 510
    - 511
```

**Behavior**: Retry on any 5xx server error, fail immediately on 4xx client errors

**Use case**: Services where all server errors are transient.

## Error Code Extraction

The workflow engine automatically extracts numeric error codes from error messages.

### Extraction Algorithm

```python
def extract_error_code(message: str) -> int | None:
    """Extract first numeric code from error message."""
    # Regex: \b(\d{3})\b - matches 3-digit numbers
    # HTTP codes: 400-599
    # Exit codes: 0-255 (but 0 is success, not extracted)

    match = re.search(r'\b(\d{3})\b', message)
    if match:
        code = int(match.group(1))
        if 400 <= code <= 599:  # HTTP status code
            return code

    # Check for exit codes (single or double digits)
    match = re.search(r'\b(\d{1,2})\b', message)
    if match:
        code = int(match.group(1))
        if 1 <= code <= 255:  # Valid exit code (excluding 0)
            return code

    return None  # No code found
```

### Extraction Examples

| Error Message | Extracted Code | Reason |
|---------------|----------------|--------|
| `"HTTP 500 Internal Server Error"` | `500` | 3-digit HTTP code |
| `"Error code: 503 - Service Unavailable"` | `503` | 3-digit HTTP code |
| `"Request failed with status 429"` | `429` | 3-digit HTTP code |
| `"Script exited with code 2"` | `2` | Exit code |
| `"Exit code: 127 - Command not found"` | `127` | Exit code |
| `"Connection refused"` | `None` | No numeric code |
| `"Network timeout after 30 seconds"` | `None` | 30 is not a valid error code |

### Multiple Codes in Message

If the error message contains multiple numeric codes:

```
"HTTP 502 received from upstream server (code 500)"
```

**Behavior**: The **first matched code** (502) is extracted and used.

### No Code Extracted

If no numeric code can be extracted:

```
"Connection refused"
"Network timeout"
"Unknown error"
```

**Behavior**: Error is treated as **non-retryable** (fails immediately)

**Rationale**: Without a code, we can't determine if the error is transient. Fail-fast is safer than guessing.

## Retry Examples

### Example 1: API Integration with Rate Limiting

**Scenario**: Third-party API with rate limits and occasional server errors

```yaml
nodes:
  - id: fetch_data
    type: http_request
    config:
      method: GET
      url: https://api.example.com/data
      headers:
        Authorization: ${secrets.api_token}
    retry_policy:
      max_attempts: 5
      backoff: exponential
      initial_interval: 5
      max_interval: 300
      retryable_errors:
        - 429  # Too Many Requests
        - 500  # Internal Server Error
        - 503  # Service Unavailable
```

**Retry behavior**:
- **429 error**: Retries with 5s → 10s → 20s → 40s → 80s (capped at 5m)
- **500 error**: Same retry pattern
- **503 error**: Same retry pattern
- **401 error**: Fails immediately (not in whitelist)
- **404 error**: Fails immediately (not in whitelist)

### Example 2: Script Execution with Custom Exit Codes

**Scenario**: Bash script that checks external service availability

```yaml
nodes:
  - id: check_service
    type: script
    config:
      language: bash
      code: |
        #!/bin/bash
        SERVICE_URL="https://service.example.com/health"

        # Check if service is healthy
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL")

        if [ "$HTTP_CODE" -eq 200 ]; then
          echo "Service is healthy"
          exit 0  # Success
        elif [ "$HTTP_CODE" -eq 503 ]; then
          echo "Service temporarily unavailable (503)"
          exit 2  # Retryable
        else
          echo "Service check failed with HTTP $HTTP_CODE"
          exit 1  # Non-retryable
        fi
    retry_policy:
      max_attempts: 3
      backoff: fixed
      initial_interval: 10
      retryable_errors:
        - 2  # Service temporarily unavailable
```

**Retry behavior**:
- **Exit code 2**: Retries with 10s → 10s → 10s intervals
- **Exit code 0**: Success (no retry)
- **Exit code 1**: Fails immediately (not in whitelist)

### Example 3: Multi-Service Workflow with Different Retry Strategies

**Scenario**: Workflow that calls multiple services with different retry needs

```yaml
nodes:
  # Critical service - retry aggressively
  - id: critical_api
    type: http_request
    config:
      method: POST
      url: https://critical-service.example.com/process
    retry_policy:
      max_attempts: 10
      backoff: exponential
      initial_interval: 1
      max_interval: 600
      retryable_errors:
        - 408
        - 429
        - 500
        - 502
        - 503
        - 504

  # Best-effort service - limited retries
  - id: optional_api
    type: http_request
    config:
      method: GET
      url: https://optional-service.example.com/enrich
    retry_policy:
      max_attempts: 2
      backoff: fixed
      initial_interval: 5
      retryable_errors:
        - 503  # Only retry on service unavailable

  # Idempotent operation - no retries
  - id: send_notification
    type: http_request
    config:
      method: POST
      url: https://notifications.example.com/send
    retry_policy:
      max_attempts: 1
      retryable_errors: []  # Never retry
```

**Retry behavior**:
- **critical_api**: Up to 10 retries with exponential backoff for all transient errors
- **optional_api**: Max 2 retries, only on 503 errors
- **send_notification**: Never retries (fail-fast)

### Example 4: Using Default Retry Codes

**Scenario**: Standard API integration with no special requirements

```yaml
nodes:
  - id: fetch_user
    type: http_request
    config:
      method: GET
      url: https://api.example.com/users/${trigger.userId}
    retry_policy:
      max_attempts: 3
      backoff: exponential
      initial_interval: 1
      # retryable_errors not specified - uses defaults
```

**Retry behavior** (uses defaults `[408, 429, 500, 502, 503, 504]`):
- **408, 429, 5xx errors**: Retries with 1s → 2s → 4s intervals
- **4xx errors (except 408, 429)**: Fails immediately
- **Network errors without codes**: Fails immediately

## Testing Retry Behavior

### Unit Test: Validate Retry Policy Configuration

```python
from nexus.workflows.workflow_engine.models.workflow_definition import RetryPolicy

def test_custom_retry_policy():
    retry_policy = RetryPolicy.model_validate({
        "max_attempts": 5,
        "backoff": "exponential",
        "retryable_errors": [429, 503],
    })

    assert retry_policy.max_attempts == 5
    assert retry_policy.backoff == "exponential"
    assert retry_policy.retryable_errors == [429, 503]
```

## Performance Considerations

### Error Code Extraction Performance

- **Time Complexity**: O(n) where n is the length of the error message
- **Typical Performance**: < 1ms per error message
- **Caching**: Error codes are extracted once per failure, result is cached

### Retry Decision Performance

- **Time Complexity**: O(m) where m is the number of codes in retryable_errors list
- **Typical Performance**: < 1ms per decision (linear search on small lists)
- **Optimization**: Keep retryable_errors lists small (< 20 codes recommended)

### Backoff Strategy Impact

| Strategy | Performance Impact | Use Case |
|----------|-------------------|----------|
| **Exponential** | Low - simple multiplication | Most scenarios |
| **Fixed** | Lowest - no calculation | Simple retries |
| **Linear** | Low - simple addition | Gradual backoff |

## Common Pitfalls

### Pitfall 1: Retrying Non-Idempotent Operations

**Problem**: Retrying operations that aren't idempotent can cause duplicate side effects.

```yaml
# ⚠️ DANGER: Non-idempotent operation with retries
nodes:
  - id: charge_credit_card
    type: http_request
    config:
      method: POST
      url: https://payments.example.com/charge
    retry_policy:
      max_attempts: 3
      retryable_errors: [500, 503]
```

**Solution**: Either make the operation idempotent or disable retries:

```yaml
# ✅ Option 1: Disable retries
retry_policy:
  max_attempts: 1
  retryable_errors: []

# ✅ Option 2: Make operation idempotent
# Add idempotency key to API request
config:
  method: POST
  url: https://payments.example.com/charge
  body:
    idempotencyKey: ${execution.id}
    amount: ${trigger.amount}
```

### Pitfall 2: Retrying on Validation Errors

**Problem**: Validation errors (400, 422) won't succeed on retry but are sometimes added to retryable_errors.

```yaml
# ❌ BAD: Retrying validation errors
retry_policy:
  retryable_errors:
    - 400  # Bad Request - won't succeed on retry
    - 422  # Unprocessable Entity - won't succeed on retry
```

**Solution**: Only retry transient errors:

```yaml
# ✅ GOOD: Only transient errors
retry_policy:
  retryable_errors:
    - 429  # Rate limiting
    - 500  # Server error
    - 503  # Service unavailable
```

### Pitfall 3: Too Many Retry Attempts

**Problem**: Excessive retries can delay workflow completion and waste resources.

```yaml
# ❌ BAD: Too many retries
retry_policy:
  max_attempts: 100  # Will take hours with exponential backoff
```

**Solution**: Use reasonable limits:

```yaml
# ✅ GOOD: Reasonable retry count
retry_policy:
  max_attempts: 5  # Sufficient for transient errors
  max_interval: 300  # Cap maximum delay
```

### Pitfall 4: No max_interval Cap

**Problem**: Exponential backoff without a cap can lead to very long delays.

```yaml
# ❌ BAD: Unbounded exponential backoff
retry_policy:
  backoff: exponential
  initial_interval: 1
  multiplier: 2.0
  max_attempts: 10
  # Missing max_interval - could reach 512s (8.5 minutes) on last retry
```

**Solution**: Always set max_interval:

```yaml
# ✅ GOOD: Capped exponential backoff
retry_policy:
  backoff: exponential
  initial_interval: 1
  max_interval: 60  # Never wait more than 1 minute
  multiplier: 2.0
  max_attempts: 10
```

## Best Practices

### 1. Use Defaults for Standard APIs

Unless you have specific requirements, use default retryable error codes:

```yaml
retry_policy:
  max_attempts: 3
  backoff: exponential
  # Let retryable_errors default to [408, 429, 500, 502, 503, 504]
```

### 2. Customize for Domain-Specific Services

If you know which errors are transient for your specific service:

```yaml
retry_policy:
  max_attempts: 5
  retryable_errors:
    - 429  # This API only has transient rate limiting issues
```

### 3. Document Custom Exit Codes

If using custom exit codes in scripts, document them:

```yaml
nodes:
  - id: custom_script
    type: script
    config:
      language: bash
      code: |
        # Exit codes:
        # 0 - Success
        # 1 - Permanent failure (auth, validation, etc.)
        # 2 - Temporary resource lock (retryable)
        # 3 - Rate limit reached (retryable)
        # 4 - Upstream service unavailable (retryable)
    retry_policy:
      retryable_errors:
        - 2  # Temporary resource lock (custom)
        - 3  # Rate limit reached (custom)
        - 4  # Upstream service unavailable (custom)
```

### 4. Cap Exponential Backoff

Always set max_interval to prevent unbounded delays:

```yaml
retry_policy:
  backoff: exponential
  max_interval: 300  # Never wait more than 5 minutes
```

### 5. Test Retry Behavior

Add integration tests to verify retry behavior:

```python
@pytest.mark.asyncio
async def test_retry_behavior():
    # Test that transient errors retry
    # Test that permanent errors fail fast
    # Test that retry intervals match configuration
    pass
```

### 6. Monitor Retry Metrics

Track retry metrics in production:
- Number of retries per activity
- Success rate after retries
- Average retry duration
- Most common error codes

### 7. Use Fail-Fast for Idempotency Concerns

If an operation isn't idempotent and can't be made idempotent:

```yaml
retry_policy:
  max_attempts: 1
  retryable_errors: []  # Never retry
```

## Related Documentation

- [Migration Guide: String to Integer Error Codes](../migrations/retryable-errors-string-to-int.md)
- [Workflow Definition Guide](workflow-definition-guide.md)
- [V2 Workflow Definition Schema](../../src/nexus/schemas/workflows/v2/workflow_definition.schema.json)
- [Error Handling Best Practices](error-handling.md)
- [Temporal Retry Policies](https://docs.temporal.io/dev-guide/python/features#retry-policies)

## Summary

- **Whitelist Approach**: Only errors with codes in `retryable_errors` list trigger retries
- **Default Codes**: `[408, 429, 500, 502, 503, 504]` cover common transient errors
- **Customization**: Specify exact codes for domain-specific retry logic
- **Error Extraction**: Numeric codes automatically extracted from error messages
- **Fail-Fast**: Errors without codes or not in whitelist fail immediately
- **Backoff Strategies**: Exponential (default), fixed, or linear backoff
- **Best Practices**: Use defaults unless you have specific requirements, always cap exponential backoff, avoid retrying non-idempotent operations
