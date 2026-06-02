"""TC-1.11: Project list filtering -- users see only projects they have roles on."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set -- full stack required", allow_module_level=True)

from tests.e2e.conftest import api_for
from tests.e2e.fixtures.factories import (
    add_to_group,
    assign_role_to_group,
    assign_role_to_user,
    assign_system_role,
    create_group,
    create_project,
    create_user,
)

pytestmark = pytest.mark.e2e


class TestProjectListNoRoles:
    """A new user with no project roles sees no projects."""

    def test_sees_no_projects(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
    ) -> None:
        _, hidden_name = create_project(admin_api, "hidden")
        _, name, password = create_user(admin_api, "filter-none")

        user_api = api_for(nexus_base_url, name, password)

        projects = user_api.projects.list().assert_and_get()
        names = {str(p.name) for p in projects.resources}
        assert hidden_name not in names, f"No-role user should not see project {hidden_name}"


class TestProjectListWithRoles:
    """User with project-user on two projects sees those projects."""

    def test_sees_assigned_projects(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
    ) -> None:
        proj_a_id, proj_a_name = create_project(admin_api, "filt-a")
        proj_b_id, proj_b_name = create_project(admin_api, "filt-b")
        _, proj_c_name = create_project(admin_api, "filt-c")

        user_id, name, password = create_user(admin_api, "filter-two")

        assign_role_to_user(admin_api, proj_a_id, user_id, "project-user")
        assign_role_to_user(admin_api, proj_b_id, user_id, "project-user")

        user_api = api_for(nexus_base_url, name, password)
        projects = user_api.projects.list().assert_and_get()
        names = {str(p.name) for p in projects.resources}

        assert proj_a_name in names
        assert proj_b_name in names
        assert proj_c_name not in names


class TestSystemAuditorSeesAll:
    """System auditor (built-in 'auditor' role) sees all projects."""

    def test_auditor_sees_all_projects(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
    ) -> None:
        _, proj_x_name = create_project(admin_api, "audit-x")
        _, proj_y_name = create_project(admin_api, "audit-y")

        user_id, name, password = create_user(admin_api, "filter-aud")

        assign_system_role(admin_api, user_id, "auditor")

        user_api = api_for(nexus_base_url, name, password)
        projects = user_api.projects.list().assert_and_get()
        names = {str(p.name) for p in projects.resources}

        assert proj_x_name in names
        assert proj_y_name in names


class TestNoDuplicateProjects:
    """Overlapping group and direct roles on the same project don't produce duplicates."""

    def test_no_duplicate_entries(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
    ) -> None:
        proj_id, proj_name = create_project(admin_api, "dedup")
        user_id, name, password = create_user(admin_api, "filter-dup")
        group_id, _ = create_group(admin_api, "dedup")

        assign_role_to_user(admin_api, proj_id, user_id, "project-user")
        add_to_group(admin_api, group_id, user_id)
        assign_role_to_group(admin_api, proj_id, group_id, "project-auditor")

        user_api = api_for(nexus_base_url, name, password)
        projects = user_api.projects.list().assert_and_get()
        names = [str(p.name) for p in projects.resources]

        assert names.count(proj_name) == 1, f"Project '{proj_name}' appears {names.count(proj_name)} times, expected 1"
