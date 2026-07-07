"""rename aap_gateway to ansible_automation_platform

Revision ID: 9cf75786579f
Revises: 7e33e85dbc47
Create Date: 2026-07-06 18:55:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9cf75786579f"
down_revision: str | Sequence[str] | None = "7e33e85dbc47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rename aap_gateway enum value and JSONB key to ansible_automation_platform."""
    op.execute("ALTER TYPE integration_type RENAME VALUE 'aap_gateway' TO 'ansible_automation_platform'")
    op.execute("""
        UPDATE integrations
        SET configuration = (configuration - 'gateway_url')
            || jsonb_build_object('aap_url', configuration->'gateway_url')
        WHERE integration_type = 'ansible_automation_platform'
          AND configuration ? 'gateway_url'
    """)


def downgrade() -> None:
    """Revert ansible_automation_platform back to aap_gateway."""
    op.execute("ALTER TYPE integration_type RENAME VALUE 'ansible_automation_platform' TO 'aap_gateway'")
    op.execute("""
        UPDATE integrations
        SET configuration = (configuration - 'aap_url')
            || jsonb_build_object('gateway_url', configuration->'aap_url')
        WHERE integration_type = 'aap_gateway'
          AND configuration ? 'aap_url'
    """)
