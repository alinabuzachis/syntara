"""E2E tests for API-50: Email Unique but Not Mandatory — Creation.

Verifies email handling on user creation:
- Users can be created without an email field
- Multiple users with null email are allowed
- Duplicate non-null emails are rejected with a uniqueness constraint error
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING

import pytest
from nexus_api_client.models.user_create import UserCreate
from orchestrator_test_sdk.e2e import (
    generate_test_password,
    unique_name,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.user_read import UserRead

pytestmark = [pytest.mark.e2e]


class TestAPI50EmailUniqueness:
    """API-50: Email unique but not mandatory on user creation (AAP-74065)."""

    def test_create_users_without_email(
        self,
        local_user_factory: Callable[..., tuple[UserRead, str]],
    ) -> None:
        """Multiple users can be created without an email field."""
        for _ in range(2):
            user, _ = local_user_factory(email=None)
            assert user.email is None

    def test_duplicate_email_rejected(
        self,
        nexus_api: NexusApiRegistry,
        local_user_factory: Callable[..., tuple[UserRead, str]],
    ) -> None:
        """First user with an email succeeds; duplicate email is rejected with 409."""
        shared_email = f"{unique_name('e2e-dup')}@example.com"

        local_user_factory(email=shared_email)

        second_resp = nexus_api.users.create(
            body=UserCreate(
                username=unique_name("e2e-dup-second"),
                first_name="Second",
                password=generate_test_password(),
                email=shared_email,
            ),
        )
        assert second_resp.status_code == HTTPStatus.CONFLICT
