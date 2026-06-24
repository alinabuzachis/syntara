"""Unit tests for ServiceAccountCredentialService."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from nexus.service_accounts.credential_schemas import (
    SACredentialCreateResponse,
    SACredentialRead,
    SACredentialRotateResponse,
)
from nexus.service_accounts.exceptions import (
    ServiceAccountCredentialLimitError,
    ServiceAccountCredentialNotFoundError,
)
from nexus.service_accounts.models.service_account_credential import (
    ServiceAccountCredential,
    ServiceAccountCredentialStatus,
    ServiceAccountCredentialType,
)
from nexus.service_accounts.services.credential_service import (
    MAX_CREDENTIALS_PER_SA,
    ServiceAccountCredentialService,
)


@pytest.fixture
def mock_session() -> AsyncMock:
    """Create a mock async database session."""
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.refresh = AsyncMock()
    session.delete = AsyncMock()
    return session


@pytest.fixture
def mock_user() -> MagicMock:
    """Create a mock user."""
    user = MagicMock()
    user.id = uuid4()
    user.username = "testuser"
    return user


@pytest.fixture
def service(mock_session: AsyncMock, mock_user: MagicMock) -> ServiceAccountCredentialService:
    """Create a ServiceAccountCredentialService with mocked dependencies."""
    return ServiceAccountCredentialService(mock_session, mock_user)


def _mock_count_result(count: int) -> MagicMock:
    """Create a mock exec result returning a count."""
    result = MagicMock()
    result.one.return_value = count
    return result


class TestGenerateCredential:
    """Tests for credential generation."""

    def test_client_credentials_prefix(self) -> None:
        identifier, secret, hashed = ServiceAccountCredentialService._generate_credential(
            ServiceAccountCredentialType.CLIENT_CREDENTIALS
        )
        assert identifier.startswith("nx_sa_")
        assert len(identifier) == 22
        assert len(secret) == 64
        assert hashed.startswith("$argon2id$")


class TestCreateCredential:
    """Tests for credential creation."""

    @pytest.mark.asyncio
    async def test_create_returns_credential_and_secret(
        self, service: ServiceAccountCredentialService, mock_session: AsyncMock
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(0)
        sa_id = uuid4()
        cred, secret = await service.create_credential(
            service_account_id=sa_id,
            credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
        )
        assert cred.service_account_id == sa_id
        assert cred.credential_type == ServiceAccountCredentialType.CLIENT_CREDENTIALS
        assert cred.status == ServiceAccountCredentialStatus.ACTIVE
        assert len(secret) > 0

    @pytest.mark.asyncio
    async def test_create_commits_to_database(
        self, service: ServiceAccountCredentialService, mock_session: AsyncMock
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(0)
        await service.create_credential(
            service_account_id=uuid4(),
            credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
        )
        mock_session.add.assert_called_once()
        mock_session.flush.assert_called_once()
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_raises_on_limit(
        self, service: ServiceAccountCredentialService, mock_session: AsyncMock
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(MAX_CREDENTIALS_PER_SA)
        with pytest.raises(ServiceAccountCredentialLimitError, match="maximum"):
            await service.create_credential(
                service_account_id=uuid4(),
                credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
            )


class TestGetCredential:
    """Tests for fetching a credential by ID."""

    @pytest.mark.asyncio
    async def test_get_returns_credential(
        self, service: ServiceAccountCredentialService, mock_session: AsyncMock
    ) -> None:
        mock_cred = MagicMock(spec=ServiceAccountCredential)
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_cred
        mock_session.exec.return_value = mock_result

        result = await service.get_credential(uuid4())
        assert result is mock_cred

    @pytest.mark.asyncio
    async def test_get_raises_not_found(
        self, service: ServiceAccountCredentialService, mock_session: AsyncMock
    ) -> None:
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_session.exec.return_value = mock_result

        with pytest.raises(ServiceAccountCredentialNotFoundError, match="not found"):
            await service.get_credential(uuid4())


class TestDisableCredential:
    """Tests for disabling a credential."""

    @pytest.mark.asyncio
    async def test_disable_sets_status(self, service: ServiceAccountCredentialService, mock_session: AsyncMock) -> None:
        mock_cred = MagicMock(spec=ServiceAccountCredential)
        mock_cred.update_by_user = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_cred
        mock_session.exec.return_value = mock_result

        await service.disable_credential(uuid4())
        assert mock_cred.status == ServiceAccountCredentialStatus.DISABLED


class TestEnableCredential:
    """Tests for enabling a credential."""

    @pytest.mark.asyncio
    async def test_enable_sets_status(self, service: ServiceAccountCredentialService, mock_session: AsyncMock) -> None:
        mock_cred = MagicMock(spec=ServiceAccountCredential)
        mock_cred.update_by_user = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_cred
        mock_session.exec.return_value = mock_result

        await service.enable_credential(uuid4())
        assert mock_cred.status == ServiceAccountCredentialStatus.ACTIVE


class TestDeleteCredential:
    """Tests for hard-deleting a credential."""

    @pytest.mark.asyncio
    async def test_delete_removes_from_session(
        self, service: ServiceAccountCredentialService, mock_session: AsyncMock
    ) -> None:
        mock_cred = MagicMock(spec=ServiceAccountCredential)
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_cred
        mock_session.exec.return_value = mock_result

        await service.delete_credential(uuid4())
        mock_session.delete.assert_called_once_with(mock_cred)
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_raises_not_found(
        self, service: ServiceAccountCredentialService, mock_session: AsyncMock
    ) -> None:
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_session.exec.return_value = mock_result

        with pytest.raises(ServiceAccountCredentialNotFoundError):
            await service.delete_credential(uuid4())


class TestConversionMethods:
    """Tests for to_read, to_create_response, to_rotate_response."""

    def test_to_read(self, service: ServiceAccountCredentialService) -> None:
        cred = ServiceAccountCredential(
            service_account_id=uuid4(),
            credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
            identifier="nx_sa_abcdef1234567890",
            hashed_secret="$argon2id$placeholder",  # noqa: S106
            created_by=uuid4(),
        )
        read = service.to_read(cred)
        assert isinstance(read, SACredentialRead)
        assert read.identifier == "nx_sa_abcdef1234567890"

    def test_to_create_response_client_credentials(self, service: ServiceAccountCredentialService) -> None:
        cred = ServiceAccountCredential(
            service_account_id=uuid4(),
            credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
            identifier="nx_sa_abcdef1234567890",
            hashed_secret="$argon2id$placeholder",  # noqa: S106
            created_by=uuid4(),
        )
        resp = service.to_create_response(cred, "the-secret")
        assert isinstance(resp, SACredentialCreateResponse)
        assert resp.client_secret == "the-secret"  # noqa: S105

    def test_to_rotate_response(self, service: ServiceAccountCredentialService) -> None:
        cred = ServiceAccountCredential(
            service_account_id=uuid4(),
            credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
            identifier="nx_sa_abcdef1234567890",
            hashed_secret="$argon2id$placeholder",  # noqa: S106
            created_by=uuid4(),
        )
        resp = service.to_rotate_response(cred, "new-secret")
        assert isinstance(resp, SACredentialRotateResponse)
        assert resp.client_secret == "new-secret"  # noqa: S105


class TestServiceInheritance:
    """Tests that ServiceAccountCredentialService extends BaseService."""

    def test_extends_base_service(self) -> None:
        from nexus.core.services import BaseService

        assert issubclass(ServiceAccountCredentialService, BaseService)
