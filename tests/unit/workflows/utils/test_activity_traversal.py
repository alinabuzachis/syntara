"""Unit tests for activity traversal utilities."""

from typing import Any

from nexus.workflows.utils.activity_traversal import (
    build_branch_head_map,
    collect_branch_activity_ids,
    traverse_activities,
)


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


class TestBuildBranchHeadMap:
    """Test build_branch_head_map function."""

    def test_simple_condition_mapping(self) -> None:
        """Test mapping activities in simple condition branches."""
        activities = [
            {
                "id": "cond1",
                "type": "condition",
                "then": [{"id": "then_task", "type": "task"}],
                "else": [{"id": "else_task", "type": "task"}],
            }
        ]

        branch_map = build_branch_head_map(activities)

        assert "then_task" in branch_map
        assert branch_map["then_task"]["condition_id"] == "cond1"
        assert branch_map["then_task"]["branch"] == "then"

        assert "else_task" in branch_map
        assert branch_map["else_task"]["condition_id"] == "cond1"
        assert branch_map["else_task"]["branch"] == "else"

    def test_nested_activities_in_branches(self) -> None:
        """Test mapping nested activities within branches."""
        activities = [
            {
                "id": "cond1",
                "type": "condition",
                "then": [
                    {
                        "id": "seq1",
                        "type": "sequence",
                        "steps": [
                            {"id": "step1", "type": "task"},
                            {"id": "step2", "type": "task"},
                        ],
                    }
                ],
                "else": [{"id": "else_task", "type": "task"}],
            }
        ]

        branch_map = build_branch_head_map(activities)

        assert "step1" in branch_map
        assert branch_map["step1"]["condition_id"] == "cond1"
        assert branch_map["step1"]["branch"] == "then"

        assert "step2" in branch_map
        assert branch_map["step2"]["condition_id"] == "cond1"
        assert branch_map["step2"]["branch"] == "then"

    def test_nested_conditions(self) -> None:
        """Test mapping nested condition structures."""
        activities = [
            {
                "id": "cond1",
                "type": "condition",
                "then": [
                    {
                        "id": "cond2",
                        "type": "condition",
                        "then": [{"id": "inner_then", "type": "task"}],
                        "else": [{"id": "inner_else", "type": "task"}],
                    }
                ],
                "else": [{"id": "outer_else", "type": "task"}],
            }
        ]

        branch_map = build_branch_head_map(activities)

        assert "cond2" in branch_map
        assert branch_map["cond2"]["condition_id"] == "cond1"
        assert branch_map["cond2"]["branch"] == "then"

        assert "inner_then" in branch_map
        assert branch_map["inner_then"]["condition_id"] == "cond2"
        assert branch_map["inner_then"]["branch"] == "then"

        assert "inner_else" in branch_map
        assert branch_map["inner_else"]["condition_id"] == "cond2"
        assert branch_map["inner_else"]["branch"] == "else"

        assert "outer_else" in branch_map
        assert branch_map["outer_else"]["condition_id"] == "cond1"
        assert branch_map["outer_else"]["branch"] == "else"

    def test_condition_with_only_then_branch(self) -> None:
        """Test condition with only then branch (no else)."""
        activities = [
            {
                "id": "cond1",
                "type": "condition",
                "then": [{"id": "then_task", "type": "task"}],
            }
        ]

        branch_map = build_branch_head_map(activities)

        assert "then_task" in branch_map
        assert branch_map["then_task"]["branch"] == "then"
        assert len(branch_map) == 1

    def test_condition_with_only_else_branch(self) -> None:
        """Test condition with only else branch (no then)."""
        activities = [
            {
                "id": "cond1",
                "type": "condition",
                "else": [{"id": "else_task", "type": "task"}],
            }
        ]

        branch_map = build_branch_head_map(activities)

        assert "else_task" in branch_map
        assert branch_map["else_task"]["branch"] == "else"
        assert len(branch_map) == 1

    def test_non_condition_activities_not_mapped(self) -> None:
        """Test that non-condition activities are not in the map."""
        activities = [
            {"id": "task1", "type": "task"},
            {
                "id": "cond1",
                "type": "condition",
                "then": [{"id": "then_task", "type": "task"}],
            },
        ]

        branch_map = build_branch_head_map(activities)

        assert "task1" not in branch_map
        assert "then_task" in branch_map

    def test_empty_activities_list(self) -> None:
        """Test empty activities list returns empty map."""
        activities: list[dict[str, Any]] = []

        branch_map = build_branch_head_map(activities)

        assert branch_map == {}

    def test_condition_def_preserved(self) -> None:
        """Test that condition definition is preserved in map."""
        activities = [
            {
                "id": "cond1",
                "type": "condition",
                "condition": "$.value > 10",
                "then": [{"id": "then_task", "type": "task"}],
                "else": [{"id": "else_task", "type": "task"}],
            }
        ]

        branch_map = build_branch_head_map(activities)

        assert "condition_def" in branch_map["then_task"]
        assert branch_map["then_task"]["condition_def"]["condition"] == "$.value > 10"


