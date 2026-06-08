"""Create audit_events table.

Revision ID: 2e0b9ae06c0a
Revises:
Create Date: 2026-04-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2e0b9ae06c0a"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "labels", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("event_category", sa.String(), nullable=False),
        sa.Column("event_severity", sa.String(), nullable=False),
        sa.Column("event_status", sa.String(), nullable=True),
        sa.Column("event_action", sa.String(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("actor_type", sa.String(), nullable=True),
        sa.Column("source_component", sa.String(), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), nullable=True),
        sa.Column("activity_id", sa.String(), nullable=True),
        sa.Column("execution_id", sa.Uuid(), nullable=True),
        sa.Column("event_message", sa.String(), nullable=False),
        sa.Column("structured_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_events_id"), "audit_events", ["id"], unique=False)
    op.create_index(op.f("ix_audit_events_created_at"), "audit_events", ["created_at"], unique=False)
    op.create_index(op.f("ix_audit_events_updated_at"), "audit_events", ["updated_at"], unique=False)
    op.create_index(op.f("ix_audit_events_event_category"), "audit_events", ["event_category"], unique=False)
    op.create_index(op.f("ix_audit_events_event_severity"), "audit_events", ["event_severity"], unique=False)
    op.create_index(op.f("ix_audit_events_event_status"), "audit_events", ["event_status"], unique=False)
    op.create_index(op.f("ix_audit_events_event_action"), "audit_events", ["event_action"], unique=False)
    op.create_index(op.f("ix_audit_events_actor_id"), "audit_events", ["actor_id"], unique=False)
    op.create_index(op.f("ix_audit_events_workflow_id"), "audit_events", ["workflow_id"], unique=False)
    op.create_index(op.f("ix_audit_events_execution_id"), "audit_events", ["execution_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_audit_events_execution_id"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_workflow_id"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_actor_id"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_event_action"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_event_status"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_event_severity"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_event_category"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_updated_at"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_created_at"), table_name="audit_events")
    op.drop_index(op.f("ix_audit_events_id"), table_name="audit_events")
    op.drop_table("audit_events")
