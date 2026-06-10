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
from tests.unit.workflows.workflow_engine.conftest import init_workflow_runtime


@pytest.fixture(autouse=True)
def _mock_temporal_workflow() -> Generator[MagicMock]:
    """Mock the Temporal workflow module to avoid 'Not in workflow event loop' errors."""
    mock_logger = MagicMock()
    with (
        patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_wf,
        patch("nexus.workflows.workflow_engine.converge_mixin.workflow", mock_wf),
    ):
        mock_wf.logger = mock_logger
        mock_wf.info.return_value = MagicMock(workflow_id="test-wf-id")
        yield mock_wf


@pytest.fixture
def mock_timeout_workflow(_mock_temporal_workflow: MagicMock) -> MagicMock:
    """Extend the workflow mock with wait_condition that raises TimeoutError."""
    _mock_temporal_workflow.wait_condition = AsyncMock(side_effect=TimeoutError)
    return _mock_temporal_workflow


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
    wf._cof_failed_nodes = set()
    init_workflow_runtime(wf)
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


def _build_intermediate_converge_graph(config: dict[str, Any] | None = None) -> WorkflowGraph:
    """Build: trigger -> [node_a, node_b]; node_a -> node_x -> converge_node; node_b -> converge_node -> node_c."""
    backend = InMemoryGraphBackend()
    backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
    backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
    backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
    backend.add_node("node_x", {"id": "node_x", "type": "script", "config": {}})
    backend.add_node("converge_node", {"id": "converge_node", "type": "converge", "config": config or {}})
    backend.add_node("node_c", {"id": "node_c", "type": "script", "config": {}})
    backend.add_edge("trigger", "node_a", None)
    backend.add_edge("trigger", "node_b", None)
    backend.add_edge("node_a", "node_x", None)
    backend.add_edge("node_x", "converge_node", None)
    backend.add_edge("node_b", "converge_node", None)
    backend.add_edge("converge_node", "node_c", None)
    return WorkflowGraph(backend)


def _build_chained_converge_graph() -> WorkflowGraph:
    """Build chained converge: [A, B] -> conv1 -> Y -> conv2 <- C -> D."""
    backend = InMemoryGraphBackend()
    backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
    backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
    backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
    backend.add_node("conv1", {"id": "conv1", "type": "converge", "config": {}})
    backend.add_node("node_y", {"id": "node_y", "type": "script", "config": {}})
    backend.add_node("node_c", {"id": "node_c", "type": "script", "config": {}})
    backend.add_node("conv2", {"id": "conv2", "type": "converge", "config": {}})
    backend.add_node("node_d", {"id": "node_d", "type": "script", "config": {}})
    backend.add_edge("trigger", "node_a", None)
    backend.add_edge("trigger", "node_b", None)
    backend.add_edge("trigger", "node_c", None)
    backend.add_edge("node_a", "conv1", None)
    backend.add_edge("node_b", "conv1", None)
    backend.add_edge("conv1", "node_y", None)
    backend.add_edge("node_y", "conv2", None)
    backend.add_edge("node_c", "conv2", None)
    backend.add_edge("conv2", "node_d", None)
    return WorkflowGraph(backend)


