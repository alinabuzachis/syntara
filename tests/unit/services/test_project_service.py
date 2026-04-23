"""Unit tests for ProjectService.

Tests cover:
- Project CRUD operations (create, get, list, update, delete)
- User role assignment and revocation within projects
- Group role assignment and revocation within projects
- Listing role assignments
- Invalid role name handling
- Auto-assignment of project-admin on create
- Cascading deletion of project-scoped resources
"""

from uuid import uuid4

import pytest
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import AllowedProjectsResult
from nexus.authz.exceptions import ProjectNotFoundError
from nexus.authz.models.assignments import GroupRoleAssignment, UserRoleAssignment
from nexus.authz.models.policy import Policy
from nexus.authz.models.role import Role
from nexus.authz.seed import seed_authz_data
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.group import Group
from nexus.core.models.secret import EncryptedSecret, Secret
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType
from nexus.projects.service import ProjectService
from nexus.workflows.models.execution import Execution
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion


@pytest.fixture
async def seeded_db(test_db_session: AsyncSession) -> AsyncSession:
    """Seed authz data and return the session."""
    await seed_authz_data(test_db_session)
    return test_db_session


# ============================================================================
# Project CRUD
# ============================================================================


@pytest.mark.asyncio
async def test_create_project(seeded_db: AsyncSession, test_user: User) -> None:
    """Create a project and auto-assign creator as project-admin."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(
        name="test-project",
        description="A test project",
        labels={"env": "dev"},
    )
    assert project.name == "test-project"
    assert project.description == "A test project"
    assert project.labels == {"env": "dev"}
    assert project.deleted_at is None

    # Creator should be assigned project-admin
    assignments = await svc.list_role_assignments(project.id)
    assert len(assignments) == 1
    roles = {a["role_name"] for a in assignments}
    assert "project-admin" in roles
    assert all(a["user_id"] == test_user.id for a in assignments)


@pytest.mark.asyncio
async def test_create_project_defaults(seeded_db: AsyncSession, test_user: User) -> None:
    """Create a project with only the required name."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="minimal-project")
    assert project.name == "minimal-project"
    assert project.description is None
    assert project.labels == {}


@pytest.mark.asyncio
async def test_get_project(seeded_db: AsyncSession, test_user: User) -> None:
    """Get a project by ID."""
    svc = ProjectService(seeded_db, test_user)
    created = await svc.create_project(name="get-project")
    fetched = await svc.get_project(created.id)
    assert fetched.id == created.id
    assert fetched.name == "get-project"


@pytest.mark.asyncio
async def test_get_project_not_found(seeded_db: AsyncSession, test_user: User) -> None:
    """Getting a non-existent project raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    with pytest.raises(ProjectNotFoundError, match="not found"):
        await svc.get_project(uuid4())


@pytest.mark.asyncio
async def test_get_deleted_project_not_found(seeded_db: AsyncSession, test_user: User) -> None:
    """Getting a soft-deleted project raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="deleted-project")
    await svc.delete_project(project.id)
    with pytest.raises(ProjectNotFoundError, match="not found"):
        await svc.get_project(project.id)


@pytest.mark.asyncio
async def test_list_projects_no_filter(seeded_db: AsyncSession, test_user: User) -> None:
    """List all non-deleted projects."""
    svc = ProjectService(seeded_db, test_user)
    await svc.create_project(name="list-p1")
    await svc.create_project(name="list-p2")
    projects = await svc.list_projects()
    names = [p.name for p in projects]
    assert "list-p1" in names
    assert "list-p2" in names


@pytest.mark.asyncio
async def test_list_projects_with_allowed_all(seeded_db: AsyncSession, test_user: User) -> None:
    """List with all_projects=True returns everything."""
    svc = ProjectService(seeded_db, test_user)
    await svc.create_project(name="all-p1")
    allowed = AllowedProjectsResult(all_projects=True, project_ids=[])
    projects = await svc.list_projects(allowed_projects=allowed)
    names = [p.name for p in projects]
    assert "all-p1" in names


