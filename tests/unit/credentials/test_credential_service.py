"""Tests for CredentialService — CRUD operations via SecretService."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

if TYPE_CHECKING:
    from collections.abc import Generator
from uuid import uuid4

import pytest

from nexus.core.lib.encryption import ENCRYPTED_SENTINEL
from nexus.credentials.exceptions import (
    CredentialNameConflictError,
    CredentialNotFoundError,
    CredentialValidationError,
)
from nexus.credentials.models.credential import Credential, CredentialCreate, CredentialPatch
from nexus.credentials.models.credential_type import CredentialType
from nexus.credentials.services.credential_service import (
    CredentialService,
    _get_secret_field_ids,
    _mask_all_secrets,
    _validate_inputs,
)

BEARER_TYPE_INPUTS = {
    "fields": [
        {"id": "token", "label": "Token", "type": "string", "secret": True},
    ],
    "required": ["token"],
}

BASIC_AUTH_TYPE_INPUTS = {
    "fields": [
        {"id": "username", "label": "Username", "type": "string", "secret": False},
        {"id": "password", "label": "Password", "type": "string", "secret": True},
    ],
    "required": ["username", "password"],
}


@pytest.fixture
def mock_secret_service() -> MagicMock:
    """Create a mock SecretService."""
    service = MagicMock()
    service.create_secret = AsyncMock(return_value=uuid4())
    service.retrieve_secret = AsyncMock(return_value={})
    service.update_secret = AsyncMock()
    service.delete_secret = AsyncMock()
    return service


@pytest.fixture(autouse=True)
def _mock_workflow_counts() -> Generator[None, None, None]:
    """Mock get_workflow_counts to avoid session.exec conflicts in unit tests."""
    with patch.object(CredentialService, "get_workflow_counts", new_callable=AsyncMock, return_value={}):
        yield


@pytest.fixture
def mock_session() -> MagicMock:
    """Create a mock AsyncSession."""
    session = MagicMock()
    session.add = MagicMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.flush = AsyncMock()
    session.get = AsyncMock()
    session.exec = AsyncMock()
    return session


@pytest.fixture
def mock_user() -> MagicMock:
    """Create a mock User."""
    user = MagicMock()
    user.id = uuid4()
    return user


@pytest.fixture
def bearer_type() -> CredentialType:
    """Create a bearer token credential type."""
    return CredentialType(
        id=uuid4(),
        name="HTTP Bearer Token",
        inputs=BEARER_TYPE_INPUTS,
        injectors={"extra_vars": {"bearer_token": "{{token}}"}},
        managed=True,
    )


@pytest.fixture
def basic_auth_type() -> CredentialType:
    """Create a basic auth credential type."""
    return CredentialType(
        id=uuid4(),
        name="HTTP Basic Auth",
        inputs=BASIC_AUTH_TYPE_INPUTS,
        injectors={"extra_vars": {"basic_username": "{{username}}", "basic_password": "{{password}}"}},
        managed=True,
    )


class TestGetSecretFieldIds:
    """Tests for _get_secret_field_ids helper."""

    def test_extracts_secret_fields(self) -> None:
        result = _get_secret_field_ids(BASIC_AUTH_TYPE_INPUTS)
        assert result == {"password"}

    def test_all_secret(self) -> None:
        result = _get_secret_field_ids(BEARER_TYPE_INPUTS)
        assert result == {"token"}

    def test_empty_fields(self) -> None:
        result = _get_secret_field_ids({"fields": []})
        assert result == set()

    def test_no_fields_key(self) -> None:
        result = _get_secret_field_ids({})
        assert result == set()


class TestMaskAllSecrets:
    """Tests for _mask_all_secrets helper (list responses)."""

    def test_masks_all_fields(self) -> None:
        result = _mask_all_secrets(BASIC_AUTH_TYPE_INPUTS)
        assert result == {"username": ENCRYPTED_SENTINEL, "password": ENCRYPTED_SENTINEL}

    def test_single_field(self) -> None:
        result = _mask_all_secrets(BEARER_TYPE_INPUTS)
        assert result == {"token": ENCRYPTED_SENTINEL}

    def test_empty_type(self) -> None:
        result = _mask_all_secrets({})
        assert result == {}


class TestCreateCredential:
    """Tests for CredentialService.create_credential."""

    @pytest.mark.asyncio
    async def test_creates_with_inputs(
        self,
        mock_session: MagicMock,
        mock_user: MagicMock,
        mock_secret_service: MagicMock,
        bearer_type: CredentialType,
    ) -> None:
        mock_session.get.return_value = bearer_type
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_result.first.return_value = None
        mock_session.exec.return_value = mock_result

        service = CredentialService(mock_session, mock_user, mock_secret_service)

        data = CredentialCreate(
            name="My Token",
            credential_type_id=bearer_type.id,
            inputs={"token": "sk-abc-123"},
            project_id=uuid4(),
        )
        result = await service.create_credential(data)

        mock_secret_service.create_secret.assert_awaited_once_with({"token": "sk-abc-123"})
        assert result.name == "My Token"
        assert result.inputs == {"token": ENCRYPTED_SENTINEL}

    @pytest.mark.asyncio
    async def test_creates_without_inputs_when_no_required(
        self,
        mock_session: MagicMock,
        mock_user: MagicMock,
        mock_secret_service: MagicMock,
    ) -> None:
        optional_type = CredentialType(
            id=uuid4(),
            name="Optional Fields Only",
            inputs={"fields": [{"id": "note", "type": "string", "secret": False, "label": "Note"}], "required": []},
            injectors={},
            managed=False,
        )
        mock_session.get.return_value = optional_type
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_result.first.return_value = None
        mock_session.exec.return_value = mock_result

        service = CredentialService(mock_session, mock_user, mock_secret_service)

        data = CredentialCreate(
            name="Empty Cred",
            credential_type_id=optional_type.id,
            project_id=uuid4(),
        )
        result = await service.create_credential(data)

        mock_secret_service.create_secret.assert_not_awaited()
        assert result.name == "Empty Cred"

    @pytest.mark.asyncio
    async def test_name_conflict_raises(
        self,
        mock_session: MagicMock,
        mock_user: MagicMock,
        mock_secret_service: MagicMock,
        bearer_type: CredentialType,
    ) -> None:
        mock_session.get.return_value = bearer_type
        existing_cred = MagicMock()
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_result.first.return_value = existing_cred
        mock_session.exec.return_value = mock_result

        service = CredentialService(mock_session, mock_user, mock_secret_service)

        data = CredentialCreate(
            name="Duplicate",
            credential_type_id=bearer_type.id,
            inputs={"token": "abc"},
            project_id=uuid4(),
        )
        with pytest.raises(CredentialNameConflictError):
            await service.create_credential(data)


class TestGetCredential:
    """Tests for CredentialService.get_credential."""

    @pytest.mark.asyncio
    async def test_returns_masked_response(
        self,
        mock_session: MagicMock,
        mock_user: MagicMock,
        mock_secret_service: MagicMock,
        basic_auth_type: CredentialType,
    ) -> None:
        secret_id = uuid4()
        credential = Credential(
            id=uuid4(),
            name="My Cred",
            credential_type_id=basic_auth_type.id,
            secret_id=secret_id,
            enabled=True,
            project_id=uuid4(),
            created_by=mock_user.id,
        )
        credential.credential_type = basic_auth_type

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = credential
        mock_session.exec.return_value = mock_result
        mock_session.get.return_value = basic_auth_type

        mock_secret_service.retrieve_secret.return_value = {
            "username": "admin",
            "password": "secret123",
        }

        service = CredentialService(mock_session, mock_user, mock_secret_service)
        result = await service.get_credential(credential.id)

        mock_secret_service.retrieve_secret.assert_awaited_once_with(secret_id)
        assert result.inputs["username"] == "admin"
        assert result.inputs["password"] == ENCRYPTED_SENTINEL

    @pytest.mark.asyncio
    async def test_not_found_raises(
        self,
        mock_session: MagicMock,
        mock_user: MagicMock,
        mock_secret_service: MagicMock,
    ) -> None:
        mock_result = MagicMock()
        mock_result.one_or_none.return_value = None
        mock_session.exec.return_value = mock_result

        service = CredentialService(mock_session, mock_user, mock_secret_service)
        with pytest.raises(CredentialNotFoundError):
            await service.get_credential(uuid4())


class TestUpdateCredential:
    """Tests for CredentialService.update_credential."""

    @pytest.mark.asyncio
    async def test_encrypted_sentinel_preserves_existing(
        self,
        mock_session: MagicMock,
        mock_user: MagicMock,
        mock_secret_service: MagicMock,
        basic_auth_type: CredentialType,
    ) -> None:
        secret_id = uuid4()
        credential = Credential(
            id=uuid4(),
            name="My Cred",
            credential_type_id=basic_auth_type.id,
            secret_id=secret_id,
            enabled=True,
            project_id=uuid4(),
            created_by=mock_user.id,
        )

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = credential
        mock_session.exec.return_value = mock_result
        mock_session.get.return_value = basic_auth_type

        mock_secret_service.retrieve_secret.return_value = {
            "username": "admin",
            "password": "old-password",
        }

        service = CredentialService(mock_session, mock_user, mock_secret_service)
        patch = CredentialPatch(inputs={"username": "new-admin", "password": ENCRYPTED_SENTINEL})
        await service.update_credential(credential.id, patch)

        # Verify update was called with merged inputs (password preserved)
        call_args = mock_secret_service.update_secret.call_args
        updated_data = call_args[0][1]
        assert updated_data["username"] == "new-admin"
        assert updated_data["password"] == "old-password"  # noqa: S105


class TestDeleteCredential:
    """Tests for CredentialService.delete_credential."""

    @pytest.mark.asyncio
    async def test_soft_deletes_and_removes_secret(
        self,
        mock_session: MagicMock,
        mock_user: MagicMock,
        mock_secret_service: MagicMock,
    ) -> None:
        secret_id = uuid4()
        credential = Credential(
            id=uuid4(),
            name="To Delete",
            credential_type_id=uuid4(),
            secret_id=secret_id,
            enabled=True,
            project_id=uuid4(),
            created_by=mock_user.id,
        )

        mock_result = MagicMock()
        mock_result.one_or_none.return_value = credential
        mock_session.exec.return_value = mock_result

        service = CredentialService(mock_session, mock_user, mock_secret_service)
        await service.delete_credential(credential.id)

        assert credential.deleted_at is not None
        assert credential.deleted_by == mock_user.id
        assert credential.secret_id is None
        mock_secret_service.delete_secret.assert_awaited_once_with(secret_id)


class TestValidateInputs:
    """Tests for _validate_inputs helper (T027)."""

    def test_valid_inputs_pass(self) -> None:
        _validate_inputs({"token": "abc"}, BEARER_TYPE_INPUTS)

    def test_unknown_field_rejected(self) -> None:
        with pytest.raises(CredentialValidationError, match="Unknown field"):
            _validate_inputs({"token": "abc", "bogus": "val"}, BEARER_TYPE_INPUTS)

    def test_missing_required_field_rejected(self) -> None:
        with pytest.raises(CredentialValidationError, match="Missing required"):
            _validate_inputs({}, BEARER_TYPE_INPUTS)

    def test_missing_one_of_multiple_required(self) -> None:
        with pytest.raises(CredentialValidationError, match="password"):
            _validate_inputs({"username": "admin"}, BASIC_AUTH_TYPE_INPUTS)

    def test_encrypted_sentinel_rejected_on_create(self) -> None:
        with pytest.raises(CredentialValidationError, match="reserved"):
            _validate_inputs({"token": ENCRYPTED_SENTINEL}, BEARER_TYPE_INPUTS)

    def test_encrypted_sentinel_allowed_on_patch(self) -> None:
        _validate_inputs(
            {"username": "admin", "password": ENCRYPTED_SENTINEL},
            BASIC_AUTH_TYPE_INPUTS,
            allow_sentinel=True,
        )

    def test_invalid_choice_rejected(self) -> None:
        llm_inputs = {
            "fields": [
                {
                    "id": "provider",
                    "type": "string",
                    "secret": False,
                    "label": "Provider",
                    "choices": ["openai", "anthropic"],
                },
                {"id": "api_key", "type": "string", "secret": True, "label": "Key"},
            ],
            "required": ["api_key"],
        }
        with pytest.raises(CredentialValidationError, match="Invalid value"):
            _validate_inputs({"provider": "invalid_provider", "api_key": "key"}, llm_inputs)

    def test_valid_choice_accepted(self) -> None:
        llm_inputs = {
            "fields": [
                {
                    "id": "provider",
                    "type": "string",
                    "secret": False,
                    "label": "Provider",
                    "choices": ["openai", "anthropic"],
                },
                {"id": "api_key", "type": "string", "secret": True, "label": "Key"},
            ],
            "required": ["api_key"],
        }
        _validate_inputs({"provider": "openai", "api_key": "key"}, llm_inputs)

    def test_payload_too_large_rejected(self) -> None:
        large_value = "x" * 70000
        with pytest.raises(CredentialValidationError, match="exceeds maximum size"):
            _validate_inputs({"token": large_value}, BEARER_TYPE_INPUTS)

    def test_empty_inputs_with_no_required_passes(self) -> None:
        no_required = {
            "fields": [{"id": "optional", "type": "string", "secret": False, "label": "Opt"}],
            "required": [],
        }
        _validate_inputs({}, no_required)

    def test_none_value_does_not_satisfy_required(self) -> None:
        with pytest.raises(CredentialValidationError, match="Missing required"):
            _validate_inputs({"token": None}, BEARER_TYPE_INPUTS)

    def test_required_skipped_in_patch_mode(self) -> None:
        # PATCH mode: missing required fields are OK (they're preserved from existing)
        _validate_inputs({}, BEARER_TYPE_INPUTS, allow_sentinel=True)

    def test_unknown_fields_still_rejected_in_patch_mode(self) -> None:
        with pytest.raises(CredentialValidationError, match="Unknown field"):
            _validate_inputs({"bogus": "val"}, BEARER_TYPE_INPUTS, allow_sentinel=True)
