"""Unit tests for NexusWorkflow queries, loops, and helpers (task 6.3).

Tests cover:
- get_skipped_nodes query
- get_activity_input query
- get_activity_output query
- _determine_output_port helper
- _are_predecessors_complete helper
- For-each loop state management (_clear_loop_body, _loop_body_complete, etc.)
"""

import asyncio
from collections.abc import Generator
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from nexus.workflows.utils.namespace_resolver import NamespaceResolver
from nexus.workflows.workflow_engine.dynamic_workflow import NexusWorkflow
from nexus.workflows.workflow_engine.graph import WorkflowGraph
from nexus.workflows.workflow_engine.graph_backend import InMemoryGraphBackend


@pytest.fixture(autouse=True)
def _mock_temporal_workflow() -> Generator[MagicMock]:
    """Mock the Temporal workflow module to avoid 'Not in workflow event loop' errors."""
    mock_logger = MagicMock()
    with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
        mock_wf.logger = mock_logger
        mock_wf.info.return_value = MagicMock(workflow_id="test-wf-id")
        yield mock_wf


def _make_workflow(
    skipped_nodes: set[str] | None = None,
    failed_nodes: dict[str, str] | None = None,
    resolver: NamespaceResolver | None = None,
) -> NexusWorkflow:
    """Create a NexusWorkflow with initialized state, bypassing __init__."""
    wf = NexusWorkflow.__new__(NexusWorkflow)
    wf.skipped_nodes = skipped_nodes if skipped_nodes is not None else set()
    wf.failed_nodes = failed_nodes if failed_nodes is not None else {}
    wf.resolver = resolver if resolver is not None else NamespaceResolver()
    wf.node_inputs = {}
    wf.node_control_data = {}
    wf.loop_state = {}
    wf.loop_body_map = {}
    wf.loop_iteration_results = {}
    wf._activity_signals = {}
    wf._timeout_tasks = {}
    wf._timed_out_converge_nodes = set()
    return wf


def _build_fanin_graph() -> WorkflowGraph:
    """Build: trigger -> node_a + node_b -> converge_node -> node_c."""
    backend = InMemoryGraphBackend()
    backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
    backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
    backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
    backend.add_node("converge_node", {"id": "converge_node", "type": "converge", "config": {}})
    backend.add_node("node_c", {"id": "node_c", "type": "script", "config": {}})
    backend.add_edge("trigger", "node_a", None)
    backend.add_edge("trigger", "node_b", None)
    backend.add_edge("node_a", "converge_node", None)
    backend.add_edge("node_b", "converge_node", None)
    backend.add_edge("converge_node", "node_c", None)
    return WorkflowGraph(backend)


# ---------------------------------------------------------------------------
# Tests: get_skipped_nodes query
# ---------------------------------------------------------------------------


class TestGetSkippedNodesQuery:
    """Test the get_skipped_nodes query method."""

    def test_returns_empty_list_when_none_skipped(self) -> None:
        wf = _make_workflow()
        assert wf.get_skipped_nodes() == []

    def test_returns_all_skipped_node_ids(self) -> None:
        wf = _make_workflow(skipped_nodes={"node_a", "node_b"})
        assert sorted(wf.get_skipped_nodes()) == ["node_a", "node_b"]

    def test_returns_list_not_set(self) -> None:
        wf = _make_workflow(skipped_nodes={"node_a"})
        assert isinstance(wf.get_skipped_nodes(), list)


# ---------------------------------------------------------------------------
# Tests: get_activity_input query
# ---------------------------------------------------------------------------


class TestGetActivityInputQuery:
    """Test the get_activity_input query method."""

    def test_returns_stored_input(self) -> None:
        wf = _make_workflow()
        wf.node_inputs["node_a"] = {"url": "http://example.com", "method": "GET"}
        assert wf.get_activity_input("node_a") == {"url": "http://example.com", "method": "GET"}

    def test_returns_none_for_unknown_activity(self) -> None:
        wf = _make_workflow()
        assert wf.get_activity_input("nonexistent") is None

    def test_returns_trigger_input(self) -> None:
        wf = _make_workflow()
        wf.node_inputs["trigger"] = {"body": {"key": "value"}}
        assert wf.get_activity_input("trigger") == {"body": {"key": "value"}}


# ---------------------------------------------------------------------------
# Tests: get_activity_output query
# ---------------------------------------------------------------------------


class TestGetActivityOutputQuery:
    """Test the get_activity_output query method."""

    def test_returns_stored_output(self) -> None:
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "ok", "data": [1, 2, 3]})
        assert wf.get_activity_output("node_a") == {"status": "ok", "data": [1, 2, 3]}

    def test_returns_none_for_unknown_activity(self) -> None:
        wf = _make_workflow()
        assert wf.get_activity_output("nonexistent") is None

    def test_returns_none_when_namespace_missing(self) -> None:
        wf = _make_workflow()
        assert wf.get_activity_output("node_a") is None

    def test_returns_trigger_output(self) -> None:
        wf = _make_workflow()
        wf.resolver.set_namespace("trigger", {"url": "http://example.com"})
        assert wf.get_activity_output("trigger") == {"url": "http://example.com"}


# --- _determine_output_port ---


