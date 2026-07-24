"""End-to-end tests for the AI Agent (agentic) workflow node.

Tests make REAL LLM calls through integrations (OpenRouter).
Excluded in CI via ``--exclude-test-phase=agentic``; run locally with:

    APP_BASE_URL=http://localhost:8000 make test-e2e

Expected runtime: ~5-10 min typical, ~40 min worst case (all timeouts hit).
Each test uses a 180s poll timeout for LLM responses.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any
from uuid import UUID

import pytest
from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.execution_status import ExecutionStatus
from nexus_api_client.models.initial_model_selection import InitialModelSelection
from nexus_api_client.models.integration_create import IntegrationCreate
from nexus_api_client.models.integration_type import IntegrationType
from nexus_api_client.models.llm_provider_configuration import LLMProviderConfiguration
from nexus_api_client.models.llm_provider_hint import LLMProviderHint
from orchestrator_test_sdk.e2e.helpers import create_and_run_workflow

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = [
    pytest.mark.e2e,
    pytest.mark.pipeline(test_phase="agentic"),
]

AGENTIC_POLL_TIMEOUT = 180
MAX_TOOL_CALL_ATTEMPTS = 3


def _agentic_node(
    node_id: str,
    name: str,
    prompt: str,
    credential_id: str,
    llm_model_id: str,
    *,
    settings_timeout: int = AGENTIC_POLL_TIMEOUT,
    **extra_params: object,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "prompt": prompt,
        "credential_id": credential_id,
        "llm_model_id": llm_model_id,
        **extra_params,
    }
    return {
        "id": node_id,
        "name": name,
        "type": "agentic",
        "parameters": params,
        "settings": {"timeout": settings_timeout},
    }


# ---------------------------------------------------------------------------
# 1. Basic prompt completion
# ---------------------------------------------------------------------------


def test_basic_prompt_completion(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Simple prompt completes successfully with non-empty agentic output."""
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-basic-prompt",
        {
            "name": "agentic-basic",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                _agentic_node(
                    "agent",
                    "Basic Agent",
                    "Say exactly: hello world",
                    llm_credential_id,
                    llm_model_id,
                ),
            ],
            "edges": [{"from": "trigger", "to": "agent"}],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["agent"].status == "completed"
    output = activities["agent"].output_data
    assert output is not None, "Agentic activity should produce output"


# ---------------------------------------------------------------------------
# 2. Output contains expected content
# ---------------------------------------------------------------------------


