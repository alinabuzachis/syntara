"""add groups and user_groups tables

Revision ID: d5c3f9a2b1e6
Revises: b3a1f7c9d2e4
Create Date: 2026-03-30 17:50:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5c3f9a2b1e6"
down_revision: str | Sequence[str] | None = "b3a1f7c9d2e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "groups",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("labels", sa.dialects.postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(2000), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_groups_id", "groups", ["id"])
    op.create_index("ix_groups_name", "groups", ["name"])
    op.create_index("ix_groups_created_at", "groups", ["created_at"])
    op.create_index("ix_groups_updated_at", "groups", ["updated_at"])
    op.create_index("ix_groups_deleted_at", "groups", ["deleted_at"])
    op.create_index("ix_groups_deleted_by", "groups", ["deleted_by"])
    op.create_index(
        "ix_groups_name_unique",
        "groups",
        ["name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "user_groups",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("group_id", sa.Uuid(), sa.ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("user_groups")
    op.drop_table("groups")
