# Quickstart: Token Count Validation

**Feature**: 012-token-counting
**Purpose**: Validate this implementation matches the specification

## Overview

This quickstart demonstrates the token counting and validation system through practical usage scenarios. It validates that the implementation correctly:
- Calculates token counts using tiktoken
- Tracks usage per user within rolling time windows
- Blocks requests that exceed limits
- Handles concurrent requests safely

## Prerequisites

```bash
# Install dependencies
uv sync

# Run database migrations
alembic upgrade head

# Ensure test database is available
podman-compose up -d postgres
```

## Test Scenario 1: Basic Token Validation (Within Limit)

**Acceptance Criteria**: Scenario 1 from spec
> Given a user's cumulative token count is at 8,000 and their configured limit is 10,000,
> When that user submits a new request with 1,500 tokens,
> Then the system should accept the request and update the user's cumulative count to 9,500

```python
from uuid import UUID, uuid4
from nexus.token_manager.services import TokenValidationService
from nexus.token_manager.models import UserTokenConfig
from nexus.token_manager.repository import TokenUsageRepository
from sqlmodel import Session, create_engine

# Setup
engine = create_engine("postgresql://...")
session = Session(engine)
repository = TokenUsageRepository(engine)
service = TokenValidationService(repository)

# Create user with 10,000 token limit, 24-hour window
user_id = uuid4()
config = UserTokenConfig(
    user_id=user_id,
    token_limit=10000,
    window_duration_seconds=86400  # 24 hours
)
session.add(config)
session.commit()

# Simulate 8,000 tokens already used
await service._record_usage(user_id, 8000, session)

# Test: Submit request with ~1,500 tokens
test_text = "Your test text here... " * 100  # Adjust to get ~1500 tokens

try:
    await service.validate_and_record(user_id, test_text, session)
    print("✅ Request accepted - within limit")

    # Verify current usage is ~9,500
    current_usage = await service.get_current_usage(user_id, session)
    assert 9400 <= current_usage <= 9600, f"Expected ~9500, got {current_usage}"
    print(f"✅ Current usage: {current_usage} tokens")

except Exception as e:
    print(f"❌ Unexpected error: {e}")
```

**Expected Output**:
```
✅ Request accepted - within limit
✅ Current usage: 9500 tokens
```

## Test Scenario 2: Token Limit Exceeded

**Acceptance Criteria**: Scenario 2 from spec
> Given a user's cumulative token count is at 9,500 and their configured limit is 10,000,
> When that user submits a request with 1,000 tokens,
> Then the system should block the request and return a structured error response

```python
from nexus.token_manager.exceptions import TokenLimitExceededError

# Setup (continuing from previous scenario)
# User already has 9,500 tokens used

# Test: Submit request that would exceed limit
large_text = "This is a large request... " * 200  # ~1000 tokens

try:
    await service.validate_and_record(user_id, large_text, session)
    print("❌ Request should have been blocked!")

except TokenLimitExceededError as e:
    print(f"✅ Request blocked: {e}")
    print(f"   Current usage: {e.current_usage}")
    print(f"   Token limit: {e.token_limit}")
    print(f"   Request tokens: {e.request_tokens}")
    print(f"   Would total: {e.current_usage + e.request_tokens}")

    # Verify error details
    assert e.current_usage == 9500
    assert e.token_limit == 10000
    assert e.request_tokens >= 1000
    assert e.current_usage + e.request_tokens > e.token_limit

    # Verify usage wasn't recorded (transaction rolled back)
    final_usage = await service.get_current_usage(user_id, session)
    assert final_usage == 9500, "Usage should not have increased"
    print("✅ Usage correctly unchanged after rejection")
```

**Expected Output**:
```
✅ Request blocked: Token limit exceeded: 10500/10000
   Current usage: 9500
   Token limit: 10000
   Request tokens: 1000
   Would total: 10500
✅ Usage correctly unchanged after rejection
```

## Test Scenario 3: Rolling Window Behavior

**Acceptance Criteria**: Scenario 6 from spec
> Given a user made a request 90,000 seconds ago and their rolling window is 86,400 seconds (24 hours),
> When a new request arrives,
> Then the system should calculate cumulative usage excluding the 90,000-second-old request

```python
from datetime import datetime, timedelta

# Setup: User with 24-hour rolling window
user_id = uuid4()
config = UserTokenConfig(
    user_id=user_id,
    token_limit=10000,
    window_duration_seconds=86400  # 24 hours = 86,400 seconds
)
session.add(config)
session.commit()

# Create old usage record (25 hours ago = 90,000 seconds)
old_timestamp = datetime.utcnow() - timedelta(seconds=90000)
old_record = TokenUsageRecord(
    user_id=user_id,
    token_count=5000,
    request_timestamp=old_timestamp
)
session.add(old_record)

# Create recent usage record (12 hours ago)
recent_timestamp = datetime.utcnow() - timedelta(hours=12)
recent_record = TokenUsageRecord(
    user_id=user_id,
    token_count=3000,
    request_timestamp=recent_timestamp
)
session.add(recent_record)
session.commit()

# Test: Current usage should only include recent record
current_usage = await service.get_current_usage(user_id, session)
assert current_usage == 3000, f"Expected 3000 (old record excluded), got {current_usage}"
print(f"✅ Rolling window correctly excludes old records: {current_usage} tokens")

# Test: New request should be validated against only recent usage
test_text = "Another request... " * 150  # ~1000 tokens

try:
    await service.validate_and_record(user_id, test_text, session)
    new_usage = await service.get_current_usage(user_id, session)
    assert 3900 <= new_usage <= 4100, f"Expected ~4000, got {new_usage}"
    print(f"✅ New request accepted, total now: {new_usage} tokens")
except TokenLimitExceededError:
    print("❌ Request should have been accepted (within limit)")
```

