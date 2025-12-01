# Quick Start: Creating a New Activity Type

**Feature**: Temporal Activity Architecture Guidelines
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Data Model**: [data-model.md](./data-model.md)

## Overview

This guide walks through creating a new activity type from scratch, following all the architectural patterns documented in this spec. We'll create a simple **Echo Executor** that demonstrates all required components.

**Learning Objectives**:
- Understand the complete flow of adding a new activity type
- Apply all 13 functional requirements from the spec
- Validate integration with the workflow engine

## Example: Echo Executor

**Purpose**: An executor that echoes back input with optional transformations (uppercase, lowercase, reverse)

**Why This Example**:
- Simple enough to focus on the pattern, not business logic
- Demonstrates all required components
- Easy to test and validate

---

## Step 1: Define the Executor Configuration

**Location**: `src/nexus/workflows/workflow_engine/models/workflow_definition.py`

**Pattern**: Create a Pydantic model following existing ExecutorConfig patterns

```python
class EchoExecutorConfig(BaseModel):
    """Configuration for echo executor.

    Attributes:
        message: The message to echo back
        transform: Optional transformation (uppercase, lowercase, reverse)
        repeat: Number of times to repeat the message (default: 1)
        delay_seconds: Optional delay before echoing (for testing async behavior)
    """

    message: str = Field(min_length=1, description="Message to echo")
    transform: Literal["uppercase", "lowercase", "reverse", "none"] = Field(
        default="none",
        description="Transformation to apply to the message"
    )
    repeat: int = Field(
        default=1,
        ge=1,
        le=10,
        description="Number of times to repeat the message"
    )
    delay_seconds: float = Field(
        default=0.0,
        ge=0.0,
        le=60.0,
        description="Delay in seconds before echoing (max 60s)"
    )
```

**Key Points**:
- ✓ Inherits from `BaseModel` (Pydantic)
- ✓ All fields have type hints and descriptions
- ✓ Validation constraints using Field parameters
- ✓ Sensible defaults for optional fields
- ✓ Docstring documenting the configuration

---

## Step 2: Add Executor Type Enum Value

**Location**: `src/nexus/workflows/workflow_engine/models/workflow_definition.py`

**Pattern**: Add new value to ExecutorType enum

```python
class ExecutorType(str, Enum):
    """Supported executor types for tasks."""

    SCRIPT = "script"
    API = "api"
    AGENTIC = "agentic"
    ECHO = "echo"  # ← Add new executor type
```

**Key Points**:
- ✓ Lowercase string value
- ✓ Matches the discriminator in JSON schema
- ✓ Will be used for routing in dynamic workflow

---

## Step 3: Update ExecutorConfig Union Type

**Location**: `src/nexus/workflows/workflow_engine/models/workflow_definition.py`

**Pattern**: Add configuration to the union type

```python
# Union type for executor configs (strict - only typed configs allowed)
ExecutorConfig = (
    ScriptExecutorConfig |
    APIExecutorConfig |
    AgenticExecutorConfig |
    EchoExecutorConfig  # ← Add new config to union
)
```

**Key Points**:
- ✓ Maintains type safety across all executor configurations
- ✓ Enables discriminated union pattern
- ✓ Used by Pydantic for validation

---

## Step 4: Create the Activity Function

**Location**: `src/nexus/workflows/workflow_engine/activities/echo_activity.py` (new file)

**Pattern**: Create activity module following existing patterns

