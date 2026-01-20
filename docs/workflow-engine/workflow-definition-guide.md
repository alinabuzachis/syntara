# Workflow Definition Guide

## Overview

This guide provides practical examples for defining workflows with retry policies and error handling. Each example demonstrates real-world use cases and best practices for configuring retryable errors.

## Table of Contents

1. [API Integration with Rate Limiting](#api-integration-with-rate-limiting)
2. [Script Execution with Custom Exit Codes](#script-execution-with-custom-exit-codes)
3. [Multi-Service Workflow with Different Retry Strategies](#multi-service-workflow-with-different-retry-strategies)
4. [Using Default Retry Codes](#using-default-retry-codes)
5. [Advanced Error Handling Patterns](#advanced-error-handling-patterns)

## API Integration with Rate Limiting

**Use Case**: Calling a third-party API that implements rate limiting and may experience occasional server errors.

**Goals**:
- Automatically retry on rate limiting (429)
- Retry on transient server errors (5xx)
- Fail fast on auth errors (401, 403)
- Fail fast on not found (404) or validation errors (400, 422)

### Example Workflow

```yaml
schemaVersion: "1.0.0"
version: 1
metadata:
  name: api-integration-with-rate-limiting
  description: Fetch user data from third-party API with rate limiting
  tags:
    - api
    - rate-limiting
    - production

triggers:
  - type: manual

inputs:
  userId:
    type: string
    description: User ID to fetch
    required: true
  apiToken:
    type: string
    description: API authentication token
    required: true

workflow:
  activities:
    - id: fetch_user_data
      type: task
      retryPolicy:
        maxAttempts: 5
        backoff: exponential
        initialInterval: 5     # Start with 5 second delay
        maxInterval: 300         # Cap at 5 minutes
        multiplier: 2.0
        retryableErrors:
          - 429  # Too Many Requests - rate limiting
          - 500  # Internal Server Error
          - 502  # Bad Gateway
          - 503  # Service Unavailable
          - 504  # Gateway Timeout
      task:
        executor: api
        config:
          method: GET
          url: https://api.example.com/users/${input.userId}
          headers:
            Authorization: Bearer ${input.apiToken}
            Content-Type: application/json
          timeout: 30
        outputs:
          userData: $.body

    - id: process_user_data
      type: task
      task:
        executor: script
        config:
          language: python
          code: |
            import json
            import os

            user_data = json.loads(os.getenv('INPUT_USER_DATA', '{}'))

            # Process user data
            processed = {
                "id": user_data.get("id"),
                "name": user_data.get("name"),
                "email": user_data.get("email"),
                "processed_at": "2026-01-15T00:00:00Z"
            }

            print(json.dumps(processed))
        inputs:
          user_data: ${fetch_user_data.output.userData}
        outputs:
          processed: $.processed
```

**Retry Behavior**:
- **429 error**: Retries with 5s → 10s → 20s → 40s → 80s (capped at 5m)
- **5xx errors**: Same retry pattern
- **401 error**: Fails immediately (auth issue)
- **404 error**: Fails immediately (user not found)
- **400 error**: Fails immediately (bad request)

**Key Points**:
- Exponential backoff prevents overwhelming the API during rate limits
- maxInterval cap prevents excessive delays
- Only transient errors trigger retries
- Auth and validation errors fail fast

## Script Execution with Custom Exit Codes

**Use Case**: Running a bash script that checks external service availability and returns custom exit codes.

**Goals**:
- Retry on specific exit codes that indicate transient failures
- Fail fast on permanent errors
- Support custom exit codes for domain-specific logic

### Example Workflow

```yaml
schemaVersion: "1.0.0"
version: 1
metadata:
  name: script-execution-custom-exit-codes
  description: Health check script with custom retry logic
  tags:
    - script
    - health-check
    - monitoring

triggers:
  - type: schedule
    cron: "*/5 * * * *"  # Every 5 minutes

inputs:
  serviceUrl:
    type: string
    description: URL of service to check
    default: "https://service.example.com/health"

workflow:
  activities:
    - id: check_service_health
      type: task
      retryPolicy:
        maxAttempts: 3
        backoff: fixed
        initialInterval: 10  # Fixed 10 second delay between retries
        retryableErrors:
          - 2  # Custom: Service temporarily unavailable
          - 3  # Custom: Upstream dependency down
      task:
        executor: script
        config:
          language: bash
          code: |
            #!/bin/bash

            # Exit codes:
            # 0 - Service healthy (success)
            # 1 - Service check failed permanently (e.g., invalid URL)
            # 2 - Service temporarily unavailable (retryable)
            # 3 - Upstream dependency down (retryable)

            SERVICE_URL="$1"

            echo "Checking service health: $SERVICE_URL"

            # Make HTTP request
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL" --max-time 10)

            # Evaluate response
            if [ "$HTTP_CODE" -eq 200 ]; then
              echo "✓ Service is healthy (HTTP 200)"
              exit 0  # Success
            elif [ "$HTTP_CODE" -eq 503 ]; then
              echo "⚠ Service temporarily unavailable (HTTP 503)"
              exit 2  # Retryable - service is down temporarily
            elif [ "$HTTP_CODE" -eq 502 ] || [ "$HTTP_CODE" -eq 504 ]; then
              echo "⚠ Upstream dependency issue (HTTP $HTTP_CODE)"
              exit 3  # Retryable - upstream problem
            elif [ "$HTTP_CODE" -eq 000 ]; then
              echo "✗ Connection failed - check URL or network"
              exit 1  # Non-retryable - permanent configuration issue
            else
              echo "✗ Service returned HTTP $HTTP_CODE"
              exit 1  # Non-retryable - unexpected error
            fi
        inputs:
          service_url: ${input.serviceUrl}
        outputs:
          status: $.stdout

    - id: alert_on_failure
      type: task
      task:
        executor: api
        config:
          method: POST
          url: https://alerts.example.com/notify
          body:
            message: "Service health check failed"
            service: ${input.serviceUrl}
            timestamp: ${workflow.startTime}
```

**Retry Behavior**:
- **Exit code 2**: Retries with 10s → 10s → 10s intervals
- **Exit code 3**: Same retry pattern
- **Exit code 0**: Success (no retry)
- **Exit code 1**: Fails immediately (permanent error)

**Key Points**:
- Custom exit codes clearly document script behavior
- Fixed backoff is appropriate for known transient issues
- Only specific transient exit codes trigger retries
- Permanent errors (invalid config) fail fast

## Multi-Service Workflow with Different Retry Strategies

**Use Case**: Workflow that orchestrates multiple services, each with different reliability characteristics and retry requirements.

**Goals**:
- Critical services: aggressive retry with exponential backoff
- Optional services: limited retries
- Notification services: no retries (fail-fast)

### Example Workflow

```yaml
schemaVersion: "1.0.0"
version: 1
metadata:
  name: multi-service-workflow
  description: Process payment with multiple service dependencies
  tags:
    - payment
    - multi-service
    - production

triggers:
  - type: manual

inputs:
  orderId:
    type: string
    required: true
  amount:
    type: number
    required: true
  customerId:
    type: string
    required: true

workflow:
  activities:
    # Critical: Payment processing - retry aggressively
    - id: process_payment
      type: task
      retryPolicy:
        maxAttempts: 10
        backoff: exponential
        initialInterval: 1
        maxInterval: 600
        multiplier: 2.0
        retryableErrors:
          - 408  # Request Timeout
          - 429  # Too Many Requests
          - 500  # Internal Server Error
          - 502  # Bad Gateway
          - 503  # Service Unavailable
          - 504  # Gateway Timeout
      task:
        executor: api
        config:
          method: POST
          url: https://payments.example.com/charge
          headers:
            Authorization: Bearer ${secrets.paymentApiKey}
          body:
            orderId: ${input.orderId}
            amount: ${input.amount}
            customerId: ${input.customerId}
            idempotencyKey: ${execution.id}  # Ensure idempotency
          timeout: 30
        outputs:
          transactionId: $.body.transactionId
          status: $.body.status

    # Optional: Fraud detection - limited retries
    - id: fraud_check
      type: task
      retryPolicy:
        maxAttempts: 2
        backoff: fixed
        initialInterval: 5
        retryableErrors:
          - 503  # Only retry on service unavailable
      task:
        executor: api
        config:
          method: POST
          url: https://fraud.example.com/check
          body:
            orderId: ${input.orderId}
            customerId: ${input.customerId}
            amount: ${input.amount}
          timeout: 10
        outputs:
          riskScore: $.body.riskScore

    # Best-effort: Customer enrichment - no retries
    - id: enrich_customer_data
      type: task
      retryPolicy:
        maxAttempts: 1
        retryableErrors: []  # Never retry - best effort only
      task:
        executor: api
        config:
          method: GET
          url: https://enrichment.example.com/customer/${input.customerId}
          timeout: 5
        outputs:
          enrichedData: $.body

    # Parallel notification activities
    - id: send_notifications
      type: parallel
      branches:
        # Email notification - no retries (idempotency concern)
        - id: send_email
          type: task
          retryPolicy:
            maxAttempts: 1
            retryableErrors: []  # Never retry to avoid duplicate emails
          task:
            executor: api
            config:
              method: POST
              url: https://email.example.com/send
              body:
                to: ${input.customerId}
                template: payment_confirmation
                data:
                  orderId: ${input.orderId}
                  transactionId: ${process_payment.output.transactionId}

        # SMS notification - no retries (idempotency concern)
        - id: send_sms
          type: task
          retryPolicy:
            maxAttempts: 1
            retryableErrors: []  # Never retry to avoid duplicate SMS
          task:
            executor: api
            config:
              method: POST
              url: https://sms.example.com/send
              body:
                to: ${input.customerId}
                message: "Payment confirmed for order ${input.orderId}"
```

**Retry Behavior by Service**:

| Service | Max Attempts | Strategy | Retryable Errors | Rationale |
|---------|-------------|----------|------------------|-----------|
| **process_payment** | 10 | Exponential | All transient (408, 429, 5xx) | Critical - must succeed |
| **fraud_check** | 2 | Fixed | 503 only | Optional - limited time budget |
| **enrich_customer_data** | 1 | None | None | Best-effort - can fail |
| **send_email** | 1 | None | None | Idempotency concern |
| **send_sms** | 1 | None | None | Idempotency concern |

**Key Points**:
- Different services have different criticality and retry needs
- Payment service: idempotency key allows safe retries
- Notification services: no retries to avoid duplicates
- Fraud check: limited retries to not delay payment
- Enrichment: fail-fast if unavailable (non-critical)

## Using Default Retry Codes

**Use Case**: Standard API integration with no special requirements.

**Goals**:
- Use sensible defaults for retry behavior
- Minimize configuration
- Follow industry best practices (Kubernetes patterns)

### Example Workflow

```yaml
schemaVersion: "1.0.0"
version: 1
metadata:
  name: simple-api-integration
  description: Fetch data from standard REST API
  tags:
    - api
    - simple

triggers:
  - type: manual

inputs:
  resourceId:
    type: string
    required: true

workflow:
  activities:
    - id: fetch_resource
      type: task
      retryPolicy:
        maxAttempts: 3
        backoff: exponential
        initialInterval: 1
        maxInterval: 60
        # retryableErrors not specified - uses defaults: [408, 429, 500, 502, 503, 504]
      task:
        executor: api
        config:
          method: GET
          url: https://api.example.com/resources/${input.resourceId}
        outputs:
          resource: $.body

    - id: update_resource
      type: task
      retryPolicy:
        maxAttempts: 3
        backoff: exponential
        # retryableErrors not specified - uses defaults
      task:
        executor: api
        config:
          method: PUT
          url: https://api.example.com/resources/${input.resourceId}
          body:
            status: processed
            processedAt: ${workflow.now}
        outputs:
          updated: $.body
```

**Retry Behavior** (using defaults):
- **408 (Request Timeout)**: Retries
- **429 (Too Many Requests)**: Retries
- **500 (Internal Server Error)**: Retries
- **502 (Bad Gateway)**: Retries
- **503 (Service Unavailable)**: Retries
- **504 (Gateway Timeout)**: Retries
- **4xx (except 408, 429)**: Fails immediately
- **Network errors without codes**: Fails immediately

**Key Points**:
- Defaults cover most common transient errors
- No need to specify retryableErrors for standard APIs
- Follows Kubernetes retry patterns
- Suitable for 80% of use cases

## Advanced Error Handling Patterns

### Pattern 1: Conditional Retry Based on Error Type

**Use Case**: Different retry strategies based on error code ranges.

```yaml
workflow:
  activities:
    # Aggressive retry for server errors (5xx)
    - id: critical_operation
      type: task
      retryPolicy:
        maxAttempts: 5
        backoff: exponential
        retryableErrors:
          - 500
          - 501
          - 502
          - 503
          - 504
          - 505
      task:
        executor: api
        config:
          method: POST
          url: https://api.example.com/critical

    # Conservative retry for rate limiting only
    - id: rate_limited_operation
      type: task
      retryPolicy:
        maxAttempts: 10
        backoff: exponential
        initialInterval: 30  # Start with longer delay
        maxInterval: 1800
        retryableErrors:
          - 429  # Only retry on rate limiting
      task:
        executor: api
        config:
          method: GET
          url: https://api.example.com/rate-limited
```

### Pattern 2: Sequential Retry with Fallback

**Use Case**: Try primary service, fall back to secondary on failure.

```yaml
workflow:
  activities:
    - id: try_primary_service
      type: task
      retryPolicy:
        maxAttempts: 2
        backoff: fixed
        initialInterval: 5
        retryableErrors:
          - 503  # Only retry if temporarily unavailable
      task:
        executor: api
        config:
          method: GET
          url: https://primary.example.com/data

    - id: fallback_to_secondary
      type: task
      condition:
        expression: ${try_primary_service.status} == "failed"
      retryPolicy:
        maxAttempts: 3
        retryableErrors:
          - 500
          - 503
      task:
        executor: api
        config:
          method: GET
          url: https://secondary.example.com/data
```

### Pattern 3: Loop with Custom Exit Code Retry

**Use Case**: Process multiple items with retry on specific failures.

```yaml
workflow:
  activities:
    - id: process_items
      type: loop
      loop:
        type: forEach
        items: ${input.items}
        itemVariable: item
        indexVariable: idx
        do:
          - id: process_item
            type: task
            retryPolicy:
              maxAttempts: 3
              retryableErrors:
                - 2  # Custom: item locked (retry)
                - 3  # Custom: rate limit (retry)
            task:
              executor: script
              config:
                language: bash
                code: |
                  #!/bin/bash
                  ITEM="$1"

                  # Try to process item
                  if ! process_item "$ITEM"; then
                    ERROR_CODE=$?

                    if [ $ERROR_CODE -eq 2 ]; then
                      echo "Item locked, will retry"
                      exit 2
                    elif [ $ERROR_CODE -eq 3 ]; then
                      echo "Rate limit reached, will retry"
                      exit 3
                    else
                      echo "Permanent failure"
                      exit 1
                    fi
                  fi

                  echo "Item processed successfully"
                  exit 0
              inputs:
                item: ${item}
```

### Pattern 4: Parallel Execution with Different Retry Policies

**Use Case**: Execute multiple API calls in parallel, each with appropriate retry strategy.

```yaml
workflow:
  activities:
    - id: parallel_api_calls
      type: parallel
      branches:
        # Fast, unreliable API - aggressive retry
        - id: fast_api
          type: task
          retryPolicy:
            maxAttempts: 10
            backoff: exponential
            initialInterval: 1
            retryableErrors: [429, 500, 502, 503, 504]
          task:
            executor: api
            config:
              method: GET
              url: https://fast-but-unreliable.example.com/data

        # Slow, reliable API - conservative retry
        - id: slow_api
          type: task
          retryPolicy:
            maxAttempts: 2
            backoff: fixed
            initialInterval: 30
            retryableErrors: [503]  # Only retry if truly unavailable
          task:
            executor: api
            config:
              method: GET
              url: https://slow-but-reliable.example.com/data
              timeout: 60

        # Best-effort API - no retry
        - id: optional_api
          type: task
          retryPolicy:
            maxAttempts: 1
            retryableErrors: []
          task:
            executor: api
            config:
              method: GET
              url: https://optional.example.com/enrich
```

## Best Practices Summary

### 1. Choose Appropriate Retry Counts

- **Critical operations**: 5-10 attempts
- **Standard operations**: 3-5 attempts
- **Optional operations**: 1-2 attempts
- **Non-idempotent operations**: 1 attempt (no retry)

### 2. Select Backoff Strategy

- **Exponential**: Default choice for most APIs (prevents overwhelming services)
- **Fixed**: Known recovery time or testing
- **Linear**: Gradual backoff without exponential growth

### 3. Configure maxInterval

Always set maxInterval to prevent unbounded delays:
- **Standard APIs**: 60 - 300 (1-5 minutes)
- **Rate-limited APIs**: 300 - 1800 (5-30 minutes)
- **Critical operations**: 600 - 3600 (10 minutes - 1 hour)

### 4. Customize retryableErrors When Needed

**Use defaults** (`[408, 429, 500, 502, 503, 504]`) unless:
- You need to retry only specific codes (e.g., only 429 for rate limiting)
- You're using custom exit codes in scripts
- You need strict fail-fast behavior (empty list)
- You know which errors are transient for your specific service

### 5. Document Custom Exit Codes

If using custom exit codes, document them in the workflow:

```yaml
task:
  config:
    code: |
      # Exit codes:
      # 0 - Success
      # 1 - Permanent failure
      # 2 - Temporary resource lock (retryable)
      # 3 - Rate limit (retryable)
```

### 6. Consider Idempotency

For non-idempotent operations:
- Add idempotency keys to API requests
- Or disable retries entirely (`maxAttempts: 1`, `retryableErrors: []`)

### 7. Test Retry Behavior

Always test:
- Transient errors trigger retries
- Permanent errors fail fast
- Retry intervals match configuration
- maxAttempts is respected

## Related Documentation

- [Retry Policies](retry-policies.md) - Detailed retry policy documentation
- [Migration Guide](../migrations/retryable-errors-string-to-int.md) - Migrating from string to integer error codes
- [Error Handling Best Practices](error-handling.md) - General error handling guidance

## Summary

This guide provided practical examples for:
1. **API Integration with Rate Limiting** - Retry on transient errors and rate limits
2. **Script Execution with Custom Exit Codes** - Domain-specific retry logic
3. **Multi-Service Workflows** - Different retry strategies per service
4. **Using Default Retry Codes** - Sensible defaults for standard APIs
5. **Advanced Patterns** - Conditional retry, fallback, loops, parallel execution

**Key Takeaways**:
- Use defaults for standard APIs
- Customize retry policies based on service characteristics
- Always cap exponential backoff with maxInterval
- Consider idempotency when configuring retries
- Document custom exit codes
- Test retry behavior in integration tests
