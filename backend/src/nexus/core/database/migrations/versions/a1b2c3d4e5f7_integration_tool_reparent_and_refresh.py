"""integration tool reparent and refresh

Squashed migration combining 7 individual migrations into one:
- Add integration_id to tools, tool_executions, usage_counters
- Add refresh_status/last_refreshed_at/refresh_error to integrations
- Rename status → validation_status on integrations
- Add 'unknown' to integration_status enum with server default
- Strip discovered_tools from integration config JSONB
- Drop tool_providers table if it exists (standalone repo artifact)

Revision ID: a1b2c3d4e5f7
Revises: 1ca21f73e381
Create Date: 2026-06-23 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f7"
down_revision: str | Sequence[str] | None = "1ca21f73e381"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _table_exists(name: str) -> bool:
    conn = op.get_bind()
    return bool(
        conn.execute(
            sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"),
            {"t": name},
        ).scalar()
    )


def _column_exists(table: str, column: str) -> bool:
    conn = op.get_bind()
    return bool(
        conn.execute(
            sa.text(
                "SELECT EXISTS (  SELECT 1 FROM information_schema.columns  WHERE table_name = :t AND column_name = :c)"
            ),
            {"t": table, "c": column},
        ).scalar()
    )


def upgrade() -> None:
    """Apply all integration schema changes in one step."""
    # 1. Add integration_id to tools
    op.add_column("tools", sa.Column("integration_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_tools_integration_id",
        "tools",
        "integrations",
        ["integration_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_tools_integration_id"), "tools", ["integration_id"])
    op.create_index("ix_tools_integration_id_created_at_id", "tools", ["integration_id", "created_at", "id"])

    # 2. Add integration_id to tool_executions
    op.add_column("tool_executions", sa.Column("integration_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_tool_executions_integration_id",
        "tool_executions",
        "integrations",
        ["integration_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_tool_executions_integration_id", "tool_executions", ["integration_id"])

    # 3. Add integration_id to usage_counters
    op.add_column("usage_counters", sa.Column("integration_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_usage_counters_integration_id"), "usage_counters", ["integration_id"], unique=False)
    op.create_foreign_key(
        "fk_usage_counters_integration_id",
        "usage_counters",
        "integrations",
        ["integration_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 4. Create integration_refresh_status enum and add refresh columns
    integration_refresh_status = sa.Enum("refreshing", "available", "error", name="integration_refresh_status")
    integration_refresh_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "integrations",
        sa.Column(
            "refresh_status",
            sa.Enum("refreshing", "available", "error", name="integration_refresh_status"),
            nullable=True,
        ),
    )
    op.add_column("integrations", sa.Column("last_refreshed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("integrations", sa.Column("refresh_error", sa.Text(), nullable=True))

    # 5. Rename status → validation_status
    op.alter_column("integrations", "status", new_column_name="validation_status")

    # 6. Add 'unknown' to integration_status enum and set as default
    op.execute("COMMIT")
    op.execute("ALTER TYPE integration_status ADD VALUE IF NOT EXISTS 'unknown'")
    op.execute("BEGIN")
    op.execute("ALTER TABLE integrations ALTER COLUMN validation_status SET DEFAULT 'unknown'")
    op.execute(
        "UPDATE integrations SET validation_status = 'unknown'"
        " WHERE validation_status = 'validating' AND last_validated_at IS NULL"
    )

    # 7. Strip discovered_tools from config JSONB
    op.execute(
        sa.text(
            "UPDATE integrations"
            " SET configuration = configuration - 'discovered_tools'"
            " WHERE configuration ? 'discovered_tools'"
        )
    )

    # 8. If tool_providers has integration_id (standalone repo with prior migration),
    #    backfill integration_id on tools/tool_executions before dropping.
    if _table_exists("tool_providers") and _column_exists("tool_providers", "integration_id"):
        op.execute(
            sa.text(
                "UPDATE tools t"
                "   SET integration_id = tp.integration_id"
                "  FROM tool_providers tp"
                " WHERE t.provider_id = tp.id"
                "   AND tp.integration_id IS NOT NULL"
            )
        )
        op.execute(
            sa.text(
                "UPDATE tool_executions te"
                "   SET integration_id = t.integration_id"
                "  FROM tools t"
                " WHERE te.tool_id = t.id"
                "   AND t.integration_id IS NOT NULL"
            )
        )

    # 9. Drop provider_id columns if they exist
    if _column_exists("tools", "provider_id"):
        op.drop_index("ix_tools_provider_id_created_at_id", table_name="tools")

    for table, fk_name, ix_name in [
        ("tools", "tools_provider_id_fkey", "ix_tools_provider_id"),
        ("tool_executions", "tool_executions_provider_id_fkey", "ix_tool_executions_provider_id"),
        ("usage_counters", "usage_counters_provider_id_fkey", "ix_usage_counters_provider_id"),
    ]:
        if _column_exists(table, "provider_id"):
            op.drop_constraint(fk_name, table, type_="foreignkey")
            op.drop_index(op.f(ix_name), table_name=table)
            op.drop_column(table, "provider_id")

    # Drop tool_providers table and enum if they exist (CASCADE drops indexes)
    op.execute(sa.text("DROP TABLE IF EXISTS tool_providers CASCADE"))
    sa.Enum(name="tool_provider_status").drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    """Reverse all integration schema changes."""
    # Revert validation_status default
    op.execute("ALTER TABLE integrations ALTER COLUMN validation_status SET DEFAULT 'validating'")
    op.execute("UPDATE integrations SET validation_status = 'validating' WHERE validation_status = 'unknown'")

    # Drop refresh columns and enum
    op.drop_column("integrations", "refresh_error")
    op.drop_column("integrations", "last_refreshed_at")
    op.drop_column("integrations", "refresh_status")
    sa.Enum(name="integration_refresh_status").drop(op.get_bind(), checkfirst=True)

    # Rename validation_status → status
    op.alter_column("integrations", "validation_status", new_column_name="status")

    # Drop integration_id from usage_counters
    op.drop_constraint("fk_usage_counters_integration_id", "usage_counters", type_="foreignkey")
    op.drop_index(op.f("ix_usage_counters_integration_id"), table_name="usage_counters")
    op.drop_column("usage_counters", "integration_id")

    # Drop integration_id from tool_executions
    op.drop_constraint("fk_tool_executions_integration_id", "tool_executions", type_="foreignkey")
    op.drop_index("ix_tool_executions_integration_id", table_name="tool_executions")
    op.drop_column("tool_executions", "integration_id")

    # Drop integration_id from tools
    op.drop_index("ix_tools_integration_id_created_at_id", table_name="tools")
    op.drop_index(op.f("ix_tools_integration_id"), table_name="tools")
    op.drop_constraint("fk_tools_integration_id", "tools", type_="foreignkey")
    op.drop_column("tools", "integration_id")

    # Restore tool_providers table and provider_id columns so earlier migrations
    # can downgrade cleanly. The first-migration expects these to exist.
    sa.Enum("available", "error", "validating", name="tool_provider_status").create(op.get_bind(), checkfirst=True)
    if not _table_exists("tool_providers"):
        op.create_table(
            "tool_providers",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column(
                "labels",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.Column("created_by", sa.Uuid(), nullable=False),
            sa.Column("updated_by", sa.Uuid(), nullable=True),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("deleted_by", sa.Uuid(), nullable=True),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("description", sa.String(length=2000), nullable=True),
            sa.Column("configuration", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column(
                "status",
                postgresql.ENUM("available", "error", "validating", name="tool_provider_status", create_type=False),
                nullable=False,
            ),
            sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("validation_error", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
            sa.ForeignKeyConstraint(["deleted_by"], ["users.id"]),
            sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(op.f("ix_tool_providers_created_at"), "tool_providers", ["created_at"])
        op.create_index("ix_tool_providers_created_at_id", "tool_providers", ["created_at", "id"])
        op.create_index(op.f("ix_tool_providers_created_by"), "tool_providers", ["created_by"])
        op.create_index(op.f("ix_tool_providers_deleted_at"), "tool_providers", ["deleted_at"])
        op.create_index(op.f("ix_tool_providers_deleted_by"), "tool_providers", ["deleted_by"])
        op.create_index(op.f("ix_tool_providers_enabled"), "tool_providers", ["enabled"])
        op.create_index(op.f("ix_tool_providers_id"), "tool_providers", ["id"])
        op.create_index(op.f("ix_tool_providers_last_validated_at"), "tool_providers", ["last_validated_at"])
        op.create_index(op.f("ix_tool_providers_name"), "tool_providers", ["name"])
        op.create_index(
            "ix_tool_providers_name_unique",
            "tool_providers",
            ["name"],
            unique=True,
            postgresql_where=sa.text("deleted_at IS NULL"),
        )
        op.create_index(op.f("ix_tool_providers_status"), "tool_providers", ["status"])
        op.create_index(op.f("ix_tool_providers_updated_at"), "tool_providers", ["updated_at"])
        op.create_index(op.f("ix_tool_providers_updated_by"), "tool_providers", ["updated_by"])

    if not _column_exists("tools", "provider_id"):
        op.add_column("tools", sa.Column("provider_id", sa.Uuid(), nullable=True))
        op.create_foreign_key(
            "tools_provider_id_fkey", "tools", "tool_providers", ["provider_id"], ["id"], ondelete="CASCADE"
        )
        op.create_index(op.f("ix_tools_provider_id"), "tools", ["provider_id"])
        op.create_index("ix_tools_provider_id_created_at_id", "tools", ["provider_id", "created_at", "id"])
    if not _column_exists("tool_executions", "provider_id"):
        op.add_column("tool_executions", sa.Column("provider_id", sa.Uuid(), nullable=True))
        op.create_foreign_key(
            "tool_executions_provider_id_fkey",
            "tool_executions",
            "tool_providers",
            ["provider_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.create_index(op.f("ix_tool_executions_provider_id"), "tool_executions", ["provider_id"])
    if not _column_exists("usage_counters", "provider_id"):
        op.add_column("usage_counters", sa.Column("provider_id", sa.Uuid(), nullable=True))
        op.create_foreign_key(
            "usage_counters_provider_id_fkey",
            "usage_counters",
            "tool_providers",
            ["provider_id"],
            ["id"],
            ondelete="CASCADE",
        )
        op.create_index(op.f("ix_usage_counters_provider_id"), "usage_counters", ["provider_id"])