@pytest.mark.xfail(strict=False, reason="LLM output non-determinism")
def test_agentic_output_contains_expected_content(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Prompt for a specific word and verify the output contains it."""
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-expected-content",
        {
            "name": "agentic-content",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                _agentic_node(
                    "agent",
                    "Content Agent",
                    "Respond with exactly the word 'pineapple' and nothing else",
                    llm_credential_id,
                    llm_model_id,
                ),
            ],
            "edges": [{"from": "trigger", "to": "agent"}],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    output = activities["agent"].output_data
    assert output is not None
    output_dict = output if isinstance(output, dict) else getattr(output, "additional_properties", {})
    output_str = json.dumps(output_dict).lower()
    assert "pineapple" in output_str, f"Expected 'pineapple' in output, got: {output_str}"


# ---------------------------------------------------------------------------
# 3. Agentic with MCP tool call
# ---------------------------------------------------------------------------


@pytest.mark.xfail(strict=False, reason="LLM non-determinism: model may skip tool call")
def test_agentic_with_mcp_tool_call(
    nexus_api: NexusApiRegistry,
    mcp_integration_id: str,  # side-effect: ensures MCP integration is validated so agent discovers tools
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Agentic node uses an MCP tool to generate a greeting."""
    output: object = None
    for _attempt in range(1, MAX_TOOL_CALL_ATTEMPTS + 1):
        result = create_and_run_workflow(
            nexus_api,
            "e2e-agentic-mcp-tool",
            {
                "name": "agentic-mcp-tool",
                "schema_version": "2.0.0",
                "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
                "nodes": [
                    _agentic_node(
                        "agent",
                        "MCP Tool Agent",
                        (
                            "You MUST use the get_greeting tool to greet jimmy. "
                            "Do not answer without calling the tool first."
                        ),
                        llm_credential_id,
                        llm_model_id,
                    ),
                ],
                "edges": [{"from": "trigger", "to": "agent"}],
            },
            timeout=AGENTIC_POLL_TIMEOUT,
            project_id=first_project_id,
        )

        assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
        activities = {a.activity_id: a for a in (result.activities or [])}
        output = activities["agent"].output_data
        if output is not None:
            output_dict = output if isinstance(output, dict) else getattr(output, "additional_properties", {})
            output_str = json.dumps(output_dict).lower()
            if "jimmy" in output_str or "greeting" in output_str or "hello" in output_str:
                return

    assert output is not None, f"Agent produced no output across all {MAX_TOOL_CALL_ATTEMPTS} attempts"
    output_dict = output if isinstance(output, dict) else getattr(output, "additional_properties", {})
    output_str = json.dumps(output_dict).lower()
    assert any(kw in output_str for kw in ("jimmy", "greeting", "hello")), (
        f"Agent output after {MAX_TOOL_CALL_ATTEMPTS} attempts lacked expected greeting keywords: {output_str}"
    )


# ---------------------------------------------------------------------------
# 4. Agentic with response schema
# ---------------------------------------------------------------------------


@pytest.mark.xfail(strict=False, reason="LLM output non-determinism")
def test_agentic_with_response_schema(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Agentic node with response_schema produces JSON-parseable output."""
    response_schema = json.dumps(
        {
            "type": "object",
            "properties": {"fruits": {"type": "array", "items": {"type": "string"}}},
            "required": ["fruits"],
        }
    )
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-response-schema",
        {
            "name": "agentic-schema",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                _agentic_node(
                    "agent",
                    "Schema Agent",
                    "List exactly 2 fruits",
                    llm_credential_id,
                    llm_model_id,
                    response_schema=response_schema,
                ),
            ],
            "edges": [{"from": "trigger", "to": "agent"}],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    output = activities["agent"].output_data
    assert output is not None, "Agent should produce output"
    output_dict = output if isinstance(output, dict) else getattr(output, "additional_properties", {})
    result_value = output_dict.get("result", "")
    if isinstance(result_value, str):
        parsed = json.loads(result_value)
    elif isinstance(result_value, dict):
        parsed = result_value
    else:
        parsed = output_dict
    assert "fruits" in parsed, f"Expected 'fruits' key in parsed output, got: {parsed}"


# ---------------------------------------------------------------------------
# 4b. Agentic with tool selection + response schema (AAP-66977 T089)
# ---------------------------------------------------------------------------


@pytest.mark.xfail(strict=False, reason="LLM output non-determinism")
def test_agentic_with_tool_selection_and_response_schema(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Agentic node with tool_selection_strategy NONE and response_schema produces JSON output."""
    response_schema = json.dumps(
        {
            "type": "object",
            "properties": {"fruits": {"type": "array", "items": {"type": "string"}}},
            "required": ["fruits"],
        }
    )
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-tools-and-schema",
        {
            "name": "agentic-tools-schema",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                _agentic_node(
                    "agent",
                    "Tools Schema Agent",
                    "List exactly 2 fruits",
                    llm_credential_id,
                    llm_model_id,
                    response_schema=response_schema,
                    tool_selection_strategy="NONE",
                ),
            ],
            "edges": [{"from": "trigger", "to": "agent"}],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    output = activities["agent"].output_data
    assert output is not None, "Agent should produce output"
    output_dict = output if isinstance(output, dict) else getattr(output, "additional_properties", {})
    result_value = output_dict.get("result", "")
    if isinstance(result_value, str):
        parsed = json.loads(result_value)
    elif isinstance(result_value, dict):
        parsed = result_value
    else:
        parsed = output_dict
    assert "fruits" in parsed, f"Expected 'fruits' key in parsed output, got: {parsed}"


# ---------------------------------------------------------------------------
# 5. Agentic input from upstream node
# ---------------------------------------------------------------------------


@pytest.mark.xfail(strict=False, reason="LLM output non-determinism")
def test_agentic_input_from_upstream_node(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Script node outputs JSON consumed by agentic node via variable reference."""
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-upstream-input",
        {
            "name": "agentic-upstream",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "prep",
                    "name": "Prep Data",
                    "type": "script",
                    "parameters": {
                        "language": "python",
                        "code": 'import json; print(json.dumps({"name": "alice"}))',
                    },
                },
                _agentic_node(
                    "agent",
                    "Upstream Agent",
                    "Greet the person named ${prep.stdout_json.name}. Include their name in your response.",
                    llm_credential_id,
                    llm_model_id,
                ),
            ],
            "edges": [
                {"from": "trigger", "to": "prep"},
                {"from": "prep", "to": "agent"},
            ],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["prep"].status == "completed"
    assert activities["agent"].status == "completed"
    output = activities["agent"].output_data
    assert output is not None
    output_dict = output if isinstance(output, dict) else getattr(output, "additional_properties", {})
    output_str = json.dumps(output_dict).lower()
    assert "alice" in output_str, f"Expected 'alice' in output, got: {output_str}"


# ---------------------------------------------------------------------------
# 6. Agentic output consumed by downstream
# ---------------------------------------------------------------------------


def test_agentic_output_consumed_by_downstream(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Agentic node output is consumed by a downstream script node."""
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-downstream",
        {
            "name": "agentic-downstream",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                _agentic_node(
                    "agent",
                    "Agent Task",
                    "Say exactly: hello world",
                    llm_credential_id,
                    llm_model_id,
                ),
                {
                    "id": "echo",
                    "name": "Echo Result",
                    "type": "script",
                    "parameters": {
                        "language": "bash",
                        "code": 'echo "Agent said: ${agent.result}"',
                    },
                },
            ],
            "edges": [
                {"from": "trigger", "to": "agent"},
                {"from": "agent", "to": "echo"},
            ],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["agent"].status == "completed"
    assert activities["echo"].status == "completed"
    echo_output = activities["echo"].output_data
    assert echo_output is not None
    echo_dict = echo_output if isinstance(echo_output, dict) else getattr(echo_output, "additional_properties", {})
    assert echo_dict.get("stdout", "").strip(), "Downstream script should have non-empty stdout"


# ---------------------------------------------------------------------------
# 7. Agentic with tool_selection_strategy NONE
# ---------------------------------------------------------------------------


def test_agentic_with_tool_selection_none(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Agentic node with tool_selection_strategy NONE completes without tools."""
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-tool-none",
        {
            "name": "agentic-tool-none",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                _agentic_node(
                    "agent",
                    "No Tools Agent",
                    "Say exactly: hello world",
                    llm_credential_id,
                    llm_model_id,
                    tool_selection_strategy="NONE",
                ),
            ],
            "edges": [{"from": "trigger", "to": "agent"}],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["agent"] == "completed"


# ---------------------------------------------------------------------------
# 8. Invalid credential fails
# ---------------------------------------------------------------------------


def test_agentic_invalid_credential_fails(
    nexus_api: NexusApiRegistry,
    first_project_id: UUID,
    llm_model: str,
    worker_id: str,
) -> None:
    """Agentic node with an invalid API key results in a failed execution."""
    types_list = nexus_api.credentials.list_types().assert_and_get()
    llm_type_id: UUID | None = None
    for ct in types_list.resources:
        if "llm" in ct.name.lower():
            llm_type_id = UUID(str(ct.id))
            break
    assert llm_type_id is not None, "LLM Provider credential type not found"

    bad_cred_id: str | None = None
    bad_integration_id: UUID | None = None
    try:
        bad_cred = nexus_api.credentials.create(
            body=CredentialCreate(
                name=f"e2e-bad-llm-credential-{worker_id}",
                credential_type_id=llm_type_id,
                project_id=first_project_id,
                inputs=CredentialCreateInputs.from_dict(
                    {
                        "api_key": "sk-invalid-key-for-e2e-test",
                    }
                ),
            ),
        ).assert_and_get()
        bad_cred_id = str(bad_cred.id)

        bad_integration = nexus_api.integrations.create(
            body=IntegrationCreate(
                name=f"e2e-bad-llm-provider-{worker_id}",
                description="LLM provider with invalid credential for E2E test",
                integration_type=IntegrationType.LLM_PROVIDER,
                configuration=LLMProviderConfiguration(
                    provider_hint=LLMProviderHint.CUSTOM,
                    base_url="https://openrouter.ai/api/v1",
                ),
                management_credential_id=UUID(bad_cred_id),
                discovered_models=[
                    InitialModelSelection(
                        model_id=llm_model,
                        name=llm_model,
                        enabled=True,
                        is_default=True,
                    ),
                ],
            ),
        ).assert_and_get()
        bad_integration_id = bad_integration.id

        models_resp = nexus_api.integrations.list_models(integration_id=bad_integration_id)
        models = models_resp.assert_and_get()
        assert models.resources, "Bad LLM provider should still have models"
        bad_model_id = str(models.resources[0].id)

        result = create_and_run_workflow(
            nexus_api,
            "e2e-agentic-invalid-cred",
            {
                "name": "agentic-invalid-cred",
                "schema_version": "2.0.0",
                "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
                "nodes": [
                    _agentic_node(
                        "agent",
                        "Bad Cred Agent",
                        "Say hello",
                        bad_cred_id,
                        bad_model_id,
                    ),
                ],
                "edges": [{"from": "trigger", "to": "agent"}],
            },
            timeout=AGENTIC_POLL_TIMEOUT,
            project_id=first_project_id,
        )

        assert result.status in {
            ExecutionStatus.FAILED,
            ExecutionStatus.COMPLETED_WITH_ERRORS,
        }, f"Expected failure with invalid credential, got: {result.status}"

    finally:
        if bad_integration_id is not None:
            try:
                nexus_api.integrations.delete(integration_id=bad_integration_id)
            except Exception:
                pass
        if bad_cred_id is not None:
            try:
                nexus_api.credentials.delete(credential_id=UUID(bad_cred_id))
            except Exception:
                pass


# ---------------------------------------------------------------------------
# 9. Temporal activity timeout race
# ---------------------------------------------------------------------------


def test_agentic_short_timeout_reaches_terminal_state(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Agentic node with 1s Temporal timeout reaches a terminal state.

    The settings.timeout controls the Temporal activity StartToClose deadline.
    With async completion, the invocation is dispatched before the timeout fires,
    so the outcome is a race: the agent orchestrator may complete before or after
    Temporal cancels the activity. Either outcome (COMPLETED or FAILED) is valid.
    """
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-timeout",
        {
            "name": "agentic-timeout",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                _agentic_node(
                    "agent",
                    "Timeout Agent",
                    "Say hello",
                    llm_credential_id,
                    llm_model_id,
                    settings_timeout=1,
                ),
            ],
            "edges": [{"from": "trigger", "to": "agent"}],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status in {
        ExecutionStatus.COMPLETED,
        ExecutionStatus.FAILED,
        ExecutionStatus.COMPLETED_WITH_ERRORS,
    }, f"Expected terminal state, got: {result.status}"


# ---------------------------------------------------------------------------
# 10. Agentic in loop
# ---------------------------------------------------------------------------


def test_agentic_in_loop(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Loop iterates over items with an agentic node as the loop body."""
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-in-loop",
        {
            "name": "agentic-loop",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "loop",
                    "name": "Loop Over Items",
                    "type": "loop",
                    "parameters": {
                        "type": "for_each",
                        "items": '["alpha", "bravo"]',
                    },
                },
                _agentic_node(
                    "greet",
                    "Greet Item",
                    "Say hello to the current item. Keep your response to one sentence.",
                    llm_credential_id,
                    llm_model_id,
                ),
            ],
            "edges": [
                {"from": "trigger", "to": "loop"},
                {"from": "loop", "to": "greet", "from_port": "iterate"},
                {"from": "greet", "to": "loop", "to_port": "iterate"},
            ],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["loop"] == "completed"
    assert activities["greet"] == "completed"


# ---------------------------------------------------------------------------
# 11. Agentic in condition true branch
# ---------------------------------------------------------------------------


def test_agentic_in_condition_true_branch(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Condition routes to true branch containing an agentic node."""
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-condition-true",
        {
            "name": "agentic-condition",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "check",
                    "name": "Always True",
                    "type": "condition",
                    "parameters": {"condition": "1 == 1"},
                },
                _agentic_node(
                    "agent",
                    "True Branch Agent",
                    "Say exactly: hello world",
                    llm_credential_id,
                    llm_model_id,
                ),
                {
                    "id": "false_branch",
                    "name": "False Branch",
                    "type": "script",
                    "parameters": {"language": "bash", "code": 'echo "should not run"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "check"},
                {"from": "check", "to": "agent", "from_port": "true"},
                {"from": "check", "to": "false_branch", "from_port": "false"},
            ],
        },
        timeout=AGENTIC_POLL_TIMEOUT,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a for a in (result.activities or [])}
    assert activities["check"].status == "completed"
    assert activities["agent"].status == "completed"
    assert "false_branch" not in activities or activities["false_branch"].status in {
        "skipped",
        "not_started",
    }


# ---------------------------------------------------------------------------
# 12. Parallel agentic paths converge
# ---------------------------------------------------------------------------


@pytest.mark.xfail(strict=False, reason="Parallel LLM calls may exceed poll timeout on rate-limited APIs")
def test_agentic_parallel_paths_converge(
    nexus_api: NexusApiRegistry,
    llm_credential_id: str,
    llm_model_id: str,
    first_project_id: UUID,
) -> None:
    """Two parallel agentic nodes converge before a downstream script runs."""
    result = create_and_run_workflow(
        nexus_api,
        "e2e-agentic-parallel-converge",
        {
            "name": "agentic-parallel",
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                _agentic_node(
                    "agent_a",
                    "Agent A",
                    "Say exactly: path A done",
                    llm_credential_id,
                    llm_model_id,
                ),
                _agentic_node(
                    "agent_b",
                    "Agent B",
                    "Say exactly: path B done",
                    llm_credential_id,
                    llm_model_id,
                ),
                {
                    "id": "join",
                    "name": "Join Paths",
                    "type": "converge",
                    "parameters": {},
                },
                {
                    "id": "final",
                    "name": "Final Step",
                    "type": "script",
                    "parameters": {"language": "bash", "code": 'echo "Both agents completed"'},
                },
            ],
            "edges": [
                {"from": "trigger", "to": "agent_a"},
                {"from": "trigger", "to": "agent_b"},
                {"from": "agent_a", "to": "join"},
                {"from": "agent_b", "to": "join"},
                {"from": "join", "to": "final"},
            ],
        },
        timeout=AGENTIC_POLL_TIMEOUT * 2,
        project_id=first_project_id,
    )

    assert result.status == ExecutionStatus.COMPLETED, f"Failed: {result.error_details}"
    activities = {a.activity_id: a.status for a in (result.activities or [])}
    assert activities["agent_a"] == "completed"
    assert activities["agent_b"] == "completed"
    assert activities["join"] == "completed"
    assert activities["final"] == "completed"
