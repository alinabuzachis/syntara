"""merge approval changes with config-to-parameters rename

Revision ID: dce0fe2acbec
Revises: 433e243396da, fae1b3b3909e
Create Date: 2026-06-11 15:51:08.348040

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "dce0fe2acbec"
down_revision: str | Sequence[str] | None = ("433e243396da", "fae1b3b3909e")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