```python
"""Echo activity executor for workflow integration.

This module provides functionality to execute echo activities within workflows,
demonstrating the activity pattern with simple transformations.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from pydantic import ValidationError
from temporalio import activity

from nexus.workflows.workflow_engine.expression_resolver import ExpressionResolver
from nexus.workflows.workflow_engine.models import EchoExecutorConfig

logger = logging.getLogger(__name__)


# ============================================================================
# Exceptions
# ============================================================================


class EchoActivityError(Exception):
    """Base exception for echo activity errors."""


# ============================================================================
# Configuration and Validation
# ============================================================================


def _extract_config(activity_config: dict[str, Any]) -> EchoExecutorConfig:
    """Extract and validate required configuration from activity config.

    Args:
        activity_config: Activity configuration from workflow YAML

    Returns:
        Validated EchoExecutorConfig

    Raises:
        EchoActivityError: If config is invalid or message is missing
    """
    config_dict = activity_config.get("config", {})

    try:
        # Parse and validate using Pydantic model
        config = EchoExecutorConfig(**config_dict)
    except ValidationError as e:
        msg = f"Invalid echo activity configuration: {e}"
        raise EchoActivityError(msg) from e

    return config


def _apply_transformation(message: str, transform: str) -> str:
    """Apply transformation to message.

    Args:
        message: Input message
        transform: Transformation type

    Returns:
        Transformed message
    """
    if transform == "uppercase":
        return message.upper()
    elif transform == "lowercase":
        return message.lower()
    elif transform == "reverse":
        return message[::-1]
    else:  # "none"
        return message


# ============================================================================
# Temporal Activity
# ============================================================================


@activity.defn
async def execute_echo_activity(
    activity_config: dict[str, Any],
    input_data: dict[str, Any],
) -> dict[str, Any]:
    """Execute echo activity with optional transformations.

    This is a Temporal activity that can also be called directly for testing.

    Args:
        activity_config: Activity configuration from workflow YAML containing:
            - config.message: Message to echo (required, supports expressions)
            - config.transform: Transformation type (optional)
            - config.repeat: Number of repetitions (optional, default 1)
            - config.delay_seconds: Delay before echoing (optional, default 0)
        input_data: Runtime input parameters for the activity

    Returns:
        Dictionary containing:
            - echo: The transformed message (repeated if configured)
            - original_message: The original message before transformation
            - transform_applied: The transformation that was applied
            - repetitions: Number of times message was repeated

    Raises:
        EchoActivityError: If configuration is invalid or execution fails
    """
    logger.info("Starting echo activity")

    # Extract and validate configuration
    config = _extract_config(activity_config)

    # Resolve message template using ExpressionResolver
    # The resolver expects workflow_state with "inputs" key
    workflow_state = {"inputs": input_data}
    resolver = ExpressionResolver(workflow_definition=None)
    resolved_message = str(resolver.resolve_expression(config.message, workflow_state))

    logger.info(
        "Echoing message with transform=%s, repeat=%d, delay=%.1fs",
        config.transform,
        config.repeat,
        config.delay_seconds,
    )

    # Apply optional delay (for testing async behavior)
    if config.delay_seconds > 0:
        await asyncio.sleep(config.delay_seconds)

    # Apply transformation
    transformed_message = _apply_transformation(resolved_message, config.transform)

    # Apply repetition
    if config.repeat > 1:
        final_message = " ".join([transformed_message] * config.repeat)
    else:
        final_message = transformed_message

    # Build result
    result = {
        "echo": final_message,
        "original_message": resolved_message,
        "transform_applied": config.transform,
        "repetitions": config.repeat,
    }

    logger.info("Echo activity completed: %s", result["echo"][:100])
    return result
```

**Key Points**:
- ✓ `@activity.defn` decorator
- ✓ Follows naming convention: `execute_<type>_activity`
- ✓ Standard parameters: `activity_config`, `input_data`
- ✓ Returns `dict[str, Any]`
- ✓ Custom exception class inheriting from base Exception
- ✓ Configuration extraction and validation
- ✓ Expression resolution for dynamic values
- ✓ Structured logging
- ✓ Docstring with full documentation
- ✓ Resource cleanup (N/A for echo, but see pattern below for DB/API activities)

**Resource Cleanup Pattern** (for activities that open connections):

```python
@activity.defn
async def execute_my_activity(
    activity_config: dict[str, Any],
    input_data: dict[str, Any],
) -> dict[str, Any]:
    """Activity with resource cleanup."""

    config = _extract_config(activity_config)

    # Initialize resources (DB connection, HTTP client, etc.)
    client = None
    try:
        client = await create_client(config)

        # Perform work
        result = await client.do_work()

        return {"status": "success", "result": result}

    finally:
        # Always cleanup resources, even if exception occurs
        if client:
            await client.close()
            logger.info("Client connection closed")
```

---

## Step 5: Register Activity with Temporal Worker

**Location**: `src/nexus/workflows/workflow_engine/services/temporal_worker.py`

**Pattern**: Add activity to the worker's activity list

```python
# Import the new activity
from ..activities.echo_activity import execute_echo_activity

# ... later in the file ...

worker = Worker(
    client,
    task_queue=TASK_QUEUE,
    workflows=[DynamicWorkflow],
    activities=[
        execute_bash_script,
        execute_python_script,
        execute_api_request,
        execute_agentic_activity,
        execute_echo_activity,  # ← Add new activity
    ],
)
```

