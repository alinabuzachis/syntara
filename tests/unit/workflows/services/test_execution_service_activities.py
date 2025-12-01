"""Unit tests for ExecutionService activity-related methods.

These tests verify:
- Activity retrieval and persistence logic
- Activity definition extraction from workflow definitions
- Recursive traversal of nested workflow structures
"""

from typing import Any
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.models.execution import Execution
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.services.execution_service import ExecutionService


class TestFetchActivityDefinitionsMap:
    """Test fetch_activity_definitions_map method for recursive activity extraction."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("workflow_def", "expected_activity_ids"),
        [
            # Simple flat workflow
            (
                {
                    "schemaVersion": "1.0.0",
                    "workflow": {
                        "activities": [
                            {"id": "activity_1", "type": "task", "task": {"executor": "script"}},
                            {"id": "activity_2", "type": "task", "task": {"executor": "api"}},
                        ]
                    },
                },
                ["activity_1", "activity_2"],
            ),
            # Sequence with nested steps
            (
                {
                    "schemaVersion": "1.0.0",
                    "workflow": {
                        "activities": [
                            {
                                "id": "sequence_1",
                                "type": "sequence",
                                "steps": [
                                    {"id": "step_1", "type": "task", "task": {"executor": "script"}},
                                    {"id": "step_2", "type": "task", "task": {"executor": "api"}},
                                    {"id": "step_3", "type": "task", "task": {"executor": "script"}},
                                ],
                            }
                        ]
                    },
                },
                ["sequence_1", "step_1", "step_2", "step_3"],
            ),
            # Parallel branches
            (
                {
                    "schemaVersion": "1.0.0",
                    "workflow": {
                        "activities": [
                            {
                                "id": "parallel_1",
                                "type": "parallel",
                                "branches": [
                                    {"id": "branch_1", "type": "task", "task": {"executor": "script"}},
                                    {"id": "branch_2", "type": "task", "task": {"executor": "api"}},
                                ],
                            }
                        ]
                    },
                },
                ["parallel_1", "branch_1", "branch_2"],
            ),
            # Loop with 'do' block
            (
                {
                    "schemaVersion": "1.0.0",
                    "workflow": {
                        "activities": [
                            {
                                "id": "loop_1",
                                "type": "loop",
                                "loop": {
                                    "count": 5,
                                    "do": [
                                        {"id": "loop_body_1", "type": "task", "task": {"executor": "script"}},
                                        {"id": "loop_body_2", "type": "task", "task": {"executor": "api"}},
                                    ],
                                },
                            }
                        ]
                    },
                },
                ["loop_1", "loop_body_1", "loop_body_2"],
            ),
            # Conditional with then/else branches
            (
                {
                    "schemaVersion": "1.0.0",
                    "workflow": {
                        "activities": [
                            {
                                "id": "condition_1",
                                "type": "condition",
                                "condition": "$.status == 'success'",
                                "then": [
                                    {"id": "then_activity", "type": "task", "task": {"executor": "script"}},
                                ],
                                "else": [
                                    {"id": "else_activity", "type": "task", "task": {"executor": "api"}},
                                ],
                            }
                        ]
                    },
                },
                ["condition_1", "then_activity", "else_activity"],
            ),
            # Deeply nested structures
            (
                {
                    "schemaVersion": "1.0.0",
                    "workflow": {
                        "activities": [
                            {
                                "id": "sequence_1",
                                "type": "sequence",
                                "steps": [
                                    {"id": "step_1", "type": "task", "task": {"executor": "script"}},
                                    {
                                        "id": "parallel_1",
                                        "type": "parallel",
                                        "branches": [
                                            {
                                                "id": "branch_1",
                                                "type": "sequence",
                                                "steps": [
                                                    {"id": "nested_1", "type": "task", "task": {"executor": "script"}},
                                                    {"id": "nested_2", "type": "task", "task": {"executor": "api"}},
                                                ],
                                            },
                                            {"id": "branch_2", "type": "task", "task": {"executor": "script"}},
                                        ],
                                    },
                                    {"id": "step_2", "type": "task", "task": {"executor": "api"}},
                                ],
                            }
                        ]
                    },
                },
                ["sequence_1", "step_1", "parallel_1", "branch_1", "branch_2", "nested_1", "nested_2", "step_2"],
            ),
        ],
    )
    async def test_fetch_activity_definitions_workflow_structures(
        self, workflow_def: dict[str, Any], expected_activity_ids: list[str]
    ) -> None:
        """Test extracting activities from various workflow structures."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        service = ExecutionService(session=mock_session, user=mock_user)

        version_id = uuid4()

        # Mock workflow version query
        workflow_version = Mock(spec=WorkflowVersion)
        workflow_version.workflow_definition = workflow_def

        mock_result = Mock()
        mock_result.one_or_none = Mock(return_value=workflow_version)
        mock_session.exec = AsyncMock(return_value=mock_result)

        # Execute
        result = await service.fetch_activity_definitions_map(version_id)

        # Verify all expected activities are extracted
        assert len(result) == len(expected_activity_ids)
        for activity_id in expected_activity_ids:
            assert activity_id in result

    @pytest.mark.asyncio
    async def test_fetch_activity_definitions_no_workflow_version(self) -> None:
        """Test returns empty dict when workflow version not found."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        service = ExecutionService(session=mock_session, user=mock_user)

        version_id = uuid4()

        # Mock workflow version not found
        mock_result = Mock()
        mock_result.one_or_none = Mock(return_value=None)
        mock_session.exec = AsyncMock(return_value=mock_result)

        # Execute
        result = await service.fetch_activity_definitions_map(version_id)

        # Verify
        assert result == {}

    @pytest.mark.asyncio
    async def test_fetch_activity_definitions_empty_workflow(self) -> None:
        """Test returns empty dict for workflow with no activities."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        service = ExecutionService(session=mock_session, user=mock_user)

        version_id = uuid4()
        workflow_def = {"schemaVersion": "1.0.0", "workflow": {"activities": []}}

        # Mock workflow version query
        workflow_version = Mock(spec=WorkflowVersion)
        workflow_version.workflow_definition = workflow_def

        mock_result = Mock()
        mock_result.one_or_none = Mock(return_value=workflow_version)
        mock_session.exec = AsyncMock(return_value=mock_result)

        # Execute
        result = await service.fetch_activity_definitions_map(version_id)

        # Verify
        assert result == {}


