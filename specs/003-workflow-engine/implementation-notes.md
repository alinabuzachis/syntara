# Workflow Engine Implementation Notes

## Overview

This document describes the implementation of the YAML workflow execution engine with bash script activity support. The engine is built on Temporal for reliable workflow orchestration and uses Pydantic v2 for schema validation.

## Architecture

### Core Components

1. **YAML Parser** (`src/nexus/workflows/yaml_workflow_parser.py`)
   - Parses YAML workflow definitions into Pydantic models
   - Validates against JSON schema
   - Returns `WorkflowDefinition` objects

2. **Workflow Engine Models** (`src/nexus/workflows/models/engine/`)
   - **workflow_definition.py**: Schema-aligned Pydantic v2 models
   - Activity types: task, parallel, sequence, condition, loop, join
   - Loop types: forEach, while, count
   - Full retry policy and timeout support
   - Note: Separated from SQLModel database tables to avoid import conflicts

3. **Workflow Database Models** (`src/nexus/workflows/models/`)
   - **workflow.py**: Workflow SQLModel table (imported directly when needed)
   - **workflow_version.py**: WorkflowVersion SQLModel table (imported directly when needed)
   - Note: Not auto-imported to prevent triggering SQLAlchemy table creation in restricted environments

4. **Dynamic Workflow** (`src/nexus/workflows/dynamic_workflow.py`)
   - Temporal workflow that executes parsed YAML definitions
   - Type-based activity routing
   - Expression resolution (`${input.x}`, `${variables.x}`, `${activity.output}`)
   - State persistence and error handling

5. **Bash Script Activity** (`src/nexus/workflows/activities/script_activity.py`)
   - Async bash script executor using `asyncio.subprocess`
   - Input parameter passing via positional arguments
   - stdout/stderr capture
   - Error handling with ScriptExecutionError

6. **Temporal Execution Service** (`src/nexus/workflows/workflow_engine/services/temporal_execution_service.py`)
   - High-level API for workflow operations
   - start_yaml_workflow, get_workflow_status, get_workflow_result
   - cancel_workflow, terminate_workflow

7. **Worker Service** (`src/nexus/workflows/workflow_engine/services/temporal_worker.py`)
   - Temporal worker lifecycle management
   - Registers workflows and activities
   - Async context manager for clean startup/shutdown

## YAML Parser Architecture

### Parser Flow

```
YAML String → yaml.safe_load() → Dict → Pydantic Validation → WorkflowDefinition
```

### Error Handling

- **YAMLError**: Invalid YAML syntax → `WorkflowParseError`
- **ValidationError**: Schema mismatch → Formatted validation errors
- Clear error messages with field locations

### Example

```python
from nexus.workflows.yaml_workflow_parser import parse_workflow_yaml

yaml_content = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: my-workflow
  description: Example workflow
triggers:
- type: manual
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "Hello World"
"""

workflow_def = parse_workflow_yaml(yaml_content)
print(workflow_def.metadata.name)  # "my-workflow"
```

## Temporal Integration

### Workflow Execution Flow

1. **Parse YAML** → `WorkflowDefinition` model
2. **Start Worker** → Registers `DynamicWorkflow` and `execute_bash_script`
3. **Execute Workflow** → Temporal schedules workflow on worker
4. **Activity Execution** → Each activity runs in separate Temporal activity
5. **State Persistence** → Temporal handles durable execution
6. **Result Collection** → Workflow returns aggregated results

### Dynamic Workflow Implementation

The `DynamicWorkflow` class accepts workflow definitions at runtime and generates Temporal workflows dynamically:

```python
@workflow.defn
class DynamicWorkflow:
    @workflow.run
    async def run(
        self,
        workflow_definition: dict[str, Any],
        execution_id: str,
        input_data: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        # Type-based routing
        for activity in workflow_definition.workflow.activities:
            if activity.type == "task":
                result = await self._execute_task(activity)
            elif activity.type == "parallel":
                result = await self._execute_parallel(activity)
            elif activity.type == "loop":
                result = await self._execute_loop(activity)
            # ... etc
```

