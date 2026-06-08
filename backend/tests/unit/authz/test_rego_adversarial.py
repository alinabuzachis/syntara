"""Group 7: Adversarial / Red Team — edge cases and privilege escalation."""

import pytest

from tests.unit.authz.conftest import allow_policy, build_opa_input, deny_policy, policies_for_role


class TestPrivilegeEscalationBlocked:
    """User with user role cannot do policy:create or policy:delete."""

    @pytest.mark.parametrize(
        ("action", "resource_type"),
        [
            ("create", "policy"),
            ("delete", "policy"),
        ],
        ids=["policy:create-denied", "policy:delete-denied"],
    )
    def test_privilege_escalation_blocked(self, opa_evaluate, action: str, resource_type: str):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("user"),
            )
        )
        assert result["allow"] is False


class TestImplicitDenyUnknownActions:
    """Unknown/invented actions are always denied even with user role policies."""

    @pytest.mark.parametrize(
        ("action", "resource_type"),
        [
            ("launch", "spaceship"),
            ("teleport", "user"),
            ("destroy", "universe"),
        ],
        ids=["launch:spaceship", "teleport:user", "destroy:universe"],
    )
    def test_implicit_deny_unknown_actions(self, opa_evaluate, action: str, resource_type: str):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("user"),
            )
        )
        assert result["allow"] is False


class TestConflictingAllowDenyGroups:
    """Admin role allow + deny workflow:delete — deny always wins."""

    @pytest.mark.parametrize(
        ("action", "resource_type", "expected"),
        [
            ("read", "workflow", True),
            ("create", "workflow", True),
            ("delete", "workflow", False),
        ],
        ids=[
            "workflow:read-allowed",
            "workflow:create-allowed",
            "workflow:delete-denied",
        ],
    )
    def test_conflicting_allow_deny_groups(
        self,
        opa_evaluate,
        action: str,
        resource_type: str,
        expected: bool,  # noqa: FBT001
    ):
        policies = [*policies_for_role("admin"), deny_policy("deny-all-wf-delete", ["workflow:delete"])]
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies,
            )
        )
        assert result["allow"] is expected


class TestEmptyConditionsUnconditional:
    """Policy with conditions={} behaves same as no conditions."""

    def test_empty_conditions_allows(self, opa_evaluate):
        policies = [
            allow_policy("empty-cond-allow", ["workflow:read"], conditions={}),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                effective_policies=policies,
            )
        )
        assert result["allow"] is True

    def test_empty_conditions_allows_with_labels(self, opa_evaluate):
        policies = [
            allow_policy("empty-cond-allow", ["workflow:read"], conditions={}),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_labels={"any": "label"},
                effective_policies=policies,
            )
        )
        assert result["allow"] is True


class TestAuthenticatedGroupEscalation:
    """When admin policies are in effective_policies, all actions allowed."""

    @pytest.mark.parametrize(
        ("action", "resource_type"),
        [
            ("create", "policy"),
            ("delete", "workflow"),
            ("delete", "project"),
        ],
        ids=["policy:create", "workflow:delete", "project:delete"],
    )
    def test_authenticated_group_escalation(self, opa_evaluate, action: str, resource_type: str):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("admin"),
            )
        )
        assert result["allow"] is True
