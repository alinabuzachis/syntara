"""refactor_version_status_to_pointer

Replace WorkflowVersionStatus enum + published_version int with
published_version_id UUID FK. Add workflow_publish_events table
for publish lifecycle tracking. Rename publish_name to name on
workflow_versions.

Revision ID: c4f7a1b2d3e5
Revises: ab929d923674
Create Date: 2026-07-09 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c4f7a1b2d3e5"
down_revision: str | Sequence[str] | None = "ab929d923674"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Step 1: Add published_version_id FK on workflows
    op.add_column(
        "workflows",
        sa.Column(
            "published_version_id",
            sa.Uuid(),
            sa.ForeignKey("workflow_versions.id"),
            nullable=True,
        ),
    )

    # Step 2: Rename publish_name -> name on workflow_versions
    op.alter_column("workflow_versions", "publish_name", new_column_name="name")

    # Step 3: Create workflow_publish_events table
    op.create_table(
        "workflow_publish_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("labels", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("workflow_id", sa.Uuid(), sa.ForeignKey("workflows.id"), nullable=False),
        sa.Column("version_id", sa.Uuid(), sa.ForeignKey("workflow_versions.id"), nullable=False),
        sa.Column(
            "action",
            postgresql.ENUM("published", "unpublished", name="publishaction", create_type=True),
            nullable=False,
        ),
        sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("principals.id"), nullable=False),
    )
    op.create_index("ix_workflow_publish_events_id", "workflow_publish_events", ["id"])
    op.create_index("ix_workflow_publish_events_created_at", "workflow_publish_events", ["created_at"])
    op.create_index("ix_workflow_publish_events_updated_at", "workflow_publish_events", ["updated_at"])
    op.create_index("ix_wf_publish_events_workflow_id", "workflow_publish_events", ["workflow_id"])
    op.create_index("ix_wf_publish_events_version_id", "workflow_publish_events", ["version_id"])
    op.create_index("ix_wf_publish_events_actor_id", "workflow_publish_events", ["actor_id"])

    # CUSTOM: Backfill published_version_id from old published_version int column,
    # and create publish events from the old status enum.
    # The prior migration (2886cbd97b4b) creates 'status' enum and 'published_version'
    # int columns. We backfill from those, then drop them.
    op.execute("""
        UPDATE workflows w
        SET published_version_id = (
            SELECT wv.id FROM workflow_versions wv
            WHERE wv.workflow_id = w.id
              AND wv.version = w.published_version
              AND wv.deleted_at IS NULL
            LIMIT 1
        )
        WHERE w.published_version IS NOT NULL
    """)

    op.execute("""
        INSERT INTO workflow_publish_events
            (id, workflow_id, version_id, action, actor_id, created_at, updated_at, labels)
        SELECT
            gen_random_uuid(),
            wv.workflow_id,
            wv.id,
            'published'::publishaction,
            wv.created_by,
            wv.created_at,
            wv.created_at,
            '{}'::jsonb
        FROM workflow_versions wv
        WHERE wv.status IN ('published', 'previously_published')
    """)

    # Drop old constraints and indexes
    op.execute("DROP INDEX IF EXISTS ix_workflow_versions_single_published")
    op.drop_constraint("ck_workflows_is_enabled_published_version", "workflows")
    op.drop_index(op.f("ix_workflows_published_version"), table_name="workflows")
    op.drop_index(op.f("ix_workflow_versions_status"), table_name="workflow_versions")

    # Drop old columns
    op.drop_column("workflow_versions", "status")
    op.drop_column("workflows", "published_version")

    # Drop the enum type
    postgresql.ENUM(name="workflowversionstatus").drop(op.get_bind(), checkfirst=True)
    # END CUSTOM

    # Step 6: Create new constraints and indexes
    op.create_check_constraint(
        "ck_workflows_is_enabled_published_version_id",
        "workflows",
        "(published_version_id IS NULL) = (NOT is_enabled)",
    )
    op.create_index(
        op.f("ix_workflows_published_version_id"),
        "workflows",
        ["published_version_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Step 1: Recreate enum type
    workflowversionstatus_enum = postgresql.ENUM(
        "draft",
        "published",
        "previously_published",
        name="workflowversionstatus",
        create_type=True,
    )
    workflowversionstatus_enum.create(op.get_bind(), checkfirst=True)

    # Step 2: Add back old columns
    op.add_column(
        "workflow_versions",
        sa.Column(
            "status",
            postgresql.ENUM(
                "draft",
                "published",
                "previously_published",
                name="workflowversionstatus",
                create_type=False,
            ),
            server_default=sa.text("'draft'::workflowversionstatus"),
            nullable=False,
        ),
    )
    op.add_column(
        "workflow_versions",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "workflows",
        sa.Column("published_version", sa.Integer(), nullable=True),
    )

    # CUSTOM: Reverse data migration — derive status and published_at from publish events
    op.execute("""
        UPDATE workflow_versions wv
        SET
            published_at = (
                SELECT MIN(wpe.created_at)
                FROM workflow_publish_events wpe
                WHERE wpe.version_id = wv.id AND wpe.action = 'published'
            ),
            status = CASE
                WHEN EXISTS (
                    SELECT 1 FROM workflow_publish_events wpe
                    WHERE wpe.version_id = wv.id AND wpe.action = 'published'
                ) AND EXISTS (
                    SELECT 1 FROM workflows w
                    WHERE w.published_version_id = wv.id
                ) THEN 'published'::workflowversionstatus
                WHEN EXISTS (
                    SELECT 1 FROM workflow_publish_events wpe
                    WHERE wpe.version_id = wv.id AND wpe.action = 'published'
                ) THEN 'previously_published'::workflowversionstatus
                ELSE 'draft'::workflowversionstatus
            END
    """)

    # CUSTOM: Reverse published_version_id -> published_version int
    op.execute("""
        UPDATE workflows w
        SET published_version = (
            SELECT wv.version FROM workflow_versions wv
            WHERE wv.id = w.published_version_id
            LIMIT 1
        )
        WHERE w.published_version_id IS NOT NULL
    """)
    # END CUSTOM

    # Step 3: Rename name -> publish_name
    op.alter_column("workflow_versions", "name", new_column_name="publish_name")

    # Step 4: Drop new constraints and indexes
    op.drop_index(op.f("ix_workflows_published_version_id"), table_name="workflows")
    op.drop_constraint("ck_workflows_is_enabled_published_version_id", "workflows")

    # Step 5: Drop publish events table and indexes
    op.drop_index("ix_wf_publish_events_actor_id", table_name="workflow_publish_events")
    op.drop_index("ix_wf_publish_events_version_id", table_name="workflow_publish_events")
    op.drop_index("ix_wf_publish_events_workflow_id", table_name="workflow_publish_events")
    op.drop_index("ix_workflow_publish_events_updated_at", table_name="workflow_publish_events")
    op.drop_index("ix_workflow_publish_events_created_at", table_name="workflow_publish_events")
    op.drop_index("ix_workflow_publish_events_id", table_name="workflow_publish_events")
    op.drop_table("workflow_publish_events")
    postgresql.ENUM(name="publishaction").drop(op.get_bind(), checkfirst=True)

    # Step 6: Drop new columns
    op.drop_column("workflows", "published_version_id")

    # Step 7: Recreate old indexes and constraints
    op.create_index(
        op.f("ix_workflow_versions_status"),
        "workflow_versions",
        ["status"],
        unique=False,
    )
    op.create_index(
        op.f("ix_workflows_published_version"),
        "workflows",
        ["published_version"],
        unique=False,
    )
    op.create_check_constraint(
        "ck_workflows_is_enabled_published_version",
        "workflows",
        "(published_version IS NULL) = (NOT is_enabled)",
    )
    op.execute("""
        CREATE UNIQUE INDEX ix_workflow_versions_single_published
        ON workflow_versions (workflow_id)
        WHERE status = 'published' AND deleted_at IS NULL
    """)
