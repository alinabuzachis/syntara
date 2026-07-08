"""Unit tests for ServiceAccountCredentialService."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager

from nexus.service_accounts.credential_schemas import (
    SACredentialCreateResponse,
    SACredentialRead,
    SACredentialRotateResponse,
)
from nexus.service_accounts.exceptions import (
    CredentialExpirationExceededError,
    CredentialExpirationInPastError,
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


class TestCredentialMaxLifetime:
    """Tests for configurable credential max lifetime (AAP-80610)."""

    @pytest.mark.asyncio
    async def test_create_rejects_expires_at_in_past(
        self,
        service: ServiceAccountCredentialService,
        mock_session: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(0)
        past = datetime.now(tz=UTC) - timedelta(hours=1)
        with (
            override_settings(sa_credential_max_lifetime_days=180),
            pytest.raises(CredentialExpirationInPastError, match="future"),
        ):
            await service.create_credential(
                service_account_id=uuid4(),
                credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
                expires_at=past,
            )

    @pytest.mark.asyncio
    async def test_create_rejects_expires_at_in_past_unlimited(
        self,
        service: ServiceAccountCredentialService,
        mock_session: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(0)
        past = datetime.now(tz=UTC) - timedelta(days=5)
        with (
            override_settings(sa_credential_max_lifetime_days=-1),
            pytest.raises(CredentialExpirationInPastError, match="future"),
        ):
            await service.create_credential(
                service_account_id=uuid4(),
                credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
                expires_at=past,
            )

    @pytest.mark.asyncio
    async def test_create_auto_sets_expires_at_from_setting(
        self,
        service: ServiceAccountCredentialService,
        mock_session: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(0)
        with override_settings(sa_credential_max_lifetime_days=30):
            before = datetime.now(tz=UTC)
            cred, _ = await service.create_credential(
                service_account_id=uuid4(),
                credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
            )
            after = datetime.now(tz=UTC)

        assert cred.expires_at is not None
        assert before + timedelta(days=30) <= cred.expires_at <= after + timedelta(days=30)

    @pytest.mark.asyncio
    async def test_create_respects_caller_expires_at_within_limit(
        self,
        service: ServiceAccountCredentialService,
        mock_session: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(0)
        requested = datetime.now(tz=UTC) + timedelta(days=10)
        with override_settings(sa_credential_max_lifetime_days=30):
            cred, _ = await service.create_credential(
                service_account_id=uuid4(),
                credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
                expires_at=requested,
            )

        assert cred.expires_at == requested

    @pytest.mark.asyncio
    async def test_create_rejects_expires_at_beyond_limit(
        self,
        service: ServiceAccountCredentialService,
        mock_session: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(0)
        requested = datetime.now(tz=UTC) + timedelta(days=60)
        with (
            override_settings(sa_credential_max_lifetime_days=30),
            pytest.raises(CredentialExpirationExceededError, match="30 days"),
        ):
            await service.create_credential(
                service_account_id=uuid4(),
                credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
                expires_at=requested,
            )

    @pytest.mark.asyncio
    async def test_create_unlimited_skips_expiry(
        self,
        service: ServiceAccountCredentialService,
        mock_session: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(0)
        with override_settings(sa_credential_max_lifetime_days=-1):
            cred, _ = await service.create_credential(
                service_account_id=uuid4(),
                credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
            )

        assert cred.expires_at is None

    @pytest.mark.asyncio
    async def test_create_unlimited_allows_caller_expires_at(
        self,
        service: ServiceAccountCredentialService,
        mock_session: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_session.exec.return_value = _mock_count_result(0)
        requested = datetime.now(tz=UTC) + timedelta(days=999)
        with override_settings(sa_credential_max_lifetime_days=-1):
            cred, _ = await service.create_credential(
                service_account_id=uuid4(),
                credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
                expires_at=requested,
            )

        assert cred.expires_at == requested

    @pytest.mark.asyncio
    async def test_rotate_refreshes_expires_at(
        self,
        service: ServiceAccountCredentialService,
        mock_session: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        old_expiry = datetime.now(tz=UTC) + timedelta(days=10)
        mock_cred = MagicMock(spec=ServiceAccountCredential)
        mock_cred.credential_type = ServiceAccountCredentialType.CLIENT_CREDENTIALS
        mock_cred.grace_period_seconds = 3600
        mock_cred.hashed_secret = "$argon2id$old"  # noqa: S105
        mock_cred.expires_at = old_expiry
        mock_cred.update_by_user = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_cred
        mock_session.exec.return_value = mock_result

        with override_settings(sa_credential_max_lifetime_days=90):
            before = datetime.now(tz=UTC)
            await service.rotate_credential(uuid4())
            after = datetime.now(tz=UTC)

        assert mock_cred.expires_at != old_expiry
        assert mock_cred.expires_at is not None
        assert before + timedelta(days=90) <= mock_cred.expires_at <= after + timedelta(days=90)

    @pytest.mark.asyncio
    async def test_rotate_unlimited_clears_expires_at(
        self,
        service: ServiceAccountCredentialService,
        mock_session: AsyncMock,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        mock_cred = MagicMock(spec=ServiceAccountCredential)
        mock_cred.credential_type = ServiceAccountCredentialType.CLIENT_CREDENTIALS
        mock_cred.grace_period_seconds = 3600
        mock_cred.hashed_secret = "$argon2id$old"  # noqa: S105
        mock_cred.update_by_user = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = mock_cred
        mock_session.exec.return_value = mock_result

        with override_settings(sa_credential_max_lifetime_days=-1):
            await service.rotate_credential(uuid4())

        assert mock_cred.expires_at is None


class TestReadSchemaIncludesRotationField:
    """Tests that SACredentialRead exposes old_secret_valid_until (AAP-82027)."""

    def test_old_secret_valid_until_populated_from_model(self) -> None:
        rotation_expiry = datetime.now(tz=UTC) + timedelta(hours=1)
        cred = ServiceAccountCredential(
            service_account_id=uuid4(),
            credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
            identifier="nx_sa_abcdef1234567890",
            hashed_secret="$argon2id$placeholder",  # noqa: S106
            old_secret_valid_until=rotation_expiry,
            created_by=uuid4(),
        )
        read = SACredentialRead.model_validate(cred)
        assert read.old_secret_valid_until == rotation_expiry

    def test_old_secret_valid_until_none_when_not_rotating(self) -> None:
        cred = ServiceAccountCredential(
            service_account_id=uuid4(),
            credential_type=ServiceAccountCredentialType.CLIENT_CREDENTIALS,
            identifier="nx_sa_abcdef1234567890",
            hashed_secret="$argon2id$placeholder",  # noqa: S106
            created_by=uuid4(),
        )
        read = SACredentialRead.model_validate(cred)
        assert read.old_secret_valid_until is None
