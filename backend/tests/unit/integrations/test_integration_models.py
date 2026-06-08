"""Unit tests for integration models and configuration types."""

import pytest
from pydantic import ValidationError

from nexus.integrations.models.integration import (
    IntegrationCreate,
    IntegrationPatch,
    IntegrationScope,
    IntegrationStatus,
    IntegrationSystemUpdate,
    IntegrationType,
)
from nexus.integrations.models.integration_configuration import (
    AAPGatewayConfiguration,
    LLMProviderConfiguration,
    MCPServerConfiguration,
)


class TestIntegrationConfigurationModels:
    """Tests for discriminated union configuration types."""

    def test_mcp_server_configuration(self) -> None:
        config = MCPServerConfiguration(base_url="http://localhost:8080")
        assert config.integration_type == "mcp_server"
        assert config.base_url == "http://localhost:8080"

    def test_llm_provider_configuration(self) -> None:
        config = LLMProviderConfiguration(base_url="http://localhost:11434")
        assert config.integration_type == "llm_provider"
        assert config.provider_hint is None

    def test_llm_provider_configuration_with_hint(self) -> None:
        config = LLMProviderConfiguration(base_url="http://localhost:11434", provider_hint="ollama")
        assert config.provider_hint == "ollama"

    def test_aap_gateway_configuration(self) -> None:
        config = AAPGatewayConfiguration(gateway_url="https://gateway.example.com")
        assert config.integration_type == "aap_gateway"
        assert config.insecure_skip_tls_verify is False

    def test_aap_gateway_configuration_skip_tls_verify(self) -> None:
        config = AAPGatewayConfiguration(gateway_url="https://gateway.example.com", insecure_skip_tls_verify=True)
        assert config.insecure_skip_tls_verify is True

    def test_mcp_server_rejects_extra_fields(self) -> None:
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            MCPServerConfiguration(base_url="http://localhost:8080", api_key="secret")

    def test_llm_provider_rejects_extra_fields(self) -> None:
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            LLMProviderConfiguration(base_url="http://localhost:11434", extra_field="val")

    def test_aap_gateway_rejects_extra_fields(self) -> None:
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            AAPGatewayConfiguration(gateway_url="https://gw.example.com", extra_field="val")


class TestURLValidation:
    """Tests for SSRF-prevention URL validation on configuration models."""

    def test_mcp_server_normalizes_url(self) -> None:
        config = MCPServerConfiguration(base_url="http://localhost:8080/")
        assert config.base_url == "http://localhost:8080"

    def test_mcp_server_rejects_url_with_path(self) -> None:
        with pytest.raises(ValidationError, match="must not contain a path"):
            MCPServerConfiguration(base_url="http://localhost:8080/some/path")

    def test_mcp_server_rejects_url_without_scheme(self) -> None:
        with pytest.raises(ValidationError, match="scheme must be"):
            MCPServerConfiguration(base_url="localhost:8080")

    def test_llm_provider_rejects_url_with_path(self) -> None:
        with pytest.raises(ValidationError, match="must not contain a path"):
            LLMProviderConfiguration(base_url="http://localhost:11434/v1/chat")

    def test_llm_provider_rejects_ftp_scheme(self) -> None:
        with pytest.raises(ValidationError, match="scheme must be"):
            LLMProviderConfiguration(base_url="ftp://example.com")

    def test_aap_gateway_rejects_http(self) -> None:
        with pytest.raises(ValidationError, match="scheme must be"):
            AAPGatewayConfiguration(gateway_url="http://gateway.example.com")

    def test_aap_gateway_rejects_url_with_query(self) -> None:
        with pytest.raises(ValidationError, match="must not contain a query"):
            AAPGatewayConfiguration(gateway_url="https://gateway.example.com?token=abc")

    def test_aap_gateway_accepts_https(self) -> None:
        config = AAPGatewayConfiguration(gateway_url="https://gateway.example.com")
        assert config.gateway_url == "https://gateway.example.com"

    def test_mcp_server_accepts_http_and_https(self) -> None:
        http = MCPServerConfiguration(base_url="http://localhost:8080")
        https = MCPServerConfiguration(base_url="https://mcp.example.com")
        assert http.base_url == "http://localhost:8080"
        assert https.base_url == "https://mcp.example.com"


