"""E2E tests for integration API endpoints.

Covers CRUD operations for all three integration types (MCP server,
LLM provider, AAP gateway), filtering, pagination, and error cases.

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import pytest

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client.api import NexusApiRegistry

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from nexus_api_client.models.aap_gateway_configuration import AAPGatewayConfiguration
from nexus_api_client.models.integration_create import IntegrationCreate
from nexus_api_client.models.integration_patch import IntegrationPatch
from nexus_api_client.models.integration_type import IntegrationType
from nexus_api_client.models.llm_provider_configuration import LLMProviderConfiguration
from nexus_api_client.models.mcp_server_configuration_input import MCPServerConfigurationInput

from tests.e2e.conftest import unique_name

pytestmark = [pytest.mark.e2e]


def _mcp_create(name: str | None = None) -> IntegrationCreate:
    return IntegrationCreate(
        name=name or unique_name("e2e-mcp"),
        integration_type=IntegrationType.MCP_SERVER,
        configuration=MCPServerConfigurationInput(base_url="https://mcp.example.com"),
    )


def _llm_create(name: str | None = None) -> IntegrationCreate:
    return IntegrationCreate(
        name=name or unique_name("e2e-llm"),
        integration_type=IntegrationType.LLM_PROVIDER,
        configuration=LLMProviderConfiguration(
            base_url="https://api.openai.com",
            provider_hint="openai",
        ),
    )


def _aap_create(name: str | None = None) -> IntegrationCreate:
    return IntegrationCreate(
        name=name or unique_name("e2e-aap"),
        integration_type=IntegrationType.AAP_GATEWAY,
        configuration=AAPGatewayConfiguration(
            gateway_url="https://gateway.example.com",
            insecure_skip_tls_verify=False,
        ),
    )


class TestCreateIntegration:
    """POST /api/v1/integrations."""

    def test_create_mcp_server(self, integration_factory: Callable[..., dict[str, Any]]) -> None:
        result = integration_factory(_mcp_create())
        assert result["integration_type"] == "mcp_server"
        assert result["configuration"]["base_url"] == "https://mcp.example.com"
        assert result["validation_status"] == "unknown"
        assert result["enabled"] is True
        assert result["scope"] == "global"

    def test_create_llm_provider(self, integration_factory: Callable[..., dict[str, Any]]) -> None:
        result = integration_factory(_llm_create())
        assert result["integration_type"] == "llm_provider"
        assert result["configuration"]["provider_hint"] == "openai"

    def test_create_aap_gateway(self, integration_factory: Callable[..., dict[str, Any]]) -> None:
        result = integration_factory(_aap_create())
        assert result["integration_type"] == "aap_gateway"
        assert result["configuration"]["insecure_skip_tls_verify"] is False

    def test_create_duplicate_name_returns_409(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        name = unique_name("e2e-dup")
        integration_factory(_mcp_create(name=name))
        resp = nexus_api.integrations.create(body=_mcp_create(name=name))
        assert resp.status_code == HTTPStatus.CONFLICT


class TestGetIntegration:
    """GET /api/v1/integrations/{integration_id}."""

    def test_get_returns_200(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        created = integration_factory(_mcp_create())
        integration = nexus_api.integrations.get(integration_id=UUID(created["id"])).assert_and_get()
        assert str(integration.id) == created["id"]

    def test_get_not_found_returns_404(self, nexus_api: NexusApiRegistry) -> None:
        resp = nexus_api.integrations.get(integration_id=uuid4())
        assert resp.status_code == HTTPStatus.NOT_FOUND


class TestListIntegrations:
    """GET /api/v1/integrations."""

    def test_list_returns_created(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        created = integration_factory(_mcp_create())
        result = nexus_api.integrations.list().assert_and_get()
        ids = [str(r.id) for r in result.resources]
        assert created["id"] in ids

    def test_list_filter_by_type(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        integration_factory(_mcp_create())
        integration_factory(_llm_create())
        result = nexus_api.integrations.list(integration_type=IntegrationType.MCP_SERVER).assert_and_get()
        for r in result.resources:
            assert r.integration_type == IntegrationType.MCP_SERVER

    def test_list_filter_by_enabled(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        integration_factory(
            IntegrationCreate(
                name=unique_name("e2e-disabled"),
                integration_type=IntegrationType.MCP_SERVER,
                configuration=MCPServerConfigurationInput(base_url="https://mcp.example.com"),
                enabled=False,
            )
        )
        result = nexus_api.integrations.list(enabled=False).assert_and_get()
        for r in result.resources:
            assert r.enabled is False

    def test_list_pagination(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        for _ in range(3):
            integration_factory(_mcp_create())
        result = nexus_api.integrations.list(limit=2).assert_and_get()
        assert len(result.resources) == 2
        assert result.next_ is not None


class TestPatchIntegration:
    """PATCH /api/v1/integrations/{integration_id}."""

    def test_patch_name(self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]) -> None:
        created = integration_factory(_mcp_create())
        new_name = unique_name("e2e-renamed")
        updated = nexus_api.integrations.update(
            integration_id=UUID(created["id"]),
            body=IntegrationPatch(name=new_name),
        ).assert_and_get()
        assert updated.name == new_name

    def test_patch_enabled(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        created = integration_factory(_mcp_create())
        updated = nexus_api.integrations.update(
            integration_id=UUID(created["id"]),
            body=IntegrationPatch(enabled=False),
        ).assert_and_get()
        assert updated.enabled is False

    def test_patch_name_conflict_returns_409(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        taken_name = unique_name("e2e-taken")
        integration_factory(_mcp_create(name=taken_name))
        other = integration_factory(_mcp_create())
        resp = nexus_api.integrations.update(
            integration_id=UUID(other["id"]),
            body=IntegrationPatch(name=taken_name),
        )
        assert resp.status_code == HTTPStatus.CONFLICT

    def test_patch_config_type_mismatch_returns_422(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        created = integration_factory(_mcp_create())
        resp = nexus_api.integrations.update(
            integration_id=UUID(created["id"]),
            body=IntegrationPatch(
                configuration=LLMProviderConfiguration(base_url="https://api.openai.com"),
            ),
        )
        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


class TestDeleteIntegration:
    """DELETE /api/v1/integrations/{integration_id}."""

    def test_delete_returns_204(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        created = integration_factory(_mcp_create())
        integration_id = UUID(created["id"])
        resp = nexus_api.integrations.delete(integration_id=integration_id)
        assert resp.status_code == HTTPStatus.NO_CONTENT

    def test_delete_not_found_returns_404(self, nexus_api: NexusApiRegistry) -> None:
        resp = nexus_api.integrations.delete(integration_id=uuid4())
        assert resp.status_code == HTTPStatus.NOT_FOUND

    def test_deleted_not_gettable(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        created = integration_factory(_mcp_create())
        integration_id = UUID(created["id"])
        nexus_api.integrations.delete(integration_id=integration_id)
        resp = nexus_api.integrations.get(integration_id=integration_id)
        assert resp.status_code == HTTPStatus.NOT_FOUND


class TestValidateIntegration:
    """Tests for POST /integrations/{id}/validate."""

    def test_validate_nonexistent_returns_404(self, nexus_api: NexusApiRegistry) -> None:
        resp = nexus_api.integrations.validate(integration_id=uuid4())
        assert resp.status_code == HTTPStatus.NOT_FOUND

    def test_validate_without_credential_returns_200(
        self, nexus_api: NexusApiRegistry, integration_factory: Callable[..., dict[str, Any]]
    ) -> None:
        """Validate is a no-op ping — it succeeds even without a configured credential."""
        created = integration_factory(_mcp_create())
        integration_id = UUID(created["id"])
        resp = nexus_api.integrations.validate(integration_id=integration_id)
        assert resp.status_code == HTTPStatus.OK
