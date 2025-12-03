# Quickstart Guide: RetrieverService Framework

**Phase 1 Quickstart** | **Date**: 2025-11-27 | **Branch**: 015-retriever-framework

## Overview

This guide demonstrates how to use the `RetrieverService` framework for document retrieval with relevancy checking. The service is designed for internal use by AI agents processing invocations with documents from all available storage sources.

## Test Scenarios from User Stories

### Scenario 1: Basic Document Retrieval from Uploaded Files

**Given**: An invocation with uploaded files and a user prompt  
**When**: An agent requests document retrieval  
**Then**: `RetrieverService` returns ranked relevant documents

```python
# Test setup (conceptual - implementation in /tasks)
invocation_id = "test-invocation-123"
prompt = "Find information about Python testing frameworks"
uploaded_files = ["pytest_guide.pdf", "unittest_docs.txt", "testing_best_practices.md"]

# Expected flow
service = RetrieverService(session, retriever_registry, relevancy_registry)
results = await service.retrieve_relevant_documents(invocation_id, prompt)

# Assertions
assert len(results) > 0
assert all(doc.relevancy_score >= similarity_threshold for doc in results)  # Above threshold (TBD)
assert results[0].relevancy_score >= results[1].relevancy_score  # Properly ranked
assert all(doc.source_type == "uploaded_file" for doc in results)
```

### Scenario 2: Multiple Storage Backend Collation

**Given**: Multiple types of storage backends are configured  
**When**: Retrieving documents  
**Then**: Service uses ALL registered retrievers to collate documents from every source

```python
# Test setup
mixed_storage_invocation = "test-mixed-storage-456"
# Documents exist in multiple storage backends

# Expected behavior
results = await service.retrieve_relevant_documents(mixed_storage_invocation, prompt)

# Should automatically use ALL registered retrievers
uploaded_docs = [doc for doc in results if doc.source_type == "uploaded_file"]
database_docs = [doc for doc in results if doc.source_type == "database"]
cloud_docs = [doc for doc in results if doc.source_type == "cloud_storage"]

# Results should contain documents from all available sources
total_sources = len(set(doc.source_type for doc in results))
assert total_sources >= 1  # At least one source had documents
```

### Scenario 3: LLM-Based Relevancy Checking

**Given**: User prompt about specific content  
**When**: Relevancy checking is performed  
**Then**: LLM-based checker accurately identifies relevant documents

```python
# Test with specific technical query
technical_prompt = "Explain async/await patterns in Python"
results = await service.retrieve_relevant_documents(invocation_id, technical_prompt)

# LLM should identify relevant technical documents
relevant_docs = [doc for doc in results if doc.relevancy_score > 0.7]
assert len(relevant_docs) > 0
# Should contain documents about Python async programming
```

### Scenario 4: Extensibility - New Storage Backend

**Given**: A new storage backend is added to the system  
**When**: Files are stored using that backend  
**Then**: RetrieverService can retrieve documents without code changes

```python
# Conceptual test for future cloud storage
class CloudStorageRetriever(DocumentRetriever):
    # Implementation would be added later
    pass

# Registration (done at startup)
retriever_registry.register_retriever("cloud_storage", CloudStorageRetriever)

# Usage should work seamlessly
cloud_invocation = "test-cloud-storage-789"
results = await service.retrieve_relevant_documents(cloud_invocation, prompt)
cloud_docs = [doc for doc in results if doc.source_type == "cloud_storage"]
# Should work without service code changes
```

## Edge Case Scenarios

### Edge Case 1: No Documents Available

**Given**: Invocation context with no documents from any source  
**When**: Agent requests document retrieval  
**Then**: Service returns empty list gracefully

```python
empty_invocation = "test-no-files-999"
results = await service.retrieve_relevant_documents(empty_invocation, prompt)
assert results == []
assert isinstance(results, list)  # Always returns list, never None
```

### Edge Case 2: LLM Relevancy Checker Failure with Fallback

**Given**: LLM relevancy checker is unavailable or returns errors  
**When**: Relevancy checking is attempted  
**Then**: System falls back to keyword-based checking

```python
# Simulate LLM failure by mocking
with mock_llm_failure():
    results = await service.retrieve_relevant_documents(invocation_id, prompt)

# Should still return results via keyword fallback
assert len(results) >= 0
# Check that fallback was used
assert results[0].retrieval_metadata.get("fallback_used") is True
```

### Edge Case 3: Storage Backend Unavailable

**Given**: Storage backend becomes temporarily unavailable  
**When**: Attempting document retrieval  
**Then**: Service handles gracefully with alternative backends or error

```python
# Simulate storage failure
with mock_storage_failure("uploaded_file"):
    results = await service.retrieve_relevant_documents(invocation_id, prompt)
    # Should either use alternative backends or return empty with proper error logging
    # Should not crash the service
```

### Edge Case 4: Document Content Cannot Be Loaded

