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
from http import HTTPStatus
from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

    from tests.fixtures.factories.credential_factories import CredentialFactory


if not os.environ.get("APP_BASE_URL"):
    pytest.skip("APP_BASE_URL not set — full stack required", allow_module_level=True)

from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.credential_update import CredentialUpdate
from nexus_api_client.models.credential_update_inputs_type_0 import CredentialUpdateInputsType0

from tests.fixtures.factories import get_bearer_token_type_id

pytestmark = [pytest.mark.e2e]

ENCRYPTED_SENTINEL = "$encrypted$"

# ===================================================================
# Test 42: Secret Field Security — API Side
# ===================================================================


class TestSecretFieldMasking:
    """Verify the API never returns plaintext secret values."""

    def test_create_response_masks_secrets(
        self, nexus_api: NexusApiRegistry, first_project_id: UUID, create_credential: CredentialFactory
    ) -> None:
        """POST /credentials response must contain $encrypted$, not plaintext."""
        _, cred_name, cred = create_credential(api=nexus_api, project_id=first_project_id, prefix="secret-mask-create")
        assert cred["inputs"]["token"] == ENCRYPTED_SENTINEL
        assert f"test-{cred_name}" not in str(cred)

    def test_get_response_masks_secrets(
        self, nexus_api: NexusApiRegistry, first_project_id: UUID, create_credential: CredentialFactory
    ) -> None:
        """GET /credentials/{id} must contain $encrypted$, not plaintext."""
        cred_id, cred_name, _ = create_credential(api=nexus_api, project_id=first_project_id, prefix="secret-mask-get")
        credential = nexus_api.credentials.get(credential_id=cred_id).assert_and_get()
        data = credential.to_dict()
        assert data["inputs"]["token"] == ENCRYPTED_SENTINEL
        assert f"test-{cred_name}" not in str(data)

    def test_list_response_masks_secrets(
        self, nexus_api: NexusApiRegistry, first_project_id: UUID, create_credential: CredentialFactory
    ) -> None:
        """GET /credentials list must not leak plaintext secrets."""
        _, cred_name, _ = create_credential(api=nexus_api, project_id=first_project_id, prefix="secret-mask-list")
        credentials_list = nexus_api.credentials.list().assert_and_get()
        raw = str(credentials_list)
        assert f"test-{cred_name}" not in raw

    def test_update_with_sentinel_returns_encrypted(
        self, nexus_api: NexusApiRegistry, first_project_id: UUID, create_credential: CredentialFactory
    ) -> None:
        """PATCH with $encrypted$ inputs still returns $encrypted$ on GET."""
        cred_id, *_ = create_credential(api=nexus_api, project_id=first_project_id, prefix="secret-mask-update")
        nexus_api.credentials.update(
            credential_id=cred_id,
            body=CredentialUpdate(
                description="updated description",
                inputs=CredentialUpdateInputsType0.from_dict({"token": ENCRYPTED_SENTINEL}),
            ),
        ).assert_and_get()
        credential = nexus_api.credentials.get(credential_id=cred_id).assert_and_get()
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


class TestCredentialScrubbing:
    """Verify secret values are scrubbed from execution history (AAP-79021)."""

    _SECRET = "test-e2e-scrub-stdout"  # noqa: S105

    def test_script_stdout_secret_is_scrubbed(
        self,
        nexus_api: NexusApiRegistry,
        first_project_id: UUID,
        create_credential: CredentialFactory,
    ) -> None:
        """Script node prints credential value to stdout — must be [REDACTED] in execution history."""
        from tests.e2e.helpers import create_and_run_workflow

        cred_id, _, _ = create_credential(api=nexus_api, project_id=first_project_id, name="e2e-scrub-stdout")

        definition = {
            "schema_version": "2.0.0",
            "name": "e2e-scrub-stdout-test",
            "description": "AAP-79021: verify value-based credential scrubbing",
            "triggers": [{"id": "trigger_manual", "type": "manual_trigger", "parameters": {}}],
            "nodes": [
                {
                    "id": "echo_secret",
                    "name": "Echo Secret",
                    "type": "script",
                    "parameters": {
                        "language": "python",
                        "code": f'print("{self._SECRET}")',
                        "credential_id": str(cred_id),
                    },
                }
            ],
            "edges": [{"from": "trigger_manual", "to": "echo_secret"}],
        }

        execution = create_and_run_workflow(nexus_api, "e2e-scrub-stdout-test", definition, timeout=30)
        status_str = str(execution.status)
        assert status_str in {"completed", "completed_with_errors"}, f"Unexpected status: {status_str}"

        full_response = str(execution.to_dict())
        assert self._SECRET not in full_response, "Plaintext secret leaked into execution response"

        activities = execution.activities or []
        script_activities = [a for a in activities if a.activity_id == "echo_secret"]
        assert len(script_activities) == 1, "Expected exactly one echo_secret activity"

        output = script_activities[0].to_dict().get("output_data") or {}
        output_str = str(output)
        assert self._SECRET not in output_str, "Plaintext secret leaked into activity output_data"
        assert "[REDACTED]" in output_str, "Expected [REDACTED] in scrubbed output_data"


