"""Unit tests for YAML workflow parser."""

from typing import Any
from unittest.mock import patch

import pytest

from nexus.workflows.workflow_engine.models import (
    AAPJobTemplateExecutorConfig,
    ForEachLoopDefinition,
    ScriptExecutorConfig,
    WhileLoopDefinition,
)
from nexus.workflows.workflow_engine.yaml_workflow_parser import (
    WorkflowParseError,
    parse_workflow_yaml,
)


class TestYAMLParserBasics:
    """Test basic YAML parsing functionality."""

    def test_parse_valid_minimal_workflow(self) -> None:
        """Test parsing a minimal valid workflow."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test workflow
triggers:
- type: manual
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        assert workflow_def.schema_version == "1.0.0"
        assert workflow_def.version == 1
        assert workflow_def.metadata.name == "test-workflow"
        assert len(workflow_def.workflow.activities) == 1
        assert workflow_def.workflow.activities[0].id == "task1"

    def test_parse_workflow_with_inputs(self) -> None:
        """Test parsing workflow with input definitions."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test workflow
triggers:
- type: manual
inputs:
  username:
    type: string
    description: User name
    default: "guest"
  count:
    type: integer
    description: Count value
    default: 10
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        assert workflow_def.inputs is not None
        assert "username" in workflow_def.inputs
        assert workflow_def.inputs["username"].type == "string"
        assert workflow_def.inputs["username"].default == "guest"
        assert "count" in workflow_def.inputs
        assert workflow_def.inputs["count"].type == "integer"
        assert workflow_def.inputs["count"].default == 10

    # NOTE: Workflow variables are not part of the current schema implementation
    # They would be added in a future enhancement when needed


class TestYAMLParserActivityTypes:
    """Test parsing different activity types."""

    def test_parse_task_activity(self) -> None:
        """Test parsing task activity."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test workflow
triggers:
- type: manual
workflow:
  activities:
  - id: script_task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Hello"
          echo "World"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        activity = workflow_def.workflow.activities[0]
        assert activity.id == "script_task"
        assert activity.type == "task"
        assert activity.task is not None
        assert activity.task.executor == "script"
        assert isinstance(activity.task.config, ScriptExecutorConfig)
        assert "Hello" in activity.task.config.code

    def test_parse_parallel_activity(self) -> None:
        """Test parsing parallel activity."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test workflow
triggers:
- type: manual
workflow:
  activities:
  - id: parallel_tasks
    type: parallel
    branches:
    - id: branch1
      type: task
      task:
        executor: script
        config:
          language: bash
          code: echo "branch1"
    - id: branch2
      type: task
      task:
        executor: script
        config:
          language: bash
          code: echo "branch2"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        activity = workflow_def.workflow.activities[0]
        assert activity.id == "parallel_tasks"
        assert activity.type == "parallel"
        assert activity.branches is not None
        assert len(activity.branches) == 2
        assert activity.branches[0].id == "branch1"
        assert activity.branches[1].id == "branch2"

    def test_parse_loop_foreach_activity(self) -> None:
        """Test parsing forEach loop activity."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test workflow
triggers:
- type: manual
workflow:
  activities:
  - id: loop_task
    type: loop
    loop:
      type: forEach
      items: ${input.items}
      itemVariable: item
      indexVariable: index
      do:
      - id: process_item
        type: task
        task:
          executor: script
          config:
            language: bash
            code: echo "Processing ${item}"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        activity = workflow_def.workflow.activities[0]
        assert activity.id == "loop_task"
        assert activity.type == "loop"
        loop_def = activity.loop
        assert loop_def is not None
        assert loop_def.type == "forEach"
        assert isinstance(loop_def, ForEachLoopDefinition)
        assert loop_def.items == "${input.items}"
        assert loop_def.item_variable == "item"
        assert loop_def.index_variable == "index"
        assert len(loop_def.do) == 1

    def test_parse_condition_activity(self) -> None:
        """Test parsing condition activity."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test workflow
