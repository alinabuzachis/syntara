"""Seed sample workflows from YAML files.

Loads workflow definitions from the ``samples/`` directory into the database.
Registered as an **optional** seeder — only runs with ``--all`` or
``--only sample_workflows``.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import structlog
import yaml
from sqlmodel import select

from nexus.authz.models import Project
from nexus.core.models import User
from nexus.workflows.models import Workflow, WorkflowVersion
from nexus.workflows.validators import workflow_validator

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = structlog.stdlib.get_logger(__name__)

_DEFAULT_SAMPLES_DIR = Path("samples")


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


async def seed_sample_workflows(
    session: AsyncSession,
    samples_dir: Path | str = _DEFAULT_SAMPLES_DIR,
) -> None:
    """Load sample workflows into the database using the provided session.

    Conforms to the unified ``SeederFunc(session)`` interface when called
    with the default ``samples_dir``.

    Args:
        session: Database session (caller manages lifecycle).
        samples_dir: Path to the samples directory.

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

    # Find the bootstrap admin user for workflow ownership
    result = await session.exec(
        select(User).where(
            User.username == "admin",
            User.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    user = result.first()
    if not user:
        logger.error("No admin user found — cannot seed sample workflows")
        return
    logger.info("Using user as workflow creator", username=user.username, user_id=user.id)

    # Find the default project
    project_result = await session.exec(
        select(Project).where(
            Project.is_default == True,  # noqa: E712
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    default_project = project_result.first()
    project_id = default_project.id if default_project else None
    if default_project:
        logger.info("Using default project", project_name=default_project.name, project_id=project_id)
    else:
        logger.warning("No default project found, workflows will be created without a project")

    # Get existing workflow names to check for duplicates
    existing_workflows_result = await session.exec(
        select(Workflow).where(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]
    )
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
