"""Unit tests for WorkflowApiClient."""

from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import Never
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import httpx
import pytest

from nexus.approvals.clients.workflow_client import WorkflowApiClient


class TestWorkflowApiClient:
    """Test WorkflowApiClient functionality."""

    def _create_server_error_mock(self) -> AsyncMock:
        """Create a mock response that raises HTTPStatusError with 500 status."""
        mock_error_response = AsyncMock()
        mock_error_response.status_code = 500

        def error_side_effect() -> Never:
            error_message = "Server Error"
            raise httpx.HTTPStatusError(error_message, request=AsyncMock(), response=mock_error_response)

        mock_error_response.raise_for_status = Mock(side_effect=error_side_effect)
        return mock_error_response

    @pytest.mark.usefixtures("fast_workflow_client_settings")
    async def test_send_approval_signal_success(self) -> None:
        """Test successful approval signal sending."""
        execution_id = uuid4()
        approval_node_id = "approval-node-1"
        status = "approved"
        approval_id = uuid4()
        notes = "Approved by test"

        with patch("nexus.approvals.clients.workflow_client.generate_activity_signal_url") as mock_generate_url:
            mock_generate_url.return_value = "http://localhost:8000/api/v1/signal"

            # Mock successful HTTP response
            mock_response = AsyncMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = Mock()

            with patch("httpx.AsyncClient.post") as mock_post:
                mock_post.return_value = mock_response

                async with WorkflowApiClient() as client:
                    await client.send_approval_signal(
                        execution_id=execution_id,
                        approval_node_id=approval_node_id,
                        status=status,
                        approval_id=approval_id,
                        notes=notes,
                    )

                # Verify the signal URL was generated correctly
                mock_generate_url.assert_called_once_with(execution_id, approval_node_id)

                # Verify the HTTP request was made correctly
                mock_post.assert_called_once_with(
                    "http://localhost:8000/api/v1/signal",
                    json={
                        "signal_data": {
                            "status": status,
                            "approval_id": str(approval_id),
                            "notes": notes,
                        }
                    },
                    headers={"Content-Type": "application/json"},
                )

                # Verify response was checked for success
                mock_response.raise_for_status.assert_called_once()

    @pytest.mark.usefixtures("fast_workflow_client_settings")
    async def test_send_approval_signal_success_after_retries(self) -> None:
        """Test successful approval signal sending after retries."""
        execution_id = uuid4()
        approval_node_id = "approval-node-1"
        status = "rejected"
        approval_id = uuid4()

        with patch("nexus.approvals.clients.workflow_client.generate_activity_signal_url") as mock_generate_url:
            mock_generate_url.return_value = "http://localhost:8000/api/v1/signal"

            # First call fails with server error, second succeeds
            mock_error_response = AsyncMock()
            mock_error_response.status_code = 500

            def error_side_effect() -> Never:
                error_message = "Server Error"
                raise httpx.HTTPStatusError(error_message, request=AsyncMock(), response=mock_error_response)

            mock_error_response.raise_for_status = Mock(side_effect=error_side_effect)

            mock_success_response = AsyncMock()
            mock_success_response.status_code = 200
            mock_success_response.raise_for_status = Mock()

            with patch("httpx.AsyncClient.post") as mock_post:
                mock_post.side_effect = [mock_error_response, mock_success_response]

                with patch("asyncio.sleep") as mock_sleep:
                    async with WorkflowApiClient() as client:
                        await client.send_approval_signal(
                            execution_id=execution_id,
                            approval_node_id=approval_node_id,
                            status=status,
                            approval_id=approval_id,
                        )

                # Should have made 2 requests (1 failure + 1 success)
                assert mock_post.call_count == 2

                # Verify sleep was called for backoff
                mock_sleep.assert_called_once()

                # Verify final success response was checked
                mock_success_response.raise_for_status.assert_called_once()

    @pytest.mark.usefixtures("fast_workflow_client_settings")
    async def test_send_approval_signal_failure_retries_exhausted(self) -> None:
        """Test approval signal failure after exhausting retries."""
        execution_id = uuid4()
        approval_node_id = "approval-node-1"
        status = "approved"
        approval_id = uuid4()

        with patch("nexus.approvals.clients.workflow_client.generate_activity_signal_url") as mock_generate_url:
            mock_generate_url.return_value = "http://localhost:8000/api/v1/signal"
            mock_error_response = self._create_server_error_mock()

            with patch("httpx.AsyncClient.post") as mock_post:
                mock_post.return_value = mock_error_response

                with patch("asyncio.sleep") as mock_sleep:
                    async with WorkflowApiClient() as client:
                        with pytest.raises(httpx.HTTPStatusError, match="Server Error"):
                            await client.send_approval_signal(
                                execution_id=execution_id,
                                approval_node_id=approval_node_id,
                                status=status,
                                approval_id=approval_id,
                            )

                # Should have made max_retries + 1 requests (2 in fast settings)
                assert mock_post.call_count == 3

                # Should have slept max_retries times (2 times for fast settings)
                assert mock_sleep.call_count == 2

    async def test_send_approval_signal_failure_no_retries(
        self, override_settings: Callable[..., AbstractContextManager[object]]
    ) -> None:
        """Test approval signal failure with max_retries=0."""
        execution_id = uuid4()
        approval_node_id = "approval-node-1"
        status = "approved"
        approval_id = uuid4()

        with (
            override_settings(workflow_client_max_retries=0),
            patch("nexus.approvals.clients.workflow_client.generate_activity_signal_url") as mock_generate_url,
        ):
            mock_generate_url.return_value = "http://localhost:8000/api/v1/signal"
            mock_error_response = self._create_server_error_mock()

            with patch("httpx.AsyncClient.post") as mock_post:
                mock_post.return_value = mock_error_response

                with patch("asyncio.sleep") as mock_sleep:
                    async with WorkflowApiClient() as client:
                        with pytest.raises(httpx.HTTPStatusError, match="Server Error"):
                            await client.send_approval_signal(
                                execution_id=execution_id,
                                approval_node_id=approval_node_id,
                                status=status,
                                approval_id=approval_id,
                            )

                    # Should have made only 1 request (no retries)
                    assert mock_post.call_count == 1

                    # Should not have slept (no retries)
                    mock_sleep.assert_not_called()

    @pytest.mark.usefixtures("fast_workflow_client_settings")
    async def test_send_approval_signal_failure_non_retryable_error(self) -> None:
        """Test approval signal failure with non-retryable error."""
        execution_id = uuid4()
        approval_node_id = "approval-node-1"
        status = "rejected"
        approval_id = uuid4()

        with patch("nexus.approvals.clients.workflow_client.generate_activity_signal_url") as mock_generate_url:
            mock_generate_url.return_value = "http://localhost:8000/api/v1/signal"

            # Client error (4xx) - not retryable
            mock_error_response = AsyncMock()
            mock_error_response.status_code = 400

            def error_side_effect() -> Never:
                error_message = "Bad Request"
                raise httpx.HTTPStatusError(error_message, request=AsyncMock(), response=mock_error_response)

            mock_error_response.raise_for_status = Mock(side_effect=error_side_effect)

            with patch("httpx.AsyncClient.post") as mock_post:
                mock_post.return_value = mock_error_response

                with patch("asyncio.sleep") as mock_sleep:
                    async with WorkflowApiClient() as client:
                        with pytest.raises(httpx.HTTPStatusError, match="Bad Request"):
                            await client.send_approval_signal(
                                execution_id=execution_id,
                                approval_node_id=approval_node_id,
                                status=status,
                                approval_id=approval_id,
                            )

                # Should have made only 1 request (no retries for client errors)
                mock_post.assert_called_once()

                # Should not have slept (no retries)
                mock_sleep.assert_not_called()

    async def test_is_retryable_error_server_errors(self) -> None:
        """Test that server errors (5xx) are retryable."""
        async with WorkflowApiClient() as client:
            # 500 Server Error
            mock_response = AsyncMock()
            mock_response.status_code = 500
            error_message = "Server Error"
            server_error = httpx.HTTPStatusError(error_message, request=AsyncMock(), response=mock_response)
            assert client._is_retryable_error(server_error)

            # 502 Bad Gateway
            mock_response.status_code = 502
            error_message = "Bad Gateway"
            bad_gateway = httpx.HTTPStatusError(error_message, request=AsyncMock(), response=mock_response)
            assert client._is_retryable_error(bad_gateway)

    async def test_is_retryable_error_client_errors(self) -> None:
        """Test that client errors (4xx) are not retryable."""
        async with WorkflowApiClient() as client:
            # 400 Bad Request
            mock_response = AsyncMock()
            mock_response.status_code = 400
            error_message = "Bad Request"
            client_error = httpx.HTTPStatusError(error_message, request=AsyncMock(), response=mock_response)
            assert not client._is_retryable_error(client_error)

            # 404 Not Found
            mock_response.status_code = 404
            error_message = "Not Found"
            not_found = httpx.HTTPStatusError(error_message, request=AsyncMock(), response=mock_response)
            assert not client._is_retryable_error(not_found)

    async def test_is_retryable_error_connection_errors(self) -> None:
        """Test that connection and timeout errors are retryable."""
        async with WorkflowApiClient() as client:
            # Connection error
            error_message = "Connection failed"
            connect_error = httpx.ConnectError(error_message)
            assert client._is_retryable_error(connect_error)

            # Timeout error
            error_message = "Request timeout"
            timeout_error = httpx.TimeoutException(error_message)
            assert client._is_retryable_error(timeout_error)

    async def test_is_retryable_error_other_errors(self) -> None:
        """Test that other errors are not retryable."""
        async with WorkflowApiClient() as client:
            # Generic ValueError
            error_message = "Invalid value"
            value_error = ValueError(error_message)
            assert not client._is_retryable_error(value_error)

            # Generic RuntimeError
            error_message = "Runtime error"
            runtime_error = RuntimeError(error_message)
            assert not client._is_retryable_error(runtime_error)

    async def test_context_manager_cleanup(self) -> None:
        """Test that the async context manager properly cleans up HTTP client."""
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client

            async with WorkflowApiClient() as client:
                assert client.http_client == mock_client

            # Verify the HTTP client was closed
            mock_client.aclose.assert_called_once()
