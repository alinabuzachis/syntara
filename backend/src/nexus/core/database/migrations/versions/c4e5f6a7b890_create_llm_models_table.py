"""create llm_models table

Stores LLM models discovered from provider integrations.
Models use hard deletion (no soft-delete columns).

Revision ID: c4e5f6a7b890
Revises: b3f4a7c9d012
Create Date: 2026-06-25 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c4e5f6a7b890"
down_revision: str | Sequence[str] | None = "b3f4a7c9d012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create llm_models table."""
    op.create_table(
        "llm_models",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("integration_id", sa.Uuid(), nullable=False),
        sa.Column("model_id", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("last_refreshed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column(
            "labels", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["integration_id"],
            ["integrations.id"],
            name="fk_llm_models_integration_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("integration_id", "model_id", name="uq_llm_models_integration_model"),
    )
    op.create_index("ix_llm_models_id", "llm_models", ["id"])
    op.create_index("ix_llm_models_integration_id", "llm_models", ["integration_id"])
    op.create_index("ix_llm_models_enabled", "llm_models", ["enabled"])
    op.create_index(
        "ix_llm_models_integration_id_created_at_id",
        "llm_models",
        ["integration_id", "created_at", "id"],
    )
    op.create_index("ix_llm_models_created_at", "llm_models", ["created_at"])
    op.create_index("ix_llm_models_updated_at", "llm_models", ["updated_at"])


def downgrade() -> None:
    """Drop llm_models table."""
    op.drop_index("ix_llm_models_updated_at", table_name="llm_models")
    op.drop_index("ix_llm_models_created_at", table_name="llm_models")
    op.drop_index("ix_llm_models_integration_id_created_at_id", table_name="llm_models")
    op.drop_index("ix_llm_models_enabled", table_name="llm_models")
    op.drop_index("ix_llm_models_integration_id", table_name="llm_models")
    op.drop_index("ix_llm_models_id", table_name="llm_models")
    op.drop_table("llm_models")
