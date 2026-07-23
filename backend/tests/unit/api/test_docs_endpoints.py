"""Tests for OpenAPI documentation endpoint gating.

The production FastAPI app is a module-level singleton whose ``docs_url``
is set at import time and cannot be toggled per-test.  These tests use
standalone ``FastAPI`` instances (via ``_make_app``) to verify the
conditional behavior in isolation: given a particular toggle value, do
the doc endpoints appear or disappear as expected?

The ``TestAPIDocsSettings`` class separately verifies that the
``enable_api_docs`` setting loads correctly from env vars and defaults.
Together the two layers confirm that the wiring in ``main.py`` will
produce the right result when the real setting is read at startup.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager


def _make_app(*, enable_docs: bool) -> FastAPI:
    """Create a minimal FastAPI app with doc endpoints toggled."""
    app = FastAPI(
        title="Test API",
        docs_url="/docs" if enable_docs else None,
        redoc_url="/redoc" if enable_docs else None,
        openapi_url="/openapi.json" if enable_docs else None,
    )

    @app.get("/", tags=["Root"])
    async def root() -> dict[str, str]:
        response: dict[str, str] = {"message": "Nexus API", "version": "0.1.0"}
        if enable_docs:
            response["docs"] = "/docs"
        return response

    return app


# ---------------------------------------------------------------------------
# Docs disabled (production default)
# ---------------------------------------------------------------------------


class TestDocsDisabled:
    """When enable_api_docs=False, doc endpoints must not exist."""

    @pytest.fixture
    def client(self) -> TestClient:
        return TestClient(_make_app(enable_docs=False))

    def test_docs_returns_404(self, client: TestClient) -> None:
        response = client.get("/docs")
        assert response.status_code == 404

    def test_redoc_returns_404(self, client: TestClient) -> None:
        response = client.get("/redoc")
        assert response.status_code == 404

    def test_openapi_json_returns_404(self, client: TestClient) -> None:
        response = client.get("/openapi.json")
        assert response.status_code == 404

    def test_root_omits_docs_link(self, client: TestClient) -> None:
        response = client.get("/")
        assert response.status_code == 200
        assert "docs" not in response.json()


# ---------------------------------------------------------------------------
# Docs enabled (development)
# ---------------------------------------------------------------------------


class TestDocsEnabled:
    """When enable_api_docs=True, doc endpoints must be served."""

    @pytest.fixture
    def client(self) -> TestClient:
        return TestClient(_make_app(enable_docs=True))

    def test_docs_returns_200(self, client: TestClient) -> None:
        response = client.get("/docs")
        assert response.status_code == 200

    def test_redoc_returns_200(self, client: TestClient) -> None:
        response = client.get("/redoc")
        assert response.status_code == 200

    def test_openapi_json_returns_200(self, client: TestClient) -> None:
        response = client.get("/openapi.json")
        assert response.status_code == 200
        data = response.json()
        assert "openapi" in data

    def test_root_includes_docs_link(self, client: TestClient) -> None:
        response = client.get("/")
        assert response.status_code == 200
        assert response.json()["docs"] == "/docs"


# ---------------------------------------------------------------------------
# Settings integration
# ---------------------------------------------------------------------------


class TestAPIDocsSettings:
    """The enable_api_docs setting defaults to False and is toggleable."""

    def test_default_is_false(self) -> None:
        from nexus.core.config.base import get_settings

        assert get_settings().enable_api_docs is False

    def test_env_var_enables(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from nexus.core.config.base import get_settings

        monkeypatch.setenv("APP_ENABLE_API_DOCS", "true")
        get_settings.cache_clear()
        try:
            assert get_settings().enable_api_docs is True
        finally:
            get_settings.cache_clear()

    def test_override_settings(
        self,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        from nexus.core.config.base import get_settings

        with override_settings(enable_api_docs=True):
            assert get_settings().enable_api_docs is True

    def test_field_default_on_class(self) -> None:
        from nexus.core.config.base import APIDocsSettings

        settings = APIDocsSettings()
        assert settings.enable_api_docs is False


# ---------------------------------------------------------------------------
# Production app wiring
# ---------------------------------------------------------------------------


class TestDocsEnabledWiring:
    """Cover True branches of enable_api_docs conditionals in main.py."""

    def test_root_includes_docs_link_when_enabled(self) -> None:
        import nexus.api.main as main_module

        original = main_module._settings.enable_api_docs
        object.__setattr__(main_module._settings, "enable_api_docs", True)
        try:
            client = TestClient(main_module.app, raise_server_exceptions=False)
            response = client.get("/")
            assert response.status_code == 200
            assert response.json()["docs"] == "/docs"
        finally:
            object.__setattr__(main_module._settings, "enable_api_docs", original)

    def test_app_constructor_with_docs_enabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import importlib

        import nexus.api.main as main_module
        from nexus.core.config.base import get_settings

        monkeypatch.setenv("APP_ENABLE_API_DOCS", "true")
        get_settings.cache_clear()
        try:
            importlib.reload(main_module)
            assert main_module.app.docs_url == "/docs"
            assert main_module.app.redoc_url == "/redoc"
            assert main_module.app.openapi_url == "/openapi.json"
        finally:
            monkeypatch.delenv("APP_ENABLE_API_DOCS", raising=False)
            get_settings.cache_clear()
            importlib.reload(main_module)


class TestProductionAppWiring:
    """Verify the real app has correct doc endpoint wiring for coverage."""

    def test_root_omits_docs_when_disabled(self) -> None:
        from nexus.api.main import app as real_app

        client = TestClient(real_app, raise_server_exceptions=False)
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Nexus API"
        assert "docs" not in data

    def test_docs_url_disabled(self) -> None:
        from nexus.api.main import app as real_app

        assert real_app.docs_url is None

    def test_redoc_url_disabled(self) -> None:
        from nexus.api.main import app as real_app

        assert real_app.redoc_url is None

    def test_openapi_url_disabled(self) -> None:
        from nexus.api.main import app as real_app

        assert real_app.openapi_url is None
