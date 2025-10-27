"""Dynamic Temporal workflow generator.

This module provides the core Temporal workflow that executes YAML workflow definitions.
The workflow is dynamically generated from WorkflowDefinition models and orchestrates
activity execution, tracking, error handling, and state persistence.
"""

import asyncio
import json
import re
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

from .activities.script_activity import execute_bash_script
from .expression_resolver import ExpressionResolver
from .models import (
    Activity,
    CountLoopDefinition,
    ForEachLoopDefinition,
    JoinDefinition,
    WhileLoopDefinition,
    WorkflowDefinition,
)


@workflow.defn
class DynamicWorkflow:
    """Temporal workflow that executes YAML workflow definitions.

    This workflow dynamically executes activities defined in a WorkflowDefinition,
    supporting multiple activity types: task, parallel, sequence, condition, loop, join.
    """

    def __init__(self) -> None:
        """Initialize workflow with expression resolver."""
        self.expression_resolver: ExpressionResolver

    @workflow.run
    async def run(
        self,
        workflow_def: dict[str, Any],
        execution_id: str,
        workflow_inputs: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute workflow from YAML definition.

        Args:
            workflow_def: WorkflowDefinition as dict (serialized Pydantic model)
            execution_id: Database execution ID for tracking
            workflow_inputs: Input parameters for the workflow

        Returns:
            dict containing workflow execution results and activity outputs

        Raises:
            Exception: If activity execution fails after retries

        """
        # Parse workflow definition
        self.workflow_definition = WorkflowDefinition(**workflow_def)

        # Initialize expression resolver
        self.expression_resolver = ExpressionResolver(self.workflow_definition)

        # Initialize workflow state
        workflow_state: dict[str, Any] = {
            "execution_id": execution_id,
            "inputs": workflow_inputs or {},
            "variables": self.workflow_definition.variables or {},
            "activity_outputs": {},
            "completed_activities": [],
            "workflow_definition": self.workflow_definition,
        }

        workflow.logger.info(
            f"Starting dynamic workflow: {self.workflow_definition.metadata.name}",
            extra={"execution_id": execution_id},
        )

        # Update workflow state: mark as running
        # Note: In production, this would update the Execution table status
        workflow_state["status"] = "running"
        workflow_state["started_at"] = workflow.now().isoformat()

        try:
            # Execute activities
            for activity in self.workflow_definition.workflow.activities:
                activity_result = await self._execute_activity(
                    activity=activity,
                    execution_id=execution_id,
                    workflow_state=workflow_state,
                )

                # Store activity output
                workflow_state["activity_outputs"][activity.id] = activity_result
                workflow_state["completed_activities"].append(activity.id)

                # Update workflow state after each activity (persistence checkpoint)
                workflow_state["updated_at"] = workflow.now().isoformat()

                workflow.logger.info(
                    f"Activity {activity.id} completed",
                    extra={"activity_id": activity.id, "execution_id": execution_id},
                )

            # Mark workflow as completed
            workflow_state["status"] = "completed"
            workflow_state["completed_at"] = workflow.now().isoformat()

            workflow.logger.info(
                f"Workflow {self.workflow_definition.metadata.name} completed successfully",
                extra={"execution_id": execution_id},
            )

            return {
                "status": "completed",
                "execution_id": execution_id,
                "activity_outputs": workflow_state["activity_outputs"],
                "completed_activities": workflow_state["completed_activities"],
                "completed_at": workflow_state["completed_at"],
            }

        except asyncio.CancelledError:
            # Workflow was cancelled
            workflow_state["status"] = "cancelled"
            workflow_state["completed_at"] = workflow.now().isoformat()

            workflow.logger.warning(
                f"Workflow {self.workflow_definition.metadata.name} was cancelled",
                extra={"execution_id": execution_id},
            )

            # Re-raise to let Temporal handle cancellation
            raise

        except Exception as e:
            # Workflow failed
            workflow_state["status"] = "failed"
            workflow_state["completed_at"] = workflow.now().isoformat()
            workflow_state["error"] = str(e)

            workflow.logger.error(
                f"Workflow {self.workflow_definition.metadata.name} failed: {e}",
                extra={"execution_id": execution_id},
                exc_info=True,
            )

            # Re-raise the exception
            raise

    async def _execute_activity(
        self,
        activity: Activity,
        execution_id: str,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a workflow activity based on its type.

        Args:
            activity: Activity definition from workflow
            execution_id: Workflow execution ID
            workflow_state: Current workflow state

        Returns:
            Activity execution result

        """
        workflow.logger.info(
            f"Executing activity: {activity.id} (type: {activity.type})",
            extra={"activity_id": activity.id, "type": activity.type, "execution_id": execution_id},
        )

        # Route to appropriate handler based on activity type
        if activity.type == "task":
            return await self._execute_task_activity(activity, execution_id, workflow_state)
        if activity.type == "parallel":
            return await self._execute_parallel_activity(activity, execution_id, workflow_state)
        if activity.type == "sequence":
            return await self._execute_sequence_activity(activity, execution_id, workflow_state)
        if activity.type == "condition":
            return await self._execute_condition_activity(activity, execution_id, workflow_state)
        if activity.type == "loop":
            return await self._execute_loop_activity(activity, execution_id, workflow_state)
        # activity.type == "join"  # noqa: ERA001
        return await self._execute_join_activity(activity, workflow_state)

    async def _execute_task_activity(
        self,
        activity: Activity,
        execution_id: str,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute a task activity (script, API, connector, agentic).

        Args:
            activity: Task activity definition
            execution_id: Workflow execution ID
            workflow_state: Current workflow state

        Returns:
            Task execution result

        """
        if not activity.task:
            msg = f"Activity {activity.id} is type=task but has no task definition"
            raise ValueError(msg)

        # Check conditional execution
        if activity.condition:
            should_execute = self.expression_resolver.evaluate_condition(activity.condition, workflow_state)
            if not should_execute:
                workflow.logger.info(
                    f"Task {activity.id} skipped (condition evaluated to false)",
                    extra={"activity_id": activity.id, "execution_id": execution_id},
                )
                return {"skipped": True, "reason": "condition_false"}

        # Prepare task inputs
        task_inputs = self._prepare_task_inputs(activity, workflow_state)

        # Configure timeout
        timeout = self._parse_duration(activity.timeout) if activity.timeout else timedelta(minutes=5)

        # Execute based on executor type
        if activity.task.executor == "script":
            script_code = activity.task.config.get("code", "")
            language = activity.task.config.get("language", "bash")

            if language != "bash":
                msg = f"Unsupported script language: {language}"
                raise ValueError(msg)

            # Execute bash script activity
            try:
                result = await workflow.execute_activity(
                    execute_bash_script,
                    args=[script_code, task_inputs],
                    start_to_close_timeout=timeout,
                    retry_policy=self._build_retry_policy(activity),
                )

                # Process output mappings if defined
                if activity.task.outputs:
                    result = self._process_output_mappings(result, activity.task.outputs)

            except Exception as e:
                workflow.logger.error(
                    f"Task {activity.id} failed: {e}",
                    extra={"activity_id": activity.id, "execution_id": execution_id},
                )
                raise
            else:
                result_dict: dict[str, Any] = result
                return result_dict
        else:
            msg = f"Unsupported executor type: {activity.task.executor}"
            raise ValueError(msg)

    async def _execute_parallel_activity(
        self,
        activity: Activity,
        execution_id: str,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute multiple activities in parallel.

        Args:
            activity: Parallel activity definition
            execution_id: Workflow execution ID
            workflow_state: Current workflow state

        Returns:
            Aggregated results from all parallel branches

        """
        if not activity.branches:
            msg = f"Activity {activity.id} is type=parallel but has no branches"
            raise ValueError(msg)

        workflow.logger.info(
            f"Executing {len(activity.branches)} activities in parallel",
            extra={"activity_id": activity.id, "execution_id": execution_id},
        )

        # Check if next activity is a join for these branches
        # If so, don't execute yet - let the join handle it
        next_activity_is_join = self._check_if_next_is_join(activity, workflow_state)

        if not next_activity_is_join:
            # No join follows, execute all branches in parallel immediately
            tasks = [self._execute_activity(branch, execution_id, workflow_state) for branch in activity.branches]
            results = await asyncio.gather(*tasks)

            # Store branch results
            branch_results = {}
            for branch, result in zip(activity.branches, results, strict=False):
                branch_results[branch.id] = result
                workflow_state["activity_outputs"][branch.id] = result

            return {"type": "parallel", "branches": branch_results}

        # If next is join, store coroutines for the join to execute
        for branch in activity.branches:
            # Store the branch activity definition, not a task
            workflow_state.setdefault("pending_branches", {})[branch.id] = {
                "activity": branch,
                "execution_id": execution_id,
            }

        return {"type": "parallel", "branches": {}, "deferred_to_join": True}

    def _check_if_next_is_join(self, current_activity: Activity, workflow_state: dict[str, Any]) -> bool:
        """Check if the next activity in the workflow is a join for this parallel's branches.

        Args:
            current_activity: Current parallel activity
            workflow_state: Workflow state containing the full workflow definition

        Returns:
            True if next activity is a join for these branches

        """
        # Get the workflow definition from state
        workflow_def = workflow_state.get("workflow_definition")
        if not workflow_def or not workflow_def.workflow or not workflow_def.workflow.activities:
            return False

        # Find current activity index
        activities = workflow_def.workflow.activities
        current_index = None
        for i, act in enumerate(activities):
            if act.id == current_activity.id:
                current_index = i
                break

        if current_index is None or current_index >= len(activities) - 1:
            return False

        # Check if next activity is a join
        next_activity = activities[current_index + 1]
        if next_activity.type != "join" or not next_activity.join:
            return False

        # Check if the join is waiting for branches from this parallel
        if not current_activity.branches:
            return False

        parallel_branch_ids = {b.id for b in current_activity.branches}
        join_branch_ids = set(next_activity.join.branches)

        # If there's any overlap, the join is waiting for this parallel
        return bool(parallel_branch_ids & join_branch_ids)

    async def _execute_sequence_activity(
        self,
        activity: Activity,
        execution_id: str,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute multiple activities sequentially.

        Args:
            activity: Sequence activity definition
            execution_id: Workflow execution ID
            workflow_state: Current workflow state

        Returns:
            Aggregated results from all sequential steps

        """
        if not activity.steps:
            msg = f"Activity {activity.id} is type=sequence but has no steps"
            raise ValueError(msg)

        workflow.logger.info(
            f"Executing {len(activity.steps)} activities sequentially",
            extra={"activity_id": activity.id, "execution_id": execution_id},
        )

        step_results = {}
        for step in activity.steps:
            result = await self._execute_activity(step, execution_id, workflow_state)
            step_results[step.id] = result
            workflow_state["activity_outputs"][step.id] = result

        return {"type": "sequence", "steps": step_results}

    async def _execute_condition_activity(
        self,
        activity: Activity,
        execution_id: str,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute conditional branching (if/then/else).

        Args:
            activity: Condition activity definition
            execution_id: Workflow execution ID
            workflow_state: Current workflow state

        Returns:
            Result from executed branch (then or else)

        """
        if not activity.condition:
            msg = f"Activity {activity.id} is type=condition but has no condition"
            raise ValueError(msg)
        if not activity.then:
            msg = f"Activity {activity.id} is type=condition but has no then branch"
            raise ValueError(msg)

        # Evaluate condition
        condition_result = self.expression_resolver.evaluate_condition(activity.condition, workflow_state)

        workflow.logger.info(
            f"Condition evaluated to: {condition_result}",
            extra={"activity_id": activity.id, "execution_id": execution_id},
        )

        # Execute appropriate branch
        if condition_result:
            # Execute 'then' branch
            then_results = {}
            for then_activity in activity.then:
                result = await self._execute_activity(then_activity, execution_id, workflow_state)
                then_results[then_activity.id] = result
                workflow_state["activity_outputs"][then_activity.id] = result
            return {"type": "condition", "branch": "then", "results": then_results}
        # Execute 'else' branch if present
        if activity.else_:
            else_results = {}
            for else_activity in activity.else_:
                result = await self._execute_activity(else_activity, execution_id, workflow_state)
                else_results[else_activity.id] = result
                workflow_state["activity_outputs"][else_activity.id] = result
            return {"type": "condition", "branch": "else", "results": else_results}
        return {"type": "condition", "branch": "else", "results": {}, "skipped": True}

    async def _execute_loop_activity(
        self,
        activity: Activity,
        execution_id: str,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute loop activity (forEach, while, count).

        Args:
            activity: Loop activity definition
            execution_id: Workflow execution ID
            workflow_state: Current workflow state

        Returns:
            Aggregated results from all loop iterations

        """
        if not activity.loop:
            msg = f"Activity {activity.id} is type=loop but has no loop definition"
            raise ValueError(msg)

        loop_def = activity.loop

        if loop_def.type == "forEach":
            return await self._execute_foreach_loop(loop_def, execution_id, workflow_state)
        if loop_def.type == "while":
            return await self._execute_while_loop(loop_def, execution_id, workflow_state)
        # loop_def.type == "count"  # noqa: ERA001
        return await self._execute_count_loop(loop_def, execution_id, workflow_state)

    async def _execute_foreach_loop(
        self,
        loop_def: ForEachLoopDefinition,
        execution_id: str,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute forEach loop over a collection.

        Args:
            loop_def: ForEach loop definition
            execution_id: Workflow execution ID
            workflow_state: Current workflow state

        Returns:
            Aggregated results from all iterations

        """
        # Get items to iterate over
        items = self.expression_resolver.resolve_expression(loop_def.items, workflow_state)

        if not isinstance(items, list):
            msg = f"forEach items must be a list, got {type(items)}"
            raise TypeError(msg)

        workflow.logger.info(
            f"Executing forEach loop for {len(items)} items",
            extra={"execution_id": execution_id},
        )

        iteration_results = []
        for index, item in enumerate(items):
            # Create iteration-specific state
            iteration_state = workflow_state.copy()
            iteration_state[loop_def.item_variable] = item
            iteration_state[loop_def.index_variable] = index

            # Execute loop body activities
            for do_activity in loop_def.do:
                result = await self._execute_activity(do_activity, execution_id, iteration_state)
                iteration_results.append(
                    {
                        "index": index,
                        "item": item,
                        "activity_id": do_activity.id,
                        "result": result,
                    }
                )

        return {"type": "forEach", "iterations": len(items), "results": iteration_results}

    async def _execute_while_loop(
        self,
        loop_def: WhileLoopDefinition,
        execution_id: str,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute while loop with condition.

        Args:
            loop_def: While loop definition
            execution_id: Workflow execution ID
            workflow_state: Current workflow state

        Returns:
            Aggregated results from all iterations

        """
        iteration_count = 0
        iteration_results = []
        max_iterations = loop_def.max_iterations

        workflow.logger.info(
            f"Executing while loop (max {max_iterations} iterations)",
            extra={"execution_id": execution_id},
        )

        while iteration_count < max_iterations:
            # Evaluate condition
            should_continue = self.expression_resolver.evaluate_condition(loop_def.condition, workflow_state)

            if not should_continue:
                break

            # Execute loop body activities
            iteration_state = workflow_state.copy()
            iteration_state["iteration_index"] = iteration_count

            for do_activity in loop_def.do:
                result = await self._execute_activity(do_activity, execution_id, iteration_state)
                iteration_results.append(
                    {
                        "index": iteration_count,
                        "activity_id": do_activity.id,
                        "result": result,
                    }
                )

            iteration_count += 1

        return {"type": "while", "iterations": iteration_count, "results": iteration_results}

    async def _execute_count_loop(
        self,
        loop_def: CountLoopDefinition,
        execution_id: str,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute count loop (fixed number of iterations).

        Args:
            loop_def: Count loop definition
            execution_id: Workflow execution ID
            workflow_state: Current workflow state

        Returns:
            Aggregated results from all iterations

        """
        count = loop_def.count

        workflow.logger.info(
            f"Executing count loop {count} times",
            extra={"execution_id": execution_id},
        )

        iteration_results = []
        for index in range(count):
            # Create iteration-specific state
            iteration_state = workflow_state.copy()
            iteration_state[loop_def.index_variable] = index

            # Execute loop body activities
            for do_activity in loop_def.do:
                result = await self._execute_activity(do_activity, execution_id, iteration_state)
                iteration_results.append(
                    {
                        "index": index,
                        "activity_id": do_activity.id,
                        "result": result,
                    }
                )

        return {"type": "count", "iterations": count, "results": iteration_results}

    def _handle_join_timeout(self, activity: Activity, join_def: JoinDefinition) -> None:
        """Handle join timeout by raising error if configured to fail.

        Args:
            activity: Activity that timed out
            join_def: Join definition with timeout configuration

        Raises:
            TimeoutError: If join is configured to fail on timeout

        """
        if join_def.on_timeout == "fail":
            msg = f"Join activity {activity.id} timed out after {join_def.timeout}"
            raise TimeoutError(msg)

    async def _process_completed_tasks(
        self,
        pending_tasks: dict[str, Any],
        done: set[Any],
        workflow_state: dict[str, Any],
    ) -> None:
        """Process completed tasks and update workflow state.

        Args:
            pending_tasks: Map of branch IDs to their tasks
            done: Set of completed tasks
            workflow_state: Current workflow state

        """
        for branch_id, task in pending_tasks.items():
            if task in done:
                try:
                    result = await task
                    workflow_state["activity_outputs"][branch_id] = result
                    workflow_state.get("pending_tasks", {}).pop(branch_id, None)
                except (asyncio.CancelledError, Exception):
                    # Task failed or was cancelled, don't include in results
                    workflow_state.get("pending_tasks", {}).pop(branch_id, None)
                    # Re-raise CancelledError to allow proper cancellation propagation
                    if isinstance(task.exception(), asyncio.CancelledError):
                        raise

    async def _execute_join_with_timeout(
        self,
        activity: Activity,
        join_def: JoinDefinition,
        branches_to_execute: list[tuple[str, Activity, str]],
        timeout_seconds: float,
        workflow_state: dict[str, Any],
    ) -> None:
        """Execute join branches with timeout using workflow.wait().

        Args:
            activity: Join activity definition
            join_def: Join definition
            branches_to_execute: List of (branch_id, branch_activity, exec_id) tuples
            timeout_seconds: Timeout in seconds
            workflow_state: Current workflow state

        Raises:
            TimeoutError: If timeout occurs and onTimeout is "fail"

        """
        # Create tasks and use workflow.wait() for deterministic execution
        tasks = {}
        for branch_id, branch_activity, exec_id in branches_to_execute:
            task = asyncio.create_task(self._execute_activity(branch_activity, exec_id, workflow_state))
            tasks[branch_id] = task

        # Wait with timeout
        done, pending = await workflow.wait(tasks.values(), timeout=timeout_seconds)

        # Process completed tasks
        for branch_id, task in tasks.items():
            if task in done:
                try:
                    result = await task
                    workflow_state["activity_outputs"][branch_id] = result
                except (asyncio.CancelledError, ValueError, TypeError, RuntimeError) as e:
                    workflow.logger.warning(
                        f"Branch {branch_id} failed: {e}",
                        extra={"branch_id": branch_id},
                    )
            workflow_state.get("pending_branches", {}).pop(branch_id, None)

        # Handle pending tasks (timeout occurred)
        if pending:
            for task in pending:
                task.cancel()
            # Raise error only if configured to fail
            if join_def.on_timeout == "fail":
                msg = f"Join activity {activity.id} timed out after {join_def.timeout}"
                raise TimeoutError(msg)

    async def _execute_join_without_timeout(
        self,
        branches_to_execute: list[tuple[str, Activity, str]],
        workflow_state: dict[str, Any],
    ) -> None:
        """Execute join branches without timeout using asyncio.gather().

        Args:
            branches_to_execute: List of (branch_id, branch_activity, exec_id) tuples
            workflow_state: Current workflow state

        """
        # Use simple gather (no tasks, no warnings)
        coroutines = [
            self._execute_activity(branch_activity, exec_id, workflow_state)
            for _, branch_activity, exec_id in branches_to_execute
        ]
        results = await asyncio.gather(*coroutines, return_exceptions=True)

        # Store results
        for (branch_id, _, _), result in zip(branches_to_execute, results, strict=False):
            if not isinstance(result, Exception):
                workflow_state["activity_outputs"][branch_id] = result
            workflow_state.get("pending_branches", {}).pop(branch_id, None)

    async def _execute_join_activity(
        self,
        activity: Activity,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Execute join activity (wait for multiple activities to complete).

        Args:
            activity: Join activity definition
            workflow_state: Current workflow state

        Returns:
            Aggregated outputs from joined activities

        Raises:
            TimeoutError: If timeout is specified and join condition not met within timeout period

        """
        if not activity.join:
            msg = f"Activity {activity.id} is type=join but has no join definition"
            raise ValueError(msg)

        join_def = activity.join
        timeout_seconds = self._parse_duration(join_def.timeout).total_seconds() if join_def.timeout else None

        # Collect pending branches that need to be executed
        branches_to_execute = []
        for branch_id in join_def.branches:
            if branch_id in workflow_state.get("pending_branches", {}):
                branch_info = workflow_state["pending_branches"][branch_id]
                branches_to_execute.append((branch_id, branch_info["activity"], branch_info["execution_id"]))

        # Execute all branches in parallel if there are any pending
        if branches_to_execute:
            if timeout_seconds:
                await self._execute_join_with_timeout(
                    activity, join_def, branches_to_execute, timeout_seconds, workflow_state
                )
            else:
                await self._execute_join_without_timeout(branches_to_execute, workflow_state)

        # Collect results from all joined branches (completed ones)
        join_results = {}
        for branch_id in join_def.branches:
            if branch_id in workflow_state["activity_outputs"]:
                join_results[branch_id] = workflow_state["activity_outputs"][branch_id]

        return {"type": "join", "strategy": join_def.strategy, "results": join_results}

    def _prepare_task_inputs(
        self,
        activity: Activity,
        workflow_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Prepare input parameters for task execution with expression resolution.

        Args:
            activity: Activity definition
            workflow_state: Current workflow state with previous outputs

        Returns:
            Resolved input parameters

        """
        if not activity.task or not activity.task.inputs:
            return {}

        resolved_inputs = {}
        for key, value in activity.task.inputs.items():
            resolved_inputs[key] = self.expression_resolver.resolve_expression(value, workflow_state)

        return resolved_inputs

    def _process_output_mappings(
        self,
        result: dict[str, Any],
        output_mappings: dict[str, str],
    ) -> dict[str, Any]:
        """Process output mappings to extract and transform activity results.

        Transforms raw activity output (e.g., {stdout, stderr, return_code})
        into structured output using JSONPath-like expressions.

        Args:
            result: Raw activity result
            output_mappings: Output mapping definitions (e.g., {"user_data": "$.stdout"})

        Returns:
            Enhanced result with 'output' key containing mapped values

        """
        mapped_outputs = {}

        for output_name, mapping_expr in output_mappings.items():
            # Handle $.stdout, $.stderr patterns
            if mapping_expr.startswith("$."):
                field_name = mapping_expr[2:]  # Remove "$."
                if field_name in result:
                    value = result[field_name]

                    # Try to parse as JSON if it's a string
                    if isinstance(value, str):
                        try:
                            parsed = json.loads(value.strip())
                            mapped_outputs[output_name] = parsed
                        except (json.JSONDecodeError, ValueError):
                            # Not JSON, store as-is
                            mapped_outputs[output_name] = value
                    else:
                        mapped_outputs[output_name] = value

        # Add the mapped outputs to result under 'output' key
        result["output"] = mapped_outputs
        return result

    def _parse_duration(self, iso_duration: str) -> timedelta:
        """Parse ISO 8601 duration format to timedelta.

        Supports PT format with hours, minutes, and seconds:
        - PT5M - 5 minutes
        - PT30S - 30 seconds
        - PT2H - 2 hours
        - PT1H30M - 1 hour 30 minutes
        - PT1H30M15S - 1 hour 30 minutes 15 seconds

        Args:
            iso_duration: ISO 8601 duration string (e.g., "PT5M" or "PT1H30M")

        Returns:
            timedelta object

        """
        if not iso_duration.startswith("PT"):
            msg = f"Invalid ISO 8601 duration: {iso_duration}"
            raise ValueError(msg)

        duration_str = iso_duration[2:]  # Remove "PT" prefix

        # Parse hours, minutes, and seconds using regex
        hours_match = re.search(r"(\d+)H", duration_str)
        minutes_match = re.search(r"(\d+)M", duration_str)
        seconds_match = re.search(r"(\d+)S", duration_str)

        hours = int(hours_match.group(1)) if hours_match else 0
        minutes = int(minutes_match.group(1)) if minutes_match else 0
        seconds = int(seconds_match.group(1)) if seconds_match else 0

        # Ensure at least one component was found
        if hours == 0 and minutes == 0 and seconds == 0:
            msg = f"Unsupported duration format: {iso_duration}"
            raise ValueError(msg)

        return timedelta(hours=hours, minutes=minutes, seconds=seconds)

    def _build_retry_policy(self, activity: Activity) -> RetryPolicy | None:
        """Build Temporal retry policy from activity configuration.

        Args:
            activity: Activity with optional retryPolicy

        Returns:
            Temporal RetryPolicy or None

        """
        if not activity.retry_policy:
            return None

        retry_config = activity.retry_policy
        initial_interval = self._parse_duration(retry_config.initial_interval)

        # Build retry policy
        policy_kwargs: dict[str, Any] = {
            "maximum_attempts": retry_config.max_attempts,
            "initial_interval": initial_interval,
        }

        # Add optional fields
        if retry_config.max_interval:
            policy_kwargs["maximum_interval"] = self._parse_duration(retry_config.max_interval)

        if retry_config.backoff == "exponential" and retry_config.multiplier:
            policy_kwargs["backoff_coefficient"] = retry_config.multiplier

        return RetryPolicy(**policy_kwargs)
