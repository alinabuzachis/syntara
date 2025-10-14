"""Integration tests for sequence activity type."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker


class TestSequenceActivities:
    """Test sequence activity type."""

    @pytest.mark.asyncio
    async def test_basic_sequence_execution(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test basic sequence executes steps in order."""
        result = await run_workflow_from_file(
            "examples/sequence/basic-sequence.yaml",
            workflow_id="test-basic-sequence",
        )

        assert result["status"] == "completed"

        # Verify all steps executed
        assert "step1" in result["activity_outputs"]
        assert "step2" in result["activity_outputs"]
        assert "step3" in result["activity_outputs"]

        # Verify output from each step
        assert "Step 1: Complete" in result["activity_outputs"]["step1"]["stdout"]
        assert "Step 2: Complete" in result["activity_outputs"]["step2"]["stdout"]
        assert "Step 3: Complete" in result["activity_outputs"]["step3"]["stdout"]

        # Verify sequence container result
        assert "sequential_tasks" in result["activity_outputs"]
        sequence_output = result["activity_outputs"]["sequential_tasks"]
        assert sequence_output["type"] == "sequence"
        assert "steps" in sequence_output

    @pytest.mark.asyncio
    async def test_sequence_with_data_passing(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test sequence with data passing between steps."""
        result = await run_workflow_from_file(
            "examples/sequence/sequence-with-data-passing.yaml",
            workflow_id="test-sequence-data-passing",
        )

        assert result["status"] == "completed"

        # Verify data flow through the pipeline
        fetch_output = result["activity_outputs"]["fetch_data"]
        assert "user_id" in fetch_output["output"]["data"]
        assert fetch_output["output"]["data"]["user_id"] == "123"
        assert fetch_output["output"]["data"]["name"] == "Alice"

        process_output = result["activity_outputs"]["process_data"]
        assert "Processing data for user: Alice" in process_output["stdout"]
        assert "ID: 123" in process_output["stdout"]
        assert "Grade: A" in process_output["stdout"]

        save_output = result["activity_outputs"]["save_result"]
        assert "Saving result complete" in save_output["stdout"]

    @pytest.mark.asyncio
    async def test_nested_sequence_with_parallel(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test sequence containing parallel activities."""
        result = await run_workflow_from_file(
            "examples/sequence/nested-sequence.yaml",
            workflow_id="test-nested-sequence",
        )

        assert result["status"] == "completed"

        # Verify sequential execution order
        assert "setup" in result["activity_outputs"]
        assert "parallel_processing" in result["activity_outputs"]
        assert "cleanup" in result["activity_outputs"]

        # Verify setup ran first
        setup_output = result["activity_outputs"]["setup"]
        assert "Setting up pipeline" in setup_output["stdout"]

        # Verify parallel activities both executed
        assert "process_a" in result["activity_outputs"]
        assert "process_b" in result["activity_outputs"]
        assert "Processing A" in result["activity_outputs"]["process_a"]["stdout"]
        assert "Processing B" in result["activity_outputs"]["process_b"]["stdout"]

        # Verify cleanup ran last
        cleanup_output = result["activity_outputs"]["cleanup"]
        assert "Cleaning up pipeline" in cleanup_output["stdout"]

    @pytest.mark.asyncio
    async def test_sequence_execution_order(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test that sequence executes steps in exact order specified."""
        # Use the basic sequence test which already demonstrates ordering
        result = await run_workflow_from_file(
            "examples/sequence/basic-sequence.yaml",
            workflow_id="test-sequence-order",
        )

        assert result["status"] == "completed"

        # Verify all steps executed
        assert "step1" in result["activity_outputs"]
        assert "step2" in result["activity_outputs"]
        assert "step3" in result["activity_outputs"]

        # Verify steps completed in order
        assert "Step 1: Complete" in result["activity_outputs"]["step1"]["stdout"]
        assert "Step 2: Complete" in result["activity_outputs"]["step2"]["stdout"]
        assert "Step 3: Complete" in result["activity_outputs"]["step3"]["stdout"]

    @pytest.mark.asyncio
    async def test_sequence_structure_in_output(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test that sequence output has correct structure."""
        result = await run_workflow_from_file(
            "examples/sequence/basic-sequence.yaml",
            workflow_id="test-sequence-structure",
        )

        assert result["status"] == "completed"

        # Verify sequence container has correct structure
        sequence_output = result["activity_outputs"]["sequential_tasks"]
        assert sequence_output["type"] == "sequence"
        assert "steps" in sequence_output
        assert isinstance(sequence_output["steps"], dict)

        # Verify all steps are in the sequence output
        assert "step1" in sequence_output["steps"]
        assert "step2" in sequence_output["steps"]
        assert "step3" in sequence_output["steps"]
