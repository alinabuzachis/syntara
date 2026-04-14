#!/usr/bin/env python3
"""Standalone script to load sample workflows via direct database access.

This script loads sample workflows using direct database access, creating
Workflow and WorkflowVersion records directly in the database.

Usage:
    python tools/load_sample_workflows.py [samples_directory]
    python tools/load_sample_workflows.py samples
"""

import asyncio
import sys
from pathlib import Path
from uuid import UUID, uuid4

import structlog
import yaml
from sqlmodel import select

from nexus.authz.models import (
    Project,  # type: ignore[import-untyped]
)
from nexus.core.database.session import AsyncSessionLocal  # type: ignore[import-untyped]
from nexus.core.models import User  # type: ignore[import-untyped]
from nexus.workflows.models import Workflow, WorkflowVersion  # type: ignore[import-untyped]
from nexus.workflows.validators import workflow_validator  # type: ignore[import-untyped]

# Configure logging
logger = structlog.stdlib.get_logger(__name__)


def _load_workflow_from_file(
    yaml_file: Path,
    existing_names: set[str],
    creator_id: UUID,
    project_id: UUID | None,
) -> tuple[Workflow, WorkflowVersion] | None:
    """Parse a YAML file and return Workflow + WorkflowVersion, or None to skip."""
    yaml_content = yaml_file.read_text()
    workflow_dict = yaml.safe_load(yaml_content)

    workflow_name = workflow_dict.get("name") or workflow_dict.get("metadata", {}).get("name")
    if not workflow_name:
        logger.warning("Workflow has no name, skipping", file_path=str(yaml_file))
        return None

    if workflow_name in existing_names:
        logger.info("Workflow already exists, skipping", workflow_name=workflow_name)
        return None

    workflow_validator.validate_workflow_definition(workflow_dict)

    workflow = Workflow(
        id=uuid4(),
        name=workflow_name,
        description=workflow_dict.get("description", ""),
        labels={"source": "sample", "file": yaml_file.name},
        current_version=1,
        is_enabled=True,
        created_by=creator_id,
        project_id=project_id,
    )
    version = WorkflowVersion(
        id=uuid4(),
        workflow_id=workflow.id,
        version=1,
        schema_version=workflow_dict.get("schema_version", "2.0.0"),
        workflow_definition=workflow_dict,
        created_by=creator_id,
        change_description="Initial version from sample file",
    )
    logger.info("Successfully loaded sample workflow", workflow_name=workflow_name)
    return workflow, version


async def load_sample_workflows(
    samples_dir: Path | str = "samples",
) -> None:
    """Load sample workflows from the samples directory via direct database access.

    Args:
        samples_dir: Path to the samples directory (default: "samples")

    """
    if isinstance(samples_dir, str):
        samples_dir = Path(samples_dir)

    if not samples_dir.exists():
        logger.info("Samples directory does not exist, skipping sample workflow loading")
        return

    yaml_files = list(samples_dir.glob("*.yaml")) + list(samples_dir.glob("*.yml"))
    if not yaml_files:
        logger.info("No sample workflow files found in samples directory")
        return

    logger.info("Found sample workflow files to load", count=len(yaml_files))

    async with AsyncSessionLocal() as session:
        try:
            # Find the bootstrap admin user for workflow ownership
            result = await session.exec(
                select(User).filter(User.username == "admin", User.deleted_at.is_(None))  # type: ignore[arg-type]
            )
            user = result.first()
            if not user:
                logger.error("No admin user found. Run 'uv run python tools/set_admin_password.py' to create one.")
                return
            logger.info("Using user as workflow creator", username=user.username, user_id=user.id)

            # Find the default project
            project_result = await session.exec(
                select(Project).filter(Project.is_default.is_(True), Project.deleted_at.is_(None))  # type: ignore[arg-type]
            )
            default_project = project_result.first()
            project_id = default_project.id if default_project else None
            if default_project:
                logger.info("Using default project", project_name=default_project.name, project_id=project_id)
            else:
                logger.warning("No default project found, workflows will be created without a project")

            # Get existing workflow names to check for duplicates
            existing_workflows_result = await session.exec(select(Workflow).filter(Workflow.deleted_at.is_(None)))
            existing_names = {w.name for w in existing_workflows_result.all()}
            logger.info("Found existing workflows in the system", count=len(existing_names))

            for yaml_file in yaml_files:
                try:
                    pair = _load_workflow_from_file(yaml_file, existing_names, user.id, project_id)
                    if pair:
                        session.add(pair[0])
                        session.add(pair[1])
                except Exception:
                    logger.exception("Failed to load workflow from file", file_path=str(yaml_file))
                    continue

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
    logger.info("Samples directory", directory=samples_dir)

    try:
        asyncio.run(load_sample_workflows(samples_dir))
        logger.info("Successfully completed workflow loading")
    except Exception:
        logger.exception("Failed to load workflows")
        sys.exit(1)


if __name__ == "__main__":
    main()
