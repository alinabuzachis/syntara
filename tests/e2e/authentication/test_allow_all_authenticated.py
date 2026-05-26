"""E2E tests for ``allow_all_authenticated`` IdP setting (ANSTRAT-1844 / AAP-74068).

Markers:
- ``e2e`` - required; applied module-wide via ``pytestmark``

API mapping (KEYCLOAK):
- API-22: Allow everyone in — enabled
- API-23: Allow everyone in — disabled
- API-24: Allow everyone in — with pre-created mappings
- API-25: Allow everyone in — toggle behavior
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest

pytest.importorskip("external_services")

from nexus_api_client import Client
from nexus_api_client.api.authentication.refresh_token import sync_detailed as refresh_sync
from nexus_api_client.models.access_token_response import AccessTokenResponse
from nexus_api_client.models.oidc_group_mapping_entry import OIDCGroupMappingEntry

from tests.e2e.authentication.group_mapping_helpers import (
    get_user_id_by_username,
    idp_membership_group_names,
    set_allow_all_authenticated,
    user_group_names,
)
from tests.fixtures.external_services.keycloak_groups import add_keycloak_user_to_group
from tests.fixtures.external_services.oidc_login import (
    assert_oidc_login_denied,
    create_oidc_auth_client,
    create_oidc_login_session,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from external_services.types import HttpApiService
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse

pytestmark = [pytest.mark.e2e]

_NO_GROUP_MATCH_FRAGMENT = "do not match any configured group mappings"


class TestAPI22AllowAllAuthenticatedEnabled:
    """API-22: ``allow_all_authenticated`` grants login and default Users group (KEYCLOAK)."""

    def test_user_without_mappings_assigned_to_users_group(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
    ) -> None:
        """API-22: Login succeeds with no mappings; user receives builtin ``users`` group."""
        username, password = keycloak_user_factory()
        provider = group_mapping_provider_factory(
            group_mapping_entries=[],
            allow_all_authenticated=True,
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id

        create_oidc_auth_client(
            nexus_base_url=nexus_base_url,
            nexus_api=nexus_api,
            oidc_provider_id=provider_id,
            username=username,
            password=password,
        )
        user_id = get_user_id_by_username(nexus_api, username)
        assert "users" in user_group_names(nexus_api, user_id)
        assert "users" in idp_membership_group_names(nexus_api, user_id, provider_id=provider_id)


class TestAPI23AllowAllAuthenticatedDisabled:
    """API-23: Users without matching mappings are denied when flag is off (KEYCLOAK)."""

    def test_login_denied_without_group_mappings(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
    ) -> None:
        """API-23: Login denied with no mappings and ``allow_all_authenticated`` disabled."""
        username, password = keycloak_user_factory()
        provider = group_mapping_provider_factory(
            group_mapping_entries=[],
            allow_all_authenticated=False,
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id

        auth_error = assert_oidc_login_denied(
            nexus_base_url,
            nexus_api,
            provider_id,
            username=username,
            password=password,
        )
        assert _NO_GROUP_MATCH_FRAGMENT in auth_error


class TestAPI24AllowAllWithPreCreatedMappings:
    """API-24: Manual mappings apply alongside default Users group (KEYCLOAK)."""

    def test_user_assigned_to_users_and_mapped_group(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_service: HttpApiService,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
        nexus_group_factory: Callable[[str], UUID],
    ) -> None:
        """API-24: Mapped group and builtin ``users`` both assigned via IdP membership."""
        username, password = keycloak_user_factory()
        claim_value = "platform-admins"
        add_keycloak_user_to_group(keycloak_service.url, username, claim_value)

        admins_group_id = nexus_group_factory(f"e2e-admins-map-{uuid4().hex[:8]}")
        provider = group_mapping_provider_factory(
            group_mapping_entries=[
                OIDCGroupMappingEntry(
                    idp_group_value=claim_value,
                    nexus_group_id=admins_group_id,
                ),
            ],
            allow_all_authenticated=True,
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id
        admins_resp = nexus_api.groups.get(group_id=admins_group_id)
        assert admins_resp.parsed is not None
        admins_group_name = admins_resp.parsed.name

        create_oidc_auth_client(
            nexus_base_url=nexus_base_url,
            nexus_api=nexus_api,
            oidc_provider_id=provider_id,
            username=username,
            password=password,
        )
        user_id = get_user_id_by_username(nexus_api, username)
        idp_groups = idp_membership_group_names(nexus_api, user_id, provider_id=provider_id)
        assert "users" in idp_groups
        assert admins_group_name in idp_groups


class TestAPI25AllowAllToggleBehavior:
    """API-25: Disabling ``allow_all_authenticated`` denies re-login; session stays valid (KEYCLOAK)."""

    def test_disable_flag_denies_relogin_but_keeps_existing_session(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
    ) -> None:
        """API-25: Second login denied after toggle off; prior refresh token still works."""
        username, password = keycloak_user_factory()
        provider = group_mapping_provider_factory(
            group_mapping_entries=[],
            allow_all_authenticated=True,
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id

        _access_token, refresh_cookies = create_oidc_login_session(
            nexus_base_url=nexus_base_url,
            nexus_api=nexus_api,
            oidc_provider_id=provider_id,
            username=username,
            password=password,
        )
        get_user_id_by_username(nexus_api, username)

        set_allow_all_authenticated(nexus_api, provider_id, enabled=False)

        auth_error = assert_oidc_login_denied(
            nexus_base_url,
            nexus_api,
            provider_id,
            username=username,
            password=password,
        )
        assert _NO_GROUP_MATCH_FRAGMENT in auth_error

        refresh_client = Client(
            base_url=f"{nexus_base_url}/api/v1",
            cookies=refresh_cookies,
            verify_ssl=False,
        )
        refresh_resp = refresh_sync(client=refresh_client)
        assert refresh_resp.status_code == HTTPStatus.OK
        assert isinstance(refresh_resp.parsed, AccessTokenResponse)