triggers:
- type: manual
workflow:
  activities:
  - id: check_condition
    type: condition
    condition: ${input.value} > 0
    then:
    - id: positive_branch
      type: task
      task:
        executor: script
        config:
          language: bash
          code: echo "positive"
    else:
    - id: negative_branch
      type: task
      task:
        executor: script
        config:
          language: bash
          code: echo "negative"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        activity = workflow_def.workflow.activities[0]
        assert activity.id == "check_condition"
        assert activity.type == "condition"
        assert activity.condition == "${input.value} > 0"
        assert activity.then is not None
        assert len(activity.then) == 1
        assert activity.else_ is not None
        assert len(activity.else_) == 1


class TestYAMLParserErrorHandling:
    """Test error handling and validation."""

    def test_invalid_yaml_syntax(self) -> None:
        """Test that invalid YAML syntax raises WorkflowParseError."""
        invalid_yaml = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test
  invalid yaml structure here
"""
        with pytest.raises(WorkflowParseError, match="Invalid YAML syntax"):
            parse_workflow_yaml(invalid_yaml)

    def test_missing_required_fields(self) -> None:
        """Test that missing required fields raises WorkflowParseError."""
        missing_metadata = """
schemaVersion: "1.0.0"
version: 1
triggers:
- type: manual
workflow:
  activities: []
"""
        with pytest.raises(WorkflowParseError, match="Workflow validation failed"):
            parse_workflow_yaml(missing_metadata)

    def test_invalid_schema_version(self) -> None:
        """Test that invalid schema version is handled."""
        invalid_version = """
schemaVersion: "999.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        # Should still parse but with different schema version
        workflow_def = parse_workflow_yaml(invalid_version)
        assert workflow_def.schema_version == "999.0.0"

    def test_minimum_one_activity_required(self) -> None:
        """Test that at least one activity is required (per schema)."""
        empty_activities = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities: []
"""
        # Empty activities list should fail validation due to min_length=1
        with pytest.raises(WorkflowParseError, match="List should have at least 1 item"):
            parse_workflow_yaml(empty_activities)

    def test_invalid_activity_type(self) -> None:
        """Test that invalid activity type raises validation error."""
        invalid_type = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: bad_activity
    type: invalid_type
"""
        with pytest.raises(WorkflowParseError):
            parse_workflow_yaml(invalid_type)

    def test_error_message_includes_value(self) -> None:
        """Test that validation error messages include the invalid value."""
        invalid_yaml = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: bad_activity
    type: invalid_activity_type
"""
        with pytest.raises(WorkflowParseError) as exc_info:
            parse_workflow_yaml(invalid_yaml)

        error_message = str(exc_info.value)
        # Error message should include the invalid value for debugging
        assert "value:" in error_message
        assert "invalid_activity_type" in error_message

    def test_yaml_with_list_root(self) -> None:
        """Test that YAML with list at root raises appropriate error."""
        yaml_with_list = """
