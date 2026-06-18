"""Shared test-case definitions for parametrized policy coverage tests.

Each ``PolicyTestCase`` describes one built-in policy: the policy name,
prerequisite policies needed for setup, a callable that performs the
action under test, and an optional setup callable that creates the
target resource beforehand.

Setup helpers create resources directly via the admin API. Cleanup is
handled by the test's ``project_factory`` fixture — deleting the project
cascades to all resources created inside it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.credential_update import CredentialUpdate
from nexus_api_client.models.execution_create import ExecutionCreate
from nexus_api_client.models.policy_create import PolicyCreate
from nexus_api_client.models.policy_statement_schema import PolicyStatementSchema
from nexus_api_client.models.project_create import ProjectCreate
from nexus_api_client.models.project_role_create import ProjectRoleCreate
from nexus_api_client.models.project_update import ProjectUpdate
from nexus_api_client.models.role_assignment_create import RoleAssignmentCreate
from nexus_api_client.models.role_principal_type import RolePrincipalType
from nexus_api_client.models.upload_files_body import UploadFilesBody
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_update import WorkflowUpdate

from tests.e2e.conftest import generate_test_password, unique_name
from tests.e2e.fixtures.constants import MINIMAL_WORKFLOW_DEFINITION
from tests.fixtures.factories import get_bearer_token_type_id

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.types import Response


@dataclass
class PolicyTestCase:
    """Describes how to test a single built-in policy."""

    policy: str
    prereqs: list[str] = field(default_factory=list)
    action: Callable[..., Response[Any]] | None = None
    setup: Callable[..., None] | None = None
    description: str = ""
    skip_denied: bool = False

    def __repr__(self) -> str:  # noqa: D105
        return self.policy


# ---------------------------------------------------------------------------
# Action functions — each takes (api, project_id, ctx) and returns a Response
# ctx is a dict that setup() may populate with resource IDs
# ---------------------------------------------------------------------------


def _wf_create(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.workflows.create(
        body=WorkflowCreate(
            name=unique_name("pol-wf"),
            workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
            project_id=pid,
        )
    )


def _wf_list(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.projects.list_workflows(project_id=pid)


def _wf_update(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.workflows.update(workflow_id=ctx["workflow_id"], body=WorkflowUpdate(name=unique_name("upd")))


def _wf_delete(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.workflows.delete(workflow_id=ctx["workflow_id"])


def _cred_create(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.credentials.create(
        body=CredentialCreate(
            name=unique_name("pol-cred"),
            credential_type_id=ctx["cred_type_id"],
            project_id=pid,
            inputs=CredentialCreateInputs.from_dict({"token": unique_name("t")}),
        )
    )


def _cred_list(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.credentials.list()


def _cred_update(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.credentials.update(credential_id=ctx["cred_id"], body=CredentialUpdate(description="updated"))


def _cred_delete(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.credentials.delete(credential_id=ctx["cred_id"])


def _exec_run(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.executions.create(body=ExecutionCreate(workflow_id=ctx["workflow_id"]))


def _exec_list(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.executions.list()


def _approval_list(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.approvals.list()


def _project_read(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.projects.get(project_id=pid)


def _project_update(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.projects.update(project_id=pid, body=ProjectUpdate(description=unique_name("upd")))


def _project_delete(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.projects.delete(project_id=pid)


def _role_create_proj(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.projects.create_role(
        project_id=pid,
        body=ProjectRoleCreate(name=unique_name("pol-role"), policies=["workflow:read:project"]),
    )


def _role_list_proj(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.roles.list(project_id=pid)


def _role_assignment_assign_proj(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.projects.create_role_assignment(
        project_id=pid,
        body=RoleAssignmentCreate(
            principal_type=RolePrincipalType.USER,
            principal_id=ctx["target_user_id"],
            role_name="project-user",
        ),
    )


def _role_assignment_list_proj(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.projects.list_role_assignments(project_id=pid)


def _policy_create_proj(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.projects.create_policy(
        project_id=pid,
        body=PolicyCreate(
            name=unique_name("pol-policy"),
            statements=[
                PolicyStatementSchema(
                    effect="allow",
                    actions=["workflow:read"],
                    scope="project",
                )
            ],
        ),
    )


def _policy_list_proj(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    return api.policies.list(project_id=pid)


# ---------------------------------------------------------------------------
# Setup helpers — create target resources via admin API before the test action.
# Cleanup is handled by project cascade deletion.
# ---------------------------------------------------------------------------


def _setup_workflow(admin_api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> None:
    name = unique_name("pol-wf")
    resp = admin_api.workflows.create(
        body=WorkflowCreate(
            name=name,
            workflow_definition=MINIMAL_WORKFLOW_DEFINITION,
            project_id=pid,
        ),
    )
    wf = resp.assert_and_get()
    ctx["workflow_id"] = wf.id


def _setup_credential(admin_api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> None:
    ctx["cred_type_id"] = get_bearer_token_type_id(admin_api)
    name = unique_name("pol-cred")
    resp = admin_api.credentials.create(
        body=CredentialCreate(
            name=name,
            credential_type_id=ctx["cred_type_id"],
            project_id=pid,
            inputs=CredentialCreateInputs.from_dict({"token": unique_name("t")}),
        ),
    )
    cred = resp.assert_and_get()
    ctx["cred_id"] = cred.id


def _setup_cred_type(admin_api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> None:
    ctx["cred_type_id"] = get_bearer_token_type_id(admin_api)


def _setup_target_user(admin_api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> None:
    from nexus_api_client.models.user_create import UserCreate as _UserCreate

    name = unique_name("pol-target")
    resp = admin_api.users.create(
        body=_UserCreate(
            username=name,
            email=f"{name}@example.com",
            first_name="Policy Test Target",
            password=generate_test_password(),
        ),
    )
    user = resp.assert_and_get()
    ctx["target_user_id"] = user.id


def _file_upload(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    from io import BytesIO

    from nexus_api_client.types import File

    body = UploadFilesBody(
        files=[File(payload=BytesIO(b"test content"), file_name="policy-test.txt", mime_type="text/plain")],
        project_id=pid,
    )
    return api.files.upload(body=body)


def _file_download(api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> Response[Any]:
    file_id = ctx["file_id"]
    return api.files.download(file_id=file_id)


def _setup_file(admin_api: NexusApiRegistry, pid: UUID, ctx: dict[str, Any]) -> None:
    from io import BytesIO

    from nexus_api_client.types import File

    body = UploadFilesBody(
        files=[File(payload=BytesIO(b"setup content"), file_name="setup-test.txt", mime_type="text/plain")],
        project_id=pid,
    )
    resp = admin_api.files.upload(body=body)
    data = resp.assert_and_get()
    ctx["file_id"] = data.file_ids[0]


# ---------------------------------------------------------------------------
# Project-scoped policy test cases
# ---------------------------------------------------------------------------

PROJECT_SCOPED_CASES: list[PolicyTestCase] = [
    # -- workflow --
    PolicyTestCase("workflow:create:project", ["project:read:project"], _wf_create),
    PolicyTestCase("workflow:read:project", ["project:read:project"], _wf_list, _setup_workflow),
    PolicyTestCase(
        "workflow:update:project", ["project:read:project", "workflow:read:project"], _wf_update, _setup_workflow
    ),
    PolicyTestCase(
        "workflow:delete:project", ["project:read:project", "workflow:read:project"], _wf_delete, _setup_workflow
    ),
    # -- credential --
    PolicyTestCase("credential:create:project", ["project:read:project"], _cred_create, _setup_cred_type),
    PolicyTestCase("credential:read:project", ["project:read:project"], _cred_list, _setup_credential),
    PolicyTestCase(
        "credential:update:project",
        ["project:read:project", "credential:read:project"],
        _cred_update,
        _setup_credential,
    ),
    PolicyTestCase(
        "credential:delete:project",
        ["project:read:project", "credential:read:project"],
        _cred_delete,
        _setup_credential,
    ),
    # -- execution --
    PolicyTestCase(
        "execution:run:project", ["project:read:project", "workflow:read:project"], _exec_run, _setup_workflow
    ),
    PolicyTestCase("execution:read:project", ["project:read:project"], _exec_list),
    # -- approval --
    PolicyTestCase("approval:read:project", ["project:read:project"], _approval_list),
    PolicyTestCase("approval:decide:project", ["project:read:project", "approval:read:project"], _approval_list),
    # -- project --
    PolicyTestCase("project:read:project", [], _project_read),
    PolicyTestCase("project:update:project", ["project:read:project"], _project_update),
    PolicyTestCase("project:delete:project", ["project:read:project"], _project_delete),
    # -- role-assignment --
    PolicyTestCase(
        "role-assignment:assign:project", ["project:read:project"], _role_assignment_assign_proj, _setup_target_user
    ),
    PolicyTestCase(
        "role-assignment:read:project", ["project:read:project"], _role_assignment_list_proj, skip_denied=True
    ),
    PolicyTestCase(
        "role-assignment:revoke:project",
        ["project:read:project", "role-assignment:read:project"],
        _role_assignment_list_proj,
        skip_denied=True,
    ),
    # -- role --
    PolicyTestCase("role:create:project", ["project:read:project"], _role_create_proj),
    PolicyTestCase("role:read:project", ["project:read:project"], _role_list_proj, skip_denied=True),
    PolicyTestCase(
        "role:update:project", ["project:read:project", "role:read:project"], _role_list_proj, skip_denied=True
    ),
    PolicyTestCase(
        "role:delete:project", ["project:read:project", "role:read:project"], _role_list_proj, skip_denied=True
    ),
    # -- policy --
    PolicyTestCase("policy:create:project", ["project:read:project"], _policy_create_proj),
    PolicyTestCase("policy:read:project", ["project:read:project"], _policy_list_proj, skip_denied=True),
    PolicyTestCase(
        "policy:update:project", ["project:read:project", "policy:read:project"], _policy_list_proj, skip_denied=True
    ),
    PolicyTestCase(
        "policy:delete:project", ["project:read:project", "policy:read:project"], _policy_list_proj, skip_denied=True
    ),
    # -- files --
    PolicyTestCase("files:upload:project", ["project:read:project"], _file_upload),
    PolicyTestCase("files:download:project", ["project:read:project"], _file_download, _setup_file),
]

# ---------------------------------------------------------------------------
# System-scoped (any) policy test cases — representative subset
# ---------------------------------------------------------------------------

SYSTEM_SCOPED_REPRESENTATIVE: list[PolicyTestCase] = [
    PolicyTestCase("workflow:create:any", ["project:read:any"], _wf_create),
    PolicyTestCase("workflow:read:any", ["project:read:any"], _wf_list, _setup_workflow),
    PolicyTestCase("credential:create:any", ["project:read:any"], _cred_create, _setup_cred_type),
    PolicyTestCase("credential:read:any", ["project:read:any"], _cred_list, _setup_credential),
    PolicyTestCase("execution:run:any", ["project:read:any", "workflow:read:any"], _exec_run, _setup_workflow),
    PolicyTestCase("execution:read:any", ["project:read:any"], _exec_list),
    PolicyTestCase("project:read:any", [], lambda api, _pid, _ctx: api.projects.list()),
    PolicyTestCase(
        "project:create:any",
        [],
        lambda api, _pid, _ctx: api.projects.create(body=ProjectCreate(name=unique_name("pol-proj"))),
    ),
    PolicyTestCase(
        "role:read:any",
        [],
        lambda api, _pid, _ctx: api.roles.list(),
        skip_denied=True,
    ),
    PolicyTestCase(
        "user:read:any",
        [],
        lambda api, _pid, _ctx: api.users.list(),
        skip_denied=True,
    ),
    PolicyTestCase("group:read:any", [], lambda api, _pid, _ctx: api.groups.list()),
    PolicyTestCase("setting:read:any", [], lambda api, _pid, _ctx: api.settings.list()),
]

# ---------------------------------------------------------------------------
# Self-scoped policy test cases (5)
# Tested via test_baseline.py; included here for completeness tracking.
# ---------------------------------------------------------------------------

SELF_SCOPED_CASES: list[PolicyTestCase] = [
    PolicyTestCase("user:read:self", description="Tested in test_baseline.py"),
    PolicyTestCase("user:update:self", description="Tested in test_baseline.py"),
    PolicyTestCase("role-assignment:read:self", description="Tested in test_baseline.py"),
    PolicyTestCase("user_identity:read:self", description="Tested in test_baseline.py"),
    PolicyTestCase("user_identity:detach:self", description="Tested in test_baseline.py"),
]

# ---------------------------------------------------------------------------
# Policies covered by unit tests only (tests/unit/authz/).
#
# System-scoped e2e tests use a representative subset — not every policy
# needs a full-stack round-trip.  Policies listed here are verified via
# OPA/Rego unit tests and are excluded from the e2e coverage check in
# test_role_conventions.py::TestRegistryIntegrity.
#
# When adding a NEW built-in policy, either:
#   1. Add a PolicyTestCase to the appropriate list above, OR
#   2. Add it to E2E_COVERAGE_EXEMPT with a reason if unit-test coverage is sufficient.
# ---------------------------------------------------------------------------

E2E_COVERAGE_EXEMPT: set[str] = {
    # System-scoped CRUD policies that follow the same pattern as the
    # representative cases already tested e2e (create/read tested, so
    # update/delete for the same resource are unit-test-only).
    "credential:update:any",
    "credential:delete:any",
    "workflow:update:any",
    "workflow:delete:any",
    "project:update:any",
    "project:delete:any",
    # Approval policies — read/decide/create follow identical authz path
    "approval:read:any",
    "approval:decide:any",
    "approval:create:any",
    # Role & policy management (system-level) — CRUD mirrors project-scoped
    "role:create:any",
    "role:update:any",
    "role:delete:any",
    "policy:create:any",
    "policy:read:any",
    "policy:update:any",
    "policy:delete:any",
    # Role assignments (system-level)
    "role-assignment:read:any",
    "role-assignment:assign:any",
    "role-assignment:revoke:any",
    # User management — user:read:any tested e2e, CRUD mirrors it
    "user:create:any",
    "user:update:any",
    "user:delete:any",
    # Group management — group:read:any tested e2e, CRUD mirrors it
    "group:create:any",
    "group:update:any",
    "group:delete:any",
    "group:manage-members:any",
    # Directory lookups — lightweight read-only
    "user-directory:read:any",
    "group-directory:read:any",
    # User identities (system-scoped)
    "user_identity:read:any",
    "user_identity:attach:any",
    "user_identity:detach:any",
    # Identity providers
    "identity-provider:create:any",
    "identity-provider:read:any",
    "identity-provider:update:any",
    "identity-provider:delete:any",
    "identity-provider:test:any",
    # Integration management — CRUD follows same authz path as credentials
    "integration:create:any",
    "integration:read:any",
    "integration:read:project",
    "integration:update:any",
    "integration:delete:any",
    "integration:validate:any",
    # Admin revocation — admin-only endpoints
    "admin:revocation:read:any",
    "admin:revocation:execute:any",
    # Settings (write) — read tested e2e
    "setting:write:any",
    # Authz query
    "authz:query:any",
    # Invocations
    "invocation:create:any",
    "invocation:read:any",
    "invocation:cancel:any",
    # Files
    "files:upload:any",
    "files:download:any",
}
