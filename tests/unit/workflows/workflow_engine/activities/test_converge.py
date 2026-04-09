"""Tests for converge activity."""

from typing import Any

import pytest

from nexus.workflows.workflow_engine.activities.converge import converge


class TestConvergeMergeResults:
    """Merging results from multiple predecessors."""

    @pytest.mark.asyncio
    async def test_two_predecessors_merged(self) -> None:
        predecessors: dict[str, dict[str, Any]] = {
            "node_a": {"value": 1},
            "node_b": {"value": 2},
        }
        result = await converge({}, None, predecessors)
        assert result["output"]["status"] == "completed"
        assert result["output"]["branch_count"] == 2
        assert result["output"]["completed_count"] == 2
        assert set(result["output"]["completed_branch_node_ids"]) == {"node_a", "node_b"}

    @pytest.mark.asyncio
    async def test_single_predecessor(self) -> None:
        predecessors: dict[str, dict[str, Any]] = {"only_node": {"x": 10}}
        result = await converge({}, None, predecessors)
        assert result["output"]["branch_count"] == 1
        assert result["output"]["completed_branch_node_ids"] == ["only_node"]


class TestConvergeEmptyPredecessors:
    """Empty predecessor results."""

    @pytest.mark.asyncio
    async def test_empty_predecessors(self) -> None:
        result = await converge({}, None, {})
        assert result["output"]["status"] == "completed"
        assert result["output"]["branch_count"] == 0
        assert result["output"]["completed_count"] == 0
        assert result["output"]["completed_branch_node_ids"] == []


class TestConvergeOutputMapping:
    """Output mapping integration."""

    @pytest.mark.asyncio
    async def test_none_output_config_returns_full_result(self) -> None:
        result = await converge({}, None, {"a": {"v": 1}})
        assert "branch_count" in result["output"]
        assert "completed_branch_node_ids" in result["output"]

    @pytest.mark.asyncio
    async def test_empty_output_config_suppresses_fields(self) -> None:
        result = await converge({}, {}, {"a": {"v": 1}})
        assert result["output"] == {"status": "completed"}

    @pytest.mark.asyncio
    async def test_field_mapping_extracts_count(self) -> None:
        result = await converge(
            {},
            {"count": "${result.branch_count}"},
            {"a": {}, "b": {}},
        )
        assert result["output"]["count"] == 2
        assert "branch_count" not in result["output"]

    @pytest.mark.asyncio
    async def test_no_control_in_result(self) -> None:
        result = await converge({}, None, {})
        assert "control" not in result


class TestConvergeManyPredecessors:
    """Converge handles many predecessors correctly."""

    @pytest.mark.asyncio
    async def test_five_predecessors_counted(self) -> None:
        predecessors = {f"node_{i}": {"val": i} for i in range(5)}
        result = await converge({}, None, predecessors)
        assert result["output"]["branch_count"] == 5
        assert result["output"]["completed_count"] == 5
        assert len(result["output"]["completed_branch_node_ids"]) == 5


class TestConvergePredecessorValuesNotLeaked:
    """Predecessor result values are not included in converge output."""

    @pytest.mark.asyncio
    async def test_predecessor_values_not_in_output(self) -> None:
        predecessors = {"node_a": {"secret": "data"}}
        result = await converge({}, None, predecessors)
        assert "secret" not in result["output"]
        assert "node_a" not in result["output"]

    @pytest.mark.asyncio
    async def test_input_config_is_ignored(self) -> None:
        result = await converge({"strategy": "any", "extra": True}, None, {"a": {}})
        assert result["output"]["status"] == "completed"
        assert result["output"]["branch_count"] == 1