- item1
- item2
- item3
"""
        with pytest.raises(WorkflowParseError, match="YAML must contain a workflow object"):
            parse_workflow_yaml(yaml_with_list)

    def test_yaml_with_scalar_root(self) -> None:
        """Test that YAML with scalar value at root raises appropriate error."""
        yaml_with_scalar = "just a string value"

        with pytest.raises(WorkflowParseError, match="YAML must contain a workflow object"):
            parse_workflow_yaml(yaml_with_scalar)

    def test_yaml_with_null_root(self) -> None:
        """Test that YAML with null/empty content raises appropriate error."""
        empty_yaml = ""

        with pytest.raises(WorkflowParseError, match="YAML must contain a workflow object"):
            parse_workflow_yaml(empty_yaml)

    def test_unexpected_error_during_parsing(self) -> None:
        """Test that unexpected errors are caught and wrapped in WorkflowParseError.

        This tests the defensive error handling in the parser's generic exception catch block.
        The YAML itself is valid, but we mock WorkflowDefinition to raise an unexpected error
        (like RuntimeError) to simulate unforeseen issues such as:
        - Out of memory errors
        - Import failures from dependencies
        - Bugs in underlying libraries
        - Any other runtime exceptions not covered by YAML or validation errors

        This ensures that even unexpected errors are properly wrapped in WorkflowParseError
        with a helpful message, rather than letting raw exceptions bubble up to callers.
        """
        valid_yaml = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        # Mock WorkflowDefinition to simulate an unexpected runtime error during instantiation.
        # This triggers the generic "except Exception" block in parse_workflow_yaml (lines 86-88).
        with (
            patch(
                "nexus.workflows.workflow_engine.yaml_workflow_parser.WorkflowDefinition",
                side_effect=RuntimeError("Unexpected error during model initialization"),
            ),
            pytest.raises(WorkflowParseError, match="Unexpected error parsing workflow"),
        ):
            parse_workflow_yaml(valid_yaml)


class TestYAMLParserAdvancedFeatures:
    """Test advanced workflow features."""

    def test_parse_activity_with_timeout(self) -> None:
        """Test parsing activity with timeout configuration."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: task_with_timeout
    type: task
    timeout: 300
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        activity = workflow_def.workflow.activities[0]
        assert activity.timeout == 300  # 5 minutes = 300 seconds

    def test_parse_activity_with_retry_policy(self) -> None:
        """Test parsing activity with retry policy."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: task_with_retry
    type: task
    retryPolicy:
      maxAttempts: 3
      initialInterval: 1
      maxInterval: 10
      backoff: exponential
      retryableErrors:
      - 500  # Internal Server Error
      - 503  # Service Unavailable
      - 504  # Gateway Timeout
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        activity = workflow_def.workflow.activities[0]
        assert activity.retry_policy is not None
        assert activity.retry_policy.max_attempts == 3
        assert activity.retry_policy.initial_interval == 1  # 1 second
        assert activity.retry_policy.max_interval == 10  # 10 seconds
        assert activity.retry_policy.backoff == "exponential"
        assert activity.retry_policy.retryable_errors is not None
        assert 500 in activity.retry_policy.retryable_errors
        assert 503 in activity.retry_policy.retryable_errors
        assert 504 in activity.retry_policy.retryable_errors

    def test_parse_activity_with_approval(self) -> None:
        """Test parsing activity with approval requirement."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: approval_task
    type: task
    approval:
      approvers:
      - admin
      - manager
      prompt: "Approve this deployment?"
      timeout: 3600
      onTimeout: reject
    task:
      executor: script
      config:
        language: bash
        code: echo "deploying"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        activity = workflow_def.workflow.activities[0]
        assert activity.approval is not None
        assert "admin" in activity.approval.approvers
        assert activity.approval.prompt == "Approve this deployment?"
        assert activity.approval.timeout == 3600  # 1 hour = 3600 seconds
        assert activity.approval.on_timeout == "reject"

    def test_parse_while_loop(self) -> None:
        """Test parsing while loop activity."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: while_loop
    type: loop
    loop:
      type: while
      condition: ${variables.counter} < 10
      do:
      - id: increment
        type: task
        task:
          executor: script
          config:
            language: bash
            code: echo "incrementing"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        activity = workflow_def.workflow.activities[0]
        loop_def = activity.loop
        assert loop_def is not None
        assert loop_def.type == "while"
        assert isinstance(loop_def, WhileLoopDefinition)
        assert loop_def.condition == "${variables.counter} < 10"


class TestYAMLParserTriggers:
    """Test parsing different trigger types."""

    def test_parse_manual_trigger(self) -> None:
        """Test parsing manual trigger."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        assert len(workflow_def.triggers) == 1
        assert workflow_def.triggers[0].type == "manual"

    def test_parse_multiple_manual_triggers(self) -> None:
        """Test parsing multiple manual triggers."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
- type: manual
  requiresApproval: true
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        assert len(workflow_def.triggers) == 2
        assert workflow_def.triggers[0].type == "manual"
        assert workflow_def.triggers[1].type == "manual"
        assert workflow_def.triggers[1].requires_approval is True

    def test_parse_script_with_environment_variables(self) -> None:
        """Test parsing script activity with environment variables."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: script_with_env
    type: task
    task:
      executor: script
      config:
        language: python
        environment:
          API_KEY: "secret123"
          DB_HOST: "localhost"
          DB_PORT: "5432"
        code: |
          import os
          print(os.getenv("API_KEY"))
