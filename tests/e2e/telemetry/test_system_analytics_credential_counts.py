"""E2E tests for system_analytics credential counts (including used_in_nodes).

Validates that the periodic system_analytics event correctly reports:
- total credentials configured
- per-type credential breakdown
- used_in_nodes: distinct credentials referenced in active workflow nodes

Requirements: AAP-72361

Run with:
    make test-e2e-telemetry
"""

import time
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.project_create import ProjectCreate
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_definition import WorkflowDefinition

from tests.e2e.telemetry.conftest import POLL_INTERVAL

pytestmark = [pytest.mark.e2e]

# Collection interval in the e2e environment is 10s; wait up to 25s.
ANALYTICS_TIMEOUT = 25.0


def _get_latest_credential_counts(segment_server_url: str) -> dict[str, Any]:
    """Wait for the next system_analytics event and return its credential counts.

    Records the current event count, then polls until a new system_analytics
    event appears beyond that baseline.  This avoids DELETE /captured-events
    which would destroy events that parallel test workers depend on.
    """
    # Snapshot current system_analytics events to know the baseline count
    r = httpx.get(
        f"{segment_server_url}/captured-events",
        params={"event_type": "system_analytics"},
        timeout=5,
    )
    r.raise_for_status()
    baseline_count = len(r.json())

    # Poll until at least one NEW system_analytics event appears
    elapsed = 0.0
    while elapsed < ANALYTICS_TIMEOUT:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        resp = httpx.get(
            f"{segment_server_url}/captured-events",
            params={"event_type": "system_analytics"},
            timeout=5,
        )
        resp.raise_for_status()
        all_events: list[dict[str, Any]] = resp.json()
        if len(all_events) > baseline_count:
            # Return the most recent event's credential counts
            return all_events[-1]["properties"]["credentials"]  # type: ignore[no-any-return]

    pytest.fail(f"No new system_analytics event after {ANALYTICS_TIMEOUT}s (baseline={baseline_count})")


def _get_credential_type_id(nexus_api: NexusApiRegistry, name: str) -> UUID:
    """Look up a pre-seeded credential type by name and return its ID."""
    data = nexus_api.credentials.list_types().assert_and_get()
    for ct in data.resources:
        if ct.name == name:
            return ct.id  # type: ignore[no-any-return]
    pytest.fail(f"Credential type '{name}' not found in pre-seeded types")


@pytest.fixture(scope="module")
def e2e_project(nexus_api: NexusApiRegistry) -> UUID:
    """Create a project for the credential counts e2e tests."""
    project_name = f"e2e-cred-counts-{uuid4().hex[:8]}"
    data = nexus_api.projects.create(
        body=ProjectCreate(name=project_name, description="E2E credential counts test"),
    ).assert_and_get()
    return data.id  # type: ignore[no-any-return]


class TestSystemAnalyticsCredentialCounts:
    """Verify credential counts in periodic system_analytics events."""

    def test_credential_total_and_type_breakdown(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
        e2e_project: UUID,
    ) -> None:
        """Creating credentials should be reflected in system_analytics counts."""
        bearer_type_id = _get_credential_type_id(nexus_api, "HTTP Bearer Token")

        # Capture baseline counts before creating new credentials
        baseline = _get_latest_credential_counts(segment_server_url)
        expected_total = baseline["total"] + 2
        expected_bearer = baseline["type"].get("HTTP Bearer Token", 0) + 2

        # Create two credentials of the same type
        for _i in range(2):
            nexus_api.credentials.create(
                body=CredentialCreate(
                    name=f"e2e-bearer-{uuid4().hex[:8]}",
                    credential_type_id=bearer_type_id,
                    project_id=e2e_project,
                    inputs=CredentialCreateInputs.from_dict({"token": "e2e-dummy-token"}),
                ),
            ).assert_and_get()

        # Wait for a fresh collection cycle and assert exact expected counts
        updated = _get_latest_credential_counts(segment_server_url)

        assert updated["total"] == expected_total
        assert updated["type"]["HTTP Bearer Token"] == expected_bearer
        assert "used_in_nodes" in updated

    def test_used_in_nodes_reflects_workflow_credential_references(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
        e2e_project: UUID,
    ) -> None:
        """used_in_nodes should count distinct credentials referenced in workflow nodes."""
        bearer_type_id = _get_credential_type_id(nexus_api, "HTTP Bearer Token")

        # Capture baseline counts
        baseline = _get_latest_credential_counts(segment_server_url)
        expected_total = baseline["total"] + 1
        expected_used_in_nodes = baseline["used_in_nodes"] + 1

        # Create a credential to reference in a workflow
        cred_data = nexus_api.credentials.create(
            body=CredentialCreate(
                name=f"e2e-used-cred-{uuid4().hex[:8]}",
                credential_type_id=bearer_type_id,
                project_id=e2e_project,
                inputs=CredentialCreateInputs.from_dict({"token": "e2e-dummy-token"}),
            ),
        ).assert_and_get()
        cred_id = str(cred_data.id)

        # Create a workflow whose node references this credential
        workflow_definition: WorkflowDefinition = WorkflowDefinition.from_dict(
            {
                "name": "analytics",
                "schema_version": "2.0.0",
                "triggers": [
                    {
                        "id": "trigger_manual",
                        "type": "manual_trigger",
                        "config": {"inputs": {}},
                    }
                ],
                "nodes": [
                    {
                        "id": "api_node",
                        "name": "API call with credential",
                        "type": "http_request",
                        "config": {
                            "method": "GET",
                            "url": "https://example.com",
                            "credential_id": cred_id,
                        },
                    },
                ],
                "edges": [{"from": "trigger_manual", "to": "api_node"}],
            }
        )
        nexus_api.workflows.create(
            body=WorkflowCreate(
                name=f"e2e-cred-wf-{uuid4().hex[:8]}",
                description="E2E test: workflow referencing a credential",
                workflow_definition=workflow_definition,
            ),
        ).assert_and_get()

        # Wait for a fresh collection cycle and assert exact expected counts
        updated = _get_latest_credential_counts(segment_server_url)

        assert updated["total"] == expected_total
        assert updated["used_in_nodes"] == expected_used_in_nodes
