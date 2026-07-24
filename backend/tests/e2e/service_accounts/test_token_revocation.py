"""E2E tests for service account token revocation on disable/delete (API-21,22,23).


Covers:
  API-21: Disable — immediate token invalidation (outstanding tokens rejected)
  API-22: Delete — immediate token invalidation (outstanding tokens rejected)
  API-23: Re-enable disabled service account (authentication restored)
"""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING

import httpx
import pytest

from tests.e2e.service_accounts import (
    create_sa_with_credential,
    poll_until_status,
    token_request,
)

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry
from orchestrator_test_sdk.e2e.tls import e2e_ssl_context

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

pytestmark = [pytest.mark.e2e]


class TestDisableTokenInvalidation:
    """API-21: Disable — immediate token invalidation (outstanding tokens rejected)."""

    def test_disable_invalidates_outstanding_tokens(
        self, nexus_api: NexusApiRegistry, first_project_id: UUID, nexus_base_url: str
    ) -> None:
        """Outstanding Bearer tokens are rejected after the SA is disabled."""
        sa, client_id, client_secret = create_sa_with_credential(nexus_api, first_project_id)

        try:
            resp = token_request(nexus_base_url, client_id, client_secret)
            assert resp.status_code == HTTPStatus.OK
            access_token = resp.parsed.access_token

            pre_resp = httpx.get(
                f"{nexus_base_url}/api/v1/auth/me",
                headers={"Authorization": f"Bearer {access_token}"},
                verify=e2e_ssl_context(),
            )
            assert pre_resp.status_code == HTTPStatus.OK, "Token should work before disable"

            nexus_api.service_accounts.disable(service_account_id=sa.id)

            rejection = poll_until_status(nexus_base_url, access_token, HTTPStatus.UNAUTHORIZED)
            assert rejection.status_code == HTTPStatus.UNAUTHORIZED, (
                f"Expected 401 after disable, still got {rejection.status_code}"
            )
        finally:
            try:
                nexus_api.service_accounts.enable(service_account_id=sa.id)
            except Exception:
                pass
            nexus_api.service_accounts.delete(service_account_id=sa.id)


class TestDeleteTokenInvalidation:
    """API-22: Delete — immediate token invalidation (outstanding tokens rejected)."""

    def test_delete_invalidates_outstanding_tokens(
        self, nexus_api: NexusApiRegistry, first_project_id: UUID, nexus_base_url: str
    ) -> None:
        """Outstanding Bearer tokens are rejected after the SA is deleted."""
        sa, client_id, client_secret = create_sa_with_credential(nexus_api, first_project_id)

        resp = token_request(nexus_base_url, client_id, client_secret)
        assert resp.status_code == HTTPStatus.OK
        access_token = resp.parsed.access_token

        pre_resp = httpx.get(
            f"{nexus_base_url}/api/v1/auth/me",
            headers={"Authorization": f"Bearer {access_token}"},
            verify=e2e_ssl_context(),
        )
        assert pre_resp.status_code == HTTPStatus.OK, "Token should work before delete"

        nexus_api.service_accounts.delete(service_account_id=sa.id)

        rejection = poll_until_status(nexus_base_url, access_token, HTTPStatus.UNAUTHORIZED)
        assert rejection.status_code == HTTPStatus.UNAUTHORIZED, (
            f"Expected 401 after delete, still got {rejection.status_code}"
        )


class TestReEnableRestoresAuth:
    """API-23: Re-enable disabled service account (authentication restored)."""

    def test_re_enable_restores_authentication(
        self, nexus_api: NexusApiRegistry, first_project_id: UUID, nexus_base_url: str
    ) -> None:
        """After re-enabling a disabled SA, a fresh token grants access again.

        The old token remains revoked (token_version was incremented on disable).
        The SA must re-authenticate via client credentials to get a new token.
        """
        sa, client_id, client_secret = create_sa_with_credential(nexus_api, first_project_id)

        try:
            resp = token_request(nexus_base_url, client_id, client_secret)
            assert resp.status_code == HTTPStatus.OK
            old_token = resp.parsed.access_token

            nexus_api.service_accounts.disable(service_account_id=sa.id)

            rejection = poll_until_status(nexus_base_url, old_token, HTTPStatus.UNAUTHORIZED)
            assert rejection.status_code == HTTPStatus.UNAUTHORIZED, "Old token should be rejected after disable"

            nexus_api.service_accounts.enable(service_account_id=sa.id)

            new_resp = token_request(nexus_base_url, client_id, client_secret)
            assert new_resp.status_code == HTTPStatus.OK, "Client credentials grant should succeed after re-enable"
            new_token = new_resp.parsed.access_token

            me_resp = poll_until_status(nexus_base_url, new_token, HTTPStatus.OK)
            assert me_resp.status_code == HTTPStatus.OK, "New token should grant access after re-enable"

            old_still_dead = httpx.get(
                f"{nexus_base_url}/api/v1/auth/me",
                headers={"Authorization": f"Bearer {old_token}"},
                verify=e2e_ssl_context(),
            )
            assert old_still_dead.status_code == HTTPStatus.UNAUTHORIZED, (
                "Old token should remain revoked after re-enable (token_version incremented on disable)"
            )
        finally:
            nexus_api.service_accounts.delete(service_account_id=sa.id)
