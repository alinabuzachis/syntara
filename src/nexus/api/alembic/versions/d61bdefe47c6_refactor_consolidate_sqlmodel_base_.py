"""consolidate SQLModel base class migrations

Revision ID: d61bdefe47c6
Revises: 644f97ed1d9a
Create Date: 2025-10-23 10:41:03.537371

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d61bdefe47c6"
down_revision: str | Sequence[str] | None = "644f97ed1d9a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:  # noqa: PLR0915
    """Upgrade schema - consolidates SQLModel base class changes."""
    # Invocations table: Add foreign keys and indexes
    op.alter_column(
        "invocations",
        "labels",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        server_default=None,
        existing_nullable=False,
    )
    op.alter_column(
        "invocations",
        "context_data",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        server_default=None,
        existing_nullable=False,
    )
    op.create_index(op.f("ix_invocations_id"), "invocations", ["id"], unique=False)
    op.create_index(op.f("ix_invocations_updated_at"), "invocations", ["updated_at"], unique=False)
    op.create_index(op.f("ix_invocations_updated_by"), "invocations", ["updated_by"], unique=False)
    op.create_foreign_key("fk_invocations_updated_by_users", "invocations", "users", ["updated_by"], ["id"])
    op.create_foreign_key("fk_invocations_created_by_users", "invocations", "users", ["created_by"], ["id"])

    # Users table: Add labels column and maintain unique constraints
    op.add_column("users", sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), nullable=False))
    op.create_index(op.f("ix_users_created_at"), "users", ["created_at"], unique=False)
    op.create_index(op.f("ix_users_deleted_at"), "users", ["deleted_at"], unique=False)
    op.create_index(op.f("ix_users_deleted_by"), "users", ["deleted_by"], unique=False)
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_updated_at"), "users", ["updated_at"], unique=False)
    op.drop_constraint(op.f("fk_users_deleted_by_users"), "users", type_="foreignkey")
    op.create_foreign_key("fk_users_deleted_by_users", "users", "users", ["deleted_by"], ["id"])

    # Workflow_versions table: Add labels, updated_by, and recreate constraints
    op.add_column("workflow_versions", sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), nullable=False))
    op.add_column("workflow_versions", sa.Column("updated_by", sa.Uuid(), nullable=True))
    op.alter_column(
        "workflow_versions",
        "change_description",
        existing_type=sa.TEXT(),
        type_=sa.String(length=2000),
        existing_nullable=True,
    )
    op.create_index(op.f("ix_workflow_versions_created_at"), "workflow_versions", ["created_at"], unique=False)
    op.create_index(op.f("ix_workflow_versions_created_by"), "workflow_versions", ["created_by"], unique=False)
    op.create_index(op.f("ix_workflow_versions_deleted_at"), "workflow_versions", ["deleted_at"], unique=False)
    op.create_index(op.f("ix_workflow_versions_deleted_by"), "workflow_versions", ["deleted_by"], unique=False)
    op.create_index(op.f("ix_workflow_versions_id"), "workflow_versions", ["id"], unique=False)
    op.create_index(op.f("ix_workflow_versions_updated_at"), "workflow_versions", ["updated_at"], unique=False)
    op.create_index(op.f("ix_workflow_versions_updated_by"), "workflow_versions", ["updated_by"], unique=False)
    op.create_index(op.f("ix_workflow_versions_version"), "workflow_versions", ["version"], unique=False)
    op.create_index(op.f("ix_workflow_versions_workflow_id"), "workflow_versions", ["workflow_id"], unique=False)
    # Recreate foreign keys (drop old, create new)
    op.drop_constraint(op.f("fk_workflow_versions_deleted_by_users"), "workflow_versions", type_="foreignkey")
    op.drop_constraint(op.f("fk_workflow_versions_workflow_id_workflows"), "workflow_versions", type_="foreignkey")
    op.drop_constraint(op.f("fk_workflow_versions_created_by_users"), "workflow_versions", type_="foreignkey")
    op.create_foreign_key("fk_workflow_versions_created_by_users", "workflow_versions", "users", ["created_by"], ["id"])
    op.create_foreign_key(
        "fk_workflow_versions_workflow_id_workflows",
        "workflow_versions",
        "workflows",
        ["workflow_id"],
        ["id"],
    )
    op.create_foreign_key("fk_workflow_versions_updated_by_users", "workflow_versions", "users", ["updated_by"], ["id"])
    op.create_foreign_key("fk_workflow_versions_deleted_by_users", "workflow_versions", "users", ["deleted_by"], ["id"])

    # Workflows table: Add updated_by and recreate constraints
    op.add_column("workflows", sa.Column("updated_by", sa.Uuid(), nullable=True))
    op.alter_column(
        "workflows",
        "description",
        existing_type=sa.TEXT(),
        type_=sa.String(length=2000),
        existing_nullable=True,
    )
    op.create_index(op.f("ix_workflows_created_at"), "workflows", ["created_at"], unique=False)
    op.create_index(op.f("ix_workflows_current_version"), "workflows", ["current_version"], unique=False)
    op.create_index(op.f("ix_workflows_deleted_at"), "workflows", ["deleted_at"], unique=False)
    op.create_index(op.f("ix_workflows_deleted_by"), "workflows", ["deleted_by"], unique=False)
    op.create_index(op.f("ix_workflows_id"), "workflows", ["id"], unique=False)
    op.create_index(op.f("ix_workflows_is_enabled"), "workflows", ["is_enabled"], unique=False)
    op.create_index(op.f("ix_workflows_name"), "workflows", ["name"], unique=False)
    op.create_index(op.f("ix_workflows_updated_at"), "workflows", ["updated_at"], unique=False)
    op.create_index(op.f("ix_workflows_updated_by"), "workflows", ["updated_by"], unique=False)
    # Recreate foreign keys
    op.drop_constraint(op.f("fk_workflows_deleted_by_users"), "workflows", type_="foreignkey")
    op.drop_constraint(op.f("fk_workflows_created_by_users"), "workflows", type_="foreignkey")
    op.create_foreign_key("fk_workflows_updated_by_users", "workflows", "users", ["updated_by"], ["id"])
    op.create_foreign_key("fk_workflows_created_by_users", "workflows", "users", ["created_by"], ["id"])
    op.create_foreign_key("fk_workflows_deleted_by_users", "workflows", "users", ["deleted_by"], ["id"])


def downgrade() -> None:  # noqa: PLR0915
    """Downgrade schema."""
    # Workflows table
    op.drop_constraint("fk_workflows_deleted_by_users", "workflows", type_="foreignkey")
    op.drop_constraint("fk_workflows_created_by_users", "workflows", type_="foreignkey")
    op.drop_constraint("fk_workflows_updated_by_users", "workflows", type_="foreignkey")
    op.create_foreign_key(
        op.f("fk_workflows_created_by_users"),
        "workflows",
        "users",
        ["created_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_workflows_deleted_by_users"),
        "workflows",
        "users",
        ["deleted_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_index(op.f("ix_workflows_updated_by"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_updated_at"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_name"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_is_enabled"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_id"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_deleted_by"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_deleted_at"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_current_version"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_created_at"), table_name="workflows")
    op.alter_column(
        "workflows",
        "description",
        existing_type=sa.String(length=2000),
        type_=sa.TEXT(),
        existing_nullable=True,
    )
    op.drop_column("workflows", "updated_by")

    # Workflow_versions table
    op.drop_constraint("fk_workflow_versions_deleted_by_users", "workflow_versions", type_="foreignkey")
    op.drop_constraint("fk_workflow_versions_updated_by_users", "workflow_versions", type_="foreignkey")
    op.drop_constraint("fk_workflow_versions_workflow_id_workflows", "workflow_versions", type_="foreignkey")
    op.drop_constraint("fk_workflow_versions_created_by_users", "workflow_versions", type_="foreignkey")
    op.create_foreign_key(
        op.f("fk_workflow_versions_created_by_users"),
        "workflow_versions",
        "users",
        ["created_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_workflow_versions_workflow_id_workflows"),
        "workflow_versions",
        "workflows",
        ["workflow_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_workflow_versions_deleted_by_users"),
        "workflow_versions",
        "users",
        ["deleted_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_index(op.f("ix_workflow_versions_workflow_id"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_version"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_updated_by"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_updated_at"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_id"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_deleted_by"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_deleted_at"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_created_by"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_created_at"), table_name="workflow_versions")
    op.alter_column(
        "workflow_versions",
        "change_description",
        existing_type=sa.String(length=2000),
        type_=sa.TEXT(),
        existing_nullable=True,
    )
    op.drop_column("workflow_versions", "updated_by")
    op.drop_column("workflow_versions", "labels")

    # Users table
    op.drop_constraint("fk_users_deleted_by_users", "users", type_="foreignkey")
    op.create_foreign_key(
        op.f("fk_users_deleted_by_users"), "users", "users", ["deleted_by"], ["id"], ondelete="RESTRICT"
    )
    op.drop_index(op.f("ix_users_updated_at"), table_name="users")
    op.drop_index(op.f("ix_users_id"), table_name="users")
    op.drop_index(op.f("ix_users_deleted_by"), table_name="users")
    op.drop_index(op.f("ix_users_deleted_at"), table_name="users")
    op.drop_index(op.f("ix_users_created_at"), table_name="users")
    op.drop_column("users", "labels")

    # Invocations table
    op.drop_constraint("fk_invocations_created_by_users", "invocations", type_="foreignkey")
    op.drop_constraint("fk_invocations_updated_by_users", "invocations", type_="foreignkey")
    op.drop_index(op.f("ix_invocations_updated_by"), table_name="invocations")
    op.drop_index(op.f("ix_invocations_updated_at"), table_name="invocations")
    op.drop_index(op.f("ix_invocations_id"), table_name="invocations")
    op.alter_column(
        "invocations",
        "context_data",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        server_default=sa.text("'{}'::jsonb"),
        existing_nullable=False,
    )
    op.alter_column(
        "invocations",
        "labels",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        server_default=sa.text("'{}'::jsonb"),
        existing_nullable=False,
    )
