"""Remove groups key from OIDCClaimMapping JSONB.

The groups field on OIDCClaimMapping is dead code, superseded by
group_jmespath_expression. This migration strips the key from stored
configuration so that extra="forbid" validation does not reject
existing rows.

Revision ID: 24da7d53e012
Revises: ba66d6e66edd
Create Date: 2026-06-03

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "24da7d53e012"
down_revision: str = "ba66d6e66edd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Strip the dead 'groups' key from claim_mapping JSONB."""
    # CUSTOM: strip the "groups" key from claim_mapping inside the configuration JSONB
    op.execute(
        sa.text("""
            UPDATE identity_providers
            SET configuration = configuration #- '{claim_mapping,groups}'
            WHERE configuration #> '{claim_mapping,groups}' IS NOT NULL
        """)
    )
    # END CUSTOM


def downgrade() -> None:
    """No-op: the groups key was dead code; no value to restore."""
