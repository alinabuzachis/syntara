"""Integration tests for API analytics middleware end-to-end behavior."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from nexus.telemetry.middleware import AnalyticsMiddleware

if TYPE_CHECKING:
    from nexus.telemetry.events.api_call import APICallEvent


def _create_test_app(registry: MagicMock) -> FastAPI:
    """Create a minimal FastAPI app with analytics middleware for testing."""
    app = FastAPI()

    @app.get("/api/v1/workflows")
    async def list_workflows() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/v1/invocations")
    async def create_invocation() -> dict[str, str]:
        return {"status": "created"}

    @app.get("/api/v1/workflows/{workflow_id}")
    async def get_workflow(workflow_id: str) -> dict[str, str]:
        return {"id": workflow_id}

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "healthy"}

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"message": "root"}

    app.add_middleware(AnalyticsMiddleware, registry=registry)
    return app


@pytest.fixture
def mock_registry() -> MagicMock:
    """Return a mock TelemetryClientRegistry for testing."""
    registry = MagicMock()
    registry.is_initialized.return_value = True
    registry.entitlement_id = ""
    return registry


@pytest.fixture
def test_app(mock_registry: MagicMock) -> FastAPI:
    """Return a FastAPI test app with analytics middleware."""
    return _create_test_app(mock_registry)


class TestEndToEndMiddleware:
    """Test middleware with a real FastAPI test app."""

    @pytest.mark.anyio
    async def test_get_request_emits_event(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/workflows")

        assert response.status_code == 200

        mock_registry.send_event.assert_called_once()
        event: APICallEvent = mock_registry.send_event.call_args[0][0]
        assert event.endpoint == "/api/v1/workflows"
        assert event.http_method == "GET"
        assert event.status_code == 200
        assert event.response_time_ms >= 0
        assert event.request_payload_size == 0

    @pytest.mark.anyio
    async def test_post_request_captures_payload_size(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/invocations",
                json={"workflow": "test"},
            )

        assert response.status_code == 200

        event: APICallEvent = mock_registry.send_event.call_args[0][0]
        assert event.http_method == "POST"
        assert event.request_payload_size > 0

    @pytest.mark.anyio
    async def test_event_contains_all_required_fields(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get("/api/v1/workflows")

        event: APICallEvent = mock_registry.send_event.call_args[0][0]
        props = event.model_dump()
        required_fields = {
            "endpoint",
            "http_method",
            "request_id",
            "status_code",
            "response_time_ms",
            "request_payload_size",
            "entitlement_id",
        }
        assert set(props.keys()) == required_fields

    @pytest.mark.anyio
    async def test_resource_id_in_endpoint_path(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        workflow_id = "550e8400-e29b-41d4-a716-446655440000"
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get(f"/api/v1/workflows/{workflow_id}")

        event: APICallEvent = mock_registry.send_event.call_args[0][0]
        assert workflow_id in event.endpoint


class TestExcludedPathsIntegration:
    """Test that excluded paths produce no events end-to-end."""

    @pytest.mark.anyio
    async def test_health_check_no_event(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/health")

        assert response.status_code == 200
        mock_registry.send_event.assert_not_called()

    @pytest.mark.anyio
    async def test_root_no_event(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/")

        assert response.status_code == 200
        mock_registry.send_event.assert_not_called()

    @pytest.mark.anyio
    async def test_docs_no_event(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get("/docs")

        # /docs may redirect or return HTML, but no event should be emitted
        mock_registry.send_event.assert_not_called()


class TestUnmatchedRoutes:
    """Test 404 responses still generate analytics events."""

    @pytest.mark.anyio
    async def test_404_generates_event(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/nonexistent")

        assert response.status_code == 404

        mock_registry.send_event.assert_called_once()
        event: APICallEvent = mock_registry.send_event.call_args[0][0]
        assert event.status_code == 404
        assert event.endpoint == "/api/v1/nonexistent"


class TestPrivacyIntegration:
    """Test privacy guarantees end-to-end (US2)."""

    @pytest.mark.anyio
    async def test_sensitive_headers_not_in_event(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get(
                "/api/v1/workflows",
                headers={"Authorization": "Bearer secret-token-xyz"},
            )

        event: APICallEvent = mock_registry.send_event.call_args[0][0]
        props = event.model_dump()
        all_values_str = str(props)
        assert "secret-token" not in all_values_str
        assert "Bearer" not in all_values_str

    @pytest.mark.anyio
    async def test_query_params_not_in_event(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get("/api/v1/workflows?name=John&token=secret")

        event: APICallEvent = mock_registry.send_event.call_args[0][0]
        props = event.model_dump()
        all_values_str = str(props)
        assert "John" not in all_values_str
        assert "secret" not in all_values_str

    @pytest.mark.anyio
    async def test_request_body_not_in_event(self, test_app: FastAPI, mock_registry: MagicMock) -> None:
        transport = ASGITransport(app=test_app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/v1/invocations",
                json={"username": "john_doe", "password": "secret123"},
            )

        event: APICallEvent = mock_registry.send_event.call_args[0][0]
        props = event.model_dump()
        all_values_str = str(props)
        assert "john_doe" not in all_values_str
        assert "secret123" not in all_values_str
        # Only payload size should be present, not body content
        assert event.request_payload_size > 0


class TestErrorResilienceIntegration:
    """Test that analytics failures don't affect API operation (US3)."""

    @pytest.mark.anyio
    async def test_api_works_when_analytics_fails(self, mock_registry: MagicMock) -> None:
        mock_registry.send_event.side_effect = RuntimeError("Segment down")
        app = _create_test_app(mock_registry)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/workflows")

        # API response should be completely normal
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    @pytest.mark.anyio
    async def test_multiple_requests_work_with_failing_analytics(self, mock_registry: MagicMock) -> None:
        mock_registry.send_event.side_effect = RuntimeError("Segment down")
        app = _create_test_app(mock_registry)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            for _ in range(5):
                response = await client.get("/api/v1/workflows")
                assert response.status_code == 200
