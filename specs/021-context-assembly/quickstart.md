# Quickstart: Context Assembly Testing

**Feature**: Context Assembly for Multi-Agent System
**Branch**: `017-context-assembler`
**Date**: 2025-12-10

## Purpose

This quickstart guide provides step-by-step instructions for testing the AssemblerService implementation against the acceptance scenarios defined in the feature specification.

## Prerequisites

1. **Environment Setup**:
   ```bash
   # Ensure you're on the correct branch
   git checkout 017-context-assembler

   # Install dependencies
   uv sync

   # Verify Python version
   python --version  # Should be Python 3.12+
   ```

2. **Services Running**:
   - TokenService must be available
   - CompressorService must be available
   - Note: ContextPackage is in-memory only (no database required)

3. **Test Data Available**:
   - Sample RelevantDocuments with varying relevancy scores
   - Test token budgets configured

## Test Scenarios

### Scenario 1: Documents Within Token Budget (No Compression)

**Objective**: Verify documents within budget pass through without compression

**Test**:
```bash
pytest tests/integration/agent_orchestrator/context_manager/test_assembler_integration.py::test_assembly_within_budget -v
```

**Expected Outcome**:
- AssemblerService completes successfully
- CompressorService is NOT invoked
- ContextPackage returned with:
  - `package_metadata.compression_applied = False`
  - `package_metadata.original_token_count` < `max_tokens`
  - `package_metadata.final_token_count = original_token_count`
  - Valid `grounding_score` (average of input relevancy scores)

**Validation**:
```python
assert context_package.package_metadata["compression_applied"] is False
assert context_package.grounding_score > 0.0
assert len(context_package.citations) > 0
```

### Scenario 2: Documents Exceeding Budget (Compression Triggered)

**Objective**: Verify TokenLimitExceededError triggers compression

**Test**:
```bash
pytest tests/integration/agent_orchestrator/context_manager/test_assembler_integration.py::test_assembly_triggers_compression -v
```

**Expected Outcome**:
- TokenService raises TokenLimitExceededError on first check
- CompressorService is invoked
- Compressed content validated (second check)
- ContextPackage returned with:
  - `package_metadata.compression_applied = True`
  - `package_metadata.original_token_count` > `max_tokens`
  - `package_metadata.final_token_count` < `max_tokens`
  - Citations contain file_id strings from original documents

**Validation**:
```python
assert context_package.package_metadata["compression_applied"] is True
assert context_package.package_metadata["final_token_count"] < max_tokens
# Citations are file_id strings from original documents
assert isinstance(context_package.citations, list)
assert all(isinstance(c, str) for c in context_package.citations)
assert len(context_package.citations) > 0
```

### Scenario 3: Compressed Content Within Budget (Success)

**Objective**: Verify assembly proceeds successfully when compression reduces content enough

**Test**:
```bash
pytest tests/integration/agent_orchestrator/context_manager/test_assembler_integration.py::test_compression_success -v
```

**Expected Outcome**:
- Compression reduces content below token limit
- Assembly completes successfully
- ContextPackage has valid structure
- All required fields populated

**Validation**:
```python
assert context_package.id is not None
assert context_package.correlation_id == test_correlation_id
assert context_package.payload is not None
assert 0.0 <= context_package.grounding_score <= 1.0
```

### Scenario 4: Post-Compression Limit Violation (Rejection)

**Objective**: Verify request rejected when compression insufficient

**Test**:
```bash
pytest tests/integration/agent_orchestrator/context_manager/test_assembler_integration.py::test_post_compression_rejection -v
```

**Expected Outcome**:
- Compression invoked
- Compressed content still exceeds token limit
- TokenService raises TokenLimitExceededError again
- AssemblerService raises ContextAssemblyError
- Error message includes correlation_id

**Validation**:
```python
with pytest.raises(ContextAssemblyError) as exc_info:
    await assembler.assemble(large_documents, correlation_id, small_max_tokens)

assert exc_info.value.correlation_id == correlation_id
assert "even after compression" in str(exc_info.value)
```

### Scenario 5: Citations Extracted from FileMetadata.file_id

**Objective**: Verify file_id values extracted from RelevantDocuments

