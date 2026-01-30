#!/usr/bin/env python3
"""Standalone script to load sample workflows via direct database access.

This script loads sample workflows using direct database access, creating
Workflow and WorkflowVersion records directly in the database.

Usage:
    python tools/load_sample_workflows.py [samples_directory]
    python tools/load_sample_workflows.py samples
"""

import asyncio
import logging
import sys
from pathlib import Path
from uuid import uuid4

from sqlmodel import select

from nexus.api.auth.dependencies import get_current_user  # type: ignore[import-untyped]
from nexus.core.database.session import AsyncSessionLocal  # type: ignore[import-untyped]
from nexus.workflows.models import Workflow, WorkflowVersion  # type: ignore[import-untyped]
from nexus.workflows.validators import WorkflowDefinitionValidator  # type: ignore[import-untyped]
from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml  # type: ignore[import-untyped]

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def load_sample_workflows(
    samples_dir: Path | str = "samples",
) -> None:
    """Load sample workflows from the samples directory via direct database access.

    Args:
        samples_dir: Path to the samples directory (default: "samples")

    """
    # Convert to Path if string
    if isinstance(samples_dir, str):
        samples_dir = Path(samples_dir)

    if not samples_dir.exists():
        logger.info("Samples directory does not exist, skipping sample workflow loading")
        return

    # Find all YAML files in samples directory
    yaml_files = list(samples_dir.glob("*.yaml")) + list(samples_dir.glob("*.yml"))

    if not yaml_files:
        logger.info("No sample workflow files found in samples directory")
        return

    logger.info("Found %d sample workflow file(s) to load", len(yaml_files))

    # Create database session
    async with AsyncSessionLocal() as session:
        try:
            # Get or create the current user for workflow ownership
            user = await get_current_user(session)
            creator_id = user.id
            logger.info("Using user '%s' (ID: %s) as workflow creator", user.username, creator_id)

            # First, get existing workflows to check for duplicates
            result = await session.execute(select(Workflow).filter(Workflow.deleted_at.is_(None)))
            existing_workflows = result.scalars().all()
            existing_names = {w.name for w in existing_workflows}
            logger.info("Found %d existing workflows in the system", len(existing_names))

            # Load each workflow file
            for yaml_file in yaml_files:
                try:
                    # Read YAML file
                    yaml_content = yaml_file.read_text()

                    # Parse workflow definition
                    workflow_definition = parse_workflow_yaml(yaml_content)

                    # Check if workflow already exists by name
                    if workflow_definition.metadata.name in existing_names:
                        logger.info(
                            "Workflow '%s' already exists, skipping",
                            workflow_definition.metadata.name,
                        )
                        continue

                    # Validate workflow definition
                    _, schema_version, workflow_dict = WorkflowDefinitionValidator.validate(workflow_definition)

                    # Create workflow
                    workflow = Workflow(
                        id=uuid4(),
                        name=workflow_definition.metadata.name,
                        description=workflow_definition.metadata.description,
                        labels={"source": "sample", "file": yaml_file.name},
                        current_version=1,
                        is_enabled=True,
                        created_by=creator_id,
                    )

                    # Create initial version
                    version = WorkflowVersion(
                        id=uuid4(),
                        workflow_id=workflow.id,
                        version=1,
                        schema_version=schema_version,
                        workflow_definition=workflow_dict,
                        created_by=creator_id,
                        change_description="Initial version from sample file",
                    )

                    session.add(workflow)
                    session.add(version)

                    logger.info("Successfully loaded sample workflow: %s", workflow_definition.metadata.name)

                except Exception:
                    logger.exception("Failed to load workflow from %s", yaml_file)
                    # Continue loading other workflows even if one fails
                    continue

            # Commit all changes
            await session.commit()
            logger.info("Successfully committed all workflow changes to database")

        except Exception:
            logger.exception("Failed to load workflows")
            await session.rollback()
            raise


def main() -> None:
    """Run the sample workflow loading process."""
    # Get samples directory from command line args or use default
    samples_arg_index = 1
    samples_dir = sys.argv[samples_arg_index] if len(sys.argv) > samples_arg_index else "samples"

    logger.info("Starting workflow loading process...")
    logger.info("Samples directory: %s", samples_dir)

    try:
        asyncio.run(load_sample_workflows(samples_dir))
        logger.info("Successfully completed workflow loading")
    except Exception:
        logger.exception("Failed to load workflows")
        sys.exit(1)


if __name__ == "__main__":
    main()
