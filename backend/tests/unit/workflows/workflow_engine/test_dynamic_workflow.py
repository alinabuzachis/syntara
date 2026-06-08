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
    wf._timeout_tasks = {}
    wf._timed_out_converge_nodes = set()
    wf._detached_nodes = set()
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
    pending_tasks: dict[str, asyncio.Task[Any]] | None = None,
) -> None:
    """Call _handle_converge_wait inside an event loop (needed for asyncio.create_task)."""
    wf._handle_converge_wait(converge_node.id, converge_node, graph, pending_tasks or {})


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
        """A converge node with a timeout setting should start a background handler."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")
        converge_node.settings.timeout = 10

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
        converge_node.settings.timeout = 10

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

        wf._handle_converge_wait("converge_node", converge_node, graph, {})

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

    def test_converge_timeout_handler_exception_marks_failed_not_scheduled(self) -> None:
        """If the timeout handler raises, the node should be marked failed but NOT scheduled."""
        wf = _make_workflow()
        graph = _build_fanin_graph()

        with patch.object(wf, "_skip_incomplete_predecessors", side_effect=RuntimeError("graph error")):
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    wf._converge_timeout_handler("converge_node", graph, timeout_seconds=0.001, pending_tasks={})
                )
            finally:
                loop.close()

        assert "converge_node" in wf.failed_nodes
        assert "converge_node" not in wf._timed_out_converge_nodes
        assert "node_c" in wf.skipped_nodes

    def test_converge_timeout_handler_exception_detaches_in_flight(self) -> None:
        """If the timeout handler raises with in-flight predecessors, they should be detached."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        pending: dict[str, asyncio.Task[Any]] = {"node_b": MagicMock()}

        with patch.object(wf, "_skip_incomplete_predecessors", side_effect=RuntimeError("graph error")):
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    wf._converge_timeout_handler("converge_node", graph, timeout_seconds=0.001, pending_tasks=pending)
                )
            finally:
                loop.close()

        assert "converge_node" in wf.failed_nodes
        assert "node_b" in wf._detached_nodes

    def test_on_timeout_fail_marks_node_failed(self) -> None:
        """on_timeout='fail' (default) marks the converge as failed and skips downstream."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("node_a", {"result": "a_done"})

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
            mock_wf.logger = MagicMock()
            mock_wf.wait_condition = AsyncMock(side_effect=TimeoutError)
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    wf._converge_timeout_handler("converge_node", graph, timeout_seconds=10, pending_tasks={})
                )
            finally:
                loop.close()

        assert "converge_node" in wf.failed_nodes
        assert "converge_node" not in wf._timed_out_converge_nodes
        assert "node_c" in wf.skipped_nodes
        assert "node_b" in wf.skipped_nodes

    def test_on_timeout_continue_schedules_converge(self) -> None:
        """on_timeout='continue' skips predecessors and signals the main loop."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")
        converge_node.config["on_timeout"] = "continue"
        wf.resolver.set_namespace("node_a", {"result": "a_done"})

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
            mock_wf.logger = MagicMock()
            mock_wf.wait_condition = AsyncMock(side_effect=TimeoutError)
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    wf._converge_timeout_handler("converge_node", graph, timeout_seconds=10, pending_tasks={})
                )
            finally:
                loop.close()

        assert "converge_node" not in wf.failed_nodes
        assert "converge_node" in wf._timed_out_converge_nodes
        assert "node_b" in wf.skipped_nodes

    def test_on_timeout_continue_leaves_in_flight_predecessor(self) -> None:
        """on_timeout='continue' must not skip predecessors still running in pending_tasks."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")
        converge_node.config["on_timeout"] = "continue"
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        pending: dict[str, asyncio.Task[Any]] = {"node_b": MagicMock()}

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
            mock_wf.logger = MagicMock()
            mock_wf.wait_condition = AsyncMock(side_effect=TimeoutError)
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    wf._converge_timeout_handler("converge_node", graph, timeout_seconds=10, pending_tasks=pending)
                )
            finally:
                loop.close()

        assert "converge_node" in wf._timed_out_converge_nodes
        assert "node_b" not in wf.skipped_nodes

    def test_on_timeout_fail_leaves_in_flight_predecessor(self) -> None:
        """on_timeout='fail' must not skip predecessors still running in pending_tasks."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        # Don't set on_timeout - defaults to 'fail'
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        pending: dict[str, asyncio.Task[Any]] = {"node_b": MagicMock()}

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
            mock_wf.logger = MagicMock()
            mock_wf.wait_condition = AsyncMock(side_effect=TimeoutError)
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    wf._converge_timeout_handler("converge_node", graph, timeout_seconds=10, pending_tasks=pending)
                )
            finally:
                loop.close()

        # Converge should be marked as failed
        assert "converge_node" in wf.failed_nodes
        # In-flight predecessor (node_b) should NOT be skipped
        assert "node_b" not in wf.skipped_nodes

    def test_on_timeout_fail_detaches_in_flight_predecessors(self) -> None:
        """on_timeout='fail' detaches in-flight predecessors so the main loop can exit."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        pending: dict[str, asyncio.Task[Any]] = {"node_b": MagicMock()}

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
            mock_wf.logger = MagicMock()
            mock_wf.wait_condition = AsyncMock(side_effect=TimeoutError)
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    wf._converge_timeout_handler("converge_node", graph, timeout_seconds=10, pending_tasks=pending)
                )
            finally:
                loop.close()

        assert "converge_node" in wf.failed_nodes
        assert "node_b" not in wf.skipped_nodes
        assert "node_b" in wf._detached_nodes
        assert "node_c" in wf.skipped_nodes

    def test_remove_detached_tasks_drops_from_pending(self) -> None:
        """_remove_detached_tasks removes detached nodes from pending_tasks without cancelling."""
        wf = _make_workflow()
        mock_task = MagicMock()
        pending: dict[str, asyncio.Task[Any]] = {"node_a": mock_task, "node_b": MagicMock()}
        wf._detached_nodes = {"node_a"}

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
            mock_wf.logger = MagicMock()
            wf._remove_detached_tasks(pending)

        assert "node_a" not in pending
        assert "node_b" in pending
        mock_task.cancel.assert_not_called()

    def test_mark_remaining_unreachable_skips_detached_nodes(self) -> None:
        """_mark_remaining_unreachable_nodes must not mark detached nodes as skipped."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("trigger", {"done": True})
        wf.resolver.set_namespace("node_a", {"done": True})
        wf.resolver.set_namespace("converge_node", {"status": "failed"})
        wf._detached_nodes = {"node_b"}
        wf.skipped_nodes.add("node_c")

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
            mock_wf.logger = MagicMock()
            wf._mark_remaining_unreachable_nodes(graph)

        assert "node_b" not in wf.skipped_nodes

    def test_converge_not_rescheduled_after_already_executed(self) -> None:
        """When converge has already executed, late-completing predecessors should not reschedule it."""
        graph = _build_fanin_graph()
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf.resolver.set_namespace("converge_node", {"status": "completed", "merged": True})
        wf.resolver.set_namespace("node_b", {"status": "completed"})

        pending: dict[str, asyncio.Task[Any]] = {}

        # Simulate node_b completing and trying to schedule converge
        _run_schedule_successors(wf, "node_b", graph, pending)

        # Converge should NOT be in pending (not re-scheduled)
        assert "converge_node" not in pending
        # Downstream node_c should also NOT be scheduled (converge already ran)
        assert "node_c" not in pending

    def test_on_timeout_default_is_fail(self) -> None:
        """No on_timeout in config defaults to 'fail'."""
        wf = _make_workflow()
        graph = _build_fanin_graph()

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
            mock_wf.logger = MagicMock()
            mock_wf.wait_condition = AsyncMock(side_effect=TimeoutError)
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    wf._converge_timeout_handler("converge_node", graph, timeout_seconds=10, pending_tasks={})
                )
            finally:
                loop.close()

        assert "converge_node" in wf.failed_nodes
        assert "converge_node" not in wf._timed_out_converge_nodes


