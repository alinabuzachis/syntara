r"""CLI tool for executing workflows from YAML files.

## Purpose

This is a **development and debugging utility** for manual verification of workflow execution.
It is NOT intended to be used in production or imported by the application code.

This script serves as:
- A manual testing tool for developers to validate workflow YAML files
- A debugging utility to inspect workflow execution locally
- A reference implementation showing how to use the TemporalExecutionService
- A quick way to verify Temporal integration without running the full API

## Test Coverage

This file is intentionally excluded from automated test coverage because:
1. It's a manual utility, not application code
2. Testing CLI argument parsing provides minimal value
3. The underlying services (TemporalExecutionService, TemporalWorkerService) are tested separately
4. Manual verification is more appropriate for CLI tools

## Usage

    python tools/workflow_cli.py run <workflow.yaml>
    python tools/workflow_cli.py run tests/integration/workflow/examples/basic/hello-world.yaml
    python tools/workflow_cli.py run \\
        tests/integration/workflow/examples/basic/parallel-demo.yaml --inputs '{"items": ["a", "b", "c"]}'
"""
# pragma: no cover - Manual verification utility, excluded from coverage

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Any

from nexus.workflows.workflow_engine.models import WorkflowResultResponse
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService
from nexus.workflows.workflow_engine.services.temporal_worker import TemporalWorkerService

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


async def run_workflow(  # noqa: C901, PLR0912, PLR0915
    workflow_file: Path,
    inputs: dict[str, Any] | None = None,
    temporal_address: str = "localhost:7233",
    task_queue: str = "nexus-workflow-queue",
) -> WorkflowResultResponse:
    """Run a workflow from a YAML file.

    Args:
        workflow_file: Path to YAML workflow file
        inputs: Input parameters for the workflow
        temporal_address: Temporal server address
        task_queue: Task queue name

    Returns:
        dict containing workflow execution result

    Raises:
        FileNotFoundError: If workflow file doesn't exist
        Exception: If workflow execution fails

    """
    # Read workflow YAML
    if not workflow_file.exists():
        msg = f"Workflow file not found: {workflow_file}"
        raise FileNotFoundError(msg)

    workflow_yaml = workflow_file.read_text()
    workflow_name = workflow_file.stem

    logger.info("Loading workflow: %s from %s", workflow_name, workflow_file)
    logger.info("Connecting to Temporal at: %s", temporal_address)

    # Start worker service
    worker_service = TemporalWorkerService(
        temporal_address=temporal_address,
        namespace="default",
        task_queue=task_queue,
    )

    async with worker_service:
        logger.info("✓ Connected to Temporal server")
        logger.info("✓ Worker started")

        # Create execution service
        if worker_service.client is None:
            msg = "Client should be initialized"
            raise RuntimeError(msg)
        execution_service = TemporalExecutionService(worker_service.client, task_queue)

        # Start workflow
        logger.info("\n=== Starting Workflow: %s ===", workflow_name)
        if inputs:
            logger.info("Inputs: %s", json.dumps(inputs, indent=2))

        result = await execution_service.start_yaml_workflow(
            workflow_yaml=workflow_yaml,
            workflow_name=workflow_name,
            input_data=inputs or {},
        )

        logger.info("\n✓ Workflow started")
        logger.info("  Workflow ID: %s", result.workflow_id)
        logger.info("  Temporal Workflow ID: %s", result.temporal_workflow_id)
        logger.info("  Run ID: %s", result.temporal_run_id)

        # Wait for workflow to complete
        logger.info("\n=== Executing Workflow ===")
        workflow_result = await execution_service.get_workflow_result(result.temporal_workflow_id)

        logger.info("\n✓ Workflow completed successfully!")
        logger.info("  Status: %s", workflow_result.status)
        logger.info("  Activities completed: %s", len(workflow_result.completed_activities))

        # Display activity outputs
        logger.info("\n=== Activity Outputs ===")
        for activity_id in workflow_result.completed_activities:
            output = workflow_result.activity_outputs.get(activity_id, {})

            # Handle different output types
            if isinstance(output, dict):
                if "type" in output:
                    # Structured output (parallel, loop, etc.)
                    logger.info("\n%s (%s):", activity_id, output["type"])
                    if output["type"] == "parallel":
                        logger.info("  Branches: %s", len(output.get("branches", {})))
                        for branch_id, branch_output in output.get("branches", {}).items():
                            if "stdout" in branch_output:
                                stdout = branch_output["stdout"].strip()
                                if stdout:
                                    logger.info("    %s: %s", branch_id, stdout)
                    elif output["type"] in ["forEach", "while", "count"]:
                        logger.info("  Iterations: %s", output.get("iterations", 0))
                        for i, iteration in enumerate(output.get("results", [])[:5]):  # Show first 5
                            if "result" in iteration and "stdout" in iteration["result"]:
                                stdout = iteration["result"]["stdout"].strip()
                                if stdout:
                                    logger.info("    [%s]: %s", i, stdout)
                elif "stdout" in output:
                    # Script output
                    logger.info("\n%s:", activity_id)
                    stdout = output["stdout"].strip()
                    if stdout:
                        for line in stdout.split("\n"):
                            logger.info("  %s", line)
                    if output.get("return_code", 0) != 0:
                        logger.warning("  Return code: %s", output["return_code"])
                        if output.get("stderr"):
                            logger.error("  Error: %s", output["stderr"])

        logger.info("\n=== Workflow Complete ===")

        return workflow_result


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Execute workflows from YAML files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run a simple workflow
  python tools/workflow_cli.py run tests/integration/workflow/examples/hello-world.yaml

  # Run with inputs
  python tools/workflow_cli.py run tests/integration/workflow/examples/loop-demo.yaml \\
    --inputs '{"items": ["apple", "banana", "cherry"]}'

  # Use custom Temporal server
  python tools/workflow_cli.py run workflow.yaml \\
    --temporal-address localhost:7233 \\
    --task-queue my-queue
        """,
    )

    parser.add_argument("command", choices=["run"], help="Command to execute")

    parser.add_argument("workflow_file", type=Path, help="Path to YAML workflow file")

    parser.add_argument("--inputs", "-i", type=str, help="Input parameters as JSON string")

    parser.add_argument(
        "--temporal-address", "-t", default="localhost:7233", help="Temporal server address (default: localhost:7233)"
    )

    parser.add_argument(
        "--task-queue", "-q", default="nexus-workflow-queue", help="Task queue name (default: nexus-workflow-queue)"
    )

    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")

    args = parser.parse_args()

    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Parse inputs
    inputs = None
    if args.inputs:
        try:
            inputs = json.loads(args.inputs)
        except json.JSONDecodeError:
            logger.exception("Invalid JSON in --inputs")
            sys.exit(1)

    # Run workflow
    try:
        asyncio.run(
            run_workflow(
                workflow_file=args.workflow_file,
                inputs=inputs,
                temporal_address=args.temporal_address,
                task_queue=args.task_queue,
            )
        )
    except KeyboardInterrupt:
        logger.info("\nWorkflow execution interrupted")
        sys.exit(1)
    except Exception:
        logger.exception("Workflow execution failed", exc_info=args.verbose)
        sys.exit(1)


if __name__ == "__main__":
    main()