**Key Points**:
- ✓ Import the activity function
- ✓ Add to activities list
- ✓ Worker will register with Temporal
- ✓ Activity becomes available for workflow execution

---

## Step 6: Add Dynamic Workflow Routing

**Location**: `src/nexus/workflows/workflow_engine/dynamic_workflow.py`

**Pattern**: Add routing case for new executor type

```python
# Import the new activity
from .activities.echo_activity import execute_echo_activity

# Import the new config
from .models import EchoExecutorConfig

# ... later in execute_task method ...

elif task.executor == ExecutorType.ECHO:
    # Extract echo configuration
    config = EchoExecutorConfig(**task.config.model_dump())

    logger.info(
        f"Executing echo activity: {activity.id}",
        extra={"activity_id": activity.id, "transform": config.transform},
    )

    result = await workflow.execute_activity(
        execute_echo_activity,
        args=[activity.task.model_dump(), task_inputs],
        activity_id=activity.id,
        start_to_close_timeout=activity_timeout,
        retry_policy=build_retry_policy(
            activity.retry_policy.model_dump(by_alias=True) if activity.retry_policy else None
        ),
    )
```

**Key Points**:
- ✓ Import activity and config
- ✓ Add elif case for new executor type
- ✓ Extract and validate configuration
- ✓ Log activity execution
- ✓ Use `workflow.execute_activity()` with proper parameters
- ✓ Apply timeout from activity configuration
- ✓ Apply retry policy if configured

---

## Step 7: Update JSON Schema

**Location**: `schemas/workflows/workflow-definition.schema.json`

**Pattern**: Add discriminator mapping for new executor type

```json
{
  "definitions": {
    "echoExecutorConfig": {
      "type": "object",
      "required": ["message"],
      "properties": {
        "message": {
          "type": "string",
          "minLength": 1,
          "description": "Message to echo"
        },
        "transform": {
          "type": "string",
          "enum": ["uppercase", "lowercase", "reverse", "none"],
          "default": "none",
          "description": "Transformation to apply"
        },
        "repeat": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10,
          "default": 1,
          "description": "Number of repetitions"
        },
        "delay_seconds": {
          "type": "number",
          "minimum": 0,
          "maximum": 60,
          "default": 0,
          "description": "Delay in seconds before echoing"
        }
      },
      "additionalProperties": false
    }
  },
  "taskDefinition": {
    "properties": {
      "executor": {
        "enum": ["script", "api", "agentic", "echo"]
      },
      "config": {
        "oneOf": [
          {"$ref": "#/definitions/scriptExecutorConfig"},
          {"$ref": "#/definitions/apiExecutorConfig"},
          {"$ref": "#/definitions/agenticExecutorConfig"},
          {"$ref": "#/definitions/echoExecutorConfig"}
        ],
        "discriminator": {
          "propertyName": "../executor",
          "mapping": {
            "script": "#/definitions/scriptExecutorConfig",
            "api": "#/definitions/apiExecutorConfig",
            "agentic": "#/definitions/agenticExecutorConfig",
            "echo": "#/definitions/echoExecutorConfig"
          }
        }
      }
    }
  }
}
```

**Key Points**:
- ✓ Define schema matching Pydantic model
- ✓ Add to executor enum
- ✓ Add to config oneOf array
- ✓ Add discriminator mapping
- ✓ Use snake_case for property names

---

## Step 8: Create Tests

**Location**: `tests/unit/workflows/workflow_engine/activities/test_echo_activity.py`

**Pattern**: Create comprehensive unit tests

