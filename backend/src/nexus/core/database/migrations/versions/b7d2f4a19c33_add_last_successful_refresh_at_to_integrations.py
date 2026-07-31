"""add last_successful_refresh_at to integrations

Revision ID: b7d2f4a19c33
Revises: 07040ea5b2d8
Create Date: 2026-07-30 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7d2f4a19c33"
down_revision: str | Sequence[str] | None = "07040ea5b2d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "integrations",
        sa.Column("last_successful_refresh_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill: existing rows' last_refreshed_at was the last *successful* refresh under the
    # old single-timestamp model, so seed the new column from it. Without this, the UI (which
    # displays last_successful_refresh_at) would read "Never" for already-synced integrations.
    op.execute(
        sa.text(
            "UPDATE integrations "
            "SET last_successful_refresh_at = last_refreshed_at "
            "WHERE last_successful_refresh_at IS NULL AND last_refreshed_at IS NOT NULL"
        )
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("integrations", "last_successful_refresh_at")
