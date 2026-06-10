"""Mixin encapsulating converge node orchestration logic.

Provides convergence gate evaluation, failure cascading,
timeout handling, and incomplete-predecessor skipping.
"""

import asyncio
import collections
from datetime import timedelta
from typing import Any

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from nexus.workflows.workflow_engine.node_settings_resolver import resolve_wait_duration

from nexus.workflows.utils.namespace_resolver import NamespaceResolver
from nexus.workflows.workflow_engine.graph import ActivityNode, WorkflowGraph
from nexus.workflows.workflow_engine.models.workflow_definition import (
    ConvergeStrategy,
    NodeType,
)


class WorkflowConvergeMixin:
    """Mixin encapsulating converge node orchestration logic.

    Provides convergence gate evaluation, failure cascading,
    timeout handling, and incomplete-predecessor skipping.

    State attributes are declared as type annotations for mypy;
    initialization remains in ``NexusWorkflow._initialize_state``.
    """

    failed_nodes: dict[str, str]
    skipped_nodes: set[str]
    resolver: NamespaceResolver
    _runtime_settings: dict[str, Any]
    _cof_failed_nodes: set[str]
    _has_unhandled_failure: bool
    _timeout_tasks: dict[str, asyncio.Task[Any]]
    _timed_out_converge_nodes: set[str]
    _detached_nodes: set[str]

    # Methods provided by NexusWorkflow (resolved via MRO)
    def _are_predecessors_complete(self, node_id: str, graph: WorkflowGraph) -> bool: ...  # type: ignore[empty-body]

    def _mark_downstream_as_skipped(self, start_node_id: str, graph: WorkflowGraph) -> None: ...

    def _check_converge_successors(
        self,
        failed_node_id: str,
        graph: WorkflowGraph,
        pending_tasks: dict[str, asyncio.Task[Any]] | None = None,
    ) -> None:
        """Check if any reachable converge node should fail after a node failure.

        Uses BFS through skipped/failed intermediate nodes to find converge
        nodes that are not direct successors of the failed node.
        """
        visited: set[str] = set()
        queue = collections.deque([failed_node_id])

        while queue:
            current_id = queue.popleft()
            if current_id in visited:
                continue
            visited.add(current_id)

            for succ_id in graph.get_successors(current_id):
                if succ_id in visited:
                    continue
                succ_node = graph.get_node(succ_id)

                if succ_node.type == NodeType.CONVERGE:
                    if succ_id in self.failed_nodes or self.resolver.has_namespace(succ_id):
                        continue
                    self._evaluate_converge_failure(
                        succ_id,
                        succ_node,
                        graph,
                        pending_tasks,
                        upstream_failure_id=failed_node_id,
                    )
                elif succ_id in self.skipped_nodes or succ_id in self.failed_nodes:
                    queue.append(succ_id)

    def _evaluate_converge_failure(
        self,
        converge_id: str,
        converge_node: ActivityNode,
        graph: WorkflowGraph,
        pending_tasks: dict[str, asyncio.Task[Any]] | None = None,
        *,
        upstream_failure_id: str | None = None,
    ) -> None:
        """Evaluate whether a converge node should fail.

        Args:
            converge_id: ID of the converge node to evaluate.
            converge_node: The converge node object.
            graph: Workflow graph.
            pending_tasks: Currently executing tasks.
            upstream_failure_id: When set, this converge was reached via BFS from
                a failed node through skipped/failed intermediates.  For ALL
                strategy this means a branch is dead and the converge should fail.
                When ``None``, only direct predecessor failures are checked.

        """
        strategy = converge_node.config.get("strategy", ConvergeStrategy.ALL)
        predecessor_ids = graph.get_predecessors(converge_id)

        if strategy == ConvergeStrategy.ALL:
            failed_preds = [p for p in predecessor_ids if p in self.failed_nodes and p not in self._cof_failed_nodes]
            if failed_preds:
                error_msg = (
                    f"Converge node {converge_id}: predecessor(s) "
                    f"{', '.join(failed_preds)} failed, "
                    f"ALL strategy requires every branch to succeed"
                )
                self._fail_converge_node(converge_id, error_msg, graph, pending_tasks)
                return

            if upstream_failure_id and upstream_failure_id not in self._cof_failed_nodes:
                error_msg = (
                    f"Converge node {converge_id}: upstream node "
                    f"{upstream_failure_id} failed, "
                    f"ALL strategy requires every branch to succeed"
                )
                self._fail_converge_node(converge_id, error_msg, graph, pending_tasks)
                return

        if self._all_predecessors_terminal(predecessor_ids) and not self._are_predecessors_complete(converge_id, graph):
            n_req = converge_node.config.get("n_required", "?")
            successes = self._count_successful_predecessors(predecessor_ids)
            error_msg = (
                f"Converge node {converge_id}: required {n_req} successful branches, "
                f"got {successes} (failures excluded)"
            )
            self._fail_converge_node(converge_id, error_msg, graph, pending_tasks)

    def _all_predecessors_terminal(self, predecessor_ids: list[str]) -> bool:
        """Check if every predecessor has reached a terminal state (completed, failed, or skipped)."""
        return all(
            p in self.skipped_nodes or p in self.failed_nodes or self.resolver.has_namespace(p) for p in predecessor_ids
        )

    def _count_successful_predecessors(self, predecessor_ids: list[str]) -> int:
        """Count predecessors that completed successfully (not failed, not skipped)."""
        return sum(
            1
            for p in predecessor_ids
            if p not in self.skipped_nodes
            and self.resolver.has_namespace(p)
            and (p not in self.failed_nodes or p in self._cof_failed_nodes)
        )

    def _fail_converge_node(
        self,
        node_id: str,
        error_msg: str,
        graph: WorkflowGraph,
        pending_tasks: dict[str, asyncio.Task[Any]] | None = None,
    ) -> None:
        """Mark a converge node as failed and clean up."""
        self.failed_nodes[node_id] = error_msg
        self._has_unhandled_failure = True
        self.skipped_nodes.discard(node_id)
        self.resolver.set_namespace(node_id, {"status": "failed", "error": error_msg})
        if pending_tasks is not None:
            try:
                self._skip_incomplete_predecessors(node_id, graph, "converge failed", pending_tasks)
            except Exception:  # noqa: BLE001
                workflow.logger.exception(f"Failed to skip incomplete predecessors for {node_id}")
            for pred_id in graph.get_predecessors(node_id):
                if pred_id in pending_tasks and not self.resolver.has_namespace(pred_id):
                    self._detached_nodes.add(pred_id)
        self._mark_downstream_as_skipped(node_id, graph)
        timeout_task = self._timeout_tasks.pop(node_id, None)
        if timeout_task is not None:
            timeout_task.cancel()
        self._check_converge_successors(node_id, graph, pending_tasks)

    def _handle_converge_successor(
        self,
        node_id: str,
        successor: ActivityNode,
        graph: WorkflowGraph,
        pending_tasks: dict[str, asyncio.Task[Any]],
    ) -> bool:
        """Decide whether a converge successor should be skipped or scheduled.

        Returns True if the converge node should be skipped (not scheduled).
        """
        if node_id in self.failed_nodes:
            return True

        self._evaluate_converge_failure(node_id, successor, graph, pending_tasks)
        if node_id in self.failed_nodes:
            return True

        # Gate not satisfied yet — wait or skip
        if not self._are_predecessors_complete(node_id, graph):
            predecessor_ids = graph.get_predecessors(node_id)
            if self._all_predecessors_terminal(predecessor_ids):
                self.skipped_nodes.add(node_id)
                workflow.logger.info(
                    f"Converge node {node_id} marked as skipped (n_required not met, all branches terminal)"
                )
                self._mark_downstream_as_skipped(node_id, graph)
                return True

            self._handle_converge_wait(node_id, successor, graph, pending_tasks)
            return True

        # Gate satisfied — for ANY, skip branches that haven't started
        strategy = successor.config.get("strategy", ConvergeStrategy.ALL)
        if strategy == ConvergeStrategy.ANY:
            self._skip_incomplete_predecessors(node_id, graph, "n_required met", pending_tasks)

        return False

    def _handle_converge_wait(
        self,
        node_id: str,
        successor: ActivityNode,
        graph: WorkflowGraph,
        pending_tasks: dict[str, asyncio.Task[Any]],
    ) -> None:
        """Handle a converge node that is waiting for predecessors, optionally starting a timeout."""
        workflow.logger.info(f"Converge node {node_id} waiting for predecessors to complete")

        if node_id in self._timeout_tasks:
            return

        timeout_seconds = float(resolve_wait_duration(successor, self._runtime_settings))
        workflow.logger.info(f"Starting converge timeout for {node_id}: {timeout_seconds}s")

        self._timeout_tasks[node_id] = asyncio.create_task(
            self._converge_timeout_handler(node_id, graph, timeout_seconds, pending_tasks)
        )

    async def _converge_timeout_handler(
        self,
        node_id: str,
        graph: WorkflowGraph,
        timeout_seconds: float,
        pending_tasks: dict[str, asyncio.Task[Any]],
    ) -> None:
        """Background task that waits for converge predecessors or fires a timeout.

        Behavior depends on the node's ``on_timeout`` config:

        - ``"continue"``: skips incomplete predecessors and signals the main loop
          to schedule the converge node with partial results.
        - ``"fail"`` (default): marks the converge node as failed and skips
          all downstream nodes.
        """
        try:
            timed_out = False
            try:
                await workflow.wait_condition(
                    lambda cid=node_id: self._are_predecessors_complete(cid, graph),  # type: ignore[misc]
                    timeout=timedelta(seconds=timeout_seconds),
                )
            except TimeoutError:
                timed_out = True

            if timed_out:
                node = graph.get_node(node_id)
                on_timeout = node.config.get("on_timeout", "fail")

                if on_timeout == "continue":
                    reason = f"timeout after {timeout_seconds}s"
                    self._skip_incomplete_predecessors(node_id, graph, reason, pending_tasks)
                    self._timed_out_converge_nodes.add(node_id)
                else:
                    error_msg = f"Converge node {node_id} timed out after {timeout_seconds}s waiting for predecessors"
                    workflow.logger.error(error_msg)
                    self._fail_converge_node(node_id, error_msg, graph, pending_tasks)
        except Exception as exc:  # noqa: BLE001
            error_msg = f"Converge timeout handler error for {node_id}: {exc}"
            workflow.logger.error(error_msg)
            self._fail_converge_node(node_id, error_msg, graph, pending_tasks)

    def _skip_incomplete_predecessors(
        self,
        node_id: str,
        graph: WorkflowGraph,
        reason: str,
        pending_tasks: dict[str, asyncio.Task[Any]],
    ) -> None:
        """Mark incomplete predecessors of a converge node as skipped.

        Used both when a converge timeout fires and when an 'any' strategy
        converge node has met its n_required threshold.

        Args:
            node_id: Converge node whose predecessors to check
            graph: Workflow graph
            reason: Human-readable reason for the skip (included in log messages)
            pending_tasks: Currently executing node tasks (in-flight nodes are not skipped)

        """
        newly_skipped = []
        for pred_id in graph.get_predecessors(node_id):
            if pred_id not in self.skipped_nodes and not self.resolver.has_namespace(pred_id):
                if pred_id in pending_tasks:
                    workflow.logger.info(f"Converge: predecessor {pred_id} is still in flight, not skipping")
                    continue
                self.skipped_nodes.add(pred_id)
                newly_skipped.append(pred_id)
                workflow.logger.info(f"Converge: predecessor {pred_id} skipped ({reason})")
        for pred_id in newly_skipped:
            self._mark_downstream_as_skipped(pred_id, graph)
