"""add authorization models and project scoping

Revision ID: 229065ab56b0
Revises: 5835100415bc
Create Date: 2026-04-14 07:53:14.463883

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from nexus.authz.migration_ops import (
    PolicyAdd,
    RoleAdd,
    RolePolicyAppend,
    apply_policy_ops,
    apply_role_ops,
    revert_policy_ops,
    revert_role_ops,
)

# revision identifiers, used by Alembic.
revision: str = "229065ab56b0"
down_revision: str | Sequence[str] | None = "5835100415bc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLE_OPS: list[RoleAdd] = [
    RoleAdd("admin", "Full access to all resources"),
    RoleAdd("auditor", "Read-only access with audit log visibility"),
    RoleAdd("user", "Standard user with CRUD on own resources"),
    RoleAdd("project-admin", "Full access to a project and its resources, including role management"),
    RoleAdd("project-user", "Standard access within a project (CRUD workflows, run executions)"),
    RoleAdd("project-auditor", "Read-only access within a project"),
    RoleAdd(
        "default",
        "Default permissions granted to all authenticated users via the 'authenticated' group",
        is_builtin=False,
    ),
]

POLICY_OPS: list[PolicyAdd | RolePolicyAppend] = [
    PolicyAdd("user:read:self", "Read own user", [{"effect": "allow", "actions": ["user:read"], "scope": "self"}]),
    PolicyAdd(
        "user:update:self",
        "Update own user",
        [{"effect": "allow", "actions": ["user:update"], "scope": "self"}],
    ),
    PolicyAdd("policy:read:any", "Read any policy", [{"effect": "allow", "actions": ["policy:read"], "scope": "any"}]),
    PolicyAdd("role:read:any", "Read any role", [{"effect": "allow", "actions": ["role:read"], "scope": "any"}]),
    PolicyAdd(
        "approval:read:any",
        "Read any approval",
        [{"effect": "allow", "actions": ["approval:read"], "scope": "any"}],
    ),
    PolicyAdd(
        "project:create:any",
        "Create any project",
        [{"effect": "allow", "actions": ["project:create"], "scope": "any"}],
    ),
    PolicyAdd(
        "project:read:any",
        "Read any project",
        [{"effect": "allow", "actions": ["project:read"], "scope": "any"}],
    ),
    PolicyAdd(
        "project:update:any",
        "Update any project",
        [{"effect": "allow", "actions": ["project:update"], "scope": "any"}],
    ),
    PolicyAdd(
        "project:delete:any",
        "Delete any project",
        [{"effect": "allow", "actions": ["project:delete"], "scope": "any"}],
    ),
    PolicyAdd(
        "workflow:read:any",
        "Read any workflow",
        [{"effect": "allow", "actions": ["workflow:read"], "scope": "any"}],
    ),
    PolicyAdd(
        "project-role:assign:any",
        "Assign any project-role",
        [{"effect": "allow", "actions": ["project-role:assign"], "scope": "any"}],
    ),
    PolicyAdd(
        "project-role:revoke:any",
        "Revoke any project-role",
        [{"effect": "allow", "actions": ["project-role:revoke"], "scope": "any"}],
    ),
    PolicyAdd(
        "execution:read:any",
        "Read any execution",
        [{"effect": "allow", "actions": ["execution:read"], "scope": "any"}],
    ),
    PolicyAdd(
        "execution:run:any",
        "Run any execution",
        [{"effect": "allow", "actions": ["execution:run"], "scope": "any"}],
    ),
    PolicyAdd(
        "workflow:create:any",
        "Create any workflow",
        [{"effect": "allow", "actions": ["workflow:create"], "scope": "any"}],
    ),
    PolicyAdd(
        "workflow:update:any",
        "Update any workflow",
        [{"effect": "allow", "actions": ["workflow:update"], "scope": "any"}],
    ),
    PolicyAdd(
        "workflow:delete:any",
        "Delete any workflow",
        [{"effect": "allow", "actions": ["workflow:delete"], "scope": "any"}],
    ),
    PolicyAdd("user:create:any", "Create any user", [{"effect": "allow", "actions": ["user:create"], "scope": "any"}]),
    PolicyAdd("user:read:any", "Read any user", [{"effect": "allow", "actions": ["user:read"], "scope": "any"}]),
    PolicyAdd("user:update:any", "Update any user", [{"effect": "allow", "actions": ["user:update"], "scope": "any"}]),
    PolicyAdd("user:delete:any", "Delete any user", [{"effect": "allow", "actions": ["user:delete"], "scope": "any"}]),
    PolicyAdd(
        "group:create:any",
        "Create any group",
        [{"effect": "allow", "actions": ["group:create"], "scope": "any"}],
    ),
    PolicyAdd("group:read:any", "Read any group", [{"effect": "allow", "actions": ["group:read"], "scope": "any"}]),
    PolicyAdd(
        "group:update:any",
        "Update any group",
        [{"effect": "allow", "actions": ["group:update"], "scope": "any"}],
    ),
    PolicyAdd(
        "group:delete:any",
        "Delete any group",
        [{"effect": "allow", "actions": ["group:delete"], "scope": "any"}],
    ),
    PolicyAdd(
        "group:manage-members:any",
        "Manage-members any group",
        [{"effect": "allow", "actions": ["group:manage-members"], "scope": "any"}],
    ),
    PolicyAdd("role:create:any", "Create any role", [{"effect": "allow", "actions": ["role:create"], "scope": "any"}]),
    PolicyAdd("role:update:any", "Update any role", [{"effect": "allow", "actions": ["role:update"], "scope": "any"}]),
    PolicyAdd("role:delete:any", "Delete any role", [{"effect": "allow", "actions": ["role:delete"], "scope": "any"}]),
    PolicyAdd(
        "user-role:assign:any",
        "Assign any user-role",
        [{"effect": "allow", "actions": ["user-role:assign"], "scope": "any"}],
    ),
    PolicyAdd(
        "user-role:revoke:any",
        "Revoke any user-role",
        [{"effect": "allow", "actions": ["user-role:revoke"], "scope": "any"}],
    ),
    PolicyAdd(
        "group-role:assign:any",
        "Assign any group-role",
        [{"effect": "allow", "actions": ["group-role:assign"], "scope": "any"}],
    ),
    PolicyAdd(
        "group-role:revoke:any",
        "Revoke any group-role",
        [{"effect": "allow", "actions": ["group-role:revoke"], "scope": "any"}],
    ),
    PolicyAdd(
        "policy:create:any",
        "Create any policy",
        [{"effect": "allow", "actions": ["policy:create"], "scope": "any"}],
    ),
    PolicyAdd(
        "policy:update:any",
        "Update any policy",
        [{"effect": "allow", "actions": ["policy:update"], "scope": "any"}],
    ),
    PolicyAdd(
        "policy:delete:any",
        "Delete any policy",
        [{"effect": "allow", "actions": ["policy:delete"], "scope": "any"}],
    ),
    PolicyAdd(
        "approval:decide:any",
        "Decide any approval",
        [{"effect": "allow", "actions": ["approval:decide"], "scope": "any"}],
    ),
    PolicyAdd(
        "approval:create:any",
        "Create any approval",
        [{"effect": "allow", "actions": ["approval:create"], "scope": "any"}],
    ),
    PolicyAdd("authz:query:any", "Query any authz", [{"effect": "allow", "actions": ["authz:query"], "scope": "any"}]),
    RolePolicyAppend("admin", "approval:create:any"),
    RolePolicyAppend("admin", "approval:decide:any"),
    RolePolicyAppend("admin", "approval:read:any"),
    RolePolicyAppend("admin", "authz:query:any"),
    RolePolicyAppend("admin", "execution:read:any"),
    RolePolicyAppend("admin", "execution:run:any"),
    RolePolicyAppend("admin", "group-role:assign:any"),
    RolePolicyAppend("admin", "group-role:revoke:any"),
    RolePolicyAppend("admin", "group:create:any"),
    RolePolicyAppend("admin", "group:delete:any"),
    RolePolicyAppend("admin", "group:manage-members:any"),
    RolePolicyAppend("admin", "group:read:any"),
    RolePolicyAppend("admin", "group:update:any"),
    RolePolicyAppend("admin", "policy:create:any"),
    RolePolicyAppend("admin", "policy:delete:any"),
    RolePolicyAppend("admin", "policy:read:any"),
    RolePolicyAppend("admin", "policy:update:any"),
    RolePolicyAppend("admin", "project-role:assign:any"),
    RolePolicyAppend("admin", "project-role:revoke:any"),
    RolePolicyAppend("admin", "project:create:any"),
    RolePolicyAppend("admin", "project:delete:any"),
    RolePolicyAppend("admin", "project:read:any"),
    RolePolicyAppend("admin", "project:update:any"),
    RolePolicyAppend("admin", "role:create:any"),
    RolePolicyAppend("admin", "role:delete:any"),
    RolePolicyAppend("admin", "role:read:any"),
    RolePolicyAppend("admin", "role:update:any"),
    RolePolicyAppend("admin", "user-role:assign:any"),
    RolePolicyAppend("admin", "user-role:revoke:any"),
    RolePolicyAppend("admin", "user:create:any"),
    RolePolicyAppend("admin", "user:delete:any"),
    RolePolicyAppend("admin", "user:read:any"),
    RolePolicyAppend("admin", "user:read:self"),
    RolePolicyAppend("admin", "user:update:any"),
    RolePolicyAppend("admin", "user:update:self"),
    RolePolicyAppend("admin", "workflow:create:any"),
    RolePolicyAppend("admin", "workflow:delete:any"),
    RolePolicyAppend("admin", "workflow:read:any"),
    RolePolicyAppend("admin", "workflow:update:any"),
    RolePolicyAppend("auditor", "approval:read:any"),
    RolePolicyAppend("auditor", "execution:read:any"),
    RolePolicyAppend("auditor", "group:read:any"),
    RolePolicyAppend("auditor", "policy:read:any"),
    RolePolicyAppend("auditor", "project:read:any"),
    RolePolicyAppend("auditor", "role:read:any"),
    RolePolicyAppend("auditor", "user:read:any"),
    RolePolicyAppend("auditor", "workflow:read:any"),
    RolePolicyAppend("default", "group:read:any"),
    RolePolicyAppend("default", "project:create:any"),
    RolePolicyAppend("default", "user:read:any"),
    RolePolicyAppend("default", "user:read:self"),
    RolePolicyAppend("default", "user:update:self"),
    RolePolicyAppend("project-admin", "approval:decide:any"),
    RolePolicyAppend("project-admin", "approval:read:any"),
    RolePolicyAppend("project-admin", "execution:read:any"),
    RolePolicyAppend("project-admin", "execution:run:any"),
    RolePolicyAppend("project-admin", "project-role:assign:any"),
    RolePolicyAppend("project-admin", "project-role:revoke:any"),
    RolePolicyAppend("project-admin", "project:delete:any"),
    RolePolicyAppend("project-admin", "project:read:any"),
    RolePolicyAppend("project-admin", "project:update:any"),
    RolePolicyAppend("project-admin", "workflow:create:any"),
    RolePolicyAppend("project-admin", "workflow:delete:any"),
    RolePolicyAppend("project-admin", "workflow:read:any"),
    RolePolicyAppend("project-admin", "workflow:update:any"),
    RolePolicyAppend("project-auditor", "approval:read:any"),
    RolePolicyAppend("project-auditor", "execution:read:any"),
    RolePolicyAppend("project-auditor", "project:read:any"),
    RolePolicyAppend("project-auditor", "workflow:read:any"),
    RolePolicyAppend("project-user", "approval:decide:any"),
    RolePolicyAppend("project-user", "approval:read:any"),
    RolePolicyAppend("project-user", "execution:read:any"),
    RolePolicyAppend("project-user", "execution:run:any"),
    RolePolicyAppend("project-user", "project:read:any"),
    RolePolicyAppend("project-user", "workflow:create:any"),
    RolePolicyAppend("project-user", "workflow:delete:any"),
    RolePolicyAppend("project-user", "workflow:read:any"),
    RolePolicyAppend("project-user", "workflow:update:any"),
    RolePolicyAppend("user", "approval:decide:any"),
    RolePolicyAppend("user", "approval:read:any"),
    RolePolicyAppend("user", "execution:read:any"),
    RolePolicyAppend("user", "execution:run:any"),
    RolePolicyAppend("user", "group:read:any"),
    RolePolicyAppend("user", "project:create:any"),
    RolePolicyAppend("user", "project:read:any"),
    RolePolicyAppend("user", "user:read:self"),
    RolePolicyAppend("user", "user:update:self"),
    RolePolicyAppend("user", "workflow:create:any"),
    RolePolicyAppend("user", "workflow:delete:any"),
    RolePolicyAppend("user", "workflow:read:any"),
    RolePolicyAppend("user", "workflow:update:any"),
]


def upgrade() -> None:
    """Upgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "labels", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_projects_created_at"), "projects", ["created_at"], unique=False)
    op.create_index(op.f("ix_projects_deleted_at"), "projects", ["deleted_at"], unique=False)
    op.create_index(op.f("ix_projects_deleted_by"), "projects", ["deleted_by"], unique=False)
    op.create_index(op.f("ix_projects_id"), "projects", ["id"], unique=False)
    op.create_index(op.f("ix_projects_is_default"), "projects", ["is_default"], unique=False)
    op.create_index(op.f("ix_projects_name"), "projects", ["name"], unique=False)
    op.create_index(
        "ix_projects_name_unique", "projects", ["name"], unique=True, postgresql_where=sa.text("deleted_at IS NULL")
    )
    op.create_index(op.f("ix_projects_updated_at"), "projects", ["updated_at"], unique=False)
    op.create_table(
        "policies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "labels", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column(
            "statements", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False
        ),
        sa.Column("is_builtin", sa.Boolean(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_policies_created_at"), "policies", ["created_at"], unique=False)
    op.create_index(op.f("ix_policies_id"), "policies", ["id"], unique=False)
    op.create_index(op.f("ix_policies_is_builtin"), "policies", ["is_builtin"], unique=False)
    op.create_index(op.f("ix_policies_name"), "policies", ["name"], unique=False)
    op.create_index(
        "ix_policies_name_global_unique",
        "policies",
        ["name"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL"),
    )
    op.create_index(
        "ix_policies_name_project_unique",
        "policies",
        ["name", "project_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )
    op.create_index(op.f("ix_policies_project_id"), "policies", ["project_id"], unique=False)
    op.create_index(op.f("ix_policies_updated_at"), "policies", ["updated_at"], unique=False)
    op.create_table(
        "roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "labels", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column("is_builtin", sa.Boolean(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roles_created_at"), "roles", ["created_at"], unique=False)
    op.create_index(op.f("ix_roles_id"), "roles", ["id"], unique=False)
    op.create_index(op.f("ix_roles_is_builtin"), "roles", ["is_builtin"], unique=False)
    op.create_index(op.f("ix_roles_name"), "roles", ["name"], unique=False)
    op.create_index(
        "ix_roles_name_global_unique", "roles", ["name"], unique=True, postgresql_where=sa.text("project_id IS NULL")
    )
    op.create_index(
        "ix_roles_name_project_unique",
        "roles",
        ["name", "project_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )
    op.create_index(op.f("ix_roles_project_id"), "roles", ["project_id"], unique=False)
    op.create_index(op.f("ix_roles_updated_at"), "roles", ["updated_at"], unique=False)
    op.create_table(
        "group_role_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "labels", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("group_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["groups.id"],
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_gra_group_role_global",
        "group_role_assignments",
        ["group_id", "role_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL"),
    )
    op.create_index(
        "ix_gra_group_role_project",
        "group_role_assignments",
        ["group_id", "role_id", "project_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )
    op.create_index(
        op.f("ix_group_role_assignments_created_at"), "group_role_assignments", ["created_at"], unique=False
    )
    op.create_index(op.f("ix_group_role_assignments_group_id"), "group_role_assignments", ["group_id"], unique=False)
    op.create_index(op.f("ix_group_role_assignments_id"), "group_role_assignments", ["id"], unique=False)
    op.create_index(
        op.f("ix_group_role_assignments_project_id"), "group_role_assignments", ["project_id"], unique=False
    )
    op.create_index(op.f("ix_group_role_assignments_role_id"), "group_role_assignments", ["role_id"], unique=False)
    op.create_index(
        op.f("ix_group_role_assignments_updated_at"), "group_role_assignments", ["updated_at"], unique=False
    )
    op.create_table(
        "role_policies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "labels", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("policy_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["policy_id"],
            ["policies.id"],
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("role_id", "policy_id", name="uq_role_policies_role_policy"),
    )
    op.create_index(op.f("ix_role_policies_created_at"), "role_policies", ["created_at"], unique=False)
    op.create_index(op.f("ix_role_policies_id"), "role_policies", ["id"], unique=False)
    op.create_index(op.f("ix_role_policies_policy_id"), "role_policies", ["policy_id"], unique=False)
    op.create_index(op.f("ix_role_policies_role_id"), "role_policies", ["role_id"], unique=False)
    op.create_index(op.f("ix_role_policies_updated_at"), "role_policies", ["updated_at"], unique=False)
    op.create_table(
        "user_role_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "labels", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ura_user_role_global",
        "user_role_assignments",
        ["user_id", "role_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL"),
    )
    op.create_index(
        "ix_ura_user_role_project",
        "user_role_assignments",
        ["user_id", "role_id", "project_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )
    op.create_index(op.f("ix_user_role_assignments_created_at"), "user_role_assignments", ["created_at"], unique=False)
    op.create_index(op.f("ix_user_role_assignments_id"), "user_role_assignments", ["id"], unique=False)
    op.create_index(op.f("ix_user_role_assignments_project_id"), "user_role_assignments", ["project_id"], unique=False)
    op.create_index(op.f("ix_user_role_assignments_role_id"), "user_role_assignments", ["role_id"], unique=False)
    op.create_index(op.f("ix_user_role_assignments_updated_at"), "user_role_assignments", ["updated_at"], unique=False)
    op.create_index(op.f("ix_user_role_assignments_user_id"), "user_role_assignments", ["user_id"], unique=False)
    op.add_column("approval_requests", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_approval_requests_project_id"), "approval_requests", ["project_id"], unique=False)
    op.create_foreign_key(
        "fk_approval_requests_project_id_projects", "approval_requests", "projects", ["project_id"], ["id"]
    )
    op.add_column("executions", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_executions_project_id"), "executions", ["project_id"], unique=False)
    op.create_foreign_key("fk_executions_project_id_projects", "executions", "projects", ["project_id"], ["id"])
    op.add_column("groups", sa.Column("is_builtin", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column(
        "groups", sa.Column("source", sa.String(length=10), server_default=sa.text("'local'"), nullable=False)
    )
    op.alter_column("groups", "is_builtin", server_default=None)
    op.alter_column("groups", "source", server_default=None)
    op.create_index(op.f("ix_groups_is_builtin"), "groups", ["is_builtin"], unique=False)
    op.create_index(op.f("ix_groups_source"), "groups", ["source"], unique=False)
    op.add_column(
        "users",
        sa.Column(
            "authz_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.drop_column("users", "role")
    op.add_column("workflows", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_workflows_project_id"), "workflows", ["project_id"], unique=False)
    op.create_foreign_key("fk_workflows_project_id_projects", "workflows", "projects", ["project_id"], ["id"])
    apply_role_ops(ROLE_OPS)
    apply_policy_ops(POLICY_OPS)
    # ### end Alembic commands ###
    # CUSTOM: backfill NULL project_id rows to the default project
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT id FROM projects WHERE is_default = true AND deleted_at IS NULL LIMIT 1"))
    row = result.fetchone()
    if row:
        default_project_id = row[0]
        conn.execute(
            sa.text("UPDATE workflows SET project_id = :pid WHERE project_id IS NULL"),
            {"pid": default_project_id},
        )
        conn.execute(
            sa.text("UPDATE executions SET project_id = :pid WHERE project_id IS NULL"),
            {"pid": default_project_id},
        )
        conn.execute(
            sa.text("UPDATE approval_requests SET project_id = :pid WHERE project_id IS NULL"),
            {"pid": default_project_id},
        )
    # END CUSTOM


def downgrade() -> None:
    """Downgrade schema."""
    # CUSTOM: revert seed data before dropping tables
    revert_policy_ops(POLICY_OPS)
    revert_role_ops(ROLE_OPS)
    # END CUSTOM
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_constraint("fk_workflows_project_id_projects", "workflows", type_="foreignkey")
    op.drop_index(op.f("ix_workflows_project_id"), table_name="workflows")
    op.drop_column("workflows", "project_id")
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.VARCHAR(length=50),
            server_default=sa.text("'user'::character varying"),
            autoincrement=False,
            nullable=False,
        ),
    )
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)
    op.drop_column("users", "authz_metadata")
    op.drop_index(op.f("ix_groups_source"), table_name="groups")
    op.drop_index(op.f("ix_groups_is_builtin"), table_name="groups")
    op.drop_column("groups", "source")
    op.drop_column("groups", "is_builtin")
    op.drop_constraint("fk_executions_project_id_projects", "executions", type_="foreignkey")
    op.drop_index(op.f("ix_executions_project_id"), table_name="executions")
    op.drop_column("executions", "project_id")
    op.drop_constraint("fk_approval_requests_project_id_projects", "approval_requests", type_="foreignkey")
    op.drop_index(op.f("ix_approval_requests_project_id"), table_name="approval_requests")
    op.drop_column("approval_requests", "project_id")
    op.drop_index(op.f("ix_user_role_assignments_user_id"), table_name="user_role_assignments")
    op.drop_index(op.f("ix_user_role_assignments_updated_at"), table_name="user_role_assignments")
    op.drop_index(op.f("ix_user_role_assignments_role_id"), table_name="user_role_assignments")
    op.drop_index(op.f("ix_user_role_assignments_project_id"), table_name="user_role_assignments")
    op.drop_index(op.f("ix_user_role_assignments_id"), table_name="user_role_assignments")
    op.drop_index(op.f("ix_user_role_assignments_created_at"), table_name="user_role_assignments")
    op.drop_index(
        "ix_ura_user_role_project",
        table_name="user_role_assignments",
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )
    op.drop_index(
        "ix_ura_user_role_global", table_name="user_role_assignments", postgresql_where=sa.text("project_id IS NULL")
    )
    op.drop_table("user_role_assignments")
    op.drop_index(op.f("ix_role_policies_updated_at"), table_name="role_policies")
    op.drop_index(op.f("ix_role_policies_role_id"), table_name="role_policies")
    op.drop_index(op.f("ix_role_policies_policy_id"), table_name="role_policies")
    op.drop_index(op.f("ix_role_policies_id"), table_name="role_policies")
    op.drop_index(op.f("ix_role_policies_created_at"), table_name="role_policies")
    op.drop_table("role_policies")
    op.drop_index(op.f("ix_group_role_assignments_updated_at"), table_name="group_role_assignments")
    op.drop_index(op.f("ix_group_role_assignments_role_id"), table_name="group_role_assignments")
    op.drop_index(op.f("ix_group_role_assignments_project_id"), table_name="group_role_assignments")
    op.drop_index(op.f("ix_group_role_assignments_id"), table_name="group_role_assignments")
    op.drop_index(op.f("ix_group_role_assignments_group_id"), table_name="group_role_assignments")
    op.drop_index(op.f("ix_group_role_assignments_created_at"), table_name="group_role_assignments")
    op.drop_index(
        "ix_gra_group_role_project",
        table_name="group_role_assignments",
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )
    op.drop_index(
        "ix_gra_group_role_global", table_name="group_role_assignments", postgresql_where=sa.text("project_id IS NULL")
    )
    op.drop_table("group_role_assignments")
    op.drop_index(op.f("ix_roles_updated_at"), table_name="roles")
    op.drop_index(op.f("ix_roles_project_id"), table_name="roles")
    op.drop_index(
        "ix_roles_name_project_unique", table_name="roles", postgresql_where=sa.text("project_id IS NOT NULL")
    )
    op.drop_index("ix_roles_name_global_unique", table_name="roles", postgresql_where=sa.text("project_id IS NULL"))
    op.drop_index(op.f("ix_roles_name"), table_name="roles")
    op.drop_index(op.f("ix_roles_is_builtin"), table_name="roles")
    op.drop_index(op.f("ix_roles_id"), table_name="roles")
    op.drop_index(op.f("ix_roles_created_at"), table_name="roles")
    op.drop_table("roles")
    op.drop_index(op.f("ix_policies_updated_at"), table_name="policies")
    op.drop_index(op.f("ix_policies_project_id"), table_name="policies")
    op.drop_index(
        "ix_policies_name_project_unique", table_name="policies", postgresql_where=sa.text("project_id IS NOT NULL")
    )
    op.drop_index(
        "ix_policies_name_global_unique", table_name="policies", postgresql_where=sa.text("project_id IS NULL")
    )
    op.drop_index(op.f("ix_policies_name"), table_name="policies")
    op.drop_index(op.f("ix_policies_is_builtin"), table_name="policies")
    op.drop_index(op.f("ix_policies_id"), table_name="policies")
    op.drop_index(op.f("ix_policies_created_at"), table_name="policies")
    op.drop_table("policies")
    op.drop_index(op.f("ix_projects_updated_at"), table_name="projects")
    op.drop_index("ix_projects_name_unique", table_name="projects", postgresql_where=sa.text("deleted_at IS NULL"))
    op.drop_index(op.f("ix_projects_name"), table_name="projects")
    op.drop_index(op.f("ix_projects_is_default"), table_name="projects")
    op.drop_index(op.f("ix_projects_id"), table_name="projects")
    op.drop_index(op.f("ix_projects_deleted_by"), table_name="projects")
    op.drop_index(op.f("ix_projects_deleted_at"), table_name="projects")
    op.drop_index(op.f("ix_projects_created_at"), table_name="projects")
    op.drop_table("projects")
    # ### end Alembic commands ###
