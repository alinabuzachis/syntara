"""Unit tests for the Temporal activity registries."""

from typing import ClassVar

from nexus.workflows.workflow_engine.activities.registry import (
    ACTIVITY_REGISTRY,
    BACKGROUND_ACTIVITY_REGISTRY,
)


class TestBackgroundActivityRegistry:
    """BACKGROUND_ACTIVITY_REGISTRY must contain exactly the minimal set needed by built-in workflows."""

    EXPECTED_ACTIVITIES: ClassVar[set[str]] = {
        "register_activity_monitoring",
        "fetch_workflow_runtime_settings",
        "manual_trigger",
        "execute_internal_activity",
    }

    def test_contains_exactly_expected_activities(self) -> None:
        assert set(BACKGROUND_ACTIVITY_REGISTRY.keys()) == self.EXPECTED_ACTIVITIES

    def test_is_strict_subset_of_main_registry(self) -> None:
        """Every background activity must also appear in the main registry."""
        assert BACKGROUND_ACTIVITY_REGISTRY.keys() <= ACTIVITY_REGISTRY.keys()

    def test_does_not_contain_user_executor_activities(self) -> None:
        """User-facing executor activities must not leak into the background registry."""
        user_activities = {"execute_agentic_activity", "execute_script_activity", "execute_http_request_activity"}
        assert BACKGROUND_ACTIVITY_REGISTRY.keys().isdisjoint(user_activities)
