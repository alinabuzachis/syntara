"""E2E tests for settings API endpoints.

NOTE: These tests use raw httpx via get_httpx_client() instead of the
generated NexusApiRegistry because the settings endpoints are not yet
included in the generated client (blocked by pre-existing OpenAPI spec
drift). Migrate to nexus_api.settings once the spec is aligned and the
client is regenerated.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from nexus_api_client import AuthenticatedClient

pytestmark = pytest.mark.e2e

_LOG_LEVEL_KEY = "logging.log_level"
_LOG_LEVEL_PATH = f"/api/v1/settings/{_LOG_LEVEL_KEY}"


class TestSettings:
    """E2E tests for settings GET and PATCH endpoints."""

    def test_list_settings(self, nexus_client: AuthenticatedClient) -> None:
        """GET /settings returns 200 with resources."""
        client = nexus_client.get_httpx_client()
        response = client.get("/api/v1/settings")

        assert response.status_code == 200
        data = response.json()
        assert "resources" in data
        assert isinstance(data["resources"], list)
        assert len(data["resources"]) > 0

    def test_list_categories(self, nexus_client: AuthenticatedClient) -> None:
        """GET /settings/categories returns 200 with results."""
        client = nexus_client.get_httpx_client()
        response = client.get("/api/v1/settings/categories")

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert isinstance(data["results"], list)
        assert len(data["results"]) > 0

    def test_get_setting(self, nexus_client: AuthenticatedClient) -> None:
        """GET /settings/{key} returns a specific setting."""
        client = nexus_client.get_httpx_client()
        response = client.get("/api/v1/settings/context_manager.max_total_tokens")

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "context_manager.max_total_tokens"
        assert "effective_value" in data

    def test_update_setting(self, nexus_client: AuthenticatedClient) -> None:
        """PATCH /settings/{key} updates a setting and resets afterward."""
        client = nexus_client.get_httpx_client()
        original = client.get("/api/v1/settings/context_manager.max_total_tokens").json()
        original_value = original["effective_value"]

        try:
            patch_response = client.patch(
                "/api/v1/settings/context_manager.max_total_tokens",
                json={"value": 6666},
            )
            assert patch_response.status_code == 200
            assert patch_response.json()["effective_value"] == 6666
        finally:
            client.patch(
                "/api/v1/settings/context_manager.max_total_tokens",
                json={"value": original_value},
            )


class TestLogLevelSetting:
    """E2E tests for the logging.log_level runtime setting."""

    def test_get_log_level(self, nexus_client: AuthenticatedClient) -> None:
        """Admin can read the log level setting with expected metadata."""
        client = nexus_client.get_httpx_client()
        response = client.get(_LOG_LEVEL_PATH)

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == _LOG_LEVEL_KEY
        assert data["requires_restart"] is False
        assert data["effective_value"] in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")

    def test_update_log_level(self, nexus_client: AuthenticatedClient) -> None:
        """Admin can change the log level and the update persists on re-read."""
        client = nexus_client.get_httpx_client()
        original = client.get(_LOG_LEVEL_PATH).json()
        original_value = original["effective_value"]

        try:
            patch_resp = client.patch(_LOG_LEVEL_PATH, json={"value": "DEBUG"})
            assert patch_resp.status_code == 200
            assert patch_resp.json()["effective_value"] == "DEBUG"

            # Re-read to confirm persistence
            get_resp = client.get(_LOG_LEVEL_PATH)
            assert get_resp.status_code == 200
            assert get_resp.json()["effective_value"] == "DEBUG"
        finally:
            client.patch(_LOG_LEVEL_PATH, json={"value": original_value})

    def test_update_log_level_rejects_invalid(self, nexus_client: AuthenticatedClient) -> None:
        """Updating log level with an invalid value returns 422."""
        client = nexus_client.get_httpx_client()
        response = client.patch(_LOG_LEVEL_PATH, json={"value": "INVALID"})

        assert response.status_code == 422


class TestSettingsAuthorization:
    """E2E tests verifying non-admin users cannot access settings."""

    def test_viewer_cannot_list_settings(self, viewer_client: AuthenticatedClient) -> None:
        """Non-admin user is denied access to list settings."""
        client = viewer_client.get_httpx_client()
        response = client.get("/api/v1/settings")

        assert response.status_code == 403

    def test_viewer_cannot_get_setting(self, viewer_client: AuthenticatedClient) -> None:
        """Non-admin user is denied access to read a specific setting."""
        client = viewer_client.get_httpx_client()
        response = client.get(_LOG_LEVEL_PATH)

        assert response.status_code == 403

    def test_viewer_cannot_update_setting(self, viewer_client: AuthenticatedClient) -> None:
        """Non-admin user is denied access to update a setting."""
        client = viewer_client.get_httpx_client()
        response = client.patch(_LOG_LEVEL_PATH, json={"value": "DEBUG"})

        assert response.status_code == 403
