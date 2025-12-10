"""Dynamic Temporal workflow generator.

This module provides the core Temporal workflow that executes YAML workflow definitions.
The workflow is dynamically generated from WorkflowDefinition models and orchestrates
activity execution, tracking, error handling, and state persistence.
"""

import asyncio
import json
from datetime import timedelta
from typing import Any, cast

from temporalio import workflow

# Import constants module and HTTP-using activities with unsafe passthrough
# - constants: Loads settings which triggers tempfile.gettempdir()
# - agentic_activity: Has its own unsafe block for AgentOrchestratorClient
# - api_activity: Uses httpx which triggers urllib warnings in sandbox
# - aap_job_template_activity: Uses httpx which triggers urllib warnings in sandbox
# Must import constants first so when models imports constants, it uses the cached module
# See: https://github.com/temporalio/sdk-python#avoiding-the-sandbox
with workflow.unsafe.imports_passed_through():
    from . import constants  # noqa: F401 - Ensures constants load outside sandbox
    from .activities.aap_job_template_activity import execute_aap_job_template_activity
    from .activities.agentic_activity import execute_agentic_activity
    from .activities.api_activity import execute_api_request

from .activities.common import build_retry_policy, parse_timeout

# Import script activities (use asyncio.subprocess, no sandbox issues)
from .activities.script_activity import execute_bash_script, execute_python_script
from .expression_resolver import ExpressionResolver
from .models import (
    AAPJobTemplateExecutorConfig,
    Activity,
    ActivityType,
    APIExecutorConfig,
    ConvergeDefinition,
    ExecutorType,
    ForEachLoopDefinition,
    LoopType,
    ScriptExecutorConfig,
    TimeoutAction,
    WhileLoopDefinition,
    WorkflowDefinition,
)

# Type alias for JSON-like dictionaries to avoid duplication
JsonDict = dict[str, Any]


