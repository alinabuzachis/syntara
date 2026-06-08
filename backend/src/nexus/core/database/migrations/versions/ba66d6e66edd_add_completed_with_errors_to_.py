"""add completed_with_errors to workflowexecutionstatus enum

Revision ID: ba66d6e66edd
Revises: bd82aa297b0e
Create Date: 2026-06-02 16:58:11.175278

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "ba66d6e66edd"
down_revision: str | Sequence[str] | None = "bd82aa297b0e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add 'completed_with_errors' to the workflowexecutionstatus PostgreSQL enum.

    Workflows that ran to completion but had node failures handled via
    continue_on_failure report this status instead of 'completed'.
    """
    # CUSTOM: ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
    # so we execute it outside the default Alembic transaction.
    op.execute("ALTER TYPE workflowexecutionstatus ADD VALUE IF NOT EXISTS 'completed_with_errors' AFTER 'completed'")
    # END CUSTOM


def downgrade() -> None:
    """Remove 'completed_with_errors' from the workflowexecutionstatus enum.

    PostgreSQL does not support removing individual enum values directly.
    Leaving as a no-op; the value is harmless if unused after downgrade.
    """
