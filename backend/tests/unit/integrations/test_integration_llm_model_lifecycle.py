"""Tests for Integration ↔ LLM Model lifecycle.

Covers:
- create_integration(llm_provider) with discovered_models creates LLMModel records
- create_integration(llm_provider) without discovered_models creates no models
- delete_integration() hard-deletes linked LLMModel records
- refresh_resources() resolves credential and syncs LLMModel records
- _sync_llm_models creates, updates, and hard-deletes models
- validate_integration() does NOT sync models
- discovered_models validation (wrong type, duplicates)
"""

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.integrations.adapters.protocol import (
    DiscoveredLLMModel,
    DiscoverResult,
    ValidateResult,
)
from nexus.integrations.models.integration import (
    Integration,
    IntegrationCreate,
    IntegrationRefreshStatus,
    IntegrationType,
)
from nexus.integrations.models.llm_model import LLMModel
from nexus.integrations.services.integration_service import IntegrationService
from tests.unit.integrations.conftest import make_llm_create


def _make_discovered_model(model_id: str, name: str, description: str | None = None) -> DiscoveredLLMModel:
    return DiscoveredLLMModel(id=model_id, name=name, description=description)


@pytest_asyncio.fixture
async def llm_integration(
    test_db_session: AsyncSession,
    integration_service: IntegrationService,
) -> dict[str, Any]:
    """Create an llm_provider integration and return its id."""
    result = await integration_service.create_integration(make_llm_create("LLM Target"))
    await test_db_session.flush()
    return {"integration_id": result.id}


# ---------------------------------------------------------------------------
# Create integration with models
# ---------------------------------------------------------------------------


