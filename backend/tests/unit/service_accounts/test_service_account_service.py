"""Unit tests for ServiceAccountService."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from nexus.service_accounts.exceptions import ServiceAccountNameConflictError, ServiceAccountNotFoundError
from nexus.service_accounts.models.service_account import ServiceAccount, ServiceAccountStatus
from nexus.service_accounts.schemas import ServiceAccountRead
from nexus.service_accounts.services.service_account_service import ServiceAccountService


@pytest.fixture
def mock_session() -> AsyncMock:
    """Create a mock async database session."""
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.refresh = AsyncMock()
    return session


@pytest.fixture
def mock_user() -> MagicMock:
    """Create a mock user."""
    user = MagicMock()
    user.id = uuid4()
    user.username = "testuser"
    return user


@pytest.fixture
def service(mock_session: AsyncMock, mock_user: MagicMock) -> ServiceAccountService:
    """Create a ServiceAccountService with mocked dependencies."""
    return ServiceAccountService(mock_session, mock_user)


class TestCreateServiceAccount:
    """Tests for service account creation."""

    @pytest.mark.asyncio
    async def test_create_returns_service_account(self, service: ServiceAccountService) -> None:
        sa = await service.create_service_account(
            name="CI Pipeline",
            project_id=uuid4(),
            description="For CI/CD",
        )
        assert sa.name == "CI Pipeline"
        assert sa.description == "For CI/CD"
        assert sa.status == ServiceAccountStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_create_sets_created_by(self, service: ServiceAccountService, mock_user: MagicMock) -> None:
        sa = await service.create_service_account(
            name="test",
            project_id=uuid4(),
        )
        assert sa.created_by == mock_user.id

    @pytest.mark.asyncio
    async def test_create_commits_to_database(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        await service.create_service_account(name="test", project_id=uuid4())
        mock_session.add.assert_called_once()
        mock_session.flush.assert_called_once()
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_raises_on_name_conflict(
        self, service: ServiceAccountService, mock_session: AsyncMock
    ) -> None:
        error = IntegrityError("", {}, Exception("service_accounts_name"))
        mock_session.flush.side_effect = error
        with pytest.raises(ServiceAccountNameConflictError, match="already exists"):
            await service.create_service_account(name="duplicate", project_id=uuid4())

    @pytest.mark.asyncio
    async def test_create_description_defaults_none(self, service: ServiceAccountService) -> None:
        sa = await service.create_service_account(name="test", project_id=uuid4())
        assert sa.description is None


class TestGetServiceAccount:
    """Tests for fetching a service account by ID."""

    @pytest.mark.asyncio
    async def test_get_returns_service_account(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        sa_id = uuid4()
        mock_sa = MagicMock(spec=ServiceAccount)
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_sa
        mock_session.exec.return_value = mock_result

        result = await service.get_service_account(sa_id)
        assert result is mock_sa

    @pytest.mark.asyncio
    async def test_get_raises_not_found(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_session.exec.return_value = mock_result

        with pytest.raises(ServiceAccountNotFoundError, match="not found"):
            await service.get_service_account(uuid4())


class TestUpdateServiceAccount:
    """Tests for updating a service account."""

    @pytest.mark.asyncio
    async def test_update_name(
        self, service: ServiceAccountService, mock_session: AsyncMock, mock_user: MagicMock
    ) -> None:
        mock_sa = MagicMock(spec=ServiceAccount)
        mock_sa.update_by_user = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_sa
        mock_session.exec.return_value = mock_result

        await service.update_service_account(uuid4(), name="Updated Name")
        assert mock_sa.name == "Updated Name"
        mock_sa.update_by_user.assert_called_once_with(mock_user.id)

    @pytest.mark.asyncio
    async def test_update_description(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_sa = MagicMock(spec=ServiceAccount)
        mock_sa.update_by_user = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_sa
        mock_session.exec.return_value = mock_result

        await service.update_service_account(uuid4(), description="New desc")
        assert mock_sa.description == "New desc"

    @pytest.mark.asyncio
    async def test_update_no_changes_when_none(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_sa = MagicMock(spec=ServiceAccount)
        mock_sa.name = "Original"
        mock_sa.description = "Original desc"
        mock_sa.update_by_user = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_sa
        mock_session.exec.return_value = mock_result

        await service.update_service_account(uuid4())
        assert mock_sa.name == "Original"
        assert mock_sa.description == "Original desc"

    @pytest.mark.asyncio
    async def test_update_raises_not_found(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_session.exec.return_value = mock_result

        with pytest.raises(ServiceAccountNotFoundError):
            await service.update_service_account(uuid4(), name="test")


class TestDeleteServiceAccount:
    """Tests for soft-deleting a service account."""

    @pytest.mark.asyncio
    async def test_delete_calls_soft_delete(
        self, service: ServiceAccountService, mock_session: AsyncMock, mock_user: MagicMock
    ) -> None:
        mock_sa = MagicMock(spec=ServiceAccount)
        mock_sa.soft_delete = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_sa
        mock_session.exec.return_value = mock_result

        await service.delete_service_account(uuid4())
        mock_sa.soft_delete.assert_called_once_with(mock_user.id)

    @pytest.mark.asyncio
    async def test_delete_commits(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_sa = MagicMock(spec=ServiceAccount)
        mock_sa.soft_delete = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_sa
        mock_session.exec.return_value = mock_result

        await service.delete_service_account(uuid4())
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_raises_not_found(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_session.exec.return_value = mock_result

        with pytest.raises(ServiceAccountNotFoundError):
            await service.delete_service_account(uuid4())


class TestDisableServiceAccount:
    """Tests for disabling a service account."""

    @pytest.mark.asyncio
    async def test_disable_sets_status(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_sa = MagicMock(spec=ServiceAccount)
        mock_sa.update_by_user = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_sa
        mock_session.exec.return_value = mock_result

        await service.disable_service_account(uuid4())
        assert mock_sa.status == ServiceAccountStatus.DISABLED

    @pytest.mark.asyncio
    async def test_disable_raises_not_found(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_session.exec.return_value = mock_result

        with pytest.raises(ServiceAccountNotFoundError):
            await service.disable_service_account(uuid4())


class TestEnableServiceAccount:
    """Tests for enabling a service account."""

    @pytest.mark.asyncio
    async def test_enable_sets_status(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_sa = MagicMock(spec=ServiceAccount)
        mock_sa.update_by_user = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_sa
        mock_session.exec.return_value = mock_result

        await service.enable_service_account(uuid4())
        assert mock_sa.status == ServiceAccountStatus.ACTIVE

    @pytest.mark.asyncio
    async def test_enable_raises_not_found(self, service: ServiceAccountService, mock_session: AsyncMock) -> None:
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_session.exec.return_value = mock_result

        with pytest.raises(ServiceAccountNotFoundError):
            await service.enable_service_account(uuid4())


class TestToReadConversion:
    """Tests for model-to-schema conversion."""

    @pytest.mark.asyncio
    async def test_to_read_returns_read_schema(self, service: ServiceAccountService) -> None:
        sa = ServiceAccount(
            name="test",
            project_id=uuid4(),
            created_by=uuid4(),
        )
        read = await service.to_read(sa)
        assert isinstance(read, ServiceAccountRead)
        assert read.name == "test"


class TestServiceAccountServiceInheritance:
    """Tests that ServiceAccountService extends BaseService."""

    def test_extends_base_service(self) -> None:
        from nexus.core.services import BaseService

        assert issubclass(ServiceAccountService, BaseService)
