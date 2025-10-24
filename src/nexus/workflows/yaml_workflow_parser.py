"""YAML workflow parser.

This module provides functionality to parse YAML workflow definitions
into strongly-typed Pydantic models for validation and execution.
"""

import yaml
from pydantic import ValidationError

from .workflow_engine.models import WorkflowDefinition


class WorkflowParseError(Exception):
    """Raised when workflow YAML cannot be parsed or validated."""


def _raise_invalid_type_error() -> None:
    """Raise error for invalid YAML type."""
    msg = "YAML must contain a workflow object, not a list or scalar value"
    raise WorkflowParseError(msg)


def parse_workflow_yaml(yaml_str: str) -> WorkflowDefinition:
    """Parse YAML workflow definition into WorkflowDefinition model.

    Args:
        yaml_str: YAML string containing workflow definition

    Returns:
        WorkflowDefinition: Parsed and validated workflow definition

    Raises:
        WorkflowParseError: If YAML is invalid or doesn't match schema

    Example:
        >>> yaml_content = '''
        ... schemaVersion: "1.0.0"
        ... version: 1
        ... metadata:
        ...   name: my-workflow
        ... triggers:
        ... - type: manual
        ... workflow:
        ...   activities:
        ...   - id: task1
        ...     name: Task 1
        ...     type: task
        ...     task:
        ...       executor: script
        ...       config:
        ...         language: bash
        ...         code: echo "Hello"
        ... '''
        >>> workflow = parse_workflow_yaml(yaml_content)
        >>> workflow.metadata.name
        'my-workflow'

    """
    try:
        # Parse YAML string into dict
        workflow_dict = yaml.safe_load(yaml_str)

        if not isinstance(workflow_dict, dict):
            _raise_invalid_type_error()

        # Validate and convert to Pydantic model
        return WorkflowDefinition(**workflow_dict)

    except yaml.YAMLError as e:
        msg = f"Invalid YAML syntax: {e}"
        raise WorkflowParseError(msg) from e

    except ValidationError as e:
        # Format Pydantic validation errors nicely
        error_messages = []
        for error in e.errors():
            location = " -> ".join(str(loc) for loc in error["loc"])
            message = error["msg"]
            input_value = error.get("input", "N/A")
            error_messages.append(f"{location}: {message} (value: {input_value})")

        raise WorkflowParseError(
            "Workflow validation failed:\n" + "\n".join(f"  - {msg}" for msg in error_messages)
        ) from e

    except Exception as e:
        msg = f"Unexpected error parsing workflow: {e}"
        raise WorkflowParseError(msg) from e
