"""Group 1: RBAC Basics — core role-based access control checks."""

import pytest

from tests.unit.authz.conftest import build_opa_input, policies_for_role


class TestAdminFullAccess:
    """Admin role grants access to all resource types."""

    @pytest.mark.parametrize(
        ("action", "resource_type"),
        [
            ("create", "policy"),
            ("delete", "workflow"),
            ("read", "workflow"),
            ("create", "project"),
            ("run", "execution"),
            ("read", "execution"),
            ("delete", "project"),
        ],
        ids=[
            "policy:create",
            "workflow:delete",
            "workflow:read",
            "project:create",
            "execution:run",
            "execution:read",
            "project:delete",
        ],
    )
    def test_admin_full_access(self, opa_evaluate, action: str, resource_type: str):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("admin"),
            )
        )
        assert result["allow"] is True


class TestUserRole:
    """User role grants workflow CRUD + execution but not admin/policy."""

    @pytest.mark.parametrize(
        ("action", "resource_type"),
        [
            ("create", "workflow"),
            ("read", "workflow"),
            ("update", "workflow"),
            ("delete", "workflow"),
            ("run", "execution"),
        ],
        ids=[
            "workflow:create",
            "workflow:read",
            "workflow:update",
            "workflow:delete",
            "execution:run",
        ],
    )
    def test_user_role_allowed_actions(self, opa_evaluate, action: str, resource_type: str):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("user"),
            )
        )
        assert result["allow"] is True

    @pytest.mark.parametrize(
        ("action", "resource_type"),
        [
            ("create", "policy"),
            ("delete", "policy"),
        ],
        ids=["policy:create", "policy:delete"],
    )
    def test_user_role_denied_actions(self, opa_evaluate, action: str, resource_type: str):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("user"),
            )
        )
        assert result["allow"] is False


class TestAuditorRole:
    """Auditor role grants read-only access."""

    @pytest.mark.parametrize(
        ("action", "resource_type"),
        [
            ("read", "workflow"),
            ("read", "execution"),
            ("read", "policy"),
            ("read", "role"),
            ("read", "setting"),
        ],
        ids=[
            "workflow:read",
            "execution:read",
            "policy:read",
            "role:read",
            "setting:read",
        ],
    )
    def test_auditor_read_allowed(self, opa_evaluate, action: str, resource_type: str):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("auditor"),
            )
        )
        assert result["allow"] is True

    @pytest.mark.parametrize(
        ("action", "resource_type"),
        [
            ("create", "workflow"),
            ("update", "workflow"),
            ("delete", "workflow"),
            ("create", "policy"),
            ("run", "execution"),
            ("write", "setting"),
        ],
        ids=[
            "workflow:create",
            "workflow:update",
            "workflow:delete",
            "policy:create",
            "execution:run",
            "setting:write",
        ],
    )
    def test_auditor_write_denied(self, opa_evaluate, action: str, resource_type: str):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("auditor"),
            )
        )
        assert result["allow"] is False


class TestRoleBoundaries:
    """Cross-role boundary checks."""

    def test_user_cannot_read_other_users(self, opa_evaluate):
        """User role has user:read with self scope, so reading another user is denied."""
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="user",
                resource_id="other-user-id",
                user_id="test-user-id",
                effective_policies=policies_for_role("user"),
            )
        )
        assert result["allow"] is False


class TestDefaultRole:
    """Default role (authenticated group) grants minimal permissions."""

    @pytest.mark.parametrize(
        ("action", "resource_type", "expected"),
        [
            ("create", "project", True),
            ("read", "workflow", False),
            ("create", "workflow", False),
            ("create", "policy", False),
        ],
        ids=[
            "project:create-allowed",
            "workflow:read-denied",
            "workflow:create-denied",
            "policy:create-denied",
        ],
    )
    def test_default_role_permissions(
        self,
        opa_evaluate,
        action: str,
        resource_type: str,
        expected: bool,  # noqa: FBT001
    ):
        result = opa_evaluate(
            build_opa_input(
                action=action,
                resource_type=resource_type,
                effective_policies=policies_for_role("default"),
            )
        )
        assert result["allow"] is expected

    def test_default_role_self_read(self, opa_evaluate):
        """Default role allows user:read when resource_id matches user_id (self scope)."""
        user_id = "self-user-uuid"
        result = opa_evaluate(
            build_opa_input(
                action="read",
                resource_type="user",
                resource_id=user_id,
                user_id=user_id,
                effective_policies=policies_for_role("default"),
            )
        )
        assert result["allow"] is True

    def test_default_role_self_update(self, opa_evaluate):
        """Default role allows user:update when resource_id matches user_id (self scope)."""
        user_id = "self-user-uuid"
        result = opa_evaluate(
            build_opa_input(
                action="update",
                resource_type="user",
                resource_id=user_id,
                user_id=user_id,
                effective_policies=policies_for_role("default"),
            )
        )
        assert result["allow"] is True