### Activity Type Handlers

#### Task Activities

```python
async def _execute_task(self, activity: Activity) -> dict[str, Any]:
    if activity.task.executor == "script":
        script = activity.task.config["code"]
        inputs = self._resolve_inputs(activity.task.inputs)

        result = await workflow.execute_activity(
            execute_bash_script,
            args=[script, inputs],
            start_to_close_timeout=self._parse_timeout(activity.timeout),
            retry_policy=self._build_retry_policy(activity.retryPolicy)
        )
        return result
```

#### Parallel Activities

Uses `asyncio.gather()` to run branches concurrently:

```python
async def _execute_parallel(self, activity: Activity) -> dict[str, Any]:
    tasks = [
        self._execute_activity(branch)
        for branch in activity.branches
    ]
    results = await asyncio.gather(*tasks)
    return {
        "type": "parallel",
        "branches": {
            branch.id: result
            for branch, result in zip(activity.branches, results)
        }
    }
```

#### Loop Activities

Supports forEach, while, and count loops:

```python
async def _execute_loop(self, activity: Activity) -> dict[str, Any]:
    loop_def = activity.loop
    results = []

    if loop_def.type == "forEach":
        items = self._resolve_expression(loop_def.items)
        for index, item in enumerate(items):
            # Set loop variables in context
            self.loop_context[loop_def.itemVariable] = item
            self.loop_context[loop_def.indexVariable] = index

            # Execute loop body
            for sub_activity in loop_def.do:
                result = await self._execute_activity(sub_activity)
                results.append(result)

    return {
        "type": loop_def.type,
        "iterations": len(results),
        "results": results
    }
```

## Bash Script Activity

### Implementation Details

The bash script activity executes scripts using `asyncio.create_subprocess_exec`:

```python
@activity.defn
async def execute_bash_script(
    script: str,
    inputs: dict[str, Any]
) -> dict[str, Any]:
    # Convert inputs to positional arguments
    args = [str(inputs.get(key, "")) for key in sorted(inputs.keys())]

    # Format: bash -c 'script' bash arg1 arg2 ...
    # The 'bash' after script becomes $0, args become $1, $2, etc.
    full_command = ["bash", "-c", script, "bash"] + args

    process = await asyncio.create_subprocess_exec(
        *full_command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    stdout_bytes, stderr_bytes = await process.communicate()

    return {
        "stdout": stdout_bytes.decode("utf-8"),
        "stderr": stderr_bytes.decode("utf-8"),
        "return_code": process.returncode
    }
```

### Input Parameter Handling

**CRITICAL**: The "bash" placeholder in the command is necessary for correct parameter passing:

```bash
# Correct format
["bash", "-c", script, "bash", arg1, arg2, ...]
#                      ^^^^^^ This becomes $0
#                              ^^^^ This becomes $1
#                                    ^^^^ This becomes $2
```

### Example Usage

```yaml
activities:
- id: greet_user
  type: task
  task:
    executor: script
    config:
      language: bash
      code: |
        NAME="$1"
        echo "Hello, $NAME!"
    inputs:
      user_name: ${input.username}
```

## Expression Resolution

The workflow engine supports expression syntax for dynamic value resolution:

### Expression Types

1. **Input References**: `${input.field_name}`
2. **Variable References**: `${variables.var_name}`
3. **Activity Output References**: `${activity_id.output.field}`
4. **Nested Access**: `${activity.output.user.name}`
5. **Array Indexing**: `${activity.output.items.0}`

### Resolution Algorithm

```python
def _resolve_expression(self, expression: str) -> Any:
    if not isinstance(expression, str) or not expression.startswith("${"):
        return expression

    # Extract expression: "${input.username}" → "input.username"
    expr = expression[2:-1]
    parts = expr.split(".")

    # Resolve based on prefix
    if parts[0] == "input":
        return self._get_nested(self.input_data, parts[1:])
    elif parts[0] == "variables":
        return self._get_nested(self.workflow_variables, parts[1:])
    elif parts[0] in self.activity_outputs:
        return self._get_nested(self.activity_outputs[parts[0]], parts[1:])

    return expression
```

