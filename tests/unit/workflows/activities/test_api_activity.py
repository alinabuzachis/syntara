"""Unit tests for API activity executor."""

from http import HTTPMethod
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from pydantic import ValidationError

from nexus.workflows.workflow_engine.activities.api_activity import APIExecutionError, execute_api_request
from nexus.workflows.workflow_engine.models import APIExecutorConfig


class TestAPIRequestExecution:
    """Test basic API request execution functionality."""

    @pytest.mark.asyncio
    async def test_simple_get_request(self) -> None:
        """Test simple GET request."""
        mock_response = httpx.Response(
            status_code=200,
            json={"data": "test"},
            headers={"content-type": "application/json"},
        )

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(method=HTTPMethod.GET, url="https://api.example.com/data")
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert result["status_code"] == 200
        assert result["body"] == {"data": "test"}
        assert "content-type" in result["headers"]
        assert "elapsed_ms" in result

    @pytest.mark.asyncio
    async def test_post_request_with_json_body(self) -> None:
        """Test POST request with JSON body."""
        mock_response = httpx.Response(
            status_code=201,
            json={"id": "123", "created": True},
        )

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(
                method=HTTPMethod.POST,
                url="https://api.example.com/users",
                body={"name": "Test User", "email": "test@example.com"},
            )
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert result["status_code"] == 201
        assert result["body"]["id"] == "123"
        assert result["body"]["created"] is True

    @pytest.mark.asyncio
    async def test_put_request(self) -> None:
        """Test PUT request."""
        mock_response = httpx.Response(
            status_code=200,
            json={"updated": True},
        )

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(
                method=HTTPMethod.PUT,
                url="https://api.example.com/users/123",
                body={"name": "Updated Name"},
            )
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert result["status_code"] == 200
        assert result["body"]["updated"] is True

    @pytest.mark.asyncio
    async def test_patch_request(self) -> None:
        """Test PATCH request."""
        mock_response = httpx.Response(
            status_code=200,
            json={"patched": True},
        )

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(
                method=HTTPMethod.PATCH,
                url="https://api.example.com/users/123",
                body={"email": "new@example.com"},
            )
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert result["status_code"] == 200
        assert result["body"]["patched"] is True

    @pytest.mark.asyncio
    async def test_delete_request(self) -> None:
        """Test DELETE request."""
        mock_response = httpx.Response(
            status_code=204,
            text="",
        )

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(method=HTTPMethod.DELETE, url="https://api.example.com/users/123")
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert result["status_code"] == 204


class TestAPIRequestHeaders:
    """Test API request header handling."""

    @pytest.mark.asyncio
    async def test_static_headers(self) -> None:
        """Test request with static headers."""
        mock_response = httpx.Response(status_code=200, json={"success": True})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.GET,
                url="https://api.example.com/data",
                headers={
                    "X-Custom-Header": "custom-value",
                    "Content-Type": "application/json",
                },
            )
            await execute_api_request(config.model_dump(by_alias=True), inputs={})

            # Verify headers were passed to request
            call_kwargs = mock_request.call_args.kwargs
            assert "headers" in call_kwargs
            assert call_kwargs["headers"]["X-Custom-Header"] == "custom-value"

    @pytest.mark.asyncio
    async def test_header_resolution_from_inputs(self) -> None:
        """Test header resolution from input parameters."""
        mock_response = httpx.Response(status_code=200, json={"authenticated": True})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.GET,
                url="https://api.example.com/auth",
                headers={
                    "Authorization": "${input.token}",
                    "X-API-Key": "${input.apiKey}",
                },
            )
            await execute_api_request(
                config.model_dump(by_alias=True), inputs={"token": "Bearer abc123", "apiKey": "key456"}
            )

            call_kwargs = mock_request.call_args.kwargs
            assert call_kwargs["headers"]["Authorization"] == "Bearer abc123"
            assert call_kwargs["headers"]["X-API-Key"] == "key456"

    @pytest.mark.asyncio
    async def test_mixed_static_and_dynamic_headers(self) -> None:
        """Test mix of static and dynamic headers."""
        mock_response = httpx.Response(status_code=200, json={})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.GET,
                url="https://api.example.com/data",
                headers={
                    "Content-Type": "application/json",  # Static
                    "Authorization": "${input.token}",  # Dynamic
                },
            )
            await execute_api_request(config.model_dump(by_alias=True), inputs={"token": "Bearer xyz"})

            call_kwargs = mock_request.call_args.kwargs
            assert call_kwargs["headers"]["Content-Type"] == "application/json"
            assert call_kwargs["headers"]["Authorization"] == "Bearer xyz"