@pytest.mark.asyncio
async def test_list_projects_with_allowed_specific(seeded_db: AsyncSession, test_user: User) -> None:
    """List with specific project IDs only returns those projects."""
    svc = ProjectService(seeded_db, test_user)
    p1 = await svc.create_project(name="allowed-p1")
    await svc.create_project(name="not-allowed-p2")
    allowed = AllowedProjectsResult(all_projects=False, project_ids=[p1.id])
    projects = await svc.list_projects(allowed_projects=allowed)
    names = [p.name for p in projects]
    assert "allowed-p1" in names
    assert "not-allowed-p2" not in names


@pytest.mark.asyncio
async def test_list_projects_with_allowed_empty(seeded_db: AsyncSession, test_user: User) -> None:
    """List with empty project IDs returns nothing."""
    svc = ProjectService(seeded_db, test_user)
    await svc.create_project(name="empty-filter-p1")
    allowed = AllowedProjectsResult(all_projects=False, project_ids=[])
    projects = await svc.list_projects(allowed_projects=allowed)
    assert projects == []


@pytest.mark.asyncio
async def test_update_project(seeded_db: AsyncSession, test_user: User) -> None:
    """Update project name, description, and labels."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="update-me", description="original")
    updated = await svc.update_project(
        project.id,
        name="renamed",
        description="updated",
        labels={"version": "2"},
    )
    assert updated.name == "renamed"
    assert updated.description == "updated"
    assert updated.labels == {"version": "2"}


@pytest.mark.asyncio
async def test_update_project_partial(seeded_db: AsyncSession, test_user: User) -> None:
    """Partial update only changes provided fields."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="partial-update", description="original")
    updated = await svc.update_project(project.id, description="only desc changed")
    assert updated.name == "partial-update"
    assert updated.description == "only desc changed"


@pytest.mark.asyncio
async def test_delete_project(seeded_db: AsyncSession, test_user: User) -> None:
    """Soft-delete a project."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="delete-me")
    await svc.delete_project(project.id)
    # Should not appear in list
    projects = await svc.list_projects()
    assert not any(p.name == "delete-me" for p in projects)


# ============================================================================
# User Role Assignment
# ============================================================================


@pytest.mark.asyncio
async def test_assign_user_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Assign project-user role to a user in a project."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="role-assign-project")

    # Create another user
    other = User(id=uuid4(), username="other", email="other@test.com", full_name="Other")
    seeded_db.add(other)
    await seeded_db.commit()

    assignment = await svc.assign_role(project.id, other.id, "project-user")
    assert assignment.user_id == other.id
    assert assignment.project_id == project.id


@pytest.mark.asyncio
async def test_assign_invalid_role_name(seeded_db: AsyncSession, test_user: User) -> None:
    """Invalid role name raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="invalid-role-project")
    with pytest.raises(SafeValueError, match="Role 'superadmin' not found"):
        await svc.assign_role(project.id, test_user.id, "superadmin")


@pytest.mark.asyncio
async def test_assign_role_project_not_found(seeded_db: AsyncSession, test_user: User) -> None:
    """Assigning a role to a non-existent project raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    with pytest.raises(ProjectNotFoundError, match="not found"):
        await svc.assign_role(uuid4(), test_user.id, "project-user")


@pytest.mark.asyncio
async def test_revoke_user_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Revoke a user role assignment from a project."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="revoke-role-project")

    other = User(id=uuid4(), username="revokee", email="revokee@test.com", full_name="Revokee")
    seeded_db.add(other)
    await seeded_db.commit()

    assignment = await svc.assign_role(project.id, other.id, "project-user")
    await svc.revoke_role(project.id, assignment.id)

    assignments = await svc.list_role_assignments(project.id)
    user_ids = [a["user_id"] for a in assignments]
    assert other.id not in user_ids


@pytest.mark.asyncio
async def test_revoke_nonexistent_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Revoking a non-existent assignment raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="revoke-missing-project")
    with pytest.raises(SafeValueError, match="not found"):
        await svc.revoke_role(project.id, uuid4())


@pytest.mark.asyncio
async def test_list_role_assignments(seeded_db: AsyncSession, test_user: User) -> None:
    """List user role assignments with resolved names."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="list-roles-project")

    other = User(id=uuid4(), username="listroles-user", email="lr@test.com", full_name="LR")
    seeded_db.add(other)
    await seeded_db.commit()

    await svc.assign_role(project.id, other.id, "project-user")
    assignments = await svc.list_role_assignments(project.id)
    # Should have project-admin (creator) + project-user (other)
    assert len(assignments) == 2
    roles = {a["role_name"] for a in assignments}
    assert "project-admin" in roles
    assert "project-user" in roles