# ---------------------------------------------------------------------------
# Tests: Converge "any N" strategy
# ---------------------------------------------------------------------------


class TestConvergeAnyStrategy:
    """Tests for converge 'any N' predecessor gating and skipping."""

    @staticmethod
    def _build_any_converge_graph(config: dict[str, Any]) -> WorkflowGraph:
        """Build fan-in graph with custom converge config set in the backend."""
        backend = InMemoryGraphBackend()
        backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
        backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
        backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
        backend.add_node("converge_node", {"id": "converge_node", "type": "converge", "config": config})
        backend.add_node("node_c", {"id": "node_c", "type": "script", "config": {}})
        backend.add_edge("trigger", "node_a", None)
        backend.add_edge("trigger", "node_b", None)
        backend.add_edge("node_a", "converge_node", None)
        backend.add_edge("node_b", "converge_node", None)
        backend.add_edge("converge_node", "node_c", None)
        return WorkflowGraph(backend)

    def test_any_strategy_fires_when_n_required_met(self) -> None:
        graph = self._build_any_converge_graph({"strategy": "any", "n_required": 1})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        assert wf._are_predecessors_complete("converge_node", graph) is True

    def test_any_strategy_missing_n_required_returns_false(self) -> None:
        """strategy='any' without n_required returns False instead of raising TypeError."""
        graph = self._build_any_converge_graph({"strategy": "any"})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        assert wf._are_predecessors_complete("converge_node", graph) is False

    def test_any_strategy_waits_when_n_required_not_met(self) -> None:
        graph = self._build_any_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        assert wf._are_predecessors_complete("converge_node", graph) is False

    def test_skipped_node_not_scheduled(self) -> None:
        graph = _build_fanin_graph()
        wf = _make_workflow(skipped_nodes={"node_a"})
        wf.resolver.set_namespace("trigger", {"status": "completed"})
        pending: dict[str, asyncio.Task[Any]] = {}
        successor = graph.get_node("node_a")
        is_loop_iterate = False
        result = wf._should_skip_successor(successor, "trigger", is_loop_iterate, pending, graph)
        assert result is True

    def test_cancel_skipped_pending_tasks(self) -> None:
        wf = _make_workflow(skipped_nodes={"node_a"})
        mock_task = MagicMock()
        pending: dict[str, asyncio.Task[Any]] = {"node_a": mock_task, "node_b": MagicMock()}
        wf._cancel_skipped_pending_tasks(pending)
        mock_task.cancel.assert_called_once()
        assert "node_a" not in pending
        assert "node_b" in pending

    def test_cancel_skipped_pending_tasks_noop_when_none_skipped(self) -> None:
        wf = _make_workflow()
        pending: dict[str, asyncio.Task[Any]] = {"node_a": MagicMock()}
        wf._cancel_skipped_pending_tasks(pending)
        assert "node_a" in pending

    def test_skip_incomplete_predecessors_marks_and_propagates(self) -> None:
        graph = _build_fanin_graph()
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf._skip_incomplete_predecessors("converge_node", graph, "test reason", {})
        assert "node_b" in wf.skipped_nodes
        assert "node_a" not in wf.skipped_nodes

    def test_skip_incomplete_predecessors_leaves_in_flight_predecessors(self) -> None:
        graph = _build_fanin_graph()
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        pending: dict[str, asyncio.Task[Any]] = {"node_b": MagicMock()}
        wf._skip_incomplete_predecessors("converge_node", graph, "test reason", pending)
        assert "node_b" not in wf.skipped_nodes

    def test_should_skip_successor_triggers_any_skip(self) -> None:
        graph = self._build_any_converge_graph({"strategy": "any", "n_required": 1})
        converge_node = graph.get_node("converge_node")
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        pending: dict[str, asyncio.Task[Any]] = {}
        is_loop_iterate = False
        result = wf._should_skip_successor(converge_node, "node_a", is_loop_iterate, pending, graph)
        assert result is False
        assert "node_b" in wf.skipped_nodes

    def test_should_skip_successor_any_leaves_in_flight_predecessor(self) -> None:
        graph = self._build_any_converge_graph({"strategy": "any", "n_required": 1})
        converge_node = graph.get_node("converge_node")
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        pending: dict[str, asyncio.Task[Any]] = {"node_b": MagicMock()}
        is_loop_iterate = False
        result = wf._should_skip_successor(converge_node, "node_a", is_loop_iterate, pending, graph)
        assert result is False
        assert "node_b" not in wf.skipped_nodes

    def test_any_clamps_against_reachable_not_total(self) -> None:
        """When predecessors are skipped (e.g. by condition), n_required clamps to reachable count."""
        graph = self._build_any_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(skipped_nodes={"node_b"})
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        # node_b is skipped, so only 1 reachable predecessor remains.
        # n_req clamps from 2 to 1, and 1 completed >= 1 → fires.
        assert wf._are_predecessors_complete("converge_node", graph) is True

    @staticmethod
    def _build_three_branch_converge_graph(config: dict[str, Any]) -> WorkflowGraph:
        """Build: trigger -> [node_a, node_b, node_c] -> converge_node -> node_d."""
        backend = InMemoryGraphBackend()
        backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
        backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
        backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
        backend.add_node("node_c", {"id": "node_c", "type": "script", "config": {}})
        backend.add_node("converge_node", {"id": "converge_node", "type": "converge", "config": config})
        backend.add_node("node_d", {"id": "node_d", "type": "script", "config": {}})
        backend.add_edge("trigger", "node_a", None)
        backend.add_edge("trigger", "node_b", None)
        backend.add_edge("trigger", "node_c", None)
        backend.add_edge("node_a", "converge_node", None)
        backend.add_edge("node_b", "converge_node", None)
        backend.add_edge("node_c", "converge_node", None)
        backend.add_edge("converge_node", "node_d", None)
        return WorkflowGraph(backend)

    def test_any_with_multiple_skipped_clamps_correctly(self) -> None:
        """With 3 preds, 2 skipped, n_required=2: clamps to 1 reachable, fires when 1 completes."""
        graph = self._build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(skipped_nodes={"node_b", "node_c"})
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        assert wf._are_predecessors_complete("converge_node", graph) is True

    def test_any_still_waits_when_reachable_preds_pending(self) -> None:
        """With 3 preds, 1 skipped, n_required=2: 2 reachable, only 1 complete → waits."""
        graph = self._build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(skipped_nodes={"node_c"})
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        # node_b is reachable but not complete → 2 reachable, 1 complete < 2 → waits
        assert wf._are_predecessors_complete("converge_node", graph) is False

    def test_execute_converge_node_excludes_in_flight_predecessors(self) -> None:
        """_execute_converge_node should only include completed predecessors in predecessor_results."""
        graph = _build_fanin_graph()
        wf = _make_workflow()
        # node_a has a namespace (completed), node_b doesn't (in-flight or not started)
        wf.resolver.set_namespace("node_a", {"status": "completed", "output": "result_a"})

        loop = asyncio.new_event_loop()
        try:
            with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf:
                mock_wf.execute_activity = AsyncMock(return_value={"status": "completed"})
                result = loop.run_until_complete(
                    wf._execute_converge_node(
                        node_id="converge_node",
                        resolved_config={},
                        outputs={},
                        graph=graph,
                    )
                )
                # Verify execute_activity was called with args containing predecessor_results
                # args is a keyword argument, so access via call_args.kwargs
                activity_args = mock_wf.execute_activity.call_args.kwargs.get("args", [])
                assert len(activity_args) == 3
                predecessor_results = activity_args[2]
                # Only node_a (completed) should be in results, not node_b (in-flight)
                assert "node_a" in predecessor_results
                assert "node_b" not in predecessor_results
                assert predecessor_results["node_a"]["output"] == "result_a"
                assert result == {"status": "completed"}
        finally:
            loop.close()


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
