"""Unit tests for NexusWorkflow execution engine — graph traversal (task 6.3).

Tests cover:
- Linear execution (trigger -> A -> B sequential)
- Fan-out (trigger -> A + B concurrent)
- Fan-in with converge (trigger -> A + B -> converge -> C)
- Error handling (failed node marks downstream as skipped)

All tests mock Temporal's workflow module to avoid needing a running server.
"""

import asyncio
from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from nexus.workflows.utils.namespace_resolver import NamespaceResolver
from nexus.workflows.workflow_engine.dynamic_workflow import NexusWorkflow
from nexus.workflows.workflow_engine.graph import ActivityNode, WorkflowGraph
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
    wf.pre_resolved_outputs = {}
    wf.stop_after_nodes = set()
    return wf


def _build_linear_graph() -> WorkflowGraph:
    """Build: trigger -> node_a -> node_b (linear chain)."""
    backend = InMemoryGraphBackend()
    backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
    backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {"lang": "python"}})
    backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {"lang": "python"}})
    backend.add_edge("trigger", "node_a", None)
    backend.add_edge("node_a", "node_b", None)
    return WorkflowGraph(backend)


def _build_fanout_graph() -> WorkflowGraph:
    """Build: trigger -> node_a + node_b (concurrent fan-out)."""
    backend = InMemoryGraphBackend()
    backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
    backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
    backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
    backend.add_edge("trigger", "node_a", None)
    backend.add_edge("trigger", "node_b", None)
    return WorkflowGraph(backend)


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


def _run_schedule_successors(
    wf: NexusWorkflow,
    completed_node_id: str,
    graph: WorkflowGraph,
    pending: dict[str, asyncio.Task[Any]],
) -> None:
    """Run _schedule_successors in a fresh event loop, cleaning up tasks after."""
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(wf._schedule_successors(completed_node_id, graph, pending))
    finally:
        for task in pending.values():
            task.cancel()
        loop.close()


async def _async_handle_converge_wait(
    wf: NexusWorkflow,
    converge_node: ActivityNode,
    graph: WorkflowGraph,
) -> None:
    """Call _handle_converge_wait inside an event loop (needed for asyncio.create_task)."""
    wf._handle_converge_wait(converge_node.id, converge_node, graph)


# ---------------------------------------------------------------------------
# Tests: Linear execution
# ---------------------------------------------------------------------------


class TestLinearExecution:
    """Test sequential trigger -> node_a -> node_b execution."""

    def test_schedule_successors_adds_immediate_successor(self) -> None:
        """After trigger completes, node_a should be scheduled."""
        wf = _make_workflow()
        graph = _build_linear_graph()
        wf.resolver.set_namespace("trigger", {"url": "http://example.com"})
        pending: dict[str, asyncio.Task[Any]] = {}

        _run_schedule_successors(wf, "trigger", graph, pending)

        assert "node_a" in pending

    def test_schedule_successors_chains_to_next_node(self) -> None:
        """After node_a completes, node_b should be scheduled."""
        wf = _make_workflow()
        graph = _build_linear_graph()
        wf.resolver.set_namespace("trigger", {"url": "http://example.com"})
        wf.resolver.set_namespace("node_a", {"result": "done"})
        pending: dict[str, asyncio.Task[Any]] = {}

        _run_schedule_successors(wf, "node_a", graph, pending)

        assert "node_b" in pending

    def test_no_successors_scheduled_for_terminal_node(self) -> None:
        """A terminal node (node_b) should not schedule anything."""
        wf = _make_workflow()
        graph = _build_linear_graph()
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {})
        wf.resolver.set_namespace("node_b", {"final": True})
        pending: dict[str, asyncio.Task[Any]] = {}

        _run_schedule_successors(wf, "node_b", graph, pending)

        assert len(pending) == 0


# ---------------------------------------------------------------------------
# Tests: Fan-out (concurrent execution)
# ---------------------------------------------------------------------------


class TestFanOutExecution:
    """Test concurrent execution when trigger fans out to multiple nodes."""

    def test_fanout_schedules_both_successors(self) -> None:
        """Trigger with two outgoing edges should schedule both nodes."""
        wf = _make_workflow()
        graph = _build_fanout_graph()
        wf.resolver.set_namespace("trigger", {"input": "data"})
        pending: dict[str, asyncio.Task[Any]] = {}

        _run_schedule_successors(wf, "trigger", graph, pending)

        assert "node_a" in pending
        assert "node_b" in pending

    def test_fanout_does_not_duplicate_pending_tasks(self) -> None:
        """Already-pending nodes should not be re-scheduled."""
        wf = _make_workflow()
        graph = _build_fanout_graph()
        wf.resolver.set_namespace("trigger", {})
        mock_task = MagicMock(spec=asyncio.Task)
        pending: dict[str, asyncio.Task[Any]] = {"node_a": mock_task}

        _run_schedule_successors(wf, "trigger", graph, pending)

        assert pending["node_a"] is mock_task
        assert "node_b" in pending


# ---------------------------------------------------------------------------
# Tests: Fan-in with converge
# ---------------------------------------------------------------------------


