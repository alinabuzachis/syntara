"""Unit tests for password validation (API-46).

Tests the InfoSec password requirements:
- Minimum 14 characters
- At least 3 of 4 character classes (digits, uppercase, lowercase, punctuation/spaces/other)
"""

import pytest
from pydantic import ValidationError

from nexus.core.models.user_schemas import UserCreate


class TestPasswordValidation:
    """Test password validation rules for API-46."""

    def test_password_too_short_rejected(self) -> None:
        """Test passwords under 14 characters are rejected."""
        with pytest.raises(ValidationError, match="at least 14"):
            UserCreate(
                username="testuser",
                first_name="Test",
                last_name="User",
                password="Short123!",  # Only 9 characters  # noqa: S106
            )

    def test_password_only_lowercase_rejected(self) -> None:
        """Test password with only lowercase (1 class) is rejected."""
        with pytest.raises(ValidationError, match=r"at least 3.*character classes"):
            UserCreate(
                username="testuser",
                first_name="Test",
                last_name="User",
                password="lowercasepasswordonly",  # 21 chars but only 1 class  # noqa: S106
            )

    def test_password_two_classes_rejected(self) -> None:
        """Test password with only 2 character classes is rejected."""
        with pytest.raises(ValidationError, match=r"at least 3.*character classes"):
            UserCreate(
                username="testuser",
                first_name="Test",
                last_name="User",
                password="lowercaseonly123456",  # Only lowercase + digits (2 classes)  # noqa: S106
            )

    def test_password_three_classes_upper_lower_digit_accepted(self) -> None:
        """Test password with uppercase + lowercase + digits (3 classes) is accepted."""
        user = UserCreate(
            username="testuser",
            first_name="Test",
            last_name="User",
            password="ValidPassword123",  # Uppercase + lowercase + digits  # noqa: S106
        )
        assert user.username == "testuser"

    def test_password_three_classes_lower_digit_special_accepted(self) -> None:
        """Test password with lowercase + digits + special (3 classes) is accepted."""
        user = UserCreate(
            username="testuser",
            first_name="Test",
            last_name="User",
            password="validpassword123!@#",  # Lowercase + digits + special  # noqa: S106
        )
        assert user.username == "testuser"

    def test_password_three_classes_upper_digit_special_accepted(self) -> None:
        """Test password with uppercase + digits + special (3 classes) is accepted."""
        user = UserCreate(
            username="testuser",
            first_name="Test",
            last_name="User",
            password="VALIDPASSWORD123!",  # Uppercase + digits + special  # noqa: S106
        )
        assert user.username == "testuser"

    def test_password_three_classes_upper_lower_special_accepted(self) -> None:
        """Test password with uppercase + lowercase + special (3 classes) is accepted."""
        user = UserCreate(
            username="testuser",
            first_name="Test",
            last_name="User",
            password="ValidPassword!@#$",  # Uppercase + lowercase + special  # noqa: S106
        )
        assert user.username == "testuser"

    def test_password_four_classes_accepted(self) -> None:
        """Test password with all 4 character classes is accepted."""
        user = UserCreate(
            username="testuser",
            first_name="Test",
            last_name="User",
            password="ValidPassword123!",  # All 4 classes  # noqa: S106
        )
        assert user.username == "testuser"

    def test_password_with_spaces_accepted(self) -> None:
        """Test password can contain spaces (counts as punctuation/other class)."""
        user = UserCreate(
            username="testuser",
            first_name="Test",
            last_name="User",
            password="Valid Password 123",  # Uppercase + lowercase + digits + space  # noqa: S106
        )
        assert user.username == "testuser"

    def test_password_exactly_14_chars_three_classes_accepted(self) -> None:
        """Test minimum length boundary: exactly 14 characters with 3 classes."""
        user = UserCreate(
            username="testuser",
            first_name="Test",
            last_name="User",
            password="ValidPass123!!",  # Exactly 14 chars: upper + lower + digit + special  # noqa: S106
        )
        assert user.username == "testuser"

    def test_password_various_special_characters_accepted(self) -> None:
        """Test various special characters are recognized."""
        special_chars = '!@#$%^&*(),.?":{}|<>'
        password = f"ValidPassword{special_chars}"  # Mix of classes
        user = UserCreate(
            username="testuser",
            first_name="Test",
            last_name="User",
            password=password,
        )
        assert user.username == "testuser"
