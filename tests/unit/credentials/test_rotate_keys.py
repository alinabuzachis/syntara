"""Tests for key rotation CLI tool (T079)."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.core.lib.encryption import SecretEncryptor, key_from_string
from nexus.credentials.cli.rotate_keys import (
    EXIT_FATAL,
    EXIT_PARTIAL_FAILURE,
    EXIT_SUCCESS,
    RotationProgress,
    _create_encryptors,
    _rotate_single_row,
    rotate_keys,
)

# Valid 64-char hex keys for testing
OLD_KEY_HEX = "aa" * 32
NEW_KEY_HEX = "bb" * 32
OLD_KEY = key_from_string(OLD_KEY_HEX)
NEW_KEY = key_from_string(NEW_KEY_HEX)


def _make_encrypted_row(old_encryptor: SecretEncryptor) -> MagicMock:
    """Create a mock EncryptedSecret row with real encrypted data."""
    secret_id = uuid4()
    row = MagicMock()
    row.id = uuid4()
    row.secret_id = secret_id
    row.encrypted_data = old_encryptor.encrypt_fields(
        {"token": "secret-value", "host": "example.com"},
        str(secret_id),
    )
    return row


class TestCreateEncryptors:
    """Tests for _create_encryptors validation."""

    def test_valid_keys_return_encryptor_pair(self) -> None:
        result = _create_encryptors(OLD_KEY_HEX, NEW_KEY_HEX)
        assert result is not None
        old_enc, new_enc = result
        assert isinstance(old_enc, SecretEncryptor)
        assert isinstance(new_enc, SecretEncryptor)

    def test_invalid_old_key_returns_none(self) -> None:
        result = _create_encryptors("not-a-hex-key", NEW_KEY_HEX)
        assert result is None

    def test_invalid_new_key_returns_none(self) -> None:
        result = _create_encryptors(OLD_KEY_HEX, "short")
        assert result is None

    def test_identical_keys_returns_none(self) -> None:
        result = _create_encryptors(OLD_KEY_HEX, OLD_KEY_HEX)
        assert result is None


class TestRotateSingleRow:
    """Tests for _rotate_single_row."""

    def test_successful_rotation(self) -> None:
        old_enc = SecretEncryptor(OLD_KEY)
        new_enc = SecretEncryptor(NEW_KEY)
        row = _make_encrypted_row(old_enc)

        result = _rotate_single_row(row, old_enc, new_enc, dry_run=False)

        assert result is True
        # Verify re-encrypted data can be decrypted with new key
        decrypted = new_enc.decrypt_fields(row.encrypted_data, str(row.secret_id))
        assert decrypted["token"] == "secret-value"  # noqa: S105
        assert decrypted["host"] == "example.com"

    def test_dry_run_does_not_modify_row(self) -> None:
        old_enc = SecretEncryptor(OLD_KEY)
        new_enc = SecretEncryptor(NEW_KEY)
        row = _make_encrypted_row(old_enc)
        original_data = dict(row.encrypted_data)

        result = _rotate_single_row(row, old_enc, new_enc, dry_run=True)

        assert result is True
        # encrypted_data should NOT have been reassigned (dry run)
        # MagicMock tracks attribute sets — check it wasn't set
        assert row.encrypted_data == original_data

    def test_wrong_old_key_returns_false(self) -> None:
        wrong_key = key_from_string("cc" * 32)
        wrong_enc = SecretEncryptor(wrong_key)
        new_enc = SecretEncryptor(NEW_KEY)

        # Encrypt with the actual old key
        old_enc = SecretEncryptor(OLD_KEY)
        row = _make_encrypted_row(old_enc)

        # Try to decrypt with wrong key
        result = _rotate_single_row(row, wrong_enc, new_enc, dry_run=False)
        assert result is False


def _mock_paginated_session(rows: list[MagicMock]) -> tuple[MagicMock, AsyncMock]:
    """Create a mock session that returns rows on first exec, empty on second (pagination)."""
    mock_session = AsyncMock()
    first_result = MagicMock()
    first_result.all.return_value = rows
    empty_result = MagicMock()
    empty_result.all.return_value = []
    mock_session.exec = AsyncMock(side_effect=[first_result, empty_result])
    mock_session.commit = AsyncMock()
    return mock_session, mock_session.commit


class TestRotateKeys:
    """Tests for the main rotate_keys async function."""

    @pytest.mark.asyncio
    @patch("nexus.credentials.cli.rotate_keys._session_factory")
    async def test_happy_path(self, mock_session_local: MagicMock) -> None:
        """All rows rotated successfully."""
        old_enc = SecretEncryptor(OLD_KEY)
        rows = [_make_encrypted_row(old_enc) for _ in range(3)]

        mock_session, mock_commit = _mock_paginated_session(rows)
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        exit_code = await rotate_keys(OLD_KEY_HEX, NEW_KEY_HEX, batch_size=50)

        assert exit_code == EXIT_SUCCESS
        mock_commit.assert_called()

    @pytest.mark.asyncio
    @patch("nexus.credentials.cli.rotate_keys._session_factory")
    async def test_dry_run_no_commits(self, mock_session_local: MagicMock) -> None:
        """Dry run verifies round-trip without committing."""
        old_enc = SecretEncryptor(OLD_KEY)
        rows = [_make_encrypted_row(old_enc) for _ in range(2)]

        mock_session, mock_commit = _mock_paginated_session(rows)
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        exit_code = await rotate_keys(OLD_KEY_HEX, NEW_KEY_HEX, dry_run=True)

        assert exit_code == EXIT_SUCCESS
        mock_commit.assert_not_called()

    @pytest.mark.asyncio
    @patch("nexus.credentials.cli.rotate_keys._session_factory")
    async def test_empty_db(self, mock_session_local: MagicMock) -> None:
        """No rows to process returns success."""
        mock_session, _ = _mock_paginated_session([])
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        exit_code = await rotate_keys(OLD_KEY_HEX, NEW_KEY_HEX)
        assert exit_code == EXIT_SUCCESS

    @pytest.mark.asyncio
    async def test_invalid_old_key_returns_fatal(self) -> None:
        exit_code = await rotate_keys("invalid", NEW_KEY_HEX)
        assert exit_code == EXIT_FATAL

    @pytest.mark.asyncio
    async def test_identical_keys_returns_fatal(self) -> None:
        exit_code = await rotate_keys(OLD_KEY_HEX, OLD_KEY_HEX)
        assert exit_code == EXIT_FATAL

    @pytest.mark.asyncio
    @patch("nexus.credentials.cli.rotate_keys._session_factory")
    async def test_partial_failure(self, mock_session_local: MagicMock) -> None:
        """Some rows fail, others succeed — returns partial failure."""
        old_enc = SecretEncryptor(OLD_KEY)
        good_row = _make_encrypted_row(old_enc)

        # Bad row has data encrypted with a different key
        bad_row = MagicMock()
        bad_row.id = uuid4()
        bad_row.secret_id = uuid4()
        bad_row.encrypted_data = {"token": "not-valid-ciphertext"}

        mock_session, _ = _mock_paginated_session([good_row, bad_row])
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        exit_code = await rotate_keys(OLD_KEY_HEX, NEW_KEY_HEX, batch_size=10)
        assert exit_code == EXIT_PARTIAL_FAILURE

    @pytest.mark.asyncio
    @patch("nexus.credentials.cli.rotate_keys._session_factory")
    async def test_batch_commits(self, mock_session_local: MagicMock) -> None:
        """Pagination: each batch fetched and committed separately."""
        old_enc = SecretEncryptor(OLD_KEY)
        batch1 = [_make_encrypted_row(old_enc) for _ in range(2)]
        batch2 = [_make_encrypted_row(old_enc) for _ in range(2)]

        mock_session = AsyncMock()
        r1 = MagicMock()
        r1.all.return_value = batch1
        r2 = MagicMock()
        r2.all.return_value = batch2
        r_empty = MagicMock()
        r_empty.all.return_value = []
        mock_session.exec = AsyncMock(side_effect=[r1, r2, r_empty])
        mock_session.commit = AsyncMock()
        mock_session_local.return_value.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session_local.return_value.__aexit__ = AsyncMock(return_value=False)

        exit_code = await rotate_keys(OLD_KEY_HEX, NEW_KEY_HEX, batch_size=2)

        assert exit_code == EXIT_SUCCESS
        # 2 batches of 2 rows each → 2 commits
        assert mock_session.commit.call_count == 2


class TestRotationProgress:
    """Tests for RotationProgress dataclass."""

    def test_defaults(self) -> None:
        progress = RotationProgress()
        assert progress.total == 0
        assert progress.processed == 0
        assert progress.failed == 0
        assert progress.last_processed_id is None