class TestAPIRequestQueryParams:
    """Test API request query parameter handling."""

    @pytest.mark.asyncio
    async def test_static_query_params(self) -> None:
        """Test request with static query parameters."""
        mock_response = httpx.Response(status_code=200, json={"results": []})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.GET,
                url="https://api.example.com/search",
                queryParams={
                    "limit": "10",
                    "sort": "name",
                },
            )
            await execute_api_request(config.model_dump(by_alias=True), inputs={})

            call_kwargs = mock_request.call_args.kwargs
            assert "params" in call_kwargs
            assert call_kwargs["params"]["limit"] == "10"
            assert call_kwargs["params"]["sort"] == "name"

    @pytest.mark.asyncio
    async def test_query_param_resolution_from_inputs(self) -> None:
        """Test query parameter resolution from inputs."""
        mock_response = httpx.Response(status_code=200, json={})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.GET,
                url="https://api.example.com/search",
                queryParams={
                    "filter": "${input.filter}",
                    "page": "${input.page}",
                },
            )
            await execute_api_request(config.model_dump(by_alias=True), inputs={"filter": "active", "page": "2"})

            call_kwargs = mock_request.call_args.kwargs
            assert call_kwargs["params"]["filter"] == "active"
            assert call_kwargs["params"]["page"] == "2"


class TestAPIRequestURLResolution:
    """Test API request URL resolution from inputs."""

    @pytest.mark.asyncio
    async def test_url_with_input_expression(self) -> None:
        """Test URL with ${input.field} expression is resolved."""
        mock_response = httpx.Response(status_code=200, json={"id": 123})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.GET,
                url="https://api.example.com/users/${input.userId}",
            )
            await execute_api_request(config.model_dump(by_alias=True), inputs={"userId": "123"})

            call_kwargs = mock_request.call_args.kwargs
            assert call_kwargs["url"] == "https://api.example.com/users/123"

    @pytest.mark.asyncio
    async def test_url_with_multiple_expressions(self) -> None:
        """Test URL can be constructed with input expressions."""
        mock_response = httpx.Response(status_code=200, json={})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.GET,
                url="https://jsonplaceholder.typicode.com/users/${input.id}",
            )
            await execute_api_request(config.model_dump(by_alias=True), inputs={"id": "42"})

            call_kwargs = mock_request.call_args.kwargs
            assert call_kwargs["url"] == "https://jsonplaceholder.typicode.com/users/42"


