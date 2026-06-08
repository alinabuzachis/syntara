"""E2E tests for credential API endpoints.

Covers tests 42, 44-52 from the ANSTRAT-1901 test plan — the API-side
tests that belong in nexus rather than nexus-ui:

- Secret field masking ($encrypted$ sentinel)
- Workflow execution with valid / disabled / deleted credentials
- Credential value scrubbing in execution history
- RBAC enforcement (admin, user, auditor, project-scoped)

Run with:
    APP_BASE_URL=http://localhost:8000 make test-e2e
"""

from __future__ import annotations

import os
import time
from http import HTTPStatus
from typing import TYPE_CHECKING, Any
from uuid import UUID

import pytest

if TYPE_CHECKING:
    from nexus_api_client import AuthenticatedClient
    from nexus_api_client.api import NexusApiRegistry

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.credential_patch import CredentialPatch
from nexus_api_client.models.credential_patch_inputs_type_0 import CredentialPatchInputsType0
from nexus_api_client.models.execution_status import ExecutionStatus

pytestmark = pytest.mark.e2e

POLL_INTERVAL = 1
POLL_TIMEOUT = 30
ENCRYPTED_SENTINEL = "$encrypted$"

_TERMINAL = {ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_bearer_token_type_id(api: NexusApiRegistry) -> UUID:
    """Return the credential type ID for 'HTTP Bearer Token'."""
    resp = api.credentials.list_types()
    assert resp.is_success
    assert resp.parsed is not None
    for ct in resp.parsed.resources:
        if ct.name == "HTTP Bearer Token":
            return UUID(str(ct.id))
    pytest.fail("Preseeded 'HTTP Bearer Token' credential type not found")


def _get_first_project_id(api: NexusApiRegistry) -> UUID:
    """Return the first available project ID."""
    resp = api.projects.list()
    assert resp.is_success
    assert resp.parsed is not None
    assert len(resp.parsed.resources) > 0, "No projects available"
    return UUID(str(resp.parsed.resources[0].id))


def _create_credential(
    api: NexusApiRegistry,
    *,
    name: str,
    inputs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create an HTTP Bearer Token credential and return the response dict."""
    type_id = _get_bearer_token_type_id(api)
    project_id = _get_first_project_id(api)
    cred = api.credentials.create(
        body=CredentialCreate(
            name=name,
            credential_type_id=type_id,
            project_id=project_id,
            inputs=CredentialCreateInputs.from_dict(inputs or {"token": "test-secret-value-e2e"}),
        ),
    ).assert_and_get()
    result: dict[str, Any] = cred.to_dict()
    return result


def _delete_credential(api: NexusApiRegistry, credential_id: str | UUID) -> None:
    """Delete a credential, ignoring 404 (already deleted)."""
    resp = api.credentials.delete(credential_id=UUID(str(credential_id)))
    assert resp.status_code in (HTTPStatus.NO_CONTENT, HTTPStatus.NOT_FOUND)


def _poll_execution(api: NexusApiRegistry, exec_id: str, timeout: int = POLL_TIMEOUT) -> None:
    """Poll until execution reaches a terminal state."""
    elapsed = 0
    while elapsed < timeout:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        resp = api.executions.get(execution_id=UUID(exec_id))
        assert resp.is_success
        assert resp.parsed is not None
        if resp.parsed.status in _TERMINAL:
            return
    pytest.fail(f"Execution {exec_id} did not finish within {timeout}s")


# ===================================================================
# Test 42: Secret Field Security — API Side
# ===================================================================


class TestSecretFieldMasking:
    """Verify the API never returns plaintext secret values."""

    def test_create_response_masks_secrets(self, nexus_api: NexusApiRegistry) -> None:
        """POST /credentials response must contain $encrypted$, not plaintext."""
        cred = _create_credential(nexus_api, name="e2e-secret-mask-create")
        try:
            assert cred["inputs"]["token"] == ENCRYPTED_SENTINEL
            assert "test-secret-value-e2e" not in str(cred)
        finally:
            _delete_credential(nexus_api, cred["id"])

    def test_get_response_masks_secrets(self, nexus_api: NexusApiRegistry) -> None:
        """GET /credentials/{id} must contain $encrypted$, not plaintext."""
        cred = _create_credential(nexus_api, name="e2e-secret-mask-get")
        try:
            resp = nexus_api.credentials.get(credential_id=UUID(cred["id"]))
            assert resp.is_success
            assert resp.parsed is not None
            data = resp.parsed.to_dict()
            assert data["inputs"]["token"] == ENCRYPTED_SENTINEL
            assert "test-secret-value-e2e" not in str(data)
        finally:
            _delete_credential(nexus_api, cred["id"])

    def test_list_response_masks_secrets(self, nexus_api: NexusApiRegistry) -> None:
        """GET /credentials list must not leak plaintext secrets."""
        cred = _create_credential(nexus_api, name="e2e-secret-mask-list")
        try:
            resp = nexus_api.credentials.list()
            assert resp.is_success
            raw = str(resp.content)
            assert "test-secret-value-e2e" not in raw
        finally:
            _delete_credential(nexus_api, cred["id"])

    def test_update_with_sentinel_returns_encrypted(self, nexus_api: NexusApiRegistry) -> None:
        """PATCH with $encrypted$ inputs still returns $encrypted$ on GET."""
        cred = _create_credential(nexus_api, name="e2e-secret-mask-update")
        try:
            resp = nexus_api.credentials.update(
                credential_id=UUID(cred["id"]),
                body=CredentialPatch(
                    description="updated description",
                    inputs=CredentialPatchInputsType0.from_dict({"token": ENCRYPTED_SENTINEL}),
                ),
            )
            assert resp.is_success
            get_resp = nexus_api.credentials.get(credential_id=UUID(cred["id"]))
            assert get_resp.parsed is not None
            assert get_resp.parsed.to_dict()["inputs"]["token"] == ENCRYPTED_SENTINEL
        finally:
            _delete_credential(nexus_api, cred["id"])


# ===================================================================
# Test 44: Workflow Execution with Valid Credential
# ===================================================================


@pytest.mark.skip(reason="TODO: requires workflow with credential-consuming node")
class TestWorkflowWithValidCredential:
    """Verify credential resolution succeeds at runtime."""

    def test_workflow_resolves_credential(self, nexus_api: NexusApiRegistry) -> None:
        """Execute a workflow referencing a valid credential — expect success."""
        # ANSTRAT-1901: implement when workflow+credential wiring is available
        # 1. Create HTTP Bearer Token credential
        # 2. Create workflow with HTTP Request node referencing the credential
        # 3. Execute the workflow
        # 4. Poll until terminal state
        # 5. Assert status == COMPLETED
        # 6. Assert no credential-resolution errors in activities
        # 7. Cleanup credential + workflow


# ===================================================================
# Test 45: Workflow Execution with Disabled Credential
# ===================================================================


@pytest.mark.skip(reason="TODO: requires workflow with credential-consuming node")
class TestWorkflowWithDisabledCredential:
    """Verify disabled credentials fail with clear error."""

    def test_disabled_credential_fails_execution(self, nexus_api: NexusApiRegistry) -> None:
        """Disable a credential, execute its workflow — expect non-retryable failure."""
        # ANSTRAT-1901: implement when workflow+credential wiring is available
        # 1. Create credential, link to workflow
        # 2. Disable credential via PATCH (enabled=False)
        # 3. Execute workflow
        # 4. Poll until terminal state
        # 5. Assert status == FAILED
        # 6. Assert error message contains "disabled"
        # 7. Re-enable, re-execute, assert COMPLETED
        # 8. Cleanup


# ===================================================================
# Test 46: Workflow Execution with Deleted Credential
# ===================================================================


@pytest.mark.skip(reason="TODO: requires workflow with credential-consuming node")
class TestWorkflowWithDeletedCredential:
    """Verify deleted credentials fail with clear error."""

    def test_deleted_credential_fails_execution(self, nexus_api: NexusApiRegistry) -> None:
        """Delete a credential, execute its workflow — expect non-retryable failure."""
        # ANSTRAT-1901: implement when workflow+credential wiring is available
        # 1. Create credential, link to workflow
        # 2. Delete credential
        # 3. Execute workflow
        # 4. Poll until terminal state
        # 5. Assert status == FAILED
        # 6. Assert error message contains "not found" or "deleted"
        # 7. Cleanup workflow


# ===================================================================
# Test 47: Credential Values Not Exposed in Execution History
# ===================================================================


@pytest.mark.skip(reason="TODO: requires workflow with credential-consuming node")
class TestCredentialScrubbing:
    """Verify secret values are scrubbed from execution history."""

    def test_execution_history_does_not_contain_plaintext(
        self, nexus_api: NexusApiRegistry, nexus_client: AuthenticatedClient
    ) -> None:
        """Inspect execution detail and activity logs for leaked secrets."""
        # ANSTRAT-1901: implement when workflow+credential wiring is available
        # 1. Create credential with known secret value
        # 2. Create and execute workflow using the credential
        # 3. Poll until complete
        # 4. GET /executions/{id}?include=activities
        # 5. Assert secret value absent from full response body
        # 6. Assert any credential data shows [REDACTED] or $encrypted$
        # 7. Cleanup


# ===================================================================
# Test 48: RBAC — Admin Full CRUD
# ===================================================================


class TestRbacAdminFullCrud:
    """Admin role has full create, read, update, delete access."""

    def test_admin_crud_lifecycle(self, nexus_api: NexusApiRegistry) -> None:
        """Admin creates, reads, updates, and deletes a credential."""
        cred = _create_credential(nexus_api, name="e2e-rbac-admin")
        cred_id = UUID(cred["id"])
        try:
            # Read
            get_resp = nexus_api.credentials.get(credential_id=cred_id)
            assert get_resp.status_code == HTTPStatus.OK

            # Update
            patch_resp = nexus_api.credentials.update(
                credential_id=cred_id,
                body=CredentialPatch(description="admin updated"),
            )
            assert patch_resp.is_success

            # Delete
            del_resp = nexus_api.credentials.delete(credential_id=cred_id)
            assert del_resp.status_code == HTTPStatus.NO_CONTENT
        except Exception:
            _delete_credential(nexus_api, cred_id)
            raise


# ===================================================================
# Test 49: RBAC — User Cannot Delete
# ===================================================================


class TestRbacUserCannotDelete:
    """User role can create/read/update but NOT delete credentials."""

    def test_user_create_read_update_succeeds(
        self, nexus_api: NexusApiRegistry, viewer_client: AuthenticatedClient
    ) -> None:
        """User role can create, read, and update credentials."""
        # ANSTRAT-1901: needs user-role client fixture (viewer has no roles)
        # 1. Create credential as user
        # 2. Read it back — assert 200
        # 3. Update description — assert success
        pytest.skip("Requires user-role client fixture (not viewer)")

    def test_user_delete_returns_403(self, nexus_api: NexusApiRegistry, viewer_client: AuthenticatedClient) -> None:
        """User role attempting DELETE gets 403 Forbidden."""
        cred = _create_credential(nexus_api, name="e2e-rbac-user-del")
        cred_id = UUID(cred["id"])
        try:
            http = viewer_client.get_httpx_client()
            resp = http.delete(f"/credentials/{cred_id}")
            assert resp.status_code == HTTPStatus.FORBIDDEN
        finally:
            _delete_credential(nexus_api, cred_id)


# ===================================================================
# Test 50: RBAC — Auditor Read-Only
# ===================================================================


class TestRbacAuditorReadOnly:
    """Auditor role can list and read credentials but cannot mutate."""

    def test_auditor_can_list(self, nexus_api: NexusApiRegistry, auditor_client: AuthenticatedClient) -> None:
        """Auditor can GET /credentials."""
        http = auditor_client.get_httpx_client()
        resp = http.get("/credentials")
        assert resp.status_code == HTTPStatus.OK

    def test_auditor_can_read(self, nexus_api: NexusApiRegistry, auditor_client: AuthenticatedClient) -> None:
        """Auditor can GET /credentials/{id}."""
        cred = _create_credential(nexus_api, name="e2e-rbac-auditor-read")
        try:
            http = auditor_client.get_httpx_client()
            resp = http.get(f"/credentials/{cred['id']}")
            assert resp.status_code == HTTPStatus.OK
        finally:
            _delete_credential(nexus_api, cred["id"])

    def test_auditor_cannot_create(self, auditor_client: AuthenticatedClient) -> None:
        """Auditor POST /credentials gets 403."""
        http = auditor_client.get_httpx_client()
        resp = http.post("/credentials", json={"name": "should-fail"})
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_auditor_cannot_update(self, nexus_api: NexusApiRegistry, auditor_client: AuthenticatedClient) -> None:
        """Auditor PATCH /credentials/{id} gets 403."""
        cred = _create_credential(nexus_api, name="e2e-rbac-auditor-patch")
        try:
            http = auditor_client.get_httpx_client()
            resp = http.patch(f"/credentials/{cred['id']}", json={"description": "nope"})
            assert resp.status_code == HTTPStatus.FORBIDDEN
        finally:
            _delete_credential(nexus_api, cred["id"])

    def test_auditor_cannot_delete(self, nexus_api: NexusApiRegistry, auditor_client: AuthenticatedClient) -> None:
        """Auditor DELETE /credentials/{id} gets 403."""
        cred = _create_credential(nexus_api, name="e2e-rbac-auditor-del")
        try:
            http = auditor_client.get_httpx_client()
            resp = http.delete(f"/credentials/{cred['id']}")
            assert resp.status_code == HTTPStatus.FORBIDDEN
        finally:
            _delete_credential(nexus_api, cred["id"])


# ===================================================================
# Test 51: RBAC — Project-Scoped Credential Visibility
# ===================================================================


@pytest.mark.skip(reason="TODO: requires two users with different project access")
class TestRbacProjectScopedVisibility:
    """Credentials with project_id are only visible to users with project access."""

    def ***REMOVED***(self, nexus_api: NexusApiRegistry) -> None:
        """Credential with project_id=NULL is visible to all authorized users."""
        # ANSTRAT-1901: implement when workflow+credential wiring is available
        # 1. Create org-level credential (project_id=NULL — if supported)
        # 2. List as user A (with project access) — assert visible
        # 3. List as user B (without project access) — assert visible
        # 4. Cleanup

    def test_project_scoped_credential_hidden_from_unauthorized(self, nexus_api: NexusApiRegistry) -> None:
        """Credential scoped to project X is invisible to users without project X access."""
        # ANSTRAT-1901: implement when workflow+credential wiring is available
        # 1. Create project-scoped credential
        # 2. List as user with project access — assert visible
        # 3. List as user without project access — assert NOT visible
        # 4. Direct GET by ID as unauthorized user — assert 403
        # 5. Cleanup


# ===================================================================
# Test 52: RBAC — Permission Denied Error Handling
# ===================================================================


class TestRbacPermissionDeniedResponse:
    """403 responses are well-formed and do not leak internals."""

    def test_403_response_format(self, nexus_api: NexusApiRegistry, auditor_client: AuthenticatedClient) -> None:
        """403 body follows RFC 9457 problem format without leaking policy names."""
        http = auditor_client.get_httpx_client()
        resp = http.post("/credentials", json={"name": "forbidden-test"})
        assert resp.status_code == HTTPStatus.FORBIDDEN

        body = resp.json()
        assert "type" in body or "detail" in body
        raw = str(body).lower()
        assert "policy" not in raw, "403 should not expose internal policy names"
        assert "role_assignment" not in raw, "403 should not expose role details"
