"""Central registries for built-in policies and roles.

``PolicyInfo`` captures ``(resource, action, scope)`` plus the built-in
roles the policy is assigned to.  ``EXTRA_POLICIES_REGISTRY`` is the
authoritative list of policies that cannot be discovered from route
``PermissionChecker`` declarations (self-scoped, ProjectScopeFilter-only,
or inline checks).

``RoleInfo`` describes a system role; ``BUILTIN_ROLES_REGISTRY`` is the
single source of truth for which roles exist.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class PolicyInfo:
    """Canonical description of one built-in policy."""

    resource: str
    action: str
    scope: str = "any"
    roles: tuple[str, ...] = field(default=(), compare=False, hash=False)

    @property
    def name(self) -> str:
        """Canonical 3-part policy name."""
        return f"{self.resource}:{self.action}:{self.scope}"

    @property
    def description(self) -> str:
        """Human-readable description."""
        scope_label = "own" if self.scope == "self" else self.scope
        action_label = self.action.capitalize()
        return f"{action_label} {scope_label} {self.resource}"

    @property
    def statements(self) -> list[dict[str, object]]:
        """OPA policy statement list."""
        return [
            {
                "effect": "allow",
                "actions": [f"{self.resource}:{self.action}"],
                "scope": self.scope,
            }
        ]

    @classmethod
    def from_name(cls, name: str) -> PolicyInfo:
        """Parse a canonical policy name (``resource:action:scope``) into a PolicyInfo."""
        parts = name.split(":")
        if len(parts) == 3:  # noqa: PLR2004
            return cls(resource=parts[0], action=parts[1], scope=parts[2])
        if len(parts) == 2:  # noqa: PLR2004
            return cls(resource=parts[0], action=parts[1])
        msg = f"Invalid policy name: {name!r}"
        raise ValueError(msg)


@dataclass(frozen=True)
class RoleInfo:
    """Canonical description of one system role."""

    name: str
    description: str
    is_builtin: bool = True


# ---------------------------------------------------------------------------
# Central registry of all system roles.
# Adding a RoleInfo here is the only step required to declare a new role —
# the Alembic hook will auto-generate the migration on the next
# ``alembic revision --autogenerate`` run.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Central registry of policies not discoverable from route PermissionCheckers.
# Adding a PolicyInfo here is sufficient to declare a new non-route policy —
# the Alembic hook and seeder both consume this via discover_all_policies().
# ---------------------------------------------------------------------------
EXTRA_POLICIES_REGISTRY: list[PolicyInfo] = [
    PolicyInfo("user", "read", scope="self", roles=("admin", "user", "default")),
    PolicyInfo("user", "update", scope="self", roles=("admin", "user", "default")),
    PolicyInfo("policy", "read", roles=("admin", "auditor")),
    PolicyInfo("role", "read", roles=("admin", "auditor")),
    # approval:read has no active router yet; kept here so it remains discoverable.
    PolicyInfo(
        "approval",
        "read",
        roles=("admin", "auditor", "user", "project-admin", "project-user", "project-auditor"),
    ),
]


BUILTIN_ROLES_REGISTRY: list[RoleInfo] = [
    RoleInfo("admin", "Full access to all resources"),
    RoleInfo("auditor", "Read-only access with audit log visibility"),
    RoleInfo("user", "Standard user with CRUD on own resources"),
    RoleInfo(
        "project-admin",
        "Full access to a project and its resources, including role management",
    ),
    RoleInfo(
        "project-user",
        "Standard access within a project (CRUD workflows, run executions)",
    ),
    RoleInfo("project-auditor", "Read-only access within a project"),
    RoleInfo(
        "default",
        "Default permissions granted to all authenticated users via the 'authenticated' group",
        is_builtin=False,
    ),
]