class TestFanInConverge:
    """Test converge node waits for all predecessors."""

    def test_converge_not_scheduled_when_one_predecessor_incomplete(self) -> None:
        """Converge should not be scheduled until all predecessors complete."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        pending: dict[str, asyncio.Task[Any]] = {}

        _run_schedule_successors(wf, "node_a", graph, pending)

        assert "converge_node" not in pending

    def test_converge_scheduled_when_all_predecessors_complete(self) -> None:
        """Converge should be scheduled once all predecessors have completed."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        wf.resolver.set_namespace("node_b", {"result": "b_done"})
        pending: dict[str, asyncio.Task[Any]] = {}

        _run_schedule_successors(wf, "node_b", graph, pending)

        assert "converge_node" in pending

    def test_converge_scheduled_when_predecessor_skipped(self) -> None:
        """Converge is ready if a predecessor is skipped."""
        wf = _make_workflow(skipped_nodes={"node_b"})
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        pending: dict[str, asyncio.Task[Any]] = {}

        _run_schedule_successors(wf, "node_a", graph, pending)

        assert "converge_node" in pending

    def test_handle_converge_wait_starts_timeout_handler(self) -> None:
        """A converge node with a timeout config should start a background handler."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")
        converge_node.config["timeout"] = 10

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_async_handle_converge_wait(wf, converge_node, graph))
            assert "converge_node" in wf._timeout_tasks
        finally:
            wf._timeout_tasks["converge_node"].cancel()
            loop.close()

    def test_handle_converge_wait_skips_duplicate_handler(self) -> None:
        """A second call for the same node should not start another handler."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")
        converge_node.config["timeout"] = 10

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_async_handle_converge_wait(wf, converge_node, graph))
            first_task = wf._timeout_tasks["converge_node"]
            loop.run_until_complete(_async_handle_converge_wait(wf, converge_node, graph))
            assert wf._timeout_tasks["converge_node"] is first_task
        finally:
            first_task.cancel()
            loop.close()

    def test_handle_converge_wait_no_timeout_config(self) -> None:
        """A converge node without timeout config should not start a handler."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")

        wf._handle_converge_wait("converge_node", converge_node, graph)

        assert "converge_node" not in wf._timeout_tasks

    def test_process_pending_tasks_runs_timed_out_converge_node(self) -> None:
        """Main loop should schedule and execute converge nodes flagged by timeout handlers."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        wf.resolver.set_namespace("node_b", {"result": "b_done"})

        # Simulate a timeout handler having fired
        wf._timed_out_converge_nodes.add("converge_node")

        converge_output = {"status": "completed", "merged": True}
        with patch.object(wf, "_execute_node", new_callable=AsyncMock, return_value=converge_output):
            pending: dict[str, asyncio.Task[Any]] = {}
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(wf._process_pending_tasks(pending, graph))
            finally:
                for task in pending.values():
                    task.cancel()
                loop.close()

        assert len(wf._timed_out_converge_nodes) == 0
        assert wf.resolver.get_namespace("converge_node") == converge_output

    def test_converge_timeout_handler_exception_signals_main_loop(self) -> None:
        """If the timeout handler raises, the node should be marked failed AND signaled."""
        wf = _make_workflow()
        graph = _build_fanin_graph()

        # Simulate _skip_incomplete_predecessors raising
        with patch.object(wf, "_skip_incomplete_predecessors", side_effect=RuntimeError("graph error")):
            loop = asyncio.new_event_loop()
            try:
                # Run the handler directly — it should catch the exception
                loop.run_until_complete(wf._converge_timeout_handler("converge_node", graph, timeout_seconds=0.001))
            finally:
                loop.close()

        assert "converge_node" in wf.failed_nodes
        assert "converge_node" in wf._timed_out_converge_nodes


# ---------------------------------------------------------------------------
# Tests: Error handling (failed node marks downstream as skipped)
# ---------------------------------------------------------------------------


class TestErrorHandlingDownstreamSkipping:
    """Test that a failed node causes downstream nodes to be marked skipped."""

    def test_downstream_of_failed_node_skipped(self) -> None:
        wf = _make_workflow(failed_nodes={"node_a": "ValueError: bad"})
        graph = _build_linear_graph()
        wf._mark_downstream_as_skipped("node_a", graph)
        assert "node_b" in wf.skipped_nodes

    def test_failed_node_not_in_skipped_nodes(self) -> None:
        wf = _make_workflow(failed_nodes={"node_a": "RuntimeError: crash"})
        graph = _build_linear_graph()
        wf._mark_downstream_as_skipped("node_a", graph)
        assert "node_a" not in wf.skipped_nodes
        assert "node_a" in wf.failed_nodes

    def test_mark_remaining_unreachable_after_failure(self) -> None:
        wf = _make_workflow(failed_nodes={"node_a": "Error: x"})
        wf.resolver.set_namespace("trigger", {"data": "input"})
        wf.resolver.set_namespace("node_a", {"status": "failed", "error": "Error: x"})
        graph = _build_linear_graph()
        wf._mark_remaining_unreachable_nodes(graph)
        assert "node_b" in wf.skipped_nodes
