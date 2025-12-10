# Data Models: Context Compression for Multi-Agent System

**Date**: December 1, 2025
**Feature**: Context compression with LLM summarization

## Overview

This feature follows a minimalist data model approach, using simple Python built-in types and leveraging existing infrastructure rather than creating new complex data structures. The implementation prioritizes simplicity and integration ease over complex object hierarchies.

## Primary Interface

### Actual Implementation Interface
```python
from typing import Union, Optional

class CompressorService:
    """Service for compressing document content to fit token constraints."""

    def compress(
        self,
        data: Union[list[str], str],
        max_tokens: int,
        strategy: str = "greedy",
        goal: Optional[str] = None,
        correlation_id: str = "unknown"
    ) -> str:
        """Compress data to fit within token budget using specified strategy.

        Args:
            data: Documents to potentially compress (list of strings or single string)
            max_tokens: Maximum tokens allowed in output
            strategy: Compression strategy to use (currently only "greedy" supported)
            goal: Optional context for LLM summarization to focus on specific aspects
            correlation_id: Correlation identifier for distributed tracing

        Returns:
            String content: Either original content or compressed summary

        Raises:
            ValueError: If data is empty, max_tokens <= 0, or unsupported strategy
            RuntimeError: If LLM compression fails
        """
```

### Input Data Types
- **data**: `Union[list[str], str]` - Flexible input accepting either single document or list of documents
- **max_tokens**: `int` - Positive integer representing maximum allowed tokens
- **strategy**: `str` - Compression strategy (only "greedy" currently supported)
- **goal**: `Optional[str]` - Optional context for LLM compression focus
- **correlation_id**: `str` - Tracing identifier for distributed system logging

### Output Data Type
- **Return Value**: `str` - Simple string containing either:
  - Original concatenated content (if within token budget)
  - LLM-compressed summary with structured citations (if exceeding budget)

## Internal Data Flow

### Data Normalization
```python
def _normalize_input(self, data: Union[list[str], str]) -> list[str]:
    """Convert input data to normalized format.

    - Single string -> [string]
    - List of strings -> unchanged
    - Invalid types -> ValueError
    """
```

### Document Concatenation Format
```python
def _concatenate_documents(self, documents: list[str]) -> str:
    """Concatenate documents with clear separators.

    Single document: returns as-is
    Multiple documents: formats as:
        Document 1:
        {content1}

        Document 2:
        {content2}
    """
```

### LLM Prompt Structure
```python
def _format_documents_for_prompt(self, documents: list[str]) -> str:
    """Format documents for LLM prompt with clear document identifiers.

    Format:
        Document 1:
        {content1}

        Document 2:
        {content2}
    """
```

## Dependencies

### Injected Services
```python
class CompressorService:
    def __init__(
        self,
        token_calculator: Optional[TokenCalculator] = None,
        llm: Optional[ChatOpenAI] = None
    ) -> None:
        """Initialize with existing services or create defaults."""
        self.token_calculator = token_calculator or TokenCalculator()
        self.llm = llm or get_openrouter_llm(temperature=0.3, max_tokens=2000)
```

### External Dependencies
- **TokenCalculator**: Existing service for accurate token counting
- **ChatOpenAI**: LangChain OpenAI interface for LLM operations
- **get_openrouter_llm()**: Factory function for OpenRouter LLM configuration

## Error Handling

### Exception Types Used
```python
# Built-in Python exceptions - no custom classes
ValueError:
    - "Data cannot be empty"
    - "Data list cannot be empty"
    - "max_tokens must be positive"
    - "Unsupported strategy: {strategy}. Only 'greedy' is currently supported"
    - "Unsupported data type: {type}. Expected str or list[str]"
    - "All items in data list must be strings"

RuntimeError:
    - "LLM compression failed: {original_error}"
```

## Data Flow Implementation

### Binary Decision Logic
```
Input: Union[list[str], str] + max_tokens + strategy + goal + correlation_id
    |
    v
Validate inputs (raise ValueError if invalid)
    |
    v
Normalize to list[str] format
    |
    v
Concatenate documents with proper formatting
    |
    v
Calculate total tokens using TokenCalculator
    |
    v
total_tokens <= max_tokens?
    |
    ├─ Yes -> return concatenated content (log: no compression needed)
    |
    └─ No -> Format LLM prompt with documents and goal
        |
        v
    Call LLM via ChatOpenAI interface
        |
        v
    LLM success?
        |
        ├─ Yes -> Verify compressed token count and return (log: compression completed)
        |
        └─ No -> raise RuntimeError (log: compression failed)
```

## Integration Points

### Context Manager Integration
```python
# In ContextManagerPlanner.plan_request():
compressor = CompressorService()
compressed_content = compressor.compress(
    data=document_strings,  # List[str] from retriever
    max_tokens=max_tokens,  # From config
    strategy="greedy",
    goal=f"Answer query: {query}",  # Derived from user query
    correlation_id=correlation_id   # Request correlation ID
)
```

### Logging & Observability
```python
# Debug level logging
logger.debug("CompressorService.compress called - correlation_id: %s, strategy: %s, max_tokens: %d", ...)
logger.debug("Compression input - correlation_id: %s, doc_count: %d", ...)
logger.debug("Token analysis - correlation_id: %s, total_tokens: %d, max_tokens: %d", ...)

# Info level logging
logger.info("No compression needed - correlation_id: %s, tokens_used: %d/%d", ...)
logger.info("Compression required - correlation_id: %s, tokens_before: %d, target: %d", ...)
logger.info("Compression completed - correlation_id: %s, tokens_after: %d, target: %d, ratio: %.2f", ...)

# Error level logging
logger.error("LLM compression failed - correlation_id: %s, error: %s", ...)
```

## Validation Rules

### Input Validation (Implemented)
- `data` must not be empty (raises ValueError)
- `data` list must not be empty if provided as list (raises ValueError)
- `max_tokens` must be positive integer (raises ValueError)
- `strategy` must be "greedy" (raises ValueError for unsupported strategies)
- All items in `data` list must be strings (raises ValueError for mixed types)
- `data` must be Union[list[str], str] (raises ValueError for other types)

### Output Characteristics
- Returns simple string format consistently
- Compressed content includes numeric document citations
- Pass-through content maintains original formatting
- Single documents return without "Document 1:" prefix
- Multiple documents concatenated with clear separators

## State Management

This implementation is completely stateless:
- No persistent state between calls
- No caching mechanisms
- Each compression operation is independent
- Services injected via constructor for testing/mocking

## Design Rationale

### Simplicity Over Complexity
- Uses built-in Python types instead of custom classes
- Simple string interface reduces integration complexity
- Built-in exceptions instead of custom hierarchy
- Minimal dependencies on existing infrastructure

### Testability
- Constructor dependency injection allows easy mocking
- Pure functions with no side effects (except logging)
- Clear error cases with specific exception types
- Deterministic behavior for consistent testing

### Integration Friendly
- Simple string interface matches assembler service expectations
- Correlation ID tracing for distributed system debugging
- Flexible input format (single string or list)
- Strategy parameter allows future expansion

### Performance Optimized
- Binary decision making (no complex ranking algorithms)
- Single LLM call per compression operation
- Minimal string processing overhead
- Reuses existing TokenCalculator and LLM services

This design prioritizes integration simplicity, testability, and maintainability while providing all required functionality for the context compression feature within the multi-agent system architecture.
