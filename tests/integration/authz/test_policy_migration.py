"""Integration tests for the route → policy migration pipeline.

Tests here assert invariants against the real production migrations directory.
Generator/scanner/route unit tests live in tests/unit/authz/test_policy_migration.py.
"""

from __future__ import annotations

from nexus.authz.migration_scanner import find_untracked_policies
from nexus.authz.role_conventions import EXTRA_POLICIES_REGISTRY, PolicyInfo


class TestBuiltinPoliciesRegistry:
    """Verify EXTRA_POLICIES_REGISTRY additions are detected by the migration pipeline."""

    def test_registry_addition_detected_as_untracked(self) -> None:
        """Adding a policy to EXTRA_POLICIES_REGISTRY is detected as untracked."""
        new_policy = PolicyInfo("sentinel-resource", "read", roles=("admin",))
        augmented = [*EXTRA_POLICIES_REGISTRY, new_policy]

        untracked = find_untracked_policies(augmented)

        assert any(p.name == new_policy.name for p in untracked)
