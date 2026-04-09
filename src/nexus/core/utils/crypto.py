"""Encryption utilities for sensitive fields stored at rest.

Uses Fernet symmetric encryption to protect secrets in the database.
A configured ``APP_DB_ENCRYPTION_KEY`` (or ``APP_DB_ENCRYPTION_KEY_PATH``)
is **required** when encrypting or decrypting secrets.
"""

import structlog
from cryptography.fernet import Fernet, InvalidToken

from nexus.core.config.base import get_settings

logger = structlog.stdlib.get_logger(__name__)

# Prefix to distinguish encrypted values from plaintext
_ENCRYPTED_PREFIX = "enc:"


def _get_fernet() -> Fernet | None:
    """Return a Fernet instance from the configured encryption key, or None if not configured."""
    settings = get_settings()
    if not settings.db_encryption_key:
        return None
    return Fernet(settings.db_encryption_key.get_secret_value().encode())


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret for storage.

    Raises:
        RuntimeError: If no encryption key is configured.

    """
    fernet = _get_fernet()
    if fernet is None:
        msg = "Cannot encrypt secret: APP_DB_ENCRYPTION_KEY (or APP_DB_ENCRYPTION_KEY_PATH) must be configured"
        raise RuntimeError(msg)
    token = fernet.encrypt(plaintext.encode()).decode()
    return f"{_ENCRYPTED_PREFIX}{token}"


def decrypt_secret(stored: str) -> str:
    """Decrypt a stored secret. Handles both encrypted (prefixed) and legacy plaintext values.

    Raises:
        RuntimeError: If an encrypted value is found but no key is configured.

    """
    if not stored.startswith(_ENCRYPTED_PREFIX):
        # Legacy plaintext value — return as-is
        return stored

    fernet = _get_fernet()
    if fernet is None:
        msg = "Cannot decrypt secret: APP_DB_ENCRYPTION_KEY (or APP_DB_ENCRYPTION_KEY_PATH) must be configured"
        raise RuntimeError(msg)

    ciphertext = stored[len(_ENCRYPTED_PREFIX) :]
    try:
        return fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        logger.exception("Failed to decrypt secret — encryption key may have been rotated")
        raise