**Expected Output**:
```
✅ Rolling window correctly excludes old records: 3000 tokens
✅ New request accepted, total now: 4000 tokens
```

## Test Scenario 4: Concurrent Request Handling

**Acceptance Criteria**: Scenario 4 from spec
> Given multiple requests arrive simultaneously from the same user,
> When processing token counts,
> Then the system should accurately track that user's cumulative totals without double-counting or missing requests

```python
import asyncio

# Setup: User with 10,000 token limit
user_id = uuid4()
config = UserTokenConfig(
    user_id=user_id,
    token_limit=10000,
    window_duration_seconds=3600  # 1 hour
)
session.add(config)
session.commit()

# Test: Submit 10 concurrent requests of 500 tokens each
async def submit_request(request_num: int):
    """Submit a single request."""
    text = "Concurrent request text... " * 50  # ~500 tokens
    try:
        await service.validate_and_record(user_id, text)
        print(f"✅ Request {request_num} accepted")
        return True
    except TokenLimitExceededError as e:
        print(f"⚠️  Request {request_num} blocked at {e.current_usage} tokens")
        return False

# Run 10 requests concurrently
results = await asyncio.gather(*[
    submit_request(i) for i in range(10)
])

# Verify results
final_usage = await service.get_current_usage(user_id, session)
accepted_count = sum(results)

print(f"\nResults:")
print(f"  Accepted: {accepted_count} requests")
print(f"  Blocked: {10 - accepted_count} requests")
print(f"  Final usage: {final_usage} tokens")

# Should accept ~9 requests (4,500 tokens), block 1-2
assert final_usage <= 10000, "Usage should not exceed limit"
assert final_usage >= 4000, "Should have accepted multiple requests"
assert accepted_count >= 8, "Most requests should succeed"
print("✅ Concurrent requests handled correctly without race conditions")
```

**Expected Output**:
```
✅ Request 0 accepted
✅ Request 1 accepted
✅ Request 2 accepted
...
⚠️  Request 9 blocked at 9500 tokens

Results:
  Accepted: 9 requests
  Blocked: 1 requests
  Final usage: 9500 tokens
✅ Concurrent requests handled correctly without race conditions
```

## Test Scenario 5: Per-User Independence

**Acceptance Criteria**: Scenario 5 from spec
> Given multiple users are making requests,
> When tracking token counts,
> Then each user's cumulative count should be tracked independently

```python
# Setup: Two users with different configurations
user_a = uuid4()
user_b = uuid4()

config_a = UserTokenConfig(
    user_id=user_a,
    token_limit=5000,
    window_duration_seconds=3600
)
config_b = UserTokenConfig(
    user_id=user_b,
    token_limit=10000,
    window_duration_seconds=86400
)
session.add_all([config_a, config_b])
session.commit()

# User A uses 4,500 tokens
await service._record_usage(user_a, 4500, session)

# User B uses 9,000 tokens
await service._record_usage(user_b, 9000, session)

# Test: User A's usage doesn't affect User B
usage_a = await service.get_current_usage(user_a, session)
usage_b = await service.get_current_usage(user_b, session)

assert usage_a == 4500, f"User A usage should be 4500, got {usage_a}"
assert usage_b == 9000, f"User B usage should be 9000, got {usage_b}"
print(f"✅ User A usage: {usage_a} (limit: 5000)")
print(f"✅ User B usage: {usage_b} (limit: 10000)")

# User A can't exceed their limit
try:
    await service.validate_and_record(user_a, "text" * 100, session)  # ~1000 tokens
    print("❌ User A should have been blocked")
except TokenLimitExceededError:
    print("✅ User A correctly blocked at their limit")

# User B still has budget
try:
    await service.validate_and_record(user_b, "text" * 50, session)  # ~500 tokens
    print("✅ User B request accepted (independent budget)")
except TokenLimitExceededError:
    print("❌ User B should have been accepted")
```

**Expected Output**:
```
✅ User A usage: 4500 (limit: 5000)
✅ User B usage: 9000 (limit: 10000)
✅ User A correctly blocked at their limit
✅ User B request accepted (independent budget)
```

## Validation Checklist

After running all scenarios:

- [ ] Token calculation uses tiktoken (OpenAI standard)
- [ ] Per-user configuration works (limits and windows)
- [ ] Requests within limits are accepted
- [ ] Requests exceeding limits raise TokenLimitExceededError
- [ ] Error contains accurate usage information
- [ ] Rolling window excludes old records
- [ ] Rolling window includes recent records
- [ ] Concurrent requests don't cause race conditions
- [ ] Users have independent token budgets
- [ ] Database transactions maintain consistency

## Running the Full Test Suite

```bash
# Run all tests
make test-all

# Run only token manager tests
pytest tests/unit/test_token_*.py -v
pytest tests/integration/test_token_*.py -v

# Run with coverage
pytest tests/ --cov=src/nexus/token_manager --cov-report=html
```

## Troubleshooting

**Issue**: Tests fail with "User not found"
- **Solution**: Ensure User fixtures are created before UserTokenConfig

**Issue**: Rolling window tests inconsistent
- **Solution**: Use frozen time in tests (`freezegun` library)

**Issue**: Concurrent tests have race conditions
- **Solution**: Ensure proper transaction isolation in tests

## Next Steps

After validating the quickstart:
1. Run full integration test suite
2. Perform load testing for concurrent requests
3. Validate performance targets (<200ms p95 latency)
4. Review error handling and logging
5. Ready for production deployment
