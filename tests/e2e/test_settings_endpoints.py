"""E2E tests for settings API endpoints."""

import pytest
from nexus_api_client import AuthenticatedClient

pytestmark = pytest.mark.e2e


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
        # Get current state
        get_response = client.get("/api/v1/settings/context_manager.max_total_tokens")
        assert get_response.status_code == 200
        original = get_response.json()
        original_value = original["effective_value"]

        try:
            # Update
            patch_response = client.patch(
                "/api/v1/settings/context_manager.max_total_tokens",
                json={"value": 6666},
            )
            assert patch_response.status_code == 200
            assert patch_response.json()["effective_value"] == 6666
        finally:
            # Reset to original
            client.patch(
                "/api/v1/settings/context_manager.max_total_tokens",
                json={"value": original_value},
            )
