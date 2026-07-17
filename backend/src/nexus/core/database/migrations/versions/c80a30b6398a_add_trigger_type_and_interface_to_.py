"""add trigger_type and interface to executions

Revision ID: c80a30b6398a
Revises: 11f1afc979aa
Create Date: 2026-07-09 11:52:43.148358

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c80a30b6398a"
down_revision: str | Sequence[str] | None = "11f1afc979aa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add trigger_type and interface columns to executions table."""
    op.add_column("executions", sa.Column("trigger_type", sa.String(50), nullable=True))
    op.add_column("executions", sa.Column("interface", sa.String(10), nullable=True))
    op.create_index("ix_executions_trigger_type", "executions", ["trigger_type"])
    op.create_index("ix_executions_interface", "executions", ["interface"])


def downgrade() -> None:
    """Remove trigger_type and interface columns from executions table."""
    op.drop_index("ix_executions_interface", table_name="executions")
    op.drop_index("ix_executions_trigger_type", table_name="executions")
    op.drop_column("executions", "interface")
    op.drop_column("executions", "trigger_type")
