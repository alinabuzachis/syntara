"""Tests for execute_internal_activity."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from temporalio.exceptions import ApplicationError

from nexus.workflows.workflow_engine.activities.internal_activity import (
    execute_internal_activity,
)


class TestExecuteInternalActivity:
    """Tests for the internal_activity Temporal activity."""

    @pytest.mark.anyio
    async def test_missing_activity_key_raises(self) -> None:
        with pytest.raises(ApplicationError, match="requires 'activity' in config"):
            await execute_internal_activity({}, None)

    @pytest.mark.anyio
    async def test_unknown_activity_raises(self) -> None:
        with pytest.raises(ApplicationError, match="Unknown internal activity: bogus"):
            await execute_internal_activity({"activity": "bogus"}, None)

    @pytest.mark.anyio
    async def test_document_conversion_missing_file_id_raises(self) -> None:
        with pytest.raises(ApplicationError, match="requires 'file_id'"):
            await execute_internal_activity({"activity": "document_conversion", "input": {}}, None)

    @pytest.mark.anyio
    async def test_invocation_execution_missing_invocation_id_raises(self) -> None:
        with pytest.raises(ApplicationError, match="requires 'invocation_id'"):
            await execute_internal_activity({"activity": "invocation_execution", "input": {}}, None)

    @pytest.mark.anyio
    async def test_document_conversion_dispatches(self) -> None:
        file_id = uuid4()
        mock_handler = AsyncMock(return_value={"output": {"status": "SUCCESS"}})

        with patch.dict(
            "nexus.workflows.workflow_engine.activities.internal_activity._DISPATCH",
            {"document_conversion": mock_handler},
        ):
            result = await execute_internal_activity(
                {"activity": "document_conversion", "input": {"file_id": str(file_id)}},
                None,
            )

        assert result == {"output": {"status": "SUCCESS"}}
        mock_handler.assert_awaited_once_with({"file_id": str(file_id)})

    @pytest.mark.anyio
    async def test_invocation_execution_dispatches(self) -> None:
        inv_id = uuid4()
        mock_handler = AsyncMock(return_value={"output": {"status": "completed"}})

        with patch.dict(
            "nexus.workflows.workflow_engine.activities.internal_activity._DISPATCH",
            {"invocation_execution": mock_handler},
        ):
            result = await execute_internal_activity(
                {"activity": "invocation_execution", "input": {"invocation_id": str(inv_id)}},
                None,
            )

        assert result == {"output": {"status": "completed"}}
        mock_handler.assert_awaited_once_with({"invocation_id": str(inv_id)})
