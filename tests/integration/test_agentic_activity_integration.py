"""Integration tests for agentic activity execution with Agent Orchestrator.

These tests verify the full workflow execution path for agentic activities:
- Workflow YAML parsing and execution through Temporal
- Agent Orchestrator invocation within Temporal workflows
- Parameter mapping from YAML to Agent Orchestrator

These tests execute real Temporal workflows with mocked Agent Orchestrator.
For unit-level testing of error handling and edge cases, see contract tests.
"""

import asyncio
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.workflows.clients.agent_orchestrator_client import AgentOrchestratorClient
from nexus.workflows.workflow_engine.activities.agentic_activity import execute_agentic_activity
from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml


@pytest.fixture
def simple_agentic_workflow_yaml() -> str:
    """Provide a simple agentic workflow YAML for testing."""
    return """
schemaVersion: 1.0.0
version: 1
metadata:
  name: simple-agent-test
  description: Test agentic activity integration
  tags:
    - test
    - agentic

triggers:
  - type: manual

workflow:
  activities:
    - id: agent_task
      type: task
      task:
        executor: agentic
        config:
          agent: production://test-agent
          model: claude-3-5-sonnet-20241022
          prompt: |
            Research: ${input.query}
        inputs:
          query: "${inputs.query}"
        outputs:
          answer: $.result.answer
          sources: $.result.sources
"""


@pytest_asyncio.fixture
async def mock_agent_client_success() -> AgentOrchestratorClient:
    """Create a mock Agent Orchestrator client that succeeds.

    Returns invocation_id immediately (async pattern).
    The test must send a signal to complete the workflow.
    """
    client = AsyncMock(spec=AgentOrchestratorClient)

    # Mock invoke_agent_async to return invocation ID immediately
    client.invoke_agent_async = AsyncMock(return_value="inv_test_123")
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)

    return client


@pytest_asyncio.fixture
async def temporal_worker_with_agentic(
    temporal_env: WorkflowEnvironment,
    mock_agent_client_success: AgentOrchestratorClient,
) -> AsyncIterator[Worker]:
    """Provide a Temporal worker configured for agentic activity tests."""
    task_queue = "test-agentic-queue"

    # Patch AgentOrchestratorClient at module level
    with patch("nexus.workflows.workflow_engine.activities.agentic_activity.AgentOrchestratorClient") as mock_cls:
        # Configure the mock to return our mock_agent_client_success
        mock_cls.return_value = mock_agent_client_success

        async with Worker(
            temporal_env.client,
            task_queue=task_queue,
            workflows=[DynamicWorkflow],
            activities=[execute_agentic_activity],
        ) as worker:
            yield worker


@pytest.mark.integration
@pytest.mark.asyncio
async def test_agentic_workflow_executes_successfully(
    temporal_client: Client,
    temporal_worker_with_agentic: Worker,
    simple_agentic_workflow_yaml: str,
) -> None:
    """Test that agentic workflow executes successfully with Agent Orchestrator integration."""
    # Parse workflow
    workflow_def = parse_workflow_yaml(simple_agentic_workflow_yaml)

    # Execute workflow
    workflow_id = f"test-agentic-{uuid4()}"
    workflow_inputs = {"query": "What is the capital of France?"}

    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[
            workflow_def.model_dump(mode="json", by_alias=True),
            f"exec-{uuid4()}",
            workflow_inputs,
        ],
        id=workflow_id,
        task_queue="test-agentic-queue",
    )

    # Wait a bit for workflow to reach the agentic activity and start waiting for signal
    await asyncio.sleep(0.5)

    # Send signal with agent result (simulates Agent Orchestrator callback)
    # The signal should contain the raw result data (not wrapped)
    # The workflow will extract and process it based on output mappings ($.result.answer)
    await handle.signal(
        "activity_signal",
        args=[
            "agent_task",  # activity_id
            {
                # This is the raw data structure from agent execution
                # Output mappings in YAML expect $.result.answer, so we need "result" key
                "result": {
                    "answer": "Test answer from agent",
                    "sources": ["web", "knowledge_base"],
                },
            },
        ],
    )

    result = await handle.result()

    # Verify workflow completed
    assert result["status"] == "completed"
    assert "agent_task" in result["activity_outputs"]

    # Verify agent result was received via signal
    # The workflow extracts signal_data.get("result") and processes output mappings
    agent_output = result["activity_outputs"]["agent_task"]
    assert "output" in agent_output
    assert agent_output["output"]["answer"] == "Test answer from agent"
    assert agent_output["output"]["sources"] == ["web", "knowledge_base"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_agentic_activity_parameter_mapping(
    temporal_client: Client,
    temporal_worker_with_agentic: Worker,
    simple_agentic_workflow_yaml: str,
) -> None:
    """Test that workflow parameters are correctly mapped to Agent Orchestrator."""
    workflow_def = parse_workflow_yaml(simple_agentic_workflow_yaml)

    workflow_id = f"test-params-{uuid4()}"
    workflow_inputs = {"query": "Test query value"}

    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[
            workflow_def.model_dump(mode="json", by_alias=True),
            f"exec-{uuid4()}",
            workflow_inputs,
        ],
        id=workflow_id,
        task_queue="test-agentic-queue",
    )

    # Wait for workflow to reach the agentic activity
    await asyncio.sleep(0.5)

    # Send signal with agent result
    await handle.signal(
        "activity_signal",
        args=[
            "agent_task",
            {
                "result": {
                    "answer": "Mapped test answer",
                    "sources": ["test_source"],
                },
            },
        ],
    )

    result = await handle.result()

    # Verify execution completed
    assert result["status"] == "completed"

    # Verify output mappings were applied
    agent_output = result["activity_outputs"]["agent_task"]
    assert "output" in agent_output
    assert agent_output["output"]["answer"] == "Mapped test answer"
