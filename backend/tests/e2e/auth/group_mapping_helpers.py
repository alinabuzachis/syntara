"""Shared helpers for ANSTRAT-1844 IdP group mapping E2E tests.

Covers API-8, API-10-15, API-22, API-23, API-24, API-25, and API-45.

Not a test module - no pytest markers. Consumed by group-mapping e2e tests.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from nexus_api_client.models.identity_provider_patch import IdentityProviderPatch
from nexus_api_client.models.oidc_claim_mapping import OIDCClaimMapping
from nexus_api_client.models.oidc_configuration import OIDCConfiguration
from nexus_api_client.models.oidc_configuration_patch import OIDCConfigurationPatch
from nexus_api_client.models.oidc_configuration_response import OIDCConfigurationResponse
from nexus_api_client.types import Unset

from tests.fixtures.external_services.keycloak import _CLIENT_ID, _CLIENT_SECRET, _REALM
from tests.fixtures.external_services.oidc_login import create_oidc_identity_provider

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse
    from nexus_api_client.models.oidc_group_mapping_entry import OIDCGroupMappingEntry
    from nexus_api_client.models.user_group_read import UserGroupRead
    from nexus_api_client.models.user_info import UserInfo


def keycloak_oidc_config_for_mapping(
    keycloak_url: str,
    nexus_base_url: str,
    *,
    group_jmespath_expression: str | None = "groups[*]",
    group_mapping_entries: list[OIDCGroupMappingEntry] | None = None,
    allow_all_authenticated: bool = False,
) -> OIDCConfiguration:
    """Build Keycloak OIDC config for group-mapping tests (no default wildcard admin mapping)."""
    return OIDCConfiguration(
        issuer_url=f"{keycloak_url}/realms/{_REALM}",
        client_id=_CLIENT_ID,
        client_secret=_CLIENT_SECRET,
        redirect_uri=f"{nexus_base_url}/api/v1/auth/oidc/callback",
        auto_discovery=True,
        group_jmespath_expression=group_jmespath_expression,
        group_mapping_entries=group_mapping_entries or [],
        allow_all_authenticated=allow_all_authenticated,
    )


def create_group_mapping_provider(
    nexus_api: NexusApiRegistry,
    keycloak_url: str,
    nexus_base_url: str,
    *,
    group_jmespath_expression: str | None = "groups[*]",
    group_mapping_entries: list[OIDCGroupMappingEntry] | None = None,
    allow_all_authenticated: bool = False,
) -> IdentityProviderResponse:
    """Create a Keycloak OIDC provider configured for group mapping tests."""
    return create_oidc_identity_provider(
        nexus_api=nexus_api,
        oidc_config=keycloak_oidc_config_for_mapping(
            keycloak_url,
            nexus_base_url,
            group_jmespath_expression=group_jmespath_expression,
            group_mapping_entries=group_mapping_entries,
            allow_all_authenticated=allow_all_authenticated,
        ),
    )


def get_user_id_by_username(nexus_api: NexusApiRegistry, username: str) -> UUID:
    """Resolve a Nexus user id by username."""
    users_list = nexus_api.users.list(username=username).assert_and_get()
    resources = users_list.resources
    assert resources is not None
    assert len(resources) == 1
    user_id = resources[0].id
    assert isinstance(user_id, UUID)
    return user_id


def list_user_groups(nexus_api: NexusApiRegistry, user_id: UUID) -> list[UserGroupRead]:
    """Return all groups for a user (paginates with default limit)."""
    groups_list = nexus_api.users.list_groups(user_id=user_id).assert_and_get()
    return list(groups_list.resources or [])


def user_group_names(nexus_api: NexusApiRegistry, user_id: UUID) -> set[str]:
    """Return Nexus group names assigned to a user."""
    return {g.name for g in list_user_groups(nexus_api, user_id)}


def idp_membership_group_names(
    nexus_api: NexusApiRegistry,
    user_id: UUID,
    *,
    provider_id: UUID,
) -> set[str]:
    """Return group names where membership was assigned by the given IdP."""
    names: set[str] = set()
    for group in list_user_groups(nexus_api, user_id):
        sources = group.membership_sources or []
        if any(s.type_ == "idp" and s.provider_id == provider_id for s in sources):
            names.add(group.name)
    return names


def assert_admin_in_admins_group(nexus_api: NexusApiRegistry, admin_user: UserInfo) -> None:
    """API-45: built-in admin should belong to the admins group."""
    names = user_group_names(nexus_api, UUID(admin_user.id))
    assert "admins" in names


def oidc_configuration_patch_from_response(
    config: OIDCConfigurationResponse,
    *,
    allow_all_authenticated: bool,
) -> OIDCConfigurationPatch:
    """Build a full OIDC configuration patch body from a provider GET response."""
    patch = OIDCConfigurationPatch(
        issuer_url=config.issuer_url,
        client_id=config.client_id,
        redirect_uri=config.redirect_uri,
        allow_all_authenticated=allow_all_authenticated,
    )

    if not isinstance(config.auto_discovery, Unset):
        patch.auto_discovery = config.auto_discovery
    if not isinstance(config.scopes, Unset):
        patch.scopes = config.scopes
    if not isinstance(config.group_jmespath_expression, Unset):
        patch.group_jmespath_expression = config.group_jmespath_expression
    if not isinstance(config.enable_rp_initiated_logout, Unset):
        patch.enable_rp_initiated_logout = config.enable_rp_initiated_logout
    if not isinstance(config.disable_tls_verify, Unset):
        patch.disable_tls_verify = config.disable_tls_verify
    if not isinstance(config.aap_role_mapping_enabled, Unset):
        patch.aap_role_mapping_enabled = config.aap_role_mapping_enabled
    if not isinstance(config.idp_type, Unset):
        patch.idp_type = config.idp_type
    if not isinstance(config.claim_mapping, Unset) and isinstance(config.claim_mapping, OIDCClaimMapping):
        patch.claim_mapping = config.claim_mapping

    return patch


def set_allow_all_authenticated(
    nexus_api: NexusApiRegistry,
    provider_id: UUID,
    *,
    enabled: bool,
) -> None:
    """Set ``allow_all_authenticated`` on an existing OIDC provider."""
    provider = nexus_api.identity_providers.get(provider_id=provider_id).assert_and_get()
    config = provider.configuration
    assert isinstance(config, OIDCConfigurationResponse)

    nexus_api.identity_providers.patch(
        provider_id=provider_id,
        body=IdentityProviderPatch(
            configuration=oidc_configuration_patch_from_response(
                config,
                allow_all_authenticated=enabled,
            ),
        ),
    ).assert_and_get()