**Given**: File metadata exists but content cannot be loaded  
**When**: Attempting to retrieve document content  
**Then**: System skips unloadable documents and continues

```python
corrupted_file_invocation = "test-corrupted-files-888"
results = await service.retrieve_relevant_documents(corrupted_file_invocation, prompt)
# Should return only successfully loaded documents
# Should log errors for unloadable files but not fail entirely
```

## Configuration Testing

### Global Configuration per Relevancy Checker

```python
# Test configuration updates
llm_config = RelevancyConfiguration(
    checker_type="llm",
    similarity_threshold=0.5,
    max_results=5,
    algorithm_parameters={"temperature": 0.3, "max_tokens": 100}
)

relevancy_registry.update_configuration("llm", llm_config)

# Test that updated configuration is used
results = await service.retrieve_relevant_documents(invocation_id, prompt)
assert len(results) <= 5  # Respects max_results
assert all(doc.relevancy_score >= 0.5 for doc in results)  # Respects threshold
```

### Multiple Relevancy Checker Types

```python
# Test different checker configurations
keyword_config = RelevancyConfiguration(
    checker_type="keyword",
    similarity_threshold=0.2,
    max_results=10
)

relevancy_registry.register_checker("keyword", KeywordRelevancyChecker, keyword_config)

# Each checker type should use its own configuration
# (Implementation details in /tasks phase)
```

## Performance Expectations

### Response Time Requirements

```python
import time

start_time = time.time()
results = await service.retrieve_relevant_documents(invocation_id, prompt)
elapsed_time = time.time() - start_time

# Response time threshold TBD
assert elapsed_time < response_time_threshold  # TBD
```

### Concurrent Operations

```python
# Test multiple concurrent retrieval operations
import asyncio

tasks = [
    service.retrieve_relevant_documents(f"invocation-{i}", f"query-{i}")
    for i in range(5)
]

results_list = await asyncio.gather(*tasks)
# All should complete successfully
assert all(isinstance(results, list) for results in results_list)
```

## Integration Points

### DocumentRetriever Implementation Example

```python
# Example: UploadedFileRetriever uses FileManager internally
class UploadedFileRetriever(DocumentRetriever):
    def __init__(self, file_manager: FileManager):
        self.file_manager = file_manager

    async def retrieve_documents(self, invocation_context: dict) -> List[str]:
        # Get file_metadata from invocation context
        file_metadata_list = invocation_context.get("file_metadata", [])

        documents = []
        for file_metadata_dict in file_metadata_list:
            # Parse FileMetadata from context
            file_metadata = FileMetadata(**file_metadata_dict)

            # Only process converted documents
            if file_metadata.status != "converted" or not file_metadata.conversion:
                continue

            converted_file_path = file_metadata.conversion.get("file_path")
            if not converted_file_path:
                continue

            # Use FileManager to get appropriate retriever for this file
            retriever = self.file_manager.get_retriever_for_file(
                file_metadata.size_bytes,
                file_metadata.mime_type
            )

            # Load converted document content
            content = await retriever.load_file(converted_file_path)
            documents.append(content.decode('utf-8'))  # Convert bytes to string

        return documents
```

### Architecture Relationship

**RetrieverService** orchestrates document retrieval but has no direct knowledge of FileManager:
- Uses registered `DocumentRetriever` implementations via `RetrieverRegistry`
- Calls `retriever.retrieve_documents(invocation_context)` on ALL registered retrievers
- Collates results from multiple storage backends

**DocumentRetriever implementations** (like `UploadedFileRetriever`) use FileManager as an internal dependency:
- `UploadedFileRetriever` uses `FileManager.get_retriever_for_file()` and `BaseRetriever.load_file()`
- Other retrievers like `DatabaseRetriever` would use different storage mechanisms
- FileManager remains encapsulated within specific retriever implementations

**FileManager** provides file storage abstraction:
- Handles file retrieval mechanics through `BaseRetriever` implementations
- Used by `UploadedFileRetriever` but not directly by `RetrieverService`

### OpenRouter LLM Integration

```python
# Verify LLM configuration usage
from nexus.agent_orchestrator.clients.openrouter_config import get_openrouter_llm
llm = get_openrouter_llm(model="anthropic/claude-3.5-sonnet", temperature=0.7)
# Should integrate with LLMRelevancyChecker
```

## Success Criteria Validation

1. **Registry-based architecture**: ✅ Retrievers and checkers can be registered/swapped
2. **FileManager integration**: ✅ Uses existing get_retriever_for_file() method  
3. **LLM relevancy checking**: ✅ Uses OpenRouter configuration
4. **Graceful fallback**: ✅ LLM failure triggers keyword fallback
5. **Full document return**: ✅ No chunking at service level
6. **Configuration support**: ✅ Global configuration per checker type
7. **Extensibility**: ✅ New retrievers/checkers can be added without service changes

**Ready for /tasks command to generate implementation tasks**
