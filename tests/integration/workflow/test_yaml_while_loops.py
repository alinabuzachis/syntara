"""Integration tests for while loop type."""

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import uuid4

import pytest
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml


class TestWhileLoops:
    """Test while loop type."""

    @pytest.mark.asyncio
    async def test_while_loop_with_max_iterations(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test while loop respects maxIterations limit."""
        result = await run_workflow_from_file(
            "examples/loops/while-loop-with-max-iterations.yaml",
            workflow_id="test-while-max-iterations",
        )

        assert result["status"] == "completed"

        # Verify while loop executed
        assert "while_with_max" in result["activity_outputs"]
        loop_output = result["activity_outputs"]["while_with_max"]

        assert loop_output["type"] == "while"
        assert loop_output["iterations"] == 3
        assert "results" in loop_output
        assert len(loop_output["results"]) == 3

    @pytest.mark.asyncio
    async def test_while_loop_structure(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test while loop output structure."""
        result = await run_workflow_from_file(
            "examples/loops/while-loop-with-max-iterations.yaml",
            workflow_id="test-while-structure",
        )

        assert result["status"] == "completed"

        loop_output = result["activity_outputs"]["while_with_max"]

        # Verify output structure
        assert "type" in loop_output
        assert loop_output["type"] == "while"
        assert "iterations" in loop_output
        assert "results" in loop_output
        assert isinstance(loop_output["results"], list)

        # Verify iteration structure
        for iteration_result in loop_output["results"]:
            assert "index" in iteration_result
            assert "activity_id" in iteration_result
            assert "result" in iteration_result
            assert iteration_result["activity_id"] == "iteration_task"

    @pytest.mark.asyncio
    async def test_while_loop_basic(
        self,
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test basic while loop execution."""
        result = await run_workflow_from_file(
            "examples/loops/while-loop-basic.yaml",
            workflow_id="test-while-basic",
        )

        assert result["status"] == "completed"

        # Verify while loop executed
        assert "while_loop" in result["activity_outputs"]
        loop_output = result["activity_outputs"]["while_loop"]

        assert loop_output["type"] == "while"
        assert "iterations" in loop_output
        assert "results" in loop_output

    @pytest.mark.asyncio
    async def test_while_loop_max_iterations_template(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test while loop maxIterations template expression resolution.

        This test verifies:
        - While loop maxIterations can be specified as template expression
        - Template is resolved to actual value before loop execution
        - Loop respects the resolved max iterations limit
        """
        workflow_yaml = """
schemaVersion: 1.0.0
version: 1
metadata:
  name: while-loop-max-template-test
  description: Test while loop with template max iterations
triggers:
  - type: manual
inputs:
  max_loops:
    type: integer
    description: Maximum loop iterations
workflow:
  activities:
    - id: while_with_template_max
      type: loop
      loop:
        type: while
        condition: "true"
        maxIterations: ${input.max_loops}
        do:
          - id: iteration_task
            type: task
            task:
              executor: script
              config:
                language: bash
                code: echo "Iteration"
"""
        workflow_def = parse_workflow_yaml(workflow_yaml)

        # Run workflow with input-specified max iterations
        handle = await temporal_client.start_workflow(
            DynamicWorkflow.run,
            args=[
                workflow_def.model_dump(mode="json", by_alias=True),
                "test-while-template",
                {"max_loops": 5},
            ],
            id=f"test-while-template-{uuid4()}",
            task_queue="test-workflow-queue",
        )

        result = await handle.result()

        # Verify workflow completed successfully
        assert result["status"] == "completed"
        assert "while_with_template_max" in result["activity_outputs"]

        # Verify loop ran exactly max_loops times (5)
        loop_output = result["activity_outputs"]["while_with_template_max"]
        assert loop_output["type"] == "while"
        assert loop_output["iterations"] == 5
