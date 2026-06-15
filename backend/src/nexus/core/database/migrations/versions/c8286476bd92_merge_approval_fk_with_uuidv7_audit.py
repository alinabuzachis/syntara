"""merge approval FK with UUIDv7 audit

Revision ID: c8286476bd92
Revises: 5129f1ac31a7, c3d4e5f6a7b8
Create Date: 2026-06-04 17:31:42.713386

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "c8286476bd92"
down_revision: str | Sequence[str] | None = ("5129f1ac31a7", "c3d4e5f6a7b8")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
