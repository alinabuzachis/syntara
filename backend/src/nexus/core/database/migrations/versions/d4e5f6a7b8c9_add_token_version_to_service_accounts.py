"""add token_version to service_accounts

Revision ID: d4e5f6a7b8c9
Revises: 66a534c1807b
Create Date: 2026-06-26

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "66a534c1807b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add token_version column to service_accounts."""
    op.add_column(
        "service_accounts",
        sa.Column("token_version", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    """Remove token_version column from service_accounts."""
    op.drop_column("service_accounts", "token_version")
