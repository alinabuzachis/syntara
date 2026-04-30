"""E2E test: workflow_version_created telemetry event.

Validates that a workflow_version_created Segment event is emitted when
a new workflow is created (initial version) and when a workflow definition
is updated (subsequent version).

Run with:
    make test-e2e-telemetry
"""

from collections.abc import Generator
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry

from tests.e2e.telemetry.conftest import get_captured_events, new_request_id

pytestmark = pytest.mark.e2e

WORKFLOW_DEFINITION_V1: dict[str, Any] = {
    "schema_version": "2.0.0",
    "triggers": [
        {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
    ],
    "nodes": [
        {
            "id": "node_v1",
            "name": "V1 Node",
            "type": "script",
            "config": {"language": "python", "code": "print('v1')"},
        },
    ],
    "edges": [{"from": "trigger", "to": "node_v1"}],
}

WORKFLOW_DEFINITION_V2: dict[str, Any] = {
    "schema_version": "2.0.0",
    "triggers": [
        {"id": "trigger", "type": "manual_trigger", "config": {"inputs": {}}},
    ],
    "nodes": [
        {
            "id": "node_v2",
            "name": "V2 Node",
            "type": "script",
            "config": {"language": "python", "code": "print('v2')"},
        },
    ],
    "edges": [{"from": "trigger", "to": "node_v2"}],
}


@pytest.fixture(scope="module")
def created_workflow(
    nexus_base_url: str,
    auth_headers: dict[str, str],
    segment_server_url: str,
) -> dict[str, Any]:
    """Create a new workflow with X-Request-Id and capture the version event."""
    rid = new_request_id()
    workflow_name = f"e2e-version-telemetry-{uuid4().hex[:8]}"

    headers = {**auth_headers, "X-Request-Id": rid, "Content-Type": "application/json"}
    resp = httpx.post(
        f"{nexus_base_url}/api/v1/workflows",
        json={
            "name": workflow_name,
            "description": "E2E telemetry test: workflow version event",
            "is_enabled": True,
            "workflow_definition": WORKFLOW_DEFINITION_V1,
        },
        headers=headers,
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    events = get_captured_events(
        segment_server_url,
        event_type="workflow_version_created",
        request_id=rid,
        timeout=10.0,
    )

    return {
        "events": events,
        "request_id": rid,
        "workflow_id": data["id"],
        "workflow_name": workflow_name,
    }


@pytest.fixture(scope="module")
def updated_workflow(
    nexus_base_url: str,
    auth_headers: dict[str, str],
    segment_server_url: str,
    created_workflow: dict[str, Any],
) -> dict[str, Any]:
    """Update the workflow definition to trigger a new version event."""
    rid = new_request_id()
    workflow_id = created_workflow["workflow_id"]

    headers = {**auth_headers, "X-Request-Id": rid, "Content-Type": "application/json"}
    resp = httpx.patch(
        f"{nexus_base_url}/api/v1/workflows/{workflow_id}",
        json={"workflow_definition": WORKFLOW_DEFINITION_V2},
        headers=headers,
        timeout=10,
    )
    resp.raise_for_status()

    events = get_captured_events(
        segment_server_url,
        event_type="workflow_version_created",
        request_id=rid,
        timeout=10.0,
    )

    return {
        "events": events,
        "request_id": rid,
        "workflow_id": workflow_id,
    }


@pytest.fixture(scope="module", autouse=True)
def cleanup_workflow(
    nexus_api: NexusApiRegistry,
    created_workflow: dict[str, Any],
) -> Generator[None, None, None]:
    """Delete the test workflow after all tests in this module run."""
    yield
    nexus_api.workflows.delete(workflow_id=UUID(created_workflow["workflow_id"]))


class TestWorkflowVersionCreatedOnCreate:
    """Verify workflow_version_created event on initial workflow creation."""

    def test_event_emitted(self, created_workflow: dict[str, Any]) -> None:
        """A workflow_version_created event must be emitted when a workflow is created."""
        assert len(created_workflow["events"]) >= 1, "No workflow_version_created event captured on create"

    def test_event_has_required_fields(self, created_workflow: dict[str, Any]) -> None:
        """The event must contain workflow_id and version."""
        props = created_workflow["events"][0].get("properties", {})
        assert "workflow_id" in props, f"Missing workflow_id: {props}"
        assert "version" in props, f"Missing version: {props}"

    def test_workflow_id_matches(self, created_workflow: dict[str, Any]) -> None:
        """The workflow_id in the event must match the created workflow."""
        props = created_workflow["events"][0].get("properties", {})
        assert props["workflow_id"] == created_workflow["workflow_id"]

    def test_initial_version_is_one(self, created_workflow: dict[str, Any]) -> None:
        """The version number for a new workflow must be 1."""
        props = created_workflow["events"][0].get("properties", {})
        assert props["version"] == 1

    def test_carries_entitlement_id(self, created_workflow: dict[str, Any]) -> None:
        """The event must include an entitlement_id."""
        props = created_workflow["events"][0].get("properties", {})
        assert "entitlement_id" in props

    def test_carries_request_id(self, created_workflow: dict[str, Any]) -> None:
        """The event must carry the originating X-Request-Id."""
        props = created_workflow["events"][0].get("properties", {})
        assert props.get("request_id") == created_workflow["request_id"]


class TestWorkflowVersionCreatedOnUpdate:
    """Verify workflow_version_created event on workflow definition update."""

    def test_event_emitted(self, updated_workflow: dict[str, Any]) -> None:
        """A workflow_version_created event must be emitted when the definition is updated."""
        assert len(updated_workflow["events"]) >= 1, "No workflow_version_created event captured on update"

    def test_version_incremented(self, updated_workflow: dict[str, Any]) -> None:
        """The version number must be 2 after the first update."""
        props = updated_workflow["events"][0].get("properties", {})
        assert props["version"] == 2

    def test_workflow_id_matches(self, updated_workflow: dict[str, Any]) -> None:
        """The workflow_id must match the updated workflow."""
        props = updated_workflow["events"][0].get("properties", {})
        assert props["workflow_id"] == updated_workflow["workflow_id"]

    def test_carries_request_id(self, updated_workflow: dict[str, Any]) -> None:
        """The event must carry the originating X-Request-Id from the update request."""
        props = updated_workflow["events"][0].get("properties", {})
        assert props.get("request_id") == updated_workflow["request_id"]


class TestNoEventOnUnchangedDefinition:
    """Verify no event is emitted when the definition is unchanged."""

    def test_no_event_on_same_definition(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        segment_server_url: str,
        updated_workflow: dict[str, Any],
    ) -> None:
        """Updating with the same definition must NOT emit a new version event."""
        rid = new_request_id()
        workflow_id = updated_workflow["workflow_id"]

        headers = {**auth_headers, "X-Request-Id": rid, "Content-Type": "application/json"}
        resp = httpx.patch(
            f"{nexus_base_url}/api/v1/workflows/{workflow_id}",
            json={"workflow_definition": WORKFLOW_DEFINITION_V2},
            headers=headers,
            timeout=10,
        )
        resp.raise_for_status()

        events = get_captured_events(
            segment_server_url,
            event_type="workflow_version_created",
            request_id=rid,
            timeout=5.0,
        )
        assert len(events) == 0, f"workflow_version_created emitted for unchanged definition: {events}"
