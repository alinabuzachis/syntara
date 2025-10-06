# Research: Workflow Engine Implementation

## Temporal Workflow Orchestration

**Decision**: Use Temporal with workflow-per-execution pattern
**Rationale**: Temporal provides durable execution, automatic retries, and state persistence that align perfectly with our requirements for workflow reliability and recovery
**Alternatives considered**:
- Celery + Redis: Lacks durable execution and workflow semantics
- Apache Airflow: Too heavy for dynamic workflows, focused on DAG scheduling
- Custom solution: Would require reimplementing Temporal's proven durability features

### Key Patterns:
- **Workflows**: One workflow class per workflow type, handle orchestration logic only
- **Activities**: Individual tasks (agentic/non-agentic) as separate activities for testability
- **Human-in-the-loop**: Use workflow.wait_condition() with signals for approval flows
- **External Integration**: Generic activity class for calling external agentic tool servers
- **Error Handling**: Temporal's built-in retry policies with exponential backoff

## FastAPI API Design

**Decision**: Use FastAPI with domain-driven structure
**Rationale**: Native async support works well with Temporal, automatic OpenAPI generation, excellent performance for API workloads
**Alternatives considered**:
- Django REST Framework: Less suitable for async workflows, more overhead
- Flask: Lacks built-in async support and automatic API documentation

### Key Patterns:
- **Project Structure**: Domain-based modules (workflows/, executions/)
- **Authentication**: JWT tokens with FastAPI dependency injection
- **Real-time Updates**: Streamable HTTP for workflow status updates and MCP integration
- **Validation**: Pydantic models for request/response validation
- **Background Tasks**: FastAPI BackgroundTasks for non-workflow operations

## Real-time Communication Strategy

**Decision**: Implement Streamable HTTP transport (MCP specification)
**Rationale**: Provides bidirectional communication, session management, message replay, and native compatibility with external agentic tool servers
**Alternatives considered**:
- Server-Sent Events: Unidirectional only, lacks session management and replay
- WebSockets: More complex, no standardized patterns for agentic integrations
- HTTP/2 streaming: Lacks the reliability features needed for workflow monitoring

### Key Patterns:
- **Bidirectional Communication**: Support both workflow status streaming and client commands
- **Session Management**: Unique session IDs for reliable client reconnection
- **Message Replay**: Resume streams after connection interruptions
- **MCP Compatibility**: Native integration with external agentic tool servers
- **Security**: Origin validation and authentication as per MCP specification

## Data Storage Strategy

**Decision**: PostgreSQL + Temporal Server dual storage
**Rationale**: PostgreSQL for business data and queries, Temporal for execution state and durability
**Alternatives considered**:
- Single database: Would lose Temporal's durability guarantees
- NoSQL: Lacks ACID properties needed for workflow metadata consistency

### Key Patterns:
- **Workflow Metadata**: Store in PostgreSQL (definitions, versions, permissions)
- **Execution State**: Managed by Temporal server automatically
- **Audit Logs**: PostgreSQL with structured JSON fields
- **User Data**: PostgreSQL with proper normalization

## External System Integration

**Decision**: Generic activity class for all external agentic tool servers
**Rationale**: Single point of maintenance, consistent error handling, configuration-driven approach eliminates need for tool-specific activities
**Alternatives considered**:
- Tool-specific activities: Would create maintenance overhead and inconsistent patterns
- Embedded connectors: Would complicate workflow logic and testing
- Microservice connectors: Adds unnecessary network complexity

### Key Patterns:
- **Generic Tool Activity**: Single activity class handles all external agentic tool requests
- **Configuration-Driven**: Add new tools through configuration, not code changes
- **Standardized Interface**: Common request/response format across all external tools
- **MCP Transport**: Native Streamable HTTP support for Model Context Protocol servers
- **Authentication**: Pluggable auth strategies (API keys, OAuth, certificates)
- **Circuit Breaker**: Temporal's built-in failure detection with per-tool retry policies
- **Response Normalization**: Transform diverse tool responses into consistent format

## Human-in-the-Loop Design

**Decision**: Signal-based approval workflow pattern with Streamable HTTP notifications
**Rationale**: Temporal signals provide reliable, durable communication for human interactions, Streamable HTTP enables real-time notifications
**Alternatives considered**:
- Polling: Less efficient and reliable than signal-based approach
- External queue: Would break Temporal's execution guarantees

### Key Patterns:
- **Approval Activities**: Pause workflow execution, send notifications via Streamable HTTP
- **Signal Handlers**: Receive approval/rejection signals with data
- **Timeout Handling**: Configurable timeouts with default behaviors
- **Real-time Notifications**: Streamable HTTP for immediate user alerts
- **Session Continuity**: Resume approval sessions after reconnection

## Performance and Scalability

**Decision**: Temporal worker scaling with Redis/Valkey caching and Streamable HTTP multiplexing
**Rationale**: Temporal handles workflow distribution, Redis/Valkey for API response caching, Streamable HTTP manages multiple concurrent sessions efficiently
**Alternatives considered**:
- Manual load balancing: Temporal provides this automatically
- In-memory caching: Doesn't scale across multiple API instances

### Key Patterns:
- **Worker Scaling**: Multiple worker processes per task queue
- **API Caching**: Redis/Valkey for frequently accessed workflow metadata
- **Connection Pooling**: PostgreSQL and Redis/Valkey connection pools
- **Session Multiplexing**: Handle multiple Streamable HTTP sessions per server
- **Tool Connection Reuse**: Pool connections to external agentic tool servers
- **Metrics**: Prometheus metrics for Temporal and API performance

## Testing Strategy

**Decision**: Multi-layer testing with Temporal's test framework and generic tool mocking
**Rationale**: Temporal provides excellent testing utilities, generic activity enables single mock for all external tools
**Alternatives considered**:
- Mock-heavy testing: Would miss integration issues with Temporal
- End-to-end only: Too slow for TDD approach
- Tool-specific mocks: Would require maintaining mocks for each external tool

### Key Patterns:
- **Unit Tests**: Individual activities and domain logic
- **Workflow Tests**: Temporal's workflow testing framework
- **Integration Tests**: testcontainers for database and external services
- **Contract Tests**: API contract validation with generated schemas
- **Generic Tool Mock**: Single mock server supporting multiple tool protocols
- **Streamable HTTP Tests**: Mock MCP servers with session management

## Observability and Monitoring

**Decision**: Structured logging with Temporal's built-in observability and Streamable HTTP session tracking
**Rationale**: Temporal provides workflow execution visibility, complement with application-level metrics and session analytics
**Alternatives considered**:
- Custom metrics only: Would miss workflow-level insights
- External APM only: Temporal's built-in tools are workflow-aware

### Key Patterns:
- **Workflow Metrics**: Temporal's built-in dashboard and metrics
- **Application Logs**: Structured JSON logging with correlation IDs
- **Session Analytics**: Track Streamable HTTP session health and performance
- **Tool Performance**: Monitor external tool response times and success rates
- **Health Checks**: FastAPI health endpoints for deployment monitoring
- **Tracing**: OpenTelemetry integration for distributed tracing
