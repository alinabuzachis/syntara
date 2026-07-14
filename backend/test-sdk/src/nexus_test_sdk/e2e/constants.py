"""Shared constants for E2E tests."""

from __future__ import annotations

from nexus_api_client.models.workflow_definition import WorkflowDefinition

MINIMAL_WORKFLOW_DEFINITION: WorkflowDefinition = WorkflowDefinition.from_dict(
    {
        "schema_version": "2.0.0",
        "name": "e2e-rbac-minimal",
        "triggers": [{"id": "trigger", "type": "manual_trigger", "parameters": {}}],
        "nodes": [],
        "edges": [],
    }
)
