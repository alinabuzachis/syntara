"""E2E tests for API-36: Admin Manual Group Assignment — All User Types.

Verifies that an admin can manually assign local and federated users to groups:
- Group assignment succeeds for both local and federated users
- Membership source is ``"manual"`` (not ``"idp"``)
- Manual group assignments persist across logins
- Removal of federated user from group works correctly
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

import pytest

pytest.importorskip("external_services")

from tests.e2e.auth.group_mapping_helpers import (
    get_user_id_by_username,
    user_group_names,
)
from tests.e2e.conftest import api_for, unique_name
from tests.fixtures.factories.group_factories import add_to_group, remove_from_group

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.identity_provider_response import IdentityProviderResponse
    from nexus_api_client.models.user_read import UserRead

    from tests.fixtures.factories.group_factories import GroupFactory

pytestmark = [pytest.mark.e2e]


class TestAPI36AdminManualGroupAssignment:
    """API-36: Admin can manually assign any user type to groups (AAP-74067)."""

    def test_local_user_manual_group_assignment(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        local_user_factory: Callable[..., tuple[UserRead, str]],
        create_group: GroupFactory,
    ) -> None:
        """Assign local user to group, verify membership source and persistence across login."""
        user, password = local_user_factory()

        group_name = unique_name("e2e-manual-grp")
        group_id, _ = create_group(nexus_api, group_name=group_name)

        add_to_group(nexus_api, group_id, user.id)

        members_list = nexus_api.groups.list_members(group_id=group_id).assert_and_get()
        member = next(m for m in members_list.resources if m.id == user.id)
        assert any(s.type_ == "manual" for s in (member.membership_sources or []))

        user_api = api_for(nexus_base_url, user.username, password)
        assert group_name in user_group_names(user_api, user.id)

    def test_federated_user_manual_group_assignment_and_removal(
        self,
        nexus_api: NexusApiRegistry,
        keycloak_user_factory: Callable[[], tuple[str, str]],
        oidc_user_factory: Callable[[UUID, str, str], NexusApiRegistry],
        group_mapping_provider_factory: Callable[..., IdentityProviderResponse],
        create_group: GroupFactory,
    ) -> None:
        """Add federated user to group, verify manual source, remove, verify removal."""
        provider = group_mapping_provider_factory(allow_all_authenticated=True)
        assert isinstance(provider.id, UUID)

        kc_username, kc_password = keycloak_user_factory()
        oidc_user_factory(provider.id, kc_username, kc_password)
        user_id = get_user_id_by_username(nexus_api, kc_username)

        group_name = unique_name("e2e-fed-manual")
        group_id, _ = create_group(nexus_api, group_name=group_name)

        add_to_group(nexus_api, group_id, user_id)

        members_list = nexus_api.groups.list_members(group_id=group_id).assert_and_get()
        member = next(m for m in members_list.resources if m.id == user_id)
        assert any(s.type_ == "manual" for s in (member.membership_sources or []))

        remove_from_group(nexus_api, group_id, user_id)

        members_list = nexus_api.groups.list_members(group_id=group_id).assert_and_get()
        member_ids = {m.id for m in members_list.resources}
        assert user_id not in member_ids