"""
        workflow_def = parse_workflow_yaml(yaml_str)

        activity = workflow_def.workflow.activities[0]
        assert activity.id == "script_with_env"
        assert activity.task is not None
        assert activity.task.executor == "script"

        # Verify config is ScriptExecutorConfig model
        assert isinstance(activity.task.config, ScriptExecutorConfig)

        # Verify environment field is properly parsed
        script_config = activity.task.config
        assert script_config.environment is not None
        assert isinstance(script_config.environment, dict)
        assert script_config.environment["API_KEY"] == "secret123"
        assert script_config.environment["DB_HOST"] == "localhost"
        assert script_config.environment["DB_PORT"] == "5432"
        assert script_config.language.value == "python"
        assert "os.getenv" in script_config.code

    def test_parse_script_with_javascript_language_rejected(self) -> None:
        """Test that JavaScript language is rejected with clear error message."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: js_task
    type: task
    task:
      executor: script
      config:
        language: javascript
        code: console.log("Hello");
"""
        with pytest.raises(WorkflowParseError):
            parse_workflow_yaml(yaml_str)

    def test_parse_script_with_powershell_language_rejected(self) -> None:
        """Test that PowerShell language is rejected with clear error message."""
        yaml_str = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: ps_task
    type: task
    task:
      executor: script
      config:
        language: powershell
        code: Write-Host "Hello"
"""
        with pytest.raises(WorkflowParseError):
            parse_workflow_yaml(yaml_str)


class TestAAPExecutorValidation:
    """Test AAP job template executor validation (T003)."""

    @staticmethod
    def _build_aap_workflow_yaml(config: dict[str, Any]) -> str:
        """Helper to build AAP workflow YAML with given config.

        Args:
            config: AAP executor configuration dictionary

        Returns:
            YAML string for workflow with AAP executor

        """
        import yaml

        workflow_dict = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {
                "name": "test-aap-workflow",
                "description": "Test AAP job template executor",
            },
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "run_job_template",
                        "type": "task",
                        "task": {
                            "executor": "aap_job_template",
                            "config": config,
                        },
                    }
                ]
            },
        }
        return yaml.dump(workflow_dict, sort_keys=False)

    def test_aap_executor_valid_config(self) -> None:
        """Test valid AAP executor configuration."""
        config = {
            "job_template_id": 42,
            "inventory_id": 123,
            "extra_vars": {"version": "1.0.0", "environment": "prod"},
            "limit": "webservers",
            "tags": "deploy,configure",
            "skip_tags": "backup",
            "verbosity": 2,
        }
        yaml_str = self._build_aap_workflow_yaml(config)
        workflow_def = parse_workflow_yaml(yaml_str)

        task = workflow_def.workflow.activities[0].task
        assert task is not None
        assert isinstance(task.config, AAPJobTemplateExecutorConfig)
        assert task.executor.value == "aap_job_template"
        assert task.config.job_template_id == 42
        assert task.config.inventory_id == 123
        assert task.config.extra_vars["version"] == "1.0.0"
        assert task.config.limit == "webservers"
        assert task.config.tags == "deploy,configure"
        assert task.config.skip_tags == "backup"
        assert task.config.verbosity == 2

    def test_aap_executor_minimal_config(self) -> None:
        """Test AAP executor with minimal required config."""
        yaml_str = self._build_aap_workflow_yaml({"job_template_id": 123})
        workflow_def = parse_workflow_yaml(yaml_str)

        task = workflow_def.workflow.activities[0].task
        assert task is not None
        assert isinstance(task.config, AAPJobTemplateExecutorConfig)
        assert task.config.job_template_id == 123
        # Verify defaults
        assert task.config.extra_vars == {}
        assert task.config.verbosity == 0
        assert task.config.skip_tags is None

    def test_aap_executor_missing_job_template_id(self) -> None:
        """Test AAP executor fails without job_template_id."""
        yaml_str = self._build_aap_workflow_yaml({"inventory_id": 123})
        with pytest.raises(WorkflowParseError, match=r"(job_template_id|jobTemplateId)"):
            parse_workflow_yaml(yaml_str)

    def test_aap_executor_invalid_job_template_id(self) -> None:
        """Test AAP executor fails with invalid job_template_id."""
        yaml_str = self._build_aap_workflow_yaml({"job_template_id": 0})
        with pytest.raises(WorkflowParseError):
            parse_workflow_yaml(yaml_str)

    def test_aap_executor_invalid_verbosity(self) -> None:
        """Test AAP executor fails with invalid verbosity level."""
        yaml_str = self._build_aap_workflow_yaml({"job_template_id": 42, "verbosity": 10})
        with pytest.raises(WorkflowParseError):
            parse_workflow_yaml(yaml_str)
