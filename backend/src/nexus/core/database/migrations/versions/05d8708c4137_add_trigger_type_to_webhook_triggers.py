"""add trigger_type to webhook_triggers

Revision ID: 05d8708c4137
Revises: c3d4e5f6a7b8
Create Date: 2026-05-12 17:46:31.008735

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "05d8708c4137"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add trigger_type column and replace unique index."""
    op.add_column(
        "webhook_triggers",
        column=sa.Column(
            "trigger_type",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=False,
            server_default="webhook_trigger",
        ),
    )
    # Drop the server_default now that existing rows are backfilled;
    # the Python model uses a Python-side default, not a DB default.
    op.alter_column("webhook_triggers", "trigger_type", server_default=None)

    op.create_index(
        op.f("ix_webhook_triggers_trigger_type"),
        "webhook_triggers",
        ["trigger_type"],
        unique=False,
    )

    op.create_check_constraint(
        "ck_webhook_triggers_trigger_type_valid",
        "webhook_triggers",
        "trigger_type IN ('webhook_trigger', 'eda_trigger')",
    )

    op.drop_index("ix_webhook_triggers_webhook_path_unique", table_name="webhook_triggers")
    op.create_index(
        "ix_webhook_triggers_type_path_unique",
        "webhook_triggers",
        ["trigger_type", "webhook_path"],
        unique=True,
    )


def downgrade() -> None:
    """Remove trigger_type column and restore original unique index."""
    op.drop_constraint("ck_webhook_triggers_trigger_type_valid", "webhook_triggers")
    op.drop_index("ix_webhook_triggers_type_path_unique", table_name="webhook_triggers")

    # CUSTOM: delete non-default trigger rows before restoring the single-column
    # unique index, which cannot tolerate duplicate webhook_path values across types.
    op.execute(sa.text("DELETE FROM webhook_triggers WHERE trigger_type != 'webhook_trigger'"))
    # END CUSTOM

    op.create_index(
        "ix_webhook_triggers_webhook_path_unique",
        "webhook_triggers",
        ["webhook_path"],
        unique=True,
    )

    op.drop_index(op.f("ix_webhook_triggers_trigger_type"), table_name="webhook_triggers")
    op.drop_column("webhook_triggers", "trigger_type")
