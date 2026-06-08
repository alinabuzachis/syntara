"""E2E tests for IdP group mapping and builtin groups (ANSTRAT-1844).

Test plan: Miscdocs/anstrat-1844-authentication-test-plan.md

Markers:
- ``e2e`` - required; applied module-wide via ``pytestmark``

API mapping:
- API-8: Auto group mapping from IdP ``groups`` claim (KEYCLOAK)
- API-10: Manual group mapping (KEYCLOAK)
- API-11: JMESPath filter - group filtering (KEYCLOAK)
- API-13: JMESPath filter - invalid expression rejected at config time (KEYCLOAK)
- API-14: JMESPath filter - no results denies login (KEYCLOAK)
- API-15: Claim data configuration (KEYCLOAK)
- API-45: Default builtin groups on fresh deployment (LOCAL)
"""

from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING
from uuid import UUID

import pytest

pytest.importorskip("external_services")

from nexus_api_client.models.oidc_group_mapping_entry import OIDCGroupMappingEntry

from tests.e2e.authentication.group_mapping_helpers import (
    assert_admin_in_admins_group,
    get_user_id_by_username,
    idp_membership_group_names,
    keycloak_oidc_config_for_mapping,
)
from tests.e2e.conftest import unique_name
from tests.fixtures.external_services.keycloak_groups import (
    add_keycloak_user_to_group,
    ensure_user_attribute_claim_mapper,
    set_keycloak_user_attributes,
)
from tests.fixtures.external_services.oidc_login import (
    assert_oidc_login_denied,
    create_oidc_auth_client,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from external_services.types import HttpApiService
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse
    from nexus_api_client.models.user_info import UserInfo

pytestmark = [pytest.mark.e2e]

_INVALID_JMESPATH = "[[[bad"


class TestAPI45DefaultBuiltinGroups:
    """API-45: Builtin Auditors and Users groups exist and cannot be deleted (LOCAL)."""

    def test_builtin_auditors_and_users_groups_exist(
        self,
        nexus_api: NexusApiRegistry,
        nexus_admin_user: UserInfo,
    ) -> None:
        """API-45: Fresh deployment exposes builtin Auditors and Users groups."""
        groups_resp = nexus_api.groups.list()
        assert groups_resp.status_code == HTTPStatus.OK
        assert groups_resp.parsed is not None
        by_name = {g.name: g for g in groups_resp.parsed.resources}
        assert "auditors" in by_name
        assert "users" in by_name
        assert by_name["auditors"].is_builtin is True
        assert by_name["users"].is_builtin is True

    @pytest.mark.parametrize("group_name", ["auditors", "users"])
    def test_delete_builtin_group_forbidden(
        self,
        nexus_api: NexusApiRegistry,
        group_name: str,
    ) -> None:
        """API-45: Builtin groups cannot be deleted via the API."""
        groups_resp = nexus_api.groups.list()
        assert groups_resp.parsed is not None
        target = next(g for g in groups_resp.parsed.resources if g.name == group_name)
        delete_resp = nexus_api.groups.delete(group_id=target.id)
        assert delete_resp.status_code == HTTPStatus.FORBIDDEN

    def test_builtin_admin_assigned_to_admins_group(
        self,
        nexus_api: NexusApiRegistry,
        nexus_admin_user: UserInfo,
    ) -> None:
        """API-45: Built-in admin is assigned to the admins group."""
        assert_admin_in_admins_group(nexus_api, nexus_admin_user)


class TestAPI13InvalidJmespathRejected:
    """API-13: Invalid JMESPath expressions are rejected at configuration time (KEYCLOAK)."""

    def test_create_provider_rejects_invalid_jmespath(
        self,
        nexus_api: NexusApiRegistry,
        keycloak_service: HttpApiService,
        nexus_base_url: str,
    ) -> None:
        """API-13: Saving ``[[[bad`` returns 422 with a validation error."""
        from nexus_api_client.models.identity_provider_create import IdentityProviderCreate

        create_resp = nexus_api.identity_providers.create(
            body=IdentityProviderCreate(
                name=unique_name("e2e-invalid-jmespath"),
                configuration=keycloak_oidc_config_for_mapping(
                    keycloak_service.url,
                    nexus_base_url,
                    group_jmespath_expression=_INVALID_JMESPATH,
                ),
            )
        )
        assert create_resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


class TestAPI8AutoGroupMapping:
    """API-8: Users are assigned to groups matching their IdP ``groups`` claim (KEYCLOAK)."""

    def test_user_assigned_to_mapped_groups_from_claim(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_service_with_group_mapping: HttpApiService,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
        nexus_group_factory: Callable[[str], UUID],
    ) -> None:
        """API-8: Login assigns the user to Nexus groups that match ``groups`` claim values."""
        username, password = keycloak_user_factory()
        idp_group = unique_name("nexus-e2e-operators")
        add_keycloak_user_to_group(keycloak_service_with_group_mapping.url, username, idp_group)

        nexus_group_id = nexus_group_factory(unique_name("e2e-mapped-group"))
        provider = group_mapping_provider_factory(
            group_mapping_entries=[
                OIDCGroupMappingEntry(idp_group_value=idp_group, nexus_group_id=nexus_group_id),
            ],
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
        mapped_names = idp_membership_group_names(nexus_api, user_id, provider_id=provider_id)
        groups_resp = nexus_api.groups.get(group_id=nexus_group_id)
        assert groups_resp.parsed is not None
        assert groups_resp.parsed.name in mapped_names


class TestAPI10ManualGroupMapping:
    """API-10: Manual mapping from claim values to specific Nexus groups (KEYCLOAK)."""

    def test_manual_mapping_assigns_only_matching_users(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_service_with_group_mapping: HttpApiService,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
        nexus_group_factory: Callable[[str], UUID],
    ) -> None:
        """API-10: ``platform-admins`` claim maps to target group; other users are not assigned."""
        matched_user, matched_password = keycloak_user_factory()
        other_user, other_password = keycloak_user_factory()
        claim_value = "platform-admins"
        add_keycloak_user_to_group(keycloak_service_with_group_mapping.url, matched_user, claim_value)

        target_group_id = nexus_group_factory(unique_name("e2e-admins-map"))
        provider = group_mapping_provider_factory(
            group_mapping_entries=[
                OIDCGroupMappingEntry(
                    idp_group_value=claim_value,
                    nexus_group_id=target_group_id,
                ),
            ],
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id
        target_group_resp = nexus_api.groups.get(group_id=target_group_id)
        assert target_group_resp.parsed is not None
        target_group_name = target_group_resp.parsed.name

        create_oidc_auth_client(
            nexus_base_url=nexus_base_url,
            nexus_api=nexus_api,
            oidc_provider_id=provider_id,
            username=matched_user,
            password=matched_password,
        )
        matched_id = get_user_id_by_username(nexus_api, matched_user)
        assert target_group_name in idp_membership_group_names(nexus_api, matched_id, provider_id=provider_id)

        assert_oidc_login_denied(
            nexus_base_url,
            nexus_api,
            provider_id,
            username=other_user,
            password=other_password,
        )
        other_list = nexus_api.users.list(username=other_user)
        assert other_list.parsed is not None
        if other_list.parsed.resources:
            other_id = other_list.parsed.resources[0].id
            assert isinstance(other_id, UUID)
            assert target_group_name not in idp_membership_group_names(nexus_api, other_id, provider_id=provider_id)


class TestAPI11JmespathGroupFiltering:
    """API-11: JMESPath filters which claim groups participate in mapping (KEYCLOAK)."""

    def test_jmespath_prefix_filter_limits_synced_groups(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_service_with_group_mapping: HttpApiService,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
        nexus_group_factory: Callable[[str], UUID],
    ) -> None:
        """API-11: Only ``nexus-*`` claim groups are considered; ``other-team`` is ignored."""
        username, password = keycloak_user_factory()
        for group_name in ("nexus-admins", "nexus-operators", "other-team", "unrelated-group"):
            add_keycloak_user_to_group(keycloak_service_with_group_mapping.url, username, group_name)

        admins_group_id = nexus_group_factory(unique_name("e2e-nexus-admins"))
        operators_group_id = nexus_group_factory(unique_name("e2e-nexus-operators"))
        other_team_group_id = nexus_group_factory(unique_name("e2e-other-team"))

        provider = group_mapping_provider_factory(
            group_jmespath_expression="groups[?starts_with(@, 'nexus-')]",
            group_mapping_entries=[
                OIDCGroupMappingEntry(idp_group_value="nexus-admins", nexus_group_id=admins_group_id),
                OIDCGroupMappingEntry(idp_group_value="nexus-operators", nexus_group_id=operators_group_id),
                OIDCGroupMappingEntry(idp_group_value="other-team", nexus_group_id=other_team_group_id),
            ],
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id

        admins_resp = nexus_api.groups.get(group_id=admins_group_id)
        operators_resp = nexus_api.groups.get(group_id=operators_group_id)
        other_resp = nexus_api.groups.get(group_id=other_team_group_id)
        assert admins_resp.parsed is not None
        assert operators_resp.parsed is not None
        assert other_resp.parsed is not None
        admins_name = admins_resp.parsed.name
        operators_name = operators_resp.parsed.name
        other_name = other_resp.parsed.name

        create_oidc_auth_client(
            nexus_base_url=nexus_base_url,
            nexus_api=nexus_api,
            oidc_provider_id=provider_id,
            username=username,
            password=password,
        )
        user_id = get_user_id_by_username(nexus_api, username)
        idp_groups = idp_membership_group_names(nexus_api, user_id, provider_id=provider_id)
        assert admins_name in idp_groups
        assert operators_name in idp_groups
        assert other_name not in idp_groups


class TestAPI14JmespathNoResultsDeniesLogin:
    """API-14: Valid JMESPath with no matches denies login (KEYCLOAK)."""

    def test_login_denied_when_jmespath_matches_no_groups(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_service_with_group_mapping: HttpApiService,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
        nexus_group_factory: Callable[[str], UUID],
    ) -> None:
        """API-14: Login is denied when the JMESPath filter excludes all token groups."""
        username, password = keycloak_user_factory()
        add_keycloak_user_to_group(keycloak_service_with_group_mapping.url, username, "nexus-admins")

        nexus_group_id = nexus_group_factory(unique_name("e2e-unused-map"))
        provider = group_mapping_provider_factory(
            group_jmespath_expression="groups[?starts_with(@, 'no-nexus-prefix-')]",
            group_mapping_entries=[
                OIDCGroupMappingEntry(idp_group_value="nexus-admins", nexus_group_id=nexus_group_id),
            ],
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
        assert "group" in auth_error.lower() or "access denied" in auth_error.lower()


class TestAPI15ClaimDataConfiguration:
    """API-15: Custom claim values map to Nexus groups (KEYCLOAK)."""

    def test_custom_claim_aligns_user_to_mapped_group(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        keycloak_service_with_group_mapping: HttpApiService,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
        nexus_group_factory: Callable[[str], UUID],
    ) -> None:
        """API-15: ``department`` claim value maps to the configured Nexus group."""
        ensure_user_attribute_claim_mapper(
            keycloak_service_with_group_mapping.url,
            attribute="department",
            claim_name="department",
        )
        username, password = keycloak_user_factory()
        department_value = unique_name("engineering")
        set_keycloak_user_attributes(
            keycloak_service_with_group_mapping.url,
            username,
            {"department": [department_value]},
        )

        dept_group_id = nexus_group_factory(unique_name("e2e-dept-group"))
        provider = group_mapping_provider_factory(
            group_jmespath_expression="department",
            group_mapping_entries=[
                OIDCGroupMappingEntry(
                    idp_group_value=department_value,
                    nexus_group_id=dept_group_id,
                ),
            ],
        )
        assert isinstance(provider.id, UUID)
        provider_id = provider.id
        dept_group_resp = nexus_api.groups.get(group_id=dept_group_id)
        assert dept_group_resp.parsed is not None
        dept_group_name = dept_group_resp.parsed.name

        create_oidc_auth_client(
            nexus_base_url=nexus_base_url,
            nexus_api=nexus_api,
            oidc_provider_id=provider_id,
            username=username,
            password=password,
        )
        user_id = get_user_id_by_username(nexus_api, username)
        assert dept_group_name in idp_membership_group_names(nexus_api, user_id, provider_id=provider_id)
