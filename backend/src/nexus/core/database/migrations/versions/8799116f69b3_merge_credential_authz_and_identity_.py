"""merge credential authz and identity provider migration heads

Revision ID: 8799116f69b3
Revises: 7e0a54edaa3f
Create Date: 2026-04-21 15:22:47.932933

NOTE: Originally merged 4ab8d1a4bf66 and 7e0a54edaa3f.  Migration
4ab8d1a4bf66 (credential authz policies) was removed; its functionality
is now handled by 219dcd505ee5 which is merged via 6299a2bfd675.
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "8799116f69b3"
down_revision: str | Sequence[str] | None = "7e0a54edaa3f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