# ============================================================================
# Group Role Assignment
# ============================================================================


@pytest.mark.asyncio
async def test_assign_group_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Assign a project-scoped role to a group."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="grp-role-project")

    group = Group(id=uuid4(), name="proj-team", description="", labels={})
    seeded_db.add(group)
    await seeded_db.commit()

    assignment = await svc.assign_group_role(project.id, group.id, "project-user")
    assert assignment.group_id == group.id
    assert assignment.project_id == project.id


@pytest.mark.asyncio
async def test_assign_group_invalid_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Invalid role name for group assignment raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="grp-invalid-role")
    with pytest.raises(SafeValueError, match="Role 'superadmin' not found"):
        await svc.assign_group_role(project.id, uuid4(), "superadmin")


@pytest.mark.asyncio
async def test_revoke_group_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Revoke a group role assignment from a project."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="revoke-grp-project")

    group = Group(id=uuid4(), name="revoke-grp", description="", labels={})
    seeded_db.add(group)
    await seeded_db.commit()

    assignment = await svc.assign_group_role(project.id, group.id, "project-user")
    await svc.revoke_group_role(project.id, assignment.id)

    assignments = await svc.list_group_role_assignments(project.id)
    assert not any(a["group_id"] == group.id for a in assignments)


@pytest.mark.asyncio
async def test_revoke_group_nonexistent(seeded_db: AsyncSession, test_user: User) -> None:
    """Revoking a non-existent group assignment raises SafeValueError."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="revoke-grp-missing")
    with pytest.raises(SafeValueError, match="not found"):
        await svc.revoke_group_role(project.id, uuid4())


@pytest.mark.asyncio
async def test_list_group_role_assignments(seeded_db: AsyncSession, test_user: User) -> None:
    """List group role assignments with resolved names."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="list-grp-roles")

    group = Group(id=uuid4(), name="listed-proj-grp", description="", labels={})
    seeded_db.add(group)
    await seeded_db.commit()

    await svc.assign_group_role(project.id, group.id, "project-user")
    assignments = await svc.list_group_role_assignments(project.id)
    assert len(assignments) >= 1
    match = [a for a in assignments if a["group_name"] == "listed-proj-grp"]
    assert len(match) == 1
    assert match[0]["role_name"] == "project-user"


# ============================================================================
# Cascading Deletion
# ============================================================================


@pytest.mark.asyncio
async def test_delete_project_cascades_role_assignments(seeded_db: AsyncSession, test_user: User) -> None:
    """Deleting a project hard-deletes all user and group role assignments."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="cascade-assignments")

    other = User(id=uuid4(), username="cascade-u", email="cascade-u@test.com", full_name="CU")
    group = Group(id=uuid4(), name="cascade-grp", description="", labels={})
    seeded_db.add_all([other, group])
    await seeded_db.commit()

    await svc.assign_role(project.id, other.id, "project-user")
    await svc.assign_group_role(project.id, group.id, "project-auditor")

    await svc.delete_project(project.id)

    user_assigns = (
        await seeded_db.exec(select(UserRoleAssignment).where(UserRoleAssignment.project_id == project.id))
    ).all()
    group_assigns = (
        await seeded_db.exec(select(GroupRoleAssignment).where(GroupRoleAssignment.project_id == project.id))
    ).all()
    assert user_assigns == []
    assert group_assigns == []


@pytest.mark.asyncio
async def test_delete_project_cascades_custom_roles(seeded_db: AsyncSession, test_user: User) -> None:
    """Deleting a project hard-deletes all custom roles scoped to it."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="cascade-roles")

    role = Role(
        name="custom-proj-role",
        is_builtin=False,
        project_id=project.id,
        scope="project",
        policy_names=["workflow:read"],
        labels={},
    )
    seeded_db.add(role)
    await seeded_db.commit()

    await svc.delete_project(project.id)

    rows = (await seeded_db.exec(select(Role).where(Role.project_id == project.id))).all()
    assert rows == []