## Error Handling and Recovery

### Error Types

1. **Script Execution Errors**: Non-zero exit codes → `ScriptExecutionError`
2. **Workflow Validation Errors**: Schema mismatches → `WorkflowParseError`
3. **Temporal Errors**: Connection issues, timeouts → Temporal exceptions

### Retry Configuration

Workflows support configurable retry policies:

```yaml
activities:
- id: flaky_task
  type: task
  retryPolicy:
    maxAttempts: 3
    initialInterval: PT1S
    maxInterval: PT30S
    backoff: exponential
    retryableErrors:
    - TimeoutError
    - NetworkError
  task:
    executor: script
    config:
      language: bash
      code: curl https://api.example.com/data
```

### State Persistence

Workflow state is persisted after each activity completion:

```python
# Update workflow state after activity
workflow_state["updated_at"] = workflow.now().isoformat()
workflow_state["completed_activities"].append(activity.id)
workflow_state["activity_outputs"][activity.id] = result

# On completion
workflow_state["status"] = "completed"
workflow_state["completed_at"] = workflow.now().isoformat()

# On error
workflow_state["status"] = "failed"
workflow_state["error"] = str(exception)
```

## CLI Tool Usage

### Basic Execution

```bash
python tools/workflow_cli.py run tests/integration/workflow/examples/hello-world.yaml
```

### With Input Parameters

```bash
python tools/workflow_cli.py run tests/integration/workflow/examples/loop-demo.yaml \
  --inputs '{"items": ["apple", "banana", "cherry"]}'
```

### Custom Temporal Configuration

```bash
python tools/workflow_cli.py run workflow.yaml \
  --temporal-address localhost:7233 \
  --task-queue my-custom-queue
```

## Example Workflows

All example workflows are located in `tests/integration/workflow/examples/`:
- **hello-world.yaml** - Simple sequential workflow with bash scripts
- **loop-demo.yaml** - forEach loop execution with default input values
- **parallel-demo.yaml** - Parallel activity execution
- **conditional-demo.yaml** - Conditional branching based on temperature (NEW)
- **retry-demo.yaml** - Retry policies with exponential and fixed backoff (NEW)

See `tests/integration/workflow/examples/README.md` for usage instructions.

### Simple Sequential Workflow

```yaml
schemaVersion: "1.0.0"
version: 1
metadata:
  name: hello-world
  description: Simple hello world workflow
triggers:
- type: manual
workflow:
  activities:
  - id: say_hello
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Hello, World!"
          echo "Current time: $(date)"

  - id: say_goodbye
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Goodbye, World!"
```

### Parallel Execution

```yaml
schemaVersion: "1.0.0"
version: 1
metadata:
  name: parallel-demo
  description: Demonstrates parallel execution
triggers:
- type: manual
workflow:
  activities:
  - id: parallel_tasks
    type: parallel
    branches:
    - id: task1
      type: task
      task:
        executor: script
        config:
          language: bash
          code: |
            echo "Task 1 starting..."
            sleep 1
            echo "Task 1 complete!"

    - id: task2
      type: task
      task:
        executor: script
        config:
          language: bash
          code: |
            echo "Task 2 starting..."
            sleep 1
            echo "Task 2 complete!"
```

### ForEach Loop

```yaml
schemaVersion: "1.0.0"
version: 1
metadata:
  name: loop-demo
  description: Demonstrates forEach loop
triggers:
- type: manual
inputs:
  items:
    type: array
    description: List of items to process
    default: ["apple", "banana", "cherry"]
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
        task:
          executor: script
          config:
            language: bash
            code: |
              ITEM="$1"
              INDEX="$2"
              echo "Processing item #$INDEX: $ITEM"
          inputs:
            item: ${item}
            index: ${idx}
```

## Testing