class TestIntegrationCreate:
    """Tests for IntegrationCreate schema validation."""

    def test_valid_mcp_server_create(self) -> None:
        data = IntegrationCreate(
            name="My MCP Server",
            integration_type=IntegrationType.MCP_SERVER,
            configuration={"integration_type": "mcp_server", "base_url": "http://localhost:8080"},
        )
        assert data.name == "My MCP Server"
        assert data.integration_type == IntegrationType.MCP_SERVER
        assert data.enabled is True
        assert data.scope == IntegrationScope.GLOBAL
        assert data.management_credential_id is None
        assert data.labels == {}

    def test_valid_llm_provider_create(self) -> None:
        data = IntegrationCreate(
            name="My LLM",
            integration_type=IntegrationType.LLM_PROVIDER,
            configuration={"integration_type": "llm_provider", "base_url": "http://localhost:11434"},
        )
        assert data.integration_type == IntegrationType.LLM_PROVIDER

    def test_valid_aap_gateway_create(self) -> None:
        data = IntegrationCreate(
            name="My Gateway",
            integration_type=IntegrationType.AAP_GATEWAY,
            configuration={"integration_type": "aap_gateway", "gateway_url": "https://gw.example.com"},
        )
        assert data.integration_type == IntegrationType.AAP_GATEWAY

    def test_missing_name_raises(self) -> None:
        with pytest.raises(ValidationError, match="Field required"):
            IntegrationCreate(
                integration_type=IntegrationType.MCP_SERVER,
                configuration={"integration_type": "mcp_server", "base_url": "http://localhost:8080"},
            )

    def test_missing_configuration_raises(self) -> None:
        with pytest.raises(ValidationError, match="Field required"):
            IntegrationCreate(
                name="Test",
                integration_type=IntegrationType.MCP_SERVER,
            )

    def test_missing_discriminator_raises(self) -> None:
        with pytest.raises(ValidationError, match="Unable to extract tag"):
            IntegrationCreate(
                name="Test",
                integration_type=IntegrationType.MCP_SERVER,
                configuration={"base_url": "http://localhost:8080"},
            )

    def test_name_too_long_raises(self) -> None:
        with pytest.raises(ValidationError, match="String should have at most 255 characters"):
            IntegrationCreate(
                name="x" * 256,
                integration_type=IntegrationType.MCP_SERVER,
                configuration={"integration_type": "mcp_server", "base_url": "http://localhost:8080"},
            )

    def test_empty_name_raises(self) -> None:
        with pytest.raises(ValidationError, match="String should have at least 1 character"):
            IntegrationCreate(
                name="",
                integration_type=IntegrationType.MCP_SERVER,
                configuration={"integration_type": "mcp_server", "base_url": "http://localhost:8080"},
            )


class TestIntegrationPatch:
    """Tests for IntegrationPatch schema validation."""

    def test_all_fields_optional(self) -> None:
        patch = IntegrationPatch()
        assert patch.name is None
        assert patch.description is None
        assert patch.configuration is None
        assert patch.enabled is None
        assert patch.scope is None

    def test_partial_update(self) -> None:
        patch = IntegrationPatch(name="Updated Name", enabled=False)
        assert patch.name == "Updated Name"
        assert patch.enabled is False
        assert patch.configuration is None

    def test_rejects_unknown_fields(self) -> None:
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            IntegrationPatch(unknown_field="value")

    def test_rejects_system_managed_fields(self) -> None:
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            IntegrationPatch(status="available")


class TestIntegrationSystemUpdate:
    """Tests for IntegrationSystemUpdate schema validation."""

    def test_all_fields_optional(self) -> None:
        update = IntegrationSystemUpdate()
        assert update.status is None
        assert update.validation_error is None

    def test_set_status(self) -> None:
        update = IntegrationSystemUpdate(status=IntegrationStatus.AVAILABLE)
        assert update.status == IntegrationStatus.AVAILABLE

    def test_set_validation_error(self) -> None:
        update = IntegrationSystemUpdate(
            status=IntegrationStatus.ERROR,
            validation_error="Connection refused",
        )
        assert update.status == IntegrationStatus.ERROR
        assert update.validation_error == "Connection refused"


class TestIntegrationEnums:
    """Tests for integration enum values."""

    def test_integration_type_values(self) -> None:
        assert IntegrationType.MCP_SERVER.value == "mcp_server"
        assert IntegrationType.LLM_PROVIDER.value == "llm_provider"
        assert IntegrationType.AAP_GATEWAY.value == "aap_gateway"

    def test_integration_status_values(self) -> None:
        assert IntegrationStatus.VALIDATING.value == "validating"
        assert IntegrationStatus.AVAILABLE.value == "available"
        assert IntegrationStatus.ERROR.value == "error"

    def test_integration_scope_values(self) -> None:
        assert IntegrationScope.GLOBAL.value == "global"
        assert IntegrationScope.PROJECT.value == "project"