@pytest.mark.asyncio
async def test_delete_project_cascades_custom_policies(seeded_db: AsyncSession, test_user: User) -> None:
    """Deleting a project hard-deletes all custom policies scoped to it."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="cascade-policies")

    policy = Policy(
        name="custom-proj-policy",
        statements=[{"effect": "allow", "actions": ["read"], "scope": "project"}],
        is_builtin=False,
        project_id=project.id,
        scope="project",
        labels={},
    )
    seeded_db.add(policy)
    await seeded_db.commit()

    await svc.delete_project(project.id)

    rows = (await seeded_db.exec(select(Policy).where(Policy.project_id == project.id))).all()
    assert rows == []


@pytest.mark.asyncio
async def test_delete_project_soft_deletes_workflows(seeded_db: AsyncSession, test_user: User) -> None:
    """Deleting a project soft-deletes all workflows within it."""
    svc = ProjectService(seeded_db, test_user)
    user_id = test_user.id
    project = await svc.create_project(name="cascade-workflows")

    workflow = Workflow(
        name="proj-workflow",
        project_id=project.id,
        created_by=user_id,
        labels={},
    )
    seeded_db.add(workflow)
    await seeded_db.commit()
    wf_id = workflow.id

    await svc.delete_project(project.id)

    seeded_db.expire_all()
    wf = (await seeded_db.exec(select(Workflow).where(Workflow.id == wf_id))).first()
    assert wf is not None
    assert wf.deleted_at is not None
    assert wf.deleted_by == user_id


@pytest.mark.asyncio
async def test_delete_project_soft_deletes_executions(seeded_db: AsyncSession, test_user: User) -> None:
    """Deleting a project soft-deletes all executions within it."""
    svc = ProjectService(seeded_db, test_user)
    user_id = test_user.id
    project = await svc.create_project(name="cascade-executions")

    workflow = Workflow(
        name="exec-workflow",
        project_id=project.id,
        created_by=user_id,
        labels={},
    )
    seeded_db.add(workflow)
    await seeded_db.flush()

    wf_version = WorkflowVersion(
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        workflow_definition={"steps": []},
        created_by=user_id,
        labels={},
    )
    seeded_db.add(wf_version)
    await seeded_db.flush()

    execution = Execution(
        workflow_id=workflow.id,
        workflow_version_id=wf_version.id,
        project_id=project.id,
        temporal_workflow_id=f"temporal-{uuid4().hex[:8]}",
        status="pending",
        created_by=user_id,
        labels={},
    )
    seeded_db.add(execution)
    await seeded_db.commit()
    exec_id = execution.id

    await svc.delete_project(project.id)

    seeded_db.expire_all()
    ex = (await seeded_db.exec(select(Execution).where(Execution.id == exec_id))).first()
    assert ex is not None
    assert ex.deleted_at is not None
    assert ex.deleted_by == user_id


@pytest.mark.asyncio
async def test_delete_project_soft_deletes_credentials_and_cleans_secrets(
    seeded_db: AsyncSession, test_user: User
) -> None:
    """Deleting a project soft-deletes credentials and removes their secrets."""
    svc = ProjectService(seeded_db, test_user)
    user_id = test_user.id
    project = await svc.create_project(name="cascade-creds")

    cred_type = CredentialType(
        name=f"test-type-{uuid4().hex[:8]}",
        description="test",
        inputs={"fields": [], "required": []},
        injectors={"extra_vars": {}, "env": {}, "file": {}},
        managed=False,
    )
    seeded_db.add(cred_type)
    await seeded_db.flush()

    secret = Secret()
    seeded_db.add(secret)
    await seeded_db.flush()

    enc_secret = EncryptedSecret(
        secret_id=secret.id,
        encrypted_data={"token": "encrypted-data"},
    )
    seeded_db.add(enc_secret)
    await seeded_db.flush()

    credential = Credential(
        name="proj-cred",
        credential_type_id=cred_type.id,
        secret_id=secret.id,
        project_id=project.id,
        created_by=user_id,
        labels={},
    )
    seeded_db.add(credential)
    await seeded_db.commit()
    cred_id = credential.id
    secret_id = secret.id
    enc_id = enc_secret.id

    await svc.delete_project(project.id)

    seeded_db.expire_all()
    cred = (await seeded_db.exec(select(Credential).where(Credential.id == cred_id))).first()
    assert cred is not None
    assert cred.deleted_at is not None
    assert cred.secret_id is None

    sec = (await seeded_db.exec(select(Secret).where(Secret.id == secret_id))).first()
    assert sec is None

    enc = (await seeded_db.exec(select(EncryptedSecret).where(EncryptedSecret.id == enc_id))).first()
    assert enc is None


@pytest.mark.asyncio
async def test_delete_project_hard_deletes_approval_requests(seeded_db: AsyncSession, test_user: User) -> None:
    """Deleting a project hard-deletes all approval requests within it."""
    from nexus.approvals.models.approval_request import ApprovalRequest

    svc = ProjectService(seeded_db, test_user)
    user_id = test_user.id
    project = await svc.create_project(name="cascade-approvals")

    workflow = Workflow(
        name="approval-workflow",
        project_id=project.id,
        created_by=user_id,
        labels={},
    )
    seeded_db.add(workflow)
    await seeded_db.flush()

    wf_version = WorkflowVersion(
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        workflow_definition={"steps": []},
        created_by=user_id,
        labels={},
    )
    seeded_db.add(wf_version)
    await seeded_db.flush()

    execution = Execution(
        workflow_id=workflow.id,
        workflow_version_id=wf_version.id,
        project_id=project.id,
        temporal_workflow_id=f"temporal-{uuid4().hex[:8]}",
        status="pending",
        created_by=user_id,
        labels={},
    )
    seeded_db.add(execution)
    await seeded_db.flush()

    approval = ApprovalRequest(
        name="test-approval",
        execution_id=execution.id,
        project_id=project.id,
        approval_node_id="step-1",
        next_step_approved={"id": "next", "name": "Next Step", "type": "llm"},
        labels={},
    )
    seeded_db.add(approval)
    await seeded_db.commit()
    approval_id = approval.id

    await svc.delete_project(project.id)

    seeded_db.expire_all()
    row = (await seeded_db.exec(select(ApprovalRequest).where(ApprovalRequest.id == approval_id))).first()
    assert row is None


@pytest.mark.asyncio
async def test_delete_project_does_not_affect_other_projects(seeded_db: AsyncSession, test_user: User) -> None:
    """Deleting one project leaves another project's resources intact."""
    svc = ProjectService(seeded_db, test_user)
    user_id = test_user.id
    p1 = await svc.create_project(name="cascade-target")
    p2 = await svc.create_project(name="cascade-survivor")

    role1 = Role(name="r1", is_builtin=False, project_id=p1.id, scope="project", policy_names=[], labels={})
    role2 = Role(name="r2", is_builtin=False, project_id=p2.id, scope="project", policy_names=[], labels={})
    wf1 = Workflow(name="wf1", project_id=p1.id, created_by=user_id, labels={})
    wf2 = Workflow(name="wf2", project_id=p2.id, created_by=user_id, labels={})
    seeded_db.add_all([role1, role2, wf1, wf2])
    await seeded_db.commit()
    p1_id = p1.id
    role2_id = role2.id
    wf2_id = wf2.id

    await svc.delete_project(p1_id)

    seeded_db.expire_all()
    # p1 resources should be gone/soft-deleted
    assert (await seeded_db.exec(select(Role).where(Role.project_id == p1_id))).all() == []
    wf1_row = (await seeded_db.exec(select(Workflow).where(Workflow.project_id == p1_id))).first()
    assert wf1_row is not None
    assert wf1_row.deleted_at is not None

    # p2 resources should be untouched
    r2 = (await seeded_db.exec(select(Role).where(Role.id == role2_id))).first()
    assert r2 is not None
    wf2_row = (await seeded_db.exec(select(Workflow).where(Workflow.id == wf2_id))).first()
    assert wf2_row is not None
    assert wf2_row.deleted_at is None