def _build_multi_intermediate_converge_graph() -> WorkflowGraph:
    """Build: A -> X -> Y -> converge <- B -> C (two intermediates)."""
    backend = InMemoryGraphBackend()
    backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
    backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
    backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
    backend.add_node("node_x", {"id": "node_x", "type": "script", "config": {}})
    backend.add_node("node_y", {"id": "node_y", "type": "script", "config": {}})
    backend.add_node("converge_node", {"id": "converge_node", "type": "converge", "config": {}})
    backend.add_node("node_c", {"id": "node_c", "type": "script", "config": {}})
    backend.add_edge("trigger", "node_a", None)
    backend.add_edge("trigger", "node_b", None)
    backend.add_edge("node_a", "node_x", None)
    backend.add_edge("node_x", "node_y", None)
    backend.add_edge("node_y", "converge_node", None)
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

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.asyncio.create_task") as mock_create_task:
            mock_create_task.return_value = MagicMock()
            wf._handle_converge_wait("converge_node", converge_node, graph, {})

        assert "converge_node" in wf._timeout_tasks
        mock_create_task.assert_called_once()

    def test_handle_converge_wait_skips_duplicate_handler(self) -> None:
        """A second call for the same node should not start another handler."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")
        converge_node.settings.timeout = 10

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.asyncio.create_task") as mock_create_task:
            mock_task = MagicMock()
            mock_create_task.return_value = mock_task
            wf._handle_converge_wait("converge_node", converge_node, graph, {})
            wf._handle_converge_wait("converge_node", converge_node, graph, {})

        assert wf._timeout_tasks["converge_node"] is mock_task
        mock_create_task.assert_called_once()

    def test_handle_converge_wait_always_starts_handler(self) -> None:
        """A converge node always starts a timeout handler, falling back to the catalog default."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.asyncio.create_task") as mock_create_task:
            mock_create_task.return_value = MagicMock()
            wf._handle_converge_wait("converge_node", converge_node, graph, {})

        assert "converge_node" in wf._timeout_tasks

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

    def test_on_timeout_fail_marks_node_failed(self, mock_timeout_workflow: MagicMock) -> None:
        """on_timeout='fail' (default) marks the converge as failed and skips downstream."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("node_a", {"result": "a_done"})

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

    def test_on_timeout_continue_schedules_converge(self, mock_timeout_workflow: MagicMock) -> None:
        """on_timeout='continue' skips predecessors and signals the main loop."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")
        converge_node.config["on_timeout"] = "continue"
        wf.resolver.set_namespace("node_a", {"result": "a_done"})

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

    def test_on_timeout_continue_leaves_in_flight_predecessor(self, mock_timeout_workflow: MagicMock) -> None:
        """on_timeout='continue' must not skip predecessors still running in pending_tasks."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        converge_node = graph.get_node("converge_node")
        converge_node.config["on_timeout"] = "continue"
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        pending: dict[str, asyncio.Task[Any]] = {"node_b": MagicMock()}

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(
                wf._converge_timeout_handler("converge_node", graph, timeout_seconds=10, pending_tasks=pending)
            )
        finally:
            loop.close()

        assert "converge_node" in wf._timed_out_converge_nodes
        assert "node_b" not in wf.skipped_nodes

    def test_on_timeout_fail_leaves_in_flight_predecessor(self, mock_timeout_workflow: MagicMock) -> None:
        """on_timeout='fail' must not skip predecessors still running in pending_tasks."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        pending: dict[str, asyncio.Task[Any]] = {"node_b": MagicMock()}

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(
                wf._converge_timeout_handler("converge_node", graph, timeout_seconds=10, pending_tasks=pending)
            )
        finally:
            loop.close()

        assert "converge_node" in wf.failed_nodes
        assert "node_b" not in wf.skipped_nodes

    def test_on_timeout_fail_detaches_in_flight_predecessors(self, mock_timeout_workflow: MagicMock) -> None:
        """on_timeout='fail' detaches in-flight predecessors so the main loop can exit."""
        wf = _make_workflow()
        graph = _build_fanin_graph()
        wf.resolver.set_namespace("node_a", {"result": "a_done"})
        pending: dict[str, asyncio.Task[Any]] = {"node_b": MagicMock()}

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

    def test_on_timeout_default_is_fail(self, mock_timeout_workflow: MagicMock) -> None:
        """No on_timeout in config defaults to 'fail'."""
        wf = _make_workflow()
        graph = _build_fanin_graph()

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

    def test_any_skips_do_not_count_toward_n_required(self) -> None:
        """Skipped predecessors do not count toward n_required; only successes count."""
        graph = self._build_any_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(skipped_nodes={"node_b"})
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        # node_b is skipped, node_a succeeds → only 1 success < n_required=2 → does NOT fire
        assert wf._are_predecessors_complete("converge_node", graph) is False

    def test_any_all_skipped_except_one_still_needs_n_required(self) -> None:
        """With 3 preds, 2 skipped, n_required=2: only 1 success < 2 → does not fire."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(skipped_nodes={"node_b", "node_c"})
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        assert wf._are_predecessors_complete("converge_node", graph) is False

    def test_any_still_waits_when_reachable_preds_pending(self) -> None:
        """With 3 preds, 1 skipped, n_required=2: 2 reachable, only 1 complete → waits."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
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
# Tests: Converge ANY failure semantics
# ---------------------------------------------------------------------------


