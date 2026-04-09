"""Unit tests for HTTP request activity (V2) — Pydantic validation, auth, and error detection."""

import base64
from collections.abc import AsyncGenerator, Generator
from contextlib import asynccontextmanager
from http import HTTPMethod
from unittest.mock import AsyncMock, MagicMock, _patch, patch

import httpx
import pytest

from nexus.workflows.workflow_engine.activities.http_request_activity import (
    DEFAULT_HTTP_TIMEOUT_SECONDS,
    _apply_authentication,
    execute_http_request_activity,
)
from nexus.workflows.workflow_engine.models.workflow_definition import (
    APIExecutorConfig,
    Authentication,
    AuthenticationType,
)

ACTIVITY_INFO_PATH = "nexus.workflows.workflow_engine.activities.http_request_activity.activity.info"
ASYNC_CLIENT_PATH = "nexus.workflows.workflow_engine.activities.http_request_activity.httpx.AsyncClient"


@pytest.fixture(autouse=True)
def _mock_activity_context() -> Generator[MagicMock, None, None]:
    """Auto-mock activity.info() so tests can run outside a Temporal worker."""
    mock_info = MagicMock()
    mock_info.attempt = 1
    with patch(ACTIVITY_INFO_PATH, return_value=mock_info) as m:
        yield m


def _valid_input(
    *,
    method: str = "GET",
    url: str = "https://api.example.com/data",
    headers: dict[str, str] | None = None,
    body: dict[str, str] | str | None = None,
    query_params: dict[str, str] | None = None,
    authentication: dict[str, str] | None = None,
    timeout: int | None = None,
) -> dict[str, object]:
    """Build a minimal valid input_config dict."""
    cfg: dict[str, object] = {"method": method, "url": url}
    if headers is not None:
        cfg["headers"] = headers
    if body is not None:
        cfg["body"] = body
    if query_params is not None:
        cfg["query_params"] = query_params
    if authentication is not None:
        cfg["authentication"] = authentication
    if timeout is not None:
        cfg["timeout"] = timeout
    return cfg


