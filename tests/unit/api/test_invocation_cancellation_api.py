"""Unit tests for invocation cancellation API endpoint."""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException, status

from nexus.agent_orchestrator.models.request import (
    CancellationResult,
    InvocationCancelRequest,
)
from nexus.api.v1.invocation import cancel_invocation


class TestInvocationCancellationAPI:
    """Test cancellation API endpoint business logic."""

    @pytest.mark.asyncio
    async def test_cancel_invocation_success(self, test_db_session, test_user) -> None:
        """Test successful invocation cancellation via API."""
        invocation_id = uuid4()
        request = InvocationCancelRequest(reason="Test cancellation")

        with patch("nexus.api.v1.invocation.InvocationService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.cancel_invocation.return_value = CancellationResult.SUCCESS
            mock_service_class.return_value = mock_service

            response = await cancel_invocation(
                invocation_id=str(invocation_id),
                request_body=request,
                db=test_db_session,
                current_user=test_user,
            )

            assert response.success is True
            mock_service.cancel_invocation.assert_called_once_with(invocation_id, "Test cancellation")

    @pytest.mark.asyncio
    async def test_cancel_invocation_not_found(self, test_db_session, test_user) -> None:
        """Test cancellation when invocation is not found."""
        invocation_id = uuid4()
        request = InvocationCancelRequest(reason="Test cancellation")

        with patch("nexus.api.v1.invocation.InvocationService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.cancel_invocation.return_value = CancellationResult.NOT_FOUND
            mock_service_class.return_value = mock_service

            with pytest.raises(HTTPException) as exc_info:
                await cancel_invocation(
                    invocation_id=str(invocation_id),
                    request_body=request,
                    db=test_db_session,
                    current_user=test_user,
                )

            assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND

    @pytest.mark.asyncio
    async def test_cancel_invocation_not_cancellable(self, test_db_session, test_user) -> None:
        """Test cancellation when invocation cannot be cancelled."""
        invocation_id = uuid4()
        request = InvocationCancelRequest(reason="Test cancellation")

        with patch("nexus.api.v1.invocation.InvocationService") as mock_service_class:
            mock_service = AsyncMock()
            mock_service.cancel_invocation.return_value = CancellationResult.NOT_CANCELLABLE
            mock_service_class.return_value = mock_service

            with pytest.raises(HTTPException) as exc_info:
                await cancel_invocation(
                    invocation_id=str(invocation_id),
                    request_body=request,
                    db=test_db_session,
                    current_user=test_user,
                )

            assert exc_info.value.status_code == status.HTTP_409_CONFLICT