class TestConvergeAnyFailure:
    """Test that ANY converge fails when branch failures prevent n_required."""

    def test_any_converge_fails_when_failures_prevent_n_required(self) -> None:
        """3 branches, n_required=2: node_a succeeds, node_b + node_c fail → converge fails."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(failed_nodes={"node_b": "error b", "node_c": "error c"})
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf.resolver.set_namespace("node_b", {"status": "failed", "error": "error b"})
        wf.resolver.set_namespace("node_c", {"status": "failed", "error": "error c"})

        converge_node = graph.get_node("converge_node")
        pending: dict[str, asyncio.Task[Any]] = {}
        is_loop_iterate = False
        result = wf._should_skip_successor(converge_node, "node_a", is_loop_iterate, pending, graph)

        assert result is True
        assert "converge_node" in wf.failed_nodes
        assert "converge_node" not in wf.skipped_nodes
        assert "node_d" in wf.skipped_nodes
        assert wf._has_unhandled_failure is True

    def test_any_converge_waits_while_branch_still_running(self) -> None:
        """1 success, 1 failure, 1 still running → converge waits (not failed yet)."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(failed_nodes={"node_b": "error b"})
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf.resolver.set_namespace("node_b", {"status": "failed", "error": "error b"})
        # node_c is still running (no namespace, not skipped, not failed)

        assert wf._are_predecessors_complete("converge_node", graph) is False
        assert "converge_node" not in wf.failed_nodes

    def test_any_converge_skipped_when_all_preds_skipped_no_failures(self) -> None:
        """All predecessors skipped, no failures → converge stays skipped (not failed) in final pass."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(skipped_nodes={"node_a", "node_b", "node_c"})

        wf._mark_remaining_unreachable_nodes(graph)

        assert "converge_node" in wf.skipped_nodes
        assert "converge_node" not in wf.failed_nodes

    def test_any_converge_excludes_failed_from_completed_count(self) -> None:
        """Failed predecessor with namespace should NOT count as completed."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(failed_nodes={"node_a": "error a"})
        wf.resolver.set_namespace("node_a", {"status": "failed", "error": "error a"})
        wf.resolver.set_namespace("node_b", {"status": "completed"})
        wf.resolver.set_namespace("node_c", {"status": "completed"})

        # node_a is failed (not counted), node_b + node_c succeed → 2 >= 2
        assert wf._are_predecessors_complete("converge_node", graph) is True

        # Now test with n_required=3: only 2 successes < 3
        graph2 = _build_three_branch_converge_graph({"strategy": "any", "n_required": 3})
        wf2 = _make_workflow(failed_nodes={"node_a": "error a"})
        wf2.resolver.set_namespace("node_a", {"status": "failed", "error": "error a"})
        wf2.resolver.set_namespace("node_b", {"status": "completed"})
        wf2.resolver.set_namespace("node_c", {"status": "completed"})
        assert wf2._are_predecessors_complete("converge_node", graph2) is False

    def test_handle_node_failure_triggers_converge_failure(self) -> None:
        """When a branch fails and all converge predecessors are terminal, converge fails."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow(failed_nodes={"node_b": "error b"})
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf.resolver.set_namespace("node_b", {"status": "failed", "error": "error b"})

        error = Exception("error c")
        wf._handle_node_failure("node_c", error, graph)

        assert "converge_node" in wf.failed_nodes
        assert "converge_node" not in wf.skipped_nodes
        assert "node_d" in wf.skipped_nodes
        assert wf._has_unhandled_failure is True


# ---------------------------------------------------------------------------
# Tests: Converge ALL failure semantics
# ---------------------------------------------------------------------------


class TestConvergeAllFailure:
    """Test that ALL converge fails immediately when any predecessor fails."""

    def test_all_converge_fails_when_predecessor_fails(self) -> None:
        """ALL strategy: if any predecessor fails, converge fails and downstream is skipped."""
        graph = _build_three_branch_converge_graph({"strategy": "all"})
        wf = _make_workflow(failed_nodes={"node_b": "error b"})
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf.resolver.set_namespace("node_b", {"status": "failed", "error": "error b"})
        wf.resolver.set_namespace("node_c", {"status": "completed"})

        converge_node = graph.get_node("converge_node")
        pending: dict[str, asyncio.Task[Any]] = {}
        is_loop_iterate = False
        result = wf._should_skip_successor(converge_node, "node_c", is_loop_iterate, pending, graph)

        assert result is True
        assert "converge_node" in wf.failed_nodes
        assert "converge_node" not in wf.skipped_nodes
        assert "node_d" in wf.skipped_nodes
        assert wf._has_unhandled_failure is True

    def test_all_converge_fails_eagerly_via_handle_node_failure(self) -> None:
        """_handle_node_failure triggers immediate converge failure for ALL strategy."""
        graph = _build_three_branch_converge_graph({"strategy": "all"})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        # node_c is still running (not completed yet)

        pending: dict[str, asyncio.Task[Any]] = {}
        error = Exception("node_b crashed")
        wf._handle_node_failure("node_b", error, graph, pending)

        assert "converge_node" in wf.failed_nodes
        assert "converge_node" not in wf.skipped_nodes
        assert "node_d" in wf.skipped_nodes
        assert wf._has_unhandled_failure is True

    def test_all_converge_succeeds_when_all_predecessors_succeed(self) -> None:
        """ALL strategy: all predecessors succeed -> converge fires normally."""
        graph = _build_three_branch_converge_graph({"strategy": "all"})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf.resolver.set_namespace("node_b", {"status": "completed"})
        wf.resolver.set_namespace("node_c", {"status": "completed"})

        assert wf._are_predecessors_complete("converge_node", graph) is True

        converge_node = graph.get_node("converge_node")
        pending: dict[str, asyncio.Task[Any]] = {}
        is_loop_iterate = False
        result = wf._should_skip_successor(converge_node, "node_c", is_loop_iterate, pending, graph)

        assert result is False
        assert "converge_node" not in wf.failed_nodes

    def test_all_converge_skips_not_started_detaches_in_flight(self) -> None:
        """ALL: not-started preds are skipped, in-flight preds are detached."""
        graph = _build_three_branch_converge_graph({"strategy": "all"})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        # node_c is in-flight (in pending_tasks but no namespace)
        mock_task = MagicMock()
        pending: dict[str, asyncio.Task[Any]] = {"node_c": mock_task}

        error = Exception("node_b crashed")
        wf._handle_node_failure("node_b", error, graph, pending)

        assert "converge_node" in wf.failed_nodes
        assert "node_c" in wf._detached_nodes
        assert "node_d" in wf.skipped_nodes

    def test_all_converge_does_not_fail_on_cof_predecessor(self) -> None:
        """Predecessor fails with continue_on_failure=True: converge ALL does NOT fail."""
        graph = _build_three_branch_converge_graph({"strategy": "all"})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})

        pending: dict[str, asyncio.Task[Any]] = {}
        error = Exception("node_b crashed")
        wf._handle_node_failure("node_b", error, graph, pending, continue_on_failure=True)

        assert wf._has_unhandled_failure is False
        assert "converge_node" not in wf.failed_nodes
        assert "node_d" not in wf.skipped_nodes
        assert "node_b" in wf._cof_failed_nodes

    def test_all_branches_fail_converge_is_failed_not_skipped(self) -> None:
        """When all branches fail, converge must be 'failed' not 'skipped'."""
        graph = _build_three_branch_converge_graph({"strategy": "all"})
        wf = _make_workflow()

        pending: dict[str, asyncio.Task[Any]] = {}
        wf._handle_node_failure("node_a", Exception("err a"), graph, pending)
        wf._handle_node_failure("node_b", Exception("err b"), graph, pending)
        wf._handle_node_failure("node_c", Exception("err c"), graph, pending)

        assert "converge_node" in wf.failed_nodes
        assert "converge_node" not in wf.skipped_nodes
        assert "node_d" in wf.skipped_nodes
        assert wf._has_unhandled_failure is True


# ---------------------------------------------------------------------------
# Tests: CoF-failed branches and converge interaction
# ---------------------------------------------------------------------------


class TestConvergeCofFailure:
    """Test that continue_on_failure failures count toward converge n_required."""

    def test_any_cof_branch_counts_toward_n_required(self) -> None:
        """ANY strategy: CoF-failed branch counts toward n_required."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        # node_b fails with CoF
        wf._handle_node_failure("node_b", Exception("err"), graph, continue_on_failure=True)
        # node_c still running

        # CoF-failed node_b should count: completed_count = 2 (node_a + node_b) >= n_required=2
        assert wf._are_predecessors_complete("converge_node", graph) is True

    def test_any_non_cof_branch_does_not_count(self) -> None:
        """ANY strategy: non-CoF-failed branch does NOT count toward n_required."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        # node_b fails WITHOUT CoF
        wf._handle_node_failure("node_b", Exception("err"), graph)
        # node_c still running

        # non-CoF node_b should NOT count: completed_count = 1 (node_a) < n_required=2
        assert wf._are_predecessors_complete("converge_node", graph) is False

    def test_all_converge_fires_with_only_cof_failures(self) -> None:
        """ALL strategy: converge fires when the only failures are CoF."""
        graph = _build_three_branch_converge_graph({"strategy": "all"})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf.resolver.set_namespace("node_c", {"status": "completed"})

        pending: dict[str, asyncio.Task[Any]] = {}
        wf._handle_node_failure("node_b", Exception("err"), graph, pending, continue_on_failure=True)

        assert "converge_node" not in wf.failed_nodes
        assert wf._are_predecessors_complete("converge_node", graph) is True

    def test_all_converge_fails_with_mixed_cof_and_non_cof(self) -> None:
        """ALL strategy: non-CoF failure causes converge failure even if other failures are CoF."""
        graph = _build_three_branch_converge_graph({"strategy": "all"})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})

        pending: dict[str, asyncio.Task[Any]] = {}
        # node_b fails with CoF
        wf._handle_node_failure("node_b", Exception("err b"), graph, pending, continue_on_failure=True)
        # node_c fails without CoF
        wf._handle_node_failure("node_c", Exception("err c"), graph, pending)

        assert "converge_node" in wf.failed_nodes
        assert wf._has_unhandled_failure is True

    def test_count_successful_predecessors_includes_cof(self) -> None:
        """_count_successful_predecessors counts CoF-failed nodes."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf._handle_node_failure("node_b", Exception("err"), graph, continue_on_failure=True)

        predecessor_ids = graph.get_predecessors("converge_node")
        count = wf._count_successful_predecessors(predecessor_ids)
        assert count == 2  # node_a (success) + node_b (CoF)

    def test_are_predecessors_complete_counts_cof_as_completed(self) -> None:
        """_are_predecessors_complete counts CoF-failed nodes toward completed_count."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_a", {"status": "completed"})
        wf._handle_node_failure("node_b", Exception("err"), graph, continue_on_failure=True)
        # node_c still running

        # CoF-failed node_b counts: completed_count = 2 (node_a + node_b) >= n_required=2
        assert wf._are_predecessors_complete("converge_node", graph) is True

    def test_are_predecessors_complete_cof_alone_meets_n_required(self) -> None:
        """_are_predecessors_complete satisfies n_required with only CoF-failed nodes."""
        graph = _build_three_branch_converge_graph({"strategy": "any", "n_required": 2})
        wf = _make_workflow()
        wf._handle_node_failure("node_a", Exception("err a"), graph, continue_on_failure=True)
        wf._handle_node_failure("node_b", Exception("err b"), graph, continue_on_failure=True)
        # node_c still running

        # Both CoF-failed: completed_count = 2 >= n_required=2
        assert wf._are_predecessors_complete("converge_node", graph) is True


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


class TestBuildResultStatus:
    """_build_result reports the correct workflow status."""

    def test_completed_when_no_failures(self) -> None:
        wf = _make_workflow()
        wf.resolver.set_namespace("trigger", {})
        result = wf._build_result("exec-1", include_node_results=False)
        assert result["status"] == "completed"

    def test_failed_when_unhandled_failure(self) -> None:
        wf = _make_workflow(failed_nodes={"node_a": "boom"})
        wf._has_unhandled_failure = True
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_a", {"status": "failed", "error": "boom"})
        result = wf._build_result("exec-1", include_node_results=False)
        assert result["status"] == "failed"

    def test_completed_with_errors_when_cof_handled_failure(self) -> None:
        """Node failed with continue_on_failure=True: status is completed_with_errors, not completed."""
        wf = _make_workflow(failed_nodes={"node_b": "Script exited with code 1"})
        # _has_unhandled_failure is False because cof=True consumed the failure
        wf._has_unhandled_failure = False
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_b", {"status": "failed", "error": "Script exited with code 1"})
        wf.resolver.set_namespace("node_c", {"result": "ok"})
        result = wf._build_result("exec-1", include_node_results=False)
        assert result["status"] == "completed_with_errors"
        assert result["failed_activities"] == {"node_b": "Script exited with code 1"}

    def test_completed_with_errors_when_last_node_fails_with_cof(self) -> None:
        """Last node fails with cof=True: still completed_with_errors (no successors to skip)."""
        wf = _make_workflow(failed_nodes={"node_c": "timeout"})
        wf._has_unhandled_failure = False
        wf.resolver.set_namespace("trigger", {})
        wf.resolver.set_namespace("node_c", {"status": "failed", "error": "timeout"})
        result = wf._build_result("exec-1", include_node_results=False)
        assert result["status"] == "completed_with_errors"


# ---------------------------------------------------------------------------
# Tests: Converge failure through intermediate nodes
# ---------------------------------------------------------------------------


class TestConvergeIntermediateFailure:
    """Test converge failure detection when converge sits behind intermediate nodes."""

    def test_all_converge_behind_intermediate_fails_eagerly(self) -> None:
        """ALL strategy: A -> X -> converge, B -> converge.  A fails -> converge fails eagerly."""
        graph = _build_intermediate_converge_graph({"strategy": "all"})
        wf = _make_workflow()
        wf.resolver.set_namespace("node_b", {"status": "completed"})

        pending: dict[str, asyncio.Task[Any]] = {}
        error = Exception("node_a crashed")
        wf._handle_node_failure("node_a", error, graph, pending)

        assert "node_x" in wf.skipped_nodes
        assert "converge_node" in wf.failed_nodes
        assert "converge_node" not in wf.skipped_nodes
        assert "node_c" in wf.skipped_nodes
        assert wf._has_unhandled_failure is True

    def test_any_converge_behind_intermediate_waits_while_branch_running(self) -> None:
        """ANY strategy: A -> X -> converge, B + C -> converge.  A fails, B + C running -> waits."""
        backend = InMemoryGraphBackend()
        backend.add_node("trigger", {"id": "trigger", "type": "manual_trigger", "config": {}})
        backend.add_node("node_a", {"id": "node_a", "type": "script", "config": {}})
        backend.add_node("node_b", {"id": "node_b", "type": "script", "config": {}})
        backend.add_node("node_c", {"id": "node_c", "type": "script", "config": {}})
        backend.add_node("node_x", {"id": "node_x", "type": "script", "config": {}})
        backend.add_node(
            "converge_node",
            {"id": "converge_node", "type": "converge", "config": {"strategy": "any", "n_required": 2}},
        )
        backend.add_node("node_d", {"id": "node_d", "type": "script", "config": {}})
        backend.add_edge("trigger", "node_a", None)
        backend.add_edge("trigger", "node_b", None)
        backend.add_edge("trigger", "node_c", None)
        backend.add_edge("node_a", "node_x", None)
        backend.add_edge("node_x", "converge_node", None)
        backend.add_edge("node_b", "converge_node", None)
        backend.add_edge("node_c", "converge_node", None)
        backend.add_edge("converge_node", "node_d", None)
        graph = WorkflowGraph(backend)

        wf = _make_workflow()

        pending: dict[str, asyncio.Task[Any]] = {}
        error = Exception("node_a crashed")
        wf._handle_node_failure("node_a", error, graph, pending)

        assert "node_x" in wf.skipped_nodes
        assert "converge_node" not in wf.failed_nodes

    def test_continue_on_failure_does_not_bfs_through_intermediates(self) -> None:
        """continue_on_failure=True: intermediates NOT skipped, converge NOT failed."""
        graph = _build_intermediate_converge_graph({"strategy": "all"})
        wf = _make_workflow()

        pending: dict[str, asyncio.Task[Any]] = {}
        error = Exception("node_a crashed")
        wf._handle_node_failure("node_a", error, graph, pending, continue_on_failure=True)

        assert "node_x" not in wf.skipped_nodes
        assert "converge_node" not in wf.failed_nodes

    def test_chained_converge_cascade(self) -> None:
        """A -> conv1, B -> conv1 -> Y -> conv2, C -> conv2: both converges fail."""
        graph = _build_chained_converge_graph()
        wf = _make_workflow()
        wf.resolver.set_namespace("node_b", {"status": "completed"})
        wf.resolver.set_namespace("node_c", {"status": "completed"})

        pending: dict[str, asyncio.Task[Any]] = {}
        error = Exception("node_a crashed")
        wf._handle_node_failure("node_a", error, graph, pending)

        assert "conv1" in wf.failed_nodes
        assert "node_y" in wf.skipped_nodes
        assert "conv2" in wf.failed_nodes
        assert "conv2" not in wf.skipped_nodes
        assert "node_d" in wf.skipped_nodes

    def test_multiple_intermediates_in_chain(self) -> None:
        """A -> X -> Y -> converge, B -> converge.  A fails -> all skipped, converge failed."""
        graph = _build_multi_intermediate_converge_graph()
        wf = _make_workflow()
        wf.resolver.set_namespace("node_b", {"status": "completed"})

        pending: dict[str, asyncio.Task[Any]] = {}
        error = Exception("node_a crashed")
        wf._handle_node_failure("node_a", error, graph, pending)

        assert "node_x" in wf.skipped_nodes
        assert "node_y" in wf.skipped_nodes
        assert "converge_node" in wf.failed_nodes
        assert "node_c" in wf.skipped_nodes

    def test_already_failed_converge_not_reprocessed(self) -> None:
        """BFS guard: converge already in failed_nodes -> not reprocessed."""
        graph = _build_intermediate_converge_graph({"strategy": "all"})
        wf = _make_workflow(
            failed_nodes={"converge_node": "already failed"},
            skipped_nodes={"node_x"},
        )
        wf.resolver.set_namespace("converge_node", {"status": "failed", "error": "already failed"})

        pending: dict[str, asyncio.Task[Any]] = {}
        error = Exception("node_a crashed")
        wf._handle_node_failure("node_a", error, graph, pending)

        assert wf.failed_nodes["converge_node"] == "already failed"
