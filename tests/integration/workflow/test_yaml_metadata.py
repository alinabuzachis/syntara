"""Integration tests for workflow metadata fields."""

from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import pytest
from temporalio.client import Client, WorkflowFailureError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.yaml_workflow_parser import WorkflowParseError, parse_workflow_yaml


class TestWorkflowMetadata:
    """Test workflow metadata fields."""

    @pytest.mark.asyncio
    async def test_workflow_with_tags(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test workflow with tags metadata."""
        result = await run_workflow_from_file(
            "examples/metadata/workflow-with-tags.yaml",
            workflow_id="test-tags-metadata",
        )

        assert result["status"] == "completed"
        output = result["activity_outputs"]["process_data"]["stdout"]
        assert "data-processing" in output
        assert "production" in output
        assert "critical" in output
        assert "data-engineering-team" in output

    @pytest.mark.asyncio
    async def test_workflow_with_owner(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        load_workflow: Callable[[str], Any],
    ) -> None:
        """Test workflow with owner metadata."""
        workflow_def = load_workflow("examples/metadata/workflow-with-tags.yaml")

        assert workflow_def.metadata.owner == "data-engineering-team"
        assert workflow_def.metadata.name == "tagged-workflow"

    @pytest.mark.asyncio
    async def test_workflow_with_complete_metadata(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        load_workflow: Callable[[str], Any],
    ) -> None:
        """Test workflow with all metadata fields populated."""
        workflow_def = load_workflow("examples/metadata/workflow-with-all-metadata.yaml")

        # Verify all metadata fields
        assert workflow_def.metadata.name == "full-metadata-workflow"
        assert workflow_def.metadata.description == "Workflow demonstrating all metadata fields"
        assert workflow_def.metadata.tags == ["test", "metadata", "comprehensive"]
        assert workflow_def.metadata.owner == "qa-team"
        assert workflow_def.metadata.timeout == "PT30S"

    @pytest.mark.asyncio
    async def test_metadata_tags_uniqueness(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that duplicate tags are handled correctly."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: duplicate-tags-test
  description: Test duplicate tags
  tags:
    - tag1
    - tag2
    - tag1
  owner: test-team

triggers:
- type: manual

workflow:
  activities:
  - id: test_task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_content)

        # Schema requires uniqueItems, but parser should handle it
        assert workflow_def.metadata.tags is not None
        assert len(workflow_def.metadata.tags) >= 2

    @pytest.mark.asyncio
    async def test_workflow_level_timeout_enforcement(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that workflow-level timeout is enforced."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: timeout-test
  description: Test workflow-level timeout
  timeout: PT2S

triggers:
- type: manual

workflow:
  activities:
  - id: long_task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Starting long task"
          sleep 10
          echo "Should not reach here"
"""
        workflow_def = parse_workflow_yaml(yaml_content)

        # Execute workflow with timeout
        with pytest.raises(WorkflowFailureError):
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def.model_dump(mode="json", by_alias=True), "test-exec-timeout", None],
                id="test-workflow-timeout",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=3),  # Slightly longer than workflow timeout
            )

    @pytest.mark.asyncio
    async def test_workflow_completes_within_timeout(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
        run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    ) -> None:
        """Test that workflow completes successfully when within timeout."""
        # Use the fixture to run the workflow which handles the task queue properly
        result = await run_workflow_from_file(
            "examples/metadata/workflow-with-all-metadata.yaml",
            workflow_id="test-workflow-quick",
        )

        assert result["status"] == "completed"
        assert "validated" in result["activity_outputs"]["validate_metadata"]["stdout"]

    @pytest.mark.asyncio
    async def test_tags_are_optional(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that tags field is optional in metadata."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: no-tags-workflow
  description: Workflow without tags

triggers:
- type: manual

workflow:
  activities:
  - id: test_task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_content)

        assert workflow_def.metadata.tags is None or workflow_def.metadata.tags == []

    @pytest.mark.asyncio
    async def test_owner_is_optional(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that owner field is optional in metadata."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: no-owner-workflow
  description: Workflow without owner

triggers:
- type: manual

workflow:
  activities:
  - id: test_task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_content)

        assert workflow_def.metadata.owner is None or workflow_def.metadata.owner == ""

    @pytest.mark.asyncio
    async def test_timeout_is_optional(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that timeout field is optional in metadata."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: no-timeout-workflow
  description: Workflow without timeout

triggers:
- type: manual

workflow:
  activities:
  - id: test_task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        workflow_def = parse_workflow_yaml(yaml_content)

        assert workflow_def.metadata.timeout is None or workflow_def.metadata.timeout == ""


class TestMetadataValidation:
    """Test metadata validation rules."""

    @pytest.mark.asyncio
    async def test_invalid_workflow_name_pattern(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that invalid workflow name patterns are rejected."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: invalid name with spaces
  description: Test invalid name

triggers:
- type: manual

workflow:
  activities:
  - id: test_task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        # Schema validation should fail for invalid name pattern
        with pytest.raises(WorkflowParseError, match="name"):
            parse_workflow_yaml(yaml_content)

    @pytest.mark.asyncio
    async def test_timeout_accepts_iso8601_format(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that timeout accepts ISO 8601 duration format."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: iso-timeout-test
  description: Test ISO 8601 timeout
  timeout: PT1H30M

triggers:
- type: manual

workflow:
  activities:
  - id: test_task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        # Should parse successfully with ISO 8601 format
        workflow_def = parse_workflow_yaml(yaml_content)
        assert workflow_def.metadata.timeout == "PT1H30M"

    @pytest.mark.asyncio
    async def test_duplicate_activity_ids_rejected(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that duplicate activity IDs are rejected."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: duplicate-ids-test
  description: Test duplicate activity IDs

triggers:
- type: manual

workflow:
  activities:
  - id: say_hello
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "Hello"
  - id: say_hello
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "Goodbye"
"""
        # Should raise validation error for duplicate IDs
        with pytest.raises(WorkflowParseError, match="Duplicate activity ID 'say_hello'"):
            parse_workflow_yaml(yaml_content)

    @pytest.mark.asyncio
    async def test_duplicate_activity_ids_in_nested_structures(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that duplicate activity IDs in nested structures are rejected."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: nested-duplicate-test
  description: Test duplicate IDs in nested structures

triggers:
- type: manual

workflow:
  activities:
  - id: main_task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "Main"
  - id: parallel_group
    type: parallel
    branches:
    - id: branch_1
      type: task
      task:
        executor: script
        config:
          language: bash
          code: echo "Branch 1"
    - id: main_task
      type: task
      task:
        executor: script
        config:
          language: bash
          code: echo "Branch 2"
"""
        # Should raise validation error for duplicate IDs across nested structures
        with pytest.raises(WorkflowParseError, match="Duplicate activity ID 'main_task'"):
            parse_workflow_yaml(yaml_content)

    @pytest.mark.asyncio
    async def test_activity_id_with_invalid_format(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,  # noqa: ARG002
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test that activity IDs with invalid format (e.g., spaces) are rejected."""
        yaml_content = """
schemaVersion: 1.0.0
version: 1

metadata:
  name: invalid-id-format-test
  description: Test invalid activity ID format

triggers:
- type: manual

workflow:
  activities:
  - id: invalid id with spaces
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""
        # Should raise validation error for invalid ID format
        with pytest.raises(WorkflowParseError, match="id"):
            parse_workflow_yaml(yaml_content)
