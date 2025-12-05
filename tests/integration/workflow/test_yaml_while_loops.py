"""Integration tests for while loop type."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest


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
