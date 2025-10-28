"""add executions table

Revision ID: a62fcd46bef1
Revises: d61bdefe47c6
Create Date: 2025-10-23 15:01:58.858902

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a62fcd46bef1"
down_revision: str | Sequence[str] | None = "d61bdefe47c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create executions table
    op.create_table(
        "executions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("workflow_id", sa.Uuid(), nullable=False),
        sa.Column("workflow_version_id", sa.Uuid(), nullable=False),
        sa.Column("temporal_workflow_id", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "running", "paused", "completed", "failed", "cancelled", name="workflowexecutionstatus"),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("input_data", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("error_details", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "completed_at IS NULL OR completed_at > created_at", name="check_execution_completed_at_after_created_at"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(["workflow_id"], ["workflows.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["workflow_version_id"], ["workflow_versions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Create indexes
    op.create_index(op.f("ix_executions_created_at"), "executions", ["created_at"], unique=False)
    op.create_index(op.f("ix_executions_created_by"), "executions", ["created_by"], unique=False)
    op.create_index("ix_executions_created_by_created_at", "executions", ["created_by", "created_at"], unique=False)
    op.create_index(op.f("ix_executions_deleted_at"), "executions", ["deleted_at"], unique=False)
    op.create_index(op.f("ix_executions_deleted_by"), "executions", ["deleted_by"], unique=False)
    op.create_index(op.f("ix_executions_id"), "executions", ["id"], unique=False)
    op.create_index("ix_executions_labels", "executions", ["labels"], unique=False, postgresql_using="gin")
    op.create_index(op.f("ix_executions_status"), "executions", ["status"], unique=False)
    op.create_index(op.f("ix_executions_temporal_workflow_id"), "executions", ["temporal_workflow_id"], unique=True)
    op.create_index(op.f("ix_executions_updated_at"), "executions", ["updated_at"], unique=False)
    op.create_index(op.f("ix_executions_updated_by"), "executions", ["updated_by"], unique=False)
    op.create_index(op.f("ix_executions_workflow_id"), "executions", ["workflow_id"], unique=False)
    op.create_index("ix_executions_workflow_id_status", "executions", ["workflow_id", "status"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_executions_workflow_id_status", table_name="executions")
    op.drop_index(op.f("ix_executions_workflow_id"), table_name="executions")
    op.drop_index(op.f("ix_executions_updated_by"), table_name="executions")
    op.drop_index(op.f("ix_executions_updated_at"), table_name="executions")
    op.drop_index(op.f("ix_executions_temporal_workflow_id"), table_name="executions")
    op.drop_index(op.f("ix_executions_status"), table_name="executions")
    op.drop_index("ix_executions_labels", table_name="executions", postgresql_using="gin")
    op.drop_index(op.f("ix_executions_id"), table_name="executions")
    op.drop_index(op.f("ix_executions_deleted_by"), table_name="executions")
    op.drop_index(op.f("ix_executions_deleted_at"), table_name="executions")
    op.drop_index("ix_executions_created_by_created_at", table_name="executions")
    op.drop_index(op.f("ix_executions_created_by"), table_name="executions")
    op.drop_index(op.f("ix_executions_created_at"), table_name="executions")
    op.drop_table("executions")