# ===================================================================
# Test 48: RBAC — Admin Full CRUD
# ===================================================================


class TestRbacAdminFullCrud:
    """Admin role has full create, read, update, delete access."""

    def test_admin_crud_lifecycle(
        self, nexus_api: NexusApiRegistry, first_project_id: UUID, create_credential: CredentialFactory
    ) -> None:
        """Admin creates, reads, updates, and deletes a credential."""
        cred_id, *_ = create_credential(api=nexus_api, project_id=first_project_id, prefix="rbac-admin")

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

    def test_user_delete_returns_403(
        self,
        viewer_api: NexusApiRegistry,
        nexus_api: NexusApiRegistry,
        first_project_id: UUID,
        create_credential: CredentialFactory,
    ) -> None:
        """User role attempting DELETE gets 403 Forbidden."""
        cred_id, *_ = create_credential(api=nexus_api, project_id=first_project_id, prefix="rbac-user-del")
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

    def test_auditor_can_read(
        self,
        auditor_api: NexusApiRegistry,
        nexus_api: NexusApiRegistry,
        first_project_id: UUID,
        create_credential: CredentialFactory,
    ) -> None:
        """Auditor can GET /credentials/{id}."""
        cred_id, *_ = create_credential(api=nexus_api, project_id=first_project_id, prefix="rbac-auditor-read")
        resp = auditor_api.credentials.get(credential_id=cred_id)
        assert resp.status_code == HTTPStatus.OK

    def test_auditor_cannot_create(
        self,
        auditor_api: NexusApiRegistry,
        nexus_api: NexusApiRegistry,
        first_project_id: UUID,
    ) -> None:
        """Auditor POST /credentials gets 403."""
        # Authorization check happens before validation, so we can use valid data
        resp = auditor_api.credentials.create(
            body=CredentialCreate(
                name="should-fail",
                credential_type_id=get_bearer_token_type_id(nexus_api),
                project_id=first_project_id,
                inputs=CredentialCreateInputs.from_dict({"token": "test"}),
            )
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_auditor_cannot_update(
        self,
        auditor_api: NexusApiRegistry,
        nexus_api: NexusApiRegistry,
        first_project_id: UUID,
        create_credential: CredentialFactory,
    ) -> None:
        """Auditor PATCH /credentials/{id} gets 403."""
        cred_id, *_ = create_credential(api=nexus_api, project_id=first_project_id, prefix="rbac-auditor-patch")
        resp = auditor_api.credentials.update(
            credential_id=cred_id,
            body=CredentialUpdate(description="nope"),
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_auditor_cannot_delete(
        self,
        auditor_api: NexusApiRegistry,
        nexus_api: NexusApiRegistry,
        first_project_id: UUID,
        create_credential: CredentialFactory,
    ) -> None:
        """Auditor DELETE /credentials/{id} gets 403."""
        cred_id, *_ = create_credential(api=nexus_api, project_id=first_project_id, prefix="rbac-auditor-del")
        resp = auditor_api.credentials.delete(credential_id=cred_id)
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
        nexus_api: NexusApiRegistry,
        first_project_id: UUID,
    ) -> None:
        """403 body follows RFC 9457 problem format without leaking policy names."""
        # Authorization check happens before validation, so we can use valid data
        resp = auditor_api.credentials.create(
            body=CredentialCreate(
                name="forbidden-test",
                credential_type_id=get_bearer_token_type_id(nexus_api),
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
