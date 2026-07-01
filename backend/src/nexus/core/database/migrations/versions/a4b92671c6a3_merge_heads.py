"""merge heads

Revision ID: a4b92671c6a3
Revises: c311711bb5c8, d4e5f6a7b8c9
Create Date: 2026-06-30 09:33:23.579786

"""

# revision identifiers, used by Alembic.
revision: str = "a4b92671c6a3"
down_revision: str | tuple[str, ...] | None = ("c311711bb5c8", "d4e5f6a7b8c9")
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
