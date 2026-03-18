"""Integration tests for periodic analytics collection flow.

Validates that:
1. _collect_and_send correctly queries, builds events, and sends them
   through TelemetryClientRegistry.send_event() using a real database.
2. Query functions produce correct SQL against a real PostgreSQL database
   with actual records, soft-delete filtering, and enum handling.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.agent_orchestrator.token_manager.models import TokenUsageRecord, UserTokenConfig
from nexus.core.models import User
from nexus.telemetry.client import TelemetryClientRegistry
from nexus.telemetry.periodic_collector import _collect_and_send
from nexus.telemetry.queries import (
    query_execution_counts,
    query_workflow_counts,
)
from nexus.workflows.models import Workflow, WorkflowVersion
from nexus.workflows.models.execution import Execution, ExecutionStatus


class TestPeriodicAnalyticsFlow:
    """Integration test: full periodic collection lifecycle with real database."""

    @pytest.fixture
    def registry_with_mock_client(
        self,
    ) -> tuple[TelemetryClientRegistry, MagicMock]:
        """Create a registry with a mock Segment client.

        Only the external Segment client is mocked - database queries are real.
        """
        registry = TelemetryClientRegistry()
        mock_client = MagicMock()
        registry._client = mock_client
        registry._anonymous_id = "test-anonymous-001"
        registry._entitlement_id = "test-entitlement-001"
        return registry, mock_client

    async def test_collect_and_send_produces_correct_segment_call(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        registry_with_mock_client: tuple[TelemetryClientRegistry, MagicMock],
        mock_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Full integration test: insert real data, run collector, verify Segment call."""
        registry, mock_client = registry_with_mock_client

        # Create workflows: 3 enabled, 2 disabled
        for i in range(3):
            wf = Workflow(
                name=f"enabled-wf-{i}",
                created_by=test_user.id,
                is_enabled=True,
                current_version=1,
            )
            test_db_session.add(wf)
            test_db_session.add(
                WorkflowVersion(
                    workflow_id=wf.id,
                    version=1,
                    schema_version="1.0.0",
                    workflow_definition=_wf_def(f"enabled-wf-{i}"),
                    created_by=test_user.id,
                )
            )
        for i in range(2):
            wf = Workflow(
                name=f"disabled-wf-{i}",
                created_by=test_user.id,
                is_enabled=False,
                current_version=1,
            )
            test_db_session.add(wf)
            test_db_session.add(
                WorkflowVersion(
                    workflow_id=wf.id,
                    version=1,
                    schema_version="1.0.0",
                    workflow_definition=_wf_def(f"disabled-wf-{i}"),
                    created_by=test_user.id,
                )
            )

        # Create a workflow and version for executions
        exec_wf = Workflow(
            name="exec-wf",
            created_by=test_user.id,
            is_enabled=True,
            current_version=1,
        )
        test_db_session.add(exec_wf)
        exec_version = WorkflowVersion(
            workflow_id=exec_wf.id,
            version=1,
            schema_version="1.0.0",
            workflow_definition=_wf_def("exec-wf"),
            created_by=test_user.id,
        )
        test_db_session.add(exec_version)
        await test_db_session.flush()

        # Create executions with various statuses
        now = datetime.now(UTC)
        completed_at = now + timedelta(seconds=60)
        executions = [
            Execution(
                workflow_id=exec_wf.id,
                workflow_version_id=exec_version.id,
                temporal_workflow_id=f"t-{uuid4()}",
                status=ExecutionStatus.COMPLETED,
                created_by=test_user.id,
                completed_at=completed_at,
                input_data={},
            ),
            Execution(
                workflow_id=exec_wf.id,
                workflow_version_id=exec_version.id,
                temporal_workflow_id=f"t-{uuid4()}",
                status=ExecutionStatus.COMPLETED,
                created_by=test_user.id,
                completed_at=completed_at,
                input_data={},
            ),
            Execution(
                workflow_id=exec_wf.id,
                workflow_version_id=exec_version.id,
                temporal_workflow_id=f"t-{uuid4()}",
                status=ExecutionStatus.FAILED,
                created_by=test_user.id,
                completed_at=completed_at,
                input_data={},
            ),
            Execution(
                workflow_id=exec_wf.id,
                workflow_version_id=exec_version.id,
                temporal_workflow_id=f"t-{uuid4()}",
                status=ExecutionStatus.RUNNING,
                created_by=test_user.id,
                input_data={},
            ),
        ]
        test_db_session.add_all(executions)

        # Create user token config (required for model_usage join)
        token_config = UserTokenConfig(
            user_id=test_user.id,
            token_limit=100000,
            window_duration_seconds=3600,
            model_name="gpt-4",
        )
        test_db_session.add(token_config)

        # Create token usage records with model_name captured at request time
        for i in range(5):
            record = TokenUsageRecord(
                user_id=test_user.id,
                token_count=1000 * (i + 1),
                model_name="gpt-4",
                request_timestamp=now,
            )
            test_db_session.add(record)

        await test_db_session.commit()

        # Run the collect_and_send function with real database queries
        await _collect_and_send(mock_session_factory, registry)

        # Verify Segment call
        mock_client.track.assert_called_once()
        call_kwargs = mock_client.track.call_args.kwargs

        assert call_kwargs["anonymous_id"] == "test-anonymous-001"
        assert call_kwargs["event"] == "system_analytics"

        props = call_kwargs["properties"]
        assert props["entitlement_id"] == "test-entitlement-001"

        # Verify workflow counts (3 enabled + 2 disabled + 1 exec_wf = 6 total, 4 enabled)
        assert props["workflows"]["total"] == 6
        assert props["workflows"]["enabled"] == 4
        assert props["workflows"]["disabled"] == 2

        # Verify execution counts
        assert props["executions"]["total"] == 4
        assert props["executions"]["completed"] == 2
        assert props["executions"]["failed"] == 1
        assert props["executions"]["running"] == 1

        # Credential counts are 0 until #ANSTRAT-1901 is implemented
        assert props["credentials"]["total"] == 0

        assert props["config"]["feature_flags_enabled"] == []

    async def test_no_state_between_cycles(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        registry_with_mock_client: tuple[TelemetryClientRegistry, MagicMock],
        mock_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Each collection cycle is independent — no delta tracking."""
        registry, mock_client = registry_with_mock_client

        # Create some test data
        wf = Workflow(
            name="test-wf",
            created_by=test_user.id,
            is_enabled=True,
            current_version=1,
        )
        test_db_session.add(wf)
        test_db_session.add(
            WorkflowVersion(
                workflow_id=wf.id,
                version=1,
                schema_version="1.0.0",
                workflow_definition=_wf_def("test-wf"),
                created_by=test_user.id,
            )
        )
        await test_db_session.commit()

        # Run twice
        await _collect_and_send(mock_session_factory, registry)
        await _collect_and_send(mock_session_factory, registry)

        # Both calls should send events with identical data (no deltas)
        assert mock_client.track.call_count == 2
        first_props = mock_client.track.call_args_list[0].kwargs["properties"]
        second_props = mock_client.track.call_args_list[1].kwargs["properties"]
        assert first_props == second_props

    async def test_empty_database_produces_zero_counts(
        self,
        test_db_session: AsyncSession,  # noqa: ARG002 - ensures tables are truncated
        registry_with_mock_client: tuple[TelemetryClientRegistry, MagicMock],
        mock_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Collector handles empty database gracefully."""
        registry, mock_client = registry_with_mock_client

        # No data inserted - database is empty (test_db_session ensures truncation)
        await _collect_and_send(mock_session_factory, registry)

        mock_client.track.assert_called_once()
        props = mock_client.track.call_args.kwargs["properties"]

        assert props["workflows"]["total"] == 0
        assert props["workflows"]["enabled"] == 0
        assert props["executions"]["total"] == 0
        assert props["credentials"]["total"] == 0

    async def test_soft_deleted_records_excluded(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        registry_with_mock_client: tuple[TelemetryClientRegistry, MagicMock],
        mock_session_factory: async_sessionmaker[AsyncSession],
    ) -> None:
        """Soft-deleted records are excluded from analytics."""
        registry, mock_client = registry_with_mock_client

        # Create an active workflow
        active_wf = Workflow(
            name="active-wf",
            created_by=test_user.id,
            is_enabled=True,
            current_version=1,
        )
        test_db_session.add(active_wf)
        test_db_session.add(
            WorkflowVersion(
                workflow_id=active_wf.id,
                version=1,
                schema_version="1.0.0",
                workflow_definition=_wf_def("active-wf"),
                created_by=test_user.id,
            )
        )

        # Create a soft-deleted workflow
        deleted_wf = Workflow(
            name="deleted-wf",
            created_by=test_user.id,
            is_enabled=True,
            current_version=1,
            deleted_at=datetime.now(UTC),
            deleted_by=test_user.id,
        )
        test_db_session.add(deleted_wf)
        test_db_session.add(
            WorkflowVersion(
                workflow_id=deleted_wf.id,
                version=1,
                schema_version="1.0.0",
                workflow_definition=_wf_def("deleted-wf"),
                created_by=test_user.id,
            )
        )

        await test_db_session.commit()

        await _collect_and_send(mock_session_factory, registry)

        props = mock_client.track.call_args.kwargs["properties"]

        # Only active records should be counted
        assert props["workflows"]["total"] == 1
        # Credential counts are 0 until #ANSTRAT-1901 is implemented
        assert props["credentials"]["total"] == 0


# ============================================================================
# Real-DB Query Integration Tests
# ============================================================================


_WF_DEF_TEMPLATE = {
    "schemaVersion": "1.0.0",
    "version": 1,
    "metadata": {"name": "placeholder"},
    "triggers": [{"type": "manual"}],
    "workflow": {"activities": []},
}


def _wf_def(name: str) -> dict[str, object]:
    """Build a minimal workflow definition dict."""
    return {**_WF_DEF_TEMPLATE, "metadata": {"name": name}}


class TestQueryWorkflowCountsRealDB:
    """Integration tests for query_workflow_counts against real PostgreSQL."""

    async def test_empty_database(self, test_db_session: AsyncSession):
        result = await query_workflow_counts(test_db_session)
        assert result.total == 0
        assert result.enabled == 0
        assert result.disabled == 0

    async def test_counts_enabled_and_disabled(self, test_db_session: AsyncSession, test_user: User):
        """Insert workflows with different is_enabled states and verify counts."""
        for i in range(3):
            wf = Workflow(
                name=f"enabled-wf-{i}",
                created_by=test_user.id,
                is_enabled=True,
                current_version=1,
            )
            test_db_session.add(wf)
            test_db_session.add(
                WorkflowVersion(
                    workflow_id=wf.id,
                    version=1,
                    schema_version="1.0.0",
                    workflow_definition=_wf_def(f"enabled-wf-{i}"),
                    created_by=test_user.id,
                )
            )
        for i in range(2):
            wf = Workflow(
                name=f"disabled-wf-{i}",
                created_by=test_user.id,
                is_enabled=False,
                current_version=1,
            )
            test_db_session.add(wf)
            test_db_session.add(
                WorkflowVersion(
                    workflow_id=wf.id,
                    version=1,
                    schema_version="1.0.0",
                    workflow_definition=_wf_def(f"disabled-wf-{i}"),
                    created_by=test_user.id,
                )
            )
        await test_db_session.commit()

        result = await query_workflow_counts(test_db_session)

        assert result.total == 5
        assert result.enabled == 3
        assert result.disabled == 2

    async def test_excludes_soft_deleted_workflows(self, test_db_session: AsyncSession, test_user: User):
        """Soft-deleted workflows must not be counted."""
        wf_active = Workflow(
            name="active-wf",
            created_by=test_user.id,
            is_enabled=True,
            current_version=1,
        )
        test_db_session.add(wf_active)
        test_db_session.add(
            WorkflowVersion(
                workflow_id=wf_active.id,
                version=1,
                schema_version="1.0.0",
                workflow_definition=_wf_def("active-wf"),
                created_by=test_user.id,
            )
        )

        wf_deleted = Workflow(
            name="deleted-wf",
            created_by=test_user.id,
            is_enabled=True,
            current_version=1,
            deleted_at=datetime.now(UTC),
            deleted_by=test_user.id,
        )
        test_db_session.add(wf_deleted)
        test_db_session.add(
            WorkflowVersion(
                workflow_id=wf_deleted.id,
                version=1,
                schema_version="1.0.0",
                workflow_definition=_wf_def("deleted-wf"),
                created_by=test_user.id,
            )
        )
        await test_db_session.commit()

        result = await query_workflow_counts(test_db_session)

        assert result.total == 1
        assert result.enabled == 1


class TestQueryExecutionCountsRealDB:
    """Integration tests for query_execution_counts against real PostgreSQL."""

    async def _get_version_id(self, session: AsyncSession, workflow: Workflow) -> object:
        """Get the first WorkflowVersion id for a workflow."""
        from sqlmodel import select

        return (await session.exec(select(WorkflowVersion.id).where(WorkflowVersion.workflow_id == workflow.id))).one()

    async def test_empty_database(self, test_db_session: AsyncSession):
        result = await query_execution_counts(test_db_session)
        assert result.total == 0
        assert result.avg_duration_seconds == 0.0

    async def test_counts_by_status(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        test_workflow: Workflow,
    ):
        """Insert executions with various statuses and verify group_by."""
        version_id = await self._get_version_id(test_db_session, test_workflow)

        completed_at = datetime.now(UTC) + timedelta(seconds=10)
        executions = [
            Execution(
                workflow_id=test_workflow.id,
                workflow_version_id=version_id,
                temporal_workflow_id=f"t-{uuid4()}",
                status=ExecutionStatus.COMPLETED,
                created_by=test_user.id,
                completed_at=completed_at,
                input_data={},
            ),
            Execution(
                workflow_id=test_workflow.id,
                workflow_version_id=version_id,
                temporal_workflow_id=f"t-{uuid4()}",
                status=ExecutionStatus.COMPLETED,
                created_by=test_user.id,
                completed_at=completed_at,
                input_data={},
            ),
            Execution(
                workflow_id=test_workflow.id,
                workflow_version_id=version_id,
                temporal_workflow_id=f"t-{uuid4()}",
                status=ExecutionStatus.FAILED,
                created_by=test_user.id,
                completed_at=completed_at,
                input_data={},
            ),
            Execution(
                workflow_id=test_workflow.id,
                workflow_version_id=version_id,
                temporal_workflow_id=f"t-{uuid4()}",
                status=ExecutionStatus.RUNNING,
                created_by=test_user.id,
                input_data={},
            ),
            Execution(
                workflow_id=test_workflow.id,
                workflow_version_id=version_id,
                temporal_workflow_id=f"t-{uuid4()}",
                status=ExecutionStatus.PENDING,
                created_by=test_user.id,
                input_data={},
            ),
        ]
        test_db_session.add_all(executions)
        await test_db_session.commit()

        result = await query_execution_counts(test_db_session)

        assert result.total == 5
        assert result.completed == 2
        assert result.failed == 1
        assert result.running == 1
        assert result.pending == 1

    async def test_avg_duration_calculation(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        test_workflow: Workflow,
    ):
        """Verify avg_duration_seconds from completed_at - created_at."""
        from sqlalchemy import update

        version_id = await self._get_version_id(test_db_session, test_workflow)

        now = datetime.now(UTC)
        # Two completed executions: 60s and 120s duration
        exec1 = Execution(
            workflow_id=test_workflow.id,
            workflow_version_id=version_id,
            temporal_workflow_id=f"t-{uuid4()}",
            status=ExecutionStatus.COMPLETED,
            created_by=test_user.id,
            input_data={},
            completed_at=now + timedelta(seconds=60),
        )
        exec2 = Execution(
            workflow_id=test_workflow.id,
            workflow_version_id=version_id,
            temporal_workflow_id=f"t-{uuid4()}",
            status=ExecutionStatus.COMPLETED,
            created_by=test_user.id,
            input_data={},
            completed_at=now + timedelta(seconds=120),
        )
        test_db_session.add_all([exec1, exec2])
        await test_db_session.flush()

        # Update created_at to `now` so durations are 60s and 120s
        await test_db_session.execute(update(Execution).where(Execution.id == exec1.id).values(created_at=now))  # type: ignore[arg-type]
        await test_db_session.execute(update(Execution).where(Execution.id == exec2.id).values(created_at=now))  # type: ignore[arg-type]
        await test_db_session.commit()

        result = await query_execution_counts(test_db_session)

        # avg of 60 and 120 = 90
        assert result.avg_duration_seconds == pytest.approx(90.0, abs=1.0)
