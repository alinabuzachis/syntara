"""Tests for wait activity and complete_wait local activity."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from temporalio.exceptions import ApplicationError
from temporalio.service import RPCError, RPCStatusCode

from nexus.workflows.workflow_engine.activities.wait_activity import complete_wait, wait
from tests.helpers.temporal import CompleteAsyncError

SETTINGS_PATH = "nexus.workflows.workflow_engine.activities.wait_activity.get_runtime_settings"


def _mock_settings(max_wait_seconds: int = 2592000) -> MagicMock:
    """Create a mock settings cache that returns the given max wait."""
    mock_cache = MagicMock()
    mock_cache.get_int = AsyncMock(return_value=max_wait_seconds)
    return MagicMock(return_value=mock_cache)


class TestWaitValidDuration:
    """Valid duration configs raise CompleteAsyncError (async completion)."""

    @pytest.mark.asyncio
    async def test_hours_and_minutes(self) -> None:
        with patch(SETTINGS_PATH, _mock_settings()), pytest.raises(CompleteAsyncError):
            await wait({"days": 0, "hours": 1, "minutes": 30, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_days_only(self) -> None:
        with patch(SETTINGS_PATH, _mock_settings()), pytest.raises(CompleteAsyncError):
            await wait({"days": 2, "hours": 0, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_seconds_only(self) -> None:
        with patch(SETTINGS_PATH, _mock_settings()), pytest.raises(CompleteAsyncError):
            await wait({"days": 0, "hours": 0, "minutes": 0, "seconds": 30}, None)

    @pytest.mark.asyncio
    async def test_all_fields_combined(self) -> None:
        with patch(SETTINGS_PATH, _mock_settings()), pytest.raises(CompleteAsyncError):
            await wait({"days": 1, "hours": 2, "minutes": 3, "seconds": 4}, None)

    @pytest.mark.asyncio
    async def test_minimum_one_second(self) -> None:
        with patch(SETTINGS_PATH, _mock_settings()), pytest.raises(CompleteAsyncError):
            await wait({"days": 0, "hours": 0, "minutes": 0, "seconds": 1}, None)


class TestWaitZeroDuration:
    """Zero total duration raises ApplicationError."""

    @pytest.mark.asyncio
    async def test_all_zeros_raises_application_error(self) -> None:
        with pytest.raises(ApplicationError, match="greater than zero") as exc_info:
            await wait({"days": 0, "hours": 0, "minutes": 0, "seconds": 0}, None)
        assert exc_info.value.type == "ConfigError"
        assert exc_info.value.non_retryable is True


class TestWaitNegativeValues:
    """Negative values raise ApplicationError."""

    @pytest.mark.asyncio
    async def test_negative_days(self) -> None:
        with pytest.raises(ApplicationError, match="'days'") as exc_info:
            await wait({"days": -1, "hours": 0, "minutes": 0, "seconds": 0}, None)
        assert exc_info.value.type == "ConfigError"

    @pytest.mark.asyncio
    async def test_negative_hours(self) -> None:
        with pytest.raises(ApplicationError, match="'hours'"):
            await wait({"days": 0, "hours": -1, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_negative_minutes(self) -> None:
        with pytest.raises(ApplicationError, match="'minutes'"):
            await wait({"days": 0, "hours": 0, "minutes": -5, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_negative_seconds(self) -> None:
        with pytest.raises(ApplicationError, match="'seconds'"):
            await wait({"days": 0, "hours": 0, "minutes": 0, "seconds": -10}, None)


class TestWaitInvalidTypes:
    """Non-integer values raise ApplicationError."""

    @pytest.mark.asyncio
    async def test_string_value(self) -> None:
        with pytest.raises(ApplicationError, match="'days'"):
            await wait({"days": "two", "hours": 0, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_float_value(self) -> None:
        with pytest.raises(ApplicationError, match="'hours'"):
            await wait({"days": 0, "hours": 1.5, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_none_value(self) -> None:
        with pytest.raises(ApplicationError, match="'hours'"):
            await wait({"days": 0, "hours": None, "minutes": 0, "seconds": 0}, None)


class TestWaitBoolValues:
    """Boolean values are rejected (bool is subclass of int in Python)."""

    @pytest.mark.asyncio
    async def test_bool_true_rejected(self) -> None:
        with pytest.raises(ApplicationError, match="'days'"):
            await wait({"days": True, "hours": 0, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_bool_false_rejected(self) -> None:
        with pytest.raises(ApplicationError, match="'hours'"):
            await wait({"days": 0, "hours": False, "minutes": 0, "seconds": 0}, None)


class TestWaitFieldMaxBounds:
    """Values exceeding per-field maximums are rejected (hours, minutes, seconds)."""

    @pytest.mark.asyncio
    async def test_hours_exceeds_max(self) -> None:
        with pytest.raises(ApplicationError, match=r"'hours'.*between 0 and 23"):
            await wait({"days": 0, "hours": 24, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_minutes_exceeds_max(self) -> None:
        with pytest.raises(ApplicationError, match=r"'minutes'.*between 0 and 59"):
            await wait({"days": 0, "hours": 0, "minutes": 60, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_seconds_exceeds_max(self) -> None:
        with pytest.raises(ApplicationError, match=r"'seconds'.*between 0 and 59"):
            await wait({"days": 0, "hours": 0, "minutes": 0, "seconds": 60}, None)


class TestWaitGlobalMaxDuration:
    """Total duration is checked against the global settings max."""

    @pytest.mark.asyncio
    async def test_exceeds_global_max(self) -> None:
        """Duration exceeding the configured max raises ApplicationError."""
        with (
            patch(SETTINGS_PATH, _mock_settings(max_wait_seconds=3600)),
            pytest.raises(ApplicationError, match="exceeds maximum allowed") as exc_info,
        ):
            await wait({"days": 1, "hours": 0, "minutes": 0, "seconds": 0}, None)
        assert exc_info.value.type == "ConfigError"
        assert exc_info.value.non_retryable is True

    @pytest.mark.asyncio
    async def test_at_global_max_is_valid(self) -> None:
        """Duration exactly at the max passes."""
        with patch(SETTINGS_PATH, _mock_settings(max_wait_seconds=3600)), pytest.raises(CompleteAsyncError):
            await wait({"days": 0, "hours": 1, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_below_global_max_is_valid(self) -> None:
        """Duration below the max passes."""
        with patch(SETTINGS_PATH, _mock_settings(max_wait_seconds=86400)), pytest.raises(CompleteAsyncError):
            await wait({"days": 0, "hours": 1, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_large_days_within_global_max(self) -> None:
        """Large day values are allowed if within the global max."""
        with patch(SETTINGS_PATH, _mock_settings(max_wait_seconds=2592000)), pytest.raises(CompleteAsyncError):
            await wait({"days": 30, "hours": 0, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_large_days_exceeding_global_max(self) -> None:
        """Large day values exceeding global max are rejected."""
        with (
            patch(SETTINGS_PATH, _mock_settings(max_wait_seconds=2592000)),
            pytest.raises(ApplicationError, match="exceeds maximum"),
        ):
            await wait({"days": 31, "hours": 0, "minutes": 0, "seconds": 0}, None)


class TestWaitMissingFields:
    """Missing fields default to 0."""

    @pytest.mark.asyncio
    async def test_missing_days_defaults_to_zero(self) -> None:
        with patch(SETTINGS_PATH, _mock_settings()), pytest.raises(CompleteAsyncError):
            await wait({"hours": 1, "minutes": 0, "seconds": 0}, None)

    @pytest.mark.asyncio
    async def test_empty_config_raises_application_error(self) -> None:
        with pytest.raises(ApplicationError, match="greater than zero"):
            await wait({}, None)


class TestWaitNonRetryable:
    """All validation errors are non-retryable."""

    @pytest.mark.asyncio
    async def test_config_errors_are_non_retryable(self) -> None:
        with pytest.raises(ApplicationError) as exc_info:
            await wait({"days": -1}, None)
        assert exc_info.value.non_retryable is True

    @pytest.mark.asyncio
    async def test_zero_duration_is_non_retryable(self) -> None:
        with pytest.raises(ApplicationError) as exc_info:
            await wait({"days": 0, "hours": 0, "minutes": 0, "seconds": 0}, None)
        assert exc_info.value.non_retryable is True


class TestCompleteWaitHappyPath:
    """complete_wait successfully completes the async activity."""

    @pytest.mark.asyncio
    async def test_completes_activity_via_handle(self) -> None:
        mock_handle = AsyncMock()
        mock_client = MagicMock()
        mock_client.get_async_activity_handle.return_value = mock_handle

        mock_service = MagicMock()
        mock_service.temporal_client = mock_client

        with patch(
            "nexus.workflows.workflow_engine.activities.wait_activity.get_activity_sync_service",
            return_value=mock_service,
        ):
            result = await complete_wait("wf-123", "run-456", "node-wait-1")

        assert result == {"output": {"status": "completed"}}
        mock_client.get_async_activity_handle.assert_called_once_with(
            workflow_id="wf-123",
            run_id="run-456",
            activity_id="node-wait-1",
        )
        mock_handle.complete.assert_called_once_with({"output": {"status": "completed"}})


class TestCompleteWaitIdempotent:
    """complete_wait handles already-completed activities gracefully."""

    @pytest.mark.asyncio
    async def test_already_completed_is_swallowed(self) -> None:
        mock_handle = AsyncMock()
        mock_handle.complete.side_effect = RPCError(
            "activity already completed",
            RPCStatusCode.NOT_FOUND,
            b"",
        )
        mock_client = MagicMock()
        mock_client.get_async_activity_handle.return_value = mock_handle

        mock_service = MagicMock()
        mock_service.temporal_client = mock_client

        with patch(
            "nexus.workflows.workflow_engine.activities.wait_activity.get_activity_sync_service",
            return_value=mock_service,
        ):
            result = await complete_wait("wf-123", "run-456", "node-wait-1")

        assert result == {"output": {"status": "completed"}}

    @pytest.mark.asyncio
    async def test_not_found_is_swallowed(self) -> None:
        mock_handle = AsyncMock()
        mock_handle.complete.side_effect = RPCError(
            "activity not found",
            RPCStatusCode.NOT_FOUND,
            b"",
        )
        mock_client = MagicMock()
        mock_client.get_async_activity_handle.return_value = mock_handle

        mock_service = MagicMock()
        mock_service.temporal_client = mock_client

        with patch(
            "nexus.workflows.workflow_engine.activities.wait_activity.get_activity_sync_service",
            return_value=mock_service,
        ):
            result = await complete_wait("wf-123", "run-456", "node-wait-1")

        assert result == {"output": {"status": "completed"}}


class TestCompleteWaitUnexpectedError:
    """complete_wait re-raises unexpected RPCErrors."""

    @pytest.mark.asyncio
    async def test_unexpected_rpc_error_propagates(self) -> None:
        mock_handle = AsyncMock()
        mock_handle.complete.side_effect = RPCError(
            "internal server error",
            RPCStatusCode.INTERNAL,
            b"",
        )
        mock_client = MagicMock()
        mock_client.get_async_activity_handle.return_value = mock_handle

        mock_service = MagicMock()
        mock_service.temporal_client = mock_client

        with (
            patch(
                "nexus.workflows.workflow_engine.activities.wait_activity.get_activity_sync_service",
                return_value=mock_service,
            ),
            pytest.raises(RPCError, match="internal server error"),
        ):
            await complete_wait("wf-123", "run-456", "node-wait-1")


class TestCompleteWaitServiceUnavailable:
    """complete_wait raises when sync service is unavailable."""

    @pytest.mark.asyncio
    async def test_raises_when_service_is_none(self) -> None:
        with (
            patch(
                "nexus.workflows.workflow_engine.activities.wait_activity.get_activity_sync_service",
                return_value=None,
            ),
            pytest.raises(ApplicationError, match="sync service not available"),
        ):
            await complete_wait("wf-123", "run-456", "node-wait-1")