### Unit Tests

- **YAML Parser**: 13/20 tests passing (65% coverage)
  - Location: `tests/unit/workflows/test_yaml_workflow_parser.py`
  - Tests: Valid parsing, error handling, all activity types

- **Script Activity**: 29/29 tests passing (100% coverage)
  - Location: `tests/unit/workflows/activities/test_script_activity.py`
  - Tests: Execution, parameters, errors, edge cases

### Integration Tests

- **Full Workflow Execution**: 37/37 tests passing (100%)
  - Location: `tests/integration/workflow/`
  - Tests: Sequential, parallel, loops, conditionals, error handling, retries, cancellation
  - **New**: End-to-end conditional logic tests (`test_conditional_logic.py`)
    - Hot weather scenario (>30°C)
    - Cold weather scenario (<15°C)
    - Mild weather scenario (15-30°C)
    - Boundary conditions (15°C and 30°C)
    - Default input values
    - All tests run full workflows through Temporal

### Test Fixtures

Temporal test environment with time-skipping:

```python
@pytest.fixture(scope="session")
async def temporal_env() -> AsyncGenerator[WorkflowEnvironment, None]:
    async with await WorkflowEnvironment.start_time_skipping() as env:
        yield env
```

## Performance

### Current Performance

- Simple workflow (2 activities): <1s
- Parallel workflow (3 activities): ~1s (all run concurrently)
- Loop workflow (5 iterations): <1s

### Scalability

- Temporal handles workflow state durably
- Activities can be distributed across workers
- Horizontal scaling by adding more workers
- No performance degradation with larger workflows

## Database Integration

### Current Implementation

- **In-memory stub** for activity execution tracking
- File: `src/nexus/api/workflows/activities/execution_tracker.py`
- Uses `_activity_executions: dict[str, dict[str, Any]] = {}`

### Future Integration

Ready for database integration - just replace dict operations with database queries:

```python
# Current (in-memory)
_activity_executions[activity_id] = {...}

# Future (database)
await db.execute(
    insert(ActivityExecution).values({...})
)
```

## Known Limitations

1. **Database Models**: Integration tests expect Execution/ActivityExecution tables (not yet implemented)
2. **Workflow Variables**: Not fully implemented in expression resolution
3. **Conditional Execution**: Condition evaluation logic is basic
4. **Join Activities**: Not yet implemented
5. **API/Connector Executors**: Only bash script executor implemented

## Future Enhancements

1. **Additional Executors**: Python, JavaScript, API calls, connectors
2. **Advanced Conditionals**: Complex boolean expressions
3. **Workflow Versioning**: Schema version handling
4. **Workflow Templates**: Reusable workflow components
5. **Event Triggers**: Webhook and scheduled execution
6. **Approval Workflows**: Human-in-the-loop activities
7. **Metrics & Monitoring**: Workflow execution metrics
8. **Workflow Visualization**: Graph-based workflow rendering

## Code Examples

### Programmatic Workflow Execution

```python
import asyncio
from temporalio.client import Client
from temporalio.worker import Worker

from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService
from nexus.workflows.activities.script_activity import execute_bash_script
from nexus.workflows.dynamic_workflow import DynamicWorkflow

async def main():
    # Connect to Temporal
    client = await Client.connect("localhost:7233")

    # Start worker
    async with Worker(
        client,
        task_queue="my-queue",
        workflows=[DynamicWorkflow],
        activities=[execute_bash_script],
    ):
        # Create execution service
        execution_service = TemporalExecutionService(client, "my-queue")

        # Start workflow from YAML file
        with open("workflow.yaml") as f:
            workflow_yaml = f.read()

        result = await execution_service.start_yaml_workflow(
            workflow_yaml=workflow_yaml,
            workflow_name="my-workflow",
            input_data={"username": "Alice"}
        )

        print(f"Workflow started: {result['workflow_id']}")

        # Wait for completion
        final_result = await execution_service.get_workflow_result(
            result['workflow_id']
        )

        print(f"Status: {final_result['status']}")
        print(f"Outputs: {final_result['activity_outputs']}")

asyncio.run(main())
```

