"""Contract tests for POST /api/v1/workflows/validate endpoint."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from nexus_test_sdk.helpers.workflow import create_minimal_workflow_definition

if TYPE_CHECKING:
    from httpx import AsyncClient


@pytest.mark.asyncio
async def test_validate_valid_definition(jwt_client: AsyncClient) -> None:
    """Valid workflow definition returns 200 with valid=True."""
    payload = {
        "workflow_definition": create_minimal_workflow_definition(
            name="test-workflow",
            description="A test workflow",
            activity_id="task1",
            activity_type="script",
        ),
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["errors"] == []
    assert data["warnings"] == []


@pytest.mark.asyncio
async def test_validate_empty_triggers_rejected(jwt_client: AsyncClient) -> None:
    """Definition with empty triggers is rejected by Pydantic (min_length=1)."""
    payload = {
        "workflow_definition": {
            "schema_version": "2.0.0",
            "name": "incomplete",
            "triggers": [],
            "nodes": [],
            "edges": [],
        },
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 422
    data = response.json()
    assert data["type"] == "https://api.nexus.com/errors/validation-error"
    assert data["code"] == "WORKFLOW_DEFINITION_INVALID"
    assert data["validation_result"]["is_valid"] is False


@pytest.mark.asyncio
async def test_validate_invalid_edge_reference(jwt_client: AsyncClient) -> None:
    """Edge referencing non-existent node returns 422 with error including node_id."""
    payload = {
        "workflow_definition": {
            "schema_version": "2.0.0",
            "name": "bad-edges",
            "description": "Workflow with invalid edges",
            "triggers": [{"id": "trigger1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "node1",
                    "name": "Node 1",
                    "type": "script",
                    "parameters": {"language": "python", "code": "print('hi')"},
                },
            ],
            "edges": [{"from": "trigger1", "to": "nonexistent_node"}],
        },
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 422
    data = response.json()
    assert data["type"] == "https://api.nexus.com/errors/validation-error"
    assert data["code"] == "WORKFLOW_DEFINITION_INVALID"
    assert data["retryable"] is False
    vr = data["validation_result"]
    assert vr["is_valid"] is False
    edge_errors = [e for e in vr["findings"] if "nonexistent_node" in e["message"]]
    assert len(edge_errors) == 1
    assert edge_errors[0]["node_id"] == "nonexistent_node"


@pytest.mark.asyncio
async def test_validate_cycle_detection(jwt_client: AsyncClient) -> None:
    """Cyclic workflow definition returns 422 with cycle error."""
    payload = {
        "workflow_definition": {
            "schema_version": "2.0.0",
            "name": "cyclic-workflow",
            "description": "Has a cycle",
            "triggers": [{"id": "trigger1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "node_a",
                    "name": "Node A",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
                {
                    "id": "node_b",
                    "name": "Node B",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
            ],
            "edges": [
                {"from": "trigger1", "to": "node_a"},
                {"from": "node_a", "to": "node_b"},
                {"from": "node_b", "to": "node_a"},
            ],
        },
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 422
    data = response.json()
    assert data["type"] == "https://api.nexus.com/errors/validation-error"
    assert data["code"] == "WORKFLOW_DEFINITION_INVALID"
    vr = data["validation_result"]
    assert vr["is_valid"] is False
    cycle_errors = [e for e in vr["findings"] if "cycle" in e["message"].lower()]
    assert len(cycle_errors) == 1


@pytest.mark.asyncio
async def test_validate_invalid_schema_version(jwt_client: AsyncClient) -> None:
    """Invalid schema_version is rejected by Pydantic with a 422 validation error."""
    payload = {
        "workflow_definition": {
            "schema_version": "1.0",
            "name": "old-version",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [],
            "edges": [],
        },
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 422
    data = response.json()
    assert data["type"] == "https://api.nexus.com/errors/validation-error"
    assert data["code"] == "WORKFLOW_DEFINITION_INVALID"
    assert data["validation_result"]["is_valid"] is False


@pytest.mark.asyncio
async def test_validate_no_persistence(jwt_client: AsyncClient) -> None:
    """Calling validate does not create a Workflow or WorkflowVersion in the database."""
    list_before = await jwt_client.get("/api/v1/workflows")
    count_before = len(list_before.json().get("resources", []))

    payload = {
        "workflow_definition": create_minimal_workflow_definition(
            name="should-not-persist",
            description="This should not be saved",
        ),
    }
    validate_response = await jwt_client.post("/api/v1/workflows/validate", json=payload)
    assert validate_response.status_code == 200

    list_after = await jwt_client.get("/api/v1/workflows")
    count_after = len(list_after.json().get("resources", []))

    assert count_after == count_before


@pytest.mark.asyncio
async def test_validate_response_schema(jwt_client: AsyncClient) -> None:
    """Response contains all required fields with correct types."""
    payload = {
        "workflow_definition": create_minimal_workflow_definition(
            name="schema-check",
            description="Check response schema",
        ),
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert "valid" in data
    assert "errors" in data
    assert "warnings" in data
    assert isinstance(data["valid"], bool)
    assert isinstance(data["errors"], list)
    assert isinstance(data["warnings"], list)


@pytest.mark.asyncio
async def test_validate_orphaned_node_error(jwt_client: AsyncClient) -> None:
    """Node unreachable from any trigger is an error that makes the definition invalid."""
    payload = {
        "workflow_definition": {
            "schema_version": "2.0.0",
            "name": "orphan-workflow",
            "description": "Has an orphaned node",
            "triggers": [{"id": "trigger1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "connected_node",
                    "name": "Connected",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
                {
                    "id": "orphaned_node",
                    "name": "Orphaned",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
            ],
            "edges": [{"from": "trigger1", "to": "connected_node"}],
        },
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 422
    data = response.json()
    assert data["type"] == "https://api.nexus.com/errors/validation-error"
    vr = data["validation_result"]
    assert vr["is_valid"] is False
    orphan_errors = [e for e in vr["findings"] if e.get("node_id") == "orphaned_node"]
    assert len(orphan_errors) == 1


@pytest.mark.asyncio
async def test_validate_converge_no_predecessors(jwt_client: AsyncClient) -> None:
    """Converge node with no incoming edges is rejected."""
    payload = {
        "workflow_definition": {
            "schema_version": "2.0.0",
            "name": "converge-no-preds",
            "description": "Converge with no branches",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "task_a",
                    "name": "Task A",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
                {"id": "conv", "name": "Converge", "type": "converge", "parameters": {}},
            ],
            "edges": [{"from": "t1", "to": "task_a"}],
        },
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "WORKFLOW_DEFINITION_INVALID"
    vr = data["validation_result"]
    assert vr["is_valid"] is False
    converge_errors = [e for e in vr["findings"] if "conv" in e["message"] and "no incoming" in e["message"]]
    assert len(converge_errors) == 1


@pytest.mark.asyncio
async def test_validate_converge_single_predecessor_error(jwt_client: AsyncClient) -> None:
    """Converge node with 1 predecessor is rejected."""
    payload = {
        "workflow_definition": {
            "schema_version": "2.0.0",
            "name": "converge-one-pred",
            "description": "Converge with single branch",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "task_a",
                    "name": "Task A",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
                {"id": "conv", "name": "Converge", "type": "converge", "parameters": {}},
            ],
            "edges": [
                {"from": "t1", "to": "task_a"},
                {"from": "task_a", "to": "conv"},
            ],
        },
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "WORKFLOW_DEFINITION_INVALID"
    vr = data["validation_result"]
    assert vr["is_valid"] is False
    converge_errors = [e for e in vr["findings"] if "only 1 incoming" in e["message"]]
    assert len(converge_errors) == 1
    assert converge_errors[0]["node_id"] == "conv"


@pytest.mark.asyncio
async def test_validate_converge_n_required_exceeds_branches(jwt_client: AsyncClient) -> None:
    """Converge with n_required > branch count is rejected."""
    payload = {
        "workflow_definition": {
            "schema_version": "2.0.0",
            "name": "converge-bad-n-required",
            "description": "n_required too large",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "task_a",
                    "name": "Task A",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
                {
                    "id": "task_b",
                    "name": "Task B",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
                {
                    "id": "conv",
                    "name": "Converge",
                    "type": "converge",
                    "parameters": {"strategy": "any", "n_required": 5},
                },
            ],
            "edges": [
                {"from": "t1", "to": "task_a"},
                {"from": "t1", "to": "task_b"},
                {"from": "task_a", "to": "conv"},
                {"from": "task_b", "to": "conv"},
            ],
        },
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 422
    data = response.json()
    assert data["code"] == "WORKFLOW_DEFINITION_INVALID"
    vr = data["validation_result"]
    assert vr["is_valid"] is False
    n_req_errors = [e for e in vr["findings"] if "n_required" in e["message"]]
    assert len(n_req_errors) == 1


@pytest.mark.asyncio
async def test_validate_converge_valid(jwt_client: AsyncClient) -> None:
    """Well-formed converge node passes validation."""
    payload = {
        "workflow_definition": {
            "schema_version": "2.0.0",
            "name": "converge-valid",
            "description": "Valid converge",
            "triggers": [{"id": "t1", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "task_a",
                    "name": "Task A",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
                {
                    "id": "task_b",
                    "name": "Task B",
                    "type": "script",
                    "parameters": {"language": "python", "code": "pass"},
                },
                {
                    "id": "conv",
                    "name": "Converge",
                    "type": "converge",
                    "parameters": {"strategy": "any", "n_required": 1},
                },
            ],
            "edges": [
                {"from": "t1", "to": "task_a"},
                {"from": "t1", "to": "task_b"},
                {"from": "task_a", "to": "conv"},
                {"from": "task_b", "to": "conv"},
            ],
        },
    }

    response = await jwt_client.post("/api/v1/workflows/validate", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["errors"] == []
