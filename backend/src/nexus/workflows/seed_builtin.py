"""Seed built-in workflow definitions.

Definitions are embedded as Python constants so they are always available,
even in container images that only sync ``*.py`` files (e.g. Skaffold).

Registered as a **required** seeder — always runs during seeding.
Built-in workflows cannot be deleted or modified by users.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

import structlog
from sqlmodel import col, select

from nexus.authz.models import Project
from nexus.core.models import User
from nexus.workflows.constants import BUILTIN_PROJECT_NAME
from nexus.workflows.models import Workflow, WorkflowVersion
from nexus.workflows.models.workflow_version import WorkflowVersionStatus
from nexus.workflows.validators import workflow_validator

if TYPE_CHECKING:
    from uuid import UUID

    from sqlmodel.ext.asyncio.session import AsyncSession

logger = structlog.stdlib.get_logger(__name__)

_BUILTIN_DEFINITIONS: list[dict[str, Any]] = [
    {
        "schema_version": "2.0.0",
        "name": "Document Conversion",
        "description": (
            "System workflow that converts uploaded documents to markdown format. "
            "Triggered automatically when files are uploaded."
        ),
        "triggers": [{"id": "trigger_api", "type": "manual_trigger", "parameters": {}}],
        "nodes": [
            {
                "id": "convert",
                "type": "internal_activity",
                "name": "Convert Document",
                "parameters": {
                    "activity": "document_conversion",
                    "input": {"file_id": "${trigger.file_id}"},
                },
                "settings": {
                    "retry_policy": {
                        "max_retries": 2,
                        "initial_interval": 5,
                        "backoff_coefficient": 2.0,
                    },
                    "timeout": 300,
                },
            }
        ],
        "edges": [{"from": "trigger_api", "to": "convert"}],
    },
    {
        "schema_version": "2.0.0",
        "name": "Agent Execution",
        "description": (
            "System workflow that executes agent invocations. Triggered automatically when an invocation is created."
        ),
        "triggers": [{"id": "trigger_api", "type": "manual_trigger", "parameters": {}}],
        "nodes": [
            {
                "id": "execute",
                "type": "internal_activity",
                "name": "Execute Invocation",
                "parameters": {
                    "activity": "invocation_execution",
                    "input": {"invocation_id": "${trigger.invocation_id}"},
                },
                "settings": {"timeout": 3600},
            }
        ],
        "edges": [{"from": "trigger_api", "to": "execute"}],
    },
]


async def seed_builtin_workflows(session: AsyncSession) -> None:
    """Load builtin workflows into the database.

    Idempotent: if a builtin workflow already exists, its definition is
    compared and updated only if changed (new version created).

    Args:
        session: Database session (caller manages lifecycle).

    """
    result = await session.exec(
        select(User).where(
            User.username == "admin",
            User.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    user = result.first()
    if not user:
        logger.error("No admin user found — cannot seed builtin workflows")
        return

    project_result = await session.exec(
        select(Project).where(
            Project.name == BUILTIN_PROJECT_NAME,
            Project.is_builtin == True,  # noqa: E712
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    system_project = project_result.first()
    project_id = system_project.id if system_project else None

    for workflow_dict in _BUILTIN_DEFINITIONS:
        try:
            await _seed_one(session, workflow_dict, user.id, project_id)
        except Exception:
            logger.exception("Failed to seed builtin workflow", workflow_name=workflow_dict.get("name"))
            continue

    await session.commit()
    logger.info("Builtin workflow seeding complete")


async def _seed_one(
    session: AsyncSession,
    workflow_dict: dict[str, Any],
    creator_id: UUID,
    project_id: UUID | None,
) -> None:
    name = workflow_dict["name"]

    workflow_validator.validate_workflow_definition(workflow_dict)

    result = await session.exec(
        select(Workflow).where(
            col(Workflow.name) == name,
            col(Workflow.is_builtin) == True,  # noqa: E712
            Workflow.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    existing = result.one_or_none()

    if existing is None:
        workflow = Workflow(
            id=uuid4(),
            name=name,
            description=workflow_dict.get("description", ""),
            labels={"built-in": ""},
            current_version=1,
            is_builtin=True,
            is_enabled=True,
            published_version=1,
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
            change_description="Initial builtin workflow",
            status=WorkflowVersionStatus.PUBLISHED,
        )
        session.add(workflow)
        session.add(version)
        logger.info("Created builtin workflow", workflow_name=name)
    else:
        current_version_result = await session.exec(
            select(WorkflowVersion).where(
                col(WorkflowVersion.workflow_id) == existing.id,
                col(WorkflowVersion.version) == existing.current_version,
            )
        )
        current_version = current_version_result.one_or_none()

        if existing.project_id != project_id:
            existing.project_id = project_id
            logger.info("Updated builtin workflow project", workflow_name=name)

        if current_version and current_version.workflow_definition == workflow_dict:
            logger.info("Builtin workflow unchanged, skipping", workflow_name=name)
            return

        new_version_num = existing.increment_version()

        if current_version and current_version.status == WorkflowVersionStatus.PUBLISHED:
            current_version.status = WorkflowVersionStatus.PREVIOUSLY_PUBLISHED

        new_version = WorkflowVersion(
            id=uuid4(),
            workflow_id=existing.id,
            version=new_version_num,
            schema_version=workflow_dict.get("schema_version", "2.0.0"),
            workflow_definition=workflow_dict,
            created_by=creator_id,
            change_description="Updated builtin workflow definition",
            status=WorkflowVersionStatus.PUBLISHED,
        )
        existing.published_version = new_version_num
        existing.description = workflow_dict.get("description", "")
        session.add(new_version)
        logger.info("Updated builtin workflow", workflow_name=name, new_version=new_version_num)
