"""create activity_execution table

Revision ID: 39285a2046da
Revises: f5f4b399ef33
Create Date: 2025-11-06 11:50:24.850374

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "39285a2046da"
down_revision: str | Sequence[str] | None = "f5f4b399ef33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add last_processed_event_id to executions table for incremental sync
    op.add_column(
        "executions", sa.Column("last_processed_event_id", sa.BigInteger(), server_default="0", nullable=False)
    )

    # Create activity_execution table
    op.create_table(
        "activity_execution",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("execution_id", sa.Uuid(), nullable=False),
        sa.Column("activity_name", sa.String(), nullable=False),
        sa.Column("activity_definition", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("temporal_activity_id", sa.String(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "running", "completed", "failed", "retrying", name="activitystatus", create_type=True),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("input_data", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("output_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_details", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("iteration", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["execution_id"], ["executions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("execution_id", "temporal_activity_id", name="uix_execution_activity"),
        sa.CheckConstraint(
            "completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at",
            name="ck_activity_execution_completed_after_started",
        ),
        sa.CheckConstraint("retry_count >= 0", name="ck_activity_execution_retry_count_non_negative"),
        sa.CheckConstraint("iteration IS NULL OR iteration >= 0", name="ck_activity_execution_iteration_non_negative"),
    )

    # Create indexes
    # Single-column indexes
    op.create_index("ix_activity_execution_execution_id", "activity_execution", ["execution_id"], unique=False)
    op.create_index("ix_activity_execution_status", "activity_execution", ["status"], unique=False)

    # Composite indexes
    op.create_index(
        "ix_activity_execution_execution_activity",
        "activity_execution",
        ["execution_id", "activity_name"],
        unique=False,
    )
    op.create_index(
        "ix_activity_execution_execution_iteration",
        "activity_execution",
        ["execution_id", "iteration"],
        unique=False,
    )

    # GIN index for JSONB labels to enable efficient label filtering
    op.create_index(
        "ix_activity_execution_labels", "activity_execution", ["labels"], unique=False, postgresql_using="gin"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop indexes
    op.drop_index("ix_activity_execution_labels", table_name="activity_execution", postgresql_using="gin")
    op.drop_index("ix_activity_execution_execution_iteration", table_name="activity_execution")
    op.drop_index("ix_activity_execution_execution_activity", table_name="activity_execution")
    op.drop_index("ix_activity_execution_status", table_name="activity_execution")
    op.drop_index("ix_activity_execution_execution_id", table_name="activity_execution")

    # Drop table
    op.drop_table("activity_execution")

    # Drop enum type
    activity_status_enum = postgresql.ENUM(
        "pending", "running", "completed", "failed", "retrying", name="activitystatus"
    )
    activity_status_enum.drop(op.get_bind(), checkfirst=True)

    # Remove last_processed_event_id from executions table
    op.drop_column("executions", "last_processed_event_id")