def _mock_response(
    status_code: int = 200,
    json_data: dict[str, object] | None = None,
    text: str = "",
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    """Build a real httpx.Response for testing."""
    kwargs: dict[str, object] = {
        "status_code": status_code,
        "headers": headers or {},
    }
    if json_data is not None:
        kwargs["json"] = json_data
    else:
        kwargs["text"] = text
    return httpx.Response(**kwargs)  # type: ignore[arg-type]


class _PatchWithMockRequest(_patch):  # type: ignore[type-arg]
    """Type stub so mypy knows about our extra attribute."""

    _mock_request: AsyncMock


def _patch_async_client(
    response: httpx.Response | None = None,
    side_effect: Exception | None = None,
) -> _PatchWithMockRequest:
    """Create a patch context that replaces httpx.AsyncClient with a mock.

    The mock properly supports ``async with`` and ``await client.request(...)``.
    """
    mock_request = AsyncMock(side_effect=side_effect) if side_effect is not None else AsyncMock(return_value=response)

    @asynccontextmanager
    async def _fake_client(**_kwargs: object) -> AsyncGenerator[MagicMock, None]:
        client = MagicMock()
        client.request = mock_request
        yield client

    patcher = patch(ASYNC_CLIENT_PATH, side_effect=_fake_client)
    patcher._mock_request = mock_request  # type: ignore[attr-defined]
    return patcher  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Pydantic Validation
# ---------------------------------------------------------------------------


class TestPydanticValidation:
    """Config must be validated via APIExecutorConfig.model_validate."""

    @pytest.mark.asyncio
    async def test_missing_url_returns_failed(self) -> None:
        result = await execute_http_request_activity({"method": "GET"}, None)
        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ValidationError"
        assert "url" in output["error"]["message"].lower()

    @pytest.mark.asyncio
    async def test_missing_method_returns_failed(self) -> None:
        result = await execute_http_request_activity({"url": "https://example.com"}, None)
        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ValidationError"

    @pytest.mark.asyncio
    async def test_invalid_method_returns_failed(self) -> None:
        result = await execute_http_request_activity({"method": "FOOBAR", "url": "https://example.com"}, None)
        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ValidationError"

    @pytest.mark.asyncio
    async def test_empty_config_returns_failed(self) -> None:
        result = await execute_http_request_activity({}, None)
        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ValidationError"

    @pytest.mark.asyncio
    async def test_invalid_timeout_returns_failed(self) -> None:
        result = await execute_http_request_activity(
            {"method": "GET", "url": "https://example.com", "timeout": 0}, None
        )
        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ValidationError"

    @pytest.mark.asyncio
    async def test_file_url_scheme_rejected(self) -> None:
        result = await execute_http_request_activity({"method": "GET", "url": "file:///etc/passwd"}, None)
        output = result["output"]
        assert output["status"] == "failed"

    @pytest.mark.asyncio
    async def test_ftp_url_scheme_rejected(self) -> None:
        result = await execute_http_request_activity({"method": "GET", "url": "ftp://example.com/data"}, None)
        output = result["output"]
        assert output["status"] == "failed"

    @pytest.mark.asyncio
    async def test_template_url_allowed(self) -> None:
        """Template expressions in URL should bypass scheme validation."""
        config = APIExecutorConfig(method=HTTPMethod.GET, url="${trigger.url}")
        assert config.url == "${trigger.url}"


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


class TestApplyAuthentication:
    """_apply_authentication must set correct headers for each auth type."""

    @staticmethod
    def _make_config_with_auth(auth_type: AuthenticationType, resolved_cred: str) -> APIExecutorConfig:
        """Create an APIExecutorConfig with pre-resolved authentication.

        Uses model_construct to bypass the credential pattern validator,
        simulating the state after secret references have been resolved.
        """
        auth = Authentication.model_construct(
            type=auth_type,
            credentials=resolved_cred,
        )
        return APIExecutorConfig.model_construct(
            method=HTTPMethod.GET,
            url="https://example.com",
            headers={},
            body=None,
            query_params={},
            authentication=auth,
            timeout=None,
        )

    def test_bearer_auth(self) -> None:
        headers: dict[str, str] = {}
        config = self._make_config_with_auth(AuthenticationType.BEARER, "my-token")
        _apply_authentication(headers, config)
        assert headers["Authorization"] == "Bearer my-token"

    def test_basic_auth(self) -> None:
        headers: dict[str, str] = {}
        config = self._make_config_with_auth(AuthenticationType.BASIC, "user:pass")
        _apply_authentication(headers, config)
        expected = base64.b64encode(b"user:pass").decode()
        assert headers["Authorization"] == f"Basic {expected}"

    def test_api_key_auth(self) -> None:
        headers: dict[str, str] = {}
        config = self._make_config_with_auth(AuthenticationType.API_KEY, "my-api-key")
        _apply_authentication(headers, config)
        assert headers["X-API-Key"] == "my-api-key"

    def test_oauth2_auth(self) -> None:
        headers: dict[str, str] = {}
        config = self._make_config_with_auth(AuthenticationType.OAUTH2, "oauth-token")
        _apply_authentication(headers, config)
        assert headers["Authorization"] == "Bearer oauth-token"

    def test_no_auth(self) -> None:
        headers: dict[str, str] = {"Existing": "value"}
        config = APIExecutorConfig(method=HTTPMethod.GET, url="https://example.com")
        _apply_authentication(headers, config)
        assert headers == {"Existing": "value"}

    def test_auth_does_not_clobber_existing_headers(self) -> None:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        config = self._make_config_with_auth(AuthenticationType.BEARER, "tok")
        _apply_authentication(headers, config)
        assert headers["Content-Type"] == "application/json"
        assert headers["Authorization"] == "Bearer tok"


# ---------------------------------------------------------------------------
# HTTP Error Detection
# ---------------------------------------------------------------------------


class TestHTTPErrorDetection:
    """4xx/5xx responses must return status=failed with error details."""

    @pytest.mark.asyncio
    async def test_404_returns_failed(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=404, text="Not Found"))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["status_code"] == 404
        assert output["error"]["type"] == "HTTPError"
        assert "404" in output["error"]["message"]

    @pytest.mark.asyncio
    async def test_500_returns_failed(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=500, text="Internal Server Error"))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["status_code"] == 500

    @pytest.mark.asyncio
    async def test_400_with_json_body_preserves_details(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=400, json_data={"detail": "bad request"}))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["body"] == {"detail": "bad request"}

    @pytest.mark.asyncio
    async def test_401_returns_failed(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=401, text="Unauthorized"))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["status_code"] == 401

    @pytest.mark.asyncio
    async def test_error_response_includes_elapsed(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=503, text="Service Unavailable"))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "failed"
        assert "elapsed" in output
        assert isinstance(output["elapsed"], float)


# ---------------------------------------------------------------------------
# Successful Requests
# ---------------------------------------------------------------------------


class TestSuccessfulRequests:
    """200-level responses must return status=completed."""

    @pytest.mark.asyncio
    async def test_200_json_response(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={"key": "value"}))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "completed"
        assert output["status_code"] == 200
        assert output["body"] == {"key": "value"}

    @pytest.mark.asyncio
    async def test_201_response(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=201, json_data={"id": 42}))
        with patcher:
            result = await execute_http_request_activity(_valid_input(method="POST"), None)

        output = result["output"]
        assert output["status"] == "completed"
        assert output["status_code"] == 201

    @pytest.mark.asyncio
    async def test_response_includes_elapsed(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={}))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert "elapsed" in output
        assert isinstance(output["elapsed"], float)

    @pytest.mark.asyncio
    async def test_text_response_body(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, text="plain text"))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "completed"
        assert output["body"] == "plain text"