class TestCreateIntegrationWithModels:
    """create_integration(llm_provider) with discovered_models."""

    @pytest.mark.asyncio
    async def test_create_without_models_creates_no_records(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Creating an LLM integration without discovered_models creates no LLMModel records."""
        result = await integration_service.create_integration(make_llm_create())
        await test_db_session.flush()

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == result.id))).all()
        assert len(models) == 0

    @pytest.mark.asyncio
    async def test_create_with_discovered_models(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Creating with discovered_models creates LLMModel records with correct enabled states."""
        data = make_llm_create(
            name="LLM With Models",
            discovered_models=[
                {"model_id": "gpt-4o", "name": "GPT-4o", "enabled": True},
                {"model_id": "gpt-4o-mini", "name": "GPT-4o Mini", "enabled": False},
            ],
        )
        result = await integration_service.create_integration(data)
        await test_db_session.flush()

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == result.id))).all()
        assert len(models) == 2

        by_id = {m.model_id: m for m in models}
        assert by_id["gpt-4o"].enabled is True
        assert by_id["gpt-4o"].name == "GPT-4o"
        assert by_id["gpt-4o-mini"].enabled is False

    @pytest.mark.asyncio
    async def test_create_with_default_model(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Creating with is_default sets exactly one model as default."""
        data = make_llm_create(
            name="LLM Default",
            discovered_models=[
                {"model_id": "gpt-4o", "name": "GPT-4o", "is_default": True},
                {"model_id": "gpt-4o-mini", "name": "GPT-4o Mini", "is_default": False},
            ],
        )
        result = await integration_service.create_integration(data)
        await test_db_session.flush()

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == result.id))).all()
        by_id = {m.model_id: m for m in models}
        assert by_id["gpt-4o"].is_default is True
        assert by_id["gpt-4o-mini"].is_default is False

    @pytest.mark.asyncio
    async def test_create_with_models_sets_refresh_status(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Creating with discovered_models sets refresh_status=AVAILABLE."""
        data = make_llm_create(
            name="LLM Status",
            discovered_models=[
                {"model_id": "gpt-4o", "name": "GPT-4o"},
            ],
        )
        result = await integration_service.create_integration(data)
        assert result.refresh_status == IntegrationRefreshStatus.AVAILABLE
        assert result.last_refreshed_at is not None

    @pytest.mark.asyncio
    async def test_create_with_models_populates_model_counts(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """IntegrationRead includes model counts."""
        data = make_llm_create(
            name="LLM Counts",
            discovered_models=[
                {"model_id": "gpt-4o", "name": "GPT-4o", "enabled": True},
                {"model_id": "gpt-3.5", "name": "GPT-3.5", "enabled": False},
            ],
        )
        result = await integration_service.create_integration(data)
        assert result.total_model_count == 2
        assert result.enabled_model_count == 1

    @pytest.mark.asyncio
    async def test_discovered_models_rejected_for_mcp(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """discovered_models is only valid for llm_provider integrations."""
        with pytest.raises(ValueError, match="discovered_models is only supported for llm_provider"):
            IntegrationCreate(
                name="Bad MCP",
                integration_type=IntegrationType.MCP_SERVER,
                configuration={"integration_type": "mcp_server", "base_url": "https://mcp.example.com"},
                discovered_models=[{"model_id": "gpt-4o", "name": "GPT-4o"}],
            )

    @pytest.mark.asyncio
    async def test_discovered_models_rejects_duplicates(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Duplicate model IDs in discovered_models are rejected."""
        with pytest.raises(ValueError, match="duplicate model IDs"):
            make_llm_create(
                name="Dupes",
                discovered_models=[
                    {"model_id": "gpt-4o", "name": "GPT-4o"},
                    {"model_id": "gpt-4o", "name": "GPT-4o Copy"},
                ],
            )

    @pytest.mark.asyncio
    async def test_discovered_models_rejects_multiple_defaults(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Multiple default models in discovered_models are rejected."""
        with pytest.raises(ValueError, match="multiple default models"):
            make_llm_create(
                name="Multi Default",
                discovered_models=[
                    {"model_id": "gpt-4o", "name": "GPT-4o", "is_default": True},
                    {"model_id": "gpt-4o-mini", "name": "GPT-4o Mini", "is_default": True},
                ],
            )


# ---------------------------------------------------------------------------
# Delete integration cascades to models
# ---------------------------------------------------------------------------


class TestDeleteIntegrationCascadesToModels:
    """delete_integration() must hard-delete the linked LLMModel records."""

    @pytest.mark.asyncio
    async def test_deletes_linked_models(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Deleting an LLM integration hard-deletes its models."""
        data = make_llm_create(
            name="To Delete",
            discovered_models=[
                {"model_id": "gpt-4o", "name": "GPT-4o"},
                {"model_id": "gpt-4o-mini", "name": "GPT-4o Mini"},
            ],
        )
        created = await integration_service.create_integration(data)
        await test_db_session.flush()
        integration_id = created.id

        # Verify models exist
        models_before = (
            await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))
        ).all()
        assert len(models_before) == 2

        await integration_service.delete_integration(integration_id)
        await test_db_session.flush()

        # Models are hard-deleted (not soft-deleted)
        models_after = (
            await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))
        ).all()
        assert len(models_after) == 0

    @pytest.mark.asyncio
    async def test_delete_without_models_is_safe(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Deleting an integration with no models does not raise."""
        created = await integration_service.create_integration(make_llm_create("No Models"))
        await test_db_session.flush()
        await integration_service.delete_integration(created.id)


# ---------------------------------------------------------------------------
# Refresh integration resources (models)
# ---------------------------------------------------------------------------


class TestRefreshLLMModels:
    """refresh_resources() for llm_provider calls discover and syncs LLMModel records."""

    @pytest.mark.asyncio
    async def test_refresh_creates_model_records(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        """refresh_resources creates LLMModel records on success."""
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        discover_result = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[
                _make_discovered_model("gpt-4o", "GPT-4o"),
                _make_discovered_model("gpt-4o-mini", "GPT-4o Mini"),
            ],
        )

        with (
            patch(
                "nexus.integrations.services.integration_service.create_health_check_adapter"
            ) as mock_adapter_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=discover_result)
            mock_adapter_factory.return_value = mock_adapter

            result = await service.refresh_resources(integration_id)

        assert result.tools_synced_count == 2
        assert result.tools_updated_count == 0
        assert result.tools_disabled_count == 0

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        assert len(models) == 2
        assert {m.model_id for m in models} == {"gpt-4o", "gpt-4o-mini"}

    @pytest.mark.asyncio
    async def test_refresh_updates_existing_models(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        """refresh_resources updates name/description of existing models, preserves enabled state."""
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        # First refresh: create models
        first_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[_make_discovered_model("gpt-4o", "GPT-4o", "Original")],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=first_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        # Disable the model
        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        models[0].enabled = False
        await test_db_session.flush()

        # Second refresh: update name/description
        second_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[_make_discovered_model("gpt-4o", "GPT-4o Updated", "New description")],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=second_discover)
            mock_factory.return_value = mock_adapter
            result = await service.refresh_resources(integration_id)

        assert result.tools_synced_count == 0
        assert result.tools_updated_count == 1

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        assert len(models) == 1
        assert models[0].name == "GPT-4o Updated"
        assert models[0].description == "New description"
        assert models[0].enabled is False  # preserved

    @pytest.mark.asyncio
    async def test_refresh_preserves_mixed_enabled_states(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        """Refresh preserves per-model enabled state when descriptions change."""
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        # First refresh: create two models (both enabled by default)
        first_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[
                _make_discovered_model("model-a", "Model A", "Original A"),
                _make_discovered_model("model-b", "Model B", "Original B"),
            ],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=first_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        # User disables model-b, keeps model-a enabled
        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        by_id = {m.model_id: m for m in models}
        by_id["model-b"].enabled = False
        await test_db_session.flush()

        # Second refresh: same models, updated descriptions
        second_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[
                _make_discovered_model("model-a", "Model A Updated", "New desc A"),
                _make_discovered_model("model-b", "Model B Updated", "New desc B"),
            ],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=second_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        by_id = {m.model_id: m for m in models}
        assert by_id["model-a"].enabled is True
        assert by_id["model-a"].description == "New desc A"
        assert by_id["model-b"].enabled is False  # user's choice preserved
        assert by_id["model-b"].description == "New desc B"  # description still updated

    @pytest.mark.asyncio
    async def test_refresh_preserves_is_default(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        """refresh_resources preserves the user's is_default selection."""
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        # First refresh: create two models
        first_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[
                _make_discovered_model("model-a", "Model A"),
                _make_discovered_model("model-b", "Model B"),
            ],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=first_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        # User sets model-b as default
        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        by_id = {m.model_id: m for m in models}
        by_id["model-b"].is_default = True
        await test_db_session.flush()

        # Second refresh: same models, no default_model_id
        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=first_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        # is_default should be preserved
        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        by_id = {m.model_id: m for m in models}
        assert by_id["model-b"].is_default is True
        assert by_id["model-a"].is_default is False

    @pytest.mark.asyncio
    async def ***REMOVED***(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        """Models no longer returned by the provider are hard-deleted."""
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        # First refresh: create two models
        first_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[
                _make_discovered_model("model-a", "Model A"),
                _make_discovered_model("model-b", "Model B"),
            ],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=first_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        # Second refresh: only model-a returned
        second_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[_make_discovered_model("model-a", "Model A")],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=second_discover)
            mock_factory.return_value = mock_adapter
            result = await service.refresh_resources(integration_id)

        assert result.tools_disabled_count == 1  # model-b removed

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        assert len(models) == 1
        assert models[0].model_id == "model-a"

    @pytest.mark.asyncio
    async def test_refresh_removes_default_model(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        """When the default model disappears from the provider, it is hard-deleted."""
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        first_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[
                _make_discovered_model("model-a", "A"),
                _make_discovered_model("model-b", "B"),
            ],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=first_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        # Set model-b as default
        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        by_id = {m.model_id: m for m in models}
        by_id["model-b"].is_default = True
        await test_db_session.flush()

        # Refresh without model-b — default model disappears
        second_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[_make_discovered_model("model-a", "A")],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=second_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        assert len(models) == 1
        assert models[0].model_id == "model-a"
        assert models[0].is_default is False  # no default remains

    @pytest.mark.asyncio
    async def test_refresh_sets_status_available(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        """Successful refresh sets refresh_status=AVAILABLE."""
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        discover_result = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[],
        )

        with (
            patch(
                "nexus.integrations.services.integration_service.create_health_check_adapter"
            ) as mock_adapter_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=discover_result)
            mock_adapter_factory.return_value = mock_adapter

            await service.refresh_resources(integration_id)

        integration = (await test_db_session.exec(select(Integration).where(Integration.id == integration_id))).one()
        assert integration.refresh_status == IntegrationRefreshStatus.AVAILABLE
        assert integration.last_refreshed_at is not None

    @pytest.mark.asyncio
    async def test_refresh_failed_discover_sets_error(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        """Failed discover sets refresh_status=ERROR."""
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        discover_result = DiscoverResult(
            success=False,
            checked_at=datetime.now(UTC),
            error="Authentication failed",
        )

        with (
            patch(
                "nexus.integrations.services.integration_service.create_health_check_adapter"
            ) as mock_adapter_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=discover_result)
            mock_adapter_factory.return_value = mock_adapter

            result = await service.refresh_resources(integration_id)

        assert result.tools_synced_count == 0

    @pytest.mark.asyncio
    async def test_create_with_partial_enabled_map(
        self,
        test_db_session: AsyncSession,
        integration_service: IntegrationService,
    ) -> None:
        """Models not in enabled_map default to enabled=True."""
        data = make_llm_create(
            name="LLM Partial Map",
            discovered_models=[
                {"model_id": "gpt-4o", "name": "GPT-4o", "enabled": False},
                {"model_id": "gpt-4o-mini", "name": "GPT-4o Mini"},
            ],
        )
        result = await integration_service.create_integration(data)
        await test_db_session.flush()

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == result.id))).all()
        by_id = {m.model_id: m for m in models}
        assert by_id["gpt-4o"].enabled is False
        assert by_id["gpt-4o-mini"].enabled is True

    @pytest.mark.asyncio
    async def test_refresh_preserves_existing_default(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        """Refresh without default_model_id preserves existing is_default state."""
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        first_discover = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_models=[
                _make_discovered_model("model-a", "A"),
                _make_discovered_model("model-b", "B"),
            ],
        )

        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=first_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        # Set model-a as default manually
        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        by_id = {m.model_id: m for m in models}
        by_id["model-a"].is_default = True
        await test_db_session.flush()

        # Refresh again — no default_model_id, so existing default should be preserved
        with (
            patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.discover = AsyncMock(return_value=first_discover)
            mock_factory.return_value = mock_adapter
            await service.refresh_resources(integration_id)

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        by_id = {m.model_id: m for m in models}
        assert by_id["model-a"].is_default is True
        assert by_id["model-b"].is_default is False


# ---------------------------------------------------------------------------
# Validate does NOT sync models
# ---------------------------------------------------------------------------


class TestValidateDoesNotSyncModels:
    """validate_integration() must NOT create or update LLMModel records."""

    @pytest.mark.asyncio
    async def test_validate_does_not_create_models(
        self,
        test_db_session: AsyncSession,
        test_user: User,
        llm_integration: dict[str, Any],
    ) -> None:
        integration_id = llm_integration["integration_id"]
        service = IntegrationService(test_db_session, test_user)

        success_result = ValidateResult(success=True, checked_at=datetime.now(UTC))

        with (
            patch(
                "nexus.integrations.services.integration_service.create_health_check_adapter"
            ) as mock_adapter_factory,
            patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
        ):
            mock_settings.return_value.get = AsyncMock(return_value=10)
            mock_adapter = AsyncMock()
            mock_adapter.validate = AsyncMock(return_value=success_result)
            mock_adapter_factory.return_value = mock_adapter

            result = await service.validate_integration(integration_id)

        assert result.success is True

        models = (await test_db_session.exec(select(LLMModel).where(LLMModel.integration_id == integration_id))).all()
        assert len(models) == 0
