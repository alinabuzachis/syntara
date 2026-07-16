"""merge devel retried_from with version status refactor

Revision ID: 7b15edee0361
Revises: 1f7811e54a52, 6b4eff55e869
Create Date: 2026-07-13 16:48:27.623629

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "7b15edee0361"
down_revision: str | Sequence[str] | None = ("1f7811e54a52", "6b4eff55e869")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
