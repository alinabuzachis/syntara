# Quickstart Guide: Context Manager MVP Planner Scaffolding

**Date**: November 12, 2025
**Purpose**: Validate implementation and demonstrate parallel development capabilities

## Overview

This quickstart validates that the Context Manager MVP scaffolding successfully enables parallel team development while maintaining integration consistency through the orchestration framework.

## Prerequisites

- Python 3.12+ development environment
- Project dependencies installed via `uv sync`
- Access to Nexus project source code

## Validation Scenarios

### Scenario 1: Basic Orchestration Workflow

**Objective**: Verify that the retrieve → compress → assemble workflow executes successfully

**Steps**:
1. Import the Context Manager components:
   ```python
   from nexus.agent_orchestrator.context_manager import (
       ContextManagerPlanner,
       ContextPackage
   )
   ```

2. Initialize and execute workflow:
   ```python
   planner = ContextManagerPlanner()
   result = planner.plan_request(
       run_id="quickstart-test-001",
       tenant_id="test-tenant",
       query="sample context query"
   )
   ```

3. Validate result structure:
   ```python
   assert isinstance(result, ContextPackage)
   assert result.run_id == "quickstart-test-001"
   assert result.id is not None
   assert "retrieve_output" in result.payload
   assert "compress_output" in result.payload
   assert "assemble_output" in result.payload
   ```

**Expected Outcome**: Workflow completes successfully with populated ContextPackage

### Scenario 2: Service Independence Validation

**Objective**: Verify that individual services can be developed and tested independently

**Steps**:
1. Test retriever service in isolation:
   ```python
   from nexus.agent_orchestrator.context_manager.retriever import RetrieverService

   retriever = RetrieverService()
   result = retriever.retrieve("test-run", "tenant", "query")
   assert "retrieve_output" in result
   ```

2. Test compressor service in isolation:
   ```python
   from nexus.agent_orchestrator.context_manager.compressor import CompressorService

   compressor = CompressorService()
   test_data = {"test": "data"}
   result = compressor.compress(test_data, "test-run")
   assert "compress_output" in result
   ```

3. Test assembler service in isolation:
   ```python
   from nexus.agent_orchestrator.context_manager.assembler import AssemblerService

   assembler = AssemblerService()
   test_data = {"compressed": "data"}
   result = assembler.assemble(test_data, "test-run")
   assert "assemble_output" in result
   ```

**Expected Outcome**: Each service can be tested and developed independently

### Scenario 3: Configuration Management

**Objective**: Verify that configuration is properly centralized and accessible

**Steps**:
1. Access default configuration:
   ```python
   from nexus.agent_orchestrator.context_manager.config import get_default_config

   config = get_default_config()
   assert config["required_grounding_score"] == 0.7
   assert config["max_total_tokens"] == 4000
   ```

2. Access specific configuration values:
   ```python
   from nexus.agent_orchestrator.context_manager.config import get_required_grounding_score

   score = get_required_grounding_score()
   assert score == 0.7
   ```

**Expected Outcome**: Configuration values are accessible and match expected defaults

### Scenario 4: Error Handling and Logging

**Objective**: Verify that error handling doesn't break the orchestration workflow

**Steps**:
1. Run workflow with logging capture:
   ```python
   import logging
   from io import StringIO

   log_capture = StringIO()
   handler = logging.StreamHandler(log_capture)
   logger = logging.getLogger("nexus.agent_orchestrator.context_manager")
   logger.addHandler(handler)
   logger.setLevel(logging.INFO)

   planner = ContextManagerPlanner()
   result = planner.plan_request("test-run", "tenant", "query")

   log_output = log_capture.getvalue()
   assert "Starting context request" in log_output
   assert "Context request completed" in log_output
   ```

**Expected Outcome**: Comprehensive logging without workflow interruption

### Scenario 5: Timing Metadata Collection

**Objective**: Verify that timing metadata is properly captured

**Steps**:
1. Execute workflow and check metadata:
   ```python
   planner = ContextManagerPlanner()
   result = planner.plan_request("timing-test", "tenant", "query")

   metadata = result.package_metadata
   assert "started_at" in metadata
   assert "completed_at" in metadata
   assert "duration_ms" in metadata
   assert metadata["duration_ms"] >= 0
   ```

**Expected Outcome**: Timing metadata accurately captured for performance monitoring

## Development Workflow Validation

### Parallel Development Simulation

**Team A - Retriever Development**:
1. Modify `retriever.py` to return custom test data
2. Run unit tests: `pytest tests/unit/agent_orchestrator/context_manager/test_services.py::TestRetrieverService -v`
3. Verify integration: Run Scenario 1 quickstart

**Team B - Compressor Development**:
1. Modify `compressor.py` to implement custom logic
2. Run unit tests: `pytest tests/unit/agent_orchestrator/context_manager/test_services.py::TestCompressorService -v`
3. Verify integration: Run Scenario 1 quickstart

**Team C - Assembler Development**:
1. Modify `assembler.py` to implement assembly logic
2. Run unit tests: `pytest tests/unit/agent_orchestrator/context_manager/test_services.py::TestAssemblerService -v`
3. Verify integration: Run Scenario 1 quickstart

**Integration Validation**:
- All teams can work simultaneously without conflicts
- Changes to individual services don't break orchestration
- Tests provide immediate feedback on integration status

## Success Criteria Validation

### ✅ Parallel Development Enabled
- Teams can modify individual services independently
- Integration testing validates end-to-end workflow
- Service isolation prevents cross-team conflicts

### ✅ Structured Orchestration
- Clear retrieve → compress → assemble workflow
- Consistent data flow through ContextPackage
- Proper error handling and recovery

### ✅ Type Safety and Testing
- Full mypy compliance across all components
- Comprehensive unit test coverage
- Structured logging for debugging

### ✅ Performance Monitoring
- Timing metadata captured automatically
- Correlation IDs enable request tracing
- Configuration provides performance tuning

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure `uv sync` completed successfully
2. **Test Failures**: Run `pytest tests/unit/agent_orchestrator/context_manager/ -v` for detailed output
3. **Logging Issues**: Verify logging configuration and handler setup
4. **Configuration Problems**: Check default values in `config.py`

### Debugging Commands

```bash
# Run all context manager tests
pytest tests/unit/agent_orchestrator/context_manager/ -v

# Run with logging output
pytest tests/unit/agent_orchestrator/context_manager/ -v -s

# Check type compliance
mypy src/nexus/agent_orchestrator/context_manager/

# Code formatting
black src/nexus/agent_orchestrator/context_manager/
```

This quickstart guide validates that the Context Manager MVP scaffolding successfully enables parallel team development while maintaining integration consistency and quality standards.
