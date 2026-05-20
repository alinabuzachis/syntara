"""replace auto_create_groups with allow_all_authenticated

Revision ID: bd3c95198d69
Revises: f6ce5b197b55
Create Date: 2026-05-15 18:03:12.284349

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bd3c95198d69"
down_revision: str | Sequence[str] | None = "f6ce5b197b55"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # CUSTOM: Replace auto_create_groups with allow_all_authenticated in JSONB configs
    op.execute(
        sa.text("""
            UPDATE identity_providers
            SET configuration = (configuration - 'auto_create_groups')
                                || '{"allow_all_authenticated": false}'::jsonb
            WHERE configuration ? 'auto_create_groups'
              AND deleted_at IS NULL
        """)
    )
    # END CUSTOM

    # CUSTOM: Remove the max_auto_create_groups runtime setting
    op.execute(
        sa.text("""
            DELETE FROM runtime_settings
            WHERE key = 'authentication.max_auto_create_groups'
        """)
    )
    # END CUSTOM


def downgrade() -> None:
    """Downgrade schema."""
    # CUSTOM: Revert allow_all_authenticated to auto_create_groups
    op.execute(
        sa.text("""
            UPDATE identity_providers
            SET configuration = (configuration - 'allow_all_authenticated')
                                || '{"auto_create_groups": false}'::jsonb
            WHERE configuration ? 'allow_all_authenticated'
              AND deleted_at IS NULL
        """)
    )
    # END CUSTOM
