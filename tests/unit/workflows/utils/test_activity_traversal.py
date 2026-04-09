"""Unit tests for activity traversal utilities."""

from typing import Any

from nexus.workflows.utils.activity_traversal import traverse_activities


class TestTraverseActivities:
    """Test traverse_activities function."""

    def test_traverse_flat_activities(self) -> None:
        """Test traversing flat list of activities."""
        activities = [
            {"id": "task1", "type": "task"},
            {"id": "task2", "type": "task"},
            {"id": "task3", "type": "task"},
        ]

        results: list[str] = []

        def collect_ids(activity: dict[str, str], path: str) -> str | None:
            if "id" in activity:
                return str(activity["id"])
            return None

        results = traverse_activities(activities, collect_ids)

        assert results == ["task1", "task2", "task3"]

    def test_traverse_sequence_with_steps(self) -> None:
        """Test traversing sequence activity with nested steps."""
        activities = [
            {
                "id": "seq1",
                "type": "sequence",
                "steps": [
                    {"id": "step1", "type": "task"},
                    {"id": "step2", "type": "task"},
                ],
            }
        ]

        results: list[str] = []

        def collect_ids(activity: dict[str, Any], path: str) -> str | None:
            if "id" in activity:
                return str(activity["id"])
            return None

        results = traverse_activities(activities, collect_ids)

        assert results == ["seq1", "step1", "step2"]

    def test_traverse_parallel_with_branches(self) -> None:
        """Test traversing parallel activity with branches."""
        activities = [
            {
                "id": "par1",
                "type": "parallel",
                "branches": [
                    {"id": "branch1", "type": "task"},
                    {"id": "branch2", "type": "task"},
                ],
            }
        ]

        results = traverse_activities(activities, lambda act, _: act.get("id"))

        assert results == ["par1", "branch1", "branch2"]

    def test_traverse_condition_with_then_else(self) -> None:
        """Test traversing condition activity with then/else branches."""
        activities = [
            {
                "id": "cond1",
                "type": "condition",
                "then": [{"id": "then_task", "type": "task"}],
                "else": [{"id": "else_task", "type": "task"}],
            }
        ]

        results = traverse_activities(activities, lambda act, _: act.get("id"))

        assert results == ["cond1", "then_task", "else_task"]

    def test_traverse_loop_with_do(self) -> None:
        """Test traversing loop activity with do block."""
        activities = [
            {
                "id": "loop1",
                "type": "loop",
                "loop": {
                    "count": 5,
                    "do": [
                        {"id": "loop_task1", "type": "task"},
                        {"id": "loop_task2", "type": "task"},
                    ],
                },
            }
        ]

        results = traverse_activities(activities, lambda act, _: act.get("id"))

        assert results == ["loop1", "loop_task1", "loop_task2"]

    def test_traverse_deeply_nested_structure(self) -> None:
        """Test traversing deeply nested activity structure."""
        activities = [
            {
                "id": "seq1",
                "type": "sequence",
                "steps": [
                    {"id": "task1", "type": "task"},
                    {
                        "id": "cond1",
                        "type": "condition",
                        "then": [
                            {
                                "id": "par1",
                                "type": "parallel",
                                "branches": [
                                    {"id": "branch1", "type": "task"},
                                    {"id": "branch2", "type": "task"},
                                ],
                            }
                        ],
                        "else": [{"id": "else_task", "type": "task"}],
                    },
                ],
            }
        ]

        results = traverse_activities(activities, lambda act, _: act.get("id"))

        assert results == ["seq1", "task1", "cond1", "par1", "branch1", "branch2", "else_task"]

    def test_traverse_callback_with_path_tracking(self) -> None:
        """Test callback receives correct path for each activity."""
        activities = [
            {
                "id": "seq1",
                "type": "sequence",
                "steps": [{"id": "step1", "type": "task"}],
            }
        ]

        paths_collected: list[str] = []

        def collect_paths(activity: dict[str, Any], path: str) -> None:
            paths_collected.append(path)

        traverse_activities(activities, collect_paths)

        assert paths_collected == ["workflow.activities[0]", "workflow.activities[0].steps.activities[0]"]

    def test_traverse_callback_returns_none_skipped(self) -> None:
        """Test activities where callback returns None are not in results."""
        activities = [
            {"id": "task1", "type": "task"},
            {"id": "task2", "type": "task"},
            {"id": "task3", "type": "task"},
        ]

        def collect_even_ids(activity: dict[str, Any], path: str) -> str | None:
            activity_id = str(activity.get("id", ""))
            if "2" in activity_id:
                return activity_id
            return None

        results = traverse_activities(activities, collect_even_ids)

        assert results == ["task2"]

    def test_traverse_empty_activities_list(self) -> None:
        """Test traversing empty activities list."""
        activities: list[dict[str, Any]] = []

        results = traverse_activities(activities, lambda act, _: act.get("id"))

        assert results == []
