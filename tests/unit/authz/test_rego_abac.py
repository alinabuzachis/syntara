"""Group 5: ABAC Conditions — label-based conditional access."""

from tests.unit.authz.conftest import allow_policy, build_opa_input, deny_policy, policies_for_role


class TestResourceLabelConditions:
    """Allow workflow:read only when team=platform."""

    def test_read_team_platform_allowed(self, opa_evaluate):
        policies = [
            allow_policy(
                "only-platform-read",
                ["workflow:read"],
                conditions={"resource_labels": {"team": "platform"}},
            ),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_labels={"team": "platform"},
                effective_policies=policies,
            )
        )
        assert result["allow"] is True

    def test_read_team_infra_denied(self, opa_evaluate):
        policies = [
            allow_policy(
                "only-platform-read",
                ["workflow:read"],
                conditions={"resource_labels": {"team": "platform"}},
            ),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                resource_labels={"team": "infra"},
                effective_policies=policies,
            )
        )
        assert result["allow"] is False

    def test_read_no_labels_denied(self, opa_evaluate):
        policies = [
            allow_policy(
                "only-platform-read",
                ["workflow:read"],
                conditions={"resource_labels": {"team": "platform"}},
            ),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="workflow",
                effective_policies=policies,
            )
        )
        assert result["allow"] is False


class TestUserLabelConditions:
    """Allow workflow:delete only when user level=senior."""

    def test_senior_user_allowed(self, opa_evaluate):
        policies = [
            allow_policy(
                "senior-delete",
                ["workflow:delete"],
                conditions={"user_labels": {"level": "senior"}},
            ),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="delete",
                resource_type="workflow",
                user_labels={"level": "senior"},
                effective_policies=policies,
            )
        )
        assert result["allow"] is True

    def test_junior_user_denied(self, opa_evaluate):
        policies = [
            allow_policy(
                "senior-delete",
                ["workflow:delete"],
                conditions={"user_labels": {"level": "senior"}},
            ),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="delete",
                resource_type="workflow",
                user_labels={"level": "junior"},
                effective_policies=policies,
            )
        )
        assert result["allow"] is False


class TestGroupLabelConditions:
    """Allow execution:run only when group tier=premium."""

    def test_premium_group_allowed(self, opa_evaluate):
        policies = [
            allow_policy(
                "premium-run",
                ["execution:run"],
                conditions={"group_labels": {"tier": "premium"}},
            ),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="run",
                resource_type="execution",
                groups=[{"name": "premium-team", "labels": {"tier": "premium"}}],
                effective_policies=policies,
            )
        )
        assert result["allow"] is True

    def test_basic_group_denied(self, opa_evaluate):
        policies = [
            allow_policy(
                "premium-run",
                ["execution:run"],
                conditions={"group_labels": {"tier": "premium"}},
            ),
        ]
        result = opa_evaluate(
            build_opa_input(
                action="run",
                resource_type="execution",
                groups=[{"name": "basic-team", "labels": {"tier": "basic"}}],
                effective_policies=policies,
            )
        )
        assert result["allow"] is False


class TestResourceLabelsNotViaDeny:
    """Allow workflow:delete via admin role + deny when status=archived."""

    _DENY_ARCHIVED = deny_policy(
        "deny-archived-delete",
        ["workflow:delete"],
        conditions={"resource_labels": {"status": "archived"}},
    )

    def test_delete_active_allowed(self, opa_evaluate):
        policies = [*policies_for_role("admin"), self._DENY_ARCHIVED]
        result = opa_evaluate(
            build_opa_input(
                action="delete",
                resource_type="workflow",
                resource_labels={"status": "active"},
                effective_policies=policies,
            )
        )
        assert result["allow"] is True

    def test_delete_archived_denied(self, opa_evaluate):
        policies = [*policies_for_role("admin"), self._DENY_ARCHIVED]
        result = opa_evaluate(
            build_opa_input(
                action="delete",
                resource_type="workflow",
                resource_labels={"status": "archived"},
                effective_policies=policies,
            )
        )
        assert result["allow"] is False
