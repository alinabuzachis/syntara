"""Database-backed validation for sub-workflow references."""

from typing import Any
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from syntara.workflows.models.validation_finding import ValidationCategory, ValidationFinding, ValidationSeverity
from syntara.workflows.models.workflow import Workflow
from syntara.workflows.workflow_engine.models.workflow_definition import NodeType


async def validate_subworkflow_project_references(
    session: AsyncSession,
    workflow_definition: dict[str, Any],
    project_id: UUID,
) -> list[ValidationFinding]:
    """Ensure every configured sub-workflow target exists in the parent Project.

    Workflow IDs are selected resources, not runtime expressions. We collect all
    UUIDs first so the database check is batched instead of issuing one query per
    sub-workflow node.
    """
    node_targets: list[tuple[str | None, UUID]] = []
    target_ids: set[UUID] = set()
    findings: list[ValidationFinding] = []
    nodes = workflow_definition.get("nodes", [])
    if not isinstance(nodes, list):
        return findings

    for node in nodes:
        if not isinstance(node, dict) or node.get("type") != NodeType.SUB_WORKFLOW:
            continue

        parameters = node.get("parameters")
        workflow_id = parameters.get("workflow_id") if isinstance(parameters, dict) else None
        node_id = node.get("id") if isinstance(node.get("id"), str) else None
        if not isinstance(workflow_id, str):
            findings.append(
                ValidationFinding(
                    severity=ValidationSeverity.error,
                    category=ValidationCategory.invalid_reference,
                    message="A sub-workflow step must select a child workflow in this Project.",
                    node_id=node_id,
                    field_path="parameters.workflow_id",
                )
            )
            continue

        try:
            target_id = UUID(workflow_id)
        except ValueError:
            findings.append(
                ValidationFinding(
                    severity=ValidationSeverity.error,
                    category=ValidationCategory.invalid_reference,
                    message=(
                        "A sub-workflow step must use a selected workflow ID; "
                        "workflow ID expressions are not supported."
                    ),
                    node_id=node_id,
                    field_path="parameters.workflow_id",
                )
            )
            continue

        target_ids.add(target_id)
        node_targets.append((node_id, target_id))

    if not target_ids:
        return findings

    result = await session.exec(select(Workflow.id, Workflow.project_id).where(col(Workflow.id).in_(target_ids)))
    target_projects = dict(result.all())

    for node_id, target_id in node_targets:
        target_project_id = target_projects.get(target_id)
        if target_project_id is None:
            message = "The selected child workflow is no longer available."
        elif target_project_id != project_id:
            message = "A sub-workflow step must reference a workflow in the same Project."
        else:
            continue

        findings.append(
            ValidationFinding(
                severity=ValidationSeverity.error,
                category=ValidationCategory.invalid_reference,
                message=message,
                node_id=node_id,
                field_path="parameters.workflow_id",
            )
        )

    return findings
