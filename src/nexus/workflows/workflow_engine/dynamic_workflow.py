"""V2 workflow execution engine with concurrent execution and convergence support.

Parallelism is implicit - when multiple edges originate from the same port (or node),
downstream nodes execute concurrently. No dedicated parallel node type is needed.
"""

import asyncio
import collections
import copy
import json
from datetime import timedelta
from typing import Any, ClassVar, cast

from temporalio import workflow
from temporalio.exceptions import ActivityError, ApplicationError

with workflow.unsafe.imports_passed_through():
    from nexus.core.exceptions import SafeValueError
    from nexus.workflows.workflow_engine.activities.credential_resolution_activity import resolve_workflow_credentials
    from nexus.workflows.workflow_engine.constants import DEFAULT_AAP_TIMEOUT_SECONDS
    from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName
    from nexus.workflows.workflow_engine.utils.credential_scrubber import scrub_credentials

from nexus.workflows.utils.namespace_resolver import NamespaceResolver
from nexus.workflows.workflow_engine.graph import ActivityNode, WorkflowGraph
from nexus.workflows.workflow_engine.models.workflow_definition import (
    ConvergeStrategy,
    DoWhileLoopState,
    ForEachLoopState,
    LoopState,
    LoopType,
    NodeType,
)
from nexus.workflows.workflow_engine.unified_eval import safe_eval_with_namespace

# Trigger types allowed for dynamic dispatch via Temporal activities.
# Each entry must have a corresponding @activity.defn with a matching name.
ALLOWED_TRIGGER_TYPES: set[str] = {
    ActivityName.MANUAL_TRIGGER,
    ActivityName.WEBHOOK_TRIGGER,
}

# Temporal start-to-close safety ceiling for activities that don't specify a timeout.
# Each node type has its own configurable timeout in Settings; this is only the
# Temporal-level fallback to prevent activities from running indefinitely.
DEFAULT_ACTIVITY_TIMEOUT_SECONDS = 30

# Fallback for agentic activities. The runtime setting
# workflow_engine.agentic_timeout_seconds overrides this via
# resolved_config["timeout"] when present.
DEFAULT_AGENTIC_TIMEOUT_SECONDS = 300

# Marker value for pre-resolved node inputs in test executions
PRE_RESOLVED_MARKER = "__pre_resolved"
_APPROVAL_COMMENTS_MAX_LENGTH = 2000  # matches ApprovalDecisionRequest.notes max_length


def _parse_items(items: Any) -> Any:  # noqa: ANN401
    """Parse loop items from string JSON to a list if needed."""
    if isinstance(items, str):
        try:
            return json.loads(items)
        except (json.JSONDecodeError, ValueError):
            return items
    return items