**Test**:
```bash
pytest tests/unit/agent_orchestrator/context_manager/test_assembler.py::test_citation_extraction -v
```

**Expected Outcome**:
- Citations list contains file_id strings
- Each citation is a string (file_id from file_metadata)
- Citation count matches document count (excluding documents with missing file_metadata)

**Validation**:
```python
# Citations are simple file_id strings
assert isinstance(context_package.citations, list)
assert all(isinstance(c, str) for c in context_package.citations)
# Count should match documents with valid file_metadata
documents_with_file_id = [d for d in test_documents if d.file_metadata and d.file_metadata.file_id]
assert len(context_package.citations) == len(documents_with_file_id)
```

### Scenario 6: Grounding Score Computed as Simple Average

**Objective**: Verify grounding score calculation is correct

**Test**:
```bash
pytest tests/unit/agent_orchestrator/context_manager/test_assembler.py::test_grounding_score_computation -v
```

**Test Data**:
```python
documents = [
    RelevantDocument(relevancy_score=0.8, ...),
    RelevantDocument(relevancy_score=0.6, ...),
    RelevantDocument(relevancy_score=0.9, ...),
]
expected_score = (0.8 + 0.6 + 0.9) / 3 = 0.7667
```

**Expected Outcome**:
- Grounding score = 0.7667 (simple average)
- Score in valid range [0.0, 1.0]

**Validation**:
```python
assert abs(context_package.grounding_score - 0.7667) < 0.0001
```

### Scenario 7: Prompt Hierarchy Enforced

**Objective**: Verify payload sections ordered correctly

**Test**:
```bash
pytest tests/unit/agent_orchestrator/context_manager/test_assembler.py::test_prompt_hierarchy -v
```

**Expected Outcome**:
- Payload keys ordered: system, context, user
- Missing sections don't break ordering
- Validation passes

**Validation**:
```python
payload_keys = list(context_package.payload.keys())
expected_order = ["system", "context", "user"]

# Filter to only keys that are in expected_order
actual_hierarchy = [k for k in payload_keys if k in expected_order]
expected_hierarchy = [k for k in expected_order if k in payload_keys]

assert actual_hierarchy == expected_hierarchy
```

### Scenario 8: Required Fields Present

**Objective**: Verify all ContextPackage fields populated

**Test**:
```bash
pytest tests/unit/agent_orchestrator/context_manager/test_assembler.py::test_required_fields -v
```

**Expected Outcome**:
- All required fields present
- No None values for required fields
- Metadata contains expected keys

**Validation**:
```python
# Required fields
assert context_package.id is not None
assert context_package.correlation_id is not None
assert context_package.payload is not None
assert context_package.grounding_score is not None
assert context_package.citations is not None
assert context_package.package_metadata is not None

# Metadata required keys
required_metadata_keys = [
    "session_id",
    "original_token_count",
    "final_token_count",
    "compression_applied",
]
for key in required_metadata_keys:
    assert key in context_package.package_metadata
```

### Scenario 9: End-to-End Document Assembly

**Objective**: Verify full workflow produces correct output structure

**Test**:
```bash
pytest tests/integration/agent_orchestrator/context_manager/test_assembler_integration.py::test_end_to_end_assembly -v
```

**Expected Outcome**:
- Complete workflow executes successfully
- Payload contains assembled document content
- Citations extracted from file_metadata.file_id
- All validation passes

**Validation**:
```python
# Payload contains document content
assert isinstance(context_package.payload, dict)
assert len(context_package.payload) > 0

# Citations are file_id strings
assert isinstance(context_package.citations, list)
assert all(isinstance(c, str) for c in context_package.citations)
assert len(context_package.citations) > 0

# Metadata complete
assert "assembly_time_ms" in context_package.package_metadata
```

## Edge Case Testing

### Edge Case 1: Empty Document List

**Test**:
```bash
pytest tests/unit/agent_orchestrator/context_manager/test_assembler.py::test_empty_documents -v
```

**Expected**:
- Returns valid ContextPackage
- `grounding_score = 0.0`
- Empty payload
- Empty citations

### Edge Case 2: Null Documents

**Test**:
```bash
pytest tests/unit/agent_orchestrator/context_manager/test_assembler.py::test_null_documents -v
```

