"""End-to-end integration tests for conditional logic.

These tests verify that conditional branching works correctly in full workflow execution
by running workflows through Temporal.
"""

from pathlib import Path

import pytest
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml


@pytest.mark.integration
@pytest.mark.asyncio
async def test_conditional_hot_weather(
    temporal_env: WorkflowEnvironment,
    temporal_client: Client,
    temporal_worker: Worker,
) -> None:
    """Test conditional logic with hot weather (>30°C).

    Should execute:
    - check_temperature
    - hot_weather (condition: temp > 30)
    - summary

    Should skip:
    - cold_weather (condition: temp < 15)
    - mild_weather (condition: temp >= 15, but internal check prevents output)
    """
    # Load the conditional-demo workflow
    workflow_file = Path("tests/integration/workflow/examples/basic/conditional-demo.yaml")
    workflow_yaml = workflow_file.read_text()
    workflow_def = parse_workflow_yaml(workflow_yaml)

    # Start workflow with hot temperature
    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[workflow_def.model_dump(mode="json", by_alias=True), "test-exec-hot", {"temperature": 35}],
        id="test-conditional-hot",
        task_queue="test-workflow-queue",
    )

    # Wait for completion
    result = await handle.result()

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify hot_weather executed (not skipped)
    hot_weather_output = result["activity_outputs"].get("hot_weather", {})
    assert hot_weather_output.get("skipped") is not True
    if "stdout" in hot_weather_output:
        assert "Hot weather detected" in hot_weather_output["stdout"]

    # Verify cold_weather was skipped
    cold_weather_output = result["activity_outputs"].get("cold_weather", {})
    assert cold_weather_output.get("skipped") is True
    assert cold_weather_output.get("reason") == "condition_false"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_conditional_cold_weather(
    temporal_env: WorkflowEnvironment,
    temporal_client: Client,
    temporal_worker: Worker,
) -> None:
    """Test conditional logic with cold weather (<15°C).

    Should execute:
    - check_temperature
    - cold_weather (condition: temp < 15)
    - summary

    Should skip:
    - hot_weather (condition: temp > 30)
    - mild_weather (condition: temp >= 15)
    """
    # Load the conditional-demo workflow
    workflow_file = Path("tests/integration/workflow/examples/basic/conditional-demo.yaml")
    workflow_yaml = workflow_file.read_text()
    workflow_def = parse_workflow_yaml(workflow_yaml)

    # Start workflow with cold temperature
    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[workflow_def.model_dump(mode="json", by_alias=True), "test-exec-cold", {"temperature": 10}],
        id="test-conditional-cold",
        task_queue="test-workflow-queue",
    )

    # Wait for completion
    result = await handle.result()

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify cold_weather executed
    cold_weather_output = result["activity_outputs"].get("cold_weather", {})
    assert cold_weather_output.get("skipped") is not True
    if "stdout" in cold_weather_output:
        assert "Cold weather detected" in cold_weather_output["stdout"]

    # Verify hot_weather was skipped
    hot_weather_output = result["activity_outputs"].get("hot_weather", {})
    assert hot_weather_output.get("skipped") is True
    assert hot_weather_output.get("reason") == "condition_false"

    # Verify mild_weather was skipped
    mild_weather_output = result["activity_outputs"].get("mild_weather", {})
    assert mild_weather_output.get("skipped") is True
    assert mild_weather_output.get("reason") == "condition_false"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_conditional_mild_weather(
    temporal_env: WorkflowEnvironment,
    temporal_client: Client,
    temporal_worker: Worker,
) -> None:
    """Test conditional logic with mild weather (15-30°C).

    Should execute:
    - check_temperature
    - mild_weather (condition: temp >= 15)
    - summary

    Should skip:
    - hot_weather (condition: temp > 30)
    - cold_weather (condition: temp < 15)
    """
    # Load the conditional-demo workflow
    workflow_file = Path("tests/integration/workflow/examples/basic/conditional-demo.yaml")
    workflow_yaml = workflow_file.read_text()
    workflow_def = parse_workflow_yaml(workflow_yaml)

    # Start workflow with mild temperature
    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[workflow_def.model_dump(mode="json", by_alias=True), "test-exec-mild", {"temperature": 22}],
        id="test-conditional-mild",
        task_queue="test-workflow-queue",
    )

    # Wait for completion
    result = await handle.result()

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify mild_weather executed
    mild_weather_output = result["activity_outputs"].get("mild_weather", {})
    assert mild_weather_output.get("skipped") is not True
    if "stdout" in mild_weather_output:
        assert "Pleasant weather" in mild_weather_output["stdout"]

    # Verify hot_weather was skipped
    hot_weather_output = result["activity_outputs"].get("hot_weather", {})
    assert hot_weather_output.get("skipped") is True
    assert hot_weather_output.get("reason") == "condition_false"

    # Verify cold_weather was skipped
    cold_weather_output = result["activity_outputs"].get("cold_weather", {})
    assert cold_weather_output.get("skipped") is True
    assert cold_weather_output.get("reason") == "condition_false"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_conditional_boundary_conditions(
    temporal_env: WorkflowEnvironment,
    temporal_client: Client,
    temporal_worker: Worker,
) -> None:
    """Test conditional logic at boundary values (15°C and 30°C).

    Tests edge cases:
    - 15°C: Should execute mild_weather (>= 15), skip cold_weather (< 15)
    - 30°C: Should execute mild_weather (>= 15), skip hot_weather (> 30)
    """
    # Load the conditional-demo workflow
    workflow_file = Path("tests/integration/workflow/examples/basic/conditional-demo.yaml")
    workflow_yaml = workflow_file.read_text()
    workflow_def = parse_workflow_yaml(workflow_yaml)

    # Test at 15°C (lower boundary)
    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[workflow_def.model_dump(mode="json", by_alias=True), "test-exec-boundary-15", {"temperature": 15}],
        id="test-conditional-boundary-15",
        task_queue="test-workflow-queue",
    )

    result = await handle.result()

    # At 15°C: mild_weather should execute (>= 15), cold_weather should skip (< 15)
    assert result["status"] == "completed"

    mild_weather = result["activity_outputs"].get("mild_weather", {})
    assert mild_weather.get("skipped") is not True  # Should execute

    cold_weather = result["activity_outputs"].get("cold_weather", {})
    assert cold_weather.get("skipped") is True  # Should skip
    assert cold_weather.get("reason") == "condition_false"

    # Test at 30°C (upper boundary)
    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[workflow_def.model_dump(mode="json", by_alias=True), "test-exec-boundary-30", {"temperature": 30}],
        id="test-conditional-boundary-30",
        task_queue="test-workflow-queue",
    )

    result = await handle.result()

    # At 30°C: mild_weather should execute (>= 15), hot_weather should skip (> 30)
    assert result["status"] == "completed"

    mild_weather = result["activity_outputs"].get("mild_weather", {})
    assert mild_weather.get("skipped") is not True  # Should execute

    hot_weather = result["activity_outputs"].get("hot_weather", {})
    assert hot_weather.get("skipped") is True  # Should skip
    assert hot_weather.get("reason") == "condition_false"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_conditional_with_default_input(
    temporal_env: WorkflowEnvironment,
    temporal_client: Client,
    temporal_worker: Worker,
) -> None:
    """Test conditional logic using default input value.

    The conditional-demo.yaml has default temperature of 25°C.
    Should behave same as test_conditional_mild_weather.
    """
    # Load the conditional-demo workflow
    workflow_file = Path("tests/integration/workflow/examples/basic/conditional-demo.yaml")
    workflow_yaml = workflow_file.read_text()
    workflow_def = parse_workflow_yaml(workflow_yaml)

    # Start workflow WITHOUT inputs (should use default 25°C)
    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[workflow_def.model_dump(mode="json", by_alias=True), "test-exec-default", {}],
        id="test-conditional-default",
        task_queue="test-workflow-queue",
    )

    # Wait for completion
    result = await handle.result()

    # Verify workflow completed
    assert result["status"] == "completed"

    # With default 25°C: mild_weather should execute, others should skip
    mild_weather_output = result["activity_outputs"].get("mild_weather", {})
    assert mild_weather_output.get("skipped") is not True

    hot_weather_output = result["activity_outputs"].get("hot_weather", {})
    assert hot_weather_output.get("skipped") is True

    cold_weather_output = result["activity_outputs"].get("cold_weather", {})
    assert cold_weather_output.get("skipped") is True
