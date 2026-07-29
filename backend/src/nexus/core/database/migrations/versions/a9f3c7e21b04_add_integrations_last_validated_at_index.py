"""add index on integrations.last_validated_at for the health-check query

The scheduled health-check selects integrations due for validation ordered by
last_validated_at; this index lets that selection use an index scan instead of a
full-table sort. Declared on the model (index=True) so autogenerate stays in sync.

Revision ID: a9f3c7e21b04
Revises: a6dce2493e5c
Create Date: 2026-07-28 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9f3c7e21b04"
down_revision: str | Sequence[str] | None = "a6dce2493e5c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create the ix_integrations_last_validated_at index used by the health-check query."""
    op.create_index(op.f("ix_integrations_last_validated_at"), "integrations", ["last_validated_at"])


def downgrade() -> None:
    """Drop the ix_integrations_last_validated_at index."""
    op.drop_index(op.f("ix_integrations_last_validated_at"), table_name="integrations")