@workflow.defn(name="nexus_workflow")
class NexusWorkflow:
    """Temporal workflow for executing v2 graph-based workflows."""

    @workflow.run
    async def run(
        self,
        workflow_definition: dict[str, Any],
        execution_id: str,
        trigger_node_id: str,
        trigger_inputs: dict[str, Any],
        include_node_results: bool = False,  # noqa: FBT001, FBT002
        request_id: str | None = None,
        pre_resolved_outputs: dict[str, dict[str, Any]] | None = None,
        stop_after_nodes: list[str] | None = None,
    ) -> dict[str, Any]:
        """Execute a v2 workflow with concurrent execution and convergence support.

        Concurrent execution is implicit - when multiple edges originate from the same port,
        downstream nodes execute concurrently.

        Args:
            workflow_definition: Complete v2 workflow definition (triggers + nodes + edges)
            execution_id: Internal execution identifier
            trigger_node_id: ID of the trigger node to execute
            trigger_inputs: User-provided inputs for the trigger
            include_node_results: Whether to include full node results in return value (default: False for production)
            request_id: Optional X-Request-Id (UUID) from the originating HTTP request
            pre_resolved_outputs: Optional dict mapping node IDs to pre-computed outputs for single-node testing
            stop_after_nodes: Optional list of node IDs to stop scheduling successors after execution

        Returns:
            Workflow execution result matching WorkflowResultResponse schema.
            If include_node_results=True, includes full node results for debugging.

        """
        # Note: Activity monitoring (register_activity_monitoring) should be called
        # by the application code BEFORE starting the workflow execution.
        # This keeps the workflow logic independent of infrastructure concerns.
        graph = WorkflowGraph.from_dict(workflow_definition)
        self._initialize_state(
            execution_id,
            request_id=request_id,
            pre_resolved_outputs=pre_resolved_outputs,
            stop_after_nodes=stop_after_nodes,
        )

        pending_tasks: dict[str, asyncio.Task[Any]] = {}
        await self._execute_trigger(trigger_node_id, trigger_inputs, graph, pending_tasks)
        await self._process_pending_tasks(pending_tasks, graph)
        self._cleanup_timeout_tasks()
        self._mark_remaining_unreachable_nodes(graph)

        return self._build_result(execution_id, include_node_results)

    def _initialize_state(
        self,
        execution_id: str,
        request_id: str | None = None,
        pre_resolved_outputs: dict[str, dict[str, Any]] | None = None,
        stop_after_nodes: list[str] | None = None,
    ) -> None:
        """Initialize all workflow state for a new execution."""
        self.execution_id = execution_id
        self.request_id = request_id
        self.resolver = NamespaceResolver()
        self.node_inputs: dict[str, dict[str, Any]] = {}
        self.node_control_data: dict[str, dict[str, Any]] = {}
        self.skipped_nodes: set[str] = set()
        self.failed_nodes: dict[str, str] = {}
        self.loop_state: dict[str, LoopState] = {}
        self.loop_body_map: dict[str, str] = {}
        self.loop_iteration_results: dict[str, dict[str, list[Any]]] = {}
        self._timeout_tasks: dict[str, asyncio.Task[Any]] = {}
        self._timed_out_converge_nodes: set[str] = set()
        self._detached_nodes: set[str] = set()
        self.pre_resolved_outputs: dict[str, dict[str, Any]] = pre_resolved_outputs or {}
        self.stop_after_nodes: set[str] = set(stop_after_nodes) if stop_after_nodes else set()

    def _skip_unselected_triggers(self, trigger_node_id: str, graph: WorkflowGraph) -> None:
        """Mark unselected triggers as skipped and propagate to their exclusive downstream nodes."""
        for other_trigger in graph.get_trigger_nodes():
            if other_trigger.id != trigger_node_id:
                self.skipped_nodes.add(other_trigger.id)
                workflow.logger.info(f"Trigger {other_trigger.id} marked as skipped (not selected)")
                self._mark_downstream_as_skipped(other_trigger.id, graph)

    async def _execute_trigger(
        self,
        trigger_node_id: str,
        trigger_inputs: dict[str, Any],
        graph: WorkflowGraph,
        pending_tasks: dict[str, asyncio.Task[Any]],
    ) -> None:
        """Execute the trigger node and schedule its successors."""
        trigger_node = graph.get_node(trigger_node_id)
        workflow.logger.info(f"Executing trigger node: {trigger_node.id} (type={trigger_node.type})")

        self._skip_unselected_triggers(trigger_node_id, graph)

        self.node_inputs[trigger_node.id] = trigger_inputs

        # Validate trigger type against allowlist to prevent arbitrary activity dispatch
        if trigger_node.type not in ALLOWED_TRIGGER_TYPES:
            msg = (
                f"Invalid trigger type '{trigger_node.type}'. Allowed types: {', '.join(sorted(ALLOWED_TRIGGER_TYPES))}"
            )
            raise SafeValueError(msg)

        # Dispatch dynamically by trigger type (activity name matches node type for triggers)
        trigger_result = await workflow.execute_activity(
            trigger_node.type,
            args=[trigger_inputs, trigger_node.outputs],
            activity_id=trigger_node.id,
            start_to_close_timeout=timedelta(seconds=DEFAULT_ACTIVITY_TIMEOUT_SECONDS),
        )

        trigger_output = trigger_result.get("output", trigger_result)
        self.resolver.set_namespace("trigger", trigger_output)
        self.resolver.set_namespace(trigger_node.id, trigger_output)

        await self._schedule_successors(
            completed_node_id=trigger_node.id,
            graph=graph,
            pending_tasks=pending_tasks,
        )

    async def _process_pending_tasks(
        self,
        pending_tasks: dict[str, asyncio.Task[Any]],
        graph: WorkflowGraph,
    ) -> None:
        """Wait for all pending tasks to complete, scheduling successors as they finish."""
        while pending_tasks or self._timed_out_converge_nodes:
            # Cancel pending tasks for nodes that were skipped (by timeout or "any" converge)
            self._cancel_skipped_pending_tasks(pending_tasks)
            # Remove in-flight tasks detached by a converge fail (don't cancel, just unblock the loop)
            self._remove_detached_tasks(pending_tasks)

            # Schedule any converge nodes whose timeout handlers fired
            for node_id in list(self._timed_out_converge_nodes):
                self._timed_out_converge_nodes.discard(node_id)
                if node_id not in pending_tasks:
                    node = graph.get_node(node_id)
                    workflow.logger.info(f"Scheduling converge node {node_id} after timeout")
                    task = asyncio.create_task(self._execute_node(node=node, graph=graph))
                    pending_tasks[node_id] = task

            if not pending_tasks:
                break

            # Include timeout tasks so asyncio.wait wakes up when a timeout fires,
            # rather than blocking until a pending node completes.
            wait_tasks = set(pending_tasks.values())
            for timeout_task in self._timeout_tasks.values():
                if not timeout_task.done():
                    wait_tasks.add(timeout_task)

            done, _ = await asyncio.wait(wait_tasks, return_when=asyncio.FIRST_COMPLETED)

            for task in done:
                completed_node_id = self._find_node_for_task(task, pending_tasks)
                if not completed_node_id:
                    continue

                del pending_tasks[completed_node_id]

                try:
                    output = await task
                    # _execute_node already extracted output via _process_node_result,
                    # so output is the output data directly (not wrapped in {"output": ...})
                    self.resolver.set_namespace(completed_node_id, output)

                    workflow.logger.info(f"Node {completed_node_id} completed, pending: {list(pending_tasks.keys())}")

                    await self._schedule_successors(
                        completed_node_id=completed_node_id,
                        graph=graph,
                        pending_tasks=pending_tasks,
                    )
                    self._cancel_skipped_pending_tasks(pending_tasks)
                except Exception as node_error:  # noqa: BLE001
                    self._handle_node_failure(completed_node_id, node_error, graph)

    @staticmethod
    def _find_node_for_task(
        task: asyncio.Task[Any],
        pending_tasks: dict[str, asyncio.Task[Any]],
    ) -> str | None:
        """Find the node ID associated with a completed task."""
        for nid, t in pending_tasks.items():
            if t == task:
                return nid
        return None

    def _handle_node_failure(
        self,
        node_id: str,
        error: Exception,
        graph: WorkflowGraph,
    ) -> None:
        """Record a node failure and mark downstream nodes as skipped."""
        # Unwrap Temporal's ActivityError to surface the inner ApplicationError message
        if isinstance(error, ActivityError) and isinstance(error.cause, ApplicationError):
            error_message = error.cause.message or str(error.cause)
        else:
            error_message = str(error)
        self.failed_nodes[node_id] = error_message
        self.resolver.set_namespace(node_id, {"status": "failed", "error": error_message})
        workflow.logger.error(f"Node {node_id} failed: {error_message}")
        self._mark_downstream_as_skipped(node_id, graph)

    def _cancel_skipped_pending_tasks(self, pending_tasks: dict[str, asyncio.Task[Any]]) -> None:
        """Cancel pending tasks for nodes that were marked as skipped."""
        skipped_pending = [nid for nid in pending_tasks if nid in self.skipped_nodes]
        for nid in skipped_pending:
            pending_tasks[nid].cancel()
            del pending_tasks[nid]
            workflow.logger.info(f"Cancelled pending task for skipped node {nid}")

    def _remove_detached_tasks(self, pending_tasks: dict[str, asyncio.Task[Any]]) -> None:
        """Remove detached in-flight tasks from the main loop without cancelling them.

        When a converge node fails on timeout, in-flight predecessors should keep
        running in Temporal but no longer block the workflow from completing.
        """
        detached = [nid for nid in pending_tasks if nid in self._detached_nodes]
        for nid in detached:
            del pending_tasks[nid]
            workflow.logger.info(f"Detached in-flight node {nid} from main loop (converge failed)")

    def _cleanup_timeout_tasks(self) -> None:
        """Cancel any remaining converge timeout background tasks."""
        for task in self._timeout_tasks.values():
            task.cancel()
        self._timeout_tasks.clear()

    def _build_result(self, execution_id: str, include_node_results: bool) -> dict[str, Any]:  # noqa: FBT001
        """Build the final workflow execution result."""
        node_outputs = self.resolver.get_all_namespaces()
        workflow_status = "failed" if self.failed_nodes else "completed"
        return {
            "status": workflow_status,
            "execution_id": execution_id,
            "activity_outputs": node_outputs if include_node_results else {},
            "activity_inputs": self.node_inputs if include_node_results else {},
            "completed_activities": list(node_outputs.keys()),
            "failed_activities": self.failed_nodes,
        }

    async def _schedule_successors(
        self,
        completed_node_id: str,
        graph: WorkflowGraph,
        pending_tasks: dict[str, asyncio.Task[Any]],
    ) -> None:
        """Schedule successor nodes for execution if their dependencies are met.

        For control flow nodes (condition, loop), uses control data to determine
        which output port to follow.

        Args:
            completed_node_id: Node that just completed
            graph: Workflow graph
            pending_tasks: Currently executing tasks

        """
        from_port = self._determine_output_port(completed_node_id)
        completed_node = graph.get_node(completed_node_id)

        # Control-flow nodes must always have routing port data
        if from_port is None and completed_node.type in (
            NodeType.CONDITION,
            NodeType.LOOP,
            NodeType.APPROVAL,
            NodeType.SWITCH,
        ):
            workflow.logger.warning(
                f"Control-flow node {completed_node_id} (type={completed_node.type}) "
                f"has no routing port — returning all successors"
            )

        # Handle branch skipping for control-flow nodes
        if from_port and completed_node.type in (NodeType.CONDITION, NodeType.APPROVAL, NodeType.SWITCH):
            self._skip_non_taken_branches(completed_node_id, from_port, graph)

        # Stop after nodes: return after branch-skipping but before scheduling successors
        if completed_node_id in self.stop_after_nodes:
            return

        successors = graph.get_next_activities_by_port(completed_node_id, from_port)
        is_loop_iterate = completed_node.type == NodeType.LOOP and from_port == "iterate"

        if is_loop_iterate:
            self._setup_loop_namespace(completed_node_id)

        for successor in successors:
            # Track loop body membership (side effect, separate from skip check)
            self._track_loop_body(successor.id, completed_node_id, is_loop_iterate)

            if self._should_skip_successor(successor, completed_node_id, is_loop_iterate, pending_tasks, graph):
                continue

            # All dependencies met — schedule execution
            workflow.logger.info(f"Scheduling node: {successor.id} (type: {successor.type})")
            task = asyncio.create_task(self._execute_node(node=successor, graph=graph))
            pending_tasks[successor.id] = task

        # Check if a loop body just completed and needs re-iteration
        self._check_loop_body_completion(completed_node_id, graph, pending_tasks)

    def _skip_non_taken_branches(
        self,
        condition_node_id: str,
        taken_port: str,
        graph: WorkflowGraph,
    ) -> None:
        """Mark successors on non-taken condition branches as skipped."""
        workflow.logger.info(f"Condition node {condition_node_id} routing via port: {taken_port}")
        for edge in graph.get_outgoing_edges(condition_node_id):
            edge_port = edge.get("from_port")
            if edge_port and edge_port != taken_port:
                skipped_successor = edge["to"]
                if skipped_successor not in self.skipped_nodes:
                    self.skipped_nodes.add(skipped_successor)
                    workflow.logger.info(
                        f"Node {skipped_successor} marked as skipped (on non-taken port '{edge_port}')"
                    )
                    self._mark_downstream_as_skipped(skipped_successor, graph)

    def _setup_loop_namespace(self, loop_node_id: str) -> None:
        """Set up the loop namespace with current iteration data."""
        control_data = self.node_control_data.get(loop_node_id, {})
        loop_data: dict[str, Any] = {"index": control_data.get("current_index")}
        if control_data.get("current_item") is not None:
            loop_data["item"] = control_data["current_item"]

        if not self.resolver.has_namespace("loop"):
            self.resolver.set_namespace("loop", {})
        self.resolver.get_namespace("loop")[loop_node_id] = loop_data
        workflow.logger.info(f"Set loop namespace loop.{loop_node_id}: {loop_data}")

    def _track_loop_body(self, successor_id: str, completed_node_id: str, is_loop_iterate: bool) -> None:  # noqa: FBT001
        """Track loop body membership for a successor node."""
        if is_loop_iterate:
            self.loop_body_map[successor_id] = completed_node_id
        elif completed_node_id in self.loop_body_map:
            parent_loop_id = self.loop_body_map[completed_node_id]
            self.loop_body_map[successor_id] = parent_loop_id
            workflow.logger.info(f"Node {successor_id} transitively marked as loop body of {parent_loop_id}")

    def _should_skip_successor(
        self,
        successor: ActivityNode,
        completed_node_id: str,
        is_loop_iterate: bool,  # noqa: FBT001
        pending_tasks: dict[str, asyncio.Task[Any]],
        graph: WorkflowGraph,
    ) -> bool:
        """Check whether a successor should be skipped (not scheduled).

        Side effects: starts a converge timeout task if configured, and marks
        remaining predecessors as skipped when an 'any' converge is satisfied.
        """
        node_id = successor.id

        if node_id in self.skipped_nodes:
            return True

        if node_id in pending_tasks:
            return True

        # Skip already-executed nodes (unless loop body re-execution)
        if self.resolver.has_namespace(node_id) and not is_loop_iterate and completed_node_id not in self.loop_body_map:
            return True

        # Converge nodes wait for predecessors per their strategy
        if successor.type == NodeType.CONVERGE and not self._are_predecessors_complete(node_id, graph):
            self._handle_converge_wait(node_id, successor, graph, pending_tasks)
            return True

        # When "any" converge is satisfied, skip remaining incomplete predecessors
        if successor.type == NodeType.CONVERGE and successor.config.get("strategy") == ConvergeStrategy.ANY:
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

        converge_timeout = successor.config.get("timeout")
        if converge_timeout is None or node_id in self._timeout_tasks:
            return

        try:
            timeout_seconds = float(converge_timeout)
        except (ValueError, TypeError):
            workflow.logger.warning(
                f"Invalid converge timeout value for {node_id}: {converge_timeout!r}, skipping timeout"
            )
            return
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
                self._skip_incomplete_predecessors(node_id, graph, f"timeout after {timeout_seconds}s", pending_tasks)

                if on_timeout == "continue":
                    self._timed_out_converge_nodes.add(node_id)
                else:
                    error_msg = f"Converge node {node_id} timed out after {timeout_seconds}s waiting for predecessors"
                    workflow.logger.error(error_msg)
                    self.failed_nodes[node_id] = error_msg
                    self.resolver.set_namespace(node_id, {"status": "failed", "error": error_msg})
                    self._mark_downstream_as_skipped(node_id, graph)
                    for pred_id in graph.get_predecessors(node_id):
                        if pred_id in pending_tasks and not self.resolver.has_namespace(pred_id):
                            self._detached_nodes.add(pred_id)
        except Exception as exc:  # noqa: BLE001
            error_msg = f"Converge timeout handler error for {node_id}: {exc}"
            workflow.logger.error(error_msg)
            self.failed_nodes[node_id] = error_msg
            self.resolver.set_namespace(node_id, {"status": "failed", "error": error_msg})
            self._mark_downstream_as_skipped(node_id, graph)
            for pred_id in graph.get_predecessors(node_id):
                if pred_id in pending_tasks and not self.resolver.has_namespace(pred_id):
                    self._detached_nodes.add(pred_id)

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

    def _check_loop_body_completion(
        self,
        completed_node_id: str,
        graph: WorkflowGraph,
        pending_tasks: dict[str, asyncio.Task[Any]],
    ) -> None:
        """Check if a loop body just completed and the loop should re-iterate."""
        if completed_node_id not in self.loop_body_map:
            return

        parent_loop_id = self.loop_body_map[completed_node_id]
        if self._loop_body_complete(parent_loop_id) and not self._loop_has_pending_nodes(parent_loop_id, pending_tasks):
            self._clear_loop_body(parent_loop_id)
            loop_node = graph.get_node(parent_loop_id)
            workflow.logger.info(f"Re-executing loop node: {parent_loop_id}")
            task = asyncio.create_task(self._execute_node(node=loop_node, graph=graph))
            pending_tasks[parent_loop_id] = task

    def _determine_output_port(self, node_id: str) -> str | None:
        """Determine which output port to follow based on control data.

        Control flow nodes (condition, loop) include routing information in their
        control data. This method extracts the "next_port" field to determine
        which edges to follow.

        Args:
            node_id: Node that just completed

        Returns:
            Port name to follow (e.g., "true", "false", "iterate", "complete"),
            or None for nodes without port-based routing (executor nodes)

        """
        control_data = self.node_control_data.get(node_id)

        if control_data and "next_port" in control_data:
            return str(control_data["next_port"])

        # No control data = no port-based routing (regular executor node)
        return None

    def _are_predecessors_complete(self, node_id: str, graph: WorkflowGraph) -> bool:
        """Check if predecessors of a converge node satisfy its convergence strategy.

        Strategy "all" (default): waits for every predecessor to complete or be skipped.
        Strategy "any": waits for at least ``n_required`` predecessors to complete.

        For conditional branching, skipped predecessors (on non-taken branches)
        are ignored using transitive skip detection.

        Args:
            node_id: Converge node ID to check
            graph: Workflow graph

        Returns:
            True if the convergence condition is satisfied

        """
        predecessor_ids = graph.get_predecessors(node_id)
        node = graph.get_node(node_id)
        strategy = node.config.get("strategy", ConvergeStrategy.ALL)
        n_required = node.config.get("n_required")

        completed_count = 0
        reachable_count = 0

        for pred_id in predecessor_ids:
            if pred_id in self.skipped_nodes:
                continue

            if self.resolver.has_namespace(pred_id):
                completed_count += 1
                reachable_count += 1
                continue

            if self._is_unreachable(pred_id, graph):
                self.skipped_nodes.add(pred_id)
                workflow.logger.info(f"Node {pred_id} marked as skipped (transitively unreachable)")
                continue

            # Predecessor is still running (reachable but not yet completed)
            reachable_count += 1

            if strategy == ConvergeStrategy.ALL:
                return False

        if strategy == ConvergeStrategy.ANY:
            if n_required is None:
                workflow.logger.error(f"Converge node {node_id} has strategy='any' but no n_required")
                return False
            # Clamp against reachable (non-skipped) predecessors so the converge
            # can still fire when condition branches eliminate some predecessors.
            n_req = int(n_required)
            n_req = min(n_req, reachable_count)
            return completed_count >= n_req

        return True

    def _is_unreachable(self, node_id: str, graph: WorkflowGraph) -> bool:
        """Check if a node is unreachable due to all predecessors being skipped.

        A node is unreachable if every path from it back to a root passes through
        a skipped or failed node. The algorithm does a backwards DFS from node_id.

        A completed predecessor proves reachability only if there is still a
        forward path from it to node_id through non-skipped/non-failed nodes.
        Without that check, a completed node on a different condition branch
        could falsely indicate reachability.

        Args:
            node_id: Node to check
            graph: Workflow graph

        Returns:
            True if node is unreachable (all paths blocked by skipped/failed nodes)

        """
        visited: set[str] = set()
        stack = [node_id]

        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)

            if current in self.skipped_nodes or current in self.failed_nodes:
                continue  # This path is blocked, check remaining paths

            # A completed predecessor proves reachability only if it can
            # actually reach node_id through non-blocked edges.  We verify
            # this with a forward has_path check (cheap for nearby nodes).
            if current != node_id and self.resolver.has_namespace(current) and current not in self.failed_nodes:
                if graph.has_forward_path(current, node_id, self.skipped_nodes | set(self.failed_nodes.keys())):
                    return False
                # Completed but no forward path to target — keep searching
                continue

            predecessors = graph.get_predecessors(current)
            if not predecessors:
                # Reached a root node that is not skipped/failed → reachable
                return False

            stack.extend(predecessors)

        # All explored paths lead to skipped/failed nodes → unreachable
        return True

    def _mark_downstream_as_skipped(self, start_node_id: str, graph: WorkflowGraph) -> None:
        """Eagerly mark downstream nodes as skipped via BFS propagation.

        Starting from a skipped node, propagate the skipped status to all
        downstream nodes whose ALL predecessors are already skipped.

        Args:
            start_node_id: Node that was just marked as skipped
            graph: Workflow graph

        """
        queue = collections.deque([start_node_id])

        while queue:
            node_id = queue.popleft()

            # Get all immediate successors
            successors = graph.get_successors(node_id)
            for succ_id in successors:
                # Skip if already processed
                if succ_id in self.skipped_nodes or self.resolver.has_namespace(succ_id):
                    continue

                # Check if ALL predecessors of this successor are skipped or failed
                pred_ids = graph.get_predecessors(succ_id)
                all_skipped = all(pred_id in self.skipped_nodes or pred_id in self.failed_nodes for pred_id in pred_ids)

                if all_skipped:
                    self.skipped_nodes.add(succ_id)
                    workflow.logger.info(f"Node {succ_id} marked as skipped (all predecessors skipped)")
                    queue.append(succ_id)  # Propagate further

    def _mark_remaining_unreachable_nodes(self, graph: WorkflowGraph) -> None:
        """Mark any remaining unreachable nodes as skipped.

        After workflow execution completes, any node that wasn't executed
        must be unreachable and should be marked as skipped.

        This catches any nodes that weren't marked during eager propagation due
        to timing (e.g., when branches converge and one branch finishes before
        the other starts).

        Args:
            graph: Workflow graph

        """
        # Get all activity nodes (excluding triggers)
        all_nodes = [node for node in graph.get_all_nodes() if not node.type.endswith("_trigger")]

        for node in all_nodes:
            node_id = node.id

            # Skip if already executed, marked, or detached (still running in Temporal)
            if self.resolver.has_namespace(node_id) or node_id in self.skipped_nodes:
                continue
            if node_id in self._detached_nodes:
                continue

            # If workflow is done and node didn't execute, it's unreachable
            self.skipped_nodes.add(node_id)
            workflow.logger.info(f"Node {node_id} marked as skipped (final pass - unreachable)")

    def _loop_body_complete(self, loop_id: str) -> bool:
        """Check if all loop body nodes have completed.

        For nested loops: a loop node in the body is only considered complete
        if its last routing was to the "complete" port (not "iterate").

        Args:
            loop_id: Loop node ID

        Returns:
            True if all loop body nodes have completed

        """
        # Find all loop body nodes (those mapped to this loop)
        loop_body_nodes = [node_id for node_id, parent in self.loop_body_map.items() if parent == loop_id]

        if not loop_body_nodes:
            # No body nodes tracked — either the body was already cleared for
            # re-iteration (normal), or all body nodes were skipped. In both
            # cases, return False so we don't trigger a spurious re-iteration;
            # _check_loop_body_completion already handles the cleared case.
            return False

        # Check if all have completed
        for node_id in loop_body_nodes:
            if not self.resolver.has_namespace(node_id):
                return False

            # If this body node is itself a loop, check that it finished all iterations
            # (routed to "complete" port on its last execution)
            control_data = self.node_control_data.get(node_id, {})
            if control_data.get("next_port") == "iterate":
                # This loop is still iterating, so the parent loop body is NOT complete
                return False

        return True

    def _loop_has_pending_nodes(self, loop_id: str, pending_tasks: dict[str, asyncio.Task[Any]]) -> bool:
        """Check if any loop body nodes are still pending execution.

        Args:
            loop_id: Loop node ID
            pending_tasks: Currently executing tasks

        Returns:
            True if any loop body nodes are pending

        """
        # Find all loop body nodes
        loop_body_nodes = [node_id for node_id, parent in self.loop_body_map.items() if parent == loop_id]

        return any(node_id in pending_tasks for node_id in loop_body_nodes)

    def _clear_loop_body(self, loop_id: str) -> None:
        """Clear loop body nodes from tracking to allow re-execution.

        Collects iteration results for aggregation. Results remain in resolver
        for query access (sync service), and the last iteration's result persists.

        Args:
            loop_id: Loop node ID

        """
        # Initialize iteration_results for this loop if not exists
        if loop_id not in self.loop_iteration_results:
            self.loop_iteration_results[loop_id] = {}

        # Find all loop body nodes
        loop_body_nodes = [node_id for node_id, parent in self.loop_body_map.items() if parent == loop_id]

        # Collect iteration results for aggregation
        loop_results = self.loop_iteration_results[loop_id]

        for node_id in loop_body_nodes:
            if not self.resolver.has_namespace(node_id):
                continue  # Skip nodes that didn't execute (e.g., skipped by condition)
            node_result = self.resolver.get_namespace(node_id)
            if isinstance(node_result, dict):
                for field_name, field_value in node_result.items():
                    namespaced_key = f"{node_id}.{field_name}"
                    if namespaced_key not in loop_results:
                        loop_results[namespaced_key] = []
                    loop_results[namespaced_key].append(field_value)

        # Clear from loop_body_map to allow fresh tracking on next iteration
        # Results stay in resolver for query access
        for node_id in loop_body_nodes:
            del self.loop_body_map[node_id]

        workflow.logger.info(f"Cleared {len(loop_body_nodes)} loop body nodes from tracking for loop {loop_id}")

    # Mapping from node type to (activity_name, default_timeout_seconds).
    # Approval is NOT in this map — it needs custom args and routing logic.
    _EXECUTOR_ACTIVITY_MAP: ClassVar[dict[str, tuple[str, int]]] = {
        NodeType.AAP_JOB_TEMPLATE: (ActivityName.AAP_JOB_TEMPLATE, DEFAULT_AAP_TIMEOUT_SECONDS),
        NodeType.AAP_WORKFLOW_JOB_TEMPLATE: (ActivityName.AAP_WORKFLOW_JOB_TEMPLATE, DEFAULT_AAP_TIMEOUT_SECONDS),
        NodeType.HTTP_REQUEST: (ActivityName.HTTP_REQUEST, DEFAULT_ACTIVITY_TIMEOUT_SECONDS),
        NodeType.SCRIPT: (ActivityName.SCRIPT, DEFAULT_ACTIVITY_TIMEOUT_SECONDS),
        NodeType.CONDITION: (ActivityName.CONDITION, DEFAULT_ACTIVITY_TIMEOUT_SECONDS),
        NodeType.SWITCH: (ActivityName.SWITCH, DEFAULT_ACTIVITY_TIMEOUT_SECONDS),
        NodeType.AGENTIC: (ActivityName.AGENTIC, DEFAULT_AGENTIC_TIMEOUT_SECONDS),
    }

    async def _execute_executor_node(
        self,
        node_id: str,
        node_type: str,
        resolved_config: dict[str, Any],
        outputs: dict[str, str] | None,
        timeout_seconds: int = DEFAULT_ACTIVITY_TIMEOUT_SECONDS,
        extra_args: list[Any] | None = None,
    ) -> dict[str, Any]:
        """Execute an executor node via the activity map.

        Args:
            node_id: Node ID
            node_type: Node type
            resolved_config: Resolved configuration
            outputs: Output mapping configuration
            timeout_seconds: Activity timeout in seconds (default: DEFAULT_ACTIVITY_TIMEOUT_SECONDS)
            extra_args: Additional positional args appended after [resolved_config, outputs]

        Returns:
            Activity result with output and optional control data

        """
        entry = self._EXECUTOR_ACTIVITY_MAP.get(node_type)
        if not entry:
            return {"output": {"status": "skipped", "reason": f"Unknown executor type: {node_type}"}}

        activity_name, _ = entry
        args: list[Any] = [resolved_config, outputs]
        if extra_args:
            args.extend(extra_args)

        return cast(
            "dict[str, Any]",
            await workflow.execute_activity(
                activity_name,
                args=args,
                activity_id=node_id,
                start_to_close_timeout=timedelta(seconds=timeout_seconds),
            ),
        )

    def _get_previous_step_context(
        self,
        node_id: str,
        graph: "WorkflowGraph",
    ) -> dict[str, Any] | None:
        """Build previous_step context for an approval request.

        Finds the predecessor node in the graph and returns its ID, name, type,
        and output for inclusion in the approval's workflow_context.
        """
        predecessors = graph.get_predecessors(node_id)
        if not predecessors:
            return None
        prev_id = predecessors[0]
        prev_node = graph.get_node(prev_id)
        if prev_id in self.skipped_nodes:
            previous_output: dict[str, Any] | None = {"status": "skipped"}
        else:
            try:
                previous_output = self.resolver.get_namespace(prev_id)
            except KeyError:
                previous_output = None
        return {
            "id": prev_node.id,
            "name": prev_node.config.get("name", prev_node.id),
            "type": prev_node.type,
            "output": previous_output,
        }

    def _prepare_approval_args(
        self,
        node: "ActivityNode",
        graph: "WorkflowGraph",
        resolved_config: dict[str, Any],
    ) -> list[Any]:
        """Build the positional argument list for create_approval_request_activity.

        Returns a 7-element list matching the activity signature in
        ``approval_activity.create_approval_request_activity``::

            [0] execution_id:       str            — parent workflow execution ID
            [1] approval_node_id:   str            — activity ID from workflow definition
            [2] name:               str            — display name for the approval request
            [3] next_step_approved: dict[str, Any] | None — first activity if approved
            [4] workflow_context:   dict[str, Any]  — workflow name, inputs, previous step
            [5] timeout_at:         str | None      — ISO datetime when the request expires
            [6] next_step_rejected: dict[str, Any] | None — first activity if rejected

        """
        name = resolved_config.get("name") or f"Approval for {node.id}"

        # Build previous step context
        previous_step = self._get_previous_step_context(node.id, graph)

        # Build workflow context
        workflow_context = {
            # TODO(AAP-71408): Replace with actual workflow_version_id once threaded through run()  # noqa: TD003
            "workflow_version_id": "00000000-0000-0000-0000-000000000000",
            "workflow_name": graph.metadata.get("name") or "Unknown",
            "inputs": self.resolver.namespaces.get("trigger", {}),
            "previous_step": previous_step,
        }

        # Build next-step summaries from graph successors by port
        approved_successors = graph.get_next_activities_by_port(node.id, "approved")
        if not approved_successors:
            msg = (
                f"Approval node '{node.id}' has no approved successor. "
                "Approval nodes require at least one successor on the 'approved' output."
            )
            raise SafeValueError(msg)
        first_approved = approved_successors[0]
        next_step_approved = {
            "id": first_approved.id,
            "name": first_approved.config.get("name", first_approved.id),
            "type": first_approved.type,
            "config": first_approved.config,
        }

        rejected_successors = graph.get_next_activities_by_port(node.id, "rejected")
        next_step_rejected = None
        if rejected_successors:
            first_rejected = rejected_successors[0]
            next_step_rejected = {
                "id": first_rejected.id,
                "name": first_rejected.config.get("name", first_rejected.id),
                "type": first_rejected.type,
                "config": first_rejected.config,
            }

        # Compute timeout_at as ISO string (or None)
        timeout_seconds = resolved_config.get("approver_timeout")
        timeout_at = None
        if timeout_seconds is not None:
            try:
                timeout_at = (workflow.now() + timedelta(seconds=timeout_seconds)).isoformat()
            except (ValueError, TypeError):
                workflow.logger.warning(
                    "Invalid approver_timeout value %s for node %s, skipping timeout",
                    timeout_seconds,
                    node.id,
                )

        return [
            self.execution_id,
            node.id,
            name,
            next_step_approved,
            workflow_context,
            timeout_at,
            next_step_rejected,
        ]

    async def _execute_converge_node(
        self,
        node_id: str,
        resolved_config: dict[str, Any],
        outputs: dict[str, str] | None,
        graph: WorkflowGraph,
        timeout_seconds: int = DEFAULT_ACTIVITY_TIMEOUT_SECONDS,
    ) -> dict[str, Any]:
        """Execute a converge node.

        Args:
            node_id: Node ID
            resolved_config: Resolved configuration
            outputs: Output mapping configuration
            graph: Workflow graph
            timeout_seconds: Activity timeout in seconds (default: DEFAULT_ACTIVITY_TIMEOUT_SECONDS)

        Returns:
            Activity result with output and optional control data

        """
        predecessor_ids = graph.get_predecessors(node_id)
        predecessor_results = {}
        for pred_id in predecessor_ids:
            if pred_id not in self.skipped_nodes and self.resolver.has_namespace(pred_id):
                predecessor_results[pred_id] = self.resolver.get_namespace(pred_id)

        # total_branches is injected at runtime (not part of the user-facing config schema)
        # so the converge activity can distinguish branch_count from completed_count.
        config_with_counts = {**resolved_config, "total_branches": len(predecessor_ids)}

        return cast(
            "dict[str, Any]",
            await workflow.execute_activity(
                ActivityName.CONVERGE,
                args=[config_with_counts, outputs, predecessor_results],
                activity_id=node_id,
                start_to_close_timeout=timedelta(seconds=timeout_seconds),
            ),
        )

    async def _execute_loop_node(  # noqa: C901
        self,
        node_id: str,
        node: ActivityNode,
        resolved_config: dict[str, Any],
        timeout_seconds: int = DEFAULT_ACTIVITY_TIMEOUT_SECONDS,
    ) -> dict[str, Any]:
        """Execute a loop node.

        Args:
            node_id: Node ID
            node: Activity node
            resolved_config: Resolved configuration
            timeout_seconds: Activity timeout in seconds (default: DEFAULT_ACTIVITY_TIMEOUT_SECONDS)

        Returns:
            Activity result with output and control data

        """
        loop_type = resolved_config.get("type", LoopType.FOR_EACH)

        # Get or initialize loop state
        if node_id not in self.loop_state:
            if loop_type == LoopType.FOR_EACH:
                # First execution - extract items from config
                items = _parse_items(resolved_config.get("items", []))
                self.loop_state[node_id] = ForEachLoopState(items=items)
            elif loop_type == LoopType.DO_WHILE:
                # First execution - store condition and max_iterations
                self.loop_state[node_id] = DoWhileLoopState(
                    condition=node.config.get("condition"),  # Raw template, not resolved
                    max_iterations=resolved_config.get("max_iterations"),
                )

        # Initialize iteration results if not exists
        if node_id not in self.loop_iteration_results:
            self.loop_iteration_results[node_id] = {}

        state = self.loop_state[node_id]

        # For do_while, evaluate condition after first iteration
        condition_result = None
        if isinstance(state, DoWhileLoopState) and state.current_index > 0:
            # Set context for condition evaluation (loop body nodes are available)
            self.resolver.set_context(loop_node_id=node_id)

            # Validate that condition is defined
            if not state.condition:
                msg = f"Loop {node_id} (do_while) has no condition defined"
                raise ValueError(msg)

            # Use unified evaluator (Tier 2) instead of string substitution
            # Wrap in try/finally to guarantee loop context cleanup even if evaluation raises
            try:
                namespace = self.resolver.get_complete_namespace()
                condition_result = safe_eval_with_namespace(state.condition, namespace)
                workflow.logger.info(f"Loop {node_id} condition evaluated: {state.condition} = {condition_result}")
            finally:
                self.resolver.set_context(loop_node_id=None)

        # Pass current state to activity
        loop_config: dict[str, Any] = {
            "type": loop_type,
            "current_index": state.current_index,
        }

        if isinstance(state, ForEachLoopState):
            loop_config["items"] = state.items
        elif isinstance(state, DoWhileLoopState):
            loop_config["condition_result"] = condition_result
            if state.max_iterations is not None:
                loop_config["max_iterations"] = state.max_iterations

        loop_result = cast(
            "dict[str, Any]",
            await workflow.execute_activity(
                ActivityName.LOOP,
                args=[loop_config, node.outputs, self.loop_iteration_results[node_id]],
                activity_id=f"{node_id}_iter_{state.current_index}",
                start_to_close_timeout=timedelta(seconds=timeout_seconds),
            ),
        )

        # Update loop state from control data for next iteration
        control_data = loop_result.get("control", {})
        if control_data:
            state.current_index = control_data.get("next_index", 0)

        return loop_result

    async def _execute_node(
        self,
        node: ActivityNode,
        graph: WorkflowGraph,
    ) -> dict[str, Any]:
        """Execute a single node: resolve config, dispatch, process result.

        Args:
            node: ActivityNode to execute
            graph: Workflow graph

        Returns:
            Node execution result (output portion only, already mapped by activity)

        """
        # Pre-resolved outputs: skip execution and use mocked output
        if node.id in self.pre_resolved_outputs:
            self.node_inputs[node.id] = {PRE_RESOLVED_MARKER: True}
            return self._process_node_result(node, self.pre_resolved_outputs[node.id])

        node_id = node.id
        node_type = node.type

        # Special handling for condition nodes (Tier 2)
        if node_type == NodeType.CONDITION:
            # Set loop context if this node is inside a loop body
            self.resolver.set_context(loop_node_id=self.loop_body_map.get(node_id))

            resolved_config = {
                "condition": node.config.get("condition"),  # Raw template (preserved)
                "namespace": self.resolver.get_complete_namespace(),  # Complete namespace
            }
        elif node_type == NodeType.SWITCH:
            self.resolver.set_context(loop_node_id=self.loop_body_map.get(node_id))

            resolved_config = {
                "cases": node.config.get("cases", []),
                "default_port": node.config.get("default_port", "default"),
                "namespace": self.resolver.get_complete_namespace(),
            }
        else:
            # For all other nodes: standard resolution (Tier 1)
            resolved_config = self._resolve_node_config(node)

        _, default_timeout = self._EXECUTOR_ACTIVITY_MAP.get(node_type, (None, DEFAULT_ACTIVITY_TIMEOUT_SECONDS))
        timeout_seconds = cast("int", resolved_config.get("timeout", default_timeout))
        self.node_inputs[node.id] = copy.deepcopy(resolved_config)

        result = await self._dispatch_node(node, resolved_config, graph, timeout_seconds)
        return self._process_node_result(node, result)

    def _resolve_node_config(self, node: ActivityNode) -> dict[str, Any]:
        """Resolve template expressions in a node's config.

        Uses two-tier approach:
        - Tier 1 (template substitution): All fields except 'condition'
        - Tier 2 (context-aware): 'condition' field preserved for runtime evaluation

        For condition and loop nodes, the 'condition' field is kept as a raw template
        so it can be evaluated with namespace context at execution time.
        """
        self.resolver.set_context(loop_node_id=self.loop_body_map.get(node.id))

        # For nodes with 'condition' field: preserve it, resolve other fields (Tier 1)
        if node.type in (NodeType.CONDITION, NodeType.LOOP) and "condition" in node.config:
            return {
                key: value if key == "condition" else self.resolver.resolve_value(value)
                for key, value in node.config.items()
            }

        # For all other nodes: resolve everything (Tier 1)
        return self.resolver.resolve_dict(node.config)

    async def _resolve_and_inject_credentials(
        self,
        node: ActivityNode,
        resolved_config: dict[str, Any],
    ) -> None:
        """Resolve and inject Nexus credentials for a task node.

        If the node's config has a credential_id, calls the credential resolution
        activity to decrypt and inject resolved credentials into the config.
        """
        credential_id = resolved_config.get("credential_id")
        if not credential_id:
            return

        credential_map = {node.id: credential_id}
        resolved_creds = await workflow.execute_activity(
            resolve_workflow_credentials,
            args=[credential_map],
            activity_id="__internal__resolve_credentials",
            start_to_close_timeout=timedelta(seconds=DEFAULT_ACTIVITY_TIMEOUT_SECONDS),
        )

        if node.id in resolved_creds:
            resolved_config["_resolved_credentials"] = resolved_creds[node.id]

    @staticmethod
    def _scrub_activity_credentials(resolved_config: dict[str, Any]) -> None:
        """Remove resolved credentials from config after execution."""
        resolved_config.pop("_resolved_credentials", None)
        scrubbed = scrub_credentials(resolved_config)
        resolved_config.clear()
        resolved_config.update(scrubbed)

    async def _dispatch_node(
        self,
        node: ActivityNode,
        resolved_config: dict[str, Any],
        graph: WorkflowGraph,
        timeout_seconds: int,
    ) -> dict[str, Any]:
        """Dispatch a node to the appropriate execution handler.

        Resolves credentials before dispatch and scrubs them after execution.
        """
        # Resolve credentials if the node has a credential_id
        await self._resolve_and_inject_credentials(node, resolved_config)

        try:
            return await self._dispatch_node_to_executor(node, resolved_config, graph, timeout_seconds)
        finally:
            self._scrub_activity_credentials(resolved_config)

    async def _execute_approval_node(
        self,
        node: ActivityNode,
        graph: WorkflowGraph,
        resolved_config: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute an approval node and build the resultSchema output from the signal payload.

        Suspends via Temporal async completion until an external decision is received.
        Signal payload fields already match resultSchema names; this method picks
        them explicitly and adds status: "completed".
        """
        node_id = node.id
        approval_args = self._prepare_approval_args(node, graph, resolved_config)
        result = cast(
            "dict[str, Any]",
            await workflow.execute_activity(
                ActivityName.APPROVAL,
                args=approval_args,
                activity_id=node_id,
                # TODO(AAP-71386): Derive timeout from approver_timeout config  # noqa: TD003
                start_to_close_timeout=timedelta(hours=24),
            ),
        )
        raw = result.get("output", {})
        # Pick fields explicitly to match resultSchema; don't pass signal data through blindly.
        decision = raw.get("decision") if isinstance(raw, dict) else None
        output: dict[str, Any] = {
            "status": "completed",
            "decision": decision,
            "approver": raw.get("approver") if isinstance(raw, dict) else None,
            "timestamp": raw.get("timestamp") if isinstance(raw, dict) else None,
        }
        if isinstance(raw, dict) and raw.get("comments") is not None:
            output["comments"] = raw["comments"][:_APPROVAL_COMMENTS_MAX_LENGTH]
        result["output"] = output
        if decision in ("approved", "rejected"):
            workflow.logger.info(
                "Approval node %s decision: %s by %s",
                node_id,
                decision,
                output.get("approver"),
            )
            result["control"] = {"next_port": decision}
        else:
            result["control"] = {"next_port": "rejected"}
            workflow.logger.warning(
                "Approval node %s received unexpected decision %s, routing to rejected",
                node_id,
                decision,
            )
        return result

    async def _dispatch_node_to_executor(
        self,
        node: ActivityNode,
        resolved_config: dict[str, Any],
        graph: WorkflowGraph,
        timeout_seconds: int,
    ) -> dict[str, Any]:
        """Route node to the appropriate execution handler."""
        node_id = node.id
        node_type = node.type

        if node_type in self._EXECUTOR_ACTIVITY_MAP:
            extra_args = None
            if node_type == NodeType.AGENTIC:
                extra_args = [self.execution_id, self.request_id]
            return await self._execute_executor_node(
                node_id,
                node_type,
                resolved_config,
                node.outputs,
                timeout_seconds=timeout_seconds,
                extra_args=extra_args,
            )
        if node_type == NodeType.APPROVAL:
            return await self._execute_approval_node(node, graph, resolved_config)
        if node_type == NodeType.CONVERGE:
            return await self._execute_converge_node(
                node_id, resolved_config, node.outputs, graph, timeout_seconds=timeout_seconds
            )
        if node_type == NodeType.LOOP:
            return await self._execute_loop_node(node_id, node, resolved_config, timeout_seconds=timeout_seconds)

        return {"output": {"status": "skipped", "reason": f"Unsupported node type: {node_type}"}}

    def _process_node_result(self, node: ActivityNode, result: dict[str, Any]) -> dict[str, Any]:
        """Extract control data and output from an activity result."""
        control_data = result.get("control")
        if control_data:
            self.node_control_data[node.id] = control_data

        output_data = result.get("output", result)

        if isinstance(output_data, dict) and output_data.get("status") == "failed":
            workflow.logger.warning(
                f"Node {node.id} returned status=failed without raising — activity should raise ApplicationError",
                extra={"node_type": node.type},
            )

        workflow.logger.info(
            f"Node {node.id} executed",
            extra={
                "node_type": node.type,
                "has_outputs_config": node.outputs is not None,
                "output_data_keys": list(output_data.keys()) if isinstance(output_data, dict) else "not-a-dict",
            },
        )

        return cast("dict[str, Any]", output_data)

    @workflow.query
    def get_activity_input(self, activity_id: str) -> dict[str, Any] | None:
        """Query to get input data for a specific activity.

        This is consumed by ActivitySyncService to sync activity data to the database.

        Args:
            activity_id: Node ID to get input for

        Returns:
            Activity input data or None if not found

        """
        data = self.node_inputs.get(activity_id)
        if data is None:
            return None
        return cast("dict[str, Any]", scrub_credentials(data))

    @workflow.query
    def get_activity_output(self, activity_id: str) -> dict[str, Any] | None:
        """Query to get output data for a specific activity.

        This is consumed by ActivitySyncService to sync activity data to the database.

        Args:
            activity_id: Node ID to get output for

        Returns:
            Activity output data or None if not found

        """
        return self.resolver.get_namespace(activity_id) if self.resolver.has_namespace(activity_id) else None

    @workflow.query
    def get_skipped_nodes(self) -> list[str]:
        """Query to get list of skipped node IDs.

        This is consumed by ActivitySyncService to sync skipped status to database.
        Nodes are skipped when they are on non-taken branches of conditional nodes,
        or are transitively unreachable through skipped predecessors.

        Returns:
            List of node IDs that were skipped due to control flow

        """
        return list(self.skipped_nodes)

    @workflow.query
    def get_pre_resolved_nodes(self) -> list[str]:
        """Query to get list of pre-resolved node IDs.

        Pre-resolved nodes had their outputs mocked during test execution
        and were not actually executed.

        Returns:
            List of node IDs that were pre-resolved with mock data

        """
        return list(self.pre_resolved_outputs.keys())

    @workflow.query
    def get_failed_nodes(self) -> dict[str, str]:
        """Query to get failed node IDs and their error messages.

        This is consumed by ActivitySyncService to sync failed status to database.
        Nodes fail when expression resolution or execution raises an exception
        before a Temporal activity is scheduled, so no Temporal event is emitted.

        Returns:
            Dict mapping node ID to error message

        """
        return dict(self.failed_nodes)
