"""Unit tests for seed_builtin_workflows."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_publish_event import WorkflowPublishEvent
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.seed_builtin import _BUILTIN_DEFINITIONS, seed_builtin_workflows

if TYPE_CHECKING:
    from collections.abc import Generator


def _mock_session(*results: object) -> AsyncMock:
    """Create a mock session whose .exec() returns results in sequence."""
    session = AsyncMock()
    mock_results = []
    for result in results:
        mock_result = MagicMock()
        if result is None:
            mock_result.first.return_value = None
            mock_result.one_or_none.return_value = None
        else:
            mock_result.first.return_value = result
            mock_result.one_or_none.return_value = result
        mock_results.append(mock_result)
    session.exec.side_effect = mock_results
    return session


def _mock_admin() -> MagicMock:
    admin = MagicMock()
    admin.id = uuid4()
    return admin


def _mock_project() -> MagicMock:
    project = MagicMock()
    project.id = uuid4()
    return project


class TestSeedBuiltinWorkflows:
    """Test suite for seed_builtin_workflows."""

    @pytest.fixture(autouse=True)
    def _patch_validator(self) -> Generator[MagicMock, None, None]:
        with patch("nexus.workflows.seed_builtin.workflow_validator") as mock_v:
            self.mock_validator = mock_v
            yield mock_v

    @pytest.mark.asyncio
    async def test_raises_when_no_admin_user(self) -> None:
        session = _mock_session(None)
        with pytest.raises(RuntimeError, match="No admin user found"):
            await seed_builtin_workflows(session)

    @pytest.mark.asyncio
    async def test_raises_when_no_builtin_project(self) -> None:
        session = _mock_session(_mock_admin(), None)
        with pytest.raises(RuntimeError, match="Built-in project not found"):
            await seed_builtin_workflows(session)

    @pytest.mark.asyncio
    async def test_creates_all_builtin_workflows(self) -> None:
        admin, project = _mock_admin(), _mock_project()
        # exec sequence per definition: admin (shared), project (shared),
        # then for each definition: existing workflow lookup (None = new)
        session = _mock_session(admin, project, *[None] * len(_BUILTIN_DEFINITIONS))

        await seed_builtin_workflows(session)

        add_calls = session.add.call_args_list
        workflows_added = [c[0][0] for c in add_calls if isinstance(c[0][0], Workflow)]
        versions_added = [c[0][0] for c in add_calls if isinstance(c[0][0], WorkflowVersion)]

        assert len(workflows_added) == len(_BUILTIN_DEFINITIONS)
        assert len(versions_added) == len(_BUILTIN_DEFINITIONS)

        for wf in workflows_added:
            assert wf.is_builtin is True
            assert wf.published_version_id is not None
            assert wf.project_id == project.id
            assert wf.created_by == admin.id

        for ver in versions_added:
            assert ver.version == 1

        # Verify WorkflowPublishEvent was added for each workflow
        publish_events_added = [c[0][0] for c in add_calls if isinstance(c[0][0], WorkflowPublishEvent)]
        assert len(publish_events_added) == len(_BUILTIN_DEFINITIONS)

        created_names = {wf.name for wf in workflows_added}
        expected_names = {d["name"] for d in _BUILTIN_DEFINITIONS}
        assert created_names == expected_names

        session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_skips_unchanged_workflow(self) -> None:
        first_def = _BUILTIN_DEFINITIONS[0]

        existing = MagicMock(spec=Workflow)
        existing.id = uuid4()
        existing.current_version = 1
        existing.project_id = uuid4()

        cur_ver = MagicMock(spec=WorkflowVersion)
        cur_ver.workflow_definition = first_def

        # admin, project, existing workflow, current version, then remaining defs as new
        session = _mock_session(
            _mock_admin(), _mock_project(), existing, cur_ver, *[None] * (len(_BUILTIN_DEFINITIONS) - 1)
        )

        await seed_builtin_workflows(session)

        # Only the remaining (non-first) definitions should create new workflows
        workflows_added = [c[0][0] for c in session.add.call_args_list if isinstance(c[0][0], Workflow)]
        assert len(workflows_added) == len(_BUILTIN_DEFINITIONS) - 1

    @pytest.mark.asyncio
    async def test_updates_changed_workflow(self) -> None:
        first_def = _BUILTIN_DEFINITIONS[0]
        old_def = {**first_def, "description": "Old description"}

        existing = MagicMock(spec=Workflow)
        existing.id = uuid4()
        existing.current_version = 1
        existing.project_id = uuid4()
        existing.increment_version.return_value = 2

        cur_ver = MagicMock(spec=WorkflowVersion)
        cur_ver.workflow_definition = old_def

        # admin, project, existing workflow, current version, then remaining defs as new
        session = _mock_session(
            _mock_admin(), _mock_project(), existing, cur_ver, *[None] * (len(_BUILTIN_DEFINITIONS) - 1)
        )

        await seed_builtin_workflows(session)

        versions_added = [c[0][0] for c in session.add.call_args_list if isinstance(c[0][0], WorkflowVersion)]
        updated_version = next(v for v in versions_added if v.version == 2)
        assert updated_version.workflow_definition == first_def
        assert existing.published_version_id == updated_version.id

        # Verify WorkflowPublishEvent was added for the updated version
        publish_events = [c[0][0] for c in session.add.call_args_list if isinstance(c[0][0], WorkflowPublishEvent)]
        assert any(e.version_id == updated_version.id for e in publish_events)

    @pytest.mark.asyncio
    async def test_failed_seed_continues_to_next(self) -> None:
        self.mock_validator.validate_workflow_definition.side_effect = [
            ValueError("bad"),
            *[None] * (len(_BUILTIN_DEFINITIONS) - 1),
        ]
        session = _mock_session(_mock_admin(), _mock_project(), *[None] * (len(_BUILTIN_DEFINITIONS) - 1))

        await seed_builtin_workflows(session)

        workflows_added = [c[0][0] for c in session.add.call_args_list if isinstance(c[0][0], Workflow)]
        assert len(workflows_added) == len(_BUILTIN_DEFINITIONS) - 1

    @pytest.mark.asyncio
    async def test_definitions_are_valid(self) -> None:
        """Sanity check that embedded definitions have required fields."""
        for defn in _BUILTIN_DEFINITIONS:
            assert "name" in defn
            assert "schema_version" in defn
            assert "triggers" in defn
            assert "nodes" in defn
            assert "edges" in defn
