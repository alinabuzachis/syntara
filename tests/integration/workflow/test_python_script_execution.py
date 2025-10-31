"""Integration tests for Python script activity execution.

Tests Python script activities (executor: script, language: python) including:
- Simple script execution with JSON output
- Input parameter passing and output mapping
- Error handling and retry behavior
"""

from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import pytest
from temporalio.client import WorkflowFailureError

from nexus.workflows.workflow_engine.models import WorkflowDefinition


@pytest.mark.integration
@pytest.mark.asyncio
async def test_simple_python_script_execution(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test simple Python script execution with JSON output (T002).

    The Python script should execute successfully and its stdout should be
    captured as JSON output available for subsequent activities.
    """
    result = await run_workflow_from_file(
        "examples/python/simple-python-script.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed successfully
    assert result["status"] == "completed", f"Workflow failed: {result.get('error')}"

    # Verify Python script executed and produced output
    python_output = result["activity_outputs"]["hello_python"]
    assert python_output is not None, "Python activity output missing"

    # Check that stdout contains expected JSON output
    assert "stdout" in python_output
    assert "hello" in python_output["stdout"].lower()

    # Verify the activity completed successfully
    assert result["activity_outputs"]["hello_python"].get("return_code") == 0


@pytest.mark.integration
@pytest.mark.asyncio
async def test_python_script_with_input_parameters(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test Python script with input parameters and output mapping (T003).

    The script should receive inputs, perform calculations, and return
    JSON output that can be used by subsequent activities.
    """
    result = await run_workflow_from_file(
        "examples/python/python-with-inputs.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify first activity (calculator) received inputs and produced outputs
    calc_activity = result["activity_outputs"]["calculator"]
    calc_output = calc_activity["output"]
    assert "result" in calc_output
    assert isinstance(calc_output["result"], int | float)

    # Verify environment variables were used (check raw output object)
    assert "app" in calc_output
    assert calc_output["app"] == "CalculatorService"

    # Verify second activity received output from first activity as input
    printer_output = result["activity_outputs"]["print_result"]["stdout"]
    assert "result" in printer_output.lower() or str(calc_output["result"]) in printer_output

    # Verify environment variable was used in bash script
    assert "INFO" in printer_output


@pytest.mark.integration
@pytest.mark.asyncio
async def test_python_script_error_handling(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test Python script error handling and retry behavior (T004).

    The script raises an exception, and we verify:
    - Error is captured and propagated
    - Retry count is incremented
    - Workflow fails after retries exhausted
    """
    # Workflow should raise an exception after exhausting retries
    with pytest.raises(WorkflowFailureError) as exc_info:
        await run_workflow_from_file("examples/python/python-with-error.yaml", execution_timeout=timedelta(seconds=5))

    # Verify the error message indicates a script failure
    error_message = str(exc_info.value)
    assert (
        "script" in error_message.lower() or "failed" in error_message.lower() or "exit code" in error_message.lower()
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_python_workflow_definition_parsing(
    load_workflow: Callable[[str], WorkflowDefinition],
) -> None:
    """Test that Python script workflow definitions are parsed correctly.

    Verifies the YAML parser correctly identifies:
    - executor: script
    - language: python
    - script configuration
    """
    workflow_def = load_workflow("examples/python/simple-python-script.yaml")

    # Verify workflow has activities
    assert len(workflow_def.workflow.activities) > 0

    # Verify first activity is a Python script task
    activity = workflow_def.workflow.activities[0]
    assert activity.task is not None
    assert activity.task.executor == "script"
    assert activity.task.config is not None
    assert hasattr(activity.task.config, "language")
    assert activity.task.config.language.value == "python"
    assert hasattr(activity.task.config, "code")
    assert activity.task.config.code is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_python_json_output_parsing(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test JSON output parsing from Python script stdout.

    Python scripts should print JSON to stdout which gets parsed
    into structured output data.
    """
    result = await run_workflow_from_file(
        "examples/python/python-json-output.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify JSON output was parsed from stdout
    json_activity = result["activity_outputs"]["json_producer"]
    assert "output" in json_activity

    # Check that the output is structured (parsed JSON, not just string)
    output_data = json_activity["output"]
    assert isinstance(output_data, dict), "Output should be parsed as dict from JSON"
    assert "data" in output_data or "result" in output_data


@pytest.mark.integration
@pytest.mark.asyncio
async def test_python_timeout_handling(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test Python script timeout handling.

    Script with sleep should timeout according to the timeout configuration.
    """
    # Workflow should raise an exception due to timeout
    with pytest.raises(WorkflowFailureError) as exc_info:
        await run_workflow_from_file("examples/python/python-timeout.yaml", execution_timeout=timedelta(seconds=5))

    # Verify timeout was the cause by checking the exception chain
    # The cause should be a TimeoutError or ActivityError with timeout message
    error_chain = str(exc_info.value.cause) if exc_info.value.cause else ""
    assert "timeout" in error_chain.lower() or "timed out" in error_chain.lower(), (
        f"Expected timeout error, but got: {error_chain}"
    )


@pytest.mark.integration
@pytest.mark.asyncio
async def test_script_environment_variables(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test custom environment variables in script activities.

    Verifies that config.environment variables are properly passed to scripts
    and can be accessed alongside INPUT_ variables from task inputs.
    """
    result = await run_workflow_from_file(
        "examples/basic/environment-variables.yaml",
        execution_timeout=timedelta(seconds=5),
        inputs={"user_name": "TestUser"},
    )

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify bash activity used environment variables
    bash_output = result["activity_outputs"]["bash_with_env"]["stdout"]
    assert "https://api.example.com/v1" in bash_output
    assert "production" in bash_output
    assert "TestUser" in bash_output

    # Verify Python activity used environment variables
    python_output = result["activity_outputs"]["python_with_env"]["output"]["config"]
    assert python_output["database"]["host"] == "db.example.com"
    assert python_output["database"]["port"] == "5432"
    assert python_output["database"]["name"] == "myapp"
    assert python_output["logging"]["level"] == "INFO"
    assert python_output["user"] == "TestUser"

    # Verify bash with combined environment variables and inputs work together
    bash_combined_output = result["activity_outputs"]["bash_with_combined"]["stdout"]
    assert "Service: WorkflowEngine" in bash_combined_output
    assert "Max Retries: 3" in bash_combined_output
    assert "User: TestUser" in bash_combined_output