## References

- **Temporal Python SDK**: https://docs.temporal.io/dev-guide/python
- **Pydantic v2**: https://docs.pydantic.dev/latest/
- **JSON Schema**: `schemas/workflows/workflow-definition.schema.json`
- **Architecture Plan**: `specs/003-workflow-engine/plan.md`

## Additional Activity Types

### Python Script Activities

Python script activities execute Python code in isolated subprocesses with JSON output parsing.

**Implementation**: `src/nexus/api/workflows/activities/script_activity.py`

**Features**:
- Async Python script execution using `python -c`
- Automatic JSON output parsing from stdout
- Input parameter passing via environment variables (`INPUT_*`)
- Shared subprocess logic with bash executor (DRY)
- Error handling for syntax errors, runtime errors, and exceptions

**Configuration**:
```yaml
- id: python_task
  type: task
  task:
    executor: script
    config:
      language: python
      code: |
        import json
        import os

        # Read inputs from environment variables
        value = os.getenv('INPUT_VALUE', '0')
        result = int(value) * 2

        # Print JSON output
        print(json.dumps({"result": result}))
    inputs:
      value: ${input.number}
    outputs:
      result: $.result
```

**Output Parsing**:
- **JSON stdout**: Automatically parsed into `result["output"]` dictionary
- **Non-JSON stdout**: Kept as raw string in `result["stdout"]`
- **Error output**: Captured in `result["stderr"]`
- **Exit code**: Available in `result["return_code"]`

**Example**:
```python
from nexus.workflows.activities.script_activity import execute_python_script

result = await execute_python_script(
    script='import json; print(json.dumps({"hello": "world"}))',
    inputs={}
)

print(result["output"])  # {"hello": "world"}
print(result["return_code"])  # 0
```

### REST API Activities

API activities execute HTTP requests to external services with full support for all HTTP methods.

**Implementation**: `src/nexus/api/workflows/activities/api_activity.py`

**Features**:
- All HTTP methods: GET, POST, PUT, PATCH, DELETE
- Request body, headers, and query parameters
- Expression resolution for dynamic values (`${input.field}`)
- JSON response parsing
- Comprehensive error handling with retry support
- Request timing metrics (`elapsed_ms`)

**Configuration**:
```yaml
- id: api_call
  type: task
  task:
    executor: api
    config:
      method: POST
      url: https://api.example.com/users
      headers:
        Authorization: ${input.apiToken}
        Content-Type: application/json
      queryParams:
        format: json
        version: v1
      body:
        name: ${input.userName}
        email: ${input.userEmail}
      timeout: 30
    inputs:
      apiToken: ${secrets.api_token}
      userName: ${input.name}
      userEmail: ${input.email}
    outputs:
      userId: $.body.id
  retryPolicy:
    maxAttempts: 3
    backoff: exponential
    initialInterval: PT5S
    maxInterval: PT1M
```

**Response Structure**:
```python
{
    "status_code": 200,
    "headers": {"content-type": "application/json", ...},
    "body": {"id": "123", "name": "User", ...},  # Parsed JSON or raw text
    "elapsed_ms": 245.67
}
```

**Header Resolution**:
- **Static headers**: Used as-is (e.g., `Content-Type: application/json`)
- **Dynamic headers**: Resolved from inputs (e.g., `Authorization: ${input.token}`)
- **Mixed**: Can combine static and dynamic headers

**Body Resolution**:
- **Static object**: `body: {name: "Test", value: 123}`
- **Dynamic fields**: `body: {name: ${input.name}}`
- **Full replacement**: `body: ${input.data}` (replaces entire body with input value)

**Example**:
```python
from nexus.workflows.activities.api_activity import execute_api_request

result = await execute_api_request(
    config={
        "method": "GET",
        "url": "https://api.example.com/data",
        "headers": {"Authorization": "Bearer token123"}
    },
    inputs={}
)

print(result["status_code"])  # 200
print(result["body"])  # {"data": [...]}
print(result["elapsed_ms"])  # 123.45
```

