"""Unit tests for InvocationExecutor MCP credential resolver.

Verifies that _make_mcp_credential_resolver:
- Uses execution credential from integration_connections when configured for an integration
- Returns None for integrations not listed in integration_connections (no management credential fallback)
- Returns None when integration_connections is None/empty (no management credential fallback)
"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.agent_orchestrator.executor.invocation_executor import InvocationExecutor
from nexus.agent_orchestrator.models.context_data import InvocationContextData
from nexus.agent_orchestrator.services.orchestration_service import OrchestrationService
from nexus.workflows.workflow_engine.models.workflow_definition import IntegrationConnectionConfig


def _make_executor() -> InvocationExecutor:
    """Build a minimal InvocationExecutor for testing."""
    mock_session = MagicMock()

    @asynccontextmanager
    async def mock_session_ctx() -> AsyncGenerator[MagicMock, None]:
        yield mock_session

    executor = InvocationExecutor.__new__(InvocationExecutor)
    executor.get_async_session_context = mock_session_ctx
    executor.session_factory = mock_session_ctx  # type: ignore[assignment]  # used by ContextManagerPlanner
    return executor


class TestMCPCredentialResolverWithMCPConnections:
    """Tests for execution credential resolution via integration_connections."""

    @pytest.mark.asyncio
    async def test_uses_execution_credential_for_listed_integration(self) -> None:
        """When integration_id is in integration_connections, execution credential is used."""
        integration_id = uuid4()
        exec_cred_id = str(uuid4())
        integration_connections = [
            IntegrationConnectionConfig(integration_id=str(integration_id), credential_id=exec_cred_id)
        ]

        executor = _make_executor()

        with patch.object(
            executor,
            "_resolve_mcp_execution_credential",
            new_callable=AsyncMock,
            return_value="exec-bearer-token",
        ) as mock_resolve:
            resolver = executor._make_mcp_credential_resolver(integration_connections)
            result = await resolver(integration_id)

        assert result == "exec-bearer-token"
        mock_resolve.assert_called_once_with(exec_cred_id)

    @pytest.mark.asyncio
    async def test_returns_none_for_unlisted_integration(self) -> None:
        """Integrations not in integration_connections return None — no management credential fallback."""
        listed_integration = uuid4()
        unlisted_integration = uuid4()
        integration_connections = [
            IntegrationConnectionConfig(integration_id=str(listed_integration), credential_id=str(uuid4()))
        ]

        executor = _make_executor()

        with patch.object(executor, "_resolve_mcp_execution_credential", new_callable=AsyncMock):
            resolver = executor._make_mcp_credential_resolver(integration_connections)
            result = await resolver(unlisted_integration)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_integration_connections(self) -> None:
        """Without integration_connections, all integrations return None — no management credential fallback."""
        integration_id = uuid4()
        executor = _make_executor()

        resolver = executor._make_mcp_credential_resolver(None)
        result = await resolver(integration_id)

        assert result is None

    @pytest.mark.asyncio
    async def test_propagates_credential_resolution_error_from_resolution(self) -> None:
        """CredentialResolutionError raised by _resolve_mcp_execution_credential propagates to the caller."""
        from nexus.agent_orchestrator.exceptions import CredentialResolutionError

        integration_id = uuid4()
        integration_connections = [
            IntegrationConnectionConfig(integration_id=str(integration_id), credential_id=str(uuid4()))
        ]
        executor = _make_executor()

        with patch.object(
            executor,
            "_resolve_mcp_execution_credential",
            new_callable=AsyncMock,
            side_effect=CredentialResolutionError("credential not found"),
        ):
            resolver = executor._make_mcp_credential_resolver(integration_connections)
            with pytest.raises(CredentialResolutionError):
                await resolver(integration_id)


class TestIntegrationConnectionConfig:
    """Tests for IntegrationConnectionConfig model in AgenticExecutorParameters."""

    def test_mcp_connection_config_validates(self) -> None:
        from nexus.workflows.workflow_engine.models.workflow_definition import IntegrationConnectionConfig

        conn = IntegrationConnectionConfig(
            integration_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            credential_id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        )
        assert conn.integration_id == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        assert conn.credential_id == "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    def test_agentic_executor_config_accepts_integration_connections(self) -> None:
        from nexus.workflows.workflow_engine.models.workflow_definition import AgenticExecutorParameters

        config = AgenticExecutorParameters.model_validate(
            {
                "prompt": "Test",
                "integration_connections": [
                    {
                        "integration_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                        "credential_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                    }
                ],
            }
        )
        assert config.integration_connections is not None
        assert len(config.integration_connections) == 1
        assert config.integration_connections[0].integration_id == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

    def test_agentic_executor_config_without_integration_connections(self) -> None:
        from nexus.workflows.workflow_engine.models.workflow_definition import AgenticExecutorParameters

        config = AgenticExecutorParameters.model_validate({"prompt": "Test"})
        assert config.integration_connections is None

    def test_agentic_executor_config_with_multiple_connections(self) -> None:
        from nexus.workflows.workflow_engine.models.workflow_definition import AgenticExecutorParameters

        config = AgenticExecutorParameters.model_validate(
            {
                "prompt": "Test",
                "integration_connections": [
                    {
                        "integration_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                        "credential_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
                    },
                    {
                        "integration_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                        "credential_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
                    },
                ],
            }
        )
        assert config.integration_connections is not None
        assert len(config.integration_connections) == 2


class TestInitOrchestrationToolSelectionExtraction:
    """Tests that _init_orchestration correctly extracts tool selection from InvocationMetadata.

    Verifies that tool_selection_strategy and tool_selections are read from
    ctx.metadata and forwarded to OrchestrationService.
    """

    @pytest.mark.asyncio
    async def test_tool_selections_forwarded_to_orchestration_service(self) -> None:
        """tool_selection_strategy and tool_selections in ctx.metadata reach OrchestrationService."""
        executor = _make_executor()

        ctx = InvocationContextData.model_validate(
            {
                "metadata": {
                    "tool_selection_strategy": "SELECTED",
                    "tool_selections": ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
                }
            }
        )

        invocation = MagicMock()
        invocation.id = uuid4()

        captured: dict[str, object] = {}

        def capture_service(**kwargs: object) -> MagicMock:
            captured.update(kwargs)
            return MagicMock(spec=OrchestrationService)

        mock_llm = MagicMock()
        mock_llm.openai_api_base = "https://openrouter.ai/api/v1"
        mock_llm.model_name = "test-model"

        with (
            patch(
                "nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm",
                return_value=mock_llm,
            ),
            patch("nexus.agent_orchestrator.executor.invocation_executor.ContextManagerPlanner"),
            patch(
                "nexus.agent_orchestrator.executor.invocation_executor.OrchestrationService",
                side_effect=capture_service,
            ),
        ):
            await executor._init_orchestration(invocation, ctx)

        assert captured.get("tool_selection_strategy") == "SELECTED"
        assert captured.get("tool_selections") == ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"]

    @pytest.mark.asyncio
    async def test_none_strategy_when_metadata_absent(self) -> None:
        """When ctx.metadata is None, OrchestrationService receives "NONE" strategy and empty list."""
        executor = _make_executor()
        ctx = InvocationContextData.model_validate({})

        invocation = MagicMock()
        invocation.id = uuid4()

        captured: dict[str, object] = {}

        def capture_service(**kwargs: object) -> MagicMock:
            captured.update(kwargs)
            return MagicMock(spec=OrchestrationService)

        mock_llm = MagicMock()
        mock_llm.openai_api_base = "https://openrouter.ai/api/v1"
        mock_llm.model_name = "test-model"

        with (
            patch(
                "nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm",
                return_value=mock_llm,
            ),
            patch("nexus.agent_orchestrator.executor.invocation_executor.ContextManagerPlanner"),
            patch(
                "nexus.agent_orchestrator.executor.invocation_executor.OrchestrationService",
                side_effect=capture_service,
            ),
        ):
            await executor._init_orchestration(invocation, ctx)

        assert captured.get("tool_selection_strategy") == "NONE"
        assert captured.get("tool_selections") == []