class TestGetExecutionActivities:
    """Test get_execution_activities method for activity retrieval and persistence."""

    @pytest.mark.asyncio
    async def test_get_execution_activities_returns_db_when_temporal_unavailable(self) -> None:
        """Test that existing DB activities are returned when Temporal is unavailable."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        execution_id = uuid4()
        execution = Mock(spec=Execution)
        execution.id = execution_id

        # Mock get_execution (first exec call)
        mock_exec_result = Mock()
        mock_exec_result.one_or_none = Mock(return_value=execution)

        # Mock existing activities query (second exec call)
        existing_activities = [
            ActivityExecution(
                id=uuid4(),
                execution_id=execution_id,
                activity_name="activity_1",
                temporal_activity_id="temporal-1",
                status=ActivityStatus.COMPLETED,
            ),
            ActivityExecution(
                id=uuid4(),
                execution_id=execution_id,
                activity_name="activity_2",
                temporal_activity_id="temporal-2",
                status=ActivityStatus.FAILED,
            ),
        ]

        mock_activities_result = Mock()
        mock_activities_result.all = Mock(return_value=existing_activities)

        # Setup exec to return different results based on call order
        mock_session.exec = AsyncMock(side_effect=[mock_exec_result, mock_activities_result])

        # Execute
        result = await service.get_execution_activities(execution_id)

        # Verify
        assert len(result) == 2
        assert result[0].activity_name == "activity_1"
        assert result[1].activity_name == "activity_2"

    @pytest.mark.asyncio
    async def test_get_execution_activities_returns_empty_when_no_activities(self) -> None:
        """Test that empty list is returned when no activities exist."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        execution_id = uuid4()
        execution = Mock(spec=Execution)
        execution.id = execution_id

        # Mock get_execution (first exec call)
        mock_exec_result = Mock()
        mock_exec_result.one_or_none = Mock(return_value=execution)

        # Mock empty activities query (second exec call)
        mock_activities_result = Mock()
        mock_activities_result.all = Mock(return_value=[])

        mock_session.exec = AsyncMock(side_effect=[mock_exec_result, mock_activities_result])

        # Execute
        result = await service.get_execution_activities(execution_id)

        # Verify
        assert result == []
