"""Unit tests for InvocationService cancellation functionality."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from nexus.agent_orchestrator.models import InvocationStatus
from nexus.agent_orchestrator.models.request import CancellationResult
from nexus.agent_orchestrator.services.invocation_service import InvocationService


class TestInvocationServiceCancellation:
    """Test core cancellation business logic."""

    @pytest.mark.asyncio
    async def test_cancel_invocation_success(self, test_user) -> None:
        """Test successful cancellation of running invocation."""
        mock_session = AsyncMock()
        service = InvocationService(mock_session, test_user)
        invocation_id = uuid4()

        # Setup: Running invocation owned by user
        mock_invocation = MagicMock()
        mock_invocation.created_by = test_user.id
        mock_invocation.status = InvocationStatus.RUNNING
        mock_invocation.checkpoint_data = None
        mock_session.get.return_value = mock_invocation

        result = await service.cancel_invocation(invocation_id, "Test cancellation")

        assert result == CancellationResult.SUCCESS
        assert mock_invocation.status == InvocationStatus.CANCELLED
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_cancel_invocation_not_found(self, test_user) -> None:
        """Test cancellation when invocation doesn't exist."""
        mock_session = AsyncMock()
        service = InvocationService(mock_session, test_user)
        invocation_id = uuid4()

        mock_session.get.return_value = None

        result = await service.cancel_invocation(invocation_id)

        assert result == CancellationResult.NOT_FOUND
        mock_session.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_cancel_invocation_not_cancellable(self, test_user) -> None:
        """Test cancellation when invocation is already completed."""
        mock_session = AsyncMock()
        service = InvocationService(mock_session, test_user)
        invocation_id = uuid4()

        # Setup: Completed invocation owned by user
        mock_invocation = MagicMock()
        mock_invocation.created_by = test_user.id
        mock_invocation.status = InvocationStatus.COMPLETED
        mock_session.get.return_value = mock_invocation

        result = await service.cancel_invocation(invocation_id)

        assert result == CancellationResult.NOT_CANCELLABLE
        mock_session.commit.assert_not_called()