**Expected**:
- Returns valid ContextPackage
- `grounding_score = 0.0`
- Default values for all fields

### Edge Case 3: Invalid Relevancy Scores

**Test**:
```bash
pytest tests/unit/agent_orchestrator/context_manager/test_assembler.py::test_invalid_relevancy_scores -v
```

**Test Data**:
```python
documents = [
    RelevantDocument(relevancy_score=None, ...),
    RelevantDocument(relevancy_score=-0.1, ...),  # Invalid
    RelevantDocument(relevancy_score=1.5, ...),   # Invalid
    RelevantDocument(relevancy_score=0.7, ...),   # Valid
]
```

**Expected**:
- Invalid scores filtered out
- Grounding score = 0.7 (only valid score)
- No errors raised

## Performance Validation

### Performance Test: Typical Case (No Compression)

**Test**:
```bash
pytest tests/integration/agent_orchestrator/context_manager/test_assembler_performance.py::test_performance_no_compression -v
```

**Target**: < 50ms for assembly without compression

**Validation**:
```python
import time

start = time.time()
context_package = await assembler.assemble(documents, correlation_id, max_tokens)
duration_ms = (time.time() - start) * 1000

assert duration_ms < 50  # Target: < 50ms
```

### Performance Test: With Compression

**Test**:
```bash
pytest tests/integration/agent_orchestrator/context_manager/test_assembler_performance.py::test_performance_with_compression -v
```

**Target**: < 500ms for assembly with compression (depends on CompressorService)

**Note**: As specified, no performance checks required in current run per spec input.

## Integration with ContextManagerPlanner

### Test Planner Integration

**Test**:
```bash
pytest tests/integration/agent_orchestrator/context_manager/test_planner_assembler_integration.py -v
```

**Expected**:
- ContextManagerPlanner successfully invokes AssemblerService
- Full workflow: Retrieval → Compression (if needed) → Assembly
- Returned ContextPackage used by planner

## Running All Tests

### Unit Tests

```bash
pytest tests/unit/agent_orchestrator/context_manager/test_assembler.py -v
```

### Integration Tests

```bash
pytest tests/integration/agent_orchestrator/context_manager/test_assembler_integration.py -v
```

### All Assembly Tests

```bash
pytest -k "assembler" -v
```

### With Coverage

```bash
pytest tests/unit/agent_orchestrator/context_manager/test_assembler.py --cov=src/nexus/agent_orchestrator/context_manager/assembler --cov-report=term-missing
```

**Target**: > 90% code coverage per constitution requirements

## Troubleshooting

### Issue: TokenService Not Found

**Solution**:
```bash
# Verify TokenService is available
python -c "from nexus.agent_orchestrator.context_manager.token_service import TokenService"
```

### Issue: CompressorService Not Available

**Solution**:
```bash
# Check CompressorService implementation
ls src/nexus/agent_orchestrator/context_manager/compressor.py
```

### Issue: Tests Failing with Import Errors

**Solution**:
```bash
# Reinstall dependencies
uv sync --reinstall

# Verify package installation
uv pip list | grep nexus
```

### Issue: ContextPackage Schema Validation Failing

**Solution**:
```bash
# Check model definition
python -c "from nexus.agent_orchestrator.context_manager.models import ContextPackage; print(ContextPackage.model_json_schema())"
```

## Success Criteria Validation

After running all tests, verify:

- [x] 100% of documents within budget pass without compression
- [x] 100% of documents exceeding budget trigger compression
- [x] 100% of post-compression violations rejected with ContextAssemblyError
- [x] All packages include proper citations
- [x] Grounding scores computed correctly (simple average)
- [x] Prompt hierarchy enforced in all cases
- [x] TokenService used for all validations
- [x] End-to-end workflow produces correct output
- [x] Edge cases handled gracefully
- [x] Code coverage > 90%

## Next Steps

After quickstart validation:

1. **Code Review**: Submit PR for AssemblerService implementation
2. **Integration Testing**: Test with real ContextManagerPlanner workflow
3. **Documentation**: Update CLAUDE.md with implementation details
4. **Monitoring**: Verify logging and correlation_id tracing
5. **Performance**: Monitor assembly times in production

---
*Quickstart guide created: 2025-12-10*
