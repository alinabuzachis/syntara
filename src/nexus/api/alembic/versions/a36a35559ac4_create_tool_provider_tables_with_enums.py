"""create tool provider tables with enums

Revision ID: a36a35559ac4
Revises: 644f97ed1d9a
Create Date: 2025-10-22 15:49:58.296982

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a36a35559ac4"
down_revision: str | Sequence[str] | None = "644f97ed1d9a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create tool provider related tables with enums."""
    # Create ProviderStatus enum type if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tool_provider_status') THEN
                CREATE TYPE tool_provider_status AS ENUM ('available', 'error', 'validating', 'disabled');
            END IF;
        END$$;
    """)

    # Create ToolStatus enum type if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tool_status') THEN
                CREATE TYPE tool_status AS ENUM ('available', 'error', 'missing', 'disabled');
            END IF;
        END$$;
    """)

    # Create ToolParameterType enum type if it doesn't exist
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tool_parameter_type') THEN
                CREATE TYPE tool_parameter_type AS ENUM ('string', 'number', 'boolean', 'object', 'array');
            END IF;
        END$$;
    """)

    # Reference the enums for use in table creation
    tool_provider_status_enum = postgresql.ENUM(
        "available", "error", "validating", "disabled", name="tool_provider_status", create_type=False
    )
    tool_status_enum = postgresql.ENUM(
        "available", "error", "missing", "disabled", name="tool_status", create_type=False
    )
    tool_parameter_type_enum = postgresql.ENUM(
        "string", "number", "boolean", "object", "array", name="tool_parameter_type", create_type=False
    )

    # Create tool_providers table
    op.create_table(
        "tool_providers",
        # Primary key
        sa.Column("id", sa.Uuid(), nullable=False),
        # Resource base fields
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), nullable=True),
        sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        # ToolProvider specific fields
        sa.Column("configuration", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", tool_provider_status_enum, nullable=False, default="validating"),
        sa.Column("last_validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validation_error", sa.Text(), nullable=True),
        # Constraints
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["deleted_by"], ["users.id"]),
    )

    # Create indexes for tool_providers
    op.create_index(
        "ix_tool_providers_name_unique",
        "tool_providers",
        ["name"],
        unique=True,
        postgresql_where="(deleted_at IS NULL)",
    )
    op.create_index("ix_tool_providers_status", "tool_providers", ["status"])
    op.create_index("ix_tool_providers_created_at", "tool_providers", ["created_at"])
    op.create_index("ix_tool_providers_last_validated_at", "tool_providers", ["last_validated_at"])
    op.create_index("ix_tool_providers_created_at_id", "tool_providers", ["created_at", "id"])
    op.create_index("ix_tool_providers_created_by", "tool_providers", ["created_by"])
    op.create_index("ix_tool_providers_updated_by", "tool_providers", ["updated_by"])
    op.create_index("ix_tool_providers_deleted_by", "tool_providers", ["deleted_by"])

    # Create tools table
    op.create_table(
        "tools",
        # Primary key
        sa.Column("id", sa.Uuid(), nullable=False),
        # Resource base fields
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), nullable=True),
        sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        # Tool specific fields
        sa.Column("provider_id", sa.Uuid(), nullable=False),
        sa.Column("namespaced_name", sa.String(length=200), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, default=True),
        sa.Column("status", tool_status_enum, nullable=False, default="available"),
        sa.Column("execution_count", sa.Integer(), nullable=False, default=0),
        sa.Column("last_executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_refreshed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("refresh_error", sa.Text(), nullable=True),
        # Constraints
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["provider_id"], ["tool_providers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["deleted_by"], ["users.id"]),
        sa.CheckConstraint("execution_count >= 0", name="ck_tools_execution_count_non_negative"),
    )

    # Create indexes for tools
    op.create_index(
        "ix_tools_namespaced_name_unique",
        "tools",
        ["namespaced_name"],
        unique=True,
        postgresql_where="(deleted_at IS NULL)",
    )
    op.create_index("ix_tools_provider_id", "tools", ["provider_id"])
    op.create_index("ix_tools_enabled", "tools", ["enabled"])
    op.create_index("ix_tools_status", "tools", ["status"])
    op.create_index("ix_tools_created_at", "tools", ["created_at"])
    op.create_index("ix_tools_last_executed_at", "tools", ["last_executed_at"])
    op.create_index("ix_tools_last_refreshed_at", "tools", ["last_refreshed_at"])
    op.create_index("ix_tools_created_at_id", "tools", ["created_at", "id"])
    op.create_index("ix_tools_provider_id_created_at_id", "tools", ["provider_id", "created_at", "id"])
    op.create_index("ix_tools_created_by", "tools", ["created_by"])
    op.create_index("ix_tools_updated_by", "tools", ["updated_by"])
    op.create_index("ix_tools_deleted_by", "tools", ["deleted_by"])

    # Create tool_parameters table
    op.create_table(
        "tool_parameters",
        # Primary key
        sa.Column("id", sa.Uuid(), nullable=False),
        # BaseResource fields
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("labels", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        # ToolParameter specific fields
        sa.Column("tool_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("type", tool_parameter_type_enum, nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False),
        sa.Column("default_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("example_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        # Constraints
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tool_id"], ["tools.id"], ondelete="CASCADE"),
    )

    # Create indexes for tool_parameters
    op.create_index("ix_tool_parameters_tool_id", "tool_parameters", ["tool_id"])
    op.create_index("ix_tool_parameters_created_at", "tool_parameters", ["created_at"])


def downgrade() -> None:
    """Drop tool provider related tables and enums."""
    # Drop indexes first
    op.drop_index("ix_tool_parameters_created_at", table_name="tool_parameters")
    op.drop_index("ix_tool_parameters_tool_id", table_name="tool_parameters")

    op.drop_index("ix_tools_deleted_by", table_name="tools")
    op.drop_index("ix_tools_updated_by", table_name="tools")
    op.drop_index("ix_tools_created_by", table_name="tools")
    op.drop_index("ix_tools_provider_id_created_at_id", table_name="tools")
    op.drop_index("ix_tools_created_at_id", table_name="tools")
    op.drop_index("ix_tools_last_refreshed_at", table_name="tools")
    op.drop_index("ix_tools_last_executed_at", table_name="tools")
    op.drop_index("ix_tools_created_at", table_name="tools")
    op.drop_index("ix_tools_status", table_name="tools")
    op.drop_index("ix_tools_enabled", table_name="tools")
    op.drop_index("ix_tools_provider_id", table_name="tools")
    op.drop_index("ix_tools_namespaced_name_unique", table_name="tools")

    op.drop_index("ix_tool_providers_deleted_by", table_name="tool_providers")
    op.drop_index("ix_tool_providers_updated_by", table_name="tool_providers")
    op.drop_index("ix_tool_providers_created_by", table_name="tool_providers")
    op.drop_index("ix_tool_providers_created_at_id", table_name="tool_providers")
    op.drop_index("ix_tool_providers_last_validated_at", table_name="tool_providers")
    op.drop_index("ix_tool_providers_created_at", table_name="tool_providers")
    op.drop_index("ix_tool_providers_status", table_name="tool_providers")
    op.drop_index("ix_tool_providers_name_unique", table_name="tool_providers")

    # Drop tables
    op.drop_table("tool_parameters")
    op.drop_table("tools")
    op.drop_table("tool_providers")

    # Drop the enum types
    tool_status_enum = postgresql.ENUM("available", "error", "missing", "disabled", name="tool_status")
    tool_status_enum.drop(op.get_bind(), checkfirst=True)

    tool_parameter_type_enum = postgresql.ENUM(
        "string", "number", "boolean", "object", "array", name="tool_parameter_type"
    )
    tool_parameter_type_enum.drop(op.get_bind(), checkfirst=True)

    tool_provider_status_enum = postgresql.ENUM(
        "available", "error", "validating", "disabled", name="tool_provider_status"
    )
    tool_provider_status_enum.drop(op.get_bind(), checkfirst=True)
