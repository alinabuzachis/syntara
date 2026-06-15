"""merge approval changes with file storage backend

Merges:
- cedd8e9158c6: merge approval unique constraint with webhook trigger migrations
- af63ce50dceb: add file storage backend fields to file_metadata

Revision ID: fae1b3b3909e
Revises: cedd8e9158c6, af63ce50dceb
Create Date: 2026-06-09 14:18:06.442951

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "fae1b3b3909e"
down_revision: str | Sequence[str] | None = ("cedd8e9158c6", "af63ce50dceb")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
