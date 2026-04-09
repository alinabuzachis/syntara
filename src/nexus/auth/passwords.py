"""Password hashing utilities using Argon2id."""

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_ph = PasswordHasher()


def hash_password(plain: str) -> str:
    """Hash a plaintext password with Argon2id.

    Args:
        plain: The plaintext password.

    Returns:
        The Argon2id hash string.

    """
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against an Argon2id hash.

    Args:
        plain: The plaintext password to check.
        hashed: The stored Argon2id hash.

    Returns:
        True if the password matches.

    """
    try:
        return _ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False
