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

import json
import os
import time
from http import HTTPStatus
from typing import TYPE_CHECKING, Any
from uuid import UUID

import pytest

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus_api_client import AuthenticatedClient
    from nexus_api_client.api import NexusApiRegistry

    CredentialFactory = Callable[..., dict[str, Any]]

if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.credential_update import CredentialUpdate
from nexus_api_client.models.credential_update_inputs_type_0 import CredentialUpdateInputsType0
from nexus_api_client.models.execution_status import ExecutionStatus

pytestmark = [pytest.mark.e2e]

POLL_INTERVAL = 1
POLL_TIMEOUT = 30
ENCRYPTED_SENTINEL = "$encrypted$"

_TERMINAL = {ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _poll_execution(api: NexusApiRegistry, exec_id: str, timeout: int = POLL_TIMEOUT) -> None:
    """Poll until execution reaches a terminal state."""
    elapsed = 0
    while elapsed < timeout:
        time.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL
        execution = api.executions.get(execution_id=UUID(exec_id)).assert_and_get()
        if execution.status in _TERMINAL:
            return
    pytest.fail(f"Execution {exec_id} did not finish within {timeout}s")


# ===================================================================
# Test 42: Secret Field Security — API Side
# ===================================================================


class TestSecretFieldMasking:
    """Verify the API never returns plaintext secret values."""

    def test_create_response_masks_secrets(self, credential_factory: CredentialFactory) -> None:
        """POST /credentials response must contain $encrypted$, not plaintext."""
        cred = credential_factory("e2e-secret-mask-create")
        assert cred["inputs"]["token"] == ENCRYPTED_SENTINEL
        assert "test-secret-value-e2e" not in str(cred)

    def test_get_response_masks_secrets(
        self, nexus_api: NexusApiRegistry, credential_factory: CredentialFactory
    ) -> None:
        """GET /credentials/{id} must contain $encrypted$, not plaintext."""
        cred = credential_factory("e2e-secret-mask-get")
        credential = nexus_api.credentials.get(credential_id=UUID(cred["id"])).assert_and_get()
        data = credential.to_dict()
        assert data["inputs"]["token"] == ENCRYPTED_SENTINEL
        assert "test-secret-value-e2e" not in str(data)

    def test_list_response_masks_secrets(
        self, nexus_api: NexusApiRegistry, credential_factory: CredentialFactory
    ) -> None:
        """GET /credentials list must not leak plaintext secrets."""
        _cred = credential_factory("e2e-secret-mask-list")
        credentials_list = nexus_api.credentials.list().assert_and_get()
        raw = str(credentials_list)
        assert "test-secret-value-e2e" not in raw

    def test_update_with_sentinel_returns_encrypted(
        self, nexus_api: NexusApiRegistry, credential_factory: CredentialFactory
    ) -> None:
        """PATCH with $encrypted$ inputs still returns $encrypted$ on GET."""
        cred = credential_factory("e2e-secret-mask-update")
        nexus_api.credentials.update(
            credential_id=UUID(cred["id"]),
            body=CredentialUpdate(
                description="updated description",
                inputs=CredentialUpdateInputsType0.from_dict({"token": ENCRYPTED_SENTINEL}),
            ),
        ).assert_and_get()
        credential = nexus_api.credentials.get(credential_id=UUID(cred["id"])).assert_and_get()
        assert credential.to_dict()["inputs"]["token"] == ENCRYPTED_SENTINEL


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

    def test_admin_crud_lifecycle(self, nexus_api: NexusApiRegistry, credential_factory: CredentialFactory) -> None:
        """Admin creates, reads, updates, and deletes a credential."""
        cred = credential_factory("e2e-rbac-admin")
        cred_id = UUID(cred["id"])

        # Read
        nexus_api.credentials.get(credential_id=cred_id).assert_and_get()

        # Update
        nexus_api.credentials.update(
            credential_id=cred_id,
            body=CredentialUpdate(description="admin updated"),
        ).assert_and_get()

        # Delete
        del_resp = nexus_api.credentials.delete(credential_id=cred_id)
        assert del_resp.status_code == HTTPStatus.NO_CONTENT


# ===================================================================
# Test 49: RBAC — User Cannot Delete
# ===================================================================


class TestRbacUserCannotDelete:
    """User role can create/read/update but NOT delete credentials."""

    def test_user_create_read_update_succeeds(self, nexus_api: NexusApiRegistry, viewer_api: NexusApiRegistry) -> None:
        """User role can create, read, and update credentials."""
        # ANSTRAT-1901: needs user-role client fixture (viewer has no roles)
        # 1. Create credential as user
        # 2. Read it back — assert 200
        # 3. Update description — assert success
        pytest.skip("Requires user-role client fixture (not viewer)")

    def test_user_delete_returns_403(self, viewer_api: NexusApiRegistry, credential_factory: CredentialFactory) -> None:
        """User role attempting DELETE gets 403 Forbidden."""
        cred = credential_factory("e2e-rbac-user-del")
        cred_id = UUID(cred["id"])
        resp = viewer_api.credentials.delete(credential_id=cred_id)
        assert resp.status_code == HTTPStatus.FORBIDDEN


# ===================================================================
# Test 50: RBAC — Auditor Read-Only
# ===================================================================


class TestRbacAuditorReadOnly:
    """Auditor role can list and read credentials but cannot mutate."""

    def test_auditor_can_list(self, auditor_api: NexusApiRegistry) -> None:
        """Auditor can GET /credentials."""
        resp = auditor_api.credentials.list()
        assert resp.status_code == HTTPStatus.OK

    def test_auditor_can_read(self, auditor_api: NexusApiRegistry, credential_factory: CredentialFactory) -> None:
        """Auditor can GET /credentials/{id}."""
        cred = credential_factory("e2e-rbac-auditor-read")
        resp = auditor_api.credentials.get(credential_id=UUID(cred["id"]))
        assert resp.status_code == HTTPStatus.OK

    def test_auditor_cannot_create(
        self,
        auditor_api: NexusApiRegistry,
        bearer_token_type_id: UUID,
        first_project_id: UUID,
    ) -> None:
        """Auditor POST /credentials gets 403."""
        # Authorization check happens before validation, so we can use valid data
        resp = auditor_api.credentials.create(
            body=CredentialCreate(
                name="should-fail",
                credential_type_id=bearer_token_type_id,
                project_id=first_project_id,
                inputs=CredentialCreateInputs.from_dict({"token": "test"}),
            )
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_auditor_cannot_update(self, auditor_api: NexusApiRegistry, credential_factory: CredentialFactory) -> None:
        """Auditor PATCH /credentials/{id} gets 403."""
        cred = credential_factory("e2e-rbac-auditor-patch")
        resp = auditor_api.credentials.update(
            credential_id=UUID(cred["id"]),
            body=CredentialUpdate(description="nope"),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_auditor_cannot_delete(self, auditor_api: NexusApiRegistry, credential_factory: CredentialFactory) -> None:
        """Auditor DELETE /credentials/{id} gets 403."""
        cred = credential_factory("e2e-rbac-auditor-del")
        resp = auditor_api.credentials.delete(credential_id=UUID(cred["id"]))
        assert resp.status_code == HTTPStatus.FORBIDDEN


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

    def test_403_response_format(
        self,
        auditor_api: NexusApiRegistry,
        bearer_token_type_id: UUID,
        first_project_id: UUID,
    ) -> None:
        """403 body follows RFC 9457 problem format without leaking policy names."""
        # Authorization check happens before validation, so we can use valid data
        resp = auditor_api.credentials.create(
            body=CredentialCreate(
                name="forbidden-test",
                credential_type_id=bearer_token_type_id,
                project_id=first_project_id,
                inputs=CredentialCreateInputs.from_dict({"token": "test"}),
            )
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

        # Check response body format
        assert resp.content is not None
        body: dict[str, Any] = json.loads(resp.content.decode())
        assert "type" in body or "detail" in body
        raw = str(body).lower()
        assert "policy" not in raw, "403 should not expose internal policy names"
        assert "role_assignment" not in raw, "403 should not expose role details"
