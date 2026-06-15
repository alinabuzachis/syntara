"""Tests for AAP polling resilience and transient error handling."""

import httpx
import pytest

from nexus.workflows.workflow_engine.activities.aap_common import (
    AAPActivityExecutionError,
    _is_transient_poll_error,
    _TransientPollError,
)


class TestIsTransientPollError:
    """Test _is_transient_poll_error classification."""

    @pytest.mark.parametrize("status_code", [429, 502, 503, 504])
    def test_retryable_http_status_is_transient(self, status_code: int) -> None:
        exc = httpx.HTTPStatusError(
            f"{status_code}",
            request=httpx.Request("GET", "http://test"),
            response=httpx.Response(status_code),
        )
        assert _is_transient_poll_error(exc) is True

    def test_404_is_not_transient(self) -> None:
        exc = httpx.HTTPStatusError(
            "404",
            request=httpx.Request("GET", "http://test"),
            response=httpx.Response(404),
        )
        assert _is_transient_poll_error(exc) is False

    @pytest.mark.parametrize("status_code", [401, 403, 400, 500])
    def test_non_retryable_http_status_is_not_transient(self, status_code: int) -> None:
        exc = httpx.HTTPStatusError(
            f"{status_code}",
            request=httpx.Request("GET", "http://test"),
            response=httpx.Response(status_code),
        )
        assert _is_transient_poll_error(exc) is False

    def test_connect_error_is_transient(self) -> None:
        exc = httpx.ConnectError("Connection refused")
        assert _is_transient_poll_error(exc) is True

    def test_timeout_exception_is_transient(self) -> None:
        exc = httpx.ReadTimeout("Read timed out")
        assert _is_transient_poll_error(exc) is True

    def ***REMOVED***(self) -> None:
        exc = httpx.HTTPError("Some other error")
        assert _is_transient_poll_error(exc) is False


class TestTransientPollError:
    """Test _TransientPollError sentinel exception."""

    def test_is_exception(self) -> None:
        assert issubclass(_TransientPollError, Exception)

    def test_carries_message(self) -> None:
        err = _TransientPollError("poll failed: 503")
        assert "503" in str(err)


class TestAAPActivityExecutionErrorRetryable:
    """Test retryable flag on AAPActivityExecutionError."""

    def test_default_not_retryable(self) -> None:
        err = AAPActivityExecutionError("fail")
        assert err.retryable is False

    def test_explicit_retryable(self) -> None:
        err = AAPActivityExecutionError("transient", retryable=True)
        assert err.retryable is True

    def test_explicit_not_retryable(self) -> None:
        err = AAPActivityExecutionError("permanent", retryable=False)
        assert err.retryable is False
