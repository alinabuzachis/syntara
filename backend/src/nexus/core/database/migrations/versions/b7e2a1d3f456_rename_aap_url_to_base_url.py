"""rename aap_url to base_url in AAP configuration

Revision ID: b7e2a1d3f456
Revises: c8e3a5b26d44
Create Date: 2026-07-30 19:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7e2a1d3f456"
down_revision: str | Sequence[str] | None = "c8e3a5b26d44"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rename aap_url JSONB key to base_url for AAP integrations."""
    op.execute("""
        UPDATE integrations
        SET configuration = (configuration - 'aap_url')
            || jsonb_build_object('base_url', configuration->'aap_url')
        WHERE integration_type = 'ansible_automation_platform'
          AND configuration ? 'aap_url'
    """)


def downgrade() -> None:
    """Revert base_url back to aap_url for AAP integrations."""
    op.execute("""
        UPDATE integrations
        SET configuration = (configuration - 'base_url')
            || jsonb_build_object('aap_url', configuration->'base_url')
        WHERE integration_type = 'ansible_automation_platform'
          AND configuration ? 'base_url'
    """)