@workflow.defn
class DynamicWorkflow:
    """Temporal workflow that executes YAML workflow definitions.

    This workflow dynamically executes activities defined in a WorkflowDefinition,
    supporting multiple activity types: task, parallel, sequence, condition, loop, converge.
    """

    def __init__(self) -> None:
        """Initialize workflow with expression resolver."""
        self.expression_resolver: ExpressionResolver

    @workflow.run
    async def run(
        self,
        workflow_def: JsonDict,
        execution_id: str,
        workflow_inputs: JsonDict | None = None,
    ) -> JsonDict:
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

        # Apply default values from input parameter definitions
        resolved_inputs: JsonDict = dict(workflow_inputs or {})
        if self.workflow_definition.inputs:
            for input_name, input_param in self.workflow_definition.inputs.items():
                # Apply default value if input not provided and default is specified
                if input_name not in resolved_inputs and input_param.default is not None:
                    resolved_inputs[input_name] = input_param.default

        # Initialize workflow state
        workflow_state: JsonDict = {
            "execution_id": execution_id,
            "inputs": resolved_inputs,
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
                try:
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

                except Exception as activity_error:
                    # Store error details for failed activity
                    workflow_state["activity_outputs"][activity.id] = {
                        "error": str(activity_error),
                        "error_details": {
                            "type": type(activity_error).__name__,
                            "message": str(activity_error),
                        },
                    }
                    workflow_state["updated_at"] = workflow.now().isoformat()

                    # Re-raise to be caught by outer exception handler
                    raise

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
        workflow_state: JsonDict,
    ) -> JsonDict:
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
        if activity.type == ActivityType.TASK:
            return await self._execute_task_activity(activity, execution_id, workflow_state)
        if activity.type == ActivityType.PARALLEL:
            return await self._execute_parallel_activity(activity, execution_id, workflow_state)
        if activity.type == ActivityType.SEQUENCE:
            return await self._execute_sequence_activity(activity, execution_id, workflow_state)
        if activity.type == ActivityType.CONDITION:
            return await self._execute_condition_activity(activity, execution_id, workflow_state)
        if activity.type == ActivityType.LOOP:
            return await self._execute_loop_activity(activity, execution_id, workflow_state)
        return await self._execute_converge_activity(activity, workflow_state)

    async def _execute_script_executor(
        self,
        activity: Activity,
        task_inputs: JsonDict,
        activity_timeout: timedelta,
        execution_id: str,
    ) -> JsonDict:
        """Execute a script executor (bash or python).

        Args:
            activity: Task activity definition
            task_inputs: Prepared task inputs
            activity_timeout: Execution timeout
            execution_id: Workflow execution ID

        Returns:
            Script execution result

        """
        if not activity.task:
            msg = f"Activity {activity.id} has no task definition"
            raise ValueError(msg)

        # Ensure config is a ScriptExecutorConfig
        if not isinstance(activity.task.config, ScriptExecutorConfig):
            msg = f"Script executor requires ScriptExecutorConfig, got {type(activity.task.config).__name__}"
            raise TypeError(msg)

        script_config = activity.task.config
        language = script_config.language.value

        # Route to appropriate script executor based on language
        if language == "bash":
            script_executor = execute_bash_script
        elif language == "python":
            script_executor = execute_python_script
        else:
            msg = f"Unsupported script language: {language}"
            raise ValueError(msg)

        # Execute script activity
        # Serialize config to dict to avoid Pydantic V1 deprecation warnings in Temporal
        try:
            result = await workflow.execute_activity(
                script_executor,
                args=[script_config.model_dump(by_alias=True), task_inputs],
                activity_id=activity.id,
                start_to_close_timeout=activity_timeout,
                retry_policy=build_retry_policy(
                    activity.retry_policy.model_dump(by_alias=True) if activity.retry_policy else None
                ),
            )

            # Process output mappings if defined
            if activity.task.outputs:
                result = self._process_output_mappings(result, activity.task.outputs)

            return cast("JsonDict", result)

        except Exception as e:
            workflow.logger.error(
                f"Task {activity.id} failed: {e}",
                extra={"activity_id": activity.id, "execution_id": execution_id},
            )
            raise

    async def _execute_api_executor(
        self,
        activity: Activity,
        task_inputs: JsonDict,
        activity_timeout: timedelta,
        execution_id: str,
    ) -> JsonDict:
        """Execute an API executor.

        Args:
            activity: Task activity definition
            task_inputs: Prepared task inputs
            activity_timeout: Execution timeout
            execution_id: Workflow execution ID

        Returns:
            API execution result

        """
        if not activity.task:
            msg = f"Activity {activity.id} has no task definition"
            raise ValueError(msg)

        # Ensure config is an APIExecutorConfig
        if not isinstance(activity.task.config, APIExecutorConfig):
            msg = f"API executor requires APIExecutorConfig, got {type(activity.task.config).__name__}"
            raise TypeError(msg)

        # Serialize config to dict to avoid Pydantic V1 deprecation warnings in Temporal
        try:
            result = await workflow.execute_activity(
                execute_api_request,
                args=[activity.task.config.model_dump(by_alias=True), task_inputs],
                activity_id=activity.id,
                start_to_close_timeout=activity_timeout,
                retry_policy=build_retry_policy(
                    activity.retry_policy.model_dump(by_alias=True) if activity.retry_policy else None
                ),
            )

            # Process output mappings if defined
            if activity.task.outputs:
                result = self._process_output_mappings(result, activity.task.outputs)

            return cast("JsonDict", result)

        except Exception as e:
            workflow.logger.error(
                f"API task {activity.id} failed: {e}",
                extra={"activity_id": activity.id, "execution_id": execution_id},
            )
            raise

    async def _execute_agentic_executor(
        self,
        activity: Activity,
        task_inputs: JsonDict,
        activity_timeout: timedelta,
        execution_id: str,
    ) -> JsonDict:
        """Execute an agentic executor.

        Args:
            activity: Task activity definition
            task_inputs: Prepared task inputs
            activity_timeout: Execution timeout
            execution_id: Workflow execution ID

        Returns:
            Agentic execution result

        """
        if not activity.task:
            msg = f"Activity {activity.id} has no task definition"
            raise ValueError(msg)

        try:
            result = await workflow.execute_activity(
                execute_agentic_activity,
                args=[activity.task.model_dump(), task_inputs],
                activity_id=activity.id,
                start_to_close_timeout=activity_timeout,
                retry_policy=build_retry_policy(
                    activity.retry_policy.model_dump(by_alias=True) if activity.retry_policy else None
                ),
            )

            # Process output mappings if defined
            if activity.task.outputs:
                result = self._process_output_mappings(result, activity.task.outputs)

            return cast("JsonDict", result)

        except Exception as e:
            workflow.logger.error(
                f"Agentic task {activity.id} failed: {e}",
                extra={"activity_id": activity.id, "execution_id": execution_id},
            )
            raise

    async def _execute_aap_job_template_executor(
        self,
        activity: Activity,
        task_inputs: JsonDict,
        activity_timeout: timedelta,
        execution_id: str,
    ) -> JsonDict:
        """Execute an AAP job template executor.

        Args:
            activity: Task activity definition
            task_inputs: Prepared task inputs
            activity_timeout: Execution timeout
            execution_id: Workflow execution ID

        Returns:
            AAP job template execution result

        """
        if not activity.task:
            msg = f"Activity {activity.id} has no task definition"
            raise ValueError(msg)

        # Ensure config is an AAPJobTemplateExecutorConfig
        if not isinstance(activity.task.config, AAPJobTemplateExecutorConfig):
            msg = f"AAP executor requires AAPJobTemplateExecutorConfig, got {type(activity.task.config).__name__}"
            raise TypeError(msg)

        workflow.logger.info(
            f"Executing AAP job template activity: {activity.id}",
            extra={"activity_id": activity.id, "job_template_id": activity.task.config.job_template_id},
        )

        # Serialize config to dict to avoid Pydantic V1 deprecation warnings in Temporal
        try:
            result = await workflow.execute_activity(
                execute_aap_job_template_activity,
                args=[{"config": activity.task.config.model_dump(by_alias=True)}, task_inputs],
                activity_id=activity.id,
                start_to_close_timeout=activity_timeout,
                heartbeat_timeout=timedelta(seconds=30),  # 6x default 5s poll interval
                retry_policy=build_retry_policy(
                    activity.retry_policy.model_dump(by_alias=True) if activity.retry_policy else None
                ),
            )

            # Process output mappings if defined
            if activity.task.outputs:
                result = self._process_output_mappings(result, activity.task.outputs)

            return cast("JsonDict", result)

        except Exception as e:
            workflow.logger.error(
                f"AAP job template task {activity.id} failed: {e}",
                extra={"activity_id": activity.id, "execution_id": execution_id},
            )
            raise

    async def _execute_task_activity(
        self,
        activity: Activity,
        execution_id: str,
        workflow_state: JsonDict,
    ) -> JsonDict:
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

        # Prepare task inputs
        task_inputs = self._prepare_task_inputs(activity, workflow_state)

        # Configure timeout
        timeout = parse_timeout(activity.timeout) if activity.timeout else timedelta(minutes=5)

        # Execute based on executor type
        if activity.task.executor == ExecutorType.SCRIPT:
            return await self._execute_script_executor(activity, task_inputs, timeout, execution_id)
        if activity.task.executor == ExecutorType.AGENTIC:
            return await self._execute_agentic_executor(activity, task_inputs, timeout, execution_id)
        if activity.task.executor == ExecutorType.AAP_JOB_TEMPLATE:
            return await self._execute_aap_job_template_executor(activity, task_inputs, timeout, execution_id)
        # Otherwise, executor must be API (enforced by type system)
        return await self._execute_api_executor(activity, task_inputs, timeout, execution_id)

    async def _execute_parallel_activity(
        self,
        activity: Activity,
        execution_id: str,
        workflow_state: JsonDict,
    ) -> JsonDict:
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

        # Check if next activity is a converge for these branches
        # If so, don't execute yet - let the converge handle it
        next_activity_is_converge = self._check_if_next_is_converge(activity, workflow_state)

        if not next_activity_is_converge:
            # No converge follows, execute all branches in parallel immediately
            tasks = [self._execute_activity(branch, execution_id, workflow_state) for branch in activity.branches]
            results = await asyncio.gather(*tasks)

            # Store branch results
            branch_results = {}
            for branch, result in zip(activity.branches, results, strict=True):
                branch_results[branch.id] = result
                workflow_state["activity_outputs"][branch.id] = result

            return {"type": "parallel", "branches": branch_results}

        # If next is converge, store coroutines for the converge to execute
        for branch in activity.branches:
            # Store the branch activity definition, not a task
            workflow_state.setdefault("pending_branches", {})[branch.id] = {
                "activity": branch,
                "execution_id": execution_id,
            }

        return {"type": "parallel", "branches": {}, "deferred_to_converge": True}

    def _check_if_next_is_converge(self, current_activity: Activity, workflow_state: JsonDict) -> bool:
        """Check if the next activity in the workflow is a converge for this parallel's branches.

        Args:
            current_activity: Current parallel activity
            workflow_state: Workflow state containing the full workflow definition

        Returns:
            True if next activity is a converge for these branches

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

        # Check if next activity is a converge
        next_activity = activities[current_index + 1]
        if next_activity.type != "converge" or not next_activity.converge:
            return False

        # Check if the converge is waiting for branches from this parallel
        if not current_activity.branches:
            return False

        parallel_branch_ids = {b.id for b in current_activity.branches}
        converge_branch_ids = set(next_activity.converge.branches)

        # If there's any overlap, the converge is waiting for this parallel
        return bool(parallel_branch_ids & converge_branch_ids)

    async def _execute_sequence_activity(
        self,
        activity: Activity,
        execution_id: str,
        workflow_state: JsonDict,
    ) -> JsonDict:
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
        workflow_state: JsonDict,
    ) -> JsonDict:
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
        workflow_state: JsonDict,
    ) -> JsonDict:
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

        if loop_def.type == LoopType.FOR_EACH:
            return await self._execute_foreach_loop(loop_def, execution_id, workflow_state)
        if loop_def.type == LoopType.WHILE:
            return await self._execute_while_loop(loop_def, execution_id, workflow_state)

        msg = f"Unsupported loop type: {loop_def.type}"  # type: ignore[unreachable]
        raise ValueError(msg)

    async def _execute_foreach_loop(
        self,
        loop_def: ForEachLoopDefinition,
        execution_id: str,
        workflow_state: JsonDict,
    ) -> JsonDict:
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
        workflow_state: JsonDict,
    ) -> JsonDict:
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

    def _handle_converge_timeout(self, activity: Activity, converge_def: ConvergeDefinition) -> None:
        """Handle converge timeout by raising error if configured to fail.

        Args:
            activity: Activity that timed out
            converge_def: Converge definition with timeout configuration

        Raises:
            TimeoutError: If converge is configured to fail on timeout

        """
        if converge_def.on_timeout == TimeoutAction.FAIL:
            msg = f"Converge activity {activity.id} timed out after {converge_def.timeout}"
            raise TimeoutError(msg)

    async def _process_completed_tasks(
        self,
        pending_tasks: JsonDict,
        done: set[Any],
        workflow_state: JsonDict,
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

    async def _execute_converge_with_timeout(
        self,
        activity: Activity,
        converge_def: ConvergeDefinition,
        branches_to_execute: list[tuple[str, Activity, str]],
        timeout_seconds: float,
        workflow_state: JsonDict,
    ) -> None:
        """Execute converge branches with timeout using workflow.wait().

        Args:
            activity: Converge activity definition
            converge_def: Converge definition
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
                except asyncio.CancelledError:
                    workflow.logger.info(
                        f"Branch {branch_id} was cancelled",
                        extra={"branch_id": branch_id},
                    )
                    raise  # Re-raise to propagate cancellation
                except Exception as e:
                    # Log and re-raise all other exceptions
                    workflow.logger.error(
                        f"Branch {branch_id} failed with {type(e).__name__}: {e}",
                        extra={"branch_id": branch_id},
                        exc_info=True,
                    )
                    raise
            workflow_state.get("pending_branches", {}).pop(branch_id, None)

        # Handle pending tasks (timeout occurred)
        if pending:
            for task in pending:
                task.cancel()
            # Raise error only if configured to fail
            if converge_def.on_timeout == TimeoutAction.FAIL:
                msg = f"Converge activity {activity.id} timed out after {converge_def.timeout}"
                raise TimeoutError(msg)

    async def _execute_converge_without_timeout(
        self,
        branches_to_execute: list[tuple[str, Activity, str]],
        workflow_state: JsonDict,
    ) -> None:
        """Execute converge branches without timeout using asyncio.gather().

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
        for (branch_id, _, _), result in zip(branches_to_execute, results, strict=True):
            if isinstance(result, Exception):
                # Log the exception but don't fail the entire converge
                workflow.logger.error(
                    f"Branch {branch_id} failed in converge execution: {result}",
                    extra={"branch_id": branch_id},
                    exc_info=result,
                )
                # Store error in activity_outputs for visibility
                workflow_state["activity_outputs"][branch_id] = {
                    "error": str(result),
                    "error_type": type(result).__name__,
                }
            else:
                workflow_state["activity_outputs"][branch_id] = result

            workflow_state.get("pending_branches", {}).pop(branch_id, None)

    async def _execute_converge_activity(
        self,
        activity: Activity,
        workflow_state: JsonDict,
    ) -> JsonDict:
        """Execute converge activity (wait for multiple activities to complete).

        Args:
            activity: Converge activity definition
            workflow_state: Current workflow state

        Returns:
            Aggregated outputs from converged activities

        Raises:
            TimeoutError: If timeout is specified and converge condition not met within timeout period

        """
        if not activity.converge:
            msg = f"Activity {activity.id} is type=converge but has no converge definition"
            raise ValueError(msg)

        converge_def = activity.converge
        timeout_seconds = parse_timeout(converge_def.timeout).total_seconds() if converge_def.timeout else None

        # Collect pending branches that need to be executed
        branches_to_execute = []
        for branch_id in converge_def.branches:
            if branch_id in workflow_state.get("pending_branches", {}):
                branch_info = workflow_state["pending_branches"][branch_id]
                branches_to_execute.append((branch_id, branch_info["activity"], branch_info["execution_id"]))

        # Execute all branches in parallel if there are any pending
        if branches_to_execute:
            if timeout_seconds:
                await self._execute_converge_with_timeout(
                    activity, converge_def, branches_to_execute, timeout_seconds, workflow_state
                )
            else:
                await self._execute_converge_without_timeout(branches_to_execute, workflow_state)

        # Collect results from all converged branches (completed ones)
        converge_results = {}
        for branch_id in converge_def.branches:
            if branch_id in workflow_state["activity_outputs"]:
                converge_results[branch_id] = workflow_state["activity_outputs"][branch_id]

        return {"type": "converge", "strategy": converge_def.strategy, "results": converge_results}

    def _prepare_task_inputs(
        self,
        activity: Activity,
        workflow_state: JsonDict,
    ) -> JsonDict:
        """Prepare input parameters for task execution with expression resolution.

        Merges workflow-level inputs with task-specific inputs so that both
        ${input.field} (workflow inputs) and task-mapped inputs are available.

        Args:
            activity: Activity definition
            workflow_state: Current workflow state with previous outputs

        Returns:
            Resolved input parameters (workflow inputs + task inputs)

        """
        # Start with workflow-level inputs (so ${input.field} expressions work)
        resolved_inputs = dict(workflow_state.get("inputs", {}))

        # Add task-specific inputs (these override workflow inputs if same key)
        if activity.task and activity.task.inputs:
            for key, value in activity.task.inputs.items():
                resolved_inputs[key] = self.expression_resolver.resolve_expression(value, workflow_state)

        return resolved_inputs

    def _traverse_path(self, data: JsonDict | list[Any] | object, path: str) -> object:
        """Traverse a JSONPath-like expression to extract value from data.

        Supports dict keys and array indices (e.g., "items.0.name").

        Args:
            data: Source data to traverse
            path: Dot-separated path (e.g., "output.items.0.id")

        Returns:
            Extracted value or None if path not found

        """
        value: object = data
        for field_name in path.split("."):
            if isinstance(value, dict) and field_name in value:
                value = value[field_name]
            elif isinstance(value, list) and field_name.isdigit():
                # Support numeric indices for arrays
                index = int(field_name)
                if 0 <= index < len(value):
                    value = value[index]
                else:
                    return None
            else:
                return None
        return value

    def _parse_value(self, value: object) -> object:
        """Parse value, attempting JSON deserialization if it's a string.

        Args:
            value: Value to parse

        Returns:
            Parsed value (JSON if string, otherwise original)

        """
        if isinstance(value, str):
            try:
                return json.loads(value.strip())
            except (json.JSONDecodeError, ValueError):
                # Not JSON, return as-is
                return value
        return value

    def _process_output_mappings(
        self,
        result: JsonDict,
        output_mappings: dict[str, str],
    ) -> JsonDict:
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
            # Handle $.field or $.nested.field patterns
            if mapping_expr.startswith("$."):
                path = mapping_expr[2:]  # Remove "$."
                value = self._traverse_path(result, path)

                if value is not None:
                    mapped_outputs[output_name] = self._parse_value(value)

        # Add the mapped outputs to result under 'output' key
        result["output"] = mapped_outputs
        return result
