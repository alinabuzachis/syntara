"""Group 6: Scope Rules — any, self, project scope behavior."""

import pytest

from tests.unit.authz.conftest import allow_policy, build_opa_input, policies_for_role


class TestAnyScopeUniversal:
    """Auditor policies (scope=any) allow read in any project context."""

    @pytest.mark.parametrize(
        ("action", "resource_type"),
        [
            ("read", "workflow"),
            ("read", "execution"),
            ("read", "project"),
        ],
        ids=["workflow:read", "execution:read", "project:read"],
    )
    def test_any_scope_universal(self, opa_evaluate, action: str, resource_type: str):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("auditor"),
            )
        )
        assert result["allow"] is True


class TestSelfScopeOwnOnly:
    """Self-scoped policy only allows when resource_id matches user_id."""

    def test_self_scope_own_resource(self, opa_evaluate):
        user_id = "user-uuid-123"
        policies = [
            allow_policy("user:read:self", ["user:read"], scope="self"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="user",
                resource_id=user_id,
                user_id=user_id,
                effective_policies=policies,
            )
        )
        assert result["allow"] is True

    def test_self_scope_other_resource_denied(self, opa_evaluate):
        policies = [
            allow_policy("user:read:self", ["user:read"], scope="self"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="user",
                resource_id="other-user-id",
                user_id="test-user-id",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False

    def test_self_scope_empty_resource_id_denied(self, opa_evaluate):
        policies = [
            allow_policy("user:read:self", ["user:read"], scope="self"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="user",
                resource_id="",
                user_id="test-user-id",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False


class TestProjectScopeBoundaries:
    """Project-scoped policy allows in matching project, denies in others."""

    def test_project_scope_matching_project_allowed(self, opa_evaluate):
        policies = [
            allow_policy("workflow:read:proj-x", ["workflow:read"], scope="project", project="proj-x"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_project="proj-x",
                effective_policies=policies,
            )
        )
        assert result["allow"] is True

    def test_project_scope_different_project_denied(self, opa_evaluate):
        policies = [
            allow_policy("workflow:read:proj-x", ["workflow:read"], scope="project", project="proj-x"),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_project="proj-y",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False