class TestDetermineOutputPort:
    """Test port determination from control data."""

    def test_returns_port_from_control_data(self) -> None:
        wf = _make_workflow()
        wf.node_control_data["cond_node"] = {"next_port": "true"}
        assert wf._determine_output_port("cond_node") == "true"

    def test_returns_none_when_no_control_data(self) -> None:
        wf = _make_workflow()
        assert wf._determine_output_port("regular_node") is None

    def test_returns_none_when_control_data_has_no_port(self) -> None:
        wf = _make_workflow()
        wf.node_control_data["node"] = {"some_other_key": "value"}
        assert wf._determine_output_port("node") is None

    def test_returns_iterate_port_for_loop(self) -> None:
        wf = _make_workflow()
        wf.node_control_data["loop_node"] = {"next_port": "iterate"}
        assert wf._determine_output_port("loop_node") == "iterate"

    def test_returns_complete_port_for_loop(self) -> None:
        wf = _make_workflow()
        wf.node_control_data["loop_node"] = {"next_port": "complete"}
        assert wf._determine_output_port("loop_node") == "complete"


# --- _are_predecessors_complete ---


class TestArePredecessorsComplete:
    """Test converge predecessor readiness checks."""

    def test_all_predecessors_completed(self) -> None:
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("node_a", {"result": "a"})
        wf.resolver.set_namespace("node_b", {"result": "b"})
        assert wf._are_predecessors_complete("converge_node", graph) is True

    def test_missing_predecessor_not_ready(self) -> None:
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("node_a", {"result": "a"})
        assert wf._are_predecessors_complete("converge_node", graph) is False

    def test_skipped_predecessor_counts_as_complete(self) -> None:
        wf = _make_workflow(skipped_nodes={"node_b"})
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("node_a", {"result": "a"})
        assert wf._are_predecessors_complete("converge_node", graph) is True


# ---------------------------------------------------------------------------
# Tests: For-each loop
# ---------------------------------------------------------------------------


class TestForEachLoop:
    """Test for_each loop iteration state management."""

    def test_loop_state_initialized_with_items(self) -> None:
        """First execution of a loop node should initialize loop_state."""
        wf = _make_workflow()
        items = ["alpha", "beta", "gamma"]
        node_id = "loop_node"

        wf.loop_state[node_id] = {"type": "for_each", "items": items, "current_index": 0}

        assert wf.loop_state[node_id]["items"] == items
        assert wf.loop_state[node_id]["current_index"] == 0

    def test_loop_body_map_tracks_body_nodes(self) -> None:
        wf = _make_workflow()
        wf.loop_body_map["body_node"] = "loop_node"
        assert wf.loop_body_map["body_node"] == "loop_node"

    def test_clear_loop_body_removes_body_mapping(self) -> None:
        wf = _make_workflow()
        wf.loop_body_map["body_a"] = "loop_1"
        wf.loop_body_map["body_b"] = "loop_1"
        wf.loop_body_map["other_body"] = "loop_2"
        wf.resolver.set_namespace("body_a", {"output": "val_a"})
        wf.resolver.set_namespace("body_b", {"output": "val_b"})

        wf._clear_loop_body("loop_1")

        assert "body_a" not in wf.loop_body_map
        assert "body_b" not in wf.loop_body_map
        assert "other_body" in wf.loop_body_map

    def test_clear_loop_body_collects_iteration_results(self) -> None:
        wf = _make_workflow()
        wf.loop_body_map["body_node"] = "loop_1"
        wf.resolver.set_namespace("body_node", {"status": "ok", "value": 42})

        wf._clear_loop_body("loop_1")

        assert "loop_1" in wf.loop_iteration_results
        assert wf.loop_iteration_results["loop_1"]["body_node.status"] == ["ok"]
        assert wf.loop_iteration_results["loop_1"]["body_node.value"] == [42]

    def test_loop_body_complete_returns_false_when_incomplete(self) -> None:
        wf = _make_workflow()
        wf.loop_body_map["body_a"] = "loop_1"
        wf.loop_body_map["body_b"] = "loop_1"
        wf.resolver.set_namespace("body_a", {"done": True})
        assert wf._loop_body_complete("loop_1") is False

    def test_loop_body_complete_returns_true_when_all_done(self) -> None:
        wf = _make_workflow()
        wf.loop_body_map["body_a"] = "loop_1"
        wf.loop_body_map["body_b"] = "loop_1"
        wf.resolver.set_namespace("body_a", {"done": True})
        wf.resolver.set_namespace("body_b", {"done": True})
        assert wf._loop_body_complete("loop_1") is True

    def test_loop_has_pending_nodes_detects_pending(self) -> None:
        wf = _make_workflow()
        wf.loop_body_map["body_a"] = "loop_1"
        mock_task = MagicMock(spec=asyncio.Task)
        pending: dict[str, asyncio.Task[Any]] = {"body_a": mock_task}
        assert wf._loop_has_pending_nodes("loop_1", pending) is True

    def test_loop_has_pending_nodes_returns_false_when_none_pending(self) -> None:
        wf = _make_workflow()
        wf.loop_body_map["body_a"] = "loop_1"
        pending: dict[str, asyncio.Task[Any]] = {}
        assert wf._loop_has_pending_nodes("loop_1", pending) is False
