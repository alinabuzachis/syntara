"""merge main with anstrat-1844 feature branch

Revision ID: 6299a2bfd675
Revises: 8799116f69b3, 219dcd505ee5
Create Date: 2026-04-22 14:49:33.923907

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "6299a2bfd675"
down_revision: str | Sequence[str] | None = ("8799116f69b3", "219dcd505ee5")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