class TestCollectBranchActivityIds:
    """Test collect_branch_activity_ids function."""

    def test_simple_branch_with_tasks(self) -> None:
        """Test collecting IDs from simple branch with tasks."""
        branch = [
            {"id": "task1", "type": "task"},
            {"id": "task2", "type": "task"},
        ]

        ids = collect_branch_activity_ids(branch)

        assert ids == ["task1", "task2"]

    def test_branch_with_sequence(self) -> None:
        """Test collecting IDs from branch with sequence."""
        branch = [
            {
                "id": "seq1",
                "type": "sequence",
                "steps": [
                    {"id": "step1", "type": "task"},
                    {"id": "step2", "type": "task"},
                ],
            }
        ]

        ids = collect_branch_activity_ids(branch)

        assert ids == ["step1", "step2"]

    def test_branch_with_parallel(self) -> None:
        """Test collecting IDs from branch with parallel."""
        branch = [
            {
                "id": "par1",
                "type": "parallel",
                "branches": [
                    {"id": "branch1", "type": "task"},
                    {"id": "branch2", "type": "task"},
                ],
            }
        ]

        ids = collect_branch_activity_ids(branch)

        assert ids == ["branch1", "branch2"]

    def test_branch_with_nested_condition(self) -> None:
        """Test collecting IDs from branch with nested condition."""
        branch = [
            {
                "id": "cond1",
                "type": "condition",
                "then": [{"id": "then_task", "type": "task"}],
                "else": [{"id": "else_task", "type": "task"}],
            }
        ]

        ids = collect_branch_activity_ids(branch)

        assert set(ids) == {"cond1", "then_task", "else_task"}

    def test_branch_with_loop(self) -> None:
        """Test collecting IDs from branch with loop."""
        branch = [
            {
                "id": "loop1",
                "type": "loop",
                "loop": {
                    "count": 3,
                    "do": [
                        {"id": "loop_task1", "type": "task"},
                        {"id": "loop_task2", "type": "task"},
                    ],
                },
            }
        ]

        ids = collect_branch_activity_ids(branch)

        assert ids == ["loop_task1", "loop_task2"]

    def test_branch_with_deeply_nested_structure(self) -> None:
        """Test collecting IDs from deeply nested branch structure."""
        branch = [
            {
                "id": "seq1",
                "type": "sequence",
                "steps": [
                    {"id": "task1", "type": "task"},
                    {
                        "id": "par1",
                        "type": "parallel",
                        "branches": [
                            {"id": "branch1", "type": "task"},
                            {
                                "id": "cond1",
                                "type": "condition",
                                "then": [{"id": "nested_then", "type": "task"}],
                            },
                        ],
                    },
                ],
            }
        ]

        ids = collect_branch_activity_ids(branch)

        assert set(ids) == {"task1", "branch1", "cond1", "nested_then"}

    def test_empty_branch(self) -> None:
        """Test collecting IDs from empty branch."""
        branch: list[dict[str, Any]] = []

        ids = collect_branch_activity_ids(branch)

        assert ids == []

    def test_branch_excludes_container_activities(self) -> None:
        """Test that container activities (sequence, parallel, loop) are excluded."""
        branch = [
            {"id": "seq1", "type": "sequence", "steps": []},
            {"id": "par1", "type": "parallel", "branches": []},
            {"id": "loop1", "type": "loop", "loop": {"count": 1, "do": []}},
            {"id": "task1", "type": "task"},
            {"id": "cond1", "type": "condition"},
        ]

        ids = collect_branch_activity_ids(branch)

        assert set(ids) == {"task1", "cond1"}

    def test_branch_includes_activities_without_explicit_type(self) -> None:
        """Test that activities without explicit type field are included."""
        branch = [
            {"id": "implicit_task1"},
            {"id": "explicit_task", "type": "task"},
        ]

        ids = collect_branch_activity_ids(branch)

        assert set(ids) == {"implicit_task1", "explicit_task"}
