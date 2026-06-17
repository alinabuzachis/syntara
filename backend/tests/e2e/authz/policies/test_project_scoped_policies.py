"""Policy coverage: project-scoped policies (26 policies).

Each test case grants a user ONLY the policy under test plus minimal
prerequisites, then verifies the action succeeds (positive) or is
denied without the policy (negative).
"""

from __future__ import annotations

import os
from http import HTTPStatus
from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

    from tests.fixtures.factories import AssignProjectRoleFactory, ProjectFactory, ProjectRoleFactory, UserFactory


if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from tests.e2e.conftest import api_for

from .conftest import PROJECT_SCOPED_CASES

pytestmark = [pytest.mark.e2e]


@pytest.mark.parametrize("case", PROJECT_SCOPED_CASES, ids=lambda c: c.policy)
class TestProjectScopedPolicyAllowed:
    """Positive: user WITH the policy can perform the action."""

    def test_allowed(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
        create_project: ProjectFactory,
        create_user: UserFactory,
        create_project_role: ProjectRoleFactory,
        assign_project_role_to_user: AssignProjectRoleFactory,
        case,
    ) -> None:
        user_id, username, password = create_user(admin_api, "pol-a")
        project_id, _ = create_project(admin_api, "pol-a")

        all_policies = [case.policy, *case.prereqs]
        role_name = create_project_role(admin_api, project_id, "pol", all_policies)
        assign_project_role_to_user(admin_api, project_id, user_id, role_name)

        ctx: dict[str, Any] = {}
        if case.setup:
            case.setup(admin_api, project_id, ctx)

        user_api = api_for(nexus_base_url, username, password)
        resp = case.action(user_api, project_id, ctx)
        assert resp.is_success


@pytest.mark.parametrize("case", PROJECT_SCOPED_CASES, ids=lambda c: c.policy)
class TestProjectScopedPolicyDenied:
    """Negative: user WITHOUT the policy is denied."""

    def test_denied(
        self,
        nexus_base_url: str,
        admin_api: NexusApiRegistry,
        create_project: ProjectFactory,
        create_user: UserFactory,
        create_project_role: ProjectRoleFactory,
        assign_project_role_to_user: AssignProjectRoleFactory,
        case,
    ) -> None:
        if case.skip_denied:
            pytest.skip("List endpoint returns built-in items to all authenticated users")

        user_id, username, password = create_user(admin_api, "pol-d")
        project_id, _ = create_project(admin_api, "pol-d")

        if case.prereqs:
            role_name = create_project_role(admin_api, project_id, "nopol", case.prereqs)
            assign_project_role_to_user(admin_api, project_id, user_id, role_name)

        ctx: dict[str, Any] = {}
        if case.setup:
            case.setup(admin_api, project_id, ctx)

        user_api = api_for(nexus_base_url, username, password)
        resp = case.action(user_api, project_id, ctx)

        if resp.status_code == HTTPStatus.FORBIDDEN:
            return
        if resp.is_success and resp.parsed is not None and hasattr(resp.parsed, "resources"):
            resource_ids = {str(getattr(r, "id", None)) for r in resp.parsed.resources}
            assert str(project_id) not in resource_ids, (
                f"Expected {case.policy} to be denied, but test-created project "
                f"{project_id} is visible among {len(resp.parsed.resources)} resources"
            )
            return
        assert resp.status_code == HTTPStatus.FORBIDDEN, f"Expected denied, got {resp.status_code}: {resp.content!r}"
