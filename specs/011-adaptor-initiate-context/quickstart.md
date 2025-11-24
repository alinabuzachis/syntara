# Quickstart Guide: Invocation Context Integration

**Date**: November 13, 2025
**Purpose**: Validate context integration with invocation API and demonstrate enhanced response capabilities

## Overview

This quickstart validates that the Context Manager integration successfully enhances invocation requests with contextual information while maintaining backward compatibility and graceful error handling.

## Prerequisites

- Python 3.12+ development environment
- Project dependencies installed via `uv sync`
- Context Manager scaffolding available (PR #162 merged)
- OpenRouter API key configured for LLM access
- Database migrations applied for invocation storage

## Validation Scenarios

### Scenario 1: Basic Context-Enhanced Invocation

**Objective**: Verify that invocations automatically include context enhancement

**Setup**:
```python
import httpx
import json

# API client setup
client = httpx.AsyncClient(base_url="http://localhost:8000")
headers = {"Authorization": "Bearer your-test-token"}
```

**Steps**:
1. Create an invocation with a prompt that would benefit from context:
   ```python
   request_data = {
       "prompt": "What are the best practices for API design in our system?",
       "session_id": "test-session-001"
   }

   response = await client.post(
       "/api/v1/invocations",
       json=request_data,
       headers=headers
   )

   assert response.status_code == 202
   invocation = response.json()
   invocation_id = invocation["id"]
   ```

2. Wait for processing and retrieve result:
   ```python
   # Poll until completed (or use WebSocket in production)
   import asyncio

   while True:
       response = await client.get(f"/api/v1/invocations/{invocation_id}", headers=headers)
       invocation = response.json()

       if invocation["status"] in ["completed", "failed"]:
           break
       await asyncio.sleep(1)
   ```

3. Validate enhanced response structure:
   ```python
   assert invocation["status"] == "completed"
   result = invocation["result"]

   # Basic response fields (unchanged)
   assert "type" in result
   assert "content" in result
   assert result["type"] == "answer"

   # Enhanced fields (new)
   assert "correlation_id" in result
   assert "grounding_score" in result
   assert isinstance(result["grounding_score"], float)
   assert 0.0 <= result["grounding_score"] <= 1.0

   # Verify correlation_id format (UUID4)
   import uuid
   uuid.UUID(result["correlation_id"])  # Should not raise exception
   ```

**Expected Outcome**: Invocation completes successfully with enhanced metadata

### Scenario 2: Backward Compatibility Verification

**Objective**: Ensure existing clients continue to work without modification

**Steps**:
1. Make a standard invocation request (same as before context integration):
   ```python
   request_data = {
       "prompt": "Hello, how are you today?",
       "session_id": "compatibility-test"
   }

   response = await client.post("/api/v1/invocations", json=request_data, headers=headers)
   invocation = response.json()
   ```

2. Verify existing client code still works:
   ```python
   # This should work exactly as before
   assert "id" in invocation
   assert "status" in invocation
   assert "prompt" in invocation
   assert invocation["prompt"] == request_data["prompt"]

   # Wait for completion and check result
   result = wait_for_completion(invocation["id"])

   # Core fields remain unchanged
   assert "content" in result
   assert isinstance(result["content"], str)
   ```

3. Verify optional new fields don't break existing parsing:
   ```python
   # Existing code should ignore new fields gracefully
   content = result["content"]  # Should work regardless of new fields
   response_type = result.get("type", "answer")  # Should work with defaults
   ```

**Expected Outcome**: Existing client code works without modification

### Scenario 3: Error Handling and Graceful Fallback

**Objective**: Verify system handles Context Manager failures gracefully

**Setup**:
```python
# This test may require mocking Context Manager failures
# or temporarily disabling Context Manager service
```

**Steps**:
1. Simulate Context Manager failure scenario
2. Create invocation request:
   ```python
   request_data = {
       "prompt": "Test prompt during context failure",
       "session_id": "error-handling-test"
   }

   response = await client.post("/api/v1/invocations", json=request_data, headers=headers)
   invocation = response.json()
   ```

3. Verify graceful fallback behavior:
   ```python
   result = wait_for_completion(invocation["id"])

   # Should still complete successfully
   assert invocation["status"] == "completed"
   assert "content" in result

   # May not have context metadata on failure
   correlation_id = result.get("correlation_id")
   grounding_score = result.get("grounding_score")

   # But should still provide meaningful response
   assert len(result["content"]) > 0
   ```

**Expected Outcome**: Invocation succeeds without context enhancement

### Scenario 4: Context Quality Validation

**Objective**: Verify context actually improves response quality

**Steps**:
1. Create invocation that would clearly benefit from context:
   ```python
   request_data = {
       "prompt": "How should we structure our microservices for the user management system?",
       "session_id": "context-quality-test"
   }

   response = await client.post("/api/v1/invocations", json=request_data, headers=headers)
   invocation = response.json()
   ```

2. Analyze context-enhanced response:
   ```python
   result = wait_for_completion(invocation["id"])

   # Check grounding score indicates good context
   grounding_score = result["grounding_score"]
   assert grounding_score > 0.0  # Some context was found

   # Response should reference contextual information
   content = result["content"].lower()
   # Look for indicators of context-aware response
   context_indicators = ["based on", "according to", "documentation", "existing"]
   has_context_reference = any(indicator in content for indicator in context_indicators)

   if grounding_score > 0.5:
       # High grounding score should correlate with context references
       assert has_context_reference or len(content) > 200  # More detailed response
   ```

**Expected Outcome**: Higher grounding scores correlate with more contextual responses

### Scenario 5: Performance Impact Assessment

**Objective**: Measure performance impact of context enhancement

**Steps**:
1. Time baseline invocation without complex context needs:
   ```python
   import time

   start_time = time.time()

   request_data = {
       "prompt": "What is 2 + 2?",
       "session_id": "performance-baseline"
   }

   response = await client.post("/api/v1/invocations", json=request_data, headers=headers)
   invocation = response.json()
   result = wait_for_completion(invocation["id"])

   baseline_duration = time.time() - start_time
   ```

2. Time context-heavy invocation:
   ```python
   start_time = time.time()

   request_data = {
       "prompt": "Explain our entire system architecture and best practices",
       "session_id": "performance-context"
   }

   response = await client.post("/api/v1/invocations", json=request_data, headers=headers)
   invocation = response.json()
   result = wait_for_completion(invocation["id"])

   context_duration = time.time() - start_time
   grounding_score = result["grounding_score"]
   ```

3. Analyze performance impact:
   ```python
   performance_overhead = context_duration - baseline_duration

   print(f"Baseline duration: {baseline_duration:.2f}s")
   print(f"Context duration: {context_duration:.2f}s")
   print(f"Overhead: {performance_overhead:.2f}s")
   print(f"Grounding score: {grounding_score:.2f}")

   # Verify reasonable performance (thresholds TBD by performance team)
   # This is just validation that system is responsive
   assert context_duration < 30.0  # Should complete within reasonable time
   ```

**Expected Outcome**: Context enhancement adds acceptable latency

## Integration Testing Workflow

### Full End-to-End Validation

```python
async def test_full_integration():
    """Comprehensive integration test for context enhancement"""

    # 1. Basic functionality
    enhanced_invocation = await create_context_enhanced_invocation()
    validate_enhanced_response(enhanced_invocation)

    # 2. Backward compatibility
    standard_invocation = await create_standard_invocation()
    validate_backward_compatibility(standard_invocation)

    # 3. Error handling
    error_invocation = await test_context_error_handling()
    validate_graceful_fallback(error_invocation)

    # 4. Performance monitoring
    performance_metrics = await measure_performance_impact()
    validate_acceptable_performance(performance_metrics)

    print("✅ All integration tests passed")

# Helper functions
async def create_context_enhanced_invocation():
    # Implementation details...
    pass

def validate_enhanced_response(invocation):
    # Validation logic...
    pass

# Additional helper functions...
```

### Monitoring and Observability Validation

```python
async def validate_observability():
    """Verify logging and monitoring for context integration"""

    # Check structured logs include context operations
    logs = capture_structured_logs()

    # Verify context manager operations are logged
    context_logs = [log for log in logs if "context_manager" in log.get("component", "")]
    assert len(context_logs) > 0

    # Verify correlation IDs are present
    for log in context_logs:
        assert "run_id" in log
        assert "correlation_id" in log

    # Check metrics collection
    metrics = collect_performance_metrics()
    assert "context_enhancement_duration" in metrics
    assert "context_success_rate" in metrics
```

## Success Criteria Validation

### ✅ Context Enhancement Active
- Invocations automatically trigger Context Manager
- Responses include correlation_id and grounding_score
- Context data visibly improves response quality

### ✅ Backward Compatibility Maintained
- Existing clients work without code changes
- Response structure remains compatible
- No breaking changes to API contracts

### ✅ Error Resilience Demonstrated
- Context Manager failures don't break invocations
- Graceful fallback to non-enhanced responses
- Structured error logging for debugging

### ✅ Performance Acceptable
- Response time impact within acceptable bounds
- System remains responsive under load
- Context processing doesn't block other operations

### ✅ Observability Enabled
- All context operations logged with correlation
- Performance metrics available for monitoring
- Debug information accessible for troubleshooting

## Troubleshooting

### Common Issues

1. **No context enhancement**: Check Context Manager scaffolding is available and imported correctly
2. **Missing correlation_id**: Verify Context Manager returns valid package_metadata
3. **Performance issues**: Check Context Manager service responsiveness
4. **Backward compatibility**: Verify optional field handling in response parsing

### Debug Commands

```bash
# Check Context Manager availability
python -c "from nexus.agent_orchestrator.context_manager import ContextManagerPlanner; print('✅ Context Manager available')"

# Test Context Manager directly
python -c "
from nexus.agent_orchestrator.context_manager import ContextManagerPlanner
planner = ContextManagerPlanner()
result = planner.plan_request('test', 'tenant', 'test query')
print(f'Context result: {result}')
"

# Check invocation service integration
pytest tests/integration/api/test_invocations_api.py -v

# Monitor context enhancement logs
tail -f logs/nexus.log | grep "context_manager"
```

This quickstart guide ensures the Context Manager integration works correctly while maintaining the reliability and performance of the invocation API.
