"""create workflow tables

Revision ID: ae2e6da05883
Revises:
Create Date: 2025-10-09 17:20:18.226793

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "ae2e6da05883"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema - create workflow tables."""
    # Create users table
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        sa.Column("preferences", sa.JSON(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_users_deleted_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )

    # Create indexes for users table
    op.create_index(op.f("ix_users_is_active"), "users", ["is_active"], unique=False)
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)
    # Partial unique indexes for username and email (only for non-deleted users)
    op.create_index(
        "ix_users_username_unique",
        "users",
        ["username"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_users_email_unique",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # Create workflows table
    op.create_table(
        "workflows",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_workflows_created_by_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_workflows_deleted_by_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workflows")),
    )

    # Create indexes for workflows table
    op.create_index(op.f("ix_workflows_created_by"), "workflows", ["created_by"], unique=False)
    op.create_index(
        op.f("ix_workflows_created_by_enabled"),
        "workflows",
        ["created_by", "is_enabled"],
        unique=False,
    )

    # GIN index for JSONB labels
    op.create_index(
        op.f("ix_workflows_labels"),
        "workflows",
        ["labels"],
        unique=False,
        postgresql_using="gin",
    )

    # Partial unique index for name (only for non-deleted workflows)
    op.create_index(
        "ix_workflows_name_unique",
        "workflows",
        ["name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # Create workflow_versions table
    op.create_table(
        "workflow_versions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("schema_version", sa.String(length=50), nullable=False),
        sa.Column("workflow_definition", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("change_description", sa.Text(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_workflow_versions_created_by_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_workflow_versions_deleted_by_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workflow_id"],
            ["workflows.id"],
            name=op.f("fk_workflow_versions_workflow_id_workflows"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workflow_versions")),
    )

    # Create indexes for workflow_versions table
    op.create_index(
        op.f("ix_workflow_versions_schema_version"),
        "workflow_versions",
        ["schema_version"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workflow_versions_workflow_created"),
        "workflow_versions",
        ["workflow_id", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workflow_versions_workflow_version"),
        "workflow_versions",
        ["workflow_id", "version"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema - drop workflow tables."""
    # Drop tables in reverse order
    op.drop_index(op.f("ix_workflow_versions_workflow_version"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_workflow_created"), table_name="workflow_versions")
    op.drop_index(op.f("ix_workflow_versions_schema_version"), table_name="workflow_versions")
    op.drop_table("workflow_versions")

    op.drop_index("ix_workflows_name_unique", table_name="workflows")
    op.drop_index(op.f("ix_workflows_labels"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_created_by_enabled"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_created_by"), table_name="workflows")
    op.drop_table("workflows")

    op.drop_index("ix_users_email_unique", table_name="users")
    op.drop_index("ix_users_username_unique", table_name="users")
    op.drop_index(op.f("ix_users_role"), table_name="users")
    op.drop_index(op.f("ix_users_is_active"), table_name="users")
    op.drop_table("users")