class TestAPIRequestBodyResolution:
    """Test API request body resolution."""

    @pytest.mark.asyncio
    async def test_static_json_body(self) -> None:
        """Test request with static JSON body."""
        mock_response = httpx.Response(status_code=201, json={"created": True})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.POST,
                url="https://api.example.com/create",
                body={"name": "Test", "value": 123},
            )
            await execute_api_request(config.model_dump(by_alias=True), inputs={})

            call_kwargs = mock_request.call_args.kwargs
            assert "json" in call_kwargs
            assert call_kwargs["json"]["name"] == "Test"
            assert call_kwargs["json"]["value"] == 123

    @pytest.mark.asyncio
    async def test_body_resolution_from_inputs(self) -> None:
        """Test body field resolution from inputs."""
        mock_response = httpx.Response(status_code=201, json={})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.POST,
                url="https://api.example.com/create",
                body={
                    "name": "${input.userName}",
                    "email": "${input.userEmail}",
                },
            )
            await execute_api_request(
                config.model_dump(by_alias=True), inputs={"userName": "Alice", "userEmail": "alice@example.com"}
            )

            call_kwargs = mock_request.call_args.kwargs
            assert call_kwargs["json"]["name"] == "Alice"
            assert call_kwargs["json"]["email"] == "alice@example.com"

    @pytest.mark.asyncio
    async def test_body_full_replacement_from_inputs(self) -> None:
        """Test entire body replacement from inputs."""
        mock_response = httpx.Response(status_code=201, json={})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.POST,
                url="https://api.example.com/create",
                body="${input.data}",
            )
            await execute_api_request(config.model_dump(by_alias=True), inputs={"data": {"name": "Bob", "age": 30}})

            call_kwargs = mock_request.call_args.kwargs
            assert call_kwargs["json"]["name"] == "Bob"
            assert call_kwargs["json"]["age"] == 30

    @pytest.mark.asyncio
    async def test_body_nested_objects_and_lists(self) -> None:
        """Test body with nested objects and lists containing expressions."""
        mock_response = httpx.Response(status_code=201, json={})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response) as mock_request:
            config = APIExecutorConfig(
                method=HTTPMethod.POST,
                url="https://api.example.com/create",
                body={
                    "user": {
                        "name": "${input.userName}",
                        "email": "${input.userEmail}",
                        "profile": {
                            "age": "${input.age}",
                            "city": "${input.city}",
                        },
                    },
                    "tags": ["${input.tag1}", "${input.tag2}", "static-tag"],
                    "metadata": {
                        "source": "api",
                        "permissions": ["${input.permission1}", "${input.permission2}"],
                    },
                },
            )
            await execute_api_request(
                config.model_dump(by_alias=True),
                inputs={
                    "userName": "Alice",
                    "userEmail": "alice@example.com",
                    "age": 30,
                    "city": "Seattle",
                    "tag1": "premium",
                    "tag2": "verified",
                    "permission1": "read",
                    "permission2": "write",
                },
            )

            call_kwargs = mock_request.call_args.kwargs
            # Verify nested object resolution
            assert call_kwargs["json"]["user"]["name"] == "Alice"
            assert call_kwargs["json"]["user"]["email"] == "alice@example.com"
            assert call_kwargs["json"]["user"]["profile"]["age"] == 30
            assert call_kwargs["json"]["user"]["profile"]["city"] == "Seattle"
            # Verify list resolution
            assert call_kwargs["json"]["tags"] == ["premium", "verified", "static-tag"]
            # Verify nested list in object
            assert call_kwargs["json"]["metadata"]["source"] == "api"
            assert call_kwargs["json"]["metadata"]["permissions"] == ["read", "write"]


class TestAPIResponseParsing:
    """Test API response parsing."""

    @pytest.mark.asyncio
    async def test_json_response_parsing(self) -> None:
        """Test JSON response parsing."""
        mock_response = httpx.Response(
            status_code=200,
            json={"message": "success", "data": {"id": 1, "name": "Test"}},
        )

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(method=HTTPMethod.GET, url="https://api.example.com/data")
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert result["body"]["message"] == "success"
        assert result["body"]["data"]["id"] == 1
        assert result["body"]["data"]["name"] == "Test"

    @pytest.mark.asyncio
    async def test_text_response_parsing(self) -> None:
        """Test non-JSON text response."""
        mock_response = httpx.Response(
            status_code=200,
            text="Plain text response",
            headers={"content-type": "text/plain"},
        )

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(method=HTTPMethod.GET, url="https://api.example.com/text")
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert result["body"] == "Plain text response"