@pytest.mark.asyncio
async def test_delete_project_with_no_resources(seeded_db: AsyncSession, test_user: User) -> None:
    """Deleting a project with no child resources succeeds cleanly."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="empty-cascade")
    await svc.delete_project(project.id)
    with pytest.raises(ProjectNotFoundError):
        await svc.get_project(project.id)


# ============================================================================
# Role Validation
# ============================================================================


@pytest.mark.asyncio
async def test_validate_builtin_role_accepted(seeded_db: AsyncSession, test_user: User) -> None:
    """Built-in role names are accepted for assignment."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="validate-builtin")
    other = User(id=uuid4(), username="validate-u", email="vu@test.com", full_name="V")
    seeded_db.add(other)
    await seeded_db.commit()

    assignment = await svc.assign_role(project.id, other.id, "project-user")
    assert assignment.role_name == "project-user"


@pytest.mark.asyncio
async def test_validate_custom_project_role_accepted(seeded_db: AsyncSession, test_user: User) -> None:
    """Custom roles scoped to the project are accepted for assignment."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="validate-custom")

    custom_role = Role(
        name="custom-reviewer",
        is_builtin=False,
        project_id=project.id,
        scope="project",
        policy_names=["workflow:read"],
        labels={},
    )
    seeded_db.add(custom_role)
    await seeded_db.commit()

    other = User(id=uuid4(), username="custom-u", email="cu@test.com", full_name="CU")
    seeded_db.add(other)
    await seeded_db.commit()

    assignment = await svc.assign_role(project.id, other.id, "custom-reviewer")
    assert assignment.role_name == "custom-reviewer"


@pytest.mark.asyncio
async def test_validate_role_from_different_project_rejected(seeded_db: AsyncSession, test_user: User) -> None:
    """Custom roles scoped to a different project are rejected."""
    svc = ProjectService(seeded_db, test_user)
    project1 = await svc.create_project(name="validate-p1")
    project2 = await svc.create_project(name="validate-p2")

    custom_role = Role(
        name="other-proj-role",
        is_builtin=False,
        project_id=project2.id,
        scope="project",
        policy_names=[],
        labels={},
    )
    seeded_db.add(custom_role)
    await seeded_db.commit()

    with pytest.raises(SafeValueError, match="not found"):
        await svc.assign_role(project1.id, test_user.id, "other-proj-role")


@pytest.mark.asyncio
async def test_validate_global_custom_role_accepted(seeded_db: AsyncSession, test_user: User) -> None:
    """Global custom roles (project_id=None) are accepted for project assignment."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="validate-global")

    global_role = Role(
        name="global-custom",
        is_builtin=False,
        project_id=None,
        scope="system",
        policy_names=[],
        labels={},
    )
    seeded_db.add(global_role)
    await seeded_db.commit()

    other = User(id=uuid4(), username="global-u", email="gu@test.com", full_name="GU")
    seeded_db.add(other)
    await seeded_db.commit()

    assignment = await svc.assign_role(project.id, other.id, "global-custom")
    assert assignment.role_name == "global-custom"


@pytest.mark.asyncio
async def test_assign_group_validates_role(seeded_db: AsyncSession, test_user: User) -> None:
    """Group role assignment also validates the role name."""
    svc = ProjectService(seeded_db, test_user)
    project = await svc.create_project(name="grp-validate")
    group = Group(id=uuid4(), name="grp-validate-g", description="", labels={})
    seeded_db.add(group)
    await seeded_db.commit()

    with pytest.raises(SafeValueError, match="not found"):
        await svc.assign_group_role(project.id, group.id, "totally-fake-role")
