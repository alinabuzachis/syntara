"""Integration tests for project-scoped Sub-workflow references."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from syntara.authz.models.project import Project
from syntara.core.models import User
from syntara.workflows.exceptions import WorkflowNotPublishedError, WorkflowPublishValidationError
from syntara.workflows.models import Workflow
from syntara.workflows.models.validation_finding import ValidationCategory, ValidationResult
from syntara.workflows.models.workflow_version import WorkflowVersion
from syntara.workflows.services.workflow_service import WorkflowService
from syntara.workflows.validators import validate_subworkflow_project_references


def _definition_with_subworkflow(child_workflow_id: UUID) -> dict[str, Any]:
    """Build a valid-shaped definition containing one selected child workflow."""
    return {
        "schema_version": "2.0.0",
        "name": "parent-workflow",
        "triggers": [{"id": "manual", "type": "manual_trigger", "parameters": {}}],
        "nodes": [
            {
                "id": "call_child",
                "name": "Call child",
                "type": "sub_workflow",
                "parameters": {
                    "workflow_id": str(child_workflow_id),
                    "trigger_node_id": "child_entry",
                },
            }
        ],
        "edges": [{"from": "manual", "to": "call_child"}],
    }


def _definition_without_subworkflow() -> dict[str, Any]:
    """Build a valid definition for creating a parent before adding a child call."""
    return {
        "schema_version": "2.0.0",
        "name": "parent-workflow",
        "triggers": [{"id": "manual", "type": "manual_trigger", "parameters": {}}],
        "nodes": [
            {
                "id": "script",
                "name": "Script",
                "type": "script",
                "parameters": {"language": "python", "code": "pass"},
            }
        ],
        "edges": [{"from": "manual", "to": "script"}],
    }


async def _create_child_workflow(
    session: AsyncSession,
    user: User,
    project_id: UUID,
) -> Workflow:
    child = Workflow(
        name=f"child-{uuid4().hex[:8]}",
        created_by=user.id,
        project_id=project_id,
        current_version=1,
        is_enabled=False,
    )
    session.add(child)
    await session.flush()
    return child


def _valid_workflow_validator() -> MagicMock:
    validator = MagicMock()
    validator.collect_findings.return_value = ValidationResult(
        is_valid=True,
        error_count=0,
        warning_count=0,
        findings=[],
    )
    return validator


@pytest.mark.asyncio
async def test_subworkflow_reference_in_same_project_passes_validation(
    test_db_session: AsyncSession,
    test_user: User,
    test_project_id: UUID,
) -> None:
    child = await _create_child_workflow(test_db_session, test_user, test_project_id)

    findings = await validate_subworkflow_project_references(
        test_db_session,
        _definition_with_subworkflow(child.id),
        test_project_id,
    )

    assert findings == []


@pytest.mark.asyncio
async def test_cross_project_subworkflow_reference_returns_error_finding(
    test_db_session: AsyncSession,
    test_user: User,
    test_project_id: UUID,
) -> None:
    other_project = Project(name=f"other-project-{uuid4().hex[:8]}")
    test_db_session.add(other_project)
    await test_db_session.flush()
    child = await _create_child_workflow(test_db_session, test_user, other_project.id)

    findings = await validate_subworkflow_project_references(
        test_db_session,
        _definition_with_subworkflow(child.id),
        test_project_id,
    )

    assert len(findings) == 1
    finding = findings[0]
    assert finding.severity == "error"
    assert finding.category == ValidationCategory.invalid_reference
    assert finding.node_id == "call_child"
    assert finding.field_path == "parameters.workflow_id"
    assert "same Project" in finding.message


@pytest.mark.asyncio
async def test_cross_project_reference_is_reported_when_saved_and_blocks_publish(
    test_db_session: AsyncSession,
    test_user: User,
    test_project_id: UUID,
) -> None:
    other_project = Project(name=f"other-project-{uuid4().hex[:8]}")
    test_db_session.add(other_project)
    await test_db_session.flush()
    child = await _create_child_workflow(test_db_session, test_user, other_project.id)
    service = WorkflowService(test_db_session, test_user)

    with (
        patch(
            "syntara.workflows.services.workflow_service.workflow_validator",
            _valid_workflow_validator(),
        ),
        patch(
            "syntara.workflows.services.workflow_service.get_system_continue_on_failure",
            new_callable=AsyncMock,
            return_value=False,
        ),
    ):
        parent, _initial_version, _initial_validation = await service.create_workflow(
            name=f"parent-{uuid4().hex[:8]}",
            description=None,
            labels={},
            workflow_definition=_definition_without_subworkflow(),
            project_id=test_project_id,
        )

        version, validation_result = await service.create_workflow_version(
            parent,
            _definition_with_subworkflow(child.id),
            "Add cross-project sub-workflow reference",
        )

        assert version is not None
        assert parent.has_validation_issues is True
        assert validation_result.error_count == 1
        assert validation_result.findings[0].node_id == "call_child"
        assert validation_result.findings[0].field_path == "parameters.workflow_id"

        with pytest.raises(WorkflowPublishValidationError) as exc_info:
            await service.publish_workflow_version(workflow_id=parent.id, version=version.version)

    assert exc_info.value.validation_result.error_count == 1
    assert exc_info.value.validation_result.findings[0].category == ValidationCategory.invalid_reference


@pytest.mark.asyncio
async def test_same_project_reference_can_be_saved_and_published(
    test_db_session: AsyncSession,
    test_user: User,
    test_project_id: UUID,
) -> None:
    child = await _create_child_workflow(test_db_session, test_user, test_project_id)
    service = WorkflowService(test_db_session, test_user)

    with (
        patch(
            "syntara.workflows.services.workflow_service.workflow_validator",
            _valid_workflow_validator(),
        ),
        patch(
            "syntara.workflows.services.workflow_service.get_system_continue_on_failure",
            new_callable=AsyncMock,
            return_value=False,
        ),
    ):
        parent, version, validation_result = await service.create_workflow(
            name=f"parent-{uuid4().hex[:8]}",
            description=None,
            labels={},
            workflow_definition=_definition_with_subworkflow(child.id),
            project_id=test_project_id,
        )

        assert parent.has_validation_issues is False
        assert validation_result.error_count == 0

        webhook_service = MagicMock()
        webhook_service.return_value.sync_webhook_triggers = AsyncMock()
        with patch("syntara.workflows.services.workflow_service.WebhookTriggerService", webhook_service):
            published_workflow, published_version, _warning = await service.publish_workflow_version(
                workflow_id=parent.id,
                version=version.version,
            )

    assert published_workflow.published_version_id == published_version.id
    assert published_workflow.is_enabled is True


@pytest.mark.asyncio
async def test_invocation_schema_uses_published_version_and_filters_trigger_types(
    test_db_session: AsyncSession,
    test_user: User,
    test_project_id: UUID,
) -> None:
    workflow = Workflow(
        name=f"invocation-schema-{uuid4().hex[:8]}",
        created_by=test_user.id,
        project_id=test_project_id,
        current_version=2,
        is_enabled=False,
    )
    test_db_session.add(workflow)
    await test_db_session.flush()

    published_definition = {
        "triggers": [
            {"id": "manual", "type": "manual_trigger", "parameters": {}},
            {
                "id": "child_entry",
                "name": "Child Entry",
                "type": "subworkflow_trigger",
                "parameters": {
                    "input_schema": {
                        "type": "object",
                        "properties": {"username": {"type": "string"}},
                        "required": ["username"],
                    }
                },
            },
            {"id": "child_entry_empty", "type": "subworkflow_trigger", "parameters": {}},
        ]
    }
    published_version = WorkflowVersion(
        workflow_id=workflow.id,
        version=1,
        schema_version="2.0.0",
        workflow_definition=published_definition,
        created_by=test_user.id,
    )
    draft_version = WorkflowVersion(
        workflow_id=workflow.id,
        version=2,
        schema_version="2.0.0",
        workflow_definition={
            "triggers": [
                {
                    "id": "draft_only",
                    "name": "Draft Only",
                    "type": "subworkflow_trigger",
                    "parameters": {"input_schema": {"type": "object", "properties": {"draft": {"type": "boolean"}}}},
                }
            ]
        },
        created_by=test_user.id,
    )
    test_db_session.add_all([published_version, draft_version])
    await test_db_session.flush()
    workflow.published_version_id = published_version.id
    workflow.is_enabled = True
    await test_db_session.flush()

    result = await WorkflowService(test_db_session, test_user).get_workflow_invocation_schema(workflow)

    assert result.workflow_id == workflow.id
    assert result.published_version_id == published_version.id
    assert result.published_version == 1
    assert result.is_eligible is True
    assert [trigger.trigger_node_id for trigger in result.triggers] == ["child_entry", "child_entry_empty"]
    assert result.triggers[0].input_schema == {
        "type": "object",
        "properties": {"username": {"type": "string"}},
        "required": ["username"],
    }
    assert result.triggers[1].input_schema == {}


@pytest.mark.asyncio
async def test_invocation_schema_rejects_workflow_without_published_version(
    test_db_session: AsyncSession,
    test_user: User,
    test_project_id: UUID,
) -> None:
    workflow = Workflow(
        name=f"unpublished-{uuid4().hex[:8]}",
        created_by=test_user.id,
        project_id=test_project_id,
        current_version=1,
        is_enabled=False,
    )

    with pytest.raises(WorkflowNotPublishedError):
        await WorkflowService(test_db_session, test_user).get_workflow_invocation_schema(workflow)


@pytest.mark.asyncio
async def test_published_workflow_without_subworkflow_trigger_has_empty_invocation_schema(
    test_db_session: AsyncSession,
    test_user: User,
    test_project_id: UUID,
) -> None:
    workflow = Workflow(
        name=f"no-subworkflow-trigger-{uuid4().hex[:8]}",
        created_by=test_user.id,
        project_id=test_project_id,
        current_version=1,
        is_enabled=False,
    )
    test_db_session.add(workflow)
    await test_db_session.flush()

    version = WorkflowVersion(
        workflow_id=workflow.id,
        version=1,
        schema_version="2.0.0",
        workflow_definition={"triggers": [{"id": "manual", "type": "manual_trigger", "parameters": {}}]},
        created_by=test_user.id,
    )
    test_db_session.add(version)
    await test_db_session.flush()
    workflow.published_version_id = version.id
    workflow.is_enabled = True
    await test_db_session.flush()

    result = await WorkflowService(test_db_session, test_user).get_workflow_invocation_schema(workflow)

    assert result.published_version_id == version.id
    assert result.published_version == 1
    assert result.is_eligible is False
    assert result.triggers == []
