"""Integration tests for agentic activity execution with Agent Orchestrator.

These tests verify the full workflow execution path for agentic activities:
- Workflow YAML parsing and execution through Temporal
- Agent Orchestrator invocation within Temporal workflows
- Parameter mapping from YAML to Agent Orchestrator

These tests execute real Temporal workflows with mocked Agent Orchestrator.
For unit-level testing of error handling and edge cases, see contract tests.
"""

from collections.abc import AsyncIterator
from typing import Any
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
    """Create a mock Agent Orchestrator client that succeeds."""
    client = AsyncMock(spec=AgentOrchestratorClient)

    async def invoke_agent(**kwargs: object) -> dict[str, Any]:
        return {
            "id": "inv_test_123",
            "status": "completed",
            "result": {
                "answer": "Test answer from agent",
                "sources": ["web", "knowledge_base"],
            },
            "error_message": None,
            "created_at": "2025-10-31T00:00:00Z",
            "updated_at": "2025-10-31T00:00:01Z",
            "started_at": "2025-10-31T00:00:00Z",
            "completed_at": "2025-10-31T00:00:01Z",
            "prompt": kwargs.get("prompt", "Test prompt"),
            "session_id": "test-session",
            "created_by": "test-user",
            "updated_by": None,
            "context_data": {},
            "checkpoint_data": None,
            "labels": {},
        }

    client.invoke_agent = invoke_agent
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

    result = await handle.result()

    # Verify workflow completed
    assert result["status"] == "completed"
    assert "agent_task" in result["activity_outputs"]

    # Verify agent result
    agent_output = result["activity_outputs"]["agent_task"]
    assert agent_output["status"] == "completed"
    assert "answer" in agent_output["result"]


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

    result = await handle.result()

    # Verify execution completed
    assert result["status"] == "completed"
