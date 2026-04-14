"""Scope bypass hardening — SEC-006, SEC-007, SEC-008.

Verifies that self-scope and project-scope cannot be bypassed
by manipulating resource IDs or project fields.
"""

import pytest

from tests.unit.authz.conftest import allow_policy, build_opa_input


class TestSelfScopeBypass:
    """SEC-006/007: Self-scope must not be tricked by wrong or empty IDs."""

    def test_self_scope_wrong_user_id_denied(self, opa_evaluate):
        """SEC-006: Self-scope denies when resource_id is a different user."""
        policies = [
            allow_policy("user:read:self", ["user:read"], scope="self"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="user",
                resource_id="attacker-id",
                user_id="victim-id",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False

    def test_self_scope_empty_both_ids_allowed(self, opa_evaluate):
        """SEC-007: When both user_id and resource_id are empty, "" == "" matches.

        This is a known Rego behavior — empty strings are equal.  The
        application layer must ensure user_id is never empty before
        reaching OPA.
        """
        policies = [
            allow_policy("user:read:self", ["user:read"], scope="self"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="user",
                resource_id="",
                user_id="",
                effective_policies=policies,
            )
        )
        assert result["allow"] is True

    def test_self_scope_non_user_resource_denied(self, opa_evaluate):
        """Self-scope requires resource.type == 'user'; workflow type should fail."""
        policies = [
            allow_policy("user:read:self", ["workflow:read"], scope="self"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_id="test-user-id",
                user_id="test-user-id",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False

    @pytest.mark.parametrize(
        "resource_id",
        [
            "test-user-id ",
            " test-user-id",
            "TEST-USER-ID",
        ],
        ids=["trailing-space", "leading-space", "uppercase"],
    )
    def test_self_scope_near_match_denied(self, opa_evaluate, resource_id: str):
        """Self-scope requires exact string match — whitespace/case variants denied."""
        policies = [
            allow_policy("user:read:self", ["user:read"], scope="self"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="user",
                resource_id=resource_id,
                user_id="test-user-id",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False


class TestProjectScopeBypass:
    """SEC-008: Project-scope must not grant access when project is empty or mismatched."""

    def test_project_scope_empty_resource_project_denied(self, opa_evaluate):
        """SEC-008: Project-scoped policy denies when resource has no project."""
        policies = [
            allow_policy("workflow:read:proj-x", ["workflow:read"], scope="project", project="proj-x"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_project="",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False

    def test_project_scope_empty_policy_project_denied(self, opa_evaluate):
        """Project-scoped policy with empty project field should not match any resource."""
        policies = [
            allow_policy("workflow:read:empty", ["workflow:read"], scope="project", project=""),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_project="proj-x",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False

    def test_project_scope_both_empty_denied(self, opa_evaluate):
        """When policy project is empty, allow_policy() omits the key entirely.

        OPA treats missing ``policy.project`` as undefined, so the
        comparison ``policy.project == input.resource.project`` fails.
        Result: deny.  This is safe — a project-scoped policy without
        a project field cannot match anything.
        """
        policies = [
            allow_policy("workflow:read:empty", ["workflow:read"], scope="project", project=""),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_project="",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False

    @pytest.mark.parametrize(
        "resource_project",
        [
            "proj-X",
            "proj-x ",
            " proj-x",
        ],
        ids=["case-mismatch", "trailing-space", "leading-space"],
    )
    def test_project_scope_near_match_denied(self, opa_evaluate, resource_project: str):
        """Project scope requires exact string match."""
        policies = [
            allow_policy("workflow:read:proj-x", ["workflow:read"], scope="project", project="proj-x"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_project=resource_project,
                effective_policies=policies,
            )
        )
        assert result["allow"] is False

    def test_project_scope_multiple_projects_isolated(self, opa_evaluate):
        """User with access to proj-a cannot access proj-b resources."""
        policies = [
            allow_policy("workflow:read:proj-a", ["workflow:read"], scope="project", project="proj-a"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_project="proj-b",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False