```python
"""Unit tests for echo activity."""

import pytest
from pydantic import ValidationError

from nexus.workflows.workflow_engine.activities.echo_activity import (
    EchoActivityError,
    execute_echo_activity,
)


class TestEchoActivity:
    """Test suite for echo activity."""

    async def test_basic_echo(self):
        """Test basic echo without transformation."""
        activity_config = {
            "config": {
                "message": "Hello World"
            }
        }
        input_data = {}

        result = await execute_echo_activity(activity_config, input_data)

        assert result["echo"] == "Hello World"
        assert result["original_message"] == "Hello World"
        assert result["transform_applied"] == "none"
        assert result["repetitions"] == 1

    async def test_uppercase_transformation(self):
        """Test uppercase transformation."""
        activity_config = {
            "config": {
                "message": "hello world",
                "transform": "uppercase"
            }
        }
        input_data = {}

        result = await execute_echo_activity(activity_config, input_data)

        assert result["echo"] == "HELLO WORLD"
        assert result["original_message"] == "hello world"
        assert result["transform_applied"] == "uppercase"

    async def test_lowercase_transformation(self):
        """Test lowercase transformation."""
        activity_config = {
            "config": {
                "message": "HELLO WORLD",
                "transform": "lowercase"
            }
        }
        input_data = {}

        result = await execute_echo_activity(activity_config, input_data)

        assert result["echo"] == "hello world"

    async def test_reverse_transformation(self):
        """Test reverse transformation."""
        activity_config = {
            "config": {
                "message": "hello",
                "transform": "reverse"
            }
        }
        input_data = {}

        result = await execute_echo_activity(activity_config, input_data)

        assert result["echo"] == "olleh"

    async def test_repetition(self):
        """Test message repetition."""
        activity_config = {
            "config": {
                "message": "echo",
                "repeat": 3
            }
        }
        input_data = {}

        result = await execute_echo_activity(activity_config, input_data)

        assert result["echo"] == "echo echo echo"
        assert result["repetitions"] == 3

    async def test_expression_resolution(self):
        """Test expression resolution in message."""
        activity_config = {
            "config": {
                "message": "${input.user_message}"
            }
        }
        input_data = {"user_message": "Dynamic Message"}

        result = await execute_echo_activity(activity_config, input_data)

        assert result["echo"] == "Dynamic Message"
        assert result["original_message"] == "Dynamic Message"

    async def test_invalid_config_missing_message(self):
        """Test error handling for missing required field."""
        activity_config = {
            "config": {}  # Missing required 'message'
        }
        input_data = {}

        with pytest.raises(EchoActivityError, match="Invalid echo activity configuration"):
            await execute_echo_activity(activity_config, input_data)

    async def test_invalid_transform_value(self):
        """Test validation error for invalid transform value."""
        activity_config = {
            "config": {
                "message": "test",
                "transform": "invalid"  # Not in allowed values
            }
        }
        input_data = {}

        with pytest.raises(EchoActivityError, match="Invalid echo activity configuration"):
            await execute_echo_activity(activity_config, input_data)

    async def test_delay_execution(self):
        """Test delay functionality."""
        import time

        activity_config = {
            "config": {
                "message": "delayed",
                "delay_seconds": 0.1
            }
        }
        input_data = {}

        start_time = time.time()
        result = await execute_echo_activity(activity_config, input_data)
        elapsed_time = time.time() - start_time

        assert result["echo"] == "delayed"
        assert elapsed_time >= 0.1  # Should have delayed at least 0.1 seconds
```

**Key Points**:
- ✓ Test basic functionality
- ✓ Test all configuration options
- ✓ Test expression resolution
- ✓ Test error cases (validation failures)
- ✓ Test edge cases
- ✓ Follow existing test patterns

---

## Step 9: Create Workflow Definition Example

**Location**: `examples/workflows/echo-example.yaml`

**Pattern**: Create example workflow using the new executor

```yaml
schemaVersion: "1.0.0"
version: 1
metadata:
  name: echo-workflow-example
  description: Example workflow demonstrating the echo executor
  tags: [example, echo]
  owner: platform-team

triggers:
  - type: manual

inputs:
  user_input:
    type: string
    description: Message to echo
    required: true
    default: "Hello from Nexus"

workflow:
  activities:
    - id: echo_uppercase
      name: "Echo message in uppercase"
      type: task
      task:
        executor: echo
        config:
          message: "${input.user_input}"
          transform: uppercase
          repeat: 1
        outputs:
          uppercase_result: "$.echo"

    - id: echo_lowercase
      name: "Echo message in lowercase"
      type: task
      task:
        executor: echo
        config:
          message: "${input.user_input}"
          transform: lowercase
          repeat: 2
        outputs:
          lowercase_result: "$.echo"

    - id: echo_reverse
      name: "Echo reversed uppercase result"
      type: task
      task:
        executor: echo
        config:
          message: "${activity_outputs.echo_uppercase.uppercase_result}"
          transform: reverse
        outputs:
          reversed_result: "$.echo"
```

