"""merge migration heads

Revision ID: 7e33e85dbc47
Revises: 805e882ad9b6, c4a1e8f2b301
Create Date: 2026-07-02 08:11:53.628821

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "7e33e85dbc47"
down_revision: str | Sequence[str] | None = ("805e882ad9b6", "c4a1e8f2b301")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
