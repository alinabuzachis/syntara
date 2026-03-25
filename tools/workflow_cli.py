r"""CLI tool for executing workflows from YAML or JSON files.

## Purpose

This is a **development and debugging utility** for manual verification of workflow execution.
It is NOT intended to be used in production or imported by the application code.

This script serves as:
- A manual testing tool for developers to validate workflow YAML or JSON files
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

    # YAML workflow
    python tools/workflow_cli.py run <workflow.yaml>
    python tools/workflow_cli.py run tests/integration/workflow/examples/basic/hello-world.yaml
    python tools/workflow_cli.py run \\
        tests/integration/workflow/examples/basic/parallel-demo.yaml --inputs '{"items": ["a", "b", "c"]}'

    # JSON workflow
    python tools/workflow_cli.py run <workflow.json>
    python tools/workflow_cli.py run workflow-definition.json --inputs '{"key": "value"}'
"""
# pragma: no cover - Manual verification utility, excluded from coverage

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

import structlog
import yaml

from nexus.core.config.base import get_settings
from nexus.core.logging.logging import configure_structlog
from nexus.workflows.workflow_engine.models import WorkflowResultResponse
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService
from nexus.workflows.workflow_engine.services.temporal_worker import TemporalWorkerService


async def run_workflow(  # noqa: C901, PLR0912, PLR0915
    workflow_file: Path,
    inputs: dict[str, Any] | None = None,
    temporal_address: str = "localhost:7233",
    task_queue: str = "nexus-workflow-queue",
) -> WorkflowResultResponse:
    """Run a workflow from a YAML or JSON file.

    Args:
        workflow_file: Path to YAML or JSON workflow file
        inputs: Input parameters for the workflow
        temporal_address: Temporal server address
        task_queue: Task queue name

    Returns:
        dict containing workflow execution result

    Raises:
        FileNotFoundError: If workflow file doesn't exist
        Exception: If workflow execution fails

    """
    # Get logger (assumes configure_structlog was already called)
    logger = structlog.stdlib.get_logger(__name__)
    # Read workflow file
    if not workflow_file.exists():
        msg = f"Workflow file not found: {workflow_file}"
        raise FileNotFoundError(msg)

    workflow_name = workflow_file.stem
    file_extension = workflow_file.suffix.lower()

    # Load workflow definition as dict
    workflow_content = workflow_file.read_text()
    if file_extension == ".json":
        logger.info("Loading JSON workflow", name=workflow_name, file=str(workflow_file))
        try:
            workflow_def = json.loads(workflow_content)
        except json.JSONDecodeError as e:
            msg = f"Invalid JSON in workflow file: {e}"
            raise ValueError(msg) from e
    elif file_extension in {".yaml", ".yml"}:
        logger.info("Loading YAML workflow", name=workflow_name, file=str(workflow_file))
        try:
            workflow_def = yaml.safe_load(workflow_content)
        except yaml.YAMLError as e:
            msg = f"Invalid YAML in workflow file: {e}"
            raise ValueError(msg) from e
    else:
        msg = f"Unsupported file format: {file_extension}. Use .json, .yaml, or .yml"
        raise ValueError(msg)

    logger.info("Connecting to Temporal", address=temporal_address)

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
        logger.info("\n=== Starting Workflow ===", name=workflow_name)
        if inputs:
            logger.info("Inputs", inputs=json.dumps(inputs, indent=2))

        result = await execution_service.start_workflow(
            workflow_def=workflow_def,
            workflow_name=workflow_name,
            input_data=inputs or {},
        )

        logger.info("\n✓ Workflow started")
        logger.info("  Workflow ID", workflow_id=result.workflow_id)
        logger.info("  Temporal Workflow ID", temporal_workflow_id=result.temporal_workflow_id)
        logger.info("  Run ID", run_id=result.temporal_run_id)

        # Wait for workflow to complete
        logger.info("\n=== Executing Workflow ===")
        workflow_result = await execution_service.get_workflow_result(result.temporal_workflow_id)

        logger.info("\n✓ Workflow completed successfully!")
        logger.info("  Status", status=workflow_result.status)
        logger.info("  Activities completed", count=len(workflow_result.completed_activities))

        # Display activity outputs
        logger.info("\n=== Activity Outputs ===")
        for activity_id in workflow_result.completed_activities:
            output = workflow_result.activity_outputs.get(activity_id, {})

            # Handle different output types
            if isinstance(output, dict):
                if "type" in output:
                    # Structured output (parallel, loop, etc.)
                    logger.info("\nActivity output", activity_id=activity_id, type=output["type"])
                    if output["type"] == "parallel":
                        logger.info("  Branches", count=len(output.get("branches", {})))
                        for branch_id, branch_output in output.get("branches", {}).items():
                            if "stdout" in branch_output:
                                stdout = branch_output["stdout"].strip()
                                if stdout:
                                    logger.info("    Branch output", branch_id=branch_id, stdout=stdout)
                    elif output["type"] in ["forEach", "while", "count"]:
                        logger.info("  Iterations", count=output.get("iterations", 0))
                        for i, iteration in enumerate(output.get("results", [])[:5]):  # Show first 5
                            if "result" in iteration and "stdout" in iteration["result"]:
                                stdout = iteration["result"]["stdout"].strip()
                                if stdout:
                                    logger.info("    Iteration output", index=i, stdout=stdout)
                elif "stdout" in output:
                    # Script output
                    logger.info("\nActivity output", activity_id=activity_id)
                    stdout = output["stdout"].strip()
                    if stdout:
                        for line in stdout.split("\n"):
                            logger.info("  Output line", line=line)
                    if output.get("return_code", 0) != 0:
                        logger.warning("  Return code", code=output["return_code"])
                        if output.get("stderr"):
                            logger.error("  Error", stderr=output["stderr"])

        logger.info("\n=== Workflow Complete ===")

        return workflow_result


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Execute workflows from YAML or JSON files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run a YAML workflow
  python tools/workflow_cli.py run tests/integration/workflow/examples/hello-world.yaml

  # Run a JSON workflow
  python tools/workflow_cli.py run workflow-definition.json

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

    parser.add_argument("workflow_file", type=Path, help="Path to workflow file (.yaml, .yml, or .json)")

    parser.add_argument("--inputs", "-i", type=str, help="Input parameters as JSON string")

    parser.add_argument(
        "--temporal-address", "-t", default="localhost:7233", help="Temporal server address (default: localhost:7233)"
    )

    parser.add_argument(
        "--task-queue", "-q", default="nexus-workflow-queue", help="Task queue name (default: nexus-workflow-queue)"
    )

    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose logging")

    args = parser.parse_args()

    # Set log level via environment variable if verbose flag is set
    if args.verbose:
        os.environ["NEXUS_LOG_LEVEL"] = "DEBUG"
        get_settings.cache_clear()

    # Configure logging (will read NEXUS_LOG_LEVEL if set)
    configure_structlog()

    # Get logger after configuration
    logger = structlog.stdlib.get_logger(__name__)

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