**Key Points**:
- ✓ Valid workflow definition
- ✓ Uses echo executor
- ✓ Demonstrates expression resolution
- ✓ Shows multiple activities with different configurations
- ✓ Output mapping between activities

---

## Step 10: Validation Checklist

Verify that your new activity type meets all requirements from [spec.md](./spec.md):

### Functional Requirements Validation

- [ ] **FR-001**: Activity function uses `@activity.defn` decorator ✓
- [ ] **FR-002**: Activity registered in Temporal worker alongside existing activities ✓
- [ ] **FR-003**: Activity invoked through dynamic workflow system ✓
- [ ] **FR-004**: Configuration validated using Pydantic model ✓
- [ ] **FR-005**: Executor type added to enum, config handling in dynamic workflow ✓
- [ ] **FR-006**: Custom exception inherits from base Exception class ✓
- [ ] **FR-007**: Activity can use timeout and retry policy mechanisms ✓
- [ ] **FR-008**: Expression resolution supported for input values ✓
- [ ] **FR-009**: Activity integrates with workflow state management ✓
- [ ] **FR-010**: Proper resource cleanup (if applicable) ✓
- [ ] **FR-011**: Executor type registered in JSON schema with discriminator ✓
- [ ] **FR-012**: Task definition includes all required schema elements ✓
- [ ] **FR-013**: JSON schema has oneOf discriminator pattern ✓
- [ ] **FR-014**: Comprehensive test coverage (unit + integration tests) ✓

### Test Coverage

- [ ] Unit tests for activity function
- [ ] Unit tests for configuration validation
- [ ] Unit tests for error handling
- [ ] Integration test with workflow execution
- [ ] Example workflow definition

### Documentation

- [ ] Activity module has docstrings
- [ ] Configuration class documented
- [ ] Example workflow created
- [ ] Error messages are clear and actionable

---

## Running the Example

### 1. Start Temporal Server

```bash
make temporal-dev
```

### 2. Run the Worker

```bash
uv run python -m nexus.workflows.workflow_engine.services.temporal_worker
```

### 3. Execute Example Workflow

```bash
# Via API (assuming Nexus API is running)
curl -X POST http://localhost:8000/api/v1/workflows/executions \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_definition": "@examples/workflows/echo-example.yaml",
    "inputs": {
      "user_input": "Test Message"
    }
  }'
```

### 4. Verify Results

Check the execution results to see:
- `echo_uppercase.uppercase_result`: "TEST MESSAGE"
- `echo_lowercase.lowercase_result`: "test message test message"
- `echo_reverse.reversed_result`: "EGASSEM TSET"

---

## Common Pitfalls

### 1. Forgetting to Update All Required Locations

**Symptom**: Activity not found or configuration validation fails

**Solution**: Ensure you updated all 7 locations:
1. Executor configuration model
2. Executor type enum
3. ExecutorConfig union type
4. Activity function module
5. Temporal worker registration
6. Dynamic workflow routing
7. JSON schema

### 2. Incorrect Discriminator Mapping

**Symptom**: Workflow validation fails with schema errors

**Solution**: Ensure discriminator mapping in JSON schema matches executor type enum value exactly (case-sensitive)

### 3. Missing Expression Resolution

**Symptom**: Literal "${...}" strings in results instead of resolved values

**Solution**: Use ExpressionResolver to resolve configuration values that support expressions

### 4. Improper Error Handling

**Symptom**: Generic exceptions with unhelpful messages

**Solution**: Create specific exception class and provide clear, actionable error messages

### 5. Skipping Unit Tests

**Symptom**: Integration failures that are hard to debug

**Solution**: Write unit tests first (TDD approach), test all configuration options and error cases

---

## Next Steps

Now that you understand the complete pattern:

1. **Review Existing Implementations**: Study script_activity.py, api_activity.py, agentic_activity.py for real-world examples
2. **Implement Your Activity**: Use this guide as a template for your actual use case (e.g., AAP Job Template executor)
3. **Follow TDD**: Write tests first, then implement to make them pass
4. **Document Edge Cases**: Update the edge cases section with any new failure modes
5. **Update This Guide**: If you discover missing patterns, contribute improvements back to this guide

---

*This quickstart demonstrates the complete activity pattern following specs/016-activity-pattern/spec.md. Use it as a reference for implementing production activity types like AAP Job Template, database operations, or custom integrations.*
