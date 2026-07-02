"""Unit tests for IntegrationService operational methods.

Covers validate_integration(), discover(), refresh_resources(),
update_system_status(), and _resolve_credential() — methods that interact
with external adapters, credentials, and audit dispatching.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType
from nexus.integrations.adapters.protocol import (
    DiscoveredTool,
    DiscoveredToolParameter,
    DiscoverResult,
    ValidateResult,
)
from nexus.integrations.exceptions import (
    IntegrationCredentialNotFoundError,
    IntegrationNotFoundError,
    IntegrationRefreshNotSupportedError,
)
from nexus.integrations.models.integration import (
    Integration,
    IntegrationCreate,
    IntegrationRefreshStatus,
    IntegrationStatus,
    IntegrationStatusPatch,
    IntegrationType,
)
from nexus.integrations.services.integration_service import IntegrationService
from nexus.tool_manager.models.tool import Tool, ToolStatus

SERVICE_MODULE = "nexus.integrations.services.integration_service"


@pytest.fixture
def secret_service() -> MagicMock:
    svc = MagicMock()
    svc.retrieve_secret = AsyncMock(return_value={"token": "test-token-value"})
    return svc


@pytest.fixture
def integration_service(
    test_db_session: AsyncSession, test_user: User, secret_service: MagicMock
) -> IntegrationService:
    return IntegrationService(test_db_session, test_user, secret_service)


@pytest.fixture
def integration_service_no_secrets(test_db_session: AsyncSession, test_user: User) -> IntegrationService:
    return IntegrationService(test_db_session, test_user)


def _mcp_create(name: str = "Test MCP", **kwargs: object) -> IntegrationCreate:
    defaults: dict[str, object] = {
        "name": name,
        "integration_type": IntegrationType.MCP_SERVER,
        "configuration": {"integration_type": "mcp_server", "base_url": "http://localhost:8080"},
    }
    defaults.update(kwargs)
    return IntegrationCreate(**defaults)


async def _create_credential(
    session: AsyncSession, user: User, *, secret_id: str | None = None, with_secret: bool = True
) -> tuple[Credential, CredentialType]:
    from nexus.authz.models import Project

    project = Project(name=f"test-project-{uuid4().hex[:8]}", created_by=user.id, updated_by=user.id)
    session.add(project)
    await session.flush()

    cred_type = CredentialType(
        name=f"HTTP Bearer Token {uuid4().hex[:6]}",
        namespace=f"http_bearer_{uuid4().hex[:6]}",
        inputs={"fields": [{"id": "token", "label": "Token", "type": "string", "secret": True}]},
        injectors={"extra_vars": {"bearer_token": "{{ token }}"}},
        created_by=user.id,
        updated_by=user.id,
    )
    session.add(cred_type)
    await session.flush()

    cred = Credential(
        name=f"Test Credential {uuid4().hex[:6]}",
        credential_type_id=cred_type.id,
        secret_id=uuid4() if with_secret else None,
        project_id=project.id,
        created_by=user.id,
        updated_by=user.id,
    )
    session.add(cred)
    await session.flush()
    return cred, cred_type


def _mock_runtime_settings(timeout: int = 10) -> AsyncMock:
    mock = MagicMock()
    mock.get = AsyncMock(return_value=timeout)
    return mock


class TestUpdateSystemStatus:
    """Tests for IntegrationService.update_system_status."""

    @pytest.mark.asyncio
    async def test_updates_enabled_field(
        self, test_db_session: AsyncSession, integration_service: IntegrationService
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())
        assert created.enabled is True

        result = await integration_service.update_system_status(created.id, IntegrationStatusPatch(enabled=False))

        assert result.enabled is False

    @pytest.mark.asyncio
    async def test_updates_validation_status(
        self, test_db_session: AsyncSession, integration_service: IntegrationService
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        result = await integration_service.update_system_status(
            created.id,
            IntegrationStatusPatch(validation_status=IntegrationStatus.ERROR, validation_error="Server down"),
        )

        assert result.validation_status == IntegrationStatus.ERROR
        assert result.validation_error == "Server down"

    @pytest.mark.asyncio
    async def test_partial_update_only_sets_provided_fields(
        self, test_db_session: AsyncSession, integration_service: IntegrationService
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        result = await integration_service.update_system_status(created.id, IntegrationStatusPatch(enabled=False))

        assert result.enabled is False
        assert result.validation_status == created.validation_status

    @pytest.mark.asyncio
    async def test_not_found_raises(
        self, test_db_session: AsyncSession, integration_service: IntegrationService
    ) -> None:
        with pytest.raises(IntegrationNotFoundError):
            await integration_service.update_system_status(uuid4(), IntegrationStatusPatch(enabled=False))


class TestResolveCredential:
    """Tests for IntegrationService._resolve_credential."""

    @pytest.mark.asyncio
    async def test_resolves_credential_successfully(
        self, test_db_session: AsyncSession, test_user: User, secret_service: MagicMock
    ) -> None:
        cred_id = uuid4()
        cred_type_id = uuid4()

        mock_cred = MagicMock()
        mock_cred.secret_id = uuid4()
        mock_cred.credential_type_id = cred_type_id

        mock_cred_type = MagicMock()
        mock_cred_type.injectors = {"extra_vars": {"token": "{{ token }}"}}

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(
            side_effect=lambda model, _id: mock_cred if model == Credential else mock_cred_type
        )

        service = IntegrationService(mock_session, test_user, secret_service)
        result = await service._resolve_credential(cred_id)

        assert isinstance(result, dict)
        secret_service.retrieve_secret.assert_called_once_with(mock_cred.secret_id)

    @pytest.mark.asyncio
    async def test_raises_when_credential_not_found(
        self, test_db_session: AsyncSession, test_user: User, secret_service: MagicMock
    ) -> None:
        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=None)

        service = IntegrationService(mock_session, test_user, secret_service)
        with pytest.raises(IntegrationCredentialNotFoundError):
            await service._resolve_credential(uuid4())

    @pytest.mark.asyncio
    async def test_raises_when_credential_has_no_secret(
        self, test_db_session: AsyncSession, test_user: User, secret_service: MagicMock
    ) -> None:
        mock_cred = MagicMock()
        mock_cred.secret_id = None

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=mock_cred)

        service = IntegrationService(mock_session, test_user, secret_service)
        with pytest.raises(IntegrationCredentialNotFoundError):
            await service._resolve_credential(uuid4())

    @pytest.mark.asyncio
    async def test_raises_when_credential_type_not_found(
        self, test_db_session: AsyncSession, test_user: User, secret_service: MagicMock
    ) -> None:
        mock_cred = MagicMock()
        mock_cred.secret_id = uuid4()
        mock_cred.credential_type_id = uuid4()

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(side_effect=lambda model, _id: mock_cred if model == Credential else None)

        service = IntegrationService(mock_session, test_user, secret_service)
        with pytest.raises(IntegrationCredentialNotFoundError):
            await service._resolve_credential(uuid4())

    @pytest.mark.asyncio
    async def test_raises_when_no_secret_service(self, test_db_session: AsyncSession, test_user: User) -> None:
        mock_session = AsyncMock()
        service = IntegrationService(mock_session, test_user)

        with pytest.raises(RuntimeError, match="SecretService is required"):
            await service._resolve_credential(uuid4())


class TestValidateIntegration:
    """Tests for IntegrationService.validate_integration."""

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_successful_validation_sets_available(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.validate = AsyncMock(return_value=ValidateResult(success=True, checked_at=datetime.now(UTC)))
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        result = await integration_service.validate_integration(created.id)

        assert result.success is True
        integration = await test_db_session.get(Integration, created.id)
        assert integration is not None
        assert integration.validation_status == IntegrationStatus.AVAILABLE
        assert integration.last_validated_at is not None

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_failed_validation_sets_error(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.validate = AsyncMock(
            return_value=ValidateResult(success=False, checked_at=datetime.now(UTC), error="Connection refused")
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        result = await integration_service.validate_integration(created.id)

        assert result.success is False
        assert result.error == "Connection refused"
        integration = await test_db_session.get(Integration, created.id)
        assert integration is not None
        assert integration.validation_status == IntegrationStatus.ERROR
        assert integration.validation_error == "Connection refused"

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    async def test_not_found_dispatches_audit_and_raises(
        self,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        fake_id = uuid4()
        with pytest.raises(IntegrationNotFoundError):
            await integration_service.validate_integration(fake_id)

        mock_audit.dispatch.assert_called_once()

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_validation_without_credential_passes_empty_dict(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.validate = AsyncMock(return_value=ValidateResult(success=True, checked_at=datetime.now(UTC)))
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        await integration_service.validate_integration(created.id)

        mock_adapter.validate.assert_called_once_with({}, 10)

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_unexpected_exception_sets_error_status(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.validate = AsyncMock(side_effect=RuntimeError("DB pool exhausted"))
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        with pytest.raises(RuntimeError, match="DB pool exhausted"):
            await integration_service.validate_integration(created.id)

        integration = await test_db_session.get(Integration, created.id)
        assert integration is not None
        assert integration.validation_status == IntegrationStatus.ERROR
        assert integration.validation_error == "Unexpected error during validation: RuntimeError"
        assert integration.last_validated_at is not None


class TestDiscover:
    """Tests for IntegrationService.discover."""

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_successful_discover_returns_tools(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[
                    DiscoveredTool(name="tool_a", description="Tool A"),
                    DiscoveredTool(name="tool_b", description="Tool B"),
                ],
            )
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        from nexus.integrations.models.integration import IntegrationTestConnection
        from nexus.integrations.models.integration_configuration import MCPServerConfigurationInput

        cred_id = uuid4()
        data = IntegrationTestConnection(
            integration_type=IntegrationType.MCP_SERVER,
            configuration=MCPServerConfigurationInput(
                integration_type=IntegrationType.MCP_SERVER,
                base_url="http://localhost:8080",
            ),
            credential_id=cred_id,
        )

        with patch.object(
            integration_service, "_resolve_credential", new_callable=AsyncMock, return_value={"token": "t"}
        ):
            result = await integration_service.discover(data)

        assert result.success is True
        assert result.discovered_tools is not None
        assert len(result.discovered_tools) == 2

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_failed_discover_dispatches_audit(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=False,
                checked_at=datetime.now(UTC),
                error="Timeout",
            )
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        from nexus.integrations.models.integration import IntegrationTestConnection
        from nexus.integrations.models.integration_configuration import MCPServerConfigurationInput

        cred_id = uuid4()
        data = IntegrationTestConnection(
            integration_type=IntegrationType.MCP_SERVER,
            configuration=MCPServerConfigurationInput(
                integration_type=IntegrationType.MCP_SERVER,
                base_url="http://localhost:8080",
            ),
            credential_id=cred_id,
        )

        with patch.object(
            integration_service, "_resolve_credential", new_callable=AsyncMock, return_value={"token": "t"}
        ):
            result = await integration_service.discover(data)

        assert result.success is False
        mock_audit.dispatch.assert_called_once()


class TestRefreshIntegrationResources:
    """Tests for IntegrationService.refresh_resources."""

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_successful_refresh_creates_tools(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[
                    DiscoveredTool(
                        name="tool_a",
                        description="Tool A",
                        parameters=[
                            DiscoveredToolParameter(name="param1", type="string"),
                        ],
                    ),
                    DiscoveredTool(name="tool_b", description="Tool B"),
                ],
            )
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        result = await integration_service.refresh_resources(created.id)

        assert result.tools_synced_count == 2
        assert result.tools_updated_count == 0
        assert result.tools_disabled_count == 0
        assert result.refreshed_at is not None

        tools = (await test_db_session.exec(select(Tool).where(Tool.integration_id == created.id))).all()
        assert len(tools) == 2

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_refresh_updates_existing_tools(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[DiscoveredTool(name="tool_a", description="Original")],
            )
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        await integration_service.refresh_resources(created.id)

        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[DiscoveredTool(name="tool_a", description="Updated")],
            )
        )

        result = await integration_service.refresh_resources(created.id)

        assert result.tools_synced_count == 0
        assert result.tools_updated_count == 1

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_refresh_disables_missing_tools(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[
                    DiscoveredTool(name="tool_a", description="A"),
                    DiscoveredTool(name="tool_b", description="B"),
                ],
            )
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        await integration_service.refresh_resources(created.id)

        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[DiscoveredTool(name="tool_a", description="A")],
            )
        )

        result = await integration_service.refresh_resources(created.id)

        assert result.tools_disabled_count == 1

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_failed_refresh_sets_error_status(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=False,
                checked_at=datetime.now(UTC),
                error="Connection refused",
            )
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        result = await integration_service.refresh_resources(created.id)

        assert result.tools_synced_count == 0
        integration = await test_db_session.get(Integration, created.id)
        assert integration is not None
        assert integration.refresh_status == IntegrationRefreshStatus.ERROR
        assert integration.refresh_error == "Connection refused"

    @pytest.mark.asyncio
    async def test_refresh_unsupported_type_raises(
        self, test_db_session: AsyncSession, integration_service: IntegrationService, test_user: User
    ) -> None:
        integration = Integration(
            name="AAP Gateway",
            integration_type=IntegrationType.AAP_GATEWAY,
            configuration={
                "integration_type": "aap_gateway",
                "gateway_url": "https://gateway.example.com",
            },
            created_by=test_user.id,
            updated_by=test_user.id,
        )
        test_db_session.add(integration)
        await test_db_session.flush()

        with pytest.raises(IntegrationRefreshNotSupportedError):
            await integration_service.refresh_resources(integration.id)

    @pytest.mark.asyncio
    async def test_refresh_not_found_raises(
        self, test_db_session: AsyncSession, integration_service: IntegrationService
    ) -> None:
        with pytest.raises(IntegrationNotFoundError):
            await integration_service.refresh_resources(uuid4())

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_successful_refresh_sets_available_status(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[],
            )
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        await integration_service.refresh_resources(created.id)

        integration = await test_db_session.get(Integration, created.id)
        assert integration is not None
        assert integration.refresh_status == IntegrationRefreshStatus.AVAILABLE
        assert integration.refresh_error is None
        assert integration.last_refreshed_at is not None

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_refresh_preserves_enabled_state(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Tools that were disabled by the admin stay disabled after refresh."""
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[
                    DiscoveredTool(name="tool_a", description="A"),
                    DiscoveredTool(name="tool_b", description="B"),
                ],
            )
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        await integration_service.refresh_resources(created.id)

        # Admin disables tool_a
        tools = (
            await test_db_session.exec(select(Tool).where(Tool.integration_id == created.id, Tool.name == "tool_a"))
        ).one()
        tools.enabled = False
        await test_db_session.flush()

        # Refresh again with same tools
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[
                    DiscoveredTool(name="tool_a", description="A updated"),
                    DiscoveredTool(name="tool_b", description="B updated"),
                ],
            )
        )

        await integration_service.refresh_resources(created.id)

        # tool_a should still be disabled, tool_b should still be enabled
        tool_a = (
            await test_db_session.exec(select(Tool).where(Tool.integration_id == created.id, Tool.name == "tool_a"))
        ).one()
        tool_b = (
            await test_db_session.exec(select(Tool).where(Tool.integration_id == created.id, Tool.name == "tool_b"))
        ).one()
        assert tool_a.enabled is False
        assert tool_a.description == "A updated"
        assert tool_b.enabled is True
        assert tool_b.description == "B updated"

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_refresh_restores_missing_tool_status_to_available(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """A tool marked MISSING that reappears gets status=available but keeps enabled state."""
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[DiscoveredTool(name="tool_a", description="A")],
            )
        )
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        await integration_service.refresh_resources(created.id)

        # Tool disappears on next refresh
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[],
            )
        )
        result = await integration_service.refresh_resources(created.id)
        assert result.tools_disabled_count == 1

        tool_a = (
            await test_db_session.exec(select(Tool).where(Tool.integration_id == created.id, Tool.name == "tool_a"))
        ).one()
        assert tool_a.status == ToolStatus.MISSING
        assert tool_a.enabled is False

        # Tool reappears on next refresh
        mock_adapter.discover = AsyncMock(
            return_value=DiscoverResult(
                success=True,
                checked_at=datetime.now(UTC),
                discovered_tools=[DiscoveredTool(name="tool_a", description="A is back")],
            )
        )
        result = await integration_service.refresh_resources(created.id)
        assert result.tools_updated_count == 1

        tool_a = (
            await test_db_session.exec(select(Tool).where(Tool.integration_id == created.id, Tool.name == "tool_a"))
        ).one()
        assert tool_a.status == ToolStatus.AVAILABLE
        assert tool_a.description == "A is back"
        # enabled stays False because refresh doesn't override admin's disable
        assert tool_a.enabled is False

    @pytest.mark.asyncio
    @patch(f"{SERVICE_MODULE}.AuditEventDispatcher")
    @patch(f"{SERVICE_MODULE}.get_runtime_settings")
    @patch(f"{SERVICE_MODULE}.create_health_check_adapter")
    async def test_unexpected_exception_sets_error_status(
        self,
        mock_adapter_factory: MagicMock,
        mock_settings: MagicMock,
        mock_audit: MagicMock,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        created = await integration_service.create_integration(_mcp_create())

        mock_adapter = AsyncMock()
        mock_adapter.discover = AsyncMock(side_effect=RuntimeError("Session pool timeout"))
        mock_adapter_factory.return_value = mock_adapter
        mock_settings.return_value = _mock_runtime_settings()

        with pytest.raises(RuntimeError, match="Session pool timeout"):
            await integration_service.refresh_resources(created.id)

        integration = await test_db_session.get(Integration, created.id)
        assert integration is not None
        assert integration.refresh_status == IntegrationRefreshStatus.ERROR
        assert integration.refresh_error == "Unexpected error during refresh: RuntimeError"
        assert integration.last_refreshed_at is not None
