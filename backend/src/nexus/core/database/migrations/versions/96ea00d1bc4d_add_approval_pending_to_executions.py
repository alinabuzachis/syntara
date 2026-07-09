"""add approval_pending to executions and node_type to activity_execution

Revision ID: 96ea00d1bc4d
Revises: 7e33e85dbc47
Create Date: 2026-06-24 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "96ea00d1bc4d"
down_revision: str | Sequence[str] | None = "7e33e85dbc47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

nodetype_enum = postgresql.ENUM(
    "manual_trigger",
    "scheduled_trigger",
    "webhook_trigger",
    "eda_trigger",
    "condition",
    "converge",
    "loop",
    "switch",
    "wait",
    "aap_job_template",
    "aap_workflow_job_template",
    "agentic",
    "approval",
    "http_request",
    "internal_activity",
    "script",
    name="nodetype",
    create_type=False,
)


def upgrade() -> None:
    """Add node_type to activity_execution and approval_pending to executions.

    Note: Backfill defaults to 'internal_activity' when activity_definition->>'type' is NULL.
    Low risk for production given this is dev data; activities with malformed/missing
    activity_definition JSONB will be classified as 'internal_activity' regardless of original type.
    """
    # === activity_execution: add node_type, remove activity_definition ===

    # Step 1: Create the nodetype PG enum
    nodetype_enum.create(op.get_bind(), checkfirst=True)

    # Step 2: Add node_type as nullable varchar first (for backfill from JSONB)
    op.add_column("activity_execution", sa.Column("node_type", sa.String(255), nullable=True))

    # Step 3: Backfill node_type from activity_definition JSONB (defaults to 'internal_activity' when NULL)
    op.execute("""
        UPDATE activity_execution
        SET node_type = COALESCE(activity_definition->>'type', 'internal_activity')
    """)

    # Step 4: Make NOT NULL and convert column type to the enum
    op.alter_column(
        "activity_execution",
        "node_type",
        type_=nodetype_enum,
        nullable=False,
        postgresql_using="node_type::nodetype",
    )

    # Step 5: Add index on node_type
    op.create_index("ix_activity_execution_node_type", "activity_execution", ["node_type"])

    # Step 6: Drop activity_definition column (duplicated content from workflow definition)
    op.drop_column("activity_execution", "activity_definition")

    # === executions: add approval_pending ===

    # Step 7: Add approval_pending as nullable
    op.add_column("executions", sa.Column("approval_pending", sa.Boolean(), nullable=True))

    # Step 8: Backfill using node_type (already populated above)
    # Use UPDATE FROM with JOIN for better performance than EXISTS subquery
    op.execute("""
        UPDATE executions e
        SET approval_pending = COALESCE(pending_approvals.has_pending, false)
        FROM (
            SELECT DISTINCT execution_id, true AS has_pending
            FROM activity_execution
            WHERE node_type = 'approval'
              AND status::text = 'waiting'
        ) AS pending_approvals
        WHERE e.id = pending_approvals.execution_id
    """)

    # Set false for any executions not updated (no pending approvals)
    op.execute("""
        UPDATE executions
        SET approval_pending = false
        WHERE approval_pending IS NULL
    """)

    # Step 9: Set NOT NULL with server default
    op.alter_column(
        "executions",
        "approval_pending",
        nullable=False,
        server_default=sa.text("false"),
    )

    # Step 10: Add index for filtering
    op.create_index("ix_executions_approval_pending", "executions", ["approval_pending"])


def downgrade() -> None:
    """Reverse node_type and approval_pending changes.

    Note: Downgrade performs best-effort backfill of activity_definition from node_type,
    but only reconstructs minimal {"type": <node_type>} structure. Full activity definition
    snapshots are lost and must be restored from workflow definitions if needed.
    """
    # Reverse approval_pending
    op.drop_index("ix_executions_approval_pending", table_name="executions")
    op.drop_column("executions", "approval_pending")

    # Reverse node_type → activity_definition
    op.add_column("activity_execution", sa.Column("activity_definition", postgresql.JSONB(), nullable=True))

    # Best-effort backfill: reconstruct minimal activity_definition from node_type
    op.execute("""
        UPDATE activity_execution
        SET activity_definition = jsonb_build_object('type', node_type::text)
        WHERE node_type IS NOT NULL
    """)

    op.drop_index("ix_activity_execution_node_type", table_name="activity_execution")
    op.drop_column("activity_execution", "node_type")
    nodetype_enum.drop(op.get_bind(), checkfirst=True)