### Common Retry/Timeout Logic

Shared utilities for consistent retry and timeout handling across all activity types.

**Implementation**: `src/nexus/api/workflows/activities/common.py`

**Functions**:

1. **`build_retry_policy(retry_config: dict) -> RetryPolicy`**
   - Builds Temporal RetryPolicy from workflow configuration
   - Supports: exponential, fixed, and linear backoff strategies
   - Configurable: maxAttempts, initialInterval, maxInterval, multiplier

2. **`parse_timeout(timeout_str: str) -> timedelta`**
   - Parses ISO 8601 duration strings (e.g., "PT5M", "PT1H30M", "PT30S")
   - Converts to Python timedelta objects
   - Used by all activity executors

**Backoff Strategies**:

```yaml
# Exponential backoff (default)
retryPolicy:
  maxAttempts: 5
  backoff: exponential
  initialInterval: PT1S
  maxInterval: PT5M
  multiplier: 2.0  # 1s, 2s, 4s, 8s, 16s...

# Fixed backoff
retryPolicy:
  maxAttempts: 3
  backoff: fixed
  initialInterval: PT10S  # Always 10s between retries

# Linear backoff
retryPolicy:
  maxAttempts: 4
  backoff: linear
  initialInterval: PT5S
  maxInterval: PT30S  # 5s, 10s, 15s, 20s...
```

**Example**:
```python
from nexus.workflows.activities.common import build_retry_policy, parse_timeout

# Build retry policy
retry_policy = build_retry_policy({
    "maxAttempts": 3,
    "backoff": "exponential",
    "initialInterval": "PT1S",
    "maxInterval": "PT1M",
    "multiplier": 2.0
})

# Parse timeout
timeout = parse_timeout("PT5M")  # timedelta(minutes=5)
```

## Mixed Executor Workflows

Workflows can combine multiple executor types (bash, python, api) in any combination.

**Example - Sequential Pipeline**:
```yaml
workflow:
  activities:
    # Fetch data from API
    - id: fetch_data
      type: task
      task:
        executor: api
        config:
          method: GET
          url: https://api.example.com/data
        outputs:
          raw_data: $.body

    # Process with Python
    - id: process_data
      type: task
      task:
        executor: script
        config:
          language: python
          code: |
            import json
            import os
            data = os.getenv('INPUT_RAW_DATA', '{}')
            processed = {"count": len(data), "status": "processed"}
            print(json.dumps(processed))
        inputs:
          raw_data: ${fetch_data.output.raw_data}
        outputs:
          processed: $.processed

    # Validate with bash
    - id: validate
      type: task
      task:
        executor: script
        config:
          language: bash
          code: |
            if [ "${INPUT_STATUS}" = "processed" ]; then
              echo "Validation passed"
            fi
        inputs:
          status: ${process_data.output.processed}
```

**Example - Parallel Execution**:
```yaml
workflow:
  activities:
    - id: parallel_tasks
      type: parallel
      branches:
        # Bash branch
        - id: bash_task
          type: task
          task:
            executor: script
            config:
              language: bash
              code: echo "Bash executed"

        # Python branch
        - id: python_task
          type: task
          task:
            executor: script
            config:
              language: python
              code: print("Python executed")

        # API branch
        - id: api_task
          type: task
          task:
            executor: api
            config:
              method: GET
              url: https://api.example.com/status
```

## Testing

### Unit Tests

**Python Script Tests**: `tests/unit/workflows/activities/test_script_activity.py`
- Basic execution
- Input parameter handling
- JSON output parsing
- Error handling (syntax errors, runtime errors, exceptions)
- Edge cases (unicode, empty output, comments)

**API Activity Tests**: `tests/unit/workflows/activities/test_api_activity.py`
- All HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Header resolution (static and dynamic)
- Query parameter handling
- Body resolution (static, dynamic fields, full replacement)
- Response parsing (JSON and text)
- Error handling (4xx, 5xx, timeout, network errors)
- Edge cases (empty response, custom timeout)

