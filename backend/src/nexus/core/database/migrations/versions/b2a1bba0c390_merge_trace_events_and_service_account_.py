"""merge trace_events and service_account_hard_delete heads

Revision ID: b2a1bba0c390
Revises: 2797856eb50e, 59f3fc6d24fc
Create Date: 2026-07-23 15:43:21.313566

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "b2a1bba0c390"
down_revision: str | Sequence[str] | None = ("2797856eb50e", "59f3fc6d24fc")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
