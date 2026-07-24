"""Unit tests for integration models and configuration types."""

import pytest
from pydantic import ValidationError

from nexus.integrations.models.integration import (
    Integration,
    IntegrationCreate,
    IntegrationPatch,
    IntegrationScope,
    IntegrationStatus,
    IntegrationSystemUpdate,
    IntegrationType,
)
from nexus.integrations.models.integration_configuration import (
    AAPConfiguration,
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
        config = LLMProviderConfiguration(base_url="http://localhost:11434", provider_hint="custom")
        assert config.integration_type == "llm_provider"
        assert config.provider_hint == "custom"

    def test_llm_provider_configuration_with_hint(self) -> None:
        config = LLMProviderConfiguration(base_url="http://localhost:11434", provider_hint="red_hat_ai")
        assert config.provider_hint == "red_hat_ai"

    def test_aap_configuration(self) -> None:
        config = AAPConfiguration(aap_url="https://gateway.example.com")
        assert config.integration_type == "ansible_automation_platform"
        assert config.insecure_skip_tls_verify is False

    def test_aap_configuration_skip_tls_verify(self) -> None:
        config = AAPConfiguration(aap_url="https://gateway.example.com", insecure_skip_tls_verify=True)
        assert config.insecure_skip_tls_verify is True

    def test_mcp_server_rejects_extra_fields(self) -> None:
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            MCPServerConfiguration(base_url="http://localhost:8080", api_key="secret")

    def test_llm_provider_rejects_extra_fields(self) -> None:
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            LLMProviderConfiguration(base_url="http://localhost:11434", provider_hint="custom", extra_field="val")

    def test_aap_rejects_extra_fields(self) -> None:
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            AAPConfiguration(aap_url="https://gw.example.com", extra_field="val")


class TestURLValidation:
    """Tests for SSRF-prevention URL validation on configuration models."""

    def test_mcp_server_preserves_url_with_trailing_slash(self) -> None:
        config = MCPServerConfiguration(base_url="http://localhost:8080/")
        assert config.base_url == "http://localhost:8080/"

    def test_mcp_server_allows_url_with_path(self) -> None:
        config = MCPServerConfiguration(base_url="http://localhost:8765/mcp")
        assert config.base_url == "http://localhost:8765/mcp"

    def test_mcp_server_rejects_url_without_scheme(self) -> None:
        with pytest.raises(ValidationError, match="scheme must be"):
            MCPServerConfiguration(base_url="localhost:8080")

    def test_llm_provider_allows_url_with_path(self) -> None:
        config = LLMProviderConfiguration(base_url="http://localhost:11434/v1", provider_hint="custom")
        assert config.base_url == "http://localhost:11434/v1"

    def test_llm_provider_rejects_ftp_scheme(self) -> None:
        with pytest.raises(ValidationError, match="scheme must be"):
            LLMProviderConfiguration(base_url="ftp://example.com", provider_hint="custom")

    def test_llm_provider_empty_string_base_url_coerced_to_none(self) -> None:
        config = LLMProviderConfiguration(base_url="", provider_hint="openai")
        assert config.base_url is None

    def test_llm_provider_none_base_url_accepted_for_well_known_provider(self) -> None:
        config = LLMProviderConfiguration(base_url=None, provider_hint="openai")
        assert config.base_url is None

    def test_llm_provider_empty_base_url_rejected_for_custom(self) -> None:
        with pytest.raises(ValidationError, match="base_url is required"):
            LLMProviderConfiguration(base_url="", provider_hint="custom")

    def test_aap_rejects_http(self) -> None:
        with pytest.raises(ValidationError, match="scheme must be"):
            AAPConfiguration(aap_url="http://gateway.example.com")

    def test_aap_rejects_url_with_query(self) -> None:
        with pytest.raises(ValidationError, match="must not contain a query"):
            AAPConfiguration(aap_url="https://gateway.example.com?token=abc")

    def test_aap_rejects_url_with_path(self) -> None:
        with pytest.raises(ValidationError, match="must not contain a path"):
            AAPConfiguration(aap_url="https://evil.com/foo/bar/")

    def test_aap_rejects_url_with_path_and_query(self) -> None:
        with pytest.raises(ValidationError, match="must not contain"):
            AAPConfiguration(aap_url="https://evil.com/foo/?")

    def test_aap_accepts_https(self) -> None:
        config = AAPConfiguration(aap_url="https://gateway.example.com")
        assert config.aap_url == "https://gateway.example.com"

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
            configuration={
                "integration_type": "llm_provider",
                "base_url": "http://localhost:11434",
                "provider_hint": "custom",
            },
        )
        assert data.integration_type == IntegrationType.LLM_PROVIDER

    def test_valid_aap_create(self) -> None:
        data = IntegrationCreate(
            name="My Gateway",
            integration_type=IntegrationType.ANSIBLE_AUTOMATION_PLATFORM,
            configuration={"integration_type": "ansible_automation_platform", "aap_url": "https://gw.example.com"},
        )
        assert data.integration_type == IntegrationType.ANSIBLE_AUTOMATION_PLATFORM

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
        assert update.validation_status is None
        assert update.validation_error is None

    def test_set_status(self) -> None:
        update = IntegrationSystemUpdate(validation_status=IntegrationStatus.AVAILABLE)
        assert update.validation_status == IntegrationStatus.AVAILABLE

    def test_set_validation_error(self) -> None:
        update = IntegrationSystemUpdate(
            validation_error="Connection refused",
        )
        assert update.validation_status == IntegrationStatus.ERROR
        assert update.validation_error == "Connection refused"


class TestIntegrationEnums:
    """Tests for integration enum values."""

    def test_integration_type_values(self) -> None:
        assert IntegrationType.MCP_SERVER.value == "mcp_server"
        assert IntegrationType.LLM_PROVIDER.value == "llm_provider"
        assert IntegrationType.ANSIBLE_AUTOMATION_PLATFORM.value == "ansible_automation_platform"

    def test_integration_status_values(self) -> None:
        assert IntegrationStatus.UNKNOWN.value == "unknown"
        assert IntegrationStatus.VALIDATING.value == "validating"
        assert IntegrationStatus.AVAILABLE.value == "available"
        assert IntegrationStatus.ERROR.value == "error"

    def test_integration_scope_values(self) -> None:
        assert IntegrationScope.GLOBAL.value == "global"
        assert IntegrationScope.PROJECT.value == "project"


class TestIntegrationSortableFields:
    """Tests for Integration.__sortable_fields__."""

    def test_sortable_fields_contains_correct_fields(self) -> None:
        assert Integration.__sortable_fields__ == [
            "created_at",
            "updated_at",
            "name",
            "created_at",
            "updated_at",
            "integration_type",
            "validation_status",
            "enabled",
        ]