# ---------------------------------------------------------------------------
# Timeout Configuration
# ---------------------------------------------------------------------------


class TestTimeoutConfiguration:
    """Timeout must use config value when set, default otherwise."""

    @pytest.mark.asyncio
    async def test_uses_config_timeout(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={}))
        with patcher:
            await execute_http_request_activity(_valid_input(timeout=60), None)
            call_kwargs = patcher._mock_request.call_args
            assert call_kwargs.kwargs["timeout"] == 60.0

    @pytest.mark.asyncio
    async def test_uses_default_timeout_when_not_set(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={}))
        with patcher:
            await execute_http_request_activity(_valid_input(), None)
            call_kwargs = patcher._mock_request.call_args
            assert call_kwargs.kwargs["timeout"] == float(DEFAULT_HTTP_TIMEOUT_SECONDS)


# ---------------------------------------------------------------------------
# Request Building (method, url, headers, body, query_params)
# ---------------------------------------------------------------------------


class TestRequestBuilding:
    """Validated config fields must be passed correctly to httpx."""

    @pytest.mark.asyncio
    async def test_method_and_url_passed(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={}))
        with patcher:
            await execute_http_request_activity(_valid_input(method="POST", url="https://api.example.com/submit"), None)
            call_kwargs = patcher._mock_request.call_args
            assert call_kwargs.kwargs["method"] == "POST"
            assert call_kwargs.kwargs["url"] == "https://api.example.com/submit"

    @pytest.mark.asyncio
    async def test_headers_passed(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={}))
        with patcher:
            await execute_http_request_activity(_valid_input(headers={"X-Custom": "val"}), None)
            call_kwargs = patcher._mock_request.call_args
            assert call_kwargs.kwargs["headers"]["X-Custom"] == "val"

    @pytest.mark.asyncio
    async def test_dict_body_sent_as_json(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={}))
        with patcher:
            await execute_http_request_activity(_valid_input(method="POST", body={"key": "val"}), None)
            call_kwargs = patcher._mock_request.call_args
            assert call_kwargs.kwargs["json"] == {"key": "val"}
            assert call_kwargs.kwargs["content"] is None

    @pytest.mark.asyncio
    async def test_string_body_sent_as_content(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={}))
        with patcher:
            await execute_http_request_activity(_valid_input(method="POST", body="raw string"), None)
            call_kwargs = patcher._mock_request.call_args
            assert call_kwargs.kwargs["json"] is None
            assert call_kwargs.kwargs["content"] == "raw string"

    @pytest.mark.asyncio
    async def test_query_params_passed(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={}))
        with patcher:
            await execute_http_request_activity(_valid_input(query_params={"page": "2"}), None)
            call_kwargs = patcher._mock_request.call_args
            assert call_kwargs.kwargs["params"] == {"page": "2"}


# ---------------------------------------------------------------------------
# Network / Exception Handling
# ---------------------------------------------------------------------------


class TestExceptionHandling:
    """Network failures and unexpected exceptions must return status=failed."""

    @pytest.mark.asyncio
    async def test_connection_error_returns_failed(self) -> None:
        patcher = _patch_async_client(side_effect=httpx.ConnectError("connection refused"))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ConnectError"
        assert "connection refused" in output["error"]["message"]

    @pytest.mark.asyncio
    async def test_timeout_error_returns_failed(self) -> None:
        patcher = _patch_async_client(side_effect=httpx.ReadTimeout("read timed out"))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "ReadTimeout"

    @pytest.mark.asyncio
    async def test_generic_exception_returns_failed(self) -> None:
        patcher = _patch_async_client(side_effect=RuntimeError("boom"))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "failed"
        assert output["error"]["type"] == "RuntimeError"
        assert "boom" in output["error"]["message"]


# ---------------------------------------------------------------------------
# Output Mapping Integration
# ---------------------------------------------------------------------------


class TestOutputMapping:
    """Output mapping must be applied before returning."""

    @pytest.mark.asyncio
    async def test_output_mapping_extracts_field(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={"result": "ok"}))
        with patcher:
            result = await execute_http_request_activity(
                _valid_input(),
                {"code": "${result.status_code}"},
            )

        output = result["output"]
        assert output["status"] == "completed"
        assert output["code"] == 200
        assert "body" not in output

    @pytest.mark.asyncio
    async def test_empty_output_mapping_suppresses_all(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={"data": 1}))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), {})

        output = result["output"]
        assert output == {"status": "completed"}

    @pytest.mark.asyncio
    async def test_none_output_mapping_returns_full(self) -> None:
        patcher = _patch_async_client(response=_mock_response(status_code=200, json_data={"data": 1}))
        with patcher:
            result = await execute_http_request_activity(_valid_input(), None)

        output = result["output"]
        assert output["status"] == "completed"
        assert output["body"] == {"data": 1}
        assert "status_code" in output
        assert "headers" in output
        assert "elapsed" in output
