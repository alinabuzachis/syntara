"""Database-backed validation for sub-workflow references."""

from collections.abc import Mapping
from typing import Any
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from syntara.workflows.models.validation_finding import ValidationCategory, ValidationFinding, ValidationSeverity
from syntara.workflows.models.workflow import Workflow
from syntara.workflows.models.workflow_version import WorkflowVersion
from syntara.workflows.workflow_engine.models.workflow_definition import NodeType, SubWorkflowExecutorParameters

NodeTarget = tuple[str | None, UUID, str]
TargetWorkflow = tuple[UUID, UUID | None, Mapping[str, Any] | None]


def _invalid_reference_finding(message: str, node_id: str | None, field_path: str) -> ValidationFinding:
    return ValidationFinding(
        severity=ValidationSeverity.error,
        category=ValidationCategory.invalid_reference,
        message=message,
        node_id=node_id,
        field_path=field_path,
    )


def _collect_subworkflow_targets(
    nodes: list[Any],
) -> tuple[list[NodeTarget], set[UUID], list[ValidationFinding]]:
    node_targets: list[NodeTarget] = []
    target_ids: set[UUID] = set()
    findings: list[ValidationFinding] = []

    for node in nodes:
        if not isinstance(node, dict) or node.get("type") != NodeType.SUB_WORKFLOW:
            continue

        parameters = node.get("parameters")
        workflow_id = parameters.get("workflow_id") if isinstance(parameters, dict) else None
        trigger_node_id = parameters.get("trigger_node_id") if isinstance(parameters, dict) else None
        node_id = node.get("id") if isinstance(node.get("id"), str) else None
        if not isinstance(workflow_id, str):
            findings.append(
                _invalid_reference_finding(
                    "A sub-workflow step must select a child workflow in this Project.",
                    node_id,
                    "parameters.workflow_id",
                )
            )
            continue

        try:
            SubWorkflowExecutorParameters.validate_workflow_id_format(workflow_id)
        except ValueError as exc:
            findings.append(_invalid_reference_finding(str(exc), node_id, "parameters.workflow_id"))
            continue

        if not isinstance(trigger_node_id, str):
            findings.append(
                _invalid_reference_finding(
                    "A sub-workflow step must select a Subworkflow Trigger in the child workflow.",
                    node_id,
                    "parameters.trigger_node_id",
                )
            )
            continue

        target_id = UUID(workflow_id)
        target_ids.add(target_id)
        node_targets.append((node_id, target_id, trigger_node_id))

    return node_targets, target_ids, findings


async def _load_target_workflows(
    session: AsyncSession,
    target_ids: set[UUID],
) -> dict[UUID, TargetWorkflow]:
    result = await session.exec(
        select(
            Workflow.id,
            Workflow.project_id,
            Workflow.published_version_id,
            WorkflowVersion.workflow_definition,
        )
        .outerjoin(WorkflowVersion, col(Workflow.published_version_id) == col(WorkflowVersion.id))
        .where(col(Workflow.id).in_(target_ids))
    )
    return {
        workflow_id: (target_project_id, published_version_id, workflow_definition)
        for workflow_id, target_project_id, published_version_id, workflow_definition in result.all()
    }


def _has_selected_subworkflow_trigger(definition: Mapping[str, Any] | None, trigger_node_id: str) -> bool:
    if not isinstance(definition, Mapping):
        return False

    triggers = definition.get("triggers")
    return isinstance(triggers, list) and any(
        isinstance(trigger, Mapping)
        and trigger.get("type") == NodeType.SUBWORKFLOW_TRIGGER
        and trigger.get("id") == trigger_node_id
        for trigger in triggers
    )


def _validate_target_workflow(
    target_workflow: TargetWorkflow | None,
    project_id: UUID,
    trigger_node_id: str,
    node_id: str | None,
) -> ValidationFinding | None:
    if target_workflow is None:
        return _invalid_reference_finding(
            "The selected child workflow is no longer available.", node_id, "parameters.workflow_id"
        )

    target_project_id, published_version_id, published_definition = target_workflow
    if target_project_id != project_id:
        return _invalid_reference_finding(
            "A sub-workflow step must reference a workflow in the same Project.", node_id, "parameters.workflow_id"
        )
    if published_version_id is None:
        return _invalid_reference_finding(
            "The selected child workflow must have a published version.", node_id, "parameters.workflow_id"
        )
    if not _has_selected_subworkflow_trigger(published_definition, trigger_node_id):
        return _invalid_reference_finding(
            "The selected Subworkflow Trigger is not available in the child workflow's published version.",
            node_id,
            "parameters.trigger_node_id",
        )

    return None


async def validate_subworkflow_project_references(
    session: AsyncSession,
    workflow_definition: dict[str, Any],
    project_id: UUID,
) -> list[ValidationFinding]:
    """Ensure each configured child workflow is invokable from the parent Project.

    Reuse the parameter model's UUID check because the service can receive raw
    workflow-definition dictionaries. Collect IDs first to batch the lookup.
    """
    nodes = workflow_definition.get("nodes", [])
    if not isinstance(nodes, list):
        return []

    node_targets, target_ids, findings = _collect_subworkflow_targets(nodes)
    if not target_ids:
        return findings

    target_workflows = await _load_target_workflows(session, target_ids)
    for node_id, target_id, trigger_node_id in node_targets:
        finding = _validate_target_workflow(target_workflows.get(target_id), project_id, trigger_node_id, node_id)
        if finding is not None:
            findings.append(finding)

    return findings
