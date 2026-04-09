# ruff: noqa: S105
"""Unit tests for database field encryption utilities."""

from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet, InvalidToken

from nexus.core.utils.crypto import (
    _ENCRYPTED_PREFIX,
    decrypt_secret,
    encrypt_secret,
)


@pytest.fixture
def fernet_key() -> str:
    """Generate a Fernet key for testing."""
    return Fernet.generate_key().decode()


@pytest.fixture
def mock_settings_with_key(fernet_key: str) -> MagicMock:
    """Create mock settings with an IDP encryption key."""
    settings = MagicMock()
    settings.db_encryption_key = MagicMock()
    settings.db_encryption_key.get_secret_value.return_value = fernet_key
    return settings


@pytest.fixture
def mock_settings_no_key() -> MagicMock:
    """Create mock settings without an IDP encryption key."""
    settings = MagicMock()
    settings.db_encryption_key = None
    return settings


class TestEncryptSecret:
    """Tests for encrypt_secret."""

    def test_encrypts_when_key_configured(self, mock_settings_with_key: MagicMock) -> None:
        """Should return prefixed ciphertext when encryption key is set."""
        with patch("nexus.core.utils.crypto.get_settings", return_value=mock_settings_with_key):
            result = encrypt_secret("my-client-secret")

        assert result.startswith(_ENCRYPTED_PREFIX)
        assert result != f"{_ENCRYPTED_PREFIX}my-client-secret"
        assert "my-client-secret" not in result

    def test_raises_when_no_key(self, mock_settings_no_key: MagicMock) -> None:
        """Should raise RuntimeError when no encryption key is configured."""
        with (
            patch("nexus.core.utils.crypto.get_settings", return_value=mock_settings_no_key),
            pytest.raises(RuntimeError, match="APP_DB_ENCRYPTION_KEY"),
        ):
            encrypt_secret("my-client-secret")


class TestDecryptSecret:
    """Tests for decrypt_secret."""

    def test_decrypts_encrypted_value(self, mock_settings_with_key: MagicMock) -> None:
        """Should decrypt an encrypted value back to plaintext."""
        with patch("nexus.core.utils.crypto.get_settings", return_value=mock_settings_with_key):
            encrypted = encrypt_secret("my-secret-value")
            decrypted = decrypt_secret(encrypted)

        assert decrypted == "my-secret-value"

    def test_returns_plaintext_for_legacy_value(self, mock_settings_with_key: MagicMock) -> None:
        """Should return legacy plaintext values unchanged."""
        with patch("nexus.core.utils.crypto.get_settings", return_value=mock_settings_with_key):
            result = decrypt_secret("legacy-plaintext-secret")

        assert result == "legacy-plaintext-secret"

    def test_returns_plaintext_when_no_key(self, mock_settings_no_key: MagicMock) -> None:
        """Should return plaintext when no encryption key is configured."""
        with patch("nexus.core.utils.crypto.get_settings", return_value=mock_settings_no_key):
            result = decrypt_secret("some-secret")

        assert result == "some-secret"

    def test_raises_on_wrong_key(self, fernet_key: str) -> None:
        """Should raise when decrypting with a different key than was used to encrypt."""
        settings_key1 = MagicMock()
        settings_key1.db_encryption_key = MagicMock()
        settings_key1.db_encryption_key.get_secret_value.return_value = fernet_key

        with patch("nexus.core.utils.crypto.get_settings", return_value=settings_key1):
            encrypted = encrypt_secret("my-secret")

        # Now try to decrypt with a different key
        different_key = Fernet.generate_key().decode()
        settings_key2 = MagicMock()
        settings_key2.db_encryption_key = MagicMock()
        settings_key2.db_encryption_key.get_secret_value.return_value = different_key

        with (
            patch("nexus.core.utils.crypto.get_settings", return_value=settings_key2),
            pytest.raises(InvalidToken),
        ):
            decrypt_secret(encrypted)

    def test_raises_when_prefix_present_but_no_key(self, mock_settings_no_key: MagicMock) -> None:
        """Should raise RuntimeError when encrypted value found but no key configured."""
        stored = f"{_ENCRYPTED_PREFIX}some-ciphertext"
        with (
            patch("nexus.core.utils.crypto.get_settings", return_value=mock_settings_no_key),
            pytest.raises(RuntimeError, match="APP_DB_ENCRYPTION_KEY"),
        ):
            decrypt_secret(stored)


class TestRoundTrip:
    """Tests for encrypt/decrypt round-trip."""

    def test_round_trip_with_special_characters(self, mock_settings_with_key: MagicMock) -> None:
        """Should handle secrets with special characters."""
        secret = "p@$$w0rd!#%&*()_+-=[]{}|;':\",./<>?"
        with patch("nexus.core.utils.crypto.get_settings", return_value=mock_settings_with_key):
            encrypted = encrypt_secret(secret)
            decrypted = decrypt_secret(encrypted)

        assert decrypted == secret

    def test_round_trip_with_unicode(self, mock_settings_with_key: MagicMock) -> None:
        """Should handle unicode secrets."""
        secret = "sécret-clé-日本語"
        with patch("nexus.core.utils.crypto.get_settings", return_value=mock_settings_with_key):
            encrypted = encrypt_secret(secret)
            decrypted = decrypt_secret(encrypted)

        assert decrypted == secret
