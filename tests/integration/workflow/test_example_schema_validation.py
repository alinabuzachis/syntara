"""Schema validation tests for example workflows.

These tests verify that all example YAML files are valid against the
workflow-definition.schema.json schema.
"""

import json
from pathlib import Path

import pytest
import yaml
from jsonschema import ValidationError, validate

from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml


@pytest.mark.integration
def test_all_examples_valid_against_schema() -> None:
    """Test that all example workflow files are valid against the JSON schema.

    This ensures that the examples we provide to users are actually valid
    and can be parsed correctly.
    """
    # Load the JSON schema
    schema_file = Path("schemas/workflows/workflow-definition.schema.json")
    with Path.open(schema_file) as f:
        schema = json.load(f)

    # Find all example YAML files recursively (including subdirectories)
    examples_dir = Path("tests/integration/workflow/examples")
    all_files = list(examples_dir.glob("**/*.yaml"))

    # Exclude intentionally invalid error test files
    example_files = [f for f in all_files if not f.name.startswith("error_")]

    assert len(example_files) > 0, "No example files found"

    errors = []

    # Validate each example file
    for example_file in example_files:
        try:
            with Path.open(example_file) as f:
                workflow_data = yaml.safe_load(f)

            # Validate against schema
            validate(instance=workflow_data, schema=schema)

        except ValidationError as e:
            # Show relative path from examples dir for clearer error messages
            rel_path = example_file.relative_to(examples_dir)
            errors.append(f"{rel_path}: {e.message}")
        except (yaml.YAMLError, OSError) as e:
            rel_path = example_file.relative_to(examples_dir)
            errors.append(f"{rel_path}: Unexpected error: {e!s}")

    # Report all errors at once
    if errors:
        error_msg = "Schema validation errors found:\n" + "\n".join(errors)
        pytest.fail(error_msg)


@pytest.mark.integration
@pytest.mark.parametrize(
    "example_file",
    [
        "basic/hello-world.yaml",
        "basic/loop-demo.yaml",
        "basic/parallel-demo.yaml",
        "basic/conditional-demo.yaml",
        "basic/retry-demo.yaml",
        "error-handling/failing-task.yaml",
        "error-handling/transient-errors.yaml",
        "error-handling/error-propagation.yaml",
        "parallel/parallel-tasks.yaml",
        "parameters/activity-chaining.yaml",
        "parameters/input-expressions.yaml",
        "loops/foreach-items.yaml",
        "timeout-retry/activity-timeout.yaml",
        "timeout-retry/retry-policy.yaml",
        "timeout-retry/timeout-with-retry.yaml",
    ],
)
def test_example_schema_validation(example_file: str) -> None:
    """Test individual example file against the schema.

    This provides better error reporting per file.
    """
    # Load the JSON schema
    schema_file = Path("schemas/workflows/workflow-definition.schema.json")
    with Path.open(schema_file) as f:
        schema = json.load(f)

    # Load the example file
    workflow_file = Path(f"tests/integration/workflow/examples/{example_file}")
    with Path.open(workflow_file) as f:
        workflow_data = yaml.safe_load(f)

    # Validate - will raise ValidationError if invalid
    validate(instance=workflow_data, schema=schema)


@pytest.mark.integration
def test_examples_parse_with_pydantic() -> None:
    """Test that all examples can be parsed with the Pydantic parser.

    This is a secondary check that our Pydantic models match the schema.
    """
    examples_dir = Path("tests/integration/workflow/examples")
    all_files = list(examples_dir.glob("**/*.yaml"))  # Recursive search

    # Exclude intentionally invalid error test files
    example_files = [f for f in all_files if not f.name.startswith("error_")]

    assert len(example_files) > 0, "No example files found"

    errors = []

    for example_file in example_files:
        try:
            workflow_yaml = example_file.read_text()
            workflow_def = parse_workflow_yaml(workflow_yaml)

            # Basic sanity checks
            assert workflow_def.metadata.name is not None
            assert len(workflow_def.workflow.activities) > 0

        except (yaml.YAMLError, ValidationError, ValueError, OSError) as e:
            rel_path = example_file.relative_to(examples_dir)
            errors.append(f"{rel_path}: {e!s}")

    # Report all errors at once
    if errors:
        error_msg = "Pydantic parsing errors found:\n" + "\n".join(errors)
        pytest.fail(error_msg)
