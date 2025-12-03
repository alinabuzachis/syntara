# Research Findings: RetrieverService Framework

**Phase 0 Research** | **Date**: 2025-11-27 | **Branch**: 015-retriever-framework

## Research Summary

All technical context was resolved through codebase analysis. No external research required as the implementation leverages existing patterns and technologies already in use.

## Architecture Patterns

### Decision: Registry-based Pattern for Extensibility
**Rationale**: Existing FileManager already uses pluggable retriever pattern with `get_retriever_for_file()` method. This approach provides clean separation and allows future storage backends without code changes.

**Alternatives considered**:
- Simple factory pattern: Rejected - less flexible for future extension
- Plugin system with discovery: Rejected - unnecessary complexity for current scope
- Hardcoded conditional logic: Rejected - violates Open/Closed principle

**Implementation**: Use composition over inheritance with abstract base classes for both retrievers and relevancy checkers.

## LLM Integration

### Decision: LangChain with OpenRouter Integration  
**Rationale**: System already has working OpenRouter configuration at `src/nexus/agent_orchestrator/clients/openrouter_config.py` with factory function `get_openrouter_llm()`. No need for additional LLM integration patterns.

**Alternatives considered**:
- Direct OpenAI API calls: Rejected - breaks existing patterns
- Different LLM providers: Rejected - OpenRouter already provides access to multiple models
- Custom LLM client: Rejected - unnecessary reinvention

**Implementation**: Use existing `get_openrouter_llm()` factory with appropriate model selection for relevancy checking tasks.

## Data Models

### Decision: SQLModel for Unified Data Models
**Rationale**: Project standard established in ADR and Constitution. All data models use SQLModel to serve both as database tables and API schemas.

**Alternatives considered**:
- Separate Pydantic + SQLAlchemy: Rejected - violates project standards
- Plain dataclasses: Rejected - lacks validation and ORM features
- Custom model layer: Rejected - unnecessary complexity

**Implementation**: Follow existing patterns like `Invocation` model with SQLModel base classes.

## Configuration Management

### Decision: Global Configuration per Relevancy Checker Type
**Rationale**: Requirement from feature spec clarification. Supports different tuning parameters for different algorithms while maintaining simplicity.

**Alternatives considered**:
- Per-invocation configuration: Rejected - scope clarification specified global configuration
- No configuration: Rejected - reduces system flexibility
- Profile-based configuration: Rejected - specified as out of scope

**Implementation**: Configuration model using SQLModel with JSONB storage for flexible parameters.

## Document Storage Integration

### Decision: Use ALL Registered DocumentRetrievers to Collate from All Sources
**Rationale**: Service specification clarified that RetrieverService should use ALL registered retrievers, not select specific ones based on FileMetadata or context. This provides comprehensive document coverage.

**Alternatives considered**:
- FileMetadata-based retriever selection: Rejected - scope clarification specified using all retrievers
- Single retriever per invocation: Rejected - limits document coverage
- Manual retriever specification: Rejected - violates registry pattern benefits

**Implementation**: Service iterates through all registered DocumentRetrievers to gather documents from every available source, then applies relevancy checking to the complete set.

### Storage Backend Integration
- **UploadedFileRetriever**: Uses existing FileManager patterns for uploaded files
- **DatabaseRetriever**: Future implementation for database-stored documents  
- **CloudStorageRetriever**: Future implementation for cloud storage
- **Extensibility**: New storage backends automatically included via registry

## Testing Strategy

### Decision: pytest with async support following existing patterns
**Rationale**: Project already uses pytest with pytest-asyncio. All services follow async/await patterns throughout.

**Alternatives considered**:
- Synchronous testing: Rejected - service is fully async
- Different test framework: Rejected - breaks project consistency
- No testing: Rejected - violates TDD requirement

**Implementation**: Unit tests for individual components, integration tests for full retrieval flow, contract tests for internal service interfaces.

## Error Handling

### Decision: Domain Exceptions with Graceful Fallback
**Rationale**: Feature spec specifies fallback from LLM to keyword-based relevancy checking. Service layer should use domain exceptions rather than HTTP responses.

**Alternatives considered**:
- HTTP error responses: Rejected - internal service, not API endpoint
- Silent failure: Rejected - reduces system observability
- Fail-fast approach: Rejected - doesn't meet graceful fallback requirement

**Implementation**: Custom exception classes with fallback logic in service orchestration.

## Performance Considerations

### Decision: Async/await throughout with concurrent operations support
**Rationale**: Existing codebase uses async patterns. Multiple document retrieval operations may be needed concurrently.

**Alternatives considered**:
- Synchronous implementation: Rejected - breaks existing patterns
- Threading: Rejected - async/await provides better resource utilization
- Celery background tasks: Rejected - adds unnecessary complexity for this use case

**Implementation**: Async service methods with proper session management and connection pooling.

## Research Validation

✅ **All NEEDS CLARIFICATION items resolved**  
✅ **Technology choices align with existing project standards**  
✅ **Architecture patterns follow established project conventions**  
✅ **Integration points identified and validated**  
✅ **Performance and scalability considerations addressed**

## Next Phase Requirements

Phase 1 should focus on:
1. Data model extraction from feature spec key entities
2. Service interface definition following existing BaseService patterns  
3. Test scenario generation from user stories
4. Integration with existing FileManager and OpenRouter systems

**Ready for Phase 1: Design & Contracts**