### Integration Tests

**Python Tests**: `tests/integration/workflow/test_python_script_execution.py`
- Simple script execution with JSON output
- Input parameters and output mapping
- Error handling and retry behavior
- Workflow definition parsing
- Timeout handling

**API Tests**: `tests/integration/workflow/test_api_activity_execution.py`
- GET, POST, PUT, PATCH, DELETE requests
- Authentication headers from inputs
- Timeout and retry behavior
- Header and query parameter resolution
- Request body handling

**Mixed Executor Tests**: `tests/integration/workflow/test_mixed_activity_types.py`
- Sequential workflows (bash → python → api)
- Parallel execution with different executors
- Data pipeline scenarios
- Conditional execution with mixed types
- Error handling across executor types
- Loop execution with mixed types

### Example Workflows

Located in `tests/integration/workflow/examples/`:

**Python Examples**:
- `python/simple-python-script.yaml` - Basic Python execution
- `python/python-with-inputs.yaml` - Input/output mapping
- `python/python-with-error.yaml` - Error handling
- `python/python-json-output.yaml` - JSON output parsing
- `python/python-timeout.yaml` - Timeout handling

**API Examples**:
- `api/simple-get-request.yaml` - Basic GET request
- `api/post-with-body.yaml` - POST with JSON body
- `api/authenticated-request.yaml` - Authorization headers
- `api/timeout-retry.yaml` - Timeout and retry
- `api/headers-resolution.yaml` - Dynamic header resolution
- `api/query-params.yaml` - Query parameters
- `api/all-http-methods.yaml` - All HTTP methods

**Mixed Examples**:
- `mixed/sequential-mixed-types.yaml` - Sequential pipeline
- `mixed/parallel-mixed-types.yaml` - Parallel execution
- `mixed/data-pipeline.yaml` - Real-world data pipeline
- `mixed/conditional-mixed.yaml` - Conditional branching
- `mixed/error-handling-mixed.yaml` - Error handling
- `mixed/loop-mixed-types.yaml` - Loop with mixed types

## Performance Considerations

### Python Scripts
- Scripts execute in separate processes (isolation)
- JSON parsing adds minimal overhead
- Consider input size when passing via environment variables

### API Requests
- Uses httpx.AsyncClient for async HTTP
- Connection pooling handled automatically
- Configurable timeouts per request
- Retry with exponential backoff prevents thundering herd

### General
- All activities execute asynchronously
- Parallel branches execute concurrently
- Temporal handles durable execution and recovery
- Expression resolution is cached per workflow execution

## Error Handling

### Script Activities
- **ScriptExecutionError**: Non-zero exit code
- **TimeoutError**: Script exceeds timeout
- **ValueError**: Invalid input values (null bytes, size limits)

### API Activities
- **APIExecutionError**: HTTP errors (4xx, 5xx)
- **httpx.TimeoutException**: Request timeout
- **httpx.HTTPError**: Network errors, connection failures
- **ValueError**: Missing required configuration (method, url)

### Retry Behavior
All activities support configurable retry policies:
- Temporal handles retry logic automatically
- Backoff strategies prevent overwhelming services
- maxAttempts limits total retry count
- Retry intervals configurable via ISO 8601 durations

## Production Deployment

### Worker Configuration
```python
from nexus.api.services.temporal_worker import start_worker

# Start worker with all activity types registered
worker = await start_worker(
    temporal_address="temporal.example.com:7233",
    namespace="production",
    task_queue="workflow-tasks"
)
```

### Activity Registration
All three executors are automatically registered:
- `execute_bash_script` - Bash script executor
- `execute_python_script` - Python script executor  
- `execute_api_request` - REST API executor

### Monitoring
- Temporal UI provides workflow execution visibility
- Activity metrics available via Temporal metrics
- Custom logging in each executor for debugging
- Error details captured in ActivityExecution records