class TestAPIErrorHandling:
    """Test API error handling."""

    @pytest.mark.asyncio
    async def test_http_4xx_error(self) -> None:
        """Test HTTP 404 error handling."""
        mock_response = httpx.Response(
            status_code=404,
            json={"error": "Not Found"},
        )

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(method=HTTPMethod.GET, url="https://api.example.com/notfound")
            with pytest.raises(APIExecutionError) as exc_info:
                await execute_api_request(config.model_dump(by_alias=True), inputs={})

            assert exc_info.value.status_code == 404
            assert "404" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_http_5xx_error(self) -> None:
        """Test HTTP 500 error handling."""
        mock_response = httpx.Response(
            status_code=500,
            json={"error": "Internal Server Error"},
        )

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(method=HTTPMethod.GET, url="https://api.example.com/error")
            with pytest.raises(APIExecutionError) as exc_info:
                await execute_api_request(config.model_dump(by_alias=True), inputs={})

            assert exc_info.value.status_code == 500

    @pytest.mark.asyncio
    async def test_timeout_error(self) -> None:
        """Test timeout error handling."""
        with patch(
            "httpx.AsyncClient.request",
            new_callable=AsyncMock,
            side_effect=httpx.TimeoutException("Request timed out"),
        ):
            config = APIExecutorConfig(method=HTTPMethod.GET, url="https://api.example.com/slow", timeout=1)
            with pytest.raises(APIExecutionError) as exc_info:
                await execute_api_request(config.model_dump(by_alias=True), inputs={})

            assert "timeout" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_network_error(self) -> None:
        """Test network error handling."""
        with patch(
            "httpx.AsyncClient.request",
            new_callable=AsyncMock,
            side_effect=httpx.ConnectError("Connection failed"),
        ):
            config = APIExecutorConfig(method=HTTPMethod.GET, url="https://api.example.com/data")
            with pytest.raises(APIExecutionError) as exc_info:
                await execute_api_request(config.model_dump(by_alias=True), inputs={})

            assert "error" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_missing_method_config(self) -> None:
        """Test error when method is missing from config."""
        with pytest.raises(ValidationError, match="method"):
            # Pydantic will catch missing required field during validation
            APIExecutorConfig.model_validate({"url": "https://api.example.com"})

    @pytest.mark.asyncio
    async def test_missing_url_config(self) -> None:
        """Test error when URL is missing from config."""
        with pytest.raises(ValidationError, match="url"):
            # Pydantic will catch missing required field during validation
            APIExecutorConfig.model_validate({"method": "GET"})


class TestAPIEdgeCases:
    """Test API activity edge cases."""

    @pytest.mark.asyncio
    async def test_empty_response_body(self) -> None:
        """Test handling of empty response body."""
        # Testing with 200 and empty body (204 No Content would also be valid)
        mock_response = httpx.Response(status_code=200, text="")

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(method=HTTPMethod.DELETE, url="https://api.example.com/users/123")
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert result["status_code"] == 200
        assert result["body"] == ""

    @pytest.mark.asyncio
    async def test_custom_timeout(self) -> None:
        """Test custom timeout configuration."""
        mock_response = httpx.Response(status_code=200, json={})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(method=HTTPMethod.GET, url="https://api.example.com/data", timeout=30)
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert result["status_code"] == 200
        assert "elapsed_ms" in result

    @pytest.mark.asyncio
    async def test_elapsed_time_tracking(self) -> None:
        """Test that elapsed time is tracked."""
        mock_response = httpx.Response(status_code=200, json={})

        with patch("httpx.AsyncClient.request", new_callable=AsyncMock, return_value=mock_response):
            config = APIExecutorConfig(method=HTTPMethod.GET, url="https://api.example.com/data")
            result = await execute_api_request(config.model_dump(by_alias=True), inputs={})

        assert "elapsed_ms" in result
        assert isinstance(result["elapsed_ms"], (int, float))
        assert result["elapsed_ms"] >= 0
